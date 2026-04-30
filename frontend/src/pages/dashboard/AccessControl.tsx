import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Clock, Ban, User, AlertTriangle, KeyRound, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PinInput } from "@/components/ui/PinInput";
import { useAuth } from "@/contexts/AuthContext";
import { mockActive, ActiveAccess } from "@/lib/mockData";

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
        <Button className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={handleSubmit} disabled={digits.join("").length < 6}>
          Confirm Revoke
        </Button>
      </div>
    </div>
  );
};

/* ─────────────── Modal Backdrop ─────────────── */
interface ModalProps { children: React.ReactNode; onClose: () => void; }
const Modal = ({ children, onClose }: ModalProps) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
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
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
      >
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
  const [grants, setGrants] = useState<ActiveAccess[]>(mockActive);
  const [step, setStep] = useState<Step>("idle");
  const [targetId, setTargetId] = useState<string | null>(null);

  const targetGrant = grants.find(g => g.id === targetId);

  const openRevoke = (id: string) => {
    setTargetId(id);
    setStep("confirm");
  };

  const closeModal = () => {
    setStep("idle");
    setTargetId(null);
  };

  const onConfirmYes = () => setStep("pin");

  const onPinSuccess = () => {
    if (!targetId) return;
    setGrants(g => g.map(x => x.id === targetId ? { ...x, status: "Expired", expiresAt: Date.now() } : x));
    toast.success("Access revoked successfully");
    closeModal();
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
                    onClick={() => openRevoke(g.id)}
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

      {/* ── Modals ── */}
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
                    This will immediately revoke <span className="text-foreground font-medium">{targetGrant.user}</span>'s access to <span className="text-foreground font-mono">{targetGrant.dataset}</span>.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
                ⚠ This action cannot be undone. The researcher will lose access instantly.
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={closeModal}>
                  No, go back
                </Button>
                <Button
                  className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  onClick={onConfirmYes}
                >
                  Yes, revoke
                </Button>
              </div>
            </div>
          </Modal>
        )}

        {step === "pin" && targetGrant && (
          <Modal onClose={closeModal}>
            <PinDialog
              grantUser={targetGrant.user}
              onSuccess={onPinSuccess}
              onClose={closeModal}
            />
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
};

export default AccessControl;
