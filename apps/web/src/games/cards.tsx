import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { cardLabel } from "../components/ui";
import "./cards.css";

/**
 * Playing cards drawn as one small SVG per card (no images, no web fonts): large double-ended
 * corner indices that stay readable when the hand overlaps, real pip layouts for 2–10,
 * illustrated court figures (king, queen, jack), jester jokers and an emerald card back.
 * Sizes are CSS variables, so one card scales everywhere without changing its 5:7 ratio.
 */

/**
 * Legacy sizes (xs–lg) are fixed steps used by the boards that are not part of the redesign.
 * The redesigned tables use role sizes that follow the board width:
 * mini (badges), pile (table stacks, stock), trick (cards on the felt), hand (your hand).
 */
export type CardSize = "xs" | "sm" | "md" | "lg" | "mini" | "pile" | "trick" | "hand";

/** Suit outlines in a 24×24 box (same shapes as the rest of the UI). */
export const SUIT_PATH: Record<string, string> = {
  S: "M12 2C12 2 3.8 10 3.8 14.4C3.8 17.1 5.9 19 8.5 19C10 19 11.1 18.3 11.9 17.2C11.7 18.8 10.9 20.3 9.4 21.6H14.6C13.1 20.3 12.3 18.8 12.1 17.2C12.9 18.3 14 19 15.5 19C18.1 19 20.2 17.1 20.2 14.4C20.2 10 12 2 12 2Z",
  H: "M12 21.5C12 21.5 3.2 15.3 3.2 9.1C3.2 5.9 5.7 3.5 8.7 3.5C10.5 3.5 11.4 4.5 12 5.7C12.6 4.5 13.5 3.5 15.3 3.5C18.3 3.5 20.8 5.9 20.8 9.1C20.8 15.3 12 21.5 12 21.5Z",
  D: "M12 1.6L20.2 12L12 22.4L3.8 12L12 1.6Z",
  C: "M12 3.1A4.3 4.3 0 0 1 15.9 9.2A4.3 4.3 0 1 1 13.1 16C13.3 18.2 14 20 15.2 21.6H8.8C10 20 10.7 18.2 10.9 16A4.3 4.3 0 1 1 8.1 9.2A4.3 4.3 0 0 1 12 3.1Z",
};

const RED = "#e11d48";
const BLACK = "#0f172a";
const GOLD = "#d4a74a";
const GOLD_DARK = "#8c6a22";
const NAVY = "#1e293b";
const CRIMSON = "#be123c";
const SKIN = "#f3d4b8";
const RANK_TEXT: Record<string, string> = { T: "10" };

const L = 34;
const C = 50;
const R = 66;
const TOP = 30;
const BOT = 110;
const MID = 70;
const Q1 = TOP + (BOT - TOP) / 3;
const Q2 = TOP + ((BOT - TOP) * 2) / 3;
/** Real pip positions: [x, y, upside-down]. */
const PIPS: Record<string, Array<[number, number, boolean?]>> = {
  "2": [[C, TOP], [C, BOT, true]],
  "3": [[C, TOP], [C, MID], [C, BOT, true]],
  "4": [[L, TOP], [R, TOP], [L, BOT, true], [R, BOT, true]],
  "5": [[L, TOP], [R, TOP], [C, MID], [L, BOT, true], [R, BOT, true]],
  "6": [[L, TOP], [R, TOP], [L, MID], [R, MID], [L, BOT, true], [R, BOT, true]],
  "7": [[L, TOP], [R, TOP], [C, (TOP + MID) / 2], [L, MID], [R, MID], [L, BOT, true], [R, BOT, true]],
  "8": [[L, TOP], [R, TOP], [C, (TOP + MID) / 2], [L, MID], [R, MID], [C, (MID + BOT) / 2, true], [L, BOT, true], [R, BOT, true]],
  "9": [[L, TOP], [R, TOP], [L, Q1], [R, Q1], [C, MID], [L, Q2, true], [R, Q2, true], [L, BOT, true], [R, BOT, true]],
  T: [[L, TOP], [R, TOP], [C, (TOP + Q1) / 2], [L, Q1], [R, Q1], [L, Q2, true], [R, Q2, true], [C, (Q2 + BOT) / 2, true], [L, BOT, true], [R, BOT, true]],
};

