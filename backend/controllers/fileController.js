/**
 * fileController.js
 * ─────────────────
 *
 * Handles two endpoints:
 *
 *  GET  /api/files/get-upload-url
 *       → Validates file metadata, generates safe blob name,
 *         returns SAS token so frontend can upload directly to Azure.
 *
 *  POST /api/files/confirm-upload
 *       → Frontend calls this after Azure upload completes.
 *         Backend verifies the blob exists, saves metadata to MongoDB,
 *         then triggers async IPFS backup (non-blocking).
 */

const { v4: uuidv4 } = require("uuid");
const path    = require("path");
const multer  = require("multer");
const GenomicFile = require("../models/GenomicFile");
const { generateUploadSasToken, verifyBlobExists, getBlobProperties,
        getBlobServiceClient, uploadEncryptedBuffer } = require("../services/azureService");
const { uploadToIPFS, deleteFromIPFS } = require("../services/ipfsService");
const { generateKey, generateIV, encryptBuffer } = require("../services/encryptionService");
const { storeEncryptionKey, deleteEncryptionKey } = require("../services/keyVaultService");

// ── Allowed genomic file extensions ─────────────────────────────
const ALLOWED_EXTENSIONS = new Set([".fastq", ".bam", ".vcf"]);

// ── Multer: in-memory storage (no disk writes) ───────────────────
// Files are held in memory as Buffer, encrypted, then pushed to Azure.
// MAX_FILE_SIZE_MB default 500 MB
const MAX_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB) || 500;
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    ALLOWED_EXTENSIONS.has(ext)
      ? cb(null, true)
      : cb(new Error(`File type "${ext}" not allowed. Accepted: .fastq, .bam, .vcf`));
  },
});

/**
 * generateSafeBlobName
 * ────────────────────
 * Creates a safe, unique blob name for Azure storage.
 * Format: <timestamp>_<uuid>.<ext>
 * This prevents path traversal, naming collisions, and leaking
 * the original filename in storage.
 *
 * @param {string} originalName - Original filename from client
 * @returns {string} Safe blob name
 */
const generateSafeBlobName = (originalName) => {
  const ext       = path.extname(originalName).toLowerCase();
  const timestamp = Date.now();
  const unique    = uuidv4().replace(/-/g, "").slice(0, 12);
  return `${timestamp}_${unique}${ext}`;
};

/* ─────────────────────────────────────────────────────────────────
   POST /api/files/upload
   Protected – owner role only
   Multer middleware: single file field "file"

   Encryption flow:
     1. Receive raw file bytes via multer (memory storage)
     2. Generate AES-256 key + random 16-byte IV
     3. Encrypt buffer with AES-256-CBC
     4. Upload ENCRYPTED buffer to Azure Blob Storage
     5. Store AES key in Azure Key Vault (keyed by file MongoDB ID)
     6. Store IV + metadata in MongoDB (key is NOT stored here)
     7. Trigger async IPFS backup of the encrypted blob
─────────────────────────────────────────────────────────────────*/
const uploadEncryptedFile = async (req, res) => {
  try {
    // multer already ran — req.file has the bytes
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded. Use field name \"file\"." });
    }

    const userId       = req.user.userId;
    const originalName = req.file.originalname;
    const mimeType     = req.file.mimetype || "application/octet-stream";
    const rawBuffer    = req.file.buffer;
    const { description } = req.body;

    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return res.status(400).json({
        success: false,
        message: `File type "${ext}" is not allowed. Accepted: .fastq, .bam, .vcf`,
      });
    }

    // ── 1. Generate AES-256 key + IV ───────────────────────
    const aesKeyHex = generateKey(); // 64-char hex (32 bytes)
    const ivHex     = generateIV();  // 32-char hex (16 bytes)

    // ── 2. Encrypt the raw file buffer ──────────────────────
    console.log(`[Upload] Encrypting ${originalName} (${rawBuffer.length} bytes)...`);
    const encryptedBuffer = encryptBuffer(rawBuffer, aesKeyHex, ivHex);

    // ── 3. Build safe blob name ───────────────────────────
    const blobName = generateSafeBlobName(originalName);

    // ── 4. Upload ENCRYPTED bytes to Azure ─────────────────
    console.log(`[Upload] Uploading encrypted blob: ${blobName}`);
    const cloudUrl = await uploadEncryptedBuffer(blobName, encryptedBuffer, mimeType);

    const containerName = process.env.AZURE_CONTAINER_NAME || "genomic-files";

    // ── 5. Save metadata to MongoDB (WITHOUT the AES key) ─────
    const genomicFile = await GenomicFile.create({
      owner:              userId,
      originalName,
      storedName:         blobName,
      extension:          ext,
      sizeBytes:          rawBuffer.length,   // store ORIGINAL size
      mimeType,
      azureBlobName:      blobName,
      azureContainerName: containerName,
      cloudUrl,
      isEncrypted:        true,
      encryptionIv:       ivHex,              // IV is safe in DB (not secret)
      ipfsStatus:         "pending",
      description:        description || "",
    });

    // ── 6. Store AES key in Azure Key Vault ────────────────
    //    Key is stored AFTER the file record exists so we have a stable ID
    await storeEncryptionKey(String(genomicFile._id), aesKeyHex);
    console.log(`[Upload] AES key stored in Key Vault for file: ${genomicFile._id}`);

    // Clear key from memory immediately after Key Vault storage
    // (JS GC will collect — no explicit zeroing needed in Node.js)

    // ── 7. Trigger async IPFS backup of encrypted blob ──────
    setImmediate(async () => {
      try {
        await GenomicFile.findByIdAndUpdate(genomicFile._id, { ipfsStatus: "uploading" });
        const { cid, ipfsUrl } = await uploadToIPFS(
          blobName, originalName, mimeType, rawBuffer.length
        );
        await GenomicFile.findByIdAndUpdate(genomicFile._id, {
          ipfsCid:    cid,
          ipfsUrl,
          ipfsStatus: "done",
        });
        console.log(`[IPFS] ✅ Backed up encrypted ${blobName} → CID: ${cid}`);
      } catch (ipfsErr) {
        console.error(`[IPFS] ❌ Backup failed for ${blobName}:`, ipfsErr.message);
        await GenomicFile.findByIdAndUpdate(genomicFile._id, { ipfsStatus: "failed" });
      }
    });

    return res.status(201).json({
      success: true,
      message: "File encrypted and uploaded successfully. IPFS backup running in background.",
      file: {
        id:          genomicFile._id,
        originalName,
        sizeBytes:   rawBuffer.length,
        isEncrypted: true,
        cloudUrl,
        ipfsStatus:  "pending",
        uploadedAt:  genomicFile.createdAt,
      },
    });
  } catch (err) {
    console.error("[uploadEncryptedFile]", err);
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: `File too large. Maximum size is ${process.env.MAX_FILE_SIZE_MB || 500} MB`,
      });
    }
    return res.status(500).json({ success: false, message: "Encrypted upload failed" });
  }
};

