import { randomUUID } from "node:crypto";
import {
  Note,
  type AuthClaims,
  type Note as NoteData,
  type NoteCreate,
  type NoteUpdate,
} from "@office/shared";
import type { Row, TransactionSql } from "postgres";
import { UnauthorizedError } from "../auth/verify.js";
import type { PostgresRepo } from "../db/postgres.js";
import { NotFoundError } from "../db/repo.js";
import type { NoteStore } from "./store.js";

/**
 * The Postgres note store (ARCHITECTURE.md 12.10): reads through
 * `PostgresRepo.withUser` (RLS applies) and writes through `withService` after
 * a membership check (12.4). Every statement names the workspace and the
 * author; another author's row reads as missing, the way the RLS policy (an
 * author-only select, `supabase/migrations/20261103000200_notes.sql`) sees it.
 */

function ms(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : Number(value);
}

function mapNote(row: Row): NoteData {
  return Note.parse({
    id: row["id"],
    workspaceId: row["workspace_id"],
    userId: row["user_id"],
    text: row["text"],
    color: row["color"],
    done: row["done"],
    createdAt: ms(row["created_at"]),
  });
}

export function createPostgresNoteStore(repo: PostgresRepo): NoteStore {
  return {
    async list(claims: AuthClaims): Promise<NoteData[]> {
      return repo.withUser(claims, async (tx: TransactionSql) => {
        const rows = await tx`
          SELECT * FROM notes
          WHERE workspace_id = ${claims.workspaceId} AND user_id = ${claims.userId}
          ORDER BY created_at
        `;
        return rows.map((row) => mapNote(row));
      });
    },

    async create(claims: AuthClaims, input: NoteCreate): Promise<NoteData> {
      return repo.withService(async (tx) => {
        const member = await repo.member(claims);
        if (!member) {
          throw new UnauthorizedError("not a member of this workspace");
        }
        const rows = await tx`
          INSERT INTO notes (id, workspace_id, user_id, text, color, done, created_at)
          VALUES (${randomUUID()}, ${claims.workspaceId}, ${claims.userId},
            ${input.text}, ${input.color}, FALSE, ${Date.now()})
          RETURNING *
        `;
        return mapNote(rows[0]);
      });
    },

    async update(claims: AuthClaims, id: string, input: NoteUpdate): Promise<NoteData> {
      return repo.withService(async (tx) => {
        const member = await repo.member(claims);
        if (!member) {
          throw new UnauthorizedError("not a member of this workspace");
        }
        const rows = await tx`
          SELECT * FROM notes
          WHERE workspace_id = ${claims.workspaceId} AND id = ${id}
          FOR UPDATE
        `;
        const row = rows[0];
        if (!row || String(row["user_id"]) !== claims.userId) {
          throw new NotFoundError(`unknown note ${id}`);
        }
        const current = mapNote(row);
        const text = input.text ?? current.text;
        const color = input.color ?? current.color;
        const done = input.done ?? current.done;
        const updated = await tx`
          UPDATE notes SET text = ${text}, color = ${color}, done = ${done}
          WHERE workspace_id = ${claims.workspaceId} AND id = ${id}
          RETURNING *
        `;
        return mapNote(updated[0]);
      });
    },

    async remove(claims: AuthClaims, id: string): Promise<void> {
      await repo.withService(async (tx) => {
        const member = await repo.member(claims);
        if (!member) {
          throw new UnauthorizedError("not a member of this workspace");
        }
        const rows = await tx`
          SELECT user_id FROM notes
          WHERE workspace_id = ${claims.workspaceId} AND id = ${id}
          FOR UPDATE
        `;
        const row = rows[0];
        if (!row || String(row["user_id"]) !== claims.userId) {
          throw new NotFoundError(`unknown note ${id}`);
        }
        await tx`DELETE FROM notes WHERE workspace_id = ${claims.workspaceId} AND id = ${id}`;
      });
    },
  };
}
