/**
 * fileController.js
 * ─────────────────
 *
 * Upload architecture:
 *
 *  1. GET  /api/files/get-upload-url
 *       → Validates file metadata, generates a safe blob name,
 *         returns a SAS token so the browser uploads DIRECTLY to Azure.
 *         No file bytes ever touch this server → zero bottleneck.
 *
 *  2. POST /api/files/confirm-upload
 *       → Called after the browser finishes uploading.
 *         Responds IMMEDIATELY (< 100 ms) then in the background:
 *           a. Downloads the plaintext blob from Azure
 *           b. Encrypts it with AES-256-CBC (Node crypto module)
 *           c. Overwrites the blob with ciphertext
 *           d. Stores the AES key in Azure Key Vault
 *           e. Updates MongoDB (isEncrypted = true)
 *           f. Triggers IPFS backup of the encrypted blob
 *         The user sees "Upload complete!" immediately — no waiting for
 *         encryption.
 */

const { v4: uuidv4 } = require("uuid");
const path        = require("path");
const crypto      = require("crypto");
const GenomicFile = require("../models/GenomicFile");

const {
  generateUploadSasToken,
  verifyBlobExists,
  getBlobProperties,
  downloadBlobToBuffer,
  uploadEncryptedBuffer,
} = require("../services/azureService");

const { uploadToIPFS, deleteFromIPFS }   = require("../services/ipfsService");
const { generateKey, generateIV, encryptBuffer, decryptPartialBuffer } = require("../services/encryptionService");
const { storeEncryptionKey, deleteEncryptionKey } = require("../services/keyVaultService");
const { registerFileOnChain }            = require("../services/blockchainService");

// ── Allowed genomic file extensions ─────────────────────────────────────
const ALLOWED_EXTENSIONS = new Set([".fastq", ".bam", ".vcf"]);

/**
 * generateSafeBlobName
 * ────────────────────
 * Creates a safe, unique blob name.
 * Format: <timestamp>_<uuid12>.<ext>
 */
const generateSafeBlobName = (originalName) => {
  const ext       = path.extname(originalName).toLowerCase();
  const timestamp = Date.now();
  const unique    = uuidv4().replace(/-/g, "").slice(0, 12);
  return `${timestamp}_${unique}${ext}`;
};

