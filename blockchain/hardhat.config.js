require("@nomicfoundation/hardhat-toolbox");
require("hardhat-deploy");
require("dotenv").config({ path: require("path").join(__dirname, "../backend/.env") });

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  // ── Solidity compiler ──────────────────────────────────────────────────────
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      // Enable CBOR-encoded metadata in bytecode (used by Hardhat for source verification)
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode", "evm.deployedBytecode", "evm.methodIdentifiers"],
        },
      },
    },
  },

  // ── Network configurations ─────────────────────────────────────────────────
  networks: {
    // Local Hardhat node — launched with `npx hardhat node`
    // This is the primary development network.
    hardhat: {
      chainId: 31337,
      // Mine a new block every 2 seconds to simulate a real chain (optional)
      // Comment out for instant mining during tests
      // mining: {
      //   auto: false,
      //   interval: 2000,
      // },
    },

    // Named network for connecting to a separately-running `npx hardhat node`
    // Use this when you want to run scripts AGAINST an already-running node
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      // The first Hardhat default account — used for deployments
      // Private key is the well-known Hardhat test account #0
      accounts: [
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
      ],
    },

    // ── Sepolia testnet — permanent public Ethereum testnet ─────────────────
    // Reads credentials from backend/.env automatically
    sepolia: {
      url: process.env.BLOCKCHAIN_RPC_URL || "",
      accounts: process.env.BLOCKCHAIN_DEPLOYER_PRIVATE_KEY
        ? [process.env.BLOCKCHAIN_DEPLOYER_PRIVATE_KEY]
        : [],
      chainId: 11155111,
    },
  },

  // ── hardhat-deploy plugin configuration ────────────────────────────────────
  namedAccounts: {
    deployer: {
      default: 0, // Use account index 0 as the default deployer
    },
  },

  // ── Paths ──────────────────────────────────────────────────────────────────
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
    deploy:    "./scripts",         // deploy scripts directory
    deployments: "./deployments",  // deployment output directory
  },

  // ── Gas reporter (shows gas cost per function after tests) ────────────────
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },

  // ── Mocha test configuration ───────────────────────────────────────────────
  mocha: {
    timeout: 60000, // 60 seconds — genomic operations can be slow
  },
};
