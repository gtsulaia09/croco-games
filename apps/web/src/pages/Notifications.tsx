import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, CheckCheck, MailOpen } from "lucide-react";
import type { GameType, InvitationDto, NotificationDto } from "@croco/shared/client";
import { get, post } from "../lib/api";
import { useSession } from "../store/session";
import { useT } from "../i18n";
import { EmptyState, ErrorText, Section } from "../components/ui";
import { GameBadgeIcon } from "../components/GameArt";

export default function Notifications() {
  const t = useT();
  const navigate = useNavigate();
  const bump = useSession((s) => s.bumpUnread);
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [invites, setInvites] = useState<InvitationDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (next?: string) => {
    try {
      const r = await get<{ items: NotificationDto[]; nextCursor: string | null }>(`/api/notifications?limit=20${next ? `&cursor=${encodeURIComponent(next)}` : ""}`);
      setItems((cur) => (next ? [...cur, ...r.items] : r.items));
      setCursor(r.nextCursor);
      if (!next) setInvites((await get<{ items: InvitationDto[] }>("/api/invitations")).items.filter((i) => i.status === "pending"));
    } catch (e) {
      setError(e);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function markAll() {
    await post("/api/notifications/read", { all: true }).catch(setError);
    bump(-1000);
    setItems((cur) => cur.map((n) => ({ ...n, read: true })));
  }

  return (
    <div className="grid gap-4 fade-in max-w-3xl mx-auto">
      <section className="card hero-surface p-4 sm:p-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span className="size-11 rounded-2xl bg-primary/14 border border-primary/35 text-primary flex items-center justify-center shrink-0">
            <Bell size={21} />
          </span>
          <h1 className="text-xl font-black text-white tracking-tight">{t("notifications.title")}</h1>
        </div>
        <button className="btn-secondary btn-sm" onClick={() => void markAll()}>
          <CheckCheck size={14} /> {t("notifications.markAll")}
        </button>
      </section>

      <ErrorText error={error} />

      {invites.length > 0 && (
        <Section title={t("room.invite")} icon={<MailOpen size={15} />}>
          <ul className="grid gap-2.5">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-primary/10 border border-primary/35 px-3.5 py-3 text-sm">
                <GameBadgeIcon game={i.room.gameType as GameType} size={22} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-white">{t("notifications.kinds.game_invitation", { name: i.from.username, room: i.room.name })}</div>
                  <span className="text-xs text-muted">{t(`games.${i.room.gameType}.name`)}</span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    className="btn-primary btn-sm"
                    onClick={() =>
                      post<{ roomId: string }>(`/api/invitations/${i.id}/accept`)
                        .then((r) => navigate(`/room/${r.roomId}`))
                        .catch(setError)
                    }
                  >
                    {t("notifications.accept")}
                  </button>
                  <button className="btn-ghost btn-sm" onClick={() => post(`/api/invitations/${i.id}/reject`).then(() => load()).catch(setError)}>
                    {t("notifications.decline")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="card divide-y divide-line overflow-hidden">
        {items.length === 0 ? (
          <EmptyState icon={<Bell size={20} />}>{t("notifications.empty")}</EmptyState>
        ) : (
          items.map((n) => (
            <div key={n.id} className={`p-3.5 text-sm flex items-start gap-3 ${n.read ? "text-muted" : "bg-primary/6 text-white"}`}>
              <span className={`size-2 mt-1.5 rounded-full shrink-0 ${n.read ? "bg-line-strong" : "bg-primary"}`} />
              <span className="flex-1 leading-snug">
                {t(`notifications.kinds.${n.kind}`, { name: n.actor?.username ?? "", room: String(n.data["roomName"] ?? ""), placement: String(n.data["placement"] ?? "") })}
              </span>
              <time className="text-[11px] text-muted whitespace-nowrap tabular-nums">{new Date(n.createdAt).toLocaleString()}</time>
            </div>
          ))
        )}
      </div>

      {cursor && (
        <button className="btn-secondary mx-auto" onClick={() => void load(cursor)}>
          {t("common.more")}
        </button>
      )}
    </div>
  );
}
