/**
 * integrityController.js
 * ──────────────────────────────────────────────────────────────────
 * Unit 6, Module 5 — Full 5-layer integrity status per file.
 *
 * Endpoints:
 *   GET /api/integrity/owner-stats       – aggregated owner dashboard stats
 *   GET /api/integrity/:fileId           – per-file 5-layer integrity check
 *
 * The 5 layers checked per file:
 *   1. SHA-256    – re-stream Azure blob, compare with blockchainFileHash
 *   2. Blockchain – call contract.getFileByHash() for live on-chain confirmation
 *   3. AES        – isEncrypted + encryptionIv present + Key Vault has key
 *   4. Azure      – blob exists (verifyBlobExists)
 *   5. IPFS       – ipfsStatus === "done" && ipfsCid non-null
 *
 * All SHA-256 checks use streaming (getReadableBlobStream) — zero full-file buffer.
 */

const crypto       = require("crypto");
const GenomicFile  = require("../models/GenomicFile");
const AccessRequest = require("../models/AccessRequest");
const AuditLog     = require("../models/AuditLog");
const { getReadableBlobStream, verifyBlobExists } = require("../services/azureService");
const { retrieveEncryptionKey }                   = require("../services/keyVaultService");
const {
  isBlockchainConfigured,
  verifyFileHashOnChain,
} = require("../services/blockchainService");


/* ─────────────────────────────────────────────────────────────────────────────
   Helper — streaming SHA-256 via getReadableBlobStream (no buffer)
   Returns { status: "PASS"|"FAIL"|"SKIP", storedHash, liveHash, error? }
─────────────────────────────────────────────────────────────────────────────*/
const checkSha256 = async (file) => {
  if (!file.blockchainFileHash) {
    return { status: "SKIP", note: "No blockchainFileHash stored (pre-Unit6 file)" };
  }
  try {
    const stream   = await getReadableBlobStream(file.azureBlobName);
    const hashCalc = crypto.createHash("sha256");

    await new Promise((resolve, reject) => {
      stream.on("data",  (chunk) => hashCalc.update(chunk));
      stream.on("end",   resolve);
      stream.on("error", reject);
    });

    const liveHash   = hashCalc.digest("hex");
    const storedHash = file.blockchainFileHash;
    const match      = liveHash === storedHash;

    return {
      status:     match ? "PASS" : "FAIL",
      storedHash,
      liveHash,
      ...(match ? {} : { reason: "SHA-256 mismatch — file may have been tampered" }),
    };
  } catch (err) {
    return { status: "FAIL", error: err.message };
  }
};

/* ─────────────────────────────────────────────────────────────────────────────
   Helper — on-chain registration check
   Uses verifyFileHashOnChain() which is already exported from blockchainService.
─────────────────────────────────────────────────────────────────────────────*/
const checkBlockchain = async (file) => {
  if (!isBlockchainConfigured() || !file.blockchainFileHash) {
    return { status: "SKIP", note: "Blockchain not configured or no hash stored" };
  }
  try {
    const result = await verifyFileHashOnChain(file.blockchainFileHash);

    if (result.disabled) {
      return { status: "SKIP", note: "Blockchain not configured" };
    }

    return {
      status:          result.verified ? "PASS" : "FAIL",
      onChainFileId:   result.fileId        ?? file.blockchainFileId ?? null,
      txHash:          file.blockchainTxHash    ?? null,
      blockNumber:     file.blockchainBlockNum  ?? null,
      registeredAt:    file.blockchainTimestamp ?? null,
      contractAddress: process.env.BLOCKCHAIN_CONTRACT_ADDRESS ?? null,
      network:         "Ethereum Sepolia",
      chainId:         11155111,
      etherscanUrl:    file.blockchainTxHash
        ? `https://sepolia.etherscan.io/tx/${file.blockchainTxHash}`
        : null,
      ...(result.verified ? {} : { reason: result.error || "File hash not found in on-chain registry" }),
    };
  } catch (err) {
    return { status: "FAIL", error: err.message };
  }
};


/* ─────────────────────────────────────────────────────────────────────────────
   Helper — AES encryption status
   PASS = isEncrypted true + IV present + Key Vault has the key
─────────────────────────────────────────────────────────────────────────────*/
const checkAes = async (file) => {
  // We need the IV — fetch with +encryptionIv select if not already loaded
  if (!file.isEncrypted) {
    return { status: "FAIL", reason: "File is not marked as encrypted" };
  }

  // encryptionIv is select:false by default; check if it was fetched
  const hasIv = Boolean(file.encryptionIv);

  // Try Key Vault lookup
  let keyOk = false;
  try {
    const key = await retrieveEncryptionKey(String(file._id));
    keyOk = Boolean(key && key.length === 64); // 32-byte hex = 64 chars
  } catch {
    keyOk = false;
  }

  if (!hasIv) {
    return { status: "FAIL", reason: "AES IV missing from database", keyOk };
  }
  if (!keyOk) {
    return { status: "FAIL", reason: "AES key not found in Key Vault", hasIv };
  }
  return { status: "PASS", algorithm: "AES-256-CBC", hasIv, keyOk };
};

/* ─────────────────────────────────────────────────────────────────────────────
   Helper — Azure blob existence
─────────────────────────────────────────────────────────────────────────────*/
const checkAzure = async (file) => {
  try {
    const exists = await verifyBlobExists(file.azureBlobName);
    return {
      status:   exists ? "PASS" : "FAIL",
      blobName: file.azureBlobName,
      ...(exists ? {} : { reason: "Blob not found in Azure Blob Storage" }),
    };
  } catch (err) {
    return { status: "FAIL", error: err.message };
  }
};

