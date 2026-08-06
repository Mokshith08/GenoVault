const mongoose = require("mongoose");

/**
 * connectDB
 * Establishes a connection to MongoDB using the URI from .env.
 * Exits the process if the connection fails so the server never
 * starts in a broken state.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,  // fail fast instead of buffering 30s
    });

    console.log(`✅  MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`❌  MongoDB connection error: ${err.message}`);
    if (err.message.includes("ECONNREFUSED") || err.message.includes("timed out") || err.message.includes("whitelist")) {
      console.error("💡  Fix: Go to MongoDB Atlas → Security → Network Access → Add your current IP address.");
      console.error("💡  Or allow all IPs (0.0.0.0/0) for development.");
    }
    process.exit(1); // Crash fast — don't silently run without DB
  }
};

module.exports = connectDB;
