import { createClient } from '@insforge/sdk';
import { ECONOMY_CONFIG } from '@/lib/economy';

export const insforge = createClient({
  baseUrl: 'https://n73p9rv8.ap-southeast.insforge.app',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzODM0Njh9.tjc0aQ-n_zvDyXnC1r7XlvhRLFcZ275PJRcntBDppG0',
});

export type PlayerStats = {
  id: string;
  user_id: string;
  username: string;
  total_kills: number;
  total_deaths: number;
  level: number;
  xp: number;
  matches_played: number;
  wins: number;
  losses: number;
  coins: number;
  grenades_owned: number;
  total_grenade_purchases: number;
  created_at: string;
  updated_at: string;
};

/** Compute KD ratio safely */
export function computeKD(kills: number, deaths: number): string {
  if (deaths === 0) return kills > 0 ? kills.toFixed(2) : '0.00';
  return (kills / deaths).toFixed(2);
}

/** Compute level from XP (100 XP per level) */
export function computeLevel(xp: number): number {
  return Math.floor(xp / 100) + 1;
}

/** XP gained per match scales down as player level increases */
export function computeXPGain(kills: number, level: number): number {
  const baseXP = kills * 10 + 5;
  const levelPenalty = Math.max(0.3, 1 - (level - 1) * 0.05);
  return Math.max(1, Math.round(baseXP * levelPenalty));
}

/** Fetch or create player stats for authenticated user */
export async function getOrCreatePlayerStats(userId: string, username: string): Promise<PlayerStats | null> {
  // Try to fetch first
  const { data: existing, error } = await insforge.database
    .from('player_stats')
    .select('*')
    .eq('user_id', userId)
    .single<PlayerStats>();

  if (error) {
    console.error('Error fetching player stats:', error);
  }

  if (existing) return existing;

  // Create if not exists
  const newStats: Omit<PlayerStats, 'created_at' | 'updated_at'> = {
    id: userId,
    user_id: userId,
    username,
    total_kills: 0,
    total_deaths: 0,
    level: 1,
    xp: 0,
    matches_played: 0,
    wins: 0,
    losses: 0,
    coins: 0,
    grenades_owned: 0,
    total_grenade_purchases: 0,
  };

  const { data: created, error: insertError } = await insforge.database
    .from('player_stats')
    .insert([newStats])
    .select('*')
    .single<PlayerStats>();

  if (insertError) {
    console.error('Error creating player stats:', insertError);
  }

  return created ?? null;
}

/** Update player stats after a match */
export async function updatePlayerStats(userId: string, kills: number, deaths: number, isWin: boolean, grenadesUsed: number = 0): Promise<void> {
  const { data: current, error: fetchError } = await insforge.database
    .from('player_stats')
    .select('*')
    .eq('user_id', userId)
    .single<PlayerStats>();

  if (fetchError) {
    console.error('Error fetching stats before update:', fetchError);
  }

  if (!current) return;

  const newKills = current.total_kills + kills;
  const newDeaths = current.total_deaths + deaths;
  let newXP = current.xp + computeXPGain(kills, current.level);
  if (isWin) {
    newXP += computeXPGain(5, current.level); // Bonus XP for winning also scales by level
  }
  const newLevel = computeLevel(newXP);
  
  const newWins = current.wins + (isWin ? 1 : 0);
  const newLosses = current.losses + (isWin ? 0 : 1);
  const earnedCoins = Math.max(0, kills * ECONOMY_CONFIG.coinsPerKill);
  const { error: updateError } = await insforge.database
    .from('player_stats')
    .update({
      total_kills: newKills,
      total_deaths: newDeaths,
      level: newLevel,
      xp: newXP,
      matches_played: current.matches_played + 1,
      wins: newWins,
      losses: newLosses,
      coins: Math.max(0, (current.coins || 0) + earnedCoins),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    console.error('Failed to update stats in InsForge:', updateError);
  }
}

export async function buyGrenadeBundle(userId: string): Promise<{ ok: boolean; reason?: string }> {
  const { data: current, error: fetchError } = await insforge.database
    .from('player_stats')
    .select('*')
    .eq('user_id', userId)
    .single<PlayerStats>();

  if (fetchError || !current) {
    return { ok: false, reason: 'Could not load your profile for purchase.' };
  }

  const price = ECONOMY_CONFIG.grenadePriceCoins;
  if ((current.coins || 0) < price) {
    return { ok: false, reason: `Not enough coins. Need ${price} coins.` };
  }

  const { error: updateError } = await insforge.database
    .from('player_stats')
    .update({
      coins: (current.coins || 0) - price,
      grenades_owned: (current.grenades_owned || 0) + ECONOMY_CONFIG.grenadeBundleSize,
      total_grenade_purchases: (current.total_grenade_purchases || 0) + ECONOMY_CONFIG.grenadeBundleSize,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    return { ok: false, reason: 'Purchase failed. Please try again.' };
  }
  return { ok: true };
}

export async function consumeGrenadeOnThrow(userId: string): Promise<{ ok: boolean; reason?: string }> {
  const { data: current, error: fetchError } = await insforge.database
    .from('player_stats')
    .select('grenades_owned')
    .eq('user_id', userId)
    .single<{ grenades_owned: number }>();

  if (fetchError || !current) {
    return { ok: false, reason: 'Could not sync grenade usage.' };
  }

  const currentCount = Math.max(0, current.grenades_owned || 0);
  if (currentCount <= 0) {
    return { ok: false, reason: 'No grenades left.' };
  }

  const { error: updateError } = await insforge.database
    .from('player_stats')
    .update({
      grenades_owned: currentCount - 1,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    return { ok: false, reason: 'Failed to update grenade inventory.' };
  }

  return { ok: true };
}

export async function addCoinsToPlayer(userId: string, amount: number): Promise<{ ok: boolean; reason?: string }> {
  const safeAmount = Math.max(0, Math.floor(amount));
  if (safeAmount <= 0) {
    return { ok: false, reason: 'Amount must be greater than zero.' };
  }

  const { data: current, error: fetchError } = await insforge.database
    .from('player_stats')
    .select('coins')
    .eq('user_id', userId)
    .single<{ coins: number }>();

  if (fetchError || !current) {
    return { ok: false, reason: 'Could not load player coins.' };
  }

  const { error: updateError } = await insforge.database
    .from('player_stats')
    .update({
      coins: (current.coins || 0) + safeAmount,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    return { ok: false, reason: 'Coin update failed.' };
  }

  return { ok: true };
}

/** Update player name */
export async function updatePlayerName(userId: string, newName: string): Promise<void> {
  const { error } = await insforge.database
    .from('player_stats')
    .update({
      username: newName,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('Failed to update player name in InsForge:', error);
  }
}
