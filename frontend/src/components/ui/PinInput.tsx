import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";

interface PinInputProps {
  value: string[];              // array of 6 digit strings
  onChange: (v: string[]) => void;
  shake?: boolean;
  autoFocus?: boolean;
  label?: string;
  showToggle?: boolean;
}

/**
 * Reliable 6-digit PIN input using a single hidden <input> for keyboard
 * capture. The visual boxes are purely decorative — clicking anywhere on
 * them routes focus to the hidden input automatically.
 */
export const PinInput = ({
  value,
  onChange,
  shake = false,
  autoFocus = false,
  label,
  showToggle = true,
}: PinInputProps) => {
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [show, setShow] = useState(false);

  // Auto-focus the hidden input when requested
  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => hiddenRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  const focusHidden = () => hiddenRef.current?.focus();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 6);
    const next = Array(6).fill("").map((_, i) => raw[i] ?? "");
    onChange(next);
  };

  // Which box is "active" — the first empty slot, or last slot if full
  const activeIndex = Math.min(value.filter(Boolean).length, 5);

  return (
    <div className="space-y-2">
      {(label || showToggle) && (
        <div className="flex items-center justify-between">
          {label && <p className="text-sm font-medium text-muted-foreground">{label}</p>}
          {showToggle && (
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              className="text-muted-foreground hover:text-foreground transition-colors ml-auto"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
      )}

      {/* Hidden real input — captures all keyboard input */}
      <input
        ref={hiddenRef}
        type={show ? "text" : "password"}
        inputMode="numeric"
        value={value.join("")}
        onChange={handleChange}
        maxLength={6}
        className="sr-only"          // visually hidden, still focusable & keyboard-capable
        aria-label="Enter PIN"
        autoComplete="off"
      />

      {/* Visual digit boxes — click anywhere to focus hidden input */}
      <motion.div
        animate={shake ? { x: [-8, 8, -8, 8, -4, 4, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="flex gap-2 justify-center cursor-text"
        onClick={focusHidden}
      >
        {value.map((d, i) => (
          <div
            key={i}
            onClick={focusHidden}
            className={`
              w-11 h-12 flex items-center justify-center
              rounded-xl border-2 text-xl font-bold
              bg-muted/40 transition-all duration-150 select-none
              ${shake
                ? "border-destructive"
                : i === activeIndex
                  ? "border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.15)]"  // active glow
                  : d
                    ? "border-primary/60"
                    : "border-border"
              }
            `}
          >
            {d ? (show ? d : "•") : (i === activeIndex ? <span className="w-0.5 h-5 bg-primary animate-pulse rounded-full" /> : "")}
          </div>
        ))}
      </motion.div>

      {/* Progress bar */}
      <div className="flex gap-1.5 justify-center pt-0.5">
        {Array(6).fill(0).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
              i < value.filter(Boolean).length ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>
    </div>
  );
};
