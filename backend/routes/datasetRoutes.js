const express = require("express");
const router = express.Router();

const { protect, requireRole } = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");
const {
  uploadDataset,
  getAllDatasets,
  getMyDatasets,
  deleteDataset,
  verifyDataset,
} = require("../controllers/datasetController");

/**
 * Dataset Routes
 * Base path: /api/datasets
 *
 * POST   /api/datasets/upload      Owner only  – upload a genomic file
 * GET    /api/datasets             Both roles  – browse all public datasets
 * GET    /api/datasets/my          Owner only  – list own datasets
 * DELETE /api/datasets/:id         Owner only  – delete own dataset
 * POST   /api/datasets/:id/verify  Owner only  – re-verify file integrity
 */

// ── Owner only ────────────────────────────────────────────────
router.post(
  "/upload",
  protect,
  requireRole("owner"),
  upload.single("file"),   // "file" = the form-data field name
  uploadDataset
);

router.get("/my",    protect, requireRole("owner"), getMyDatasets);
router.delete("/:id", protect, requireRole("owner"), deleteDataset);
router.post("/:id/verify", protect, requireRole("owner"), verifyDataset);

// ── Both roles ─────────────────────────────────────────────────
router.get("/", protect, requireRole("owner", "researcher"), getAllDatasets);

module.exports = router;
