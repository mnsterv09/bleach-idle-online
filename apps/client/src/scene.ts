import { Application, Container, Graphics, Text } from "pixi.js";
import type { EnemySnapshot, GameEvent } from "@bio/shared";

/**
 * Cena de caça no estilo do gênero: mapa de tiles visto de cima, câmera que
 * segue o Shinigami, zoom e WASD para olhar em volta. Arte 100% provisória
 * (formas geométricas), gerada por código.
 *
 * O combate (dano, abates, XP) vem do servidor. Andar pelo mapa até o alvo
 * ainda é só visual no cliente; posições autoritativas entram com o mapa real.
 */

const TILE = 32;
const MAP_W = 64;
const MAP_H = 48;
const WANDERERS = 7;
const PLAYER_SPEED = 110; // px/s
const ENEMY_SPEED = 28;
const ATTACK_RANGE = 44;
const ZOOMS = [1, 1.5, 2, 2.5, 3];
const PAN_SPEED = 420; // px/s em coordenadas do mundo
const PAN_RETURN_MS = 2500;

interface Palette {
  ground: number[];
  path: number[];
  canopy: number[];
  rock: number;
}

/** Paletas provisórias por zona. */
const PALETTES: Record<string, Palette> = {
  karakura: { ground: [0x4f7a3a, 0x557f3f, 0x4a7336], path: [0x8b8f96, 0x83878e], canopy: [0x2f5d2a, 0x386b31], rock: 0x6c6f75 },
  "rukongai-inuzuri": { ground: [0x7a6a45, 0x80704a, 0x746440], path: [0x9b8256, 0x947b50], canopy: [0x4f5a2a, 0x5a6630], rock: 0x6e6252 },
  "floresta-menos": { ground: [0xcfc8b4, 0xd6cfbb, 0xc8c1ad], path: [0xb9b19a, 0xb2aa93], canopy: [0x9aa0a8, 0xa9aeb5], rock: 0x8d8f94 },
  "hueco-mundo": { ground: [0xe2dcc6, 0xe8e2cc, 0xdcd6c0], path: [0xcfc8ae, 0xc8c1a7], canopy: [0x7d8088, 0x8a8d94], rock: 0xa7a296 },
};

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** PRNG determinístico (mulberry32): o mesmo mapa para a mesma zona. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(arr: readonly T[], r: number): T => arr[Math.floor(r * arr.length) % arr.length]!;

interface Wanderer {
  view: Container;
  body: Graphics;
  label: Text;
  hp: Graphics;
  x: number;
  y: number;
  tx: number;
  ty: number;
  wait: number;
  dying: number; // 0 = vivo; >0 = animação de morte
}

interface Floater {
  text: Text;
  life: number;
}

export class HuntScene {
  private app = new Application();
  private world = new Container();
  private ground = new Graphics();
  private actors = new Container(); // ordenados por y para profundidade
  private fx = new Container();
  private player = new Container();
  private wanderers: Wanderer[] = [];
  private target: Wanderer | null = null;
  private enemy: EnemySnapshot | null = null;
  private floaters: Floater[] = [];
  private rng: () => number = Math.random;

  private px = (MAP_W * TILE) / 2;
  private py = (MAP_H * TILE) / 2;
  private facing = 1;
  private lunge = 0;

  private camX = this.px;
  private camY = this.py;
  private panX = 0;
  private panY = 0;
  private lastPan = 0;
  private zoomIndex = 1;
  private zoom = ZOOMS[1]!;
  private keys = new Set<string>();

  private zoneId = "";

