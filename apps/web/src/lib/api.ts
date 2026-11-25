import type { ErrorCode } from "@croco/shared/client";
import { config } from "./config";
import { getIdToken } from "./firebase";

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | "network",
    readonly status: number,
    readonly fields?: Record<string, string>,
  ) {
    super(code);
  }
}

/** Admin step-up token lives only in memory (never persisted). */
let stepUpToken: { token: string; expiresAt: number } | null = null;
export function setStepUp(token: string, expiresAt: number): void {
  stepUpToken = { token, expiresAt };
}
export function clearStepUp(): void {
  stepUpToken = null;
}
export function hasStepUp(): boolean {
  return Boolean(stepUpToken && stepUpToken.expiresAt > Date.now() + 5_000);
}

async function send(method: string, path: string, body: unknown, forceRefresh: boolean): Promise<Response> {
  const token = await getIdToken(forceRefresh);
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (stepUpToken && path.startsWith("/api/admin/")) headers["X-Admin-Step-Up"] = stepUpToken.token;
  return fetch(config.apiBase + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "omit",
    referrerPolicy: "strict-origin-when-cross-origin",
  });
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await send(method, path, body, false);
    if (res.status === 401) {
      const peek = (await res.clone().json().catch(() => null)) as { error?: { code?: string } } | null;
      if (peek?.error?.code === "token_expired") res = await send(method, path, body, true);
    }
  } catch {
    throw new ApiError("network", 0);
  }
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (data as { error?: { code?: ErrorCode; fields?: Record<string, string> } } | null)?.error;
    throw new ApiError(err?.code ?? "internal_error", res.status, err?.fields);
  }
  return data as T;
}

export const get = <T>(path: string) => api<T>("GET", path);
export const post = <T>(path: string, body: unknown = {}) => api<T>("POST", path, body);
