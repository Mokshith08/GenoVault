import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Database, FlaskConical, ShieldCheck, KeyRound, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PinInput } from "@/components/ui/PinInput";
import { useAuth } from "@/contexts/AuthContext";
import { mockRequests, mockDatasets, AccessRequest } from "@/lib/mockData";

/* ─────────────── PIN Step ─────────────── */
interface PinStepProps {
  action: "approve" | "reject";
  researcher: string;
  onSuccess: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

const PinStep = ({ action, researcher, onSuccess, onCancel, isLoading }: PinStepProps) => {
  const { pin } = useAuth();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [shake, setShake] = useState(false);
  const isApprove = action === "approve";

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
        <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${isApprove ? "bg-primary/20" : "bg-destructive/20"}`}>
          <KeyRound className={`h-5 w-5 ${isApprove ? "text-primary" : "text-destructive"}`} />
        </div>
        <div>
          <p className="font-semibold text-sm">Enter your 6-digit PIN</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            To <span className={`font-medium ${isApprove ? "text-primary" : "text-destructive"}`}>{action}</span> access for{" "}
            <span className="text-foreground font-medium">{researcher}</span>
          </p>
        </div>
      </div>

      <PinInput value={digits} onChange={setDigits} shake={shake} autoFocus />

      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={isLoading}>Cancel</Button>
        <Button
          className={`flex-1 ${isApprove ? "bg-gradient-primary hover:opacity-90 text-primary-foreground" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}`}
          onClick={handleSubmit}
          disabled={isLoading || digits.join("").length < 6}
        >
          {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying...</> : `Confirm ${action}`}
        </Button>
      </div>
    </div>
  );
};

/* ─────────────── Inline Modal (same style as AccessControl) ─────────────── */
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
      {children}
    </motion.div>
  </motion.div>
);

/* ─────────────── Main Page ─────────────── */
type Step = "idle" | "confirm" | "pin";

const Requests = () => {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [requests, setRequests] = useState<AccessRequest[]>(mockRequests);
  const [datasets] = useState(mockDatasets);
  const [requested, setRequested] = useState<string[]>([]);

  const [step, setStep] = useState<Step>("idle");
  const [pending, setPending] = useState<{ req: AccessRequest; action: "approve" | "reject" } | null>(null);
  const [verifying, setVerifying] = useState(false);

  const openDialog = (req: AccessRequest, action: "approve" | "reject") => {
    setPending({ req, action });
    setStep("confirm");
  };

  const closeDialog = () => {
    setStep("idle");
    setPending(null);
    setVerifying(false);
  };

  const onConfirmYes = () => setStep("pin");

  const onPinSuccess = () => {
    if (!pending) return;
    setVerifying(true);
    setTimeout(() => {
      setRequests(rs => rs.map(r =>
        r.id === pending.req.id
          ? { ...r, status: pending.action === "approve" ? "Approved" : "Rejected" }
          : r
      ));
      toast.success(pending.action === "approve" ? "Access approved · 24h grant active" : "Request rejected");
      closeDialog();
    }, 700);
  };

  const requestAccess = (datasetName: string) => {
    setRequested(r => [...r, datasetName]);
    toast.success(`Access request sent for ${datasetName}`);
  };

  /* ── Researcher view ── */
  if (!isOwner) {
    return (
      <>
        <PageHeader title="Datasets" description="Browse available genomic datasets and request access." />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {datasets.map((d, i) => (
            <motion.div key={d.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className="p-5 shadow-card hover:shadow-elegant transition-shadow h-full flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="h-11 w-11 rounded-xl bg-gradient-primary text-primary-foreground flex items-center justify-center shadow-elegant">
                    <Database className="h-5 w-5" />
                  </div>
                  <Badge variant="secondary">{d.type}</Badge>
                </div>
                <h3 className="font-semibold truncate">{d.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">by {d.owner} · {d.samples} samples</p>
                <p className="text-sm text-muted-foreground mt-3 flex-1">{d.description}</p>
                <Button
                  className="mt-4 w-full"
                  variant={requested.includes(d.name) ? "secondary" : "default"}
                  disabled={requested.includes(d.name)}
                  onClick={() => requestAccess(d.name)}
                >
                  {requested.includes(d.name)
                    ? <><Check className="h-4 w-4 mr-1" />Requested</>
                    : <><FlaskConical className="h-4 w-4 mr-1.5" />Request access</>}
                </Button>
              </Card>
            </motion.div>
          ))}
        </div>
      </>
    );
  }

  /* ── Owner view ── */
  return (
    <>
      <PageHeader title="Access Requests" description="Review and approve researcher requests with PIN verification." />

      <div className="space-y-3">
        {requests.map((r, i) => (
          <motion.div key={r.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="p-5 shadow-card">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold truncate">{r.researcher}</h3>
                    <Badge variant="outline" className="text-xs">{r.email}</Badge>
                    <Badge className={
                      r.status === "Pending"  ? "bg-warning text-warning-foreground" :
                      r.status === "Approved" ? "bg-success text-success-foreground" :
                      "bg-destructive text-destructive-foreground"
                    }>{r.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Requesting <span className="font-mono text-foreground">{r.dataset}</span> — {r.purpose}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{r.requestedAt}</p>
                </div>

                {r.status === "Pending" && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => openDialog(r, "reject")}>
                      <X className="h-4 w-4 mr-1" />Reject
                    </Button>
                    <Button onClick={() => openDialog(r, "approve")} className="bg-gradient-primary hover:opacity-90 shadow-elegant">
                      <Check className="h-4 w-4 mr-1" />Approve
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {/* Step 1 — Confirmation */}
        {step === "confirm" && pending && (
          <Modal onClose={closeDialog}>
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${pending.action === "approve" ? "bg-primary/20" : "bg-destructive/20"}`}>
                  {pending.action === "approve"
                    ? <ShieldCheck className="h-5 w-5 text-primary" />
                    : <AlertTriangle className="h-5 w-5 text-destructive" />}
                </div>
                <div>
                  <p className="font-semibold text-sm">
                    {pending.action === "approve" ? "Approve Access?" : "Reject Request?"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Are you sure you want to <span className={`font-medium ${pending.action === "approve" ? "text-primary" : "text-destructive"}`}>{pending.action}</span> the request from{" "}
                    <span className="text-foreground font-medium">{pending.req.researcher}</span>?
                  </p>
                </div>
              </div>

              <div className={`rounded-xl border p-3 text-xs ${pending.action === "approve" ? "border-primary/20 bg-primary/5 text-primary" : "border-destructive/20 bg-destructive/5 text-destructive"}`}>
                {pending.action === "approve"
                  ? "✓ A 24-hour access grant will be created for this researcher."
                  : "⚠ The researcher will be notified that their request was rejected."}
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={closeDialog}>
                  No, go back
                </Button>
                <Button
                  className={`flex-1 ${pending.action === "approve" ? "bg-gradient-primary hover:opacity-90 text-primary-foreground" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}`}
                  onClick={onConfirmYes}
                >
                  Yes, {pending.action}
                </Button>
              </div>
            </div>
          </Modal>
        )}

        {/* Step 2 — PIN */}
        {step === "pin" && pending && (
          <Modal onClose={closeDialog}>
            <PinStep
              action={pending.action}
              researcher={pending.req.researcher}
              onSuccess={onPinSuccess}
              onCancel={closeDialog}
              isLoading={verifying}
            />
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
};

export default Requests;
