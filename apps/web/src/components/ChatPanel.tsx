import { useEffect, useRef, useState } from "react";
import { Flag, EyeOff, Send } from "lucide-react";
import type { ChatMessage } from "@croco/shared/client";
import { post } from "../lib/api";
import { useT } from "../i18n";
import { UserName } from "./ui";

const EMOJIS = ["👍", "😂", "😮", "😢", "🔥", "👏", "🤝", "🎉"];

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
    <div className="card flex flex-col h-full min-h-72">
      <div className="px-3 py-2 border-b border-line text-sm font-semibold text-text-2">{t("chat.title")}</div>
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 grid gap-1.5 content-start text-sm" aria-live="polite">
        {visible.map((m) =>
          m.kind === "system" ? (
            <p key={m.id} className="text-xs text-muted italic">
              {m.key ? t(`chat.system.${m.key}`, m.params) : m.text}
            </p>
          ) : (
            <div key={m.id} className="group flex gap-2 items-start">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <UserName user={m.user} you={m.user?.id === myUserId} className="font-semibold text-text-2" />
                  <time className="text-muted">{new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                </div>
                {/* Rendered as text: React escapes everything, no HTML is interpreted. */}
                <p className="break-words whitespace-pre-wrap">{m.text}</p>
              </div>
              {m.user && m.user.id !== myUserId && (
                <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex">
                  <button className="btn-ghost btn-sm px-1.5" title={t("chat.muteLocal")} onClick={() => setHidden((h) => new Set(h).add(m.user!.id))}>
                    <EyeOff size={12} />
                  </button>
                  <button className="btn-ghost btn-sm px-1.5" title={t("chat.report")} onClick={() => void report(m)}>
                    <Flag size={12} />
                  </button>
                </div>
              )}
            </div>
          ),
        )}
      </div>
      {notice && <p className="px-3 text-xs text-primary">{notice}</p>}
      {enabled && !muted ? (
        <div className="p-2 border-t border-line grid gap-1.5">
          <div className="flex gap-1">
            {EMOJIS.map((e) => (
              <button key={e} className="btn-ghost btn-sm px-1.5" onClick={() => setText((v) => (v + e).slice(0, 300))} aria-label={e}>
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
            <input className="input" value={text} maxLength={300} placeholder={t("chat.placeholder")} onChange={(e) => setText(e.target.value)} aria-label={t("chat.placeholder")} />
            <button className="btn-primary px-3" aria-label={t("common.send")}>
              <Send size={16} />
            </button>
          </form>
        </div>
      ) : (
        <p className="p-3 text-xs text-muted border-t border-line">{t("chat.disabled")}</p>
      )}
    </div>
  );
}
