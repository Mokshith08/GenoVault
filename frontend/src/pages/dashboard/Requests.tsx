import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check, X, Database, FlaskConical, ShieldCheck, KeyRound,
  AlertTriangle, Loader2, RefreshCw, Dna, HardDrive, Calendar,
  User, Shield, CheckCircle2, Clock, Search, ExternalLink,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PinInput } from "@/components/ui/PinInput";
import { useAuth } from "@/contexts/AuthContext";

// ── Dataset type from public API ─────────────────────────────────────────────
interface Dataset {
  _id: string;
  originalName: string;
  extension: ".fastq" | ".bam" | ".vcf";
  sizeBytes: number;
  description?: string;
  isEncrypted: boolean;
  ipfsStatus: "pending" | "uploading" | "done" | "failed";
  ipfsCid?: string;
  createdAt: string;
  owner: { name: string; email: string };
  blockchainFileId?: number;
}

// ── Incoming request type from /api/access/incoming-requests ─────────────────
interface IncomingRequest {
  _id: string;
  file: { _id: string; originalName: string; extension: string; blockchainFileId?: number };
  researcher: { _id: string; name: string; email: string; orcid?: string };
  reason?: string;
  status: "pending" | "approved" | "denied" | "rejected" | "revoked";
  createdAt: string;
  approvedAt?: string;
  accessExpiresAt?: string;
  // Blockchain receipt fields
  approveTxHash?: string;
  rejectTxHash?: string;
  revokeTxHash?: string;
  approveEtherscanUrl?: string;
  rejectEtherscanUrl?: string;
  revokeEtherscanUrl?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatSize(bytes: number) {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

const EXT_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  ".fastq": { bg: "bg-violet-500/15", text: "text-violet-400",  badge: "FASTQ" },
  ".bam":   { bg: "bg-cyan-500/15",   text: "text-cyan-400",    badge: "BAM"   },
  ".vcf":   { bg: "bg-emerald-500/15",text: "text-emerald-400", badge: "VCF"   },
};

const STATUS_COLORS: Record<string, string> = {
  pending:  "bg-amber-500/20 text-amber-400",
  approved: "bg-emerald-500/20 text-emerald-400",
  denied:   "bg-red-500/20 text-red-400",
  rejected: "bg-red-500/20 text-red-400",
  revoked:  "bg-zinc-500/20 text-zinc-400",
};

function IpfsPill({ status }: { status: Dataset["ipfsStatus"] }) {
  const map = {
    done:      { icon: <CheckCircle2 className="h-3 w-3" />, label: "IPFS Backed Up", cls: "bg-emerald-500/15 text-emerald-400" },
    uploading: { icon: <Clock className="h-3 w-3 animate-spin" />, label: "Backing Up…",  cls: "bg-amber-500/15 text-amber-400"   },
    pending:   { icon: <Clock className="h-3 w-3" />,          label: "IPFS Pending",  cls: "bg-muted-foreground/20 text-muted-foreground" },
    failed:    { icon: <AlertTriangle className="h-3 w-3" />,  label: "IPFS Failed",   cls: "bg-red-500/15 text-red-400"          },
  };
  const { icon, label, cls } = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {icon} {label}
    </span>
  );
}

