/**
 * ipfsService.js
 * ──────────────
 * Uploads files to Filebase (IPFS pinning service) using their
 * S3-compatible API.
 *
 * Why S3-compatible?
 *  Filebase exposes an S3 API which means we can use the standard
 *  AWS SDK — no custom IPFS library needed. The CID is returned as
 *  a response header (x-amz-meta-cid).
 *
 * Flow:
 *  1. Stream file bytes from Azure Blob Storage
 *  2. PUT to Filebase S3 endpoint
 *  3. Extract CID from response headers
 *  4. Return CID + public IPFS gateway URL
 */

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getReadableBlobStream } = require("./azureService");

const FILEBASE_ENDPOINT  = "https://s3.filebase.com";
const FILEBASE_BUCKET    = process.env.FILEBASE_BUCKET_NAME;
const FILEBASE_ACCESS_KEY = process.env.FILEBASE_ACCESS_KEY;
const FILEBASE_SECRET_KEY = process.env.FILEBASE_SECRET_KEY;

const IPFS_GATEWAY = "https://ipfs.filebase.io/ipfs";

/**
 * getS3Client
 * ───────────
 * Returns a configured S3Client pointed at Filebase's endpoint.
 */
const getS3Client = () => {
  if (!FILEBASE_ACCESS_KEY || !FILEBASE_SECRET_KEY) {
    throw new Error(
      "Filebase credentials missing. Set FILEBASE_ACCESS_KEY, FILEBASE_SECRET_KEY, and FILEBASE_BUCKET_NAME in .env"
    );
  }
  return new S3Client({
    endpoint: FILEBASE_ENDPOINT,
    region: "us-east-1",           // Filebase requires this even though it's not AWS
    credentials: {
      accessKeyId:     FILEBASE_ACCESS_KEY,
      secretAccessKey: FILEBASE_SECRET_KEY,
    },
    forcePathStyle: true,           // Required for non-AWS S3 endpoints
  });
};

/**
 * uploadToIPFS
 * ────────────
 * Streams the blob from Azure directly to Filebase — the backend
 * never writes to disk.
 *
 * @param {string} blobName     - Azure blob name (used as IPFS key)
 * @param {string} originalName - Human-readable filename for metadata
 * @param {string} mimeType     - MIME type of the file
 * @returns {Promise<{ cid: string, ipfsUrl: string }>}
 */
const uploadToIPFS = async (blobName, originalName, mimeType = "application/octet-stream") => {
  if (!FILEBASE_BUCKET) {
    throw new Error("FILEBASE_BUCKET_NAME is not set in .env");
  }

  // ── Stream from Azure ──────────────────────────────────────────
  const stream = await getReadableBlobStream(blobName);

  // ── Upload to Filebase ─────────────────────────────────────────
  const s3 = getS3Client();

  const command = new PutObjectCommand({
    Bucket: FILEBASE_BUCKET,
    Key:    blobName,
    Body:   stream,
    ContentType: mimeType,
    Metadata: {
      "original-name": originalName,
    },
  });

  // Filebase returns the IPFS CID in the response metadata header
  const response = await s3.send(command);

  // Extract CID from response metadata
  // Filebase puts it in: response.$metadata.headers['x-amz-meta-cid']
  const cid =
    response?.$metadata?.headers?.["x-amz-meta-cid"] ||
    response?.ETag?.replace(/"/g, ""); // Fallback: ETag sometimes == CID

  if (!cid) {
    throw new Error("Filebase did not return a CID in the response. Check your Filebase bucket configuration.");
  }

  return {
    cid,
    ipfsUrl: `${IPFS_GATEWAY}/${cid}`,
  };
};

module.exports = { uploadToIPFS };
