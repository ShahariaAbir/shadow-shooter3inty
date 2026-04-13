import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { insforge, getOrCreatePlayerStats, updatePlayerStats, updatePlayerName, buyGrenadeBundle, consumeGrenadeOnThrow, addCoinsToPlayer, type PlayerStats } from '@/lib/insforge';
import { createFailedLoginEvent, dismissSecurityEventForUser, listSecurityEventsForUser, markSecurityEventsViewed, type LoginSecurityEvent } from '@/lib/securityAlerts';

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
  signInWithPassword: (identifier: string, password: string) => Promise<{ ok: boolean; reason?: string }>;
  securityAlerts: LoginSecurityEvent[];
  dismissSecurityAlert: (eventId: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshStats: () => Promise<void>;
  submitMatchResult: (kills: number, deaths: number, isWin: boolean, grenadesUsed?: number) => Promise<void>;
  updateName: (newName: string) => Promise<void>;
  buyGrenadePack: () => Promise<{ ok: boolean; reason?: string }>;
  consumeGrenade: () => Promise<{ ok: boolean; reason?: string }>;
  buyCoins: (amount: number) => Promise<{ ok: boolean; reason?: string }>;
  applyMatchmakingPenalty: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  stats: null,
  hasPendingMatchmakingPenalty: false,
  loading: true,
  signInWithGoogle: async () => {},
  signInWithPassword: async () => ({ ok: false, reason: 'Not ready' }),
  securityAlerts: [],
  dismissSecurityAlert: async () => {},
  signOut: async () => {},
  refreshStats: async () => {},
  submitMatchResult: async () => {},
  updateName: async () => {},
  buyGrenadePack: async () => ({ ok: false, reason: 'Not signed in' }),
  consumeGrenade: async () => ({ ok: false, reason: 'Not signed in' }),
  buyCoins: async () => ({ ok: false, reason: 'Not signed in' }),
  applyMatchmakingPenalty: () => {},
});

const MATCHMAKING_PENALTY_STORAGE_KEY = 'shadow-shooter:pending-matchmaking-penalty';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [hasPendingMatchmakingPenalty, setHasPendingMatchmakingPenalty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState<LoginSecurityEvent[]>([]);

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

  const refreshSecurityAlerts = useCallback(async (userId: string) => {
    const events = await listSecurityEventsForUser(userId);
    setSecurityAlerts(events);

    const unseenIds = events
      .filter((event) => event.status === 'new')
      .map((event) => event.id);

    if (unseenIds.length) {
      await markSecurityEventsViewed(userId, unseenIds);
      setSecurityAlerts((current) => current.map((event) => unseenIds.includes(event.id) ? { ...event, status: 'viewed' } : event));
    }
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
          await refreshSecurityAlerts(u.id);
        }
      } catch {
        // Not logged in, that's fine
      } finally {
        setLoading(false);
      }
    })();
  }, [loadStats, getPenaltyStorage, refreshSecurityAlerts]);

  const signInWithGoogle = useCallback(async () => {
    await insforge.auth.signInWithOAuth({
      provider: 'google',
      redirectTo: window.location.origin + '/',
    });
  }, []);


  const signInWithPassword = useCallback(async (identifier: string, password: string): Promise<{ ok: boolean; reason?: string }> => {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    if (!normalizedIdentifier || !password.trim()) {
      return { ok: false, reason: 'Enter your email and password.' };
    }

    const { data: maybeExistingByName } = await insforge.database
      .from('player_stats')
      .select('user_id, username')
      .eq('username', normalizedIdentifier)
      .limit(1);

    const { data: maybeExistingById } = await insforge.database
      .from('player_stats')
      .select('user_id')
      .eq('user_id', normalizedIdentifier)
      .limit(1);

    const targetUserId = (maybeExistingByName?.[0] as { user_id: string } | undefined)?.user_id
      ?? (maybeExistingById?.[0] as { user_id: string } | undefined)?.user_id
      ?? null;

    const authClient = (insforge.auth as unknown as {
      signInWithPassword?: (args: { email: string; password: string }) => Promise<{ data?: { user?: { id: string; email: string; profile?: { name?: string } } }; error?: { message?: string } }>;
    });

    if (!authClient.signInWithPassword) {
      return { ok: false, reason: 'Password sign-in is not enabled in this SDK build.' };
    }

    const { data, error } = await authClient.signInWithPassword({
      email: normalizedIdentifier,
      password,
    });

    if (error || !data?.user) {
      if (targetUserId) {
        await createFailedLoginEvent(targetUserId, normalizedIdentifier);
      }
      return { ok: false, reason: error?.message || 'Invalid credentials.' };
    }

    const signedInUser: AuthUser = {
      id: data.user.id,
      email: data.user.email,
      name: data.user.profile?.name || data.user.email.split('@')[0],
    };

    const loadedStats = await loadStats(signedInUser.id, signedInUser.name);
    const resolvedName = loadedStats?.username?.trim() || signedInUser.name;
    setUser({ ...signedInUser, name: resolvedName });
    setHasPendingMatchmakingPenalty(getPenaltyStorage(signedInUser.id));
    await refreshSecurityAlerts(signedInUser.id);

    return { ok: true };
  }, [loadStats, getPenaltyStorage, refreshSecurityAlerts]);

  const signOut = useCallback(async () => {
    await insforge.auth.signOut();
    setUser(null);
    setStats(null);
    setHasPendingMatchmakingPenalty(false);
    setSecurityAlerts([]);
  }, []);

  const refreshStats = useCallback(async () => {
    if (!user) return;
    await loadStats(user.id, user.name);
  }, [user, loadStats]);

  const submitMatchResult = useCallback(async (kills: number, deaths: number, isWin: boolean, grenadesUsed: number = 0) => {
    if (!user) return;
    try {
      await updatePlayerStats(user.id, kills, deaths, isWin, grenadesUsed);
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

  const buyGrenadePack = useCallback(async () => {
    if (!user) return { ok: false, reason: 'Sign in first.' };
    const result = await buyGrenadeBundle(user.id);
    if (result.ok) {
      await loadStats(user.id, user.name);
    }
    return result;
  }, [user, loadStats]);

  const consumeGrenade = useCallback(async () => {
    if (!user) return { ok: false, reason: 'Sign in first.' };
    const result = await consumeGrenadeOnThrow(user.id);
    if (result.ok) {
      await loadStats(user.id, user.name);
    }
    return result;
  }, [user, loadStats]);

  const buyCoins = useCallback(async (amount: number) => {
    if (!user) return { ok: false, reason: 'Sign in first.' };
    const result = await addCoinsToPlayer(user.id, amount);
    if (result.ok) {
      await loadStats(user.id, user.name);
    }
    return result;
  }, [user, loadStats]);


  const dismissSecurityAlert = useCallback(async (eventId: string) => {
    if (!user) return;
    await dismissSecurityEventForUser(user.id, eventId);
    setSecurityAlerts((current) => current.filter((event) => event.id !== eventId));
  }, [user]);

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
        signInWithPassword,
        signOut,
        refreshStats,
        submitMatchResult,
        updateName,
        buyGrenadePack,
        consumeGrenade,
        buyCoins,
        securityAlerts,
        dismissSecurityAlert,
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
