import { describe, expect, it } from "vitest";
import { translate, type TFunction } from "../../i18n";
import { bidLabel, dealPoints, sheetTotal, signedPoints } from "./labels";

const ka: TFunction = (key, params) => translate("ka", key, params);
const en: TFunction = (key, params) => translate("en", key, params);

describe("bidLabel (Joker declarations)", () => {
  it("shows a declared 0 as პასი", () => {
    expect(bidLabel(ka, 0)).toBe("პასი");
    expect(bidLabel(en, 0)).toBe("Pass");
  });

  it("keeps other declarations numeric", () => {
    expect(bidLabel(ka, 1)).toBe("1");
    expect(bidLabel(ka, 2)).toBe("2");
    expect(bidLabel(ka, 9)).toBe("9");
  });

  it("shows a missing declaration as a dash", () => {
    expect(bidLabel(ka, null)).toBe("—");
    expect(bidLabel(ka, undefined)).toBe("—");
  });
});

describe("signedPoints (score cells)", () => {
  it("never turns zero points into a declaration word", () => {
    expect(signedPoints(0)).toBe("0");
  });

  it("signs positive and negative results", () => {
    expect(signedPoints(150)).toBe("+150");
    expect(signedPoints(-200)).toBe("−200");
  });
});

describe("Joker score sheet numbers", () => {
  it("writes a deal's points as they are: 300, 30, −500", () => {
    expect(dealPoints(300)).toBe("300");
    expect(dealPoints(30)).toBe("30");
    expect(dealPoints(0)).toBe("0");
    expect(dealPoints(-500)).toBe("−500");
  });

  it("counts totals in hundreds: 300 → 3.0, 30 → 0.3, −900 → −9.0", () => {
    expect(sheetTotal(300)).toBe("3.0");
    expect(sheetTotal(30)).toBe("0.3");
    expect(sheetTotal(0)).toBe("0.0");
    expect(sheetTotal(-900)).toBe("−9.0");
    expect(sheetTotal(1250)).toBe("12.5");
    expect(sheetTotal(-50)).toBe("−0.5");
  });
});
