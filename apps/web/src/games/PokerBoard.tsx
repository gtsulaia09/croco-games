import { useEffect, useState, type CSSProperties } from "react";
import { Flame, Info, Trophy } from "lucide-react";
import type { PokerVariant, PokerView } from "@croco/game-engine/games/poker";
import { useT } from "../i18n";
import { CardHand, CardSlot, PlayingCard } from "./cards";
import { sortHand } from "./cardOrder";
import { ChipIcon, ChipStack, GameTable, HudChip, opponentsOrder, SeatTag, TurnBar, useSeatName, type BoardProps } from "./common";

const VARIANT_RULE: Record<PokerVariant, string | null> = {
  holdem: null,
  shortdeck: "ui.shortDeckRule",
  omaha: "ui.omahaRule",
  omaha_hilo: "ui.omahaHiLoRule",
};

function computeBlindSeats(view: PokerView): { sb: number | null; bb: number | null } {
  const active = view.players.filter((p) => !p.busted).map((p) => p.seat);
  if (active.length < 2) return { sb: null, bb: null };
  const idx = active.indexOf(view.dealer);
  const start = idx >= 0 ? idx : 0;
  if (active.length === 2) return { sb: active[start]!, bb: active[(start + 1) % 2]! };
  return { sb: active[(start + 1) % active.length]!, bb: active[(start + 2) % active.length]! };
}

/** Seat angle (radians, 90° = bottom). Wide tables space seats evenly; tall (phone) tables keep
 * opponents on the upper arc so they never cover the community cards. */
function angleFor(k: number, n: number, tall: boolean): number {
  if (!tall || k === 0 || n <= 2) return Math.PI / 2 + (k * 2 * Math.PI) / n;
  const from = (145 * Math.PI) / 180;
  const span = (250 * Math.PI) / 180;
  return from + ((k - 1) * span) / Math.max(1, n - 2);
}

/** Where a point at angle `a` sits, as % of the table box. */
function place(a: number, r: { x: number; y: number }) {
  return { x: 50 + Math.cos(a) * r.x, y: 50 + Math.sin(a) * r.y, cos: Math.cos(a), sin: Math.sin(a) };
}

const pct = (v: number) => `${v.toFixed(2)}%`;

