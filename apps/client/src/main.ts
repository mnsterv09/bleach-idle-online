import { FANGAME_DISCLAIMER, type PlayerSnapshot, type ServerMessage, type ZoneSummary } from "@bio/shared";
import { GameSocket } from "./net.js";
import { HuntScene } from "./scene.js";
import { clearToken, loadToken, saveToken } from "./storage.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

for (const el of document.querySelectorAll<HTMLElement>("[data-disclaimer]")) {
  el.textContent = FANGAME_DISCLAIMER;
}

const fmt = new Intl.NumberFormat("pt-BR");
const scene = new HuntScene();
let zones: ZoneSummary[] = [];
let me: PlayerSnapshot | null = null;
let pendingName: string | undefined;
let sceneReady: Promise<void> | null = null;

const socket = new GameSocket(() => {
  const token = loadToken();
  return token ? { token } : { name: pendingName };
});

socket.onStatus = (s) => {
  const el = $("hud-status");
  el.textContent = s === "open" ? "conectado" : s === "connecting" ? "conectando…" : "desconectado";
  el.classList.toggle("ok", s === "open");
};

socket.onMessage = (msg) => void handle(msg);

async function handle(msg: ServerMessage): Promise<void> {
  switch (msg.t) {
    case "welcome": {
      saveToken(msg.token);
      zones = msg.zones;
      showGame();
      await (sceneReady ??= scene.mount($("stage")));
      updatePlayer(msg.player);
      if (msg.offline) {
        const h = (msg.offline.seconds / 3600).toFixed(1);
        log(
          `Meditação: ${h} h fora, ${fmt.format(msg.offline.kills)} Hollows, ` +
            `+${fmt.format(msg.offline.xp)} XP, +${fmt.format(msg.offline.kan)} Kan`,
          "levelup",
        );
      }
      break;
    }
    case "tick":
      if (!sceneReady) return;
      await sceneReady;
      updatePlayer(msg.player);
      scene.applyEvents(msg.events, msg.enemy);
      for (const ev of msg.events) {
        if (ev.kind === "kill") log(`${ev.enemyName} derrotado: +${ev.xp} XP, +${ev.kan} Kan`);
        if (ev.kind === "levelUp") log(`Subiu para o nível ${ev.level}!`, "levelup");
      }
      break;
    case "zoneChanged":
      await sceneReady;
      updatePlayer(msg.player);
      scene.setEnemy(msg.enemy);
      break;
    case "online":
      $("hud-online").textContent = fmt.format(msg.count);
      break;
    case "error":
      if (msg.code === "need_name" || msg.code === "name_taken" || msg.code === "version") {
        clearToken();
        showLogin(msg.message);
        socket.close();
      } else {
        log(msg.message);
      }
      break;
    case "pong":
      break;
  }
}

function updatePlayer(p: PlayerSnapshot): void {
  const zoneChanged = me?.zoneId !== p.zoneId;
  const levelChanged = me?.level !== p.level;
  me = p;
  $("hud-name").textContent = p.name;
  $("hud-level").textContent = String(p.level);
  $("hud-kan").textContent = fmt.format(p.kan);
  $("hud-xp").textContent = `${fmt.format(p.xp)} / ${fmt.format(p.xpToNext)}`;
  $("hud-xp-fill").style.width = `${Math.min(100, (p.xp / p.xpToNext) * 100)}%`;
  if (zoneChanged || levelChanged) renderZones();
  if (zoneChanged) {
    const z = zones.find((z) => z.id === p.zoneId);
    $("zone-title").textContent = z?.name ?? p.zoneId;
    scene.setZone(p.zoneId);
  }
}

function renderZones(): void {
  const ul = $("zones");
  ul.replaceChildren(
    ...zones.map((z) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.textContent = z.name;
      const small = document.createElement("small");
      small.textContent = `Nv ${z.minLevel}`;
      b.appendChild(small);
      b.disabled = (me?.level ?? 1) < z.minLevel;
      b.classList.toggle("active", me?.zoneId === z.id);
      b.addEventListener("click", () => socket.send({ t: "setZone", zoneId: z.id }));
      li.appendChild(b);
      return li;
    }),
  );
}

function log(text: string, cls?: string): void {
  const ul = $("log");
  const li = document.createElement("li");
  li.textContent = text;
  if (cls) li.className = cls;
  ul.prepend(li);
  while (ul.children.length > 6) ul.lastElementChild?.remove();
}

function showGame(): void {
  $("login").classList.add("hidden");
  $("game").classList.remove("hidden");
}

function showLogin(error = ""): void {
  $("game").classList.add("hidden");
  $("login").classList.remove("hidden");
  $("login-error").textContent = error;
}

$<HTMLFormElement>("login-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  pendingName = $<HTMLInputElement>("name").value.trim();
  $("login-error").textContent = "";
  socket.connect();
});

$("zoom-in").addEventListener("click", () => scene.zoomBy(1));
$("zoom-out").addEventListener("click", () => scene.zoomBy(-1));
$("recenter").addEventListener("click", () => scene.recenter());

// Com token salvo, entra direto; sem token, mostra o login.
if (loadToken()) socket.connect();
else showLogin();