/* ─────────────────────────────────────────────────────────────────
   GET /api/files/get-upload-url
   Protected – owner role only

   Query params:
     filename  (string, required) – original file name
     filesize  (number, required) – file size in bytes
     filetype  (string, optional) – MIME type hint

   Response:
     { sasToken, blobUrl, blobName, containerName, expiresInMinutes }
──────────────────────────────────────────────────────────────────*/
const getUploadUrl = async (req, res) => {
  try {
    const { filename, filesize, filetype } = req.query;

    // ── 1. Validate required fields ─────────────────────────────
    if (!filename) {
      return res.status(400).json({ success: false, message: "filename query parameter is required" });
    }
    if (!filesize || isNaN(Number(filesize)) || Number(filesize) <= 0) {
      return res.status(400).json({ success: false, message: "filesize must be a positive number (bytes)" });
    }

    // ── 2. Validate extension ───────────────────────────────────
    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return res.status(400).json({
        success: false,
        message: `File type "${ext}" is not allowed. Accepted: .fastq, .bam, .vcf`,
      });
    }

    // ── 3. Generate safe, unique blob name ──────────────────────
    const blobName = generateSafeBlobName(filename);

    // ── 4. Generate SAS token (2-hour window for large files) ────
    const { sasToken, blobUrl, containerName } = generateUploadSasToken(blobName, 120);

    // ── 5. Respond with upload credentials ──────────────────────
    return res.status(200).json({
      success: true,
      message: "Upload token generated. Upload the file directly to Azure using the provided SAS URL.",
      blobName,
      blobUrl,
      sasToken,
      containerName,
      expiresInMinutes: 30,
      // Full URL the frontend should PUT/block-upload to:
      sasUrl: `${blobUrl}?${sasToken}`,
    });
  } catch (err) {
    console.error("[getUploadUrl]", err);
    const msg = err.message.includes("credentials")
      ? "Azure Storage is not configured. Contact the administrator."
      : "Failed to generate upload URL";
    return res.status(500).json({ success: false, message: msg });
  }
};

