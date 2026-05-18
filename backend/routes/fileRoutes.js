const express = require("express");
const router  = express.Router();

const { protect, requireRole } = require("../middleware/authMiddleware");
const {
  getUploadUrl,
  confirmUpload,
  getMyFiles,
  getIpfsStatus,
  previewFile,
  deleteFile,
  retryIpfs,
} = require("../controllers/fileController");

/**
 * File Routes — base path: /api/files
 *
 *  GET    /api/files/get-upload-url       – Generate SAS token for direct Azure upload
 *  POST   /api/files/confirm-upload       – Confirm upload; backend runs AES-256 + IPFS async
 *  GET    /api/files/my-files             – List own uploaded files
 *  GET    /api/files/:id/ipfs-status      – Poll IPFS / encryption status
 *  POST   /api/files/:id/retry-ipfs      – Retry a failed IPFS backup
 *  DELETE /api/files/:id                  – Delete from Azure + IPFS + MongoDB + Key Vault
 */

// Generate a SAS token for direct-to-Azure upload
router.get("/get-upload-url", protect, requireRole("owner"), getUploadUrl);

// Confirm that the Azure upload finished; backend encrypts + IPFS backup in background
router.post("/confirm-upload", protect, requireRole("owner"), confirmUpload);

// List files uploaded by the authenticated owner
router.get("/my-files", protect, requireRole("owner"), getMyFiles);

// Preview first 256 bytes — both encrypted and decrypted — for the eye button
router.get("/:id/preview", protect, requireRole("owner"), previewFile);

// Poll IPFS / encryption status for a specific file
router.get("/:id/ipfs-status", protect, requireRole("owner"), getIpfsStatus);

// Retry a failed IPFS backup
router.post("/:id/retry-ipfs", protect, requireRole("owner"), retryIpfs);

// Delete a file from Azure Blob Storage, Filebase IPFS, and MongoDB
router.delete("/:id", protect, requireRole("owner"), deleteFile);

module.exports = router;