function Pip({ suit, x, y, size, flip, fill }: { suit: string; x: number; y: number; size: number; flip?: boolean; fill?: string }) {
  const s = size / 24;
  const t = `translate(${x - size / 2} ${y - size / 2}) scale(${s})`;
  return <path d={SUIT_PATH[suit]} transform={flip ? `rotate(180 ${x} ${y}) ${t}` : t} fill={fill} />;
}

/** Corner index: rank over suit, sized to stay legible in an overlapping fan. */
function CornerIndex({ rank, suit }: { rank: string; suit: string }) {
  const text = RANK_TEXT[rank] ?? rank;
  return (
    <g>
      <text x={12.5} y={25} textAnchor="middle" className="pc-rank" {...(text.length > 1 ? { textLength: 21, lengthAdjust: "spacingAndGlyphs" } : {})}>
        {text}
      </text>
      <Pip suit={suit} x={12.5} y={36.5} size={13} />
    </g>
  );
}

/** Head-dress and attribute of a court figure (upper half; mirrored for the lower half). */
function CourtDetails({ rank, robe }: { rank: string; robe: string }) {
  if (rank === "K") {
    return (
      <g>
        {/* Beard and moustache */}
        <path d="M43.2 39.5Q43.6 49.8 50 51.2Q56.4 49.8 56.8 39.5Q55 45.2 50 45.6Q45 45.2 43.2 39.5Z" fill="#9b8466" />
        <path d="M46 43.4Q50 41.4 54 43.4Q50 42.8 46 43.4Z" fill="#7d6a52" />
        {/* Crown */}
        <path d="M41.6 31.8L40.4 22.4L45 26.6L50 19.6L55 26.6L59.6 22.4L58.4 31.8Z" fill={GOLD} stroke={GOLD_DARK} strokeWidth={0.5} />
        <rect x={41.4} y={29.6} width={17.2} height={2.8} rx={0.6} fill={GOLD_DARK} />
        <circle cx={40.4} cy={22.4} r={1.4} fill={robe} />
        <circle cx={50} cy={19.6} r={1.5} fill={robe} />
        <circle cx={59.6} cy={22.4} r={1.4} fill={robe} />
        {/* Sword */}
        <path d="M33 23V50" stroke="#c3ccd6" strokeWidth={1.8} strokeLinecap="round" />
        <path d="M33 23V50" stroke="#8d98a5" strokeWidth={0.5} />
        <rect x={29.6} y={46.6} width={6.8} height={1.8} rx={0.6} fill={GOLD} />
        <path d="M33 48.4V53.6" stroke="#5c3a1d" strokeWidth={1.8} strokeLinecap="round" />
      </g>
    );
  }
  if (rank === "Q") {
    return (
      <g>
        {/* Hair */}
        <path d="M42.4 39Q41.4 28.2 50 28.2Q58.6 28.2 57.6 39Q58.6 47.2 55.6 50.4L55 41Q54.2 32.4 50 32.4Q45.8 32.4 45 41L44.4 50.4Q41.4 47.2 42.4 39Z" fill="#6e3f22" />
        {/* Tiara */}
        <path d="M43.4 30.6Q50 23.6 56.6 30.6L55.2 32Q50 27.4 44.8 32Z" fill={GOLD} stroke={GOLD_DARK} strokeWidth={0.4} />
        <circle cx={50} cy={26.4} r={1.7} fill={robe} stroke={GOLD} strokeWidth={0.6} />
        {/* Rose */}
        <path d="M33.5 53V37" stroke="#2f7d4f" strokeWidth={1.1} />
        <path d="M33.5 46Q29.5 44 30 41.4Q33 42.6 33.5 46Z" fill="#2f7d4f" />
        <circle cx={33.5} cy={35} r={3.2} fill={robe} />
        <circle cx={33.5} cy={35} r={1.5} fill={GOLD} />
      </g>
    );
  }
  return (
    <g>
      {/* Hair */}
      <path d="M43 37.4Q42.4 29.6 50 29.6Q57.6 29.6 57 37.4Q55 33.2 50 33.2Q45 33.2 43 37.4Z" fill="#8a5a2b" />
      {/* Cap with feather */}
      <path d="M41 31.6Q41.8 23.2 50 23.2Q58.2 23.2 59 31.6Q50 28.8 41 31.6Z" fill={robe} />
      <path d="M41 31.6Q50 28.8 59 31.6" stroke={GOLD} strokeWidth={1.1} fill="none" />
      <path d="M57 25.4Q66 14.6 71.4 19.6Q64.4 20.8 59.6 28.2Z" fill={GOLD} />
      {/* Halberd */}
      <path d="M33 21V53" stroke="#7a4e25" strokeWidth={1.4} strokeLinecap="round" />
      <path d="M33 23.4L28 25.6V31L33 28.8Z" fill="#c3ccd6" stroke="#8d98a5" strokeWidth={0.4} />
      <path d="M33 19.4L34.4 23H31.6Z" fill="#c3ccd6" />
    </g>
  );
}

