import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { GAME_TYPES, isGameType, type GameType, type SeatInfo } from "@croco/shared/client";
import type { GameEngine } from "@croco/game-engine";
import { useT } from "../i18n";
import { ErrorText, Spinner } from "../components/ui";
import { GameBoard } from "../games/GameBoard";
import { GAME_ICONS } from "./Dashboard";

const PRACTICE_PLAYERS: Record<GameType, number> = {
  joker: 4,
  japanese_joker: 2,
  bura3: 2,
  bura5: 2,
  holdem: 4,
  shortdeck: 4,
  omaha: 4,
  omaha_hilo: 4,
  dominoes: 2,
  backgammon: 2,
};

/**
 * Local practice: the engine runs in this browser against bots. Clearly labelled, nothing is
 * persisted and nothing reaches the server or the leaderboards.
 */
function useLocalGame(gameType: GameType, version: number) {
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [state, setState] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const rngRef = useRef<{ int(n: number): number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [{ loadEngine }, { cryptoRng }] = await Promise.all([import("@croco/game-engine/registry"), import("@croco/game-engine/rng")]);
      const e = await loadEngine(gameType);
      if (cancelled) return;
      rngRef.current = cryptoRng();
      const config = e.configSchema.parse(gameType === "bura3" ? { targetPoints: 5 } : gameType === "joker" ? { ruleset: "nines" } : {});
      setEngine(e);
      setState(e.create(config, PRACTICE_PLAYERS[gameType], { rng: rngRef.current, now: Date.now() }));
      setError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameType, version]);

  // Poker: once the human is out of chips the practice match is over for them.
  const humanOut = Boolean(engine && state !== null && (engine.view(state, 0) as { players?: Array<{ busted?: boolean }> }).players?.[0]?.busted);

  // Bots move with a short delay so the human can follow the table.
  useEffect(() => {
    if (!engine || state === null || engine.isOver(state) || humanOut) return;
    const actor = engine.actors(state)[0];
    if (actor === undefined || actor === 0) return;
    const id = setTimeout(() => {
      const view = engine.botView ? engine.botView(state, actor) : engine.view(state, actor);
      const action = engine.bot({ view, legal: engine.legalActions(state, actor), seat: actor, difficulty: "medium", rng: rngRef.current! });
      const r = engine.apply(state, actor, action, { rng: rngRef.current!, now: Date.now() });
      if (r.ok) setState(r.state);
    }, 650);
    return () => clearTimeout(id);
  }, [engine, state, humanOut]);

  const act = useCallback(
    (action: Record<string, unknown>) => {
      if (!engine || state === null) return;
      const parsed = engine.actionSchema.safeParse(action);
      if (!parsed.success) return setError("invalid_action");
      const r = engine.apply(state, 0, parsed.data, { rng: rngRef.current!, now: Date.now() });
      if (r.ok) {
        setState(r.state);
        setError(null);
      } else setError(r.error);
    },
    [engine, state],
  );

  return { engine, state, act, error, humanOut };
}

export default function Practice() {
  const { gameType } = useParams();
  const t = useT();
  if (!isGameType(gameType)) {
    return (
      <div className="grid gap-4 fade-in">
        <h1 className="text-xl font-bold">{t("practice.title")}</h1>
        <p className="card p-3 text-sm text-text-2">{t("demo.practiceBanner")}</p>
        <p className="text-sm text-muted">{t("practice.choose")}</p>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {GAME_TYPES.map((g) => (
            <li key={g}>
              <Link to={`/practice/${g}`} className="card p-4 flex items-center gap-3 hover:border-primary">
                <span className="size-10 rounded-lg bg-surface-3 flex items-center justify-center text-lg font-bold text-gold">{GAME_ICONS[g]}</span>
                <span>
                  <span className="font-semibold block">{t(`games.${g}.name`)}</span>
                  <span className="text-xs text-muted">{t(`games.${g}.desc`)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return <PracticeGame gameType={gameType} />;
}

function PracticeGame({ gameType }: { gameType: GameType }) {
  const t = useT();
  const [version, setVersion] = useState(0);
  const { engine, state, act, error, humanOut } = useLocalGame(gameType, version);
  const players = PRACTICE_PLAYERS[gameType];
  const seats: SeatInfo[] = Array.from({ length: players }, (_, i) =>
    i === 0
      ? { seat: 0, occupant: "human", user: { id: "local", username: t("common.you"), avatar: "a01", badges: { admin: false, moderator: false } }, connected: true, botControlled: false, ready: true }
      : { seat: i, occupant: "bot", botName: `#${i}`, botDifficulty: "medium", connected: true, botControlled: false, ready: true },
  );
  return (
    <div className="grid gap-3 fade-in">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/practice" className="btn-ghost btn-sm">
          {t("common.back")}
        </Link>
        <h1 className="font-bold">
          {t("practice.title")}: {t(`games.${gameType}.name`)}
        </h1>
        <button className="btn-secondary btn-sm ml-auto" onClick={() => setVersion((v) => v + 1)}>
          {t("practice.newGame")}
        </button>
      </div>
      <p className="card p-2 text-xs text-warning">{t("demo.practiceBanner")}</p>
      {error && <ErrorText error={error} />}
      {!engine || state === null ? (
        <Spinner />
      ) : (
        <>
          {humanOut && !engine.isOver(state) && (
            <div className="card p-3 text-sm flex items-center gap-3">
              {t("practice.busted")}
              <button className="btn-primary btn-sm ml-auto" onClick={() => setVersion((v) => v + 1)}>
                {t("practice.newGame")}
              </button>
            </div>
          )}
          {engine.isOver(state) && (
            <div className="card p-3 text-sm">
              {t("game.finished")} — {t("game.placement")}: #{engine.outcome(state).placements[0]} / {players}
            </div>
          )}
          <GameBoard gameType={gameType} view={engine.view(state, 0)} deadline={null} mySeat={0} seats={seats} onAction={act} practice />
        </>
      )}
    </div>
  );
}
