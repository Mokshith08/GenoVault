import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Clock, ShieldCheck, ShieldAlert, Download, DatabaseZap } from "lucide-react";

const MOCK_ACCESSED_DATA = [
  {
    id: "ACC-001",
    name: "Global Oncology Genome Atlas",
    owner: "Dr. Sarah Chen",
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 6 + 1000 * 60 * 25).toISOString(), // ~6 hours from now
    isExpired: false,
    verifiedStatus: "unverified", // "unverified" | "verified" | "tampered"
  },
  {
    id: "ACC-002",
    name: "Population Variants (Alpha)",
    owner: "Sanger Institute",
    expiresAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // Expired 1 hr ago
    isExpired: true,
    verifiedStatus: "unverified",
  },
];

const CountdownTimer = ({ expiresAt, isAlreadyExpired }: { expiresAt: string, isAlreadyExpired: boolean }) => {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [expired, setExpired] = useState(isAlreadyExpired);

  useEffect(() => {
    if (expired) return;
    
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const expiration = new Date(expiresAt).getTime();
      const distance = expiration - now;

      if (distance < 0) {
        clearInterval(interval);
        setExpired(true);
        setTimeLeft("Expired");
      } else {
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, expired]);

  if (expired) {
    return <Badge variant="destructive" className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Access Expired</Badge>;
  }

  return (
    <Badge variant="outline" className="flex items-center gap-1.5 font-mono text-primary border-primary">
      <Clock className="h-3 w-3" /> {timeLeft}
    </Badge>
  );
};

export default function AccessedData() {
  const [datasets, setDatasets] = useState(MOCK_ACCESSED_DATA);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const handleVerify = (id: string, name: string) => {
    setVerifyingId(id);
    
    // Simulate cryptographic verification
    setTimeout(() => {
      const isTampered = Math.random() > 0.8; // 20% chance to mock a tampered payload
      
      setDatasets(prev => prev.map(ds => 
        ds.id === id ? { ...ds, verifiedStatus: isTampered ? "tampered" : "verified" } : ds
      ));
      
      setVerifyingId(null);
      
      if (isTampered) {
        toast.error(`Verification Failed`, {
          description: `Cryptographic hash mismatch detected for ${name}. Do not proceed.`,
        });
      } else {
        toast.success(`Integrity Verified`, {
          description: `${name} matches the immutable ledger record.`,
        });
      }
    }, 1500);
  };

  const handleDownload = (name: string) => {
    toast(`Initiating secure download: ${name}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Accessed Data</h2>
          <p className="text-muted-foreground mt-1">Manage active sessions and verify genomic data integrity before use.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <AnimatePresence>
          {datasets.map((dataset) => (
            <motion.div
              key={dataset.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              layout
            >
              <Card className={`relative overflow-hidden transition-all ${dataset.isExpired ? 'opacity-80 grayscale-[30%]' : ''}`}>
                <div className={`absolute top-0 left-0 w-1 h-full ${dataset.isExpired ? 'bg-destructive' : 'bg-primary'}`} />
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start mb-2">
                    <CountdownTimer expiresAt={dataset.expiresAt} isAlreadyExpired={dataset.isExpired} />
                    {dataset.verifiedStatus === 'verified' && (
                      <Badge className="bg-success text-success-foreground hover:bg-success"><ShieldCheck className="h-3 w-3 mr-1" /> Verified</Badge>
                    )}
                    {dataset.verifiedStatus === 'tampered' && (
                      <Badge variant="destructive"><ShieldAlert className="h-3 w-3 mr-1" /> Tampered</Badge>
                    )}
                  </div>
                  <CardTitle className="text-xl">{dataset.name}</CardTitle>
                  <CardDescription>Owner: {dataset.owner}</CardDescription>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="text-sm border rounded-lg p-3 bg-muted/30">
                    <div className="flex justify-between mb-1">
                      <span className="text-muted-foreground">Session Key:</span>
                      <span className="font-mono text-xs">xk92...8j4f</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Data Format:</span>
                      <span className="font-mono text-xs">Encrypted VCF</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col sm:flex-row gap-2">
                  <Button 
                    className="w-full sm:w-auto flex-1 gap-2" 
                    disabled={dataset.isExpired}
                    onClick={() => handleDownload(dataset.name)}
                  >
                    <Download className="h-4 w-4" /> View 
                  </Button>
                  <Button 
                    variant={dataset.verifiedStatus === 'tampered' ? 'destructive' : 'outline'}
                    className={`w-full sm:w-auto gap-2 ${dataset.verifiedStatus === 'verified' ? 'text-success border-success/30 hover:bg-success/10 hover:text-success' : ''}`}
                    disabled={dataset.isExpired || verifyingId === dataset.id}
                    onClick={() => handleVerify(dataset.id, dataset.name)}
                  >
                    {verifyingId === dataset.id ? (
                      <>
                        <span className="h-4 w-4 border-2 border-primary border-t-transparent animate-spin rounded-full" />
                        Verifying...
                      </>
                    ) : dataset.verifiedStatus === 'verified' ? (
                      <>
                        <ShieldCheck className="h-4 w-4" /> Integrity Verified
                      </>
                    ) : dataset.verifiedStatus === 'tampered' ? (
                      <>
                        <ShieldAlert className="h-4 w-4" /> Tampered Data
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Verify Integrity
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>

        {datasets.length === 0 && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-center opacity-70 border rounded-xl border-dashed">
            <DatabaseZap className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No active data sessions</p>
            <p className="text-sm text-muted-foreground">Approved datasets will appear here with active countdowns.</p>
          </div>
        )}
      </div>
    </div>
  );
}
