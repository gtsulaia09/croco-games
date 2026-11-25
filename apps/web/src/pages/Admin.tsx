import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, CheckCircle2, Flag, Lock, ShieldAlert, ShieldCheck, Users as UsersIcon } from "lucide-react";
import type { PlatformSettingsDto as PlatformSettings, PublicUser } from "@croco/shared/client";
import { api, ApiError, clearStepUp, get, hasStepUp, post, setStepUp } from "../lib/api";
import { useSession } from "../store/session";
import { useT } from "../i18n";
import { AdminBadge, EmptyState, ErrorText, Section, Spinner, UserName } from "../components/ui";

type Tab = "overview" | "users" | "rooms" | "reports" | "integrity" | "audit" | "security" | "settings";
const STAFF_TABS: Tab[] = ["overview", "users", "rooms", "reports", "integrity"];
const ADMIN_TABS: Tab[] = ["audit", "security", "settings"];

export default function Admin() {
  const t = useT();
  const me = useSession((s) => s.me);
  const isAdmin = me?.roles.includes("admin") ?? false;
  const [mfa, setMfa] = useState<{ enrolled: boolean } | null>(null);
  const [unlocked, setUnlocked] = useState(hasStepUp());
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    get<{ enrolled: boolean }>("/api/admin/mfa/status").then(setMfa).catch(setError);
    return () => clearStepUp();
  }, []);

  // A step-up token expires after 15 minutes; any request answering step_up_required locks the panel again.
  const guard = useCallback(<T,>(p: Promise<T>): Promise<T> => {
    return p.catch((e: unknown) => {
      if (e instanceof ApiError && (e.code === "step_up_required" || e.code === "mfa_required")) {
        clearStepUp();
        setUnlocked(false);
      }
      throw e;
    });
  }, []);

  if (!me?.roles.some((r) => r === "admin" || r === "moderator")) return <ErrorText error="forbidden" />;
  if (!mfa) return error ? <ErrorText error={error} /> : <Spinner />;
  if (!unlocked)
    return (
      <MfaGate
        enrolled={mfa.enrolled}
        onUnlocked={() => {
          setMfa({ enrolled: true });
          setUnlocked(true);
        }}
      />
    );

  const tabs = isAdmin ? [...STAFF_TABS, ...ADMIN_TABS] : STAFF_TABS;
  return (
    <div className="grid gap-4 fade-in">
      <div className="card p-4 sm:p-5 border-gold/40 bg-gradient-to-r from-gold/10 via-surface to-surface flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="size-11 rounded-xl bg-gold/15 border border-gold/40 text-gold flex items-center justify-center">
            <ShieldCheck size={22} />
          </span>
          <div>
            <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              {t("admin.title")} {isAdmin && <AdminBadge />}
            </h1>
            <p className="text-xs text-muted">{t("ui.staffConsole")}</p>
          </div>
        </div>
        <span className="chip bg-primary/15 text-primary border border-primary/35">
          <Lock size={11} /> {t("admin.mfaVerified")}
        </span>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
        {tabs.map((x) => (
          <button
            key={x}
            role="tab"
            aria-selected={tab === x}
            className={`h-9 px-3.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              tab === x ? "bg-gold text-[#1d1404]" : "bg-surface border border-line text-text-2 hover:border-line-strong"
            }`}
            onClick={() => setTab(x)}
          >
            {t(`admin.tabs.${x}`)}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview guard={guard} />}
      {tab === "users" && <Users guard={guard} isAdmin={isAdmin} />}
      {tab === "rooms" && <Rooms guard={guard} />}
      {tab === "reports" && <Reports guard={guard} />}
      {tab === "integrity" && <Integrity guard={guard} />}
      {tab === "audit" && isAdmin && <Audit guard={guard} />}
      {tab === "security" && isAdmin && <SecurityEvents guard={guard} />}
      {tab === "settings" && isAdmin && <SettingsTab guard={guard} />}
    </div>
  );
}

type Guard = <T>(p: Promise<T>) => Promise<T>;

function MfaGate({ enrolled, onUnlocked }: { enrolled: boolean; onUnlocked(): void }) {
  const t = useT();
  const [setup, setSetup] = useState<{ otpauthUri: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enrolled) post<{ otpauthUri: string; secret: string }>("/api/admin/mfa/enroll/start").then(setSetup).catch(setError);
  }, [enrolled]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (!enrolled) {
        const r = await post<{ recoveryCodes: string[]; stepUpToken: string; expiresAt: number }>("/api/admin/mfa/enroll/confirm", { code });
        setStepUp(r.stepUpToken, r.expiresAt);
        setCodes(r.recoveryCodes);
      } else {
        const r = await post<{ stepUpToken: string; expiresAt: number }>(recovery ? "/api/admin/mfa/recover" : "/api/admin/mfa/verify", { code: code.trim().toLowerCase() });
        setStepUp(r.stepUpToken, r.expiresAt);
        onUnlocked();
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      setCode("");
    }
  }

  if (codes)
    return (
      <div className="card p-6 max-w-md mx-auto mt-8 grid gap-4 border-gold/45">
        <h1 className="font-black text-lg text-white">{t("admin.recoveryTitle")}</h1>
        <p className="text-sm text-text-2">{t("admin.recoveryBody")}</p>
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm panel-inset p-3.5 text-gold">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <button className="btn-primary h-11" onClick={onUnlocked}>
          {t("common.continue")}
        </button>
      </div>
    );

  return (
    <form
      className="card overflow-hidden max-w-md mx-auto mt-8 border-gold/40"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="bg-gradient-to-br from-gold/12 via-surface-2 to-surface px-6 py-5 border-b border-line flex items-center gap-3">
        <span className="size-10 rounded-xl bg-gold/15 border border-gold/40 text-gold flex items-center justify-center">
          <ShieldCheck size={20} />
        </span>
        <h1 className="font-black text-base text-white">{enrolled ? t("admin.stepUpTitle") : t("admin.mfaSetupTitle")}</h1>
      </div>
      <div className="p-6 grid gap-4">
        {!enrolled && (
          <>
            <p className="text-sm text-text-2 leading-relaxed">{t("admin.mfaSetupBody")}</p>
            {setup ? (
              <div className="grid gap-1.5">
                <span className="label">{t("admin.secret")}</span>
                <code className="font-mono text-sm break-all panel-inset p-3 select-all text-gold">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
                <a className="text-xs text-primary underline break-all" href={setup.otpauthUri}>
                  otpauth://
                </a>
              </div>
            ) : (
              <Spinner />
            )}
          </>
        )}
        <label>
          <span className="label">{recovery ? t("admin.recoveryCode") : t("admin.code")}</span>
          <input
            className="input font-mono text-center text-lg tracking-[0.25em]"
            inputMode={recovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            maxLength={recovery ? 19 : 6}
            pattern={recovery ? "[a-z2-7]{4}(-[a-z2-7]{4}){3}" : "\\d{6}"}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </label>
        <ErrorText error={error} />
        <button className="btn-primary h-11" disabled={busy}>
          {t("admin.verify")}
        </button>
        {enrolled && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => setRecovery((r) => !r)}>
            {recovery ? t("admin.code") : t("admin.useRecovery")}
          </button>
        )}
      </div>
    </form>
  );
}

