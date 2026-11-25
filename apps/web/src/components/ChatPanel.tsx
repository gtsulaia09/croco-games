import { useEffect, useRef, useState } from "react";
import { EyeOff, Flag, MessageSquare, Send } from "lucide-react";
import type { ChatMessage } from "@croco/shared/client";
import { post } from "../lib/api";
import { useT } from "../i18n";
import { Avatar, UserName } from "./ui";

const QUICK_REACTIONS = ["GG", "WP", "NH", "GL", "👏", "🔥"];

export function ChatPanel({
  messages,
  onSend,
  enabled,
  myUserId,
  roomId,
  muted,
}: {
  messages: ChatMessage[];
  onSend(text: string): void;
  enabled: boolean;
  myUserId?: string;
  roomId: string;
  muted?: boolean;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const visible = messages.filter((m) => m.kind === "system" || !m.user || !hidden.has(m.user.id));

  function submit() {
    const value = text.trim();
    if (!value) return;
    onSend(value.slice(0, 300));
    setText("");
  }

  async function report(m: ChatMessage) {
    if (!m.user) return;
    try {
      await post("/api/reports", { targetUserId: m.user.id, roomId, messageId: m.id, reason: "abuse" });
      setNotice(t("chat.reported"));
    } catch {
      setNotice(t("errors.generic"));
    }
    setTimeout(() => setNotice(null), 3000);
  }

  return (
    <div className="card flex flex-col h-full min-h-72 overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-line bg-surface-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <MessageSquare size={15} className="text-primary" />
          <span>{t("chat.title")}</span>
        </div>
        <span className="chip bg-surface-3 border border-line text-muted tabular-nums">{visible.length}</span>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2.5 grid gap-2 content-start text-sm" aria-live="polite">
        {visible.map((m) =>
          m.kind === "system" ? (
            <div key={m.id} className="text-[11px] text-muted bg-surface-3/80 border border-line/60 rounded-lg px-2.5 py-1 text-center">
              {m.key ? t(`chat.system.${m.key}`, m.params) : m.text}
            </div>
          ) : (
            <div
              key={m.id}
              className={`group flex gap-2 items-start rounded-xl px-2.5 py-2 border ${
                m.user?.id === myUserId ? "bg-primary/10 border-primary/25" : "bg-surface-2/80 border-line/60"
              }`}
            >
              <Avatar id={m.user?.avatar} size={24} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <UserName user={m.user} you={m.user?.id === myUserId} className="font-bold text-text-2" />
                  <time className="text-muted/80 ml-auto tabular-nums">{new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                </div>
                {/* Rendered as text: React escapes everything, no HTML is interpreted. */}
                <p className="break-words whitespace-pre-wrap text-[13px] text-white/95 mt-0.5 leading-snug">{m.text}</p>
              </div>
              {m.user && m.user.id !== myUserId && (
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

      {notice && <p className="px-3.5 py-1 text-xs font-semibold text-primary bg-primary/10 border-t border-primary/25">{notice}</p>}

      {enabled && !muted ? (
        <div className="p-2.5 border-t border-line bg-surface-2/60 grid gap-2">
          <div className="flex gap-1 overflow-x-auto">
            {QUICK_REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                className="h-6 px-2 rounded-full bg-surface-3 border border-line text-[11px] font-bold text-text-2 hover:border-primary/50 hover:text-white transition-colors shrink-0"
                onClick={() => setText((v) => `${v}${v ? " " : ""}${e}`.slice(0, 300))}
                aria-label={e}
              >
                {e}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input className="input h-9 text-xs" value={text} maxLength={300} placeholder={t("chat.placeholder")} onChange={(e) => setText(e.target.value)} aria-label={t("chat.placeholder")} />
            <button className="btn-primary h-9 px-3" aria-label={t("common.send")}>
              <Send size={14} />
            </button>
          </form>
        </div>
      ) : (
        <p className="p-3 text-xs text-muted border-t border-line bg-surface-2/60">{t("chat.disabled")}</p>
      )}
    </div>
  );
}
