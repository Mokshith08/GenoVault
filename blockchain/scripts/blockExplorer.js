/**
 * blockExplorer.js
 * ────────────────
 * A terminal-based blockchain explorer for the local Hardhat network.
 *
 * Shows:
 *   • Latest N blocks with transaction counts
 *   • Transaction details within each block
 *   • Decoded contract events (RecordStored, RecordVerified)
 *   • GenomicRegistry contract state (total records, individual lookups)
 *
 * Usage:
 *   1. Start the Hardhat node:  npx hardhat node
 *   2. Deploy the contract:     npx hardhat run scripts/deploy.js --network localhost
 *   3. Run the explorer:        node scripts/blockExplorer.js
 *
 * Options (set via env vars):
 *   BLOCKS_TO_SHOW=10     — how many recent blocks to display (default: 10)
 *   RPC_URL=http://...    — Hardhat RPC URL (default: http://127.0.0.1:8545)
 */

const { ethers } = require("ethers");
const fs         = require("fs");
const path       = require("path");

// ── Configuration ─────────────────────────────────────────────────────────
const RPC_URL       = process.env.RPC_URL     || "http://127.0.0.1:8545";
const BLOCKS_TO_SHOW = parseInt(process.env.BLOCKS_TO_SHOW) || 10;

// Load deployment info
const DEPLOYMENT_FILE = path.join(__dirname, "../deployments/local.json");

// ── Helpers ───────────────────────────────────────────────────────────────

const SEP  = "─".repeat(72);
const SEP2 = "═".repeat(72);

