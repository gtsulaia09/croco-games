import { LIMITS } from "./limits";

/*
 * Zod-free text and username helpers. They are shared by the server schemas (validation.ts)
 * and by the browser bundle (client.ts), which must stay small.
 */

/**
 * Remove C0/C1 control characters, bidi overrides and zero-width characters. U+200D (zero-width
 * joiner) is handled separately below.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
/**
 * A zero-width joiner survives only inside an emoji sequence (🤷‍♂️, ❤️‍🔥, 👩‍💻): an emoji — or its
 * variation selector / skin tone — before it and an emoji after it. Anywhere else it is removed,
 * so it cannot hide inside names or ordinary words.
 */
const STRAY_ZWJ = /(?<!\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u{FE0F})\u200D|\u200D(?!\p{Extended_Pictographic})/gu;

export function sanitizeText(input: string): string {
  return input.normalize("NFC").replace(CONTROL_CHARS, "").replace(STRAY_ZWJ, "").replace(/\s+/g, " ").trim();
}

/** Latin letters, digits, underscore and Georgian Mkhedruli letters (no punctuation from the block). */
export const USERNAME_PATTERN = /^[A-Za-z0-9_ა-ჺჽ-ჿ]+$/;

const RESERVED_SKELETONS = [
  "admin",
  "administrator",
  "moderator",
  "moder",
  "system",
  "croco",
  "support",
  "official",
  "staff",
  "owner",
  "root",
  "bot",
  "ადმინ",
  "მოდერატორ",
  "სისტემა",
  "ბოტი",
  "კროკო",
];

const LOOKALIKES: Record<string, string> = {
  "0": "o",
  "1": "i",
  l: "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "9": "g",
};

/** Skeleton used to detect impersonation such as "Adm1n" or "a_d_m_i_n". */
export function usernameSkeleton(username: string): string {
  return username
    .normalize("NFC")
    .toLowerCase()
    .replace(/_/g, "")
    .split("")
    .map((ch) => LOOKALIKES[ch] ?? ch)
    .join("");
}

export function isReservedUsername(username: string): boolean {
  const skeleton = usernameSkeleton(username);
  return RESERVED_SKELETONS.some((reserved) => {
    const reservedSkeleton = usernameSkeleton(reserved);
    // "bot" is only reserved as a prefix/suffix so that names like "abbott" remain possible.
    if (reservedSkeleton === "bot") return skeleton.startsWith("bot") || skeleton.endsWith("bot");
    return skeleton.includes(reservedSkeleton);
  });
}

export type UsernameProblem = "too_short" | "too_long" | "invalid_characters" | "reserved";

/** Client-side pre-check with the same rules the server enforces (the server remains authoritative). */
export function checkUsername(raw: string): { ok: true; value: string } | { ok: false; error: UsernameProblem } {
  const value = raw.normalize("NFC").trim();
  if ([...value].length < LIMITS.username.min) return { ok: false, error: "too_short" };
  if ([...value].length > LIMITS.username.max) return { ok: false, error: "too_long" };
  if (!USERNAME_PATTERN.test(value)) return { ok: false, error: "invalid_characters" };
  if (isReservedUsername(value)) return { ok: false, error: "reserved" };
  return { ok: true, value };
}
