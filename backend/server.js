require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");

// ── Route imports ────────────────────────────────────────────
const authRoutes = require("./routes/authRoutes");
const otpRoutes  = require("./routes/otpRoutes");
const fileRoutes = require("./routes/fileRoutes");


// ─────────────────────────────────────────────────────────────
const app = express();

// ── 1. Connect to MongoDB + Azure bootstrap ──────────────────
connectDB();

// Ensure Azure Blob container exists + CORS configured on startup (non-blocking)
const { ensureContainerExists, configureCors } = require("./services/azureService");
ensureContainerExists().catch(() => {});
configureCors().catch(() => {}); // Critical for fast browser-direct uploads

// ── 2. Security middleware ────────────────────────────────────
app.use(helmet()); // Sets secure HTTP headers

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:8080",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ── 3. Rate limiting (applies to all /api/* routes) ──────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,                  // Max 100 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests from this IP. Please try again in 15 minutes.",
  },
});

// Stricter limiter for auth endpoints (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again in 15 minutes.",
  },
});

// MFA verify limiter – TOTP codes are 6-digit; must be very strict
const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Only 5 TOTP verify attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many MFA verification attempts. Please try again in 15 minutes.",
  },
});

// ── 4. Body parsers ───────────────────────────────────────────
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

// ── 5. Request logging (dev only) ─────────────────────────────
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// ── 6. Apply rate limiters ────────────────────────────────────
app.use("/api/", apiLimiter);
app.use("/api/auth/login",      authLimiter);
app.use("/api/auth/register",   authLimiter);
app.use("/api/auth/verify-mfa", mfaLimiter); // Strict – brute-force guard

// ── 7. Routes ─────────────────────────────────────────────────
app.use("/api/auth",  authRoutes);
app.use("/api/otp",   otpRoutes);
app.use("/api/files", fileRoutes);

// Health check (useful for deployment / monitoring)
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "GenoVault API is running",
    timestamp: new Date().toISOString(),
    // Note: environment is intentionally omitted to avoid information disclosure
  });
});

// ── 8. 404 handler ────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ── 9. Global error handler ───────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[Global Error]", err);

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// ── 10. Start server ──────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀  GenoVault API running on http://localhost:${PORT}`);
  console.log(`📌  Environment: ${process.env.NODE_ENV}`);
});

module.exports = app; // Export for testing
