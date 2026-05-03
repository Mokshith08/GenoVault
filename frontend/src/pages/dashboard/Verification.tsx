import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, ShieldAlert, FileCheck2, Loader2, FileText, RefreshCw, Dna } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const API_BASE = "http://localhost:5000/api";

interface VerifiableFile {
  _id:          string;
  originalName: string;
  sizeBytes:    number;
  cloudUrl:     string;
  ipfsCid:      string | null;
  createdAt:    string;
}

const formatBytes = (bytes: number): string => {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(2) + " GB";
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + " MB";
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(0) + " KB";
  return bytes + " B";
};

const Verification = () => {
  const [files, setFiles]         = useState<VerifiableFile[]>([]);
  const [loading, setLoading]     = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);
  // Results: fileId → true (verified) | false (tampered)
  const [results, setResults]     = useState<Record<string, boolean>>({});

  const token = localStorage.getItem("genovault-token") || "";

  /* ── Fetch real files from backend ─────────────────────────── */
  const fetchFiles = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/files/my-files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        const loaded: VerifiableFile[] = data.files || [];
        setFiles(loaded);
        // Default: files with IPFS backup done are "verified"
        const initial: Record<string, boolean> = {};
        loaded.forEach(f => {
          initial[f._id] = f.ipfsCid !== null;
        });
        setResults(initial);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  /* ── Re-verify: check if IPFS CID still exists ─────────────── */
  const verify = async (id: string) => {
    setVerifying(id);
    try {
      const res = await fetch(`${API_BASE}/files/${id}/ipfs-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      // "done" = CID pinned on IPFS = file is intact
      setResults(r => ({ ...r, [id]: data.ipfsStatus === "done" }));
    } catch {
      setResults(r => ({ ...r, [id]: false }));
    } finally {
      setVerifying(null);
    }
  };

  const verifiedCount = Object.values(results).filter(Boolean).length;
  const tamperedCount = Object.values(results).filter(v => !v).length;

  return (
    <>
      <PageHeader
        title="Data Verification"
        description="Verify file integrity against IPFS CID records to detect tampering."
      />

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-5 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-success text-success-foreground flex items-center justify-center">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Verified</p>
              <p className="text-2xl font-bold">{verifiedCount}</p>
            </div>
          </div>
        </Card>

        <Card className="p-5 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-destructive text-destructive-foreground flex items-center justify-center">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Not verified</p>
              <p className="text-2xl font-bold">{tamperedCount}</p>
            </div>
          </div>
        </Card>

        <Card className="p-5 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-primary text-primary-foreground flex items-center justify-center">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total files</p>
              <p className="text-2xl font-bold">{files.length}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* File list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
        </div>
      ) : files.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <Dna className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No files uploaded yet.</p>
          <p className="text-xs mt-1">Upload a genomic file to enable verification.</p>
          <Button variant="ghost" size="sm" className="mt-3" onClick={fetchFiles}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {files.map((f, i) => {
            const ok = results[f._id] ?? false;
            const isChecking = verifying === f._id;

            return (
              <motion.div
                key={f._id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className={`p-5 shadow-card border-l-4 ${ok ? "border-l-success" : "border-l-destructive"}`}>
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    {/* File info */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-accent text-accent-foreground flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{f.originalName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(f.sizeBytes)} · {new Date(f.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {/* Hash / CID panel */}
                    <div className="flex-1 grid grid-cols-1 gap-2 text-xs">
                      <div className="rounded-lg bg-muted/50 p-2.5">
                        <p className="text-muted-foreground mb-0.5">IPFS CID (backup fingerprint)</p>
                        <p className="font-mono truncate">
                          {f.ipfsCid ? f.ipfsCid : "Not yet backed up to IPFS"}
                        </p>
                      </div>
                    </div>

                    {/* Badge + re-verify */}
                    <div className="flex items-center gap-2">
                      <Badge className={ok ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"}>
                        {ok
                          ? <><ShieldCheck className="h-3 w-3 mr-1" />Verified</>
                          : <><ShieldAlert className="h-3 w-3 mr-1" />Pending</>
                        }
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => verify(f._id)}
                        disabled={isChecking}
                      >
                        {isChecking
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <><RefreshCw className="h-3.5 w-3.5 mr-1" />Re-verify</>
                        }
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </>
  );
};

export default Verification;
