import Fastify, { type FastifyInstance } from "fastify";
import { WebSocketServer, type WebSocket } from "ws";
import { parseClientMessage, type ServerMessage } from "@bio/shared";
import type { World, Connection } from "../game/world.js";

const MAX_MSGS_PER_SECOND = 20;

export async function createServer(world: World, allowedOrigins: readonly string[]): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

  app.get("/health", async () => ({ ok: true, online: world.onlineCount }));

  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

  app.server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    const origin = req.headers.origin ?? "";
    if (allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws));
  });

  function onConnection(ws: WebSocket): void {
    const conn: Connection = {
      send(msg: ServerMessage) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
      },
      close() {
        ws.close(4000, "replaced");
      },
    };

    // Limite simples de mensagens por segundo por conexão.
    let windowStart = Date.now();
    let count = 0;

    ws.on("message", (data) => {
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        count = 0;
      }
      if (++count > MAX_MSGS_PER_SECOND) {
        ws.close(4008, "rate limit");
        return;
      }
      const msg = parseClientMessage(data.toString());
      if (!msg) {
        conn.send({ t: "error", code: "bad_message", message: "Mensagem inválida." });
        return;
      }
      world.handleMessage(conn, msg);
    });

    ws.on("close", () => {
      world.disconnect(conn).catch((err) => app.log.error(err));
    });
  }

  app.addHook("onClose", async () => {
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  });

  return app;
}
