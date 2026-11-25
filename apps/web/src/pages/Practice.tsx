import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Dumbbell, Play, RotateCcw, Sparkles, Trophy, Users } from "lucide-react";
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
      <div className="grid gap-5 fade-in">
        <div className="rounded-2xl border border-line bg-gradient-to-r from-[#0e3226] via-surface to-surface-2 p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="size-11 rounded-xl bg-primary/15 border border-primary/35 text-primary flex items-center justify-center shrink-0">
              <Dumbbell size={22} />
            </span>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white">{t("practice.title")}</h1>
              <p className="text-sm text-muted">{t("practice.choose")}</p>
            </div>
          </div>
          <span className="chip bg-warning/15 text-warning border border-warning/35 h-7 px-3">
            <Sparkles size={12} /> {t("ui.quickPractice")}
          </span>
        </div>

        <p className="rounded-xl border border-warning/35 bg-warning/10 px-4 py-2.5 text-xs sm:text-sm text-text-2">{t("demo.practiceBanner")}</p>

        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {GAME_TYPES.map((g) => {
            const theme = GAME_THEMES[g];
            const info = GAME_CATALOG[g];
            return (
              <li key={g} className="game-card">
                <Link to={`/practice/${g}`} className="flex flex-col flex-1">
                  <div className={`relative h-24 bg-gradient-to-br ${theme.headerBg} border-b border-line/80 overflow-hidden`}>
                    <GameArtwork game={g} className="w-full h-full" />
                    <span className={`chip absolute top-2.5 left-3 ${theme.badgeClass}`}>{theme.badgeText}</span>
                    <span className="absolute bottom-2 left-3 inline-flex items-center gap-1 text-[11px] font-semibold text-text-2 bg-bg/75 border border-white/10 rounded-full px-2 py-0.5">
                      <Users size={11} className="text-muted" /> {info.minPlayers === info.maxPlayers ? info.minPlayers : `${info.minPlayers}–${info.maxPlayers}`}
                    </span>
                  </div>
                  <div className="p-4 flex flex-col gap-2 flex-1">
                    <div className="flex items-center gap-2">
                      <GameBadgeIcon game={g} size={18} />
                      <span className="font-extrabold text-white">{t(`games.${g}.name`)}</span>
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
    <div className="grid gap-3 fade-in">
      <div className="card px-3.5 py-2.5 flex flex-wrap items-center gap-2.5">
        <Link to="/practice" className="btn-ghost btn-sm px-2.5">
          <ArrowLeft size={14} /> {t("common.back")}
        </Link>
        <div className="flex items-center gap-2 min-w-0">
          <GameBadgeIcon game={gameType} size={20} />
          <h1 className="font-extrabold text-sm sm:text-base text-white truncate">
            {t("practice.title")}: {t(`games.${gameType}.name`)}
          </h1>
          <span className={`chip hidden sm:inline-flex ${GAME_THEMES[gameType].badgeClass}`}>{GAME_THEMES[gameType].badgeText}</span>
        </div>
        <button className="btn-secondary btn-sm ml-auto" onClick={() => setVersion((v) => v + 1)}>
          <RotateCcw size={13} /> {t("practice.newGame")}
        </button>
      </div>

      <p className="rounded-xl border border-warning/30 bg-warning/8 px-3.5 py-2 text-xs text-warning">{t("demo.practiceBanner")}</p>

      {error && <ErrorText error={error} />}

      {!engine || state === null ? (
        <Spinner />
      ) : (
        <>
          {humanOut && !engine.isOver(state) && (
            <div className="card p-4 border-danger/45 bg-danger/10 text-sm flex flex-wrap items-center gap-3">
              <span className="font-semibold text-white">{t("practice.busted")}</span>
              <button className="btn-primary btn-sm ml-auto" onClick={() => setVersion((v) => v + 1)}>
                <RotateCcw size={13} /> {t("practice.newGame")}
              </button>
            </div>
          )}
          {engine.isOver(state) && (
            <div className="card p-4 border-gold/50 bg-gold/10 text-sm flex flex-wrap items-center gap-3">
              <Trophy size={18} className="text-gold shrink-0" />
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
