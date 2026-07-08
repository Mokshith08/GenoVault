// ── Type definitions only ─────────────────────────────────────────────────
// All mock/dummy data has been removed. These types are kept for backward
// compatibility with any legacy imports. Components should use real API data.

export interface FileItem {
  id: string;
  name: string;
  size: string;
  uploadedAt: string;
  status: "Encrypted" | "Stored" | "Processing";
  hash: string;
  verified: boolean;
}

export interface AccessRequest {
  id: string;
  dataset: string;
  researcher: string;
  email: string;
  purpose: string;
  requestedAt: string;
  status: "Pending" | "Approved" | "Rejected";
}

export interface ActiveAccess {
  id: string;
  user: string;
  dataset: string;
  grantedAt: number;
  expiresAt: number;
  status: "Active" | "Expired";
}

export interface AuditEntry {
  id: string;
  user: string;
  action: "Upload" | "Request" | "Access" | "Approve" | "Revoke" | "Verify";
  target: string;
  timestamp: string;
}

export interface Dataset {
  id: string;
  name: string;
  owner: string;
  samples: number;
  type: string;
  description: string;
}
