// Use the official preset which bundles all required crypto + base32 plugins.
// The bare `otplib` package (v12+) changed to a plugin-based architecture
// that requires manual wiring – @otplib/preset-default is the ready-to-use alternative.
const { authenticator } = require("@otplib/preset-default");
const QRCode = require("qrcode");
const User = require("../models/User");

/* ─────────────────────────────────────────────────────────────
   Security hardening for TOTP
   – window of 1  → only the current 30-second window is valid
   – no step drift beyond ±30s
───────────────────────────────────────────────────────────── */
authenticator.options = {
  window: 1, // Accept ±1 step (±30 s) to account for clock drift
};

const APP_NAME = "GenoVault";


/* ─────────────────────────────────────────────────────────────
   POST /api/auth/setup-mfa
   Protected – user must supply a valid JWT

   Flow:
   1. Generate a cryptographically-random TOTP secret.
   2. Persist the raw secret on the user document (NOT yet enabled).
   3. Build a standard otpauth:// URI and render a QR code as a
      base64 data-URL so the frontend can show it in an <img>.

   We deliberately do NOT set mfa_enabled = true here.
   That only happens after the user proves they can generate
   a valid code (see verify-mfa).
───────────────────────────────────────────────────────────── */
const setupMFA = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // ── Generate a fresh secret ──────────────────────────────
    const secret = authenticator.generateSecret(20); // 20 bytes → 32-char base32

    // ── Persist (raw) – mark MFA not yet enabled ─────────────
    user.mfa_secret = secret;
    user.mfa_enabled = false;
    await user.save({ validateModifiedOnly: true });

    // ── Build otpauth URI ────────────────────────────────────
    // Label uses email so the authenticator shows a friendly name
    const otpauthUrl = authenticator.keyuri(user.email, APP_NAME, secret);

    // ── Render QR code as base64 data URL ────────────────────
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 256,
      color: { dark: "#1a1a2e", light: "#ffffff" },
    });

    return res.status(200).json({
      success: true,
      message: "MFA secret generated. Scan the QR code and verify.",
      qrCode: qrCodeDataUrl, // data:image/png;base64,…
      // Omit secret from response – never expose raw secret to client
    });
  } catch (err) {
    console.error("[setup-mfa]", err);
    return res.status(500).json({ success: false, message: "Failed to generate MFA setup" });
  }
};

/* ─────────────────────────────────────────────────────────────
   POST /api/auth/verify-mfa
   Protected – user must supply a valid JWT
   Body: { code: "123456" }

   Flow:
   1. Load the pending secret stored during setup-mfa.
   2. Verify the 6-digit TOTP code with otplib.
   3. On success → set mfa_enabled = true and persist.
   4. Return success/failure. Never leak the secret.
───────────────────────────────────────────────────────────── */
const verifyMFA = async (req, res) => {
  try {
    const { code } = req.body;

    // ── Input validation ─────────────────────────────────────
    if (!code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({
        success: false,
        message: "A 6-digit numeric code is required",
      });
    }

    const userId = req.user.userId;

    // ── Explicitly select the secret (excluded by default) ───
    const user = await User.findById(userId).select("+mfa_secret");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!user.mfa_secret) {
      return res.status(400).json({
        success: false,
        message: "MFA setup has not been initiated. Call /auth/setup-mfa first.",
      });
    }

    // ── TOTP verification ────────────────────────────────────
    const isValid = authenticator.verify({
      token: code,
      secret: user.mfa_secret,
    });

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired code. Please try again.",
      });
    }

    // ── Activate MFA ─────────────────────────────────────────
    user.mfa_enabled = true;
    await user.save({ validateModifiedOnly: true });

    return res.status(200).json({
      success: true,
      message: "MFA enabled successfully. Your account is now protected.",
    });
  } catch (err) {
    console.error("[verify-mfa]", err);
    return res.status(500).json({ success: false, message: "Failed to verify MFA code" });
  }
};

module.exports = { setupMFA, verifyMFA };
