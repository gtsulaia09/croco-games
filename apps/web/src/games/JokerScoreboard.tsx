import { useEffect, useRef } from "react";
import { Crown, Maximize2, X } from "lucide-react";
import type { JokerView } from "@croco/game-engine/games/joker";
import type { SeatInfo } from "@croco/shared/client";
import { useT } from "../i18n";
import { Avatar } from "../components/ui";
import { useSeatName } from "./common";
import { buildSheet, type SheetCell, type SheetSet } from "./jokerSheet";
import { bidLabel, signedPoints } from "./ui/labels";

function SeatAvatar({ seats, seat, size }: { seats: SeatInfo[]; seat: number; size: number }) {
  const s = seats[seat];
  if (s?.occupant === "human") return <Avatar id={s.user?.avatar} size={size} />;
  return (
    <span className="sc-bot" style={{ width: size, height: size }} aria-hidden="true">
      {(s?.botName ?? String(seat + 1)).replace("#", "")}
    </span>
  );
}

function setTitle(t: ReturnType<typeof useT>, set: SheetSet): string {
  const first = set.cards[0]!;
  const last = set.cards[set.cards.length - 1]!;
  const shape = first === last ? `${set.cards.length} × ${first}` : `${first} → ${last}`;
  return `${t("joker.set", { n: set.index + 1 })} · ${shape}`;
}

/** Points, then the declaration and the tricks taken (a declared 0 reads "პასი"). */
function ScoreCell({ cell, status }: { cell: SheetCell; status: "done" | "current" | "upcoming" }) {
  const t = useT();
  if (status === "upcoming") return <td className="sc-cell" data-result="upcoming" />;
  const result = status === "current" ? "current" : cell.points !== null && cell.points < 0 ? "minus" : cell.made ? "made" : "miss";
  return (
    <td className="sc-cell" data-result={result}>
      <span className="sc-points">{cell.points === null ? "" : signedPoints(cell.points)}</span>
      <span className="sc-decl">
        <i data-pass={cell.bid === 0 ? "true" : "false"} title={t("joker.bid")}>
          {cell.bid === null ? "·" : bidLabel(t, cell.bid)}
        </i>
        {cell.tricks !== null && <em title={t("joker.tricks")}>{cell.tricks}</em>}
      </span>
    </td>
  );
}

/**
 * Compact score panel shown during play: totals and the current declarations for every player
 * and, when there is room, the hands of the current set.
 */
