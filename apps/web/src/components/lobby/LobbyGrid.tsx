import type { GameLeaderDto } from "@croco/shared/client";
import { useT } from "../../i18n";
import { GameLobbyCard } from "./GameLobbyCard";
import { BuraArt, JapaneseJokerArt, JokerArt } from "./LobbyArt";

/**
 * The three games of this phase (see lib/availability.ts). `online` adds the Play buttons that
 * open the room browser; without a backend only local practice against bots is offered.
 */
export function LobbyGrid({ online, leaders = {} }: { online: boolean; leaders?: Record<string, GameLeaderDto> }) {
  const t = useT();
  return (
    <ul className="lobby-grid">
      <GameLobbyCard
        title={t("games.joker.name")}
        tag={t("games.joker.tag")}
        description={t("games.joker.desc")}
        art={<JokerArt />}
        accent="teal"
        leader={leaders["joker"]}
        modes={[
          { label: t("lobby.jokerStandard"), playTo: online ? "/games/joker" : undefined, practiceTo: "/practice/joker" },
          { label: t("lobby.jokerNines"), playTo: online ? "/games/joker" : undefined, practiceTo: "/practice/joker?ruleset=nines" },
        ]}
      />
      <GameLobbyCard
        title={t("games.japanese_joker.name")}
        tag={t("games.japanese_joker.tag")}
        description={t("games.japanese_joker.desc")}
        art={<JapaneseJokerArt />}
        accent="lime"
        leader={leaders["japanese_joker"]}
        modes={[{ label: t("lobby.jjTarget"), note: t("lobby.jjTable"), playTo: online ? "/games/japanese_joker" : undefined, practiceTo: "/practice/japanese_joker" }]}
      />
      <GameLobbyCard
        title={t("lobby.buraName")}
        tag={t("lobby.buraTag")}
        description={t("lobby.buraDesc")}
        art={<BuraArt />}
        accent="gold"
        leader={leaders["bura3"] ?? leaders["bura5"]}
        modes={[
          { label: t("lobby.bura3Mode"), note: t("games.bura3.tag"), playTo: online ? "/games/bura3" : undefined, practiceTo: "/practice/bura3" },
          { label: t("lobby.bura5Mode"), note: t("games.bura5.tag"), playTo: online ? "/games/bura5" : undefined, practiceTo: "/practice/bura5" },
        ]}
      />
    </ul>
  );
}
