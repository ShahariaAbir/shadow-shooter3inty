-- 2_rls_policies.sql
-- Setup Row Level Security for player_stats

ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_can_read_stats" ON player_stats;
CREATE POLICY "anyone_can_read_stats" ON player_stats FOR SELECT USING (true);

DROP POLICY IF EXISTS "users_insert_own_stats" ON player_stats;
CREATE POLICY "users_insert_own_stats" ON player_stats FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "users_update_own_stats" ON player_stats;
CREATE POLICY "users_update_own_stats" ON player_stats FOR UPDATE USING (true);
