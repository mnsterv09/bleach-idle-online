/**
 * Protocolo do WebSocket (JSON). Um único canal para caça agora; chat, mercado
 * e PvP entram como novos tipos de mensagem depois.
 */

export const PROTOCOL_VERSION = 1;

export interface PlayerSnapshot {
  id: string;
  name: string;
  level: number;
  xp: number;
  xpToNext: number;
  kan: number;
  zoneId: string;
}

export interface EnemySnapshot {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
}

export interface ZoneSummary {
  id: string;
  name: string;
  minLevel: number;
}

export type GameEvent =
  | { kind: "hit"; damage: number }
  | { kind: "kill"; enemyName: string; xp: number; kan: number }
  | { kind: "levelUp"; level: number };

// ---- cliente -> servidor ----

export type ClientMessage =
  | { t: "hello"; v: number; token?: string; name?: string }
  | { t: "setZone"; zoneId: string }
  | { t: "ping"; at: number };

// ---- servidor -> cliente ----

export type ServerMessage =
  | {
      t: "welcome";
      token: string;
      player: PlayerSnapshot;
      zones: ZoneSummary[];
      tickMs: number;
      offline?: { seconds: number; kills: number; xp: number; kan: number };
    }
  | { t: "tick"; player: PlayerSnapshot; enemy: EnemySnapshot; events: GameEvent[] }
  | { t: "zoneChanged"; player: PlayerSnapshot; enemy: EnemySnapshot }
  | { t: "online"; count: number }
  | { t: "pong"; at: number; serverTime: number }
  | { t: "error"; code: string; message: string };

export const NAME_MIN = 3;
export const NAME_MAX = 16;
const NAME_RE = /^[\p{L}\p{N}_ -]+$/u;

export function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= NAME_MIN && trimmed.length <= NAME_MAX && NAME_RE.test(trimmed);
}

/** Valida uma mensagem recebida do cliente. Nunca confie no formato sem passar por aqui. */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > 4096) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const m = data as Record<string, unknown>;
  switch (m.t) {
    case "hello": {
      if (typeof m.v !== "number") return null;
      if (m.token !== undefined && (typeof m.token !== "string" || m.token.length > 128)) return null;
      if (m.name !== undefined && typeof m.name !== "string") return null;
      return {
        t: "hello",
        v: m.v,
        ...(m.token !== undefined ? { token: m.token as string } : {}),
        ...(m.name !== undefined ? { name: m.name as string } : {}),
      };
    }
    case "setZone":
      return typeof m.zoneId === "string" && m.zoneId.length <= 64
        ? { t: "setZone", zoneId: m.zoneId }
        : null;
    case "ping":
      return typeof m.at === "number" ? { t: "ping", at: m.at } : null;
    default:
      return null;
  }
}
