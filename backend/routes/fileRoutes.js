const express = require("express");
const router  = express.Router();

const { protect, requireRole } = require("../middleware/authMiddleware");
const {
  uploadEncryptedFile,
  upload,
  getUploadUrl,
  confirmUpload,
  getMyFiles,
  getIpfsStatus,
  deleteFile,
  retryIpfs,
} = require("../controllers/fileController");

/**
 * File Routes — base path: /api/files
 *
 *  POST   /api/files/upload               – Server-side AES-256 encrypt + upload to Azure
 *  GET    /api/files/get-upload-url       – Generate SAS token for direct Azure upload (legacy)
 *  POST   /api/files/confirm-upload       – Confirm Azure upload; trigger IPFS backup
 *  GET    /api/files/my-files             – List own uploaded files
 *  GET    /api/files/:id/ipfs-status      – Poll IPFS backup progress
 *  POST   /api/files/:id/retry-ipfs      – Retry a failed IPFS backup
 *  DELETE /api/files/:id                  – Delete from Azure + IPFS + MongoDB + Key Vault
 */

// ── Encrypted upload (server-side: encrypt → Azure) ─────────────
// multer.single("file") runs BEFORE the controller to parse multipart/form-data
router.post("/upload", protect, requireRole("owner"), upload.single("file"), uploadEncryptedFile);

// Generate a SAS token for direct-to-Azure upload
router.get("/get-upload-url", protect, requireRole("owner"), getUploadUrl);

// Confirm that the Azure upload finished; trigger IPFS backup
router.post("/confirm-upload", protect, requireRole("owner"), confirmUpload);

// List files uploaded by the authenticated owner
router.get("/my-files", protect, requireRole("owner"), getMyFiles);

// Poll IPFS backup status for a specific file
router.get("/:id/ipfs-status", protect, requireRole("owner"), getIpfsStatus);

// Retry a failed IPFS backup
router.post("/:id/retry-ipfs", protect, requireRole("owner"), retryIpfs);

// Delete a file from Azure Blob Storage, Filebase IPFS, and MongoDB
router.delete("/:id", protect, requireRole("owner"), deleteFile);

module.exports = router;
