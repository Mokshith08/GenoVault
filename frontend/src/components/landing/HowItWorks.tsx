import { motion } from "framer-motion";
import { Upload, ShieldCheck, MailCheck, KeySquare } from "lucide-react";

const steps = [
  { icon: Upload, title: "Upload", desc: "Owners upload genomic files. Encrypted client-side before storage." },
  { icon: MailCheck, title: "Request", desc: "Researchers browse the catalog and request access with a purpose." },
  { icon: ShieldCheck, title: "Approve", desc: "Owners approve with OTP. A 24-hour access window is granted." },
  { icon: KeySquare, title: "Audit", desc: "Every action is recorded. Access auto-expires or is revoked instantly." },
];

export const HowItWorks = () => {
  return (
    <section id="how" className="py-24 relative bg-gradient-hero">
      <div className="container">
        <div className="max-w-2xl mx-auto text-center mb-16">
          <div className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-3">Workflow</div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">How it works</h2>
          <p className="mt-4 text-muted-foreground">Four simple steps from raw genomic file to verified, auditable collaboration.</p>
        </div>

        <div className="relative grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="hidden md:block absolute top-10 left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          {steps.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="relative text-center"
            >
              <div className="relative mx-auto h-20 w-20 rounded-2xl bg-card border border-border shadow-card flex items-center justify-center mb-4">
                <s.icon className="h-8 w-8 text-primary" />
                <span className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-gradient-primary text-primary-foreground text-xs font-bold flex items-center justify-center shadow-elegant">{i + 1}</span>
              </div>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="text-sm text-muted-foreground mt-1.5">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
