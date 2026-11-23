import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from "@bio/shared";

type Handler = (msg: ServerMessage) => void;

/**
 * Conexão WebSocket com o servidor do jogo. Reconecta com espera crescente
 * e reenvia o hello com o token salvo.
 */
export class GameSocket {
  private ws: WebSocket | null = null;
  private retry = 0;
  private stopped = false;
  onMessage: Handler = () => {};
  onStatus: (status: "connecting" | "open" | "closed") => void = () => {};

  constructor(private getHello: () => { token?: string; name?: string }) {}

  connect(): void {
    this.stopped = false;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    this.ws = ws;
    this.onStatus("connecting");

    ws.addEventListener("open", () => {
      this.retry = 0;
      this.onStatus("open");
      this.send({ t: "hello", v: PROTOCOL_VERSION, ...this.getHello() });
    });
    ws.addEventListener("message", (ev) => {
      try {
        this.onMessage(JSON.parse(String(ev.data)) as ServerMessage);
      } catch {
        // mensagem corrompida: ignora
      }
    });
    ws.addEventListener("close", (ev) => {
      this.onStatus("closed");
      // 4000 = sessão aberta em outra aba: não reconecta sozinho.
      if (this.stopped || ev.code === 4000) return;
      const delay = Math.min(15_000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.stopped = true;
    this.ws?.close();
  }
}
