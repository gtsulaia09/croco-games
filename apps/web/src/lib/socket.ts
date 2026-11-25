import { WS_CLOSE, WS_PROTOCOL, WS_TICKET_PREFIX } from "@croco/shared/client";
import { post } from "./api";
import { wsUrl } from "./config";

export type SocketStatus = "connecting" | "open" | "reconnecting" | "closed";

const NO_RECONNECT = new Set<number>([WS_CLOSE.superseded, WS_CLOSE.kicked, WS_CLOSE.roomClosed, WS_CLOSE.unauthorized]);

export function newMessageId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
}

/**
 * Authenticated WebSocket with a one-time ticket (sent as a subprotocol, never in the URL),
 * heartbeats answered by the server without waking the Durable Object, and reconnection with
 * exponential backoff + jitter. Servers close with application codes to stop reconnecting.
 */
export class TicketSocket<In extends { type: string }> {
  private ws: WebSocket | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private stopped = false;

  constructor(
    private readonly ticketPath: string,
    private readonly socketPath: string,
    private readonly onMessage: (msg: In) => void,
    private readonly onStatus: (status: SocketStatus, closeCode?: number) => void,
  ) {}

  async connect(): Promise<void> {
    if (this.stopped) return;
    this.onStatus(this.attempts === 0 ? "connecting" : "reconnecting");
    let ticket: string;
    try {
      ticket = (await post<{ ticket: string }>(this.ticketPath)).ticket;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "not_in_room" || code === "room_closed" || code === "forbidden") {
        this.stopped = true;
        this.onStatus("closed", WS_CLOSE.roomClosed);
        return;
      }
      this.scheduleReconnect();
      return;
    }
    const ws = new WebSocket(wsUrl(this.socketPath), [WS_PROTOCOL, `${WS_TICKET_PREFIX}${ticket}`]);
    this.ws = ws;
    ws.addEventListener("open", () => {
      this.attempts = 0;
      this.onStatus("open");
      this.heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('{"type":"hb"}');
      }, 25_000);
    });
    ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string" || event.data.length > 256_000) return;
      let msg: unknown;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg && typeof msg === "object" && typeof (msg as { type?: unknown }).type === "string" && (msg as { type: string }).type !== "hb_ack") {
        this.onMessage(msg as In);
      }
    });
    ws.addEventListener("close", (event) => {
      this.clearTimers();
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped || NO_RECONNECT.has(event.code)) {
        this.stopped = true;
        this.onStatus("closed", event.code);
        return;
      }
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.attempts += 1;
    const delay = Math.min(15_000, 1000 * 2 ** Math.min(this.attempts - 1, 4)) + Math.floor(Math.random() * 500);
    this.onStatus("reconnecting");
    this.retry = setTimeout(() => void this.connect(), delay);
  }

  send(msg: Record<string, unknown>): string {
    const id = (msg["id"] as string | undefined) ?? newMessageId();
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ ...msg, id }));
    return id;
  }

  private clearTimers(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  close(): void {
    this.stopped = true;
    this.clearTimers();
    if (this.retry) clearTimeout(this.retry);
    this.ws?.close(1000, "bye");
    this.ws = null;
  }
}
