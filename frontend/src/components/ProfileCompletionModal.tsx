/**
 * ProfileCompletionModal
 * ─────────────────────
 * First-login modal for age / gender / country.
 * Uses a custom country picker — no ugly native <select>.
 * Saves to PATCH /api/auth/profile and marks profileCompleted in AuthContext.
 */
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarDays, User, Globe, ChevronRight,
  Loader2, Heart, Check, Search as SearchIcon,
  ChevronDown,
} from "lucide-react";
import { Button }   from "@/components/ui/button";
import { useAuth }  from "@/contexts/AuthContext";
import { toast }    from "sonner";

// ── Data ──────────────────────────────────────────────────────────────────────
const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"];

const COUNTRIES = [
  "India", "United States", "United Kingdom", "Germany", "France",
  "Canada", "Australia", "Japan", "China", "Brazil", "South Korea",
  "Italy", "Spain", "Netherlands", "Sweden", "Singapore",
  "Saudi Arabia", "UAE", "South Africa", "Mexico", "Argentina",
  "Pakistan", "Bangladesh", "Sri Lanka", "Nepal", "Other",
];

// ── Country picker dropdown ────────────────────────────────────────────────────
function CountryPicker({
  value, onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open,   setOpen]   = useState(false);
  const [query,  setQuery]  = useState("");
  const wrapRef             = useRef<HTMLDivElement>(null);

  const filtered = COUNTRIES.filter(c =>
    c.toLowerCase().includes(query.toLowerCase())
  );

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className={`w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm
          transition-all duration-150 text-left
          ${open
            ? "border-primary ring-2 ring-primary/20 bg-background"
            : "border-border bg-muted/40 hover:border-primary/40"
          }
          ${!value ? "text-muted-foreground" : "text-foreground"}`}
      >
        <span className="flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          {value || "Select country…"}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scaleY: 0.95 }}
            animate={{ opacity: 1, y: 0,  scaleY: 1     }}
            exit={{   opacity: 0, y: -4, scaleY: 0.95   }}
            transition={{ duration: 0.15 }}
            style={{ transformOrigin: "top" }}
            className="absolute left-0 right-0 top-full mt-1.5 z-[70]
              bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
          >
            {/* Search box */}
            <div className="p-2 border-b border-border">
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search country…"
                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/60 rounded-lg border border-border
                    focus:outline-none focus:border-primary focus:bg-background transition"
                />
              </div>
            </div>

            {/* List */}
            <div className="max-h-52 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No results</p>
              ) : (
                filtered.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { onChange(c); setOpen(false); setQuery(""); }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left transition-colors
                      ${value === c
                        ? "bg-primary/15 text-primary font-medium"
                        : "text-foreground hover:bg-muted/60"
                      }`}
                  >
                    {c}
                    {value === c && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────
interface Props { open: boolean; }

export default function ProfileCompletionModal({ open }: Props) {
  const { token, user, updateUser } = useAuth();
  const [age,     setAge]     = useState("");
  const [gender,  setGender]  = useState("");
  const [country, setCountry] = useState("");
  const [saving,  setSaving]  = useState(false);

  // ── Only owners fill this; call all hooks first to satisfy Rules of Hooks ──
  const isOwner = user?.role === "owner";

  const canSave = age.trim() !== "" && gender !== "" && country !== "" && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    const ageNum = Number(age);
    if (isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
      toast.error("Please enter a valid age (1–120)");
      return;
    }
    setSaving(true);

    // ── Optimistically mark as completed so modal never re-appears ──
    // Do this BEFORE the API call so a refresh/nav away doesn't re-trigger the modal.
    updateUser({ profileCompleted: true, age: ageNum, gender, country });

    try {
      const res  = await fetch("http://localhost:5000/api/auth/profile", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ age: ageNum, gender, country }),
      });
      const data = await res.json();
      if (!res.ok) {
        // API failed — still keep modal closed (already marked in AuthContext)
        // but warn the user so they can retry from the Profile page.
        toast.warning("Profile saved locally but server sync failed. Edit from your Profile page.");
        return;
      }
      toast.success("Profile saved! Welcome to GenoVault.");
    } catch {
      toast.warning("Profile saved locally but server sync failed. Edit from your Profile page.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && isOwner && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{   opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
        >
          <motion.div
            initial={{ scale: 0.93, opacity: 0, y: 24 }}
            animate={{ scale: 1,    opacity: 1, y: 0  }}
            exit={{   scale: 0.93, opacity: 0, y: 24  }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-visible"
          >
            {/* Gradient strip */}
            <div className="h-1 rounded-t-2xl bg-gradient-to-r from-primary via-emerald-400 to-teal-500" />

            <div className="p-6 space-y-5">
              {/* Title */}
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <Heart className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-bold leading-tight">Complete Your Profile</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Used anonymously in the dataset catalog — your name is never shown.
                  </p>
                </div>
              </div>

              {/* ── Age ── */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  Age
                </label>
                <input
                  type="number" min={1} max={120}
                  value={age}
                  onChange={e => setAge(e.target.value)}
                  placeholder="e.g. 32"
                  className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm
                    focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>

              {/* ── Gender ── */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  Gender
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {GENDERS.map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGender(g)}
                      className={`relative rounded-lg border px-3 py-2.5 text-sm font-medium text-left transition-all
                        ${gender === g
                          ? "border-primary bg-primary/10 text-primary shadow-sm"
                          : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:bg-muted/50"
                        }`}
                    >
                      {gender === g && (
                        <Check className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary" />
                      )}
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Country ── */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium mb-2">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  Country
                </label>
                <CountryPicker value={country} onChange={setCountry} />
              </div>

              {/* Privacy note */}
              <div className="flex items-start gap-2 bg-muted/40 rounded-lg px-3 py-2.5">
                <span className="text-base leading-none mt-0.5">🔒</span>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This data is stored securely and shown <strong className="text-foreground">only as anonymized statistics</strong> in the dataset catalog. Your identity is never revealed.
                </p>
              </div>

              {/* CTA */}
              <Button
                className="w-full gap-2 h-11"
                onClick={handleSave}
                disabled={!canSave}
              >
                {saving
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                  : <>Continue <ChevronRight className="h-4 w-4" /></>
                }
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
