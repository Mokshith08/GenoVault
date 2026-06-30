/**
 * blockchainController.js
 * ───────────────────────
 * HTTP handlers for all /api/blockchain/* routes.
 *
 * Routes:
 *   GET  /api/blockchain/status                        — node + contract health
 *   GET  /api/blockchain/blocks                        — recent N blocks
 *   GET  /api/blockchain/transaction/:tx               — single tx details
 *   GET  /api/blockchain/events                        — all FileRegistered events
 *   GET  /api/blockchain/audit/:fileId                 — full audit trail for one file
 *   POST /api/blockchain/verify                        — verify a SHA-256 hash on-chain
 *   POST /api/blockchain/store                         — manually register a file hash
 *   POST /api/blockchain/request-access                — researcher requests access
 *   POST /api/blockchain/approve-access                — owner approves access
 *   POST /api/blockchain/revoke-access                 — owner revokes access
 *   GET  /api/blockchain/check-access/:fileId/:addr    — check if access is valid
 */

const {
  getBlockchainStatus,
  getRecentBlocks,
  getTransactionDetails,
  getContractEvents,
  verifyFileHashOnChain,
  registerFileOnChain,
  storeFileHashOnChain,
  isBlockchainConfigured,
  requestAccess,
  approveAccess,
  revokeAccess,
  checkAccess,
  getAuditTrail,
} = require("../services/blockchainService");

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/blockchain/status
// ─────────────────────────────────────────────────────────────────────────────
const getStatus = async (req, res) => {
  try {
    const status = await getBlockchainStatus();
    return res.status(200).json({ success: true, blockchain: status });
  } catch (err) {
    console.error("[blockchainController.getStatus]", err);
    return res.status(500).json({ success: false, message: "Failed to get blockchain status" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/blockchain/blocks?count=10
// ─────────────────────────────────────────────────────────────────────────────
const getBlocks = async (req, res) => {
  try {
    if (!isBlockchainConfigured()) {
      return res.status(200).json({ success: true, blocks: [], message: "Blockchain not configured" });
    }
    const count  = Math.min(parseInt(req.query.count) || 10, 50);
    const blocks = await getRecentBlocks(count);
    return res.status(200).json({ success: true, count: blocks.length, blocks });
  } catch (err) {
    console.error("[blockchainController.getBlocks]", err);
    return res.status(500).json({ success: false, message: "Failed to fetch blocks" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/blockchain/transaction/:txHash
// ─────────────────────────────────────────────────────────────────────────────
const getTransaction = async (req, res) => {
  try {
    const { txHash } = req.params;
    if (!txHash || !txHash.startsWith("0x") || txHash.length !== 66) {
      return res.status(400).json({ success: false, message: "Invalid transaction hash" });
    }
    const tx = await getTransactionDetails(txHash);
    if (!tx) return res.status(404).json({ success: false, message: "Transaction not found" });
    return res.status(200).json({ success: true, transaction: tx });
  } catch (err) {
    console.error("[blockchainController.getTransaction]", err);
    return res.status(500).json({ success: false, message: "Failed to fetch transaction" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/blockchain/events
// All FileRegistered events — full list of registered genomic files
// ─────────────────────────────────────────────────────────────────────────────
const getEvents = async (req, res) => {
  try {
    const events = await getContractEvents();
    return res.status(200).json({ success: true, count: events.length, events });
  } catch (err) {
    console.error("[blockchainController.getEvents]", err);
    return res.status(500).json({ success: false, message: "Failed to fetch contract events" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/blockchain/audit/:fileId
// Full audit trail for a single file: registration + all access events
// ─────────────────────────────────────────────────────────────────────────────
const getAudit = async (req, res) => {
  try {
    const fileId = parseInt(req.params.fileId);
    if (!fileId || fileId < 1) {
      return res.status(400).json({ success: false, message: "Invalid fileId" });
    }
    const trail = await getAuditTrail(fileId);
    return res.status(200).json({
      success: true,
      fileId,
      count:   trail.length,
      events:  trail,
    });
  } catch (err) {
    console.error("[blockchainController.getAudit]", err);
    return res.status(500).json({ success: false, message: "Failed to fetch audit trail" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/blockchain/verify
// Body: { fileHash }
// ─────────────────────────────────────────────────────────────────────────────
const verifyHash = async (req, res) => {
  try {
    const { fileHash } = req.body;
    if (!fileHash || typeof fileHash !== "string") {
      return res.status(400).json({ success: false, message: "fileHash is required" });
    }
    const normalised = fileHash.replace(/^0x/, "").toLowerCase();
    if (normalised.length !== 64) {
      return res.status(400).json({ success: false, message: "fileHash must be a 64-character SHA-256 hex string" });
    }
    const result = await verifyFileHashOnChain(normalised);
    return res.status(200).json({ success: true, fileHash: normalised, ...result });
  } catch (err) {
    console.error("[blockchainController.verifyHash]", err);
    return res.status(500).json({ success: false, message: "Verification failed" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/blockchain/store
// Body: { fileHash, ipfsCID? }
// Manually register a file on-chain (owner only, for re-registration)
// ─────────────────────────────────────────────────────────────────────────────
const storeHash = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ success: false, message: "Only data owners can register file hashes" });
    }
    const { fileHash, ipfsCID = "" } = req.body;
    if (!fileHash || typeof fileHash !== "string") {
      return res.status(400).json({ success: false, message: "fileHash is required" });
    }
    const normalised = fileHash.replace(/^0x/, "").toLowerCase();
    if (normalised.length !== 64) {
      return res.status(400).json({ success: false, message: "fileHash must be 64 hex characters" });
    }
    const result = await registerFileOnChain(normalised, ipfsCID);
    if (result.disabled) {
      return res.status(503).json({ success: false, message: "Blockchain not configured", blockchain: result });
    }
    if (!result.success) {
      return res.status(409).json({ success: false, message: result.error || "Failed to store on-chain", blockchain: result });
    }
    return res.status(201).json({
      success:    true,
      message:    "File registered on the blockchain permanently",
      fileHash:   normalised,
      blockchain: result,
    });
  } catch (err) {
    console.error("[blockchainController.storeHash]", err);
    return res.status(500).json({ success: false, message: "Failed to store hash on blockchain" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/blockchain/request-access
// Body: { fileId }
// Researcher requests access to a genomic file — emits event on blockchain
// ─────────────────────────────────────────────────────────────────────────────
const handleRequestAccess = async (req, res) => {
  try {
    const { fileId } = req.body;
    if (!fileId) return res.status(400).json({ success: false, message: "fileId is required" });

    const result = await requestAccess(Number(fileId));
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error || "Failed to request access" });
    }
    return res.status(200).json({
      success:  true,
      message:  "Access request recorded permanently on Sepolia blockchain",
      fileId:   Number(fileId),
      txHash:   result.txHash,
      block:    result.blockNumber,
    });
  } catch (err) {
    console.error("[blockchainController.requestAccess]", err);
    return res.status(500).json({ success: false, message: "Failed to request access" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/blockchain/approve-access
// Body: { fileId, researcherAddress, durationSeconds? }
// Owner approves researcher access — emits AccessApproved event on blockchain
// ─────────────────────────────────────────────────────────────────────────────
const handleApproveAccess = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ success: false, message: "Only data owners can approve access" });
    }
    const { fileId, researcherAddress, durationSeconds = 86400 } = req.body;
    if (!fileId || !researcherAddress) {
      return res.status(400).json({ success: false, message: "fileId and researcherAddress are required" });
    }
    if (!researcherAddress.startsWith("0x") || researcherAddress.length !== 42) {
      return res.status(400).json({ success: false, message: "Invalid Ethereum address" });
    }
    const result = await approveAccess(Number(fileId), researcherAddress, Number(durationSeconds));
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error || "Failed to approve access" });
    }
    return res.status(200).json({
      success:    true,
      message:    "Access approved — permanently recorded on Sepolia blockchain",
      fileId:     Number(fileId),
      researcher: researcherAddress,
      expiresAt:  result.expiresAt,
      txHash:     result.txHash,
      block:      result.blockNumber,
    });
  } catch (err) {
    console.error("[blockchainController.approveAccess]", err);
    return res.status(500).json({ success: false, message: "Failed to approve access" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/blockchain/revoke-access
// Body: { fileId, researcherAddress }
// Owner revokes researcher access — emits AccessRevoked event on blockchain
// ─────────────────────────────────────────────────────────────────────────────
const handleRevokeAccess = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ success: false, message: "Only data owners can revoke access" });
    }
    const { fileId, researcherAddress } = req.body;
    if (!fileId || !researcherAddress) {
      return res.status(400).json({ success: false, message: "fileId and researcherAddress are required" });
    }
    const result = await revokeAccess(Number(fileId), researcherAddress);
    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error || "Failed to revoke access" });
    }
    return res.status(200).json({
      success:    true,
      message:    "Access revoked — permanently recorded on Sepolia blockchain",
      fileId:     Number(fileId),
      researcher: researcherAddress,
      txHash:     result.txHash,
      block:      result.blockNumber,
    });
  } catch (err) {
    console.error("[blockchainController.revokeAccess]", err);
    return res.status(500).json({ success: false, message: "Failed to revoke access" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/blockchain/check-access/:fileId/:researcherAddress
// Returns whether a researcher currently has valid access to a file
// ─────────────────────────────────────────────────────────────────────────────
const handleCheckAccess = async (req, res) => {
  try {
    const { fileId, researcherAddress } = req.params;
    if (!fileId || !researcherAddress) {
      return res.status(400).json({ success: false, message: "fileId and researcherAddress are required" });
    }
    const result = await checkAccess(Number(fileId), researcherAddress);
    return res.status(200).json({
      success:     true,
      fileId:      Number(fileId),
      researcher:  researcherAddress,
      hasAccess:   result.hasAccess,
      expiresAt:   result.expiresAt || null,
    });
  } catch (err) {
    console.error("[blockchainController.checkAccess]", err);
    return res.status(500).json({ success: false, message: "Failed to check access" });
  }
};

module.exports = {
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
};
