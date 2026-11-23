/**
 * Executor de migrações simples: aplica os arquivos de migrations/*.sql em ordem,
 * cada um em uma transação, e registra em schema_migrations.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations/", import.meta.url));

export async function migrate(databaseUrl: string, log: (msg: string) => void = console.log): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const done = new Set(
      (await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name),
    );
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        log(`migração aplicada: ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`falha na migração ${file}: ${(err as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
}

// Execução direta: npm run db:migrate
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Defina DATABASE_URL para migrar.");
    process.exit(1);
  }
  migrate(url).then(
    () => console.log("migrações em dia"),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
