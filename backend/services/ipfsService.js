/**
 * ipfsService.js
 * ──────────────
 * Uploads files to Filebase (IPFS pinning service) via S3-compatible API.
 *
 * Optimisations over v1:
 *  1. Accepts an in-memory Buffer — callers that already have the file in
 *     memory (e.g. after AES encryption) skip the Azure re-download entirely.
 *  2. Multipart parallel upload for files > MULTIPART_THRESHOLD:
 *     splits into PART_SIZE chunks and uploads CONCURRENCY parts simultaneously.
 *     For a 500 MB file this is ~4× faster than a single sequential stream.
 *  3. CID extraction falls back to HeadObject when the middleware cannot
 *     capture the response header (Filebase behaviour varies by SDK version).
 */

const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} = require("@aws-sdk/client-s3");

const { downloadBlobToBuffer, getBlobProperties } = require("./azureService");

const FILEBASE_ENDPOINT   = "https://s3.filebase.com";
const FILEBASE_BUCKET     = process.env.FILEBASE_BUCKET_NAME;
const FILEBASE_ACCESS_KEY = process.env.FILEBASE_ACCESS_KEY;
const FILEBASE_SECRET_KEY = process.env.FILEBASE_SECRET_KEY;
const IPFS_GATEWAY        = "https://ipfs.filebase.io/ipfs";

// ── Multipart thresholds ──────────────────────────────────────────────────
const MULTIPART_THRESHOLD = 20  * 1024 * 1024;  // Use multipart for files > 20 MB
const PART_SIZE           = 8   * 1024 * 1024;  // 8 MB per part (Filebase minimum is 5 MB)
const CONCURRENCY         = 4;                   // Upload 4 parts simultaneously

// ── S3 client factory (shared config) ────────────────────────────────────
const makeClient = () => {
  if (!FILEBASE_ACCESS_KEY || !FILEBASE_SECRET_KEY) {
    throw new Error(
      "Filebase credentials missing. Set FILEBASE_ACCESS_KEY, FILEBASE_SECRET_KEY, FILEBASE_BUCKET_NAME in .env"
    );
  }
  return new S3Client({
    endpoint:       FILEBASE_ENDPOINT,
    region:         "us-east-1",
    credentials:    { accessKeyId: FILEBASE_ACCESS_KEY, secretAccessKey: FILEBASE_SECRET_KEY },
    forcePathStyle: true,
  });
};

/**
 * getS3ClientWithCidCapture
 * Attaches a middleware that captures the x-amz-meta-cid header from the
 * raw HTTP response — the only reliable way to read it in AWS SDK v3.
 */
const getS3ClientWithCidCapture = () => {
  let capturedCid = null;
  const client    = makeClient();

  client.middlewareStack.add(
    (next) => async (args) => {
      const result = await next(args);
      const headers = result?.response?.headers || {};
      capturedCid =
        headers["x-amz-meta-cid"]  ||
        headers["X-Amz-Meta-Cid"]  ||
        null;
      return result;
    },
    { step: "deserialize", priority: "low", name: "captureCidMiddleware" }
  );

  return { client, getCid: () => capturedCid };
};

// ── CID retrieval via HeadObject (reliable fallback) ─────────────────────
const getCidFromHead = async (blobName) => {
  const res = await makeClient().send(
    new HeadObjectCommand({ Bucket: FILEBASE_BUCKET, Key: blobName })
  );
  return res?.Metadata?.["cid"] ||
         res?.Metadata?.["x-amz-meta-cid"] ||
         null;
};

/* ─────────────────────────────────────────────────────────────────────────
   _uploadSmall  (≤ MULTIPART_THRESHOLD)
   Single PutObject — simple and fast for small files.
───────────────────────────────────────────────────────────────────────── */
const _uploadSmall = async (blobName, originalName, mimeType, buffer) => {
  const { client, getCid } = getS3ClientWithCidCapture();

  await client.send(new PutObjectCommand({
    Bucket:        FILEBASE_BUCKET,
    Key:           blobName,
    Body:          buffer,
    ContentType:   mimeType,
    ContentLength: buffer.length,
    Metadata: { "original-name": encodeURIComponent(originalName) },
  }));

  const cid = getCid() || await getCidFromHead(blobName);
  if (!cid) throw new Error("Filebase did not return a CID for small upload.");
  return { cid, ipfsUrl: `${IPFS_GATEWAY}/${cid}` };
};