/* ─────────────────────────────────────────────────────────────────
   POST /api/files/confirm-upload
   Protected – owner role only

   Body:
     {
       blobName     : string  – the blob name returned by get-upload-url
       originalName : string  – original filename (for display)
       sizeBytes    : number  – file size in bytes
       mimeType     : string  – MIME type (optional)
       description  : string  – optional description
     }

   Response:
     { message, file: { cloudUrl, ipfsCid, ipfsUrl } }
──────────────────────────────────────────────────────────────────*/
const confirmUpload = async (req, res) => {
  try {
    const { blobName, originalName, sizeBytes, mimeType, description } = req.body;
    const userId = req.user.userId;

    // ── 1. Input validation ─────────────────────────────────────
    if (!blobName || !originalName) {
      return res.status(400).json({
        success: false,
        message: "blobName and originalName are required",
      });
    }

    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return res.status(400).json({
        success: false,
        message: `File type "${ext}" is not allowed`,
      });
    }

    // ── 2. Verify the blob actually exists in Azure ─────────────
    const exists = await verifyBlobExists(blobName);
    if (!exists) {
      return res.status(400).json({
        success: false,
        message: "Blob not found in Azure. Ensure the file was fully uploaded before confirming.",
      });
    }

    // ── 3. Get actual file properties from Azure ─────────────────
    let actualSize   = Number(sizeBytes) || 0;
    let actualMime   = mimeType || "application/octet-stream";
    try {
      const props = await getBlobProperties(blobName);
      actualSize  = props.sizeBytes || actualSize;
      actualMime  = props.mimeType  || actualMime;
    } catch {
      // Non-fatal: use client-provided values if properties fail
    }

    const containerName = process.env.AZURE_CONTAINER_NAME || "genomic-files";
    const accountName   = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const cloudUrl      = `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}`;

    // ── 4. Persist metadata to MongoDB ───────────────────────────
    const genomicFile = await GenomicFile.create({
      owner:          userId,
      originalName,
      storedName:     blobName,
      extension:      ext,
      sizeBytes:      actualSize,
      mimeType:       actualMime,
      azureBlobName:  blobName,
      azureContainerName: containerName,
      cloudUrl,
      ipfsStatus:     "pending",
      description:    description || "",
    });

    // ── 5. Trigger async IPFS backup (non-blocking) ─────────────
    // We respond to the client immediately and let IPFS run in the background.
    // The ipfsStatus field tracks progress.
    setImmediate(async () => {
      try {
        await GenomicFile.findByIdAndUpdate(genomicFile._id, { ipfsStatus: "uploading" });
        const { cid, ipfsUrl } = await uploadToIPFS(
          blobName, originalName, actualMime, actualSize   // pass sizeBytes — required!
        );
        await GenomicFile.findByIdAndUpdate(genomicFile._id, {
          ipfsCid:    cid,
          ipfsUrl,
          ipfsStatus: "done",
        });
        console.log(`[IPFS] ✅ Backed up ${blobName} → CID: ${cid}`);
      } catch (ipfsErr) {
        console.error(`[IPFS] ❌ Backup failed for ${blobName}:`, ipfsErr.message);
        await GenomicFile.findByIdAndUpdate(genomicFile._id, { ipfsStatus: "failed" });
      }
    });

    // ── 6. Respond immediately with file reference ───────────────
    return res.status(201).json({
      success: true,
      message: "Upload completed. IPFS backup is running in the background.",
      file: {
        id:          genomicFile._id,
        originalName,
        sizeBytes:   actualSize,
        cloudUrl,
        ipfsCid:     null,    // Will be populated once IPFS backup completes
        ipfsUrl:     null,
        ipfsStatus:  "pending",
        uploadedAt:  genomicFile.createdAt,
      },
    });
  } catch (err) {
    console.error("[confirmUpload]", err);
    return res.status(500).json({ success: false, message: "Failed to confirm upload" });
  }
};

/* ─────────────────────────────────────────────────────────────────
   GET /api/files/my-files
   Protected – owner role only
   Returns all files uploaded by the authenticated user.
──────────────────────────────────────────────────────────────────*/
const getMyFiles = async (req, res) => {
  try {
    const userId = req.user.userId;
    const files = await GenomicFile.find({ owner: userId, uploadStatus: "confirmed" })
      .sort({ createdAt: -1 })
      .select("-__v");

    return res.status(200).json({ success: true, count: files.length, files });
  } catch (err) {
    console.error("[getMyFiles]", err);
    return res.status(500).json({ success: false, message: "Failed to fetch files" });
  }
};

/* ─────────────────────────────────────────────────────────────────
   GET /api/files/:id/ipfs-status
   Protected
   Lets the frontend poll for IPFS backup completion.
──────────────────────────────────────────────────────────────────*/
const getIpfsStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const file = await GenomicFile.findById(id).select("ipfsStatus ipfsCid ipfsUrl");
    if (!file) return res.status(404).json({ success: false, message: "File not found" });
    return res.status(200).json({ success: true, ipfsStatus: file.ipfsStatus, ipfsCid: file.ipfsCid, ipfsUrl: file.ipfsUrl });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to get IPFS status" });
  }
};

