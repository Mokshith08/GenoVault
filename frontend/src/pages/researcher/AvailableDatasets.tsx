import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Database, RefreshCw, Shield, Dna,
  Calendar, HardDrive, CheckCircle2, Clock,
  AlertTriangle, SlidersHorizontal, X, Globe,
  Activity, Dna as DnaIcon, FlaskConical, Hash,
  ChevronRight, Info, LockKeyhole, Timer,
} from "lucide-react";
import { Input }  from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge }  from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { toast }   from "sonner";
import { RequestAccessForm } from "./RequestAccessForm";
import { apiFetch } from "@/lib/apiFetch";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Dataset {
  _id:            string;
  originalName:   string;
  extension:      ".fastq" | ".bam" | ".vcf";
  sizeBytes:      number;
  description?:   string;
  isEncrypted:    boolean;
  ipfsStatus:     "pending" | "uploading" | "done" | "failed";
  ipfsCid?:       string;
  createdAt:      string;
  // Owner: anonymized — NO name/email
  owner: {
    age?:     number | null;
    gender?:  string | null;
    country?: string | null;
  };
  // Catalog metadata
  datasetId?:        string;
  availability?:     "Available" | "Restricted";
  genomeBuild?:      string | null;
  sequencingType?:   string | null;
  riskCategory?:     string | null;
  qualityScore?:     string | null;
  detectedVariants?: string[];
  predictedRisks?:   string[];
  phenotype?:        string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatSize(bytes: number) {
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const EXT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  ".fastq": { bg: "bg-violet-500/10", text: "text-violet-400",  border: "border-violet-500/30"  },
  ".bam":   { bg: "bg-cyan-500/10",   text: "text-cyan-400",    border: "border-cyan-500/30"    },
  ".vcf":   { bg: "bg-emerald-500/10",text: "text-emerald-400", border: "border-emerald-500/30" },
};
const EXT_LABELS: Record<string, string> = {
  ".fastq": "FASTQ",
  ".bam":   "BAM",
  ".vcf":   "VCF",
};
const QUALITY_COLORS: Record<string, string> = {
  High:   "text-emerald-400 bg-emerald-500/10",
  Medium: "text-amber-400 bg-amber-500/10",
  Low:    "text-red-400 bg-red-500/10",
};

// ── IPFS pill ─────────────────────────────────────────────────────────────────
function IpfsPill({ status }: { status: Dataset["ipfsStatus"] }) {
  const map = {
    done:      { icon: <CheckCircle2 className="h-2.5 w-2.5" />, label: "IPFS Backed Up", cls: "bg-emerald-500/10 text-emerald-400" },
    uploading: { icon: <Clock className="h-2.5 w-2.5 animate-spin" />, label: "Backing Up…", cls: "bg-amber-500/10 text-amber-400" },
    pending:   { icon: <Clock className="h-2.5 w-2.5" />, label: "IPFS Pending", cls: "bg-muted-foreground/15 text-muted-foreground" },
    failed:    { icon: <AlertTriangle className="h-2.5 w-2.5" />, label: "IPFS Failed", cls: "bg-red-500/10 text-red-400" },
  };
  const { icon, label, cls } = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>
      {icon} {label}
    </span>
  );
}

// ── Tag list ──────────────────────────────────────────────────────────────────
function TagList({ items, color = "bg-primary/10 text-primary" }: { items?: string[]; color?: string }) {
  if (!items || items.length === 0) return <span className="text-muted-foreground/50 text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map(t => (
        <span key={t} className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{t}</span>
      ))}
    </div>
  );
}

// ── Row: label + value ────────────────────────────────────────────────────────
function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-muted-foreground w-[130px] flex-shrink-0 text-xs">{label}</span>
      <span className="font-medium text-foreground">{value || "—"}</span>
    </div>
  );
}