/* ──────────────────────────────────────────────────────────────────────────
   Background encryption job
   ─────────────────────────
   Runs AFTER confirmUpload has already responded to the client.
   Steps:
     1. Download plaintext blob from Azure
     2. Encrypt with AES-256-CBC
     3. Overwrite blob with ciphertext
     4. Store AES key in Azure Key Vault
     5. Update MongoDB (isEncrypted = true, encryptionIv)
     6. Compute SHA-256 of the encrypted blob → register on blockchain
     7. Start IPFS backup of encrypted blob
────────────────────────────────────────────────────────────────────────────*/
const runBackgroundEncryptAndBackup = async (fileId, blobName, originalName, mimeType, sizeBytes) => {
  let encryptedBuffer = null;

  // ── Phase 1: AES-256-CBC encryption ───────────────────────────────────
  try {
    console.log(`[Encrypt] ⏳ Downloading blob for encryption: ${blobName}`);
    const plainBuffer = await downloadBlobToBuffer(blobName);

    const aesKeyHex   = generateKey();
    const ivHex       = generateIV();
    encryptedBuffer   = encryptBuffer(plainBuffer, aesKeyHex, ivHex);

    console.log(`[Encrypt] 🔐 Re-uploading encrypted blob (${encryptedBuffer.length} bytes)`);
    await uploadEncryptedBuffer(blobName, encryptedBuffer, mimeType);

    await storeEncryptionKey(String(fileId), aesKeyHex);
    console.log(`[KeyVault] ✅ AES key stored for file: ${fileId}`);

    await GenomicFile.findByIdAndUpdate(fileId, {
      isEncrypted:  true,
      encryptionIv: ivHex,
    });
    console.log(`[Encrypt] ✅ Encryption complete: ${blobName}`);
  } catch (encErr) {
    console.error(`[Encrypt] ❌ Encryption failed for ${blobName}:`, encErr.message);
  }

  // ── Phase 2: Blockchain registration ──────────────────────────────────
  // Compute SHA-256 of the encrypted blob and register on Sepolia blockchain.
  let sha256hex = null;
  try {
    const dataToHash = encryptedBuffer || Buffer.from(blobName);
    sha256hex        = crypto.createHash("sha256").update(dataToHash).digest("hex");

    console.log(`[Blockchain] ⏳ Registering file on Sepolia: ${sha256hex.slice(0, 16)}…`);
    const bcResult = await registerFileOnChain(sha256hex, "");

    if (bcResult.disabled) {
      console.warn(`[Blockchain] ⚠️  Skipped (not configured): ${blobName}`);
    } else if (bcResult.success) {
      await GenomicFile.findByIdAndUpdate(fileId, {
        blockchainFileId:    bcResult.fileId,
        blockchainTxHash:    bcResult.txHash,
        blockchainBlockNum:  bcResult.blockNumber,
        blockchainFileHash:  sha256hex,
        blockchainTimestamp: new Date(),
      });
      console.log(`[Blockchain] ✅ fileId=${bcResult.fileId} | Tx: ${bcResult.txHash} | Block: ${bcResult.blockNumber}`);
    } else {
      console.warn(`[Blockchain] ⚠️  Registration failed: ${bcResult.error}`);
    }
  } catch (bcErr) {
    console.error(`[Blockchain] ❌ Exception during registration:`, bcErr.message);
  }

  // ── Phase 3: IPFS backup ──────────────────────────────────────────────
  try {
    await GenomicFile.findByIdAndUpdate(fileId, { ipfsStatus: "uploading" });
    const { cid, ipfsUrl } = await uploadToIPFS(blobName, originalName, mimeType, sizeBytes);
    await GenomicFile.findByIdAndUpdate(fileId, {
      ipfsCid:           cid,
      ipfsUrl,
      ipfsStatus:        "done",
      blockchainIpfsCID: cid,   // mirrors IPFS CID stored on blockchain
    });
    console.log(`[IPFS] ✅ Backed up ${blobName} → CID: ${cid}`);
  } catch (ipfsErr) {
    console.error(`[IPFS] ❌ Backup failed for ${blobName}:`, ipfsErr.message);
    await GenomicFile.findByIdAndUpdate(fileId, { ipfsStatus: "failed" });
  }
};

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/files/get-upload-url
   Protected – owner role only

   Query params:
     filename  (string, required) – original file name
     filesize  (number, required) – file size in bytes
     filetype  (string, optional) – MIME type hint

   Response:
     { sasUrl, blobName, blobUrl, sasToken, containerName, expiresInMinutes }
────────────────────────────────────────────────────────────────────────────*/
const getUploadUrl = async (req, res) => {
  try {
    const { filename, filesize } = req.query;

    if (!filename) {
      return res.status(400).json({ success: false, message: "filename query parameter is required" });
    }
    if (!filesize || isNaN(Number(filesize)) || Number(filesize) <= 0) {
      return res.status(400).json({ success: false, message: "filesize must be a positive number (bytes)" });
    }

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return res.status(400).json({
        success: false,
        message: `File type "${ext}" is not allowed. Accepted: .fastq, .bam, .vcf`,
      });
    }

    const blobName = generateSafeBlobName(filename);

    // 120-minute SAS window (generous for large genomic files)
    const { sasToken, blobUrl, containerName } = generateUploadSasToken(blobName, 120);

    return res.status(200).json({
      success: true,
      message: "SAS token generated. Upload the file directly to Azure.",
      blobName,
      blobUrl,
      sasToken,
      containerName,
      expiresInMinutes: 120,
      sasUrl: `${blobUrl}?${sasToken}`,
    });
  } catch (err) {
    console.error("[getUploadUrl]", err);
    const msg = err.message.includes("credentials")
      ? "Azure Storage is not configured."
      : "Failed to generate upload URL";
    return res.status(500).json({ success: false, message: msg });
  }
};

