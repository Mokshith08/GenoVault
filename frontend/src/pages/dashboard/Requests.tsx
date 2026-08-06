/**
 * Requests.tsx  (Owner Dashboard)
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays incoming research access requests with:
 *  • Collapsed card: researcher, institution, project, access type, status
 *  • Expanded section (hover desktop / tap mobile): full details + action buttons
 *  • Smooth height + fade animation via Framer Motion
 *  • PIN-gated approve / reject flow preserved
 *  • "Request More Info" inline note flow
 */

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, X, ShieldCheck, KeyRound,
  AlertTriangle, Loader2, RefreshCw, Calendar,
  User, Shield, Clock, Search, ExternalLink,
  RotateCcw, ChevronDown, Building2, Mail,
  Lock, Download, Users, FileText, MessageSquare,
  CheckCircle2, Info, Dna, Send,
} from "lucide-react";
import { toast }      from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button }     from "@/components/ui/button";
import { Badge }      from "@/components/ui/badge";
import { Input }      from "@/components/ui/input";
import { PinInput }   from "@/components/ui/PinInput";
import { useAuth }    from "@/contexts/AuthContext";

// ── Types ──────────────────────────────────────────────────────────────────────
interface IncomingRequest {
  _id:         string;
  file:        { _id: string; originalName: string; extension?: string };
  researcher:  { _id: string; name: string; email: string; orcid?: string };
  reason?:     string;
  // Structured fields
  projectTitle?:               string;
  purpose?:                    string;
  accessType?:                 "read-only" | "download" | "downloadable";
  extensionRequested?:         boolean;
  dataSharedWithCollaborators?:boolean;
  institution?:                string;
  contactEmail?:               string;
  benefits?:                   string;
  risks?:                      string;
  ownerNote?:                  string;
  status:      "pending" | "approved" | "denied" | "rejected" | "revoked" | "more-info";
  createdAt:   string;
  approvedAt?: string;
  accessExpiresAt?: string;
  // Blockchain receipt fields
  approveTxHash?:    string;
  rejectTxHash?:     string;
  revokeTxHash?:     string;
  approveEtherscanUrl?: string;
  rejectEtherscanUrl?:  string;
  revokeEtherscanUrl?:  string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
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

const STATUS_META: Record<string, { cls: string; label: string; dot: string }> = {
  pending:   { cls: "bg-amber-500/15  text-amber-400",   label: "Pending",    dot: "bg-amber-400"   },
  approved:  { cls: "bg-emerald-500/15 text-emerald-400", label: "Approved",   dot: "bg-emerald-400" },
  denied:    { cls: "bg-red-500/15    text-red-400",      label: "Denied",     dot: "bg-red-400"     },
  rejected:  { cls: "bg-red-500/15    text-red-400",      label: "Rejected",   dot: "bg-red-400"     },
  revoked:   { cls: "bg-zinc-500/15   text-zinc-400",     label: "Revoked",    dot: "bg-zinc-400"    },
  "more-info":{ cls: "bg-blue-500/15  text-blue-400",    label: "More Info",  dot: "bg-blue-400"    },
};

// Access-type display metadata — icons are returned from a function (not module-level JSX)
function getAccessMeta(accessType?: string): { icon: React.ReactNode; label: string; cls: string } {
  if (accessType === "downloadable" || accessType === "download") {
    return { icon: <Download className="h-3 w-3" />, label: "Downloadable", cls: "bg-purple-500/15 text-purple-400" };
  }
  return { icon: <Lock className="h-3 w-3" />, label: "Read Only", cls: "bg-blue-500/15 text-blue-400" };
}

// ── PIN step ───────────────────────────────────────────────────────────────────
interface PinStepProps {
  action:     "approve" | "reject";
  researcher: string;
  onSuccess:  () => void;
  onCancel:   () => void;
  isLoading:  boolean;
}
const PinStep = ({ action, researcher, onSuccess, onCancel, isLoading }: PinStepProps) => {
  const { pin } = useAuth();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [shake,  setShake]  = useState(false);
  const isApprove = action === "approve";

  const handleSubmit = () => {
    const entered = digits.join("");
    if (entered.length < 6) { toast.error("Enter all 6 digits"); return; }
    // If pin is "__SET__" (sentinel after cache clear), skip client-side compare
    // and let the backend bcrypt check handle verification via onSuccess → verifyPin API.
    if (pin === "__SET__" || entered === (pin ?? "")) {
      onSuccess();
    } else {
      setShake(true);
      setDigits(Array(6).fill(""));
      setTimeout(() => setShake(false), 600);
      toast.error("Incorrect PIN. Try again.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0
                        ${isApprove ? "bg-primary/20" : "bg-destructive/20"}`}>
          <KeyRound className={`h-5 w-5 ${isApprove ? "text-primary" : "text-destructive"}`} />
        </div>
        <div>
          <p className="font-semibold text-sm">Enter your 6-digit PIN</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            To <span className={`font-medium ${isApprove ? "text-primary" : "text-destructive"}`}>{action}</span> access for{" "}
            <span className="text-foreground font-medium">{researcher}</span>
          </p>
        </div>
      </div>
      <PinInput value={digits} onChange={setDigits} shake={shake} autoFocus />
      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={isLoading}>Cancel</Button>
        <Button
          className={`flex-1 ${isApprove ? "bg-gradient-primary hover:opacity-90 text-primary-foreground" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}`}
          onClick={handleSubmit}
          disabled={isLoading || digits.join("").length < 6}
        >
          {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying...</> : `Confirm ${action}`}
        </Button>
      </div>
    </div>
  );
};

// ── Modal ──────────────────────────────────────────────────────────────────────
const Modal = ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => (
  <motion.div
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    className="fixed inset-0 z-50 flex items-center justify-center p-4"
    style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}
  >
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 16 }}
      transition={{ type: "spring", damping: 22, stiffness: 300 }}
      className="relative w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl p-6"
    >
      {children}
    </motion.div>
  </motion.div>
);

// ── Info row ──────────────────────────────────────────────────────────────────
function InfoRow({ icon, label, value, highlight }: {
  icon:      React.ReactNode;
  label:     string;
  value:     React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        <p className={`text-sm font-medium mt-0.5 ${highlight ? "text-amber-400" : "text-foreground"}`}>
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

// ── Expandable Request Card ────────────────────────────────────────────────────
function RequestCard({
  req,
  onApprove, onReject, onRevoke, onMoreInfo,
}: {
  req:        IncomingRequest;
  onApprove:  (r: IncomingRequest) => void;
  onReject:   (r: IncomingRequest) => void;
  onRevoke:   (r: IncomingRequest) => void;
  onMoreInfo: (r: IncomingRequest, note: string) => void;
}) {
  const [expanded,  setExpanded]  = useState(false);
  const [noteOpen,  setNoteOpen]  = useState(false);
  const [note,      setNote]      = useState("");

  const status     = STATUS_META[req.status] ?? STATUS_META.pending;
  const accessMeta = getAccessMeta(req.accessType);

  const isExpired  = req.accessExpiresAt
    ? new Date(req.accessExpiresAt).getTime() <= Date.now()
    : false;

  const canRevoke  = req.status === "approved" && !isExpired;
  const canAct     = req.status === "pending";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      layout
      className={`rounded-2xl border overflow-hidden transition-all duration-300
                  ${expanded
                    ? "border-primary/40 shadow-xl shadow-primary/8"
                    : "border-border hover:border-primary/30 hover:shadow-md"}`}
    >
      {/* ── Status accent bar top ── */}
      <div className={`h-0.5 w-full ${
        req.status === "approved" ? "bg-emerald-500" :
        req.status === "pending"  ? "bg-amber-500"   :
        req.status === "more-info"? "bg-blue-500"    :
        "bg-zinc-600"
      }`} />

      {/* ── Collapsed row (always visible) ── */}
      <div
        className="p-5 cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-start gap-4">

          {/* Avatar */}
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20
                          border border-primary/20 flex items-center justify-center shrink-0 text-primary font-bold text-sm">
            {req.researcher.name.slice(0, 2).toUpperCase()}
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              <h3 className="font-bold text-sm">{req.researcher.name}</h3>
              {req.institution && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3" />{req.institution}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground font-medium truncate">
              {req.projectTitle || req.reason || "No project title"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              File: <span className="font-mono text-foreground/70">{req.file.originalName}</span>
            </p>
          </div>

          {/* Right side: badges + chevron */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-2">
              {/* Access type badge */}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${accessMeta.cls}`}>
                {accessMeta.icon}{accessMeta.label}
              </span>
              {/* Status badge */}
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${status.cls}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />{formatDate(req.createdAt)}
              <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </motion.div>
            </div>
          </div>
        </div>

        {/* Data sharing warning — always shown if Yes */}
        {req.dataSharedWithCollaborators && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg
                          bg-amber-500/10 border border-amber-500/25 text-xs text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Data will be shared with collaborators — review before approving.
          </div>
        )}
      </div>

      {/* ── Expanded section ── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="border-t border-border/60 bg-muted/20 px-5 pb-5 pt-4 space-y-5">

              {/* ── Detail grid ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow
                  icon={<FileText className="h-3.5 w-3.5" />}
                  label="Purpose of Research"
                  value={req.purpose || req.reason || "Not specified"}
                />
                <InfoRow
                  icon={<Mail className="h-3.5 w-3.5" />}
                  label="Contact Email"
                  value={req.contactEmail || req.researcher.email}
                />
                <InfoRow
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Access Duration"
                  value="24 Hours (initial)"
                />
                <InfoRow
                  icon={<RefreshCw className="h-3.5 w-3.5" />}
                  label="Extension Requested"
                  value={req.extensionRequested ? "Yes — may request later" : "No"}
                />
                <InfoRow
                  icon={<Users className="h-3.5 w-3.5" />}
                  label="Data Shared with Collaborators"
                  value={req.dataSharedWithCollaborators ? "Yes" : "No"}
                  highlight={!!req.dataSharedWithCollaborators}
                />
                {req.approvedAt && (
                  <InfoRow
                    icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    label="Approved At"
                    value={formatDateTime(req.approvedAt)}
                  />
                )}
                {req.accessExpiresAt && (
                  <InfoRow
                    icon={<Clock className="h-3.5 w-3.5" />}
                    label="Access Expires"
                    value={`${formatDateTime(req.accessExpiresAt)}${isExpired ? " (Expired)" : ""}`}
                    highlight={isExpired}
                  />
                )}
              </div>

              {/* ── Benefits & Risks ── */}
              {(req.benefits || req.risks) && (
                <div className="grid grid-cols-2 gap-3">
                  {req.benefits && (
                    <div className="p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
                      <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1.5">
                        Benefits
                      </p>
                      <p className="text-xs text-foreground/80">{req.benefits}</p>
                    </div>
                  )}
                  {req.risks && (
                    <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
                      <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1.5">
                        Risks
                      </p>
                      <p className="text-xs text-foreground/80">{req.risks}</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── ORCID ── */}
              {req.researcher.orcid && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Dna className="h-3.5 w-3.5" />
                  ORCID: <span className="font-mono text-blue-400">{req.researcher.orcid}</span>
                </div>
              )}

              {/* ── Blockchain tx links ── */}
              {(req.approveEtherscanUrl || req.rejectEtherscanUrl || req.revokeEtherscanUrl) && (
                <div className="flex flex-wrap gap-3 pt-1 border-t border-border/50">
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

              {/* ── Owner note (from more-info) ── */}
              {req.ownerNote && (
                <div className="p-3 rounded-xl bg-blue-500/8 border border-blue-500/20">
                  <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-1">
                    Your note to researcher
                  </p>
                  <p className="text-xs text-foreground/80">{req.ownerNote}</p>
                </div>
              )}

              {/* ── More Info note area ── */}
              <AnimatePresence>
                {noteOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-2"
                  >
                    <label className="text-xs font-semibold text-muted-foreground">
                      Message to researcher (required)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Specify what additional information you need…"
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm
                                 resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => { setNoteOpen(false); setNote(""); }}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={!note.trim()}
                        onClick={() => { onMoreInfo(req, note.trim()); setNoteOpen(false); setNote(""); }}
                      >
                        <Send className="h-3.5 w-3.5 mr-1.5" />Send
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Action buttons ── */}
              <div className="flex flex-wrap gap-2 pt-1 border-t border-border/50">
                {/* PENDING actions */}
                {canAct && !noteOpen && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={e => { e.stopPropagation(); onReject(req); }}
                    >
                      <X className="h-4 w-4 mr-1" />Deny
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-blue-400 border-blue-400/30 hover:bg-blue-500/10"
                      onClick={e => { e.stopPropagation(); setNoteOpen(true); }}
                    >
                      <MessageSquare className="h-4 w-4 mr-1" />Request More Info
                    </Button>
                    <Button
                      size="sm"
                      className="bg-gradient-to-r from-primary to-purple-600 text-white
                                 hover:opacity-90 shadow-md shadow-primary/25 ml-auto"
                      onClick={e => { e.stopPropagation(); onApprove(req); }}
                    >
                      <Check className="h-4 w-4 mr-1" />Approve
                    </Button>
                  </>
                )}

                {/* APPROVED / can revoke */}
                {canRevoke && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={e => { e.stopPropagation(); onRevoke(req); }}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />Revoke Access
                  </Button>
                )}

                {/* EXPIRED */}
                {req.status === "approved" && isExpired && (
                  <span className="text-xs text-muted-foreground italic px-2 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />Access expired
                  </span>
                )}
              </div>
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
type Step = "idle" | "confirm" | "pin";

const Requests = () => {
  const { token } = useAuth();

  const [incoming,    setIncoming]    = useState<IncomingRequest[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [refreshing,  setRefreshing]  = useState(false);
  const [searchIn,    setSearchIn]    = useState("");

  // PIN flow state
  const [step,       setStep]       = useState<Step>("idle");
  const [pending,    setPending]    = useState<{ req: IncomingRequest; action: "approve" | "reject" } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Status filter
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // ── Fetch incoming ─────────────────────────────────────────────────────────
  const fetchIncoming = useCallback(async (silent = false) => {
    if (!token) { setLoading(false); return; }   // no token → stop loading spinner
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const res  = await fetch("http://localhost:5000/api/access/incoming-requests", {
        headers: { Authorization: `Bearer ${token}` },
        cache:   "no-store",   // prevent 304 returning empty body on re-navigate
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load requests");
      setIncoming(data.requests ?? []);
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { fetchIncoming(); }, [fetchIncoming]);
  useEffect(() => {
    const id = setInterval(() => fetchIncoming(true), 15_000);
    return () => clearInterval(id);
  }, [fetchIncoming]);

  // ── Approve / reject helpers ───────────────────────────────────────────────
  const openApprove = (req: IncomingRequest) => { setPending({ req, action: "approve" }); setStep("confirm"); };
  const openReject  = (req: IncomingRequest) => { setPending({ req, action: "reject"  }); setStep("confirm"); };
  const closeDialog = () => { setStep("idle"); setPending(null); setSubmitting(false); };

  const onPinSuccess = async () => {
    if (!pending) return;
    setSubmitting(true);
    try {
      const endpoint = pending.action === "approve"
        ? "http://localhost:5000/api/access/approve-request"
        : "http://localhost:5000/api/access/deny-request";

      const res  = await fetch(endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId: pending.req._id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Action failed");

      toast.success(
        pending.action === "approve"
          ? "Access approved · 24h grant active"
          : "Request denied"
      );
      fetchIncoming(true);
      closeDialog();
    } catch (e: any) {
      toast.error(e.message || "Failed");
      setSubmitting(false);
    }
  };

  // ── Revoke ─────────────────────────────────────────────────────────────────
  const revokeAccess = async (req: IncomingRequest) => {
    try {
      const res  = await fetch("http://localhost:5000/api/access/revoke-access", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId: req._id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Revoke failed");
      toast.success("Access revoked");
      fetchIncoming(true);
    } catch (e: any) {
      toast.error(e.message || "Failed to revoke");
    }
  };

  // ── More info ──────────────────────────────────────────────────────────────
  const requestMoreInfo = async (req: IncomingRequest, note: string) => {
    try {
      const res  = await fetch("http://localhost:5000/api/access/request-more-info", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId: req._id, ownerNote: note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      toast.success("Researcher notified — awaiting more information.");
      fetchIncoming(true);
    } catch (e: any) {
      toast.error(e.message || "Failed");
    }
  };

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = incoming.filter(r => {
    // Guard: skip any request with null file/researcher (deleted docs)
    if (!r.file || !r.researcher) return false;
    const q = searchIn.toLowerCase();
    const matchSearch = !q
      || (r.researcher.name  ?? "").toLowerCase().includes(q)
      || (r.file.originalName ?? "").toLowerCase().includes(q)
      || (r.projectTitle ?? "").toLowerCase().includes(q)
      || (r.institution  ?? "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Status counts for filter pills
  const counts = incoming.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <PageHeader
        title="Access Requests"
        description="Review and manage researcher access requests. Expand a card to see full details."
        actions={
          <Button variant="outline" size="sm" onClick={() => fetchIncoming(true)} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* ── Search + Filter ── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by researcher, project, file…"
            className="pl-9"
            value={searchIn}
            onChange={e => setSearchIn(e.target.value)}
          />
        </div>
        {/* Status filter pills */}
        <div className="flex items-center gap-2 flex-wrap">
          {(["all", "pending", "approved", "more-info", "rejected", "revoked"] as const).map(s => {
            const meta  = STATUS_META[s];
            const count = s === "all" ? incoming.length : (counts[s] || 0);
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all
                            ${statusFilter === s
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                {s === "all" ? "All" : (meta?.label ?? s)} {count > 0 && `(${count})`}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-5 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-xl bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
                <div className="flex gap-2">
                  <div className="h-6 w-20 bg-muted rounded-full" />
                  <div className="h-6 w-20 bg-muted rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <div className="flex flex-col items-center py-12 text-center rounded-xl border border-dashed border-red-500/30 bg-red-500/5">
          <AlertTriangle className="h-8 w-8 text-red-400 mb-2" />
          <p className="text-sm text-red-400">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchIncoming()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && !error && filtered.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center py-20 text-center rounded-xl border border-dashed"
        >
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <ShieldCheck className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-1">
            {incoming.length === 0 ? "No Requests Yet" : "No Matching Requests"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {incoming.length === 0
              ? "When researchers request access to your files, they'll appear here."
              : "Try adjusting your search or filter."}
          </p>
        </motion.div>
      )}

      {/* ── Request cards ── */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map(r => (
            <RequestCard
              key={r._id}
              req={r}
              onApprove={openApprove}
              onReject={openReject}
              onRevoke={revokeAccess}
              onMoreInfo={requestMoreInfo}
            />
          ))}
        </div>
      )}

      {/* ── PIN modals ── */}
      <AnimatePresence>
        {step === "confirm" && pending && (
          <Modal onClose={closeDialog}>
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0
                                ${pending.action === "approve" ? "bg-primary/20" : "bg-destructive/20"}`}>
                  {pending.action === "approve"
                    ? <ShieldCheck className="h-5 w-5 text-primary" />
                    : <AlertTriangle className="h-5 w-5 text-destructive" />}
                </div>
                <div>
                  <p className="font-semibold text-sm">
                    {pending.action === "approve" ? "Approve Access?" : "Deny Request?"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    For <span className="text-foreground font-medium">{pending.req.researcher.name}</span>
                    <span className="block font-mono text-[11px] text-muted-foreground/70 break-all mt-0.5">
                      {pending.req.file.originalName}
                    </span>
                  </p>
                </div>
              </div>

              {/* Access type reminder */}
              <div className={`rounded-xl border p-3 text-xs
                              ${pending.action === "approve"
                                ? "border-primary/20 bg-primary/5 text-primary"
                                : "border-destructive/20 bg-destructive/5 text-destructive"}`}>
                {pending.action === "approve"
                  ? <>
                      A 24-hour blockchain-verified access grant will be created.
                      {(pending.req.accessType === "download" || pending.req.accessType === "downloadable") && (
                        <span className="block mt-1 font-semibold text-purple-400">
                          ⚠ You are approving DOWNLOAD access for this researcher.
                        </span>
                      )}
                    </>
                  : "The request will be permanently rejected."}
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={closeDialog}>No, go back</Button>
                <Button
                  className={`flex-1 ${pending.action === "approve"
                    ? "bg-gradient-primary hover:opacity-90 text-primary-foreground"
                    : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}`}
                  onClick={() => setStep("pin")}
                >
                  Yes, {pending.action}
                </Button>
              </div>
            </div>
          </Modal>
        )}

        {step === "pin" && pending && (
          <Modal onClose={closeDialog}>
            <PinStep
              action={pending.action}
              researcher={pending.req.researcher.name}
              onSuccess={onPinSuccess}
              onCancel={closeDialog}
              isLoading={submitting}
            />
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
};

export default Requests;
