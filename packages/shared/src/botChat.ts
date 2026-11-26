/**
 * Bot table talk: funny lines from and about philosophers and good-natured jokes about gamblers,
 * posted by bots on a default timer. Only the line KEY travels over the wire; each client renders it in its own
 * language (web i18n `botChat.<key>`), so bots never send free text.
 */

/** Funny philosopher lines (q01–q30) and jokes about gamblers (j01–j35). No serious quotes. */
export const BOT_CHAT_LINES = [
  ...Array.from({ length: 30 }, (_, i) => `q${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 35 }, (_, i) => `j${String(i + 1).padStart(2, "0")}`),
] as const;

/** Default timer: bots are rare — one line at the table every 5 to 10 minutes. */
export const BOT_CHAT_TIMER = {
  minMs: 5 * 60_000,
  maxMs: 10 * 60_000,
} as const;

/** Milliseconds until the next bot line (5–10 minutes); `rand` returns an integer in [0, n). */
export function botChatDelay(rand: (n: number) => number): number {
  const seconds = rand((BOT_CHAT_TIMER.maxMs - BOT_CHAT_TIMER.minMs) / 1000 + 1);
  return BOT_CHAT_TIMER.minMs + seconds * 1000;
}

/** A random line key. */
export function pickBotLine(rand: (n: number) => number): string {
  return BOT_CHAT_LINES[rand(BOT_CHAT_LINES.length)]!;
}

/** Valid line key (used when rendering, so unknown keys from newer servers are skipped). */
export function isBotChatLine(key: unknown): key is string {
  return typeof key === "string" && (BOT_CHAT_LINES as readonly string[]).includes(key);
}
