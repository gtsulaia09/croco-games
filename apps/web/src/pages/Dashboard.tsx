import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { ArrowRight, Dumbbell, Info, Play, PlayCircle, Trophy, Users } from "lucide-react";
import type { FriendDto, GameLeaderDto, GameType, MatchHistoryDto, PresenceStatus, PublicUser } from "@croco/shared/client";
import { get } from "../lib/api";
import { useSession } from "../store/session";
import { useT } from "../i18n";
import { AdminBadge, Avatar, Section, StatusDot, UserName } from "../components/ui";
import { GameBadgeIcon } from "../components/GameArt";
import { HeroArt } from "../components/lobby/LobbyArt";
import { LobbyGrid } from "../components/lobby/LobbyGrid";

export default function Dashboard() {
  const t = useT();
  const { status, me } = useSession();
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

  return (
    <div className="grid gap-5 fade-in">
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

      {/* Hero */}
      <section className="lobby-hero">
        <div className="lobby-hero-copy">
          {ready && me?.profile ? (
            <div className="flex items-center gap-2.5 mb-3">
              <Avatar id={me.profile.avatar} size={36} ring={me.profile.badges.admin ? "gold" : "primary"} />
              <span className="text-sm font-semibold text-text-2 truncate">{t("dashboard.hello", { name: me.profile.username })}</span>
              {me.profile.badges.admin && <AdminBadge />}
              <span className="chip bg-surface-3/80 border border-line text-text-2 ml-1">
                <StatusDot status="online" />
                <b className="text-white tabular-nums">{online.length}</b> {t("common.online")}
              </span>
            </div>
          ) : (
            <span className="lobby-eyebrow">{t("lobby.eyebrow")}</span>
          )}
          <h1 className="lobby-hero-title">{t("lobby.heroTitle")}</h1>
          <p className="lobby-hero-text">{t("lobby.heroText")}</p>
          <div className="flex flex-wrap gap-2.5 mt-5">
            {ready ? (
              me?.activeRoomId ? (
                <Link to={`/room/${me.activeRoomId}`} className="btn-gold btn-lg">
                  <PlayCircle size={17} /> {t("dashboard.returnToGame")}
                </Link>
              ) : (
                <Link to="/games/joker" className="btn-primary btn-lg">
                  <Play size={16} className="fill-current" /> {t("lobby.play")} · {t("games.joker.name")}
                </Link>
              )
            ) : (
              <Link to="/practice/joker" className="btn-primary btn-lg">
                <Play size={16} className="fill-current" /> {t("lobby.play")} · {t("games.joker.name")}
              </Link>
            )}
            <Link to="/practice" className="btn-secondary btn-lg">
              <Dumbbell size={16} /> {t("lobby.practice")}
            </Link>
          </div>
        </div>
        <HeroArt className="lobby-hero-art" />
      </section>

      <div className={`grid gap-5 ${ready ? "xl:grid-cols-[1fr_296px]" : ""}`}>
        <div className="grid gap-3.5 content-start">
          <h2 className="text-lg font-bold text-white">{t("lobby.choose")}</h2>
          <LobbyGrid online={ready} leaders={leaders} />
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
