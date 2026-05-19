import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Filter, Database, RefreshCw, Shield, Dna,
  Calendar, User, HardDrive, CheckCircle2, Clock,
  AlertTriangle, ExternalLink, SlidersHorizontal, X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";

// ── Types ─────────────────────────────────────────────────────────────────────
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

const EXT_COLORS: Record<string, { bg: string; text: string }> = {
  ".fastq": { bg: "bg-violet-500/15", text: "text-violet-400"  },
  ".bam":   { bg: "bg-cyan-500/15",   text: "text-cyan-400"    },
  ".vcf":   { bg: "bg-emerald-500/15",text: "text-emerald-400" },
};

const EXT_LABELS: Record<string, string> = {
  ".fastq": "FASTQ — Raw Reads",
  ".bam":   "BAM — Aligned Reads",
  ".vcf":   "VCF — Variant Calls",
};

// ── IPFS status pill ──────────────────────────────────────────────────────────
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

// ── Dataset card ──────────────────────────────────────────────────────────────
function DatasetCard({ ds, index }: { ds: Dataset; index: number }) {
  const ext     = EXT_COLORS[ds.extension] ?? EXT_COLORS[".fastq"];
  const extLabel = EXT_LABELS[ds.extension] ?? ds.extension.toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 transition-all group"
    >
      {/* Top row */}
      <div className="flex items-start gap-3">
        {/* File type icon */}
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${ext.bg}`}>
          <Dna className={`h-5 w-5 ${ext.text}`} />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold leading-snug truncate" title={ds.originalName}>
            {ds.originalName}
          </h3>
          <p className={`text-xs font-medium mt-0.5 ${ext.text}`}>{extLabel}</p>
        </div>

        {/* Encryption badge */}
        {ds.isEncrypted && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 flex-shrink-0">
            <Shield className="h-3 w-3" /> Encrypted
          </span>
        )}
      </div>

      {/* Description */}
      {ds.description && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {ds.description}
        </p>
      )}

      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <HardDrive className="h-3.5 w-3.5 flex-shrink-0" />
          {formatSize(ds.sizeBytes)}
        </span>
        <span className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
          {formatDate(ds.createdAt)}
        </span>
        <span className="flex items-center gap-1.5 col-span-2">
          <User className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">{ds.owner?.name ?? "Unknown"}</span>
        </span>
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
        <IpfsPill status={ds.ipfsStatus} />
        {ds.ipfsCid && (
          <a
            href={`https://ipfs.io/ipfs/${ds.ipfsCid}`}
            target="_blank" rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
            title="View on IPFS"
          >
            IPFS <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AvailableDatasets() {
  const { user, token } = useAuth();
  const [datasets,    setDatasets]    = useState<Dataset[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [search,      setSearch]      = useState("");
  const [extFilter,   setExtFilter]   = useState<string>("all");
  const [showFilter,  setShowFilter]  = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchDatasets = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    else         setRefreshing(true);
    setError(null);
    try {
      const res  = await fetch("http://localhost:5000/api/files/public", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load datasets");
      setDatasets(data.files ?? []);
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  // initial load
  useEffect(() => { fetchDatasets(); }, [fetchDatasets]);

  // real-time poll every 15 seconds
  useEffect(() => {
    const id = setInterval(() => fetchDatasets(true), 15_000);
    return () => clearInterval(id);
  }, [fetchDatasets]);

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = datasets.filter(d => {
    const matchSearch = search.trim() === ""
      || d.originalName.toLowerCase().includes(search.toLowerCase())
      || d.owner?.name?.toLowerCase().includes(search.toLowerCase())
      || d.description?.toLowerCase().includes(search.toLowerCase());
    const matchExt = extFilter === "all" || d.extension === extFilter;
    return matchSearch && matchExt;
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Header + controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Available Datasets</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Browse genomic datasets uploaded by data owners.
            {datasets.length > 0 && (
              <span className="ml-1 text-primary font-medium">{datasets.length} available</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="dataset-search"
              placeholder="Search datasets..."
              className="pl-9 pr-8"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter toggle */}
          <Button variant="outline" size="icon" title="Filter by type"
            onClick={() => setShowFilter(p => !p)}
            className={showFilter ? "border-primary text-primary" : ""}>
            <SlidersHorizontal className="h-4 w-4" />
          </Button>

          {/* Refresh */}
          <Button variant="outline" size="icon" title="Refresh"
            onClick={() => fetchDatasets(true)} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Ext filter pills */}
      <AnimatePresence>
        {showFilter && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{   opacity: 0, height: 0 }} transition={{ duration: 0.2 }}
            className="flex items-center gap-2 flex-wrap"
          >
            {["all", ".fastq", ".bam", ".vcf"].map(ext => (
              <button key={ext} onClick={() => setExtFilter(ext)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  extFilter === ext
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}>
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
            <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3 animate-pulse">
              <div className="flex gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/3" />
                </div>
              </div>
              <div className="h-3 bg-muted rounded w-full" />
              <div className="h-3 bg-muted rounded w-4/5" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-3 bg-muted rounded" />
                <div className="h-3 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-red-500/30 bg-red-500/5">
          <AlertTriangle className="h-10 w-10 text-red-400 mb-3" />
          <p className="text-sm font-medium text-red-400">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => fetchDatasets()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center text-center py-20 rounded-xl border border-dashed"
        >
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Database className="h-8 w-8 text-muted-foreground" />
          </div>
          {datasets.length === 0 ? (
            <>
              <h3 className="text-lg font-semibold mb-1">No Datasets Available</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Datasets uploaded by data owners will appear here in real time.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold mb-1">No Results</h3>
              <p className="text-sm text-muted-foreground">
                No datasets match your search or filter.
              </p>
              <Button variant="outline" size="sm" className="mt-4"
                onClick={() => { setSearch(""); setExtFilter("all"); }}>
                Clear Filters
              </Button>
            </>
          )}
        </motion.div>
      )}

      {/* Dataset grid */}
      {!loading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ds, i) => (
            <DatasetCard key={ds._id} ds={ds} index={i} />
          ))}
        </div>
      )}


    </div>
  );
}
