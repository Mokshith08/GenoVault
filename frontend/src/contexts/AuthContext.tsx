import { createContext, useContext, useState, ReactNode, useEffect } from "react";

export type Role = "owner" | "researcher";
export interface MockUser { name: string; email: string; role: Role; }

interface AuthCtx {
  user: MockUser | null;
  login: (u: MockUser) => void;
  logout: () => void;
  updateUser: (partial: Partial<Pick<MockUser, "name" | "email">>) => void;
}

const AuthContext = createContext<AuthCtx | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<MockUser | null>(() => {
    const raw = localStorage.getItem("genovault-user");
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    if (user) localStorage.setItem("genovault-user", JSON.stringify(user));
    else localStorage.removeItem("genovault-user");
  }, [user]);

  const updateUser = (partial: Partial<Pick<MockUser, "name" | "email">>) => {
    setUser((prev) => prev ? { ...prev, ...partial } : prev);
  };

  return (
    <AuthContext.Provider value={{ user, login: setUser, logout: () => setUser(null), updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
