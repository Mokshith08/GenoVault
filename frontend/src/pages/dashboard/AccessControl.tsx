import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, Clock, Ban, User, AlertTriangle, KeyRound, X,
  RefreshCw, Loader2, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PinInput } from "@/components/ui/PinInput";
import { useAuth } from "@/contexts/AuthContext";

// ── Real grant type from API ──────────────────────────────────────────────────
interface Grant {
  _id: string;
  researcher: { _id: string; name: string; email: string; orcid?: string };
  file: { _id: string; originalName: string; blockchainFileId?: number };
  status: "pending" | "approved" | "denied" | "rejected" | "revoked";
  approvedAt?: string;
  accessExpiresAt?: string;
  revokeTxHash?: string;
  revokeEtherscanUrl?: string;
}

/* ── 1-second ticker ── */
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

/* ─────────────── PIN Dialog ─────────────── */
interface PinDialogProps {
  grantUser: string;
  onSuccess: () => void;
  onClose: () => void;
}

const PinDialog = ({ grantUser, onSuccess, onClose }: PinDialogProps) => {
  const { pin } = useAuth();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [shake, setShake] = useState(false);

  const handleSubmit = () => {
    const entered = digits.join("");
    if (entered.length < 6) { toast.error("Enter all 6 digits"); return; }
    if (entered === (pin ?? "")) {
      onSuccess();
    } else {
      setShake(true);
      setDigits(Array(6).fill(""));
      setTimeout(() => setShake(false), 600);
      toast.error("Incorrect PIN. Try again.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
          <KeyRound className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-sm">Enter your 6-digit PIN</p>
          <p className="text-xs text-muted-foreground">To revoke access for <span className="text-foreground font-medium">{grantUser}</span></p>
        </div>
      </div>
      <PinInput value={digits} onChange={setDigits} shake={shake} autoFocus />
      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button
          className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          onClick={handleSubmit}
          disabled={digits.join("").length < 6}
        >
          Confirm Revoke
        </Button>
      </div>
    </div>
  );
};

/* ─────────────── Modal Backdrop ─────────────── */
const Modal = ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => (
  <motion.div
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    className="fixed inset-0 z-50 flex items-center justify-center p-4"
    style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}
  >
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 16 }}
      transition={{ type: "spring", damping: 22, stiffness: 300 }}
      className="relative w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl p-6"
    >
      <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors">
        <X className="h-4 w-4" />
      </button>
      {children}
    </motion.div>
  </motion.div>
);

/* ─────────────── Main Page ─────────────── */
type Step = "idle" | "confirm" | "pin";

