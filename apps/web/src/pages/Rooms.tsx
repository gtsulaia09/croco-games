import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { ArrowLeft, Eye, Info, KeyRound, Lock, Mail, Plus, RefreshCw, Search, Unlock } from "lucide-react";
import { BOT_DIFFICULTIES, GAME_CATALOG, isGameType, type GameType, type RoomSummary } from "@croco/shared/client";
import { ApiError, get, post } from "../lib/api";
import { useT } from "../i18n";
import { EmptyState, ErrorText, Modal, Spinner, UserName } from "../components/ui";
import { defaultOptions, GAME_OPTIONS } from "../games/options";

const FILTERS = ["all", "public", "password", "invite", "waiting", "active", "seats"] as const;

export default function Rooms() {
  const { gameType } = useParams();
  if (!isGameType(gameType)) return <Navigate to="/" replace />;
  return <RoomBrowser game={gameType} />;
}

function RoomBrowser({ game }: { game: GameType }) {
  const t = useT();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [q, setQ] = useState("");
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [creating, setCreating] = useState(false);
  const [passwordFor, setPasswordFor] = useState<RoomSummary | null>(null);
  const [detailsFor, setDetailsFor] = useState<RoomSummary | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ gameType: game, filter, limit: "50" });
      if (q.trim().length >= 1) params.set("q", q.trim());
      setRooms((await get<{ items: RoomSummary[] }>(`/api/rooms?${params}`)).items);
    } catch (e) {
      setError(e);
      setRooms([]);
    }
  }, [game, filter, q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function join(room: RoomSummary, opts: { password?: string; asSpectator?: boolean } = {}) {
    try {
      await post(`/api/rooms/${room.id}/join`, opts);
      navigate(`/room/${room.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "room_password_invalid" && !passwordFor) setPasswordFor(room);
      else if (e instanceof ApiError && e.code === "already_in_room") setError(e);
      else throw e;
    }
  }

  return (
    <div className="grid gap-4 fade-in">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/" className="btn-ghost btn-sm">
          <ArrowLeft size={14} /> {t("rooms.backToGames")}
        </Link>
        <h1 className="text-lg font-bold">{t("rooms.title", { game: t(`games.${game}.name`) })}</h1>
        <div className="ml-auto flex gap-2 flex-wrap">
          <button className="btn-ghost btn-sm" onClick={() => setInviteOpen(true)}>
            <KeyRound size={14} /> <span className="hidden sm:inline">{t("rooms.joinWithCode")}</span>
          </button>
          <button className="btn-ghost btn-sm" onClick={() => void load()}>
            <RefreshCw size={14} /> {t("common.refresh")}
          </button>
          <button className="btn-primary btn-sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> {t("rooms.create")}
          </button>
        </div>
      </div>
      <div className="card p-3 flex flex-wrap gap-2 items-center">
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-8" placeholder={t("rooms.searchPlaceholder")} value={q} maxLength={40} onChange={(e) => setQ(e.target.value)} aria-label={t("common.search")} />
        </div>
        <div className="flex flex-wrap gap-1" role="tablist">
          {FILTERS.map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "btn-secondary btn-sm" : "btn-ghost btn-sm"} onClick={() => setFilter(f)}>
              {t(`rooms.filters.${f}`)}
            </button>
          ))}
        </div>
      </div>
      <ErrorText error={error} />
      <div className="card overflow-hidden">
        {rooms === null ? (
          <Spinner />
        ) : rooms.length === 0 ? (
          <EmptyState>{t("rooms.empty")}</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2 w-8" aria-label={t("rooms.cols.access")} />
                <th className="text-left px-3 py-2">{t("rooms.cols.name")}</th>
                <th className="text-left px-3 py-2 hidden md:table-cell">{t("rooms.cols.host")}</th>
                <th className="text-left px-3 py-2">{t("rooms.cols.players")}</th>
                <th className="text-left px-3 py-2 hidden sm:table-cell">{t("rooms.cols.status")}</th>
                <th className="text-left px-3 py-2 hidden lg:table-cell">{t("rooms.cols.stage")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => {
                const full = r.players >= r.maxPlayers;
                return (
                  <tr key={r.id} className="table-row hover:bg-surface-2/60">
                    <td className="px-3 py-2 text-muted">
                      {r.visibility === "invite" ? <Mail size={14} /> : r.hasPassword ? <Lock size={14} className="text-warning" /> : <Unlock size={14} />}
                    </td>
                    <td className="px-3 py-2 font-medium max-w-[12rem] truncate">{r.name}</td>
                    <td className="px-3 py-2 hidden md:table-cell">
                      <UserName user={r.host} />
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {r.players}/{r.maxPlayers}
                      {r.spectators > 0 && <span className="text-muted text-xs"> · 👁 {r.spectators}</span>}
                    </td>
                    <td className="px-3 py-2 hidden sm:table-cell">
                      <span className={`chip ${r.phase === "playing" ? "bg-gold/15 text-gold" : full ? "bg-danger/15 text-danger" : "bg-primary/15 text-primary"}`}>
                        {r.phase === "playing" ? t("rooms.status.playing") : full ? t("rooms.status.full") : t("rooms.status.waiting")}
                      </span>
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell text-muted text-xs">{r.stage ?? "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button className="btn-ghost btn-sm" onClick={() => setDetailsFor(r)} title={t("rooms.details")} aria-label={t("rooms.details")}>
                        <Info size={14} />
                      </button>
                      {!full && r.phase === "waiting" && (
                        <button className="btn-primary btn-sm" onClick={() => (r.hasPassword ? setPasswordFor(r) : void join(r).catch(setError))}>
                          {t("rooms.join")}
                        </button>
                      )}
                      {r.allowSpectators && (
                        <button className="btn-ghost btn-sm" onClick={() => void join(r, { asSpectator: true }).catch(setError)} title={t("rooms.spectate")}>
                          <Eye size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <PasswordDialog room={passwordFor} onClose={() => setPasswordFor(null)} onJoin={(password) => join(passwordFor!, { password })} />
      <RoomDetailsDialog
        room={detailsFor}
        onClose={() => setDetailsFor(null)}
        onJoin={(r, asSpectator) => {
          setDetailsFor(null);
          if (!asSpectator && r.hasPassword) setPasswordFor(r);
          else void join(r, { asSpectator }).catch(setError);
        }}
      />
      <InviteCodeDialog open={inviteOpen} onClose={() => setInviteOpen(false)} onCode={(code) => navigate(`/invite/${encodeURIComponent(code)}`)} />
      <CreateRoomDialog game={game} open={creating} onClose={() => setCreating(false)} onCreated={(id) => navigate(`/room/${id}`)} />
    </div>
  );
}

function RoomDetailsDialog({ room, onClose, onJoin }: { room: RoomSummary | null; onClose(): void; onJoin(room: RoomSummary, asSpectator: boolean): void }) {
  const t = useT();
  if (!room) return null;
  const full = room.players >= room.maxPlayers;
  return (
    <Modal open onClose={onClose} title={t("rooms.details")}>
      <dl className="grid grid-cols-2 gap-y-2 text-sm mb-4">
        <dt className="text-muted">{t("rooms.cols.name")}</dt>
        <dd className="font-medium truncate">{room.name}</dd>
        <dt className="text-muted">{t("rooms.cols.host")}</dt>
        <dd><UserName user={room.host} /></dd>
        <dt className="text-muted">{t("rooms.cols.players")}</dt>
        <dd className="tabular-nums">{room.players}/{room.maxPlayers}</dd>
        <dt className="text-muted">{t("rooms.cols.access")}</dt>
        <dd>{t(`create.${room.visibility}`)}{room.hasPassword ? ` · ${t("rooms.filters.password")}` : ""}</dd>
        <dt className="text-muted">{t("rooms.cols.status")}</dt>
        <dd>{t(`rooms.status.${room.phase}`)}</dd>
        <dt className="text-muted">{t("rooms.cols.stage")}</dt>
        <dd>{room.stage ?? "—"}</dd>
      </dl>
      <div className="flex gap-2 justify-end">
        {room.allowSpectators && (
          <button className="btn-ghost" onClick={() => onJoin(room, true)}>
            <Eye size={14} /> {t("rooms.spectate")}
          </button>
        )}
        {!full && room.phase === "waiting" && (
          <button className="btn-primary" onClick={() => onJoin(room, false)}>
            {t("rooms.join")}
          </button>
        )}
      </div>
    </Modal>
  );
}

function InviteCodeDialog({ open, onClose, onCode }: { open: boolean; onClose(): void; onCode(code: string): void }) {
  const t = useT();
  const [raw, setRaw] = useState("");
  const extracted = raw.trim().replace(/^.*#\/invite\//, "").replace(/[^A-Za-z0-9_-]/g, "");
  return (
    <Modal open={open} onClose={onClose} title={t("rooms.joinWithCode")}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (extracted.length >= 22) {
            onClose();
            onCode(extracted);
          }
        }}
      >
        <label className="label" htmlFor="invite-code-input">{t("rooms.enterInviteCode")}</label>
        <input id="invite-code-input" className="input font-mono" value={raw} onChange={(e) => setRaw(e.target.value)} maxLength={200} />
        <button className="btn-primary" disabled={extracted.length < 22}>
          {t("rooms.join")}
        </button>
      </form>
    </Modal>
  );
}

function PasswordDialog({ room, onClose, onJoin }: { room: RoomSummary | null; onClose(): void; onJoin(password: string): Promise<void> }) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  return (
    <Modal open={Boolean(room)} onClose={onClose} title={t("rooms.passwordPrompt")}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onJoin(password).catch(setError);
        }}
      >
        <label className="label" htmlFor="room-password">{t("rooms.enterPassword")}</label>
        <input id="room-password" className="input" type="password" autoComplete="off" maxLength={64} value={password} onChange={(e) => setPassword(e.target.value)} />
        <ErrorText error={error} />
        <button className="btn-primary" disabled={password.length < 4}>
          {t("rooms.join")}
        </button>
      </form>
    </Modal>
  );
}

function CreateRoomDialog({ game, open, onClose, onCreated }: { game: GameType; open: boolean; onClose(): void; onCreated(id: string): void }) {
  const t = useT();
  const info = GAME_CATALOG[game];
  const [form, setForm] = useState({
    name: "",
    visibility: "public" as "public" | "private" | "invite",
    password: "",
    maxPlayers: info.defaultPlayers,
    bots: 0,
    botDifficulty: "medium" as (typeof BOT_DIFFICULTIES)[number],
    turnSeconds: 30,
    allowSpectators: true,
    autoStart: false,
    chatEnabled: true,
    allowInvites: true,
  });
  const [gameConfig, setGameConfig] = useState<Record<string, unknown>>(() => defaultOptions(game));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...form, gameType: game, password: form.visibility === "private" || form.password ? form.password : undefined, gameConfig };
      if (!body.password) delete (body as { password?: string }).password;
      const res = await post<{ id: string }>("/api/rooms", body);
      onCreated(res.id);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const players = Array.from({ length: info.maxPlayers - info.minPlayers + 1 }, (_, i) => info.minPlayers + i);
  return (
    <Modal open={open} onClose={onClose} title={t("create.title", { game: t(`games.${game}.name`) })} wide>
      <form onSubmit={(e) => void submit(e)} className="grid gap-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="room-name">{t("create.name")}</label>
            <input id="room-name" className="input" required minLength={3} maxLength={40} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="visibility">{t("create.visibility")}</label>
            <select id="visibility" className="input" value={form.visibility} onChange={(e) => set("visibility", e.target.value as typeof form.visibility)}>
              <option value="public">{t("create.public")}</option>
              <option value="private">{t("create.private")}</option>
              <option value="invite">{t("create.invite")}</option>
            </select>
          </div>
          {form.visibility !== "invite" && (
            <div>
              <label className="label" htmlFor="create-password">{t("create.password")}</label>
              <input id="create-password" className="input" type="password" autoComplete="new-password" minLength={4} maxLength={64} required={form.visibility === "private"} value={form.password} onChange={(e) => set("password", e.target.value)} />
            </div>
          )}
          <div>
            <label className="label" htmlFor="max-players">{t("create.maxPlayers")}</label>
            <select id="max-players" className="input" value={form.maxPlayers} onChange={(e) => set("maxPlayers", Number(e.target.value))}>
              {players.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="bots">{t("create.bots")}</label>
            <select id="bots" className="input" value={form.bots} onChange={(e) => set("bots", Number(e.target.value))}>
              {Array.from({ length: form.maxPlayers }, (_, n) => n).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="difficulty">{t("create.botDifficulty")}</label>
            <select id="difficulty" className="input" value={form.botDifficulty} onChange={(e) => set("botDifficulty", e.target.value as typeof form.botDifficulty)}>
              {BOT_DIFFICULTIES.map((d) => (
                <option key={d} value={d}>{t(`difficulty.${d}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="turn">{t("create.turnSeconds")}</label>
            <input id="turn" className="input" type="number" min={10} max={120} value={form.turnSeconds} onChange={(e) => set("turnSeconds", Number(e.target.value))} />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-2 text-sm">
          {(["allowSpectators", "autoStart", "chatEnabled", "allowInvites"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2">
              <input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} />
              {t(`create.${k === "allowSpectators" ? "spectators" : k === "chatEnabled" ? "chat" : k === "allowInvites" ? "invites" : "autoStart"}`)}
            </label>
          ))}
        </div>
        <fieldset className="grid sm:grid-cols-2 gap-3 border-t border-line pt-3">
          <legend className="label px-1">{t("create.gameOptions")}</legend>
          {GAME_OPTIONS[game].map((opt) => (
            <div key={opt.key}>
              {opt.kind === "boolean" ? (
                <label className="flex items-center gap-2 text-sm mt-5">
                  <input type="checkbox" checked={Boolean(gameConfig[opt.key])} onChange={(e) => setGameConfig((g) => ({ ...g, [opt.key]: e.target.checked }))} />
                  {t(`opt.${opt.key}`)}
                </label>
              ) : (
                <>
                  <label className="label" htmlFor={`opt-${opt.key}`}>{t(`opt.${opt.key}`)}</label>
                  {opt.kind === "select" ? (
                    <select
                      id={`opt-${opt.key}`}
                      className="input"
                      value={String(gameConfig[opt.key])}
                      onChange={(e) => setGameConfig((g) => ({ ...g, [opt.key]: typeof opt.default === "number" ? Number(e.target.value) : e.target.value }))}
                    >
                      {opt.options.map((v) => (
                        <option key={String(v)} value={String(v)}>{typeof v === "number" ? v : t(`opt.values.${v}`)}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`opt-${opt.key}`}
                      className="input"
                      type="number"
                      min={opt.min}
                      max={opt.max}
                      step={opt.step ?? 1}
                      value={Number(gameConfig[opt.key])}
                      onChange={(e) => setGameConfig((g) => ({ ...g, [opt.key]: Number(e.target.value) }))}
                    />
                  )}
                </>
              )}
            </div>
          ))}
        </fieldset>
        <ErrorText error={error} />
        <button className="btn-primary h-11" disabled={busy}>
          {t("create.submit")}
        </button>
      </form>
    </Modal>
  );
}