/* ──────────────────────────────────────────────────────────────────
   DELETE /api/files/:id
   Protected – owner role only
   Deletes the file from Azure, Filebase/IPFS, and MongoDB.
──────────────────────────────────────────────────────────────────*/
const deleteFile = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // 1. Find the file and verify ownership
    const file = await GenomicFile.findById(id);
    if (!file) return res.status(404).json({ success: false, message: "File not found" });
    if (String(file.owner) !== String(userId)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const blobName      = file.azureBlobName;
    const containerName = file.azureContainerName;
    const errors        = [];

    // 2. Delete from Azure Blob Storage
    try {
      const azureAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
      const azureAccountKey  = process.env.AZURE_STORAGE_ACCOUNT_KEY;
      if (azureAccountName && azureAccountKey) {
        const { BlobServiceClient, StorageSharedKeyCredential } = require("@azure/storage-blob");
        const cred   = new StorageSharedKeyCredential(azureAccountName, azureAccountKey);
        const client = new BlobServiceClient(`https://${azureAccountName}.blob.core.windows.net`, cred);
        const blobClient = client.getContainerClient(containerName).getBlobClient(blobName);
        await blobClient.deleteIfExists();
        console.log(`[Azure] ✅ Deleted blob: ${blobName}`);
      }
    } catch (azureErr) {
      console.error(`[Azure] ❌ Delete failed:`, azureErr.message);
      errors.push(`Azure: ${azureErr.message}`);
    }

    // 3. Delete from Filebase / IPFS (non-blocking — don't fail request if IPFS fails)
    try {
      if (file.ipfsStatus === "done" || file.ipfsStatus === "uploading") {
        await deleteFromIPFS(blobName);
        console.log(`[IPFS] ✅ Unpinned: ${blobName}`);
      }
    } catch (ipfsErr) {
      console.warn(`[IPFS] ⚠️ Unpin skipped:`, ipfsErr.message);
      // Non-fatal — IPFS deletion is best-effort
    }

    // 4. Remove from MongoDB + Key Vault key
    await GenomicFile.findByIdAndDelete(id);

    // Delete the encryption key from Key Vault (best-effort)
    try {
      await deleteEncryptionKey(id);
    } catch (kvErr) {
      console.warn(`[KeyVault] Could not delete key for ${id}:`, kvErr.message);
    }

    return res.status(200).json({
      success: true,
      message: errors.length
        ? `File deleted from database. Azure errors: ${errors.join("; ")}`
        : "File deleted from Azure, IPFS, and database.",
    });
  } catch (err) {
    console.error("[deleteFile]", err);
    return res.status(500).json({ success: false, message: "Failed to delete file" });
  }
};

/* ──────────────────────────────────────────────────────────────────
   POST /api/files/:id/retry-ipfs
   Protected – owner role only
   Re-triggers the IPFS backup for a file where ipfsStatus === "failed".
──────────────────────────────────────────────────────────────────*/
const retryIpfs = async (req, res) => {
  try {
    const { id }   = req.params;
    const userId   = req.user.userId;

    const file = await GenomicFile.findById(id);
    if (!file)
      return res.status(404).json({ success: false, message: "File not found" });
    if (String(file.owner) !== String(userId))
      return res.status(403).json({ success: false, message: "Access denied" });
    if (file.ipfsStatus === "done")
      return res.status(400).json({ success: false, message: "IPFS backup already completed" });

    // Reset to pending immediately so the frontend can start polling
    await GenomicFile.findByIdAndUpdate(id, { ipfsStatus: "pending", ipfsCid: null, ipfsUrl: null });

    // Trigger the backup asynchronously (same pattern as confirmUpload)
    setImmediate(async () => {
      try {
        await GenomicFile.findByIdAndUpdate(id, { ipfsStatus: "uploading" });
        const { cid, ipfsUrl } = await uploadToIPFS(
          file.azureBlobName,
          file.originalName,
          file.mimeType || "application/octet-stream",
          file.sizeBytes
        );
        await GenomicFile.findByIdAndUpdate(id, {
          ipfsCid:    cid,
          ipfsUrl,
          ipfsStatus: "done",
        });
        console.log(`[IPFS] ✅ Retry succeeded for ${file.azureBlobName} → CID: ${cid}`);
      } catch (ipfsErr) {
        console.error(`[IPFS] ❌ Retry failed for ${file.azureBlobName}:`, ipfsErr.message);
        await GenomicFile.findByIdAndUpdate(id, { ipfsStatus: "failed" });
      }
    });

    return res.status(202).json({
      success: true,
      message: "IPFS retry started. Poll /ipfs-status for progress.",
      ipfsStatus: "pending",
    });
  } catch (err) {
    console.error("[retryIpfs]", err);
    return res.status(500).json({ success: false, message: "Failed to start IPFS retry" });
  }
};

module.exports = { uploadEncryptedFile, upload, getUploadUrl, confirmUpload, getMyFiles, getIpfsStatus, deleteFile, retryIpfs };
