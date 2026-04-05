import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { insforge, getOrCreatePlayerStats, updatePlayerStats, updatePlayerName, type PlayerStats } from '@/lib/insforge';

interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  stats: PlayerStats | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshStats: () => Promise<void>;
  submitMatchResult: (kills: number, deaths: number, isWin: boolean) => Promise<void>;
  updateName: (newName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  stats: null,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  refreshStats: async () => {},
  submitMatchResult: async () => {},
  updateName: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async (userId: string, username: string) => {
    const s = await getOrCreatePlayerStats(userId, username);
    setStats(s);
  }, []);

  // Check current auth state on mount
  useEffect(() => {
    (async () => {
      try {
        const { data } = await insforge.auth.getCurrentUser();
        if (data?.user) {
          const u: AuthUser = {
            id: data.user.id,
            email: data.user.email,
            name: (data.user.profile?.name as string) || data.user.email.split('@')[0],
          };
          setUser(u);
          await loadStats(u.id, u.name);
        }
      } catch {
        // Not logged in, that's fine
      } finally {
        setLoading(false);
      }
    })();
  }, [loadStats]);

  const signInWithGoogle = useCallback(async () => {
    await insforge.auth.signInWithOAuth({
      provider: 'google',
      redirectTo: window.location.origin + '/',
    });
  }, []);

  const signOut = useCallback(async () => {
    await insforge.auth.signOut();
    setUser(null);
    setStats(null);
  }, []);

  const refreshStats = useCallback(async () => {
    if (!user) return;
    await loadStats(user.id, user.name);
  }, [user, loadStats]);

  const submitMatchResult = useCallback(async (kills: number, deaths: number, isWin: boolean) => {
    if (!user) return;
    await updatePlayerStats(user.id, kills, deaths, isWin);
    await loadStats(user.id, user.name);
  }, [user, loadStats]);

  const updateName = useCallback(async (newName: string) => {
    if (!user) return;
    await updatePlayerName(user.id, newName);
    setUser(prev => prev ? { ...prev, name: newName } : null);
    await loadStats(user.id, newName);
  }, [user, loadStats]);

  return (
    <AuthContext.Provider value={{ user, stats, loading, signInWithGoogle, signOut, refreshStats, submitMatchResult, updateName }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
