/**
 * deploy.js
 * ─────────
 * Deploys the GenomicRegistry smart contract to the Hardhat local network.
 *
 * Usage:
 *   Terminal 1:  npx hardhat node          ← start local Ethereum node
 *   Terminal 2:  npx hardhat run scripts/deploy.js --network localhost
 *
 * After deployment:
 *   - Contract address is printed to console
 *   - Deployment info is saved to deployments/local.json
 *   - Update BLOCKCHAIN_CONTRACT_ADDRESS in backend/.env with the printed address
 */

const { ethers } = require("hardhat");
const fs         = require("fs");
const path       = require("path");

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  GenoVault — GenomicRegistry Contract Deployment");
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── 1. Get the deployer account ──────────────────────────────────────────
  const [deployer] = await ethers.getSigners();

  console.log("📡  Network:          ", (await ethers.provider.getNetwork()).name);
  console.log("🔗  Chain ID:         ", (await ethers.provider.getNetwork()).chainId.toString());
  console.log("👛  Deployer address: ", deployer.address);

  const balanceBefore = await ethers.provider.getBalance(deployer.address);
  console.log("💰  Balance (before): ", ethers.formatEther(balanceBefore), "ETH\n");

  // ── 2. Deploy the contract ───────────────────────────────────────────────
  console.log("⏳  Deploying GenomicRegistry...");

  const GenomicRegistry = await ethers.getContractFactory("GenomicRegistry");
  const registry        = await GenomicRegistry.deploy();

  // Wait for the deployment transaction to be mined
  await registry.waitForDeployment();

  const contractAddress = await registry.getAddress();

  console.log("\n✅  Contract deployed successfully!");
  console.log("📋  Contract address: ", contractAddress);

  // ── 3. Get deployment transaction details ────────────────────────────────
  const deployTx     = registry.deploymentTransaction();
  const deployReceipt = await deployTx.wait();

  console.log("📦  Block number:     ", deployReceipt.blockNumber);
  console.log("⛽  Gas used:         ", deployReceipt.gasUsed.toString());
  console.log("🔖  Tx hash:          ", deployReceipt.hash);

  const balanceAfter = await ethers.provider.getBalance(deployer.address);
  const gasCost      = balanceBefore - balanceAfter;
  console.log("💸  Gas cost:         ", ethers.formatEther(gasCost), "ETH\n");

  // ── 4. Verify a quick read call ──────────────────────────────────────────
  const totalRecords = await registry.totalRecords();
  console.log("📊  Total records (initial):", totalRecords.toString());

  // ── 5. Save deployment info to file ─────────────────────────────────────
  const deploymentInfo = {
    network:         "localhost",
    chainId:         31337,
    contractName:    "GenomicRegistry",
    contractAddress: contractAddress,
    deployedAt:      new Date().toISOString(),
    deployerAddress: deployer.address,
    txHash:          deployReceipt.hash,
    blockNumber:     deployReceipt.blockNumber,
    gasUsed:         deployReceipt.gasUsed.toString(),
    abi: JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../artifacts/contracts/GenomicRegistry.sol/GenomicRegistry.json"),
        "utf8"
      )
    ).abi,
  };

  const deploymentsDir  = path.join(__dirname, "../deployments");
  const deploymentFile  = path.join(deploymentsDir, "local.json");

  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log("💾  Deployment info saved → deployments/local.json");

  // ── 6. Print backend .env update instructions ────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ACTION REQUIRED — Update your backend/.env:");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`\nBLOCKCHAIN_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545`);
  console.log(`BLOCKCHAIN_CHAIN_ID=31337`);
  console.log(`BLOCKCHAIN_DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`);
  console.log("\n═══════════════════════════════════════════════════════════\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌  Deployment failed:", err.message);
    console.error(err);
    process.exit(1);
  });
