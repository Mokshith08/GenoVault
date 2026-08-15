/**
 * integrityRoutes.js
 * ──────────────────────────────────────────────────────────────────
 * Mounted in server.js as: app.use("/api/integrity", integrityRoutes)
 *
 *   GET /api/integrity/owner-stats   – aggregated dashboard stats (owner)
 *   GET /api/integrity/:fileId       – 5-layer integrity check for one file (owner)
 *
 * NOTE: owner-stats route MUST be registered before /:fileId
 * so Express doesn't mistake "owner-stats" for a fileId parameter.
 */

const express  = require("express");
const router   = express.Router();
const { protect } = require("../middleware/authMiddleware");

const {
  getOwnerStats,
  getFileIntegrity,
} = require("../controllers/integrityController");

// GET /api/integrity/owner-stats
router.get("/owner-stats", protect, getOwnerStats);

// GET /api/integrity/:fileId
router.get("/:fileId", protect, getFileIntegrity);

module.exports = router;
