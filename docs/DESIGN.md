# Croco Games — Table & Card Design (2026 premium redesign)

The card games look like a premium physical card table; the app around them is a calm, dark,
modern product. This page is the reference for anyone changing the lobby or a game board.

## Games offered in this phase

Only **Joker**, **Japanese Joker** and **Bura** (three-card and five-card) are listed in the
public interface. The list lives in [`apps/web/src/lib/availability.ts`](../apps/web/src/lib/availability.ts)
(`VISIBLE_GAMES`, `LOBBY_ENTRIES`) and drives the lobby, the practice list and the leaderboard
tabs. Poker, dominoes and nardi are **not removed**: engines, API, rooms, ratings, routes and
match history all keep working, and a game comes back by adding it to `VISIBLE_GAMES`.

## Palette (tokens in `apps/web/src/styles.css`)

| Token                                                           | Value                             | Use                                                   |
| --------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------- |
| `--color-bg`                                                    | `#0b1220`                         | Page background                                       |
| `--color-bg-elevated` / `--color-surface` / `--color-surface-2` | `#0f1829` / `#131f32` / `#18263b` | Header, panels, raised panels                         |
| `--color-felt` / `--color-felt-hi`                              | `#075b45` / `#0c7657`             | Card table felt                                       |
| `--color-primary`                                               | `#39d6b0`                         | Primary actions, your turn, playable cards, selection |
| `--color-lime`                                                  | `#a7f36b`                         | Positive results only (a met declaration)             |
| `--color-gold`                                                  | `#d9b56d`                         | Scores, totals, trump, dealer chip, winners           |
| `--color-danger`                                                | `#f0616d`                         | Penalties, negative scores, urgent timer              |
| `--color-text` / `--color-muted`                                | `#f5f7fa` / `#9aa8b8`             | Text                                                  |

Accent colours are used sparingly: teal = "you can act", gold = "score / winner", lime =
"made it", red = "penalty". Buttons (`.btn-primary`, `.btn-secondary`, `.btn-gold`,
`.btn-danger`, `.btn-ghost`) have normal, hover, active, disabled and loading
(`data-loading="true"`) states.

## Where things are

