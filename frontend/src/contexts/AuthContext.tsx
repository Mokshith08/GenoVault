import { createContext, useContext, useState, ReactNode, useEffect } from "react";

export type Role = "owner" | "researcher";
export interface MockUser { name: string; email: string; role: Role; }

interface AuthCtx {
  user: MockUser | null;
  pin: string | null;          // 6-digit security PIN set during registration
  login: (u: MockUser) => void;
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

  const [pin, setPinState] = useState<string | null>(() => {
    return localStorage.getItem("genovault-pin");
  });

  useEffect(() => {
    if (user) localStorage.setItem("genovault-user", JSON.stringify(user));
    else localStorage.removeItem("genovault-user");
  }, [user]);

  const setPin = (newPin: string) => {
    setPinState(newPin);
    localStorage.setItem("genovault-pin", newPin);
  };

  const logout = () => {
    setUser(null);
    // NOTE: PIN is intentionally kept across sessions so the user
    // doesn't need to re-create it on every login.
  };

  const updateUser = (partial: Partial<Pick<MockUser, "name" | "email">>) => {
    setUser(prev => prev ? { ...prev, ...partial } : prev);
  };

  return (
    <AuthContext.Provider value={{ user, pin, login: setUser, logout, updateUser, setPin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
