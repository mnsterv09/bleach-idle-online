import { Redis } from "ioredis";

/**
 * Redis guarda o que é rápido e temporário: ranking por nível agora;
 * chat, sessões e filas de PvP depois.
 */
export class Presence {
  private constructor(private redis: Redis | null) {}

  static connect(url: string | undefined): Presence {
    if (!url) return new Presence(null);
    const redis = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
    redis.on("error", (err) => console.warn("[redis]", err.message));
    return new Presence(redis);
  }

  get enabled(): boolean {
    return this.redis !== null;
  }

  async updateRanking(players: { name: string; level: number; xp: number }[]): Promise<void> {
    if (!this.redis || players.length === 0) return;
    const args: (string | number)[] = [];
    // Pontuação composta: nível na parte inteira, XP como desempate.
    for (const p of players) args.push(p.level * 1e9 + p.xp, p.name);
    await this.redis.zadd("ranking:level", ...args);
  }

  async close(): Promise<void> {
    await this.redis?.quit();
  }
}
