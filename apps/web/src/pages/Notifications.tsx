import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { InvitationDto, NotificationDto } from "@croco/shared/client";
import { get, post } from "../lib/api";
import { useSession } from "../store/session";
import { useT } from "../i18n";
import { EmptyState, ErrorText, Section } from "../components/ui";

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
    <div className="grid gap-4 fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t("notifications.title")}</h1>
        <button className="btn-ghost btn-sm" onClick={() => void markAll()}>
          {t("notifications.markAll")}
        </button>
      </div>
      <ErrorText error={error} />
      {invites.length > 0 && (
        <Section title={t("room.invite")}>
          <ul className="grid gap-2">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span>{t("notifications.kinds.game_invitation", { name: i.from.username, room: i.room.name })}</span>
                <span className="text-xs text-muted">{t(`games.${i.room.gameType}.name`)}</span>
                <div className="ml-auto flex gap-1">
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
      <div className="card divide-y divide-line">
        {items.length === 0 ? (
          <EmptyState>{t("notifications.empty")}</EmptyState>
        ) : (
          items.map((n) => (
            <div key={n.id} className={`p-3 text-sm flex gap-3 ${n.read ? "text-muted" : ""}`}>
              {!n.read && <span className="size-2 mt-1.5 rounded-full bg-primary shrink-0" />}
              <span className="flex-1">
                {t(`notifications.kinds.${n.kind}`, { name: n.actor?.username ?? "", room: String(n.data["roomName"] ?? ""), placement: String(n.data["placement"] ?? "") })}
              </span>
              <time className="text-xs text-muted whitespace-nowrap">{new Date(n.createdAt).toLocaleString()}</time>
            </div>
          ))
        )}
      </div>
      {cursor && (
        <button className="btn-ghost mx-auto" onClick={() => void load(cursor)}>
          {t("common.more")}
        </button>
      )}
    </div>
  );
}
