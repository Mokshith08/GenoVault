import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export const Hero = () => {
  return (
    <section id="home" className="relative pt-32 pb-24 overflow-hidden bg-gradient-hero">
      <div className="absolute inset-0 bg-gradient-mesh opacity-60 animate-spin-slow pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="container relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs font-medium mb-6">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            End-to-end encrypted · Tamper-proof audit trail
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05]">
            Secure <span className="text-gradient">genomic data</span>
            <br />for the next era of research.
          </h1>

          <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            Encrypt, share, and audit sensitive genomic datasets with role-based access,
            time-limited approvals, and cryptographic integrity verification — all in one vault.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" asChild className="bg-gradient-primary hover:opacity-90 shadow-elegant text-base h-12 px-7">
              <Link to="/register">
                Start free trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="h-12 px-7 text-base">
              <a href="#features">
                <ShieldCheck className="mr-2 h-4 w-4" />
                Explore security
              </a>
            </Button>
          </div>

          <div className="mt-14 grid grid-cols-3 gap-4 sm:gap-8 max-w-xl mx-auto">
            {[
              { v: "256-bit", l: "AES Encryption" },
              { v: "24h", l: "Auto-Expiry Access" },
              { v: "100%", l: "Audit Coverage" },
            ].map(s => (
              <div key={s.l} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-gradient">{s.v}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.l}</div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mt-20 max-w-5xl mx-auto"
        >
          <div className="relative rounded-2xl overflow-hidden glass shadow-elegant">
            <div className="absolute inset-0 bg-gradient-primary opacity-10" />
            <div className="relative p-6 sm:p-10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: "Datasets encrypted", value: "1,284" },
                  { label: "Active researchers", value: "342" },
                  { label: "Audit events / day", value: "12.4k" },
                ].map((m, i) => (
                  <motion.div
                    key={m.label}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                    className="rounded-xl bg-card/80 border border-border/60 p-5"
                  >
                    <div className="text-3xl font-bold">{m.value}</div>
                    <div className="text-sm text-muted-foreground mt-1">{m.label}</div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
