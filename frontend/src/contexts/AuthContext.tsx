import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from "react";

export type Role = "owner" | "researcher";

export interface MockUser {
  name:             string;
  email:            string;
  role:             Role;
  profileCompleted: boolean;
  pinSet?:          boolean;     // true = PIN already saved in Azure Key Vault
  age?:             number | null;
  gender?:          string | null;
  country?:         string | null;
}

interface AuthCtx {
  user:        MockUser | null;
  token:       string | null;
  pin:         string | null;
  login:       (u: MockUser, token: string) => void;
  logout:      () => void;
  updateUser:  (partial: Partial<MockUser>) => void;
  setPin:      (pin: string) => void;
}

const AuthContext = createContext<AuthCtx | undefined>(undefined);

// ── Helper: decode JWT payload without a library ──────────────────────────────
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return !!payload.exp && payload.exp * 1000 < Date.now();
  } catch {
    return true; // malformed → treat as expired
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // ── Initialise from localStorage, but discard expired tokens immediately ──
  const [user, setUser] = useState<MockUser | null>(() => {
    const raw   = localStorage.getItem("genovault-user");
    const token = localStorage.getItem("genovault-token");
    // If the stored token is already expired, don't restore the session
    // Note: PIN is NOT cleared here — it persists across re-logins (device-local)
    if (!token || isTokenExpired(token)) {
      localStorage.removeItem("genovault-token");
      localStorage.removeItem("genovault-user");
      return null;
    }
    return raw ? JSON.parse(raw) : null;
  });

  const [token, setToken] = useState<string | null>(() => {
    const t = localStorage.getItem("genovault-token");
    if (!t || isTokenExpired(t)) return null;
    return t;
  });

  const [pin, setPinState] = useState<string | null>(() => {
    return localStorage.getItem("genovault-pin");
  });

  // ── login: sets state AND writes to localStorage atomically ──────────────
  const login = useCallback((u: MockUser, jwt: string) => {
    localStorage.setItem("genovault-token", jwt);
    localStorage.setItem("genovault-user",  JSON.stringify(u));
    setUser(u);
    setToken(jwt);
    // If the backend says this user already has a PIN set in Key Vault,
    // mark it in localStorage so PinSetupModal doesn't ask them to create one again.
    if (u.pinSet && !localStorage.getItem("genovault-pin")) {
      localStorage.setItem("genovault-pin", "__SET__");
      setPinState("__SET__");
    }
  }, []);

  // ── logout: clears session state + localStorage (PIN is kept — device-local) ─
  const logout = useCallback(() => {
    localStorage.removeItem("genovault-token");
    localStorage.removeItem("genovault-user");
    // PIN intentionally NOT cleared: it's a device-local secret like a screen lock.
    // The user should not have to re-create their PIN every time they log back in.
    setUser(null);
    setToken(null);
  }, []);

  // ── Listen for global 401 events dispatched by apiFetch ──────────────────
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener("gv:session-expired", handler);
    return () => window.removeEventListener("gv:session-expired", handler);
  }, [logout]);

  const updateUser = useCallback((partial: Partial<MockUser>) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...partial };
      localStorage.setItem("genovault-user", JSON.stringify(updated));
      return updated;
    });
  }, []);

  const setPin = useCallback((newPin: string) => {
    setPinState(newPin);
    localStorage.setItem("genovault-pin", newPin);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, pin, login, logout, updateUser, setPin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