  async mount(el: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: el, antialias: false, background: 0x0d0f14, preference: "webgl", roundPixels: true });
    el.prepend(this.app.canvas);

    this.actors.sortableChildren = true;
    this.world.addChild(this.ground, this.actors, this.fx);
    this.app.stage.addChild(this.world);

    this.player.addChild(drawShinigami());
    this.actors.addChild(this.player);

    // Zoom pela roda do mouse
    this.app.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoomBy(e.deltaY < 0 ? 1 : -1);
      },
      { passive: false },
    );
    // WASD / setas para olhar em volta
    window.addEventListener("keydown", (e) => {
      if (isTyping(e)) return;
      const k = normKey(e.key);
      if (k) {
        this.keys.add(k);
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      const k = normKey(e.key);
      if (k) this.keys.delete(k);
    });
    window.addEventListener("blur", () => this.keys.clear());

    this.app.ticker.add((t) => this.update(Math.min(t.deltaMS, 100)));
  }

  zoomBy(step: number): void {
    this.zoomIndex = Math.max(0, Math.min(ZOOMS.length - 1, this.zoomIndex + step));
  }

  /** Recentra a câmera no Shinigami. */
  recenter(): void {
    this.panX = 0;
    this.panY = 0;
  }

  setZone(zoneId: string): void {
    if (zoneId === this.zoneId) return;
    this.zoneId = zoneId;
    this.rng = seeded(hashString(zoneId));
    this.buildMap(PALETTES[zoneId] ?? PALETTES.karakura!);
    // reposiciona o Shinigami no centro do mapa
    this.px = (MAP_W * TILE) / 2;
    this.py = (MAP_H * TILE) / 2;
    this.camX = this.px;
    this.camY = this.py;
    this.recenter();
    this.spawnWanderers();
    this.target = null;
  }

  setEnemy(e: EnemySnapshot): void {
    this.enemy = e;
    if (!this.target || this.target.dying > 0) this.target = this.nearestWanderer();
    this.refreshTarget();
  }

  applyEvents(events: GameEvent[], enemy: EnemySnapshot): void {
    for (const ev of events) {
      if (ev.kind === "hit") {
        this.lunge = 1;
        if (this.target) this.float(`-${ev.damage}`, 0xffffff, this.target.x + 14, this.target.y - 36);
      } else if (ev.kind === "kill") {
        if (this.target) {
          this.float(`+${ev.xp} XP  +${ev.kan} Kan`, 0xffb347, this.target.x, this.target.y - 56);
          this.target.dying = 1;
          this.target.label.visible = false;
          this.target.hp.visible = false;
        }
        this.target = null;
      } else if (ev.kind === "levelUp") {
        this.float(`Nível ${ev.level}!`, 0x5ad19a, this.px, this.py - 50);
      }
    }
    this.setEnemy(enemy);
  }

  // ---------------------------------------------------------------- mapa

  private buildMap(pal: Palette): void {
    const g = this.ground.clear();
    const r = this.rng;
    // Trilhas: duas faixas sinuosas que cruzam o mapa
    const pathRow = (x: number) => Math.round(MAP_H / 2 + Math.sin(x / 7) * 5);
    const pathCol = (y: number) => Math.round(MAP_W / 2 + Math.sin(y / 6 + 1.3) * 7);
    const isPath = (x: number, y: number) => Math.abs(y - pathRow(x)) <= 1 || Math.abs(x - pathCol(y)) <= 1;

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const color = isPath(x, y) ? pick(pal.path, r()) : pick(pal.ground, r());
        g.rect(x * TILE, y * TILE, TILE, TILE).fill(color);
        // detalhes do chão (tufos/pedrinhas)
        if (!isPath(x, y) && r() < 0.18) {
          g.rect(x * TILE + 6 + r() * 18, y * TILE + 6 + r() * 18, 3, 3).fill({ color: 0x000000, alpha: 0.12 });
        }
      }
    }
    // borda escura do mapa
    g.rect(0, 0, MAP_W * TILE, MAP_H * TILE).stroke({ width: 6, color: 0x000000, alpha: 0.35 });

    // Árvores e pedras como atores (ordenados por y junto com os personagens)
    for (const c of [...this.actors.children]) if (c !== this.player) c.destroy({ children: true });
    for (let i = 0; i < 160; i++) {
      const tx = Math.floor(r() * MAP_W);
      const ty = Math.floor(r() * MAP_H);
      if (isPath(tx, ty)) continue;
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      if (Math.hypot(cx - (MAP_W * TILE) / 2, cy - (MAP_H * TILE) / 2) < TILE * 4) continue;
      const deco = r() < 0.8 ? drawTree(pal, r) : drawRock(pal);
      deco.position.set(cx, cy);
      deco.zIndex = cy;
      this.actors.addChild(deco);
    }
  }

  private spawnWanderers(): void {
    for (const w of this.wanderers) w.view.destroy({ children: true });
    this.wanderers = [];
    for (let i = 0; i < WANDERERS; i++) {
      const view = new Container();
      const body = new Graphics();
      const hp = new Graphics();
      const label = new Text({ text: "", style: { fill: 0xffffff, fontSize: 11, fontWeight: "bold", stroke: { color: 0x000000, width: 3 } } });
      label.anchor.set(0.5, 1);
      label.position.set(0, -30);
      label.resolution = 3;
      view.addChild(body, hp, label);
      const w: Wanderer = { view, body, hp, label, x: 0, y: 0, tx: 0, ty: 0, wait: 0, dying: 0 };
      this.placeWanderer(w);
      this.wanderers.push(w);
      this.actors.addChild(view);
    }
  }

  private placeWanderer(w: Wanderer): void {
    // nasce a uma distância razoável do Shinigami
    for (let tries = 0; tries < 20; tries++) {
      w.x = TILE * 3 + Math.random() * (MAP_W - 6) * TILE;
      w.y = TILE * 3 + Math.random() * (MAP_H - 6) * TILE;
      if (Math.hypot(w.x - this.px, w.y - this.py) > TILE * 5) break;
    }
    w.tx = w.x;
    w.ty = w.y;
    w.wait = Math.random() * 2;
    w.dying = 0;
    w.view.alpha = 1;
    w.view.scale.set(1);
    w.label.visible = false;
    w.hp.visible = false;
    drawHollow(w.body, 13 + Math.random() * 5);
  }

  private nearestWanderer(): Wanderer | null {
    let best: Wanderer | null = null;
    let bestD = Infinity;
    for (const w of this.wanderers) {
      if (w.dying > 0) continue;
      const d = Math.hypot(w.x - this.px, w.y - this.py);
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    return best;
  }

  private refreshTarget(): void {
    for (const w of this.wanderers) {
      if (w !== this.target) {
        w.label.visible = false;
        w.hp.visible = false;
      }
    }
    const t = this.target;
    const e = this.enemy;
    if (!t || !e) return;
    t.label.text = e.name;
    t.label.visible = true;
    t.hp.visible = true;
    const w = 36;
    const pct = Math.max(0, e.hp / e.maxHp);
    t.hp.clear();
    t.hp.rect(-w / 2, -28, w, 4).fill(0x1a1a1a);
    t.hp.rect(-w / 2, -28, w * pct, 4).fill(pct > 0.3 ? 0x5ad19a : 0xff4d5e);
  }

  // ---------------------------------------------------------------- loop

  private update(dtMs: number): void {
    const dt = dtMs / 1000;

    // Shinigami anda até o alvo e para no alcance de ataque
    const t = this.target;
    if (t) {
      const dx = t.x - this.px;
      const dy = t.y - this.py;
      const d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 2) this.facing = Math.sign(dx);
      if (d > ATTACK_RANGE) {
        const step = Math.min(d - ATTACK_RANGE, PLAYER_SPEED * dt);
        this.px += (dx / d) * step;
        this.py += (dy / d) * step;
      }
    }
    this.lunge = Math.max(0, this.lunge - dtMs / 220);
    const lungeOffset = Math.sin(this.lunge * Math.PI) * 10 * this.facing;
    this.player.position.set(Math.round(this.px + lungeOffset), Math.round(this.py));
    this.player.scale.x = this.facing;
    this.player.zIndex = this.py;

    // Hollows vagando; o alvo fica parado esperando a luta
    for (const w of this.wanderers) {
      if (w.dying > 0) {
        w.dying -= dtMs / 600;
        w.view.alpha = Math.max(0, w.dying);
        w.view.scale.set(1 + (1 - w.dying) * 0.4);
        if (w.dying <= 0) this.placeWanderer(w);
      } else if (w !== t) {
        w.wait -= dt;
        const dx = w.tx - w.x;
        const dy = w.ty - w.y;
        const d = Math.hypot(dx, dy);
        if (d > 1) {
          const step = Math.min(d, ENEMY_SPEED * dt);
          w.x += (dx / d) * step;
          w.y += (dy / d) * step;
        } else if (w.wait <= 0) {
          w.tx = clamp(w.x + (Math.random() - 0.5) * TILE * 6, TILE * 2, (MAP_W - 2) * TILE);
          w.ty = clamp(w.y + (Math.random() - 0.5) * TILE * 6, TILE * 2, (MAP_H - 2) * TILE);
          w.wait = 1 + Math.random() * 3;
        }
      }
      w.view.position.set(Math.round(w.x), Math.round(w.y + Math.sin(performance.now() / 300 + w.x) * 1.5));
      w.view.zIndex = w.y;
    }

    // Câmera: segue o Shinigami com suavização; WASD desloca; volta sozinha
    let kx = 0;
    let ky = 0;
    if (this.keys.has("left")) kx -= 1;
    if (this.keys.has("right")) kx += 1;
    if (this.keys.has("up")) ky -= 1;
    if (this.keys.has("down")) ky += 1;
    if (kx || ky) {
      this.panX += (kx * PAN_SPEED * dt) / this.zoom;
      this.panY += (ky * PAN_SPEED * dt) / this.zoom;
      this.lastPan = performance.now();
    } else if (performance.now() - this.lastPan > PAN_RETURN_MS) {
      const k = 1 - Math.exp(-dt * 3);
      this.panX -= this.panX * k;
      this.panY -= this.panY * k;
    }

    const targetZoom = ZOOMS[this.zoomIndex]!;
    this.zoom += (targetZoom - this.zoom) * (1 - Math.exp(-dt * 10));

    const follow = 1 - Math.exp(-dt * 6);
    this.camX += (this.px + this.panX - this.camX) * follow;
    this.camY += (this.py + this.panY - this.camY) * follow;

    const { width, height } = this.app.screen;
    const halfW = width / 2 / this.zoom;
    const halfH = height / 2 / this.zoom;
    const cx = clampCenter(this.camX, halfW, MAP_W * TILE);
    const cy = clampCenter(this.camY, halfH, MAP_H * TILE);
    this.world.scale.set(this.zoom);
    this.world.pivot.set(cx, cy);
    this.world.position.set(Math.round(width / 2), Math.round(height / 2));

    for (const f of this.floaters) {
      f.life -= dtMs / 900;
      f.text.y -= dtMs * 0.03;
      f.text.alpha = Math.max(0, f.life);
    }
    for (const f of this.floaters.filter((x) => x.life <= 0)) f.text.destroy();
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }

  private float(text: string, color: number, x: number, y: number): void {
    const t = new Text({ text, style: { fill: color, fontSize: 12, fontWeight: "bold", stroke: { color: 0x000000, width: 3 } } });
    t.resolution = 3;
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.fx.addChild(t);
    this.floaters.push({ text: t, life: 1 });
  }
}

