import { describe, expect, it } from "vitest";
import { huntTick, spawnEnemy } from "./hunt.js";
import type { PlayerRecord } from "../db/types.js";

const rng = () => 0; // sempre o primeiro inimigo da zona

function newPlayer(): PlayerRecord {
  return { id: "p1", name: "Teste", level: 1, xp: 0, kan: 0, zoneId: "karakura", lastSeenAt: new Date() };
}

describe("huntTick", () => {
  it("derrota um Hollow em 3 ticks no nível 1 e recebe a recompensa", () => {
    const p = newPlayer();
    let enemy = spawnEnemy(p.zoneId, rng);
    expect(enemy.def.id).toBe("hollow");
    const kinds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = huntTick(p, enemy, rng);
      enemy = r.enemy;
      kinds.push(...r.events.map((e) => e.kind));
    }
    expect(kinds.filter((k) => k === "kill")).toHaveLength(1);
    expect(p.xp).toBe(5);
    expect(p.kan).toBe(2);
    expect(enemy.hp).toBe(enemy.def.maxHp); // novo inimigo
  });

  it("emite levelUp ao passar do limite de XP", () => {
    const p = newPlayer();
    p.xp = 49; // xpToNextLevel(1) = 50
    let enemy = spawnEnemy(p.zoneId, rng);
    enemy.hp = 1;
    const r = huntTick(p, enemy, rng);
    expect(r.events.some((e) => e.kind === "levelUp")).toBe(true);
    expect(p.level).toBe(2);
  });
});
