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

| Concept | English (`en`) | Georgian (`ka-GE`) | Grammar & Usage Notes |
|---|---|---|---|
| Bid | Bid | ნათქვამი | Declared number of tricks |
| Tricks won | Won / Tricks | წაღებული | Tricks captured in current hand |
| Set (4/8 hands) | Set | პულკა | Traditional Georgian Joker set |
| Undertrick penalty | Khishti penalty | ხიშტის ჯარიმა | Classic Georgian Joker penalty |
| Score sheet | Scoreboard | ცხრილი | Natural Georgian player term |
| Joker genitive / instrumental | Joker's / with Joker | ჯოკრის / ჯოკრით | Syncopated stem (*ჯოკრის*, not *ჯოკერის*) |
| Joker demand | Joker demand | ჯოკრის მოთხოვნა | Japanese Joker mechanic |

---

## 3. Bura (3-Card & 5-Card)

| Concept | English (`en`) | Georgian (`ka-GE`) | Notes |
|---|---|---|---|
| Lead | Lead | ჩამოსვლა | Leading same-suit card(s) |
| Beat | Beat | გაჭრა | Beating the led combo |
| Throw face down | Throw face down | გატანება (დახურულად) | Standard Georgian Bura term (*გატანება*) |
| Declare 31+ | Open (31+) | გახსნა (31+) | Ending hand with 31+ points |

---

## 4. Poker (Texas Hold'em, 6+ Short Deck, Omaha, Omaha Hi-Lo)

Established Georgian poker room & Crocobet conventions use transliterated international poker action terms rather than artificial literal translations:

| Concept | English (`en`) | Georgian (`ka-GE`) | Notes |
|---|---|---|---|
| Texas Hold'em | Texas Hold'em | ტექსას ჰოლდემი | Standard Georgian orthography (*ტექსას*, not *ტეხას*) |
| 6+ Short Deck | 6+ Hold'em (Short Deck) | 6+ ჰოლდემი (Short Deck) | 36-card variant |
| Hole cards / Community cards | Hole cards / Community cards | ჯიბის კარტი / საერთო კარტები | Private vs board cards |
| Pot / Chips / Blinds | Pot / Chips / Blinds | ბანკი / ჩიპები / ბლაინდები | Core betting terms |
| Actions | Fold / Check / Call / Bet / Raise / All-in | ფოლდი / ჩეკი / ქოლი / ბეთი / რეიზი / ოლ-ინი | Standard Georgian poker table actions |
| Streets | Preflop / Flop / Turn / River / Showdown | პრეფლოპი / ფლოპი / თერნი / რივერი / შოუდაუნი | Localized street progression |
| Hand ranks | Pair / Two Pair / Trips / Straight / Flush / Full House / Quads / Straight Flush | წყვილი / ორი წყვილი / სეტი / სტრიტი / ფლეში / ფულ-ჰაუსი / კარე / სტრიტ-ფლეში | Shown at showdown |

---

## 5. Dominoes & Backgammon (Nardy)

| Concept | English (`en`) | Georgian (`ka-GE`) | Notes |
|---|---|---|---|
| Tile / Boneyard | Tile / Boneyard | ქვა / ბაზარი | Traditional Georgian dominoes terms |
| Point (Backgammon) | Point | უჯრა | Georgian Nardy term (avoids Russian calque *პუნქტი*) |
| Bar / Bear off | Bar / Borne off | ბარი / გაყვანილი | Georgian Nardy checker movement terms |
| Doubling cube | Doubling cube | გაორმაგების კუბი | Match doubling cube |

---

## 6. Placeholder Morphology Rule

Usernames (`{name}`) can end in either vowels or consonants in Georgian and Latin scripts. Georgian strings MUST NOT attach case suffixes directly to `{name}` (such as `{name}-მა` or `{name}-ის`), which produce broken forms on vowel-final names. Use nominative phrasing (`{name} შემოუერთდა ოთახს`, `სვლაზეა: {name}`, `{name} — ბურა!`).