function CourtHalf({ rank, suit, robe, trim }: { rank: string; suit: string; robe: string; trim: string }) {
  return (
    <g>
      {/* Robe with gold neckline and a centre band carrying the suit */}
      <path d="M22.6 70V61Q23 53.4 33.2 51.4L44 49.4L50 57L56 49.4L66.8 51.4Q77 53.4 77.4 61V70Z" fill={robe} />
      <path d="M23.6 62Q24.6 55.2 33.4 53.2" stroke="rgba(255,255,255,0.18)" strokeWidth={1} fill="none" />
      <rect x={45.6} y={57} width={8.8} height={13} fill={trim} />
      <path d="M45.6 57V70M54.4 57V70" stroke={GOLD} strokeWidth={0.8} />
      <path d="M44 49.4L50 57L56 49.4" stroke={GOLD} strokeWidth={1.8} fill="none" strokeLinejoin="round" />
      <circle cx={50} cy={64} r={3.6} fill="#fffaf0" />
      <Pip suit={suit} x={50} y={64} size={5.4} fill={suit === "H" || suit === "D" ? RED : BLACK} />
      <circle cx={30} cy={60} r={0.9} fill={GOLD} />
      <circle cx={70} cy={60} r={0.9} fill={GOLD} />
      <circle cx={36} cy={64} r={0.9} fill={GOLD} />
      <circle cx={64} cy={64} r={0.9} fill={GOLD} />
      {/* Neck and face */}
      <rect x={46.6} y={44.4} width={6.8} height={6} fill={SKIN} />
      <ellipse cx={50} cy={38.6} rx={7} ry={8} fill={SKIN} stroke="rgba(60,30,10,0.25)" strokeWidth={0.4} />
      <circle cx={47.3} cy={37.6} r={0.8} fill="#2b2b2b" />
      <circle cx={52.7} cy={37.6} r={0.8} fill="#2b2b2b" />
      <path d="M48.4 42.4Q50 43.5 51.6 42.4" stroke="#a2463c" strokeWidth={0.7} fill="none" strokeLinecap="round" />
      <CourtDetails rank={rank} robe={trim} />
      {/* Suit mark in the frame corner */}
      <Pip suit={suit} x={71.5} y={24} size={8.5} />
    </g>
  );
}

function CourtFace({ rank, suit }: { rank: string; suit: string }) {
  const red = suit === "H" || suit === "D";
  const color = red ? RED : BLACK;
  const robe = red ? CRIMSON : NAVY;
  const trim = red ? NAVY : CRIMSON;
  return (
    <g>
      <rect x={19.5} y={15.5} width={61} height={109} rx={3} fill={red ? "#fdf3ee" : "#f0f3f8"} stroke={color} strokeWidth={1.1} />
      <CourtHalf rank={rank} suit={suit} robe={robe} trim={trim} />
      <g transform="rotate(180 50 70)">
        <CourtHalf rank={rank} suit={suit} robe={robe} trim={trim} />
      </g>
      <rect x={21.6} y={17.6} width={56.8} height={104.8} rx={2} fill="none" stroke={GOLD} strokeWidth={0.8} />
      <path d="M21.6 70H78.4" stroke={GOLD} strokeWidth={0.9} />
    </g>
  );
}

