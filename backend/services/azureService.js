/**
 * azureService.js
 * ───────────────
 * Encapsulates all Azure Blob Storage operations.
 *
 * Architecture:
 *  • Frontend uploads DIRECTLY to Azure using a SAS token
 *  • Backend never touches the file bytes → no bottleneck
 *  • SAS token is scoped to a single blob, write-only, short-lived (30 min)
 */

const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} = require("@azure/storage-blob");

const ACCOUNT_NAME   = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const ACCOUNT_KEY    = process.env.AZURE_STORAGE_ACCOUNT_KEY;
const CONTAINER_NAME = process.env.AZURE_CONTAINER_NAME || "genomic-files";

/**
 * Build the BlobServiceClient (used for server-side operations like
 * confirming a blob exists or triggering IPFS backup).
 */
const getBlobServiceClient = () => {
  if (!ACCOUNT_NAME || !ACCOUNT_KEY) {
    throw new Error(
      "Azure Storage credentials missing. Set AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY in .env"
    );
  }
  const credential = new StorageSharedKeyCredential(ACCOUNT_NAME, ACCOUNT_KEY);
  return new BlobServiceClient(
    `https://${ACCOUNT_NAME}.blob.core.windows.net`,
    credential
  );
};

/**
 * generateUploadSasToken
 * ──────────────────────
 * Creates a write-only SAS token for a specific blob.
 * The frontend uses this token to upload directly to Azure.
 *
 * @param {string} blobName   - The safe stored filename
 * @param {number} expiryMins - Token validity in minutes (default: 30)
 * @returns {{ sasToken, blobUrl, containerName, blobName }}
 */
const generateUploadSasToken = (blobName, expiryMins = 30) => {
  if (!ACCOUNT_NAME || !ACCOUNT_KEY) {
    throw new Error("Azure Storage credentials not configured");
  }

  const sharedKeyCredential = new StorageSharedKeyCredential(
    ACCOUNT_NAME,
    ACCOUNT_KEY
  );

  const startsOn  = new Date();
  const expiresOn = new Date(startsOn.getTime() + expiryMins * 60 * 1000);

  // Write-only permissions — frontend can upload but not read/list
  const permissions = new BlobSASPermissions();
  permissions.write  = true;
  permissions.create = true;

  const sasQueryParams = generateBlobSASQueryParameters(
    {
      containerName: CONTAINER_NAME,
      blobName,
      permissions,
      startsOn,
      expiresOn,
    },
    sharedKeyCredential
  );

  const sasToken = sasQueryParams.toString();
  const blobUrl  = `https://${ACCOUNT_NAME}.blob.core.windows.net/${CONTAINER_NAME}/${blobName}`;

  return {
    sasToken,
    blobUrl,
    containerName: CONTAINER_NAME,
    blobName,
  };
};

/**
 * verifyBlobExists
 * ────────────────
 * Called by confirm-upload to make sure the frontend actually
 * finished uploading before we trigger IPFS backup.
 *
 * @param {string} blobName
 * @returns {Promise<boolean>}
 */
const verifyBlobExists = async (blobName) => {
  try {
    const client = getBlobServiceClient();
    const containerClient = client.getContainerClient(CONTAINER_NAME);
    const blobClient = containerClient.getBlobClient(blobName);
    return await blobClient.exists();
  } catch {
    return false;
  }
};

/**
 * getBlobProperties
 * ─────────────────
 * Returns size and content-type of a stored blob.
 * Used when confirming upload metadata server-side.
 *
 * @param {string} blobName
 */
const getBlobProperties = async (blobName) => {
  const client = getBlobServiceClient();
  const containerClient = client.getContainerClient(CONTAINER_NAME);
  const blobClient = containerClient.getBlobClient(blobName);
  const props = await blobClient.getProperties();
  return {
    sizeBytes: props.contentLength,
    mimeType:  props.contentType,
  };
};

/**
 * getReadableBlobStream
 * ─────────────────────
 * Returns a readable Node.js stream for a blob.
 * Used by ipfsService to stream the file to Filebase without
 * writing it to disk.
 *
 * @param {string} blobName
 */
const getReadableBlobStream = async (blobName) => {
  const client = getBlobServiceClient();
  const containerClient = client.getContainerClient(CONTAINER_NAME);
  const blobClient = containerClient.getBlobClient(blobName);
  const downloadResponse = await blobClient.download(0);
  return downloadResponse.readableStreamBody;
};

/**
 * ensureContainerExists
 * ─────────────────────
 * Creates the container if it doesn't already exist.
 * Should be called once on server startup.
 */
const ensureContainerExists = async () => {
  try {
    const client = getBlobServiceClient();
    const containerClient = client.getContainerClient(CONTAINER_NAME);
    const created = await containerClient.createIfNotExists({
      access: "private", // No public anonymous access
    });
    if (created.succeeded) {
      console.log(`[Azure] Container "${CONTAINER_NAME}" created`);
    }
  } catch (err) {
    console.error("[Azure] Failed to ensure container exists:", err.message);
  }
};

module.exports = {
  generateUploadSasToken,
  verifyBlobExists,
  getBlobProperties,
  getReadableBlobStream,
  ensureContainerExists,
};
