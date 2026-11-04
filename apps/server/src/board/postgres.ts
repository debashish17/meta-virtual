import { randomUUID } from "node:crypto";
import {
  BoardPin,
  type AuthClaims,
  type BoardPin as BoardPinData,
  type BoardPinCreate,
} from "@office/shared";
import type { Row } from "postgres";
import { UnauthorizedError } from "../auth/verify.js";
import type { PostgresRepo } from "../db/postgres.js";
import { NotFoundError } from "../db/repo.js";
import { BoardForbiddenError, type BoardStore } from "./store.js";

/**
 * The Postgres board store (ARCHITECTURE.md 12.10): reads through
 * `PostgresRepo.withUser` (RLS applies) and writes through `withService` after
 * a membership check (12.4). Every statement names the workspace; only the
 * author deletes, the way the RLS policy (a workspace-wide select,
 * `supabase/migrations/20261103000300_board.sql`) and the server rule divide it.
 */

function ms(value: unknown): number {
  return typeof value === "bigint" ? Number(value) : Number(value);
}

function mapPin(row: Row): BoardPinData {
  return BoardPin.parse({
    id: row["id"],
    workspaceId: row["workspace_id"],
    authorId: row["author_id"],
    authorName: row["author_name"],
    text: row["text"],
    color: row["color"],
    createdAt: ms(row["created_at"]),
  });
}

export function createPostgresBoardStore(repo: PostgresRepo): BoardStore {
  return {
    async list(claims: AuthClaims): Promise<BoardPinData[]> {
      return repo.withUser(claims, async (tx) => {
        const rows = await tx`
          SELECT * FROM board_pins
          WHERE workspace_id = ${claims.workspaceId}
          ORDER BY created_at
        `;
        return rows.map((row) => mapPin(row));
      });
    },

    async create(claims: AuthClaims, input: BoardPinCreate): Promise<BoardPinData> {
      return repo.withService(async (tx) => {
        const member = await repo.member(claims);
        if (!member) {
          throw new UnauthorizedError("not a member of this workspace");
        }
        const rows = await tx`
          INSERT INTO board_pins (id, workspace_id, author_id, author_name, text, color, created_at)
          VALUES (${randomUUID()}, ${claims.workspaceId}, ${claims.userId}, ${claims.name},
            ${input.text}, ${input.color}, ${Date.now()})
          RETURNING *
        `;
        return mapPin(rows[0]);
      });
    },

    async remove(claims: AuthClaims, id: string): Promise<void> {
      await repo.withService(async (tx) => {
        const member = await repo.member(claims);
        if (!member) {
          throw new UnauthorizedError("not a member of this workspace");
        }
        const rows = await tx`
          SELECT * FROM board_pins
          WHERE workspace_id = ${claims.workspaceId} AND id = ${id}
          FOR UPDATE
        `;
        const row = rows[0];
        if (!row) {
          throw new NotFoundError(`unknown pin ${id}`);
        }
        if (String(row["author_id"]) !== claims.userId) {
          throw new BoardForbiddenError(`only ${String(row["author_name"])} can remove this pin`);
        }
        await tx`DELETE FROM board_pins WHERE workspace_id = ${claims.workspaceId} AND id = ${id}`;
      });
    },
  };
}
