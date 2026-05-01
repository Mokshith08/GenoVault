const { randomInt } = require("crypto");
const OTP = require("../models/OTP");
const User = require("../models/User");
const { sendOTPEmail } = require("../services/emailService");

/* ─────────────────────────────────────────────────────────────
   Helper: Generate a cryptographically secure 6-digit OTP
   Uses crypto.randomInt — NOT Math.random() which is predictable
───────────────────────────────────────────────────────────── */
const generateOTP = () => {
  return randomInt(100000, 1000000).toString();
};

/* ─────────────────────────────────────────────────────────────
   POST /api/otp/send
   Called after credentials are verified — sends OTP to user's email
   Body: { email }
───────────────────────────────────────────────────────────── */
const sendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    // Find the user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Return same response regardless — prevents email enumeration attacks
      return res.status(200).json({
        success: true,
        message: "If this email is registered, an OTP has been sent.",
      });
    }

    // Delete any existing OTP for this user (only one active at a time)
    await OTP.deleteMany({ userId: user._id, purpose: "login" });

    // Generate and save new OTP
    const code = generateOTP();
    await OTP.create({
      userId: user._id,
      email: user.email,
      code,
      purpose: "login",
    });

    // Send email
    try {
      await sendOTPEmail(user.email, code, user.name);
      console.log(`[OTP] ✅ Email sent to ${user.email}`);
    } catch (emailErr) {
      console.error(`[OTP] ❌ Email delivery failed:`, emailErr.message);
      // Still log the code so dev can test without email
    }

    // DEV ONLY: print OTP code in server console for debugging
    // ⚠️  This MUST never run in production — OTPs would be visible in logs
    if (process.env.NODE_ENV === "development") {
      console.log(`[OTP] ========================================`);
      console.log(`[OTP] CODE for ${user.email}: ${code}`);
      console.log(`[OTP] ========================================`);
    }

    return res.status(200).json({
      success: true,
      message: `OTP sent to ${user.email}`,
    });
  } catch (err) {
    console.error("[sendOTP]", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP. Check Gmail OAuth2 credentials in .env",
    });
  }
};

/* ─────────────────────────────────────────────────────────────
   POST /api/otp/verify
   Body: { email, code }
───────────────────────────────────────────────────────────── */
const verifyOTP = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ success: false, message: "Email and code are required" });
    }

    if (code.length !== 6) {
      return res.status(400).json({ success: false, message: "OTP must be 6 digits" });
    }

    // Find the OTP record
    const otpRecord = await OTP.findOne({
      email: email.toLowerCase(),
      purpose: "login",
    });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired or was not requested. Please request a new one.",
      });
    }

    if (otpRecord.code !== code) {
      return res.status(400).json({ success: false, message: "Incorrect OTP. Try again." });
    }

    // OTP is valid — delete it (one-time use)
    await OTP.deleteOne({ _id: otpRecord._id });

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
    });
  } catch (err) {
    console.error("[verifyOTP]", err.message);
    return res.status(500).json({ success: false, message: "OTP verification failed" });
  }
};

module.exports = { sendOTP, verifyOTP };
