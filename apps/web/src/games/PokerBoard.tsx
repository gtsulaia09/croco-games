import { useEffect, useState } from "react";
import { Flame, Sparkles, Trophy } from "lucide-react";
import type { PokerVariant, PokerView } from "@croco/game-engine/games/poker";
import { useT } from "../i18n";
import { PlayingCard } from "../components/ui";
import { ChipIcon, opponentsOrder, SeatTag, TurnBar, useSeatName, type BoardProps } from "./common";

const VARIANT_META: Record<
  PokerVariant,
  { feltClass: string; watermark: string; ruleKey: string | null; badgeClass: string; badgeText: string }
> = {
  holdem: {
    feltClass: "felt-poker",
    watermark: "TEXAS HOLD'EM",
    ruleKey: null,
    badgeClass: "bg-primary/15 text-primary border border-primary/35",
    badgeText: "HOLD'EM",
  },
  shortdeck: {
    feltClass: "felt-shortdeck",
    watermark: "SHORT DECK 6+",
    ruleKey: "ui.shortDeckRule",
    badgeClass: "bg-[#e11d48]/20 text-[#fb7185] border border-[#e11d48]/40",
    badgeText: "6+ SHORT DECK",
  },
  omaha: {
    feltClass: "felt-omaha",
    watermark: "OMAHA · 4 HOLE",
    ruleKey: "ui.omahaRule",
    badgeClass: "bg-accent/15 text-accent border border-accent/35",
    badgeText: "OMAHA",
  },
  omaha_hilo: {
    feltClass: "felt-omaha-hilo",
    watermark: "OMAHA HI-LO 8+",
    ruleKey: "ui.omahaHiLoRule",
    badgeClass: "bg-gold/15 text-gold border border-gold/40",
    badgeText: "HI / LO SPLIT",
  },
};

function MiniHoleBacks({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center -space-x-1.5 ml-1" aria-hidden="true">
      {Array.from({ length: Math.min(count, 4) }, (_, i) => (
        <span key={i} className="inline-block w-3.5 h-5 rounded-[3px] bg-gradient-to-br from-[#12455d] to-[#081f2c] border border-gold/45 shadow-xs" />
      ))}
    </span>
  );
}

/** Derive Small Blind and Big Blind seats from active non-busted seats relative to the dealer button. */
function computeBlindSeats(view: PokerView): { sb: number | null; bb: number | null } {
  const active = view.players.filter((p) => !p.busted).map((p) => p.seat);
  if (active.length < 2) return { sb: null, bb: null };
  const idx = active.indexOf(view.dealer);
  const start = idx >= 0 ? idx : 0;
  if (active.length === 2) {
    return { sb: active[start]!, bb: active[(start + 1) % 2]! };
  }
  return {
    sb: active[(start + 1) % active.length]!,
    bb: active[(start + 2) % active.length]!,
  };
}

