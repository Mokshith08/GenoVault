/**
 * keyVaultService.js
 * ──────────────────
 * Wraps Azure Key Vault Secrets API to store and retrieve
 * per-file AES-256 encryption keys.
 *
 * Architecture:
 *  • Each file gets a unique secret named "genovault-key-<fileId>"
 *  • The raw hex AES key is the secret VALUE
 *  • Secret is tagged with fileId for auditability
 *  • Keys are NEVER written to database, logs, or responses
 *
 * Prerequisites:
 *  • Azure Key Vault must be created in your subscription
 *  • App must have "Key Vault Secrets Officer" RBAC role, OR
 *    a Key Vault Access Policy granting get/set on secrets
 *  • Set env vars: AZURE_KEY_VAULT_URI, AZURE_CLIENT_ID,
 *    AZURE_CLIENT_SECRET, AZURE_TENANT_ID
 *
 * Fallback (dev/no-KV mode):
 *  • If AZURE_KEY_VAULT_URI is not set, keys are stored in-process memory
 *    (Map). This is safe ONLY for local development — NEVER use in prod.
 */

const { SecretClient }           = require("@azure/keyvault-secrets");
const { ClientSecretCredential } = require("@azure/identity");

// ── In-memory fallback for dev (never used in production) ───────
const _devStore = new Map();

/**
 * getSecretClient
 * ───────────────
 * Builds an authenticated Azure Key Vault SecretClient.
 * Uses Service Principal credentials from env vars.
 *
 * @returns {SecretClient}
 * @throws  {Error} if AZURE_KEY_VAULT_URI is not configured
 */
const getSecretClient = () => {
  const vaultUri     = process.env.AZURE_KEY_VAULT_URI;
  const tenantId     = process.env.AZURE_TENANT_ID;
  const clientId     = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!vaultUri) {
    throw new Error("AZURE_KEY_VAULT_URI is not configured");
  }

  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  return new SecretClient(vaultUri, credential);
};

/**
 * isKeyVaultConfigured
 * ─────────────────────
 * Returns true if all required Key Vault env vars are present.
 */
const isKeyVaultConfigured = () =>
  Boolean(
    process.env.AZURE_KEY_VAULT_URI &&
    process.env.AZURE_TENANT_ID     &&
    process.env.AZURE_CLIENT_ID     &&
    process.env.AZURE_CLIENT_SECRET
  );

/**
 * storeEncryptionKey
 * ──────────────────
 * Saves the AES-256 key for a file as a Key Vault secret.
 * Secret name format: "genovault-key-<fileId>"
 *
 * @param {string} fileId  - MongoDB ObjectId string (used as part of secret name)
 * @param {string} keyHex  - 64-char hex AES key
 * @returns {Promise<void>}
 */
const storeEncryptionKey = async (fileId, keyHex) => {
  const secretName = `genovault-key-${fileId}`;

  if (!isKeyVaultConfigured()) {
    // ── DEV fallback: in-memory ────────────────────────────────
    console.warn("[KeyVault] ⚠️  Key Vault not configured — using in-memory store (DEV ONLY)");
    _devStore.set(secretName, keyHex);
    return;
  }

  const client = getSecretClient();
  await client.setSecret(secretName, keyHex, {
    tags: {
      fileId,
      project: "GenoVault",
      purpose: "aes256-encryption-key",
    },
    contentType: "hex-aes256-key",
  });

  console.log(`[KeyVault] ✅ Stored key for file: ${fileId}`);
};

/**
 * retrieveEncryptionKey
 * ─────────────────────
 * Fetches the AES-256 key for a file from Key Vault.
 * This is called ONLY during the decryption (download) flow.
 * The key is used in-memory and never returned to the caller's caller.
 *
 * @param {string} fileId  - MongoDB ObjectId string
 * @returns {Promise<string>} keyHex — 64-char hex AES key
 * @throws  {Error} if secret not found
 */
