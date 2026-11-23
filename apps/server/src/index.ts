import { config } from "./config.js";
import { MemoryStore } from "./db/memoryStore.js";
import { PgStore } from "./db/pgStore.js";
import { migrate } from "./db/migrate.js";
import { Presence } from "./db/redis.js";
import type { PlayerStore } from "./db/types.js";
import { World } from "./game/world.js";
import { createServer } from "./net/server.js";

async function main(): Promise<void> {
  let store: PlayerStore;
  if (config.databaseUrl) {
    await migrate(config.databaseUrl);
    store = PgStore.connect(config.databaseUrl);
  } else {
    console.warn("DATABASE_URL ausente: usando armazenamento em memória (os dados somem ao reiniciar).");
    store = new MemoryStore();
  }
  const presence = Presence.connect(config.redisUrl);

  const world = new World({
    store,
    presence,
    tickMs: config.tickMs,
    saveEveryMs: config.saveEveryMs,
    log: (m) => console.log(`[world] ${m}`),
  });
  const app = await createServer(world, config.allowedOrigins);
  world.start();
  await app.listen({ port: config.port, host: config.host });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    app.log.info(`${signal} recebido, salvando e encerrando`);
    await app.close();
    await world.stop();
    await presence.close();
    await store.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