// ── Hover detail panel ────────────────────────────────────────────────────────
function HoverPanel({ ds }: { ds: Dataset }) {
  const hasVariants = ds.detectedVariants && ds.detectedVariants.length > 0;
  const hasRisks    = ds.predictedRisks   && ds.predictedRisks.length   > 0;
  const hasPhenotype= ds.phenotype        && ds.phenotype.length        > 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1,    y: 0    }}
      exit={{   opacity: 0, scale: 0.95, y: -4    }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="absolute left-0 right-0 top-full mt-2 z-50 rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
      style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}
    >
      <div className="h-0.5 bg-gradient-to-r from-primary via-emerald-400 to-teal-500" />
      <div className="p-4 space-y-4">

        {/* ── Genomic tech ── */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Genomic Details</p>
          <Row label="Genome Build"  value={ds.genomeBuild} />
          <Row label="File Format"   value={EXT_LABELS[ds.extension] ?? ds.extension} />
          <Row label="Quality Score" value={ds.qualityScore} />
          <Row label="Sequencing"    value={ds.sequencingType} />
        </div>

        {/* ── Detected Variants ── */}
        {hasVariants && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
              Detected Variants
            </p>
            <TagList items={ds.detectedVariants} color="bg-rose-500/10 text-rose-400" />
          </div>
        )}

        {/* ── Predicted Risks ── */}
        {hasRisks && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
              Predicted Genetic Risks
            </p>
            <TagList items={ds.predictedRisks} color="bg-amber-500/10 text-amber-400" />
          </div>
        )}

        {/* ── Phenotype ── */}
        {hasPhenotype && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
              Phenotype (User Confirmed)
            </p>
            <TagList items={ds.phenotype} color="bg-violet-500/10 text-violet-400" />
          </div>
        )}

        {/* ── IPFS status only — no download link for researchers ── */}
        <div className="pt-2 border-t border-border/50 flex items-center gap-2">
          <IpfsPill status={ds.ipfsStatus} />
        </div>

        <p className="text-center text-[11px] text-muted-foreground/60 flex items-center justify-center gap-1">
          <Info className="h-3 w-3" /> Hover away to close
        </p>
      </div>
    </motion.div>
  );
}

// ── Countdown hook ────────────────────────────────────────────────────────────
function useCooldownCountdown(cooldownUntil?: string): string {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!cooldownUntil) { setLabel(""); return; }
    const update = () => {
      const diff = new Date(cooldownUntil).getTime() - Date.now();
      if (diff <= 0) { setLabel(""); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setLabel(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);
    };
    update();
    const id = setInterval(update, 1_000);
    return () => clearInterval(id);
  }, [cooldownUntil]);
  return label;
}