/* ─────────────────────────────────────────────────────────────────────────────
   Helper — IPFS backup status
─────────────────────────────────────────────────────────────────────────────*/
const checkIpfs = (file) => {
  const done = file.ipfsStatus === "done" && Boolean(file.ipfsCid);
  return {
    status:     done ? "PASS" : (file.ipfsStatus === "failed" ? "FAIL" : "PENDING"),
    cid:        file.ipfsCid ?? null,
    ipfsStatus: file.ipfsStatus,
    ipfsUrl:    file.ipfsUrl ?? null,
    ...(done ? {} : { note: "IPFS backup not yet completed" }),
  };
};

/* ─────────────────────────────────────────────────────────────────────────────
   GET /api/integrity/:fileId
   Protected – owner role only (file owner)
─────────────────────────────────────────────────────────────────────────────*/
const getFileIntegrity = async (req, res) => {
  try {
    const { fileId } = req.params;
    const ownerId    = req.user.userId;

    // Fetch with encryptionIv (needed for AES check)
    const file = await GenomicFile.findById(fileId).select("+encryptionIv");
    if (!file || file.uploadStatus !== "confirmed") {
      return res.status(404).json({ success: false, message: "File not found" });
    }
    if (String(file.owner) !== String(ownerId)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Run all 5 checks in parallel (except SHA-256 which uses streaming — run first
    // to avoid concurrent Azure reads for very large files)
    const sha256Result = await checkSha256(file);

    const [blockchainResult, aesResult, azureResult] = await Promise.all([
      checkBlockchain(file),
      checkAes(file),
      checkAzure(file),
    ]);
    const ipfsResult = checkIpfs(file);

    // Overall status: SECURE only if all non-SKIP checks pass
    const allChecks = [sha256Result, blockchainResult, aesResult, azureResult, ipfsResult];
    const anyFail   = allChecks.some(c => c.status === "FAIL");
    const overall   = anyFail ? "AT_RISK" : "SECURE";

    return res.status(200).json({
      success:   true,
      fileId:    String(file._id),
      fileName:  file.originalName,
      datasetId: file.datasetId ?? null,
      checks: {
        sha256:     sha256Result,
        blockchain: blockchainResult,
        aes:        aesResult,
        azure:      azureResult,
        ipfs:       ipfsResult,
      },
      overall,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[integrityController] getFileIntegrity:", err);
    return res.status(500).json({ success: false, message: "Integrity check failed" });
  }
};

/* ─────────────────────────────────────────────────────────────────────────────
   GET /api/integrity/owner-stats
   Protected – owner role only
   Aggregated stats for the owner integrity dashboard.
─────────────────────────────────────────────────────────────────────────────*/
const getOwnerStats = async (req, res) => {
  try {
    const ownerId = req.user.userId;

    // 1. Total datasets owned
    const totalDatasets = await GenomicFile.countDocuments({
      owner:        ownerId,
      uploadStatus: "confirmed",
    });

    // 2. Files with blockchain registration (blockchain txs)
    const blockchainRegistered = await GenomicFile.countDocuments({
      owner:             ownerId,
      uploadStatus:      "confirmed",
      blockchainTxHash:  { $ne: null },
    });

    // 3. Access requests by status
    const [pendingCount, approvedCount, rejectedCount, revokedCount] = await Promise.all([
      AccessRequest.countDocuments({ owner: ownerId, status: "pending"  }),
      AccessRequest.countDocuments({ owner: ownerId, status: "approved" }),
      AccessRequest.countDocuments({ owner: ownerId, status: { $in: ["denied", "rejected"] } }),
      AccessRequest.countDocuments({ owner: ownerId, status: "revoked"  }),
    ]);

    const totalRequests = pendingCount + approvedCount + rejectedCount + revokedCount;

    // 4. Integrity check counts from AuditLog
    // AuditLog stores userId of the researcher who downloaded, so we cross-reference
    // via files owned by this owner.
    const ownerFileIds = await GenomicFile.find({ owner: ownerId, uploadStatus: "confirmed" })
      .select("_id")
      .lean()
      .then(docs => docs.map(d => d._id));

    const [verifiedCount, failedCount] = await Promise.all([
      AuditLog.countDocuments({ fileId: { $in: ownerFileIds }, operation: "INTEGRITY_VERIFIED" }),
      AuditLog.countDocuments({ fileId: { $in: ownerFileIds }, operation: "INTEGRITY_FAILED"   }),
    ]);

    // 5. Recent 10 audit events from AuditLog (for this owner's files)
    const recentEvents = await AuditLog.find({ fileId: { $in: ownerFileIds } })
      .sort({ timestamp: -1 })
      .limit(10)
      .populate("fileId", "originalName datasetId")
      .populate("userId", "name email")
      .lean();

    return res.status(200).json({
      success: true,
      stats: {
        totalDatasets,
        blockchainRegistered,
        totalRequests,
        pendingCount,
        approvedCount,
        rejectedCount,
        revokedCount,
        integrityVerified: verifiedCount,
        integrityFailed:   failedCount,
        totalIntegrityChecks: verifiedCount + failedCount,
      },
      recentActivity: recentEvents.map(e => ({
        id:        String(e._id),
        operation: e.operation,
        status:    e.status,
        fileName:  e.fileId?.originalName ?? "Unknown",
        datasetId: e.fileId?.datasetId    ?? null,
        actor:     e.userId?.name         ?? "Unknown",
        details:   e.details,
        timestamp: e.timestamp,
      })),
    });
  } catch (err) {
    console.error("[integrityController] getOwnerStats:", err);
    return res.status(500).json({ success: false, message: "Failed to load integrity stats" });
  }
};

module.exports = { getFileIntegrity, getOwnerStats };
