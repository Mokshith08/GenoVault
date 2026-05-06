/**
 * AccessRequest.js
 * ────────────────
 * Tracks researcher requests to access a specific genomic file,
 * and the owner's approval/denial decision.
 *
 * Lifecycle:
 *   pending  → approved | denied
 *   approved → access is granted for ACCESS_GRANT_HOURS (default 24h)
 */

const mongoose = require("mongoose");

const accessRequestSchema = new mongoose.Schema(
  {
    // The file being requested
    file: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GenomicFile",
      required: true,
      index: true,
    },

    // The researcher who sent the request
    researcher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // The data owner who owns the file (denormalized for fast queries)
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Optional reason provided by the researcher
    reason: {
      type: String,
      trim: true,
      maxlength: [1000, "Reason cannot exceed 1000 characters"],
      default: "",
    },

    // Workflow status
    status: {
      type: String,
      enum: ["pending", "approved", "denied"],
      default: "pending",
      index: true,
    },

    // When the owner approved (null until approved)
    approvedAt: {
      type: Date,
      default: null,
    },

    // When access expires (set on approval = approvedAt + ACCESS_GRANT_HOURS)
    accessExpiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate pending requests (one active request per researcher-file pair)
accessRequestSchema.index({ file: 1, researcher: 1 }, { unique: true });

// Fast lookup of all requests for a specific file
accessRequestSchema.index({ file: 1, status: 1 });

// Fast lookup of all requests sent by a specific researcher
accessRequestSchema.index({ researcher: 1, status: 1 });

module.exports = mongoose.model("AccessRequest", accessRequestSchema);