function formatTimestamp(ts) {
  return new Date(Number(ts) * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function shortHash(hash, len = 10) {
  if (!hash) return "N/A";
  return hash.slice(0, len) + "…" + hash.slice(-6);
}

function formatEth(wei) {
  return ethers.formatEther(wei) + " ETH";
}

// ── Main Explorer ─────────────────────────────────────────────────────────

async function main() {
  // Connect to local Hardhat node
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  let network;
  try {
    network = await provider.getNetwork();
  } catch {
    console.error(`\n❌  Cannot connect to Ethereum node at ${RPC_URL}`);
    console.error("    Make sure the Hardhat node is running: npx hardhat node\n");
    process.exit(1);
  }

  const latestBlock = await provider.getBlockNumber();

  // ── Header ─────────────────────────────────────────────────────────────
  console.log("\n" + SEP2);
  console.log("  🔗  GenoVault Local Blockchain Explorer");
  console.log(SEP2);
  console.log(`  RPC:          ${RPC_URL}`);
  console.log(`  Network:      ${network.name} (chainId: ${network.chainId})`);
  console.log(`  Latest Block: #${latestBlock}`);
  console.log(`  Showing:      Last ${BLOCKS_TO_SHOW} blocks`);
  console.log(SEP2 + "\n");

  // ── Load contract (if deployed) ────────────────────────────────────────
  let registry = null;
  let contractAbi = null;
  let contractAddress = null;

  if (fs.existsSync(DEPLOYMENT_FILE)) {
    const deployment = JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf8"));
    contractAddress  = deployment.contractAddress;
    contractAbi      = deployment.abi;

    try {
      registry = new ethers.Contract(contractAddress, contractAbi, provider);
      const totalRecords = await registry.totalRecords();

      console.log("📋  Contract: GenomicRegistry");
      console.log(`    Address:       ${contractAddress}`);
      console.log(`    Total Records: ${totalRecords.toString()}`);
      console.log(`    Deployed:      ${deployment.deployedAt}`);
      console.log(`    Deployer:      ${deployment.deployerAddress}`);
      console.log("");
    } catch (err) {
      console.log("⚠️   Contract deployed but node may have restarted (state reset)");
      console.log(`    Contract address: ${contractAddress}\n`);
    }
  } else {
    console.log("ℹ️   No deployment found. Run: npx hardhat run scripts/deploy.js --network localhost\n");
  }

  // ── Block Scan ─────────────────────────────────────────────────────────
  const fromBlock = Math.max(0, latestBlock - BLOCKS_TO_SHOW + 1);

  console.log(SEP);
  console.log(`  📦  BLOCKS  (${fromBlock} → ${latestBlock})`);
  console.log(SEP);

  for (let blockNum = fromBlock; blockNum <= latestBlock; blockNum++) {
    const block = await provider.getBlock(blockNum, true); // true = include txs

    if (!block) continue;

    const txCount = block.transactions ? block.transactions.length : 0;
    const ts      = formatTimestamp(block.timestamp);

    console.log(`\n  Block #${block.number}  [${ts}]`);
    console.log(`    Hash:       ${block.hash}`);
    console.log(`    Parent:     ${shortHash(block.parentHash)}`);
    console.log(`    Miner:      ${block.miner}`);
    console.log(`    Gas Used:   ${block.gasUsed.toString()} / ${block.gasLimit.toString()}`);
    console.log(`    Tx Count:   ${txCount}`);

    if (txCount === 0) {
      console.log("    Transactions: (none)");
      continue;
    }

    // ── Transaction details within the block ─────────────────────────────
    console.log("    Transactions:");
    for (const txHash of block.transactions) {
      const tx      = await provider.getTransaction(txHash);
      const receipt = await provider.getTransactionReceipt(txHash);

      if (!tx || !receipt) continue;

      const isContractDeploy = tx.to === null;
      const isContractCall   = contractAddress && tx.to?.toLowerCase() === contractAddress.toLowerCase();

      let txType = "ETH Transfer";
      if (isContractDeploy) txType = "Contract Deploy";
      else if (isContractCall) txType = "Contract Call ✨";

      console.log(`\n      📄 Tx: ${tx.hash}`);
      console.log(`         Type:    ${txType}`);
      console.log(`         From:    ${tx.from}`);
      console.log(`         To:      ${tx.to || "(contract creation)"}`);
      console.log(`         Value:   ${formatEth(tx.value)}`);
      console.log(`         Gas:     ${receipt.gasUsed.toString()} used`);
      console.log(`         Status:  ${receipt.status === 1 ? "✅ Success" : "❌ Failed"}`);

      // ── Decode contract events ───────────────────────────────────────
      if (isContractCall && registry && receipt.logs.length > 0) {
        const iface = registry.interface;
        for (const log of receipt.logs) {
          try {
            const parsed = iface.parseLog({ topics: log.topics, data: log.data });
            if (!parsed) continue;

            console.log(`\n         📢 Event: ${parsed.name}`);
            for (const [key, val] of Object.entries(parsed.args)) {
              if (isNaN(Number(key))) {
                // Named arg
                const display = typeof val === "bigint" ? val.toString() : val;
                console.log(`              ${key}: ${display}`);
              }
            }
          } catch { /* unknown event */ }
        }
      }

      // Decode deploy event — show the contract address created
      if (isContractDeploy && receipt.contractAddress) {
        console.log(`         Created: ${receipt.contractAddress}`);
      }
    }
  }

  // ── Contract State Dump ────────────────────────────────────────────────
  if (registry) {
    console.log("\n" + SEP);
    console.log("  📊  CONTRACT STATE — GenomicRegistry");
    console.log(SEP);

    try {
      const total = await registry.totalRecords();
      console.log(`\n  Total Records on-chain: ${total.toString()}`);

      if (total > 0n) {
        // Get all RecordStored events to enumerate records
        const filter    = registry.filters.RecordStored();
        const fromBlk   = 0;
        const toBlk     = "latest";
        const events    = await registry.queryFilter(filter, fromBlk, toBlk);

        console.log(`\n  Records (from events):`);
        for (const evt of events) {
          const { fileHash, owner, timestamp, fileName } = evt.args;
          console.log("\n  ┌─ GenomicRecord");
          console.log(`  │  fileHash:  ${fileHash}`);
          console.log(`  │  owner:     ${owner}`);
          console.log(`  │  fileName:  ${fileName}`);
          console.log(`  │  timestamp: ${formatTimestamp(timestamp)} (${timestamp.toString()})`);
          console.log(`  │  txHash:    ${evt.transactionHash}`);
          console.log(`  └─ block:     #${evt.blockNumber}`);
        }
      }
    } catch (err) {
      console.log("  ⚠️  Could not read contract state:", err.message);
    }
  }

  // ── Account Balances (first 3 Hardhat default accounts) ────────────────
  console.log("\n" + SEP);
  console.log("  💰  DEFAULT ACCOUNT BALANCES (Hardhat test accounts)");
  console.log(SEP);

  const defaultAccounts = [
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  ];

  for (const addr of defaultAccounts) {
    const balance = await provider.getBalance(addr);
    console.log(`  ${addr}  ${formatEth(balance)}`);
  }

  console.log("\n" + SEP2 + "\n");
  console.log("  ✅  Explorer scan complete.");
  console.log("  💡  Tip: Run `node scripts/blockExplorer.js` after each deployment");
  console.log("           or interaction to see updated blockchain state.\n");
}

main().catch((err) => {
  console.error("\n❌  Explorer error:", err.message);
  process.exit(1);
});
