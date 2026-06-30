/**
 * genomicRegistry.test.js
 * ───────────────────────
 * Hardhat/Mocha/Chai tests for the GenomicRegistry smart contract.
 *
 * Tests cover:
 *   ✅ Deployment & initial state
 *   ✅ storeRecord — success path
 *   ✅ storeRecord — duplicate hash rejection
 *   ✅ storeRecord — zero hash rejection
 *   ✅ getRecord — retrieves correct data
 *   ✅ verifyRecord — returns true for registered hashes
 *   ✅ getOwnerRecords — enumerates owner's hashes
 *   ✅ getOwnerRecordCount — returns correct count
 *   ✅ totalRecords — increments correctly
 *   ✅ RecordStored event — emitted with correct args
 *   ✅ Access control — only the caller is set as owner
 *
 * Run:  npx hardhat test
 */

const { expect }    = require("chai");
const { ethers }    = require("hardhat");
const crypto        = require("crypto");

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Generate a bytes32 SHA-256 hash from a string — mirrors what the backend does.
 * @param {string} data - The raw data to hash
 * @returns {string} 0x-prefixed 32-byte hex string
 */
function sha256ToBytes32(data) {
  const hex = crypto.createHash("sha256").update(data).digest("hex");
  return "0x" + hex;
}

// ── Test Suite ─────────────────────────────────────────────────────────────

