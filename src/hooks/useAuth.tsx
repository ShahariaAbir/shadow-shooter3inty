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
  hasPendingMatchmakingPenalty: boolean;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshStats: () => Promise<void>;
  submitMatchResult: (kills: number, deaths: number, isWin: boolean) => Promise<void>;
  updateName: (newName: string) => Promise<void>;
  applyMatchmakingPenalty: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  stats: null,
  hasPendingMatchmakingPenalty: false,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  refreshStats: async () => {},
  submitMatchResult: async () => {},
  updateName: async () => {},
  applyMatchmakingPenalty: () => {},
});

const MATCHMAKING_PENALTY_STORAGE_KEY = 'shadow-shooter:pending-matchmaking-penalty';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [hasPendingMatchmakingPenalty, setHasPendingMatchmakingPenalty] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async (userId: string, username: string) => {
    const s = await getOrCreatePlayerStats(userId, username);
    setStats(s);
    return s;
  }, []);

  const setPenaltyStorage = useCallback((userId: string, hasPenalty: boolean) => {
    if (hasPenalty) {
      localStorage.setItem(`${MATCHMAKING_PENALTY_STORAGE_KEY}:${userId}`, '1');
    } else {
      localStorage.removeItem(`${MATCHMAKING_PENALTY_STORAGE_KEY}:${userId}`);
    }
  }, []);

  const getPenaltyStorage = useCallback((userId: string) => {
    return localStorage.getItem(`${MATCHMAKING_PENALTY_STORAGE_KEY}:${userId}`) === '1';
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
          const loadedStats = await loadStats(u.id, u.name);
          const resolvedName = loadedStats?.username?.trim() || u.name;
          setUser({ ...u, name: resolvedName });
          setHasPendingMatchmakingPenalty(getPenaltyStorage(u.id));
        }
      } catch {
        // Not logged in, that's fine
      } finally {
        setLoading(false);
      }
    })();
  }, [loadStats, getPenaltyStorage]);

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
    setHasPendingMatchmakingPenalty(false);
  }, []);

  const refreshStats = useCallback(async () => {
    if (!user) return;
    await loadStats(user.id, user.name);
  }, [user, loadStats]);

  const submitMatchResult = useCallback(async (kills: number, deaths: number, isWin: boolean) => {
    if (!user) return;
    try {
      await updatePlayerStats(user.id, kills, deaths, isWin);
      await loadStats(user.id, user.name);
    } finally {
      // Always clear queued matchmaking KD penalty after a match result is submitted.
      setPenaltyStorage(user.id, false);
      setHasPendingMatchmakingPenalty(false);
    }
  }, [user, loadStats, setPenaltyStorage]);

  const updateName = useCallback(async (newName: string) => {
    if (!user) return;
    await updatePlayerName(user.id, newName);
    setUser(prev => prev ? { ...prev, name: newName } : null);
    await loadStats(user.id, newName);
  }, [user, loadStats]);

  const applyMatchmakingPenalty = useCallback(() => {
    if (!user || !stats) return;
    const currentKD = stats.total_deaths === 0 ? stats.total_kills : stats.total_kills / stats.total_deaths;
    if (currentKD <= 0.1 || hasPendingMatchmakingPenalty) return;
    setPenaltyStorage(user.id, true);
    setHasPendingMatchmakingPenalty(true);
  }, [user, stats, hasPendingMatchmakingPenalty, setPenaltyStorage]);

  return (
    <AuthContext.Provider
      value={{
        user,
        stats,
        hasPendingMatchmakingPenalty,
        loading,
        signInWithGoogle,
        signOut,
        refreshStats,
        submitMatchResult,
        updateName,
        applyMatchmakingPenalty,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
