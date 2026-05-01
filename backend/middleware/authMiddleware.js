const jwt = require("jsonwebtoken");

/**
 * protect
 * ────────
 * JWT verification middleware.
 * Expects:  Authorization: Bearer <token>
 * Attaches: req.user = { userId, role }
 *
 * Usage:
 *   router.get("/me", protect, someController);
 */
const protect = (req, res, next) => {
  // ── 1. Extract token from Authorization header ───────────
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Access denied. No token provided.",
    });
  }

  const token = authHeader.split(" ")[1];

  // ── 2. Verify token ──────────────────────────────────────
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { userId, role, iat, exp }
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please log in again.",
      });
    }
    return res.status(401).json({
      success: false,
      message: "Invalid token. Please log in again.",
    });
  }
};

/**
 * requireRole
 * ────────────
 * Role-based access guard. Must be used after `protect`.
 *
 * Usage:
 *   router.post("/upload", protect, requireRole("owner"), uploadController);
 *   router.get("/datasets", protect, requireRole("owner", "researcher"), listController);
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. This route requires role: ${roles.join(" or ")}`,
      });
    }
    next();
  };
};

module.exports = { protect, requireRole };
