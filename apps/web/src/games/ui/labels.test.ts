import { describe, expect, it } from "vitest";
import { translate, type TFunction } from "../../i18n";
import { bidLabel, signedPoints } from "./labels";

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
