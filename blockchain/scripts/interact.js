/**
 * interact.js
 * ───────────
 * Standalone script to manually interact with the deployed GenomicRegistry
 * contract. Use this to test storeRecord and getRecord without the full
 * backend server.
 *
 * Usage:
 *   node scripts/interact.js
 *
 * Reads deployment info from: deployments/local.json
 */

const { ethers } = require("ethers");
const crypto     = require("crypto");
const fs         = require("fs");
const path       = require("path");

const RPC_URL     = "http://127.0.0.1:8545";
// Hardhat account #0 private key (well-known test key — never use in production)
const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
  // ── Connect ─────────────────────────────────────────────────────────────
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  // ── Load deployment ──────────────────────────────────────────────────────
  const deploymentFile = path.join(__dirname, "../deployments/local.json");
  if (!fs.existsSync(deploymentFile)) {
    console.error("❌  No deployment found. Run: npx hardhat run scripts/deploy.js --network localhost");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const registry   = new ethers.Contract(deployment.contractAddress, deployment.abi, wallet);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  GenoVault — GenomicRegistry Interaction Demo");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Contract: ${deployment.contractAddress}`);
  console.log(`  Wallet:   ${wallet.address}\n`);

  // ── Step 1: Read initial state ───────────────────────────────────────────
  let total = await registry.totalRecords();
  console.log(`📊  Total records before: ${total.toString()}`);

  // ── Step 2: Generate a SHA-256 hash (simulating a genomic file) ──────────
  const mockFileContent = `GENOMIC_DATA_${Date.now()}_SAMPLE_SEQUENCE_ACGTACGT`;
  const sha256hex       = crypto.createHash("sha256").update(mockFileContent).digest("hex");
  const sha256bytes32   = "0x" + sha256hex; // Convert to bytes32 hex format
  const fileName        = `sample_genome_${Date.now()}.fastq`;

  console.log(`\n🧬  Simulated file: ${fileName}`);
  console.log(`    SHA-256 hex:    ${sha256hex}`);
  console.log(`    bytes32 value:  ${sha256bytes32}`);

  // ── Step 3: Store the record on-chain ────────────────────────────────────
  console.log("\n⏳  Sending storeRecord() transaction...");

  const tx = await registry.storeRecord(sha256bytes32, fileName);
  console.log(`    Tx hash: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`    ✅  Confirmed in block #${receipt.blockNumber}`);
  console.log(`    ⛽  Gas used: ${receipt.gasUsed.toString()}`);

  // Parse the emitted event
  const iface = registry.interface;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({ topics: log.topics, data: log.data });
      if (parsed?.name === "RecordStored") {
        console.log("\n    📢  Event RecordStored:");
        console.log(`        fileHash:  ${parsed.args.fileHash}`);
        console.log(`        owner:     ${parsed.args.owner}`);
        console.log(`        timestamp: ${new Date(Number(parsed.args.timestamp) * 1000).toISOString()}`);
        console.log(`        fileName:  ${parsed.args.fileName}`);
      }
    } catch { /* skip */ }
  }

  // ── Step 4: Verify the record exists ────────────────────────────────────
  console.log("\n🔍  Verifying record...");
  const verified = await registry.verifyRecord(sha256bytes32);
  console.log(`    verifyRecord() → ${verified ? "✅ EXISTS" : "❌ NOT FOUND"}`);

  // ── Step 5: Retrieve the full record ────────────────────────────────────
  console.log("\n📋  Retrieving full record...");
  const record = await registry.getRecord(sha256bytes32);

  console.log("    GenomicRecord {");
  console.log(`      fileHash:  ${record.fileHash}`);
  console.log(`      owner:     ${record.owner}`);
  console.log(`      timestamp: ${new Date(Number(record.timestamp) * 1000).toISOString()}`);
  console.log(`      fileName:  ${record.fileName}`);
  console.log(`      exists:    ${record.exists}`);
  console.log("    }");

  // ── Step 6: Check owner's record count ──────────────────────────────────
  const count = await registry.getOwnerRecordCount(wallet.address);
  console.log(`\n👛  Records owned by ${wallet.address}: ${count.toString()}`);

  // ── Step 7: Read updated total ───────────────────────────────────────────
  total = await registry.totalRecords();
  console.log(`\n📊  Total records after: ${total.toString()}`);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ✅  Interaction complete. Run blockExplorer.js to see the");
  console.log("      transaction in context.");
  console.log("═══════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("\n❌  Interaction failed:", err.message);
  process.exit(1);
});
