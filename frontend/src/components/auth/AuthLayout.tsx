import { motion } from "framer-motion";
import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

interface Props {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

export const AuthLayout = ({ title, subtitle, children, footer }: Props) => {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left visual */}
      <div className="hidden lg:flex relative bg-gradient-hero overflow-hidden">
        <div className="absolute inset-0 bg-gradient-mesh opacity-50 animate-spin-slow" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <Logo />
          <div className="max-w-md">
            <h2 className="text-4xl font-bold tracking-tight leading-tight">
              The vault for <span className="text-gradient">genomic</span> collaboration.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Encrypted storage, time-bound access, and a tamper-proof audit trail —
              trusted by research teams worldwide.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-3">
              {["AES-256", "SHA-256", "RBAC"].map(t => (
                <div key={t} className="rounded-lg glass p-3 text-center text-xs font-mono">{t}</div>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} GenoVault</p>
        </div>
      </div>

      {/* Right form */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between p-6">
          <Link to="/" className="lg:hidden"><Logo /></Link>
          <span className="hidden lg:block" />
          <ThemeToggle />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex-1 flex items-center justify-center p-6"
        >
          <div className="w-full max-w-md">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-6 text-sm text-center text-muted-foreground">{footer}</div>}
          </div>
        </motion.div>
      </div>
    </div>
  );
};
