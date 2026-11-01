-- P2-C: office core tables (ARCHITECTURE.md section 6).
--
-- Conventions:
-- * Every workspace row carries `workspace_id` (TEXT: the workspace key, e.g.
--   `northwind-demo` from `@office/shared`, not a UUID).
-- * User references (`owner_id`, `user_id`, `decided_by`, `actor_id`) are TEXT: opaque
--   strings, demo keys (`maya`) in fixtures and auth UUIDs in the database
--   (packages/shared/src/api). TEXT avoids UUID-cast failures for dev-mode ids.
-- * Dates stay TEXT (`YYYY-MM-DD`) so rows map 1:1 onto the shared Zod schemas.
-- * Timestamps the contract counts in ms (`started_at`, `ts`) are BIGINT.
-- * `memberships.user_id` has no FK to `profiles`: tests use throwaway ids without
--   auth rows, and membership checks must work for dev-mode ids too.

CREATE TYPE milestone_status AS ENUM ('upcoming', 'done');
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'blocked', 'done');
CREATE TYPE change_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE change_type AS ENUM (
  'milestone_date',
  'commitment_update',
  'commitment_create',
  'task_create',
  'task_update',
  'task_reassign'
);

CREATE TABLE public.workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  name TEXT NOT NULL
);

CREATE TABLE public.memberships (
  workspace_id TEXT NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX memberships_user_idx ON public.memberships (user_id);

CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  deal_stage TEXT NOT NULL,
  owner_id TEXT NOT NULL
);
CREATE INDEX accounts_workspace_idx ON public.accounts (workspace_id);

CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL
);
CREATE INDEX contacts_workspace_idx ON public.contacts (workspace_id);
CREATE INDEX contacts_account_idx ON public.contacts (account_id);

CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL
);
CREATE INDEX projects_workspace_idx ON public.projects (workspace_id);
CREATE INDEX projects_account_idx ON public.projects (account_id);

CREATE TABLE public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  zone_id TEXT NOT NULL,
  started_at BIGINT NOT NULL,
  transcript TEXT NOT NULL,
  summary TEXT NOT NULL,
  decisions JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX meetings_workspace_idx ON public.meetings (workspace_id);

CREATE TABLE public.milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_date TEXT NOT NULL,
  status milestone_status NOT NULL,
  source_meeting_id UUID REFERENCES public.meetings (id) ON DELETE SET NULL
);
CREATE INDEX milestones_workspace_idx ON public.milestones (workspace_id);
CREATE INDEX milestones_project_idx ON public.milestones (project_id);

CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects (id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  owner_id TEXT,
  due_date TEXT,
  status task_status NOT NULL,
  blocked_reason TEXT,
  source_meeting_id UUID REFERENCES public.meetings (id) ON DELETE SET NULL,
  CONSTRAINT tasks_exactly_one_parent CHECK (
    (project_id IS NULL) <> (account_id IS NULL)
  )
);
CREATE INDEX tasks_workspace_idx ON public.tasks (workspace_id);
CREATE INDEX tasks_project_idx ON public.tasks (project_id);
CREATE INDEX tasks_account_idx ON public.tasks (account_id);
CREATE INDEX tasks_owner_idx ON public.tasks (owner_id);

CREATE TABLE public.commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts (id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  due_date TEXT,
  linked_task_id UUID REFERENCES public.tasks (id) ON DELETE SET NULL,
  linked_milestone_id UUID REFERENCES public.milestones (id) ON DELETE SET NULL,
  source_meeting_id UUID REFERENCES public.meetings (id) ON DELETE SET NULL
);
CREATE INDEX commitments_workspace_idx ON public.commitments (workspace_id);
CREATE INDEX commitments_account_idx ON public.commitments (account_id);

CREATE TABLE public.proposed_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES public.meetings (id) ON DELETE CASCADE,
  type change_type NOT NULL,
  target_table TEXT NOT NULL,
  target_id UUID,
  before JSONB,
  after JSONB NOT NULL,
  status change_status NOT NULL DEFAULT 'pending',
  needs_review BOOLEAN NOT NULL DEFAULT false,
  decided_by TEXT,
  decided_at TIMESTAMPTZ
);
CREATE INDEX proposed_changes_workspace_idx ON public.proposed_changes (workspace_id);
CREATE INDEX proposed_changes_status_idx ON public.proposed_changes (workspace_id, status);
CREATE INDEX proposed_changes_meeting_idx ON public.proposed_changes (meeting_id);

CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  before JSONB,
  after JSONB NOT NULL,
  ts BIGINT NOT NULL
);
CREATE INDEX audit_log_workspace_idx ON public.audit_log (workspace_id);

CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  ts BIGINT NOT NULL
);
CREATE INDEX chat_messages_workspace_idx ON public.chat_messages (workspace_id);
