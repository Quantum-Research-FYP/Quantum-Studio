import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { fetchCurrentUser, loginUser, signupUser, logoutUser, type User } from '../api/auth';

export type { User } from '../api/auth';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on mount via /api/auth/me
  useEffect(() => {
    fetchCurrentUser()
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await loginUser(email, password);
    setUser(res.user);
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    const res = await signupUser(email, password);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await logoutUser();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetchCurrentUser();
      setUser(res.user);
    } catch {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
