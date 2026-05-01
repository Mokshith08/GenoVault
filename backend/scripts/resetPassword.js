/**
 * resetPassword.js
 * One-time utility: Re-hash and update a user's password in MongoDB.
 * 
 * Usage:
 *   node scripts/resetPassword.js <email> <newPassword>
 * 
 * Example:
 *   node scripts/resetPassword.js createdemo09@gmail.com MyNewPass123
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const [,, email, newPassword] = process.argv;

if (!email || !newPassword) {
  console.error("Usage: node scripts/resetPassword.js <email> <newPassword>");
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 10;
    const hashed = await bcrypt.hash(newPassword, saltRounds);

    const result = await User.updateOne(
      { email: email.toLowerCase() },
      { $set: { password: hashed } }
    );

    if (result.matchedCount === 0) {
      console.error(`❌ No user found with email: ${email}`);
    } else {
      console.log(`✅ Password updated successfully for: ${email}`);
      console.log(`   Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
})();
