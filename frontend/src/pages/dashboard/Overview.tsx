import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  FileText, Inbox, ShieldCheck, Activity,
  TrendingUp, Database, FlaskConical, ArrowRight, Loader2,
} from "lucide-react";
import { PageHeader }  from "@/components/dashboard/PageHeader";
import { StatCard }    from "@/components/dashboard/StatCard";
import { Card }        from "@/components/ui/card";
import { Button }      from "@/components/ui/button";
import { Badge }       from "@/components/ui/badge";
import { useAuth }     from "@/contexts/AuthContext";

const API_BASE = "http://localhost:5000/api";

const Overview = () => {
  const { user, token = "" } = useAuth();
  const navigate = useNavigate();
  const isOwner = user?.role === "owner";

  // ── Stats state ───────────────────────────────────────────────────────────
  const [fileCount,    setFileCount]    = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [grantCount,   setGrantCount]   = useState<number | null>(null);
  const [auditCount,   setAuditCount]   = useState<number | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!token || !isOwner) { setLoadingStats(false); return; }
    setLoadingStats(true);
    try {
      // 1. File count
      const filesRes = await fetch(`${API_BASE}/files/my-files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (filesRes.ok) {
        const d = await filesRes.json();
        setFileCount(d.count ?? (d.files?.length ?? 0));
      }

      // 2. Pending requests + active grants (single call)
      const reqRes = await fetch(`${API_BASE}/access/incoming-requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (reqRes.ok) {
        const d = await reqRes.json();
        const all: any[] = d.requests ?? [];
        setPendingCount(all.filter(r => r.status === "pending").length);
        setGrantCount(
          all.filter(r => {
            if (r.status !== "approved") return false;
            if (!r.accessExpiresAt) return true;
            return new Date(r.accessExpiresAt).getTime() > Date.now();
          }).length
        );
      }

      // 3. Total audit events
      const auditRes = await fetch(`${API_BASE}/audit`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (auditRes.ok) {
        const d = await auditRes.json();
        setAuditCount(d.count ?? (d.events?.length ?? 0));
      }
    } catch { /* silently ignore – individual cards stay at 0 */ }
    finally { setLoadingStats(false); }
  }, [token, isOwner]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const val = (n: number | null) => (loadingStats ? "…" : String(n ?? 0));

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.name}`}
        description={
          isOwner
            ? "Manage your encrypted datasets and incoming access requests."
            : "Browse datasets and track your active access grants."
        }
      />

      {/* ── Stat cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isOwner ? (
          <>
            <StatCard
              title="Files uploaded"
              value={val(fileCount)}
              icon={FileText}
              trend="Azure + IPFS backed"
              delay={0}
            />
            <StatCard
              title="Pending requests"
              value={val(pendingCount)}
              icon={Inbox}
              trend={
                loadingStats
                  ? "Loading…"
                  : (pendingCount ?? 0) === 0
                    ? "No pending requests"
                    : `${pendingCount} awaiting your review`
              }
              accent="warning"
              delay={0.05}
            />
            <StatCard
              title="Active grants"
              value={val(grantCount)}
              icon={ShieldCheck}
              trend={
                loadingStats
                  ? "Loading…"
                  : (grantCount ?? 0) === 0
                    ? "No active sessions"
                    : `${grantCount} researcher${(grantCount ?? 0) !== 1 ? "s" : ""} with access`
              }
              accent="success"
              delay={0.1}
            />
            <StatCard
              title="Audit events"
              value={val(auditCount)}
              icon={Activity}
              trend="Blockchain-verified trail"
              delay={0.15}
            />
          </>
        ) : (
          <>
            <StatCard title="Available datasets" value="—" icon={Database}    trend="Browse catalog"  delay={0} />
            <StatCard title="Requests sent"      value="—" icon={Inbox}       trend="Track status"    accent="warning" delay={0.05} />
            <StatCard title="Active access"      value="—" icon={ShieldCheck} trend="Live sessions"   accent="success" delay={0.1} />
            <StatCard title="Files analyzed"     value="—" icon={TrendingUp}  trend="Data usage"      delay={0.15} />
          </>
        )}
      </div>

      {/* ── Lower panels ───────────────────────────────────────────────── */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Recent uploads (owner only) */}
        {isOwner && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="lg:col-span-2"
          >
            <Card className="p-6 shadow-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Recent uploads</h3>
                <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/upload")}>
                  View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>

              {loadingStats ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                </div>
              ) : fileCount === 0 || fileCount === null ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No files uploaded yet.</p>
                  <Button
                    variant="outline" size="sm" className="mt-3"
                    onClick={() => navigate("/dashboard/upload")}
                  >
                    Upload your first file
                  </Button>
                </div>
              ) : (
                <div
                  className="flex items-center gap-3 p-4 rounded-xl"
                  style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.15)" }}
                >
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
                  >
                    <FileText className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">
                      {fileCount} genomic file{fileCount !== 1 ? "s" : ""} stored
                    </p>
                    <p className="text-xs text-muted-foreground">Azure primary · IPFS backup</p>
                  </div>
                  <Button
                    variant="ghost" size="sm" className="ml-auto text-xs"
                    onClick={() => navigate("/dashboard/upload")}
                  >
                    Manage <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </Card>
          </motion.div>
        )}

        {/* Quick actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className={isOwner ? "" : "lg:col-span-2"}
        >
          <Card className="p-6 shadow-card h-full">
            <h3 className="font-semibold mb-4">Quick actions</h3>
            <div className="space-y-2">
              {(isOwner ? [
                { label: "Upload new dataset",  to: "/dashboard/upload",       icon: FileText    },
                { label: "Review requests",     to: "/dashboard/requests",     icon: Inbox       },
                { label: "Check verification",  to: "/dashboard/verification", icon: ShieldCheck },
              ] : [
                { label: "Browse datasets",     to: "/researcher/datasets",    icon: Database    },
                { label: "View my access",      to: "/researcher/accessed",    icon: ShieldCheck },
                { label: "Run verification",    to: "/researcher/audit",       icon: FlaskConical },
              ]).map(a => (
                <button
                  key={a.to}
                  onClick={() => navigate(a.to)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors text-left group"
                >
                  <div className="h-9 w-9 rounded-lg bg-gradient-primary text-primary-foreground flex items-center justify-center shadow-elegant">
                    <a.icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium flex-1">{a.label}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </button>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="h-4 w-4 text-success" />
                <span className="text-sm font-medium">Vault status</span>
              </div>
              <Badge className="bg-success text-success-foreground">All systems secure</Badge>
              <p className="mt-3 text-xs text-muted-foreground">
                Azure Blob Storage · Filebase IPFS · JWT auth · TOTP MFA
              </p>
            </div>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default Overview;