function JokerFace({ red }: { red: boolean }) {
  const main = red ? RED : "#1b2333";
  const alt = red ? NAVY : CRIMSON;
  const index = (
    <g fill={main}>
      {["J", "O", "K", "E", "R"].map((l, i) => (
        <text key={l} x={11} y={18.5 + i * 10.2} textAnchor="middle" className="pc-joker-index">
          {l}
        </text>
      ))}
      <path d="M11 72.5l1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6Z" fill={GOLD} />
    </g>
  );
  return (
    <g>
      {index}
      <g transform="rotate(180 50 70)">{index}</g>
      {/* Jester's hat: three tails with bells */}
      <path d="M31 63Q33 42 21 31Q37.5 33.5 44 51Q47 31 50 21.5Q53 31 56 51Q62.5 33.5 79 31Q67 42 69 63Z" fill={main} />
      <path d="M31 63Q33 42 21 31Q37.5 33.5 44 51Z" fill={alt} />
      <path d="M69 63Q67 42 79 31Q62.5 33.5 56 51Z" fill={alt} />
      <path d="M44 51Q47 31 50 21.5Q53 31 56 51" stroke={GOLD} strokeWidth={0.9} fill="none" />
      <circle cx={21} cy={31} r={3.4} fill={GOLD} stroke={GOLD_DARK} strokeWidth={0.5} />
      <circle cx={50} cy={21.5} r={3.4} fill={GOLD} stroke={GOLD_DARK} strokeWidth={0.5} />
      <circle cx={79} cy={31} r={3.4} fill={GOLD} stroke={GOLD_DARK} strokeWidth={0.5} />
      <rect x={29} y={60.5} width={42} height={6.4} rx={2.4} fill={GOLD} stroke={GOLD_DARK} strokeWidth={0.5} />
      <circle cx={37} cy={63.7} r={1.3} fill={main} />
      <circle cx={50} cy={63.7} r={1.3} fill={main} />
      <circle cx={63} cy={63.7} r={1.3} fill={main} />
      {/* Face */}
      <ellipse cx={50} cy={79} rx={12.5} ry={13} fill={SKIN} stroke="rgba(60,30,10,0.25)" strokeWidth={0.5} />
      <path d="M43.5 76.5Q45.5 74.5 47.5 76.5M52.5 76.5Q54.5 74.5 56.5 76.5" stroke="#2b2b2b" strokeWidth={1} fill="none" strokeLinecap="round" />
      <circle cx={42.6} cy={82} r={2.2} fill={RED} opacity={0.35} />
      <circle cx={57.4} cy={82} r={2.2} fill={RED} opacity={0.35} />
      <path d="M44.5 84Q50 89.5 55.5 84" stroke="#a2463c" strokeWidth={1.1} fill="none" strokeLinecap="round" />
      {/* Ruff collar and tunic */}
      <path d="M29 93L34 100L39 93L44 100L50 93L56 100L61 93L66 100L71 93V103H29Z" fill="#fffaf0" stroke={main} strokeWidth={0.7} strokeLinejoin="round" />
      <path d="M31 103H69L72.5 123H27.5Z" fill={main} />
      <path d="M50 103L57 113L50 123L43 113Z" fill={GOLD} />
      <path d="M31 103L37 113L31 123ZM69 103L63 113L69 123Z" fill={alt} />
    </g>
  );
}

function CardFace({ card }: { card: string }) {
  if (card === "X1" || card === "X2") {
    return (
      <svg viewBox="0 0 100 140" className="pc-face" aria-hidden="true">
        <JokerFace red={card === "X1"} />
      </svg>
    );
  }
  const rank = card[0]!;
  const suit = card[1]!;
  const color = suit === "H" || suit === "D" ? RED : BLACK;
  const court = rank === "J" || rank === "Q" || rank === "K";
  return (
    <svg viewBox="0 0 100 140" className="pc-face" aria-hidden="true" fill={color}>
      {court ? (
        <CourtFace rank={rank} suit={suit} />
      ) : rank === "A" ? (
        <Pip suit={suit} x={50} y={70} size={suit === "S" ? 52 : 42} />
      ) : (
        (PIPS[rank] ?? []).map(([x, y, flip], i) => <Pip key={i} suit={suit} x={x} y={y} size={20} flip={flip} />)
      )}
      <CornerIndex rank={rank} suit={suit} />
      <g transform="rotate(180 50 70)">
        <CornerIndex rank={rank} suit={suit} />
      </g>
    </svg>
  );
}

