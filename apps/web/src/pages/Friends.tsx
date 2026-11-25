import { useCallback, useEffect, useState } from "react";
import { Ban, Check, Search, UserMinus, UserPlus, X } from "lucide-react";
import type { FriendDto, FriendRequestDto, PublicUser } from "@croco/shared/client";
import { api, get, post } from "../lib/api";
import { useT } from "../i18n";
import { Avatar, EmptyState, ErrorText, Section, UserName } from "../components/ui";

export default function Friends() {
  const t = useT();
  const [friends, setFriends] = useState<FriendDto[]>([]);
  const [requests, setRequests] = useState<{ incoming: FriendRequestDto[]; outgoing: FriendRequestDto[] }>({ incoming: [], outgoing: [] });
  const [blocked, setBlocked] = useState<PublicUser[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PublicUser[]>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      const [f, r, b] = await Promise.all([
        get<{ items: FriendDto[] }>("/api/friends"),
        get<{ incoming: FriendRequestDto[]; outgoing: FriendRequestDto[] }>("/api/friend-requests"),
        get<{ items: PublicUser[] }>("/api/blocks"),
      ]);
      setFriends(f.items);
      setRequests(r);
      setBlocked(b.items);
    } catch (e) {
      setError(e);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const act = (p: Promise<unknown>) =>
    p
      .then(load)
      .catch(setError);

  async function search() {
    if (q.trim().length < 3) return;
    try {
      setResults((await get<{ items: PublicUser[] }>(`/api/users/search?q=${encodeURIComponent(q.trim())}`)).items);
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div className="grid gap-4 fade-in">
      <h1 className="text-xl font-bold">{t("friends.title")}</h1>
      <ErrorText error={error} />
      <Section title={t("friends.search")}>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <input className="input" value={q} minLength={3} maxLength={20} onChange={(e) => setQ(e.target.value)} placeholder={t("friends.search")} aria-label={t("friends.search")} />
          <button className="btn-primary px-3" aria-label={t("common.search")}>
            <Search size={16} />
          </button>
        </form>
        <ul className="grid gap-2 mt-3">
          {results.map((u) => (
            <li key={u.id} className="flex items-center gap-2 text-sm">
              <Avatar id={u.avatar} size={28} />
              <UserName user={u} />
              <button
                className="btn-secondary btn-sm ml-auto"
                disabled={sent.has(u.id)}
                onClick={() =>
                  post("/api/friend-requests", { toUserId: u.id })
                    .then(() => setSent((s) => new Set(s).add(u.id)))
                    .catch(setError)
                }
              >
                <UserPlus size={14} /> {sent.has(u.id) ? t("friends.sent") : t("friends.add")}
              </button>
            </li>
          ))}
        </ul>
      </Section>
      {(requests.incoming.length > 0 || requests.outgoing.length > 0) && (
        <Section title={t("friends.requests")}>
          <ul className="grid gap-2">
            {requests.incoming.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <Avatar id={r.from.avatar} size={28} />
                <UserName user={r.from} />
                <span className="text-xs text-muted">{t("friends.incoming")}</span>
                <div className="ml-auto flex gap-1">
                  <button className="btn-primary btn-sm" onClick={() => act(post(`/api/friend-requests/${r.id}/accept`))}>
                    <Check size={14} /> {t("friends.accept")}
                  </button>
                  <button className="btn-ghost btn-sm" onClick={() => act(post(`/api/friend-requests/${r.id}/reject`))}>
                    <X size={14} />
                  </button>
                </div>
              </li>
            ))}
            {requests.outgoing.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <Avatar id={r.to.avatar} size={28} />
                <UserName user={r.to} />
                <span className="text-xs text-muted">{t("friends.outgoing")}</span>
                <button className="btn-ghost btn-sm ml-auto" onClick={() => act(post(`/api/friend-requests/${r.id}/cancel`))}>
                  {t("friends.cancel")}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title={t("friends.title")}>
        {friends.length === 0 ? (
          <EmptyState>{t("friends.empty")}</EmptyState>
        ) : (
          <ul className="grid gap-2">
            {friends.map((f) => (
              <li key={f.user.id} className="flex items-center gap-2 text-sm">
                <span className={`size-2 rounded-full ${f.status === "online" ? "bg-primary" : f.status === "in_game" ? "bg-gold" : f.status === "away" ? "bg-warning" : "bg-muted/50"}`} />
                <Avatar id={f.user.avatar} size={28} />
                <UserName user={f.user} />
                <span className="text-xs text-muted">
                  {t(`friends.status.${f.status}`)}
                  {f.gameType ? ` · ${t(`games.${f.gameType}.name`)}` : ""}
                </span>
                <div className="ml-auto flex gap-1">
                  <button className="btn-ghost btn-sm" title={t("friends.remove")} onClick={() => act(api("DELETE", `/api/friends/${f.user.id}`))}>
                    <UserMinus size={14} />
                  </button>
                  <button className="btn-ghost btn-sm text-danger" title={t("friends.block")} onClick={() => act(post("/api/blocks", { userId: f.user.id }))}>
                    <Ban size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {blocked.length > 0 && (
        <Section title={t("friends.blocked")}>
          <ul className="grid gap-2">
            {blocked.map((u) => (
              <li key={u.id} className="flex items-center gap-2 text-sm">
                <UserName user={u} />
                <button className="btn-ghost btn-sm ml-auto" onClick={() => act(api("DELETE", `/api/blocks/${u.id}`))}>
                  {t("friends.unblock")}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
