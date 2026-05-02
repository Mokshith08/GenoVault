import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, Mail, Lock, ShieldCheck, Smartphone, KeyRound, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/contexts/AuthContext";

const API = "http://localhost:5000/api";

/**
 * Login flow:
 *
 * Step 1 — Credentials form
 *   → POST /api/auth/login  (verify email + password)
 *   → POST /api/otp/send    (always send email OTP)
 *
 * Step 2 — OTP verification  (two sub-modes)
 *   Mode A [default] — Email OTP
 *     → POST /api/otp/verify
 *
 *   Mode B [alternative, only if mfa_enabled] — Authenticator App
 *     → POST /api/auth/verify-mfa
 *     User switches to this by clicking "Verify with Authenticator App"
 *     They can switch back to email OTP at any time
 */

type OtpMode = "email" | "totp";

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [step, setStep]       = useState<"form" | "otp">("form");
  const [otpMode, setOtpMode] = useState<OtpMode>("email");

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow]         = useState(false);
  const [otp, setOtp]           = useState("");
  const [errors, setErrors]     = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading]   = useState(false);
  const [resending, setResending] = useState(false);

  // Holds verified user data between step 1 and step 2
  const [verifiedUser, setVerifiedUser] = useState<{
    name: string;
    email: string;
    role: "owner" | "researcher";
    token: string;
    mfa_enabled: boolean;
  } | null>(null);

  /* ── Validation ─────────────────────────────────────────── */
  const validate = () => {
    const e: typeof errors = {};
    if (!email)    e.email    = "Email is required";
    if (!password) e.password = "Password is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /* ── Step 1: Submit credentials ─────────────────────────── */
  const onSubmitForm = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      // 1a — Verify credentials
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Login failed");

      setVerifiedUser({
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
        token: data.token,
        mfa_enabled: !!data.user.mfa_enabled,
      });

      // 1b — Always send email OTP (regardless of MFA status)
      const otpRes = await fetch(`${API}/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const otpData = await otpRes.json();
      if (!otpRes.ok) throw new Error(otpData.message || "Failed to send OTP");

      // Start in email mode by default
      setOtpMode("email");
      setOtp("");
      setStep("otp");
      toast.success(`OTP sent to ${email}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  /* ── Step 2: Verify OTP / TOTP ──────────────────────────── */
  const submitOtp = async () => {
    if (otp.length !== 6) { toast.error("Enter all 6 digits"); return; }
    if (!verifiedUser)    return;
    setLoading(true);
    try {
      if (otpMode === "totp") {
        // ── Mode B: Authenticator App (TOTP) ─────────────────
        const res = await fetch(`${API}/auth/verify-mfa`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${verifiedUser.token}`,
          },
          body: JSON.stringify({ code: otp }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Authenticator code invalid");
      } else {
        // ── Mode A: Email OTP ─────────────────────────────────
        const res = await fetch(`${API}/otp/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: verifiedUser.email, code: otp }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "OTP verification failed");
      }

      // ── Complete login ────────────────────────────────────
      localStorage.setItem("genovault-token", verifiedUser.token);
      login({ name: verifiedUser.name, email: verifiedUser.email, role: verifiedUser.role });
      toast.success("Welcome back!");
      navigate(verifiedUser.role === "researcher" ? "/researcher" : "/dashboard");
    } catch (err: any) {
      toast.error(err.message);
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  /* ── Resend email OTP ────────────────────────────────────── */
  const resendOtp = async () => {
    if (resending || !email) return;
    setResending(true);
    try {
      const res = await fetch(`${API}/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to resend OTP");
      toast.success("OTP resent to your email!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResending(false);
    }
  };

  /* ── Switch between email OTP and Authenticator ─────────── */
  const switchMode = (mode: OtpMode) => {
    setOtpMode(mode);
    setOtp(""); // Clear input when switching
  };

  const isMFAAvailable = verifiedUser?.mfa_enabled ?? false;

  /* ─────────────────────────────────────────────────────────── */
  return (
    <AuthLayout
      title={
        step === "form"
          ? "Welcome back"
          : otpMode === "totp"
          ? "Authenticator Verification"
          : "Two-Step Verification"
      }
      subtitle={
        step === "form"
          ? "Sign in to access your secure vault."
          : otpMode === "totp"
          ? "Enter the 6-digit code from Microsoft Authenticator"
          : `We sent a 6-digit code to ${email}`
      }
      footer={
        step === "form"
          ? <>Don't have an account? <Link to="/register" className="text-primary font-medium hover:underline">Create one</Link></>
          : <button onClick={() => { setStep("form"); setOtp(""); }} className="text-primary hover:underline">Back to login</button>
      }
    >
      {step === "form" ? (
        /* ── Step 1: Credentials ──────────────────────────── */
        <form onSubmit={onSubmitForm} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="login-email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="login-email"
                type="email"
                placeholder="you@institution.org"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="pl-9 h-11"
              />
            </div>
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="login-password">Password</Label>
              <a href="#" className="text-xs text-muted-foreground hover:text-primary">Forgot?</a>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="login-password"
                type={show ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="pl-9 pr-10 h-11"
              />
              <button
                type="button"
                onClick={() => setShow(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-gradient-primary hover:opacity-90 shadow-elegant"
          >
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Signing in...</> : "Sign in"}
          </Button>
        </form>
      ) : (
        /* ── Step 2: OTP / TOTP ───────────────────────────── */
        <AnimatePresence mode="wait">
          <motion.div
            key={otpMode}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Icon */}
            <div className="flex justify-center">
              <div className="h-14 w-14 rounded-2xl bg-gradient-primary shadow-elegant flex items-center justify-center">
                {otpMode === "totp"
                  ? <Smartphone className="h-7 w-7 text-primary-foreground" />
                  : <ShieldCheck className="h-7 w-7 text-primary-foreground" />
                }
              </div>
            </div>

            {/* TOTP mode: Authenticator hint */}
            {otpMode === "totp" && (
              <div
                className="rounded-xl px-4 py-3 flex items-start gap-3"
                style={{
                  background: "rgba(99,102,241,0.10)",
                  border: "1px solid rgba(99,102,241,0.25)",
                }}
              >
                <KeyRound className="h-4 w-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-indigo-200 leading-relaxed">
                  Open <strong>Microsoft Authenticator</strong> → find <strong>GenoVault</strong> → enter the 6-digit code shown.
                </p>
              </div>
            )}

            {/* OTP Input */}
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                <InputOTPGroup>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <InputOTPSlot key={i} index={i} className="h-12 w-12 text-lg" />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>

            {/* Primary verify button */}
            <Button
              id="otp-verify-btn"
              onClick={submitOtp}
              disabled={loading || otp.length !== 6}
              className="w-full h-11 bg-gradient-primary hover:opacity-90 shadow-elegant"
            >
              {loading
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying...</>
                : otpMode === "totp" ? "Verify Authenticator Code" : "Verify & Sign in"
              }
            </Button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            {/* ── Alternative method button ────────────────── */}
            {otpMode === "email" ? (
              // Currently on email OTP → offer Authenticator as alternative
              isMFAAvailable ? (
                <Button
                  id="switch-to-totp-btn"
                  variant="outline"
                  type="button"
                  onClick={() => switchMode("totp")}
                  className="w-full h-11"
                >
                  <Smartphone className="h-4 w-4 mr-2" />
                  Verify with Authenticator App
                </Button>
              ) : (
                // User hasn't set up MFA — disable the button with a tooltip hint
                <Button
                  variant="outline"
                  type="button"
                  disabled
                  title="Set up Microsoft Authenticator after your first login to enable this"
                  className="w-full h-11 opacity-40 cursor-not-allowed"
                >
                  <Smartphone className="h-4 w-4 mr-2" />
                  Verify with Authenticator App
                </Button>
              )
            ) : (
              // Currently on TOTP → offer email OTP as alternative
              <Button
                id="switch-to-email-btn"
                variant="outline"
                type="button"
                onClick={() => switchMode("email")}
                className="w-full h-11"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Use email OTP instead
              </Button>
            )}

            {/* Resend — shown only in email mode */}
            {otpMode === "email" && (
              <p className="text-xs text-center text-muted-foreground">
                Didn't get it?{" "}
                <button
                  onClick={resendOtp}
                  disabled={resending}
                  className="text-primary hover:underline disabled:opacity-50"
                >
                  {resending ? "Sending..." : "Resend code"}
                </button>
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </AuthLayout>
  );
};

export default Login;
