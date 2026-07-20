/**
 * MyRequests.tsx  (Researcher Dashboard)
 * ─────────────────────────────────────────────────────────────────────────────
 * Card-based view of the researcher's own access requests, with all new
 * structured fields (project title, access type, extension, sharing, etc.)
 * displayed in expandable card sections.
 *
 * Business rules enforced in UI:
 *  • Download button shown ONLY if status=approved AND accessType=downloadable
 *  • Owner note ("more-info") shown prominently with blue highlight
 *  • Expired requests show a re-request hint
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardList, RefreshCw, AlertTriangle, HardDrive,
  Calendar, User, Clock, ExternalLink, Download,
  Lock, ChevronDown, Building2, Mail, Users,
  FileText, CheckCircle2, Info, Loader2, MessageSquare,
  Database,
} from "lucide-react";
import { Badge }  from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth }    from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AccessReq {
  _id:             string;
  status:          "pending" | "approved" | "denied" | "rejected" | "revoked" | "more-info";
  // Legacy
  reason?:         string;
  // Structured
  projectTitle?:               string;
  purpose?:                    string;
  accessType?:                 "read-only" | "downloadable";
  extensionRequested?:         boolean;
  dataSharedWithCollaborators?:boolean;
  institution?:                string;
  contactEmail?:               string;
  benefits?:                   string;
  risks?:                      string;
  ownerNote?:                  string;
  // Timestamps
  createdAt:       string;
  accessExpiresAt?: string;
  // Blockchain
  requestTxHash?:       string;
  requestEtherscanUrl?: string;
  approveTxHash?:       string;
  approveEtherscanUrl?: string;
  rejectTxHash?:        string;
  rejectEtherscanUrl?:  string;
  revokeTxHash?:        string;
  revokeEtherscanUrl?:  string;
  file: { _id: string; originalName: string; sizeBytes: number; isEncrypted: boolean };
  owner: { name: string; email: string };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function formatSize(bytes: number) {
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

const STATUS_META: Record<string, { cls: string; label: string; dot: string }> = {
  pending:    { cls: "bg-amber-500/15  text-amber-400",    label: "Pending",      dot: "bg-amber-400"   },
  approved:   { cls: "bg-emerald-500/15 text-emerald-400", label: "Approved",     dot: "bg-emerald-400" },
  denied:     { cls: "bg-red-500/15    text-red-400",      label: "Denied",       dot: "bg-red-400"     },
  rejected:   { cls: "bg-red-500/15    text-red-400",      label: "Rejected",     dot: "bg-red-400"     },
  revoked:    { cls: "bg-zinc-500/15   text-zinc-400",     label: "Revoked",      dot: "bg-zinc-400"    },
  "more-info":{ cls: "bg-blue-500/15   text-blue-400",     label: "More Info Req",dot: "bg-blue-400"    },
};

// ── Single request card ───────────────────────────────────────────────────────
function RequestCard({ req, token }: { req: AccessReq; token: string | null }) {
  const [expanded,     setExpanded]     = useState(false);
  const [downloading,  setDownloading]  = useState(false);

  const isExpired    = req.accessExpiresAt
    ? new Date(req.accessExpiresAt).getTime() <= Date.now()
    : false;
  const isActive     = req.status === "approved" && !isExpired;
  const canDownload  = isActive && req.accessType === "downloadable";
  const statusMeta   = STATUS_META[req.status] ?? STATUS_META.pending;

  // Show the effective status label
  const displayStatus = isExpired && req.status === "approved" ? "Expired" : statusMeta.label;
  const displayDot    = isExpired && req.status === "approved" ? "bg-zinc-400" : statusMeta.dot;
  const displayCls    = isExpired && req.status === "approved" ? "bg-zinc-500/15 text-zinc-400" : statusMeta.cls;

  // Download handler
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`http://localhost:5000/api/access/download/${req.file._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Download failed");
      }
      const blob     = await res.blob();
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement("a");
      a.href         = url;
      a.download     = req.file.originalName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Download started!");
    } catch (e: any) {
      toast.error(e.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border overflow-hidden transition-all duration-300
                  ${expanded
                    ? "border-primary/40 shadow-xl shadow-primary/8"
                    : "border-border hover:border-primary/30 hover:shadow-md"}`}
    >
      {/* Status accent bar */}
      <div className={`h-0.5 ${
        req.status === "approved" && !isExpired ? "bg-emerald-500" :
        req.status === "pending"                ? "bg-amber-500"   :
        req.status === "more-info"              ? "bg-blue-500"    :
        "bg-zinc-600"
      }`} />

      {/* ── Collapsed row ── */}
      <div
        className="p-5 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-start gap-4">

          {/* File icon */}
          <div className="h-11 w-11 rounded-xl bg-primary/10 border border-primary/20
                          flex items-center justify-center shrink-0">
            <Database className="h-5 w-5 text-primary" />
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm truncate">{req.projectTitle || "Access Request"}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {req.file.originalName}
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {/* Access type pill */}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold
                               ${req.accessType === "downloadable"
                                  ? "bg-purple-500/15 text-purple-400"
                                  : "bg-blue-500/15 text-blue-400"}`}>
                {req.accessType === "downloadable"
                  ? <><Download className="h-3 w-3" />Downloadable</>
                  : <><Lock className="h-3 w-3" />Read Only</>
                }
              </span>
              {/* Owner */}
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" />{req.owner?.name ?? "—"}
              </span>
            </div>
          </div>

          {/* Right: status + chevron */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${displayCls}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${displayDot}`} />
              {displayStatus}
            </span>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />{formatDate(req.createdAt)}
              <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown className="h-4 w-4" />
              </motion.div>
            </div>
          </div>
        </div>

        {/* Owner "more-info" note — shown even collapsed */}
        {req.status === "more-info" && req.ownerNote && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg
                          bg-blue-500/10 border border-blue-500/25 text-xs text-blue-300">
            <MessageSquare className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block mb-0.5">Owner requests more information:</span>
              {req.ownerNote}
            </div>
          </div>
        )}
      </div>

      {/* ── Expanded section ── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="exp"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="border-t border-border/60 bg-muted/20 px-5 pb-5 pt-4 space-y-4">

              {/* Detail grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Purpose</p>
                  <p className="text-foreground/80 text-xs leading-relaxed">
                    {req.purpose || req.reason || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Institution</p>
                  <p className="font-medium flex items-center gap-1 text-xs">
                    <Building2 className="h-3 w-3 text-muted-foreground" />
                    {req.institution || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Access Duration</p>
                  <p className="font-medium text-xs flex items-center gap-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />24 Hours
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Extension Requested</p>
                  <p className="font-medium text-xs">
                    {req.extensionRequested ? "Yes" : "No"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Data Shared</p>
                  <p className={`font-medium text-xs ${req.dataSharedWithCollaborators ? "text-amber-400" : ""}`}>
                    {req.dataSharedWithCollaborators ? "Yes — with collaborators" : "No"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">File Size</p>
                  <p className="font-medium text-xs flex items-center gap-1">
                    <HardDrive className="h-3 w-3 text-muted-foreground" />
                    {req.file.sizeBytes ? formatSize(req.file.sizeBytes) : "—"}
                  </p>
                </div>
                {req.accessExpiresAt && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Access Expires</p>
                    <p className={`font-medium text-xs ${isExpired ? "text-red-400" : "text-foreground"}`}>
                      <Clock className="h-3 w-3 inline mr-1" />
                      {formatDateTime(req.accessExpiresAt)}{isExpired ? " (Expired)" : ""}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Contact Email</p>
                  <p className="font-medium text-xs flex items-center gap-1">
                    <Mail className="h-3 w-3 text-muted-foreground" />{req.contactEmail || "—"}
                  </p>
                </div>
              </div>

              {/* Benefits / Risks */}
              {(req.benefits || req.risks) && (
                <div className="grid grid-cols-2 gap-3">
                  {req.benefits && (
                    <div className="p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
                      <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Benefits</p>
                      <p className="text-xs text-foreground/80">{req.benefits}</p>
                    </div>
                  )}
                  {req.risks && (
                    <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
                      <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1">Risks</p>
                      <p className="text-xs text-foreground/80">{req.risks}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Blockchain links */}
              {(req.requestEtherscanUrl || req.approveEtherscanUrl || req.rejectEtherscanUrl || req.revokeEtherscanUrl) && (
                <div className="flex flex-wrap gap-3 pt-2 border-t border-border/50">
                  {req.requestEtherscanUrl && (
                    <a href={req.requestEtherscanUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-amber-400 hover:underline">
                      <ExternalLink className="h-3 w-3" />Request tx
                    </a>
                  )}
                  {req.approveEtherscanUrl && (
                    <a href={req.approveEtherscanUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline">
                      <ExternalLink className="h-3 w-3" />Approve tx
                    </a>
                  )}
                  {req.rejectEtherscanUrl && (
                    <a href={req.rejectEtherscanUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-red-400 hover:underline">
                      <ExternalLink className="h-3 w-3" />Reject tx
                    </a>
                  )}
                  {req.revokeEtherscanUrl && (
                    <a href={req.revokeEtherscanUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:underline">
                      <ExternalLink className="h-3 w-3" />Revoke tx
                    </a>
                  )}
                </div>
              )}

              {/* Download button — only if approved + downloadable */}
              {canDownload && (
                <div className="pt-2 border-t border-border/50">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-emerald-400">Access Active — Download available</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Expires {req.accessExpiresAt ? formatDateTime(req.accessExpiresAt) : "—"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                      onClick={e => { e.stopPropagation(); handleDownload(); }}
                      disabled={downloading}
                    >
                      {downloading
                        ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Downloading…</>
                        : <><Download className="h-4 w-4 mr-1.5" />Download</>
                      }
                    </Button>
                  </div>
                </div>
              )}

              {/* Read-only info when approved but not downloadable */}
              {isActive && req.accessType === "read-only" && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-500/8 border border-blue-500/20 text-xs text-blue-300">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  You have Read Only access — the owner has not granted download permission for this dataset.
                </div>
              )}

              {/* Expired re-request hint */}
              {isExpired && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-muted border border-border text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  Your 24-hour access window has expired.
                  {req.extensionRequested && " You indicated you may request an extension — please submit a new request."}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function MyRequests() {
  const { token }  = useAuth();
  const navigate   = useNavigate();
  const [requests,   setRequests]   = useState<AccessReq[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const fetchRequests = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const res  = await fetch("http://localhost:5000/api/access/my-requests", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load requests");
      setRequests(data.requests ?? []);
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">My Requests</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {requests.length > 0
              ? `${requests.length} access request${requests.length !== 1 ? "s" : ""} submitted`
              : "Track the status of your data access applications."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="icon" title="Refresh"
            onClick={() => fetchRequests(true)} disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => navigate("/researcher/datasets")}>
            Browse Datasets
          </Button>
        </div>
      </div>

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-dashed border-red-500/30 bg-red-500/5 text-center">
          <AlertTriangle className="h-8 w-8 text-red-400 mb-2" />
          <p className="text-sm text-red-400">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchRequests()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-5 animate-pulse">
              <div className="flex gap-4">
                <div className="h-11 w-11 rounded-xl bg-muted shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-3 bg-muted rounded w-1/3" />
                </div>
                <div className="h-6 w-20 bg-muted rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && requests.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 rounded-xl border border-dashed text-center"
        >
          <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">No Requests Yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            When you request access to a dataset, it will appear here.
          </p>
          <Button onClick={() => navigate("/researcher/datasets")}>
            Browse Datasets
          </Button>
        </motion.div>
      )}

      {/* Request cards */}
      {!loading && !error && requests.length > 0 && (
        <div className="space-y-3">
          {requests.map(r => (
            <RequestCard key={r._id} req={r} token={token} />
          ))}
        </div>
      )}
    </div>
  );
}
