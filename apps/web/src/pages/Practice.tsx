import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ArrowLeft, Dumbbell, Info, RotateCcw, Trophy } from "lucide-react";
import { isGameType, type GameType, type SeatInfo } from "@croco/shared/client";
import type { GameEngine } from "@croco/game-engine";
import { useT } from "../i18n";
import { ErrorText, Spinner } from "../components/ui";
import { GameBadgeIcon } from "../components/GameArt";
import { LobbyGrid } from "../components/lobby/LobbyGrid";
import { GameBoard } from "../games/GameBoard";

const PRACTICE_PLAYERS: Record<GameType, number> = {
  joker: 4,
  japanese_joker: 2,
  bura3: 2,
  bura5: 4,
  holdem: 4,
  shortdeck: 4,
  omaha: 4,
  omaha_hilo: 4,
  dominoes: 2,
  backgammon: 2,
};

type JokerRuleset = "standard" | "nines";

/** Bots think for a moment, and wait longer after a trick so the table can show and collect it. */
const BOT_DELAY_MS = 700;
const TRICK_PAUSE_MS = 1700;

function useLocalGame(gameType: GameType, version: number, ruleset: JokerRuleset) {
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [state, setState] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const rngRef = useRef<{ int(n: number): number } | null>(null);
  /** After a trick is taken the table shows it for a moment; bots wait until it is collected. */
  const pauseUntil = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setEngine(null);
    setState(null);
    void (async () => {
      const [{ loadEngine }, { cryptoRng }] = await Promise.all([import("@croco/game-engine/registry"), import("@croco/game-engine/rng")]);
      const e = await loadEngine(gameType);
      if (cancelled) return;
      rngRef.current = cryptoRng();
      // Shorter matches for practice; the rules themselves are the defaults.
      const config = e.configSchema.parse(
        gameType === "joker"
          ? { ruleset }
          : gameType === "bura3" || gameType === "bura5"
            ? { targetPoints: 6 }
            : gameType === "japanese_joker"
              ? { targetPoints: 7 }
              : gameType === "backgammon"
                ? { matchLength: 1 }
                : {},
      );
      setEngine(e);
      setState(e.create(config, PRACTICE_PLAYERS[gameType], { rng: rngRef.current, now: Date.now() }));
      setError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [gameType, version, ruleset]);

  const humanOut = Boolean(engine && state !== null && (engine.view(state, 0) as { players?: Array<{ busted?: boolean }> }).players?.[0]?.busted);

  useEffect(() => {
    if (!engine || state === null || engine.isOver(state) || humanOut) return;
    const actor = engine.actors(state)[0];
    if (actor === undefined || actor === 0) return;
    const id = setTimeout(
      () => {
        const view = engine.botView ? engine.botView(state, actor) : engine.view(state, actor);
        const action = engine.bot({ view, legal: engine.legalActions(state, actor), seat: actor, difficulty: "medium", rng: rngRef.current! });
        const r = engine.apply(state, actor, action, { rng: rngRef.current!, now: Date.now() });
        if (r.ok) {
          if (r.events.some((e) => e.type === "trick_won")) pauseUntil.current = Date.now() + TRICK_PAUSE_MS;
          setState(r.state);
        }
      },
      Math.max(BOT_DELAY_MS, pauseUntil.current - Date.now()),
    );
    return () => clearTimeout(id);
  }, [engine, state, humanOut]);

  const act = useCallback(
    (action: Record<string, unknown>) => {
      if (!engine || state === null) return;
      const parsed = engine.actionSchema.safeParse(action);
      if (!parsed.success) return setError("invalid_action");
      const r = engine.apply(state, 0, parsed.data, { rng: rngRef.current!, now: Date.now() });
      if (r.ok) {
        if (r.events.some((e) => e.type === "trick_won")) pauseUntil.current = Date.now() + TRICK_PAUSE_MS;
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
        <div className="flex items-center gap-3">
          <span className="size-11 rounded-2xl bg-primary/12 border border-primary/30 text-primary flex items-center justify-center shrink-0">
            <Dumbbell size={20} />
          </span>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">{t("practice.title")}</h1>
            <p className="text-sm text-muted">{t("practice.choose")}</p>
          </div>
        </div>

        <p className="rounded-xl border border-warning/30 bg-warning/8 px-3.5 py-2 text-xs sm:text-sm text-text-2 flex items-center gap-2">
          <Info size={14} className="text-warning shrink-0" />
          <span>{t("demo.practiceBanner")}</span>
        </p>

        <LobbyGrid online={false} />
      </div>
    );
  }
  return <PracticeGame key={gameType} gameType={gameType} />;
}

function PracticeGame({ gameType }: { gameType: GameType }) {
  const t = useT();
  const [version, setVersion] = useState(0);
  const [params, setParams] = useSearchParams();
  const ruleset: JokerRuleset = gameType === "joker" && params.get("ruleset") === "nines" ? "nines" : "standard";
  const { engine, state, act, error, humanOut } = useLocalGame(gameType, version, ruleset);
  const players = PRACTICE_PLAYERS[gameType];
  const seats: SeatInfo[] = Array.from({ length: players }, (_, i) =>
    i === 0
      ? { seat: 0, occupant: "human", user: { id: "local", username: t("common.you"), avatar: "a01", badges: { admin: false, moderator: false } }, connected: true, botControlled: false, ready: true }
      : { seat: i, occupant: "bot", botName: `#${i}`, botDifficulty: "medium", connected: true, botControlled: false, ready: true },
  );

  return (
    <div className="grid gap-2.5 min-w-0 fade-in">
      {/* Compact table bar: back, game, ruleset, new game; the practice notice stays visible but small */}
      <div className="practice-bar">
        <Link to="/practice" className="btn-ghost btn-sm px-2.5" aria-label={t("common.back")}>
          <ArrowLeft size={15} /> <span className="hidden sm:inline">{t("common.back")}</span>
        </Link>
        <div className="flex items-center gap-2 min-w-0">
          <GameBadgeIcon game={gameType} size={20} />
          <h1 className="font-extrabold text-sm sm:text-base text-white truncate">{t(`games.${gameType}.name`)}</h1>
        </div>
        {gameType === "joker" && (
          <div className="inline-flex rounded-xl bg-surface-3 border border-line p-0.5" role="radiogroup" aria-label={t("opt.ruleset")}>
            {(["standard", "nines"] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={ruleset === r}
                className={`h-7 px-3 rounded-[9px] text-xs font-bold transition-colors ${ruleset === r ? "bg-primary text-[#04241c]" : "text-text-2 hover:text-white"}`}
                onClick={() => setParams(r === "nines" ? { ruleset: "nines" } : {})}
              >
                <span className="hidden sm:inline">{t(`joker.rulesets.${r}`)}</span>
                <span className="sm:hidden">{r === "nines" ? t("joker.ninesShort") : t("joker.standardShort")}</span>
              </button>
            ))}
          </div>
        )}
        <p className="practice-bar-note" title={t("demo.practiceBanner")}>
          <Info size={12} className="shrink-0 text-warning" />
          <span className="truncate">{t("demo.practiceBanner")}</span>
        </p>
        <button className="btn-secondary btn-sm ml-auto" onClick={() => setVersion((v) => v + 1)} aria-label={t("practice.newGame")} title={t("practice.newGame")}>
          <RotateCcw size={13} /> <span className="hidden sm:inline">{t("practice.newGame")}</span>
        </button>
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
