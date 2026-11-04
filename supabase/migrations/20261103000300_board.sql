-- Company-board pins (ARCHITECTURE.md 12.10, P6-D): workspace-visible, drawn on the
-- cork board. Members read; writes go only through the server (no write policies,
-- write grants revoked), like every workspace table. Deleting someone else's pin is
-- refused by the server (author-only); the database cannot tell authors apart on
-- reads, so the policy stays workspace-wide.

CREATE TABLE public.board_pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  text TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX board_pins_workspace_idx ON public.board_pins (workspace_id);

ALTER TABLE public.board_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY board_pins_member_select ON public.board_pins
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.board_pins FROM anon, authenticated;
GRANT SELECT ON public.board_pins TO authenticated;
