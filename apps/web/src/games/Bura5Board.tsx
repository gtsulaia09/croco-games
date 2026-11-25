import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Bura5View } from "@croco/game-engine/games/bura5";
import { useT } from "../i18n";
import { PlayingCard } from "../components/ui";
import { MiniCardCount, opponentsOrder, SeatTag, TrumpBadge, TurnBar, useSeatName, type BoardProps } from "./common";

/** Dedicated Five-Card Bura Neo-Arena adapted for 5-card jumbo hands, smart same-suit combos, and elimination penalty gauges. */
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

  const toggle = (c: string) => {
    setSelected((cur) => {
      if (cur.includes(c)) return cur.filter((x) => x !== c);
      if (view.phase === "lead") {
        if (cur.length > 0 && cur[0]![1] !== c[1]) return [c];
        if (cur.length >= maxLead) return [...cur.slice(1), c];
        return [...cur, c];
      }
      if (responding && need > 0 && cur.length >= need) return [...cur.slice(1), c];
      return [...cur, c];
    });
  };

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
            <span className="chip bg-white/8 border border-white/14 text-white">{t("game.hand", { n: view.handNumber })}</span>
            <TrumpBadge card={view.trumpCard} suit={view.trump} />
            <span className="chip bg-white/8 border border-white/14 text-text-2">{t("game.stock", { n: view.stockCount })}</span>
            <span className="chip bg-danger/20 border border-danger/45 text-danger font-bold">{t("bura.limit", { n: view.penaltyLimit })}</span>
          </>
        }
      />

      {lastMessage && (
        <div className="rounded-2xl bg-accent/15 border border-accent/40 px-3.5 py-2 text-xs font-bold text-text-2 text-center">
          {lastMessage}
        </div>
      )}

      {/* Opponent Row with Penalty Progress */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {opponentsOrder(players, mySeat).map((s) => {
          const pen = view.penalties[s] ?? 0;
          return (
            <SeatTag key={s} seat={s} seats={seats} active={view.toAct === s} compact>
              <MiniCardCount count={view.players[s]!.handCount} />
              <span className="text-text-2 font-semibold">{t("bura.pile", { n: view.players[s]!.capturedCount })}</span>
              <span className={`font-extrabold tabular-nums ${penaltyTone(pen)}`}>
                {t("bura.penalties")}: {pen}/{view.penaltyLimit}
              </span>
            </SeatTag>
          );
        })}
      </div>

      {/* Sculpted Multi-Card Clash Well */}
      <div className="table-well min-h-40 grid sm:grid-cols-[auto_1fr] gap-5 items-center">
        <div className="flex sm:flex-col items-center justify-center gap-2 border-b sm:border-b-0 sm:border-r border-white/12 pb-3 sm:pb-0 sm:pr-5">
          <div className="relative flex items-center justify-center w-24 h-24">
            {view.trumpCard && (
              <span className="absolute -left-1.5 rotate-[-12deg] drop-shadow-lg">
                <PlayingCard card={view.trumpCard} size="sm" />
              </span>
            )}
            {view.stockCount > 0 && (
              <span className="relative translate-x-4 translate-y-1">
                <PlayingCard back size="sm" />
              </span>
            )}
          </div>
          <span className="chip bg-[#070e17]/85 border border-white/15 text-text-2 tabular-nums">{t("game.stock", { n: view.stockCount })}</span>
        </div>

        <div className="flex flex-wrap gap-3.5 justify-center items-center">
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
                      ? p.faceUp.map((c) => <PlayingCard key={c} card={c} size="sm" />)
                      : Array.from({ length: p.count }, (_, i) => <PlayingCard key={i} back size="sm" />)}
                  </div>
                  <span className={`text-xs font-extrabold ${best ? "text-primary" : "text-white"}`}>{name(p.seat)}</span>
                </div>
              );
            })
          ) : (
            <div className="text-center grid gap-1.5">
              <span className="text-sm font-extrabold uppercase tracking-wider text-white/45">{t("games.bura5.name")}</span>
              <span className="text-xs font-medium text-white/35">{t("bura.cardValues")}</span>
            </div>
          )}
        </div>
      </div>

      {/* Hero Station Adapted for Spacious 5-Card Jumbo Hand */}
      {mySeat !== null && view.you && (
        <div className="hero-hand-tray" data-my-turn={myTurn ? "true" : "false"}>
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="w-full sm:w-auto sm:min-w-64">
              <SeatTag seat={mySeat} seats={seats} active={myTurn} compact>
                <span className="text-text-2 font-semibold">{t("bura.pile", { n: view.players[mySeat]!.capturedCount })}</span>
                <span className={`font-extrabold tabular-nums ${penaltyTone(view.penalties[mySeat] ?? 0)}`}>
                  {t("bura.penalties")}: {view.penalties[mySeat] ?? 0}/{view.penaltyLimit}
                </span>
              </SeatTag>
            </div>
            <div className="rounded-2xl bg-[#0b1522] border border-white/14 px-3.5 py-2 min-w-48 flex-1 sm:flex-none">
              <div className="flex items-center justify-between text-xs font-bold gap-3">
                <span className="text-muted inline-flex items-center gap-1">
                  <AlertTriangle size={12} className="text-warning" /> {t("bura.penalties")}
                </span>
                <span className={`tabular-nums ${penaltyTone(view.penalties[mySeat] ?? 0)}`}>
                  {view.penalties[mySeat] ?? 0} / {view.penaltyLimit}
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-3 overflow-hidden mt-1.5">
                <div
                  className={`h-full rounded-full transition-all ${(view.penalties[mySeat] ?? 0) / Math.max(1, view.penaltyLimit) >= 0.75 ? "bg-danger" : "bg-warning"}`}
                  style={{ width: `${Math.min(100, Math.round(((view.penalties[mySeat] ?? 0) / Math.max(1, view.penaltyLimit)) * 100))}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:gap-3 justify-center py-1.5" role="group" aria-label={t("game.yourHand")}>
            {hand.map((c) => (
              <PlayingCard
                key={c}
                card={c}
                size="md"
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
                        <CheckCircle2 size={12} />
                        {t("ui.selectedCount", { n: selected.length })} / {maxLead}
                      </span>
                    )}
                  </div>
                  <button className="btn-primary btn-lg px-7" disabled={!sameSuit || selected.length > maxLead} onClick={() => submit("lead")}>
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
