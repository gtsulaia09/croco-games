import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Dumbbell, Info, Play, RotateCcw, Trophy, Users } from "lucide-react";
import { GAME_CATALOG, GAME_TYPES, isGameType, type GameType, type SeatInfo } from "@croco/shared/client";
import type { GameEngine } from "@croco/game-engine";
import { useT } from "../i18n";
import { ErrorText, Spinner } from "../components/ui";
import { GAME_THEMES, GameArtwork, GameBadgeIcon } from "../components/GameArt";
import { GameBoard } from "../games/GameBoard";

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

function useLocalGame(gameType: GameType, version: number) {
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [state, setState] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const rngRef = useRef<{ int(n: number): number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEngine(null);
    setState(null);
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

  const humanOut = Boolean(engine && state !== null && (engine.view(state, 0) as { players?: Array<{ busted?: boolean }> }).players?.[0]?.busted);

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="size-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Dumbbell size={18} />
            </span>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-white">{t("practice.title")}</h1>
              <p className="text-xs sm:text-sm text-muted">{t("practice.choose")}</p>
            </div>
          </div>
        </div>

        <p className="rounded-xl border border-warning/30 bg-warning/8 px-3.5 py-2 text-xs sm:text-sm text-text-2 flex items-center gap-2">
          <Info size={14} className="text-warning shrink-0" />
          <span>{t("demo.practiceBanner")}</span>
        </p>

        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {GAME_TYPES.map((g) => {
            const theme = GAME_THEMES[g];
            const info = GAME_CATALOG[g];
            const playerLabel =
              info.minPlayers === info.maxPlayers
                ? t("ui.playersExact", { n: info.minPlayers })
                : t("ui.playersRange", { min: info.minPlayers, max: info.maxPlayers });
            return (
              <li key={g} className="game-card">
                <Link to={`/practice/${g}`} className="flex flex-col flex-1">
                  <div className={`relative h-24 bg-gradient-to-br ${theme.headerBg} border-b border-line/60 overflow-hidden`}>
                    <GameArtwork game={g} className="w-full h-full" />
                    <span className={`chip absolute top-2.5 left-2.5 ${theme.badgeClass}`}>{t(`games.${g}.tag`)}</span>
                    <span className="absolute bottom-2 left-2.5 inline-flex items-center gap-1 text-[11px] font-medium text-text-2 bg-bg/80 rounded-md px-2 py-0.5">
                      <Users size={11} className="text-muted" /> {playerLabel}
                    </span>
                  </div>
                  <div className="p-3.5 flex flex-col gap-2 flex-1">
                    <div className="flex items-center gap-2">
                      <GameBadgeIcon game={g} size={17} />
                      <span className="font-bold text-[15px] text-white">{t(`games.${g}.name`)}</span>
                    </div>
                    <span className="text-xs text-muted leading-relaxed">{t(`games.${g}.desc`)}</span>
                    <span className="btn-primary btn-sm mt-auto w-full">
                      <Play size={13} className="fill-current" /> {t("practice.start")}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
  return <PracticeGame key={gameType} gameType={gameType} />;
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
    <div className="grid gap-2 min-w-0 fade-in">
      {/* Sleek Unified Neo-Arena Top Bar (single practiceBanner node, wraps cleanly on 360px mobile) */}
      <div className="rounded-2xl bg-surface/90 border border-line/80 px-3 py-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
        <Link to="/practice" className="btn-ghost btn-sm px-2.5">
          <ArrowLeft size={14} /> {t("common.back")}
        </Link>
        <div className="flex items-center gap-2 min-w-0">
          <GameBadgeIcon game={gameType} size={20} />
          <h1 className="font-extrabold text-sm sm:text-base text-white truncate">{t(`games.${gameType}.name`)}</h1>
          <span className={`chip hidden md:inline-flex ${GAME_THEMES[gameType].badgeClass}`}>{t(`games.${gameType}.tag`)}</span>
        </div>
        <button className="btn-secondary btn-sm ml-auto xl:order-last" onClick={() => setVersion((v) => v + 1)}>
          <RotateCcw size={13} /> {t("practice.newGame")}
        </button>
        <p className="w-full xl:w-auto xl:max-w-md xl:truncate text-[11px] text-muted leading-snug break-words">{t("demo.practiceBanner")}</p>
      </div>

      {error && <ErrorText error={error} />}

      {!engine || state === null ? (
        <Spinner />
      ) : (
        <>
          {humanOut && !engine.isOver(state) && (
            <div className="card p-3 border-danger/45 bg-danger/10 text-sm flex flex-wrap items-center gap-3">
              <span className="font-semibold text-white">{t("practice.busted")}</span>
              <button className="btn-primary btn-sm ml-auto" onClick={() => setVersion((v) => v + 1)}>
                <RotateCcw size={13} /> {t("practice.newGame")}
              </button>
            </div>
          )}
          {engine.isOver(state) && (
            <div className="card p-3 border-gold/50 bg-gold/10 text-sm flex flex-wrap items-center gap-3">
              <Trophy size={16} className="text-gold shrink-0" />
              <span className="font-bold text-white">
                {t("game.finished")} — {t("game.placement")}: #{engine.outcome(state).placements[0]} / {players}
              </span>
              <button className="btn-gold btn-sm ml-auto" onClick={() => setVersion((v) => v + 1)}>
                <RotateCcw size={13} /> {t("practice.newGame")}
              </button>
            </div>
          )}
          <GameBoard gameType={gameType} view={engine.view(state, 0)} deadline={null} mySeat={0} seats={seats} onAction={act} practice />
        </>
      )}
    </div>
  );
}
