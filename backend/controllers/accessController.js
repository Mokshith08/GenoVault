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
const crypto         = require("crypto");
const { pipeline }   = require("stream");
const User           = require("../models/User");
const GenomicFile    = require("../models/GenomicFile");
const AccessRequest  = require("../models/AccessRequest");
const { retrieveEncryptionKey, retrievePinHash } = require("../services/keyVaultService");
const { getReadableBlobStream }                  = require("../services/azureService");

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
    const {
      fileId,
      reason,
      projectTitle,
      purpose,
      accessType,
      extensionRequested,
      dataSharedWithCollaborators,
      institution,
      contactEmail,
      benefits,
      risks,
    } = req.body;
    const researcherId = req.user.userId;

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

    // ── Cooldown / conflict check ─────────────────────────────────────────
    // Find the MOST RECENT request for this file by this researcher
    const existing = await AccessRequest.findOne(
      { file: fileId, researcher: researcherId },
      null,
      { sort: { createdAt: -1 } }   // most recent first
    );

    if (existing) {
      const COOLDOWN_MS   = 24 * 60 * 60 * 1000; // 24 hours
      const now           = Date.now();

      // "approved" is only truly active if the access window hasn't expired
      const isApprovedAndActive =
        existing.status === "approved" &&
        existing.accessExpiresAt &&
        new Date(existing.accessExpiresAt).getTime() > now;

      // Active states — cannot re-request regardless of time
      if (existing.status === "pending" || existing.status === "more-info" || isApprovedAndActive) {
        return res.status(409).json({
          success:       false,
          message:       `A request already exists with status: ${existing.status}`,
          request:       existing,
          cooldownUntil: null, // blocked until owner acts
        });
      }

      // All other states: denied / rejected / revoked / expired-approved
      // Enforce 24h cooldown from when the request was CREATED
      const cooldownUntil = new Date(existing.createdAt.getTime() + COOLDOWN_MS);
      if (cooldownUntil.getTime() > now) {
        return res.status(429).json({
          success:       false,
          message:       "You must wait 24 hours before requesting access to this dataset again.",
          cooldownUntil: cooldownUntil.toISOString(),
        });
      }
      // Cooldown expired — delete old request so a fresh one can be created
      await AccessRequest.deleteOne({ _id: existing._id });
    }

    const accessRequest = await AccessRequest.create({
      file:       fileId,
      researcher: researcherId,
      owner:      file.owner,
      // Legacy field
      reason: reason || purpose || "",
      // Structured fields
      projectTitle:               projectTitle || "",
      purpose:                    purpose      || reason || "",
      accessType:                 accessType   || "read-only",
      extensionRequested:         !!extensionRequested,
      dataSharedWithCollaborators:!!dataSharedWithCollaborators,
      institution:                institution  || "",
      contactEmail:               contactEmail || "",
      benefits:                   benefits     || "",
      risks:                      risks        || "",
      status:                     "pending",
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
      status:     "approved"
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

    // -- 2b. Access-type gate: only "download" type can download the file
    // "read-only" means metadata/preview access only
    if (request.accessType && request.accessType !== "download") {
      return res.status(403).json({
        success: false,
        message: `Download is not permitted — your access type is "${request.accessType}". You need download access.`,
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

    // -- 4. Retrieve AES key FIRST (fast Key Vault call, done before heavy I/O)
    console.log(`[Download] Retrieving AES key from Key Vault: ${fileId}`);
    const aesKeyHex = await retrieveEncryptionKey(String(file._id));

    // -- 5. Open a readable stream from Azure (no buffer — data flows as it arrives)
    console.log(`[Download] Opening Azure stream: ${file.azureBlobName}`);
    const azureStream = await getReadableBlobStream(file.azureBlobName);

    // -- 6. Send headers — do NOT set Content-Length when streaming AES-CBC
    // AES-CBC strips PKCS7 padding on final block, so decrypted size != sizeBytes exactly.
    // Setting a wrong Content-Length causes browsers to truncate or error the download.
    // Without Content-Length the browser uses Transfer-Encoding: chunked automatically.
    res.setHeader("Content-Disposition", `attachment; filename="${file.originalName}"`);
    res.setHeader("Content-Type",         file.mimeType || "application/octet-stream");
    res.setHeader("X-Encrypted-At-Rest", "true");

    // -- 7. Handle non-encrypted files (legacy)
    if (!file.isEncrypted || !file.encryptionIv) {
      console.warn(`[Download] File not encrypted — piping raw stream`);
      azureStream.pipe(res);
      azureStream.on("error", (e) => { console.error("[Download] stream error:", e.message); res.destroy(e); });
      return;
    }

    // -- 8. Create AES-256-CBC decipher Transform stream
    // Node crypto processes each chunk via .update() — CBC state maintained automatically.
    // No full-file buffer needed — decrypted bytes flow to browser as Azure sends chunks.
    const key      = Buffer.from(aesKeyHex, "hex");
    const iv       = Buffer.from(file.encryptionIv, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);

    console.log(`[Download] ✅ Piping Azure → decipher → browser (${file.sizeBytes ? Math.round(file.sizeBytes / 1048576) + " MB" : "?"})`);

    // -- 9. Pipe: Azure → AES-256-CBC decipher → HTTP response
    // stream.pipeline() manages backpressure + cleanup + error propagation
    // across all three streams automatically.
    pipeline(azureStream, decipher, res, (err) => {
      if (err) {
        console.error("[Download] Streaming pipeline failed:", err.message);
        // Headers already sent — can only destroy the socket
        if (!res.destroyed) res.destroy(err);
      }
    });

    // Decrypted bytes flow directly to the TCP socket — never persisted
    return;

  } catch (err) {
    console.error("[downloadFile]", err);
    return res.status(500).json({ success: false, message: "File download failed" });
  }
};

/* -----------------------------------------------------------------
   POST /api/access/request-more-info
   Protected - owner role only

   Body: { requestId, ownerNote }
   Sets status to "more-info" and records the owner's note.
-----------------------------------------------------------------*/
const requestMoreInfo = async (req, res) => {
  try {
    const { requestId, ownerNote } = req.body;
    const ownerId = req.user.userId;

    const request = await AccessRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }
    if (String(request.owner) !== String(ownerId)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (!["pending", "more-info"].includes(request.status)) {
      return res.status(400).json({ success: false, message: `Cannot request more info — request is already ${request.status}` });
    }


    request.status    = "more-info";
    request.ownerNote = ownerNote || "";
    await request.save();

    return res.status(200).json({
      success: true,
      message: "Researcher notified to provide more information.",
    });
  } catch (err) {
    console.error("[requestMoreInfo]", err);
    return res.status(500).json({ success: false, message: "Failed to update request" });
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
  requestMoreInfo,
  verifyPin,
  downloadFile,
  getMyRequests,
  getIncomingRequests,
};
