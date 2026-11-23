import { randomUUID } from "node:crypto";
import { DEFAULT_ZONE_ID } from "@bio/shared";
import { NameTakenError, type PlayerRecord, type PlayerStore } from "./types.js";

export class MemoryStore implements PlayerStore {
  private byToken = new Map<string, PlayerRecord>();
  private names = new Set<string>();

  async findByToken(token: string): Promise<PlayerRecord | null> {
    const p = this.byToken.get(token);
    return p ? { ...p } : null;
  }

  async createGuest(name: string, token: string): Promise<PlayerRecord> {
    const key = name.toLowerCase();
    if (this.names.has(key)) throw new NameTakenError();
    const p: PlayerRecord = {
      id: randomUUID(),
      name,
      level: 1,
      xp: 0,
      kan: 0,
      zoneId: DEFAULT_ZONE_ID,
      lastSeenAt: new Date(),
    };
    this.names.add(key);
    this.byToken.set(token, p);
    return { ...p };
  }

  async save(players: PlayerRecord[]): Promise<void> {
    for (const p of players) {
      for (const [token, stored] of this.byToken) {
        if (stored.id === p.id) this.byToken.set(token, { ...p });
      }
    }
  }

  async close(): Promise<void> {}
}
