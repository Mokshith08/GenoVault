import { useState } from "react";
import { motion } from "framer-motion";
import { Check, X, Database, FlaskConical, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/contexts/AuthContext";
import { mockRequests, mockDatasets, AccessRequest } from "@/lib/mockData";

const Requests = () => {
  const { user } = useAuth();
  const isOwner = user?.role === "owner";
  const [requests, setRequests] = useState<AccessRequest[]>(mockRequests);
  const [datasets] = useState(mockDatasets);
  const [pending, setPending] = useState<{ req: AccessRequest; action: "approve" | "reject" } | null>(null);
  const [dialogStep, setDialogStep] = useState<"confirm" | "otp">("confirm");
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [requested, setRequested] = useState<string[]>([]);

  const submit = () => {
    if (otp.length !== 6) { toast.error("Enter the 6-digit PIN"); return; }
    if (!pending) return;
    setVerifying(true);
    setTimeout(() => {
      setRequests(rs => rs.map(r => r.id === pending.req.id ? { ...r, status: pending.action === "approve" ? "Approved" : "Rejected" } : r));
      toast.success(pending.action === "approve" ? "Access approved · 24h grant active" : "Request rejected");
      setVerifying(false); setPending(null); setOtp(""); setDialogStep("confirm");
    }, 700);
  };

  const requestAccess = (datasetName: string) => {
    setRequested(r => [...r, datasetName]);
    toast.success(`Access request sent for ${datasetName}`);
  };

  if (!isOwner) {
    // Researcher: dataset catalog
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
                  {requested.includes(d.name) ? <><Check className="h-4 w-4 mr-1" />Requested</> : <><FlaskConical className="h-4 w-4 mr-1.5" />Request access</>}
                </Button>
              </Card>
            </motion.div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Access Requests" description="Review and approve researcher requests with OTP verification." />

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
                      r.status === "Pending" ? "bg-warning text-warning-foreground" :
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
                    <Button variant="outline" onClick={() => { setPending({ req: r, action: "reject" }); setDialogStep("confirm"); }}>
                      <X className="h-4 w-4 mr-1" />Reject
                    </Button>
                    <Button onClick={() => { setPending({ req: r, action: "approve" }); setDialogStep("confirm"); }} className="bg-gradient-primary hover:opacity-90 shadow-elegant">
                      <Check className="h-4 w-4 mr-1" />Approve
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Dialog open={!!pending} onOpenChange={o => { if (!o) { setPending(null); setOtp(""); setDialogStep("confirm"); } }}>
        <DialogContent>
          {dialogStep === "confirm" ? (
            <>
              <DialogHeader>
                <DialogTitle>Confirm Action</DialogTitle>
                <DialogDescription>
                  Are you sure you want to {pending?.action} the access request from{" "}
                  <span className="font-medium text-foreground">{pending?.req.researcher}</span>?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => { setPending(null); setOtp(""); setDialogStep("confirm"); }}>No</Button>
                <Button onClick={() => setDialogStep("otp")} className="bg-gradient-primary text-primary-foreground hover:opacity-90">Yes</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <div className="h-12 w-12 rounded-xl bg-gradient-primary text-primary-foreground shadow-elegant flex items-center justify-center mb-2">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <DialogTitle>Confirm with OTP</DialogTitle>
                <DialogDescription>
                  Enter the OTP sent to your email to {pending?.action} access for{" "}
                  <span className="font-medium text-foreground">{pending?.req.researcher}</span>.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-center py-4">
                <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                  <InputOTPGroup>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <InputOTPSlot key={i} index={i} className="h-11 w-11" />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setPending(null); setOtp(""); setDialogStep("confirm"); }}>Cancel</Button>
                <Button onClick={submit} disabled={verifying} className={pending?.action === "approve" ? "bg-gradient-primary" : "bg-destructive"}>
                  {verifying ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying...</> : `Confirm ${pending?.action}`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Requests;
