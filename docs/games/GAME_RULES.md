# Croco Games — Game Rules & Engine Specifications

All ten game modes run as independent, server-authoritative engines inside `packages/game-engine/src/games/`. Every rule variation documented here is configurable at room creation and validated strictly on the server.

**Source of the rules (2026-11-25):** the owner's handbook _„თამაშების წესები და ტერმინების ლექსიკონი"_ (10 games, rules and glossary), which cites pagat.com (Joker), mygame.ge (Japanese Joker), parabura.ge (Bura), nardeon.com (long nardi), tamashebi.cc (dominoes) and PokerStars (poker). Where the handbook leaves a detail open, the choice made here is marked **Interpretation**. House variants stay available as room options but are off by default.

---

## 1. Joker (`joker`) — ჯოკერი

- **Players**: 4, no partners · **Deck**: 36 cards (6–A), the black sixes `6S`, `6C` replaced by jokers `X1`, `X2`.
- **Two games** (`ruleset`):
  - **Standard** — 24 deals in four sets: 1→8 cards, four 9-card deals, 8→1 cards, four 9-card deals.
  - **ცხრიანები (nines)** — 16 deals in four sets of four, every deal nine cards. Same bidding, play and scoring; the set bonus is applied per set of four. Selectable at room creation and in practice (`#/practice/joker?ruleset=nines`).
