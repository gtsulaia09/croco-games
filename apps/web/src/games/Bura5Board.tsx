import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import type { Bura5View } from "@croco/game-engine/games/bura5";
import { useT } from "../i18n";
import { PlayingCard } from "../components/ui";
import { MiniCardCount, opponentsOrder, SeatTag, TrumpBadge, TurnBar, useSeatName, type BoardProps } from "./common";

/** Dedicated Five-Card Bura table adapted for wider 5-card hands, multi-card leads, and penalty-limit gauges. */
export default function Bura5Board({ view, mySeat, seats, deadline, onAction }: BoardProps<Bura5View>) {
  const t = useT();
  const name = useSeatName(seats);
  const [selected, setSelected] = useState<string[]>([]);
  const myTurn = view.toAct !== null && view.toAct === mySeat;
  const maxLead = view.maxLead;
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
  const lastMessage = useMemo(() => {
    if (!view.lastHand) return null;
    return `${t("bura.points")}: ${view.lastHand.points.map((p, i) => `${name(i)} ${p}`).join(" · ")}`;
  }, [view.lastHand, t, name]);

  function penaltyTone(penalties: number) {
    const ratio = penalties / Math.max(1, view.penaltyLimit);
    return ratio >= 0.75 ? "text-danger" : ratio >= 0.45 ? "text-warning" : "text-text-2";
  }

  return (
    <div className="table-arena felt-bura5">
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
            <span className="chip bg-danger/15 border border-danger/35 text-danger">{t("bura.limit", { n: view.penaltyLimit })}</span>
          </>
        }
      />

      {lastMessage && (
        <div className="rounded-xl bg-accent/12 border border-accent/35 px-3 py-1.5 text-xs font-semibold text-text-2 text-center">
          {lastMessage}
        </div>
      )}

      {/* Opponent Row with Penalty Progress */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {opponentsOrder(players, mySeat).map((s) => {
          const pen = view.penalties[s] ?? 0;
          return (
            <SeatTag key={s} seat={s} seats={seats} active={view.toAct === s}>
              <MiniCardCount count={view.players[s]!.handCount} />
              <span className="text-text-2">{t("bura.pile", { n: view.players[s]!.capturedCount })}</span>
              <span className={`font-extrabold tabular-nums ${penaltyTone(pen)}`}>
                {t("bura.penalties")}: {pen}/{view.penaltyLimit}
              </span>
            </SeatTag>
          );
        })}
      </div>

      {/* Wide Multi-Card Clash Arena */}
      <div className="rounded-2xl border border-[#5eead4]/20 bg-black/24 p-3.5 sm:p-4 min-h-40 grid sm:grid-cols-[auto_1fr] gap-4 items-center shadow-[inset_0_4px_20px_rgba(0,0,0,0.38)]">
        <div className="flex sm:flex-col items-center justify-center gap-2 border-b sm:border-b-0 sm:border-r border-white/10 pb-3 sm:pb-0 sm:pr-4">
          <div className="relative flex items-center justify-center w-20 h-20">
            {view.trumpCard && (
              <span className="absolute -left-1 rotate-[-12deg]">
                <PlayingCard card={view.trumpCard} size="sm" />
              </span>
            )}
            {view.stockCount > 0 && (
              <span className="relative translate-x-3 translate-y-1">
                <PlayingCard back size="sm" />
              </span>
            )}
          </div>
          <span className="chip bg-bg/80 border border-white/12 text-text-2 tabular-nums">{t("game.stock", { n: view.stockCount })}</span>
        </div>

        <div className="flex flex-wrap gap-3 justify-center items-center">
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
                  <div className="flex flex-wrap gap-1 justify-center">
                    {p.faceUp
                      ? p.faceUp.map((c) => <PlayingCard key={c} card={c} size="sm" />)
                      : Array.from({ length: p.count }, (_, i) => <PlayingCard key={i} back size="sm" />)}
                  </div>
                  <span className={`text-[11px] font-bold ${best ? "text-primary" : "text-text-2"}`}>{name(p.seat)}</span>
                </div>
              );
            })
          ) : (
            <span className="text-[11px] uppercase tracking-widest text-white/30 font-bold">BURA · 5 CARDS</span>
          )}
        </div>
      </div>

      {/* Player Dock Adapted for Spacious 5-Card Hand */}
      {mySeat !== null && view.you && (
        <div className="grid gap-3 pt-1">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="w-full sm:w-auto sm:min-w-72">
              <SeatTag seat={mySeat} seats={seats} active={myTurn}>
                <span className="text-text-2">{t("bura.pile", { n: view.players[mySeat]!.capturedCount })}</span>
                <span className={`font-extrabold tabular-nums ${penaltyTone(view.penalties[mySeat] ?? 0)}`}>
                  {t("bura.penalties")}: {view.penalties[mySeat] ?? 0}/{view.penaltyLimit}
                </span>
              </SeatTag>
            </div>
            <div className="rounded-xl bg-bg/75 border border-white/12 px-3 py-2 min-w-44">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="text-muted inline-flex items-center gap-1">
                  <AlertTriangle size={11} className="text-warning" /> {t("bura.penalties")}
                </span>
                <span className={`tabular-nums ${penaltyTone(view.penalties[mySeat] ?? 0)}`}>
                  {view.penalties[mySeat] ?? 0} / {view.penaltyLimit}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden mt-1.5">
                <div
                  className={`h-full rounded-full transition-all ${(view.penalties[mySeat] ?? 0) / Math.max(1, view.penaltyLimit) >= 0.75 ? "bg-danger" : "bg-warning"}`}
                  style={{ width: `${Math.min(100, Math.round(((view.penalties[mySeat] ?? 0) / Math.max(1, view.penaltyLimit)) * 100))}%` }}
                />
              </div>
            </div>
          </div>

          {/* Spacious 5-Card Hand */}
          <div className="flex flex-wrap gap-2 sm:gap-2.5 justify-center py-1" role="group" aria-label={t("game.yourHand")}>
            {hand.map((c) => (
              <PlayingCard key={c} card={c} size="md" selected={selected.includes(c)} onClick={myTurn ? () => toggle(c) : undefined} />
            ))}
          </div>

          {myTurn && (
            <div className="rounded-xl bg-bg/85 border border-primary/40 p-3 flex flex-wrap gap-2 justify-center items-center fade-in">
              {view.phase === "lead" && (
                <>
                  <div className="w-full flex flex-wrap items-center justify-center gap-2 text-xs">
                    <span className="text-text-2 font-medium">{t("bura.select")}</span>
                    {selected.length > 0 && (
                      <span className={`chip ${sameSuit && selected.length <= maxLead ? "bg-primary/15 text-primary" : "bg-danger/15 text-danger"}`}>
                        {sameSuit && selected.length <= maxLead ? <CheckCircle2 size={11} /> : <ShieldAlert size={11} />}
                        {t("ui.selectedCount", { n: selected.length })} / {maxLead} · {sameSuit ? t("ui.sameSuitOk") : t("ui.sameSuitNeeded")}
                      </span>
                    )}
                  </div>
                  <button className="btn-primary px-6" disabled={!sameSuit || selected.length > maxLead} onClick={() => submit("lead")}>
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