// ---------------------------------------------------------------- desenhos provisórios

function drawShinigami(): Container {
  const c = new Container();
  const g = new Graphics();
  g.ellipse(0, 10, 10, 4).fill({ color: 0x000000, alpha: 0.3 }); // sombra
  g.rect(-6, -6, 12, 14).fill(0x15161a); // shihakushō preto
  g.rect(-6, 2, 12, 3).fill(0xe8e8e8); // faixa
  g.circle(0, -11, 6).fill(0xf0c8a0); // rosto
  g.rect(-6, -18, 12, 5).fill(0xff8a2a); // cabelo laranja provisório
  g.rect(6, -6, 3, 16).fill(0xd8dde8); // lâmina nas costas
  c.addChild(g);
  return c;
}

function drawHollow(g: Graphics, r: number): void {
  g.clear();
  g.ellipse(0, r * 0.7, r * 0.9, r * 0.3).fill({ color: 0x000000, alpha: 0.3 });
  g.circle(0, 0, r).fill(0x141418).stroke({ width: 1.5, color: 0x3a3d48 });
  g.circle(0, 0, r * 0.25).fill(0x0d0f14).stroke({ width: 1, color: 0x55596a }); // buraco
  g.ellipse(0, -r * 0.55, r * 0.75, r * 0.45).fill(0xf4f4f0); // máscara
  g.circle(-r * 0.28, -r * 0.6, r * 0.13).fill(0x101010);
  g.circle(r * 0.28, -r * 0.6, r * 0.13).fill(0x101010);
  g.rect(-r * 0.35, -r * 0.3, r * 0.7, r * 0.08).fill(0x101010);
}

