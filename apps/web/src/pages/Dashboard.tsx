import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { ArrowRight, Crown, Dumbbell, Gamepad2, Play, PlayCircle, Sparkles, Trophy, Users } from "lucide-react";
import { GAME_CATALOG, GAME_TYPES, type FriendDto, type GameLeaderDto, type GameType, type MatchHistoryDto, type PresenceStatus, type PublicUser } from "@croco/shared/client";
import { get } from "../lib/api";
import { useSession } from "../store/session";
import { useT } from "../i18n";
import { AdminBadge, Avatar, Section, StatusDot, UserName } from "../components/ui";
import { GAME_THEMES, GameArtwork, GameBadgeIcon } from "../components/GameArt";

type Category = "all" | "cards" | "poker" | "board";

function DemoBanner() {
  const t = useT();
  return (
    <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-xs sm:text-sm text-text-2 flex items-start gap-2.5">
      <Sparkles size={16} className="text-warning shrink-0 mt-0.5" />
      <span>{t("demo.notConfigured")}</span>
    </div>
  );
}

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
    <div className="grid gap-5 fade-in">
      {status === "unconfigured" && <DemoBanner />}

      {/* Hero Arena Header */}
      <section className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-[#0e3226] via-surface to-surface-2 p-5 sm:p-6 shadow-[0_12px_32px_rgba(0,0,0,0.34)]">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {ready && me?.profile ? (
              <Avatar id={me.profile.avatar} size={52} ring={me.profile.badges.admin ? "gold" : "primary"} />
            ) : (
              <span className="size-12 rounded-2xl bg-primary/15 border border-primary/35 flex items-center justify-center text-primary shrink-0">
                <Gamepad2 size={24} />
              </span>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  {ready && me?.profile ? t("dashboard.hello", { name: me.profile.username }) : t("app.name")}
                </h1>
                {ready && me?.profile?.badges.admin && <AdminBadge />}
                {ready && !me?.profile?.badges.admin && me?.profile?.badges.moderator && (
                  <span className="chip bg-accent/15 text-accent border border-accent/35">{t("common.moderator")}</span>
                )}
              </div>
              <p className="text-sm text-text-2/85 mt-0.5">{ready ? t("app.tagline") : t("ui.arenaHero")}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {ready && (
              <span className="chip bg-bg/70 border border-primary/35 text-text-2 h-9 px-3.5 text-xs">
                <StatusDot status="online" />
                <span className="font-bold text-white tabular-nums">{online.length}</span>
                <span>{t("common.online")}</span>
              </span>
            )}
            {ready && me?.activeRoomId ? (
              <Link to={`/room/${me.activeRoomId}`} className="btn-gold">
                <PlayCircle size={16} /> {t("dashboard.returnToGame")}
              </Link>
            ) : (
              <Link to="/practice" className="btn-primary">
                <Dumbbell size={16} /> {t("ui.quickPractice")}
              </Link>
            )}
          </div>
        </div>
      </section>

      {ready && me?.activeRoomId && (
        <div className="card p-4 flex flex-wrap items-center justify-between gap-3 border-primary/50 bg-primary/10">
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <span className="size-2.5 rounded-full bg-primary turn-dot" />
            <span>{t("dashboard.activeGame")}</span>
          </div>
          <Link to={`/room/${me.activeRoomId}`} className="btn-primary btn-sm">
            <PlayCircle size={15} /> {t("dashboard.returnToGame")}
          </Link>
        </div>
      )}

      <div className={`grid gap-5 ${ready ? "lg:grid-cols-[1fr_310px]" : ""}`}>
        {/* Main Game Arena Catalog */}
        <div className="grid gap-4 content-start">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold tracking-tight text-white flex items-center gap-2">
              <Gamepad2 size={18} className="text-primary" /> {t("dashboard.games")}
              <span className="chip bg-surface-2 border border-line text-muted">{filteredGames.length}</span>
            </h2>
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("dashboard.games")}>
              {categories.map((c) => (
                <button
                  key={c.id}
                  role="tab"
                  aria-selected={category === c.id}
                  onClick={() => setCategory(c.id)}
                  className={`h-8 px-3 rounded-full text-xs font-semibold transition-all ${
                    category === c.id
                      ? "bg-primary text-[#04180b]"
                      : "bg-surface border border-line text-text-2 hover:border-line-strong hover:text-white"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <ul className={`grid gap-4 ${ready ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
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
                    <li key={f.user.id} className="flex items-center gap-2.5 rounded-xl bg-surface-2 border border-line/70 px-2.5 py-2 text-sm">
                      <Avatar id={f.user.avatar} size={30} />
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
              action={<span className="chip bg-surface-3 border border-line text-text-2 tabular-nums">{online.length}</span>}
            >
              {online.length ? (
                <ul className="grid gap-1.5 max-h-60 overflow-y-auto pr-1">
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
                    {t("settings.profile")}
                  </Link>
                }
              >
                <ul className="grid gap-2">
                  {recentMatches.map((m) => (
                    <li key={m.matchId} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 border border-line/70 px-2.5 py-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <GameBadgeIcon game={m.gameType as GameType} size={16} />
                        <div className="min-w-0">
                          <div className="font-semibold text-text-2 truncate">{t(`games.${m.gameType}.name`)}</div>
                          <div className="text-[11px] text-muted">
                            #{m.placement}/{m.players}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`font-bold tabular-nums ${
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
    <li className="game-card group">
      {/* Bespoke Game Artwork Header */}
      <div className={`relative h-28 bg-gradient-to-br ${theme.headerBg} border-b border-line/80 overflow-hidden`}>
        <GameArtwork game={game} className="w-full h-full object-cover" />
        <div className="absolute top-2.5 left-3 flex items-center gap-1.5">
          <span className={`chip ${theme.badgeClass}`}>{theme.badgeText}</span>
        </div>
        <div className="absolute bottom-2.5 left-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-text-2 bg-bg/75 border border-white/10 rounded-full px-2.5 py-0.5">
            <Users size={11} className="text-muted" /> {playerLabel}
          </span>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div>
          <div className="flex items-center gap-2">
            <GameBadgeIcon game={game} size={18} />
            <h3 className="font-extrabold text-base text-white tracking-tight truncate">{t(`games.${game}.name`)}</h3>
          </div>
          <p className="text-xs text-muted mt-1 leading-relaxed line-clamp-2">{t(`games.${game}.desc`)}</p>
        </div>

        {/* Dedicated Leader Spotlight */}
        {ready && (
          <div className="rounded-xl bg-surface-3 border border-line/80 px-3 py-2 text-xs">
            {leader?.leader ? (
              <>
                <div className="flex items-center gap-1.5">
                  <Crown size={13} className="text-gold shrink-0" />
                  <span className="font-bold text-gold">#1</span>
                  <UserName user={leader.leader.user} className="font-semibold text-white" />
                  <span className="ml-auto font-extrabold text-white tabular-nums">{leader.leader.rating.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted mt-1">
                  <span className="text-primary/90 font-semibold">
                    {leader.leader.leadOverSecond !== null ? t("dashboard.lead", { points: leader.leader.leadOverSecond }) : t("dashboard.leader")}
                  </span>
                  {leader.youLead ? (
                    <span className="text-gold font-bold">{t("dashboard.youLead")}</span>
                  ) : leader.yourRank ? (
                    <span>{t("dashboard.yourRank", { rank: leader.yourRank })}</span>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-1.5 text-muted">
                <Crown size={12} className="opacity-50" />
                <span>{t("dashboard.noLeader")}</span>
              </div>
            )}
          </div>
        )}

        {/* Primary Play / Practice CTAs */}
        <div className="flex items-center gap-2 mt-auto pt-1">
          {ready ? (
            <>
              <Link to={`/games/${game}`} className="btn-primary btn-sm flex-1">
                <Play size={13} className="fill-current" /> {t("dashboard.playNow")}
              </Link>
              <Link to={`/practice/${game}`} className="btn-secondary btn-sm px-2.5" title={t("dashboard.practice")} aria-label={t("dashboard.practice")}>
                <Dumbbell size={14} />
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