/* ──────────────────────────────────────────────────────────────────────────
   POST /api/files/confirm-upload
   Protected – owner role only

   Body: { blobName, originalName, sizeBytes, mimeType, description }

   Responds IMMEDIATELY after saving metadata.
   AES-256 encryption + IPFS backup run in the background.
────────────────────────────────────────────────────────────────────────────*/
const confirmUpload = async (req, res) => {
  try {
    const { blobName, originalName, sizeBytes, mimeType, description } = req.body;
    const userId = req.user.userId;

    if (!blobName || !originalName) {
      return res.status(400).json({ success: false, message: "blobName and originalName are required" });
    }

    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return res.status(400).json({ success: false, message: `File type "${ext}" is not allowed` });
    }

    // Verify the blob actually exists in Azure
    const exists = await verifyBlobExists(blobName);
    if (!exists) {
      return res.status(400).json({
        success: false,
        message: "Blob not found in Azure. Ensure the file was fully uploaded before confirming.",
      });
    }

    // Get actual properties from Azure
    let actualSize = Number(sizeBytes) || 0;
    let actualMime = mimeType || "application/octet-stream";
    try {
      const props = await getBlobProperties(blobName);
      actualSize  = props.sizeBytes || actualSize;
      actualMime  = props.mimeType  || actualMime;
    } catch { /* use client-provided values */ }

    const containerName = process.env.AZURE_CONTAINER_NAME || "genomic-files";
    const accountName   = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const cloudUrl      = `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}`;

    // Save metadata immediately (isEncrypted starts false — background job sets it true)
    const genomicFile = await GenomicFile.create({
      owner:              userId,
      originalName,
      storedName:         blobName,
      extension:          ext,
      sizeBytes:          actualSize,
      mimeType:           actualMime,
      azureBlobName:      blobName,
      azureContainerName: containerName,
      cloudUrl,
      isEncrypted:        false,   // background job will set this to true
      ipfsStatus:         "pending",
      description:        description || "",
    });

    // ── Respond immediately — user sees "Upload complete!" right away ───
    res.status(201).json({
      success: true,
      message: "Upload confirmed. AES-256 encryption and IPFS backup running in the background.",
      file: {
        id:          genomicFile._id,
        originalName,
        sizeBytes:   actualSize,
        isEncrypted: false,        // will become true once background job finishes
        cloudUrl,
        ipfsCid:     null,
        ipfsUrl:     null,
        ipfsStatus:  "pending",
        uploadedAt:  genomicFile.createdAt,
      },
    });

    // ── Kick off background encryption + IPFS (non-blocking) ────────────
    setImmediate(() =>
      runBackgroundEncryptAndBackup(
        genomicFile._id,
        blobName,
        originalName,
        actualMime,
        actualSize
      )
    );

  } catch (err) {
    console.error("[confirmUpload]", err);
    return res.status(500).json({ success: false, message: "Failed to confirm upload" });
  }
};

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/files/my-files
   Protected – owner role only
────────────────────────────────────────────────────────────────────────────*/
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

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/files/:id/ipfs-status
   Protected – lets frontend poll for IPFS backup completion
────────────────────────────────────────────────────────────────────────────*/
const getIpfsStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const file = await GenomicFile.findById(id).select("ipfsStatus ipfsCid ipfsUrl isEncrypted");
    if (!file) return res.status(404).json({ success: false, message: "File not found" });
    return res.status(200).json({
      success:    true,
      ipfsStatus: file.ipfsStatus,
      ipfsCid:    file.ipfsCid,
      ipfsUrl:    file.ipfsUrl,
      isEncrypted: file.isEncrypted,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to get IPFS status" });
  }
};