- **Trump**: in 1–8-card deals the next card of the pack is turned; a turned joker means no trump ("ბეზი"). In 9-card deals the dealer's last card shows trump (house variant `nineTrump: "choose"`).
- **Bidding (თქმა)**: from the dealer's left; the dealer bids last and may not make the bids add up to the number of cards (`dealer_bid_forbidden`).
- **Trick play (ვაზი)**: follow the led suit; without it you must trump; otherwise any card. A joker may always be played. The trick goes to the highest trump, else the highest card of the led suit.
- **Joker** (Georgian table terms): leading with a joker (**წაყვანა**) is either **მაღალი** + a suit (the others must give their highest card of it; the joker takes) or **წაიყვანოს** + a suit (the highest card of that suit takes; the joker does not). A following joker is either **მოჯოკვრა** (it takes the trick) or **გატანება** (it goes low). In the engine these are `mode: "high" | "low"`. A high joker wins unless a later high joker is played (the later one wins) or — when it led a non-trump suit — a player without that suit trumps it (`ledJokerTrumped: "trumpWins"`). A low joker loses, except a led low joker wins when nobody played the suit, a trump or a high joker.
- **Scoring**: exact bid `k` → `50 × k + 50`; bid 0 and took 0 → `50`; bid and took every trick → `100 × cards`; missed bid → `10 × tricks taken`.
- **Table rules chosen before the game** (room creation, and the setup screen of practice; owner's request 2026-11-27):
  - **ხიშტი** (`hist`) — bid ≥ 1 and took no trick: **სტანდარტული** `perCard` (default) costs `100 × cards dealt` (9 cards → −900, 5 → −500, 3 → −300); or a fixed `fixed100` / `fixed200` / `fixed300` / `fixed500` in every deal. Legacy values `classic` (−200 / −500 in nine-card deals) and `none` stay valid for older rooms.
  - **პრემია** (`setBonus`) — a player who makes every bid of a pulka adds their best deal of that pulka (the earliest on a tie), and every other player loses one deal of it, once however many players took the premia: **ბოლო იშლება** `eraseLast` (default) — their last deal of the pulka that scored points; **ბოლო არ იშლება** `eraseHighest` — their highest deal of the pulka. A deal with 0 or fewer points is never erased. Legacy values: `simple` (no erasing), `double` (= `eraseHighest`), `none`.
- **ბოლო წაყვანილი კარტები (last trick)**: any player or spectator can open the last trick taken — the four cards in play order, how a joker was played and who took it — from the table's header. Presentation only, from the public view.
- **Score sheet (ოქმი)**: a deal's cell shows the points as written (300, 30, −500) with the declaration in its corner; every sum counts in hundreds — pulka subtotals and totals read 300 → **3.0**, 30 → **0.3**. Erased deals are struck through and the deal a premia repeated carries a star. Presentation only: the engine and the API keep whole points.

---

## 2. Japanese Joker (`japanese_joker`) — იაპონური ჯოკერი

- **Players**: 2 · **Deck**: 36 cards, black sixes are jokers · **18 tricks** per deal.
- **Deal**: 3 cards each; one player names trump or "ბეზი" (no trump) — the chooser alternates between deals — and leads. Then each receives 5 more cards to the hand (8 in hand), 5 face-down table cards and 5 face-up cards on top of them.
- **Playing**: a player's **first card of a deal comes from the hand**; afterwards the hand or the open table cards. When an open table card is played, the card under it is **turned face up** (house variants: `revealMode: "toHand"`, `lastPileToHand`).
- **Follow rules**: follow suit; without it trump; otherwise any card. The trick goes to the highest card of the led suit or the highest trump; in ბეზი only the led suit (or a joker).
- **Joker**: beats everything; a joker played on a joker wins. **Take or low** (`jokerLow`, added at the owner's request on 2026-11-26, on by default): a joker played on the opponent's card is either **მოჯოკვრა** (takes the trick) or **გატანება** (goes low and gives the trick away, also on a led joker). A **led joker names a suit** and asks for the highest card of it — the opponent must give that card or a joker. Without that (non-trump) suit the opponent must trump, and **the trump beats the joker**.
- **Scoring**: the player with more tricks scores the difference (11:7 → 4; 9:9 → nothing). Match to **1, 3, 7, 11 or 21** points (default 11).
- **Score card**: the felt shows a paper score card in the style of the Joker sheet — both players' points toward the target (pips up to 11, a bar for 21) and this deal's tricks out of 18.

---

## 3. Bura — Three-Card (`bura3`) — ბურა 3 კარტით

- **Players**: 2 (one against one) · **Deck**: 20 cards — 10, J, Q, K, A (6–9 removed); house variants 32/36 cards. Strength `A > 10 > K > Q > J`; points A 11, 10 10, K 4, Q 3, J 2 — **120 in the pack**.
- **Deal**: 3 cards each; one card is turned for trump and lies at the bottom of the stock (drawn last).
- **Trick**: lead 1–3 cards of one suit; the opponent answers with the same number — every card beaten by a distinct higher card of its suit or a trump, or the cards are thrown (face down, `closedDiscards`). Following suit is not required. The trick winner takes its points.
- **ვარ (var)**: right after winning a trick, **before the hands are refilled**, the taker chooses "var" or "continue". Var with **31+ captured points wins the deal**; with fewer the opponent wins it.
- **ბურა**: three trumps in hand on your turn win the deal at once, at its current value (played automatically).
- **მალუტკა** (any suit, standard in three-card Bura — parabura.ge, checked 2026-11-27): on your turn all three cards of one suit go down at once — as a 3-card lead, or **over a one- or two-card lead** even if they do not beat it. The leader then tops up to three (the led cards count together with the added ones) and takes the trick only by beating all three one-for-one; otherwise the malutka takes it. Three trumps are a bura, not a malutka.
- **Raises (`raises`, on by default)**: as in five-card Bura — on your own turn (leading or answering), the two players alternating: დავი ×2, სე ×3, ჩარი ×4, პანჯი ×5, შაში ×6. The other player accepts, raises again or concedes (the raiser scores the value before the raise). parabura.ge lists the calls as a general Bura rule and says var wins "at the current value".
- **End of deal**: otherwise the deal is played out — **61+ card points wins**, 60:60 scores nothing. A deal won scores its current value (1 unless raised) — by points, var, false var (to the opponent) or bura; match to **6, 11 or 21** (default 11).
- **Interpretation**: the deal winner deals next; after 60:60 the deal passes on. A short stock is shared equally between both hands.

---

## 4. Bura — Five-Card (`bura5`) — ბურა 5 კარტით (გუნდური)

- **Players**: 4 in **two teams**, partners opposite (seats 0+2 vs 1+3) · **Deck**: 36 cards (6–A), strength `A > 10 > K > Q > J > 9 > 8 > 7 > 6`, 120 points.
- **Deal**: 5 cards each; one card turned for trump at the bottom of the stock; hands are refilled after every trick (winner first, as far as the stock goes).
- **Trick**: lead 1–5 cards of one suit; everyone answers with the same number. A player takes the trick only by beating **every** card of the current best set with a distinct higher card of its suit or a trump. Partners may throw point cards (A, 10) onto a trick their partner is winning.
- **მალუტკა**: when an **opponent leads a single card** and all five of your cards are of one suit and beat it, you may lay all five at once — they become the new target (the players still to answer must beat all five).
- **Host option "მალუტკა ნებისმიერი ფერით"** (`malutkaAnySuit`, off by default; parabura.ge): a full hand of one suit (not all trumps) goes down on your turn **whatever the size of the lead** (one to four cards) and need not beat it. Everyone else then answers it in turn: players who already played **top up to five** (their earlier cards count together with the added ones), the others lay five. A player takes over only by beating all five one-for-one; the set to beat is always the last one that did.
- **ბურა**: a full hand of five trumps, shown on your turn, wins the deal at once at its current value (including accepted raises).
- **Raises (გამოძახებები)** — only on your own turn, teams alternate: ჩვეულებრივი ×1, დავი ×2, სე ×3, ჩარი ×4, პანჯი ×5, შაში ×6. The next opponent answers: **accept** (play on at the new value), **raise again** (one step more) or **concede** (the deal ends; the raising team scores the value before the raise; card points are not counted).
- **End of deal**: the team with **61+ points** scores the deal value; 60:60 scores nothing. Match to **6, 11 or 21** (default 11).
- **Interpretation**: the player answering a raise is the next seat clockwise (always the other team); the deal rotates clockwise.

---

## 5. Poker Family (`holdem`, `shortdeck`, `omaha`, `omaha_hilo`)

> **Virtual Entertainment Chips Only**: all poker variants use temporary virtual match chips (default `1000`). No real-money wagers, deposits, withdrawals, or chip purchases exist anywhere in the platform.

Common mechanics: Preflop → Flop (3) → Turn (1) → River (1) → Showdown, burn cards, rotating button, `fold` / `check` / `call` / `raise { to }` / `allin`, No-Limit, Pot-Limit (max raise = pot after the call) and Fixed-Limit (4-bet cap), side pots, refunds of uncalled bets, chip conservation on every step.

### 5.1 Texas Hold'em (`holdem`) — ტეხას ჰოლდემი

- **Players**: 2–10 · 52 cards · 2 hole cards · best five of seven (both, one or none of the hole cards). Small and big blind left of the button.

### 5.2 6+ Hold'em / Short Deck (`shortdeck`)

- **Players**: 2–6 · 36 cards (6–A) · 2 hole cards.
- **Forced bets (`shortDeckBlinds: "button"`, default)**: everyone pays the **ante** (the small-blind amount unless an ante is set) and the button pays the **Button Blind** (the big-blind amount); there are no small/big blinds; action starts left of the button. House variant `"blinds"`: classic SB/BB.
- **Ranking**: Royal Flush › Straight Flush › Four of a Kind › **Flush › Full House** › Straight › Three of a Kind › Two Pair › Pair › High Card; `A-6-7-8-9` is the lowest straight. House variant `tripsBeatStraight` (off by default).

### 5.3 Omaha (`omaha`)

- **Players**: 2–10 · 52 cards · 4 hole cards · default **Pot-Limit (PLO)**. Exactly **2 hole + 3 board** cards (all 60 combinations evaluated).

### 5.4 Omaha Hi-Lo (`omaha_hilo`)

- **Players**: 2–10 · 4 hole cards · default Pot-Limit. Half the pot to the best High, half to the best **8-or-better Low** (five distinct ranks ≤ 8, ace low, exactly 2 hole + 3 board, `5-4-3-2-A` is best); no qualifying low → High scoops; ties split each half.

---

## 6. Dominoes (`dominoes`) — დომინო (ქართული ონლაინ მოდელი)

- **Players**: 2 · 28-tile double-six set · 7 tiles each; the rest is the **ბაზარი** (bazaar).
- **Opening**: round 1 is opened by the highest double (no double → heaviest tile); later rounds by the previous winner.
- **სტავკა**: the first double of a round lies across the chain and opens two more directions (up / down). Later doubles are ordinary tiles and open no branch.
- **Scoring by fives**: after every move the open ends are added up; a multiple of 5 scores that many points for the mover.
  - **Interpretation**: an uncovered სტავკა counts **both halves, once**, while any of its sides (left, right, up or down) is still open; a lone first tile counts its total; ordinary doubles at an end count one half.
- **Bazaar**: without a playable tile you draw one at a time until a tile fits; **the last two bazaar tiles are never drawn**; if nothing can be drawn you pass. (House variant `block`: no drawing.)
- **დომინო**: playing your last tile scores the opponent's remaining pips **rounded to the nearest 5**.
- **რიბა** (blocked — both players pass): fewer pips wins the opponent's pips **rounded up to a multiple of 5**; equal pips is a draw.
- **Match**: first to `scoreLimit` (default 100, 50–500); reaching it during play ends the match.

---

## 7. Long Nardi (`backgammon`) — გრძელი ნარდი

The game id stays `backgammon` so rooms, ratings and leaderboards are unchanged; the rules are long nardi.

- **Players**: 2 · 15 stones each · 24 points. Every stone starts on the player's **თავი** (head, point 24 for each player); the heads are diagonally opposite (each player's head is the other's point 12). Both move the same way round the whole board to their **სახლი** (home, points 1–6).
- **Start**: each player rolls one die; the higher starts and then rolls both dice (each game).
- **Moving**: each die is a separate move (one stone may use both if the middle point is free); doubles are played four times. A stone may land on an empty point or its own stones, **never on a point holding any opponent stone — there is no hitting**.
- **Head rule**: one stone may leave the head per turn; on a player's **first turn of a game, 6-6, 4-4 or 3-3 allow two**.
- **Six-point block**: six consecutive points may not be held unless at least one opponent stone has already passed them (or the opponent has borne off); five in a row is always allowed. The head counts as a held point.
- **Compulsory play**: both dice if possible; if only one can be played, the larger; no move → the turn passes.
- **Bearing off (ქვის გატანა)**: once all 15 stones are home: a die removes a stone from its point; if that point is empty the die is played inside home; a larger die removes the farthest stone only when no stone is higher.
- **Scoring**: win 1 point, **მარსი** (opponent bore off none) 2 points; no koks, no doubling cube. Match to **1, 3, 5 or 7** (default 3).
