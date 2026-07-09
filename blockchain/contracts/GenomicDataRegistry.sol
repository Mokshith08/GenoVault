// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * GenomicDataRegistry.sol  — v2
 * ------------------------------
 * Backend-managed access control for the GenoVault genomic data-sharing system.
 *
 * Architecture:
 *   - Single deployer wallet (systemWallet) signs ALL transactions.
 *   - Researchers are identified on-chain by keccak256(ORCID) — a bytes32 value.
 *   - No individual user wallets required.
 *   - Authorization (who may approve/reject) is enforced by the backend (JWT + MongoDB)
 *     BEFORE any blockchain call is made. The contract trusts only the system wallet.
 *
 * On-chain records:
 *   1. File Hash (SHA-256)      — proof of integrity / tamper detection
 *   2. Upload Timestamp         — block.timestamp — immutable
 *   3. Storage Reference        — IPFS CID
 *   4. Access Requests          — stored per (fileId, researcherId)
 *   5. Access Permissions       — approved, grantedAt, expiryTime
 *   6. Audit Events             — FileRegistered, AccessRequested, AccessApproved,
 *                                  AccessRejected, AccessRevoked
 */
contract GenomicDataRegistry {

    // -- System wallet ----------------------------------------------------------
    address public systemWallet;

    constructor(address _systemWallet) {
        require(_systemWallet != address(0), "System wallet cannot be zero address");
        systemWallet = _systemWallet;
    }

    modifier onlySystem() {
        require(msg.sender == systemWallet, "GenomicRegistry: caller is not the system wallet");
        _;
    }

    // -- Enums ------------------------------------------------------------------
    enum RequestStatus { None, Pending, Approved, Rejected }

    // -- Structs ----------------------------------------------------------------
    struct FileRecord {
        string  fileHash;
        uint256 timestamp;
        string  ipfsCID;
        bool    exists;
    }

    struct AccessRequest {
        bytes32       researcherId;
        uint256       requestedAt;
        RequestStatus status;
    }

    struct AccessPermission {
        bool    approved;
        uint256 grantedAt;
        uint256 expiryTime;
    }

    // -- Storage ----------------------------------------------------------------
    mapping(uint256 => FileRecord)                              private _files;
    mapping(string  => uint256)                                 private _hashToId;
    mapping(uint256 => mapping(bytes32 => AccessRequest))       private _requests;
    mapping(uint256 => bytes32[])                               private _requesters;
    mapping(uint256 => mapping(bytes32 => AccessPermission))    private _permissions;
    uint256 private _totalRecords;

    // -- Events -----------------------------------------------------------------
    event FileRegistered(uint256 indexed fileId, string fileHash, string ipfsCID, uint256 timestamp);
    event AccessRequested(uint256 indexed fileId, bytes32 indexed researcherId, uint256 requestedAt);
    event AccessApproved(uint256 indexed fileId, bytes32 indexed researcherId, uint256 expiryTime, uint256 grantedAt);
    event AccessRejected(uint256 indexed fileId, bytes32 indexed researcherId, uint256 rejectedAt);
    event AccessRevoked(uint256 indexed fileId, bytes32 indexed researcherId, uint256 revokedAt);

    // -- Custom Errors ----------------------------------------------------------
    error FileNotFound(uint256 fileId);
    error HashAlreadyRegistered(string fileHash);
    error InvalidHash();
    error RequestNotPending(uint256 fileId, bytes32 researcherId);
    error NoApprovedPermission(uint256 fileId, bytes32 researcherId);

    // -- Modifiers --------------------------------------------------------------
    modifier fileExists(uint256 fileId) {
        if (!_files[fileId].exists) revert FileNotFound(fileId);
        _;
    }

    // -- Write Functions (onlySystem) -------------------------------------------

    function registerFile(string calldata fileHash, string calldata ipfsCID)
        external onlySystem returns (uint256 fileId)
    {
        if (bytes(fileHash).length != 64) revert InvalidHash();
        if (_hashToId[fileHash] != 0)     revert HashAlreadyRegistered(fileHash);

        fileId = ++_totalRecords;
        _files[fileId] = FileRecord({ fileHash: fileHash, timestamp: block.timestamp, ipfsCID: ipfsCID, exists: true });
        _hashToId[fileHash] = fileId;
        emit FileRegistered(fileId, fileHash, ipfsCID, block.timestamp);
    }

    function requestAccess(uint256 fileId, bytes32 researcherId)
        external onlySystem fileExists(fileId)
    {
        AccessRequest storage req = _requests[fileId][researcherId];
        if (req.status == RequestStatus.None) {
            _requesters[fileId].push(researcherId);
        }
        req.researcherId = researcherId;
        req.requestedAt  = block.timestamp;
        req.status       = RequestStatus.Pending;
        emit AccessRequested(fileId, researcherId, block.timestamp);
    }

    function approveAccess(uint256 fileId, bytes32 researcherId, uint256 durationSeconds)
        external onlySystem fileExists(fileId)
    {
        AccessRequest storage req = _requests[fileId][researcherId];
        if (req.status != RequestStatus.Pending) revert RequestNotPending(fileId, researcherId);

        uint256 expiry = block.timestamp + durationSeconds;
        req.status = RequestStatus.Approved;
        _permissions[fileId][researcherId] = AccessPermission({ approved: true, grantedAt: block.timestamp, expiryTime: expiry });
        emit AccessApproved(fileId, researcherId, expiry, block.timestamp);
    }

    function rejectAccess(uint256 fileId, bytes32 researcherId)
        external onlySystem fileExists(fileId)
    {
        AccessRequest storage req = _requests[fileId][researcherId];
        if (req.status != RequestStatus.Pending) revert RequestNotPending(fileId, researcherId);
        req.status = RequestStatus.Rejected;
        emit AccessRejected(fileId, researcherId, block.timestamp);
    }

    function revokeAccess(uint256 fileId, bytes32 researcherId)
        external onlySystem fileExists(fileId)
    {
        AccessPermission storage perm = _permissions[fileId][researcherId];
        if (!perm.approved) revert NoApprovedPermission(fileId, researcherId);
        perm.approved = false;
        _requests[fileId][researcherId].status = RequestStatus.None;
        emit AccessRevoked(fileId, researcherId, block.timestamp);
    }

    // -- Read Functions (public — no gas when called off-chain) -----------------

    function checkAccess(uint256 fileId, bytes32 researcherId)
        external view returns (bool hasAccess, uint256 expiryTime)
    {
        AccessPermission memory p = _permissions[fileId][researcherId];
        hasAccess  = p.approved && block.timestamp < p.expiryTime;
        expiryTime = p.expiryTime;
    }

    function getFileRequests(uint256 fileId)
        external view fileExists(fileId) returns (AccessRequest[] memory)
    {
        bytes32[] memory ids = _requesters[fileId];
        AccessRequest[] memory result = new AccessRequest[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = _requests[fileId][ids[i]];
        }
        return result;
    }

    function getFile(uint256 fileId) external view fileExists(fileId) returns (FileRecord memory) {
        return _files[fileId];
    }

    function getFileByHash(string calldata fileHash)
        external view returns (uint256 fileId, FileRecord memory record)
    {
        fileId = _hashToId[fileHash];
        require(fileId != 0, "Hash not registered");
        record = _files[fileId];
    }

    function getPermission(uint256 fileId, bytes32 researcherId)
        external view returns (AccessPermission memory)
    {
        return _permissions[fileId][researcherId];
    }

    function getRequest(uint256 fileId, bytes32 researcherId)
        external view returns (AccessRequest memory)
    {
        return _requests[fileId][researcherId];
    }

    function getTotalRecords() external view returns (uint256) {
        return _totalRecords;
    }
}
