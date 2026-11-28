import { useCallback, useEffect, useState } from "react";
import { Ban, Check, Search, ShieldBan, UserMinus, UserPlus, Users, X } from "lucide-react";
import type { FriendDto, FriendRequestDto, PublicUser } from "@croco/shared/client";
import { api, get, post } from "../lib/api";
import { useT } from "../i18n";
import { Avatar, EmptyState, ErrorText, Section, StatusDot, UserName } from "../components/ui";

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
    <div className="grid gap-4 fade-in max-w-4xl mx-auto">
      <section className="card hero-surface p-4 sm:p-5 flex items-center gap-3.5">
        <span className="size-11 rounded-2xl bg-primary/14 border border-primary/35 text-primary flex items-center justify-center shrink-0">
          <Users size={21} />
        </span>
        <div>
          <h1 className="text-xl font-black text-white tracking-tight">{t("friends.title")}</h1>
          <p className="text-xs text-muted mt-0.5">{friends.filter((f) => f.status !== "offline").length} {t("common.online")}</p>
        </div>
      </section>

      <ErrorText error={error} />

      <Section title={t("friends.search")} icon={<Search size={15} />}>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <input className="input" value={q} minLength={3} maxLength={20} onChange={(e) => setQ(e.target.value)} placeholder={t("friends.search")} aria-label={t("friends.search")} />
          <button className="btn-primary px-4" aria-label={t("common.search")}>
            <Search size={15} />
          </button>
        </form>
        {results.length > 0 && (
          <ul className="grid sm:grid-cols-2 gap-2 mt-3">
            {results.map((u) => (
              <li key={u.id} className="flex items-center gap-2.5 rounded-xl bg-surface-2 border border-line/70 px-3 py-2 text-sm">
                <Avatar id={u.avatar} size={32} />
                <UserName user={u} className="font-semibold text-white" />
                <button
                  className="btn-secondary btn-sm ml-auto"
                  disabled={sent.has(u.id)}
                  onClick={() =>
                    post("/api/friend-requests", { toUserId: u.id })
                      .then(() => setSent((s) => new Set(s).add(u.id)))
                      .catch(setError)
                  }
                >
                  <UserPlus size={13} /> {sent.has(u.id) ? t("friends.sent") : t("friends.add")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {(requests.incoming.length > 0 || requests.outgoing.length > 0) && (
        <Section title={t("friends.requests")} icon={<UserPlus size={15} />}>
          <ul className="grid gap-2">
            {requests.incoming.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2.5 rounded-xl bg-primary/8 border border-primary/30 px-3 py-2.5 text-sm">
                <Avatar id={r.from.avatar} size={32} />
                <UserName user={r.from} className="font-semibold text-white" />
                <span className="chip bg-primary/15 text-primary">{t("friends.incoming")}</span>
                <div className="ml-auto flex gap-1.5">
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
              <li key={r.id} className="flex flex-wrap items-center gap-2.5 rounded-xl bg-surface-2 border border-line px-3 py-2.5 text-sm">
                <Avatar id={r.to.avatar} size={32} />
                <UserName user={r.to} className="font-semibold text-text-2" />
                <span className="chip bg-surface-3 text-muted">{t("friends.outgoing")}</span>
                <button className="btn-ghost btn-sm ml-auto" onClick={() => act(post(`/api/friend-requests/${r.id}/cancel`))}>
                  {t("friends.cancel")}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t("friends.title")} icon={<Users size={15} />}>
        {friends.length === 0 ? (
          <EmptyState icon={<Users size={20} />}>{t("friends.empty")}</EmptyState>
        ) : (
          <ul className="grid sm:grid-cols-2 gap-2.5">
            {friends.map((f) => (
              <li key={f.user.id} className="flex items-center gap-3 rounded-xl bg-surface-2 border border-line/80 px-3 py-2.5 text-sm">
                <Avatar id={f.user.avatar} size={34} ring={f.status === "online" ? "primary" : f.status === "in_game" ? "gold" : "none"} />
                <div className="min-w-0 flex-1">
                  <UserName user={f.user} className="font-bold text-white" />
                  <div className="flex items-center gap-1.5 text-xs text-muted mt-0.5">
                    <StatusDot status={f.status} />
                    <span className="truncate">
                      {t(`friends.status.${f.status}`)}
                      {f.gameType ? ` · ${t(`games.${f.gameType}.name`)}` : ""}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button className="btn-ghost btn-sm size-8 px-0" title={t("friends.remove")} onClick={() => act(api("DELETE", `/api/friends/${f.user.id}`))}>
                    <UserMinus size={14} />
                  </button>
                  <button className="btn-ghost btn-sm size-8 px-0 text-danger" title={t("friends.block")} onClick={() => act(post("/api/blocks", { userId: f.user.id }))}>
                    <Ban size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {blocked.length > 0 && (
        <Section title={t("friends.blocked")} icon={<ShieldBan size={15} />}>
          <ul className="grid gap-2">
            {blocked.map((u) => (
              <li key={u.id} className="flex items-center gap-2.5 rounded-xl bg-surface-2 border border-line px-3 py-2 text-sm">
                <Avatar id={u.avatar} size={28} />
                <UserName user={u} />
                <button className="btn-secondary btn-sm ml-auto" onClick={() => act(api("DELETE", `/api/blocks/${u.id}`))}>
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
