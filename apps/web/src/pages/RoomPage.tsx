import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ArrowLeft, Bot, Copy, Crown, LogOut, MessageSquare, UserMinus, UserPlus, VolumeX, Wifi, WifiOff } from "lucide-react";
import { BOT_DIFFICULTIES, WS_CLOSE, type FriendDto, type MatchResult, type RoomSnapshot, type SeatInfo } from "@croco/shared/client";
import { get, post } from "../lib/api";
import { useRoom } from "../hooks/useRoom";
import { useSession } from "../store/session";
import { useT, type TFunction } from "../i18n";
import { Avatar, BotBadge, ErrorText, Modal, Spinner, UserName } from "../components/ui";
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
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    if (conn.closeCode === WS_CLOSE.roomClosed || conn.closeCode === WS_CLOSE.kicked) void refresh();
  }, [conn.closeCode, refresh]);

  if (!/^r_[A-Za-z0-9]{16,32}$/.test(roomId)) return <ErrorText error="not_found" />;

  if (conn.status === "closed") {
    const key = conn.closeCode === WS_CLOSE.kicked ? "room.kicked" : conn.closeCode === WS_CLOSE.superseded ? "room.superseded" : "room.closed";
    return (
      <div className="card p-6 text-center grid gap-3 max-w-md mx-auto">
        <p>{t(key)}</p>
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
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`/games/${room.gameType}`} className="btn-ghost btn-sm" aria-label={t("common.back")}>
          <ArrowLeft size={14} />
        </Link>
        <div className="min-w-0">
          <h1 className="font-bold truncate">{room.name}</h1>
          <p className="text-xs text-muted">
            {t(`games.${room.gameType}.name`)} · {room.matchNumber > 0 ? t("room.match", { n: room.matchNumber }) : t("rooms.status.waiting")}
            {room.spectators > 0 && ` · ${t("room.spectators", { count: room.spectators })}`}
            {you.spectator && ` · ${t("room.spectating")}`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {conn.status === "open" ? <Wifi size={16} className="text-primary" aria-label="online" /> : <WifiOff size={16} className="text-warning" aria-label="offline" />}
          {(room.settings.allowInvites || you.isHost) && !you.spectator && (
            <button className="btn-ghost btn-sm" onClick={() => setInviteOpen(true)}>
              <UserPlus size={14} /> <span className="hidden sm:inline">{t("room.invite")}</span>
            </button>
          )}
          <button className="btn-ghost btn-sm lg:hidden" onClick={() => setChatOpen((v) => !v)} aria-expanded={chatOpen}>
            <MessageSquare size={14} />
          </button>
          <button className="btn-danger btn-sm" onClick={() => void leave()}>
            <LogOut size={14} /> <span className="hidden sm:inline">{t("room.leave")}</span>
          </button>
        </div>
      </div>
      {conn.status === "reconnecting" && <div className="card p-2 text-sm text-warning text-center">{t("room.reconnecting")}</div>}
      {conn.lastError && <ErrorText error={conn.lastError} />}
      <div className="grid lg:grid-cols-[1fr_320px] gap-3 items-start">
        <div className="min-w-0">
          {playing ? (
            <GameBoard gameType={room.gameType} view={conn.game!.view} deadline={conn.game!.deadline} mySeat={you.spectator ? null : you.seat} seats={room.seats} onAction={conn.act} />
          ) : (
            <Lobby room={room} you={you} send={conn.send} result={conn.result} />
          )}
        </div>
        <div className={`${chatOpen ? "block" : "hidden"} lg:block lg:sticky lg:top-16 h-[60dvh] lg:h-[calc(100dvh-6rem)]`}>
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
    <div className="grid gap-3">
      {result && <Results result={result} seats={room.seats} />}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-text-2">{t("room.seats")}</h2>
          <span className="text-xs text-muted">
            {occupied}/{room.maxPlayers}
          </span>
        </div>
        <ul className="grid sm:grid-cols-2 gap-2">
          {room.seats.map((s) => (
            <li key={s.seat} className="flex items-center gap-2 rounded-lg bg-surface-2 border border-line p-2 min-h-14">
              {s.occupant === "human" && s.user ? (
                <>
                  <Avatar id={s.user.avatar} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm">
                      <UserName user={s.user} you={s.user.id === you.userId} />
                      {room.hostId === s.user.id && <Crown size={13} className="text-gold" aria-label={t("room.host")} />}
                    </div>
                    <div className="text-xs text-muted">
                      {!s.connected ? t("room.disconnected") : s.ready ? t("room.ready") : t("room.notReady")}
                    </div>
                  </div>
                  {you.isHost && s.user.id !== you.userId && !s.user.badges.admin && (
                    <div className="flex">
                      <button className="btn-ghost btn-sm px-2" title={t("room.makeHost")} onClick={() => send({ type: "room.transferHost", userId: s.user!.id })}>
                        <Crown size={13} />
                      </button>
                      <button className="btn-ghost btn-sm px-2" title={t("room.mute")} onClick={() => send({ type: "room.mute", userId: s.user!.id, muted: true })}>
                        <VolumeX size={13} />
                      </button>
                      <button className="btn-ghost btn-sm px-2 text-danger" title={t("room.kick")} onClick={() => send({ type: "room.kick", userId: s.user!.id })}>
                        <UserMinus size={13} />
                      </button>
                    </div>
                  )}
                </>
              ) : s.occupant === "bot" ? (
                <>
                  <span className="size-8 rounded-full bg-secondary/40 flex items-center justify-center">
                    <Bot size={16} />
                  </span>
                  <div className="flex-1 text-sm">
                    {t("common.bot")} {s.botName} <BotBadge difficulty={s.botDifficulty} />
                  </div>
                  {you.isHost && (
                    <button className="btn-ghost btn-sm" onClick={() => send({ type: "room.removeBot", seat: s.seat })}>
                      {t("room.removeBot")}
                    </button>
                  )}
                </>
              ) : (
                <span className="text-sm text-muted px-2">{t("room.emptySeat")}</span>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 mt-4 items-center">
          {mySeat && (
            <button className={mySeat.ready ? "btn-secondary" : "btn-ghost"} onClick={() => send({ type: "room.ready", ready: !mySeat.ready })}>
              {mySeat.ready ? t("room.notReady") : t("room.ready")}
            </button>
          )}
          {you.isHost && (
            <>
              <select className="input w-auto h-10" value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)} aria-label={t("create.botDifficulty")}>
                {BOT_DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>{t(`difficulty.${d}`)}</option>
                ))}
              </select>
              <button className="btn-ghost" disabled={occupied >= room.maxPlayers} onClick={() => send({ type: "room.addBot", difficulty })}>
                <Bot size={14} /> {t("room.addBot")}
              </button>
              <button className="btn-primary ml-auto" onClick={() => send({ type: "room.start" })}>
                {t("room.start")}
              </button>
            </>
          )}
          {!you.isHost && <p className="text-sm text-muted">{t("room.waiting")}</p>}
        </div>
      </div>
    </div>
  );
}

function Results({ result, seats }: { result: MatchResult; seats: SeatInfo[] }) {
  const t = useT();
  const sorted = result.entries.slice().sort((a, b) => a.placement - b.placement);
  return (
    <div className="card p-4 border-primary/40">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">{t("room.results")}</h2>
        <span className="chip bg-surface-3 text-muted">{result.rated ? t("room.rated") : t("room.unrated")}</span>
      </div>
      <table className="w-full text-sm">
        <thead className="text-muted text-xs">
          <tr>
            <th className="text-left py-1">{t("game.placement")}</th>
            <th className="text-left">{t("leaderboard.player")}</th>
            <th className="text-right">{t("game.score")}</th>
            <th className="text-right">{t("game.rating")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => (
            <tr key={e.seat} className="table-row">
              <td className="py-1.5">#{e.placement}</td>
              <td>{e.isBot ? `${t("common.bot")} ${seats[e.seat]?.botName ?? ""}` : e.username ?? "—"}</td>
              <td className="text-right tabular-nums">{e.score}</td>
              <td className={`text-right tabular-nums ${e.ratingDelta && e.ratingDelta > 0 ? "text-primary" : e.ratingDelta && e.ratingDelta < 0 ? "text-danger" : "text-muted"}`}>
                {e.ratingDelta === undefined || e.ratingDelta === null ? "—" : e.ratingDelta > 0 ? `+${e.ratingDelta}` : e.ratingDelta}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted mt-2">{t("room.rematch")}</p>
    </div>
  );
}

function InviteDialog({ open, onClose, room }: { open: boolean; onClose(): void; room: RoomSnapshot }) {
  const t = useT();
  const [friends, setFriends] = useState<FriendDto[] | null>(null);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [link, setLink] = useState<string | null>(null);
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
              <li key={f.user.id} className="flex items-center gap-2 text-sm">
                <Avatar id={f.user.avatar} size={28} />
                <UserName user={f.user} />
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
              <input className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label={t("room.inviteLink")} />
              <button className="btn-secondary" onClick={() => void navigator.clipboard?.writeText(link)}>
                <Copy size={14} />
              </button>
            </div>
          ) : (
            <button
              className="btn-secondary"
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
