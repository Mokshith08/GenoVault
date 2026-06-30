// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GenomicRegistry
 * @notice Immutable on-chain registry for genomic file hashes.
 *
 * @dev  Each genomic file uploaded to GenoVault gets its SHA-256 hash
 *       registered here so that:
 *         1. Provenance is permanently verifiable on the blockchain.
 *         2. Tampering with the file in cloud storage is immediately
 *            detectable (hash mismatch).
 *
 * Storage layout:
 *   records      mapping(bytes32 => GenomicRecord)  — fileHash → record
 *   ownerHashes  mapping(address => bytes32[])       — owner    → all their hashes
 *   totalRecords uint256                             — global counter
 *
 * Gas-efficiency choices:
 *   • fileHash stored as bytes32 (native 256-bit word) — cheaper than string
 *   • fileName stored as string for human readability in events / queries
 *   • No array iteration in hot paths — O(1) lookup by hash
 */
contract GenomicRegistry {
    // ─────────────────────────────────────────────────────────────────────────
    // Structs
    // ─────────────────────────────────────────────────────────────────────────

    struct GenomicRecord {
        bytes32 fileHash;       // SHA-256 hash of the genomic file (bytes32)
        address owner;          // Ethereum address that registered this record
        uint256 timestamp;      // Unix timestamp of registration (block.timestamp)
        string  fileName;       // Original filename (human-readable, non-unique)
        bool    exists;         // Guard flag — false for uninitialised mappings
    }

    // ─────────────────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev fileHash → GenomicRecord
    mapping(bytes32 => GenomicRecord) private records;

    /// @dev owner address → array of their file hashes (for enumeration)
    mapping(address => bytes32[]) private ownerHashes;

    /// @dev Total number of records ever registered (never decremented)
    uint256 public totalRecords;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Emitted every time a new genomic record is stored.
     * @param fileHash   The bytes32 SHA-256 hash of the file.
     * @param owner      The address that registered the record.
     * @param timestamp  Unix timestamp (seconds since epoch).
     * @param fileName   The original filename string.
     */
    event RecordStored(
        bytes32 indexed fileHash,
        address indexed owner,
        uint256         timestamp,
        string          fileName
    );

    /**
     * @notice Emitted when verifyRecord() is called (useful for audit trails).
     * @param fileHash The hash that was queried.
     * @param exists   Whether the record was found.
     */
    event RecordVerified(
        bytes32 indexed fileHash,
        bool            exists
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Custom Errors (cheaper than require+string)
    // ─────────────────────────────────────────────────────────────────────────

    /// @dev Reverts when a zero-value hash is submitted.
    error InvalidHash();

    /// @dev Reverts when the same hash is submitted twice.
    error HashAlreadyRegistered(bytes32 fileHash);

    // ─────────────────────────────────────────────────────────────────────────
    // Write Functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Register a genomic file hash on the blockchain.
     *
     * @dev  Caller must pass the SHA-256 digest as bytes32.
     *       The backend converts the hex string ("0xabcd…") to bytes32
     *       before calling this function.
     *
     *       Reverts if:
     *         - fileHash is zero bytes32 (invalid)
     *         - fileHash was already registered (duplicate)
     *
     * @param fileHash  32-byte SHA-256 digest of the file.
     * @param fileName  Human-readable original filename (stored in event + record).
     */
    function storeRecord(bytes32 fileHash, string calldata fileName) external {
        // Guard: reject zero hash
        if (fileHash == bytes32(0)) revert InvalidHash();

        // Guard: reject duplicate hashes
        if (records[fileHash].exists) revert HashAlreadyRegistered(fileHash);

        // Build and persist the record
        records[fileHash] = GenomicRecord({
            fileHash:  fileHash,
            owner:     msg.sender,
            timestamp: block.timestamp,
            fileName:  fileName,
            exists:    true
        });

        // Append hash to owner's enumeration list
        ownerHashes[msg.sender].push(fileHash);

        // Increment global counter
        unchecked { totalRecords++; }

        emit RecordStored(fileHash, msg.sender, block.timestamp, fileName);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Read Functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Retrieve the full GenomicRecord for a given file hash.
     *
     * @dev  Returns an empty struct with exists=false if the hash was never
     *       registered — callers MUST check record.exists before trusting data.
     *
     * @param fileHash  32-byte SHA-256 digest to look up.
     * @return record   The stored GenomicRecord struct.
     */
    function getRecord(bytes32 fileHash) external view returns (GenomicRecord memory record) {
        return records[fileHash];
    }

    /**
     * @notice Check whether a hash exists on-chain (does NOT emit an event).
     *
     * @dev  This is a pure read — use it from the frontend / backend to do
     *       quick existence checks without sending a transaction.
     *
     * @param fileHash  32-byte SHA-256 digest to verify.
     * @return verified  true if the hash was previously registered.
     */
    function verifyRecord(bytes32 fileHash) external view returns (bool verified) {
        return records[fileHash].exists;
    }

    /**
     * @notice Return all file hashes registered by a given owner address.
     *
     * @dev  Returns an empty array for addresses with no records.
     *       For large owners this could become expensive — paginate on the
     *       backend side using getOwnerRecordCount() + individual lookups
     *       if the list grows very large.
     *
     * @param owner  The Ethereum address to query.
     * @return hashes  Array of bytes32 hashes the owner has registered.
     */
    function getOwnerRecords(address owner) external view returns (bytes32[] memory hashes) {
        return ownerHashes[owner];
    }

    /**
     * @notice Return how many records a given owner has registered.
     *
     * @param owner  The Ethereum address to query.
     * @return count  Number of records registered by this owner.
     */
    function getOwnerRecordCount(address owner) external view returns (uint256 count) {
        return ownerHashes[owner].length;
    }
}
