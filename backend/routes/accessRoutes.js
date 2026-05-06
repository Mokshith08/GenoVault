/**
 * accessRoutes.js
 * ───────────────
 * Secure access control and decryption routes.
 * Base path: /api/access
 *
 * Public summary:
 *  POST /api/access/request-access     – Researcher requests a file
 *  POST /api/access/approve-request    – Owner approves a request
 *  POST /api/access/deny-request       – Owner denies a request
 *  POST /api/access/verify-pin         – Owner verifies 6-digit PIN
 *  GET  /api/access/download/:fileId   – Researcher downloads (decrypt on-demand)
 *  GET  /api/access/my-requests        – Researcher lists own requests
 *  GET  /api/access/incoming-requests  – Owner lists received requests
 */

const express = require("express");
const router  = express.Router();
const rateLimit = require("express-rate-limit");

const { protect, requireRole } = require("../middleware/authMiddleware");
const {
  requestAccess,
  approveRequest,
  denyRequest,
  verifyPin,
  downloadFile,
  getMyRequests,
  getIncomingRequests,
} = require("../controllers/accessController");

// Strict rate limiter for download (prevents encrypted-file brute-force scraping)
const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,                   // 30 downloads per hour per IP
  message: { success: false, message: "Too many download requests. Try again in 1 hour." },
});

// Rate limit PIN verification (brute-force guard)
const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: "Too many PIN attempts. Try again in 15 minutes." },
});

// ── Researcher actions ───────────────────────────────────────────
router.post("/request-access", protect, requireRole("researcher"), requestAccess);
router.get("/my-requests",     protect, requireRole("researcher"), getMyRequests);
router.get(
  "/download/:fileId",
  protect,
  requireRole("researcher"),
  downloadLimiter,
  downloadFile
);

// ── Owner actions ────────────────────────────────────────────────
router.post("/approve-request",    protect, requireRole("owner"), approveRequest);
router.post("/deny-request",       protect, requireRole("owner"), denyRequest);
router.post("/verify-pin",         protect, requireRole("owner"), pinLimiter, verifyPin);
router.get("/incoming-requests",   protect, requireRole("owner"), getIncomingRequests);

module.exports = router;
