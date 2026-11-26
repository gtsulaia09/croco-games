import { useEffect, useRef } from "react";
import { Crown, Maximize2, Star, X } from "lucide-react";
import type { JokerView } from "@croco/game-engine/games/joker";
import type { SeatInfo } from "@croco/shared/client";
import { useT } from "../i18n";
import { Avatar } from "../components/ui";
import { useSeatName } from "./common";
import { buildSheet, type SheetCell, type SheetSet } from "./jokerSheet";
import { bidLabel, dealPoints, sheetTotal, signedPoints } from "./ui/labels";

/*
 * The Joker score sheet (ოქმი), drawn as the paper sheet players keep beside the table. A deal's
 * cell shows the points as written (300, 30, −500) with the declaration in its corner; every sum —
 * pulka subtotals, totals — counts in hundreds (3.0, 0.3, −5.0). Deals erased by another
 * player's premia are struck through, and the deal a premia repeated carries a star.
 */

const ROMAN = ["I", "II", "III", "IV"];

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
  return `${t("joker.set", { n: ROMAN[set.index] ?? set.index + 1 })} · ${shape}`;
}

type CellState = "made" | "miss" | "khishti" | "current" | "upcoming";

function cellState(cell: SheetCell, status: "done" | "current" | "upcoming"): CellState {
  if (status !== "done") return status;
  if (cell.points !== null && cell.points < 0) return "khishti";
  return cell.made ? "made" : "miss";
}

/** Hover / screen-reader text: declaration, tricks taken, points and what happened to them. */
function cellTitle(t: ReturnType<typeof useT>, cell: SheetCell): string {
  const parts = [`${t("joker.bid")} ${bidLabel(t, cell.bid)}`];
  if (cell.tricks !== null) parts.push(`${t("joker.tricks")} ${cell.tricks}`);
  if (cell.points !== null) parts.push(dealPoints(cell.points));
  if (cell.premia) parts.push(t("table.bonus"));
  if (cell.erased) parts.push(t("table.erased"));
  return parts.join(" · ");
}

/** One deal of one player: points as written, the declaration in the corner. */
function DealCell({ cell, status }: { cell: SheetCell; status: "done" | "current" | "upcoming" }) {
  const t = useT();
  const state = cellState(cell, status);
  if (state === "upcoming") return <td className="ok-cell" data-state="upcoming" />;
  if (state === "current") {
    return (
      <td className="ok-cell" data-state="current" title={cellTitle(t, cell)}>
        <span className="ok-bid" data-pass={cell.bid === 0 ? "true" : "false"}>
          {cell.bid === null ? "·" : bidLabel(t, cell.bid)}
        </span>
        <span className="ok-pts ok-pencil">{cell.tricks === null ? "" : cell.tricks}</span>
      </td>
    );
  }
  return (
    <td className="ok-cell" data-state={state} data-erased={cell.erased ? "true" : "false"} title={cellTitle(t, cell)}>
      <span className="ok-bid" data-pass={cell.bid === 0 ? "true" : "false"}>
        {bidLabel(t, cell.bid)}
      </span>
      <span className="ok-pts">
        {cell.premia && <Star size={11} className="ok-star" aria-hidden="true" />}
        {dealPoints(cell.points ?? 0)}
      </span>
    </td>
  );
}

/**
 * Compact score panel shown during play: totals (in hundreds) and the current declarations for
 * every player and, when there is room, the deals of the current pulka.
 */