const retrieveEncryptionKey = async (fileId) => {
  const secretName = `genovault-key-${fileId}`;

  if (!isKeyVaultConfigured()) {
    // ── DEV fallback ───────────────────────────────────────────
    const key = _devStore.get(secretName);
    if (!key) throw new Error(`[KeyVault] Key not found in dev store for file: ${fileId}`);
    return key;
  }

  const client = getSecretClient();
  const secret = await client.getSecret(secretName);

  if (!secret?.value) {
    throw new Error(`Encryption key not found in Key Vault for file: ${fileId}`);
  }

  console.log(`[KeyVault] 🔑 Retrieved key for file: ${fileId}`);
  return secret.value;
};

/**
 * deleteEncryptionKey
 * ───────────────────
 * Removes the key when a file is permanently deleted.
 * Key Vault soft-deletes by default (recoverable for 90 days).
 *
 * @param {string} fileId
 * @returns {Promise<void>}
 */
const deleteEncryptionKey = async (fileId) => {
  const secretName = `genovault-key-${fileId}`;

  if (!isKeyVaultConfigured()) {
    _devStore.delete(secretName);
    return;
  }

  try {
    const client = getSecretClient();
    await client.beginDeleteSecret(secretName);
    console.log(`[KeyVault] 🗑️  Deleted key for file: ${fileId}`);
  } catch (err) {
    // Non-fatal — log and continue (file already deleted from storage)
    console.warn(`[KeyVault] ⚠️  Could not delete key for ${fileId}:`, err.message);
  }
};

/**
 * storePinHash
 * ────────────
 * Saves the bcrypt hash of a user's 6-digit PIN to Azure Key Vault.
 * The raw PIN is NEVER stored — only the hash.
 * Secret name format: "genovault-pin-<userId>"
 *
 * @param {string} userId   - MongoDB User ObjectId string
 * @param {string} pinHash  - bcrypt hash of the 6-digit PIN
 * @returns {Promise<void>}
 */
const storePinHash = async (userId, pinHash) => {
  const secretName = `genovault-pin-${userId}`;

  if (!isKeyVaultConfigured()) {
    console.warn("[KeyVault] ⚠️  Key Vault not configured — storing PIN hash in memory (DEV ONLY)");
    _devStore.set(secretName, pinHash);
    return;
  }

  const client = getSecretClient();
  await client.setSecret(secretName, pinHash, {
    tags: {
      userId,
      project: "GenoVault",
      purpose: "bcrypt-pin-hash",
    },
    contentType: "bcrypt-hash",
  });

  console.log(`[KeyVault] ✅ Stored PIN hash for user: ${userId}`);
};

/**
 * retrievePinHash
 * ───────────────
 * Retrieves the bcrypt PIN hash for a user from Azure Key Vault.
 * Called only during PIN verification (\/api\/access\/verify-pin).
 *
 * @param {string} userId
 * @returns {Promise<string>} bcrypt hash string
 * @throws  {Error} if no PIN has been set
 */
const retrievePinHash = async (userId) => {
  const secretName = `genovault-pin-${userId}`;

  if (!isKeyVaultConfigured()) {
    const hash = _devStore.get(secretName);
    if (!hash) throw new Error(`No PIN set for user: ${userId}`);
    return hash;
  }

  const client = getSecretClient();
  const secret = await client.getSecret(secretName);

  if (!secret?.value) {
    throw new Error(`PIN not found in Key Vault for user: ${userId}`);
  }

  console.log(`[KeyVault] 🔑 Retrieved PIN hash for user: ${userId}`);
  return secret.value;
};

/**
 * deletePinHash
 * ─────────────
 * Removes the PIN hash from Key Vault (e.g. on account deletion).
 *
 * @param {string} userId
 * @returns {Promise<void>}
 */
const deletePinHash = async (userId) => {
  const secretName = `genovault-pin-${userId}`;

  if (!isKeyVaultConfigured()) {
    _devStore.delete(secretName);
    return;
  }

  try {
    const client = getSecretClient();
    await client.beginDeleteSecret(secretName);
    console.log(`[KeyVault] 🗑️  Deleted PIN hash for user: ${userId}`);
  } catch (err) {
    console.warn(`[KeyVault] ⚠️  Could not delete PIN for ${userId}:`, err.message);
  }
};

module.exports = {
  storeEncryptionKey,
  retrieveEncryptionKey,
  deleteEncryptionKey,
  storePinHash,
  retrievePinHash,
  deletePinHash,
  isKeyVaultConfigured,
};
