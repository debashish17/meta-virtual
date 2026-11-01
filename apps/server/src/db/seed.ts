import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import {
  DEMO_ACCOUNT,
  DEMO_COMMITMENT,
  DEMO_CONTACT,
  DEMO_MILESTONE,
  DEMO_PEOPLE,
  DEMO_PROJECT,
  DEMO_TASKS,
  WORKSPACE_ID,
  type DemoPersonKey,
} from "@office/shared";
import postgres from "postgres";
import { localSupabase } from "./local.js";

/**
 * The demo seed (ARCHITECTURE.md 12.4): Maya and Arjun through the Auth Admin
 * API, then profiles, memberships and the Acme records from the shared demo
 * data with the ids it got back. Idempotent (find-or-create users, upsert
 * rows), so `pnpm db:seed` is safe to re-run and P4-A can reuse it for hosted.
 *
 * People are identified by `key` in the shared demo data; records keep stable
 * UUIDs. Owner ids stored here are the auth UUIDs as strings.
 */

/** Local-only test password. Never a real one; override with `SEED_PASSWORD`. */
export const SEED_PASSWORD_FALLBACK = "northwind-local-dev-only";

export const SEED_EMAILS: Record<DemoPersonKey, string> = {
  maya: "maya@northwind.local",
  arjun: "arjun@northwind.local",
};

export interface SeedConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  databaseUrl: string;
  password: string;
  log?: (message: string) => void;
}

export interface SeedResult {
  userIds: Record<DemoPersonKey, string>;
}

async function findUserByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<User | null> {
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) {
      throw new Error(`seed: listUsers failed: ${error.message}`);
    }
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) {
      return found;
    }
    if (data.users.length < 100) {
      return null;
    }
    page += 1;
  }
}

async function ensureUser(
  admin: SupabaseClient,
  key: DemoPersonKey,
  name: string,
  password: string,
): Promise<string> {
  const email = SEED_EMAILS[key];
  const existing = await findUserByEmail(admin, email);
  if (existing) {
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error || !data.user) {
    throw new Error(`seed: createUser ${email} failed: ${error?.message ?? "no user"}`);
  }
  return data.user.id;
}

