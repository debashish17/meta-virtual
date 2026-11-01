-- P2-C: row-level security (ARCHITECTURE.md 12.4).
--
-- Members may SELECT rows of their workspace. There are deliberately NO insert,
-- update or delete policies for `authenticated`, so the browser's anon key plus a
-- user JWT can never write; every write happens in the server after its own
-- membership check. The server's reads run as the user (`SET LOCAL ROLE
-- authenticated` plus `request.jwt.claims`), so the same policies apply to them.
--
-- Membership is read as TEXT (`request.jwt.claims ->> 'sub'`), never cast to UUID,
-- so dev-mode ids work the same way as auth UUIDs.

CREATE OR REPLACE FUNCTION public.request_user_id() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub'
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(ws_id TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE workspace_id = ws_id AND user_id = public.request_user_id()
  )
$$;

-- Profiles and memberships first: the other policies depend on them.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_member_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = profiles.id::text
        AND public.is_workspace_member(m.workspace_id)
    )
  );

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY memberships_member_select ON public.memberships
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

-- One SELECT-for-members policy per workspace table. `is_workspace_member` is
-- SECURITY DEFINER, so these never recurse into the `memberships` policy.

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspaces_member_select ON public.workspaces
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(id));

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounts_member_select ON public.accounts
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contacts_member_select ON public.contacts
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_member_select ON public.projects
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY meetings_member_select ON public.meetings
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY milestones_member_select ON public.milestones
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tasks_member_select ON public.tasks
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

ALTER TABLE public.commitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY commitments_member_select ON public.commitments
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

ALTER TABLE public.proposed_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY proposed_changes_member_select ON public.proposed_changes
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_log_member_select ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_messages_member_select ON public.chat_messages
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id));

-- Reads need the grant. Writes are refused twice: no write policies above, and
-- the write grants Supabase auto-attaches to new public tables are revoked
-- here, so the browser's keys can never write even if a policy is added later.
-- The server writes through its own connection, which is unaffected.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.workspaces FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.memberships FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.accounts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.contacts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.projects FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.meetings FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.milestones FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tasks FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.commitments FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.proposed_changes FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_log FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.chat_messages FROM anon, authenticated;

GRANT SELECT ON public.workspaces TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.memberships TO authenticated;
GRANT SELECT ON public.accounts TO authenticated;
GRANT SELECT ON public.contacts TO authenticated;
GRANT SELECT ON public.projects TO authenticated;
GRANT SELECT ON public.meetings TO authenticated;
GRANT SELECT ON public.milestones TO authenticated;
GRANT SELECT ON public.tasks TO authenticated;
GRANT SELECT ON public.commitments TO authenticated;
GRANT SELECT ON public.proposed_changes TO authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT SELECT ON public.chat_messages TO authenticated;
