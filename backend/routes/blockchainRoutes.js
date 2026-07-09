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
  handleRejectAccess,
  handleRevokeAccess,
  handleCheckAccess,
  handleGetRequests,
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

// POST /api/blockchain/request-access  — { fileId, researcherOrcid }  (researcher)
router.post("/request-access", protect, handleRequestAccess);

// POST /api/blockchain/approve-access  — { fileId, researcherOrcid, durationSeconds? }  (owner)
router.post("/approve-access", protect, handleApproveAccess);

// POST /api/blockchain/reject-access   — { fileId, researcherOrcid }  (owner)
router.post("/reject-access", protect, handleRejectAccess);

// POST /api/blockchain/revoke-access   — { fileId, researcherOrcid }  (owner)
router.post("/revoke-access", protect, handleRevokeAccess);

// GET /api/blockchain/check-access/:fileId/:researcherOrcid  (URL-encoded ORCID)
router.get("/check-access/:fileId/:researcherOrcid", protect, handleCheckAccess);

// GET /api/blockchain/requests/:fileId  — on-chain requests for a file (owner dashboard)
router.get("/requests/:fileId", protect, handleGetRequests);

module.exports = router;
