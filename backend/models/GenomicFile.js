const mongoose = require("mongoose");

/**
 * GenomicFile
 * ───────────
 * Persists the metadata for every successfully uploaded genomic file.
 * The actual file bytes live in Azure Blob Storage (primary) and
 * Filebase/IPFS (backup). This document is the authoritative index.
 */
const genomicFileSchema = new mongoose.Schema(
  {
    // ── Ownership ──────────────────────────────────────────────
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // ── File identity ──────────────────────────────────────────
    originalName: {
      type: String,
      required: true,
      trim: true,
    },

    storedName: {
      type: String,   // timestamp + uuid + ext (safe name used in blob storage)
      required: true,
    },

    extension: {
      type: String,
      enum: [".fastq", ".bam", ".vcf"],
      required: true,
    },

    sizeBytes: {
      type: Number,
      required: true,
    },

    mimeType: {
      type: String,
    },

    // ── Azure Blob Storage (primary) ───────────────────────────
    azureBlobName: {
      type: String,
      required: true,
    },

    azureContainerName: {
      type: String,
      required: true,
    },

    cloudUrl: {
      type: String,
      required: true,
    },

    // ── IPFS / Filebase (backup) ───────────────────────────────
    ipfsCid: {
      type: String,
      default: null,
    },

    ipfsUrl: {
      type: String,
      default: null,
    },

    ipfsStatus: {
      type: String,
      enum: ["pending", "uploading", "done", "failed"],
      default: "pending",
    },

    // ── Encryption (AES-256-CBC) ───────────────────────────────
    // The AES key is stored in Azure Key Vault (never here).
    // The IV is NOT secret — it is safe to store in MongoDB.
    isEncrypted: {
      type: Boolean,
      default: false,
    },

    encryptionIv: {
      type: String, // 32-char hex (16 bytes)
      default: null,
      select: false, // Not returned by default — only fetched during decryption
    },

    // ── Upload metadata ────────────────────────────────────────
    uploadStatus: {
      type: String,
      enum: ["confirmed", "deleted"],
      default: "confirmed",
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
  },
  {
    timestamps: true,
  }
);

// Index for fast owner-based listing
genomicFileSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model("GenomicFile", genomicFileSchema);
