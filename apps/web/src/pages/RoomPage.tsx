import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Bot, CheckCircle2, Clock, Copy, Crown, Eye, LogOut, MessageSquare, Play, Trophy, UserMinus, UserPlus, VolumeX, Wifi, WifiOff } from "lucide-react";
import { BOT_DIFFICULTIES, WS_CLOSE, type FriendDto, type MatchResult, type RoomSnapshot, type SeatInfo } from "@croco/shared/client";
import { get, post } from "../lib/api";
import { useRoom } from "../hooks/useRoom";
import { useSession } from "../store/session";
import { useT, type TFunction } from "../i18n";
import { Avatar, BotBadge, ErrorText, Modal, Spinner, StatusDot, UserName } from "../components/ui";
import { GAME_THEMES, GameBadgeIcon } from "../components/GameArt";
import { ChatPanel } from "../components/ChatPanel";
import { GameBoard } from "../games/GameBoard";

export function seatName(seats: SeatInfo[], seat: number, t: TFunction): string {
  const s = seats[seat];
  if (!s) return `#${seat + 1}`;
  if (s.occupant === "bot") return `${t("common.bot")} ${s.botName ?? ""}`;
  return s.user?.username ?? t("room.emptySeat");
}

export default function RoomPage() {
  const { roomId = "" } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const me = useSession((s) => s.me);
  const refresh = useSession((s) => s.refresh);
  const conn = useRoom(roomId, me?.profile?.id);
  const [chatOpen, setChatOpen] = useState(false);
  const [desktopChat, setDesktopChat] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    if (conn.closeCode === WS_CLOSE.roomClosed || conn.closeCode === WS_CLOSE.kicked) void refresh();
  }, [conn.closeCode, refresh]);

  if (!/^r_[A-Za-z0-9]{16,32}$/.test(roomId)) return <ErrorText error="not_found" />;

  if (conn.status === "closed") {
    const key = conn.closeCode === WS_CLOSE.kicked ? "room.kicked" : conn.closeCode === WS_CLOSE.superseded ? "room.superseded" : "room.closed";
    return (
      <div className="card p-7 text-center grid gap-4 max-w-md mx-auto mt-8 fade-in">
        <p className="text-base font-bold text-white">{t(key)}</p>
        <Link to="/" className="btn-primary mx-auto">{t("nav.dashboard")}</Link>
      </div>
    );
  }
  if (!conn.room || !conn.you) return <Spinner label={t("room.connecting")} />;

  const room = conn.room;
  const you = conn.you;
  const playing = room.phase === "playing" && conn.game;

  async function leave() {
    if (playing && !window.confirm(t("room.leaveConfirm"))) return;
    await post(`/api/rooms/${room.id}/leave`).catch(() => undefined);
    await refresh();
    navigate(`/games/${room.gameType}`);
  }

  return (
    <div className="grid gap-3 fade-in">
      {/* Room Top Bar */}
      <div className="card px-3.5 py-2.5 flex flex-wrap items-center gap-2.5">
        <Link to={`/games/${room.gameType}`} className="btn-ghost btn-sm size-8 px-0" aria-label={t("common.back")}>
          <ArrowLeft size={15} />
        </Link>
        <GameBadgeIcon game={room.gameType} size={22} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-extrabold text-sm sm:text-base text-white truncate">{room.name}</h1>
            <span className={`chip hidden sm:inline-flex ${GAME_THEMES[room.gameType].badgeClass}`}>{t(`games.${room.gameType}.name`)}</span>
          </div>
          <p className="text-[11px] text-muted flex items-center gap-2 flex-wrap">
            <span>{room.matchNumber > 0 ? t("room.match", { n: room.matchNumber }) : t("rooms.status.waiting")}</span>
            {room.spectators > 0 && (
              <span className="inline-flex items-center gap-1">
                <Eye size={11} /> {t("room.spectators", { count: room.spectators })}
              </span>
            )}
            {you.spectator && <span className="text-accent font-semibold">{t("room.spectating")}</span>}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <span className={`chip border ${conn.status === "open" ? "bg-primary/12 border-primary/35 text-primary" : "bg-warning/15 border-warning/35 text-warning"}`}>
            {conn.status === "open" ? <Wifi size={12} aria-label="online" /> : <WifiOff size={12} aria-label="offline" />}
            <span className="hidden sm:inline">{conn.status === "open" ? t("common.online") : t("room.reconnecting")}</span>
          </span>
          {(room.settings.allowInvites || you.isHost) && !you.spectator && (
            <button className="btn-secondary btn-sm" onClick={() => setInviteOpen(true)}>
              <UserPlus size={14} /> <span className="hidden sm:inline">{t("room.invite")}</span>
            </button>
          )}
          <button className="btn-secondary btn-sm lg:hidden" onClick={() => setChatOpen((v) => !v)} aria-expanded={chatOpen} aria-label={t("chat.title")}>
            <MessageSquare size={14} />
          </button>
          <button className="btn-secondary btn-sm hidden lg:inline-flex" onClick={() => setDesktopChat((v) => !v)} aria-expanded={desktopChat} title={desktopChat ? t("room.hideChat") : t("room.showChat")}>
            <MessageSquare size={14} /> <span>{desktopChat ? t("room.hideChat") : t("room.showChat")}</span>
          </button>
          <button className="btn-danger btn-sm" onClick={() => void leave()}>
            <LogOut size={14} /> <span className="hidden sm:inline">{t("room.leave")}</span>
          </button>
        </div>
      </div>

      {conn.status === "reconnecting" && <div className="card p-2.5 text-xs font-semibold text-warning border-warning/40 bg-warning/10 text-center">{t("room.reconnecting")}</div>}
      {conn.lastError && <ErrorText error={conn.lastError} />}

      <div className={`grid gap-3 items-start ${desktopChat ? "lg:grid-cols-[1fr_300px]" : ""}`}>
        <div className="min-w-0">
          {playing ? (
            <GameBoard gameType={room.gameType} view={conn.game!.view} deadline={conn.game!.deadline} mySeat={you.spectator ? null : you.seat} seats={room.seats} onAction={conn.act} />
          ) : (
            <Lobby room={room} you={you} send={conn.send} result={conn.result} />
          )}
        </div>
        <div className={`${chatOpen ? "block" : "hidden"} ${desktopChat ? "lg:block" : "lg:hidden"} lg:sticky lg:top-18 h-[56dvh] lg:h-[calc(100dvh-5.5rem)]`}>
          <ChatPanel
            messages={conn.chat}
            enabled={room.settings.chatEnabled}
            muted={you.muted}
            myUserId={you.userId}
            roomId={room.id}
            onSend={(text) => conn.send({ type: "chat.send", text })}
          />
        </div>
      </div>
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} room={room} />
    </div>
  );
}