// ── Dataset Card ──────────────────────────────────────────────────────────────
function DatasetCard({
  ds, index, onRequestAccess, fileStatus, requesting, cooldownUntil,
}: {
  ds:             Dataset;
  index:          number;
  onRequestAccess:(ds: Dataset) => void;
  fileStatus:     string;   // "none" | "pending" | "approved" | "cooldown"
  requesting:     string | null;
  cooldownUntil?: string;   // ISO timestamp — only set when fileStatus==="cooldown"
}) {
  const [hovered, setHovered] = useState(false);
  const hoverTimer            = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ext      = EXT_COLORS[ds.extension] ?? EXT_COLORS[".fastq"];
  const isPending  = fileStatus === "pending";
  const isCooldown = fileStatus === "cooldown";
  const isReqing   = requesting === ds._id;
  const countdown  = useCooldownCountdown(isCooldown ? cooldownUntil : undefined);

  const handleMouseEnter = () => {
    hoverTimer.current = setTimeout(() => setHovered(true), 180);
  };
  const handleMouseLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHovered(false);
  };

  const availBadge = ds.availability === "Restricted"
    ? "bg-red-500/10 text-red-400"
    : "bg-emerald-500/10 text-emerald-400";

  const buttonContent = () => {
    if (isReqing)   return <><Clock className="h-3.5 w-3.5 animate-spin" /> Submitting…</>;
    if (isPending)  return <><Clock className="h-3.5 w-3.5" /> Pending Approval…</>;
    if (isCooldown) return <><Timer className="h-3.5 w-3.5" /> Cooldown: {countdown || "…"}</>;
    return <>Request Access <ChevronRight className="h-3.5 w-3.5" /></>;
  };

  const buttonCls = isPending
    ? "bg-amber-500/10 text-amber-400 cursor-default"
    : isCooldown
    ? "bg-zinc-500/10 text-zinc-400 cursor-not-allowed"
    : "bg-primary/10 text-primary hover:bg-primary/20 active:scale-[0.98]";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* ── Card ─────────────────────────────────────────────────────── */}
      <div className={`rounded-xl border bg-card p-4 flex flex-col gap-3 transition-all duration-200
        ${hovered ? "border-primary/50 shadow-lg shadow-primary/10" : "border-border hover:border-primary/30"}`}>

        {/* Row 1: icon + format badge + availability */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${ext.bg}`}>
              <Dna className={`h-4 w-4 ${ext.text}`} />
            </div>
            <div className="min-w-0">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${ext.bg} ${ext.text} ${ext.border}`}>
                {EXT_LABELS[ds.extension] ?? ds.extension}
              </span>
            </div>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${availBadge}`}>
            {ds.availability ?? "Available"}
          </span>
        </div>

        {/* Row 2: Dataset ID */}
        <div className="flex items-center gap-1.5">
          <Hash className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          <span className="text-xs font-mono text-muted-foreground">
            {ds.datasetId ?? `GV-${ds._id.slice(-4).toUpperCase()}`}
          </span>
        </div>

        {/* ── Donor info (anonymized) ── */}
        <div className="grid grid-cols-3 gap-1.5 text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground/60 text-[10px]">Age</span>
            <span className="font-medium">{ds.owner?.age ? `${ds.owner.age} yrs` : "—"}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground/60 text-[10px]">Gender</span>
            <span className="font-medium truncate">{ds.owner?.gender ?? "—"}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground/60 text-[10px]">Country</span>
            <span className="font-medium truncate">{ds.owner?.country ?? "—"}</span>
          </div>
        </div>

        {/* ── Sequencing + Risk ── */}
        <div className="space-y-1.5 border-t border-border/50 pt-2.5">
          {ds.sequencingType && (
            <div className="flex items-center gap-1.5 text-xs">
              <Activity className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">Sequencing:</span>
              <span className="font-medium truncate">{ds.sequencingType}</span>
            </div>
          )}
          {ds.riskCategory && (
            <div className="flex items-center gap-1.5 text-xs">
              <FlaskConical className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">Risk:</span>
              <span className="font-medium truncate text-amber-400">{ds.riskCategory}</span>
            </div>
          )}
          {ds.qualityScore && (
            <span className={`inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full ${QUALITY_COLORS[ds.qualityScore] ?? ""}`}>
              Quality: {ds.qualityScore}
            </span>
          )}
        </div>

        {/* ── File meta row ── */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" />{formatSize(ds.sizeBytes)}</span>
          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(ds.createdAt)}</span>
          {ds.isEncrypted && (
            <span className="flex items-center gap-1 text-blue-400"><Shield className="h-3 w-3" />AES-256</span>
          )}
        </div>

        {/* ── Request / Cooldown button ── */}
        <button
          onClick={() => !isPending && !isCooldown && onRequestAccess(ds)}
          disabled={isPending || isCooldown || isReqing}
          className={`w-full flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg py-2 transition-all
            ${buttonCls} ${isReqing ? "opacity-60 cursor-wait" : ""}`}
        >
          {buttonContent()}
        </button>

        {/* Cooldown sub-label */}
        {isCooldown && (
          <p className="text-center text-[10px] text-muted-foreground/50 -mt-1">
            You can re-request after the cooldown expires
          </p>
        )}

        {/* ── Hover hint ── */}
        {!hovered && !isCooldown && (
          <p className="text-center text-[10px] text-muted-foreground/40 -mt-1">
            Hover for full details
          </p>
        )}
      </div>

      {/* ── Hover panel ── */}
      <AnimatePresence>
        {hovered && <HoverPanel ds={ds} />}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AvailableDatasets() {
  const { token } = useAuth();
  const [datasets,   setDatasets]   = useState<Dataset[]>([]);
  // Map fileId -> "none" | "pending" | "approved" | "expired"
  const [statusMap,  setStatusMap]  = useState<Record<string, string>>({});
  const [requesting, setRequesting] = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState("");
  const [extFilter,  setExtFilter]  = useState("all");
  const [showFilter, setShowFilter] = useState(false);
  // Form modal
  const [formDataset, setFormDataset] = useState<Dataset | null>(null);
  // Cooldown map: fileId -> ISO timestamp when cooldown expires
  const [cooldownMap, setCooldownMap] = useState<Record<string, string>>({});

  /* ── Fetch my existing requests and build statusMap ─────────────── */
  const fetchMyRequests = useCallback(async () => {
    if (!token) return;
    try {
      const res  = await apiFetch("/api/access/my-requests", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) return;
      const statusResult: Record<string, string> = {};
      const cooldownResult: Record<string, string> = {};
      const COOLDOWN_MS = 24 * 60 * 60 * 1000;

      for (const r of (data.requests ?? [])) {
        const fileId = r.file?._id;
        if (!fileId) continue;

        const isApprovedActive =
          r.status === "approved" &&
          r.accessExpiresAt &&
          new Date(r.accessExpiresAt).getTime() > Date.now();

        if (isApprovedActive) {
          statusResult[fileId] = "approved";
        } else if (["pending", "more-info"].includes(r.status)) {
          statusResult[fileId] = "pending";
        } else if (["denied", "rejected", "revoked"].includes(r.status)) {
          // Check if still within 24h cooldown
          const cooldownUntil = new Date(new Date(r.createdAt).getTime() + COOLDOWN_MS);
          if (cooldownUntil.getTime() > Date.now()) {
            statusResult[fileId]  = "cooldown";
            cooldownResult[fileId] = cooldownUntil.toISOString();
          } else {
            statusResult[fileId] = "none";
          }
        } else {
          statusResult[fileId] = "none";
        }
      }
      setStatusMap(statusResult);
      setCooldownMap(cooldownResult);
    } catch { /* silently ignore */ }
  }, [token]);

  const fetchDatasets = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const res  = await apiFetch("/api/files/public", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load datasets");
      setDatasets(data.files ?? []);
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { fetchDatasets(); fetchMyRequests(); }, [fetchDatasets, fetchMyRequests]);
  useEffect(() => {
    // Refresh datasets every 15s, refresh request statuses every 20s
    const dsId  = setInterval(() => fetchDatasets(true), 15_000);
    const reqId = setInterval(() => fetchMyRequests(),   20_000);
    return () => { clearInterval(dsId); clearInterval(reqId); };
  }, [fetchDatasets, fetchMyRequests]);

  /* ── Filter: hide approved+active datasets ───────────────────── */
  const visibleDatasets = datasets.filter(d => statusMap[d._id] !== "approved");

  const filtered = visibleDatasets.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || d.originalName.toLowerCase().includes(q)
      || d.datasetId?.toLowerCase().includes(q)
      || d.sequencingType?.toLowerCase().includes(q)
      || d.riskCategory?.toLowerCase().includes(q)
      || d.owner?.country?.toLowerCase().includes(q);
    return matchSearch && (extFilter === "all" || d.extension === extFilter);
  });

  // Open the form drawer instead of directly submitting
  const handleRequestAccess = (ds: Dataset) => {
    setFormDataset(ds);
  };

  // Called by RequestAccessForm on successful submit
  const handleFormSuccess = (datasetId: string) => {
    setStatusMap(prev => ({ ...prev, [datasetId]: "pending" }));
    setFormDataset(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Available Datasets</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Browse anonymized genomic datasets.
            {visibleDatasets.length > 0 && (
              <span className="ml-1 text-primary font-medium">{visibleDatasets.length} available</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input id="dataset-search" placeholder="Search ID, sequencing, country…"
              className="pl-9 pr-8" value={search} onChange={e => setSearch(e.target.value)} />
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button variant="outline" size="icon" onClick={() => setShowFilter(p => !p)}
            className={showFilter ? "border-primary text-primary" : ""}>
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => fetchDatasets(true)} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Ext filter pills */}
      <AnimatePresence>
        {showFilter && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2 flex-wrap">
            {["all", ".fastq", ".bam", ".vcf"].map(ext => (
              <button key={ext} onClick={() => setExtFilter(ext)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                  ${extFilter === ext ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                {ext === "all" ? "All Types" : ext.toUpperCase().slice(1)}
              </button>
            ))}
            <span className="text-xs text-muted-foreground ml-1">
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3 animate-pulse">
              <div className="flex gap-2"><div className="h-8 w-8 rounded-lg bg-muted" /><div className="h-4 bg-muted rounded w-1/2 mt-1" /></div>
              <div className="h-3 bg-muted rounded w-1/4" />
              <div className="grid grid-cols-3 gap-2">
                <div className="h-6 bg-muted rounded" />
                <div className="h-6 bg-muted rounded" />
                <div className="h-6 bg-muted rounded" />
              </div>
              <div className="h-3 bg-muted rounded w-3/4" />
              <div className="h-7 bg-muted rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-col items-center py-16 text-center rounded-xl border border-dashed border-red-500/30 bg-red-500/5">
          <AlertTriangle className="h-10 w-10 text-red-400 mb-3" />
          <p className="text-sm font-medium text-red-400">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => fetchDatasets()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex flex-col items-center py-20 text-center rounded-xl border border-dashed">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Database className="h-8 w-8 text-muted-foreground" />
          </div>
          {datasets.length === 0 ? (
            <>
              <h3 className="text-lg font-semibold mb-1">No Datasets Available</h3>
              <p className="text-sm text-muted-foreground">Datasets uploaded by owners will appear here.</p>
            </>
          ) : visibleDatasets.length === 0 ? (
            <>
              <h3 className="text-lg font-semibold mb-1">All datasets are currently accessed</h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                You have active access to all available datasets. They will reappear here once your access expires or is revoked.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold mb-1">No Results</h3>
              <Button variant="outline" size="sm" className="mt-4"
                onClick={() => { setSearch(""); setExtFilter("all"); }}>Clear Filters</Button>
            </>
          )}
        </motion.div>
      )}

      {/* Grid */}
      {!loading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ds, i) => (
            <DatasetCard
              key={ds._id} ds={ds} index={i}
              onRequestAccess={handleRequestAccess}
              fileStatus={statusMap[ds._id] ?? "none"}
              requesting={requesting}
              cooldownUntil={cooldownMap[ds._id]}
            />
          ))}
        </div>
      )}

      {/* ── Request Access Form Modal ── */}
      {formDataset && (
        <RequestAccessForm
          dataset={formDataset}
          onClose={() => setFormDataset(null)}
          onSuccess={handleFormSuccess}
        />
      )}
    </div>
  );
}