describe("GenomicRegistry", function () {
  // Increase timeout for complex operations
  this.timeout(30000);

  let registry;
  let owner, researcher, other;

  // Sample file hashes and names for tests
  const FILE_A_HASH = sha256ToBytes32("genomic_file_A_content_acgt_sequence_12345");
  const FILE_B_HASH = sha256ToBytes32("genomic_file_B_content_tcga_sequence_67890");
  const FILE_C_HASH = sha256ToBytes32("genomic_file_C_content_gcat_sequence_11111");
  const FILE_A_NAME = "patient_001_genome.fastq";
  const FILE_B_NAME = "patient_002_exome.bam";
  const FILE_C_NAME = "patient_003_variants.vcf";
  const ZERO_HASH   = "0x" + "00".repeat(32);

  // Deploy a fresh contract before each test
  beforeEach(async function () {
    [owner, researcher, other] = await ethers.getSigners();

    const GenomicRegistry = await ethers.getContractFactory("GenomicRegistry");
    registry = await GenomicRegistry.deploy();
    await registry.waitForDeployment();
  });

  // ────────────────────────────────────────────────────────────────────────
  // Deployment
  // ────────────────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("should deploy successfully and return a valid address", async function () {
      const addr = await registry.getAddress();
      expect(addr).to.be.properAddress;
    });

    it("should initialise totalRecords to zero", async function () {
      expect(await registry.totalRecords()).to.equal(0n);
    });

    it("should return empty record for uninitialised hash", async function () {
      const record = await registry.getRecord(FILE_A_HASH);
      expect(record.exists).to.equal(false);
      expect(record.owner).to.equal(ethers.ZeroAddress);
    });

    it("should return false for verifyRecord on uninitialised hash", async function () {
      expect(await registry.verifyRecord(FILE_A_HASH)).to.equal(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // storeRecord
  // ────────────────────────────────────────────────────────────────────────

  describe("storeRecord()", function () {
    it("should store a genomic file hash successfully", async function () {
      const tx      = await registry.connect(owner).storeRecord(FILE_A_HASH, FILE_A_NAME);
      const receipt = await tx.wait();
      expect(receipt.status).to.equal(1); // 1 = success
    });

    it("should increment totalRecords after each store", async function () {
      expect(await registry.totalRecords()).to.equal(0n);

      await registry.connect(owner).storeRecord(FILE_A_HASH, FILE_A_NAME);
      expect(await registry.totalRecords()).to.equal(1n);

      await registry.connect(owner).storeRecord(FILE_B_HASH, FILE_B_NAME);
      expect(await registry.totalRecords()).to.equal(2n);
    });

    it("should store the correct owner address (msg.sender)", async function () {
      await registry.connect(researcher).storeRecord(FILE_A_HASH, FILE_A_NAME);
      const record = await registry.getRecord(FILE_A_HASH);
      expect(record.owner).to.equal(researcher.address);
    });

    it("should store the correct fileName", async function () {
      await registry.connect(owner).storeRecord(FILE_A_HASH, FILE_A_NAME);
      const record = await registry.getRecord(FILE_A_HASH);
      expect(record.fileName).to.equal(FILE_A_NAME);
    });

    it("should store the correct fileHash", async function () {
      await registry.connect(owner).storeRecord(FILE_A_HASH, FILE_A_NAME);
      const record = await registry.getRecord(FILE_A_HASH);
      expect(record.fileHash).to.equal(FILE_A_HASH);
    });

    it("should set exists = true for stored record", async function () {
      await registry.connect(owner).storeRecord(FILE_A_HASH, FILE_A_NAME);
      const record = await registry.getRecord(FILE_A_HASH);
      expect(record.exists).to.equal(true);
    });

    it("should set a valid block.timestamp for the record", async function () {
      const tx      = await registry.connect(owner).storeRecord(FILE_A_HASH, FILE_A_NAME);
      const receipt = await tx.wait();
      const minedBlock = await ethers.provider.getBlock(receipt.blockNumber);

      const record = await registry.getRecord(FILE_A_HASH);

      // The record timestamp must equal the block timestamp exactly
      // (block.timestamp is the canonical time in Ethereum, not wall-clock time)
      expect(Number(record.timestamp)).to.equal(Number(minedBlock.timestamp));
    });

    it("should revert with HashAlreadyRegistered when storing duplicate hash", async function () {
      await registry.connect(owner).storeRecord(FILE_A_HASH, FILE_A_NAME);

      // Same hash, different file name — still a duplicate
      await expect(
        registry.connect(owner).storeRecord(FILE_A_HASH, "duplicate_attempt.fastq")
      ).to.be.revertedWithCustomError(registry, "HashAlreadyRegistered")
        .withArgs(FILE_A_HASH);
    });

    it("should revert with InvalidHash when fileHash is zero bytes32", async function () {
      await expect(
        registry.connect(owner).storeRecord(ZERO_HASH, FILE_A_NAME)
      ).to.be.revertedWithCustomError(registry, "InvalidHash");
    });

    it("should allow different owners to store different hashes", async function () {
      await registry.connect(owner).storeRecord(FILE_A_HASH, FILE_A_NAME);
      await registry.connect(researcher).storeRecord(FILE_B_HASH, FILE_B_NAME);

      const recordA = await registry.getRecord(FILE_A_HASH);
      const recordB = await registry.getRecord(FILE_B_HASH);

      expect(recordA.owner).to.equal(owner.address);
      expect(recordB.owner).to.equal(researcher.address);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Events
  // ────────────────────────────────────────────────────────────────────────

  describe("Events", function () {
    it("should emit RecordStored with correct indexed args", async function () {
      await expect(
        registry.connect(owner).storeRecord(FILE_A_HASH, FILE_A_NAME)
      ).to.emit(registry, "RecordStored")
        .withArgs(FILE_A_HASH, owner.address, /* timestamp: any */ await anyTimestamp(), FILE_A_NAME);
    });

    it("should emit RecordStored with fileHash as indexed topic", async function () {
      const tx      = await registry.connect(owner).storeRecord(FILE_A_HASH, FILE_A_NAME);
      const receipt = await tx.wait();

      // Find the RecordStored log
      const iface   = registry.interface;
      const parsed  = iface.parseLog({ topics: receipt.logs[0].topics, data: receipt.logs[0].data });

      expect(parsed.name).to.equal("RecordStored");
      expect(parsed.args.fileHash).to.equal(FILE_A_HASH);
      expect(parsed.args.owner).to.equal(owner.address);
      expect(parsed.args.fileName).to.equal(FILE_A_NAME);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // verifyRecord
  // ────────────────────────────────────────────────────────────────────────

  describe("verifyRecord()", function () {
    it("should return true for a registered hash", async function () {
      await registry.connect(owner).storeRecord(FILE_A_HASH, FILE_A_NAME);
      expect(await registry.verifyRecord(FILE_A_HASH)).to.equal(true);
    });

    it("should return false for an unregistered hash", async function () {
      expect(await registry.verifyRecord(FILE_B_HASH)).to.equal(false);
    });

    it("should return false for zero hash", async function () {
      expect(await registry.verifyRecord(ZERO_HASH)).to.equal(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // getOwnerRecords
  // ────────────────────────────────────────────────────────────────────────

  describe("getOwnerRecords()", function () {
    it("should return empty array for address with no records", async function () {
      const hashes = await registry.getOwnerRecords(other.address);
      expect(hashes.length).to.equal(0);
    });

    it("should return all hashes registered by an owner", async function () {
      await registry.connect(owner).storeRecord(FILE_A_HASH, FILE_A_NAME);
      await registry.connect(owner).storeRecord(FILE_B_HASH, FILE_B_NAME);
      await registry.connect(owner).storeRecord(FILE_C_HASH, FILE_C_NAME);

      const hashes = await registry.getOwnerRecords(owner.address);
      expect(hashes.length).to.equal(3);
      expect(hashes).to.include(FILE_A_HASH);
      expect(hashes).to.include(FILE_B_HASH);
      expect(hashes).to.include(FILE_C_HASH);
    });

    it("should not mix hashes between different owners", async function () {
      await registry.connect(owner).storeRecord(FILE_A_HASH, FILE_A_NAME);
      await registry.connect(researcher).storeRecord(FILE_B_HASH, FILE_B_NAME);

      const ownerHashes      = await registry.getOwnerRecords(owner.address);
      const researcherHashes = await registry.getOwnerRecords(researcher.address);

      expect(ownerHashes.length).to.equal(1);
      expect(ownerHashes[0]).to.equal(FILE_A_HASH);

      expect(researcherHashes.length).to.equal(1);
      expect(researcherHashes[0]).to.equal(FILE_B_HASH);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // getOwnerRecordCount
  // ────────────────────────────────────────────────────────────────────────

  describe("getOwnerRecordCount()", function () {
    it("should return 0 for address with no records", async function () {
      expect(await registry.getOwnerRecordCount(other.address)).to.equal(0n);
    });

    it("should return correct count after multiple stores", async function () {
      await registry.connect(owner).storeRecord(FILE_A_HASH, FILE_A_NAME);
      expect(await registry.getOwnerRecordCount(owner.address)).to.equal(1n);

      await registry.connect(owner).storeRecord(FILE_B_HASH, FILE_B_NAME);
      expect(await registry.getOwnerRecordCount(owner.address)).to.equal(2n);
    });
  });

  // ── Helper: returns a matcher that accepts any uint256 timestamp ─────────
  async function anyTimestamp() {
    const block = await ethers.provider.getBlock("latest");
    // Return a custom Chai matcher — just check it's a reasonable timestamp
    return (value) => {
      const ts = Number(value);
      return ts > 0 && ts <= Date.now() / 1000 + 60;
    };
  }
});
