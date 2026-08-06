/**
 * PinSetupModal.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * First-time security PIN setup modal.
 *
 * Storage architecture (FIXED):
 *   1. Raw PIN entered by user
 *   2. Sent to POST /api/auth/set-pin
 *   3. Backend bcrypt-hashes it → stores hash in Azure Key Vault
 *   4. MongoDB marks user.pinSet = true
 *   5. Raw PIN stored in localStorage ONLY for the current session's
 *      client-side PIN gate (approve/reject confirm dialog in Requests.tsx).
 *      It is NEVER sent to or stored in the backend in plain text.
 *
 * Previous bug: modal only called AuthContext.setPin() → localStorage.
 * Backend Key Vault never received the hash → verifyPin always failed on approve.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { KeyRound, ShieldCheck, ArrowRight, Loader2 } from "lucide-react";
import { Button }   from "@/components/ui/button";
import { PinInput } from "@/components/ui/PinInput";
import { useAuth }  from "@/contexts/AuthContext";
import { toast }    from "sonner";

const API_BASE = "http://localhost:5000/api";
const empty    = () => Array(6).fill("");

export const PinSetupModal = () => {
  const { user, token, pin, setPin } = useAuth();

  const [step,    setStep]    = useState<"intro" | "create" | "confirm">("intro");
  const [digits1, setDigits1] = useState<string[]>(empty());
  const [digits2, setDigits2] = useState<string[]>(empty());
  const [shake,   setShake]   = useState(false);
  const [loading, setLoading] = useState(false);

  // Show ONLY when: logged in, owner role, no PIN in localStorage, AND backend confirms no PIN set
  const showModal = !!user && user.role === "owner" && !pin && !user.pinSet;

  // Reset when modal (re)opens
  useEffect(() => {
    if (showModal) { setStep("intro"); setDigits1(empty()); setDigits2(empty()); }
  }, [showModal]);

  if (!showModal) return null;

  const handleCreate = () => {
    if (digits1.join("").length < 6) { toast.error("Enter all 6 digits"); return; }
    setStep("confirm");
    setDigits2(empty());
  };

  const handleConfirm = async () => {
    if (digits2.join("").length < 6) { toast.error("Enter all 6 digits"); return; }
    if (digits1.join("") !== digits2.join("")) {
      setShake(true);
      setDigits2(empty());
      setTimeout(() => setShake(false), 600);
      toast.error("PINs don't match. Try again.");
      return;
    }

    const rawPin = digits1.join("");
    setLoading(true);
    try {
      // ── Step 1: Save hash to Azure Key Vault via backend ──────────────────
      const res  = await fetch(`${API_BASE}/auth/set-pin`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${token}`,
        },
        body: JSON.stringify({ pin: rawPin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to save PIN");

      // ── Step 2: Store raw PIN in localStorage for client-side PIN gate ────
      // (used only to pre-fill the confirm dialog — never sent to backend again)
      setPin(rawPin);
      toast.success("Security PIN created and saved to Azure Key Vault!");

    } catch (e: any) {
      toast.error(e.message || "Failed to save PIN. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {showModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 24 }}
            transition={{ type: "spring", damping: 22, stiffness: 280 }}
            className="w-full max-w-md rounded-3xl border border-border bg-card shadow-2xl overflow-hidden"
          >
            {/* Top gradient banner */}
            <div className="h-2 w-full bg-gradient-primary" />

            <div className="p-8">
              {/* ── Intro ── */}
              {step === "intro" && (
                <motion.div key="intro" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 text-center">
                  <div className="flex justify-center">
                    <div className="relative">
                      <div className="h-20 w-20 rounded-3xl bg-gradient-primary flex items-center justify-center shadow-elegant">
                        <KeyRound className="h-9 w-9 text-primary-foreground" />
                      </div>
                      <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-success flex items-center justify-center shadow-md">
                        <ShieldCheck className="h-4 w-4 text-success-foreground" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold">Create your Security PIN</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Welcome, <span className="text-foreground font-medium">{user?.name}</span>!<br />
                      Set a <strong>6-digit PIN</strong> to authorise sensitive actions like approving or revoking data access.
                    </p>
                  </div>

                  <div className="space-y-2 text-left rounded-xl border border-border bg-muted/30 p-4">
                    {[
                      "Used to approve researcher access requests",
                      "Used to instantly revoke active grants",
                      "Hash stored securely in Azure Key Vault — never in plain text",
                    ].map(t => (
                      <div key={t} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <ShieldCheck className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />{t}
                      </div>
                    ))}
                  </div>

                  <Button
                    className="w-full h-12 bg-gradient-primary hover:opacity-90 shadow-elegant text-base font-semibold"
                    onClick={() => setStep("create")}
                  >
                    Create PIN <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </motion.div>
              )}

              {/* ── Create PIN ── */}
              {step === "create" && (
                <motion.div key="create" initial={{ opacity: 0, x: 32 }} animate={{ opacity: 1, x: 0 }} className="space-y-7">
                  <div className="text-center space-y-1">
                    <h2 className="text-xl font-bold">Set your PIN</h2>
                    <p className="text-sm text-muted-foreground">Click the boxes and type 6 digits</p>
                  </div>

                  <PinInput value={digits1} onChange={setDigits1} autoFocus label="Enter PIN" />

                  <Button
                    className="w-full h-11 bg-gradient-primary hover:opacity-90 shadow-elegant font-semibold"
                    onClick={handleCreate}
                    disabled={digits1.join("").length < 6}
                  >
                    Continue <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </motion.div>
              )}

              {/* ── Confirm PIN ── */}
              {step === "confirm" && (
                <motion.div key="confirm" initial={{ opacity: 0, x: 32 }} animate={{ opacity: 1, x: 0 }} className="space-y-7">
                  <div className="text-center space-y-1">
                    <h2 className="text-xl font-bold">Confirm your PIN</h2>
                    <p className="text-sm text-muted-foreground">Re-enter the same 6-digit PIN</p>
                  </div>

                  <PinInput value={digits2} onChange={setDigits2} shake={shake} autoFocus label="Confirm PIN" />

                  <div className="flex gap-3">
                    <Button
                      variant="outline" className="flex-1 h-11"
                      onClick={() => { setStep("create"); setDigits2(empty()); }}
                      disabled={loading}
                    >
                      Back
                    </Button>
                    <Button
                      className="flex-1 h-11 bg-gradient-primary hover:opacity-90 shadow-elegant font-semibold"
                      onClick={handleConfirm}
                      disabled={digits2.join("").length < 6 || loading}
                    >
                      {loading
                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
                        : <><ShieldCheck className="mr-2 h-4 w-4" />Save PIN</>
                      }
                    </Button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
