/**
 * encryptionService.js
 * ────────────────────
 * Pure AES-256-CBC utility — encrypt and decrypt Buffer/streams.
 *
 * Design decisions:
 *  • AES-256-CBC: industry-standard, Node.js native (no 3rd-party dep)
 *  • Key is NEVER persisted here — passed in from Azure Key Vault at call time
 *  • IV is random per-file (16 bytes), stored in MongoDB (not a secret)
 *  • Returns Buffer — callers decide how to handle (stream, blob upload, etc.)
 */

const crypto = require("crypto");

const ALGORITHM = "aes-256-cbc";
const KEY_BYTES = 32; // AES-256 → 32 byte key
const IV_BYTES  = 16; // AES-CBC  → 16 byte IV

/**
 * generateKey
 * ───────────
 * Generates a cryptographically secure 32-byte AES-256 key.
 * Returns a hex string (64 chars) — safe to store in Azure Key Vault.
 *
 * @returns {string} 64-char hex string
 */
const generateKey = () => crypto.randomBytes(KEY_BYTES).toString("hex");

/**
 * generateIV
 * ──────────
 * Generates a random 16-byte IV for CBC mode.
 * The IV is NOT secret — it is stored alongside file metadata in MongoDB.
 *
 * @returns {string} 32-char hex string
 */
const generateIV = () => crypto.randomBytes(IV_BYTES).toString("hex");

/**
 * encryptBuffer
 * ─────────────
 * Encrypts a Buffer using AES-256-CBC.
 *
 * @param {Buffer} plainBuffer  - Raw file bytes
 * @param {string} keyHex       - 64-char hex AES key (from Key Vault)
 * @param {string} ivHex        - 32-char hex IV
 * @returns {Buffer}            - Encrypted bytes
 */
const encryptBuffer = (plainBuffer, keyHex, ivHex) => {
  const key    = Buffer.from(keyHex, "hex");
  const iv     = Buffer.from(ivHex,  "hex");
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  return Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
};

/**
 * decryptBuffer
 * ─────────────
 * Decrypts a Buffer using AES-256-CBC.
 * Called ONLY on-demand — decrypted bytes are never persisted.
 *
 * @param {Buffer} encryptedBuffer - Encrypted file bytes
 * @param {string} keyHex          - 64-char hex AES key (from Key Vault)
 * @param {string} ivHex           - 32-char hex IV (from MongoDB)
 * @returns {Buffer}               - Decrypted (plain) bytes
 */
const decryptBuffer = (encryptedBuffer, keyHex, ivHex) => {
  const key      = Buffer.from(keyHex, "hex");
  const iv       = Buffer.from(ivHex,  "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
};

/**
 * streamToBuffer
 * ──────────────
 * Convenience helper: converts a Node.js Readable stream into a Buffer.
 * Used to download Azure blob bytes before decryption.
 *
 * @param {NodeJS.ReadableStream} stream
 * @returns {Promise<Buffer>}
 */
const streamToBuffer = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data",  (chunk) => chunks.push(chunk));
    stream.on("end",   ()      => resolve(Buffer.concat(chunks)));
    stream.on("error", (err)   => reject(err));
  });

module.exports = {
  generateKey,
  generateIV,
  encryptBuffer,
  decryptBuffer,
  streamToBuffer,
};
