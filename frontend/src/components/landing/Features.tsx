import { motion } from "framer-motion";
import { Lock, KeyRound, ScrollText, Users, Clock, FileCheck2 } from "lucide-react";

const features = [
  { icon: Lock, title: "End-to-end encryption", desc: "AES-256 at rest, TLS in transit. Keys never leave the vault." },
  { icon: KeyRound, title: "Role-based access", desc: "Granular permissions for Data Owners and Researchers." },
  { icon: Clock, title: "Time-bound approvals", desc: "24-hour auto-expiring grants with one-click revocation." },
  { icon: ScrollText, title: "Tamper-proof audit", desc: "Append-only logs of every upload, request, and access." },
  { icon: FileCheck2, title: "Integrity verification", desc: "SHA-256 hash comparison detects any data tampering." },
  { icon: Users, title: "Multi-party approvals", desc: "Optional OTP / authenticator confirmation on sensitive actions." },
];

export const Features = () => {
  return (
    <section id="features" className="py-24 relative">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl mx-auto text-center mb-16"
        >
          <div className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-3">Capabilities</div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">Built for sensitive science.</h2>
          <p className="mt-4 text-muted-foreground">A complete control plane for managing genomic datasets, from upload to revocation.</p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              whileHover={{ y: -4 }}
              className="group relative rounded-2xl border border-border/60 bg-card p-6 shadow-card hover:shadow-elegant transition-shadow"
            >
              <div className="absolute inset-0 rounded-2xl bg-gradient-primary opacity-0 group-hover:opacity-5 transition-opacity" />
              <div className="relative">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground mb-4 group-hover:bg-gradient-primary group-hover:text-primary-foreground transition-colors">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-lg">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
