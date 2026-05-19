const jwt    = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { randomInt } = require("crypto");
const User = require("../models/User");
const OTP  = require("../models/OTP");
const { sendOTPEmail } = require("../services/emailService");
const { storePinHash, retrievePinHash } = require("../services/keyVaultService");


/* ─────────────────────────────────────────────────────────────
   Helper: Generate a signed JWT for a user
───────────────────────────────────────────────────────────── */
const generateToken = (userId, role) => {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );
};

/* ─────────────────────────────────────────────────────────────
   POST /api/auth/register
   Body: { name, email, password, role }
───────────────────────────────────────────────────────────── */
const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // ── 1. Input validation ──────────────────────────────────
    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "All fields are required: name, email, password, role",
      });
    }

    if (!["owner", "researcher"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Role must be either "owner" or "researcher"',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    // ── 2. Check for existing user ───────────────────────────
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    // ── 3. Create user (password hashed by pre-save hook) ────
    const user = await User.create({ name, email, password, role });

    // ── 4. Issue a short-lived setup token so the client can call
    //    /auth/setup-mfa immediately without a separate login step.
    //    This token expires in 10 minutes – it is only for MFA setup.
    const setupToken = generateToken(user._id, user.role);

    // ── 5. Respond ──────────────────────────────────────────
    return res.status(201).json({
      success: true,
      message: "Account created successfully. Please set up MFA.",
      setupToken, // Short-lived – front-end uses this only for MFA setup
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    // Duplicate key from a race condition (two simultaneous registrations)
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    // Mongoose validation errors (minlength, enum, etc.)
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages[0] });
    }

    console.error("[register]", err);
    return res.status(500).json({ success: false, message: "Server error during registration" });
  }
};

/* ─────────────────────────────────────────────────────────────
   POST /api/auth/login
   Body: { email, password }
───────────────────────────────────────────────────────────── */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ── 1. Input validation ──────────────────────────────────
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // ── 2. Find user — explicitly select password (excluded by default) ──
    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");

    if (!user) {
      // Use the same message for unknown email & wrong password
      // to avoid leaking which emails are registered (timing-safe)
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // ── 3. Compare password ──────────────────────────────────
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // ── 4. Update last login timestamp ───────────────────────
    user.lastLogin = new Date();
    await user.save({ validateModifiedOnly: true });

    // ── 5. Generate JWT ──────────────────────────────────────
    const token = generateToken(user._id, user.role);

    // ── 6. Set secure httpOnly cookie (inaccessible to JavaScript) ───────
    res.cookie("gv_token", token, {
      httpOnly: true,                                   // JS on the page CANNOT read this
      secure: process.env.NODE_ENV === "production",    // HTTPS only in production
      sameSite: "lax",                                  // blocks cross-site request forgery
      maxAge: 24 * 60 * 60 * 1000,                     // 24 hours (matches JWT expiry)
    });

    // ── 7. Respond ───────────────────────────────────────────
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,   // frontend stores in React state (memory) only — not localStorage
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        pinSet: user.pinSet,
        mfa_enabled: user.mfa_enabled, // ← frontend uses this to pick OTP vs TOTP flow
      },
    });
  } catch (err) {
    console.error("[login]", err);
    return res.status(500).json({ success: false, message: "Server error during login" });
  }
};

