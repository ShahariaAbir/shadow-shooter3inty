export const ECONOMY_CONFIG = {
  coinsPerKill: 1,
  grenadePriceCoins: 5,
  grenadeBundleSize: 1,
} as const;

export const BOT_GRENADE_CONFIG = {
  throwCooldownMs: 6200,
  throwChancePerCheck: 0.08,
  throwCheckIntervalMs: 1500,
  maxThrowDistance: 380,
} as const;
