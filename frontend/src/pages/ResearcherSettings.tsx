import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Bell, Moon, Sun, Globe, Mail, Shield,
  Save, LogOut, FlaskConical, Eye, EyeOff,
  Database, Clock, BookOpen, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useToast } from "@/hooks/use-toast";

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({
  title, icon, children, delay = 0,
}: { title: string; icon: React.ReactNode; children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide flex items-center gap-2 mb-5">
        {icon} {title}
      </h2>
      {children}
    </motion.div>
  );
}

// ── Toggle row ────────────────────────────────────────────────────────────────
function ToggleRow({
  id, label, description, checked, onCheckedChange,
}: { id: string; label: string; description?: string; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border/50 last:border-0">
      <div className="flex-1 min-w-0">
        <Label htmlFor={id} className="text-sm font-medium cursor-pointer">{label}</Label>
        {description && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ResearcherSettings() {
  const { user, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { toast } = useToast();

  // ── Appearance ─────────────────────────────────────────────────────────────
  const [dateFormat,     setDateFormat]     = useState("DD/MM/YYYY");
  const [displayDensity, setDisplayDensity] = useState<"comfortable" | "compact">("comfortable");

  // ── Notification preferences ───────────────────────────────────────────────
  const [notifs, setNotifs] = useState({
    requestStatusEmail:   true,   // email when my request is approved/rejected
    requestStatusInApp:   true,   // in-app banner
    newDatasetAlert:      true,   // new dataset uploaded that matches my research area
    sessionExpiryReminder: true,  // 2-hour warning before granted access expires
    dataIntegrityAlert:   true,   // if a dataset I access fails verification
    weeklyDigest:         false,  // weekly summary of available datasets
  });

  // ── Privacy ────────────────────────────────────────────────────────────────
  const [privacy, setPrivacy] = useState({
    profileVisibleToOwners: true,  // data owners can see my profile when reviewing request
    showOrcidPublicly:      false, // ORCID shown on public profile
    allowAnalytics:         true,  // anonymous usage analytics
  });

  // ── Data Access ────────────────────────────────────────────────────────────
  const [dataPrefs, setDataPrefs] = useState({
    autoVerifyIntegrity: true,   // auto-run hash check when session starts
    confirmBeforeDownload: true, // confirm dialog before downloading
    rememberSearchFilters: true, // persist search filters across sessions
  });

  const setN = (k: keyof typeof notifs, v: boolean) => setNotifs(p => ({ ...p, [k]: v }));
  const setP = (k: keyof typeof privacy, v: boolean) => setPrivacy(p => ({ ...p, [k]: v }));
  const setD = (k: keyof typeof dataPrefs, v: boolean) => setDataPrefs(p => ({ ...p, [k]: v }));

  const saveAppearance = () =>
    toast({ title: "Appearance preferences saved." });

  const saveNotifs = () =>
    toast({ title: "Notification preferences saved." });

  const savePrivacy = () =>
    toast({ title: "Privacy preferences saved." });

  const saveDataPrefs = () =>
    toast({ title: "Data access preferences saved." });

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">

      {/* Back + Header */}
      <button
        onClick={() => navigate("/researcher")}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
      >
        ← Back to Dashboard
      </button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Researcher Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage your preferences, notifications, and research access behaviour.
        </p>
      </div>

      {/* ── Appearance ───────────────────────────────────────────────────────── */}
      <Section title="Appearance" icon={<Sun className="h-4 w-4" />} delay={0}>
        {/* Theme */}
        <div className="flex items-center justify-between py-3 border-b border-border/50">
          <div>
            <p className="text-sm font-medium">Theme</p>
            <p className="text-xs text-muted-foreground mt-0.5">Switch between light and dark mode</p>
          </div>
          <Button
            variant="outline" size="sm"
            onClick={() => toggleTheme()}
            className="gap-2 min-w-[90px]"
          >
            {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            {theme === "dark" ? "Dark" : "Light"}
          </Button>
        </div>

        {/* Date format */}
        <div className="flex items-center justify-between py-3 border-b border-border/50">
          <div>
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Date Format
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">How dates are displayed</p>
          </div>
          <Select value={dateFormat} onValueChange={setDateFormat}>
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
              <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
              <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Display density */}
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium">Display Density</p>
            <p className="text-xs text-muted-foreground mt-0.5">How compact the UI feels</p>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-border text-xs">
            {(["comfortable", "compact"] as const).map(d => (
              <button
                key={d}
                onClick={() => setDisplayDensity(d)}
                className={`px-3 py-1.5 capitalize transition-colors ${
                  displayDensity === d
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <Button size="sm" onClick={saveAppearance} className="gap-1.5">
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
        </div>
      </Section>

      {/* ── Notifications ────────────────────────────────────────────────────── */}
      <Section title="Notifications" icon={<Bell className="h-4 w-4" />} delay={0.05}>
        <div className="mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1">
            <Mail className="h-3.5 w-3.5" /> Request &amp; Access Updates
          </p>
          <ToggleRow id="n-req-email"   label="Request Status Changes"
            description="Email when your access request is approved or rejected."
            checked={notifs.requestStatusEmail}   onCheckedChange={v => setN("requestStatusEmail", v)} />
          <ToggleRow id="n-req-inapp"   label="In-App Notifications"
            description="Banner inside GenoVault when request status changes."
            checked={notifs.requestStatusInApp}   onCheckedChange={v => setN("requestStatusInApp", v)} />
          <ToggleRow id="n-session-exp" label="Session Expiry Reminder"
            description="Get notified 2 hours before an active access grant expires."
            checked={notifs.sessionExpiryReminder} onCheckedChange={v => setN("sessionExpiryReminder", v)} />
        </div>

        <div className="mb-3 pt-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1">
            <Database className="h-3.5 w-3.5" /> Dataset Alerts
          </p>
          <ToggleRow id="n-new-dataset" label="New Dataset Available"
            description="Notify me when datasets matching my research area are uploaded."
            checked={notifs.newDatasetAlert}       onCheckedChange={v => setN("newDatasetAlert", v)} />
          <ToggleRow id="n-integrity"   label="Data Integrity Alerts"
            description="Alert me if a dataset I have access to fails its integrity check."
            checked={notifs.dataIntegrityAlert}    onCheckedChange={v => setN("dataIntegrityAlert", v)} />
          <ToggleRow id="n-digest"      label="Weekly Research Digest"
            description="A weekly summary of new datasets relevant to my research area."
            checked={notifs.weeklyDigest}          onCheckedChange={v => setN("weeklyDigest", v)} />
        </div>

        <div className="flex justify-end mt-4">
          <Button size="sm" onClick={saveNotifs} className="gap-1.5">
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
        </div>
      </Section>

      {/* ── Data Access Behaviour ─────────────────────────────────────────────── */}
      <Section title="Data Access Behaviour" icon={<FlaskConical className="h-4 w-4" />} delay={0.1}>
        <ToggleRow id="d-auto-verify"   label="Auto-Verify Integrity on Session Start"
          description="Automatically run a cryptographic hash check whenever an access session begins."
          checked={dataPrefs.autoVerifyIntegrity}  onCheckedChange={v => setD("autoVerifyIntegrity", v)} />
        <ToggleRow id="d-confirm-dl"    label="Confirm Before Downloading"
          description="Show a confirmation dialog before any genomic file download begins."
          checked={dataPrefs.confirmBeforeDownload} onCheckedChange={v => setD("confirmBeforeDownload", v)} />
        <ToggleRow id="d-search-filter" label="Remember Search Filters"
          description="Persist dataset search filters across sessions."
          checked={dataPrefs.rememberSearchFilters} onCheckedChange={v => setD("rememberSearchFilters", v)} />

        <div className="flex justify-end mt-4">
          <Button size="sm" onClick={saveDataPrefs} className="gap-1.5">
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
        </div>
      </Section>

      {/* ── Privacy ──────────────────────────────────────────────────────────── */}
      <Section title="Privacy" icon={<Eye className="h-4 w-4" />} delay={0.15}>
        <ToggleRow id="p-vis-owners"   label="Profile Visible to Data Owners"
          description="Data owners can see your researcher profile (institution, research area, purpose) when reviewing your access requests."
          checked={privacy.profileVisibleToOwners} onCheckedChange={v => setP("profileVisibleToOwners", v)} />
        <ToggleRow id="p-orcid-pub"    label="Show ORCID Publicly"
          description="Display your ORCID ID on your public researcher profile page."
          checked={privacy.showOrcidPublicly}      onCheckedChange={v => setP("showOrcidPublicly", v)} />
        <ToggleRow id="p-analytics"    label="Allow Anonymous Analytics"
          description="Help us improve GenoVault by sharing anonymous usage data."
          checked={privacy.allowAnalytics}         onCheckedChange={v => setP("allowAnalytics", v)} />

        <div className="flex justify-end mt-4">
          <Button size="sm" onClick={savePrivacy} className="gap-1.5">
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
        </div>
      </Section>

      {/* ── Account ──────────────────────────────────────────────────────────── */}
      <Section title="Account" icon={<Shield className="h-4 w-4" />} delay={0.2}>
        {/* Account info row */}
        <div className="flex items-center justify-between py-3 border-b border-border/50">
          <div>
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <Badge variant="secondary" className="capitalize text-xs">
            <BookOpen className="h-3 w-3 mr-1" /> Researcher
          </Badge>
        </div>

        {/* Profile link */}
        <div className="flex items-center justify-between py-3 border-b border-border/50">
          <div>
            <p className="text-sm font-medium">Researcher Profile</p>
            <p className="text-xs text-muted-foreground">View and update your professional details.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/researcher/profile")}
            className="gap-1.5">
            <Globe className="h-3.5 w-3.5" /> View Profile
          </Button>
        </div>

        {/* Sign out */}
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-sm font-medium">Sign Out</p>
            <p className="text-xs text-muted-foreground">Sign out from all devices.</p>
          </div>
          <Button
            variant="destructive" size="sm"
            onClick={() => { logout(); navigate("/"); }}
            className="gap-1.5"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign Out
          </Button>
        </div>
      </Section>
    </div>
  );
}
