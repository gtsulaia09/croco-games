import { describe, expect, it } from "vitest";
import { GAME_CATALOG, GAME_TYPES, type GameType } from "@croco/shared";
import { allEngines } from "../all";
import { testCtx } from "../testing";

describe("cross-engine security invariants", () => {
  it.each(GAME_TYPES)("engine %s never leaks hidden state to spectators and rejects out-of-turn moves", (type: GameType) => {
    const engine = allEngines[type];
    const players = GAME_CATALOG[type].minPlayers;
    const config = engine.configSchema.parse({});
    const state = engine.create(config, players, testCtx(17));
    const snapshotBefore = JSON.stringify(state);

    // Spectator view must never contain a `you` payload or secret deck/stock/boneyard arrays.
    const specView = engine.view(state, null) as Record<string, unknown>;
    expect(specView["you"]).toBeNull();
    const specJson = JSON.stringify(specView);
    expect(specJson).not.toMatch(/"(?:deck|stock|boneyard|pendingDeal|pending)"\s*:\s*\[/);

    // Out-of-turn seats must be rejected without mutating the input state.
    const active = new Set(engine.actors(state));
    const inactive = Array.from({ length: players }, (_, i) => i).find((s) => !active.has(s));
    if (inactive !== undefined) {
      const sampleAction = engine.legalActions(state, [...active][0]!)[0];
      if (sampleAction) {
        const res = engine.apply(state, inactive, sampleAction, testCtx(17));
        expect(res.ok).toBe(false);
        expect(JSON.stringify(state)).toBe(snapshotBefore);
      }
    }
  });

  it.each(GAME_TYPES)("engine %s bots produce schema-valid legal actions at easy, medium, and hard", (type: GameType) => {
    const engine = allEngines[type];
    const players = GAME_CATALOG[type].minPlayers;
    const config = engine.configSchema.parse({});
    const ctx = testCtx(23);
    const state = engine.create(config, players, ctx);
    const actor = engine.actors(state)[0]!;
    const legal = engine.legalActions(state, actor);
    expect(legal.length).toBeGreaterThan(0);

    for (const difficulty of ["easy", "medium", "hard"] as const) {
      const view = engine.botView ? engine.botView(state, actor) : engine.view(state, actor);
      const action = engine.bot({ view, legal, seat: actor, difficulty, rng: ctx.rng });
      expect(engine.actionSchema.safeParse(action).success, `${type} ${difficulty}`).toBe(true);
      const res = engine.apply(state, actor, action, ctx);
      expect(res.ok, `${type} ${difficulty}`).toBe(true);
    }
  });
});
