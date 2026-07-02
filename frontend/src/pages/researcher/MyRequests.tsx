import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardList, RefreshCw, AlertTriangle, HardDrive, Calendar, User, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

// ── Types ─────────────────────────────────────────────────────────
interface AccessReq {
  _id:             string;
  status:          "pending" | "approved" | "denied";
  reason?:         string;
  createdAt:       string;
  accessExpiresAt?: string;
  file: {
    _id:          string;
    originalName: string;
    sizeBytes:    number;
    isEncrypted:  boolean;
  };
  owner: {
    name:  string;
    email: string;
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function formatSize(bytes: number) {
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

function StatusBadge({ status, expiresAt }: { status: string; expiresAt?: string }) {
  const isExpired = expiresAt && new Date(expiresAt).getTime() < Date.now();

  if (status === "approved" && !isExpired) {
    return <Badge className="bg-emerald-500/15 text-emerald-400 border-0">Approved</Badge>;
  }
  if (status === "approved" && isExpired) {
    return <Badge className="bg-muted text-muted-foreground border-0">Expired</Badge>;
  }
  if (status === "denied") {
    return <Badge className="bg-red-500/15 text-red-400 border-0">Denied</Badge>;
  }
  return <Badge className="bg-amber-500/15 text-amber-400 border-0">Pending</Badge>;
}

export default function MyRequests() {
  const { token } = useAuth();
  const navigate   = useNavigate();
  const [requests,   setRequests]   = useState<AccessReq[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const fetchRequests = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    else         setRefreshing(true);
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
          <p className="text-muted-foreground mt-1">
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

      {/* Table */}
      {!error && (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[260px]">Dataset</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Requested On</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Loading rows */}
                {loading && [...Array(4)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(6)].map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

                {/* Real data rows */}
                {!loading && requests.map((r, i) => (
                  <motion.tr
                    key={r._id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <TableCell>
                      <span className="font-medium text-sm truncate block max-w-[240px]" title={r.file?.originalName}>
                        {r.file?.originalName ?? "—"}
                      </span>
                      {r.reason && (
                        <span className="text-xs text-muted-foreground mt-0.5 block truncate max-w-[240px]">
                          Reason: {r.reason}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        {r.owner?.name ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <HardDrive className="h-3.5 w-3.5 flex-shrink-0" />
                        {r.file?.sizeBytes ? formatSize(r.file.sizeBytes) : "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                        {formatDate(r.createdAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.accessExpiresAt ? (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                          {formatDate(r.accessExpiresAt)}
                        </div>
                      ) : (
                        <span className="text-muted-foreground/50 text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <StatusBadge status={r.status} expiresAt={r.accessExpiresAt} />
                    </TableCell>
                  </motion.tr>
                ))}

                {/* Empty state */}
                {!loading && requests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="h-52 text-center">
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center justify-center opacity-70"
                      >
                        <ClipboardList className="h-10 w-10 text-muted-foreground mb-3" />
                        <p className="text-base font-medium">No requests yet</p>
                        <p className="text-sm text-muted-foreground mt-1 mb-3">
                          When you request dataset access, they will appear here.
                        </p>
                        <Button size="sm" onClick={() => navigate("/researcher/datasets")}>
                          Browse Datasets
                        </Button>
                      </motion.div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