export function CompactScoreboard({ view, seats, mySeat, onOpen }: { view: JokerView; seats: SeatInfo[]; mySeat: number | null; onOpen(): void }) {
  const t = useT();
  const name = useSeatName(seats);
  const sheet = buildSheet(view);
  const current = sheet.sets.find((s) => s.active) ?? sheet.sets.find((s) => !s.complete) ?? sheet.sets[sheet.sets.length - 1]!;
  return (
    <aside className="scc" aria-label={t("joker.sheet")}>
      <div className="scc-head">
        <div className="min-w-0">
          <div className="scc-title">{t("joker.sheet")}</div>
          <div className="scc-sub">
            {setTitle(t, current)} · {t("game.hand", { n: `${view.handNumber}/${view.totalHands}` })}
          </div>
        </div>
        <button type="button" className="scc-open" onClick={onOpen} aria-label={t("table.fullSheet")} title={t("table.fullSheet")}>
          <Maximize2 size={14} />
          <span>{t("table.fullSheet")}</span>
        </button>
      </div>
      <ol className="scc-players">
        {[0, 1, 2, 3].map((s) => {
          const bid = view.bids[s];
          const tricks = view.tricks[s] ?? 0;
          const tone = bid === null || bid === undefined ? "none" : tricks > bid ? "over" : tricks === bid ? "ok" : "short";
          return (
            <li key={s} className="scc-player" data-you={s === mySeat ? "true" : "false"} data-active={view.toAct === s ? "true" : "false"}>
              <SeatAvatar seats={seats} seat={s} size={26} />
              <span className="scc-name">
                {sheet.leaders.includes(s) && <Crown size={12} className="text-gold shrink-0" aria-label={t("table.leader")} />}
                <span className="truncate">{name(s)}</span>
              </span>
              <span className="scc-decl" data-tone={tone} title={`${t("joker.bid")} · ${t("joker.tricks")}`}>
                <i>{bidLabel(t, bid)}</i>
                <em>{view.phase === "play" ? tricks : "·"}</em>
              </span>
              <b className="scc-total">{view.totals[s]}</b>
            </li>
          );
        })}
      </ol>
      <table className="scc-set">
        <thead>
          <tr>
            <th scope="col">#</th>
            {[0, 1, 2, 3].map((s) => (
              <th key={s} scope="col" className="truncate">
                {name(s)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {current.rows.map((r) => (
            <tr key={r.hand} data-status={r.status}>
              <th scope="row">{r.cards}</th>
              {r.cells.map((c, s) => (
                <td key={s} data-result={r.status !== "done" ? r.status : c.points !== null && c.points < 0 ? "minus" : c.made ? "made" : "miss"}>
                  {r.status === "done" ? signedPoints(c.points ?? 0) : r.status === "current" ? bidLabel(t, c.bid) : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </aside>
  );
}

/** Full score sheet: every set and deal, sticky player header and totals footer. */
export function FullScoreboard({ open, onClose, view, seats, mySeat }: { open: boolean; onClose(): void; view: JokerView; seats: SeatInfo[]; mySeat: number | null }) {
  const t = useT();
  const name = useSeatName(seats);
  const ref = useRef<HTMLDivElement>(null);
  const currentRow = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    currentRow.current?.scrollIntoView({ block: "center" });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const sheet = buildSheet(view);
  const ranked = [0, 1, 2, 3].slice().sort((a, b) => (view.totals[b] ?? 0) - (view.totals[a] ?? 0));
  const place = (s: number) => ranked.findIndex((x) => view.totals[x] === view.totals[s]) + 1;

  return (
    <div className="scf-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="scf" role="dialog" aria-modal="true" aria-label={t("joker.sheet")}>
        <div className="scf-head">
          <div className="min-w-0">
            <h2 className="scf-title">{t("joker.sheet")}</h2>
            <p className="scf-sub">
              {t(`joker.rulesets.${view.ruleset}`)} · {view.phase === "over" ? t("game.finished") : t("game.hand", { n: `${view.handNumber}/${view.totalHands}` })}
            </p>
          </div>
          <button type="button" className="psheet-close" onClick={onClose} aria-label="close">
            <X size={16} />
          </button>
        </div>
        <div className="scf-scroll">
          <table className="scf-table">
            <thead>
              <tr>
                <th scope="col" className="scf-corner">
                  <span>{t("table.deal")}</span>
                </th>
                {[0, 1, 2, 3].map((s) => (
                  <th key={s} scope="col" className="scf-player" data-you={s === mySeat ? "true" : "false"}>
                    <span className="scf-player-in">
                      <SeatAvatar seats={seats} seat={s} size={30} />
                      <span className="scf-player-name">
                        <span className="truncate">{name(s)}</span>
                        <span className="scf-place">
                          {place(s) === 1 && sheet.leaders.length ? <Crown size={11} /> : null}#{place(s)}
                        </span>
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            {sheet.sets.map((set) => (
              <tbody key={set.index} data-active={set.active ? "true" : "false"}>
                <tr className="scf-set-row">
                  <th colSpan={5} scope="rowgroup">
                    {setTitle(t, set)}
                  </th>
                </tr>
                {set.rows.map((r) => (
                  <tr key={r.hand} data-status={r.status} ref={r.status === "current" ? currentRow : undefined}>
                    <th scope="row" className="scf-hand">
                      <b>{r.hand}</b>
                      <span>{t("table.cardsShort", { n: r.cards })}</span>
                    </th>
                    {r.cells.map((c, s) => (
                      <ScoreCell key={s} cell={c} status={r.status} />
                    ))}
                  </tr>
                ))}
                <tr className="scf-sub-row">
                  <th scope="row">{t("table.setTotal")}</th>
                  {set.subtotal.map((v, s) => (
                    <td key={s}>
                      <b data-sign={v < 0 ? "minus" : "plus"}>{set.rows.some((r) => r.status === "done") ? v : "—"}</b>
                      {set.bonus[s] !== 0 && (
                        <span className="scf-bonus" data-sign={set.bonus[s]! < 0 ? "minus" : "plus"}>
                          {t("table.bonus")} {signedPoints(set.bonus[s]!)}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            ))}
            <tfoot>
              <tr>
                <th scope="row">{t("joker.total")}</th>
                {sheet.totals.map((v, s) => (
                  <td key={s} data-leader={sheet.leaders.includes(s) ? "true" : "false"}>
                    {v}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="scf-legend">
          <span>
            <i className="lg-made" /> {t("table.legendMade")}
          </span>
          <span>
            <i className="lg-miss" /> {t("table.legendMiss")}
          </span>
          <span>
            <i className="lg-minus" /> {t("table.legendMinus")}
          </span>
          <span className="lg-decl">
            <i>{bidLabel(t, 0)}</i> = 0 · {t("joker.bid")} / {t("joker.tricks")}
          </span>
        </div>
      </div>
    </div>
  );
}
