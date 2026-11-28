import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { ArrowLeft, Eye, Globe, Info, KeyRound, Lock, Mail, Plus, RefreshCw, Search, Users } from "lucide-react";
import { BOT_DIFFICULTIES, GAME_CATALOG, isGameType, type GameType, type RoomSummary } from "@croco/shared/client";
import { ApiError, get, post } from "../lib/api";
import { useT } from "../i18n";
import { Avatar, EmptyState, ErrorText, Modal, Spinner, UserName } from "../components/ui";
import { GameArtwork, GameBadgeIcon } from "../components/GameArt";
import { BuraArt, JapaneseJokerArt, JokerArt } from "../components/lobby/LobbyArt";
import { defaultOptions, GAME_OPTIONS } from "../games/options";
import { ChatPanel } from "../components/ChatPanel";
import { useGameChat } from "../hooks/useGameChat";
import { useSession } from "../store/session";

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
      {/* Game Server Browser Banner */}
      <section className="card hero-surface relative overflow-hidden p-4 sm:p-5">
        <div className="absolute right-0 top-0 bottom-0 w-72 opacity-55 pointer-events-none hidden sm:block">
          {game === "joker" ? (
            <JokerArt cw={50} className="w-full h-full" />
          ) : game === "japanese_joker" ? (
            <JapaneseJokerArt cw={42} className="w-full h-full" />
          ) : game === "bura3" || game === "bura5" ? (
            <BuraArt cw={46} className="w-full h-full" />
          ) : (
            <GameArtwork game={game} className="w-full h-full" />
          )}
        </div>
        <div className="relative z-10 flex flex-wrap items-center gap-3">
          <Link to="/" className="btn-secondary btn-sm px-3">
            <ArrowLeft size={14} /> {t("rooms.backToGames")}
          </Link>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="size-10 rounded-xl bg-surface-3/85 border border-line flex items-center justify-center shrink-0">
              <GameBadgeIcon game={game} size={22} />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-black text-white tracking-tight truncate">{t("rooms.title", { game: t(`games.${game}.name`) })}</h1>
              <p className="text-xs text-text-2/80 truncate">{t(`games.${game}.desc`)}</p>
            </div>
          </div>
          <div className="ml-auto flex gap-2 flex-wrap">
            <button className="btn-secondary btn-sm" onClick={() => setInviteOpen(true)}>
              <KeyRound size={14} /> <span className="hidden sm:inline">{t("rooms.joinWithCode")}</span>
            </button>
            <button className="btn-secondary btn-sm" onClick={() => void load()}>
              <RefreshCw size={14} /> <span className="hidden sm:inline">{t("common.refresh")}</span>
            </button>
            <button className="btn-primary btn-sm" onClick={() => setCreating(true)}>
              <Plus size={14} /> {t("rooms.create")}
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="grid gap-4 min-w-0">
          {/* Search & Capsule Filter Strip */}
          <div className="card p-3 flex flex-wrap gap-2.5 items-center">
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input pl-9 h-9 text-xs" placeholder={t("rooms.searchPlaceholder")} value={q} maxLength={40} onChange={(e) => setQ(e.target.value)} aria-label={t("common.search")} />
            </div>
            <div className="flex flex-wrap gap-1 p-1 rounded-2xl bg-surface-3/90 border border-line/80" role="tablist">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  role="tab"
                  aria-selected={filter === f}
                  className="seg-pill !h-7.5 !px-3"
                  onClick={() => setFilter(f)}
                >
                  {t(`rooms.filters.${f}`)}
                </button>
              ))}
            </div>
          </div>

          <ErrorText error={error} />

          {/* Room Server List */}
          <div className="card overflow-x-auto">
            {rooms === null ? (
              <Spinner />
            ) : rooms.length === 0 ? (
              <EmptyState icon={<Users size={20} />}>{t("rooms.empty")}</EmptyState>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-surface-2/75 text-muted text-[11px] uppercase tracking-wider border-b border-line">
                  <tr>
                    <th className="text-left px-3.5 py-3 w-10" aria-label={t("rooms.cols.access")} />
                    <th className="text-left px-3 py-3">{t("rooms.cols.name")}</th>
                    <th className="text-left px-3 py-3 hidden md:table-cell">{t("rooms.cols.host")}</th>
                    <th className="text-left px-3 py-3">{t("rooms.cols.players")}</th>
                    <th className="text-left px-3 py-3 hidden sm:table-cell">{t("rooms.cols.status")}</th>
                    <th className="text-left px-3 py-3 hidden lg:table-cell">{t("rooms.cols.stage")}</th>
                    <th className="px-3.5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rooms.map((r) => {
                    const full = r.players >= r.maxPlayers;
                    const fillPct = Math.min(100, Math.round((r.players / Math.max(1, r.maxPlayers)) * 100));
                    return (
                      <tr key={r.id} className="table-row hover:bg-surface-hover/60">
                        <td className="px-3.5 py-3">
                          {r.visibility === "invite" ? (
                            <span className="inline-flex size-7.5 rounded-xl bg-accent/14 border border-accent/30 text-accent items-center justify-center" title={t("create.invite")}>
                              <Mail size={13} />
                            </span>
                          ) : r.hasPassword ? (
                            <span className="inline-flex size-7.5 rounded-xl bg-warning/14 border border-warning/35 text-warning items-center justify-center" title={t("rooms.filters.password")}>
                              <Lock size={13} />
                            </span>
                          ) : (
                            <span className="inline-flex size-7.5 rounded-xl bg-primary/12 border border-primary/25 text-primary items-center justify-center" title={t("create.public")}>
                              <Globe size={13} />
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-bold text-white max-w-[14rem] truncate">{r.name}</div>
                          <div className="text-[11px] text-muted md:hidden truncate">{r.host.username}</div>
                        </td>
                        <td className="px-3 py-3 hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <Avatar id={r.host.avatar} size={24} />
                            <UserName user={r.host} className="text-xs font-semibold text-text-2" />
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white tabular-nums text-xs">
                              {r.players}/{r.maxPlayers}
                            </span>
                            <span className="hidden sm:block w-14 h-1.5 rounded-full bg-surface-3 overflow-hidden border border-line/70">
                              <span className={`block h-full rounded-full ${full ? "bg-danger" : "bg-primary"}`} style={{ width: `${fillPct}%` }} />
                            </span>
                            {r.spectators > 0 && (
                              <span className="inline-flex items-center gap-1 text-muted text-[11px] tabular-nums">
                                <Eye size={12} /> {r.spectators}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 hidden sm:table-cell">
                          <span
                            className={`chip border ${
                              r.phase === "playing"
                                ? "bg-gold/14 text-gold border-gold/35"
                                : full
                                  ? "bg-danger/14 text-danger border-danger/35"
                                  : "bg-primary/14 text-primary border-primary/35"
                            }`}
                          >
                            {r.phase === "playing" ? t("rooms.status.playing") : full ? t("rooms.status.full") : t("rooms.status.waiting")}
                          </span>
                        </td>
                        <td className="px-3 py-3 hidden lg:table-cell text-muted text-xs">{r.stage ?? "—"}</td>
                        <td className="px-3.5 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button className="btn-ghost btn-sm size-8.5 px-0" onClick={() => setDetailsFor(r)} title={t("rooms.details")} aria-label={t("rooms.details")}>
                              <Info size={14} />
                            </button>
                            {r.allowSpectators && (
                              <button className="btn-secondary btn-sm size-8.5 px-0" onClick={() => void join(r, { asSpectator: true }).catch(setError)} title={t("rooms.spectate")} aria-label={t("rooms.spectate")}>
                                <Eye size={14} />
                              </button>
                            )}
                            {!full && r.phase === "waiting" && (
                              <button className="btn-primary btn-sm" onClick={() => (r.hasPassword ? setPasswordFor(r) : void join(r).catch(setError))}>
                                {t("rooms.join")}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Game-isolated chat room */}
        <GameChat game={game} />
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

function GameChat({ game }: { game: GameType }) {
  const t = useT();
  const myUserId = useSession((s) => s.me?.profile?.id);
  const chat = useGameChat(game);
  const live = chat.status === "open";
  return (
    <div className="lg:sticky lg:top-19 h-[24rem] lg:h-[calc(100dvh-7.5rem)] min-h-80">
      <ChatPanel
        key={game}
        messages={chat.messages}
        enabled={live}
        myUserId={myUserId}
        chatGame={game}
        title={t("chat.gameTitle", { game: t(`games.${game}.name`) })}
        meta={
          <span className="chip bg-primary/12 border border-primary/30 text-primary tabular-nums" title={t("chat.gameOnly")}>
            {live ? t("chat.online", { n: chat.online }) : t("chat.connecting")}
          </span>
        }
        disabledText={chat.status === "closed" ? t("chat.unavailable") : t("chat.connecting")}
        onSend={chat.send}
      />
      {chat.lastError === "rate_limited" && <p className="mt-1.5 text-[11px] text-warning">{t("errors.rate_limited")}</p>}
    </div>
  );
}

function RoomDetailsDialog({ room, onClose, onJoin }: { room: RoomSummary | null; onClose(): void; onJoin(room: RoomSummary, asSpectator: boolean): void }) {
  const t = useT();
  if (!room) return null;
  const full = room.players >= room.maxPlayers;
  return (
    <Modal open onClose={onClose} title={t("rooms.details")}>
      <dl className="grid grid-cols-2 gap-y-2.5 text-sm mb-5 panel-inset p-4">
        <dt className="text-muted text-xs">{t("rooms.cols.name")}</dt>
        <dd className="font-bold text-white truncate">{room.name}</dd>
        <dt className="text-muted text-xs">{t("rooms.cols.host")}</dt>
        <dd><UserName user={room.host} /></dd>
        <dt className="text-muted text-xs">{t("rooms.cols.players")}</dt>
        <dd className="tabular-nums font-semibold">{room.players}/{room.maxPlayers}</dd>
        <dt className="text-muted text-xs">{t("rooms.cols.access")}</dt>
        <dd>{t(`create.${room.visibility}`)}{room.hasPassword ? ` · ${t("rooms.filters.password")}` : ""}</dd>
        <dt className="text-muted text-xs">{t("rooms.cols.status")}</dt>
        <dd>{t(`rooms.status.${room.phase}`)}</dd>
        <dt className="text-muted text-xs">{t("rooms.cols.stage")}</dt>
        <dd>{room.stage ?? "—"}</dd>
      </dl>
      <div className="flex gap-2 justify-end">
        {room.allowSpectators && (
          <button className="btn-secondary" onClick={() => onJoin(room, true)}>
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
        className="grid gap-3.5"
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
        <button className="btn-primary h-11" disabled={extracted.length < 22}>
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
        className="grid gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          onJoin(password).catch(setError);
        }}
      >
        <label className="label" htmlFor="room-password">{t("rooms.enterPassword")}</label>
        <input id="room-password" className="input" type="password" autoComplete="off" maxLength={64} value={password} onChange={(e) => setPassword(e.target.value)} />
        <ErrorText error={error} />
        <button className="btn-primary h-11" disabled={password.length < 4}>
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
        {/* Group 1: Room Basics */}
        <div className="panel-inset p-4 grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 text-xs font-extrabold uppercase tracking-wider text-primary">{t("ui.roomBasics")}</div>
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
        </div>

        {/* Group 2: Seats & Timer */}
        <div className="panel-inset p-4 grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 text-xs font-extrabold uppercase tracking-wider text-primary">{t("ui.seatsAndTimer")}</div>
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

        {/* Group 3: Table Options */}
        <div className="panel-inset p-4 grid sm:grid-cols-2 gap-2.5 text-sm">
          <div className="sm:col-span-2 text-xs font-extrabold uppercase tracking-wider text-primary">{t("ui.roomRules")}</div>
          {(["allowSpectators", "autoStart", "chatEnabled", "allowInvites"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2.5 rounded-xl bg-surface-2/75 border border-line/65 px-3.5 py-2.5 cursor-pointer hover:border-line-strong transition-colors">
              <input type="checkbox" className="accent-[var(--color-primary)]" checked={form[k]} onChange={(e) => set(k, e.target.checked)} />
              <span className="text-xs font-semibold text-text-2">
                {t(`create.${k === "allowSpectators" ? "spectators" : k === "chatEnabled" ? "chat" : k === "allowInvites" ? "invites" : "autoStart"}`)}
              </span>
            </label>
          ))}
        </div>

        {/* Group 4: Game-Specific Options */}
        <fieldset className="panel-inset p-4 grid sm:grid-cols-2 gap-3">
          <legend className="text-xs font-extrabold uppercase tracking-wider text-gold px-1">{t("create.gameOptions")}</legend>
          {GAME_OPTIONS[game].map((opt) => (
            <div key={opt.key}>
              {opt.kind === "boolean" ? (
                <label className="flex items-center gap-2.5 text-xs font-semibold text-text-2 mt-4 rounded-xl bg-surface-2/75 border border-line/65 px-3.5 py-2.5 cursor-pointer hover:border-line-strong transition-colors">
                  <input type="checkbox" className="accent-[var(--color-primary)]" checked={Boolean(gameConfig[opt.key])} onChange={(e) => setGameConfig((g) => ({ ...g, [opt.key]: e.target.checked }))} />
                  {t(`opt.${opt.key}`)}
                </label>
              ) : (
                <>
                  <label className="label" htmlFor={`opt-${opt.key}`}>{t(`opt.${opt.key}`)}</label>
                  {opt.kind === "select" ? (
                    <>
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
                      {opt.hints && <p className="mt-1.5 text-[11.5px] leading-snug text-muted">{t(`opt.hints.${String(gameConfig[opt.key])}`)}</p>}
                    </>
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
        <button className="btn-primary btn-lg w-full" disabled={busy}>
          {t("create.submit")}
        </button>
      </form>
    </Modal>
  );
}
