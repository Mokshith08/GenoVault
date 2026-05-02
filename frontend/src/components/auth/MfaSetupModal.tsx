/**
 * MfaSetupModal
 * ─────────────
 * Shown automatically after successful registration.
 *
 * Flow:
 *   1. On mount → calls POST /api/auth/setup-mfa with the short-lived
 *      setupToken to get a QR code data-URL.
 *   2. User scans the QR code with Microsoft Authenticator (or any
 *      TOTP-compatible app) and enters the 6-digit code.
 *   3. On "Verify" → calls POST /api/auth/verify-mfa.
 *   4. On success  → calls onSuccess() so the parent can navigate.
 *   5. On failure  → shows an inline error; user can retry.
 *
 * Security notes:
 *   • The setup token is NEVER stored in localStorage.
 *   • The QR data-URL is kept only in local component state.
 *   • The raw TOTP secret is never sent to the frontend.
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Smartphone,
  ShieldCheck,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API_BASE = "http://localhost:5000/api";

interface Props {
  /** Short-lived JWT returned by /auth/register */
  setupToken: string;
  /** Called when MFA is successfully verified */
  onSuccess: () => void;
  /** Called if the user explicitly skips (optional safety valve) */
  onSkip?: () => void;
}

type Phase = "loading" | "scan" | "verifying" | "success" | "error";

