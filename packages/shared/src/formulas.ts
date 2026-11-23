/**
 * Fórmulas puras de progressão. O servidor é a autoridade e usa estas funções;
 * o cliente pode usá-las só para exibir estimativas.
 */

export const MAX_LEVEL = 200;

/** Fração da taxa online concedida no treino offline (Meditação). */
export const OFFLINE_RATE = 0.25;
/** Teto de horas de ganho offline (conta grátis). */
export const OFFLINE_CAP_HOURS = 8;
/** Abaixo disto não há resumo de ganhos offline. */
export const OFFLINE_MIN_SECONDS = 60;

export function xpToNextLevel(level: number): number {
  return Math.floor(50 * Math.pow(level, 1.5));
}

/** Dano por tick do Shinigami ativo. */
export function attackPower(level: number): number {
  return 10 + level * 3;
}

export interface Progress {
  level: number;
  xp: number;
}

/** Soma XP e resolve subidas de nível. Retorna o novo progresso e quantos níveis subiu. */
export function applyXp(p: Progress, gained: number): Progress & { levelsGained: number } {
  let { level, xp } = p;
  xp += gained;
  let levelsGained = 0;
  while (level < MAX_LEVEL && xp >= xpToNextLevel(level)) {
    xp -= xpToNextLevel(level);
    level += 1;
    levelsGained += 1;
  }
  if (level >= MAX_LEVEL) xp = 0;
  return { level, xp, levelsGained };
}

/** Ticks necessários para derrotar um inimigo com o ataque dado. */
export function ticksToKill(enemyHp: number, attack: number): number {
  return Math.max(1, Math.ceil(enemyHp / Math.max(1, attack)));
}

export interface OfflineEnemy {
  maxHp: number;
  xp: number;
  kan: number;
}

export interface OfflineResult {
  seconds: number;
  kills: number;
  xp: number;
  kan: number;
}

/**
 * Ganho offline calculado no login a partir do tempo ausente.
 * Usa a média dos inimigos da zona e o nível no momento da saída
 * (simplificação deliberada: barato e impossível de burlar pelo relógio do cliente).
 */
export function computeOfflineGains(
  secondsAway: number,
  tickMs: number,
  level: number,
  enemies: readonly OfflineEnemy[],
  opts: { rate?: number; capHours?: number } = {},
): OfflineResult {
  const rate = opts.rate ?? OFFLINE_RATE;
  const capHours = opts.capHours ?? OFFLINE_CAP_HOURS;
  const seconds = Math.max(0, Math.min(secondsAway, capHours * 3600));
  if (seconds < OFFLINE_MIN_SECONDS || enemies.length === 0) {
    return { seconds: 0, kills: 0, xp: 0, kan: 0 };
  }
  const n = enemies.length;
  const avgHp = enemies.reduce((s, e) => s + e.maxHp, 0) / n;
  const avgXp = enemies.reduce((s, e) => s + e.xp, 0) / n;
  const avgKan = enemies.reduce((s, e) => s + e.kan, 0) / n;
  const ticks = Math.floor((seconds * 1000) / tickMs);
  const kills = Math.floor((ticks / ticksToKill(avgHp, attackPower(level))) * rate);
  return {
    seconds,
    kills,
    xp: Math.floor(kills * avgXp),
    kan: Math.floor(kills * avgKan),
  };
}