/* ─────────────── PIN Step ─────────────── */
interface PinStepProps {
  action: "approve" | "reject";
  researcher: string;
  onSuccess: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

const PinStep = ({ action, researcher, onSuccess, onCancel, isLoading }: PinStepProps) => {
  const { pin } = useAuth();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [shake, setShake] = useState(false);
  const isApprove = action === "approve";

  const handleSubmit = () => {
    const entered = digits.join("");
    if (entered.length < 6) { toast.error("Enter all 6 digits"); return; }
    if (entered === (pin ?? "")) {
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
        <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${isApprove ? "bg-primary/20" : "bg-destructive/20"}`}>
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

/* ─────────────── Inline Modal ─────────────── */
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

type Step = "idle" | "confirm" | "pin";

/* ════════════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════════════ */
const Requests = () => {
  const { user, token } = useAuth();
  const isOwner = user?.role === "owner";

  // ── Researcher state ───────────────────────────────────────────────────────
  const [datasets,   setDatasets]   = useState<Dataset[]>([]);
  const [dsLoading,  setDsLoading]  = useState(true);
  const [dsError,    setDsError]    = useState<string | null>(null);
  const [search,     setSearch]     = useState("");
  const [requested,  setRequested]  = useState<Set<string>>(new Set());
  const [requesting, setRequesting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── Owner state ────────────────────────────────────────────────────────────
  const [incoming,    setIncoming]    = useState<IncomingRequest[]>([]);
  const [inLoading,   setInLoading]   = useState(true);
  const [inError,     setInError]     = useState<string | null>(null);
  const [inRefreshing,setInRefreshing]= useState(false);
  const [searchIn,    setSearchIn]    = useState("");
  const [step,        setStep]        = useState<Step>("idle");
  const [pending,     setPending]     = useState<{ req: IncomingRequest; action: "approve" | "reject" } | null>(null);
  const [submitting,  setSubmitting]  = useState(false);

  /* ── Researcher: load datasets ──────────────────────────────────────────── */
  const fetchDatasets = useCallback(async (silent = false) => {
    if (!token || isOwner) return;
    if (!silent) setDsLoading(true); else setRefreshing(true);
    setDsError(null);
    try {
      const res  = await fetch("http://localhost:5000/api/files/public", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load datasets");
      setDatasets(data.files ?? []);
    } catch (e: any) {
      setDsError(e.message || "Network error");
    } finally {
      setDsLoading(false);
      setRefreshing(false);
    }
  }, [token, isOwner]);

  useEffect(() => { fetchDatasets(); }, [fetchDatasets]);
  useEffect(() => {
    if (isOwner) return;
    const id = setInterval(() => fetchDatasets(true), 20_000);
    return () => clearInterval(id);
  }, [fetchDatasets, isOwner]);

  /* ── Owner: load incoming requests ─────────────────────────────────────── */
  const fetchIncoming = useCallback(async (silent = false) => {
    if (!token || !isOwner) return;
    if (!silent) setInLoading(true); else setInRefreshing(true);
    setInError(null);
    try {
      const res  = await fetch("http://localhost:5000/api/access/incoming-requests", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load requests");
      setIncoming(data.requests ?? []);
    } catch (e: any) {
      setInError(e.message || "Network error");
    } finally {
      setInLoading(false);
      setInRefreshing(false);
    }
  }, [token, isOwner]);

  useEffect(() => { fetchIncoming(); }, [fetchIncoming]);
  useEffect(() => {
    if (!isOwner) return;
    const id = setInterval(() => fetchIncoming(true), 15_000);
    return () => clearInterval(id);
  }, [fetchIncoming, isOwner]);

  /* ── Researcher: request access ─────────────────────────────────────────── */
  const requestAccess = async (ds: Dataset) => {
    if (requested.has(ds._id) || requesting === ds._id) return;
    setRequesting(ds._id);
    try {
      const res  = await fetch("http://localhost:5000/api/access/request-access", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fileId: ds._id }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setRequested(prev => new Set(prev).add(ds._id));
          toast.info(`Already requested access for ${ds.originalName}`);
          return;
        }
        throw new Error(data.message || "Request failed");
      }
      setRequested(prev => new Set(prev).add(ds._id));
      toast.success(`Access requested for ${ds.originalName}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to submit request");
    } finally {
      setRequesting(null);
    }
  };

  /* ── Owner: approve / reject helpers ─────────────────────────────────────── */
  const openDialog  = (req: IncomingRequest, action: "approve" | "reject") => {
    setPending({ req, action });
    setStep("confirm");
  };
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
          : "Request rejected"
      );
      fetchIncoming(true);
      closeDialog();
    } catch (e: any) {
      toast.error(e.message || "Failed");
      setSubmitting(false);
    }
  };

  /* ── Owner: revoke an approved request ─────────────────────────────────── */
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

  /* ── Researcher filtered datasets ─────────────────────────────────────── */
  const filteredDs = datasets.filter(d =>
    search.trim() === "" ||
    d.originalName.toLowerCase().includes(search.toLowerCase()) ||
    d.owner?.name?.toLowerCase().includes(search.toLowerCase()) ||
    d.description?.toLowerCase().includes(search.toLowerCase())
  );

  /* ── Owner filtered incoming ──────────────────────────────────────────── */
  const filteredIn = incoming.filter(r =>
    searchIn.trim() === "" ||
    r.researcher.name.toLowerCase().includes(searchIn.toLowerCase()) ||
    r.file.originalName.toLowerCase().includes(searchIn.toLowerCase())
  );

  /* ════════════════════════════════════════════════════════════════
     RESEARCHER VIEW
  ════════════════════════════════════════════════════════════════ */
  if (!isOwner) {
    return (
      <>
        <PageHeader
          title="Datasets"
          description={
            datasets.length > 0
              ? `${datasets.length} genomic dataset${datasets.length !== 1 ? "s" : ""} available.`
              : "Browse available genomic datasets and request access."
          }
        />

        {/* Search + Refresh */}
        <div className="flex items-center gap-2 mb-6">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search datasets…"
              className="pl-9"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <Button variant="outline" size="icon" title="Refresh" onClick={() => fetchDatasets(true)} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Loading */}
        {dsLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3 animate-pulse">
                <div className="flex gap-3">
                  <div className="h-11 w-11 rounded-xl bg-muted" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/3" />
                  </div>
                </div>
                <div className="h-3 bg-muted rounded w-full" />
                <div className="h-9 bg-muted rounded-lg w-full mt-2" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!dsLoading && dsError && (
          <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-red-500/30 bg-red-500/5">
            <AlertTriangle className="h-10 w-10 text-red-400 mb-3" />
            <p className="text-sm font-medium text-red-400">{dsError}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => fetchDatasets()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
            </Button>
          </div>
        )}

        {/* Empty */}
        {!dsLoading && !dsError && filteredDs.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center text-center py-20 rounded-xl border border-dashed"
          >
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Database className="h-8 w-8 text-muted-foreground" />
            </div>
            {datasets.length === 0 ? (
              <>
                <h3 className="text-lg font-semibold mb-1">No Datasets Available Yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Genomic files uploaded by data owners will appear here automatically.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold mb-1">No Results</h3>
                <p className="text-sm text-muted-foreground">No datasets match your search.</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setSearch("")}>Clear Search</Button>
              </>
            )}
          </motion.div>
        )}

        {/* Dataset grid */}
        {!dsLoading && !dsError && filteredDs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredDs.map((ds, i) => {
              const ext = EXT_COLORS[ds.extension] ?? EXT_COLORS[".vcf"];
              const isRequested  = requested.has(ds._id);
              const isRequesting = requesting === ds._id;
              return (
                <motion.div key={ds._id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Card className="p-5 shadow-card hover:shadow-elegant transition-all h-full flex flex-col hover:border-primary/40 group">
                    <div className="flex items-start justify-between mb-3">
                      <div className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 ${ext.bg}`}>
                        <Dna className={`h-5 w-5 ${ext.text}`} />
                      </div>
                      <div className="flex items-center gap-2">
                        {ds.isEncrypted && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400">
                            <Shield className="h-3 w-3" /> Encrypted
                          </span>
                        )}
                        <Badge variant="secondary" className={`${ext.text} border-0`}>{ext.badge}</Badge>
                      </div>
                    </div>
                    <h3 className="font-semibold truncate text-sm" title={ds.originalName}>{ds.originalName}</h3>
                    <div className="flex flex-col gap-1 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 flex-shrink-0" />
                        {ds.owner?.name ?? "Unknown Owner"}
                      </span>
                      <div className="flex gap-3">
                        <span className="flex items-center gap-1.5"><HardDrive className="h-3.5 w-3.5" />{formatSize(ds.sizeBytes)}</span>
                        <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{formatDate(ds.createdAt)}</span>
                      </div>
                    </div>
                    {ds.description && (
                      <p className="text-sm text-muted-foreground mt-3 flex-1 line-clamp-2">{ds.description}</p>
                    )}
                    <div className="mt-3 mb-1"><IpfsPill status={ds.ipfsStatus} /></div>
                    <Button
                      className="mt-3 w-full"
                      variant={isRequested ? "secondary" : "default"}
                      disabled={isRequested || isRequesting}
                      onClick={() => requestAccess(ds)}
                    >
                      {isRequesting ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Requesting…</>
                      ) : isRequested ? (
                        <><Check className="h-4 w-4 mr-1" />Requested</>
                      ) : (
                        <><FlaskConical className="h-4 w-4 mr-1.5" />Request Access</>
                      )}
                    </Button>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </>
    );
  }

  /* ════════════════════════════════════════════════════════════════
     OWNER VIEW — real incoming requests
  ════════════════════════════════════════════════════════════════ */
  return (
    <>
      <PageHeader
        title="Access Requests"
        description="Review and manage researcher access requests. All decisions are recorded on the blockchain."
        actions={
          <Button variant="outline" size="sm" onClick={() => fetchIncoming(true)} disabled={inRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${inRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* Search */}
      <div className="relative mb-5 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by researcher or file…"
          className="pl-9"
          value={searchIn}
          onChange={e => setSearchIn(e.target.value)}
        />
      </div>

      {/* Loading */}
      {inLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
                <div className="flex gap-2">
                  <div className="h-9 w-20 bg-muted rounded-lg" />
                  <div className="h-9 w-20 bg-muted rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {!inLoading && inError && (
        <div className="flex flex-col items-center py-12 text-center rounded-xl border border-dashed border-red-500/30 bg-red-500/5">
          <AlertTriangle className="h-8 w-8 text-red-400 mb-2" />
          <p className="text-sm text-red-400">{inError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchIncoming()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      )}

      {/* Empty */}
      {!inLoading && !inError && filteredIn.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center py-20 text-center rounded-xl border border-dashed"
        >
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <ShieldCheck className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-1">
            {incoming.length === 0 ? "No Requests Yet" : "No Results"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {incoming.length === 0
              ? "When researchers request access to your files, they'll appear here."
              : "No requests match your search."}
          </p>
        </motion.div>
      )}

      {/* Request list */}
      {!inLoading && !inError && filteredIn.length > 0 && (
        <div className="space-y-3">
          {filteredIn.map((r, i) => {
            const statusCls = STATUS_COLORS[r.status] ?? "bg-zinc-500/20 text-zinc-400";
            return (
              <motion.div key={r._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="p-5 shadow-card">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-semibold text-sm">{r.researcher.name}</h3>
                        <Badge variant="outline" className="text-xs">{r.researcher.email}</Badge>
                        {r.researcher.orcid && (
                          <Badge variant="outline" className="text-xs font-mono text-blue-400 border-blue-400/30">{r.researcher.orcid}</Badge>
                        )}
                        <Badge className={`text-xs capitalize ${statusCls}`}>{r.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        File: <span className="font-mono text-foreground text-xs">{r.file.originalName}</span>
                      </p>
                      {r.reason && (
                        <p className="text-xs text-muted-foreground mt-0.5">Reason: {r.reason}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">Requested {formatDate(r.createdAt)}</p>

                      {/* Blockchain receipt links */}
                      {(r.approveTxHash || r.rejectTxHash || r.revokeTxHash) && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {r.approveEtherscanUrl && (
                            <a href={r.approveEtherscanUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline">
                              <ExternalLink className="h-3 w-3" />Approve tx
                            </a>
                          )}
                          {r.rejectEtherscanUrl && (
                            <a href={r.rejectEtherscanUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-red-400 hover:underline">
                              <ExternalLink className="h-3 w-3" />Reject tx
                            </a>
                          )}
                          {r.revokeEtherscanUrl && (
                            <a href={r.revokeEtherscanUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:underline">
                              <ExternalLink className="h-3 w-3" />Revoke tx
                            </a>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                      {r.status === "pending" && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => openDialog(r, "reject")}>
                            <X className="h-4 w-4 mr-1" />Reject
                          </Button>
                          <Button size="sm" onClick={() => openDialog(r, "approve")} className="bg-gradient-primary hover:opacity-90 shadow-elegant">
                            <Check className="h-4 w-4 mr-1" />Approve
                          </Button>
                        </>
                      )}
                      {r.status === "approved" && (() => {
                        const isExpired = r.accessExpiresAt
                          ? new Date(r.accessExpiresAt).getTime() <= Date.now()
                          : false;
                        return isExpired ? (
                          <span className="text-xs text-muted-foreground italic px-2">Access expired</span>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => revokeAccess(r)}
                            className="text-destructive border-destructive/30 hover:bg-destructive/10">
                            <RotateCcw className="h-4 w-4 mr-1" />Revoke
                          </Button>
                        );
                      })()}
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {step === "confirm" && pending && (
          <Modal onClose={closeDialog}>
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${pending.action === "approve" ? "bg-primary/20" : "bg-destructive/20"}`}>
                  {pending.action === "approve"
                    ? <ShieldCheck className="h-5 w-5 text-primary" />
                    : <AlertTriangle className="h-5 w-5 text-destructive" />}
                </div>
                <div>
                  <p className="font-semibold text-sm">
                    {pending.action === "approve" ? "Approve Access?" : "Reject Request?"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Are you sure you want to <span className={`font-medium ${pending.action === "approve" ? "text-primary" : "text-destructive"}`}>{pending.action}</span> the request from{" "}
                    <span className="text-foreground font-medium">{pending.req.researcher.name}</span>?
                  </p>
                </div>
              </div>
              <div className={`rounded-xl border p-3 text-xs ${pending.action === "approve" ? "border-primary/20 bg-primary/5 text-primary" : "border-destructive/20 bg-destructive/5 text-destructive"}`}>
                {pending.action === "approve"
                  ? "A 24-hour blockchain-verified access grant will be created. All events are recorded on Sepolia Testnet."
                  : "The request will be permanently rejected on the blockchain."}
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={closeDialog}>No, go back</Button>
                <Button
                  className={`flex-1 ${pending.action === "approve" ? "bg-gradient-primary hover:opacity-90 text-primary-foreground" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}`}
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
