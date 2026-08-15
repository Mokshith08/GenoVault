import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck, Database, Users, CheckCircle2, XCircle,
  RefreshCw, Loader2, Activity, Link, Clock,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card }       from "@/components/ui/card";
import { Button }     from "@/components/ui/button";
import { Badge }      from "@/components/ui/badge";
import { useAuth }    from "@/contexts/AuthContext";

const API_BASE = "http://localhost:5000/api";
const REFRESH_INTERVAL_MS = 60_000;

interface OwnerStats {
  totalDatasets:        number;
  blockchainRegistered: number;
  totalRequests:        number;
  pendingCount:         number;
  approvedCount:        number;
  rejectedCount:        number;
  revokedCount:         number;
  integrityVerified:    number;
  integrityFailed:      number;
  totalIntegrityChecks: number;
}

interface ActivityEvent {
  id:        string;
  operation: string;
  status:    "success" | "failure";
  fileName:  string;
  datasetId: string | null;
  actor:     string;
  details:   Record<string, unknown>;
  timestamp: string;
}

const operationMeta: Record<string, { label: string; color: string }> = {
  INTEGRITY_VERIFIED:  { label: "Integrity Verified",  color: "text-emerald-600" },
  INTEGRITY_FAILED:    { label: "Integrity Failed",     color: "text-red-600"     },
  DOWNLOAD_INITIATED:  { label: "Download Started",     color: "text-blue-600"    },
  DOWNLOAD_COMPLETED:  { label: "Download Completed",   color: "text-emerald-600" },
  DOWNLOAD_FAILED:     { label: "Download Failed",      color: "text-red-600"     },
  UPLOAD:              { label: "File Upload",          color: "text-violet-600"  },
  ACCESS_APPROVED:     { label: "Access Approved",      color: "text-emerald-600" },
  ACCESS_REJECTED:     { label: "Access Rejected",      color: "text-red-600"     },
  ACCESS_REVOKED:      { label: "Access Revoked",       color: "text-amber-600"   },
  ACCESS_REQUEST:      { label: "Access Requested",     color: "text-blue-600"    },
};

const StatCard = ({
  label, value, sub, icon: Icon, color, delay,
}: {
  label: string; value: number | string; sub?: string;
  icon: React.ElementType; color: string; delay?: number;
}) => (
  <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: delay ?? 0 }}>
    <Card className="p-5 shadow-card hover:shadow-elegant transition-shadow">
      <div className="flex items-center gap-3">
        <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </div>
    </Card>
  </motion.div>
);

const IntegrityDashboard = () => {
  const { token = "" } = useAuth();
  const [stats,    setStats]    = useState<OwnerStats | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStats = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const [statsRes, auditRes] = await Promise.all([
        fetch(`${API_BASE}/integrity/owner-stats`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/audit`,                 { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (statsRes.ok) {
        const d = await statsRes.json();
        if (d.success) {
          setStats(d.stats);
          setActivity(d.recentActivity ?? []);
        }
      }
      // Supplement activity with audit events if owner-stats returned none
      if (auditRes.ok) {
        const a = await auditRes.json();
        setActivity(prev => {
          if (prev.length > 0) return prev;
          return (a.events ?? []).slice(0, 10).map((e: { id?: string; eventType?: string; status?: string; fileName?: string; datasetId?: string | null; actor?: string; details?: Record<string, unknown>; timestamp?: string }) => ({
            id:        e.id ?? String(Math.random()),
            operation: e.eventType ?? e.operation ?? "UNKNOWN",
            status:    e.status ?? "success",
            fileName:  e.fileName ?? "Unknown",
            datasetId: e.datasetId ?? null,
            actor:     e.actor ?? "Unknown",
            details:   e.details ?? {},
            timestamp: e.timestamp ?? new Date().toISOString(),
          }));
        });
      }
      setLastSync(new Date());
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    fetchStats();
    timerRef.current = setInterval(fetchStats, REFRESH_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchStats]);

  return (
    <>
      <PageHeader
        title="Integrity Dashboard"
        description="Research data security overview — blockchain registrations, access activity, and integrity checks."
      />

      {/* Refresh bar */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs text-muted-foreground">
          {lastSync ? `Last synced ${lastSync.toLocaleTimeString()}` : "Loading…"}
        </p>
        <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading && !stats ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-7 w-7 text-muted-foreground animate-spin" />
        </div>
      ) : (
        <>
          {/* Primary stat row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <StatCard label="Datasets"            value={stats?.totalDatasets ?? 0}        icon={Database}    color="bg-violet-500/10 text-violet-600"  delay={0.00} />
            <StatCard label="Blockchain Txs"      value={stats?.blockchainRegistered ?? 0}  icon={Link}        color="bg-blue-500/10 text-blue-600"      delay={0.05} />
            <StatCard label="Total Requests"      value={stats?.totalRequests ?? 0}         icon={Users}       color="bg-amber-500/10 text-amber-600"    delay={0.10} />
            <StatCard label="Integrity Checks"    value={stats?.totalIntegrityChecks ?? 0}  icon={ShieldCheck} color="bg-emerald-500/10 text-emerald-600" delay={0.15} />
          </div>

          {/* Secondary stat row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard label="Approved"            value={stats?.approvedCount ?? 0}         icon={CheckCircle2} color="bg-emerald-500/10 text-emerald-600" delay={0.20} />
            <StatCard label="Rejected"            value={stats?.rejectedCount ?? 0}         icon={XCircle}      color="bg-red-500/10 text-red-600"        delay={0.25} />
            <StatCard label="Revoked"             value={stats?.revokedCount ?? 0}          icon={Activity}     color="bg-orange-500/10 text-orange-600"  delay={0.30} />
            <StatCard
              label="Integrity Failures"
              value={stats?.integrityFailed ?? 0}
              sub={stats && stats.integrityFailed > 0 ? "⚠ Action needed" : "All clear"}
              icon={ShieldCheck}
              color={stats && stats.integrityFailed > 0 ? "bg-red-500/10 text-red-600" : "bg-emerald-500/10 text-emerald-600"}
              delay={0.35}
            />
          </div>

          {/* Recent activity table */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.40 }}>
            <Card className="shadow-card">
              <div className="p-4 border-b border-border">
                <h2 className="font-semibold text-sm">Recent Audit Activity</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Last 10 events across your datasets</p>
              </div>
              {activity.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No audit events yet.</p>
                  <p className="text-xs mt-1">Events appear here once researchers download or verify files.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {activity.map((e, i) => {
                    const meta = operationMeta[e.operation] ?? { label: e.operation, color: "text-muted-foreground" };
                    return (
                      <motion.div
                        key={e.id ?? i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.40 + i * 0.03 }}
                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center bg-muted shrink-0`}>
                            {e.status === "success"
                              ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              : <XCircle      className="h-4 w-4 text-red-500" />}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-xs font-semibold ${meta.color}`}>{meta.label}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {e.fileName}
                              {e.datasetId && <span className="ml-1.5 font-mono opacity-70">{e.datasetId}</span>}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                          <span>{e.actor}</span>
                          <Badge variant="outline" className={e.status === "success" ? "border-emerald-500/50 text-emerald-600" : "border-red-500/50 text-red-600"}>
                            {e.status}
                          </Badge>
                          <span className="flex items-center gap-1 tabular-nums">
                            <Clock className="h-3 w-3" />
                            {new Date(e.timestamp).toLocaleString()}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </Card>
          </motion.div>
        </>
      )}
    </>
  );
};

export default IntegrityDashboard;
