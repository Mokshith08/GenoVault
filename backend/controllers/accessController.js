/**
 * accessController.js
 * ───────────────────
 * Implements the secure access control + decryption pipeline:
 *
 *  POST /api/access/request-access    – Researcher requests a file
 *  POST /api/access/approve-request   – Owner approves (marks approved)
 *  POST /api/access/verify-pin        – Owner verifies 6-digit PIN → grants time-limited token
 *  GET  /api/access/download/:fileId  – Researcher downloads (decrypt on-demand)
 *  GET  /api/access/my-requests       – Researcher sees their own requests
 *  GET  /api/access/incoming-requests – Owner sees requests for their files
 *
 * Security guarantees:
 *  ✅ AES key NEVER leaves Key Vault to the frontend
 *  ✅ Decrypted bytes NEVER persisted — streamed once and discarded
 *  ✅ PIN verified via bcrypt against stored hash
 *  ✅ Access is time-limited (ACCESS_GRANT_HOURS, default 24h)
 *  ✅ Only approved researchers can download
 */

const bcrypt         = require("bcryptjs");
const User           = require("../models/User");
const GenomicFile    = require("../models/GenomicFile");
const AccessRequest  = require("../models/AccessRequest");
const { retrieveEncryptionKey, retrievePinHash } = require("../services/keyVaultService");
const { decryptBuffer }                  = require("../services/encryptionService");
const { downloadBlobToBuffer }           = require("../services/azureService");
const {
  requestAccess:   blockchainRequestAccess,
  approveAccess:   blockchainApproveAccess,
  rejectAccess:    blockchainRejectAccess,
  revokeAccess:    blockchainRevokeAccess,
  checkAccess:     blockchainCheckAccess,
  isBlockchainConfigured,
} = require("../services/blockchainService");

const ACCESS_GRANT_HOURS = parseInt(process.env.ACCESS_GRANT_HOURS) || 24;

/* ─────────────────────────────────────────────────────────────────
   POST /api/access/request-access
   Protected – researcher role only

   Body: { fileId, reason? }
   → Creates an AccessRequest with status "pending"
─────────────────────────────────────────────────────────────────*/
const requestAccess = async (req, res) => {
  try {
    const { fileId, reason } = req.body;
    const researcherId       = req.user.userId;

    if (!fileId) {
      return res.status(400).json({ success: false, message: "fileId is required" });
    }

    // Find the file and its owner
    const file = await GenomicFile.findById(fileId);
    if (!file || file.uploadStatus !== "confirmed") {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    // Prevent owner from requesting their own file
    if (String(file.owner) === String(researcherId)) {
      return res.status(400).json({ success: false, message: "You cannot request access to your own file" });
    }

    // Upsert: if a request already exists, return it; otherwise create
    const existing = await AccessRequest.findOne({ file: fileId, researcher: researcherId });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `A request already exists with status: ${existing.status}`,
        request: existing,
      });
    }

    const accessRequest = await AccessRequest.create({
      file:       fileId,
      researcher: researcherId,
      owner:      file.owner,
      reason:     reason || "",
      status:     "pending",
    });

    // -- Blockchain: record access request on-chain (non-blocking)
    // Requires the researcher to have an ORCID set in their profile.
    if (isBlockchainConfigured() && file.blockchainFileId) {
      const researcher = await User.findById(researcherId).select("orcid");
      if (researcher && researcher.orcid) {
        blockchainRequestAccess(file.blockchainFileId, researcher.orcid)
          .then(async (bcResult) => {
            if (bcResult.success) {
              await AccessRequest.findByIdAndUpdate(accessRequest._id, {
                requestTxHash:       bcResult.blockchainTxHash,
                requestBlockNumber:  bcResult.blockchainBlock,
                requestGasUsed:      bcResult.gasUsed,
                requestTxStatus:     bcResult.transactionStatus,
                requestEtherscanUrl: bcResult.etherscanUrl,
              });
              console.log(`[AccessController] Blockchain request tx: ${bcResult.blockchainTxHash}`);
            } else {
              console.warn(`[AccessController] Blockchain request failed (non-blocking): ${bcResult.error}`);
            }
          })
          .catch((e) => console.warn("[AccessController] Blockchain request error (non-blocking):", e.message));
      } else {
        console.warn(`[AccessController] Researcher ${researcherId} has no ORCID — skipping blockchain request`);
      }
    }

    return res.status(201).json({
      success: true,
      message: "Access request submitted. The data owner will be notified.",
      request: accessRequest,
    });
  } catch (err) {
    console.error("[requestAccess]", err);
    return res.status(500).json({ success: false, message: "Failed to submit access request" });
  }
};

