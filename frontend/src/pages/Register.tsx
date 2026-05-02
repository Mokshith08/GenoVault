import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, Mail, Lock, User, FlaskConical, Database } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { MfaSetupModal } from "@/components/auth/MfaSetupModal";
import type { Role } from "@/contexts/AuthContext";

const Register = () => {
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>("owner");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // MFA modal state – setupToken is kept only in memory, never persisted
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<Role>("owner");

  const validate = () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = "Enter your full name";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email";
    if (password.length < 6) e.password = "Min 6 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submitForm = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await fetch("http://localhost:5000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Registration failed");

      // Store setup token in memory and open MFA modal
      setPendingRole(role);
      setSetupToken(data.setupToken);
      toast.success("Account created! Set up two-factor authentication.");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Called by MfaSetupModal on successful TOTP verification
  const handleMfaSuccess = () => {
    setSetupToken(null);
    toast.success("MFA enabled! Please log in.");
    navigate("/login");
  };

  return (
    <>
      {/* MFA Modal — rendered above the form, auto-appears after signup */}
      {setupToken && (
        <MfaSetupModal
          setupToken={setupToken}
          onSuccess={handleMfaSuccess}
          onSkip={() => {
            setSetupToken(null);
            toast.info("MFA skipped. You can enable it later in Settings.");
            navigate("/login");
          }}
        />
      )}

      <AuthLayout
        title="Create your vault"
        subtitle="Join GenoVault in seconds."
        footer={<>Have an account? <Link to="/login" className="text-primary font-medium hover:underline">Sign in</Link></>}
      >
        <form onSubmit={submitForm} className="space-y-5">
          <div>
            <Label className="mb-2 block">I am a</Label>
            <div className="grid grid-cols-2 gap-3">
              {([
                { v: "owner" as Role, t: "Data Owner", d: "Upload & control datasets", icon: Database },
                { v: "researcher" as Role, t: "Researcher", d: "Request & analyze data", icon: FlaskConical },
              ]).map(opt => (
                <motion.button
                  type="button"
                  key={opt.v}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setRole(opt.v)}
                  className={`relative text-left p-4 rounded-xl border transition-all ${role === opt.v ? "border-primary bg-accent/40 shadow-elegant" : "border-border hover:border-primary/40"}`}
                >
                  <opt.icon className={`h-5 w-5 mb-2 ${role === opt.v ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="font-semibold text-sm">{opt.t}</div>
                  <div className="text-xs text-muted-foreground">{opt.d}</div>
                  {role === opt.v && <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary animate-pulse-glow" />}
                </motion.button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Dr. Jane Doe" className="pl-9 h-11" />
            </div>
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@institution.org" className="pl-9 h-11" />
            </div>
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="password" type={show ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" className="pl-9 pr-10 h-11" />
              <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>

          <Button type="submit" disabled={loading} className="w-full h-11 bg-gradient-primary hover:opacity-90 shadow-elegant">
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : "Create account"}
          </Button>
        </form>
      </AuthLayout>
    </>
  );
};

export default Register;
