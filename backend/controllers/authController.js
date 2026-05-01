const jwt = require("jsonwebtoken");
const User = require("../models/User");

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

    // ── 4. Respond (no token on register — force explicit login) ──
    return res.status(201).json({
      success: true,
      message: "Account created successfully. Please log in.",
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

    // ── 6. Respond ───────────────────────────────────────────
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        pinSet: user.pinSet,
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
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        pinSet: user.pinSet,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
      },
    });
  } catch (err) {
    console.error("[getMe]", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = { register, login, getMe };
