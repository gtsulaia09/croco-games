import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import { Crown, Dumbbell, PlayCircle } from "lucide-react";
import { GAME_CATALOG, GAME_TYPES, type FriendDto, type GameLeaderDto, type GameType, type PresenceStatus, type PublicUser } from "@croco/shared/client";
import { get } from "../lib/api";
import { useSession } from "../store/session";
import { useT } from "../i18n";
import { AdminBadge, Avatar, Section, UserName } from "../components/ui";

export const GAME_ICONS: Record<GameType, string> = {
  joker: "🃏",
  japanese_joker: "🎴",
  bura3: "♠",
  bura5: "♣",
  holdem: "♦",
  shortdeck: "6+",
  omaha: "Ω",
  omaha_hilo: "Ω½",
  dominoes: "🁫",
  backgammon: "🎲",
};

function DemoBanner() {
  const t = useT();
  return <div className="card p-4 border-warning/40 text-sm text-text-2 mb-4">{t("demo.notConfigured")}</div>;
}

export default function Dashboard() {
  const t = useT();
  const { status, me } = useSession();
  const [leaders, setLeaders] = useState<Record<string, GameLeaderDto>>({});
  const [online, setOnline] = useState<Array<{ user: PublicUser; status: PresenceStatus }>>([]);
  const [friends, setFriends] = useState<FriendDto[]>([]);
  const ready = status === "ready";

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void Promise.all([
      get<{ items: GameLeaderDto[] }>("/api/leaders").catch(() => ({ items: [] })),
      get<{ items: Array<{ user: PublicUser; status: PresenceStatus }> }>("/api/presence/online?limit=20").catch(() => ({ items: [] })),
      get<{ items: FriendDto[] }>("/api/friends").catch(() => ({ items: [] })),
    ]).then(([l, o, f]) => {
      if (cancelled) return;
      setLeaders(Object.fromEntries(l.items.map((i) => [i.gameType, i])));
      setOnline(o.items);
      setFriends(f.items.filter((x) => x.status !== "offline"));
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (status === "loading") return null;
  if (status === "signedOut") return <Navigate to="/login" replace />;
  if (status === "needsProfile" || status === "needsVerification") return <Navigate to={status === "needsProfile" ? "/setup" : "/verify"} replace />;

  return (
    <div className="grid gap-4 fade-in">
      {status === "unconfigured" && <DemoBanner />}
      {ready && me?.profile && (
        <div className="flex items-center gap-3">
          <Avatar id={me.profile.avatar} size={44} />
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2 flex-wrap">
              <span>{t("dashboard.hello", { name: me.profile.username })}</span>
              {me.profile.badges.admin && <AdminBadge />}
              {!me.profile.badges.admin && me.profile.badges.moderator && <span className="chip bg-accent/15 text-accent">{t("common.moderator")}</span>}
            </h1>
            <p className="text-sm text-muted">{t("app.tagline")}</p>
          </div>
        </div>
      )}
      {ready && me?.activeRoomId && (
        <div className="card p-4 flex flex-wrap items-center justify-between gap-3 border-primary/50">
          <span className="text-sm">{t("dashboard.activeGame")}</span>
          <Link to={`/room/${me.activeRoomId}`} className="btn-primary">
            <PlayCircle size={16} /> {t("dashboard.returnToGame")}
          </Link>
        </div>
      )}
      <div className="grid lg:grid-cols-[1fr_300px] gap-4">
        <Section title={t("dashboard.games")}>
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {GAME_TYPES.map((g) => {
              const l = leaders[g];
              return (
                <li key={g} className="rounded-lg bg-surface-2 border border-line p-3 flex flex-col gap-2">
                  <div className="flex items-start gap-3">
                    <span className="size-10 rounded-lg bg-surface-3 flex items-center justify-center text-lg font-bold text-gold" aria-hidden>
                      {GAME_ICONS[g]}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-semibold">{t(`games.${g}.name`)}</h3>
                      <p className="text-xs text-muted">{t(`games.${g}.desc`)}</p>
                    </div>
                  </div>
                  {ready && (
                    <div className="text-xs rounded-md bg-surface-3 px-2 py-1.5 min-h-[2.75rem]">
                      {l?.leader ? (
                        <>
                          <div className="flex items-center gap-1.5">
                            <Crown size={13} className="text-gold" />
                            <UserName user={l.leader.user} />
                            <span className="ml-auto font-semibold text-white">{l.leader.rating}</span>
                          </div>
                          <div className="flex justify-between text-muted mt-0.5">
                            <span>{l.leader.leadOverSecond !== null ? t("dashboard.lead", { points: l.leader.leadOverSecond }) : ""}</span>
                            {l.youLead ? <span className="text-primary font-semibold">{t("dashboard.youLead")}</span> : l.yourRank ? <span>{t("dashboard.yourRank", { rank: l.yourRank })}</span> : null}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted">{t("dashboard.noLeader")}</span>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2 mt-auto">
                    {ready && (
                      <Link to={`/games/${g}`} className="btn-primary btn-sm flex-1">
                        {t("dashboard.playNow")}
                      </Link>
                    )}
                    <Link to={`/practice/${g}`} className="btn-ghost btn-sm" title={t("dashboard.practice")}>
                      <Dumbbell size={14} /> {ready ? "" : t("dashboard.practice")}
                    </Link>
                  </div>
                  <span className="sr-only">
                    {GAME_CATALOG[g].minPlayers}–{GAME_CATALOG[g].maxPlayers}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
        {ready && (
          <div className="grid gap-4 content-start">
            <Section title={t("dashboard.friendsOnline")}>
              {friends.length ? (
                <ul className="grid gap-2">
                  {friends.map((f) => (
                    <li key={f.user.id} className="flex items-center gap-2 text-sm">
                      <Avatar id={f.user.avatar} size={28} />
                      <UserName user={f.user} />
                      <span className="ml-auto chip bg-surface-3 text-muted">{t(`friends.status.${f.status}`)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">{t("friends.empty")}</p>
              )}
            </Section>
            <Section title={t("dashboard.online")}>
              {online.length ? (
                <ul className="grid gap-2 max-h-80 overflow-y-auto">
                  {online.map((o) => (
                    <li key={o.user.id} className="flex items-center gap-2 text-sm">
                      <span className={`size-2 rounded-full ${o.status === "in_game" ? "bg-gold" : o.status === "away" ? "bg-muted" : "bg-primary"}`} />
                      <UserName user={o.user} you={o.user.id === me?.profile?.id} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">{t("dashboard.nobodyOnline")}</p>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