/* ─────────────────────────────────────────────────────────────────────────
   _uploadMultipart  (> MULTIPART_THRESHOLD)
   Splits buffer into PART_SIZE chunks and uploads CONCURRENCY parts at once.
   ~4× faster than a single sequential stream for large genomic files.
───────────────────────────────────────────────────────────────────────── */
const _uploadMultipart = async (blobName, originalName, mimeType, buffer) => {
  const client   = makeClient();
  let uploadId   = null;

  try {
    // ── 1. Start multipart upload ─────────────────────────────────
    const create = await client.send(new CreateMultipartUploadCommand({
      Bucket:      FILEBASE_BUCKET,
      Key:         blobName,
      ContentType: mimeType,
      Metadata:    { "original-name": encodeURIComponent(originalName) },
    }));
    uploadId = create.UploadId;

    // ── 2. Slice buffer into parts ────────────────────────────────
    const parts = [];
    for (let offset = 0; offset < buffer.length; offset += PART_SIZE) {
      parts.push({
        partNumber: parts.length + 1,
        data:       buffer.slice(offset, Math.min(offset + PART_SIZE, buffer.length)),
      });
    }
    console.log(`[IPFS] Multipart: ${parts.length} parts × ${(PART_SIZE / 1048576).toFixed(0)} MB, ${CONCURRENCY} concurrent`);

    // ── 3. Upload parts in parallel batches ───────────────────────
    const completedParts = [];
    for (let i = 0; i < parts.length; i += CONCURRENCY) {
      const batch   = parts.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async ({ partNumber, data }) => {
          const res = await client.send(new UploadPartCommand({
            Bucket:        FILEBASE_BUCKET,
            Key:           blobName,
            UploadId:      uploadId,
            PartNumber:    partNumber,
            Body:          data,
            ContentLength: data.length,
          }));
          console.log(`[IPFS] Part ${partNumber}/${parts.length} ✓ (${(data.length / 1048576).toFixed(1)} MB)`);
          return { PartNumber: partNumber, ETag: res.ETag };
        })
      );
      completedParts.push(...results);
    }

    // ── 4. Complete multipart upload ──────────────────────────────
    completedParts.sort((a, b) => a.PartNumber - b.PartNumber);
    await client.send(new CompleteMultipartUploadCommand({
      Bucket:          FILEBASE_BUCKET,
      Key:             blobName,
      UploadId:        uploadId,
      MultipartUpload: { Parts: completedParts },
    }));

    // ── 5. Get CID via HeadObject (multipart response has no CID header) ─
    console.log("[IPFS] Waiting for Filebase to compute CID…");
    let cid = null;
    for (let attempt = 1; attempt <= 6; attempt++) {
      await new Promise(r => setTimeout(r, attempt * 1500));  // back-off: 1.5 s, 3 s, …
      cid = await getCidFromHead(blobName);
      if (cid) break;
      console.log(`[IPFS] CID not ready yet (attempt ${attempt}/6)…`);
    }

    if (!cid) throw new Error("Filebase did not return a CID after multipart upload.");
    return { cid, ipfsUrl: `${IPFS_GATEWAY}/${cid}` };

  } catch (err) {
    // Abort the incomplete multipart upload to avoid orphaned storage charges
    if (uploadId) {
      try {
        await client.send(new AbortMultipartUploadCommand({
          Bucket: FILEBASE_BUCKET, Key: blobName, UploadId: uploadId,
        }));
      } catch { /* ignore abort errors */ }
    }
    throw err;
  }
};

/* ─────────────────────────────────────────────────────────────────────────
   uploadToIPFS  (public API)
   ─────────────────────────
   @param blobName     Azure blob key (used as Filebase key)
   @param originalName Human-readable file name
   @param mimeType     MIME type
   @param sizeBytes    File size (used only when buffer is omitted)
   @param buffer       Optional: in-memory Buffer of the file.
                       When provided, Azure download is SKIPPED (faster).
                       Pass the already-encrypted buffer from Phase 1 of the
                       background job to avoid a second Azure download.
   @returns {{ cid, ipfsUrl }}
───────────────────────────────────────────────────────────────────────── */
const uploadToIPFS = async (blobName, originalName, mimeType = "application/octet-stream", sizeBytes, buffer) => {
  if (!FILEBASE_BUCKET) throw new Error("FILEBASE_BUCKET_NAME is not set in .env");

  // ── Obtain the file bytes ──────────────────────────────────────────────
  let fileBuffer = buffer;
  if (!fileBuffer) {
    // Caller did not provide buffer — download from Azure
    console.log(`[IPFS] No buffer provided — downloading from Azure: ${blobName}`);
    fileBuffer = await downloadBlobToBuffer(blobName);
  } else {
    console.log(`[IPFS] Using in-memory buffer (${(fileBuffer.length / 1048576).toFixed(1)} MB) — Azure download skipped ✓`);
  }

  // ── Choose upload strategy ─────────────────────────────────────────────
  if (fileBuffer.length > MULTIPART_THRESHOLD) {
    console.log(`[IPFS] File > ${MULTIPART_THRESHOLD / 1048576} MB — using multipart parallel upload`);
    return _uploadMultipart(blobName, originalName, mimeType, fileBuffer);
  }

  console.log(`[IPFS] File ≤ ${MULTIPART_THRESHOLD / 1048576} MB — using single PutObject`);
  return _uploadSmall(blobName, originalName, mimeType, fileBuffer);
};

/* ─────────────────────────────────────────────────────────────────────────
   deleteFromIPFS
   Unpins a file from Filebase / IPFS.
───────────────────────────────────────────────────────────────────────── */
const deleteFromIPFS = async (blobName) => {
  if (!FILEBASE_BUCKET) return;
  await makeClient().send(new DeleteObjectCommand({ Bucket: FILEBASE_BUCKET, Key: blobName }));
};

module.exports = { uploadToIPFS, deleteFromIPFS };
