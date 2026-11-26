import { describe, expect, it } from "vitest";
import { buildSheet, jokerSchedule, type SheetView } from "./jokerSheet";

function view(partial: Partial<SheetView>): SheetView {
  return {
    ruleset: "standard",
    handNumber: 1,
    phase: "bid",
    bids: [null, null, null, null],
    tricks: [0, 0, 0, 0],
    history: [],
    bonuses: [],
    totals: [0, 0, 0, 0],
    ...partial,
  };
}

describe("jokerSchedule", () => {
  it("has 24 deals in the standard game and 16 in nines", () => {
    expect(jokerSchedule("standard").flat()).toHaveLength(24);
    expect(jokerSchedule("nines").flat()).toHaveLength(16);
    expect(jokerSchedule("standard")[0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("buildSheet", () => {
  it("lays out every deal and marks the current one", () => {
    const sheet = buildSheet(view({ handNumber: 3, phase: "play", bids: [0, 1, 2, 1], tricks: [0, 1, 0, 0] }));
    expect(sheet.sets).toHaveLength(4);
    const row = sheet.sets[0]!.rows[2]!;
    expect(row.status).toBe("current");
    expect(row.cards).toBe(3);
    expect(row.cells.map((c) => c.bid)).toEqual([0, 1, 2, 1]);
    expect(row.cells.map((c) => c.tricks)).toEqual([0, 1, 0, 0]);
    expect(sheet.sets[0]!.rows[3]!.status).toBe("upcoming");
  });

  const history = [
    { hand: 1, set: 0, cards: 1, bids: [0, 1, 0, 0], tricks: [0, 1, 0, 0], scores: [50, 100, 50, 50] },
    { hand: 2, set: 0, cards: 2, bids: [1, 0, 0, 0], tricks: [0, 1, 1, 0], scores: [-200, 10, 10, 50] },
  ];

  it("keeps the engine's scores and adds a premia to the set subtotal (older matches without kind)", () => {
    const sheet = buildSheet(view({ handNumber: 3, history, bonuses: [{ set: 0, seat: 3, amount: 50 }], totals: [-150, 110, 60, 150] }));
    const set = sheet.sets[0]!;
    expect(set.subtotal).toEqual([-150, 110, 60, 150]);
    expect(set.premia).toEqual([0, 0, 0, 50]);
    expect(set.erased).toEqual([0, 0, 0, 0]);
    expect(set.rows[1]!.cells[0]).toEqual({ bid: 1, tricks: 0, points: -200, made: false, erased: false, premia: false });
    // A declared pass that is met keeps its numeric 0 in the data (the UI shows "პასი").
    expect(set.rows[0]!.cells[0]).toEqual({ bid: 0, tricks: 0, points: 50, made: true, erased: false, premia: false });
    expect(sheet.leaders).toEqual([3]);
  });

  it("marks the premia deal and the erased deals and takes erasures off the subtotal", () => {
    const bonuses = [
      { set: 0, seat: 3, amount: 50, kind: "premia" as const, hand: 1 },
      { set: 0, seat: 1, amount: -100, kind: "erase" as const, hand: 1 },
      { set: 0, seat: 2, amount: -10, kind: "erase" as const, hand: 2 },
    ];
    const sheet = buildSheet(view({ handNumber: 3, history, bonuses, totals: [-150, 10, 50, 150] }));
    const set = sheet.sets[0]!;
    expect(set.rows[0]!.cells[3]!.premia).toBe(true);
    expect(set.rows[0]!.cells[1]!.erased).toBe(true);
    expect(set.rows[1]!.cells[2]!.erased).toBe(true);
    expect(set.rows[1]!.cells[1]!.erased).toBe(false);
    expect(set.premia).toEqual([0, 0, 0, 50]);
    expect(set.erased).toEqual([0, 100, 10, 0]);
    expect(set.subtotal).toEqual([-150, 10, 50, 150]);
  });

  it("has no current row once the match is over", () => {
    const sheet = buildSheet(view({ handNumber: 24, phase: "over" }));
    expect(sheet.sets.flatMap((s) => s.rows).some((r) => r.status === "current")).toBe(false);
  });
});
