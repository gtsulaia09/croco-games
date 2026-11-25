# Croco Games — Table & Card Design

The games look like a premium physical card and board club; the interface around them is a
modern Crocobet-branded app. This page is the reference for anyone changing a game board.

## Brand palette (taken from crocobet.com's own CSS variables)

| Token | Value | Use |
|---|---|---|
| `--primary-dark-blue-main` | `#00141e` | Page background (`--color-bg`) |
| `--primary-dark-blue-brighter*` | `#001e28`, `#072c38`, `#093948` | Panels, HUD chips, hover |
| `--primary-green-main` / `brighter` | `#189541` / `#27b654` | Primary buttons, "your turn", legal moves |
| `--secondary-blue` / `brighter` | `#0e5276` / `#1e77a6` | Secondary buttons (Check / Call, New game) |
| `--vip-gold-surface` (champagne) | `#c0ab7d` → `#e2c27a` | Scores, trump, pot, gold accents |
| `--functional-red` | `#bb2c2c` | Fold, danger |

Buttons are pills (`border-radius: 999px`), as on crocobet.com. Tokens live in `apps/web/src/styles.css`.

## Where things are

| File | What |
|---|---|
| `apps/web/src/games/table.css` | Every table material and game component (loaded only with a game, ~7 KB gz) |
| `apps/web/src/games/cards.tsx` | `PlayingCard`, `CardHand` (fanned, overlapping hand), `CardSlot` |
| `apps/web/src/games/cardOrder.ts` | Hand order (see below) — unit-tested in `cardOrder.test.ts` |
| `apps/web/src/games/common.tsx` | HUD (`TurnBar`), seat plates (`SeatTag`), `GameTable` frame, chips, suit picker |
| `apps/web/src/games/buraParts.tsx` | Bura deck-with-trump, trick, captured pile, meter |

## Each game has its own table

| Game | Rail | Surface | Character |
|---|---|---|---|
| Joker | walnut | classic green felt | 4 seats around the table, trick laid in a cross, bidding on the felt |
| Japanese Joker | black lacquer, vermilion pinstripe | indigo felt | duel: two rows of five table stacks |
| Bura (3) | mahogany | wine-red felt | deck with the trump card turned under it, 3 large cards |
| Bura (5) | oak | petrol-teal felt | same mechanics, 5-card hand, penalty meters |
| Poker | padded black leather with stitching, wooden racetrack | green / burgundy (6+) / blue (Omaha) / violet (Hi-Lo) | stadium table, seats on the rail, chip stacks, dealer button, betting line |
| Dominoes | walnut | wooden plank table top | ivory tiles with brass spinner, chain snakes across rows, tiles stand on a wooden rack |
| Backgammon | walnut case (SVG) | green leather field | ivory/burgundy inlaid points, ridged ivory and ebony checkers, brass hinges, ivory dice |

## Cards

- One small SVG per card: double-ended corner indices (serif), real pip layouts for 2–10,
  framed court cards, jester jokers (red `X1`, black `X2`), Croco-green lattice back.
- Sizes `xs | sm | md | lg` are CSS variables (`--cw`), height is always `1.4 × width`.
- **Hand order**: jokers first, then the trump suit, then the other suits alternating black / red;
  inside a suit, highest to lowest. Bura uses its own strength (A, 10, K, Q, J, 9…).
  Presentation only — the engines never see this order.

## Interaction states

| State | Look |
|---|---|
| Legal card / tile (your turn) | raised 8 px; on hover raised more with a green edge |
| Not legal right now | shaded (still readable), not clickable |
| Selected (Bura) | raised 22 px, gold ring and a check badge |
| Active player | seat plate with a green ring and glow; HUD pill "შენი სვლაა" turns green |
| Offline player / bot playing for them | dashed amber plate + flag / blue "ბოტი თამაშობს" flag |
| Backgammon | movable checkers ringed green, chosen checker gold, targets shaded green with the distance |

Controls never sit on top of cards: Joker bidding and trump choice use the empty centre of the
felt; every other action bar is below the table. Everything works by tap/click; nothing needs drag.

## Motion (transform / opacity only)

Deal (staggered), card played flies in from the player's side, community cards flip, bets slide
toward the pot and the pot pops, dominoes slide into place, dice tumble, checkers settle. Nothing
loops while the table is idle; `prefers-reduced-motion` and hidden tabs stop all of it.

## Layout

Boards are CSS container queries on `.board`, so a table adapts to its own width (phone, tablet,
or next to the chat panel) rather than the window. Below 620 px: Joker seats stack around the
trick, poker turns into a tall table with opponents on the upper arc, Japanese Joker stacks seats
above their piles, backgammon puts the seat plates above and below the board.
