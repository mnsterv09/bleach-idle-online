import { describe, expect, it } from "vitest";
import { applyXp, computeOfflineGains, ticksToKill, xpToNextLevel, OFFLINE_CAP_HOURS } from "./formulas.js";
import { parseClientMessage, isValidName } from "./protocol.js";

describe("applyXp", () => {
  it("sobe vários níveis e carrega o excedente", () => {
    const need = xpToNextLevel(1) + xpToNextLevel(2);
    const r = applyXp({ level: 1, xp: 0 }, need + 7);
    expect(r.level).toBe(3);
    expect(r.xp).toBe(7);
    expect(r.levelsGained).toBe(2);
  });
});

describe("ticksToKill", () => {
  it("arredonda para cima e nunca é zero", () => {
    expect(ticksToKill(30, 13)).toBe(3);
    expect(ticksToKill(1, 1000)).toBe(1);
  });
});

describe("computeOfflineGains", () => {
  const enemies = [{ maxHp: 30, xp: 5, kan: 2 }];

  it("ignora ausências curtas", () => {
    expect(computeOfflineGains(30, 1000, 1, enemies).kills).toBe(0);
  });

  it("respeita o teto de horas", () => {
    const capped = computeOfflineGains(OFFLINE_CAP_HOURS * 3600, 1000, 1, enemies);
    const way = computeOfflineGains(1000 * 3600, 1000, 1, enemies);
    expect(way).toEqual(capped);
    expect(capped.seconds).toBe(OFFLINE_CAP_HOURS * 3600);
  });

  it("usa a fração da taxa online", () => {
    // nível 1: ataque 13, 30 HP => 3 ticks por abate; 3600 ticks => 1200 abates online; 25% => 300
    const r = computeOfflineGains(3600, 1000, 1, enemies);
    expect(r.kills).toBe(300);
    expect(r.xp).toBe(1500);
    expect(r.kan).toBe(600);
  });
});

describe("parseClientMessage", () => {
  it("aceita mensagens válidas", () => {
    expect(parseClientMessage('{"t":"setZone","zoneId":"karakura"}')).toEqual({ t: "setZone", zoneId: "karakura" });
    expect(parseClientMessage('{"t":"hello","v":1,"name":"Ichigo"}')).toEqual({ t: "hello", v: 1, name: "Ichigo" });
  });

  it("rejeita lixo", () => {
    expect(parseClientMessage("nope")).toBeNull();
    expect(parseClientMessage('{"t":"setZone","zoneId":5}')).toBeNull();
    expect(parseClientMessage('{"t":"giveMeKan","amount":1e9}')).toBeNull();
  });

  it("valida nomes", () => {
    expect(isValidName("Ichigo")).toBe(true);
    expect(isValidName("ab")).toBe(false);
    expect(isValidName("<script>")).toBe(false);
  });
});