export default function PokerBoard({ view, mySeat, seats, deadline, onAction }: BoardProps<PokerView>) {
  const t = useT();
  const name = useSeatName(seats);
  const you = view.you;
  const myTurn = view.toAct !== null && view.toAct === mySeat;
  const [amount, setAmount] = useState(you?.raise?.min ?? 0);
  const [showRanks, setShowRanks] = useState(false);

  useEffect(() => {
    if (you?.raise) setAmount(you.raise.min);
  }, [you?.raise?.min, you?.raise]);

  const me = mySeat !== null ? view.players[mySeat] : undefined;
  const clamp = (v: number) => (you?.raise ? Math.max(you.raise.min, Math.min(you.raise.max, Math.round(v))) : v);
  const last = view.lastHand;
  const blinds = computeBlindSeats(view);
  const winnerSeats = new Set((last?.awards ?? []).map((a) => a.seat));
  const isFourCard = view.variant === "omaha" || view.variant === "omaha_hilo";
  const n = view.players.length;
  const bottom = mySeat ?? 0;
  const order = [bottom, ...opponentsOrder(n, bottom).filter((s) => s !== bottom)];
  const rule = VARIANT_RULE[view.variant];

  return (
    <div className="board">
      <TurnBar
        toAct={view.toAct}
        mySeat={mySeat}
        deadline={deadline}
        seats={seats}
        extra={
          <>
            <HudChip tone="brand">{t(`games.${view.variant}.name`)}</HudChip>
            <HudChip>{t("poker.handOf", { n: view.handNumber, max: view.maxHands })}</HudChip>
            <HudChip>
              {t("poker.blinds", { sb: view.blinds.small, bb: view.blinds.big })}
              {view.blinds.ante > 0 ? ` · +${view.blinds.ante}` : ""}
            </HudChip>
            <HudChip>{t(`poker.structures.${view.structure}`)}</HudChip>
          </>
        }
      />

      {rule && (
        <div className="flex flex-wrap items-center justify-center gap-2 text-[12px] text-[#a3acb7] text-center">
          <Info size={13} className="text-[#e2c27a] shrink-0" />
          <span>{t(rule)}</span>
          {view.variant === "shortdeck" && (
            <button type="button" className="hud-chip !h-6" onClick={() => setShowRanks((v) => !v)} aria-expanded={showRanks}>
              6+
            </button>
          )}
          {view.variant === "shortdeck" && showRanks && <span className="w-full fade-in">{t("poker.shortDeckRanks")}</span>}
        </div>
      )}

      <GameTable rail="leather" felt={view.variant} className="poker-table">
        <div className="felt-line" aria-hidden="true" />

        {/* Pot, community cards and showdown in the middle */}
        <div className="p-center">
          <div className="flex items-center gap-2">
            {view.pot > 0 && <ChipStack amount={view.pot} max={5} />}
            <span key={view.pot} className="amount-tag anim-pop" data-tone="pot">
              {t("poker.pot")}: {view.pot.toLocaleString()}
            </span>
          </div>
          <span className="felt-label">
            {t(`poker.streets.${view.phase}`)}
            {isFourCard ? ` · ${t("poker.useBoard")}` : ""}
          </span>
          <div className="p-board" aria-label={t("ui.community")} role="group">
            {view.board.map((c, i) => (
              <PlayingCard key={c} card={c} size="sm" animate="flip" style={{ "--deal-i": i < 3 ? i : 0 } as CSSProperties} />
            ))}
            {Array.from({ length: 5 - view.board.length }, (_, i) => (
              <CardSlot key={i} size="sm" />
            ))}
          </div>
          {last && last.awards.length > 0 && (
            <div className="showdown fade-in">
              {last.awards.map((a, i) => (
                <span key={i} className="win-tag" data-side={a.side}>
                  <Trophy size={13} />
                  {a.side === "low" && <span>{t("ui.lowPot")} ·</span>}
                  {a.side === "high" && view.variant === "omaha_hilo" && <span>{t("ui.highPot")} ·</span>}
                  <span>{t("poker.won", { name: name(a.seat), amount: a.amount.toLocaleString() })}</span>
                  {a.category && <span className="font-semibold">· {t(`poker.hands.${a.category}`)}</span>}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Seats around the rail, bets in front of them, the dealer button */}
        {order.map((s, k) => {
          const p = view.players[s]!;
          const aw = angleFor(k, n, false);
          const at = angleFor(k, n, true);
          const dOff = (0.32 * 2 * Math.PI) / n;
          const wide = place(aw, { x: 45, y: 41 });
          const tall = place(at, { x: 38, y: 42 });
          const bet = place(aw, { x: 28, y: 26 });
          const betTall = place(at, { x: 22, y: 26 });
          const dl = place(aw + dOff, { x: 33, y: 31 });
          const dlTall = place(at + 0.35, { x: 27, y: 33 });
          const shown = last?.revealed[s];
          const isMe = s === mySeat;
          const posStyle = (a: { x: number; y: number }, b: { x: number; y: number }) =>
            ({ "--xw": pct(a.x), "--yw": pct(a.y), "--xt": pct(b.x), "--yt": pct(b.y) }) as CSSProperties;
          return (
            <div key={s} className="contents">
              <div className="p-seat" style={posStyle(wide, tall)}>
                {shown ? (
                  <div className="p-holes">
                    {shown.map((c) => (
                      <PlayingCard key={c} card={c} size="xs" animate="flip" />
                    ))}
                  </div>
                ) : !isMe && !p.folded && !p.busted && p.holeCount > 0 ? (
                  <div className="p-holes" data-back="true" style={{ "--cw": "40px" } as CSSProperties}>
                    {Array.from({ length: p.holeCount }, (_, i) => (
                      <PlayingCard key={i} back size="xs" />
                    ))}
                  </div>
                ) : null}
                <SeatTag seat={s} seats={seats} active={view.toAct === s} dimmed={p.folded || p.busted} compact className="p-plate">
                  <span className="seat-stat">
                    <ChipIcon size={12} />
                    <b>{p.chips.toLocaleString()}</b>
                  </span>
                  {blinds.sb === s && !p.busted && <span className="seat-flag" data-tone="info">{t("ui.sb")}</span>}
                  {blinds.bb === s && !p.busted && <span className="seat-flag" data-tone="warn">{t("ui.bb")}</span>}
                  {p.folded && !p.busted && <span className="seat-flag">{t("poker.fold")}</span>}
                  {p.allIn && <span className="seat-flag" data-tone="danger">{t("poker.allin")}</span>}
                  {p.busted && <span className="seat-flag">{t("poker.busted")}</span>}
                  {winnerSeats.has(s) && view.board.length === 0 && <Trophy size={13} className="text-[#e2c27a]" />}
                </SeatTag>
              </div>

              {p.street > 0 && (
                <div
                  key={`${s}-${view.handNumber}-${view.phase}`}
                  className="p-bet anim-in"
                  style={{ ...posStyle(bet, betTall), "--from-x": `${(wide.cos * 40).toFixed(0)}px`, "--from-y": `${(wide.sin * 40).toFixed(0)}px` } as CSSProperties}
                >
                  <ChipStack amount={p.street} max={4} />
                  <span className="amount-tag">{p.street.toLocaleString()}</span>
                </div>
              )}

              {view.dealer === s && (
                <div className="p-dealer" style={posStyle(dl, dlTall)}>
                  <span className="dealer-btn" title={t("ui.dealer")}>
                    D
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </GameTable>

      {me && you && (
        <div className="poker-dock">
          <div className="grid justify-items-center gap-1">
            <CardHand label={t("game.yourHand")} size={isFourCard ? "md" : "lg"} spread="loose" dealKey={view.handNumber} cards={sortHand(you.hole).map((c) => ({ card: c }))} />
            {isFourCard && <span className="felt-label !text-[#8fd3ff]">{t("poker.useHole")}</span>}
          </div>

          {myTurn && (
            <div className="action-bar fade-in">
              {you.toCall > 0 && <span className="action-hint w-full text-center">{t("poker.toCall", { n: you.toCall.toLocaleString() })}</span>}
              <button className="btn-danger btn-lg min-w-24" onClick={() => onAction({ type: "fold" })}>
                {t("poker.fold")}
              </button>
              {you.canCheck ? (
                <button className="btn-secondary btn-lg min-w-28" onClick={() => onAction({ type: "check" })}>
                  {t("poker.check")}
                </button>
              ) : (
                <button className="btn-secondary btn-lg min-w-28 tabular-nums" onClick={() => onAction({ type: "call" })}>
                  {t("poker.call", { n: you.toCall })}
                </button>
              )}
              {you.raise && (
                <button className="btn-primary btn-lg min-w-32 tabular-nums" onClick={() => onAction({ type: "raise", to: clamp(amount) })}>
                  {view.currentBet === 0 ? t("poker.bet") : t("poker.raise")} {clamp(amount)}
                </button>
              )}
              {view.structure === "no_limit" && me.chips > 0 && (
                <button className="btn-gold btn-lg min-w-24" onClick={() => onAction({ type: "allin" })}>
                  <Flame size={15} /> {t("poker.allin")}
                </button>
              )}

              {you.raise && you.raise.max > you.raise.min && (
                <div className="bet-row">
                  <button type="button" className="hud-chip" onClick={() => setAmount(you.raise!.min)}>
                    {t("ui.minBet")}
                  </button>
                  <button type="button" className="hud-chip" onClick={() => setAmount(clamp(view.currentBet + view.pot * 0.5))}>
                    {t("ui.halfPot")}
                  </button>
                  <button type="button" className="hud-chip" onClick={() => setAmount(clamp(view.currentBet + view.pot * 0.75))}>
                    {t("ui.threeQuarterPot")}
                  </button>
                  <button type="button" className="hud-chip" onClick={() => setAmount(clamp(view.currentBet + view.pot))}>
                    {t("ui.fullPot")}
                  </button>
                  <button type="button" className="hud-chip" onClick={() => setAmount(you.raise!.max)}>
                    {t("ui.maxBet")}
                  </button>
                  <input
                    type="range"
                    min={you.raise.min}
                    max={you.raise.max}
                    value={clamp(amount)}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="bet-range"
                    aria-label={t("poker.raise")}
                  />
                  <input
                    type="number"
                    className="input w-24 h-9 text-sm font-extrabold tabular-nums text-center !rounded-full"
                    value={clamp(amount)}
                    min={you.raise.min}
                    max={you.raise.max}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    aria-label={t("poker.raise")}
                  />
                </div>
              )}
            </div>
          )}
          {!myTurn && view.currentBet > 0 && (
            <div className="flex justify-center">
              <span className="amount-tag">{t("poker.currentBet", { n: view.currentBet.toLocaleString() })}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
