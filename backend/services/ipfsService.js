/**
 * ipfsService.js
 * ──────────────
 * Uploads files to Filebase (IPFS pinning service) via S3-compatible API.
 *
 * CID extraction fix:
 *  AWS SDK v3 does NOT expose raw response headers via response.$metadata.headers.
 *  Instead, we use a middleware interceptor on the S3Client to capture the raw
 *  x-amz-meta-cid header that Filebase returns after a successful PutObject.
 */

const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");
const { getReadableBlobStream, getBlobProperties } = require("./azureService");

const FILEBASE_ENDPOINT   = "https://s3.filebase.com";
const FILEBASE_BUCKET     = process.env.FILEBASE_BUCKET_NAME;
const FILEBASE_ACCESS_KEY = process.env.FILEBASE_ACCESS_KEY;
const FILEBASE_SECRET_KEY = process.env.FILEBASE_SECRET_KEY;
const IPFS_GATEWAY        = "https://ipfs.filebase.io/ipfs";

/**
 * getS3Client
 * ───────────
 * Builds an S3Client with a middleware that captures the raw HTTP response
 * headers — the only reliable way to get Filebase's x-amz-meta-cid in SDK v3.
 */
const getS3ClientWithCidCapture = () => {
  if (!FILEBASE_ACCESS_KEY || !FILEBASE_SECRET_KEY) {
    throw new Error(
      "Filebase credentials missing. Set FILEBASE_ACCESS_KEY, FILEBASE_SECRET_KEY, FILEBASE_BUCKET_NAME in .env"
    );
  }

  let capturedCid = null;

  const client = new S3Client({
    endpoint: FILEBASE_ENDPOINT,
    region:   "us-east-1",
    credentials: {
      accessKeyId:     FILEBASE_ACCESS_KEY,
      secretAccessKey: FILEBASE_SECRET_KEY,
    },
    forcePathStyle: true,
  });

  // Middleware: intercept the raw HTTP response to grab x-amz-meta-cid header
  client.middlewareStack.add(
    (next) => async (args) => {
      const result = await next(args);
      // result.response is the raw http response from the SDK's HTTP handler
      const headers = result?.response?.headers || {};
      capturedCid =
        headers["x-amz-meta-cid"] ||
        headers["X-Amz-Meta-Cid"] ||
        null;
      return result;
    },
    { step: "deserialize", priority: "low", name: "captureCidMiddleware" }
  );

  return { client, getCid: () => capturedCid };
};

/**
 * Simple S3 client (no CID capture needed — for delete/head operations)
 */
const getS3Client = () =>
  new S3Client({
    endpoint:    FILEBASE_ENDPOINT,
    region:      "us-east-1",
    credentials: {
      accessKeyId:     FILEBASE_ACCESS_KEY,
      secretAccessKey: FILEBASE_SECRET_KEY,
    },
    forcePathStyle: true,
  });

/* ─────────────────────────────────────────────────────────────────────────
   uploadToIPFS
   ─────────────
   Streams file bytes from Azure Blob Storage → Filebase IPFS.
   Backend never writes to disk.

   @param {string} blobName     - Azure blob key
   @param {string} originalName - Human-readable filename (stored as metadata)
   @param {string} mimeType     - MIME type
   @param {number} sizeBytes    - File size in bytes (required for streaming upload)
   @returns {{ cid: string, ipfsUrl: string }}
──────────────────────────────────────────────────────────────────────────*/
const uploadToIPFS = async (blobName, originalName, mimeType = "application/octet-stream", sizeBytes) => {
  if (!FILEBASE_BUCKET) throw new Error("FILEBASE_BUCKET_NAME is not set in .env");

  // ── Get file size for Content-Length (required by Filebase for streaming) ──
  let contentLength = sizeBytes;
  if (!contentLength) {
    try {
      const props = await getBlobProperties(blobName);
      contentLength = props.sizeBytes;
    } catch {
      throw new Error("Could not determine file size for IPFS upload. Ensure the blob exists in Azure.");
    }
  }

  // ── Stream file from Azure ─────────────────────────────────────────────────
  const stream = await getReadableBlobStream(blobName);

  // ── Upload to Filebase with CID-capture middleware ─────────────────────────
  const { client, getCid } = getS3ClientWithCidCapture();

  const command = new PutObjectCommand({
    Bucket:        FILEBASE_BUCKET,
    Key:           blobName,
    Body:          stream,
    ContentType:   mimeType,
    ContentLength: contentLength,   // Required! Filebase rejects streaming without length
    Metadata: {
      "original-name": encodeURIComponent(originalName), // encode to avoid header char issues
    },
  });

  await client.send(command);

  // ── Extract CID ────────────────────────────────────────────────────────────
  const cid = getCid();

  if (!cid) {
    // Last-resort: use HeadObject to read the CID from stored metadata
    console.warn("[IPFS] CID not in upload response — trying HeadObject fallback");
    const headRes = await getS3Client().send(
      new HeadObjectCommand({ Bucket: FILEBASE_BUCKET, Key: blobName })
    );
    const fallbackCid = headRes?.Metadata?.["cid"] || headRes?.Metadata?.["x-amz-meta-cid"];
    if (!fallbackCid) {
      throw new Error(
        "Filebase did not return a CID. Check your Filebase bucket is IPFS-enabled."
      );
    }
    return { cid: fallbackCid, ipfsUrl: `${IPFS_GATEWAY}/${fallbackCid}` };
  }

  return { cid, ipfsUrl: `${IPFS_GATEWAY}/${cid}` };
};

/* ─────────────────────────────────────────────────────────────────────────
   deleteFromIPFS
   ──────────────
   Removes a file from Filebase (unpins from IPFS).
   Called when the owner deletes a file.

   @param {string} blobName - The key used when uploading (same as Azure blob name)
──────────────────────────────────────────────────────────────────────────*/
const deleteFromIPFS = async (blobName) => {
  if (!FILEBASE_BUCKET) return; // IPFS not configured — skip silently
  const s3 = getS3Client();
  await s3.send(new DeleteObjectCommand({ Bucket: FILEBASE_BUCKET, Key: blobName }));
};

module.exports = { uploadToIPFS, deleteFromIPFS };
