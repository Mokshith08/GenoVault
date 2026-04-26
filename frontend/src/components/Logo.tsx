import { Dna } from "lucide-react";
import { Link } from "react-router-dom";

export const Logo = ({ className = "" }: { className?: string }) => (
  <Link to="/" className={`flex items-center gap-2 group ${className}`}>
    <div className="relative h-9 w-9 rounded-xl bg-gradient-primary shadow-elegant flex items-center justify-center transition-transform group-hover:scale-105">
      <Dna className="h-5 w-5 text-primary-foreground" strokeWidth={2.4} />
      <div className="absolute inset-0 rounded-xl bg-gradient-primary opacity-0 group-hover:opacity-60 blur-md transition-opacity" />
    </div>
    <div className="flex flex-col leading-none">
      <span className="font-bold text-lg tracking-tight">GenoVault</span>
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Secure Genomics</span>
    </div>
  </Link>
);