const AccessControl = () => {
  useTick(1000);
  const { token } = useAuth();

  const [grants,     setGrants]     = useState<Grant[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [revoking,   setRevoking]   = useState(false);

  const [step,     setStep]     = useState<Step>("idle");
  const [targetId, setTargetId] = useState<string | null>(null);
  const targetGrant = grants.find(g => g._id === targetId);

  /* ── Fetch approved grants ─────────────────────────────────────── */
  const fetchGrants = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const res  = await fetch("http://localhost:5000/api/access/incoming-requests", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load grants");
      // Only show approved (or recently revoked) grants
      const relevant = (data.requests ?? []).filter(
        (r: Grant) => r.status === "approved" || r.status === "revoked"
      );
      setGrants(relevant);
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { fetchGrants(); }, [fetchGrants]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => fetchGrants(true), 30_000);
    return () => clearInterval(id);
  }, [fetchGrants]);

  /* ── Revoke flow ───────────────────────────────────────────────── */
  const openRevoke  = (id: string) => { setTargetId(id); setStep("confirm"); };
  const closeModal  = () => { setStep("idle"); setTargetId(null); setRevoking(false); };
  const onConfirmYes = () => setStep("pin");

  const onPinSuccess = async () => {
    if (!targetId) return;
    setRevoking(true);
    try {
      const res  = await fetch("http://localhost:5000/api/access/revoke-access", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId: targetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Revoke failed");
      toast.success("Access revoked successfully");
      fetchGrants(true);
      closeModal();
    } catch (e: any) {
      toast.error(e.message || "Failed to revoke");
      setRevoking(false);
    }
  };

  /* ── Render ────────────────────────────────────────────────────── */
  return (
    <>
      <PageHeader
        title="Access Control"
        description="Live view of active grants. Revoke instantly or let auto-expiry run."
        actions={
          <Button variant="outline" size="sm" onClick={() => fetchGrants(true)} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-2/3" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full" />
              <div className="h-9 bg-muted rounded-lg w-28 ml-auto" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-dashed border-red-500/30 bg-red-500/5">
          <AlertTriangle className="h-8 w-8 text-red-400 mb-2" />
          <p className="text-sm text-red-400">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchGrants()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && grants.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center py-20 text-center rounded-xl border border-dashed"
        >
          <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <ShieldCheck className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="font-semibold mb-1">No Active Grants</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            When you approve researcher requests, their 24-hour grants will appear here.
          </p>
        </motion.div>
      )}

      {/* Grant cards */}
      {!loading && !error && grants.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {grants.map((g, i) => {
            const expiresMs  = g.accessExpiresAt ? new Date(g.accessExpiresAt).getTime() : 0;
            const grantedMs  = g.approvedAt ? new Date(g.approvedAt).getTime() : expiresMs - 24 * 3600_000;
            const totalDuration = 24 * 3600_000;
            const remaining  = expiresMs - Date.now();
            const elapsed    = totalDuration - remaining;
            const pct        = Math.max(0, Math.min(100, (elapsed / totalDuration) * 100));
            const isActive   = g.status === "approved" && remaining > 0;

            return (
              <motion.div key={g._id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="p-5 shadow-card hover:shadow-elegant transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`h-11 w-11 rounded-xl flex items-center justify-center shadow-elegant ${isActive ? "bg-gradient-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        <User className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{g.researcher.name}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate max-w-[180px]">
                          {g.file.originalName}
                        </p>
                      </div>
                    </div>
                    <Badge className={isActive ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}>
                      {isActive ? <><ShieldCheck className="h-3 w-3 mr-1" />Active</> : "Expired"}
                    </Badge>
                  </div>

                  {/* ORCID */}
                  {g.researcher.orcid && (
                    <p className="text-xs text-muted-foreground font-mono mb-2 truncate">
                      ORCID: {g.researcher.orcid}
                    </p>
                  )}

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />Time remaining</span>
                      <span className={`font-mono font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                        {formatRemaining(remaining)}
                      </span>
                    </div>
                    <Progress value={pct} className={`h-1.5 ${!isActive ? "opacity-40" : ""}`} />
                  </div>

                  {/* Revoke tx link */}
                  {g.revokeEtherscanUrl && (
                    <div className="mt-3">
                      <a href={g.revokeEtherscanUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:underline">
                        <ExternalLink className="h-3 w-3" />View revoke tx
                      </a>
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-border flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openRevoke(g._id)}
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
      )}

      {/* Modals */}
      <AnimatePresence>
        {step === "confirm" && targetGrant && (
          <Modal onClose={closeModal}>
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-destructive/20 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Revoke Access?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    This will immediately revoke{" "}
                    <span className="text-foreground font-medium">{targetGrant.researcher.name}</span>'s access to{" "}
                    <span className="text-foreground font-mono">{targetGrant.file.originalName}</span>.
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                ⚠ This action is recorded on the blockchain and cannot be undone.
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={closeModal}>No, go back</Button>
                <Button className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={onConfirmYes}>
                  Yes, revoke
                </Button>
              </div>
            </div>
          </Modal>
        )}

        {step === "pin" && targetGrant && (
          <Modal onClose={closeModal}>
            {revoking ? (
              <div className="flex flex-col items-center py-6 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Revoking on blockchain…</p>
              </div>
            ) : (
              <PinDialog
                grantUser={targetGrant.researcher.name}
                onSuccess={onPinSuccess}
                onClose={closeModal}
              />
            )}
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
};

export default AccessControl;
