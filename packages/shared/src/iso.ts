/**
 * Projeção isométrica 2:1 (losango com largura = 2 × altura).
 * O mundo lógico continua em uma grade quadrada (tiles inteiros, x para a
 * direita e y para baixo na grade); só o desenho é projetado.
 */

export const ISO_TILE_W = 64;
export const ISO_TILE_H = 32;

export interface Point {
  x: number;
  y: number;
}

/** Grade (em tiles, pode ser fracionário) → tela isométrica (pixels). */
export function gridToIso(gx: number, gy: number): Point {
  return {
    x: (gx - gy) * (ISO_TILE_W / 2),
    y: (gx + gy) * (ISO_TILE_H / 2),
  };
}

/** Tela isométrica (pixels, já no espaço do mundo) → grade (tiles fracionários). */
export function isoToGrid(sx: number, sy: number): Point {
  const a = sx / (ISO_TILE_W / 2);
  const b = sy / (ISO_TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Tile inteiro sob um ponto da tela isométrica (para clique e hover). */
export function isoToTile(sx: number, sy: number): Point {
  const g = isoToGrid(sx, sy);
  return { x: Math.floor(g.x), y: Math.floor(g.y) };
}

/**
 * Chave de profundidade: quem está "mais à frente" (maior gx + gy) é desenhado
 * por cima. Desempate por gx para objetos na mesma diagonal.
 */
export function isoDepth(gx: number, gy: number): number {
  return (gx + gy) * 1000 + gx;
}
