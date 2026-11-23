import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@bio/shared";
import { MemoryStore } from "../db/memoryStore.js";
import { Presence } from "../db/redis.js";
import { World, type Connection } from "./world.js";

function fakeConn() {
  const inbox: ServerMessage[] = [];
  const conn: Connection & { inbox: ServerMessage[]; closed: boolean } = {
    inbox,
    closed: false,
    send: (m) => inbox.push(m),
    close() {
      this.closed = true;
    },
  };
  return conn;
}

const flushPromises = () => new Promise((r) => setTimeout(r, 0));

function makeWorld(store = new MemoryStore()) {
  return new World({ store, presence: Presence.connect(undefined), tickMs: 1000, saveEveryMs: 60_000, rng: () => 0 });
}

describe("World", () => {
  it("cria convidado, caça por ticks e recusa zona acima do nível", async () => {
    const world = makeWorld();
    const c = fakeConn();
    world.handleMessage(c, { t: "hello", v: 1, name: "Ichigo" });
    await flushPromises();
    const welcome = c.inbox.find((m) => m.t === "welcome");
    expect(welcome?.t).toBe("welcome");

    world.tick();
    world.tick();
    world.tick();
    const ticks = c.inbox.filter((m) => m.t === "tick");
    expect(ticks).toHaveLength(3);
    const last = ticks.at(-1);
    expect(last?.t === "tick" && last.player.kan).toBe(2);

    world.handleMessage(c, { t: "setZone", zoneId: "hueco-mundo" });
    expect(c.inbox.at(-1)).toMatchObject({ t: "error", code: "level_too_low" });
  });

  it("aplica ganhos offline ao voltar com o token", async () => {
    const store = new MemoryStore();
    const world = makeWorld(store);
    const c1 = fakeConn();
    world.handleMessage(c1, { t: "hello", v: 1, name: "Rukia" });
    await flushPromises();
    const w = c1.inbox.find((m) => m.t === "welcome");
    if (w?.t !== "welcome") throw new Error("sem welcome");
    await world.disconnect(c1);

    // Simula 1 hora ausente.
    const rec = (await store.findByToken(w.token))!;
    rec.lastSeenAt = new Date(Date.now() - 3600_000);
    await store.save([rec]);

    const c2 = fakeConn();
    world.handleMessage(c2, { t: "hello", v: 1, token: w.token });
    await flushPromises();
    const w2 = c2.inbox.find((m) => m.t === "welcome");
    expect(w2?.t === "welcome" && w2.offline?.kills).toBe(300);
    expect(w2?.t === "welcome" && w2.player.name).toBe("Rukia");
  });

  it("recusa nome repetido e ignora ações antes do login", async () => {
    const world = makeWorld();
    const a = fakeConn();
    world.handleMessage(a, { t: "setZone", zoneId: "karakura" });
    expect(a.inbox.at(-1)).toMatchObject({ code: "not_logged_in" });
    world.handleMessage(a, { t: "hello", v: 1, name: "Renji" });
    await flushPromises();
    const b = fakeConn();
    world.handleMessage(b, { t: "hello", v: 1, name: "renji" });
    await flushPromises();
    expect(b.inbox.at(-1)).toMatchObject({ code: "name_taken" });
  });
});
