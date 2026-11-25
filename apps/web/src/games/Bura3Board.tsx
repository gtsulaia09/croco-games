import { useMemo, useState } from "react";
import { Award, CheckCircle2, Flame, ShieldAlert } from "lucide-react";
import type { Bura3View } from "@croco/game-engine/games/bura3";
import { useT } from "../i18n";
import { PlayingCard } from "../components/ui";
import { MiniCardCount, opponentsOrder, SeatTag, TrumpBadge, TurnBar, useSeatName, type BoardProps } from "./common";

/** Dedicated Three-Card Georgian Bura table with sideways trump deck and 31-point progress meter. */
export default function Bura3Board({ view, mySeat, seats, deadline, onAction }: BoardProps<Bura3View>) {
  const t = useT();
  const name = useSeatName(seats);
  const [selected, setSelected] = useState<string[]>([]);
  const myTurn = view.toAct !== null && view.toAct === mySeat;
  const responding = view.phase === "respond";
  const need = responding ? (view.trick?.count ?? 0) : 0;
  const hand = view.you?.hand ?? [];

  const sameSuit = selected.length > 0 && selected.every((c) => c[1] === selected[0]![1]);
  const toggle = (c: string) => setSelected((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
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
            <span className="chip bg-bg/75 border border-white/12 text-text-2">{t("game.hand", { n: view.handNumber })}</span>
            <TrumpBadge card={view.trumpCard} suit={view.trump} />
            <span className="chip bg-bg/75 border border-white/12 text-text-2">{t("game.stock", { n: view.stockCount })}</span>
            <span className="chip bg-gold/15 border border-gold/35 text-gold">{t("bura.target", { n: view.targetPoints })}</span>
          </>
        }
      />

      {lastMessage && (
        <div className="rounded-xl bg-gold/15 border border-gold/40 px-3 py-1.5 text-xs font-bold text-gold text-center flex items-center justify-center gap-1.5">
          <Award size={14} /> {lastMessage}
        </div>
      )}

      {/* Opponents Row */}
      <div className="flex flex-wrap gap-2.5 justify-center">
        {opponentsOrder(players, mySeat).map((s) => (
          <div key={s} className="min-w-52 flex-1 max-w-xs">
            <SeatTag seat={s} seats={seats} active={view.toAct === s}>
              <MiniCardCount count={view.players[s]!.handCount} />
              <span className="text-text-2">{t("bura.pile", { n: view.players[s]!.capturedCount })}</span>
              <span className="text-gold font-extrabold tabular-nums">
                {view.scores[s]}/{view.targetPoints}
              </span>
            </SeatTag>
          </div>
        ))}
      </div>

      {/* Center Table: Stock + Sideways Trump Card & Trick Clash Zone */}
      <div className="rounded-2xl border border-gold/20 bg-black/22 p-4 min-h-40 flex flex-wrap items-center justify-center gap-6 sm:gap-10 shadow-[inset_0_4px_20px_rgba(0,0,0,0.38)]">
        {/* Realistic Tucked Trump + Stock Pile */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          <div className="relative flex items-center justify-center w-24 h-24">
            {view.trumpCard && (
              <span className="absolute -left-1 rotate-[-14deg]">
                <PlayingCard card={view.trumpCard} size="sm" />
              </span>
            )}
            {view.stockCount > 0 && (
              <span className="relative translate-x-4 translate-y-1">
                <PlayingCard back size="sm" />
              </span>
            )}
          </div>
          <span className="chip bg-bg/80 border border-white/12 text-text-2 tabular-nums">{t("game.stock", { n: view.stockCount })}</span>
        </div>

        {/* Active Trick Clash */}
        <div className="flex flex-wrap gap-5 justify-center items-center min-w-44">
          {view.trick?.plays.length ? (
            view.trick.plays.map((p) => {
              const best = view.trick!.bestSeat === p.seat;
              return (
                <div
                  key={p.seat}
                  className={`flex flex-col items-center gap-1.5 rounded-xl p-2 border card-enter ${
                    best ? "bg-primary/14 border-primary/50" : "bg-black/20 border-white/10"
                  }`}
                >
                  <div className="flex gap-1.5">
                    {p.faceUp
                      ? p.faceUp.map((c) => <PlayingCard key={c} card={c} size="sm" />)
                      : Array.from({ length: p.count }, (_, i) => <PlayingCard key={i} back size="sm" />)}
                  </div>
                  <span className={`text-[11px] font-bold ${best ? "text-primary" : "text-text-2"}`}>{name(p.seat)}</span>
                </div>
              );
            })
          ) : (
            <span className="text-[11px] uppercase tracking-widest text-white/30 font-bold">BURA · 3 CARDS</span>
          )}
        </div>
      </div>

      {/* Player Seat, 31-Point Gauge & Large 3-Card Hand */}
      {mySeat !== null && view.you && (
        <div className="grid gap-3 pt-1">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="w-full sm:w-auto sm:min-w-72">
              <SeatTag seat={mySeat} seats={seats} active={myTurn}>
                <span className="text-text-2">{t("bura.pile", { n: view.players[mySeat]!.capturedCount })}</span>
                <span className="text-gold font-extrabold tabular-nums">
                  {view.scores[mySeat]}/{view.targetPoints}
                </span>
              </SeatTag>
            </div>
            {knownPts !== null && (
              <div className="rounded-xl bg-bg/75 border border-white/12 px-3 py-2 min-w-48">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-muted">{t("ui.toward31")}</span>
                  <span className={`tabular-nums ${knownPts >= 31 ? "text-gold" : "text-white"}`}>{t("bura.knownPoints", { n: knownPts })}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden mt-1.5">
                  <div className={`h-full rounded-full transition-all ${knownPts >= 31 ? "bg-gold" : "bg-primary"}`} style={{ width: `${pct31}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* Large Prominent 3-Card Hero Hand */}
          <div className="flex flex-wrap gap-3 justify-center py-1" role="group" aria-label={t("game.yourHand")}>
            {hand.map((c) => (
              <PlayingCard key={c} card={c} size="lg" selected={selected.includes(c)} onClick={myTurn ? () => toggle(c) : undefined} />
            ))}
          </div>

          {/* Contextual Action Console */}
          {myTurn && (
            <div className="rounded-xl bg-bg/85 border border-primary/40 p-3 flex flex-wrap gap-2 justify-center items-center fade-in">
              {view.phase === "lead" && (
                <>
                  <div className="w-full flex flex-wrap items-center justify-center gap-2 text-xs">
                    <span className="text-text-2 font-medium">{t("bura.select")}</span>
                    {selected.length > 0 && (
                      <span className={`chip ${sameSuit ? "bg-primary/15 text-primary" : "bg-danger/15 text-danger"}`}>
                        {sameSuit ? <CheckCircle2 size={11} /> : <ShieldAlert size={11} />}
                        {sameSuit ? t("ui.sameSuitOk") : t("ui.sameSuitNeeded")}
                      </span>
                    )}
                  </div>
                  <button className="btn-primary px-6" disabled={!sameSuit || selected.length > 3} onClick={() => submit("lead")}>
                    {t("bura.lead")}
                  </button>
                </>
              )}
              {responding && (
                <>
                  <span className="text-xs font-semibold text-text-2 w-full text-center">
                    {t("bura.selectRespond", { n: need })} ({t("ui.selectedCount", { n: selected.length })})
                  </span>
                  <button className="btn-primary px-5" disabled={selected.length !== need} onClick={() => submit("beat")}>
                    {t("bura.beat")}
                  </button>
                  <button className="btn-secondary px-5" disabled={selected.length !== need} onClick={() => submit("discard")}>
                    {t("bura.discard")}
                  </button>
                </>
              )}
              {(view.phase === "lead" || view.phase === "final") && (view.players[mySeat]?.tricksWon ?? 0) > 0 && (
                <button className="btn-gold px-5" onClick={() => onAction({ type: "claim" })}>
                  <Flame size={15} /> {t("bura.claim")}
                </button>
              )}
              {view.phase === "final" && (
                <button className="btn-secondary" onClick={() => onAction({ type: "pass" })}>
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
