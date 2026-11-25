import { useEffect, useState } from "react";
import { AVATAR_IDS, type MatchHistoryDto, type PlayerStatsDto, type SessionDto } from "@croco/shared/client";
import { api, ApiError, get, post } from "../lib/api";
import { deleteFirebaseUser, reauthenticate } from "../lib/firebase";
import { useSession } from "../store/session";
import { useLocale, useT } from "../i18n";
import { Avatar, ErrorText, Section } from "../components/ui";

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
    <div className="grid gap-4 fade-in max-w-3xl">
      <h1 className="text-xl font-bold">{t("settings.title")}</h1>
      <ErrorText error={error} />
      <Section title={t("settings.profile")}>
        <div className="grid gap-4">
          <div>
            <span className="label">{t("settings.avatar")}</span>
            <div className="grid grid-cols-8 sm:grid-cols-12 gap-2">
              {AVATAR_IDS.map((id) => (
                <button key={id} className={`rounded-full p-0.5 ${profile.avatar === id ? "ring-2 ring-primary" : ""}`} onClick={() => void update({ avatar: id })} aria-pressed={profile.avatar === id}>
                  <Avatar id={id} size={30} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <span className="label">{t("settings.language")}</span>
              <div className="flex gap-1">
                {(["ka", "en"] as const).map((l) => (
                  <button key={l} className={profile.locale === l ? "btn-primary btn-sm" : "btn-ghost btn-sm"} onClick={() => void update({ locale: l })}>
                    {l === "ka" ? "ქართული" : "English"}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={profile.showOnline} onChange={(e) => void update({ showOnline: e.target.checked })} />
              {t("settings.showOnline")}
            </label>
          </div>
        </div>
      </Section>
      <Section title={t("settings.stats")}>
        <ul className="grid sm:grid-cols-2 gap-2 text-sm">
          {stats.length === 0 && <li className="text-muted">{t("leaderboard.empty")}</li>}
          {stats.map((s) => (
            <li key={s.gameType} className="rounded-lg bg-surface-2 p-2 flex justify-between">
              <span>{t(`games.${s.gameType}.name`)}</span>
              <span className="tabular-nums text-muted">
                {s.rating} · {s.wins}/{s.matches} {s.rank ? `· #${s.rank}` : ""}
              </span>
            </li>
          ))}
        </ul>
        {matches.length > 0 && (
          <>
            <h3 className="label mt-4">{t("settings.matches")}</h3>
            <ul className="grid gap-1 text-sm">
              {matches.map((m) => (
                <li key={m.matchId} className="flex justify-between">
                  <span>
                    {t(`games.${m.gameType}.name`)} · #{m.placement}/{m.players}
                  </span>
                  <span className={m.ratingDelta && m.ratingDelta > 0 ? "text-primary" : m.ratingDelta && m.ratingDelta < 0 ? "text-danger" : "text-muted"}>
                    {m.ratingDelta === null ? "—" : m.ratingDelta > 0 ? `+${m.ratingDelta}` : m.ratingDelta} · {new Date(m.finishedAt).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
      <Section
        title={t("settings.sessions")}
        action={
          <button className="btn-danger btn-sm" onClick={() => void post("/api/me/sessions/revoke-all").then(() => signOut()).catch(setError)}>
            {t("settings.revokeAll")}
          </button>
        }
      >
        <ul className="grid gap-2 text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{s.device}</span>
              <span className="text-xs text-muted">
                {s.provider} · {s.country ?? "—"} · {new Date(s.lastSeenAt).toLocaleString()}
              </span>
              {s.current && <span className="chip bg-primary/20 text-primary">{t("settings.current")}</span>}
              {!s.current && !s.revoked && (
                <button className="btn-ghost btn-sm ml-auto" onClick={() => void post("/api/me/sessions/revoke", { sessionId: s.id }).then(() => setSessions((x) => x.map((y) => (y.id === s.id ? { ...y, revoked: true } : y)))).catch(setError)}>
                  {t("settings.revoke")}
                </button>
              )}
            </li>
          ))}
        </ul>
        <h3 className="label mt-4">{t("settings.history")}</h3>
        <ul className="grid gap-1 text-xs text-muted">
          {history.map((h, i) => (
            <li key={i}>
              {new Date(h.ts).toLocaleString()} · {h.kind} · {h.country ?? "—"}
            </li>
          ))}
        </ul>
      </Section>
      <Section title={t("settings.danger")}>
        <p className="text-sm text-text-2 mb-3">{t("settings.deleteBody")}</p>
        <div className="grid sm:grid-cols-2 gap-2">
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
