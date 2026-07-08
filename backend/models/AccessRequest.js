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
      enum: ["pending", "approved", "denied", "rejected", "revoked"],
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

    // ── Blockchain receipt fields (populated after each tx) ────────────────
    // Request transaction (AccessRequested event)
    requestTxHash:         { type: String, default: null },
    requestBlockNumber:    { type: Number, default: null },
    requestGasUsed:        { type: String, default: null },
    requestTxStatus:       { type: String, default: null },
    requestEtherscanUrl:   { type: String, default: null },

    // Approval transaction (AccessApproved event)
    approveTxHash:         { type: String, default: null },
    approveBlockNumber:    { type: Number, default: null },
    approveGasUsed:        { type: String, default: null },
    approveTxStatus:       { type: String, default: null },
    approveEtherscanUrl:   { type: String, default: null },

    // Rejection transaction (AccessRejected event)
    rejectTxHash:          { type: String, default: null },
    rejectBlockNumber:     { type: Number, default: null },
    rejectGasUsed:         { type: String, default: null },
    rejectTxStatus:        { type: String, default: null },
    rejectEtherscanUrl:    { type: String, default: null },

    // Revocation transaction (AccessRevoked event)
    revokeTxHash:          { type: String, default: null },
    revokeBlockNumber:     { type: Number, default: null },
    revokeGasUsed:         { type: String, default: null },
    revokeTxStatus:        { type: String, default: null },
    revokeEtherscanUrl:    { type: String, default: null },
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
