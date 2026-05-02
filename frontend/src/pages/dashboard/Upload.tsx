import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadCloud, FileText, X, CheckCircle2, Loader2, AlertCircle,
  Cloud, Database, Dna, ExternalLink, Copy, RefreshCw, Layers,
  Zap, Shield, Globe
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useChunkedUpload, UploadState } from "@/hooks/useChunkedUpload";

const API_BASE = "http://localhost:5000/api";
const ALLOWED_EXTENSIONS = [".fastq", ".bam", ".vcf"];

interface StoredFile {
  id:           string;
  originalName: string;
  sizeBytes:    number;
  cloudUrl:     string;
  ipfsCid:      string | null;
  ipfsUrl:      string | null;
  ipfsStatus:   "pending" | "uploading" | "done" | "failed";
  uploadedAt:   string;
}

const formatBytes = (bytes: number): string => {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + " GB";
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + " MB";
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(0) + " KB";
  return bytes + " B";
};

const phaseLabel: Record<UploadState["phase"], string> = {
  idle:        "",
  requesting:  "Getting upload token…",
  uploading:   "Uploading chunks to Azure…",
  committing:  "Committing block list…",
  confirming:  "Confirming with server…",
  done:        "Upload complete!",
  error:       "Upload failed",
};

// ── IPFS Status Badge ──────────────────────────────────────────────────────
const IpfsBadge = ({ status, cid, ipfsUrl }: { status: string; cid: string | null; ipfsUrl: string | null }) => {
  const map = {
    pending:   { color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", label: "IPFS Pending" },
    uploading: { color: "bg-blue-500/20 text-blue-400 border-blue-500/30",       label: "IPFS Uploading" },
    done:      { color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", label: "IPFS Backed Up" },
    failed:    { color: "bg-red-500/20 text-red-400 border-red-500/30",           label: "IPFS Failed" },
  };
  const style = map[status as keyof typeof map] || map.pending;

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${style.color}`}>
        {status === "uploading" && <Loader2 className="h-3 w-3 animate-spin" />}
        {status === "done"      && <CheckCircle2 className="h-3 w-3" />}
        {status === "failed"    && <AlertCircle className="h-3 w-3" />}
        {status === "pending"   && <Database className="h-3 w-3" />}
        {style.label}
      </span>
      {status === "done" && cid && (
        <button
          onClick={() => { navigator.clipboard.writeText(cid); toast.success("CID copied!"); }}
          className="text-xs text-muted-foreground hover:text-foreground font-mono flex items-center gap-1"
          title={cid}
        >
          <Copy className="h-3 w-3" />
          {cid.slice(0, 8)}…
        </button>
      )}
      {status === "done" && ipfsUrl && (
        <a href={ipfsUrl} target="_blank" rel="noopener noreferrer"
          className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
          <ExternalLink className="h-3 w-3" />
          IPFS
        </a>
      )}
    </div>
  );
};

// ── Main Upload Component ──────────────────────────────────────────────────
const Upload = () => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const { state, upload, cancel, reset } = useChunkedUpload();

  // Auth token from localStorage
  const token = localStorage.getItem("genovault-token") || "";

  /* ── Load existing files ──────────────────────────────────── */
  const fetchFiles = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/files/my-files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setFiles(data.files || []);
    } catch {
      // silently ignore — file list is non-critical
    } finally {
      setLoadingFiles(false);
    }
  }, [token]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  /* ── Poll IPFS status for pending files ───────────────────── */
  const pollIpfsStatus = useCallback(async () => {
    const pending = files.filter(f => f.ipfsStatus === "pending" || f.ipfsStatus === "uploading");
    if (!pending.length) return;

    await Promise.allSettled(
      pending.map(async (f) => {
        try {
          const res = await fetch(`${API_BASE}/files/${f.id}/ipfs-status`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          if (res.ok) {
            setFiles(prev => prev.map(pf =>
              pf.id === f.id
                ? { ...pf, ipfsStatus: data.ipfsStatus, ipfsCid: data.ipfsCid, ipfsUrl: data.ipfsUrl }
                : pf
            ));
          }
        } catch { /* ignore */ }
      })
    );
  }, [files, token]);

  useEffect(() => {
    const hasPending = files.some(f => f.ipfsStatus === "pending" || f.ipfsStatus === "uploading");
    if (hasPending) {
      pollRef.current = setInterval(pollIpfsStatus, 5000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [files, pollIpfsStatus]);

  /* ── File validation ──────────────────────────────────────── */
  const validateFile = (file: File): string | null => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `"${ext}" is not allowed. Accepted: ${ALLOWED_EXTENSIONS.join(", ")}`;
    }
    return null;
  };

  const handleFileSelect = (fileList: FileList | null) => {
    if (!fileList || !fileList[0]) return;
    const file = fileList[0];
    const err  = validateFile(file);
    if (err) { toast.error(err); return; }
    setSelectedFile(file);
    reset();
  };

  /* ── Start upload ─────────────────────────────────────────── */
  const startUpload = async () => {
    if (!selectedFile) return;
    if (!token) { toast.error("Not authenticated"); return; }

    await upload(selectedFile, description, token);
  };

  /* ── After successful upload ──────────────────────────────── */
  useEffect(() => {
    if (state.phase === "done" && state.cloudUrl) {
      const newFile: StoredFile = {
        id:           state.fileId,
        originalName: selectedFile?.name || "",
        sizeBytes:    selectedFile?.size || 0,
        cloudUrl:     state.cloudUrl,
        ipfsCid:      state.ipfsCid || null,
        ipfsUrl:      state.ipfsUrl || null,
        ipfsStatus:   "pending",
        uploadedAt:   new Date().toISOString(),
      };
      setFiles(prev => [newFile, ...prev]);
      toast.success(`${selectedFile?.name} uploaded to Azure ✓`);
      setSelectedFile(null);
      setDescription("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  const isUploading = !["idle", "done", "error"].includes(state.phase);

  return (
    <>
      <PageHeader
        title="Upload Genomic Files"
        description="Direct-to-Azure chunked upload with IPFS backup. GB-scale files supported."
      />

      {/* ── Architecture info strip ──────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { icon: Zap,    label: "Chunked Upload",   sub: "8 MB chunks · 5 parallel" },
          { icon: Shield, label: "SAS Token Auth",   sub: "Direct-to-Azure · JWT gated" },
          { icon: Globe,  label: "IPFS Backup",      sub: "Filebase · auto after upload" },
        ].map(({ icon: Icon, label, sub }) => (
          <div key={label}
            className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.15)" }}>
            <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
              <Icon className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold">{label}</p>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Drop zone ─────────────────────────────────────────── */}
      <Card
        onDragOver={e => { e.preventDefault(); if (!isUploading) setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={e => {
          e.preventDefault();
          setDragActive(false);
          if (!isUploading) handleFileSelect(e.dataTransfer.files);
        }}
        className={`relative overflow-hidden border-2 border-dashed transition-all p-10 text-center cursor-pointer select-none
          ${isUploading ? "pointer-events-none opacity-75" : ""}
          ${dragActive ? "border-primary bg-accent/40 scale-[1.01]" : "border-border hover:border-primary/40"}`}
        onClick={() => { if (!isUploading && !selectedFile) inputRef.current?.click(); }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".fastq,.bam,.vcf"
          className="hidden"
          onChange={e => handleFileSelect(e.target.files)}
        />

        <motion.div animate={{ y: dragActive ? -4 : 0 }} className="flex flex-col items-center">
          <div className="relative mb-4">
            <div className="h-16 w-16 rounded-2xl shadow-elegant flex items-center justify-center"
              style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
              <UploadCloud className="h-8 w-8 text-white" />
            </div>
            {dragActive && <div className="absolute inset-0 rounded-2xl bg-primary blur-xl opacity-60 -z-10" />}
          </div>

          {!selectedFile ? (
            <>
              <h3 className="font-semibold text-lg">Drop a genomic file here</h3>
              <p className="text-sm text-muted-foreground mt-1">
                or click to browse · <span className="font-mono">.fastq · .bam · .vcf</span>
              </p>
              <Button className="mt-5 shadow-elegant" type="button"
                style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
                Choose file
              </Button>
              <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
                <Layers className="h-3 w-3" /> No size limit · GB-scale files supported
              </p>
            </>
          ) : (
            <div className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
              {/* Selected file info */}
              <div className="flex items-center gap-3 p-3 rounded-xl mb-3"
                style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
                <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(99,102,241,0.2)" }}>
                  <Dna className="h-5 w-5 text-indigo-400" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(selectedFile.size)}</p>
                </div>
                {!isUploading && (
                  <button onClick={() => { setSelectedFile(null); reset(); }}
                    className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Optional description */}
              {!isUploading && state.phase !== "done" && (
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background mb-3 focus:outline-none focus:ring-1 focus:ring-primary"
                  onClick={e => e.stopPropagation()}
                />
              )}

              {/* Upload / cancel buttons */}
              {state.phase === "idle" && (
                <Button onClick={startUpload} className="w-full"
                  style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
                  <UploadCloud className="h-4 w-4 mr-2" />
                  Upload to Azure + IPFS
                </Button>
              )}

              {state.phase === "error" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-destructive text-xs">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    {state.errorMsg}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={reset}>Cancel</Button>
                    <Button size="sm" onClick={startUpload}
                      style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </Card>

      {/* ── Upload progress ────────────────────────────────────── */}
      <AnimatePresence>
        {isUploading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            <Card className="p-5" style={{ border: "1px solid rgba(99,102,241,0.25)" }}>
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{selectedFile?.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(selectedFile?.size || 0)}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={cancel}
                  className="text-muted-foreground hover:text-destructive text-xs">
                  Cancel
                </Button>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{phaseLabel[state.phase]}</span>
                  <span className="font-mono font-medium text-foreground">{state.progress}%</span>
                </div>
                <Progress value={state.progress} className="h-2" />
              </div>

              {/* Chunk stats */}
              {state.phase === "uploading" && state.chunksTotal > 0 && (
                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Cloud className="h-3.5 w-3.5 text-indigo-400" />
                    Azure Blob Storage
                  </span>
                  <span>Chunk {state.chunksDone} / {state.chunksTotal}</span>
                  <span>8 MB · 5 parallel</span>
                </div>
              )}

              {/* Pipeline stages */}
              <div className="mt-4 flex items-center gap-2">
                {[
                  { key: "requesting",  label: "Token" },
                  { key: "uploading",   label: "Upload" },
                  { key: "committing",  label: "Commit" },
                  { key: "confirming",  label: "Confirm" },
                ].map((stage, i, arr) => {
                  const phases = ["requesting", "uploading", "committing", "confirming", "done"];
                  const currentIdx = phases.indexOf(state.phase);
                  const stageIdx   = phases.indexOf(stage.key);
                  const isDone     = currentIdx > stageIdx;
                  const isActive   = currentIdx === stageIdx;

                  return (
                    <div key={stage.key} className="flex items-center gap-2 flex-1">
                      <div className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold transition-all
                        ${isDone   ? "bg-emerald-500 text-white" : ""}
                        ${isActive ? "text-white animate-pulse" : ""}
                        ${!isDone && !isActive ? "bg-muted text-muted-foreground" : ""}`}
                        style={isActive ? { background: "linear-gradient(135deg,#6366f1,#8b5cf6)" } : {}}>
                        {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                      </div>
                      <span className={`text-xs ${isActive ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                        {stage.label}
                      </span>
                      {i < arr.length - 1 && <div className="flex-1 h-px bg-border" />}
                    </div>
                  );
                })}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Uploaded files list ────────────────────────────────── */}
      <Card className="mt-6 p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">
            Your Files
            <span className="ml-2 text-sm font-normal text-muted-foreground">({files.length})</span>
          </h3>
          <Button variant="ghost" size="sm" onClick={fetchFiles} className="text-xs text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
        </div>

        {loadingFiles ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Dna className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No files uploaded yet.</p>
            <p className="text-xs mt-1">Upload a <span className="font-mono">.fastq, .bam,</span> or <span className="font-mono">.vcf</span> file to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((f, i) => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex flex-col gap-2 p-4 rounded-xl border border-border/60 hover:bg-muted/30 transition-colors group"
              >
                {/* Top row */}
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
                    <FileText className="h-4 w-4 text-accent-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{f.originalName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(f.sizeBytes)} · {new Date(f.uploadedAt).toLocaleDateString()}
                    </p>
                  </div>
                  {/* Azure badge */}
                  <a href={f.cloudUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20 transition-colors">
                    <Cloud className="h-3 w-3" />
                    Azure
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>

                {/* Bottom row — IPFS status */}
                <div className="pl-13 pl-[52px]">
                  <IpfsBadge
                    status={f.ipfsStatus}
                    cid={f.ipfsCid}
                    ipfsUrl={f.ipfsUrl}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
};

export default Upload;
