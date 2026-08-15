import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Search, FileDown, UploadCloud, Inbox, ShieldCheck, KeyRound,
  Ban, FileCheck2, RefreshCw, ExternalLink, Loader2, AlertTriangle,
  XCircle, CheckCircle2, Database, Users, Activity, Link,
} from "lucide-react";
import { PageHeader }  from "@/components/dashboard/PageHeader";
import { Card }        from "@/components/ui/card";
import { Input }       from "@/components/ui/input";
import { Button }      from "@/components/ui/button";
import { Badge }       from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth }     from "@/contexts/AuthContext";
import { exportAuditPDF } from "@/lib/auditPdfExport";

const API_BASE = "http://localhost:5000/api";

interface AuditEvent {
  eventType:    string;
  action:       string;
  fileId?:      number | null;
  fileName:     string;
  actor:        string;
  txHash?:      string | null;
  blockNumber?: number | null;
  etherscanUrl?: string | null;
  timestamp?:   string;
  gasUsed?:     string | null;
}

interface OwnerStats {
  totalDatasets:        number;
  blockchainRegistered: number;
  totalRequests:        number;
  approvedCount:        number;
  rejectedCount:        number;
  revokedCount:         number;
  integrityVerified:    number;
  integrityFailed:      number;
  totalIntegrityChecks: number;
}

