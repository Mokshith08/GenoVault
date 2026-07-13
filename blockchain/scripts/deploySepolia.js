/**
 * deploySepolia.js
 * ────────────────
 * Deploys GenomicDataRegistry to the Ethereum Sepolia public testnet.
 * Data stored on Sepolia is PERMANENT — survives laptop shutdown, forever.
 *
 * Prerequisites:
 *   1. BLOCKCHAIN_RPC_URL      set in backend/.env  (Alchemy Sepolia HTTPS URL)
 *   2. BLOCKCHAIN_DEPLOYER_PRIVATE_KEY set in backend/.env  (MetaMask private key)
 *   3. Wallet must have Sepolia ETH (get free from https://sepoliafaucet.com)
 *
 * Usage:
 *   npx hardhat run scripts/deploySepolia.js --network sepolia
 *
 * After deployment:
 *   Update BLOCKCHAIN_CONTRACT_ADDRESS in backend/.env with the printed address.
 *   The contract lives at that address FOREVER on Sepolia — no need to redeploy.
 */

const { ethers } = require("hardhat");
const fs         = require("fs");
const path       = require("path");

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  GenoVault — Deploying to Ethereum Sepolia Testnet");
  console.log("═══════════════════════════════════════════════════════════\n");

  const [deployer] = await ethers.getSigners();
  const network    = await ethers.provider.getNetwork();

  console.log("📡  Network:          Sepolia Testnet");
  console.log("🔗  Chain ID:         ", network.chainId.toString());
  console.log("👛  Deployer address: ", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("💰  Balance:          ", ethers.formatEther(balance), "SepoliaETH\n");

  if (balance === 0n) {
    console.error("❌  Wallet has 0 ETH. Get free Sepolia ETH from:");
    console.error("    https://cloud.google.com/application/web3/faucet/ethereum/sepolia");
    process.exit(1);
  }

  // ── Deploy ──────────────────────────────────────────────────────────────
  console.log("⏳  Deploying GenomicDataRegistry to Sepolia...");
  console.log("    (This takes ~15-30 seconds on the public network)\n");

  // Pass the deployer address as systemWallet — this is the only address
  // allowed to sign blockchain transactions (onlySystem modifier).
  const Factory  = await ethers.getContractFactory("GenomicDataRegistry");
  const contract = await Factory.deploy(deployer.address);
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  const deployTx        = contract.deploymentTransaction();
  const receipt         = await deployTx.wait();

  console.log("✅  Contract deployed PERMANENTLY on Sepolia!");
  console.log("📋  Contract address: ", contractAddress);
  console.log("📦  Block number:     ", receipt.blockNumber);
  console.log("🔖  Tx hash:          ", receipt.hash);
  console.log("⛽  Gas used:         ", receipt.gasUsed.toString());

  const balanceAfter = await ethers.provider.getBalance(deployer.address);
  console.log("💸  Gas cost:         ", ethers.formatEther(balance - balanceAfter), "SepoliaETH");

  // ── Etherscan link ───────────────────────────────────────────────────────
  console.log("\n🌐  View on Etherscan (public blockchain explorer):");
  console.log(`    https://sepolia.etherscan.io/address/${contractAddress}`);
  console.log(`    https://sepolia.etherscan.io/tx/${receipt.hash}`);

  // ── Save deployment info ─────────────────────────────────────────────────
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
    network:         "sepolia",
    chainId:         Number(network.chainId),
    deployedAt:      new Date().toISOString(),
    deployerAddress: deployer.address,
    txHash:          receipt.hash,
    blockNumber:     receipt.blockNumber,
    gasUsed:         receipt.gasUsed.toString(),
    etherscanUrl:    `https://sepolia.etherscan.io/address/${contractAddress}`,
    abi,
  };

  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });

  // Save as both genomicData.json (used by backend) and sepolia.json (archive)
  fs.writeFileSync(
    path.join(deploymentsDir, "genomicData.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );
  fs.writeFileSync(
    path.join(deploymentsDir, "sepolia.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("\n💾  Saved → deployments/genomicData.json");
  console.log("💾  Saved → deployments/sepolia.json");

  // ── Print .env update instruction ────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ACTION REQUIRED — Update backend/.env:");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`\nBLOCKCHAIN_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`BLOCKCHAIN_CHAIN_ID=11155111`);
  console.log("\n  ⚠️  This address is PERMANENT. You never need to change it again.");
  console.log("═══════════════════════════════════════════════════════════\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌  Deployment failed:", err.message);
    if (err.message.includes("insufficient funds")) {
      console.error("\n💡  Your wallet needs Sepolia ETH. Get free ETH from:");
      console.error("    https://cloud.google.com/application/web3/faucet/ethereum/sepolia");
    }
    process.exit(1);
  });
