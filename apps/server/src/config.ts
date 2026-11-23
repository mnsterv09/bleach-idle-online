function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Variável ${name} inválida: ${raw}`);
  return n;
}

export const config = {
  port: num("PORT", 3001),
  host: process.env.HOST ?? "0.0.0.0",
  tickMs: num("TICK_MS", 1000),
  /** Intervalo de gravação dos jogadores com mudanças pendentes. */
  saveEveryMs: num("SAVE_EVERY_MS", 10_000),
  databaseUrl: process.env.DATABASE_URL || undefined,
  redisUrl: process.env.REDIS_URL || undefined,
  /** Origens aceitas no WebSocket (separadas por vírgula). Vazio = qualquer uma (só em dev). */
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
} as const;
