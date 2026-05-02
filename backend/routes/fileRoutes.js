const express = require("express");
const router  = express.Router();

const { protect, requireRole } = require("../middleware/authMiddleware");
const {
  getUploadUrl,
  confirmUpload,
  getMyFiles,
  getIpfsStatus,
} = require("../controllers/fileController");

/**
 * File Routes
 * Base path: /api/files
 *
 * All routes require authentication.
 * Upload routes require the "owner" role.
 *
 *  GET  /api/files/get-upload-url  – Generate SAS token for direct Azure upload
 *  POST /api/files/confirm-upload  – Confirm Azure upload; trigger IPFS backup
 *  GET  /api/files/my-files        – List own uploaded files
 *  GET  /api/files/:id/ipfs-status – Poll IPFS backup progress
 */

// Generate a SAS token for direct-to-Azure upload
router.get(
  "/get-upload-url",
  protect,
  requireRole("owner"),
  getUploadUrl
);

// Confirm that the Azure upload finished; trigger IPFS backup
router.post(
  "/confirm-upload",
  protect,
  requireRole("owner"),
  confirmUpload
);

// List files uploaded by the authenticated owner
router.get(
  "/my-files",
  protect,
  requireRole("owner"),
  getMyFiles
);

// Poll IPFS backup status for a specific file
router.get(
  "/:id/ipfs-status",
  protect,
  requireRole("owner"),
  getIpfsStatus
);

module.exports = router;
