import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, get, post, TOKEN_KEY } from './api';
import type { User } from './types';

interface AuthCtx {
  user: User | null; loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (body: Record<string, unknown>) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User) => void;
}
const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

const store = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(store.get()));

  const refresh = useCallback(async () => {
    if (!store.get()) { setUser(null); setLoading(false); return; }
    try { setUser((await get<User>('/auth/me')).data); } catch { store.clear(); setUser(null); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const h = () => { store.clear(); setUser(null); };
    window.addEventListener('sc:unauthorized', h);
    return () => window.removeEventListener('sc:unauthorized', h);
  }, []);

  const value = useMemo<AuthCtx>(() => ({
    user, loading, setUser, refresh,
    login: async (email, password) => {
      const r = await post<{ user: User; token: string }>('/auth/login', { email, password });
      store.set(r.token); setUser(r.user); return r.user;
    },
    register: async (body) => {
      const r = await post<{ user: User; token: string }>('/auth/register', body);
      store.set(r.token); setUser(r.user); return r.user;
    },
    logout: async () => {
      try { await api.post('/auth/logout'); } catch { /* token may already be invalid */ }
      store.clear(); setUser(null);
    },
  }), [user, loading, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
