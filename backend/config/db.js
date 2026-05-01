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
      // Mongoose 7+ no longer needs these flags, but they are harmless
      // and make intent explicit for readers on older docs.
    });

    console.log(`✅  MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`❌  MongoDB connection error: ${err.message}`);
    process.exit(1); // Crash fast — don't silently run without DB
  }
};

module.exports = connectDB;
