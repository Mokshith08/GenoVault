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

    // Security PIN (6-digit, stored as bcrypt hash)
    pin: {
      type: String,
      select: false,
    },

    // Whether the user has set up their PIN
    pinSet: {
      type: Boolean,
      default: false,
    },

    // Timestamps for record-keeping
    lastLogin: {
      type: Date,
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
   Instance method: Compare a plain-text PIN with the stored hash
───────────────────────────────────────────────────────────── */
userSchema.methods.comparePin = async function (candidatePin) {
  if (!this.pin) return false;
  return bcrypt.compare(candidatePin, this.pin);
};

/* ─────────────────────────────────────────────────────────────
   Transform: Remove sensitive fields when converting to JSON
   (e.g., when sending user object in API responses)
───────────────────────────────────────────────────────────── */
userSchema.set("toJSON", {
  transform: (_, ret) => {
    delete ret.password;
    delete ret.pin;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
