const express = require("express");
const router = express.Router();
const { register, login, getMe } = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

/**
 * Auth Routes
 * Base path: /api/auth
 *
 * Public
 *   POST /api/auth/register   – Create a new account
 *   POST /api/auth/login      – Log in and receive JWT
 *
 * Protected
 *   GET  /api/auth/me         – Get current user profile
 */

// ── Public ──────────────────────────────────────────────────
router.post("/register", register);
router.post("/login", login);

// ── Protected ────────────────────────────────────────────────
router.get("/me", protect, getMe);

module.exports = router;
