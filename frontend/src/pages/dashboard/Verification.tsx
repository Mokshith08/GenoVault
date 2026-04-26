import { useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, ShieldAlert, FileCheck2, Loader2, FileText } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { mockFiles } from "@/lib/mockData";

const Verification = () => {
  const [verifying, setVerifying] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, boolean>>(
    Object.fromEntries(mockFiles.map(f => [f.id, f.verified]))
  );

  const verify = (id: string) => {
    setVerifying(id);
    setTimeout(() => {
      setResults(r => ({ ...r, [id]: Math.random() > 0.15 }));
      setVerifying(null);
    }, 900);
  };

  return (
    <>
      <PageHeader title="Data Verification" description="Compare stored hashes against on-chain records to detect tampering." />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-5 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-success text-success-foreground flex items-center justify-center"><ShieldCheck className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Verified</p><p className="text-2xl font-bold">{Object.values(results).filter(Boolean).length}</p></div>
          </div>
        </Card>
        <Card className="p-5 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-destructive text-destructive-foreground flex items-center justify-center"><ShieldAlert className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Tampered</p><p className="text-2xl font-bold">{Object.values(results).filter(v => !v).length}</p></div>
          </div>
        </Card>
        <Card className="p-5 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gradient-primary text-primary-foreground flex items-center justify-center"><FileCheck2 className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Total files</p><p className="text-2xl font-bold">{mockFiles.length}</p></div>
          </div>
        </Card>
      </div>

      <div className="space-y-3">
        {mockFiles.map((f, i) => {
          const ok = results[f.id];
          const isChecking = verifying === f.id;
          const remoteHash = ok ? f.hash : "0xfa11...3d4c";
          return (
            <motion.div key={f.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className={`p-5 shadow-card border-l-4 ${ok ? "border-l-success" : "border-l-destructive"}`}>
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-accent text-accent-foreground flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{f.size} · {f.uploadedAt}</p>
                    </div>
                  </div>

                  <div className="flex-1 grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg bg-muted/50 p-2.5">
                      <p className="text-muted-foreground mb-0.5">Stored hash</p>
                      <p className="font-mono truncate">{f.hash}</p>
                    </div>
                    <div className={`rounded-lg p-2.5 ${ok ? "bg-success/10" : "bg-destructive/10"}`}>
                      <p className="text-muted-foreground mb-0.5">Computed hash</p>
                      <p className="font-mono truncate">{remoteHash}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge className={ok ? "bg-success text-success-foreground" : "bg-destructive text-destructive-foreground"}>
                      {ok ? <><ShieldCheck className="h-3 w-3 mr-1" />Verified</> : <><ShieldAlert className="h-3 w-3 mr-1" />Tampered</>}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => verify(f.id)} disabled={isChecking}>
                      {isChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Re-verify"}
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </>
  );
};

export default Verification;
