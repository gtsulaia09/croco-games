import { createContext, useContext, useEffect, type ReactNode } from "react";
import { MessageSquare } from "lucide-react";
import { useT } from "../../i18n";

/**
 * The in-game chat launcher. The page around a board (a room or practice) provides it and shows
 * a large floating "ჩატი" button with the unread count that opens the chat window.
 */
export interface GameChatLauncher {
  open: boolean;
  unread: number;
  toggle(): void;
}

export const GameChatContext = createContext<GameChatLauncher | null>(null);

export function useGameChatLauncher(): GameChatLauncher | null {
  return useContext(GameChatContext);
}

export function UnreadBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return <span className="pchat-badge">{n > 99 ? "99+" : n}</span>;
}

/**
 * The floating chat button over the game: always in the bottom-right corner, with the unread
 * count. Hidden while the chat window is open (the window has its own close button).
 */
export function ChatFab() {
  const t = useT();
  const chat = useGameChatLauncher();
  if (!chat || chat.open) return null;
  return (
    <button type="button" className="pchat-fab" data-unread={chat.unread > 0 ? "true" : "false"} onClick={chat.toggle} aria-expanded={false} aria-label={t("chat.open")}>
      <MessageSquare size={20} />
      <span className="pchat-fab-label">{t("chat.title")}</span>
      <UnreadBadge n={chat.unread} />
    </button>
  );
}

/**
 * The chat window over the table: a floating panel on wide screens, a bottom sheet on phones. It
 * does not block the game — players keep playing while it is open. Escape closes it.
 */
export function ChatWindow({ open, onClose, children }: { open: boolean; onClose(): void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="pchat-window" role="complementary">
      {children}
    </div>
  );
}