function useLoad<T>(guard: Guard, path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const reload = useCallback(() => {
    setError(null);
    guard(get<T>(path)).then(setData).catch(setError);
  }, [guard, path]);
  useEffect(reload, [reload]);
  return { data, error, reload, setError };
}

function Stat({ label, value, tone = "default", icon }: { label: string; value: ReactNode; tone?: "default" | "primary" | "danger" | "warning"; icon?: ReactNode }) {
  const accent = tone === "primary" ? "text-primary" : tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-white";
  return (
    <div className="card p-3.5">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        {icon}
      </div>
      <div className={`text-2xl font-black tabular-nums mt-1 ${accent}`}>{value}</div>
    </div>
  );
}

function Overview({ guard }: { guard: Guard }) {
  const t = useT();
  const { data, error } = useLoad<{ users: number; activeToday: number; online: number; rooms: Record<string, number>; matchesToday: Record<string, number>; openReports: number; openIntegrityFlags: number }>(guard, "/api/admin/overview");
  const online = useLoad<{ items: Array<{ user: PublicUser; status: string; roomId: string | null; gameType: string | null }> }>(guard, "/api/admin/online");
  if (error) return <ErrorText error={error} />;
  if (!data) return <Spinner />;
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <Stat label={t("admin.users")} value={data.users} icon={<UsersIcon size={14} />} />
        <Stat label={t("admin.activeToday")} value={data.activeToday} icon={<Activity size={14} />} />
        <Stat label={t("admin.online")} value={data.online} tone="primary" />
        <Stat label={t("admin.tabs.rooms")} value={(data.rooms["waiting"] ?? 0) + (data.rooms["playing"] ?? 0)} />
        <Stat label={t("admin.openReports")} value={data.openReports} tone={data.openReports > 0 ? "danger" : "default"} icon={<Flag size={14} />} />
        <Stat label={t("admin.openFlags")} value={data.openIntegrityFlags} tone={data.openIntegrityFlags > 0 ? "warning" : "default"} icon={<AlertTriangle size={14} />} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Section title={t("admin.matchesToday")}>
          <ul className="grid gap-1.5 text-sm">
            {Object.entries(data.matchesToday).map(([g, n]) => (
              <li key={g} className="flex justify-between rounded-lg bg-surface-2 px-3 py-2">
                <span className="text-text-2">{t(`games.${g}.name`)}</span>
                <span className="tabular-nums font-bold text-white">{n}</span>
              </li>
            ))}
            {Object.keys(data.matchesToday).length === 0 && <li className="text-muted text-xs">—</li>}
          </ul>
        </Section>
        <Section title={t("admin.onlineUsers")}>
          <ErrorText error={online.error} />
          {!online.data ? (
            <Spinner />
          ) : online.data.items.length === 0 ? (
            <p className="text-xs text-muted">—</p>
          ) : (
            <ul className="grid gap-1.5 text-sm max-h-64 overflow-y-auto">
              {online.data.items.map((o) => (
                <li key={o.user.id} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2">
                  <UserName user={o.user} className="font-semibold" />
                  <span className="text-xs text-muted">
                    {o.status}
                    {o.gameType ? ` · ${t(`games.${o.gameType}.name`)}` : ""}
                  </span>
                  {o.roomId && !o.user.badges.admin && (
                    <button
                      className="btn-ghost btn-sm text-danger ml-auto"
                      onClick={() =>
                        guard(post(`/api/admin/rooms/${o.roomId}/kick`, { userId: o.user.id, reason: "Removed by staff" }))
                          .then(online.reload)
                          .catch(online.setError)
                      }
                    >
                      {t("admin.kick")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

interface AdminUserRow {
  id: string;
  username: string | null;
  email: string | null;
  status: string;
  created_at: number;
  last_seen_at: number;
  suspended_until: number | null;
  roles: string[];
}

function Users({ guard, isAdmin }: { guard: Guard; isAdmin: boolean }) {
  const t = useT();
  const myId = useSession((s) => s.me?.profile?.id);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const { data, error, reload, setError } = useLoad<{ items: AdminUserRow[] }>(guard, `/api/admin/users${search ? `?q=${encodeURIComponent(search)}` : ""}`);
  const [suspend, setSuspend] = useState<{ id: string; days: number; reason: string } | null>(null);
  const act = (p: Promise<unknown>) => guard(p).then(reload).catch(setError);
  return (
    <div className="grid gap-3">
      <form
        className="flex gap-2 max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q.trim());
        }}
      >
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} maxLength={40} aria-label={t("common.search")} placeholder={t("common.search")} />
        <button className="btn-secondary">{t("common.search")}</button>
      </form>
      <ErrorText error={error} />
      <div className="card overflow-x-auto">
        {!data ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <EmptyState>—</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-muted bg-surface-2 border-b border-line">
              <tr>
                <th className="p-3 text-left">{t("leaderboard.player")}</th>
                {isAdmin && <th className="p-3 text-left hidden md:table-cell">{t("admin.email")}</th>}
                <th className="p-3 text-left">{t("admin.status")}</th>
                <th className="p-3 text-left hidden sm:table-cell">{t("common.lastSeen")}</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => {
                const target = u.roles.includes("admin");
                return (
                  <tr key={u.id} className="table-row hover:bg-surface-hover/50">
                    <td className="p-3 font-semibold text-white">
                      {u.username ?? <span className="text-muted">({u.id})</span>} {target && <AdminBadge />}
                      {u.roles.includes("moderator") && <span className="chip bg-accent/15 text-accent border border-accent/35 ml-1">{t("common.moderator")}</span>}
                    </td>
                    {isAdmin && <td className="p-3 hidden md:table-cell text-xs text-muted">{u.email ?? "—"}</td>}
                    <td className="p-3 text-xs">
                      <span className={`chip ${u.status === "suspended" ? "bg-danger/15 text-danger" : "bg-primary/15 text-primary"}`}>
                        {u.status}
                        {u.suspended_until ? ` → ${new Date(u.suspended_until).toLocaleDateString()}` : ""}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-muted hidden sm:table-cell tabular-nums">{new Date(u.last_seen_at).toLocaleString()}</td>
                    <td className="p-3">
                      {!target && u.id !== myId && (
                        <div className="flex flex-wrap gap-1 justify-end">
                          {u.status === "suspended" ? (
                            <button className="btn-secondary btn-sm" onClick={() => act(post(`/api/admin/users/${u.id}/unsuspend`))}>
                              {t("admin.unsuspend")}
                            </button>
                          ) : (
                            <button className="btn-danger btn-sm" onClick={() => setSuspend({ id: u.id, days: 1, reason: "" })}>
                              {t("admin.suspend")}
                            </button>
                          )}
                          <button className="btn-ghost btn-sm" onClick={() => act(post(`/api/admin/users/${u.id}/revoke-sessions`))}>
                            {t("admin.revokeSessions")}
                          </button>
                          {isAdmin && (
                            <button
                              className="btn-ghost btn-sm"
                              onClick={() => act(post(`/api/admin/users/${u.id}/roles`, { role: "moderator", action: u.roles.includes("moderator") ? "revoke" : "grant" }))}
                            >
                              {u.roles.includes("moderator") ? t("admin.revokeMod") : t("admin.grantMod")}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {suspend && (
        <form
          className="card p-4 border-danger/40 grid sm:grid-cols-[6rem_1fr_auto_auto] gap-2.5 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void act(post(`/api/admin/users/${suspend.id}/suspend`, { days: suspend.days, reason: suspend.reason })).then(() => setSuspend(null));
          }}
        >
          <label>
            <span className="label">{t("admin.days")}</span>
            <input className="input" type="number" min={1} max={3650} value={suspend.days} onChange={(e) => setSuspend({ ...suspend, days: Number(e.target.value) })} />
          </label>
          <label>
            <span className="label">{t("admin.reason")}</span>
            <input className="input" minLength={3} maxLength={300} required value={suspend.reason} onChange={(e) => setSuspend({ ...suspend, reason: e.target.value })} />
          </label>
          <button className="btn-danger">{t("admin.suspend")}</button>
          <button type="button" className="btn-ghost" onClick={() => setSuspend(null)}>
            {t("common.cancel")}
          </button>
        </form>
      )}
    </div>
  );
}

function Rooms({ guard }: { guard: Guard }) {
  const t = useT();
  const { data, error, reload, setError } = useLoad<{ items: Array<{ id: string; game_type: string; name: string; visibility: string; players: number; max_players: number; phase: string; stage: string | null }> }>(guard, "/api/admin/rooms");
  return (
    <div className="card overflow-x-auto">
      <ErrorText error={error} />
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState>{t("rooms.empty")}</EmptyState>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {data.items.map((r) => (
              <tr key={r.id} className="table-row hover:bg-surface-hover/50">
                <td className="p-3 font-semibold text-white">{r.name}</td>
                <td className="p-3 text-xs text-text-2">{t(`games.${r.game_type}.name`)}</td>
                <td className="p-3 text-xs text-muted tabular-nums">
                  {r.players}/{r.max_players} · {r.phase} {r.stage ?? ""} · {r.visibility}
                </td>
                <td className="p-3 text-right">
                  <button className="btn-danger btn-sm" onClick={() => guard(post(`/api/admin/rooms/${r.id}/close`)).then(reload).catch(setError)}>
                    {t("admin.closeRoom")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Resolve({ onResolve }: { onResolve(resolution: "dismissed" | "actioned", note: string): void }) {
  const t = useT();
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-wrap gap-1.5 items-center pt-1">
      <input className="input h-8 w-52 text-xs" maxLength={500} placeholder={t("admin.note")} value={note} onChange={(e) => setNote(e.target.value)} aria-label={t("admin.note")} />
      <button className="btn-ghost btn-sm" onClick={() => onResolve("dismissed", note)}>
        {t("admin.dismiss")}
      </button>
      <button className="btn-primary btn-sm" onClick={() => onResolve("actioned", note)}>
        {t("admin.action")}
      </button>
    </div>
  );
}

function Reports({ guard }: { guard: Guard }) {
  const t = useT();
  const [status, setStatus] = useState<"open" | "closed">("open");
  const { data, error, reload, setError } = useLoad<{ items: Array<{ id: string; reporter: PublicUser | null; target: PublicUser | null; room_id: string | null; message_snapshot: string | null; reason: string; details: string | null; status: string; created_at: number }> }>(
    guard,
    `/api/admin/reports?status=${status}`,
  );
  return (
    <div className="grid gap-3">
      <div className="flex gap-1.5">
        {(["open", "closed"] as const).map((s) => (
          <button key={s} className={status === s ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setStatus(s)}>
            {t(`admin.${s}`)}
          </button>
        ))}
      </div>
      <ErrorText error={error} />
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState>—</EmptyState>
      ) : (
        data.items.map((r) => (
          <div key={r.id} className="card p-4 grid gap-2 text-sm">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="chip bg-danger/20 text-danger border border-danger/35">{r.reason}</span>
              <UserName user={r.target ?? undefined} className="font-bold text-white" />
              <span className="text-xs text-muted">
                ← {r.reporter?.username ?? "—"} · {new Date(r.created_at).toLocaleString()}
              </span>
            </div>
            {r.message_snapshot && <blockquote className="border-l-2 border-danger/50 pl-3 text-text-2 whitespace-pre-wrap break-words bg-surface-3/60 py-1.5 rounded-r-lg">{r.message_snapshot}</blockquote>}
            {r.details && <p className="text-xs text-muted whitespace-pre-wrap break-words">{r.details}</p>}
            {r.status === "open" && <Resolve onResolve={(resolution, note) => guard(post(`/api/admin/reports/${r.id}/resolve`, { resolution, note })).then(reload).catch(setError)} />}
          </div>
        ))
      )}
    </div>
  );
}

function Integrity({ guard }: { guard: Guard }) {
  const { data, error, reload, setError } = useLoad<{ items: Array<{ id: string; match_id: string | null; user: PublicUser | null; kind: string; details: Record<string, unknown>; status: string; created_at: number }> }>(guard, "/api/admin/integrity");
  return (
    <div className="grid gap-3">
      <ErrorText error={error} />
      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <EmptyState icon={<ShieldAlert size={20} />}>—</EmptyState>
      ) : (
        data.items.map((f) => (
          <div key={f.id} className="card p-4 grid gap-2 text-sm">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="chip bg-warning/20 text-warning border border-warning/35">{f.kind}</span>
              <UserName user={f.user ?? undefined} className="font-bold text-white" />
              <span className="text-xs text-muted">
                {f.status} · {new Date(f.created_at).toLocaleString()}
              </span>
            </div>
            <pre className="text-xs text-text-2 panel-inset p-3 overflow-x-auto">{JSON.stringify(f.details, null, 2)}</pre>
            {f.status === "open" && <Resolve onResolve={(resolution, note) => guard(post(`/api/admin/integrity/${f.id}/resolve`, { resolution, note })).then(reload).catch(setError)} />}
          </div>
        ))
      )}
    </div>
  );
}

function Audit({ guard }: { guard: Guard }) {
  const t = useT();
  const { data, error } = useLoad<{ items: Array<{ id: number; ts: number; actor_id: string | null; action: string; target_type: string | null; target_id: string | null; details: unknown; hash: string }> }>(guard, "/api/admin/audit");
  const [chain, setChain] = useState<{ checked: number; brokenAt: number | null } | null>(null);
  const [verifyError, setVerifyError] = useState<unknown>(null);
  return (
    <div className="grid gap-3">
      <div className="flex gap-2.5 items-center flex-wrap">
        <button className="btn-secondary btn-sm" onClick={() => guard(get<{ checked: number; brokenAt: number | null }>("/api/admin/audit/verify")).then(setChain).catch(setVerifyError)}>
          <CheckCircle2 size={14} /> {t("admin.verifyChain")}
        </button>
        {chain &&
          (chain.brokenAt === null ? (
            <span className="chip bg-primary/15 text-primary border border-primary/35">{t("admin.chainOk", { n: chain.checked })}</span>
          ) : (
            <span className="chip bg-danger/20 text-danger border border-danger/40">{t("admin.chainBroken", { id: chain.brokenAt })}</span>
          ))}
        <ErrorText error={verifyError} />
      </div>
      <ErrorText error={error} />
      <div className="card overflow-x-auto">
        {!data ? (
          <Spinner />
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {data.items.map((a) => (
                <tr key={a.id} className="table-row align-top hover:bg-surface-hover/40">
                  <td className="p-2.5 tabular-nums text-muted">#{a.id}</td>
                  <td className="p-2.5 whitespace-nowrap tabular-nums">{new Date(a.ts).toLocaleString()}</td>
                  <td className="p-2.5 font-bold text-white">{a.action}</td>
                  <td className="p-2.5 text-muted">{a.actor_id ?? "system"}</td>
                  <td className="p-2.5 text-muted">{a.target_type ? `${a.target_type}:${a.target_id ?? ""}` : ""}</td>
                  <td className="p-2.5 font-mono text-[10px] text-muted max-w-60 truncate" title={JSON.stringify(a.details)}>
                    {JSON.stringify(a.details)}
                  </td>
                  <td className="p-2.5 font-mono text-[10px] text-gold">{a.hash.slice(0, 12)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SecurityEvents({ guard }: { guard: Guard }) {
  const t = useT();
  const [kind, setKind] = useState("");
  const { data, error } = useLoad<{ items: Array<{ id: number; ts: number; kind: string; user_id: string | null; country: string | null; details: unknown }> }>(guard, `/api/admin/security-events${kind ? `?kind=${encodeURIComponent(kind)}` : ""}`);
  return (
    <div className="grid gap-3">
      <input className="input max-w-xs" placeholder={t("admin.kindPlaceholder")} value={kind} onChange={(e) => setKind(e.target.value.replace(/[^a-z_.]/g, ""))} maxLength={40} aria-label="kind" />
      <ErrorText error={error} />
      <div className="card overflow-x-auto">
        {!data ? (
          <Spinner />
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id} className="table-row align-top hover:bg-surface-hover/40">
                  <td className="p-2.5 whitespace-nowrap tabular-nums">{new Date(e.ts).toLocaleString()}</td>
                  <td className="p-2.5 font-bold text-white">{e.kind}</td>
                  <td className="p-2.5 text-muted">{e.user_id ?? "—"}</td>
                  <td className="p-2.5 text-muted">{e.country ?? ""}</td>
                  <td className="p-2.5 font-mono text-[10px] text-muted max-w-80 truncate" title={JSON.stringify(e.details)}>
                    {JSON.stringify(e.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SettingsTab({ guard }: { guard: Guard }) {
  const t = useT();
  const { data, error, setError } = useLoad<{ settings: PlatformSettings }>(guard, "/api/admin/settings");
  const [draft, setDraft] = useState<PlatformSettings | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (data) setDraft(data.settings);
  }, [data]);
  if (!draft) return error ? <ErrorText error={error} /> : <Spinner />;
  return (
    <form
      className="card p-5 grid gap-3.5 max-w-lg"
      onSubmit={(e) => {
        e.preventDefault();
        setSaved(false);
        void guard(api("PUT", "/api/admin/settings", draft))
          .then(() => setSaved(true))
          .catch(setError);
      }}
    >
      <label className="flex items-center gap-2.5 text-sm rounded-xl bg-surface-2 border border-line px-3.5 py-2.5 cursor-pointer">
        <input type="checkbox" className="accent-[var(--color-primary)]" checked={draft.registrationOpen} onChange={(e) => setDraft({ ...draft, registrationOpen: e.target.checked })} />
        {t("admin.registrationOpen")}
      </label>
      <label className="flex items-center gap-2.5 text-sm rounded-xl bg-surface-2 border border-line px-3.5 py-2.5 cursor-pointer">
        <input type="checkbox" className="accent-[var(--color-primary)]" checked={draft.roomCreationOpen} onChange={(e) => setDraft({ ...draft, roomCreationOpen: e.target.checked })} />
        {t("admin.roomCreationOpen")}
      </label>
      <label>
        <span className="label">{t("admin.maintenance")}</span>
        <input className="input" maxLength={200} value={draft.maintenanceMessage} onChange={(e) => setDraft({ ...draft, maintenanceMessage: e.target.value })} />
      </label>
      <label>
        <span className="label">{t("admin.maxRooms")}</span>
        <input className="input w-28" type="number" min={1} max={5} value={draft.maxRoomsPerUser} onChange={(e) => setDraft({ ...draft, maxRoomsPerUser: Number(e.target.value) })} />
      </label>
      <ErrorText error={error} />
      <div className="flex items-center gap-3">
        <button className="btn-primary">{t("common.save")}</button>
        {saved && <span className="chip bg-primary/15 text-primary">{t("admin.saved")}</span>}
      </div>
    </form>
  );
}
