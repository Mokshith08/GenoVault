import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, FlaskConical, Globe,
  CheckCircle2, ChevronRight, ChevronLeft,
  Loader2, Dna, BriefcaseBusiness, Search, X,
} from "lucide-react";
import { toast } from "sonner";

const API = "http://localhost:5000/api";

// ─────────────────────────────────────────────────────────────────────────────
//  Autocomplete suggestion data
// ─────────────────────────────────────────────────────────────────────────────
const INSTITUTIONS = [
  // India
  "IIT Bombay", "IIT Delhi", "IIT Madras", "IIT Kanpur", "IIT Kharagpur",
  "IIT Roorkee", "IIT Hyderabad", "IIT Guwahati", "IISc Bangalore",
  "AIIMS New Delhi", "AIIMS Bhopal", "AIIMS Jodhpur",
  "University of Delhi", "University of Mumbai", "University of Calcutta",
  "Jawaharlal Nehru University", "Banaras Hindu University",
  "Manipal Academy of Higher Education", "Vellore Institute of Technology",
  "SRM Institute of Science and Technology", "Amrita Vishwa Vidyapeetham",
  "National Institute of Immunology", "National Institute of Mental Health",
  "Centre for Cellular and Molecular Biology (CCMB)",
  "Institute of Genomics and Integrative Biology (IGIB)",
  "National Brain Research Centre",
  // Global
  "Harvard University", "Stanford University", "MIT",
  "Johns Hopkins University", "University of Cambridge",
  "University of Oxford", "Yale University", "Princeton University",
  "University of California, San Francisco (UCSF)",
  "University of California, Berkeley", "University of Toronto",
  "McGill University", "University of Melbourne", "University of Sydney",
  "National University of Singapore", "Peking University",
  "Tsinghua University", "Seoul National University",
  "Karolinska Institute", "ETH Zurich", "Max Planck Institute",
  "Broad Institute of MIT and Harvard", "Wellcome Sanger Institute",
  "Helmholtz Association", "EMBL", "NIH", "CDC",
];

const DEPARTMENTS = [
  "Biosciences", "Genetics", "Genomics", "Biochemistry",
  "Molecular Biology", "Cell Biology", "Microbiology",
  "Biotechnology", "Bioinformatics", "Computational Biology",
  "Computer Science", "Biomedical Engineering", "Biostatistics",
  "Epidemiology", "Pathology", "Clinical Medicine",
  "Pharmacology", "Neuroscience", "Immunology", "Oncology",
  "Structural Biology", "Systems Biology", "Evolutionary Biology",
  "Public Health", "Translational Medicine", "Medical Genetics",
  "Human Genetics", "Plant Biology", "Environmental Science",
  "Data Science", "Artificial Intelligence & Machine Learning",
];

const COUNTRIES = [
  "India", "United States", "United Kingdom", "Canada", "Australia",
  "Germany", "France", "Japan", "China", "South Korea",
  "Singapore", "Netherlands", "Sweden", "Switzerland", "Israel",
  "Brazil", "South Africa", "New Zealand", "Italy", "Spain",
  "Norway", "Denmark", "Finland", "Belgium", "Austria",
  "Portugal", "Poland", "Czech Republic", "Ireland", "Greece",
  "Turkey", "Saudi Arabia", "UAE", "Malaysia", "Indonesia",
  "Thailand", "Vietnam", "Bangladesh", "Pakistan", "Sri Lanka",
];

const DESIGNATIONS = [
  "PhD Scholar", "Post-Doctoral Researcher", "Research Fellow",
  "Junior Research Fellow (JRF)", "Senior Research Fellow (SRF)",
  "Lecturer", "Assistant Professor", "Associate Professor", "Professor",
  "Principal Investigator", "Co-Investigator",
  "Data Scientist", "Bioinformatician", "Clinical Researcher",
  "Research Scientist", "Staff Scientist", "Group Leader",
  "Director of Research", "Chief Scientific Officer",
  "Medical Officer", "Clinician-Scientist", "Lab Manager", "Other",
];

const RESEARCH_AREAS = [
  "Genomics", "Proteomics", "Transcriptomics", "Metabolomics",
  "Metagenomics", "Single-cell Genomics", "Epigenomics",
  "Oncology / Cancer Genomics", "Pharmacogenomics", "Epigenetics",
  "Population Genetics", "Human Genetics", "Evolutionary Genomics",
  "Bioinformatics", "Computational Biology", "Systems Biology",
  "Structural Biology", "Structural Genomics",
  "Immunology", "Immunogenomics",
  "Neuroscience", "Neurogenomics",
  "Rare Diseases", "Inherited Disorders",
  "Infectious Disease Genomics", "Microbiome Research",
  "Plant Genomics", "Agricultural Genomics",
  "Drug Discovery", "Precision Medicine",
  "Clinical Genomics", "Translational Research",
  "Machine Learning in Biology", "AI in Healthcare", "Other",
];

