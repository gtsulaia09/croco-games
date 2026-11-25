# Croco Games — Game Rules & Engine Specifications

All ten game modes run as independent, server-authoritative engines inside `packages/game-engine/src/games/`. Every rule variation documented here is configurable at room creation and validated strictly on the server.

---

## 1. Joker (`joker`) — Georgian Classic (ჯოკერი)

- **Players**: 4 · **Deck**: 36 cards (6–A, with the two black sixes `6S`, `6C` replaced by two Jokers `X1`, `X2`).
- **Default ruleset (`standard`)**: follows traditional Georgian Joker (24 hands in 4 sets: Set 1 = 1→8 cards; Set 2 = four 9-card hands; Set 3 = 8→1 cards; Set 4 = four 9-card hands). Configurable variant `nines` plays two 4-hand sets of 9-card hands (8 hands total).
- **Trump determination**:
  - Hands of 1–8 cards: next card after dealing is turned face up for trump (if a Joker, no-trump).
  - 9-card hands: `nineTrump: "lastCard"` (default: dealer's last card revealed as trump) or `"choose"` (player left of dealer chooses a suit or `none` after seeing 3 cards, then remaining 6 cards are dealt).
- **Bidding**: clockwise starting left of dealer. **Dealer restriction**: the dealer's bid may not make the sum of all 4 bids equal the number of cards dealt in that hand (`dealer_bid_forbidden`).
- **Trick play & Joker rules**:
  - Must follow led suit; if void, must trump (when trump exists); otherwise any card. Jokers may be played anytime.
  - **Leading a Joker**: must declare `mode: "high" | "low"` and a `suit`. A high Joker demands opponents play their **highest** card of that suit (if holding it). `ledJokerTrumped` controls whether a trump played by a void opponent beats a led high Joker (`"trumpWins"`, default) or not (`"jokerWins"`). A low Joker loses to any card of the named suit (or trump), winning only if no opponent holds the named suit or trumps.
  - **Following with a Joker**: declare `high` (beats everything played so far; second high Joker beats the first) or `low` (always loses).
- **Scoring**:
  - Exact bid = 0 (Pass): `+50`.
  - Exact bid `k` (1 ≤ k < cards): `+50 + 50 × k`.
  - Exact bid = all cards ("Pass/Full sweep"): `+100 × cards`.
  - Missed bid (`tricks > 0`): `+10 × tricks`.
  - **Hist (khishti) penalty** (`hist: "classic"`, default): bidding ≥ 1 and taking 0 tricks scores `-200` (Sets 1 & 3) or `-500` (Sets 2 & 4); configurable `"none"`.
  - **Set bonus** (`setBonus`): if a player makes every bid in a set, `"simple"` (default) adds their best hand score from that set; `"double"` doubles their best hand and erases the best hand of other players in that set; `"none"` disables bonuses.
- **Bots (`easy`/`medium`/`hard`)**: estimate trick strength from trumps, high cards, and jokers; avoid forbidden dealer bids; manage exact-trick targeting (dumping high cards once bid is met).

---

## 2. Japanese Joker (`japanese_joker`) — იაპონური ჯოკერი

A **distinct 2-player Georgian card game**, not a reskinned Joker:

- **Players**: 2 · **Deck**: 36 cards (black sixes replaced by `X1`, `X2`).
- **Deal & Trump**:
  1. Each player receives 3 cards; the non-dealer names trump (suit or `none`).
  2. Each player then receives 5 face-down table cards covered by 5 face-up table cards, plus 5 more cards to their hand (18 cards per player = full 36-card deck).
- **Playing & Revealing**:
  - Players may play from their hand or from their face-up table cards.
  - Playing a face-up table card reveals the covered card beneath: `revealMode: "toHand"` (default: moves secretly into player's hand) or `"flip"` (flips face up on table). With `lastPileToHand: true` (default), when only one intact pile remains on a player's table, both cards move to hand.
  - Must follow suit across available hand + face-up table cards; if void, must trump; Jokers beat everything (second Joker beats first).
- **Joker Demand**: when leading a Joker, the leader must either demand a specific visible face-up opponent table card (`{ kind: "card", card }`) or demand the opponent's highest card of a chosen suit (`{ kind: "highest", suit }`).
- **Scoring & Winning**: every card won counts as **0.5 points** (36 cards = 18 points/round). The round winner scores the point difference `|won₀ - won₁| / 2`. First player to `targetPoints` (default `20`, range 5–50) wins the match.

---

## 3. Bura — Three-Card (`bura3`)

- **Players**: 2–4 · **Deck**: 36 cards (default) or 32 cards (`7`–`A`).
- **Card ranking & values**: `A (11) > 10 (10) > K (4) > Q (3) > J (2) > 9 (0) > 8 (0) > 7 (0) > 6 (0)` (total = 120 points in both packs).
- **Deal**: 3 cards per player; trump indicator lies face up at the bottom of the stock and is drawn last. Hands refill to 3 from stock after each trick.
- **Trick play**:
  - Leader plays 1–3 cards of the **same suit**.
  - Respondents either `beat` (matching every led card with a distinct higher card of the same suit or trump) or `discard` the same count of cards (`closedDiscards: true` default hides discarded cards from opponents until hand end).
- **Declarations & Winning a Hand**:
  - **Bura (3 trumps in hand)**: wins the hand immediately.
  - **Opening / Claiming (`claim`)**: on their lead after winning at least one trick, a player may open and claim ≥ **31 card points** in their captured pile. If true, claimer scores 1 point (+ carried draws); if false (`< 31`), every opponent scores 1 point.
  - Optional variations: `combinations` (Molodka = 3 non-trumps of one suit, or 3 aces take the lead), `threeAcesWin`, and `memoryAid` (display known captured points; off by default).
- **Match win**: first player to `targetPoints` (default `7`, range 3–21).

---

## 4. Bura — Five-Card (`bura5`)

An **independent 5-card engine** (not a cosmetic variant of 3-card Bura):

- **Players**: 2–3 · **Deck**: 36 (default) or 32 cards · **Hand size**: 5 cards (refilled after each trick).
- **Play**: leader plays 1–`maxLead` (`3` default, or `5`) cards of one suit; respondents beat or discard (face down by default). **No mid-hand opening claims and no instant Bura/combination wins** — every hand plays to the last card so all 120 card points are accounted for.
- **Penalty Scoring (Kozel-style)**:
  - Hand winner (highest card points): `0` penalties (or `2` each on a tied top score).
  - Loser who took `0` tricks: `+6` penalties.
  - Loser below threshold (`< 31` in 2-player, `< 21` in 3-player): `+4` penalties.
  - Loser at or above threshold: `+2` penalties.
- **Match win**: match ends once any player reaches `penaltyLimit` (default `12`, range 6–24). Lowest total penalties wins.

---

## 5. Poker Family (`holdem`, `shortdeck`, `omaha`, `omaha_hilo`)

> **Virtual Entertainment Chips Only**: all poker variants use temporary virtual match chips (default `1000`). No real-money wagers, deposits, withdrawals, or chip purchases exist anywhere in the platform.

Common mechanics across all four variants (`packages/game-engine/src/games/poker/`):
- **Streets**: Preflop → Flop (3) → Turn (1) → River (1) → Showdown, with burn cards, rotating dealer button, blinds, optional antes, and optional blind escalation (`blindLevelHands`).
- **Actions**: `fold`, `check`, `call`, `raise { to }`, `allin`. Supports `no_limit`, `pot_limit` (default for Omaha/Hi-Lo), and `fixed_limit` (4-bet street cap).
- **All-in & Side Pots**: `buildPots` slices main and side pots accurately across unequal stacks; short all-in raises below a full raise increment do not reopen betting for players who already acted; uncalled bets are refunded; chip conservation (`Σ(chips + pot) === constant`) is verified on every step.

### 5.1 Texas Hold'em (`holdem`)
- **Players**: 2–9 · **Deck**: 52 cards · **Hole cards**: 2 · Best 5 of 7 cards using standard rankings (`High Card` → `Straight Flush`, wheel `A-2-3-4-5`).

### 5.2 Short Deck / 6+ Hold'em (`shortdeck`)
- **Players**: 2–6 · **Deck**: 36 cards (`6`–`A`) · **Hole cards**: 2.
- **Modified rankings**: **Flush beats Full House**; wheel straight is **`A-6-7-8-9`**; configurable `tripsBeatStraight` (`true` by default, Triton/GG style, or `false`).

### 5.3 Omaha (`omaha`)
- **Players**: 2–9 · **Deck**: 52 cards · **Hole cards**: 4 · **Default betting**: Pot-Limit.
- **Strict evaluation**: `bestOmahaHand` evaluates all $\binom{4}{2} \times \binom{5}{3} = 60$ combinations using **EXACTLY 2 private hole cards and EXACTLY 3 community cards**.

### 5.4 Omaha Hi-Lo (`omaha_hilo`)
- **Players**: 2–9 · **Deck**: 52 cards · **Hole cards**: 4 · **Default betting**: Pot-Limit.
- **Split pot**: each pot splits 50/50 between the best High hand and the best qualifying **8-or-better Low hand** (Ace-to-Five low, 5 distinct ranks ≤ 8 using **exactly 2 hole + 3 board cards**; `A-2-3-4-5` is the nut low). If no low qualifies, High scoops the entire pot. Odd chips go to the earliest seat left of the button.

---

## 6. Dominoes (`dominoes`)

- **Players**: 2–4 · **Set**: standard 28-tile double-six set (168 total pips).
- **Deal & Opening**: 7 tiles per player (configurable 5–7 for 2–3 players). Round 1 opens with the highest double dealt; subsequent rounds open with the previous round winner.
- **Variants**:
  - `draw` (default): remaining tiles form the boneyard; when unable to play, player must `draw` until playable or boneyard empties, then `pass`.
  - `block`: no boneyard; unable to play → `pass`.
- **Scoring & Match Win**:
  - Domino (emptying hand): winner scores sum of pips left in all opponents' hands.
  - Blocked game (all players pass consecutively): lowest hand pip total wins the sum of opponents' pips (tie = 0 points).
  - First player to `scoreLimit` (default `100`, range 50–500) wins.

---

## 7. Backgammon (`backgammon`)

- **Players**: 2 · **Checkers**: 15 each (starting at 167 pips each).
- **Dice & Movement**: server-rolled CSPRNG dice (`rollDie`). Doubles grant 4 moves. Enforces full standard rules:
  - Must enter from the bar (`25`) before moving any board checker.
  - Single opponent blot is hit and sent to bar; ≥ 2 opponent checkers block a point.
  - Bearing off (`0`) allowed only when all 15 checkers are in home board (points 1–6); exact roll or higher die only from the highest occupied point.
  - **Compulsory play**: must use both dice when any legal 2-die sequence exists; if only one die can be played, must play the **larger** die.
- **Doubling Cube & Match Play**:
  - Configurable `matchLength` (`1, 3, 5, 7, 9, 11`, default `5`), `doublingCube` (`true`), and `crawford` (`true` — forbids doubling in the first game when either player is 1 point from winning).
  - Single win = `1 × cube`; Gammon (loser bore off 0) = `2 × cube`; Backgammon (loser bore off 0 and still has checker on bar or in winner's home board) = `3 × cube`; Dropped double = current cube value.
