import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Mail,
  Shield,
  Edit3,
  Save,
  X,
  Lock,
  CheckCircle2,
  Camera,
  ShieldCheck,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

// ─── Password-change step machine ────────────────────────────────────────────
type PwStep = "idle" | "form" | "otp" | "success";

const SLIDE = {
  initial: { opacity: 0, x: 32 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: -32 },
};

// Generate a random 6-digit OTP (demo only)
const makeOtp = () => String(Math.floor(100000 + Math.random() * 900000));

export default function Profile() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // ── profile edit state ─────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: user?.name ?? "", email: user?.email ?? "" });
  const [saved, setSaved] = useState(false);

  // ── password-change state ──────────────────────────────────────
  const [pwStep, setPwStep] = useState<PwStep>("idle");
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [otp, setOtp] = useState("");
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  if (!user) return null;

  const backPath = user.role === "researcher" ? "/researcher" : "/dashboard";

  const initials = (editing ? form.name : user.name)
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase() || "ME";

  // ── profile save ───────────────────────────────────────────────
  const handleSave = () => {
    if (!form.name.trim()) { toast({ title: "Name cannot be empty", variant: "destructive" }); return; }
    if (!form.email.trim() || !form.email.includes("@")) { toast({ title: "Enter a valid email", variant: "destructive" }); return; }
    updateUser({ name: form.name.trim(), email: form.email.trim() });
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    toast({ title: "Profile updated successfully!" });
  };

  const handleCancel = () => {
    setForm({ name: user.name, email: user.email });
    setEditing(false);
  };

  // ── countdown helpers ──────────────────────────────────────────
  const startCountdown = (secs = 60) => {
    setCountdown(secs);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(timerRef.current!); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // ── step 1 → 2: validate passwords then send OTP ──────────────
  const handleRequestOtp = () => {
    if (!pwForm.current) { toast({ title: "Enter your current password", variant: "destructive" }); return; }
    if (pwForm.next.length < 6) { toast({ title: "New password must be at least 6 characters", variant: "destructive" }); return; }
    if (pwForm.next !== pwForm.confirm) { toast({ title: "Passwords do not match", variant: "destructive" }); return; }

    setOtpLoading(true);
    setTimeout(() => {
      const code = makeOtp();
      setGeneratedOtp(code);
      setOtp("");
      setPwStep("otp");
      setOtpLoading(false);
      startCountdown(60);
      // Show the OTP as a toast so the user can "receive" it in the demo
      toast({ title: `OTP sent to ${user.email}`, description: `Demo code: ${code}` });
    }, 700);
  };

  // ── step 2 → 3: verify OTP ────────────────────────────────────
  const handleVerifyOtp = () => {
    if (otp.length !== 6) { toast({ title: "Enter the full 6-digit code", variant: "destructive" }); return; }
    if (otp !== generatedOtp) { toast({ title: "Incorrect OTP. Please try again.", variant: "destructive" }); return; }

    setOtpLoading(true);
    setTimeout(() => {
      setOtpLoading(false);
      setPwStep("success");
      if (timerRef.current) clearInterval(timerRef.current);
    }, 700);
  };

  // ── resend OTP ─────────────────────────────────────────────────
  const handleResend = () => {
    const code = makeOtp();
    setGeneratedOtp(code);
    setOtp("");
    startCountdown(60);
    toast({ title: "New OTP sent!", description: `Demo code: ${code}` });
  };

  // ── reset entire flow ──────────────────────────────────────────
  const resetPw = () => {
    setPwStep("idle");
    setPwForm({ current: "", next: "", confirm: "" });
    setOtp("");
    setGeneratedOtp("");
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Back button */}
      <button
        onClick={() => navigate(backPath)}
        className="mb-6 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
      >
        ← Back to Dashboard
      </button>

      {/* ── Header card ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl border border-border bg-card p-6 mb-6 shadow-sm"
      >
        <div className="flex items-center gap-5">
          <div className="relative">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="bg-gradient-to-br from-primary/80 to-primary text-primary-foreground text-2xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 bg-muted border border-border rounded-full p-1 cursor-pointer hover:bg-accent transition-colors">
              <Camera className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold leading-tight truncate">{user.name}</h1>
              {saved && (
                <motion.span
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center gap-1 text-xs text-green-500"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                </motion.span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{user.email}</p>
            <Badge variant="secondary" className="mt-2 capitalize text-xs">
              <Shield className="h-3 w-3 mr-1" />
              {user.role}
            </Badge>
          </div>

          {!editing && (
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => setEditing(true)}>
              <Edit3 className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
          )}
        </div>
      </motion.div>

      {/* ── Personal Information card ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="rounded-2xl border border-border bg-card p-6 mb-6 shadow-sm"
      >
        <h2 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">
          Personal Information
        </h2>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-name" className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
              <User className="h-4 w-4 text-muted-foreground" /> Full Name
            </Label>
            {editing ? (
              <Input id="profile-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Your full name" className="h-10" />
            ) : (
              <div className="h-10 flex items-center px-3 rounded-md bg-muted/50 text-sm">{user.name}</div>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-email" className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
              <Mail className="h-4 w-4 text-muted-foreground" /> Email Address
            </Label>
            {editing ? (
              <Input id="profile-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="you@example.com" className="h-10" />
            ) : (
              <div className="h-10 flex items-center px-3 rounded-md bg-muted/50 text-sm">{user.email}</div>
            )}
          </div>

          {/* Role */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
              <Shield className="h-4 w-4 text-muted-foreground" /> Role
            </Label>
            <div className="h-10 flex items-center px-3 rounded-md bg-muted/50 text-sm capitalize gap-2">
              {user.role}
              <span className="text-xs text-muted-foreground">(cannot be changed)</span>
            </div>
          </div>
        </div>

        {editing && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-2 mt-5 justify-end"
          >
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Save className="h-3.5 w-3.5 mr-1" /> Save Changes
            </Button>
          </motion.div>
        )}
      </motion.div>

      {/* ── Security / Password card ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="rounded-2xl border border-border bg-card p-6 shadow-sm overflow-hidden"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Lock className="h-4 w-4" /> Security
          </h2>
          {pwStep === "idle" && (
            <Button variant="outline" size="sm" onClick={() => setPwStep("form")}>
              <Edit3 className="h-3.5 w-3.5 mr-1.5" /> Change Password
            </Button>
          )}
          {(pwStep === "form" || pwStep === "otp") && (
            <Button variant="ghost" size="sm" onClick={resetPw}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
          )}
        </div>

        {/* ── Step machine ── */}
        <AnimatePresence mode="wait">
          {/* IDLE */}
          {pwStep === "idle" && (
            <motion.p key="idle" {...SLIDE} transition={{ duration: 0.2 }} className="text-sm text-muted-foreground">
              Keep your account secure by using a strong, unique password.
            </motion.p>
          )}

          {/* STEP 1 — password form */}
          {pwStep === "form" && (
            <motion.div key="form" {...SLIDE} transition={{ duration: 0.22 }} className="space-y-4">
              {/* progress pills */}
              <StepPills current={1} />

              <div className="space-y-1.5">
                <Label htmlFor="pw-current" className="text-xs text-muted-foreground uppercase tracking-wide">Current Password</Label>
                <Input id="pw-current" type="password" placeholder="••••••••" value={pwForm.current}
                  onChange={(e) => setPwForm((p) => ({ ...p, current: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw-new" className="text-xs text-muted-foreground uppercase tracking-wide">New Password</Label>
                <Input id="pw-new" type="password" placeholder="Min 6 characters" value={pwForm.next}
                  onChange={(e) => setPwForm((p) => ({ ...p, next: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw-confirm" className="text-xs text-muted-foreground uppercase tracking-wide">Confirm New Password</Label>
                <Input id="pw-confirm" type="password" placeholder="Repeat new password" value={pwForm.confirm}
                  onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))} className="h-10" />
              </div>

              <div className="flex justify-end pt-1">
                <Button size="sm" onClick={handleRequestOtp} disabled={otpLoading}>
                  {otpLoading
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Sending OTP…</>
                    : <><ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Continue &amp; Send OTP</>}
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 2 — OTP input */}
          {pwStep === "otp" && (
            <motion.div key="otp" {...SLIDE} transition={{ duration: 0.22 }} className="space-y-6">
              <StepPills current={2} />

              <div className="flex flex-col items-center gap-4 py-2">
                {/* icon */}
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/80 to-primary shadow-lg flex items-center justify-center">
                  <ShieldCheck className="h-7 w-7 text-primary-foreground" />
                </div>

                <div className="text-center">
                  <p className="text-sm font-medium">Verification required</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    A 6-digit code was sent to <span className="font-medium text-foreground">{user.email}</span>
                  </p>
                </div>

                {/* OTP slots */}
                <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                  <InputOTPGroup>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <InputOTPSlot key={i} index={i} className="h-12 w-12 text-lg" />
                    ))}
                  </InputOTPGroup>
                </InputOTP>

                <Button
                  className="w-full max-w-xs h-11 bg-gradient-to-r from-primary/90 to-primary hover:opacity-90"
                  onClick={handleVerifyOtp}
                  disabled={otpLoading || otp.length < 6}
                >
                  {otpLoading
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Verifying…</>
                    : "Verify & Change Password"}
                </Button>

                {/* Resend */}
                <p className="text-xs text-muted-foreground">
                  Didn't receive it?{" "}
                  {countdown > 0
                    ? <span className="text-muted-foreground">Resend in {countdown}s</span>
                    : (
                      <button
                        onClick={handleResend}
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <RefreshCw className="h-3 w-3" /> Resend code
                      </button>
                    )}
                </p>
              </div>
            </motion.div>
          )}

          {/* STEP 3 — success */}
          {pwStep === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, type: "spring", stiffness: 200, damping: 20 }}
              className="flex flex-col items-center gap-4 py-6"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 18 }}
                className="h-16 w-16 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center"
              >
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </motion.div>

              <div className="text-center">
                <p className="text-base font-semibold">Password changed!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Your password has been updated successfully.
                </p>
              </div>

              <Button variant="outline" size="sm" onClick={resetPw}>
                Done
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ── Step indicator pills ──────────────────────────────────────────────────────
function StepPills({ current }: { current: 1 | 2 }) {
  const steps = [
    { n: 1, label: "New password" },
    { n: 2, label: "Verify OTP" },
  ];
  return (
    <div className="flex items-center gap-2 mb-1">
      {steps.map((s, idx) => (
        <div key={s.n} className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
            s.n === current ? "text-primary" : s.n < current ? "text-green-500" : "text-muted-foreground"
          }`}>
            <span className={`h-5 w-5 rounded-full border flex items-center justify-center text-[10px] transition-colors ${
              s.n === current
                ? "border-primary bg-primary text-primary-foreground"
                : s.n < current
                ? "border-green-500 bg-green-500/10 text-green-500"
                : "border-muted-foreground/40"
            }`}>
              {s.n < current ? "✓" : s.n}
            </span>
            {s.label}
          </div>
          {idx < steps.length - 1 && (
            <div className={`h-px w-6 transition-colors ${current > 1 ? "bg-green-500/60" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}
