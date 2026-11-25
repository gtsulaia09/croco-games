import { SELF, env } from "cloudflare:test";
import { importJWK, SignJWT, type JWK } from "jose";

export const ORIGIN = "https://app.croco.test";
const PROJECT = "croco-test";
let keyPromise: Promise<CryptoKey> | null = null;

function signingKey(): Promise<CryptoKey> {
  keyPromise ??= importJWK(JSON.parse((env as unknown as { TEST_PRIVATE_JWK: string }).TEST_PRIVATE_JWK) as JWK, "RS256") as Promise<CryptoKey>;
  return keyPromise;
}

export interface TokenOptions {
  email?: string;
  emailVerified?: boolean;
  provider?: string;
  authTime?: number;
  iat?: number;
  exp?: number;
  aud?: string;
  kid?: string;
}

export async function token(uid: string, o: TokenOptions = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    auth_time: o.authTime ?? now - 5,
    email: o.email ?? `${uid}@croco.test`,
    email_verified: o.emailVerified ?? true,
    firebase: { sign_in_provider: o.provider ?? "google.com" },
  })
    .setProtectedHeader({ alg: "RS256", kid: o.kid ?? "test-key-1" })
    .setIssuer(`https://securetoken.google.com/${PROJECT}`)
    .setAudience(o.aud ?? PROJECT)
    .setSubject(uid)
    .setIssuedAt(o.iat ?? now - 5)
    .setExpirationTime(o.exp ?? now + 3000)
    .sign(await signingKey());
}

let ipCounter = 1;
export function freshIp(): string {
  ipCounter++;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

export interface Client {
  uid: string;
  tok: string;
  ip: string;
  call(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Response>;
  json<T = any>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<{ status: number; body: T }>;
}

export async function api(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string>; origin?: string | null; ip?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = { "CF-Connecting-IP": opts.ip ?? freshIp(), ...(opts.headers ?? {}) };
  if (opts.origin !== null) headers["Origin"] = opts.origin ?? ORIGIN;
  if (opts.token && !headers["Authorization"]) headers["Authorization"] = `Bearer ${opts.token}`;
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    headers["Content-Type"] ??= "application/json";
  }
  return SELF.fetch(`https://api.croco.test${path}`, { method, headers, body });
}

export async function client(uid: string, tokenOpts: TokenOptions = {}): Promise<Client> {
  const tok = await token(uid, tokenOpts);
  const ip = freshIp();
  const c: Client = {
    uid,
    tok,
    ip,
    call: (method, path, body, headers) => api(method, path, { token: c.tok, body, headers, ip }),
    async json(method, path, body, headers) {
      const res = await c.call(method, path, body, headers);
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    },
  };
  return c;
}

let nameCounter = 0;
/** Creates a client with a completed profile. */
export async function player(prefix = "player", tokenOpts: TokenOptions = {}): Promise<Client & { userId: string; username: string }> {
  nameCounter++;
  const username = `${prefix.replace(/[^A-Za-z0-9_]/g, "_")}_${nameCounter}_${Math.floor(Math.random() * 1e6)}`.slice(0, 20);
  const c = await client(`${prefix}-uid-${nameCounter}-${Math.random().toString(36).slice(2, 8)}`, tokenOpts);
  const res = await c.json("POST", "/api/me/profile", { username, avatar: "a01", locale: "en" });
  if (res.status !== 201) throw new Error(`profile creation failed: ${res.status} ${JSON.stringify(res.body)}`);
  const me = await c.json("GET", "/api/me");
  return Object.assign(c, { userId: me.body.profile.id as string, username });
}

/** Opens a room WebSocket with a ticket in the subprotocol and collects messages. */
export async function openRoomSocket(c: Client, roomId: string, opts: { origin?: string; ticket?: string } = {}) {
  let ticket = opts.ticket;
  if (!ticket) {
    const t = await c.json("POST", `/api/rooms/${roomId}/ticket`);
    if (t.status !== 200) throw new Error(`ticket failed ${t.status} ${JSON.stringify(t.body)}`);
    ticket = t.body.ticket as string;
  }
  const res = await SELF.fetch(`https://api.croco.test/api/rooms/${roomId}/ws`, {
    headers: { Upgrade: "websocket", Origin: opts.origin ?? ORIGIN, "Sec-WebSocket-Protocol": `croco.v1, t.${ticket}`, "CF-Connecting-IP": c.ip },
  });
  return { res, ticket };
}

export interface SocketHandle {
  ws: WebSocket;
  messages: any[];
  next(predicate: (m: any) => boolean, timeoutMs?: number): Promise<any>;
  send(msg: unknown): void;
}

export function attach(ws: WebSocket): SocketHandle {
  const messages: any[] = [];
  const waiters: Array<{ predicate: (m: any) => boolean; resolve: (m: any) => void }> = [];
  ws.accept();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data as string);
    messages.push(msg);
    for (const w of waiters.slice()) {
      if (w.predicate(msg)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(msg);
      }
    }
  });
  return {
    ws,
    messages,
    send: (msg) => ws.send(JSON.stringify(msg)),
    next(predicate, timeoutMs = 5000) {
      const existing = messages.find(predicate);
      if (existing) {
        messages.splice(messages.indexOf(existing), 1);
        return Promise.resolve(existing);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout waiting for message")), timeoutMs);
        waiters.push({
          predicate,
          resolve: (m) => {
            clearTimeout(timer);
            messages.splice(messages.indexOf(m), 1);
            resolve(m);
          },
        });
      });
    },
  };
}

export const msgId = () => `m${Math.random().toString(36).slice(2, 12)}x`;
