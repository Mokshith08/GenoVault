const express = require("express");
const router = express.Router();
const { sendOTP, verifyOTP } = require("../controllers/otpController");
const rateLimit = require("express-rate-limit");

// Prevent OTP spam — max 5 sends per 15 minutes per IP
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: "Too many OTP requests. Try again in 15 minutes." },
});

// Prevent brute-force guessing of OTP codes — max 10 attempts per 15 min per IP
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many verification attempts. Try again in 15 minutes." },
});

/**
 * OTP Routes
 * Base path: /api/otp
 *
 * POST /api/otp/send    – Send OTP to user's email (after credentials verified)
 * POST /api/otp/verify  – Verify the OTP code entered by the user
 */
router.post("/send",   otpLimiter, sendOTP);
router.post("/verify", verifyLimiter, verifyOTP);

module.exports = router;
