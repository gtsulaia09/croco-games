import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { GAME_TYPES, isGameType, type GlobalLeaderboardEntry, type LeaderboardEntry } from "@croco/shared/client";
import { get } from "../lib/api";
import { useSession } from "../store/session";
import { useT } from "../i18n";
import { Avatar, EmptyState, ErrorText, Spinner, UserName } from "../components/ui";

export default function Leaderboards() {
  const { gameType } = useParams();
  const t = useT();
  const myId = useSession((s) => s.me?.profile?.id);
  const selected = isGameType(gameType) ? gameType : "global";
  const [period, setPeriod] = useState<"all" | "month" | "week">("all");
  const [rows, setRows] = useState<LeaderboardEntry[] | GlobalLeaderboardEntry[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    const path = selected === "global" ? "/api/leaderboards/global" : `/api/leaderboards/${selected}?period=${period}&limit=50`;
    get<{ items: LeaderboardEntry[] | GlobalLeaderboardEntry[] }>(path)
      .then((r) => !cancelled && setRows(r.items))
      .catch((e) => !cancelled && (setError(e), setRows([])));
    return () => {
      cancelled = true;
    };
  }, [selected, period]);

  return (
    <div className="grid gap-4 fade-in">
      <h1 className="text-xl font-bold">{t("leaderboard.title")}</h1>
      <div className="flex gap-1 overflow-x-auto pb-1" role="tablist">
        <Link to="/leaderboards" role="tab" aria-selected={selected === "global"} className={selected === "global" ? "btn-secondary btn-sm" : "btn-ghost btn-sm"}>
          {t("leaderboard.global")}
        </Link>
        {GAME_TYPES.map((g) => (
          <Link key={g} to={`/leaderboards/${g}`} role="tab" aria-selected={selected === g} className={`${selected === g ? "btn-secondary" : "btn-ghost"} btn-sm whitespace-nowrap`}>
            {t(`games.${g}.name`)}
          </Link>
        ))}
      </div>
      {selected !== "global" && (
        <div className="flex gap-1">
          {(["all", "month", "week"] as const).map((p) => (
            <button key={p} className={period === p ? "btn-primary btn-sm" : "btn-ghost btn-sm"} onClick={() => setPeriod(p)}>
              {t(`leaderboard.periods.${p}`)}
            </button>
          ))}
        </div>
      )}
      <ErrorText error={error} />
      <div className="card overflow-x-auto">
        {rows === null ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState>{t("leaderboard.empty")}</EmptyState>
        ) : selected === "global" ? (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted bg-surface-2">
              <tr>
                <th className="p-2 text-left">{t("leaderboard.rank")}</th>
                <th className="p-2 text-left">{t("leaderboard.player")}</th>
                <th className="p-2 text-right">{t("leaderboard.gamesLed")}</th>
                <th className="p-2 text-right">{t("leaderboard.percentile")}</th>
                <th className="p-2 text-left hidden sm:table-cell">{t("leaderboard.strongest")}</th>
              </tr>
            </thead>
            <tbody>
              {(rows as GlobalLeaderboardEntry[]).map((r) => (
                <tr key={r.user.id} className={`table-row ${r.user.id === myId ? "bg-primary/10" : ""}`}>
                  <td className="p-2 font-bold">{r.rank}</td>
                  <td className="p-2">
                    <span className="flex items-center gap-2">
                      <Avatar id={r.user.avatar} size={26} />
                      <UserName user={r.user} you={r.user.id === myId} />
                    </span>
                  </td>
                  <td className="p-2 text-right">{r.gamesLed}</td>
                  <td className="p-2 text-right tabular-nums">{r.averagePercentile}</td>
                  <td className="p-2 hidden sm:table-cell">{r.strongestGame ? t(`games.${r.strongestGame}.name`) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted bg-surface-2">
              <tr>
                <th className="p-2 text-left">{t("leaderboard.rank")}</th>
                <th className="p-2 text-left">{t("leaderboard.player")}</th>
                <th className="p-2 text-right">{period === "all" ? t("leaderboard.rating") : t("leaderboard.points")}</th>
                <th className="p-2 text-right hidden sm:table-cell">{t("leaderboard.lead")}</th>
                <th className="p-2 text-right">{t("leaderboard.matches")}</th>
                <th className="p-2 text-right hidden md:table-cell">
                  {t("leaderboard.wins")}/{t("leaderboard.losses")}
                </th>
                <th className="p-2 text-right hidden md:table-cell">{t("leaderboard.winRate")}</th>
                <th className="p-2 text-left hidden lg:table-cell">{t("leaderboard.recent")}</th>
              </tr>
            </thead>
            <tbody>
              {(rows as LeaderboardEntry[]).map((r) => (
                <tr key={r.user.id} className={`table-row ${r.user.id === myId ? "bg-primary/10" : ""}`}>
                  <td className="p-2 font-bold">{r.rank}</td>
                  <td className="p-2">
                    <span className="flex items-center gap-2">
                      <Avatar id={r.user.avatar} size={26} />
                      <UserName user={r.user} you={r.user.id === myId} />
                      {!r.established && <span className="chip bg-surface-3 text-muted">{t("leaderboard.provisional")}</span>}
                    </span>
                  </td>
                  <td className="p-2 text-right font-semibold tabular-nums">{r.rating}</td>
                  <td className="p-2 text-right hidden sm:table-cell text-muted tabular-nums">{r.leadOverNext !== null ? `+${r.leadOverNext}` : "—"}</td>
                  <td className="p-2 text-right tabular-nums">{r.matches}</td>
                  <td className="p-2 text-right hidden md:table-cell tabular-nums">
                    {r.wins}/{r.losses}
                  </td>
                  <td className="p-2 text-right hidden md:table-cell tabular-nums">{r.winRate}%</td>
                  <td className="p-2 hidden lg:table-cell">
                    <span className="flex gap-0.5">
                      {r.recent.map((x, i) => (
                        <span key={i} className={`chip px-1.5 ${x === "W" ? "bg-primary/20 text-primary" : x === "D" ? "bg-surface-3 text-muted" : "bg-danger/20 text-danger"}`}>
                          {x}
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {selected === "global" && <p className="text-xs text-muted">{t("leaderboard.globalNote")}</p>}
    </div>
  );
}