| File                                                       | What                                                                                                                                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/games/cards.tsx` + `cards.css`               | `PlayingCard` (SVG faces: large corner indices, pip layouts, illustrated court figures, jester jokers, emerald back)                                                  |
| `apps/web/src/games/ui/`                                   | Shared table components: `GameTable`, `GameHud`, `PlayerSeat`, `PlayerHand`, `GameNotification`, `ActionSheet`, `useTrickStage`, card-flight `motion.ts`, `labels.ts` |
| `apps/web/src/games/premium.css`                           | Table, seats, trick cross, declarations, hand fan, score sheets, Japanese Joker                                                                                       |
| `apps/web/src/games/bura.css`                              | Bura stock, trick sets, captured piles, action bar                                                                                                                    |
| `apps/web/src/games/JokerScoreboard.tsx` + `jokerSheet.ts` | Compact and full Joker score sheet (model unit-tested)                                                                                                                |
| `apps/web/src/components/lobby/`                           | `GameLobbyCard`, `LobbyGrid`, card-art scenes built from real `PlayingCard`s                                                                                          |
| `apps/web/src/games/table.css`                             | Tables of the games outside this phase (poker, dominoes, nardi) — unchanged                                                                                           |

## Cards

- Width is one CSS variable (`--cw`); height is always `1.4 × width`, so cards never distort.
- Role sizes follow the board width (container units) and are capped by the viewport height so the
  whole table fits on screen: `hand` 64–120 px (≈100–118 px on desktop, ≈70 px on phones),
  `trick` 54–104 px, `pile` 44–86 px, `mini` 30 px. Base size rules use `:where()` so a board can
  always override a size without fighting stylesheet order.
- Corner indices are 24% of the card width, so rank and suit stay readable in an overlapping fan.
- Hand order: jokers first, then the trump suit, then the other suits alternating black / red;
  inside a suit highest to lowest (Bura: A, 10, K, Q, J…). Presentation only.

## The hand

`PlayerHand` is an overlapping fan whose overlap is computed in CSS from the hand's own width
(never below a readable step; very long hands scroll horizontally).

| State                           | Look                                                             |
| ------------------------------- | ---------------------------------------------------------------- |
| Your turn, legal card           | lifted 7 px with a teal under-glow                               |
| Hover (mouse)                   | lifted 24 px, slightly enlarged, teal edge, brought to the front |
| Not legal now                   | shaded, still readable, not clickable                            |
| Selected (Bura) / armed (touch) | lifted 28 px, teal ring and check badge                          |

Mouse: one click plays a legal card. Touch screens: the first tap lifts the card ("tap again to
play"), the second plays it — the same safety JokerStars uses, without slowing desktop play.

## Tables

- `GameTable`: navy padded-leather rail with stitching and a gold inlay around an emerald felt
  lit from above, an embossed emblem in the middle. `shape="oval"` for four seats (stadium),
  `shape="duel"` for two players.
- `PlayerSeat`: avatar with a turn ring (a countdown sweep when the server sets a move deadline,
  red under 5 s), dealer chip, name, offline / bot flags, game numbers, face-down card counter.
  The avatar is the anchor for card flights.
- Cards fly from the hand (or the seat) to the felt; a finished trick stays for a moment with the
  winning card outlined in gold, then sweeps to the winner (`useTrickStage`). Joker and Bura keep
  the last trick of a deal in their views (presentation-only `lastTrick`) so the final trick is
  shown too; Bura's `lastTrick` is redacted exactly like a live trick.
- `GameNotification` slides short messages onto the top rail (trick taken, deal finished,
  bura / var results) — never over cards or controls.
- Decisions that need a choice (joker modes, joker demands) open an `ActionSheet` over the table.

## Joker

- Four seats: you at the bottom, opponents left, top and right. Each seat shows the declaration
  bubble, tricks taken against the declaration (pips), the total in gold and the cards left.
- Centre of the felt: the trick laid in a cross (each card toward its player), the turned trump
  card on the left, the declared-total plaque on the right (`7/9 · შეტენვა −2` / `წაგლეჯვა +1`).
- Declarations are made on the felt: "პასი" and 1…N, the dealer's forbidden value is struck
  through, and the panel shows how much is declared and how much is left to fill.
- **Declared 0 is shown as "პასი"** (`bidLabel` in `ui/labels.ts`) on the bid buttons, seat
  bubbles, compact sheet and full sheet. The engine and the API keep `0`; points of 0 stay `0`.
- Score sheet: a compact panel (a strip above the table; a side panel with the current set on wide
  screens) and a full sheet (all sets, every deal with points, declaration → tricks, set
  subtotals with bonuses, sticky player header and totals, current deal highlighted).

## Japanese Joker

Duel table: each player's five stacks show the covered card peeking out under the open card.
Playable open cards are lifted with a teal edge and can be played straight from the table; a
card revealed by a flip carries a gold marker; a legend explains open / covered / playable /
revealed. Trump and the trick count (`11 : 7 / 18`) sit beside the duel trick.

## Bura

Three-card: opponent's face-down hand, the stock with the trump card turned crosswise under the
deck, trick sets placed toward each player (the set currently winning is outlined), captured
piles on the seats, the 31 meter when the memory aid is on. Five-card: partner opposite,
opponents left and right with team tags, a team score plaque and the deal value (×1…×6) in the
HUD. Lead / Beat / Throw / Var / Continue / Accept / Raise / Fold live in an action bar between
the table and the hand.

## Lobby

Hero with a fan of real cards, then one premium tile per game (Joker, Japanese Joker, Bura) with
card-art on felt, description, the game's modes and Play (online rooms) / Practice buttons.

## Responsive layout

Boards are container queries on `.pboard`. Phones (< 640 px of board): the app header and tab bar
step aside at the table (each table bar has its own back button), the HUD is one line, side seats
become compact columns, the declaration panel may extend over the side seats (every bid stays
visible in the score strip). Nothing needs drag; touch targets are ≥ 44 px.

## Motion

Transform / opacity only: deal (staggered), card flights, trick hold-and-sweep, declaration
bubble pop, notices, sheets. The turn ring rotates on the compositor. `prefers-reduced-motion`
and hidden tabs stop all of it (global rules in `styles.css`; flights check it in `motion.ts`).

## JokerStars research (2026-11-26)

Studied as a functional UX reference (not copied): a free "fun" table, classic 4-player Joker.

- Lobby per game with Fun / Rated / Password tabs; mode tiles (Classic, 4 nines, 2 nines) show
  the khishti value and seat-fill icons; clicking a tile queues you.
- Table: four circular avatars around a rounded table, a "bid | taken" chip under each avatar,
  a dealer "D", a countdown ring on the active player; a declaration flashes on the avatar.
- The declaration panel sits in the centre and shows "needed to fill: N"; pass is a dash and the
  dealer's forbidden value is greyed — **adopted** (as "პასი" and the declared plaque).
- The trump card lies face up beside the trick with a running "შეტენვა: N" (under-declared) label —
  **adopted** as the declared-total plaque.
- Trick cards form a cross toward each player; a finished trick flies to the winner as a face-down
  stack — **adopted** with larger cards and a gold winner highlight before the sweep.
- The score sheet is always on the table: per player a declaration and a points column, rows per
  deal, set subtotals in hundreds, failed bids as "---" — **adopted** as the compact + full sheet,
  drawn as a paper ოქმი (ivory paper, ruled lines, red margin): deal cells keep the written points
  (300, 30, −500) with the declaration in the corner, every sum counts in hundreds (3.0, 0.3), erased
  deals are struck through and a premia deal carries a star (owner's request 2026-11-27).
- Cards are small and need tap-to-lift, tap-to-play; a slow player is marked away and a bot takes
  over — **improved**: large cards, single click on desktop, two taps only on touch screens.
