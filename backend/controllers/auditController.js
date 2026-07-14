const AccessRequest = require('../models/AccessRequest');
const GenomicFile   = require('../models/GenomicFile');

const getAudit = async (req, res) => {
  try {
    const userId = req.user.userId;
    const role   = req.user.role;
    const events = [];

    if (role === 'owner') {
      // ── File upload events ──────────────────────────────────────────────
      const files = await GenomicFile.find({ owner: userId })
        .select('originalName blockchainFileId blockchainTxHash blockchainBlockNum blockchainTimestamp createdAt')
        .lean();

      for (const f of files) {
        events.push({
          eventType:   'FileRegistered',
          action:      'Upload',
          fileId:      f.blockchainFileId ?? null,
          fileName:    f.originalName,
          actor:       'You (owner)',
          txHash:      f.blockchainTxHash ?? null,
          blockNumber: f.blockchainBlockNum ?? null,
          etherscanUrl: f.blockchainTxHash
            ? 'https://sepolia.etherscan.io/tx/' + f.blockchainTxHash
            : null,
          timestamp:   f.blockchainTimestamp || f.createdAt,
          gasUsed:     null,
        });
      }

      // ── Access request events ──────────────────────────────────────────
      const requests = await AccessRequest.find({ owner: userId })
        .populate('researcher', 'name email orcid')
        .populate('file', 'originalName blockchainFileId')
        .lean();

      for (const r of requests) {
        const fileName       = r.file       ? r.file.originalName        : 'Unknown file';
        const researcherName = r.researcher ? r.researcher.name           : 'Unknown researcher';
        const fileId         = r.file       ? r.file.blockchainFileId     : null;

        // Always emit the Request event (with or without a tx hash)
        events.push({
          eventType:   'AccessRequested',
          action:      'Request',
          fileId,
          fileName,
          actor:       researcherName,
          txHash:      r.requestTxHash ?? null,
          blockNumber: r.requestBlockNumber ?? null,
          etherscanUrl: r.requestTxHash
            ? 'https://sepolia.etherscan.io/tx/' + r.requestTxHash
            : null,
          timestamp:   r.createdAt,
          gasUsed:     r.requestGasUsed ?? null,
        });

        // Emit Approve event if status is approved (or has an approve tx)
        if (r.status === 'approved' || r.approveTxHash) {
          events.push({
            eventType:   'AccessApproved',
            action:      'Approve',
            fileId,
            fileName,
            actor:       'You (owner)',
            txHash:      r.approveTxHash ?? null,
            blockNumber: r.approveBlockNumber ?? null,
            etherscanUrl: r.approveTxHash
              ? 'https://sepolia.etherscan.io/tx/' + r.approveTxHash
              : null,
            timestamp:   r.approvedAt || r.updatedAt,
            gasUsed:     r.approveGasUsed ?? null,
          });
        }

        // Emit Reject event if status is denied/rejected (or has a reject tx)
        if (r.status === 'denied' || r.status === 'rejected' || r.rejectTxHash) {
          events.push({
            eventType:   'AccessRejected',
            action:      'Reject',
            fileId,
            fileName,
            actor:       'You (owner)',
            txHash:      r.rejectTxHash ?? null,
            blockNumber: r.rejectBlockNumber ?? null,
            etherscanUrl: r.rejectTxHash
              ? 'https://sepolia.etherscan.io/tx/' + r.rejectTxHash
              : null,
            timestamp:   r.updatedAt,
            gasUsed:     r.rejectGasUsed ?? null,
          });
        }

        // Emit Revoke event if status is revoked (or has a revoke tx)
        if (r.status === 'revoked' || r.revokeTxHash) {
          events.push({
            eventType:   'AccessRevoked',
            action:      'Revoke',
            fileId,
            fileName,
            actor:       'You (owner)',
            txHash:      r.revokeTxHash ?? null,
            blockNumber: r.revokeBlockNumber ?? null,
            etherscanUrl: r.revokeTxHash
              ? 'https://sepolia.etherscan.io/tx/' + r.revokeTxHash
              : null,
            timestamp:   r.updatedAt,
            gasUsed:     r.revokeGasUsed ?? null,
          });
        }
      }

    } else {
      // ── Researcher view ──────────────────────────────────────────────────
      const requests = await AccessRequest.find({ researcher: userId })
        .populate('file', 'originalName blockchainFileId')
        .lean();

      for (const r of requests) {
        const fileName = r.file ? r.file.originalName    : 'Unknown file';
        const fileId   = r.file ? r.file.blockchainFileId : null;

        // Always emit the Request event
        events.push({
          eventType:   'AccessRequested',
          action:      'Requested',
          fileId,
          fileName,
          actor:       'You',
          txHash:      r.requestTxHash ?? null,
          blockNumber: r.requestBlockNumber ?? null,
          etherscanUrl: r.requestTxHash
            ? 'https://sepolia.etherscan.io/tx/' + r.requestTxHash
            : null,
          timestamp:   r.createdAt,
          gasUsed:     r.requestGasUsed ?? null,
        });

        if (r.status === 'approved' || r.approveTxHash) {
          events.push({
            eventType:   'AccessApproved',
            action:      'Approved',
            fileId,
            fileName,
            actor:       'Owner',
            txHash:      r.approveTxHash ?? null,
            blockNumber: r.approveBlockNumber ?? null,
            etherscanUrl: r.approveTxHash
              ? 'https://sepolia.etherscan.io/tx/' + r.approveTxHash
              : null,
            timestamp:   r.approvedAt || r.updatedAt,
            gasUsed:     r.approveGasUsed ?? null,
          });
        }

        if (r.status === 'denied' || r.status === 'rejected' || r.rejectTxHash) {
          events.push({
            eventType:   'AccessRejected',
            action:      'Rejected',
            fileId,
            fileName,
            actor:       'Owner',
            txHash:      r.rejectTxHash ?? null,
            blockNumber: r.rejectBlockNumber ?? null,
            etherscanUrl: r.rejectTxHash
              ? 'https://sepolia.etherscan.io/tx/' + r.rejectTxHash
              : null,
            timestamp:   r.updatedAt,
            gasUsed:     r.rejectGasUsed ?? null,
          });
        }

        if (r.status === 'revoked' || r.revokeTxHash) {
          events.push({
            eventType:   'AccessRevoked',
            action:      'Revoked',
            fileId,
            fileName,
            actor:       'Owner',
            txHash:      r.revokeTxHash ?? null,
            blockNumber: r.revokeBlockNumber ?? null,
            etherscanUrl: r.revokeTxHash
              ? 'https://sepolia.etherscan.io/tx/' + r.revokeTxHash
              : null,
            timestamp:   r.updatedAt,
            gasUsed:     r.revokeGasUsed ?? null,
          });
        }
      }
    }

    // Sort newest first
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.status(200).json({ success: true, count: events.length, events });
  } catch (err) {
    console.error('[auditController]', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch audit trail' });
  }
};

module.exports = { getAudit };