function drawTree(pal: Palette, r: () => number): Container {
  const c = new Container();
  const g = new Graphics();
  const s = 12 + r() * 8;
  g.ellipse(0, 6, s * 0.8, s * 0.3).fill({ color: 0x000000, alpha: 0.25 });
  g.rect(-3, -4, 6, 10).fill(0x5a3b22);
  g.circle(0, -s * 0.9, s).fill(pick(pal.canopy, r()));
  g.circle(-s * 0.35, -s * 1.1, s * 0.45).fill({ color: 0xffffff, alpha: 0.08 });
  c.addChild(g);
  return c;
}

function drawRock(pal: Palette): Container {
  const c = new Container();
  const g = new Graphics();
  g.ellipse(0, 4, 10, 4).fill({ color: 0x000000, alpha: 0.25 });
  g.roundRect(-9, -8, 18, 12, 4).fill(pal.rock);
  g.rect(-5, -6, 6, 2).fill({ color: 0xffffff, alpha: 0.15 });
  c.addChild(g);
  return c;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Mantém a câmera dentro do mapa; se o mapa for menor que a tela, centraliza. */
function clampCenter(c: number, half: number, size: number): number {
  if (half * 2 >= size) return size / 2;
  return clamp(c, half, size - half);
}

function normKey(key: string): "up" | "down" | "left" | "right" | null {
  switch (key.toLowerCase()) {
    case "w":
    case "arrowup":
      return "up";
    case "s":
    case "arrowdown":
      return "down";
    case "a":
    case "arrowleft":
      return "left";
    case "d":
    case "arrowright":
      return "right";
    default:
      return null;
  }
}

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}
