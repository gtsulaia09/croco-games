import type { ReactNode } from "react";
import type { SeatInfo } from "@croco/shared/client";
import { useT } from "../../i18n";
import { SuitIcon, suitSymbol } from "../../components/ui";
import { isRedSuit, useSeatName } from "../common";

/**
 * Status bar above the table: whose turn it is, then the game facts (chips) and the board's
 * own controls (e.g. the score sheet button) on the right.
 */
export function GameHud({
  toAct,
  mySeat,
  seats,
  title,
  chips,
  actions,
}: {
  toAct: number | null;
  mySeat: number | null;
  seats: SeatInfo[];
  title?: ReactNode;
  chips?: ReactNode;
  actions?: ReactNode;
}) {
  const t = useT();
  const name = useSeatName(seats);
  const mine = toAct !== null && toAct === mySeat;
  const state = toAct === null ? "over" : mine ? "mine" : "wait";
  return (
    <header className="phud">
      <span className="phud-turn" data-state={state} aria-live="polite">
        <i aria-hidden="true" />
        <span>{toAct === null ? t("game.finished") : mine ? t("game.yourTurn") : t("game.waitingFor", { name: name(toAct) })}</span>
      </span>
      {title && <span className="phud-title">{title}</span>}
      <div className="phud-chips">{chips}</div>
      {actions && <div className="phud-actions">{actions}</div>}
    </header>
  );
}

export function HudFact({ label, value, tone, title, optional }: { label?: ReactNode; value: ReactNode; tone?: "gold" | "teal" | "warn" | "danger"; title?: string; optional?: boolean }) {
  return (
    <span className="phud-chip" data-tone={tone} title={title} data-optional={optional ? "true" : undefined}>
      {label && <span className="phud-chip-label">{label}</span>}
      <b>{value}</b>
    </span>
  );
}

/** Trump suit as a small card-stock tile (or "no trump"). */
export function TrumpFact({ suit, joker, pending }: { suit: string | null; joker?: boolean; pending?: boolean }) {
  const t = useT();
  return (
    <span className="phud-chip" data-tone="gold">
      <span className="phud-chip-label">{t("game.trump")}</span>
      {pending ? (
        // Not declared yet (nine-card deals): never show "no trump" before anyone said it.
        <b aria-label={t("joker.trumpPending")}>?</b>
      ) : suit ? (
        <span className="suit-chip" data-red={isRedSuit(suit) ? "true" : "false"}>
          <SuitIcon suit={suit} size={14} />
          <span className="sr-only">{suitSymbol(suit)}</span>
        </span>
      ) : (
        <b>{joker ? t("ui.jokerCard") : t("game.noTrump")}</b>
      )}
    </span>
  );
}
