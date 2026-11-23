import { randomBytes } from "node:crypto";
import {
  PROTOCOL_VERSION,
  ZONES,
  computeOfflineGains,
  applyXp,
  getZone,
  isValidName,
  type ClientMessage,
  type ServerMessage,
} from "@bio/shared";
import { NameTakenError, type PlayerRecord, type PlayerStore } from "../db/types.js";
import type { Presence } from "../db/redis.js";
import { enemySnapshot, huntTick, playerSnapshot, spawnEnemy, type EnemyState, type Rng } from "./hunt.js";

export interface Connection {
  send(msg: ServerMessage): void;
  close(): void;
}

interface Session {
  conn: Connection;
  player: PlayerRecord;
  enemy: EnemyState;
  dirty: boolean;
}

interface WorldOptions {
  store: PlayerStore;
  presence: Presence;
  tickMs: number;
  saveEveryMs: number;
  rng?: Rng;
  log?: (msg: string) => void;
}

/**
 * Mundo do jogo, autoritativo: guarda as sessões ativas, roda o tick de caça
 * para todas e grava o progresso periodicamente. O cliente só envia intenções.
 */
export class World {
  private sessions = new Map<string, Session>(); // playerId -> sessão
  private pending = new Map<Connection, Promise<void>>();
  private tickTimer: NodeJS.Timeout | undefined;
  private saveTimer: NodeJS.Timeout | undefined;
  private rng: Rng;
  private log: (msg: string) => void;

  constructor(private opts: WorldOptions) {
    this.rng = opts.rng ?? Math.random;
    this.log = opts.log ?? (() => {});
  }

  start(): void {
    this.tickTimer = setInterval(() => this.tick(), this.opts.tickMs);
    this.saveTimer = setInterval(() => void this.flush(), this.opts.saveEveryMs);
  }

  async stop(): Promise<void> {
    clearInterval(this.tickTimer);
    clearInterval(this.saveTimer);
    for (const s of this.sessions.values()) {
      s.player.lastSeenAt = new Date();
      s.dirty = true;
    }
    await this.flush();
  }

  get onlineCount(): number {
    return this.sessions.size;
  }

  /** Avança um tick para todas as sessões. Público para testes. */
  tick(): void {
    for (const s of this.sessions.values()) {
      const { enemy, events } = huntTick(s.player, s.enemy, this.rng);
      s.enemy = enemy;
      s.dirty = true;
      s.conn.send({ t: "tick", player: playerSnapshot(s.player), enemy: enemySnapshot(enemy), events });
    }
  }

  async flush(): Promise<void> {
    const dirty = [...this.sessions.values()].filter((s) => s.dirty);
    if (dirty.length === 0) return;
    for (const s of dirty) s.dirty = false;
    const players = dirty.map((s) => ({ ...s.player }));
    try {
      await this.opts.store.save(players);
      await this.opts.presence.updateRanking(players);
    } catch (err) {
      for (const s of dirty) s.dirty = true;
      this.log(`falha ao gravar: ${(err as Error).message}`);
    }
  }

  handleMessage(conn: Connection, msg: ClientMessage): void {
    const session = this.findSession(conn);
    if (msg.t === "ping") {
      conn.send({ t: "pong", at: msg.at, serverTime: Date.now() });
      return;
    }
    if (msg.t === "hello") {
      if (session || this.pending.has(conn)) return;
      const p = this.login(conn, msg).finally(() => this.pending.delete(conn));
      this.pending.set(conn, p);
      return;
    }
    if (!session) {
      conn.send({ t: "error", code: "not_logged_in", message: "Envie hello primeiro." });
      return;
    }
    if (msg.t === "setZone") {
      const zone = getZone(msg.zoneId);
      if (!zone) {
        conn.send({ t: "error", code: "bad_zone", message: "Zona inexistente." });
        return;
      }
      if (session.player.level < zone.minLevel) {
        conn.send({ t: "error", code: "level_too_low", message: `Requer nível ${zone.minLevel}.` });
        return;
      }
      session.player.zoneId = zone.id;
      session.enemy = spawnEnemy(zone.id, this.rng);
      session.dirty = true;
      conn.send({ t: "zoneChanged", player: playerSnapshot(session.player), enemy: enemySnapshot(session.enemy) });
    }
  }

  async disconnect(conn: Connection): Promise<void> {
    await this.pending.get(conn);
    const session = this.findSession(conn);
    if (!session) return;
    session.player.lastSeenAt = new Date();
    session.dirty = true;
    await this.flush();
    this.sessions.delete(session.player.id);
    this.broadcastOnline();
  }

  private async login(conn: Connection, msg: Extract<ClientMessage, { t: "hello" }>): Promise<void> {
    if (msg.v !== PROTOCOL_VERSION) {
      conn.send({ t: "error", code: "version", message: "Versão do cliente desatualizada. Recarregue a página." });
      return;
    }
    let token = msg.token;
    let player = token ? await this.opts.store.findByToken(token) : null;

    if (!player) {
      const name = msg.name?.trim();
      if (!name || !isValidName(name)) {
        conn.send({ t: "error", code: "need_name", message: "Escolha um nome de 3 a 16 caracteres." });
        return;
      }
      token = randomBytes(32).toString("hex");
      try {
        player = await this.opts.store.createGuest(name, token);
      } catch (err) {
        if (err instanceof NameTakenError) {
          conn.send({ t: "error", code: "name_taken", message: "Esse nome já está em uso." });
          return;
        }
        throw err;
      }
      this.log(`novo jogador: ${player.name}`);
    }

    // Uma sessão por conta: derruba a anterior.
    const previous = this.sessions.get(player.id);
    if (previous) {
      previous.conn.send({ t: "error", code: "replaced", message: "Conta aberta em outra aba." });
      previous.conn.close();
      player = previous.player;
      this.sessions.delete(player.id);
    }

    // Treino offline (Meditação), calculado só aqui no servidor.
    const zone = getZone(player.zoneId) ?? ZONES[0]!;
    player.zoneId = zone.id;
    const secondsAway = (Date.now() - player.lastSeenAt.getTime()) / 1000;
    const offline = previous ? undefined : computeOfflineGains(secondsAway, this.opts.tickMs, player.level, zone.enemies);
    if (offline && offline.kills > 0) {
      const r = applyXp(player, offline.xp);
      player.level = r.level;
      player.xp = r.xp;
      player.kan += offline.kan;
    }
    player.lastSeenAt = new Date();

    const session: Session = { conn, player, enemy: spawnEnemy(zone.id, this.rng), dirty: true };
    this.sessions.set(player.id, session);
    conn.send({
      t: "welcome",
      token: token!,
      player: playerSnapshot(player),
      zones: ZONES.map((z) => ({ id: z.id, name: z.name, minLevel: z.minLevel })),
      tickMs: this.opts.tickMs,
      ...(offline && offline.kills > 0 ? { offline } : {}),
    });
    this.broadcastOnline();
  }

  private findSession(conn: Connection): Session | undefined {
    for (const s of this.sessions.values()) if (s.conn === conn) return s;
    return undefined;
  }

  private broadcastOnline(): void {
    const msg: ServerMessage = { t: "online", count: this.sessions.size };
    for (const s of this.sessions.values()) s.conn.send(msg);
  }
}
