import { describe, expect, it } from "vitest";
import { gridToIso, isoDepth, isoToGrid, isoToTile, ISO_TILE_H, ISO_TILE_W } from "./iso.js";

describe("projeção isométrica", () => {
  it("projeta os cantos do tile em losango 2:1", () => {
    expect(gridToIso(0, 0)).toEqual({ x: 0, y: 0 });
    expect(gridToIso(1, 0)).toEqual({ x: ISO_TILE_W / 2, y: ISO_TILE_H / 2 });
    expect(gridToIso(0, 1)).toEqual({ x: -ISO_TILE_W / 2, y: ISO_TILE_H / 2 });
    expect(gridToIso(1, 1)).toEqual({ x: 0, y: ISO_TILE_H });
  });

  it("ida e volta preserva a posição", () => {
    for (const [gx, gy] of [[3.25, 7.5], [0, 0], [40, 12.75]] as const) {
      const s = gridToIso(gx, gy);
      const g = isoToGrid(s.x, s.y);
      expect(g.x).toBeCloseTo(gx);
      expect(g.y).toBeCloseTo(gy);
    }
  });

  it("acha o tile sob o ponto (centro e perto das bordas do losango)", () => {
    const center = gridToIso(5.5, 9.5);
    expect(isoToTile(center.x, center.y)).toEqual({ x: 5, y: 9 });
    const nearTop = gridToIso(5.02, 9.02);
    expect(isoToTile(nearTop.x, nearTop.y)).toEqual({ x: 5, y: 9 });
    const justLeft = gridToIso(4.98, 9.5); // atravessou a aresta para o tile vizinho
    expect(isoToTile(justLeft.x, justLeft.y)).toEqual({ x: 4, y: 9 });
  });

  it("ordena a profundidade pela diagonal", () => {
    expect(isoDepth(2, 3)).toBeGreaterThan(isoDepth(3, 1));
    expect(isoDepth(3, 2)).toBeGreaterThan(isoDepth(2, 3));
  });
});
