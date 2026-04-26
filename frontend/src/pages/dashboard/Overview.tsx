import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { FileText, Inbox, ShieldCheck, Activity, TrendingUp, Database, FlaskConical, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { mockFiles, mockRequests, mockActive, mockAudit, mockDatasets } from "@/lib/mockData";

const Overview = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isOwner = user?.role === "owner";

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.name}`}
        description={isOwner ? "Manage your encrypted datasets and incoming access requests." : "Browse datasets and track your active access grants."}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isOwner ? (
          <>
            <StatCard title="Files uploaded" value={mockFiles.length} icon={FileText} trend="+2 this week" delay={0} />
            <StatCard title="Pending requests" value={mockRequests.filter(r => r.status === "Pending").length} icon={Inbox} trend="Action required" accent="warning" delay={0.05} />
            <StatCard title="Active grants" value={mockActive.filter(a => a.status === "Active").length} icon={ShieldCheck} trend="Auto-expire 24h" accent="success" delay={0.1} />
            <StatCard title="Audit events" value={mockAudit.length} icon={Activity} trend="Last 24h" delay={0.15} />
          </>
        ) : (
          <>
            <StatCard title="Available datasets" value={mockDatasets.length} icon={Database} trend="Across institutions" delay={0} />
            <StatCard title="Requests sent" value={2} icon={Inbox} trend="1 pending review" accent="warning" delay={0.05} />
            <StatCard title="Active access" value={1} icon={ShieldCheck} trend="22h remaining" accent="success" delay={0.1} />
            <StatCard title="Files analyzed" value={7} icon={TrendingUp} trend="+3 this week" delay={0.15} />
          </>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-2">
          <Card className="p-6 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Recent activity</h3>
              <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/audit")}>
                View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="space-y-3">
              {mockAudit.slice(0, 5).map(a => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center">
                    <Activity className="h-4 w-4 text-accent-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      <span className="text-muted-foreground">{a.user}</span> · {a.action}
                    </p>
                    <p className="text-xs text-muted-foreground truncate font-mono">{a.target}</p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{a.timestamp.split(" ")[1]}</span>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="p-6 shadow-card h-full">
            <h3 className="font-semibold mb-4">Quick actions</h3>
            <div className="space-y-2">
              {(isOwner ? [
                { label: "Upload new dataset", to: "/dashboard/upload", icon: FileText },
                { label: "Review requests", to: "/dashboard/requests", icon: Inbox },
                { label: "Check verification", to: "/dashboard/verification", icon: ShieldCheck },
              ] : [
                { label: "Browse datasets", to: "/dashboard/requests", icon: Database },
                { label: "View my access", to: "/dashboard/access", icon: ShieldCheck },
                { label: "Run verification", to: "/dashboard/verification", icon: FlaskConical },
              ]).map(a => (
                <button key={a.to} onClick={() => navigate(a.to)} className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors text-left group">
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
              <p className="mt-3 text-xs text-muted-foreground">Last security scan: 2 minutes ago. No anomalies detected.</p>
            </div>
          </Card>
        </motion.div>
      </div>
    </>
  );
};

export default Overview;
