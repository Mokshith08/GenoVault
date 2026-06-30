/**
 * deployGenomicData.js
 * ────────────────────
 * Deploys the GenomicDataRegistry contract (string-hash interface version).
 * This is the contract wired into the GenoVault backend via blockchainService.js.
 *
 * Usage:
 *   Terminal 1:  npx hardhat node
 *   Terminal 2:  npx hardhat run scripts/deployGenomicData.js --network localhost
 *
 * After deployment, copy the printed contract address into backend/.env:
 *   BLOCKCHAIN_CONTRACT_ADDRESS=<printed address>
 */

const { ethers } = require("hardhat");
const fs         = require("fs");
const path       = require("path");

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  GenoVault — GenomicDataRegistry Contract Deployment");
  console.log("═══════════════════════════════════════════════════════════\n");

  const [deployer] = await ethers.getSigners();
  const network    = await ethers.provider.getNetwork();

  console.log("📡  Network:          ", network.name || "localhost");
  console.log("🔗  Chain ID:         ", network.chainId.toString());
  console.log("👛  Deployer address: ", deployer.address);

  const balanceBefore = await ethers.provider.getBalance(deployer.address);
  console.log("💰  Balance (before): ", ethers.formatEther(balanceBefore), "ETH\n");

  // ── Deploy ────────────────────────────────────────────────────────────────
  console.log("⏳  Deploying GenomicDataRegistry...");
  const Factory  = await ethers.getContractFactory("GenomicDataRegistry");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  const deployTx        = contract.deploymentTransaction();
  const receipt         = await deployTx.wait();

  console.log("\n✅  Contract deployed!");
  console.log("📋  Address:      ", contractAddress);
  console.log("📦  Block:        ", receipt.blockNumber);
  console.log("🔖  Tx hash:      ", receipt.hash);
  console.log("⛽  Gas used:     ", receipt.gasUsed.toString());

  const balanceAfter = await ethers.provider.getBalance(deployer.address);
  console.log("💸  Gas cost:     ", ethers.formatEther(balanceBefore - balanceAfter), "ETH\n");

  // ── Sanity check ─────────────────────────────────────────────────────────
  const total = await contract.getTotalRecords();
  console.log("📊  Total records (initial):", total.toString());

  // ── Save deployment info ──────────────────────────────────────────────────
  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/GenomicDataRegistry.sol/GenomicDataRegistry.json"
  );

  let abi = [];
  if (fs.existsSync(artifactPath)) {
    abi = JSON.parse(fs.readFileSync(artifactPath, "utf8")).abi;
  }

  const deploymentInfo = {
    contractName:    "GenomicDataRegistry",
    contractAddress: contractAddress,
    network:         "localhost",
    chainId:         Number(network.chainId),
    deployedAt:      new Date().toISOString(),
    deployerAddress: deployer.address,
    txHash:          receipt.hash,
    blockNumber:     receipt.blockNumber,
    gasUsed:         receipt.gasUsed.toString(),
    abi,
  };

  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  fs.writeFileSync(
    path.join(deploymentsDir, "genomicData.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("💾  Saved → deployments/genomicData.json");

  // ── Print backend .env lines ──────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ACTION REQUIRED — Add/update these lines in backend/.env:");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`\nBLOCKCHAIN_RPC_URL=http://127.0.0.1:8545`);
  console.log(`BLOCKCHAIN_CHAIN_ID=31337`);
  console.log(`BLOCKCHAIN_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`BLOCKCHAIN_DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`);
  console.log("\n═══════════════════════════════════════════════════════════\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌  Deployment failed:", err.message);
    process.exit(1);
  });
