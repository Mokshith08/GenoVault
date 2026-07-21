/**
 * RequestAccessForm.tsx
 * ────────────────────────────────────────────────────────────────────────────
 * Slide-over modal form that the researcher fills in before submitting an
 * access request.  Pre-fills researcher name / email from auth context so
 * the user never has to retype those.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, FlaskConical, Dna, Clock, Users, Lock, Download,
  FileText, Building2, Mail, Shield, AlertTriangle,
  ChevronRight, Loader2, CheckCircle2, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input }  from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { toast }   from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Dataset {
  _id:          string;
  originalName: string;
  extension:    string;
  sizeBytes:    number;
  owner?: { age?: number; gender?: string; country?: string };
}

interface Props {
  dataset:  Dataset;
  onClose:  () => void;
  onSuccess:(datasetId: string) => void; // called after successful submit
}

// ── Access type option ────────────────────────────────────────────────────────
const ACCESS_OPTS = [
  {
    value: "read-only",
    label: "Read Only",
    icon:  <Lock className="h-4 w-4" />,
    desc:  "View the file in the platform. No download capability.",
    color: "blue",
  },
  {
    value: "downloadable",
    label: "Downloadable",
    icon:  <Download className="h-4 w-4" />,
    desc:  "Request permission to download. Owner must explicitly approve download access.",
    color: "purple",
  },
] as const;

type AccessType = "read-only" | "downloadable";

// ── Form state ────────────────────────────────────────────────────────────────
interface FormData {
  projectTitle:               string;
  purpose:                    string;
  accessType:                 AccessType;
  extensionRequested:         boolean;
  dataSharedWithCollaborators:boolean;
  institution:                string;
  contactEmail:               string;
  benefits:                   string;
  risks:                      string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatSize(bytes: number) {
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

const EXT_COLOR: Record<string, string> = {
  ".fastq": "text-violet-400",
  ".bam":   "text-cyan-400",
  ".vcf":   "text-emerald-400",
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export function RequestAccessForm({ dataset, onClose, onSuccess }: Props) {
  const { user, token } = useAuth();

  // ── Form state (declared first so setForm is available in useEffect) ────────
  const [form, setForm] = useState<FormData>({
    projectTitle:               "",
    purpose:                    "",
    accessType:                 "read-only",
    extensionRequested:         false,
    dataSharedWithCollaborators:false,
    institution:                "",
    contactEmail:               user?.email ?? "",
    benefits:                   "",
    risks:                      "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [errors,     setErrors]     = useState<Partial<Record<keyof FormData, string>>>({});

  // ── Fetch researcher profile — auto-fills institution ───────────────────────
  const [profileInstitution, setProfileInstitution] = useState<string>("");
  const [profileLoading,     setProfileLoading]     = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch("http://localhost:5000/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        const inst = data?.user?.researcherProfile?.institution ?? "";
        setProfileInstitution(inst);
        setForm(prev => ({ ...prev, institution: inst }));
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [token]);

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate(): boolean {
    const e: typeof errors = {};
    if (!form.projectTitle.trim())
      e.projectTitle = "Project title is required.";
    if (!form.purpose.trim() || form.purpose.trim().length < 30)
      e.purpose = "Please describe your research purpose (at least 30 characters).";
    if (!form.contactEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail))
      e.contactEmail = "A valid contact email is required.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res  = await fetch("http://localhost:5000/api/access/request-access", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fileId:   dataset._id,
          ...form,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          toast.info("You already have an active request for this dataset.");
          onSuccess(dataset._id); // still mark as requested
          onClose();
          return;
        }
        throw new Error(data.message || "Request failed");
      }

      toast.success("Access request submitted successfully!", {
        description: "The data owner will review your request.",
      });
      onSuccess(dataset._id);
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Input helpers ───────────────────────────────────────────────────────────
  const set = <K extends keyof FormData>(k: K, v: FormData[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const extColor = EXT_COLOR[dataset.extension] ?? "text-muted-foreground";

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <motion.div
        key="drawer"
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-xl flex flex-col
                   bg-background border-l border-border shadow-2xl overflow-hidden"
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-border
                        bg-gradient-to-r from-primary/10 to-purple-500/5 shrink-0">
          <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <FlaskConical className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-base">Research Access Request</p>
            <p className="text-xs text-muted-foreground truncate">
              {dataset.originalName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center
                       transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Dataset info pill ── */}
        <div className="px-6 py-3 bg-muted/30 border-b border-border shrink-0">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className={`font-semibold font-mono uppercase ${extColor}`}>
              {dataset.extension.replace(".", "")}
            </span>
            <span className="w-px h-3 bg-border" />
            <span>{formatSize(dataset.sizeBytes)}</span>
            {dataset.owner?.country && (
              <>
                <span className="w-px h-3 bg-border" />
                <span>Origin: {dataset.owner.country}</span>
              </>
            )}
          </div>
        </div>

        {/* ── Scrollable form body ── */}
        <div
          className="flex-1 overflow-y-auto px-6 py-5 space-y-6"
          style={{ scrollBehavior: "smooth", overscrollBehavior: "contain" }}
        >

          {/* 1. Project Title */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold">
              <FileText className="h-3.5 w-3.5 text-primary" />
              Project Title
              <span className="text-red-400 ml-0.5">*</span>
            </label>
            <Input
              placeholder="e.g. Genomic Markers in Cardiovascular Disease"
              value={form.projectTitle}
              onChange={e => set("projectTitle", e.target.value)}
              className={errors.projectTitle ? "border-red-500" : ""}
            />
            {errors.projectTitle && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />{errors.projectTitle}
              </p>
            )}
          </div>

          {/* 2. Purpose of Research */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold">
              <Dna className="h-3.5 w-3.5 text-primary" />
              Purpose of Research
              <span className="text-red-400 ml-0.5">*</span>
            </label>
            <textarea
              rows={4}
              placeholder="Describe your research objectives, methodology, and why you need access to this specific dataset…"
              value={form.purpose}
              onChange={e => set("purpose", e.target.value)}
              className={`w-full rounded-md border bg-background px-3 py-2 text-sm
                          resize-none placeholder:text-muted-foreground focus-visible:outline-none
                          focus-visible:ring-2 focus-visible:ring-ring transition-colors
                          ${errors.purpose ? "border-red-500" : "border-input"}`}
            />
            <div className="flex items-center justify-between">
              {errors.purpose ? (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />{errors.purpose}
                </p>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {form.purpose.length} / 2000
                </span>
              )}
            </div>
          </div>

          {/* 3. Access Type */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-sm font-semibold">
              <Shield className="h-3.5 w-3.5 text-primary" />
              Access Type
              <span className="text-red-400 ml-0.5">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {ACCESS_OPTS.map(opt => {
                const selected = form.accessType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set("accessType", opt.value)}
                    className={`relative flex flex-col gap-2 p-4 rounded-xl border-2 text-left
                                transition-all duration-150
                                ${selected
                                  ? "border-primary bg-primary/8 shadow-sm"
                                  : "border-border hover:border-primary/40 hover:bg-muted/50"
                                }`}
                  >
                    {/* Radio indicator */}
                    <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center
                                    ${selected ? "border-primary" : "border-muted-foreground/40"}`}>
                      {selected && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <span className={`flex items-center gap-1.5 font-semibold text-sm
                                      ${selected ? "text-primary" : "text-foreground"}`}>
                      {opt.icon}{opt.label}
                    </span>
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
            {form.accessType === "downloadable" && (
              <div className="flex gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-400">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  Selecting Downloadable does <strong>not</strong> automatically allow downloads.
                  The data owner must explicitly approve this level of access.
                </span>
              </div>
            )}
          </div>

          {/* 4. Access Duration */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-sm font-semibold">
              <Clock className="h-3.5 w-3.5 text-primary" />
              Access Duration
            </label>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border">
              <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">24 Hours</p>
                <p className="text-xs text-muted-foreground">
                  Initial access is always limited to 24 hours.
                </p>
              </div>
            </div>
            {/* Extension checkbox */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <div
                onClick={() => set("extensionRequested", !form.extensionRequested)}
                className={`mt-0.5 h-4 w-4 rounded border-2 flex items-center justify-center
                            shrink-0 transition-all
                            ${form.extensionRequested
                              ? "bg-primary border-primary"
                              : "border-muted-foreground/40 group-hover:border-primary/60"
                            }`}
              >
                {form.extensionRequested && (
                  <CheckCircle2 className="h-3 w-3 text-primary-foreground" />
                )}
              </div>
              <div>
                <p className="text-sm">Request extension later if required</p>
                <p className="text-xs text-muted-foreground">
                  After 24 hours you may submit a new extension request. Owner must approve it separately.
                  Extensions are never granted automatically.
                </p>
              </div>
            </label>
          </div>

          {/* 5. Data sharing */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-sm font-semibold">
              <Users className="h-3.5 w-3.5 text-primary" />
              Will data be shared with collaborators?
              <span className="text-red-400 ml-0.5">*</span>
            </label>
            <div className="flex gap-3">
              {(["Yes", "No"] as const).map(opt => {
                const val  = opt === "Yes";
                const sel  = form.dataSharedWithCollaborators === val;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => set("dataSharedWithCollaborators", val)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                                border-2 font-medium text-sm transition-all
                                ${sel
                                  ? val
                                    ? "border-amber-500 bg-amber-500/10 text-amber-400"
                                    : "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                                  : "border-border hover:border-primary/40"
                                }`}
                  >
                    <div className={`h-3.5 w-3.5 rounded-full border-2
                                    ${sel ? (val ? "border-amber-500 bg-amber-500" : "border-emerald-500 bg-emerald-500") : "border-muted-foreground/40"}`} />
                    {opt}
                  </button>
                );
              })}
            </div>
            {form.dataSharedWithCollaborators && (
              <div className="flex gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  This information will be clearly shown to the data owner before they approve
                  your request.
                </span>
              </div>
            )}
          </div>

          {/* 6. Institution — auto-filled from profile */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold">
              <Building2 className="h-3.5 w-3.5 text-primary" />
              Institution / Organisation
            </label>
            {profileLoading ? (
              <div className="h-9 rounded-md bg-muted animate-pulse" />
            ) : profileInstitution ? (
              /* Read-only chip — pulled from researcher profile */
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/40">
                <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-sm font-medium flex-1">{profileInstitution}</span>
                <span className="text-[10px] text-muted-foreground bg-primary/10 text-primary
                                 px-1.5 py-0.5 rounded-full font-semibold tracking-wide">
                  From profile
                </span>
              </div>
            ) : (
              /* Fallback editable input if profile has no institution */
              <Input
                placeholder="e.g. Harvard Medical School"
                value={form.institution}
                onChange={e => set("institution", e.target.value)}
              />
            )}
          </div>

          {/* 7. Contact Email */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-semibold">
              <Mail className="h-3.5 w-3.5 text-primary" />
              Contact Email
              <span className="text-red-400 ml-0.5">*</span>
            </label>
            <Input
              type="email"
              placeholder="researcher@university.edu"
              value={form.contactEmail}
              onChange={e => set("contactEmail", e.target.value)}
              className={errors.contactEmail ? "border-red-500" : ""}
            />
            {errors.contactEmail && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />{errors.contactEmail}
              </p>
            )}
          </div>

          {/* 8. Benefits & Risks */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                Benefits
              </label>
              <textarea
                rows={3}
                placeholder="e.g. May contribute to early disease detection…"
                value={form.benefits}
                onChange={e => set("benefits", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
                           resize-none placeholder:text-muted-foreground focus-visible:outline-none
                           focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                Risks
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Minimal privacy risk. Data encrypted in transit…"
                value={form.risks}
                onChange={e => set("risks", e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm
                           resize-none placeholder:text-muted-foreground focus-visible:outline-none
                           focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          {/* Spacer so submit button doesn't overlap last field */}
          <div className="h-2" />
        </div>

        {/* ── Footer actions ── */}
        <div className="shrink-0 px-6 py-4 border-t border-border bg-background/80 backdrop-blur-sm">
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              className="flex-2 bg-gradient-to-r from-primary to-purple-600 hover:opacity-90
                         text-white shadow-lg shadow-primary/25 font-semibold"
              style={{ flex: 2 }}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</>
              ) : (
                <><ChevronRight className="h-4 w-4 mr-1.5" />Submit Request</>
              )}
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-3">
            Your request will be reviewed by the data owner. All decisions are blockchain-verified.
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