export function CompactScoreboard({ view, seats, mySeat, onOpen }: { view: JokerView; seats: SeatInfo[]; mySeat: number | null; onOpen(): void }) {
  const t = useT();
  const name = useSeatName(seats);
  const sheet = buildSheet(view);
  const current = sheet.sets.find((s) => s.active) ?? sheet.sets.find((s) => !s.complete) ?? sheet.sets[sheet.sets.length - 1]!;
  const anyDone = current.rows.some((r) => r.status === "done");
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
                {sheet.leaders.includes(s) && <Crown size={12} className="scc-crown shrink-0" aria-label={t("table.leader")} />}
                <span className="truncate">{name(s)}</span>
              </span>
              <span className="scc-decl" data-tone={tone} title={`${t("joker.bid")} · ${t("joker.tricks")}`}>
                <i data-pass={bid === 0 ? "true" : "false"}>{bidLabel(t, bid)}</i>
                {view.phase === "play" && <em>{tricks}</em>}
              </span>
              <b className="scc-total" data-sign={(view.totals[s] ?? 0) < 0 ? "minus" : "plus"}>
                {sheetTotal(view.totals[s] ?? 0)}
              </b>
            </li>
          );
        })}
      </ol>
      <table className="scc-set">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">{t("table.deal")}</span>
            </th>
            {[0, 1, 2, 3].map((s) => (
              <th key={s} scope="col" data-you={s === mySeat ? "true" : "false"}>
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
                <DealCell key={s} cell={c} status={r.status} />
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" title={t("table.setTotal")}>
              Σ
            </th>
            {current.subtotal.map((v, s) => (
              <td key={s} data-sign={v < 0 ? "minus" : "plus"}>
                {anyDone ? sheetTotal(v) : "—"}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </aside>
  );
}

/** Full score sheet: every pulka and deal, sticky player header and totals footer. */
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
  const rules = view.rules;

  return (
    <div className="ok-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="ok" role="dialog" aria-modal="true" aria-label={t("joker.sheet")}>
        <div className="ok-head">
          <div className="min-w-0">
            <h2 className="ok-title">{t("joker.sheet")}</h2>
            <p className="ok-sub">
              {t(`joker.rulesets.${view.ruleset}`)} · {view.phase === "over" ? t("game.finished") : t("game.hand", { n: `${view.handNumber}/${view.totalHands}` })}
            </p>
            {rules && (
              <ul className="ok-rules" aria-label={t("joker.rules")}>
                <li>
                  {t("opt.setBonus")}: <b>{t(`opt.values.${rules.setBonus}`)}</b>
                </li>
                <li>
                  {t("opt.hist")}: <b>{t(`opt.values.${rules.hist}`)}</b>
                </li>
              </ul>
            )}
          </div>
          <button type="button" className="ok-close" onClick={onClose} aria-label="close">
            <X size={16} />
          </button>
        </div>
        <div className="ok-scroll">
          <table className="ok-table">
            <thead>
              <tr>
                <th scope="col" className="ok-corner" aria-label={t("table.deal")}>
                  <span className="ok-corner-long">{t("table.deal")}</span>
                  <span className="ok-corner-short" aria-hidden="true">
                    #
                  </span>
                </th>
                {[0, 1, 2, 3].map((s) => (
                  <th key={s} scope="col" className="ok-player" data-you={s === mySeat ? "true" : "false"}>
                    <span className="ok-player-in">
                      <SeatAvatar seats={seats} seat={s} size={28} />
                      <span className="ok-player-name">
                        <span className="truncate">{name(s)}</span>
                        <span className="ok-place">
                          {place(s) === 1 && sheet.leaders.length ? <Crown size={11} /> : null}#{place(s)}
                        </span>
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            {sheet.sets.map((set) => {
              const anyDone = set.rows.some((r) => r.status === "done");
              const adjusted = set.premia.some((v) => v > 0) || set.erased.some((v) => v > 0);
              return (
                <tbody key={set.index} data-active={set.active ? "true" : "false"}>
                  <tr className="ok-set-row">
                    <th colSpan={5} scope="rowgroup">
                      {setTitle(t, set)}
                    </th>
                  </tr>
                  {set.rows.map((r) => (
                    <tr key={r.hand} data-status={r.status} ref={r.status === "current" ? currentRow : undefined}>
                      <th scope="row" className="ok-hand">
                        <b>{r.hand}</b>
                        <span>{t("table.cardsShort", { n: r.cards })}</span>
                      </th>
                      {r.cells.map((c, s) => (
                        <DealCell key={s} cell={c} status={r.status} />
                      ))}
                    </tr>
                  ))}
                  {adjusted && (
                    <tr className="ok-adj-row">
                      <th scope="row">{t("table.adjustments")}</th>
                      {[0, 1, 2, 3].map((s) => (
                        <td key={s}>
                          {set.premia[s]! > 0 && (
                            <span className="ok-adj" data-kind="premia">
                              <Star size={11} aria-hidden="true" /> {signedPoints(set.premia[s]!)}
                            </span>
                          )}
                          {set.erased[s]! > 0 && (
                            <span className="ok-adj" data-kind="erase" title={t("table.erased")}>
                              {signedPoints(-set.erased[s]!)}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  )}
                  <tr className="ok-sub-row">
                    <th scope="row">{t("table.setTotal")}</th>
                    {set.subtotal.map((v, s) => (
                      <td key={s} data-sign={v < 0 ? "minus" : "plus"}>
                        {anyDone ? sheetTotal(v) : "—"}
                      </td>
                    ))}
                  </tr>
                </tbody>
              );
            })}
            <tfoot>
              <tr>
                <th scope="row">{t("joker.total")}</th>
                {sheet.totals.map((v, s) => (
                  <td key={s} data-leader={sheet.leaders.includes(s) ? "true" : "false"} data-sign={v < 0 ? "minus" : "plus"}>
                    {sheetTotal(v)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="ok-legend">
          <span>
            <i className="lg-made" /> {t("table.legendMade")}
          </span>
          <span>
            <i className="lg-miss" /> {t("table.legendMiss")}
          </span>
          <span>
            <i className="lg-minus" /> {t("table.legendMinus")}
          </span>
          <span>
            <Star size={11} className="lg-star" /> {t("table.legendPremia")}
          </span>
          <span>
            <s className="lg-erased">300</s> {t("table.legendErased")}
          </span>
          <span className="lg-units">{t("table.legendUnits")}</span>
        </div>
      </div>
    </div>
  );
}
