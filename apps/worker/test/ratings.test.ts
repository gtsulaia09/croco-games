import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { computeRatingChanges, expectedScore, finalizeMatch } from "../src/ratings";
import { player } from "./helpers";

describe("rating math", () => {
  it("is zero-sum for two players and rewards upsets more", () => {
    const even = computeRatingChanges([
      { userId: "a", rating: 1500, placement: 1 },
      { userId: "b", rating: 1500, placement: 2 },
    ]);
    expect(even.get("a")).toBe(16);
    expect(even.get("b")).toBe(-16);
    const upset = computeRatingChanges([
      { userId: "a", rating: 1300, placement: 1 },
      { userId: "b", rating: 1700, placement: 2 },
    ]);
    expect(upset.get("a")!).toBeGreaterThan(25);
    expect(expectedScore(1500, 1500)).toBe(0.5);
  });

  it("ignores excluded (farming) pairs and treats ties as draws", () => {
    const tie = computeRatingChanges([
      { userId: "a", rating: 1500, placement: 1 },
      { userId: "b", rating: 1500, placement: 1 },
    ]);
    expect(tie.get("a")).toBe(0);
    const excluded = computeRatingChanges(
      [
        { userId: "a", rating: 1500, placement: 1 },
        { userId: "b", rating: 1500, placement: 2 },
      ],
      new Set(["a|b"]),
    );
    expect(excluded.get("a")).toBe(0);
  });

  it("needs at least two human players to be rated", () => {
    expect(computeRatingChanges([{ userId: "a", rating: 1500, placement: 1 }]).size).toBe(0);
  });
});

describe("match finalisation and leaderboards", () => {
  it("persists verified results, never rates games against bots only, and caps pair farming", async () => {
    const a = await player("lb_a");
    const b = await player("lb_b");
    const base = { roomId: "r_AAAAAAAAAAAAAAAAAAAA", gameType: "dominoes" as const, startedAt: Date.now() - 1000, finalRev: 10, eventsJson: "[]", eventsTruncated: false };

    const botOnly = await finalizeMatch(env.DB, {
      ...base,
      matchId: "m_BOTONLY0000000000000",
      finishedAt: Date.now(),
      participants: [
        { seat: 0, userId: a.userId, isBot: false, forfeited: false, placement: 1, score: 100 },
        { seat: 1, userId: null, isBot: true, forfeited: false, placement: 2, score: 20 },
      ],
    });
    expect(botOnly.rated).toBe(false);

    const deltas: number[] = [];
    for (let i = 0; i < 7; i++) {
      const r = await finalizeMatch(env.DB, {
        ...base,
        matchId: `m_PAIR${String(i).padStart(16, "0")}`,
        finishedAt: Date.now() + i,
        participants: [
          { seat: 0, userId: a.userId, isBot: false, forfeited: false, placement: 1, score: 100 },
          { seat: 1, userId: b.userId, isBot: false, forfeited: false, placement: 2, score: 40 },
        ],
      });
      expect(r.rated).toBe(true);
      deltas.push(r.changes.find((c) => c.userId === a.userId)!.delta);
    }
    // After the daily cap the same pair stops moving ratings.
    expect(deltas.slice(0, 5).every((d) => d > 0)).toBe(true);
    expect(deltas.slice(5)).toEqual([0, 0]);

    const stats = await a.json("GET", "/api/me/stats");
    const dom = stats.body.items.find((s: { gameType: string }) => s.gameType === "dominoes");
    expect(dom.matches).toBe(8);
    expect(dom.wins).toBe(8);

    const board = await a.json("GET", "/api/leaderboards/dominoes");
    expect(board.status).toBe(200);
    const first = board.body.items[0];
    expect(first.user.id).toBe(a.userId);
    expect(first.leadOverNext).toBe(first.rating - board.body.items[1].rating);
    expect(first.recent.length).toBeGreaterThan(0);
    expect(Object.keys(first.user).sort()).toEqual(["avatar", "badges", "id", "username"]);

    const history = await a.json("GET", "/api/me/matches?limit=3");
    expect(history.body.items).toHaveLength(3);
    expect(history.body.nextCursor).toBeTruthy();

    const leaders = await a.json("GET", "/api/leaders");
    expect(leaders.body.items).toHaveLength(10);
    const monthly = await a.json("GET", "/api/leaderboards/dominoes?period=month");
    expect(monthly.status).toBe(200);
    const global = await a.json("GET", "/api/leaderboards/global");
    expect(global.status).toBe(200);
  });

  it("rejects unknown game types and bad pagination", async () => {
    const p = await player("lb_bad");
    expect((await p.json("GET", "/api/leaderboards/chess")).status).toBe(404);
    expect((await p.json("GET", "/api/leaderboards/joker?limit=5000")).status).toBe(400);
    expect((await p.json("GET", "/api/leaderboards/joker?period=decade")).status).toBe(400);
  });
});
