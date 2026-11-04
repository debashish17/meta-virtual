-- Room bookings (ARCHITECTURE.md 12.10, P6-B): the bookings table, plus the agenda
-- and the booking link on meetings. Members read; writes go only through the
-- server (no write policies, write grants revoked), like every workspace table.
-- One open booking per zone is a partial unique index, so the busy check holds
-- under races (`zone_id` is never null in practice: virtual meetings are cut
-- until LiveKit exists, and the API refuses `zoneId: null`).

CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  zone_id TEXT,
  title TEXT NOT NULL,
  agenda TEXT NOT NULL DEFAULT '',
  host_id TEXT NOT NULL,
  invitee_ids TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open',
  created_at BIGINT NOT NULL,
  ended_at BIGINT,
  CONSTRAINT bookings_status CHECK (status IN ('open', 'ended'))
);
CREATE INDEX bookings_workspace_idx ON public.bookings (workspace_id);
CREATE UNIQUE INDEX bookings_one_open_per_zone
  ON public.bookings (workspace_id, zone_id) WHERE status = 'open';

ALTER TABLE public.meetings ADD COLUMN agenda TEXT;
ALTER TABLE public.meetings
  ADD COLUMN booking_id UUID REFERENCES public.bookings (id) ON DELETE SET NULL;
CREATE INDEX meetings_booking_idx ON public.meetings (booking_id);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY bookings_member_select ON public.bookings
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.bookings FROM anon, authenticated;
GRANT SELECT ON public.bookings TO authenticated;
