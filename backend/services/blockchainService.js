/**
 * blockchainService.js
 * ────────────────────
 * Connects the GenoVault backend to the Ethereum Sepolia testnet and provides
 * all functions to interact with the GenomicDataRegistry smart contract.
 *
 * Contract: 0xFea226bbd2EbCAf90a6b1C3317F19b7A2EC98d0E (Sepolia — permanent)
 *
 * What's stored on-chain per file:
 *   1. File Hash (SHA-256)     — proof of integrity / tamper detection
 *   2. Owner Address           — Ethereum address that registered the file
 *   3. Upload Timestamp        — block.timestamp — permanent, immutable
 *   4. Storage Reference       — IPFS CID where encrypted file is backed up
 *   5. Access Permissions      — researcher, approved, expiryTime
 *   6. Audit Trail Events      — FileRegistered, AccessRequested, AccessApproved, AccessRevoked
 *
 * Required env vars (backend/.env):
 *   BLOCKCHAIN_RPC_URL              — Alchemy Sepolia HTTPS URL
 *   BLOCKCHAIN_CONTRACT_ADDRESS     — deployed GenomicDataRegistry address
 *   BLOCKCHAIN_DEPLOYER_PRIVATE_KEY — private key of the tx-signing wallet
 *   BLOCKCHAIN_CHAIN_ID             — 11155111 (Sepolia)
 *
 * Graceful degradation:
 *   If env vars are missing, every function logs a warning and returns a
 *   structured "disabled" response so the upload pipeline is NOT blocked.
 */

const { ethers } = require("ethers");
const fs         = require("fs");
const path       = require("path");

// ── Contract ABI — full interface for GenomicDataRegistry ──────────────────
const CONTRACT_ABI = [
  // ── Write functions ──────────────────────────────────────────────────────
  "function registerFile(string calldata fileHash, string calldata ipfsCID) external returns (uint256 fileId)",
  "function requestAccess(uint256 fileId) external",
  "function approveAccess(uint256 fileId, address researcher, uint256 durationSeconds) external",
  "function revokeAccess(uint256 fileId, address researcher) external",

  // ── Read functions ────────────────────────────────────────────────────────
  "function getFile(uint256 fileId) external view returns (tuple(string fileHash, address owner, uint256 timestamp, string ipfsCID, bool exists))",
  "function getFileByHash(string calldata fileHash) external view returns (uint256 fileId, tuple(string fileHash, address owner, uint256 timestamp, string ipfsCID, bool exists) record)",
  "function checkAccess(uint256 fileId, address researcher) external view returns (bool hasAccess, uint256 expiryTime)",
  "function getPermission(uint256 fileId, address researcher) external view returns (tuple(address researcher, bool approved, uint256 grantedAt, uint256 expiryTime))",
  "function getOwnerFiles(address owner) external view returns (uint256[])",
  "function getTotalRecords() external view returns (uint256)",

  // ── Events (Audit Trail) ──────────────────────────────────────────────────
  "event FileRegistered(uint256 indexed fileId, string fileHash, address indexed owner, string ipfsCID, uint256 timestamp)",
  "event AccessRequested(uint256 indexed fileId, address indexed researcher, uint256 requestedAt)",
  "event AccessApproved(uint256 indexed fileId, address indexed researcher, uint256 expiryTime, uint256 grantedAt)",
  "event AccessRevoked(uint256 indexed fileId, address indexed researcher, uint256 revokedAt)",
];

// ── Lazy-initialised singletons ────────────────────────────────────────────
let _provider      = null;
let _wallet        = null;
let _contract      = null;
let _readOnlyProv  = null;
let _readOnlyCtx   = null;

// ─────────────────────────────────────────────────────────────────────────────
// isBlockchainConfigured
// ─────────────────────────────────────────────────────────────────────────────

