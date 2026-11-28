import type { ReactNode } from "react";
import { Link } from "react-router";
import { Crown, Dumbbell, Play, Users } from "lucide-react";
import type { GameLeaderDto } from "@croco/shared/client";
import { useT } from "../../i18n";
import { UserName } from "../ui";

export interface LobbyMode {
  /** Mode name, e.g. "Standard · 24 deals". */
  label: string;
  /** Short player / format note. */
  note?: string;
  /** Online rooms for this mode (signed-in players). */
  playTo?: string;
  /** Local practice against bots. */
  practiceTo: string;
}

/**
 * Trendy 2026 game bento card in the lobby: spotlighted card-art stage, crisp title,
 * concise description, current leader badge, and effortless Play / Practice mode actions.
 */
export function GameLobbyCard({
  title,
  tag,
  description,
  art,
  modes,
  leader,
  accent = "teal",
}: {
  title: string;
  tag: string;
  description: string;
  art: ReactNode;
  modes: LobbyMode[];
  leader?: GameLeaderDto | undefined;
  accent?: "teal" | "gold" | "lime";
}) {
  const t = useT();
  return (
    <li className="lobby-card" data-accent={accent}>
      <div className="lobby-card-art">
        {art}
        <span className="lobby-card-tag">
          <Users size={12} className="text-primary" /> {tag}
        </span>
      </div>
      <div className="lobby-card-body">
        <div className="lobby-card-head">
          <h3 className="lobby-card-title">{title}</h3>
          <span className="lobby-card-dot" aria-hidden="true" />
        </div>
        <p className="lobby-card-desc">{description}</p>

        {leader?.leader && (
          <div className="lobby-leader">
            <Crown size={13} className="text-gold shrink-0" />
            <span className="text-muted">{t("lobby.leaderTitle")}</span>
            <UserName user={leader.leader.user} className="font-semibold text-white min-w-0" />
            <b className="ml-auto tabular-nums">{leader.leader.rating.toLocaleString()}</b>
          </div>
        )}

        <div className="lobby-modes">
          <span className="lobby-modes-label">{t("lobby.modes")}</span>
          {modes.map((m) => (
            <div key={m.label} className="lobby-mode">
              <div className="min-w-0">
                <div className="lobby-mode-name">{m.label}</div>
                {m.note && <div className="lobby-mode-note">{m.note}</div>}
              </div>
              <div className="flex gap-1.5 shrink-0">
                {m.playTo && (
                  <Link to={m.playTo} className="btn-primary btn-sm" aria-label={`${t("lobby.play")} · ${m.label}`}>
                    <Play size={12} className="fill-current" /> {t("lobby.play")}
                  </Link>
                )}
                <Link
                  to={m.practiceTo}
                  className={m.playTo ? "btn-secondary btn-sm px-3" : "btn-primary btn-sm"}
                  aria-label={`${t("lobby.practice")} · ${m.label}`}
                  title={t("lobby.practice")}
                >
                  {m.playTo ? (
                    <>
                      <Dumbbell size={13} />
                      <span className="hidden sm:inline">{t("lobby.practiceShort")}</span>
                    </>
                  ) : (
                    <>
                      <Play size={12} className="fill-current" /> {t("lobby.practiceShort")}
                    </>
                  )}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </li>
  );
}
