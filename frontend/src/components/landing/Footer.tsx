import { Logo } from "@/components/Logo";
import { Github, Twitter, Linkedin } from "lucide-react";

export const Footer = () => {
  return (
    <footer id="about" className="border-t border-border/60 bg-card/40">
      <div className="container py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-4 text-sm text-muted-foreground max-w-md">
              GenoVault is a research-grade platform for managing genomic datasets with cryptographic
              guarantees, designed for academic and clinical collaborations.
            </p>
            <div className="flex gap-2 mt-5">
              {[Github, Twitter, Linkedin].map((Icon, i) => (
                <a key={i} href="#" className="h-9 w-9 rounded-lg border border-border flex items-center justify-center hover:bg-accent transition-colors">
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold mb-3">Product</div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#features" className="hover:text-foreground">Features</a></li>
              <li><a href="#how" className="hover:text-foreground">How it works</a></li>
              <li><a href="#" className="hover:text-foreground">Security</a></li>
            </ul>
          </div>
          <div>
            <div className="text-sm font-semibold mb-3">Company</div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-foreground">About</a></li>
              <li><a href="#" className="hover:text-foreground">Privacy</a></li>
              <li><a href="#" className="hover:text-foreground">Contact</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-10 pt-6 border-t border-border/60 flex flex-col sm:flex-row gap-2 justify-between text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} GenoVault. All rights reserved.</p>
          <p>Built for the secure future of genomic research.</p>
        </div>
      </div>
    </footer>
  );
};
