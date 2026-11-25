import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { PublicUser } from "@croco/shared/client";
import { get, post } from "../lib/api";
import { useT } from "../i18n";
import { ErrorText, Spinner, UserName } from "../components/ui";

export default function Invite() {
  const { code = "" } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const [room, setRoom] = useState<{ id: string; name: string; gameType: string; host: PublicUser } | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (!/^[A-Za-z0-9_-]{22,64}$/.test(code)) {
      setError("not_found");
      return;
    }
    get<{ room: { id: string; name: string; gameType: string; host: PublicUser } }>(`/api/invite-links/${code}`)
      .then((r) => setRoom(r.room))
      .catch(setError);
  }, [code]);
  if (error) return <ErrorText error={error} />;
  if (!room) return <Spinner />;
  return (
    <div className="card p-6 max-w-md mx-auto grid gap-3 text-center">
      <h1 className="text-lg font-bold">{room.name}</h1>
      <p className="text-sm text-muted">
        {t(`games.${room.gameType}.name`)} · <UserName user={room.host} />
      </p>
      <button
        className="btn-primary mx-auto"
        onClick={() =>
          post(`/api/rooms/${room.id}/join`, { inviteCode: code })
            .then(() => navigate(`/room/${room.id}`))
            .catch(setError)
        }
      >
        {t("rooms.join")}
      </button>
    </div>
  );
}
