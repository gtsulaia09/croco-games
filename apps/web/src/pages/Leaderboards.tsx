import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Crown, Medal, Trophy } from "lucide-react";
import { GAME_TYPES, isGameType, type GlobalLeaderboardEntry, type LeaderboardEntry } from "@croco/shared/client";
import { get } from "../lib/api";
import { useSession } from "../store/session";
import { useT } from "../i18n";
import { Avatar, EmptyState, ErrorText, Spinner, UserName } from "../components/ui";
import { GameBadgeIcon } from "../components/GameArt";

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

  const gameRows = selected !== "global" ? ((rows ?? []) as LeaderboardEntry[]) : [];
  const top3 = gameRows.slice(0, 3);

  return (
    <div className="grid gap-4 fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="size-10 rounded-xl bg-gold/15 border border-gold/35 text-gold flex items-center justify-center">
            <Trophy size={20} />
          </span>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight">{t("leaderboard.title")}</h1>
            <p className="text-xs text-muted">{selected === "global" ? t("leaderboard.global") : t(`games.${selected}.name`)}</p>
          </div>
        </div>
        {selected !== "global" && (
          <div className="flex gap-1 bg-surface p-1 rounded-full border border-line">
            {(["all", "month", "week"] as const).map((p) => (
              <button
                key={p}
                className={`h-7 px-3 rounded-full text-xs font-semibold transition-colors ${period === p ? "bg-primary text-[#04180b]" : "text-muted hover:text-white"}`}
                onClick={() => setPeriod(p)}
              >
                {t(`leaderboard.periods.${p}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Game Selector Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
        <Link
          to="/leaderboards"
          role="tab"
          aria-selected={selected === "global"}
          className={`h-9 px-3.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            selected === "global" ? "bg-gold text-[#1d1404]" : "bg-surface border border-line text-text-2 hover:border-line-strong"
          }`}
        >
          <Trophy size={13} /> {t("leaderboard.global")}
        </Link>
        {GAME_TYPES.map((g) => (
          <Link
            key={g}
            to={`/leaderboards/${g}`}
            role="tab"
            aria-selected={selected === g}
            className={`h-9 px-3 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
              selected === g ? "bg-primary text-[#04180b]" : "bg-surface border border-line text-text-2 hover:border-line-strong"
            }`}
          >
            <GameBadgeIcon game={g} size={15} /> {t(`games.${g}.name`)}
          </Link>
        ))}
      </div>

      <ErrorText error={error} />

      {/* Top-3 Podium Cards for Game Leaderboards */}
      {selected !== "global" && top3.length > 0 && (
        <div className="grid sm:grid-cols-3 gap-3">
          {top3.map((r, idx) => {
            const podium =
              idx === 0
                ? { border: "border-gold/55 bg-gradient-to-b from-gold/14 via-surface to-surface", badge: "bg-gold text-[#1d1404]", ring: "gold" as const }
                : idx === 1
                  ? { border: "border-silver/40 bg-gradient-to-b from-silver/10 via-surface to-surface", badge: "bg-silver text-[#0f172a]", ring: "none" as const }
                  : { border: "border-bronze/45 bg-gradient-to-b from-bronze/12 via-surface to-surface", badge: "bg-bronze text-[#1f1005]", ring: "none" as const };
            return (
              <div key={r.user.id} className={`card p-4 border ${podium.border} flex flex-col gap-3`}>
                <div className="flex items-center justify-between">
                  <span className={`chip ${podium.badge} font-black`}>
                    {idx === 0 ? <Crown size={12} /> : <Medal size={12} />} #{r.rank}
                  </span>
                  {r.leadOverNext !== null && <span className="text-xs font-bold text-primary tabular-nums">+{r.leadOverNext}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <Avatar id={r.user.avatar} size={44} ring={podium.ring} />
                  <div className="min-w-0">
                    <UserName user={r.user} you={r.user.id === myId} className="font-extrabold text-white text-sm" />
                    <div className="text-xs text-muted mt-0.5 tabular-nums">
                      {r.wins}/{r.matches} · {r.winRate}%
                    </div>
                  </div>
                </div>
                <div className="flex items-baseline justify-between pt-2 border-t border-line/70">
                  <span className="text-[11px] uppercase tracking-wider text-muted">{period === "all" ? t("leaderboard.rating") : t("leaderboard.points")}</span>
                  <span className="text-2xl font-black text-white tabular-nums">{r.rating.toLocaleString()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Rankings Table */}
      <div className="card overflow-x-auto">
        {rows === null ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Trophy size={20} />}>{t("leaderboard.empty")}</EmptyState>
        ) : selected === "global" ? (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface-2 border-b border-line">
              <tr>
                <th className="p-3 text-left">{t("leaderboard.rank")}</th>
                <th className="p-3 text-left">{t("leaderboard.player")}</th>
                <th className="p-3 text-right">{t("leaderboard.gamesLed")}</th>
                <th className="p-3 text-right">{t("leaderboard.percentile")}</th>
                <th className="p-3 text-left hidden sm:table-cell">{t("leaderboard.strongest")}</th>
              </tr>
            </thead>
            <tbody>
              {(rows as GlobalLeaderboardEntry[]).map((r) => (
                <tr key={r.user.id} className={`table-row hover:bg-surface-hover/60 ${r.user.id === myId ? "bg-primary/12" : ""}`}>
                  <td className={`p-3 font-black tabular-nums ${r.rank === 1 ? "text-gold" : r.rank === 2 ? "text-silver" : r.rank === 3 ? "text-bronze" : "text-muted"}`}>#{r.rank}</td>
                  <td className="p-3">
                    <span className="flex items-center gap-2.5">
                      <Avatar id={r.user.avatar} size={28} ring={r.rank === 1 ? "gold" : "none"} />
                      <UserName user={r.user} you={r.user.id === myId} className="font-semibold text-white" />
                    </span>
                  </td>
                  <td className="p-3 text-right font-bold text-gold tabular-nums">{r.gamesLed}</td>
                  <td className="p-3 text-right tabular-nums text-text-2">{r.averagePercentile}</td>
                  <td className="p-3 hidden sm:table-cell text-text-2">{r.strongestGame ? t(`games.${r.strongestGame}.name`) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface-2 border-b border-line">
              <tr>
                <th className="p-3 text-left">{t("leaderboard.rank")}</th>
                <th className="p-3 text-left">{t("leaderboard.player")}</th>
                <th className="p-3 text-right">{period === "all" ? t("leaderboard.rating") : t("leaderboard.points")}</th>
                <th className="p-3 text-right hidden sm:table-cell">{t("leaderboard.lead")}</th>
                <th className="p-3 text-right">{t("leaderboard.matches")}</th>
                <th className="p-3 text-right hidden md:table-cell">
                  {t("leaderboard.wins")}/{t("leaderboard.losses")}
                </th>
                <th className="p-3 text-right hidden md:table-cell">{t("leaderboard.winRate")}</th>
                <th className="p-3 text-left hidden lg:table-cell">{t("leaderboard.recent")}</th>
              </tr>
            </thead>
            <tbody>
              {gameRows.map((r) => (
                <tr key={r.user.id} className={`table-row hover:bg-surface-hover/60 ${r.user.id === myId ? "bg-primary/12" : ""}`}>
                  <td className={`p-3 font-black tabular-nums ${r.rank === 1 ? "text-gold" : r.rank === 2 ? "text-silver" : r.rank === 3 ? "text-bronze" : "text-muted"}`}>#{r.rank}</td>
                  <td className="p-3">
                    <span className="flex items-center gap-2.5">
                      <Avatar id={r.user.avatar} size={28} ring={r.rank === 1 ? "gold" : "none"} />
                      <UserName user={r.user} you={r.user.id === myId} className="font-semibold text-white" />
                      {!r.established && <span className="chip bg-surface-3 border border-line text-muted">{t("leaderboard.provisional")}</span>}
                    </span>
                  </td>
                  <td className="p-3 text-right font-extrabold text-white tabular-nums">{r.rating.toLocaleString()}</td>
                  <td className="p-3 text-right hidden sm:table-cell text-primary font-semibold tabular-nums">{r.leadOverNext !== null ? `+${r.leadOverNext}` : "—"}</td>
                  <td className="p-3 text-right tabular-nums text-text-2">{r.matches}</td>
                  <td className="p-3 text-right hidden md:table-cell tabular-nums text-text-2">
                    {r.wins}/{r.losses}
                  </td>
                  <td className="p-3 text-right hidden md:table-cell tabular-nums font-semibold text-text-2">{r.winRate}%</td>
                  <td className="p-3 hidden lg:table-cell">
                    <span className="flex gap-1">
                      {r.recent.map((x, i) => (
                        <span
                          key={i}
                          className={`inline-flex items-center justify-center size-5 rounded-md text-[10px] font-black ${
                            x === "W" ? "bg-primary/20 text-primary" : x === "D" ? "bg-surface-3 text-muted" : "bg-danger/20 text-danger"
                          }`}
                        >
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
