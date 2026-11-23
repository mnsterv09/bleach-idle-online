import {
  applyXp,
  attackPower,
  getZone,
  xpToNextLevel,
  type EnemyDef,
  type EnemySnapshot,
  type GameEvent,
  type PlayerSnapshot,
} from "@bio/shared";
import type { PlayerRecord } from "../db/types.js";

export interface EnemyState {
  def: EnemyDef;
  hp: number;
}

export type Rng = () => number;

export function spawnEnemy(zoneId: string, rng: Rng): EnemyState {
  const zone = getZone(zoneId);
  if (!zone || zone.enemies.length === 0) throw new Error(`Zona sem inimigos: ${zoneId}`);
  const def = zone.enemies[Math.floor(rng() * zone.enemies.length)] ?? zone.enemies[0]!;
  return { def, hp: def.maxHp };
}

/**
 * Um tick de caça automática: o Shinigami ataca o inimigo atual;
 * ao derrotá-lo recebe XP e Kan e um novo inimigo aparece.
 * Muta `player` e retorna o novo inimigo e os eventos do tick.
 */
export function huntTick(
  player: PlayerRecord,
  enemy: EnemyState,
  rng: Rng,
): { enemy: EnemyState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const damage = Math.min(enemy.hp, attackPower(player.level));
  enemy.hp -= damage;
  events.push({ kind: "hit", damage });

  if (enemy.hp > 0) return { enemy, events };

  const { def } = enemy;
  const r = applyXp(player, def.xp);
  player.level = r.level;
  player.xp = r.xp;
  player.kan += def.kan;
  events.push({ kind: "kill", enemyName: def.name, xp: def.xp, kan: def.kan });
  if (r.levelsGained > 0) events.push({ kind: "levelUp", level: r.level });

  return { enemy: spawnEnemy(player.zoneId, rng), events };
}

export function playerSnapshot(p: PlayerRecord): PlayerSnapshot {
  return {
    id: p.id,
    name: p.name,
    level: p.level,
    xp: p.xp,
    xpToNext: xpToNextLevel(p.level),
    kan: p.kan,
    zoneId: p.zoneId,
  };
}

export function enemySnapshot(e: EnemyState): EnemySnapshot {
  return { id: e.def.id, name: e.def.name, hp: e.hp, maxHp: e.def.maxHp };
}
