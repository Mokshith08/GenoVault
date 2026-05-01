const mongoose = require("mongoose");

/**
 * OTPSchema
 * Stores a one-time password for a user with a TTL expiry.
 * MongoDB automatically deletes expired documents via the `expireAfterSeconds` index.
 */
const otpSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  email: {
    type: String,
    required: true,
    lowercase: true,
  },

  code: {
    type: String,
    required: true, // 6-digit string
  },

  purpose: {
    type: String,
    enum: ["login", "register", "reset"],
    default: "login",
  },

  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600, // Auto-deleted after 10 minutes (600 seconds)
  },
});

// One active OTP per user per purpose
otpSchema.index({ userId: 1, purpose: 1 });

module.exports = mongoose.model("OTP", otpSchema);
