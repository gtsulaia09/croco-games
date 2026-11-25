import { describe, expect, it } from "vitest";
import { api, client, ORIGIN, player } from "./helpers";

describe("HTTP perimeter", () => {
  it("sets strict security headers on every response, including errors", async () => {
    for (const res of [await api("GET", "/api/health"), await api("GET", "/api/does-not-exist"), await api("GET", "/api/me")]) {
      expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("X-Request-Id")).toBeTruthy();
    }
  });

  it("returns generic error bodies without stack traces", async () => {
    const res = await api("GET", "/api/does-not-exist");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; ref: string } };
    expect(body.error.code).toBe("not_found");
    expect(JSON.stringify(body)).not.toMatch(/stack|at |\.ts/);
  });

  it("echoes only allowlisted origins and never uses a wildcard", async () => {
    const ok = await api("GET", "/api/health", { origin: ORIGIN });
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(ok.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    const evil = await api("GET", "/api/health", { origin: "https://evil.example" });
    expect(evil.status).toBe(403);
    expect(evil.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const lookalike = await api("GET", "/api/health", { origin: "https://app.croco.test.evil.example" });
    expect(lookalike.status).toBe(403);
  });

  it("rejects preflights from foreign origins and answers allowed ones", async () => {
    expect((await api("OPTIONS", "/api/rooms", { origin: "https://evil.example" })).status).toBe(403);
    const pre = await api("OPTIONS", "/api/rooms", { origin: ORIGIN });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });

  it("requires an allowed Origin for state-changing requests (CSRF defence in depth)", async () => {
    const c = await client("perimeter-origin");
    const res = await api("POST", "/api/me/profile", { token: c.tok, origin: null, body: { username: "Nobody1", avatar: "a01", locale: "en" } });
    expect(res.status).toBe(403);
  });

  it("rejects non-JSON bodies (form posts) and oversized payloads", async () => {
    const c = await client("perimeter-body");
    const form = await c.call("POST", "/api/me/profile", "username=x", { "Content-Type": "application/x-www-form-urlencoded" });
    expect(form.status).toBe(415);
    const big = await c.call("POST", "/api/me/profile", JSON.stringify({ username: "x".repeat(20_000) }));
    expect(big.status).toBe(413);
    const malformed = await c.call("POST", "/api/me/profile", "{not json");
    expect(malformed.status).toBe(400);
  });

  it("does not expose methods that are not routed", async () => {
    const c = await player("perimeter_method");
    expect((await c.call("DELETE", "/api/rooms")).status).toBe(404);
    expect((await c.call("PUT", "/api/me")).status).toBe(404);
  });
});
