/**
 * blockchainRoutes.js
 * ───────────────────
 * Express router for all /api/blockchain/* endpoints.
 * Mounted in server.js as: app.use("/api/blockchain", blockchainRoutes);
 */

const express = require("express");
const router  = express.Router();
const { protect } = require("../middleware/authMiddleware");

const {
  getStatus,
  getBlocks,
  getTransaction,
  getEvents,
  getAudit,
  verifyHash,
  storeHash,
  handleRequestAccess,
  handleApproveAccess,
  handleRevokeAccess,
  handleCheckAccess,
} = require("../controllers/blockchainController");

// ── Public ───────────────────────────────────────────────────────────────────
// GET /api/blockchain/status
router.get("/status", getStatus);

// ── Authenticated ─────────────────────────────────────────────────────────────

// GET /api/blockchain/blocks?count=10
router.get("/blocks", protect, getBlocks);

// GET /api/blockchain/transaction/:txHash
router.get("/transaction/:txHash", protect, getTransaction);

// GET /api/blockchain/events  — all FileRegistered events
router.get("/events", protect, getEvents);

// GET /api/blockchain/audit/:fileId  — full audit trail for one file
router.get("/audit/:fileId", protect, getAudit);

// POST /api/blockchain/verify  — { fileHash }
router.post("/verify", protect, verifyHash);

// POST /api/blockchain/store  — { fileHash, ipfsCID? }  (owner only)
router.post("/store", protect, storeHash);

// ── Access Control ────────────────────────────────────────────────────────────

// POST /api/blockchain/request-access  — { fileId }  (researcher)
router.post("/request-access", protect, handleRequestAccess);

// POST /api/blockchain/approve-access  — { fileId, researcherAddress, durationSeconds? }  (owner)
router.post("/approve-access", protect, handleApproveAccess);

// POST /api/blockchain/revoke-access   — { fileId, researcherAddress }  (owner)
router.post("/revoke-access", protect, handleRevokeAccess);

// GET /api/blockchain/check-access/:fileId/:researcherAddress
router.get("/check-access/:fileId/:researcherAddress", protect, handleCheckAccess);

module.exports = router;
