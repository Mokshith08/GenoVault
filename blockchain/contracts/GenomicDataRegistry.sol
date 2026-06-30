// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * GenomicDataRegistry.sol
 * ───────────────────────
 * Full genomic data registry with:
 *   1. File Hash (SHA-256)          — proof of file integrity
 *   2. Owner Address                — identifies the data owner
 *   3. Upload Timestamp             — immutable record of when uploaded
 *   4. Storage Reference (IPFS CID) — where the encrypted file lives
 *   5. Access Permissions           — researcher, approved, expiryTime
 *   6. Audit Trail Events           — AccessRequested, Approved, Revoked
 */
contract GenomicDataRegistry {

    // ── Structs ────────────────────────────────────────────────────────────

    struct FileRecord {
        string   fileHash;     // SHA-256 hex of the encrypted file (64 chars)
        address  owner;        // Ethereum address of the data owner
        uint256  timestamp;    // block.timestamp when registered
        string   ipfsCID;      // IPFS CID where encrypted file is stored
        bool     exists;       // guard against uninitialised reads
    }

    struct AccessPermission {
        address  researcher;   // address granted access
        bool     approved;     // whether access is currently active
        uint256  grantedAt;    // when access was granted
        uint256  expiryTime;   // Unix timestamp when access expires
    }

    // ── Storage ────────────────────────────────────────────────────────────

    // fileId (1-based) → FileRecord
    mapping(uint256 => FileRecord) private _files;

    // fileId → researcher address → AccessPermission
    mapping(uint256 => mapping(address => AccessPermission)) private _permissions;

    // SHA-256 hash string → fileId (for reverse lookup)
    mapping(string => uint256) private _hashToId;

    // owner address → list of their fileIds
    mapping(address => uint256[]) private _ownerFiles;

    uint256 private _totalRecords;

    // ── Events (Audit Trail) ───────────────────────────────────────────────

    event FileRegistered(
        uint256 indexed fileId,
        string          fileHash,
        address indexed owner,
        string          ipfsCID,
        uint256         timestamp
    );

    event AccessRequested(
        uint256 indexed fileId,
        address indexed researcher,
        uint256         requestedAt
    );

    event AccessApproved(
        uint256 indexed fileId,
        address indexed researcher,
        uint256         expiryTime,
        uint256         grantedAt
    );

    event AccessRevoked(
        uint256 indexed fileId,
        address indexed researcher,
        uint256         revokedAt
    );

    // ── Errors ─────────────────────────────────────────────────────────────

    error FileNotFound(uint256 fileId);
    error HashAlreadyRegistered(string fileHash);
    error InvalidHash();
    error NotFileOwner(uint256 fileId, address caller);
    error CannotRequestOwnFile(uint256 fileId);
    error AccessAlreadyRevoked();

    // ── Modifiers ──────────────────────────────────────────────────────────

    modifier fileExists(uint256 fileId) {
        if (!_files[fileId].exists) revert FileNotFound(fileId);
        _;
    }

    modifier onlyOwner(uint256 fileId) {
        if (_files[fileId].owner != msg.sender) revert NotFileOwner(fileId, msg.sender);
        _;
    }

    // ── Write Functions ────────────────────────────────────────────────────

    /**
     * registerFile
     * ─────────────
     * Stores a genomic file record on the blockchain permanently.
     * Called automatically by the GenoVault backend after each file upload.
     *
     * @param fileHash  SHA-256 hex string of the encrypted file (64 chars)
     * @param ipfsCID   IPFS CID where the encrypted file is backed up
     * @return fileId   Sequential record ID (1, 2, 3, ...)
     */
    function registerFile(
        string calldata fileHash,
        string calldata ipfsCID
    ) external returns (uint256 fileId) {
        if (bytes(fileHash).length != 64) revert InvalidHash();
        if (_hashToId[fileHash] != 0)     revert HashAlreadyRegistered(fileHash);

        fileId = ++_totalRecords;

        _files[fileId] = FileRecord({
            fileHash:  fileHash,
            owner:     msg.sender,
            timestamp: block.timestamp,
            ipfsCID:   ipfsCID,
            exists:    true
        });

        _hashToId[fileHash] = fileId;
        _ownerFiles[msg.sender].push(fileId);

        emit FileRegistered(fileId, fileHash, msg.sender, ipfsCID, block.timestamp);
    }

    /**
     * requestAccess
     * ─────────────
     * A researcher requests access to a genomic file.
     * Emits AccessRequested event — the file owner can then approve.
     *
     * @param fileId  The file to request access to
     */
    function requestAccess(uint256 fileId) external fileExists(fileId) {
        if (_files[fileId].owner == msg.sender) revert CannotRequestOwnFile(fileId);
        emit AccessRequested(fileId, msg.sender, block.timestamp);
    }

    /**
     * approveAccess
     * ─────────────
     * File owner approves a researcher's access request.
     *
     * @param fileId           The file to grant access to
     * @param researcher       Address of the researcher to approve
     * @param durationSeconds  How long access is valid (e.g. 86400 = 1 day)
     */
    function approveAccess(
        uint256 fileId,
        address researcher,
        uint256 durationSeconds
    ) external fileExists(fileId) onlyOwner(fileId) {
        uint256 expiry = block.timestamp + durationSeconds;

        _permissions[fileId][researcher] = AccessPermission({
            researcher: researcher,
            approved:   true,
            grantedAt:  block.timestamp,
            expiryTime: expiry
        });

        emit AccessApproved(fileId, researcher, expiry, block.timestamp);
    }

    /**
     * revokeAccess
     * ─────────────
     * File owner revokes a previously approved researcher's access.
     *
     * @param fileId      The file to revoke access from
     * @param researcher  Address of the researcher to revoke
     */
    function revokeAccess(
        uint256 fileId,
        address researcher
    ) external fileExists(fileId) onlyOwner(fileId) {
        if (!_permissions[fileId][researcher].approved) revert AccessAlreadyRevoked();
        _permissions[fileId][researcher].approved = false;
        emit AccessRevoked(fileId, researcher, block.timestamp);
    }

    // ── Read Functions ─────────────────────────────────────────────────────

    /**
     * getFile
     * ────────
     * Returns full file record: hash, owner, timestamp, IPFS CID.
     */
    function getFile(uint256 fileId)
        external
        view
        fileExists(fileId)
        returns (FileRecord memory)
    {
        return _files[fileId];
    }

    /**
     * getFileByHash
     * ─────────────
     * Lookup a file by its SHA-256 hash — returns fileId + full record.
     */
    function getFileByHash(string calldata fileHash)
        external
        view
        returns (uint256 fileId, FileRecord memory record)
    {
        fileId = _hashToId[fileHash];
        require(fileId != 0, "Hash not registered");
        record = _files[fileId];
    }

    /**
     * checkAccess
     * ─────────────
     * Returns whether a researcher currently has valid (non-expired) access.
     */
    function checkAccess(uint256 fileId, address researcher)
        external
        view
        returns (bool hasAccess, uint256 expiryTime)
    {
        AccessPermission memory p = _permissions[fileId][researcher];
        hasAccess  = p.approved && block.timestamp < p.expiryTime;
        expiryTime = p.expiryTime;
    }

    /**
     * getPermission
     * ─────────────
     * Returns full access permission details for a researcher on a file.
     */
    function getPermission(uint256 fileId, address researcher)
        external
        view
        returns (AccessPermission memory)
    {
        return _permissions[fileId][researcher];
    }

    /**
     * getOwnerFiles
     * ─────────────
     * Returns all fileIds registered by a specific owner address.
     */
    function getOwnerFiles(address owner)
        external
        view
        returns (uint256[] memory)
    {
        return _ownerFiles[owner];
    }

    /**
     * getTotalRecords
     * ────────────────
     * Returns total number of files ever registered.
     */
    function getTotalRecords() external view returns (uint256) {
        return _totalRecords;
    }
}
