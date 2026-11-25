import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { ArrowRight, Crown, Dumbbell, Info, Play, PlayCircle, Trophy, Users } from "lucide-react";
import { GAME_CATALOG, GAME_TYPES, type FriendDto, type GameLeaderDto, type GameType, type MatchHistoryDto, type PresenceStatus, type PublicUser } from "@croco/shared/client";
import { get } from "../lib/api";
import { useSession } from "../store/session";
import { useT } from "../i18n";
import { AdminBadge, Avatar, Section, StatusDot, UserName } from "../components/ui";
import { GAME_THEMES, GameArtwork, GameBadgeIcon } from "../components/GameArt";

type Category = "all" | "cards" | "poker" | "board";

export default function Dashboard() {
  const t = useT();
  const { status, me } = useSession();
  const [category, setCategory] = useState<Category>("all");
  const [leaders, setLeaders] = useState<Record<string, GameLeaderDto>>({});
  const [online, setOnline] = useState<Array<{ user: PublicUser; status: PresenceStatus }>>([]);
  const [friends, setFriends] = useState<FriendDto[]>([]);
  const [recentMatches, setRecentMatches] = useState<MatchHistoryDto[]>([]);
  const ready = status === "ready";

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void Promise.all([
      get<{ items: GameLeaderDto[] }>("/api/leaders").catch(() => ({ items: [] })),
      get<{ items: Array<{ user: PublicUser; status: PresenceStatus }> }>("/api/presence/online?limit=20").catch(() => ({ items: [] })),
      get<{ items: FriendDto[] }>("/api/friends").catch(() => ({ items: [] })),
      get<{ items: MatchHistoryDto[] }>("/api/me/matches?limit=5").catch(() => ({ items: [] })),
    ]).then(([l, o, f, m]) => {
      if (cancelled) return;
      setLeaders(Object.fromEntries(l.items.map((i) => [i.gameType, i])));
      setOnline(o.items);
      setFriends(f.items.filter((x) => x.status !== "offline"));
      setRecentMatches(m.items);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (status === "loading") return null;
  if (status === "signedOut") return <Navigate to="/login" replace />;
  if (status === "needsProfile" || status === "needsVerification") return <Navigate to={status === "needsProfile" ? "/setup" : "/verify"} replace />;

  const filteredGames = category === "all" ? GAME_TYPES : GAME_TYPES.filter((g) => GAME_THEMES[g].category === category);
  const categories: Array<{ id: Category; label: string }> = [
    { id: "all", label: t("ui.catAll") },
    { id: "cards", label: t("ui.catCards") },
    { id: "poker", label: t("ui.catPoker") },
    { id: "board", label: t("ui.catBoard") },
  ];

  return (
    <div className="grid gap-4 fade-in">
      {/* Compact honest demo notice when unconfigured — single clean bar, no double banner */}
      {status === "unconfigured" && (
        <div className="rounded-xl border border-warning/35 bg-warning/8 px-3.5 py-2.5 text-xs sm:text-sm text-text-2 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 min-w-0">
            <Info size={15} className="text-warning shrink-0" />
            <span>{t("demo.notConfigured")}</span>
          </span>
          <Link to="/practice" className="btn-primary btn-sm shrink-0">
            <Dumbbell size={13} /> {t("ui.quickPractice")}
          </Link>
        </div>
      )}

      {/* Authenticated Player Welcome Bar */}
      {ready && me?.profile && (
        <section className="card p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar id={me.profile.avatar} size={44} ring={me.profile.badges.admin ? "gold" : "primary"} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold text-white">{t("dashboard.hello", { name: me.profile.username })}</h1>
                {me.profile.badges.admin && <AdminBadge />}
                {!me.profile.badges.admin && me.profile.badges.moderator && (
                  <span className="chip bg-accent/15 text-accent border border-accent/35">{t("common.moderator")}</span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-muted">{t("app.tagline")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip bg-surface-2 border border-line text-text-2 h-8 px-3">
              <StatusDot status="online" />
              <span className="font-bold text-white tabular-nums">{online.length}</span>
              <span>{t("common.online")}</span>
            </span>
            {me.activeRoomId ? (
              <Link to={`/room/${me.activeRoomId}`} className="btn-gold btn-sm">
                <PlayCircle size={14} /> {t("dashboard.returnToGame")}
              </Link>
            ) : (
              <Link to="/practice" className="btn-secondary btn-sm">
                <Dumbbell size={14} /> {t("ui.quickPractice")}
              </Link>
            )}
          </div>
        </section>
      )}

      {ready && me?.activeRoomId && (
        <div className="rounded-xl border border-primary/45 bg-primary/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2 font-medium text-white">
            <span className="size-2 rounded-full bg-primary turn-dot" />
            {t("dashboard.activeGame")}
          </span>
          <Link to={`/room/${me.activeRoomId}`} className="btn-primary btn-sm">
            <PlayCircle size={14} /> {t("dashboard.returnToGame")}
          </Link>
        </div>
      )}

      <div className={`grid gap-5 ${ready ? "lg:grid-cols-[1fr_296px]" : ""}`}>
        {/* Game Lobby Grid */}
        <div className="grid gap-3.5 content-start">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div>
              <h2 className="text-lg font-bold text-white">{t("dashboard.games")}</h2>
              {!ready && <p className="text-xs text-muted">{t("ui.arenaHero")}</p>}
            </div>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("dashboard.games")}>
              {categories.map((c) => (
                <button
                  key={c.id}
                  role="tab"
                  aria-selected={category === c.id}
                  onClick={() => setCategory(c.id)}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold transition-colors ${
                    category === c.id ? "bg-primary text-[#04180b]" : "bg-surface border border-line text-text-2 hover:text-white"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <ul className={`grid gap-3.5 ${ready ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}`}>
            {filteredGames.map((g) => (
              <GameCard key={g} game={g} leader={leaders[g]} ready={ready} />
            ))}
          </ul>
        </div>

        {/* Live Social & Activity Rail (Authenticated) */}
        {ready && (
          <aside className="grid gap-4 content-start">
            <Section
              title={t("dashboard.friendsOnline")}
              icon={<Users size={15} />}
              action={
                <Link to="/friends" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
                  {t("nav.friends")} <ArrowRight size={12} />
                </Link>
              }
            >
              {friends.length ? (
                <ul className="grid gap-2">
                  {friends.map((f) => (
                    <li key={f.user.id} className="flex items-center gap-2.5 rounded-xl bg-surface-2 px-2.5 py-2 text-sm">
                      <Avatar id={f.user.avatar} size={28} />
                      <div className="min-w-0 flex-1">
                        <UserName user={f.user} className="font-semibold text-xs" />
                        <div className="flex items-center gap-1.5 text-[11px] text-muted mt-0.5">
                          <StatusDot status={f.status} />
                          <span className="truncate">
                            {t(`friends.status.${f.status}`)}
                            {f.gameType ? ` · ${t(`games.${f.gameType}.name`)}` : ""}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted">{t("friends.empty")}</p>
              )}
            </Section>

            <Section
              title={t("dashboard.online")}
              icon={<StatusDot status="online" />}
              action={<span className="chip bg-surface-3 text-text-2 tabular-nums">{online.length}</span>}
            >
              {online.length ? (
                <ul className="grid gap-1 max-h-56 overflow-y-auto pr-1">
                  {online.map((o) => (
                    <li key={o.user.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded-lg hover:bg-surface-2">
                      <StatusDot status={o.status} />
                      <Avatar id={o.user.avatar} size={22} />
                      <UserName user={o.user} you={o.user.id === me?.profile?.id} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted">{t("dashboard.nobodyOnline")}</p>
              )}
            </Section>

            {recentMatches.length > 0 && (
              <Section
                title={t("settings.matches")}
                icon={<Trophy size={15} />}
                action={
                  <Link to="/settings" className="text-xs font-semibold text-primary hover:underline">
                    {t("nav.settings")}
                  </Link>
                }
              >
                <ul className="grid gap-1.5">
                  {recentMatches.map((m) => (
                    <li key={m.matchId} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-2.5 py-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <GameBadgeIcon game={m.gameType as GameType} size={15} />
                        <span className="font-medium text-text-2 truncate">{t(`games.${m.gameType}.name`)}</span>
                        <span className="text-muted">#{m.placement}/{m.players}</span>
                      </div>
                      <span
                        className={`font-semibold tabular-nums ${
                          m.ratingDelta && m.ratingDelta > 0 ? "text-primary" : m.ratingDelta && m.ratingDelta < 0 ? "text-danger" : "text-muted"
                        }`}
                      >
                        {m.ratingDelta === null ? "—" : m.ratingDelta > 0 ? `+${m.ratingDelta}` : m.ratingDelta}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function GameCard({ game, leader, ready }: { game: GameType; leader?: GameLeaderDto; ready: boolean }) {
  const t = useT();
  const theme = GAME_THEMES[game];
  const info = GAME_CATALOG[game];
  const playerLabel =
    info.minPlayers === info.maxPlayers
      ? t("ui.playersExact", { n: info.minPlayers })
      : t("ui.playersRange", { min: info.minPlayers, max: info.maxPlayers });

  return (
    <li className="game-card">
      {/* Compact Game Artwork Header */}
      <div className={`relative h-24 bg-gradient-to-br ${theme.headerBg} border-b border-line/60 overflow-hidden`}>
        <GameArtwork game={game} className="w-full h-full object-cover" />
        <span className={`chip absolute top-2.5 left-2.5 ${theme.badgeClass}`}>{t(`games.${game}.tag`)}</span>
        <span className="absolute bottom-2 left-2.5 inline-flex items-center gap-1 text-[11px] font-medium text-text-2 bg-bg/80 rounded-md px-2 py-0.5">
          <Users size={11} className="text-muted" /> {playerLabel}
        </span>
      </div>

      {/* Card Body */}
      <div className="p-3.5 flex flex-col gap-2.5 flex-1">
        <div>
          <div className="flex items-center gap-2">
            <GameBadgeIcon game={game} size={17} />
            <h3 className="font-bold text-[15px] text-white leading-snug">{t(`games.${game}.name`)}</h3>
          </div>
          <p className="text-xs text-muted mt-1 leading-relaxed">{t(`games.${game}.desc`)}</p>
        </div>

        {/* Dedicated Leader Spotlight */}
        {ready && (
          <div className="rounded-lg bg-surface-2 px-2.5 py-2 text-xs">
            {leader?.leader ? (
              <>
                <div className="flex items-center gap-1.5">
                  <Crown size={12} className="text-gold shrink-0" />
                  <span className="font-bold text-gold">#1</span>
                  <UserName user={leader.leader.user} className="font-semibold text-white" />
                  <span className="ml-auto font-bold text-white tabular-nums">{leader.leader.rating.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted mt-0.5">
                  <span className="text-primary font-medium">
                    {leader.leader.leadOverSecond !== null ? t("dashboard.lead", { points: leader.leader.leadOverSecond }) : t("dashboard.leader")}
                  </span>
                  {leader.youLead ? (
                    <span className="text-gold font-semibold">{t("dashboard.youLead")}</span>
                  ) : leader.yourRank ? (
                    <span>{t("dashboard.yourRank", { rank: leader.yourRank })}</span>
                  ) : null}
                </div>
              </>
            ) : (
              <span className="text-muted">{t("dashboard.noLeader")}</span>
            )}
          </div>
        )}

        {/* Primary Play / Practice CTAs */}
        <div className="flex items-center gap-2 mt-auto pt-0.5">
          {ready ? (
            <>
              <Link to={`/games/${game}`} className="btn-primary btn-sm flex-1">
                <Play size={13} className="fill-current" /> {t("dashboard.playNow")}
              </Link>
              <Link to={`/practice/${game}`} className="btn-secondary btn-sm px-2.5" title={t("dashboard.practice")} aria-label={t("dashboard.practice")}>
                <Dumbbell size={13} />
              </Link>
            </>
          ) : (
            <Link to={`/practice/${game}`} className="btn-primary btn-sm w-full">
              <Play size={13} className="fill-current" /> {t("dashboard.practice")}
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
