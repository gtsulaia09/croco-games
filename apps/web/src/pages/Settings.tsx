import { useEffect, useState } from "react";
import { Award, Monitor, ShieldAlert, SlidersHorizontal, Trophy } from "lucide-react";
import { AVATAR_IDS, type GameType, type MatchHistoryDto, type PlayerStatsDto, type SessionDto } from "@croco/shared/client";
import { api, ApiError, get, post } from "../lib/api";
import { deleteFirebaseUser, reauthenticate } from "../lib/firebase";
import { useSession } from "../store/session";
import { useLocale, useT } from "../i18n";
import { Avatar, ErrorText, Section, StatusDot, UserName } from "../components/ui";
import { GameBadgeIcon } from "../components/GameArt";

export default function Settings() {
  const t = useT();
  const { me, refresh, signOut, provider } = useSession();
  const { setLocale } = useLocale();
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [history, setHistory] = useState<Array<{ ts: number; kind: string; country: string | null }>>([]);
  const [stats, setStats] = useState<PlayerStatsDto[]>([]);
  const [matches, setMatches] = useState<MatchHistoryDto[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    void Promise.all([
      get<{ items: SessionDto[] }>("/api/me/sessions").then((r) => setSessions(r.items)),
      get<{ items: typeof history }>("/api/me/login-history").then((r) => setHistory(r.items)),
      get<{ items: PlayerStatsDto[] }>("/api/me/stats").then((r) => setStats(r.items.filter((s) => s.matches > 0))),
      get<{ items: MatchHistoryDto[] }>("/api/me/matches?limit=10").then((r) => setMatches(r.items)),
    ]).catch(setError);
  }, []);

  if (!me?.profile) return null;
  const profile = me.profile;

  const totalMatches = stats.reduce((a, s) => a + s.matches, 0);
  const totalWins = stats.reduce((a, s) => a + s.wins, 0);
  const winRate = totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0;
  const bestRating = stats.length > 0 ? Math.max(...stats.map((s) => s.rating)) : null;

  async function update(patch: Record<string, unknown>) {
    try {
      await api("PATCH", "/api/me/profile", patch);
      if (typeof patch["locale"] === "string") setLocale(patch["locale"] as "ka" | "en");
      await refresh();
    } catch (e) {
      setError(e);
    }
  }

  async function deleteAccount() {
    setError(null);
    try {
      await reauthenticate(provider === "password" ? password : undefined);
      await api("DELETE", "/api/me");
      await deleteFirebaseUser().catch(() => undefined);
      await signOut();
    } catch (e) {
      setError(e instanceof ApiError ? e : "recent_auth_required");
    }
  }

  return (
    <div className="grid gap-5 fade-in max-w-4xl mx-auto">
      <ErrorText error={error} />

      {/* Player Profile Hero Banner */}
      <section className="card overflow-hidden">
        <div className="hero-surface p-5 sm:p-6 border-b border-line flex flex-wrap items-center gap-4">
          <Avatar id={profile.avatar} size={64} ring={profile.badges.admin ? "gold" : "primary"} />
          <div className="min-w-0 flex-1">
            <div className="text-xl font-black text-white">
              <UserName user={profile} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted mt-1">
              <span className="inline-flex items-center gap-1.5 text-primary font-semibold">
                <StatusDot status={profile.showOnline ? "online" : "offline"} />
                {profile.showOnline ? t("friends.status.online") : t("friends.status.offline")}
              </span>
              <span>·</span>
              <span className="font-mono">
                {t("settings.playerId")}: {profile.id}
              </span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-line bg-surface-2/65">
          {[
            { label: t("ui.totalMatches"), value: totalMatches },
            { label: t("ui.totalWins"), value: totalWins },
            { label: t("ui.winRate"), value: `${winRate}%` },
            { label: t("ui.bestRating"), value: bestRating !== null ? bestRating.toLocaleString() : "—" },
          ].map((k) => (
            <div key={k.label} className="p-4 text-center">
              <div className="text-[11px] uppercase tracking-wider text-muted font-bold">{k.label}</div>
              <div className="text-xl font-black text-white tabular-nums mt-0.5">{k.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Ratings & Recent Matches */}
      <Section title={t("settings.stats")} icon={<Trophy size={15} />}>
        {stats.length === 0 ? (
          <p className="text-sm text-muted">{t("leaderboard.empty")}</p>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-2.5 text-sm">
            {stats.map((s) => {
              const wr = s.matches > 0 ? Math.round((s.wins / s.matches) * 100) : 0;
              return (
                <li key={s.gameType} className="rounded-xl bg-surface-2 border border-line/80 p-3 flex items-center gap-3">
                  <GameBadgeIcon game={s.gameType as GameType} size={22} />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-white truncate">{t(`games.${s.gameType}.name`)}</div>
                    <div className="text-xs text-muted tabular-nums">
                      {s.wins}/{s.matches} ({wr}%)
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-black text-white tabular-nums">{s.rating.toLocaleString()}</div>
                    {s.rank && <div className="text-[11px] font-bold text-gold">#{s.rank}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {matches.length > 0 && (
          <div className="mt-5 pt-4 border-t border-line">
            <h3 className="label flex items-center gap-1.5">
              <Award size={13} className="text-gold" /> {t("settings.matches")}
            </h3>
            <ul className="grid gap-1.5 text-sm">
              {matches.map((m) => (
                <li key={m.matchId} className="flex items-center justify-between gap-2 rounded-lg bg-surface-3/80 border border-line/60 px-3 py-2 text-xs">
                  <span className="flex items-center gap-2 font-semibold text-text-2">
                    <GameBadgeIcon game={m.gameType as GameType} size={16} />
                    {t(`games.${m.gameType}.name`)} · <span className="text-gold">#{m.placement}/{m.players}</span>
                  </span>
                  <span className={`font-bold tabular-nums ${m.ratingDelta && m.ratingDelta > 0 ? "text-primary" : m.ratingDelta && m.ratingDelta < 0 ? "text-danger" : "text-muted"}`}>
                    {m.ratingDelta === null ? "—" : m.ratingDelta > 0 ? `+${m.ratingDelta}` : m.ratingDelta} · {new Date(m.finishedAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* Profile Customization */}
      <Section title={t("settings.profile")} icon={<SlidersHorizontal size={15} />}>
        <div className="grid gap-4">
          <div>
            <span className="label">{t("settings.avatar")}</span>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 panel-inset p-3">
              {AVATAR_IDS.map((id) => (
                <button
                  key={id}
                  className={`rounded-full p-0.5 transition-transform hover:scale-105 ${profile.avatar === id ? "ring-2 ring-primary bg-primary/15" : ""}`}
                  onClick={() => void update({ avatar: id })}
                  aria-pressed={profile.avatar === id}
                >
                  <Avatar id={id} size={32} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-5 items-center pt-1">
            <div>
              <span className="label">{t("settings.language")}</span>
              <div className="flex gap-1.5">
                {(["ka", "en"] as const).map((l) => (
                  <button key={l} className={profile.locale === l ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => void update({ locale: l })}>
                    {l === "ka" ? "ქართული" : "English"}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2.5 text-sm rounded-xl bg-surface-2 border border-line px-3.5 py-2 cursor-pointer mt-4 sm:mt-0">
              <input type="checkbox" className="accent-[var(--color-primary)]" checked={profile.showOnline} onChange={(e) => void update({ showOnline: e.target.checked })} />
              <span className="text-text-2">{t("settings.showOnline")}</span>
            </label>
          </div>
        </div>
      </Section>

      {/* Active Sessions & Login History */}
      <Section
        title={t("settings.sessions")}
        icon={<Monitor size={15} />}
        action={
          <button className="btn-danger btn-sm" onClick={() => void post("/api/me/sessions/revoke-all").then(() => signOut()).catch(setError)}>
            {t("settings.revokeAll")}
          </button>
        }
      >
        <ul className="grid gap-2 text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 border border-line/70 px-3 py-2.5">
              <span className="font-semibold text-white">{s.device}</span>
              <span className="text-xs text-muted">
                {s.provider} · {s.country ?? "—"} · {new Date(s.lastSeenAt).toLocaleString()}
              </span>
              {s.current && <span className="chip bg-primary/15 text-primary border border-primary/35">{t("settings.current")}</span>}
              {!s.current && !s.revoked && (
                <button
                  className="btn-ghost btn-sm ml-auto text-danger"
                  onClick={() => void post("/api/me/sessions/revoke", { sessionId: s.id }).then(() => setSessions((x) => x.map((y) => (y.id === s.id ? { ...y, revoked: true } : y)))).catch(setError)}
                >
                  {t("settings.revoke")}
                </button>
              )}
            </li>
          ))}
        </ul>
        <h3 className="label mt-4">{t("settings.history")}</h3>
        <ul className="grid gap-1 text-xs text-muted panel-inset p-3 max-h-40 overflow-y-auto">
          {history.map((h, i) => (
            <li key={i} className="tabular-nums">
              {new Date(h.ts).toLocaleString()} · <span className="text-text-2">{h.kind}</span> · {h.country ?? "—"}
            </li>
          ))}
        </ul>
      </Section>

      {/* Danger Zone */}
      <Section title={t("settings.danger")} icon={<ShieldAlert size={15} className="text-danger" />}>
        <p className="text-sm text-text-2 mb-3">{t("settings.deleteBody")}</p>
        <div className="grid sm:grid-cols-2 gap-2.5">
          <input className="input" placeholder={t("settings.deleteConfirm")} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-label={t("settings.deleteConfirm")} />
          {provider === "password" && <input className="input" type="password" autoComplete="current-password" placeholder={t("auth.password")} value={password} onChange={(e) => setPassword(e.target.value)} />}
        </div>
        <button className="btn-danger mt-3" disabled={confirmText !== "DELETE"} onClick={() => void deleteAccount()}>
          {t("settings.delete")}
        </button>
      </Section>
    </div>
  );
}
