import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { DatabaseZap, Database, ClipboardList, CheckCircle, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";

interface Stats {
  availableDatasets: number;
  requestsSent:      number;
  approvedRequests:  number;
  activeSessions:    number;
}

export default function DashboardOverview() {
  const { token } = useAuth();
  const navigate   = useNavigate();
  const [stats,      setStats]      = useState<Stats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    else         setRefreshing(true);

    try {
      const [dsRes, reqRes] = await Promise.all([
        fetch("http://localhost:5000/api/files/public",        { headers: { Authorization: `Bearer ${token}` } }),
        fetch("http://localhost:5000/api/access/my-requests",  { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const dsData  = dsRes.ok  ? await dsRes.json()  : { files:    [] };
      const reqData = reqRes.ok ? await reqRes.json() : { requests: [] };

      const requests = reqData.requests ?? [];
      const now      = Date.now();

      setStats({
        availableDatasets: (dsData.files ?? []).length,
        requestsSent:      requests.length,
        approvedRequests:  requests.filter((r: any) => r.status === "approved").length,
        activeSessions:    requests.filter((r: any) =>
          r.status === "approved" &&
          r.accessExpiresAt &&
          new Date(r.accessExpiresAt).getTime() > now
        ).length,
      });
    } catch {
      // silently fail — UI shows previous state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const statCards = [
    {
      title:  "Available Datasets",
      value:  stats?.availableDatasets ?? 0,
      icon:   Database,
      color:  "text-blue-500",
      bg:     "bg-blue-500/10",
      link:   "/researcher/datasets",
      sub:    "genomic files from owners",
    },
    {
      title:  "Requests Sent",
      value:  stats?.requestsSent ?? 0,
      icon:   ClipboardList,
      color:  "text-purple-500",
      bg:     "bg-purple-500/10",
      link:   "/researcher/requests",
      sub:    "access applications submitted",
    },
    {
      title:  "Approved Requests",
      value:  stats?.approvedRequests ?? 0,
      icon:   CheckCircle,
      color:  "text-green-500",
      bg:     "bg-green-500/10",
      link:   "/researcher/requests",
      sub:    "requests approved by owners",
    },
    {
      title:  "Active Sessions",
      value:  stats?.activeSessions ?? 0,
      icon:   DatabaseZap,
      color:  "text-primary",
      bg:     "bg-primary/10",
      link:   "/researcher/accessed",
      sub:    "time-limited download grants",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dashboard Overview</h2>
          <p className="text-muted-foreground mt-1">
            Welcome to your researcher portal. Browse datasets and submit access requests.
          </p>
        </div>
        <Button
          variant="outline" size="icon" title="Refresh"
          onClick={() => fetchStats(true)} disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Stats grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
      >
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4, ease: "easeOut" }}
          >
            <Card
              className="hover:shadow-md transition-all duration-300 hover:-translate-y-1 overflow-hidden group cursor-pointer"
              onClick={() => navigate(stat.link)}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-md ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-9 w-12 bg-muted rounded animate-pulse mb-1" />
                ) : (
                  <div className={`text-3xl font-bold ${stat.value > 0 ? "text-foreground" : "text-muted-foreground/50"}`}>
                    {stat.value}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Welcome / CTA card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="rounded-xl border bg-card shadow-sm p-10 flex flex-col items-center justify-center text-center min-h-[220px]"
      >
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <DatabaseZap className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-xl font-bold mb-2">Explore Genomic Data</h3>
        <p className="text-muted-foreground max-w-md mb-4">
          Browse available datasets, submit access requests, and manage your approved sessions.
        </p>
        <Button onClick={() => navigate("/researcher/datasets")}>
          <Database className="h-4 w-4 mr-2" /> Browse Datasets
        </Button>
      </motion.div>
    </div>
  );
}
