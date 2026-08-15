/**
 * auditLogService.js
 * ──────────────────────────────────────────────────────────────────
 * Non-blocking helper that writes events to the AuditLog collection.
 *
 * Usage in controllers (fire-and-forget):
 *   logEvent("INTEGRITY_VERIFIED", userId, "researcher", fileDoc, {
 *     status:  "success",
 *     details: { storedHash: "abc...", liveHash: "abc..." },
 *     ipAddress: req.ip,
 *   }).catch(console.warn);
 *
 * Rules:
 *   ① Never throws — always resolves even on DB error
 *   ② Never awaited in the hot path — callers use .catch(console.warn)
 *   ③ Adds no latency to the download pipeline
 */

const AuditLog = require("../models/AuditLog");

/**
 * logEvent
 * ────────
 * @param {string} operation   – One of the AuditLog operation enum values
 * @param {*}      userId      – MongoDB ObjectId of the acting user
 * @param {string} userRole    – "owner" | "researcher" | "system"
 * @param {object} fileDoc     – GenomicFile document (or null)
 * @param {object} opts        – Additional fields
 * @param {string} opts.status    – "success" | "failure"  (default: "success")
 * @param {object} opts.details   – Free-form details; include reason+hashes on failures
 * @param {string} opts.txHash    – Blockchain tx hash if applicable
 * @param {number} opts.blockNumber – Blockchain block number if applicable
 * @param {string} opts.ipAddress – Request IP address
 * @returns {Promise<void>}
 */
const logEvent = async (operation, userId, userRole, fileDoc, opts = {}) => {
  try {
    const {
      status      = "success",
      details     = {},
      txHash      = null,
      blockNumber = null,
      ipAddress   = null,
    } = opts;

    await AuditLog.create({
      fileId:      fileDoc?._id      ?? null,
      datasetId:   fileDoc?.datasetId ?? null,
      userId,
      userRole,
      operation,
      status,
      txHash,
      blockNumber,
      ipAddress,
      details,
      timestamp:   new Date(),
    });
  } catch (err) {
    // Non-blocking: log the error but do not propagate it
    console.warn("[auditLogService] Failed to write audit log:", err.message);
  }
};

module.exports = { logEvent };
