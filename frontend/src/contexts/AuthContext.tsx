import { createContext, useContext, useState, ReactNode, useEffect } from "react";

export type Role = "owner" | "researcher";
export interface MockUser { name: string; email: string; role: Role; }

interface AuthCtx {
  user: MockUser | null;
  token: string | null;
  pin: string | null;
  login: (u: MockUser, token: string) => void;
  logout: () => void;
  updateUser: (partial: Partial<Pick<MockUser, "name" | "email">>) => void;
  setPin: (pin: string) => void;
}

const AuthContext = createContext<AuthCtx | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<MockUser | null>(() => {
    const raw = localStorage.getItem("genovault-user");
    return raw ? JSON.parse(raw) : null;
  });

  // Token lives in React state (memory). localStorage is only used as a
  // persistence fallback so a page refresh doesn't force re-login.
  // It is NOT read directly by components — they use useAuth().token instead.
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem("genovault-token");
  });

  const [pin, setPinState] = useState<string | null>(() => {
    return localStorage.getItem("genovault-pin");
  });

  useEffect(() => {
    if (user) localStorage.setItem("genovault-user", JSON.stringify(user));
    else       localStorage.removeItem("genovault-user");
  }, [user]);

  useEffect(() => {
    if (token) localStorage.setItem("genovault-token", token);
    else       localStorage.removeItem("genovault-token");
  }, [token]);

  const login = (u: MockUser, jwt: string) => {
    setUser(u);
    setToken(jwt);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("genovault-token");
    // PIN intentionally kept across sessions
  };

  const updateUser = (partial: Partial<Pick<MockUser, "name" | "email">>) => {
    setUser(prev => prev ? { ...prev, ...partial } : prev);
  };

  const setPin = (newPin: string) => {
    setPinState(newPin);
    localStorage.setItem("genovault-pin", newPin);
  };

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
