import { Application, Container, Graphics, Text } from "pixi.js";
import type { EnemySnapshot, GameEvent } from "@bio/shared";

/** Cor de fundo provisória por zona. Arte própria entra depois. */
const ZONE_COLORS: Record<string, number> = {
  karakura: 0x1d2a3a,
  "rukongai-inuzuri": 0x2e2618,
  "floresta-menos": 0x16241b,
  "hueco-mundo": 0x2b2b30,
};

interface Floater {
  text: Text;
  life: number;
}

/**
 * Cena da caça em PixiJS, só com formas geométricas (placeholders).
 * O cliente não decide nada: apenas anima o que o servidor manda.
 */
export class HuntScene {
  private app = new Application();
  private bg = new Graphics();
  private player = new Container();
  private enemy = new Container();
  private enemyBody = new Graphics();
  private hpBar = new Graphics();
  private enemyName = new Text({ text: "", style: { fill: 0xe8eaf0, fontSize: 14 } });
  private zoneName = new Text({ text: "", style: { fill: 0x8b93a7, fontSize: 13 } });
  private floaters: Floater[] = [];
  private lunge = 0;
  private enemyFlash = 0;
  private zoneId = "karakura";

  async mount(el: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: el, antialias: true, background: 0x0d0f14, preference: "webgl" });
    el.appendChild(this.app.canvas);

    // Shinigami: círculo + "lâmina"
    const body = new Graphics().circle(0, 0, 22).fill(0x111318).stroke({ width: 3, color: 0xff7a1a });
    const blade = new Graphics().rect(18, -3, 46, 6).fill(0xd8dde8);
    this.player.addChild(body, blade);

    this.enemy.addChild(this.enemyBody, this.hpBar, this.enemyName);
    this.enemyName.anchor.set(0.5, 1);
    this.enemyName.position.set(0, -52);

    this.app.stage.addChild(this.bg, this.zoneName, this.player, this.enemy);
    this.zoneName.position.set(12, 10);

    this.app.ticker.add((t) => this.update(t.deltaMS));
  }

  setZone(zoneId: string, zoneName: string): void {
    this.zoneId = zoneId;
    this.zoneName.text = zoneName;
  }

  setEnemy(e: EnemySnapshot): void {
    this.enemyName.text = e.name;
    const r = 26 + Math.min(30, Math.log10(e.maxHp) * 6);
    this.enemyBody.clear();
    // Máscara branca sobre corpo escuro, ainda sem arte.
    this.enemyBody.circle(0, 0, r).fill(0x050608).stroke({ width: 2, color: 0x444b5c });
    this.enemyBody.ellipse(0, -r * 0.25, r * 0.7, r * 0.45).fill(0xf2f2f2);
    this.enemyBody.circle(-r * 0.28, -r * 0.3, r * 0.12).fill(0x050608);
    this.enemyBody.circle(r * 0.28, -r * 0.3, r * 0.12).fill(0x050608);
    this.drawHp(e.hp, e.maxHp);
  }

  applyEvents(events: GameEvent[], enemy: EnemySnapshot): void {
    for (const ev of events) {
      if (ev.kind === "hit") {
        this.lunge = 1;
        this.enemyFlash = 1;
        this.float(`-${ev.damage}`, 0xffffff, this.enemy.x + 60, this.enemy.y - 10);
      } else if (ev.kind === "kill") {
        this.float(`+${ev.xp} XP  +${ev.kan} Kan`, 0xff7a1a, this.enemy.x, this.enemy.y - 70);
      } else if (ev.kind === "levelUp") {
        this.float(`Nível ${ev.level}!`, 0x5ad19a, this.player.x, this.player.y - 50);
      }
    }
    this.setEnemy(enemy);
  }

  private drawHp(hp: number, max: number): void {
    const w = 90;
    const pct = Math.max(0, hp / max);
    this.hpBar.clear();
    this.hpBar.rect(-w / 2, -48, w, 6).fill(0x262c3a);
    this.hpBar.rect(-w / 2, -48, w * pct, 6).fill(pct > 0.3 ? 0x5ad19a : 0xff4d5e);
  }

  private float(text: string, color: number, x: number, y: number): void {
    const t = new Text({ text, style: { fill: color, fontSize: 16, fontWeight: "bold" } });
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.app.stage.addChild(t);
    this.floaters.push({ text: t, life: 1 });
  }

  private update(dtMs: number): void {
    const { width, height } = this.app.screen;
    this.bg.clear().rect(0, 0, width, height).fill(ZONE_COLORS[this.zoneId] ?? 0x1d2a3a);
    // chão
    this.bg.rect(0, height * 0.7, width, height * 0.3).fill({ color: 0x000000, alpha: 0.25 });

    const baseY = height * 0.62;
    this.lunge = Math.max(0, this.lunge - dtMs / 250);
    this.enemyFlash = Math.max(0, this.enemyFlash - dtMs / 200);
    this.player.position.set(width * 0.3 + Math.sin(this.lunge * Math.PI) * 30, baseY);
    this.enemy.position.set(width * 0.68, baseY + Math.sin(performance.now() / 400) * 4);
    this.enemyBody.alpha = 1 - this.enemyFlash * 0.5;

    for (const f of this.floaters) {
      f.life -= dtMs / 900;
      f.text.y -= dtMs * 0.04;
      f.text.alpha = Math.max(0, f.life);
    }
    for (const f of this.floaters.filter((x) => x.life <= 0)) f.text.destroy();
    this.floaters = this.floaters.filter((f) => f.life > 0);
  }
}
