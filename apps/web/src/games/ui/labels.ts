import type { TFunction } from "../../i18n";

/**
 * A Joker declaration as players say it at the table: a declared 0 is "პასი" (pass).
 *
 * Presentation only — the engine and the API keep the number 0, and this is used ONLY where a
 * value is a declaration (bid buttons, seat badges, score-sheet declaration cells). Points and
 * trick counts of 0 stay "0".
 */
export function bidLabel(t: TFunction, bid: number | null | undefined): string {
  if (bid === null || bid === undefined) return "—";
  return bid === 0 ? t("joker.pass") : String(bid);
}

/** Signed points for score cells: +150, −200, 0. */
export function signedPoints(points: number): string {
  if (points > 0) return `+${points}`;
  if (points < 0) return `−${Math.abs(points)}`;
  return "0";
}
