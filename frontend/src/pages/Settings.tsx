import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  Moon,
  Sun,
  Globe,
  ShieldAlert,
  Trash2,
  LogOut,
  Monitor,
  Mail,
  Smartphone,
  Eye,
  EyeOff,
  Save,
  ChevronRight,
  KeyRound,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useToast } from "@/hooks/use-toast";
import { PinInput } from "@/components/ui/PinInput";

// ── Reusable section wrapper ──────────────────────────────────────────────────
function SettingsSection({
  title,
  icon,
  children,
  delay = 0,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide flex items-center gap-2 mb-5">
        {icon}
        {title}
      </h2>
      {children}
    </motion.div>
  );
}

// ── Toggle row ────────────────────────────────────────────────────────────────
function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border/60 last:border-0">
      <div className="flex-1 min-w-0">
        <Label htmlFor={id} className="text-sm font-medium cursor-pointer">
          {label}
        </Label>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}


// ── Main Settings page ────────────────────────────────────────────────────────
export default function Settings() {
  const { user, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { toast } = useToast();

  const backPath = user?.role === "researcher" ? "/researcher" : "/dashboard";

  // ── Notification prefs ─────────────────────────────────────────
  const [notif, setNotif] = useState({
    emailAccessRequests: true,
    emailGrantExpiry: true,
    emailSystemAlerts: false,
    pushBrowser: true,
    pushMobile: false,
    weeklyDigest: true,
  });

  // ── Privacy & visibility ───────────────────────────────────────
  const [privacy, setPrivacy] = useState({
    showProfileToResearchers: true,
    showActivityStatus: false,
    twoFactorOnLogin: true,
  });

  // ── Display ────────────────────────────────────────────────────
  const [language, setLanguage] = useState("en");
  const [dateFormat, setDateFormat] = useState("DD/MM/YYYY");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");

  // ── PIN change / setup — API-backed (stores bcrypt hash in Azure Key Vault) ──
  type PinStep = "idle" | "verify" | "new" | "confirm" | "done";
  const [pinStep, setPinStep]       = useState<PinStep>("idle");
  const [pinVerify, setPinVerify]   = useState<string[]>(Array(6).fill(""));
  const [pinNew, setPinNew]         = useState<string[]>(Array(6).fill(""));
  const [pinConfirm, setPinConfirm] = useState<string[]>(Array(6).fill(""));
  const [pinShake, setPinShake]     = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [pinIsSet, setPinIsSet]     = useState(user?.pinSet ?? false);

  const API_BASE = "http://localhost:5000/api";
  const getToken = () => localStorage.getItem("genovault-token") ?? "";

  const triggerShake = () => { setPinShake(true); setTimeout(() => setPinShake(false), 500); };

  // Step 1: probe current PIN via backend before advancing
  const handleVerifyPin = async () => {
    const current = pinVerify.join("");
    if (current.length < 6) { toast({ title: "Enter all 6 digits" }); return; }
    setPinLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/auth/change-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ currentPin: current, newPin: "000000" }),
      });
      const data = await res.json();
      if (!res.ok && data.message?.includes("Current PIN is incorrect")) {
        triggerShake();
        toast({ title: "Incorrect current PIN", variant: "destructive" });
        setPinVerify(Array(6).fill(""));
        return;
      }
      // Any other response (including 400 "same PIN") means the current PIN was accepted
      setPinStep("new");
      setPinVerify(Array(6).fill(""));
    } catch {
      toast({ title: "Network error. Try again.", variant: "destructive" });
    } finally {
      setPinLoading(false);
    }
  };

  const handleNewPin = () => {
    if (pinNew.join("").length < 6) { toast({ title: "Enter all 6 digits" }); return; }
    setPinStep("confirm");
  };

  // Final step: call set-pin (first time) or change-pin (update existing)
  const handleConfirmPin = async () => {
    if (pinConfirm.join("").length < 6) { toast({ title: "Enter all 6 digits" }); return; }
    if (pinNew.join("") !== pinConfirm.join("")) {
      triggerShake();
      toast({ title: "PINs don't match", variant: "destructive" });
      setPinConfirm(Array(6).fill(""));
      return;
    }
    setPinLoading(true);
    try {
      let res: Response;
      if (!pinIsSet) {
        // First-time setup
        res = await fetch(`${API_BASE}/auth/set-pin`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ pin: pinNew.join("") }),
        });
      } else {
        // Change existing PIN — backend verifies currentPin against Key Vault hash
        res = await fetch(`${API_BASE}/auth/change-pin`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ currentPin: pinVerify.join("") || "000000", newPin: pinConfirm.join("") }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save PIN");
      setPinIsSet(true);
      setPinStep("done");
      setPinNew(Array(6).fill(""));
      setPinConfirm(Array(6).fill(""));
      toast({ title: "PIN saved to Azure Key Vault ✓" });
      setTimeout(() => setPinStep("idle"), 2500);
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally {
      setPinLoading(false);
    }
  };

  const cancelPin = () => {
    setPinStep("idle");
    setPinVerify(Array(6).fill(""));
    setPinNew(Array(6).fill(""));
    setPinConfirm(Array(6).fill(""));
  };


  // ── Session ────────────────────────────────────────────────────
  const MOCK_SESSIONS = [
    { id: "s1", device: "Chrome · Windows", location: "Mumbai, IN", current: true, lastSeen: "Now" },
    { id: "s2", device: "Safari · iPhone", location: "Mumbai, IN", current: false, lastSeen: "2h ago" },
    { id: "s3", device: "Firefox · MacOS", location: "Pune, IN", current: false, lastSeen: "3d ago" },
  ];
  const [sessions, setSessions] = useState(MOCK_SESSIONS);

  if (!user) return null;

  const saveSection = (section: string) => {
    toast({ title: `${section} saved!` });
  };

  const revokeSession = (id: string) => {
    setSessions((s) => s.filter((x) => x.id !== id));
    toast({ title: "Session revoked" });
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate(backPath)}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
      >
        ← Back to Dashboard
      </button>

      {/* Page title */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your preferences, notifications, and security.
        </p>
      </motion.div>

      {/* ── 1. Appearance ── */}
      <SettingsSection title="Appearance" icon={<Monitor className="h-4 w-4" />} delay={0.05}>
        {/* Dark / Light mode */}
        <div className="flex items-center justify-between py-3 border-b border-border/60">
          <div>
            <p className="text-sm font-medium">Theme</p>
            <p className="text-xs text-muted-foreground mt-0.5">Switch between light and dark mode</p>
          </div>
          <button
            onClick={toggleTheme}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted/60 transition-colors"
          >
            {theme === "dark" ? (
              <><Moon className="h-4 w-4" /> Dark</>
            ) : (
              <><Sun className="h-4 w-4" /> Light</>
            )}
          </button>
        </div>

        {/* Language */}
        <div className="flex items-center justify-between py-3 border-b border-border/60">
          <div>
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" /> Language
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Interface language</p>
          </div>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="hi">Hindi</SelectItem>
              <SelectItem value="fr">French</SelectItem>
              <SelectItem value="de">German</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date format */}
        <div className="flex items-center justify-between py-3 border-b border-border/60">
          <div>
            <p className="text-sm font-medium">Date Format</p>
            <p className="text-xs text-muted-foreground mt-0.5">How dates are displayed</p>
          </div>
          <Select value={dateFormat} onValueChange={setDateFormat}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
              <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
              <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Density */}
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium">Display Density</p>
            <p className="text-xs text-muted-foreground mt-0.5">How compact the UI feels</p>
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden text-xs">
            {(["comfortable", "compact"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDensity(d)}
                className={`px-3 py-1.5 capitalize transition-colors ${
                  density === d
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted/60"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end mt-2">
          <Button size="sm" onClick={() => saveSection("Appearance")}>
            <Save className="h-3.5 w-3.5 mr-1.5" /> Save
          </Button>
        </div>
      </SettingsSection>

      {/* ── 2. Notifications ── */}
      <SettingsSection title="Notifications" icon={<Bell className="h-4 w-4" />} delay={0.1}>
        <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide font-medium flex items-center gap-1">
          <Mail className="h-3.5 w-3.5" /> Email
        </p>
        <ToggleRow
          id="n-email-access"
          label="Access Requests"
          description="Get notified when a researcher requests access to your dataset."
          checked={notif.emailAccessRequests}
          onCheckedChange={(v) => setNotif((n) => ({ ...n, emailAccessRequests: v }))}
        />
        <ToggleRow
          id="n-email-grant"
          label="Grant Expiry Warnings"
          description="Reminder emails before active access grants expire."
          checked={notif.emailGrantExpiry}
          onCheckedChange={(v) => setNotif((n) => ({ ...n, emailGrantExpiry: v }))}
        />
        <ToggleRow
          id="n-email-system"
          label="System Alerts"
          description="Critical security alerts and platform updates."
          checked={notif.emailSystemAlerts}
          onCheckedChange={(v) => setNotif((n) => ({ ...n, emailSystemAlerts: v }))}
        />
        <ToggleRow
          id="n-weekly"
          label="Weekly Digest"
          description="A summary of your vault activity every Monday."
          checked={notif.weeklyDigest}
          onCheckedChange={(v) => setNotif((n) => ({ ...n, weeklyDigest: v }))}
        />

        <p className="text-xs text-muted-foreground mt-4 mb-1 uppercase tracking-wide font-medium flex items-center gap-1">
          <Smartphone className="h-3.5 w-3.5" /> Push
        </p>
        <ToggleRow
          id="n-push-browser"
          label="Browser Notifications"
          description="Real-time alerts in your browser."
          checked={notif.pushBrowser}
          onCheckedChange={(v) => setNotif((n) => ({ ...n, pushBrowser: v }))}
        />
        <ToggleRow
          id="n-push-mobile"
          label="Mobile Push"
          description="Push notifications on your mobile device."
          checked={notif.pushMobile}
          onCheckedChange={(v) => setNotif((n) => ({ ...n, pushMobile: v }))}
        />

        <div className="flex justify-end mt-4">
          <Button size="sm" onClick={() => saveSection("Notification preferences")}>
            <Save className="h-3.5 w-3.5 mr-1.5" /> Save
          </Button>
        </div>
      </SettingsSection>

      {/* ── 3. Privacy & Security ── */}
      <SettingsSection title="Privacy & Security" icon={<ShieldAlert className="h-4 w-4" />} delay={0.15}>
        <ToggleRow
          id="p-profile-vis"
          label="Profile visible to researchers"
          description="Researchers can see your name when browsing available datasets."
          checked={privacy.showProfileToResearchers}
          onCheckedChange={(v) => setPrivacy((p) => ({ ...p, showProfileToResearchers: v }))}
        />
        <ToggleRow
          id="p-activity"
          label="Show activity status"
          description="Let others see when you were last active."
          checked={privacy.showActivityStatus}
          onCheckedChange={(v) => setPrivacy((p) => ({ ...p, showActivityStatus: v }))}
        />
        <ToggleRow
          id="p-2fa"
          label="Two-factor auth on every login"
          description="Require OTP verification each time you sign in."
          checked={privacy.twoFactorOnLogin}
          onCheckedChange={(v) => setPrivacy((p) => ({ ...p, twoFactorOnLogin: v }))}
        />

        {/* Go to profile for password */}
        <button
          onClick={() => navigate(backPath === "/researcher" ? "/researcher/profile" : "/dashboard/profile")}
          className="mt-3 w-full flex items-center justify-between px-3 py-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm"
        >
          <span className="flex items-center gap-2 text-muted-foreground">
            <Eye className="h-4 w-4" />
            Change password
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>

        <div className="flex justify-end mt-4">
          <Button size="sm" onClick={() => saveSection("Privacy settings")}>
            <Save className="h-3.5 w-3.5 mr-1.5" /> Save
          </Button>
        </div>
      </SettingsSection>

      {/* ── 4. Security PIN ── */}
      <SettingsSection title="Security PIN" icon={<KeyRound className="h-4 w-4" />} delay={0.18}>
        <div className="space-y-4">
          {/* 2FA toggle */}
          <ToggleRow
            id="pin-2fa"
            label="Two-factor auth on PIN actions"
            description="Require email 2FA before changing your security PIN."
            checked={privacy.twoFactorOnLogin}
            onCheckedChange={(v) => setPrivacy((p) => ({ ...p, twoFactorOnLogin: v }))}
          />

          {/* Info row */}
          <div className="flex items-center justify-between px-3 py-3 rounded-lg border border-border bg-muted/20 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <KeyRound className="h-4 w-4" />
              <span>Security PIN</span>
            </div>
            <div className="flex items-center gap-2">
              {pinIsSet
                ? <span className="font-mono tracking-widest text-xs text-muted-foreground">••••••</span>
                : <span className="text-xs text-amber-500 font-medium">Not set</span>
              }
              {pinStep === "idle" && (
                <button
                  onClick={() => setPinStep(pinIsSet ? "verify" : "new")}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  {pinIsSet ? "Change" : "Set PIN"}
                </button>
              )}
            </div>
          </div>

          {/* Inline change-PIN steps */}
          <AnimatePresence mode="wait">
            {pinStep === "verify" && (
              <motion.div key="verify" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                className="rounded-xl border border-border bg-muted/10 p-5 space-y-4"
              >
                <p className="text-sm font-medium">Step 1 of 3 — Verify current PIN</p>
                <p className="text-xs text-muted-foreground">Your PIN is verified securely via Azure Key Vault.</p>
                <PinInput value={pinVerify} onChange={setPinVerify} shake={pinShake} autoFocus label="Current PIN" />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={cancelPin} disabled={pinLoading}>Cancel</Button>
                  <Button size="sm" className="flex-1 bg-gradient-primary hover:opacity-90" onClick={handleVerifyPin} disabled={pinVerify.join("").length < 6 || pinLoading}>
                    {pinLoading ? "Verifying..." : "Next"}
                  </Button>
                </div>
              </motion.div>
            )}

            {pinStep === "new" && (
              <motion.div key="new" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                className="rounded-xl border border-border bg-muted/10 p-5 space-y-4"
              >
                <p className="text-sm font-medium">{pinIsSet ? "Step 2 of 3" : "Step 1 of 2"} — Enter new PIN</p>
                <PinInput value={pinNew} onChange={setPinNew} autoFocus label="New PIN" />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={cancelPin}>Cancel</Button>
                  <Button size="sm" className="flex-1 bg-gradient-primary hover:opacity-90" onClick={handleNewPin} disabled={pinNew.join("").length < 6}>Next</Button>
                </div>
              </motion.div>
            )}

            {pinStep === "confirm" && (
              <motion.div key="confirm" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                className="rounded-xl border border-border bg-muted/10 p-5 space-y-4"
              >
                <p className="text-sm font-medium">{pinIsSet ? "Step 3 of 3" : "Step 2 of 2"} — Confirm new PIN</p>
                <PinInput value={pinConfirm} onChange={setPinConfirm} shake={pinShake} autoFocus label="Confirm new PIN" />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={cancelPin} disabled={pinLoading}>Cancel</Button>
                  <Button size="sm" className="flex-1 bg-gradient-primary hover:opacity-90" onClick={handleConfirmPin} disabled={pinConfirm.join("").length < 6 || pinLoading}>
                    {pinLoading ? "Saving to Key Vault..." : <><Save className="h-3.5 w-3.5 mr-1" />Save PIN</>}
                  </Button>
                </div>
              </motion.div>
            )}

            {pinStep === "done" && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 flex items-center gap-3"
              >
                <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-500">PIN saved to Azure Key Vault!</p>
                  <p className="text-xs text-muted-foreground mt-0.5">PIN hash is stored securely — never in the database.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </SettingsSection>

      {/* ── 5. Active Sessions ── */}
      <SettingsSection title="Active Sessions" icon={<Monitor className="h-4 w-4" />} delay={0.2}>
        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between px-3 py-3 rounded-lg border border-border/70 bg-muted/20"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{s.device}</p>
                  {s.current && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-green-500 border-green-500/30 bg-green-500/10">
                      Current
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {s.location} · {s.lastSeen}
                </p>
              </div>
              {!s.current && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                  onClick={() => revokeSession(s.id)}
                >
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </div>
        {sessions.filter((s) => !s.current).length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => {
              setSessions((s) => s.filter((x) => x.current));
              toast({ title: "All other sessions revoked" });
            }}
          >
            Revoke all other sessions
          </Button>
        )}
      </SettingsSection>

      {/* ── 5. Danger Zone ── */}
      <SettingsSection title="Danger Zone" icon={<Trash2 className="h-4 w-4 text-destructive" />} delay={0.25}>
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-4 p-3 rounded-lg border border-border/70">
            <div>
              <p className="text-sm font-medium">Sign out of all devices</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Immediately revoke all active sessions everywhere.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                toast({ title: "Signed out of all devices" });
                setTimeout(() => { logout(); navigate("/"); }, 800);
              }}
            >
              <LogOut className="h-3.5 w-3.5 mr-1.5" /> Sign out all
            </Button>
          </div>

          <div className="flex items-start justify-between gap-4 p-3 rounded-lg border border-destructive/25 bg-destructive/5">
            <div>
              <p className="text-sm font-medium text-destructive">Delete account</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permanently delete your account and all associated data. This cannot be undone.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="shrink-0"
              onClick={() =>
                toast({
                  title: "Account deletion",
                  description: "Please contact support to delete your account.",
                  variant: "destructive",
                })
              }
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
            </Button>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
