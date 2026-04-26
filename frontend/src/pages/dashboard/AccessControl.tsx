import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Clock, Ban, User } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { mockActive, ActiveAccess } from "@/lib/mockData";

const useTick = (ms = 1000) => {
  const [, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN(n => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
};

const formatRemaining = (ms: number) => {
  if (ms <= 0) return "Expired";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
};

const AccessControl = () => {
  useTick(1000);
  const [grants, setGrants] = useState<ActiveAccess[]>(mockActive);

  const revoke = (id: string) => {
    setGrants(g => g.map(x => x.id === id ? { ...x, status: "Expired", expiresAt: Date.now() } : x));
    toast.success("Access revoked");
  };

  return (
    <>
      <PageHeader title="Access Control" description="Live view of active grants. Revoke instantly or let auto-expiry run." />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {grants.map((g, i) => {
          const totalDuration = 24 * 3600 * 1000;
          const remaining = g.expiresAt - Date.now();
          const elapsed = totalDuration - remaining;
          const pct = Math.max(0, Math.min(100, (elapsed / totalDuration) * 100));
          const isActive = g.status === "Active" && remaining > 0;

          return (
            <motion.div key={g.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="p-5 shadow-card hover:shadow-elegant transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-11 w-11 rounded-xl flex items-center justify-center shadow-elegant ${isActive ? "bg-gradient-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{g.user}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate max-w-[180px]">{g.dataset}</p>
                    </div>
                  </div>
                  <Badge className={isActive ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}>
                    {isActive ? <><ShieldCheck className="h-3 w-3 mr-1" />Active</> : "Expired"}
                  </Badge>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />Time remaining</span>
                    <span className={`font-mono font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                      {formatRemaining(remaining)}
                    </span>
                  </div>
                  <Progress value={pct} className={`h-1.5 ${!isActive ? "opacity-40" : ""}`} />
                </div>

                <div className="mt-4 pt-4 border-t border-border flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => revoke(g.id)}
                    disabled={!isActive}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Ban className="h-4 w-4 mr-1.5" />Revoke
                  </Button>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </>
  );
};

export default AccessControl;
