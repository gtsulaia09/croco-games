import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bot, BotOff, EyeOff, Flag, MessageSquare, Send, Smile, X } from "lucide-react";
import { isBotChatLine, type ChatMessage, type GameType } from "@croco/shared/client";
import { post } from "../lib/api";
import { useT } from "../i18n";
import { Avatar, UserName } from "./ui";
import { EMOJI_CATEGORIES } from "./emoji";

const QUICK_REACTIONS = ["GG", "WP", "GL", "NH", "👏", "🔥", "😂", "😎", "🤝", "🃏", "🍀", "👑"];
const MAX_TEXT = 300;

/** Emoji picker: category tabs and a grid; a click inserts the emoji where the cursor is. */
function EmojiPicker({ onPick }: { onPick(emoji: string): void }) {
  const t = useT();
  const [cat, setCat] = useState(EMOJI_CATEGORIES[0]!.id);
  const current = EMOJI_CATEGORIES.find((c) => c.id === cat) ?? EMOJI_CATEGORIES[0]!;
  return (
    <div className="pemoji" role="dialog" aria-label={t("chat.emoji")}>
      <div className="pemoji-tabs" role="tablist" aria-label={t("chat.emoji")}>
        {EMOJI_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === cat}
            className="pemoji-tab"
            title={t(`chat.emojiCats.${c.id}`)}
            aria-label={t(`chat.emojiCats.${c.id}`)}
            onClick={() => setCat(c.id)}
          >
            {c.icon}
          </button>
        ))}
      </div>
      <div className="pemoji-name">{t(`chat.emojiCats.${current.id}`)}</div>
      <div className="pemoji-grid" role="tabpanel">
        {current.emoji.map((e, i) => (
          <button key={`${current.id}-${i}`} type="button" className="pemoji-item" onClick={() => onPick(e)} aria-label={e}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
const HIDE_BOTS_KEY = "croco.chat.hideBots";

/** Per-viewer convenience: whether bot table talk is hidden (browser storage may be unavailable). */
function readHideBots(): boolean {
  try {
    return localStorage.getItem(HIDE_BOTS_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHideBots(value: boolean): void {
  try {
    localStorage.setItem(HIDE_BOTS_KEY, value ? "1" : "0");
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}

/**
 * A chat: a table's room chat (`roomId`) or a game's chat room (`chatGame`). Messages are rendered
 * as text only; reports carry the message id so moderators get a server-side snapshot.
 */
export function ChatPanel({
  messages,
  onSend,
  enabled,
  myUserId,
  roomId,
  chatGame,
  muted,
  title,
  meta,
  disabledText,
  className = "",
  canReport = true,
  onClose,
}: {
  messages: ChatMessage[];
  onSend(text: string): void;
  enabled: boolean;
  myUserId?: string;
  roomId?: string;
  chatGame?: GameType;
  muted?: boolean;
  title?: string;
  meta?: ReactNode;
  disabledText?: string;
  className?: string;
  canReport?: boolean;
  onClose?: () => void;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [hideBots, setHideBots] = useState(readHideBots);
  const [picker, setPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function insert(fragment: string) {
    const el = inputRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = `${text.slice(0, start)}${fragment}${text.slice(end)}`;
    if (next.length > MAX_TEXT) return;
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + fragment.length, start + fragment.length);
    });
  }
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const hasBots = messages.some((m) => m.kind === "bot");
  const visible = messages.filter((m) => {
    if (m.kind === "bot") return !hideBots && isBotChatLine(m.key);
    return m.kind === "system" || !m.user || !hidden.has(m.user.id);
  });

  function submit() {
    const value = text.trim();
    if (!value) return;
    onSend(value.slice(0, MAX_TEXT));
    setText("");
    setPicker(false);
  }

  async function report(m: ChatMessage) {
    if (!m.user) return;
    try {
      await post("/api/reports", { targetUserId: m.user.id, ...(roomId ? { roomId } : { chatGame }), messageId: m.id, reason: "abuse" });
      setNotice(t("chat.reported"));
    } catch {
      setNotice(t("errors.generic"));
    }
    setTimeout(() => setNotice(null), 3000);
  }

  return (
    <div className={`card flex flex-col h-full min-h-72 overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-line bg-surface-2/75 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-extrabold text-white min-w-0">
          <MessageSquare size={15} className="text-primary shrink-0" />
          <span className="truncate">{title ?? t("chat.title")}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {meta ?? <span className="chip bg-surface-3 border border-line text-muted tabular-nums">{visible.length}</span>}
          {hasBots && (
            <button
              type="button"
              className="btn-ghost btn-sm size-7.5 px-0 rounded-full"
              aria-pressed={hideBots}
              title={hideBots ? t("chat.showBots") : t("chat.hideBots")}
              aria-label={hideBots ? t("chat.showBots") : t("chat.hideBots")}
              onClick={() => {
                setHideBots((v) => {
                  writeHideBots(!v);
                  return !v;
                });
              }}
            >
              {hideBots ? <BotOff size={14} /> : <Bot size={14} />}
            </button>
          )}
          {onClose && (
            <button type="button" className="btn-ghost btn-sm size-7.5 px-0 rounded-full" onClick={onClose} aria-label={t("common.close")} title={t("common.close")}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 grid gap-2 content-start text-sm" aria-live="polite">
        {visible.map((m) =>
          m.kind === "system" ? (
            <div key={m.id} className="text-[11px] font-medium text-muted bg-surface-3/85 border border-line/65 rounded-full px-3 py-1 text-center justify-self-center max-w-full truncate">
              {m.key ? t(`chat.system.${m.key}`, m.params) : m.text}
            </div>
          ) : m.kind === "bot" ? (
            <div key={m.id} className="flex gap-2.5 items-start rounded-2xl px-3 py-2 border bg-accent/8 border-accent/22">
              <span className="size-6 rounded-full bg-surface-3 border border-accent/35 text-accent flex items-center justify-center shrink-0" aria-hidden="true">
                <Bot size={13} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="font-bold text-text-2">
                    {t("common.bot")} {m.bot?.name}
                  </span>
                  <time className="text-muted/80 ml-auto tabular-nums">{new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                </div>
                <p className="break-words text-[13px] text-white/90 mt-0.5 leading-snug italic">{t(`botChat.${m.key}`)}</p>
              </div>
            </div>
          ) : (
            <div
              key={m.id}
              className={`group flex gap-2.5 items-start rounded-2xl px-3 py-2 border ${
                m.user?.id === myUserId ? "bg-primary/10 border-primary/25" : "bg-surface-2/80 border-line/65"
              }`}
            >
              <Avatar id={m.user?.avatar} size={25} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <UserName user={m.user} you={m.user?.id === myUserId} className="font-bold text-text-2" />
                  <time className="text-muted/80 ml-auto tabular-nums">{new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                </div>
                {/* Rendered as text: React escapes everything, no HTML is interpreted. */}
                <p className="break-words whitespace-pre-wrap text-[13px] text-white/95 mt-0.5 leading-snug">{m.text}</p>
              </div>
              {canReport && m.user && m.user.id !== myUserId && (
                <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex shrink-0">
                  <button className="btn-ghost btn-sm size-6 px-0" title={t("chat.muteLocal")} onClick={() => setHidden((h) => new Set(h).add(m.user!.id))}>
                    <EyeOff size={12} />
                  </button>
                  <button className="btn-ghost btn-sm size-6 px-0 hover:text-danger" title={t("chat.report")} onClick={() => void report(m)}>
                    <Flag size={12} />
                  </button>
                </div>
              )}
            </div>
          ),
        )}
      </div>

      {notice && <p className="px-4 py-1.5 text-xs font-semibold text-primary bg-primary/10 border-t border-primary/25">{notice}</p>}

      {enabled && !muted ? (
        <div className="p-2.5 border-t border-line bg-surface-2/60 grid gap-2">
          <div className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
            {QUICK_REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                className="h-6.5 px-2.5 rounded-full bg-surface-3 border border-line text-[11px] font-bold text-text-2 hover:border-primary/45 hover:text-white transition-colors shrink-0"
                onClick={() => insert(`${text && !text.endsWith(" ") ? " " : ""}${e}`)}
                aria-label={e}
              >
                {e}
              </button>
            ))}
          </div>
          {picker && <EmojiPicker onPick={insert} />}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <button
              type="button"
              className={`btn-secondary h-9.5 w-9.5 px-0 shrink-0 ${picker ? "border-primary/60 text-primary" : ""}`}
              onClick={() => setPicker((v) => !v)}
              aria-expanded={picker}
              aria-label={t("chat.emoji")}
              title={t("chat.emoji")}
            >
              <Smile size={16} />
            </button>
            <input
              ref={inputRef}
              className="input h-9.5 text-xs"
              value={text}
              maxLength={MAX_TEXT}
              placeholder={t("chat.placeholder")}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && picker && (e.stopPropagation(), setPicker(false))}
              aria-label={t("chat.placeholder")}
            />
            <button className="btn-primary h-9.5 px-3.5" aria-label={t("common.send")}>
              <Send size={14} />
            </button>
          </form>
        </div>
      ) : (
        <p className="p-3 text-xs text-muted border-t border-line bg-surface-2/60">{disabledText ?? t("chat.disabled")}</p>
      )}
    </div>
  );
}
