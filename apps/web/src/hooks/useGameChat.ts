import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, GameType, ServerGameChatMessage } from "@croco/shared/client";
import { LIMITS } from "@croco/shared/client";
import { TicketSocket, type SocketStatus } from "../lib/socket";

export interface GameChatConnection {
  status: SocketStatus;
  messages: ChatMessage[];
  online: number;
  lastError: string | null;
  send(text: string): void;
}

/** The chat room of one game type (its own server-side room, isolated from every other game). */
export function useGameChat(game: GameType): GameChatConnection {
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [online, setOnline] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const socketRef = useRef<TicketSocket<ServerGameChatMessage> | null>(null);

  useEffect(() => {
    setMessages([]);
    setOnline(0);
    const socket = new TicketSocket<ServerGameChatMessage>(
      `/api/chat/${game}/ticket`,
      `/api/chat/${game}/ws`,
      (msg) => {
        switch (msg.type) {
          case "hello":
            // Ignore a late frame from another game's room.
            if (msg.gameType !== game) return;
            setMessages(msg.chat);
            setOnline(msg.online);
            break;
          case "chat":
            setMessages((m) => [...m, msg.message].slice(-LIMITS.chat.historySize));
            break;
          case "online":
            setOnline(msg.online);
            break;
          case "error":
            setLastError(msg.code);
            break;
        }
      },
      (s) => setStatus(s),
    );
    socketRef.current = socket;
    void socket.connect();
    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [game]);

  const send = useCallback((text: string) => {
    setLastError(null);
    socketRef.current?.send({ type: "chat.send", text });
  }, []);

  return { status, messages, online, lastError, send };
}