/* ─────────────────────────────────────────────────────────────
   GET /api/auth/me
   Protected — returns the authenticated user's own profile
───────────────────────────────────────────────────────────── */
const getMe = async (req, res) => {
  try {
    // req.user is attached by authMiddleware
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      user: {
        id:               user._id,
        name:             user.name,
        email:            user.email,
        role:             user.role,
        pinSet:           user.pinSet,
        profileCompleted: user.profileCompleted,
        researcherProfile: user.researcherProfile,
        createdAt:        user.createdAt,
        lastLogin:        user.lastLogin,
      },
    });
  } catch (err) {
    console.error("[getMe]", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ─────────────────────────────────────────────────────────────
   POST /api/auth/forgot-password
   Body: { email }
   Sends a 6-digit reset OTP to the user's email.
───────────────────────────────────────────────────────────── */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    // Always return 200 — prevents email enumeration attacks
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If this email is registered, a reset code has been sent.",
      });
    }

    // Delete any existing reset OTP for this user
    await OTP.deleteMany({ userId: user._id, purpose: "reset" });

    // Generate and persist a new OTP
    const code = randomInt(100000, 1000000).toString();
    await OTP.create({
      userId: user._id,
      email:  user.email,
      code,
      purpose: "reset",
    });

    // Send the email (reuse existing email service)
    try {
      await sendOTPEmail(user.email, code, user.name);
    } catch (emailErr) {
      console.error("[forgotPassword] email error:", emailErr.message);
    }

    if (process.env.NODE_ENV === "development") {
      console.log(`[RESET OTP] ${user.email}: ${code}`);
    }

    return res.status(200).json({
      success: true,
      message: "If this email is registered, a reset code has been sent.",
    });
  } catch (err) {
    console.error("[forgotPassword]", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ─────────────────────────────────────────────────────────────
   POST /api/auth/reset-password
   Body: { email, code, newPassword }
   Verifies the reset OTP then updates the user's password.
───────────────────────────────────────────────────────────── */
const resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, message: "Email, code, and new password are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    }

    // Find the reset OTP record
    const otpRecord = await OTP.findOne({
      email:   email.toLowerCase(),
      purpose: "reset",
    });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "Reset code has expired or was never requested. Please start over.",
      });
    }

    if (otpRecord.code !== code) {
      return res.status(400).json({ success: false, message: "Incorrect reset code. Try again." });
    }

    // OTP is valid — find the user and update the password
    const user = await User.findById(otpRecord.userId).select("+password");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.password = newPassword; // pre-save hook will hash it
    await user.save({ validateModifiedOnly: true });

    // Consume the OTP (single use)
    await OTP.deleteOne({ _id: otpRecord._id });

    return res.status(200).json({ success: true, message: "Password reset successfully. You can now log in." });
  } catch (err) {
    console.error("[resetPassword]", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ─────────────────────────────────────────────────────────────
   POST /api/auth/set-pin
   Protected — authenticated users only
   Body: { pin }  (exactly 6 digits)

   First-time PIN setup:
     1. Validate it is exactly 6 digits
     2. bcrypt-hash the raw pin (BCRYPT_ROUNDS from env)
     3. Store the hash in Azure Key Vault  (genovault-pin-<userId>)
     4. Mark pinSet: true in MongoDB
     — Raw PIN digit string is NEVER persisted anywhere —
───────────────────────────────────────────────────────────── */
const setPin = async (req, res) => {
  try {
    const { pin } = req.body;
    const userId  = req.user.userId;

    if (!pin || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ success: false, message: "PIN must be exactly 6 digits" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // Hash the raw PIN before sending to Key Vault
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const pinHash    = await bcrypt.hash(pin, saltRounds);

    // Store hash in Azure Key Vault (raw PIN is never stored anywhere)
    await storePinHash(String(userId), pinHash);

    // Mark pinSet = true in MongoDB
    user.pinSet = true;
    await user.save({ validateModifiedOnly: true });

    return res.status(200).json({ success: true, message: "PIN set successfully." });
  } catch (err) {
    console.error("[setPin]", err);
    return res.status(500).json({ success: false, message: "Failed to set PIN" });
  }
};

/* ─────────────────────────────────────────────────────────────
   POST /api/auth/change-pin
   Protected — authenticated users only
   Body: { currentPin, newPin }

   Secure PIN change:
     1. Retrieve current bcrypt hash from Key Vault
     2. Compare currentPin with stored hash
     3. If correct: hash newPin and overwrite Key Vault secret
───────────────────────────────────────────────────────────── */
const changePin = async (req, res) => {
  try {
    const { currentPin, newPin } = req.body;
    const userId = req.user.userId;

    if (!currentPin || !newPin) {
      return res.status(400).json({ success: false, message: "currentPin and newPin are required" });
    }
    if (!/^\d{6}$/.test(currentPin) || !/^\d{6}$/.test(newPin)) {
      return res.status(400).json({ success: false, message: "Both PINs must be exactly 6 digits" });
    }
    if (currentPin === newPin) {
      return res.status(400).json({ success: false, message: "New PIN must be different from the current PIN" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (!user.pinSet) {
      return res.status(400).json({ success: false, message: "No PIN is set. Use /set-pin first." });
    }

    // Retrieve current hash from Key Vault
    let currentHash;
    try {
      currentHash = await retrievePinHash(String(userId));
    } catch {
      return res.status(400).json({ success: false, message: "Could not retrieve current PIN. Please contact support." });
    }

    // Verify current PIN
    const isMatch = await bcrypt.compare(currentPin, currentHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Current PIN is incorrect" });
    }

    // Hash and store the new PIN
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
    const newPinHash = await bcrypt.hash(newPin, saltRounds);
    await storePinHash(String(userId), newPinHash);

    return res.status(200).json({ success: true, message: "PIN changed successfully." });
  } catch (err) {
    console.error("[changePin]", err);
    return res.status(500).json({ success: false, message: "Failed to change PIN" });
  }
};

/* ─────────────────────────────────────────────────────────────
   PUT /api/auth/researcher-profile
   Protected – researcher role only
   Body: all researcherProfile fields
───────────────────────────────────────────────────────────── */
const updateResearcherProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user   = await User.findById(userId);

    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });
    if (user.role !== "researcher")
      return res.status(403).json({ success: false, message: "Only researchers can update this profile" });

    const {
      institution, department, designation, researchArea,
      experience, country, phone, linkedIn, orcid, bio, purpose,
    } = req.body;

    // Require the essential fields
    if (!institution || !designation || !researchArea || !purpose) {
      return res.status(400).json({
        success: false,
        message: "institution, designation, researchArea and purpose are required",
      });
    }

    user.researcherProfile = {
      institution:  institution?.trim(),
      department:   department?.trim(),
      designation:  designation?.trim(),
      researchArea: researchArea?.trim(),
      experience:   experience?.trim(),
      country:      country?.trim(),
      phone:        phone?.trim(),
      linkedIn:     linkedIn?.trim(),
      orcid:        orcid?.trim(),
      bio:          bio?.trim(),
      purpose:      purpose?.trim(),
    };
    user.profileCompleted = true;
    await user.save();

    return res.status(200).json({
      success:          true,
      message:          "Profile saved successfully",
      profileCompleted: true,
      researcherProfile: user.researcherProfile,
    });
  } catch (err) {
    console.error("[updateResearcherProfile]", err);
    return res.status(500).json({ success: false, message: "Failed to save profile" });
  }
};

module.exports = { register, login, getMe, forgotPassword, resetPassword, setPin, changePin, updateResearcherProfile };
