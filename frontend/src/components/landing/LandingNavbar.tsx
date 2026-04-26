import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, X, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";

const links = [
  { label: "Home", href: "#home" },
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how" },
  { label: "About", href: "#about" },
];

export const LandingNavbar = () => {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? "bg-background/80 backdrop-blur-xl border-b border-border/60" : "bg-transparent"}`}>
      <div className="container flex h-16 items-center justify-between">
        <Logo />

        <nav className="hidden md:flex items-center gap-8">
          {links.map(l => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <Button onClick={() => navigate("/dashboard")} className="bg-gradient-primary hover:opacity-90 shadow-elegant">
              Dashboard
            </Button>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link to="/login"><LogIn className="h-4 w-4 mr-1.5" />Login</Link>
              </Button>
              <Button asChild className="bg-gradient-primary hover:opacity-90 shadow-elegant">
                <Link to="/register">Get started</Link>
              </Button>
            </>
          )}
        </div>

        <div className="md:hidden flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={() => setOpen(o => !o)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-border/60 bg-background/95 backdrop-blur-xl animate-fade-in">
          <div className="container py-4 flex flex-col gap-3">
            {links.map(l => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-sm font-medium py-2">{l.label}</a>
            ))}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" asChild><Link to="/login">Login</Link></Button>
              <Button className="flex-1 bg-gradient-primary" asChild><Link to="/register">Register</Link></Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
