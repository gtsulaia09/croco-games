import { useMemo, useState } from "react";
import { Award, CheckCircle2, Flame } from "lucide-react";
import type { Bura3View } from "@croco/game-engine/games/bura3";
import { useT } from "../i18n";
import { PlayingCard } from "../components/ui";
import { MiniCardCount, opponentsOrder, SeatTag, TrumpBadge, TurnBar, useSeatName, type BoardProps } from "./common";

/** Dedicated Three-Card Bura Neo-Arena with jumbo hero cards, angled trump deck, and 31-point target gauge. */
export default function Bura3Board({ view, mySeat, seats, deadline, onAction }: BoardProps<Bura3View>) {
  const t = useT();
  const name = useSeatName(seats);
  const [selected, setSelected] = useState<string[]>([]);
  const myTurn = view.toAct !== null && view.toAct === mySeat;
  const responding = view.phase === "respond";
  const need = responding ? (view.trick?.count ?? 0) : 0;
  const hand = view.you?.hand ?? [];

  const sameSuit = selected.length > 0 && selected.every((c) => c[1] === selected[0]![1]);

  const toggle = (c: string) => {
    setSelected((cur) => {
      if (cur.includes(c)) return cur.filter((x) => x !== c);
      if (view.phase === "lead" && cur.length > 0 && cur[0]![1] !== c[1]) return [c];
      if (responding && need > 0 && cur.length >= need) return [...cur.slice(1), c];
      return [...cur, c];
    });
  };

  const submit = (type: string) => {
    onAction({ type, cards: selected });
    setSelected([]);
  };

  const players = view.players.length;
  const knownPts = view.you?.knownPoints ?? null;
  const pct31 = knownPts !== null ? Math.min(100, Math.round((knownPts / 31) * 100)) : 0;

  const lastMessage = useMemo(() => {
    if (!view.lastHand) return null;
    const lh = view.lastHand;
    if (lh.reason === "bura" || lh.reason === "three_aces") return t("bura.bura", { name: name(lh.winner!) });
    if (lh.reason === "claim") return t("bura.claimTrue", { name: name(lh.claimer!), points: lh.claimedPoints ?? 0 });
    if (lh.reason === "false_claim") return t("bura.claimFalse", { name: name(lh.claimer!), points: lh.claimedPoints ?? 0 });
    return t("bura.draw");
  }, [view.lastHand, t, name]);

  return (
    <div className="table-arena felt-bura">
      <TurnBar
        toAct={view.toAct}
        mySeat={mySeat}
        deadline={deadline}
        seats={seats}
        extra={
          <>
            <span className="chip bg-white/8 border border-white/14 text-white">{t("game.hand", { n: view.handNumber })}</span>
            <TrumpBadge card={view.trumpCard} suit={view.trump} />
            <span className="chip bg-white/8 border border-white/14 text-text-2">{t("game.stock", { n: view.stockCount })}</span>
            <span className="chip bg-gold/20 border border-gold/45 text-gold font-bold">{t("bura.target", { n: view.targetPoints })}</span>
          </>
        }
      />

      {lastMessage && (
        <div className="rounded-2xl bg-gold/18 border border-gold/45 px-3.5 py-2 text-xs font-extrabold text-gold text-center flex items-center justify-center gap-1.5">
          <Award size={15} /> {lastMessage}
        </div>
      )}

      {/* Opponents Row */}
      <div className="flex flex-wrap gap-2.5 justify-center">
        {opponentsOrder(players, mySeat).map((s) => (
          <div key={s} className="min-w-48 flex-1 max-w-xs">
            <SeatTag seat={s} seats={seats} active={view.toAct === s} compact>
              <MiniCardCount count={view.players[s]!.handCount} />
              <span className="text-text-2 font-semibold">{t("bura.pile", { n: view.players[s]!.capturedCount })}</span>
              <span className="text-gold font-extrabold tabular-nums">
                {view.scores[s]}/{view.targetPoints}
              </span>
            </SeatTag>
          </div>
        ))}
      </div>

      {/* Sculpted Center Table Well: Angled Trump + Stock Deck & Full-Size Trick Clash */}
      <div className="table-well min-h-40 flex flex-wrap items-center justify-center gap-6 sm:gap-12">
        <div className="flex flex-col items-center gap-2 shrink-0">
          <div className="relative flex items-center justify-center w-26 h-26">
            {view.trumpCard && (
              <span className="absolute -left-1.5 rotate-[-14deg] drop-shadow-lg">
                <PlayingCard card={view.trumpCard} size="sm" />
              </span>
            )}
            {view.stockCount > 0 && (
              <span className="relative translate-x-5 translate-y-1">
                <PlayingCard back size="sm" />
              </span>
            )}
          </div>
          <span className="chip bg-[#070e17]/85 border border-white/15 text-text-2 tabular-nums">{t("game.stock", { n: view.stockCount })}</span>
        </div>

        <div className="flex flex-wrap gap-4 sm:gap-6 justify-center items-center min-w-44">
          {view.trick?.plays.length ? (
            view.trick.plays.map((p) => {
              const best = view.trick!.bestSeat === p.seat;
              return (
                <div
                  key={p.seat}
                  className={`flex flex-col items-center gap-2 rounded-2xl p-2.5 border card-enter ${
                    best ? "bg-primary/16 border-primary shadow-[0_0_20px_rgba(0,217,95,0.22)]" : "bg-[#070e17]/55 border-white/14"
                  }`}
                >
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {p.faceUp
                      ? p.faceUp.map((c) => <PlayingCard key={c} card={c} size="md" />)
                      : Array.from({ length: p.count }, (_, i) => <PlayingCard key={i} back size="md" />)}
                  </div>
                  <span className={`text-xs font-extrabold ${best ? "text-primary" : "text-white"}`}>{name(p.seat)}</span>
                </div>
              );
            })
          ) : (
            <div className="text-center grid gap-1.5">
              <span className="text-sm font-extrabold uppercase tracking-wider text-white/45">{t("games.bura3.name")}</span>
              <span className="text-xs font-medium text-white/35">{t("bura.cardValues")}</span>
            </div>
          )}
        </div>
      </div>

      {/* Hero Station: Seat + 31-Point Gauge + Huge 3-Card Hero Hand + Action Dock */}
      {mySeat !== null && view.you && (
        <div className="hero-hand-tray" data-my-turn={myTurn ? "true" : "false"}>
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="w-full sm:w-auto sm:min-w-64">
              <SeatTag seat={mySeat} seats={seats} active={myTurn} compact>
                <span className="text-text-2 font-semibold">{t("bura.pile", { n: view.players[mySeat]!.capturedCount })}</span>
                <span className="text-gold font-extrabold tabular-nums">
                  {view.scores[mySeat]}/{view.targetPoints}
                </span>
              </SeatTag>
            </div>
            {knownPts !== null && (
              <div className="rounded-2xl bg-[#0b1522] border border-white/14 px-3.5 py-2 min-w-48 flex-1 sm:flex-none">
                <div className="flex items-center justify-between text-xs font-bold gap-3">
                  <span className="text-muted">{t("ui.toward31")}</span>
                  <span className={`tabular-nums ${knownPts >= 31 ? "text-gold" : "text-white"}`}>{t("bura.knownPoints", { n: knownPts })}</span>
                </div>
                <div className="h-2 rounded-full bg-surface-3 overflow-hidden mt-1.5">
                  <div className={`h-full rounded-full transition-all ${knownPts >= 31 ? "bg-gold" : "bg-primary"}`} style={{ width: `${pct31}%` }} />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3 sm:gap-4 justify-center py-1.5" role="group" aria-label={t("game.yourHand")}>
            {hand.map((c) => (
              <PlayingCard
                key={c}
                card={c}
                size="lg"
                playable={true}
                selected={selected.includes(c)}
                onClick={myTurn ? () => toggle(c) : undefined}
              />
            ))}
          </div>

          {myTurn && (
            <div className="action-dock flex flex-wrap gap-2.5 justify-center items-center fade-in">
              {view.phase === "lead" && (
                <>
                  <div className="w-full flex flex-wrap items-center justify-center gap-2 text-xs">
                    <span className="text-text-2 font-medium">{t("bura.select")}</span>
                    {selected.length > 0 && sameSuit && (
                      <span className="chip bg-primary/20 text-primary border border-primary/40 font-bold">
                        <CheckCircle2 size={12} /> {t("ui.selectedCount", { n: selected.length })}
                      </span>
                    )}
                  </div>
                  <button className="btn-primary btn-lg px-7" disabled={!sameSuit || selected.length > 3} onClick={() => submit("lead")}>
                    {t("bura.lead")}
                  </button>
                </>
              )}
              {responding && (
                <>
                  <span className="text-xs font-semibold text-text-2 w-full text-center">
                    {t("bura.selectRespond", { n: need })} ({t("ui.selectedCount", { n: selected.length })})
                  </span>
                  <button className="btn-primary btn-lg px-6" disabled={selected.length !== need} onClick={() => submit("beat")}>
                    {t("bura.beat")}
                  </button>
                  <button className="btn-secondary btn-lg px-6" disabled={selected.length !== need} onClick={() => submit("discard")}>
                    {t("bura.discard")}
                  </button>
                </>
              )}
              {(view.phase === "lead" || view.phase === "final") && (view.players[mySeat]?.tricksWon ?? 0) > 0 && (
                <button className="btn-gold btn-lg px-6" onClick={() => onAction({ type: "claim" })}>
                  <Flame size={16} /> {t("bura.claim")}
                </button>
              )}
              {view.phase === "final" && (
                <button className="btn-secondary btn-lg" onClick={() => onAction({ type: "pass" })}>
                  {t("bura.pass")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
