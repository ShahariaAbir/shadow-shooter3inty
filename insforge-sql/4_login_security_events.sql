-- 4_login_security_events.sql
-- Tracks suspicious failed login attempts with optional camera + network metadata.

CREATE TABLE IF NOT EXISTS login_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id TEXT NOT NULL,
  attempted_identifier TEXT,
  image_data_url TEXT,
  ip_address TEXT,
  estimated_location TEXT,
  maps_link TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'viewed', 'dismissed')),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_security_events_target_user_id
  ON login_security_events (target_user_id);

CREATE INDEX IF NOT EXISTS idx_login_security_events_status
  ON login_security_events (status);

ALTER TABLE login_security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_can_insert_security_events" ON login_security_events;
CREATE POLICY "anon_can_insert_security_events"
  ON login_security_events
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "users_read_own_security_events" ON login_security_events;
CREATE POLICY "users_read_own_security_events"
  ON login_security_events
  FOR SELECT
  USING (auth.uid()::text = target_user_id);

DROP POLICY IF EXISTS "users_update_own_security_events" ON login_security_events;
CREATE POLICY "users_update_own_security_events"
  ON login_security_events
  FOR UPDATE
  USING (auth.uid()::text = target_user_id)
  WITH CHECK (auth.uid()::text = target_user_id);