export async function runSeed(config: SeedConfig): Promise<SeedResult> {
  const log = config.log ?? ((): void => {});
  const admin = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userIds = {} as Record<DemoPersonKey, string>;
  for (const person of DEMO_PEOPLE) {
    userIds[person.key] = await ensureUser(admin, person.key, person.name, config.password);
    log(`seed: user ${person.name} <${SEED_EMAILS[person.key]}>`);
  }

  const sql = postgres(config.databaseUrl);
  try {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO workspaces (id, name) VALUES (${WORKSPACE_ID}, 'Northwind Software')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
      `;
      for (const person of DEMO_PEOPLE) {
        await tx`
          INSERT INTO profiles (id, name) VALUES (${userIds[person.key]}, ${person.name})
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
        `;
        await tx`
          INSERT INTO memberships (workspace_id, user_id, role)
          VALUES (${WORKSPACE_ID}, ${userIds[person.key]}, 'member')
          ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role
        `;
      }
      const owner = (key: string): string => {
        const id = userIds[key as DemoPersonKey];
        if (!id) {
          throw new Error(`seed: unknown demo owner key ${JSON.stringify(key)}`);
        }
        return id;
      };
      await tx`
        INSERT INTO accounts (id, workspace_id, name, deal_stage, owner_id)
        VALUES (${DEMO_ACCOUNT.id}, ${WORKSPACE_ID}, ${DEMO_ACCOUNT.name},
          ${DEMO_ACCOUNT.dealStage}, ${owner(DEMO_ACCOUNT.ownerId)})
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name,
          deal_stage = EXCLUDED.deal_stage, owner_id = EXCLUDED.owner_id
      `;
      await tx`
        INSERT INTO contacts (id, workspace_id, account_id, name, role)
        VALUES (${DEMO_CONTACT.id}, ${WORKSPACE_ID}, ${DEMO_CONTACT.accountId},
          ${DEMO_CONTACT.name}, ${DEMO_CONTACT.role})
        ON CONFLICT (id) DO UPDATE SET account_id = EXCLUDED.account_id,
          name = EXCLUDED.name, role = EXCLUDED.role
      `;
      await tx`
        INSERT INTO projects (id, workspace_id, account_id, name, owner_id)
        VALUES (${DEMO_PROJECT.id}, ${WORKSPACE_ID}, ${DEMO_PROJECT.accountId},
          ${DEMO_PROJECT.name}, ${owner(DEMO_PROJECT.ownerId)})
        ON CONFLICT (id) DO UPDATE SET account_id = EXCLUDED.account_id,
          name = EXCLUDED.name, owner_id = EXCLUDED.owner_id
      `;
      await tx`
        INSERT INTO milestones (id, workspace_id, project_id, name, target_date, status,
          source_meeting_id)
        VALUES (${DEMO_MILESTONE.id}, ${WORKSPACE_ID}, ${DEMO_MILESTONE.projectId},
          ${DEMO_MILESTONE.name}, ${DEMO_MILESTONE.targetDate}, ${DEMO_MILESTONE.status}, NULL)
        ON CONFLICT (id) DO UPDATE SET project_id = EXCLUDED.project_id,
          name = EXCLUDED.name, target_date = EXCLUDED.target_date, status = EXCLUDED.status,
          source_meeting_id = EXCLUDED.source_meeting_id
      `;
      for (const task of DEMO_TASKS) {
        await tx`
          INSERT INTO tasks (id, workspace_id, project_id, account_id, title, owner_id,
            due_date, status, blocked_reason, source_meeting_id)
          VALUES (${task.id}, ${WORKSPACE_ID}, ${task.projectId}, ${task.accountId},
            ${task.title}, ${task.ownerId === null ? null : owner(task.ownerId)},
            ${task.dueDate}, ${task.status}, ${task.blockedReason}, NULL)
          ON CONFLICT (id) DO UPDATE SET project_id = EXCLUDED.project_id,
            account_id = EXCLUDED.account_id, title = EXCLUDED.title,
            owner_id = EXCLUDED.owner_id, due_date = EXCLUDED.due_date,
            status = EXCLUDED.status, blocked_reason = EXCLUDED.blocked_reason,
            source_meeting_id = EXCLUDED.source_meeting_id
        `;
      }
      await tx`
        INSERT INTO commitments (id, workspace_id, account_id, text, due_date,
          linked_task_id, linked_milestone_id, source_meeting_id)
        VALUES (${DEMO_COMMITMENT.id}, ${WORKSPACE_ID}, ${DEMO_COMMITMENT.accountId},
          ${DEMO_COMMITMENT.text}, ${DEMO_COMMITMENT.dueDate},
          ${DEMO_COMMITMENT.linkedTaskId}, ${DEMO_COMMITMENT.linkedMilestoneId}, NULL)
        ON CONFLICT (id) DO UPDATE SET account_id = EXCLUDED.account_id,
          text = EXCLUDED.text, due_date = EXCLUDED.due_date,
          linked_task_id = EXCLUDED.linked_task_id,
          linked_milestone_id = EXCLUDED.linked_milestone_id,
          source_meeting_id = EXCLUDED.source_meeting_id
      `;
    });
  } finally {
    await sql.end();
  }
  log(`seed: workspace ${WORKSPACE_ID} (Acme records upserted)`);
  return { userIds };
}

function invokedAsMain(): boolean {
  const script = process.argv[1] ?? "";
  return script.endsWith("seed.ts") || script.endsWith("seed.js");
}

if (invokedAsMain()) {
  const env = localSupabase();
  runSeed({
    supabaseUrl: env.supabaseUrl,
    serviceRoleKey: env.serviceRoleKey,
    databaseUrl: env.databaseUrl,
    password: process.env["SEED_PASSWORD"] ?? SEED_PASSWORD_FALLBACK,
    log: (message) => console.log(`[db:seed] ${message}`),
  }).then(
    () => process.exit(0),
    (error: unknown) => {
      console.error(`[db:seed] ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    },
  );
}
