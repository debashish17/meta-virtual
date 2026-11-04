-- Personal notes (ARCHITECTURE.md 12.10, P6-C): private to their author.
--
-- The SELECT policy is author-only (`user_id = request_user_id()`), NOT
-- workspace-wide: Arjun's reads never see Maya's rows, even in the same
-- workspace. It uses `request_user_id()` rather than `auth.uid()` because user
-- references are TEXT everywhere (dev-mode ids must work too); the semantics
-- are the same. There are no write policies for `authenticated`, so the
-- browser keys can never write: every write goes through the server after its
-- own membership check, like every workspace table.

CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  color TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL
);
CREATE INDEX notes_owner_idx ON public.notes (workspace_id, user_id);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY notes_author_select ON public.notes
  FOR SELECT TO authenticated
  USING (user_id = public.request_user_id());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.notes FROM anon, authenticated;
GRANT SELECT ON public.notes TO authenticated;
