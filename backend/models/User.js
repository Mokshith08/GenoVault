const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/**
 * UserSchema
 * Core identity document for GenoVault.
 *
 * Roles:
 *   "owner"      – Data Owner: uploads & controls access to genomic datasets
 *   "researcher" – Researcher: browses datasets and requests access
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [100, "Name cannot exceed 100 characters"],
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // Never returned in queries by default — must explicitly select
    },

    role: {
      type: String,
      enum: {
        values: ["owner", "researcher"],
        message: 'Role must be either "owner" or "researcher"',
      },
      required: [true, "Role is required"],
    },

    // Whether the user has set up their PIN
    // The bcrypt hash of the PIN is stored in Azure Key Vault (NOT here)
    pinSet: {
      type: Boolean,
      default: false,
    },

    // TOTP MFA – the raw base32 secret is never returned by default
    mfa_secret: {
      type: String,
      select: false,
    },

    // True only after the user successfully verifies their first TOTP code
    mfa_enabled: {
      type: Boolean,
      default: false,
    },

    // Timestamps for record-keeping
    lastLogin: {
      type: Date,
    },

    // Researcher-only: professional profile (filled on first login popup)
    profileCompleted: {
      type: Boolean,
      default: false,
    },

    researcherProfile: {
      institution:    { type: String, trim: true },
      department:     { type: String, trim: true },
      designation:    { type: String, trim: true },     // e.g. PhD Scholar, Associate Prof
      researchArea:   { type: String, trim: true },     // e.g. Genomics, Oncology
      experience:     { type: String, trim: true },     // years of experience
      country:        { type: String, trim: true },
      phone:          { type: String, trim: true },
      linkedIn:       { type: String, trim: true },
      orcid:          { type: String, trim: true },     // e.g. 0000-0002-1825-0097
      bio:            { type: String, trim: true, maxlength: 500 },
      purpose:        { type: String, trim: true, maxlength: 500 }, // why they need access
    },
  },
  {
    timestamps: true, // Adds createdAt & updatedAt automatically
  }
);

/* ─────────────────────────────────────────────────────────────
   Pre-save hook: Hash password before storing
   Only runs when the password field is actually modified
───────────────────────────────────────────────────────────── */
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
  this.password = await bcrypt.hash(this.password, saltRounds);
});

/* ─────────────────────────────────────────────────────────────
   Instance method: Compare a plain-text password with the stored hash
───────────────────────────────────────────────────────────── */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};


/* ─────────────────────────────────────────────────────────────
   Transform: Remove sensitive fields when converting to JSON
   (e.g., when sending user object in API responses)
───────────────────────────────────────────────────────────── */
userSchema.set("toJSON", {
  transform: (_, ret) => {
    delete ret.password;
    delete ret.mfa_secret; // Never expose raw TOTP secret
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