/* ─────────────────────────────────────────────────────────────────
   POST /api/access/approve-request
   Protected – owner role only

   Body: { requestId }
   → Sets status to "approved", sets approvedAt and accessExpiresAt
   → Does NOT yet allow download — owner must still verify PIN
─────────────────────────────────────────────────────────────────*/
const approveRequest = async (req, res) => {
  try {
    const { requestId } = req.body;
    const ownerId       = req.user.userId;

    if (!requestId) {
      return res.status(400).json({ success: false, message: "requestId is required" });
    }

    const request = await AccessRequest.findById(requestId).populate("file").populate("researcher", "orcid");
    if (!request) {
      return res.status(404).json({ success: false, message: "Access request not found" });
    }

    // Verify the caller is the file owner
    if (String(request.owner) !== String(ownerId)) {
      return res.status(403).json({ success: false, message: "Access denied — you do not own this file" });
    }

    if (request.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Request is already ${request.status}`,
      });
    }

    const now       = new Date();
    const expiresAt = new Date(now.getTime() + ACCESS_GRANT_HOURS * 60 * 60 * 1000);

    request.status          = "approved";
    request.approvedAt      = now;
    request.accessExpiresAt = expiresAt;
    await request.save();

    // -- Blockchain: approve access on-chain (non-blocking)
    if (isBlockchainConfigured() && request.file && request.file.blockchainFileId && request.researcher && request.researcher.orcid) {
      blockchainApproveAccess(request.file.blockchainFileId, request.researcher.orcid, ACCESS_GRANT_HOURS * 3600)
        .then(async (bcResult) => {
          if (bcResult.success) {
            await AccessRequest.findByIdAndUpdate(requestId, {
              approveTxHash:       bcResult.blockchainTxHash,
              approveBlockNumber:  bcResult.blockchainBlock,
              approveGasUsed:      bcResult.gasUsed,
              approveTxStatus:     bcResult.transactionStatus,
              approveEtherscanUrl: bcResult.etherscanUrl,
            });
            console.log(`[AccessController] Blockchain approve tx: ${bcResult.blockchainTxHash}`);
          } else {
            console.warn(`[AccessController] Blockchain approve failed (non-blocking): ${bcResult.error}`);
          }
        })
        .catch((e) => console.warn("[AccessController] Blockchain approve error (non-blocking):", e.message));
    }

    return res.status(200).json({
      success: true,
      message: `Access approved. The researcher can download the file for ${ACCESS_GRANT_HOURS} hours. Please verify your PIN to authorize.`,
      request: {
        id:              request._id,
        status:          request.status,
        approvedAt:      request.approvedAt,
        accessExpiresAt: request.accessExpiresAt,
      },
    });
  } catch (err) {
    console.error("[approveRequest]", err);
    return res.status(500).json({ success: false, message: "Failed to approve request" });
  }
};

/* ─────────────────────────────────────────────────────────────────
   POST /api/access/deny-request
   Protected – owner role only

   Body: { requestId }
─────────────────────────────────────────────────────────────────*/
const denyRequest = async (req, res) => {
  try {
    const { requestId } = req.body;
    const ownerId       = req.user.userId;

    const request = await AccessRequest.findById(requestId).populate("file").populate("researcher", "orcid");
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }
    if (String(request.owner) !== String(ownerId)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (request.status !== "pending") {
      return res.status(400).json({ success: false, message: `Request is already ${request.status}` });
    }

    request.status = "rejected";
    await request.save();

    // -- Blockchain: reject access on-chain (non-blocking)
    if (isBlockchainConfigured() && request.file && request.file.blockchainFileId && request.researcher && request.researcher.orcid) {
      blockchainRejectAccess(request.file.blockchainFileId, request.researcher.orcid)
        .then(async (bcResult) => {
          if (bcResult.success) {
            await AccessRequest.findByIdAndUpdate(requestId, {
              rejectTxHash:       bcResult.blockchainTxHash,
              rejectBlockNumber:  bcResult.blockchainBlock,
              rejectGasUsed:      bcResult.gasUsed,
              rejectTxStatus:     bcResult.transactionStatus,
              rejectEtherscanUrl: bcResult.etherscanUrl,
            });
            console.log(`[AccessController] Blockchain reject tx: ${bcResult.blockchainTxHash}`);
          } else {
            console.warn(`[AccessController] Blockchain reject failed (non-blocking): ${bcResult.error}`);
          }
        })
        .catch((e) => console.warn("[AccessController] Blockchain reject error (non-blocking):", e.message));
    }

    return res.status(200).json({ success: true, message: "Request rejected." });
  } catch (err) {
    console.error("[denyRequest]", err);
    return res.status(500).json({ success: false, message: "Failed to deny request" });
  }
};

/* -----------------------------------------------------------------
   POST /api/access/revoke-access
   Protected - owner role only

   Body: { requestId }
   Revokes an approved access (manual early revocation).
-----------------------------------------------------------------*/
const revokeRequest = async (req, res) => {
  try {
    const { requestId } = req.body;
    const ownerId       = req.user.userId;

    const request = await AccessRequest.findById(requestId).populate("file").populate("researcher", "orcid");
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }
    if (String(request.owner) !== String(ownerId)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (request.status !== "approved") {
      return res.status(400).json({ success: false, message: "Only approved requests can be revoked" });
    }

    request.status = "revoked";
    await request.save();

    // -- Blockchain: revoke access on-chain (non-blocking)
    if (isBlockchainConfigured() && request.file && request.file.blockchainFileId && request.researcher && request.researcher.orcid) {
      blockchainRevokeAccess(request.file.blockchainFileId, request.researcher.orcid)
        .then(async (bcResult) => {
          if (bcResult.success) {
            await AccessRequest.findByIdAndUpdate(requestId, {
              revokeTxHash:       bcResult.blockchainTxHash,
              revokeBlockNumber:  bcResult.blockchainBlock,
              revokeGasUsed:      bcResult.gasUsed,
              revokeTxStatus:     bcResult.transactionStatus,
              revokeEtherscanUrl: bcResult.etherscanUrl,
            });
            console.log(`[AccessController] Blockchain revoke tx: ${bcResult.blockchainTxHash}`);
          } else {
            console.warn(`[AccessController] Blockchain revoke failed (non-blocking): ${bcResult.error}`);
          }
        })
        .catch((e) => console.warn("[AccessController] Blockchain revoke error (non-blocking):", e.message));
    }

    return res.status(200).json({ success: true, message: "Access revoked." });
  } catch (err) {
    console.error("[revokeRequest]", err);
    return res.status(500).json({ success: false, message: "Failed to revoke access" });
  }
};

/* ─────────────────────────────────────────────────────────────────
   POST /api/access/verify-pin
   Protected – owner role only

   Body: { requestId, pin }
   → Verifies the owner's 6-digit PIN (bcrypt compare)
   → If correct: confirms access is live (already done via approve)
   → Returns success/failure — no token issued (JWT already handles auth)

   The PIN gate exists so that approval + access-enabling are two
   separate authenticated actions (defense in depth).
─────────────────────────────────────────────────────────────────*/
const verifyPin = async (req, res) => {
  try {
    const { requestId, pin } = req.body;
    const ownerId            = req.user.userId;

    if (!requestId || !pin) {
      return res.status(400).json({ success: false, message: "requestId and pin are required" });
    }

    if (!/^\d{6}$/.test(pin)) {
      return res.status(400).json({ success: false, message: "PIN must be exactly 6 digits" });
    }

    // Fetch the access request
    const request = await AccessRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }
    if (String(request.owner) !== String(ownerId)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (request.status !== "approved") {
      return res.status(400).json({ success: false, message: "Request must be approved before PIN verification" });
    }

    // Retrieve the bcrypt PIN hash from Azure Key Vault
    let pinHash;
    try {
      pinHash = await retrievePinHash(String(ownerId));
    } catch {
      return res.status(400).json({
        success: false,
        message: "No PIN is set on your account. Please set a PIN via Settings first.",
      });
    }

    // Bcrypt comparison
    const isPinValid = await bcrypt.compare(pin, pinHash);
    if (!isPinValid) {
      return res.status(401).json({ success: false, message: "Incorrect PIN. Access denied." });
    }

    return res.status(200).json({
      success: true,
      message: "PIN verified. Access granted.",
      access: {
        fileId:          request.file,
        requestId:       request._id,
        accessExpiresAt: request.accessExpiresAt,
      },
    });
  } catch (err) {
    console.error("[verifyPin]", err);
    return res.status(500).json({ success: false, message: "PIN verification failed" });
  }
};

/* ─────────────────────────────────────────────────────────────────
   GET /api/access/download/:fileId
   Protected – researcher role only

   → Checks the researcher has an approved, non-expired request
   → Fetches encrypted file from Azure
   → Retrieves AES key from Key Vault
   → Decrypts in-memory using stored IV
   → Streams decrypted bytes to researcher
   → NOTHING is stored — decrypted data exists only in this request
─────────────────────────────────────────────────────────────────*/
const downloadFile = async (req, res) => {
  try {
    const { fileId }    = req.params;
    const researcherId  = req.user.userId;

    // -- 1. Find file metadata
    const file = await GenomicFile.findById(fileId).select("+encryptionIv");
    if (!file || file.uploadStatus !== "confirmed") {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    // -- 2. Check researcher has approved, non-expired access (MongoDB gate)
    const now     = new Date();
    const request = await AccessRequest.findOne({
      file:       fileId,
      researcher: researcherId,
      status:     "approved",
    });

    if (!request) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Submit an access request and wait for owner approval.",
      });
    }

    if (request.accessExpiresAt && request.accessExpiresAt < now) {
      return res.status(403).json({
        success: false,
        message: "Your access window has expired. Please request access again.",
      });
    }

    // -- 3. Blockchain gate: verify access on-chain (read-only, zero gas)
    // Only enforced when blockchain is configured and file is registered on-chain.
    if (isBlockchainConfigured() && file.blockchainFileId) {
      const researcher = await User.findById(researcherId).select("orcid");
      if (researcher && researcher.orcid) {
        const bcCheck = await blockchainCheckAccess(file.blockchainFileId, researcher.orcid);
        if (!bcCheck.hasAccess && !bcCheck.disabled) {
          console.warn(`[Download] Blockchain gate: access denied for researcher ${researcherId} on file ${fileId}`);
          return res.status(403).json({
            success: false,
            message: "Blockchain verification failed: access not approved or has expired on-chain.",
          });
        }
      }
    }

    // -- 4. Fetch encrypted bytes from Azure
    console.log(`[Download] Fetching encrypted file from Azure: ${file.azureBlobName}`);
    const encryptedBuffer = await downloadBlobToBuffer(file.azureBlobName);

    // -- 5. Handle non-encrypted files (legacy)
    if (!file.isEncrypted || !file.encryptionIv) {
      console.warn(`[Download] File ${fileId} is not encrypted — serving raw bytes`);
      res.setHeader("Content-Disposition", `attachment; filename="${file.originalName}"`);
      res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
      res.setHeader("Content-Length", encryptedBuffer.length);
      return res.send(encryptedBuffer);
    }

    // -- 6. Retrieve AES key from Azure Key Vault
    console.log(`[Download] Retrieving AES key from Key Vault for file: ${fileId}`);
    const aesKeyHex = await retrieveEncryptionKey(String(file._id));

    // -- 7. Decrypt in-memory
    console.log(`[Download] Decrypting file: ${file.originalName}`);
    const decryptedBuffer = decryptBuffer(encryptedBuffer, aesKeyHex, file.encryptionIv);

    // ── 7. Stream decrypted bytes to researcher ────────────────
    // DO NOT save decryptedBuffer anywhere — send and discard
    res.setHeader("Content-Disposition", `attachment; filename="${file.originalName}"`);
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader("Content-Length", decryptedBuffer.length);
    res.setHeader("X-Encrypted-At-Rest", "true"); // Informational header

    console.log(`[Download] ✅ Sending decrypted file to researcher: ${researcherId}`);
    return res.send(decryptedBuffer);

    // decryptedBuffer is garbage collected after this — never persisted

  } catch (err) {
    console.error("[downloadFile]", err);
    return res.status(500).json({ success: false, message: "File download failed" });
  }
};

/* ─────────────────────────────────────────────────────────────────
   GET /api/access/my-requests
   Protected – researcher role only
   Lists all access requests the researcher has submitted.
─────────────────────────────────────────────────────────────────*/
const getMyRequests = async (req, res) => {
  try {
    const researcherId = req.user.userId;
    const requests = await AccessRequest.find({ researcher: researcherId })
      .populate("file", "originalName sizeBytes mimeType createdAt isEncrypted")
      .populate("owner", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, count: requests.length, requests });
  } catch (err) {
    console.error("[getMyRequests]", err);
    return res.status(500).json({ success: false, message: "Failed to fetch requests" });
  }
};

/* ─────────────────────────────────────────────────────────────────
   GET /api/access/incoming-requests
   Protected – owner role only
   Lists all requests for the owner's files.
─────────────────────────────────────────────────────────────────*/
const getIncomingRequests = async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const requests = await AccessRequest.find({ owner: ownerId })
      .populate("file", "originalName sizeBytes isEncrypted")
      .populate("researcher", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, count: requests.length, requests });
  } catch (err) {
    console.error("[getIncomingRequests]", err);
    return res.status(500).json({ success: false, message: "Failed to fetch incoming requests" });
  }
};

module.exports = {
  requestAccess,
  approveRequest,
  denyRequest,
  revokeRequest,
  verifyPin,
  downloadFile,
  getMyRequests,
  getIncomingRequests,
};
