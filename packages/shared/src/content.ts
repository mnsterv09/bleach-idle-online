/**
 * Conteúdo estático do jogo (zonas de caça e inimigos).
 * Valores de balanceamento são provisórios.
 */

export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  /** XP concedido ao derrotar */
  xp: number;
  /** Kan (moeda comum) concedido ao derrotar */
  kan: number;
}

export interface ZoneDef {
  id: string;
  name: string;
  /** Nível mínimo do Shinigami para entrar */
  minLevel: number;
  enemies: EnemyDef[];
}

export const ZONES: readonly ZoneDef[] = [
  {
    id: "karakura",
    name: "Karakura Town",
    minLevel: 1,
    enemies: [
      { id: "hollow", name: "Hollow", maxHp: 30, xp: 5, kan: 2 },
      { id: "hollow-lagarto", name: "Hollow Lagarto", maxHp: 45, xp: 8, kan: 3 },
    ],
  },
  {
    id: "rukongai-inuzuri",
    name: "Rukongai: Distrito 78 (Inuzuri)",
    minLevel: 10,
    enemies: [
      { id: "hollow-alado", name: "Hollow Alado", maxHp: 160, xp: 30, kan: 10 },
      { id: "hollow-gigante", name: "Hollow Gigante", maxHp: 240, xp: 45, kan: 15 },
    ],
  },
  {
    id: "floresta-menos",
    name: "Floresta de Menos",
    minLevel: 30,
    enemies: [
      { id: "gillian", name: "Menos Grande (Gillian)", maxHp: 900, xp: 160, kan: 50 },
    ],
  },
  {
    id: "hueco-mundo",
    name: "Hueco Mundo: Deserto",
    minLevel: 60,
    enemies: [
      { id: "adjuchas", name: "Adjuchas", maxHp: 3200, xp: 600, kan: 180 },
    ],
  },
];

export const DEFAULT_ZONE_ID = "karakura";

export function getZone(id: string): ZoneDef | undefined {
  return ZONES.find((z) => z.id === id);
}