/* ──────────────────────────────────────────────────────────────────────────
   DELETE /api/files/:id
   Protected – owner role only
────────────────────────────────────────────────────────────────────────────*/
const deleteFile = async (req, res) => {
  try {
    const { id }   = req.params;
    const userId   = req.user.userId;
    const file     = await GenomicFile.findById(id);

    if (!file) return res.status(404).json({ success: false, message: "File not found" });
    if (String(file.owner) !== String(userId))
      return res.status(403).json({ success: false, message: "Access denied" });

    const blobName      = file.azureBlobName;
    const containerName = file.azureContainerName;
    const errors        = [];

    // 1. Delete from Azure
    try {
      const { BlobServiceClient, StorageSharedKeyCredential } = require("@azure/storage-blob");
      const name = process.env.AZURE_STORAGE_ACCOUNT_NAME;
      const key  = process.env.AZURE_STORAGE_ACCOUNT_KEY;
      if (name && key) {
        const cred   = new StorageSharedKeyCredential(name, key);
        const client = new BlobServiceClient(`https://${name}.blob.core.windows.net`, cred);
        await client.getContainerClient(containerName).getBlobClient(blobName).deleteIfExists();
        console.log(`[Azure] ✅ Deleted blob: ${blobName}`);
      }
    } catch (azureErr) {
      console.error(`[Azure] ❌ Delete failed:`, azureErr.message);
      errors.push(`Azure: ${azureErr.message}`);
    }

    // 2. Delete from IPFS
    try {
      if (file.ipfsStatus === "done" || file.ipfsStatus === "uploading") {
        await deleteFromIPFS(blobName);
        console.log(`[IPFS] ✅ Unpinned: ${blobName}`);
      }
    } catch (ipfsErr) {
      console.warn(`[IPFS] ⚠️ Unpin skipped:`, ipfsErr.message);
    }

    // 3. Delete from MongoDB
    await GenomicFile.findByIdAndDelete(id);

    // 4. Delete AES key from Key Vault (best-effort)
    try {
      await deleteEncryptionKey(id);
    } catch (kvErr) {
      console.warn(`[KeyVault] ⚠️ Could not delete key for ${id}:`, kvErr.message);
    }

    return res.status(200).json({
      success: true,
      message: errors.length
        ? `File deleted from database. Azure errors: ${errors.join("; ")}`
        : "File deleted from Azure, IPFS, Key Vault, and database.",
    });
  } catch (err) {
    console.error("[deleteFile]", err);
    return res.status(500).json({ success: false, message: "Failed to delete file" });
  }
};

/* ──────────────────────────────────────────────────────────────────────────
   POST /api/files/:id/retry-ipfs
   Protected – owner role only
────────────────────────────────────────────────────────────────────────────*/
const retryIpfs = async (req, res) => {
  try {
    const { id }   = req.params;
    const userId   = req.user.userId;
    const file     = await GenomicFile.findById(id);

    if (!file)
      return res.status(404).json({ success: false, message: "File not found" });
    if (String(file.owner) !== String(userId))
      return res.status(403).json({ success: false, message: "Access denied" });
    if (file.ipfsStatus === "done")
      return res.status(400).json({ success: false, message: "IPFS backup already completed" });

    await GenomicFile.findByIdAndUpdate(id, { ipfsStatus: "pending", ipfsCid: null, ipfsUrl: null });

    setImmediate(async () => {
      try {
        await GenomicFile.findByIdAndUpdate(id, { ipfsStatus: "uploading" });
        const { cid, ipfsUrl } = await uploadToIPFS(
          file.azureBlobName, file.originalName,
          file.mimeType || "application/octet-stream", file.sizeBytes
        );
        await GenomicFile.findByIdAndUpdate(id, { ipfsCid: cid, ipfsUrl, ipfsStatus: "done" });
        console.log(`[IPFS] ✅ Retry succeeded for ${file.azureBlobName} → CID: ${cid}`);
      } catch (ipfsErr) {
        console.error(`[IPFS] ❌ Retry failed for ${file.azureBlobName}:`, ipfsErr.message);
        await GenomicFile.findByIdAndUpdate(id, { ipfsStatus: "failed" });
      }
    });

    return res.status(202).json({
      success:    true,
      message:    "IPFS retry started. Poll /ipfs-status for progress.",
      ipfsStatus: "pending",
    });
  } catch (err) {
    console.error("[retryIpfs]", err);
    return res.status(500).json({ success: false, message: "Failed to start IPFS retry" });
  }
};

