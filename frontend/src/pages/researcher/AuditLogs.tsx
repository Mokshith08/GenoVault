import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Search, History, RefreshCw, ExternalLink, Loader2,
  UploadCloud, Inbox, ShieldCheck, Ban, AlertTriangle,
  CheckCircle2, XCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";

interface AuditEvent {
  eventType: string;
  action: string;
  fileId?: number | null;
  fileName: string;
  actor: string;
  txHash?: string | null;
  blockNumber?: number | null;
  etherscanUrl?: string | null;
  timestamp?: string;
  gasUsed?: string | null;
}

const EVENT_META: Record<string, { icon: React.ElementType; cls: string }> = {
  Upload:       { icon: UploadCloud,  cls: "bg-blue-500/20 text-blue-400" },
  Requested:    { icon: Inbox,        cls: "bg-amber-500/20 text-amber-400" },
  Request:      { icon: Inbox,        cls: "bg-amber-500/20 text-amber-400" },
  Approve:      { icon: ShieldCheck,  cls: "bg-emerald-500/20 text-emerald-400" },
  Approved:     { icon: CheckCircle2, cls: "bg-emerald-500/20 text-emerald-400" },
  Reject:       { icon: XCircle,      cls: "bg-red-500/20 text-red-400" },
  Rejected:     { icon: XCircle,      cls: "bg-red-500/20 text-red-400" },
  Revoke:       { icon: Ban,          cls: "bg-zinc-500/20 text-zinc-400" },
  Revoked:      { icon: Ban,          cls: "bg-zinc-500/20 text-zinc-400" },
};

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function TxBadge({ txHash, etherscanUrl }: { txHash?: string | null; etherscanUrl?: string | null }) {
  if (!txHash) return (
    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
      Off-chain
    </span>
  );
  const short = `${txHash.slice(0, 8)}…${txHash.slice(-6)}`;
  if (etherscanUrl) {
    return (
      <a href={etherscanUrl} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-mono text-xs text-blue-400 hover:text-blue-300 hover:underline transition-colors">
        {short}<ExternalLink className="h-3 w-3 flex-shrink-0" />
      </a>
    );
  }
  return <span className="font-mono text-xs text-muted-foreground">{short}</span>;
}

export default function AuditLogs() {
  const { token } = useAuth();
  const [events,    setEvents]    = useState<AuditEvent[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [refreshing,setRefreshing]= useState(false);
  const [search,    setSearch]    = useState("");

  const fetchAudit = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const res  = await fetch("http://localhost:5000/api/audit", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load audit");
      setEvents(data.events ?? []);
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  const filtered = events.filter(e =>
    search.trim() === "" ||
    e.fileName?.toLowerCase().includes(search.toLowerCase()) ||
    e.action?.toLowerCase().includes(search.toLowerCase()) ||
    e.actor?.toLowerCase().includes(search.toLowerCase()) ||
    e.txHash?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Blockchain Audit Logs</h2>
          <p className="text-muted-foreground mt-1">
            Immutable record of your research activities — verified on Ethereum Sepolia Testnet.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchAudit(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search logs…"
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table card */}
      <div className="rounded-xl border bg-card text-card-foreground shadow-sm flex-1 overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>File</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Tx Hash</TableHead>
                <TableHead className="text-right">Block</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} className="h-40 text-center">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Loading blockchain events…
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!loading && error && (
                <TableRow>
                  <TableCell colSpan={6} className="h-40 text-center">
                    <div className="flex flex-col items-center gap-2 text-red-400">
                      <AlertTriangle className="h-7 w-7" />
                      <p className="text-sm">{error}</p>
                      <Button variant="outline" size="sm" onClick={() => fetchAudit()}>Retry</Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!loading && !error && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-52 text-center">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4 }}
                      className="flex flex-col items-center justify-center opacity-70"
                    >
                      <History className="h-10 w-10 text-muted-foreground mb-3" />
                      <p className="text-base font-medium">
                        {events.length === 0 ? "No blockchain events yet" : "No matching events"}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {events.length === 0
                          ? "Once you request access to datasets, events will be recorded here."
                          : "Try a different search term."}
                      </p>
                    </motion.div>
                  </TableCell>
                </TableRow>
              )}

              {!loading && !error && filtered.map((evt, i) => {
                const meta = EVENT_META[evt.action] ?? { icon: History, cls: "bg-muted text-muted-foreground" };
                const Icon = meta.icon;
                return (
                  <motion.tr
                    key={`${evt.txHash ?? i}-${i}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="border-b border-border hover:bg-muted/40 transition-colors"
                  >
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(evt.timestamp)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`gap-1 text-xs ${meta.cls}`}>
                        <Icon className="h-3 w-3" />{evt.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[180px] truncate" title={evt.fileName}>
                      {evt.fileName}
                    </TableCell>
                    <TableCell className="text-sm">{evt.actor}</TableCell>
                    <TableCell>
                      <TxBadge txHash={evt.txHash} etherscanUrl={evt.etherscanUrl} />
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {evt.blockNumber ?? "—"}
                    </TableCell>
                  </motion.tr>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Footer summary */}
        {!loading && !error && events.length > 0 && (
          <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
            <span>
              {filtered.length} of {events.length} blockchain event{events.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
