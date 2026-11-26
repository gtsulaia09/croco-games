import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@croco/shared/client";

/**
 * Chat messages from other players and bots that arrived while the chat was not on screen.
 * Resets to zero whenever `seen` becomes true.
 */
export function useUnread(messages: ChatMessage[], myUserId: string | undefined, seen: boolean): number {
  const [unread, setUnread] = useState(0);
  const counted = useRef(messages.length);
  useEffect(() => {
    if (messages.length < counted.current) counted.current = 0; // a new match cleared the chat
    const fresh = messages.slice(counted.current).filter((m) => m.kind !== "system" && m.user?.id !== myUserId).length;
    counted.current = messages.length;
    if (seen) setUnread(0);
    else if (fresh) setUnread((n) => n + fresh);
  }, [messages, myUserId, seen]);
  return unread;
}
