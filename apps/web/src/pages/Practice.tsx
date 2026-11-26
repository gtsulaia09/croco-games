import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ArrowLeft, Dumbbell, Info, RotateCcw, ScrollText, Trophy } from "lucide-react";
import { botChatDelay, isGameType, pickBotLine, type ChatMessage, type GameType, type SeatInfo } from "@croco/shared/client";
import type { GameEngine } from "@croco/game-engine";
import { useT } from "../i18n";
import { ErrorText, Spinner } from "../components/ui";
import { GameBadgeIcon } from "../components/GameArt";
import { LobbyGrid } from "../components/lobby/LobbyGrid";
import { GameBoard } from "../games/GameBoard";
import { ChatPanel } from "../components/ChatPanel";
import { ChatFab, ChatWindow, GameChatContext } from "../games/ui/gameChat";
import { useUnread } from "../hooks/useUnread";
import { JokerSetup, jokerRulesFromParams, jokerRulesToParams, type JokerTableRules } from "../games/JokerSetup";

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

/** Bots think for a moment, and wait longer after a trick so the table can show and collect it. */
const BOT_DELAY_MS = 700;
const TRICK_PAUSE_MS = 1700;

function useLocalGame(gameType: GameType, version: number, jokerRules: JokerTableRules | null) {
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [state, setState] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const rngRef = useRef<{ int(n: number): number } | null>(null);
  /** After a trick is taken the table shows it for a moment; bots wait until it is collected. */
  const pauseUntil = useRef(0);

  // A stable key, so the game restarts only when a rule really changes.
  const rulesKey = jokerRules ? `${jokerRules.ruleset}|${jokerRules.setBonus}|${jokerRules.hist}|${jokerRules.nineTrump}` : "";

  useEffect(() => {
    let cancelled = false;
    setEngine(null);
    setState(null);
    // Joker waits on the setup screen until the player has chosen the table rules.
    if (gameType === "joker" && !rulesKey) return;
    const [ruleset, setBonus, hist, nineTrump] = rulesKey.split("|");
    void (async () => {
      const [{ loadEngine }, { cryptoRng }] = await Promise.all([import("@croco/game-engine/registry"), import("@croco/game-engine/rng")]);
      const e = await loadEngine(gameType);
      if (cancelled) return;
      rngRef.current = cryptoRng();
      // Shorter matches for practice; the rules themselves are the defaults.
      const config = e.configSchema.parse(
        gameType === "joker"
          ? { ruleset, setBonus, hist, nineTrump }
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
  }, [gameType, version, rulesKey]);

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

const randInt = (n: number) => Math.floor(Math.random() * n);
let localMessageCounter = 0;
const localId = () => `m_local${Date.now().toString(36)}${(localMessageCounter++).toString(36)}`;

/**
 * Practice table talk: a local chat (nothing leaves the browser). The bots post a quote or a joke
 * on the default timer (one line every 5–10 minutes), the player can write, and now and then a
 * bot answers.
 */
function usePracticeChat(players: number, running: boolean, gameKey: number) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const botSay = useCallback(
    (seat?: number) => {
      const bot = seat ?? 1 + randInt(players - 1);
      const line: ChatMessage = { id: localId(), ts: Date.now(), kind: "bot", bot: { seat: bot, name: `#${bot}` }, text: "", key: pickBotLine(randInt) };
      setMessages((m) => [...m, line].slice(-200));
    },
    [players],
  );

  // A new game starts with a clean chat.
  useEffect(() => setMessages([]), [gameKey]);

  // Default timer for bot lines while a game is running.
  useEffect(() => {
    if (!running || players < 2) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        botSay();
        schedule();
      }, botChatDelay(randInt));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [running, players, botSay, gameKey]);

  const send = useCallback(
    (text: string, you: ChatMessage["user"]) => {
      const mine: ChatMessage = { id: localId(), ts: Date.now(), kind: "user", user: you, text };
      setMessages((m) => [...m, mine].slice(-200));
      // Now and then (about one message in three) a bot answers after a moment.
      if (players > 1 && Math.random() < 0.35) setTimeout(() => botSay(), 2500 + randInt(2500));
    },
    [players, botSay],
  );

  return { messages, send };
}

function PracticeGame({ gameType }: { gameType: GameType }) {
  const t = useT();
  const [version, setVersion] = useState(0);
  const [params, setParams] = useSearchParams();
  const isJoker = gameType === "joker";
  const [jokerRules, setJokerRules] = useState(() => jokerRulesFromParams(params));
  // Keep the chosen rules in the address, so a reload or a shared link opens the same table.
  useEffect(() => {
    if (isJoker) setParams(jokerRulesToParams(jokerRules), { replace: true });
  }, [isJoker, jokerRules, setParams]);
  /** Joker practice opens on the table-rules screen; "New game" returns to it. */
  const [started, setStarted] = useState(!isJoker);
  const { engine, state, act, error, humanOut } = useLocalGame(gameType, version, isJoker && started ? jokerRules : null);
  const newGame = () => (isJoker ? setStarted(false) : setVersion((v) => v + 1));
  const startJoker = () => {
    setVersion((v) => v + 1);
    setStarted(true);
  };
  const players = PRACTICE_PLAYERS[gameType];
  const running = Boolean(engine && state !== null && !engine.isOver(state));
  const chat = usePracticeChat(players, running, version);
  const [chatOpen, setChatOpen] = useState(false);
  const unread = useUnread(chat.messages, "local", chatOpen);
  const toggleChat = useCallback(() => setChatOpen((v) => !v), []);
  const closeChat = useCallback(() => setChatOpen(false), []);
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
        {isJoker && started && (
          <button type="button" className="practice-rules" onClick={() => setStarted(false)} title={t("joker.setupTitle")}>
            <ScrollText size={13} className="shrink-0 text-gold" />
            <span className="truncate">
              {jokerRules.ruleset === "nines" ? t("joker.ninesShort") : t("joker.standardShort")} · {t(`opt.values.${jokerRules.setBonus}`)} · {t("opt.hist")}{" "}
              {t(`opt.values.${jokerRules.hist}`)}
            </span>
          </button>
        )}
        <p className="practice-bar-note" title={t("demo.practiceBanner")}>
          <Info size={12} className="shrink-0 text-warning" />
          <span className="truncate">{t("demo.practiceBanner")}</span>
        </p>
        <button className="btn-secondary btn-sm ml-auto" onClick={newGame} aria-label={t("practice.newGame")} title={t("practice.newGame")}>
          <RotateCcw size={13} /> <span className="hidden sm:inline">{t("practice.newGame")}</span>
        </button>
      </div>

      {error && <ErrorText error={error} />}

      {isJoker && !started ? (
        <JokerSetup rules={jokerRules} onChange={(patch) => setJokerRules((r) => ({ ...r, ...patch }))} onStart={startJoker} />
      ) : !engine || state === null ? (
        <Spinner />
      ) : (
        <>
          {humanOut && !engine.isOver(state) && (
            <div className="card p-3 border-danger/45 bg-danger/10 text-sm flex flex-wrap items-center gap-3">
              <span className="font-semibold text-white">{t("practice.busted")}</span>
              <button className="btn-primary btn-sm ml-auto" onClick={newGame}>
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
              <button className="btn-gold btn-sm ml-auto" onClick={newGame}>
                <RotateCcw size={13} /> {t("practice.newGame")}
              </button>
            </div>
          )}
          <GameChatContext.Provider value={{ open: chatOpen, unread, toggle: toggleChat }}>
            <GameBoard gameType={gameType} view={engine.view(state, 0)} deadline={null} mySeat={0} seats={seats} onAction={act} practice />
            <ChatFab />
            <ChatWindow open={chatOpen} onClose={closeChat}>
              <ChatPanel
                messages={chat.messages}
                title={t("room.tableChat")}
                enabled
                myUserId="local"
                canReport={false}
                onClose={closeChat}
                onSend={(text) => chat.send(text, seats[0]!.user)}
              />
            </ChatWindow>
          </GameChatContext.Provider>
        </>
      )}
    </div>
  );
}
