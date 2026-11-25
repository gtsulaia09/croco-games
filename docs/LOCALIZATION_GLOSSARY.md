# Croco Games — Georgian Localization & Gaming Terminology Glossary

This glossary defines the canonical Georgian (`ka-GE`) and English (`en`) terminology used across **Croco Games**. Every UI component reads from centralized translation dictionaries (`apps/web/src/i18n/ka.ts` and `apps/web/src/i18n/en.ts`), verified automatically by `apps/web/src/i18n/i18n.test.ts`.

---

## 1. Core Platform & Multiplayer Terms

| Concept | English (`en`) | Georgian (`ka-GE`) | Notes |
|---|---|---|---|
| Card / Cards | Card / Cards | კარტი / კარტები | Unified on *კარტი* (never mix *ბანქო* and *კარტი*) |
| Deck / Stock | Deck | დასტა | Remaining draw pile |
| Suit | Suit | მასტი | ♠ ყვავი, ♥ გული, ♦ აგური, ♣ ჯვარი |
| Trump / No trump | Trump / No trump | კოზირი / უკოზირო | Card-game trump suit |
| Turn | Your turn / Waiting for | შენი სვლაა / სვლაზეა: {name} | Avoids case-suffix attachment to `{name}` |
| Seconds | `{s}s` | `{s} წმ` | Standard Georgian abbreviation for *წამი* |
| Room / Host | Room / Host | ოთახი / მასპინძელი | Multiplayer room & room owner |
| Spectator | Spectator / Spectating | მაყურებელი / მაყურებლის რეჟიმი | Read-only observer |
| Match / Round / Hand | Match / Round / Hand | მატჩი / რაუნდი / დარიგება | Consistent hierarchy across games |
| Leaderboard / Rating | Leaderboard / Rating | ლიდერბორდი / რეიტინგი | Established Georgian gaming usage |
| Admin badge | `Admin` | `Admin` | Preserved verbatim per platform security spec |
| Moderator | Mod | მოდერატორი | Staff moderation role |
| Disconnect / Reconnect | Offline / Reconnecting | კავშირგარეშე / მიმდინარეობს აღდგენა | Network status labels |

---

## 2. Joker & Japanese Joker

Terms follow the owner's rules handbook (*„თამაშების წესები და ტერმინების ლექსიკონი"*, 2026-11-25).

| Concept | English (`en`) | Georgian (`ka-GE`) | Grammar & Usage Notes |
|---|---|---|---|
| Trick | Trick | ვაზი | One round of play (handbook: *ვაზი / ხრიკი*) |
| Bid | Bid | ნათქვამი (თქმა) | Declared number of tricks |
| Tricks taken | Taken / Tricks | აღებული / ვაზი | Tricks captured in the current deal |
| No trump | No trump (bez) | ბეზი | Handbook term (replaces *უკოზირო*) |
| Set (8/4 deals) | Set | სეტი | Handbook term (replaces *პულკა*) |
| Undertrick penalty | Khishti | ხიშტი | House variant, off by default |
| Score sheet | Score sheet | ქულების ცხრილი | |
| Joker genitive / instrumental | Joker's / with Joker | ჯოკრის / ჯოკრით | Syncopated stem (*ჯოკრის*, not *ჯოკერის*) |
| Joker demand | Joker demands | ჯოკერი ითხოვს | Japanese Joker: the led joker names a suit |

---

## 3. Bura (3-Card & 5-Card)

| Concept | English (`en`) | Georgian (`ka-GE`) | Notes |
|---|---|---|---|
| Lead | Lead | დაწყება | Handbook: *დაწყება / წამყვანი* |
| Beat | Beat | გაჭრა | Beating the led cards |
| Throw face down | Throw face down | გატანება (დახურულად) | Established Georgian Bura term |
| Early claim (3-card) | Var | ვარი | 31+ points right after winning a trick |
| Continue | Continue | გაგრძელება | Declining var |
| Five trumps / three trumps | Bura | ბურა | Wins the deal at once |
| One-suit hand | Malutka | მალუტკა | Replaces the old *მოლოდკა* |
| Raises ×2…×6 | Davi / Se / Chari / Panji / Shashi | დავი / სე / ჩარი / პანჯი / შაში | 5-card team Bura; ×1 is *ჩვეულებრივი* |
| Accept / concede a raise | Accept / Concede | თანხმობა / დათმობა | |
| Partner / team | Partner / Our team / Opponents | პარტნიორი / ჩვენი გუნდი / მეტოქეები | |

---

## 4. Poker (Texas Hold'em, 6+ Short Deck, Omaha, Omaha Hi-Lo)

Georgian poker rooms use transliterated international action terms; the handbook keeps the English names (Fold, Check, …) in explanations.

| Concept | English (`en`) | Georgian (`ka-GE`) | Notes |
|---|---|---|---|
| Texas Hold'em | Texas Hold'em | ტეხას ჰოლდემი | Handbook spelling (*ტეხას*) |
| 6+ Short Deck | 6+ Hold'em (Short Deck) | 6+ ჰოლდემი (Short Deck) | Ante + Button Blind by default |
| Hole cards / Community cards | Hole cards / Community cards | ჯიბის (პირადი) კარტი / საერთო კარტები | Private vs board cards |
| Pot / Chips / Blinds | Pot / Chips / Blinds | ბანკი / ჩიპები / ბლაინდები | Core betting terms |
| Ante / Button Blind | Ante / Button Blind | ანტე / Button Blind | 6+ forced bets |
| Actions | Fold / Check / Call / Bet / Raise / All-in | ფოლდი / ჩეკი / ქოლი / ბეთი / რეიზი / ოლ-ინი | Standard Georgian poker table actions |
| Streets | Preflop / Flop / Turn / River / Showdown | პრეფლოპი / ფლოპი / თერნი / რივერი / შოუდაუნი | |
| Hand ranks | Pair / Two Pair / Trips / Straight / Flush / Full House / Quads / Straight Flush | წყვილი / ორი წყვილი / სეტი / სტრიტი / ფლეში / ფულ-ჰაუსი / კარე / სტრიტ-ფლეში | Shown at showdown |

---

## 5. Dominoes & Long Nardi

| Concept | English (`en`) | Georgian (`ka-GE`) | Notes |
|---|---|---|---|
| Tile / Bazaar | Tile / Bazaar | ქვა / ბაზარი | Last two bazaar tiles are never drawn |
| First double (spinner) | Stavka | სტავკა | Opens up / down |
| Open ends | Open ends | ღია ბოლოები | Their sum scores in fives |
| Last tile played / blocked board | Domino / Riba | დომინო / რიბა | Round-end scoring |
| Long nardi | Long Nardi | გრძელი ნარდი | The game formerly labelled backgammon |
| Point | Point | უჯრა | Avoids the calque *პუნქტი* |
| Head / Home | Head / Home | თავი / სახლი | Starting point / last six points |
| Bear off | Borne off | გატანილი (ქვის გატანა) | Replaces *გაყვანილი* |
| Win with opponent bearing off none | Mars | მარსი | 2 points |

---

## 6. Placeholder Morphology Rule

Usernames (`{name}`) can end in either vowels or consonants in Georgian and Latin scripts. Georgian strings MUST NOT attach case suffixes directly to `{name}` (such as `{name}-მა` or `{name}-ის`), which produce broken forms on vowel-final names. Use nominative phrasing (`{name} შემოუერთდა ოთახს`, `სვლაზეა: {name}`, `{name} — ბურა!`).