function Lobby({ room, you, send, result }: { room: RoomSnapshot; you: NonNullable<ReturnType<typeof useRoom>["you"]>; send(m: Record<string, unknown>): void; result: MatchResult | null }) {
  const t = useT();
  const [difficulty, setDifficulty] = useState(room.settings.botDifficulty);
  const mySeat = you.seat !== null ? room.seats[you.seat] : undefined;
  const occupied = room.seats.filter((s) => s.occupant !== "empty").length;
  return (
    <div className="grid gap-3.5">
      {result && <Results result={result} seats={room.seats} />}
      <div className="card p-4 sm:p-5 grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-line">
          <div>
            <h2 className="font-extrabold text-base text-white">{t("room.seats")}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted mt-1">
              <span className="inline-flex items-center gap-1">
                <Clock size={12} /> {room.settings.turnSeconds}s
              </span>
              <span>·</span>
              <span>{t(`create.${room.visibility}`)}</span>
              {room.settings.allowSpectators && (
                <>
                  <span>·</span>
                  <span>{t("create.spectators")}</span>
                </>
              )}
            </div>
          </div>
          <span className="chip bg-primary/15 text-primary border border-primary/35 font-bold tabular-nums">
            {occupied} / {room.maxPlayers}
          </span>
        </div>

        <ul className="grid sm:grid-cols-2 gap-2.5">
          {room.seats.map((s) => (
            <li
              key={s.seat}
              className={`flex items-center gap-3 rounded-xl p-3 border min-h-[4.25rem] transition-colors ${
                s.occupant === "empty"
                  ? "bg-surface-3/60 border-dashed border-line"
                  : s.ready
                    ? "bg-primary/8 border-primary/40"
                    : "bg-surface-2 border-line"
              }`}
            >
              {s.occupant === "human" && s.user ? (
                <>
                  <Avatar id={s.user.avatar} size={38} ring={s.ready ? "primary" : room.hostId === s.user.id ? "gold" : "none"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-bold text-white">
                      <UserName user={s.user} you={s.user.id === you.userId} />
                      {room.hostId === s.user.id && (
                        <span className="chip bg-gold/15 text-gold border border-gold/40 h-5 px-1.5" title={t("room.host")}>
                          <Crown size={11} />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs mt-0.5">
                      {!s.connected ? (
                        <span className="text-warning font-semibold">{t("room.disconnected")}</span>
                      ) : s.ready ? (
                        <span className="text-primary font-semibold inline-flex items-center gap-1">
                          <CheckCircle2 size={12} /> {t("room.ready")}
                        </span>
                      ) : (
                        <span className="text-muted">{t("room.notReady")}</span>
                      )}
                    </div>
                  </div>
                  {you.isHost && s.user.id !== you.userId && !s.user.badges.admin && (
                    <div className="flex gap-0.5 shrink-0">
                      <button className="btn-ghost btn-sm size-7 px-0" title={t("room.makeHost")} onClick={() => send({ type: "room.transferHost", userId: s.user!.id })}>
                        <Crown size={13} className="text-gold" />
                      </button>
                      <button className="btn-ghost btn-sm size-7 px-0" title={t("room.mute")} onClick={() => send({ type: "room.mute", userId: s.user!.id, muted: true })}>
                        <VolumeX size={13} />
                      </button>
                      <button className="btn-ghost btn-sm size-7 px-0 text-danger" title={t("room.kick")} onClick={() => send({ type: "room.kick", userId: s.user!.id })}>
                        <UserMinus size={13} />
                      </button>
                    </div>
                  )}
                </>
              ) : s.occupant === "bot" ? (
                <>
                  <span className="size-9 rounded-full bg-secondary/40 border border-secondary/60 text-accent flex items-center justify-center shrink-0">
                    <Bot size={18} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-text-2">{t("common.bot")} {s.botName}</div>
                    <div className="mt-0.5">
                      <BotBadge difficulty={s.botDifficulty} />
                    </div>
                  </div>
                  {you.isHost && (
                    <button className="btn-ghost btn-sm text-xs" onClick={() => send({ type: "room.removeBot", seat: s.seat })}>
                      {t("room.removeBot")}
                    </button>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2.5 text-sm text-muted/80 px-1">
                  <span className="size-9 rounded-full border border-dashed border-line-strong flex items-center justify-center text-xs font-bold">#{s.seat + 1}</span>
                  <span>{t("room.emptySeat")}</span>
                </div>
              )}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2.5 pt-2 border-t border-line items-center">
          {mySeat && (
            <button className={mySeat.ready ? "btn-secondary" : "btn-gold"} onClick={() => send({ type: "room.ready", ready: !mySeat.ready })}>
              <CheckCircle2 size={15} /> {mySeat.ready ? t("room.notReady") : t("room.ready")}
            </button>
          )}
          {you.isHost && (
            <>
              <select className="input w-auto h-10 text-xs" value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)} aria-label={t("create.botDifficulty")}>
                {BOT_DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>{t(`difficulty.${d}`)}</option>
                ))}
              </select>
              <button className="btn-secondary" disabled={occupied >= room.maxPlayers} onClick={() => send({ type: "room.addBot", difficulty })}>
                <Bot size={15} /> {t("room.addBot")}
              </button>
              <button className="btn-primary ml-auto px-6" onClick={() => send({ type: "room.start" })}>
                <Play size={15} className="fill-current" /> {t("room.start")}
              </button>
            </>
          )}
          {!you.isHost && <p className="text-xs text-muted ml-auto">{t("room.waiting")}</p>}
        </div>
      </div>
    </div>
  );
}

function Results({ result, seats }: { result: MatchResult; seats: SeatInfo[] }) {
  const t = useT();
  const sorted = result.entries.slice().sort((a, b) => a.placement - b.placement);
  return (
    <div className="card p-4 sm:p-5 border-gold/45 bg-gradient-to-br from-gold/8 via-surface to-surface">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-extrabold text-base text-white flex items-center gap-2">
          <Trophy size={17} className="text-gold" /> {t("room.results")}
        </h2>
        <span className={`chip border ${result.rated ? "bg-primary/15 text-primary border-primary/35" : "bg-surface-3 text-muted border-line"}`}>
          {result.rated ? t("room.rated") : t("room.unrated")}
        </span>
      </div>
      <table className="w-full text-sm">
        <thead className="text-muted text-xs border-b border-line">
          <tr>
            <th className="text-left py-2">{t("game.placement")}</th>
            <th className="text-left">{t("leaderboard.player")}</th>
            <th className="text-right">{t("game.score")}</th>
            <th className="text-right">{t("game.rating")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => (
            <tr key={e.seat} className="table-row">
              <td className={`py-2 font-extrabold ${e.placement === 1 ? "text-gold" : e.placement === 2 ? "text-silver" : e.placement === 3 ? "text-bronze" : "text-muted"}`}>
                #{e.placement}
              </td>
              <td className="font-semibold text-white">{e.isBot ? `${t("common.bot")} ${seats[e.seat]?.botName ?? ""}` : e.username ?? "—"}</td>
              <td className="text-right tabular-nums text-text-2">{e.score}</td>
              <td className={`text-right tabular-nums font-bold ${e.ratingDelta && e.ratingDelta > 0 ? "text-primary" : e.ratingDelta && e.ratingDelta < 0 ? "text-danger" : "text-muted"}`}>
                {e.ratingDelta === undefined || e.ratingDelta === null ? "—" : e.ratingDelta > 0 ? `+${e.ratingDelta}` : e.ratingDelta}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted mt-3">{t("room.rematch")}</p>
    </div>
  );
}

function InviteDialog({ open, onClose, room }: { open: boolean; onClose(): void; room: RoomSnapshot }) {
  const t = useT();
  const [friends, setFriends] = useState<FriendDto[] | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    get<{ items: FriendDto[] }>("/api/friends")
      .then((r) => setFriends(r.items))
      .catch(setError);
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title={t("room.invite")}>
      <div className="grid gap-4">
        {friends === null ? (
          <Spinner />
        ) : friends.length === 0 ? (
          <p className="text-sm text-muted">{t("friends.empty")}</p>
        ) : (
          <ul className="grid gap-2 max-h-72 overflow-y-auto">
            {friends.map((f) => (
              <li key={f.user.id} className="flex items-center gap-2.5 rounded-xl bg-surface-2 border border-line/70 px-3 py-2 text-sm">
                <StatusDot status={f.status} />
                <Avatar id={f.user.avatar} size={28} />
                <UserName user={f.user} className="font-semibold" />
                <span className="text-xs text-muted">{t(`friends.status.${f.status}`)}</span>
                <button
                  className="btn-primary btn-sm ml-auto"
                  disabled={invited.has(f.user.id)}
                  onClick={() =>
                    post("/api/invitations", { roomId: room.id, toUserId: f.user.id })
                      .then(() => setInvited((s) => new Set(s).add(f.user.id)))
                      .catch(setError)
                  }
                >
                  {invited.has(f.user.id) ? t("friends.invited") : t("friends.invite")}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-line pt-3">
          <p className="label">{t("room.inviteLink")}</p>
          {link ? (
            <div className="flex gap-2">
              <input className="input font-mono text-xs" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label={t("room.inviteLink")} />
              <button
                className="btn-secondary shrink-0"
                onClick={() => {
                  void navigator.clipboard?.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                <Copy size={14} /> {copied ? t("common.copied") : t("common.copy")}
              </button>
            </div>
          ) : (
            <button
              className="btn-secondary w-full"
              onClick={() =>
                post<{ code: string }>("/api/invite-links", { roomId: room.id })
                  .then((r) => setLink(`${location.origin}${location.pathname}#/invite/${r.code}`))
                  .catch(setError)
              }
            >
              {t("room.createLink")}
            </button>
          )}
        </div>
        <ErrorText error={error} />
      </div>
    </Modal>
  );
}
