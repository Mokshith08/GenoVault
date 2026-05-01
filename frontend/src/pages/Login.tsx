import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Mail, Lock, ShieldCheck, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/contexts/AuthContext";

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [step, setStep] = useState<"form" | "otp">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [otp, setOtp] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  // Store verified user data between steps
  const [verifiedUser, setVerifiedUser] = useState<{ name: string; email: string; role: "owner" | "researcher"; token: string } | null>(null);

  const validate = () => {
    const e: typeof errors = {};
    if (!email) e.email = "Email is required";
    if (!password) e.password = "Password is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmitForm = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      // Step 1a — Verify credentials
      const res = await fetch("http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Login failed");

      // Store user data for after OTP
      setVerifiedUser({ name: data.user.name, email: data.user.email, role: data.user.role, token: data.token });

      // Step 1b — Send OTP to their email
      const otpRes = await fetch("http://localhost:5000/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const otpData = await otpRes.json();
      if (!otpRes.ok) throw new Error(otpData.message || "Failed to send OTP");

      setStep("otp");
      toast.success(`OTP sent to ${email}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async () => {
    if (otp.length !== 6) { toast.error("Enter all 6 digits"); return; }
    if (!verifiedUser) return;
    setLoading(true);
    try {
      // Step 2 — Verify OTP with backend
      const res = await fetch("http://localhost:5000/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verifiedUser.email, code: otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "OTP verification failed");

      // OTP correct — complete login
      localStorage.setItem("genovault-token", verifiedUser.token);
      login({ name: verifiedUser.name, email: verifiedUser.email, role: verifiedUser.role });
      toast.success("Welcome back!");
      navigate(verifiedUser.role === "researcher" ? "/researcher" : "/dashboard");
    } catch (err: any) {
      toast.error(err.message);
      setOtp(""); // Clear wrong OTP
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={step === "form" ? "Welcome back" : "Two-Step Verification"}
      subtitle={step === "form" ? "Sign in to access your secure vault." : `We sent a 6-digit code to ${email}`}
      footer={step === "form" ? <>Don't have an account? <Link to="/register" className="text-primary font-medium hover:underline">Create one</Link></> : <button onClick={() => setStep("form")} className="text-primary hover:underline">Back</button>}
    >
      {step === "form" ? (
        <form onSubmit={onSubmitForm} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="email" type="email" placeholder="you@institution.org" value={email} onChange={e => setEmail(e.target.value)} className="pl-9 h-11" />
            </div>
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <a href="#" className="text-xs text-muted-foreground hover:text-primary">Forgot?</a>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input id="password" type={show ? "text" : "password"} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className="pl-9 pr-10 h-11" />
              <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>

          <Button type="submit" disabled={loading} className="w-full h-11 bg-gradient-primary hover:opacity-90 shadow-elegant">
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Signing in...</> : "Sign in"}
          </Button>


        </form>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-2xl bg-gradient-primary shadow-elegant flex items-center justify-center">
              <ShieldCheck className="h-7 w-7 text-primary-foreground" />
            </div>
          </div>
          <div className="flex justify-center">
            <InputOTP maxLength={6} value={otp} onChange={setOtp}>
              <InputOTPGroup>
                {Array.from({ length: 6 }).map((_, i) => (
                  <InputOTPSlot key={i} index={i} className="h-12 w-12 text-lg" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button onClick={submitOtp} disabled={loading} className="w-full h-11 bg-gradient-primary hover:opacity-90 shadow-elegant">
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying...</> : "Verify & Sign in"}
          </Button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or</span>
            </div>
          </div>
          
          <Button variant="outline" type="button" onClick={submitOtp} disabled={loading} className="w-full h-11">
            <Smartphone className="h-4 w-4 mr-2" />
            Verify with Authenticator App
          </Button>

          <p className="text-xs text-center text-muted-foreground mt-2">
            Didn't get it? <button className="text-primary hover:underline">Resend code</button>
          </p>
        </div>
      )}
    </AuthLayout>
  );
};

export default Login;
