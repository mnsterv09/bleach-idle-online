import pg from "pg";
import { createHash } from "node:crypto";
import { DEFAULT_ZONE_ID } from "@bio/shared";
import { NameTakenError, type PlayerRecord, type PlayerStore } from "./types.js";

/** Guardamos só o hash do token de sessão, nunca o token em si. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

interface PlayerRow {
  id: string;
  name: string;
  level: number;
  xp: string;
  kan: string;
  zone_id: string;
  last_seen_at: Date;
}

function fromRow(r: PlayerRow): PlayerRecord {
  return {
    id: r.id,
    name: r.name,
    level: r.level,
    xp: Number(r.xp),
    kan: Number(r.kan),
    zoneId: r.zone_id,
    lastSeenAt: r.last_seen_at,
  };
}

export class PgStore implements PlayerStore {
  constructor(private pool: pg.Pool) {}

  static connect(url: string): PgStore {
    return new PgStore(new pg.Pool({ connectionString: url, max: 10 }));
  }

  async findByToken(token: string): Promise<PlayerRecord | null> {
    const { rows } = await this.pool.query<PlayerRow>(
      `SELECT p.id, p.name, p.level, p.xp, p.kan, p.zone_id, p.last_seen_at
         FROM players p JOIN accounts a ON a.id = p.account_id
        WHERE a.guest_token_hash = $1`,
      [hashToken(token)],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  }

  async createGuest(name: string, token: string): Promise<PlayerRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const acc = await client.query<{ id: string }>(
        "INSERT INTO accounts (guest_token_hash) VALUES ($1) RETURNING id",
        [hashToken(token)],
      );
      const { rows } = await client.query<PlayerRow>(
        `INSERT INTO players (account_id, name, zone_id)
         VALUES ($1, $2, $3)
         RETURNING id, name, level, xp, kan, zone_id, last_seen_at`,
        [acc.rows[0]!.id, name, DEFAULT_ZONE_ID],
      );
      await client.query("COMMIT");
      return fromRow(rows[0]!);
    } catch (err) {
      await client.query("ROLLBACK");
      if ((err as { code?: string }).code === "23505") throw new NameTakenError();
      throw err;
    } finally {
      client.release();
    }
  }

  async save(players: PlayerRecord[]): Promise<void> {
    if (players.length === 0) return;
    // Um único UPDATE em lote via unnest.
    await this.pool.query(
      `UPDATE players p SET
          level = v.level, xp = v.xp, kan = v.kan, zone_id = v.zone_id,
          last_seen_at = v.last_seen_at, updated_at = now()
        FROM unnest($1::uuid[], $2::int[], $3::bigint[], $4::bigint[], $5::text[], $6::timestamptz[])
          AS v(id, level, xp, kan, zone_id, last_seen_at)
       WHERE p.id = v.id`,
      [
        players.map((p) => p.id),
        players.map((p) => p.level),
        players.map((p) => p.xp),
        players.map((p) => p.kan),
        players.map((p) => p.zoneId),
        players.map((p) => p.lastSeenAt),
      ],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