export default function PokerBoard({ view, mySeat, seats, deadline, onAction }: BoardProps<PokerView>) {
  const t = useT();
  const name = useSeatName(seats);
  const you = view.you;
  const myTurn = view.toAct !== null && view.toAct === mySeat;
  const [amount, setAmount] = useState(you?.raise?.min ?? 0);
  useEffect(() => {
    if (you?.raise) setAmount(you.raise.min);
  }, [you?.raise?.min, you?.raise]);

  const me = mySeat !== null ? view.players[mySeat] : undefined;
  const clamp = (v: number) => (you?.raise ? Math.max(you.raise.min, Math.min(you.raise.max, Math.round(v))) : v);
  const last = view.lastHand;
  const meta = VARIANT_META[view.variant];
  const blinds = computeBlindSeats(view);
  const winnerSeats = new Set((last?.awards ?? []).map((a) => a.seat));
  const isFourCard = view.variant === "omaha" || view.variant === "omaha_hilo";

  function renderPokerSeat(s: number, compact = false) {
    const p = view.players[s]!;
    const shown = last?.revealed[s];
    const isWinner = winnerSeats.has(s) && view.board.length === 0;
    return (
      <div key={s} className="grid gap-1">
        <SeatTag seat={s} seats={seats} active={view.toAct === s} dealer={view.dealer === s} dimmed={p.folded || p.busted} compact={compact}>
          <span className="inline-flex items-center gap-1 font-extrabold text-white tabular-nums">
            <ChipIcon size={12} /> {p.chips.toLocaleString()}
          </span>
          {blinds.sb === s && !p.busted && <span className="blind-disc bg-accent/25 text-accent border border-accent/45">{t("ui.sb")}</span>}
          {blinds.bb === s && !p.busted && <span className="blind-disc bg-warning/25 text-warning border border-warning/45">{t("ui.bb")}</span>}
          {p.folded && !p.busted && <span className="chip bg-surface-3 text-muted h-4 px-1.5 text-[10px]">{t("poker.fold")}</span>}
          {p.allIn && <span className="chip bg-danger/25 text-danger border border-danger/45 h-4 px-1.5 text-[10px] font-black">{t("poker.allin")}</span>}
          {p.busted && <span className="chip bg-surface-3 text-muted h-4 px-1.5 text-[10px]">{t("poker.busted")}</span>}
          {isWinner && <Trophy size={12} className="text-gold" />}
          {s !== mySeat && !p.folded && !p.busted && !shown && <MiniHoleBacks count={p.holeCount} />}
        </SeatTag>
        {p.street > 0 && (
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1 rounded-full bg-bg/85 border border-gold/45 px-2.5 py-0.5 text-[11px] font-extrabold text-gold tabular-nums shadow-sm">
              <ChipIcon size={11} /> {p.street.toLocaleString()}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`table-arena ${meta.feltClass}`}>
      {/* Top HUD Bar */}
      <TurnBar
        toAct={view.toAct}
        mySeat={mySeat}
        deadline={deadline}
        seats={seats}
        extra={
          <>
            <span className={`chip ${meta.badgeClass}`}>{meta.badgeText}</span>
            <span className="chip bg-bg/80 border border-white/12 text-text-2">{t("poker.handOf", { n: view.handNumber, max: view.maxHands })}</span>
            <span className="chip bg-bg/80 border border-white/12 text-text-2">
              {t("poker.blinds", { sb: view.blinds.small, bb: view.blinds.big })}
              {view.blinds.ante > 0 ? ` · A${view.blinds.ante}` : ""}
            </span>
            <span className="chip bg-bg/80 border border-white/12 text-muted uppercase">{view.structure.replace("_", " ")}</span>
          </>
        }
      />

      {/* Variant Rule Distinction Banner (Short Deck / Omaha / Omaha Hi-Lo) */}
      {meta.ruleKey && (
        <div className="rounded-xl bg-bg/65 border border-white/10 px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-text-2 flex items-center justify-center gap-2 text-center">
          {view.variant === "omaha_hilo" ? (
            <>
              <span className="chip bg-gold text-[#1d1404] h-5 px-2 text-[10px] font-black">{t("ui.highPot")}</span>
              <span className="chip bg-accent text-[#041922] h-5 px-2 text-[10px] font-black">{t("ui.lowPot")}</span>
            </>
          ) : (
            <Sparkles size={13} className="text-gold shrink-0" />
          )}
          <span>{t(meta.ruleKey)}</span>
        </div>
      )}

      {/* Opponent Seats Ring */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-start">
        {opponentsOrder(view.players.length, mySeat).map((s) => renderPokerSeat(s, true))}
      </div>

      {/* Authentic Oval Poker Table Felt with Brass Betting Line */}
      <div className="poker-oval bg-black/22 px-3 sm:px-7 py-3.5 sm:py-4 flex flex-col items-center justify-center gap-2">
        {/* Street Indicator + Central Pot Chip Stack */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="chip bg-bg/75 border border-white/12 text-muted uppercase text-[10px] tracking-widest">
            {view.phase}
          </span>
          <div className="inline-flex items-center gap-2 rounded-full bg-bg/90 border border-gold/55 px-3.5 py-1 shadow-[0_4px_14px_rgba(0,0,0,0.4)]">
            <ChipIcon size={15} />
            <span className="text-xs font-bold uppercase tracking-wider text-muted">{t("poker.pot")}:</span>
            <span className="text-sm sm:text-base font-black text-gold tabular-nums">{view.pot.toLocaleString()}</span>
          </div>
          {view.currentBet > 0 && (
            <span className="chip bg-bg/75 border border-primary/35 text-primary tabular-nums">
              Bet {view.currentBet.toLocaleString()}
            </span>
          )}
        </div>

        {/* 5 Community Card Slots */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 min-h-[4.9rem]" aria-label={t("ui.community")}>
          {view.board.map((c) => (
            <PlayingCard key={c} card={c} size="md" animate />
          ))}
          {Array.from({ length: 5 - view.board.length }, (_, i) => (
            <span key={i} className="pcard-slot" aria-hidden="true" />
          ))}
        </div>

        <span className="text-[10px] font-black uppercase tracking-[0.26em] text-white/22 select-none">{meta.watermark}</span>

        {/* Showdown Winner & Split-Pot Presentation */}
        {last && last.awards.length > 0 && (
          <div className="w-full max-w-xl rounded-xl bg-bg/82 border border-gold/40 px-3.5 py-2.5 text-xs grid gap-2 fade-in">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {last.awards.map((a, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-bold border ${
                    a.side === "low"
                      ? "bg-accent/15 text-accent border-accent/40"
                      : "bg-gold/15 text-gold border-gold/45"
                  }`}
                >
                  <Trophy size={12} />
                  {a.side === "low" && <span className="uppercase text-[10px] font-black">{t("ui.lowPot")}</span>}
                  {a.side === "high" && view.variant === "omaha_hilo" && <span className="uppercase text-[10px] font-black">{t("ui.highPot")}</span>}
                  <span>{t("poker.won", { name: name(a.seat), amount: a.amount })}</span>
                  {a.side === "low" && <span className="sr-only">({t("poker.low")})</span>}
                  {a.category && <span className="text-white/80 font-normal">· {a.category.replace(/_/g, " ")}</span>}
                </span>
              ))}
            </div>
            {Object.keys(last.revealed).length > 0 && (
              <div className="flex flex-wrap gap-3 justify-center pt-1 border-t border-white/10">
                {Object.entries(last.revealed).map(([seat, cards]) => (
                  <span key={seat} className="inline-flex items-center gap-1.5 bg-surface-3/80 border border-white/10 rounded-lg px-2 py-1">
                    <span className="text-[11px] font-bold text-text-2">{name(Number(seat))}:</span>
                    <span className="flex gap-0.5">
                      {cards.map((c) => (
                        <PlayingCard key={c} card={c} size="xs" />
                      ))}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hero Player Zone: Seat + Prominent Hole Cards + Pro Action Console */}
      {me && you && (
        <div className="grid gap-2">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <div className="w-full sm:w-auto sm:min-w-60">{renderPokerSeat(mySeat!)}</div>
            <div className={`flex items-center justify-center ${isFourCard ? "gap-1.5 sm:gap-2" : "gap-2.5"}`} role="group" aria-label={t("game.yourHand")}>
              {you.hole.map((c) => (
                <PlayingCard key={c} card={c} size="md" />
              ))}
            </div>
          </div>

          {myTurn && (
            <div className="rounded-xl bg-bg/90 border border-primary/45 p-2.5 grid gap-2 shadow-[0_8px_24px_rgba(0,0,0,0.4)] fade-in">
              {/* Primary Action Buttons */}
              <div className="flex flex-wrap gap-2 justify-center">
                <button className="btn-danger min-w-24" onClick={() => onAction({ type: "fold" })}>
                  {t("poker.fold")}
                </button>
                {you.canCheck ? (
                  <button className="btn-secondary min-w-28" onClick={() => onAction({ type: "check" })}>
                    {t("poker.check")}
                  </button>
                ) : (
                  <button className="btn-secondary min-w-28 tabular-nums" onClick={() => onAction({ type: "call" })}>
                    {t("poker.call", { n: you.toCall })}
                  </button>
                )}
                {you.raise && (
                  <button className="btn-primary min-w-32 tabular-nums" onClick={() => onAction({ type: "raise", to: clamp(amount) })}>
                    {view.currentBet === 0 ? t("poker.bet") : t("poker.raise")} {clamp(amount)}
                  </button>
                )}
                {view.structure === "no_limit" && me.chips > 0 && (
                  <button className="btn-gold min-w-24" onClick={() => onAction({ type: "allin" })}>
                    <Flame size={14} /> {t("poker.allin")}
                  </button>
                )}
              </div>

              {/* Intuitive Bet Sizing Slider & Quick Presets */}
              {you.raise && you.raise.max > you.raise.min && (
                <div className="flex flex-wrap items-center gap-2 justify-center pt-1.5 border-t border-line/80">
                  <div className="flex gap-1.5">
                    <button type="button" className="btn-secondary btn-sm h-7 px-2.5" onClick={() => setAmount(you.raise!.min)}>
                      {t("ui.minBet")}
                    </button>
                    <button type="button" className="btn-secondary btn-sm h-7 px-2.5" onClick={() => setAmount(clamp(view.currentBet + view.pot * 0.5))}>
                      {t("ui.halfPot")}
                    </button>
                    <button type="button" className="btn-secondary btn-sm h-7 px-2.5" onClick={() => setAmount(clamp(view.currentBet + view.pot))}>
                      {t("ui.fullPot")}
                    </button>
                  </div>
                  <input
                    type="range"
                    min={you.raise.min}
                    max={you.raise.max}
                    value={clamp(amount)}
                    onChange={(e) => setAmount(Number(e.target.value))}
                    className="w-44 sm:w-56 accent-[var(--color-primary)] cursor-pointer"
                    aria-label={t("poker.raise")}
                  />
                  <input
                    type="number"
                    className="input w-24 h-8 text-xs font-bold tabular-nums text-center"
                    value={clamp(amount)}
                    min={you.raise.min}
                    max={you.raise.max}
                    onChange={(e) => setAmount(Number(e.target.value))}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