const EXPERIENCE_OPTIONS = [
  "Less than 1 year", "1–2 years", "2–3 years", "3–5 years",
  "5–7 years", "7–10 years", "10–15 years", "15+ years",
];

// ─────────────────────────────────────────────────────────────────────────────
//  AutocompleteInput Component
// ─────────────────────────────────────────────────────────────────────────────
interface AutocompleteProps {
  value:       string;
  onChange:    (val: string) => void;
  suggestions: string[];
  placeholder: string;
  accentColor?: string;
}

const AutocompleteInput = ({
  value, onChange, suggestions, placeholder, accentColor = "#6366f1",
}: AutocompleteProps) => {
  const [open,   setOpen]   = useState(false);
  const [query,  setQuery]  = useState(value);
  const wrapRef             = useRef<HTMLDivElement>(null);

  // Keep query in sync when form value changes externally
  useEffect(() => { setQuery(value); }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = query.trim().length === 0
    ? suggestions.slice(0, 8)                               // show top 8 when empty
    : suggestions
        .filter(s => s.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8);

  const select = (s: string) => {
    setQuery(s);
    onChange(s);
    setOpen(false);
  };

  const clear = () => {
    setQuery("");
    onChange("");
    setOpen(true);
  };

  // Highlight the matching part
  const highlight = (text: string, search: string) => {
    if (!search.trim()) return <span>{text}</span>;
    const idx = text.toLowerCase().indexOf(search.toLowerCase());
    if (idx === -1) return <span>{text}</span>;
    return (
      <>
        {text.slice(0, idx)}
        <span style={{ color: accentColor, fontWeight: 600 }}>
          {text.slice(idx, idx + search.length)}
        </span>
        {text.slice(idx + search.length)}
      </>
    );
  };

  return (
    <div ref={wrapRef} className="relative">
      {/* Input */}
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={e => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setOpen(true);
          }}
          className="w-full rounded-xl pl-9 pr-9 py-3 text-sm text-foreground
            bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)]
            focus:outline-none transition-all placeholder:text-muted-foreground/40"
          style={{
            borderColor: open ? accentColor + "80" : undefined,
            boxShadow:   open ? `0 0 0 1px ${accentColor}40` : undefined,
          }}
        />
        {query && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); clear(); }}
            className="absolute right-3 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {open && filtered.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{   opacity: 0, y: -6, scale: 0.98  }}
            transition={{ duration: 0.12 }}
            className="absolute z-[200] w-full mt-1.5 rounded-xl overflow-hidden shadow-2xl"
            style={{
              background: "linear-gradient(145deg, #13132a, #0f0f22)",
              border:     `1px solid ${accentColor}35`,
              boxShadow:  `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${accentColor}20`,
            }}
          >
            <div className="max-h-52 overflow-y-auto">
              {filtered.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); select(s); }}
                  className="w-full text-left px-4 py-2.5 text-sm transition-all flex items-center gap-2"
                  style={{
                    background:   value === s ? `${accentColor}18` : "transparent",
                    color:        value === s ? accentColor : "#cbd5e1",
                    borderBottom: i < filtered.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  }}
                  onMouseEnter={e => {
                    if (value !== s)
                      (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = value === s ? `${accentColor}18` : "transparent";
                  }}
                >
                  {value === s && (
                    <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" style={{ color: accentColor }} />
                  )}
                  <span className={value === s ? "" : "pl-[18px]"}>
                    {highlight(s, query)}
                  </span>
                </button>
              ))}
            </div>
            {filtered.length === 8 && (
              <div className="px-4 py-1.5 text-xs text-muted-foreground/40 border-t border-white/5">
                Keep typing to narrow results…
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Form types & steps
// ─────────────────────────────────────────────────────────────────────────────
interface ProfileForm {
  institution: string; department: string; designation: string;
  researchArea: string; experience: string; country: string;
  phone: string; linkedIn: string; orcid: string; bio: string; purpose: string;
}
const EMPTY: ProfileForm = {
  institution: "", department: "", designation: "", researchArea: "",
  experience: "", country: "", phone: "", linkedIn: "", orcid: "", bio: "", purpose: "",
};

const STEPS = [
  {
    id: "institution", title: "Your Institution",
    subtitle: "Tell us where you work or study",
    icon: Building2, color: "#6366f1",
  },
  {
    id: "role", title: "Your Role",
    subtitle: "Tell us about your professional position",
    icon: BriefcaseBusiness, color: "#8b5cf6",
  },
  {
    id: "contact", title: "Contact & Identity",
    subtitle: "Optional: help data owners verify your credentials",
    icon: Globe, color: "#06b6d4",
  },
  {
    id: "purpose", title: "Research Purpose",
    subtitle: "Why do you need access to genomic data?",
    icon: FlaskConical, color: "#10b981",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
//  ORCID auto-formatter  (XXXX-XXXX-XXXX-XXXX)
// ─────────────────────────────────────────────────────────────────────────────
const formatOrcid = (raw: string): string => {
  // Keep only digits (and allow X as last char per ORCID spec)
  const clean = raw.replace(/[^0-9X]/gi, "").toUpperCase().slice(0, 16);
  // Insert hyphens after every 4 characters
  return clean.match(/.{1,4}/g)?.join("-") ?? clean;
};

// ─────────────────────────────────────────────────────────────────────────────
//  Main Modal
// ─────────────────────────────────────────────────────────────────────────────
interface Props { token: string; onSaved: (profile: ProfileForm) => void; }

export const ResearcherProfileModal = ({ token, onSaved }: Props) => {
  const [step,   setStep]   = useState(0);
  const [form,   setForm]   = useState<ProfileForm>(EMPTY);
  const [saving,  setSaving]  = useState(false);
  const [agreed,  setAgreed]  = useState(false);

  const cur  = STEPS[step];
  const Icon = cur.icon;
  const set  = (key: keyof ProfileForm, val: string) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const canNext = () => {
    if (step === 0) return form.institution.trim().length > 0;
    if (step === 1) return form.designation.trim().length > 0 && form.researchArea.trim().length > 0;
    if (step === 3) return form.purpose.trim().length > 10 && agreed;
    return true;
  };

  const submit = async () => {
    if (!canNext()) return;
    setSaving(true);
    try {
      const res  = await fetch(`${API}/auth/researcher-profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:   JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast.success("Profile saved! Welcome to GenoVault.");
      onSaved(form);
    } catch (e: any) {
      toast.error(e.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = `w-full rounded-xl px-4 py-3 text-sm text-foreground
    bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)]
    focus:outline-none transition-all placeholder:text-muted-foreground/40`;

  // ── Render step content ──────────────────────────────────────────────────
  const renderStep = () => {
    if (step === 0) return (
      <div className="space-y-4">
        <Field label="Institution / University *">
          <AutocompleteInput value={form.institution} onChange={v => set("institution", v)}
            suggestions={INSTITUTIONS} placeholder="e.g. IIT Bombay, Harvard University"
            accentColor={cur.color} />
        </Field>
        <Field label="Department">
          <AutocompleteInput value={form.department} onChange={v => set("department", v)}
            suggestions={DEPARTMENTS} placeholder="e.g. Biosciences, Genetics"
            accentColor={cur.color} />
        </Field>
        <Field label="Country">
          <AutocompleteInput value={form.country} onChange={v => set("country", v)}
            suggestions={COUNTRIES} placeholder="e.g. India, United States"
            accentColor={cur.color} />
        </Field>
      </div>
    );

    if (step === 1) return (
      <div className="space-y-4">
        <Field label="Designation / Title *">
          <AutocompleteInput value={form.designation} onChange={v => set("designation", v)}
            suggestions={DESIGNATIONS} placeholder="e.g. PhD Scholar, Associate Professor"
            accentColor={cur.color} />
        </Field>
        <Field label="Primary Research Area *">
          <AutocompleteInput value={form.researchArea} onChange={v => set("researchArea", v)}
            suggestions={RESEARCH_AREAS} placeholder="e.g. Genomics, Oncology, Bioinformatics"
            accentColor={cur.color} />
        </Field>
        <Field label="Years of Experience">
          <AutocompleteInput value={form.experience} onChange={v => set("experience", v)}
            suggestions={EXPERIENCE_OPTIONS} placeholder="e.g. 3–5 years"
            accentColor={cur.color} />
        </Field>
      </div>
    );

    if (step === 2) return (
      <div className="space-y-4">
        <Field label="Phone Number">
          {(() => {
            // Count only digit characters (ignore +, spaces, dashes, brackets)
            const digits = form.phone.replace(/\D/g, "");
            const count  = digits.length;
            const valid  = count === 10;
            const over   = count > 10;
            const empty  = form.phone.trim().length === 0;

            const borderColor = empty ? undefined : valid ? "#10b981" : over ? "#ef4444" : "#f59e0b";
            const shadowColor = empty ? undefined : valid
              ? "0 0 0 1px rgba(16,185,129,0.3)"
              : over
              ? "0 0 0 1px rgba(239,68,68,0.3)"
              : "0 0 0 1px rgba(245,158,11,0.3)";
            const badgeColor  = valid ? "#10b981" : over ? "#ef4444" : "#f59e0b";
            const hintColor   = valid ? "#10b981" : over ? "#ef4444" : "rgba(148,163,184,0.5)";

            return (
              <>
                <div className="relative">
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => set("phone", e.target.value)}
                    placeholder="+91 9876543210"
                    className={inputClass}
                    style={{
                      paddingRight: form.phone ? "3.5rem" : undefined,
                      borderColor,
                      boxShadow: shadowColor,
                    }}
                  />
                  {/* Digit counter badge */}
                  {form.phone.trim().length > 0 && (
                    <span
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono font-semibold"
                      style={{ color: badgeColor }}
                    >
                      {valid ? "✓" : `${count}/10`}
                    </span>
                  )}
                </div>

                {/* Hint text */}
                {form.phone.trim().length > 0 && (
                  <p className="text-xs mt-1 flex items-center gap-1" style={{ color: hintColor }}>
                    {valid && "✓ Valid 10-digit phone number"}
                    {!valid && !over && `⚠ ${10 - count} more digit${10 - count === 1 ? "" : "s"} needed`}
                    {over  && `✕ ${count - 10} digit${count - 10 === 1 ? "" : "s"} too many (remove country code digits)`}
                  </p>
                )}
              </>
            );
          })()}
        </Field>
        <Field label="LinkedIn Profile">
          <input type="text" value={form.linkedIn} onChange={e => set("linkedIn", e.target.value)}
            placeholder="linkedin.com/in/yourname" className={inputClass} />
        </Field>
        <Field label="ORCID ID">
          <div className="relative">
            <input
              type="text"
              value={form.orcid}
              onChange={e => set("orcid", formatOrcid(e.target.value))}
              placeholder="0000-0002-1825-0097"
              maxLength={19}
              className={inputClass}
              style={{
                fontFamily: "'JetBrains Mono','Fira Code',monospace",
                letterSpacing: "0.08em",
                paddingRight: form.orcid ? "2.5rem" : undefined,
                borderColor:
                  form.orcid.length === 0  ? undefined :
                  form.orcid.length === 19 ? "#10b981" : "#f59e0b",
                boxShadow:
                  form.orcid.length === 0  ? undefined :
                  form.orcid.length === 19 ? "0 0 0 1px rgba(16,185,129,0.3)" :
                                             "0 0 0 1px rgba(245,158,11,0.3)",
              }}
            />
            {/* Status indicator */}
            {form.orcid.length > 0 && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono font-semibold"
                style={{ color: form.orcid.length === 19 ? "#10b981" : "#f59e0b" }}>
                {form.orcid.length === 19 ? "✓" : `${form.orcid.replace(/-/g,"").length}/16`}
              </span>
            )}
          </div>
          {/* Helper hint */}
          <p className="text-xs mt-1"
            style={{ color: form.orcid.length === 19 ? "#10b981" : "rgba(148,163,184,0.5)" }}>
            {form.orcid.length === 19
              ? "✓ Valid ORCID format"
              : "Type digits — hyphens are added automatically (e.g. 0000-0002-1825-0097)"}
          </p>
        </Field>
      </div>
    );

    // step 3 — purpose
    return (
      <div className="space-y-4">
        <Field label="Short Bio (optional)">
          <textarea rows={3} value={form.bio} onChange={e => set("bio", e.target.value)}
            placeholder="Briefly describe your research background…"
            maxLength={500} className={inputClass + " resize-none"} />
          <p className="text-right text-xs text-muted-foreground/40 mt-0.5">{form.bio.length}/500</p>
        </Field>
        <Field label="Purpose of Access *">
          <textarea rows={4} value={form.purpose} onChange={e => set("purpose", e.target.value)}
            placeholder="Describe your specific research goals and how you intend to use the genomic datasets…"
            maxLength={500} className={inputClass + " resize-none"} />
          <p className="text-right text-xs text-muted-foreground/40 mt-0.5">{form.purpose.length}/500</p>
        </Field>

        {/* ── Research Integrity Pledge ── */}
        <button
          type="button"
          onClick={() => setAgreed(a => !a)}
          className="w-full flex items-start gap-3 rounded-xl p-4 text-left transition-all cursor-pointer"
          style={{
            background: agreed ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.03)",
            border:     agreed ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {/* Custom checkbox */}
          <span
            className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-md flex items-center justify-center transition-all"
            style={{
              background:  agreed ? "#10b981" : "rgba(255,255,255,0.06)",
              border:      agreed ? "1px solid #10b981" : "1px solid rgba(255,255,255,0.2)",
              boxShadow:   agreed ? "0 0 0 3px rgba(16,185,129,0.2)" : "none",
            }}
          >
            {agreed && (
              <motion.svg
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                viewBox="0 0 12 10" fill="none"
                className="h-3 w-3"
              >
                <path d="M1 5l3.5 3.5L11 1" stroke="#fff" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
              </motion.svg>
            )}
          </span>

          {/* Pledge text */}
          <span className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold"
              style={{ color: agreed ? "#10b981" : "#e2e8f0" }}>
              I confirm research integrity &amp; ethical compliance
            </span>
            <span className="text-xs leading-relaxed"
              style={{ color: "rgba(148,163,184,0.75)" }}>
              I agree to use the genomic data solely for the stated research purpose,
              adhere to institutional ethics guidelines, maintain data confidentiality,
              not attempt re-identification of individuals, and comply with all applicable
              data-use policies and GenoVault terms of access.
            </span>
          </span>
        </button>

        {!agreed && form.purpose.trim().length > 10 && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-amber-400/80 flex items-center gap-1.5"
          >
            <span>⚠</span> Please tick the integrity pledge to complete your profile.
          </motion.p>
        )}
      </div>
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(8px)" }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1,    y: 0  }}
          exit={{   opacity: 0, scale: 0.92, y: 24  }}
          transition={{ type: "spring", stiffness: 300, damping: 26 }}
          className="w-full max-w-lg rounded-2xl overflow-visible shadow-2xl"
          style={{
            background: "linear-gradient(145deg, #0d0d1a 0%, #111128 100%)",
            border:     "1px solid rgba(99,102,241,0.2)",
          }}
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4 flex items-center gap-3"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}>
              <Dna className="h-5 w-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Complete Your Researcher Profile</h2>
              <p className="text-xs text-muted-foreground">This information helps data owners review your requests</p>
            </div>
          </div>

          {/* Progress steps */}
          <div className="px-6 pt-4">
            <div className="flex items-center gap-2 mb-4">
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 flex-1">
                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all ${
                      i < step  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" :
                      i === step ? "text-white border" :
                                  "bg-white/5 text-muted-foreground border border-white/10"
                    }`}
                    style={i === step ? { background: `${cur.color}20`, borderColor: cur.color, color: cur.color } : {}}
                  >
                    {i < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="flex-1 h-0.5 rounded-full transition-all"
                      style={{ background: i < step ? "#10b981" : "rgba(255,255,255,0.08)" }} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Step body */}
          <div className="px-6 pb-2" style={{ overflowVisible: true } as any}>
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0  }}
                exit={{   opacity: 0, x: -20 }}
                transition={{ duration: 0.18 }}
              >
                {/* Step heading */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${cur.color}18`, border: `1px solid ${cur.color}40` }}>
                    <Icon className="h-[18px] w-[18px]" style={{ color: cur.color }} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{cur.title}</h3>
                    <p className="text-xs text-muted-foreground">{cur.subtitle}</p>
                  </div>
                </div>
                {renderStep()}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="px-6 py-5 flex items-center justify-between gap-3"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <button onClick={() => setStep(s => Math.max(0, s - 1))}
              disabled={step === 0}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground
                disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-3 py-2 rounded-xl hover:bg-white/5">
              <ChevronLeft className="h-4 w-4" /> Back
            </button>

            <div className="text-xs text-muted-foreground/50">Step {step + 1} of {STEPS.length}</div>

            {step < STEPS.length - 1 ? (
              <button onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}
                disabled={!canNext()}
                className="flex items-center gap-1.5 text-sm font-semibold px-5 py-2.5 rounded-xl transition-all
                  disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: canNext() ? `linear-gradient(135deg, ${cur.color}, ${cur.color}cc)` : "rgba(255,255,255,0.06)",
                  color:      canNext() ? "#fff" : "rgba(255,255,255,0.4)",
                }}>
                Next <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button onClick={submit} disabled={saving || !canNext()}
                className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl transition-all
                  disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff" }}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {saving ? "Saving…" : "Complete Profile"}
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ── Small helper wrapper ──────────────────────────────────────────────────────
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
    {children}
  </div>
);
