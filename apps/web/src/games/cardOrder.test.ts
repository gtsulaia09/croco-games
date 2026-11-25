import { describe, expect, it } from "vitest";
import { sortHand, suitOrder } from "./cardOrder";

const suitRuns = (hand: string[]) => hand.filter((c) => !c.startsWith("X")).map((c) => c[1]).filter((s, i, a) => i === 0 || a[i - 1] !== s);

describe("sortHand", () => {
  it("keeps every suit together and runs each suit from high to low", () => {
    const hand = sortHand(["QS", "X1", "AS", "9D", "AH", "7D", "9H", "KS", "AC"]);
    expect(hand).toEqual(["X1", "AS", "KS", "QS", "AH", "9H", "AC", "9D", "7D"]);
    // One contiguous run per suit.
    expect(new Set(suitRuns(hand)).size).toBe(suitRuns(hand).length);
  });

  it("puts jokers first and the trump suit right after them", () => {
    expect(sortHand(["6D", "X2", "TH", "KD", "X1", "8S"], { trump: "D" })).toEqual(["X1", "X2", "KD", "6D", "8S", "TH"]);
  });

  it("alternates black and red suits when the hand allows it", () => {
    // Spades, clubs and diamonds: the red suit goes between the two black ones.
    expect(suitOrder(["S", "C", "D"])).toEqual(["S", "D", "C"]);
    expect(suitOrder(["H", "D", "S"])).toEqual(["H", "S", "D"]);
    expect(suitOrder(["S", "H", "D", "C"], "H")).toEqual(["H", "S", "D", "C"]);
  });

  it("uses Bura strength (ten just below the ace)", () => {
    expect(sortHand(["KS", "TS", "AS", "JS", "6S"], { order: "bura" })).toEqual(["AS", "TS", "KS", "JS", "6S"]);
  });

  it("uses natural rank order for the standard deck", () => {
    expect(sortHand(["2C", "TC", "KC", "AC", "5C"])).toEqual(["AC", "KC", "TC", "5C", "2C"]);
  });

  it("does not change the cards, only their order", () => {
    const input = ["7H", "AD", "X2", "QC", "9S", "KH"];
    expect(sortHand(input).slice().sort()).toEqual(input.slice().sort());
    expect(input).toEqual(["7H", "AD", "X2", "QC", "9S", "KH"]);
  });
});