const isBlockchainConfigured = () =>
  Boolean(process.env.BLOCKCHAIN_RPC_URL) &&
  Boolean(process.env.BLOCKCHAIN_CONTRACT_ADDRESS) &&
  Boolean(process.env.BLOCKCHAIN_DEPLOYER_PRIVATE_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// getContract — write-capable (signed) contract instance
// ─────────────────────────────────────────────────────────────────────────────

const getContract = () => {
  if (_contract) return _contract;

  const rpcUrl     = process.env.BLOCKCHAIN_RPC_URL;
  const privateKey = process.env.BLOCKCHAIN_DEPLOYER_PRIVATE_KEY;
  const address    = process.env.BLOCKCHAIN_CONTRACT_ADDRESS;

  if (!rpcUrl || !privateKey || !address) {
    throw new Error("[Blockchain] Missing env vars: BLOCKCHAIN_RPC_URL, BLOCKCHAIN_CONTRACT_ADDRESS, BLOCKCHAIN_DEPLOYER_PRIVATE_KEY");
  }

  _provider = new ethers.JsonRpcProvider(rpcUrl);
  _wallet   = new ethers.Wallet(privateKey.trim(), _provider);
  _contract = new ethers.Contract(address, CONTRACT_ABI, _wallet);

  console.log(`[Blockchain] ✅ Connected to contract at ${address}`);
  return _contract;
};

// ─────────────────────────────────────────────────────────────────────────────
// getReadOnlyContract — for reads (no wallet, no gas)
// ─────────────────────────────────────────────────────────────────────────────

const getReadOnlyContract = () => {
  if (_readOnlyCtx) return _readOnlyCtx;

  const rpcUrl  = process.env.BLOCKCHAIN_RPC_URL;
  const address = process.env.BLOCKCHAIN_CONTRACT_ADDRESS;

  if (!rpcUrl || !address) throw new Error("[Blockchain] Missing RPC URL or contract address");

  _readOnlyProv = new ethers.JsonRpcProvider(rpcUrl);
  _readOnlyCtx  = new ethers.Contract(address, CONTRACT_ABI, _readOnlyProv);
  return _readOnlyCtx;
};

// ─────────────────────────────────────────────────────────────────────────────
// registerFileOnChain
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register a genomic file on the blockchain with its SHA-256 hash and IPFS CID.
 * Called by fileController.js after AES encryption + IPFS upload.
 *
 * @param {string} sha256HexHash  — 64-char hex SHA-256 (no 0x prefix)
 * @param {string} ipfsCID        — IPFS CID (or Azure path if IPFS not used)
 * @returns {Promise<object>}
 */
const registerFileOnChain = async (sha256HexHash, ipfsCID = "") => {
  if (!isBlockchainConfigured()) {
    console.warn("[Blockchain] ⚠️  Not configured — skipping on-chain registration");
    return { success: false, disabled: true, error: "Blockchain not configured" };
  }

  try {
    const contract = getContract();
    console.log(`[Blockchain] ⏳ Registering file: ${sha256HexHash.slice(0, 16)}… IPFS: ${ipfsCID || "none"}`);

    const tx      = await contract.registerFile(sha256HexHash, ipfsCID || "");
    console.log(`[Blockchain]    Tx: ${tx.hash}`);
    const receipt = await tx.wait(1);
    console.log(`[Blockchain] ✅ Confirmed in block #${receipt.blockNumber}`);

    // Extract fileId from FileRegistered event
    let fileId = null;
    const iface = contract.interface;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === "FileRegistered") {
          fileId = Number(parsed.args.fileId);
          console.log(`[Blockchain]    File ID: ${fileId}`);
        }
      } catch { /* skip unrecognised logs */ }
    }

    return {
      success:     true,
      fileId,
      txHash:      receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed:     receipt.gasUsed.toString(),
      disabled:    false,
      error:       null,
    };
  } catch (err) {
    if (err.message?.includes("HashAlreadyRegistered") || err.message?.includes("already registered")) {
      console.warn(`[Blockchain] ⚠️  Hash already on-chain: ${sha256HexHash.slice(0, 16)}…`);
      return { success: false, disabled: false, error: "Hash already registered on-chain" };
    }
    console.error("[Blockchain] ❌ registerFileOnChain failed:", err.message);
    return { success: false, disabled: false, error: err.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// storeFileHashOnChain  (alias kept for backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────

const storeFileHashOnChain = (sha256HexHash) => registerFileOnChain(sha256HexHash, "");

// ─────────────────────────────────────────────────────────────────────────────
// verifyFileHashOnChain
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify if a SHA-256 hash is registered on the blockchain.
 * Read-only — no gas cost.
 *
 * @param {string} sha256HexHash
 * @returns {Promise<object>}
 */
const verifyFileHashOnChain = async (sha256HexHash) => {
  if (!isBlockchainConfigured()) {
    return { verified: false, disabled: true, error: "Blockchain not configured" };
  }

  try {
    const contract              = getReadOnlyContract();
    const [fileId, record]      = await contract.getFileByHash(sha256HexHash);

    if (Number(fileId) === 0) {
      return { verified: false, fileId: null, disabled: false, error: null };
    }

    return {
      verified:    true,
      fileId:      Number(fileId),
      fileHash:    record.fileHash,
      owner:       record.owner,
      timestamp:   new Date(Number(record.timestamp) * 1000).toISOString(),
      ipfsCID:     record.ipfsCID,
      disabled:    false,
      error:       null,
    };
  } catch (err) {
    // "Hash not registered" is a normal case
    if (err.message?.includes("Hash not registered")) {
      return { verified: false, fileId: null, disabled: false, error: null };
    }
    console.error("[Blockchain] ❌ verifyFileHashOnChain failed:", err.message);
    return { verified: false, disabled: false, error: err.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// requestAccess
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A researcher requests access to a genomic file.
 * Emits AccessRequested event on the blockchain.
 *
 * @param {number} fileId
 * @returns {Promise<object>}
 */
const requestAccess = async (fileId) => {
  if (!isBlockchainConfigured()) return { success: false, disabled: true };

  try {
    const contract = getContract();
    const tx       = await contract.requestAccess(fileId);
    const receipt  = await tx.wait(1);
    console.log(`[Blockchain] ✅ AccessRequested for fileId=${fileId} in block #${receipt.blockNumber}`);
    return { success: true, txHash: receipt.hash, blockNumber: receipt.blockNumber, error: null };
  } catch (err) {
    console.error("[Blockchain] ❌ requestAccess failed:", err.message);
    return { success: false, error: err.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// approveAccess
// ─────────────────────────────────────────────────────────────────────────────

/**
 * File owner approves a researcher's access.
 * Emits AccessApproved event on the blockchain.
 *
 * @param {number} fileId
 * @param {string} researcherAddress  — 0x Ethereum address
 * @param {number} durationSeconds    — how long access is valid (e.g. 86400 = 1 day)
 * @returns {Promise<object>}
 */
const approveAccess = async (fileId, researcherAddress, durationSeconds = 86400) => {
  if (!isBlockchainConfigured()) return { success: false, disabled: true };

  try {
    const contract = getContract();
    const tx       = await contract.approveAccess(fileId, researcherAddress, durationSeconds);
    const receipt  = await tx.wait(1);
    const expiry   = new Date((Date.now() / 1000 + durationSeconds) * 1000).toISOString();
    console.log(`[Blockchain] ✅ AccessApproved fileId=${fileId} researcher=${researcherAddress} expires=${expiry}`);
    return { success: true, txHash: receipt.hash, blockNumber: receipt.blockNumber, expiresAt: expiry, error: null };
  } catch (err) {
    console.error("[Blockchain] ❌ approveAccess failed:", err.message);
    return { success: false, error: err.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// revokeAccess
// ─────────────────────────────────────────────────────────────────────────────

/**
 * File owner revokes a researcher's previously approved access.
 * Emits AccessRevoked event on the blockchain.
 *
 * @param {number} fileId
 * @param {string} researcherAddress
 * @returns {Promise<object>}
 */
const revokeAccess = async (fileId, researcherAddress) => {
  if (!isBlockchainConfigured()) return { success: false, disabled: true };

  try {
    const contract = getContract();
    const tx       = await contract.revokeAccess(fileId, researcherAddress);
    const receipt  = await tx.wait(1);
    console.log(`[Blockchain] ✅ AccessRevoked fileId=${fileId} researcher=${researcherAddress}`);
    return { success: true, txHash: receipt.hash, blockNumber: receipt.blockNumber, error: null };
  } catch (err) {
    console.error("[Blockchain] ❌ revokeAccess failed:", err.message);
    return { success: false, error: err.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// checkAccess
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check whether a researcher currently has valid access to a file.
 * Read-only — no gas cost.
 *
 * @param {number} fileId
 * @param {string} researcherAddress
 * @returns {Promise<{ hasAccess: boolean, expiresAt: string|null }>}
 */
const checkAccess = async (fileId, researcherAddress) => {
  if (!isBlockchainConfigured()) return { hasAccess: false, disabled: true };

  try {
    const contract               = getReadOnlyContract();
    const [hasAccess, expiryBig] = await contract.checkAccess(fileId, researcherAddress);
    return {
      hasAccess,
      expiresAt: hasAccess ? new Date(Number(expiryBig) * 1000).toISOString() : null,
      disabled:  false,
    };
  } catch (err) {
    console.error("[Blockchain] ❌ checkAccess failed:", err.message);
    return { hasAccess: false, error: err.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getAuditTrail
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns all blockchain events for a specific fileId as an audit trail.
 * Includes: registration, access requests, approvals, revocations.
 *
 * @param {number} fileId
 * @returns {Promise<Array>}
 */
const getAuditTrail = async (fileId) => {
  if (!isBlockchainConfigured()) return [];

  try {
    const contract = getReadOnlyContract();
    const events   = [];

    // FileRegistered
    const regFilter    = contract.filters.FileRegistered(fileId);
    const regEvents    = await contract.queryFilter(regFilter, 0, "latest");
    for (const evt of regEvents) {
      events.push({
        type:        "FileRegistered",
        fileId:      Number(evt.args.fileId),
        fileHash:    evt.args.fileHash,
        owner:       evt.args.owner,
        ipfsCID:     evt.args.ipfsCID,
        timestamp:   new Date(Number(evt.args.timestamp) * 1000).toISOString(),
        txHash:      evt.transactionHash,
        blockNumber: evt.blockNumber,
      });
    }

    // AccessRequested
    const reqFilter = contract.filters.AccessRequested(fileId);
    const reqEvents = await contract.queryFilter(reqFilter, 0, "latest");
    for (const evt of reqEvents) {
      events.push({
        type:        "AccessRequested",
        fileId:      Number(evt.args.fileId),
        researcher:  evt.args.researcher,
        requestedAt: new Date(Number(evt.args.requestedAt) * 1000).toISOString(),
        txHash:      evt.transactionHash,
        blockNumber: evt.blockNumber,
      });
    }

    // AccessApproved
    const apprFilter = contract.filters.AccessApproved(fileId);
    const apprEvents = await contract.queryFilter(apprFilter, 0, "latest");
    for (const evt of apprEvents) {
      events.push({
        type:        "AccessApproved",
        fileId:      Number(evt.args.fileId),
        researcher:  evt.args.researcher,
        expiryTime:  new Date(Number(evt.args.expiryTime) * 1000).toISOString(),
        grantedAt:   new Date(Number(evt.args.grantedAt) * 1000).toISOString(),
        txHash:      evt.transactionHash,
        blockNumber: evt.blockNumber,
      });
    }

    // AccessRevoked
    const revFilter = contract.filters.AccessRevoked(fileId);
    const revEvents = await contract.queryFilter(revFilter, 0, "latest");
    for (const evt of revEvents) {
      events.push({
        type:        "AccessRevoked",
        fileId:      Number(evt.args.fileId),
        researcher:  evt.args.researcher,
        revokedAt:   new Date(Number(evt.args.revokedAt) * 1000).toISOString(),
        txHash:      evt.transactionHash,
        blockNumber: evt.blockNumber,
      });
    }

    // Sort by block number ascending
    events.sort((a, b) => a.blockNumber - b.blockNumber);
    return events;
  } catch (err) {
    console.error("[Blockchain] ❌ getAuditTrail failed:", err.message);
    return [];
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getContractEvents  (all FileRegistered events — for dashboard)
// ─────────────────────────────────────────────────────────────────────────────

const getContractEvents = async () => {
  if (!isBlockchainConfigured()) return [];

  try {
    const contract = getReadOnlyContract();
    const filter   = contract.filters.FileRegistered();
    const events   = await contract.queryFilter(filter, 0, "latest");

    return events.map((evt) => ({
      fileId:      Number(evt.args.fileId),
      fileHash:    evt.args.fileHash,
      owner:       evt.args.owner,
      ipfsCID:     evt.args.ipfsCID,
      timestamp:   new Date(Number(evt.args.timestamp) * 1000).toISOString(),
      txHash:      evt.transactionHash,
      blockNumber: evt.blockNumber,
    }));
  } catch (err) {
    console.error("[Blockchain] ❌ getContractEvents failed:", err.message);
    return [];
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getBlockchainStatus
// ─────────────────────────────────────────────────────────────────────────────

const getBlockchainStatus = async () => {
  if (!isBlockchainConfigured()) {
    return {
      configured:      false,
      nodeOnline:      false,
      contractAddress: process.env.BLOCKCHAIN_CONTRACT_ADDRESS || null,
      network:         "Sepolia Testnet",
      chainId:         null,
      blockNumber:     null,
      totalRecords:    null,
    };
  }

  try {
    const rpcUrl   = process.env.BLOCKCHAIN_RPC_URL;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const [network, blockNumber] = await Promise.all([
      provider.getNetwork(),
      provider.getBlockNumber(),
    ]);
    const contract     = getReadOnlyContract();
    const totalRecords = await contract.getTotalRecords();

    return {
      configured:      true,
      nodeOnline:      true,
      contractAddress: process.env.BLOCKCHAIN_CONTRACT_ADDRESS,
      network:         "Sepolia Testnet",
      etherscanUrl:    `https://sepolia.etherscan.io/address/${process.env.BLOCKCHAIN_CONTRACT_ADDRESS}`,
      chainId:         Number(network.chainId),
      blockNumber,
      totalRecords:    Number(totalRecords),
    };
  } catch (err) {
    console.error("[Blockchain] ❌ getBlockchainStatus error:", err.message);
    return {
      configured:      true,
      nodeOnline:      false,
      contractAddress: process.env.BLOCKCHAIN_CONTRACT_ADDRESS || null,
      network:         "Sepolia Testnet",
      error:           err.message,
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// getRecentBlocks / getTransactionDetails  (blockchain explorer helpers)
// ─────────────────────────────────────────────────────────────────────────────

const getRecentBlocks = async (count = 10) => {
  const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
  const latest   = await provider.getBlockNumber();
  const from     = Math.max(0, latest - count + 1);
  const blocks   = [];

  for (let n = latest; n >= from; n--) {
    const block = await provider.getBlock(n, true);
    if (!block) continue;
    blocks.push({
      blockNumber:  block.number,
      hash:         block.hash,
      parentHash:   block.parentHash,
      timestamp:    new Date(Number(block.timestamp) * 1000).toISOString(),
      miner:        block.miner,
      gasUsed:      block.gasUsed.toString(),
      gasLimit:     block.gasLimit.toString(),
      txCount:      block.transactions.length,
      transactions: block.transactions.map((t) => (typeof t === "string" ? t : t.hash)),
    });
  }
  return blocks;
};

const getTransactionDetails = async (txHash) => {
  const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL);
  const [tx, receipt] = await Promise.all([
    provider.getTransaction(txHash),
    provider.getTransactionReceipt(txHash),
  ]);
  if (!tx || !receipt) return null;

  let decodedEvents = [];
  try {
    const iface = new ethers.Interface(CONTRACT_ABI);
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed) {
          const args = {};
          parsed.fragment.inputs.forEach((inp) => {
            const val = parsed.args[inp.name];
            args[inp.name] = typeof val === "bigint" ? val.toString() : val;
          });
          decodedEvents.push({ name: parsed.name, args });
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }

  return {
    hash:            tx.hash,
    from:            tx.from,
    to:              tx.to,
    value:           ethers.formatEther(tx.value),
    gasUsed:         receipt.gasUsed.toString(),
    gasPrice:        tx.gasPrice ? ethers.formatUnits(tx.gasPrice, "gwei") + " gwei" : null,
    blockNumber:     receipt.blockNumber,
    status:          receipt.status === 1 ? "success" : "failed",
    contractCreated: receipt.contractAddress || null,
    decodedEvents,
  };
};

// ── Public API ───────────────────────────────────────────────────────────────
module.exports = {
  isBlockchainConfigured,
  // File registration
  registerFileOnChain,
  storeFileHashOnChain,       // backward-compat alias
  verifyFileHashOnChain,
  // Access control
  requestAccess,
  approveAccess,
  revokeAccess,
  checkAccess,
  // Audit trail
  getAuditTrail,
  getContractEvents,
  // Status & explorer
  getBlockchainStatus,
  getRecentBlocks,
  getTransactionDetails,
};
