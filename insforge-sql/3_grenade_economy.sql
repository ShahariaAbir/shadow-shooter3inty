-- 3_grenade_economy.sql
-- Adds economy columns + helper constraints for coins and grenade inventory.

ALTER TABLE player_stats
  ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grenades_owned INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_grenade_purchases INTEGER NOT NULL DEFAULT 0;

ALTER TABLE player_stats
  DROP CONSTRAINT IF EXISTS player_stats_coins_non_negative,
  ADD CONSTRAINT player_stats_coins_non_negative CHECK (coins >= 0);

ALTER TABLE player_stats
  DROP CONSTRAINT IF EXISTS player_stats_grenades_owned_non_negative,
  ADD CONSTRAINT player_stats_grenades_owned_non_negative CHECK (grenades_owned >= 0);

ALTER TABLE player_stats
  DROP CONSTRAINT IF EXISTS player_stats_total_grenade_purchases_non_negative,
  ADD CONSTRAINT player_stats_total_grenade_purchases_non_negative CHECK (total_grenade_purchases >= 0);