const actionMeta: Record<string, { icon: React.ElementType; color: string }> = {
  Upload:    { icon: UploadCloud,  color: "bg-blue-500/20 text-blue-400"       },
  Request:   { icon: Inbox,        color: "bg-amber-500/20 text-amber-400"     },
  Approve:   { icon: ShieldCheck,  color: "bg-emerald-500/20 text-emerald-400" },
  Reject:    { icon: XCircle,      color: "bg-red-500/20 text-red-400"         },
  Revoke:    { icon: Ban,          color: "bg-zinc-500/20 text-zinc-400"       },
  Verify:    { icon: FileCheck2,   color: "bg-violet-500/20 text-violet-400"   },
  Download:  { icon: FileDown,     color: "bg-sky-500/20 text-sky-400"         },
  Access:    { icon: KeyRound,     color: "bg-primary/20 text-primary"         },
  Approved:  { icon: CheckCircle2, color: "bg-emerald-500/20 text-emerald-400" },
  Rejected:  { icon: XCircle,      color: "bg-red-500/20 text-red-400"         },
  Revoked:   { icon: Ban,          color: "bg-zinc-500/20 text-zinc-400"       },
  Requested: { icon: Inbox,        color: "bg-amber-500/20 text-amber-400"     },
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
  const short = `${txHash.slice(0, 8)}...${txHash.slice(-6)}`;
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

const StatCard = ({
  label, value, icon: Icon, color, delay = 0,
}: { label: string; value: number; icon: React.ElementType; color: string; delay?: number }) => (
  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
    <Card className="p-4 shadow-card">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground leading-none mb-1">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </div>
    </Card>
  </motion.div>
);

const Audit = () => {
  const { token, user } = useAuth();
  const isOwner = user?.role === "owner";

  const [events,     setEvents]     = useState<AuditEvent[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting,  setExporting]  = useState(false);
  const [q,          setQ]          = useState("");
  const [action,     setAction]     = useState<string>("all");
  const [stats,        setStats]        = useState<OwnerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const fetchAudit = useCallback(async (silent = false) => {
    if (!token) { setLoading(false); return; }
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const res  = await fetch(`${API_BASE}/audit`, { headers: { Authorization: `Bearer ${token}` } });
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

  const fetchStats = useCallback(async () => {
    if (!token || !isOwner) return;
    setStatsLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/integrity/owner-stats`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok && data.success) setStats(data.stats);
    } catch { /* non-critical */ } finally { setStatsLoading(false); }
  }, [token, isOwner]);

  useEffect(() => { fetchAudit(); fetchStats(); }, [fetchAudit, fetchStats]);

  const refresh = (silent = true) => { fetchAudit(silent); fetchStats(); };

  const rows = useMemo(() => events.filter(e => {
    const matchQ = !q ||
      e.fileName?.toLowerCase().includes(q.toLowerCase()) ||
      e.actor?.toLowerCase().includes(q.toLowerCase()) ||
      e.txHash?.toLowerCase().includes(q.toLowerCase());
    const matchA = action === "all" || e.action === action;
    return matchQ && matchA;
  }), [q, action, events]);

  const uniqueActions = useMemo(() => [...new Set(events.map(e => e.action))], [events]);

  const handleExportPDF = async () => {
    setExporting(true);
    try { exportAuditPDF({ events: rows, userName: user?.name ?? "Unknown", userRole: user?.role ?? "unknown" }); }
    catch (err) { console.error("[PDF Export]", err); }
    finally { setExporting(false); }
  };

  return (
    <>
      <PageHeader
        title="Audit Trail & Integrity"
        description="Blockchain-verified event log, integrity statistics, and tamper-proof download tracking."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refresh(true)} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={loading || exporting || rows.length === 0}>
              {exporting
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Generating...</>
                : <><FileDown className="h-4 w-4 mr-1.5" />Export PDF</>}
            </Button>
          </div>
        }
      />

      {/* Integrity stat cards — owner only */}
      {isOwner && (
        <div className="mb-6">
          {statsLoading && !stats ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading stats...
            </div>
          ) : stats && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <StatCard label="Datasets"         value={stats.totalDatasets}        icon={Database}    color="bg-violet-500/10 text-violet-600"  delay={0.00} />
                <StatCard label="Blockchain Txs"   value={stats.blockchainRegistered}  icon={Link}        color="bg-blue-500/10 text-blue-600"      delay={0.04} />
                <StatCard label="Total Requests"   value={stats.totalRequests}         icon={Users}       color="bg-amber-500/10 text-amber-600"    delay={0.08} />
                <StatCard label="Integrity Checks" value={stats.totalIntegrityChecks}  icon={ShieldCheck} color="bg-emerald-500/10 text-emerald-600" delay={0.12} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <StatCard label="Approved"  value={stats.approvedCount}  icon={CheckCircle2} color="bg-emerald-500/10 text-emerald-600" delay={0.16} />
                <StatCard label="Rejected"  value={stats.rejectedCount}  icon={XCircle}      color="bg-red-500/10 text-red-600"         delay={0.20} />
                <StatCard label="Revoked"   value={stats.revokedCount}   icon={Activity}     color="bg-orange-500/10 text-orange-600"   delay={0.24} />
                <StatCard
                  label="Integrity Failures"
                  value={stats.integrityFailed}
                  icon={ShieldCheck}
                  color={stats.integrityFailed > 0 ? "bg-red-500/10 text-red-600" : "bg-emerald-500/10 text-emerald-600"}
                  delay={0.28}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Filters */}
      <Card className="p-4 mb-4 shadow-card">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by file, actor or tx hash..." value={q} onChange={e => setQ(e.target.value)} className="pl-9" />
          </div>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {uniqueActions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Event table */}
      <Card className="shadow-card overflow-hidden">
        <Table>
          <TableHeader>
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
                    <Loader2 className="h-5 w-5 animate-spin" />Loading events...
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
            {!loading && !error && rows.map((r, i) => {
              const meta = actionMeta[r.action] ?? { icon: FileCheck2, color: "bg-muted text-muted-foreground" };
              const Icon = meta.icon;
              return (
                <motion.tr
                  key={`${r.txHash ?? r.eventType}-${i}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="border-b border-border hover:bg-muted/40 transition-colors"
                >
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(r.timestamp)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={`gap-1 ${meta.color}`}>
                      <Icon className="h-3 w-3" />{r.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs max-w-[180px] truncate" title={r.fileName}>{r.fileName}</TableCell>
                  <TableCell className="text-sm">{r.actor}</TableCell>
                  <TableCell><TxBadge txHash={r.txHash} etherscanUrl={r.etherscanUrl} /></TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{r.blockNumber ?? "—"}</TableCell>
                </motion.tr>
              );
            })}
            {!loading && !error && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                  {events.length === 0 ? "No events recorded yet." : "No matching events."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {!loading && !error && events.length > 0 && (
          <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
            <span>{rows.length} of {events.length} event{events.length !== 1 ? "s" : ""}</span>
            <a href="https://sepolia.etherscan.io" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-400 hover:underline">
              Etherscan <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </Card>
    </>
  );
};

export default Audit;
