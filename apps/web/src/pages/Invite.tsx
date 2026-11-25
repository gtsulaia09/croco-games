import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { isGameType, type GameType, type PublicUser } from "@croco/shared/client";
import { get, post } from "../lib/api";
import { useT } from "../i18n";
import { Avatar, ErrorText, Spinner, UserName } from "../components/ui";
import { GAME_THEMES, GameArtwork } from "../components/GameArt";

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

  const validGame: GameType = isGameType(room.gameType) ? room.gameType : "joker";
  const theme = GAME_THEMES[validGame];

  return (
    <div className="card overflow-hidden max-w-md mx-auto mt-8 fade-in">
      <div className={`relative h-28 bg-gradient-to-br ${theme.headerBg} border-b border-line`}>
        <GameArtwork game={validGame} className="w-full h-full" />
        <span className={`chip absolute top-3 left-3 ${theme.badgeClass}`}>{t(`games.${validGame}.name`)}</span>
      </div>
      <div className="p-6 grid gap-4 text-center">
        <h1 className="text-xl font-black text-white">{room.name}</h1>
        <div className="inline-flex items-center justify-center gap-2 text-sm text-text-2 bg-surface-3 border border-line rounded-full px-3.5 py-1.5 mx-auto">
          <Avatar id={room.host.avatar} size={24} />
          <UserName user={room.host} />
        </div>
        <button
          className="btn-primary h-11 w-full"
          onClick={() =>
            post(`/api/rooms/${room.id}/join`, { inviteCode: code })
              .then(() => navigate(`/room/${room.id}`))
              .catch(setError)
          }
        >
          {t("rooms.join")}
        </button>
      </div>
    </div>
  );
}
