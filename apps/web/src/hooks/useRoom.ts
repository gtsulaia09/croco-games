import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, MatchResult, RoomSnapshot, ServerRoomMessage } from "@croco/shared/client";
import { TicketSocket, type SocketStatus } from "../lib/socket";

export interface GameFrame {
  rev: number;
  view: unknown;
  deadline: number | null;
  events: unknown[];
}

export interface RoomConnection {
  status: SocketStatus;
  closeCode: number | null;
  you: { userId: string; seat: number | null; spectator: boolean; isHost: boolean; muted: boolean } | null;
  room: RoomSnapshot | null;
  chat: ChatMessage[];
  game: GameFrame | null;
  result: MatchResult | null;
  lastError: string | null;
  send(msg: Record<string, unknown>): void;
  act(action: Record<string, unknown>): void;
  clearResult(): void;
}

export function useRoom(roomId: string, myUserId: string | undefined): RoomConnection {
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [closeCode, setCloseCode] = useState<number | null>(null);
  const [you, setYou] = useState<RoomConnection["you"]>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [game, setGame] = useState<GameFrame | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const socketRef = useRef<TicketSocket<ServerRoomMessage> | null>(null);
  const revRef = useRef(0);

  useEffect(() => {
    const socket = new TicketSocket<ServerRoomMessage>(
      `/api/rooms/${roomId}/ticket`,
      `/api/rooms/${roomId}/ws`,
      (msg) => {
        switch (msg.type) {
          case "hello":
            setYou(msg.you);
            setRoom(msg.room);
            setChat(msg.chat);
            setGame(msg.game ? { ...msg.game, events: [] } : null);
            revRef.current = msg.game?.rev ?? 0;
            break;
          case "room":
            setRoom(msg.room);
            setYou((y) => {
              if (!y) return y;
              const seat = msg.room.seats.find((s) => s.user?.id === y.userId)?.seat ?? null;
              return { ...y, seat, isHost: msg.room.hostId === y.userId };
            });
            if (msg.room.phase !== "playing") setGame(null);
            break;
          case "chat":
            setChat((c) => [...c, msg.message].slice(-200));
            break;
          case "game":
            revRef.current = msg.rev;
            setGame({ rev: msg.rev, view: msg.view, deadline: msg.deadline, events: msg.events });
            break;
          case "match.end":
            setResult(msg.result);
            break;
          case "error":
            setLastError(msg.code);
            setTimeout(() => setLastError((e) => (e === msg.code ? null : e)), 4000);
            break;
          default:
            break;
        }
      },
      (s, code) => {
        setStatus(s);
        if (code !== undefined) setCloseCode(code);
      },
    );
    socketRef.current = socket;
    void socket.connect();
    return () => socket.close();
  }, [roomId]);

  useEffect(() => {
    if (myUserId && you && you.userId !== myUserId) setYou(null);
  }, [myUserId, you]);

  const send = useCallback((msg: Record<string, unknown>) => {
    socketRef.current?.send(msg);
  }, []);
  const act = useCallback((action: Record<string, unknown>) => {
    socketRef.current?.send({ type: "game.action", rev: revRef.current, action });
  }, []);

  return { status, closeCode, you, room, chat, game, result, lastError, send, act, clearResult: () => setResult(null) };
}