export const MfaSetupModal = ({ setupToken, onSuccess, onSkip }: Props) => {
  const [phase, setPhase] = useState<Phase>("loading");
  const [qrCode, setQrCode] = useState<string>("");
  const [code, setCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const codeInputRef = useRef<HTMLInputElement>(null);

  /* ── Fetch QR code on mount ─────────────────────────────── */
  useEffect(() => {
    fetchQR();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Focus the code input once scan phase is active ──────── */
  useEffect(() => {
    if (phase === "scan") {
      setTimeout(() => codeInputRef.current?.focus(), 100);
    }
  }, [phase]);

  const fetchQR = async () => {
    setPhase("loading");
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/auth/setup-mfa`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${setupToken}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to generate QR code");
      setQrCode(data.qrCode);
      setPhase("scan");
    } catch (err: any) {
      setErrorMsg(err.message);
      setPhase("error");
    }
  };

  const handleVerify = async () => {
    // Sanitise: strip spaces, accept only digits
    const cleaned = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(cleaned)) {
      setErrorMsg("Please enter a valid 6-digit code");
      return;
    }
    setPhase("verifying");
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/auth/verify-mfa`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${setupToken}`,
        },
        body: JSON.stringify({ code: cleaned }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Verification failed");
      setPhase("success");
      // Give the user a moment to see the success state
      setTimeout(onSuccess, 1800);
    } catch (err: any) {
      setErrorMsg(err.message);
      setCode("");
      setPhase("scan");
      codeInputRef.current?.focus();
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(val);
    setErrorMsg("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && code.length === 6) handleVerify();
  };

  /* ─────────────────────────────────────────────────────────── */
  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mfa-modal-title"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key="modal"
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
          style={{
            background: "linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%)",
            border: "1px solid rgba(99,102,241,0.25)",
          }}
        >
          {/* ── Header gradient strip ─────────────────────────── */}
          <div
            className="h-1.5 w-full"
            style={{ background: "linear-gradient(90deg, #6366f1, #8b5cf6, #06b6d4)" }}
          />

          {/* ── Skip button (top-right) ────────────────────────── */}
          {onSkip && phase !== "success" && phase !== "verifying" && (
            <button
              onClick={onSkip}
              aria-label="Skip MFA setup"
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <div className="px-8 py-7 space-y-6">
            {/* ── Title ───────────────────────────────────────── */}
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl mx-auto mb-1"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                <ShieldCheck className="h-7 w-7 text-white" />
              </div>
              <h2
                id="mfa-modal-title"
                className="text-xl font-bold text-white"
              >
                Secure Your Account
              </h2>
              <p className="text-sm text-gray-400">
                Set up two-factor authentication with{" "}
                <span className="text-indigo-400 font-medium">
                  Microsoft Authenticator
                </span>
              </p>
            </div>

            {/* ── Phase: Loading ───────────────────────────────── */}
            {phase === "loading" && (
              <div className="flex flex-col items-center gap-4 py-8">
                <div className="relative">
                  <div className="h-16 w-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 text-indigo-400 animate-spin" />
                  </div>
                </div>
                <p className="text-sm text-gray-400">Generating your secure QR code…</p>
              </div>
            )}

            {/* ── Phase: Scan ──────────────────────────────────── */}
            {phase === "scan" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-5"
              >
                {/* Instructions */}
                <div
                  className="rounded-xl p-4 space-y-2.5"
                  style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}
                >
                  <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                    How to scan
                  </p>
                  {[
                    { num: "1", text: "Open Microsoft Authenticator on your phone" },
                    { num: "2", text: 'Tap  +  →  Other Account  (Google, Facebook, etc.)' },
                    { num: "3", text: "Point your camera at the QR code below" },
                  ].map((step) => (
                    <div key={step.num} className="flex items-start gap-3">
                      <span
                        className="flex-shrink-0 h-5 w-5 rounded-full text-xs font-bold flex items-center justify-center text-white"
                        style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
                      >
                        {step.num}
                      </span>
                      <span className="text-xs text-gray-300 leading-relaxed">{step.text}</span>
                    </div>
                  ))}
                </div>

                {/* QR Code */}
                <div className="flex justify-center">
                  <div
                    className="p-3 rounded-2xl"
                    style={{
                      background: "white",
                      boxShadow: "0 0 0 4px rgba(99,102,241,0.3), 0 8px 32px rgba(0,0,0,0.4)",
                    }}
                  >
                    <img
                      src={qrCode}
                      alt="TOTP QR Code for GenoVault"
                      width={200}
                      height={200}
                      className="block rounded-lg"
                    />
                  </div>
                </div>

                {/* Smartphone hint */}
                <div className="flex items-center gap-2 text-center justify-center">
                  <Smartphone className="h-4 w-4 text-gray-500" />
                  <span className="text-xs text-gray-500">
                    GenoVault will appear in your authenticator app
                  </span>
                </div>

                {/* Code input */}
                <div className="space-y-2">
                  <Label htmlFor="mfa-code" className="text-sm text-gray-300">
                    Enter the 6-digit code from the app
                  </Label>
                  <Input
                    id="mfa-code"
                    ref={codeInputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={handleCodeChange}
                    onKeyDown={handleKeyDown}
                    placeholder="000 000"
                    className="text-center text-2xl font-mono tracking-[0.4em] h-14 rounded-xl"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: errorMsg
                        ? "1px solid rgba(239,68,68,0.6)"
                        : "1px solid rgba(99,102,241,0.3)",
                      color: "white",
                    }}
                  />
                  {errorMsg && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 text-red-400 text-xs"
                    >
                      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                      {errorMsg}
                    </motion.div>
                  )}
                </div>

                {/* Verify button */}
                <Button
                  id="mfa-verify-btn"
                  onClick={handleVerify}
                  disabled={code.length !== 6}
                  className="w-full h-12 font-semibold text-white rounded-xl transition-all"
                  style={{
                    background:
                      code.length === 6
                        ? "linear-gradient(135deg,#6366f1,#8b5cf6)"
                        : "rgba(99,102,241,0.3)",
                    opacity: code.length !== 6 ? 0.6 : 1,
                  }}
                >
                  Verify & Enable MFA
                </Button>

                {/* Regenerate */}
                <button
                  onClick={fetchQR}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-indigo-400 transition-colors py-1"
                >
                  <RefreshCw className="h-3 w-3" />
                  Generate a new QR code
                </button>
              </motion.div>
            )}

            {/* ── Phase: Verifying ─────────────────────────────── */}
            {phase === "verifying" && (
              <div className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="h-10 w-10 text-indigo-400 animate-spin" />
                <p className="text-sm text-gray-400">Verifying your code…</p>
              </div>
            )}

            {/* ── Phase: Error (fetch failed) ───────────────────── */}
            {phase === "error" && (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <AlertCircle className="h-12 w-12 text-red-400" />
                <div>
                  <p className="text-white font-medium">Something went wrong</p>
                  <p className="text-sm text-gray-400 mt-1">{errorMsg}</p>
                </div>
                <Button
                  onClick={fetchQR}
                  variant="outline"
                  className="border-indigo-500/40 text-indigo-400 hover:bg-indigo-500/10"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try again
                </Button>
              </div>
            )}

            {/* ── Phase: Success ────────────────────────────────── */}
            {phase === "success" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-4 py-8 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
                  className="h-16 w-16 rounded-2xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
                >
                  <CheckCircle2 className="h-8 w-8 text-white" />
                </motion.div>
                <div>
                  <p className="text-lg font-bold text-white">MFA Enabled!</p>
                  <p className="text-sm text-gray-400 mt-1">
                    Your account is now protected with two-factor authentication.
                  </p>
                </div>
                <p className="text-xs text-gray-500">Redirecting you to login…</p>
              </motion.div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
