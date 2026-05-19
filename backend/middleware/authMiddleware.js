const jwt = require("jsonwebtoken");

/**
 * protect
 * ────────
 * JWT verification middleware.
 *
 * Token is read from (in priority order):
 *   1. httpOnly cookie  "gv_token"         ← preferred (XSS-safe)
 *   2. Authorization header  "Bearer <token>" ← fallback for API clients / mobile
 *
 * Attaches: req.user = { userId, role }
 */
const protect = (req, res, next) => {
  // ── 1. Extract token ─────────────────────────────────────────────────────
  let token = null;

  // Priority 1: httpOnly cookie (set by the backend on login — JS cannot read it)
  if (req.cookies && req.cookies.gv_token) {
    token = req.cookies.gv_token;
  }

  // Priority 2: Authorization header (fallback — frontend in-memory token)
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access denied. No token provided.",
    });
  }

  // ── 2. Verify token ──────────────────────────────────────────────────────
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