/** Emblem in the middle of the card back. */
function BackEmblem() {
  return (
    <svg viewBox="0 0 100 140" className="pc-face" aria-hidden="true">
      <g transform="translate(50 70)">
        <path d="M0-22L16 0L0 22L-16 0Z" fill="none" stroke="#f4c566" strokeWidth={1.3} strokeOpacity={0.85} />
        <path d="M0-15.5L11 0L0 15.5L-11 0Z" fill="#072b20" stroke="#f4c566" strokeWidth={0.85} />
        <path d="M0-8.5C0-8.5-5.5-3-5.5 0.6C-5.5 2.6-4 3.8-2.4 3.8C-1.4 3.8-0.6 3.4 0 2.6C0.6 3.4 1.4 3.8 2.4 3.8C4 3.8 5.5 2.6 5.5 0.6C5.5-3 0-8.5 0-8.5ZM-1.8 7.8H1.8L0.6 3.6H-0.6Z" fill="#f4c566" />
      </g>
    </svg>
  );
}

export interface PlayingCardProps {
  card?: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  selected?: boolean;
  /** false = a legal-move filter is active and this card cannot be played now. */
  playable?: boolean;
  size?: CardSize;
  back?: boolean;
  title?: string;
  animate?: "deal" | "play" | "flip" | false;
  className?: string;
  style?: CSSProperties;
  /** Extra state hooks for styling (e.g. "winner", "latest"). */
  highlight?: "winner" | "latest" | false;
  /**
   * Always render a button (disabled while it cannot be clicked). Cards in the hand use this so
   * the element never switches between <span> and <button> when the turn changes: a switch
   * remounts the card and replays its deal animation.
   */
  asButton?: boolean;
}

export function PlayingCard({ card, onClick, selected, playable = true, size = "md", back, title, animate, className = "", style, highlight, asButton }: PlayingCardProps) {
  const anim = animate ? `pc-anim-${animate}` : "";
  if (back || !card) {
    return (
      <span className={`pcard pc-back ${anim} ${className}`} data-size={size} style={style} role="img" aria-label="hidden card">
        <BackEmblem />
      </span>
    );
  }
  const common = {
    className: `pcard ${anim} ${className}`,
    "data-size": size,
    "data-selected": selected ? "true" : "false",
    "data-playable": playable ? "true" : "false",
    "data-highlight": highlight || undefined,
    "data-card": card,
    title: title ?? cardLabel(card),
    style,
  };
  if (onClick || asButton) {
    return (
      <button type="button" {...common} onClick={onClick} disabled={!onClick || !playable} aria-pressed={selected} aria-label={cardLabel(card)}>
        <CardFace card={card} />
      </button>
    );
  }
  return (
    <span {...common} role="img" aria-label={cardLabel(card)}>
      <CardFace card={card} />
    </span>
  );
}

export function CardSlot({ size = "md", children, label }: { size?: CardSize; children?: ReactNode; label?: string }) {
  return (
    <span className="pc-slot" data-size={size} aria-hidden={children || label ? undefined : true} aria-label={label}>
      {children}
    </span>
  );
}

export interface HandCard {
  card: string;
  playable?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

/**
 * Legacy held hand used by the boards outside the redesign (poker): one row, slightly fanned,
 * overlapping only as much as the width requires (pure CSS grid — no measuring).
 */
export function CardHand({
  cards,
  size = "md",
  spread = "tight",
  label,
  dealKey,
}: {
  cards: HandCard[];
  size?: CardSize;
  /** tight: overlapping fan (many cards); loose: cards side by side (Bura, poker). */
  spread?: "tight" | "loose";
  label: string;
  /** Changes when a new hand is dealt, replaying the deal animation. */
  dealKey?: string | number;
}) {
  const n = cards.length;
  const mid = (n - 1) / 2;
  const fan = spread === "tight" && n > 3;
  return (
    <div
      key={dealKey}
      className="hand"
      data-size={size}
      data-spread={spread}
      role="group"
      aria-label={label}
      style={{ gridTemplateColumns: n > 1 ? `repeat(${n - 1}, minmax(var(--hand-min), var(--hand-step))) max-content` : "max-content" }}
    >
      {cards.map((c, i) => {
        const off = i - mid;
        const vars = {
          "--fan-r": fan ? `${(off * Math.min(2, 14 / n)).toFixed(2)}deg` : "0deg",
          "--fan-y": fan ? `${(off * off * Math.min(1.1, 9 / (n * n / 4 + 1))).toFixed(2)}px` : "0px",
          "--deal-i": i,
        } as CSSProperties;
        return (
          <PlayingCard
            key={c.card}
            card={c.card}
            size={size}
            playable={c.playable ?? true}
            selected={c.selected}
            onClick={c.onClick}
            animate="deal"
            style={vars}
          />
        );
      })}
    </div>
  );
}