/* ──────────────────────────────────────────────────────────────────────────
   GET /api/files/:id/preview
   Protected – owner role only
   Returns first 256 bytes of the file in both encrypted and decrypted form.
   Uses HTTP Range request — never downloads the full file.
────────────────────────────────────────────────────────────────────────────*/
const previewFile = async (req, res) => {
  try {
    const { id }  = req.params;
    const userId  = req.user.userId;

    const file = await GenomicFile.findById(id).select("+encryptionIv");
    if (!file)
      return res.status(404).json({ success: false, message: "File not found" });
    if (String(file.owner) !== String(userId))
      return res.status(403).json({ success: false, message: "Access denied" });

    // Download exactly 256 bytes (16 × 16-byte AES blocks) — fast range request
    const PREVIEW_BYTES = 256;
    const { BlobServiceClient, StorageSharedKeyCredential } = require("@azure/storage-blob");
    const acct   = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    const key    = process.env.AZURE_STORAGE_ACCOUNT_KEY;
    const cred   = new StorageSharedKeyCredential(acct, key);
    const svc    = new BlobServiceClient(`https://${acct}.blob.core.windows.net`, cred);
    const blob   = svc.getContainerClient(file.azureContainerName).getBlobClient(file.azureBlobName);
    const resp   = await blob.download(0, PREVIEW_BYTES);
    const chunks = [];
    for await (const c of resp.readableStreamBody)
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    const encChunk = Buffer.concat(chunks).slice(0, PREVIEW_BYTES);

    // Convert to array of { hex, dec } objects for the frontend
    const toByteArray = (buf) =>
      [...buf].map(b => ({ hex: b.toString(16).padStart(2, "0"), dec: b }));

    const encryptedBytes = toByteArray(encChunk);

    // Decrypt the 256-byte chunk if key+IV are available
    let decryptedBytes = null;
    if (file.isEncrypted && file.encryptionIv) {
      try {
        const aesKey  = await retrieveEncryptionKey(String(file._id));
        const aligned = encChunk.slice(0, Math.floor(encChunk.length / 16) * 16);
        const plain   = decryptPartialBuffer(aligned, aesKey, file.encryptionIv);
        decryptedBytes = toByteArray(plain);
      } catch (kvErr) {
        console.warn(`[Preview] Could not decrypt for preview: ${kvErr.message}`);
      }
    }

    return res.status(200).json({
      success:        true,
      fileName:       file.originalName,
      fileSize:       file.sizeBytes,
      isEncrypted:    file.isEncrypted,
      encryptionIv:   file.encryptionIv,
      algorithm:      "AES-256-CBC",
      previewBytes:   encChunk.length,
      encrypted:      encryptedBytes,    // raw ciphertext from Azure
      decrypted:      decryptedBytes,    // plaintext (null if not encrypted)
    });
  } catch (err) {
    console.error("[previewFile]", err);
    return res.status(500).json({ success: false, message: "Failed to generate preview" });
  }
};

/* ──────────────────────────────────────────────────────────────────────────
   getPublicFiles  —  GET /api/files/public
   ─────────────────────────────────────────
   Returns a catalogue of all uploaded genomic files for researchers to browse.
   Only safe, non-sensitive metadata is returned (no cloud URLs, no IVs).
   Accessible by any authenticated researcher.
   ────────────────────────────────────────────────────────────────────────── */
const getPublicFiles = async (req, res) => {
  try {
    const files = await GenomicFile.find(
      { uploadStatus: "confirmed" },
      {
        _id: 1, originalName: 1, extension: 1, sizeBytes: 1,
        description: 1, isEncrypted: 1, ipfsStatus: 1,
        ipfsCid: 1, createdAt: 1, owner: 1,
      }
    )
      .populate("owner", "name email")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, files });
  } catch (err) {
    console.error("[getPublicFiles]", err);
    return res.status(500).json({ success: false, message: "Failed to fetch datasets" });
  }
};

module.exports = { getUploadUrl, confirmUpload, getMyFiles, getIpfsStatus, previewFile, deleteFile, retryIpfs, getPublicFiles };
