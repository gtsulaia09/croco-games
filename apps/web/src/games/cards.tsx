import type { CSSProperties, ReactNode } from "react";
import { cardLabel } from "../components/ui";

/**
 * Realistic playing cards drawn as one small SVG per card (no images, no fonts to download):
 * double-ended corner indices, real pip layouts for 2–10, framed court cards, jester jokers,
 * and a Croco-green lattice back. Sizes are CSS variables, so one card scales everywhere.
 */

export type CardSize = "xs" | "sm" | "md" | "lg";

/** Suit outlines in a 24×24 box (same shapes as the rest of the UI). */
export const SUIT_PATH: Record<string, string> = {
  S: "M12 2C12 2 3.8 10 3.8 14.4C3.8 17.1 5.9 19 8.5 19C10 19 11.1 18.3 11.9 17.2C11.7 18.8 10.9 20.3 9.4 21.6H14.6C13.1 20.3 12.3 18.8 12.1 17.2C12.9 18.3 14 19 15.5 19C18.1 19 20.2 17.1 20.2 14.4C20.2 10 12 2 12 2Z",
  H: "M12 21.5C12 21.5 3.2 15.3 3.2 9.1C3.2 5.9 5.7 3.5 8.7 3.5C10.5 3.5 11.4 4.5 12 5.7C12.6 4.5 13.5 3.5 15.3 3.5C18.3 3.5 20.8 5.9 20.8 9.1C20.8 15.3 12 21.5 12 21.5Z",
  D: "M12 1.6L20.2 12L12 22.4L3.8 12L12 1.6Z",
  C: "M12 3.1A4.3 4.3 0 0 1 15.9 9.2A4.3 4.3 0 1 1 13.1 16C13.3 18.2 14 20 15.2 21.6H8.8C10 20 10.7 18.2 10.9 16A4.3 4.3 0 1 1 8.1 9.2A4.3 4.3 0 0 1 12 3.1Z",
};

const RED = "#c8102e";
const BLACK = "#161b24";
const GOLD = "#c9a24a";
const RANK_TEXT: Record<string, string> = { T: "10" };

const L = 33;
const C = 50;
const R = 67;
const TOP = 27;
const BOT = 113;
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

function Pip({ suit, x, y, size, flip }: { suit: string; x: number; y: number; size: number; flip?: boolean }) {
  const s = size / 24;
  const t = `translate(${x - size / 2} ${y - size / 2}) scale(${s})`;
  return <path d={SUIT_PATH[suit]} transform={flip ? `rotate(180 ${x} ${y}) ${t}` : t} />;
}

function CornerIndex({ rank, suit }: { rank: string; suit: string }) {
  const text = RANK_TEXT[rank] ?? rank;
  return (
    <g>
      <text x={13} y={29} textAnchor="middle" className="pc-rank" {...(text.length > 1 ? { textLength: 23, lengthAdjust: "spacingAndGlyphs" } : {})}>
        {text}
      </text>
      <Pip suit={suit} x={13} y={41} size={15} />
    </g>
  );
}

function CourtEmblem({ rank, color }: { rank: string; color: string }) {
  if (rank === "K") {
    return (
      <g>
        <path d="M36 45 L33.5 30 L42 37 L50 25.5 L58 37 L66.5 30 L64 45 Z" fill={color} />
        <rect x={35.5} y={45} width={29} height={4.2} rx={1} fill={GOLD} />
        <circle cx={33.5} cy={29.5} r={2.3} fill={GOLD} />
        <circle cx={50} cy={25} r={2.5} fill={GOLD} />
        <circle cx={66.5} cy={29.5} r={2.3} fill={GOLD} />
      </g>
    );
  }
  if (rank === "Q") {
    return (
      <g>
        <path d="M36.5 46 Q37 35 43.5 33.5 Q47 39 50 31 Q53 39 56.5 33.5 Q63 35 63.5 46 Z" fill={color} />
        <rect x={36} y={45.5} width={28} height={4} rx={1} fill={GOLD} />
        <circle cx={50} cy={26.5} r={3.2} fill={GOLD} />
        <path d="M50 21.6 V24 M48.8 22.8 H51.2" stroke={GOLD} strokeWidth={1.1} />
      </g>
    );
  }
  return (
    <g>
      <path d="M37 46 Q39 32.5 51 31.5 Q61 32.5 63 46 Z" fill={color} />
      <path d="M55 33 Q66 21 71.5 28 Q65 27.5 58.5 35.5 Z" fill={GOLD} />
      <rect x={36.5} y={45.5} width={27} height={4} rx={1} fill={GOLD} />
    </g>
  );
}

function CourtFace({ rank, suit, color }: { rank: string; suit: string; color: string }) {
  const half = (
    <g>
      <CourtEmblem rank={rank} color={color} />
      <Pip suit={suit} x={50} y={59} size={13} />
      <Pip suit={suit} x={27.5} y={23.5} size={7} />
      {/* Robe bands */}
      <rect x={23} y={64.6} width={54} height={1.6} fill={GOLD} />
      <rect x={23} y={66.6} width={54} height={1.6} fill="#1f4e8c" />
    </g>
  );
  return (
    <g>
      <rect x={21} y={17} width={58} height={106} rx={2.5} fill="#f6eedb" stroke={color} strokeWidth={1.4} />
      <rect x={23.2} y={19.2} width={53.6} height={101.6} rx={1.5} fill="none" stroke={GOLD} strokeWidth={0.8} />
      {half}
      <g transform="rotate(180 50 70)">{half}</g>
      <line x1={23} y1={70} x2={77} y2={70} stroke={color} strokeWidth={0.9} />
    </g>
  );
}

function JokerFace({ red }: { red: boolean }) {
  const color = red ? RED : BLACK;
  const letters = ["J", "O", "K", "E", "R"];
  const index = (
    <g>
      {letters.map((l, i) => (
        <text key={l} x={11} y={19 + i * 10.5} textAnchor="middle" className="pc-joker-index">
          {l}
        </text>
      ))}
      <path d="M11 76 l2.2 4.5 4.9.7-3.6 3.4.9 4.9-4.4-2.3-4.4 2.3.9-4.9-3.6-3.4 4.9-.7Z" fill={GOLD} />
    </g>
  );
  return (
    <g fill={color}>
      {index}
      <g transform="rotate(180 50 70)">{index}</g>
      <g>
        <path d="M31 88 Q34 64 24.5 52 Q40 57.5 44.5 69 Q47.5 48 50 40 Q52.5 48 55.5 69 Q60 57.5 75.5 52 Q66 64 69 88 Z" />
        <path d="M31 88 Q34 64 24.5 52 Q40 57.5 44.5 69 Z" fill={red ? BLACK : RED} opacity={0.9} />
        <path d="M69 88 Q66 64 75.5 52 Q60 57.5 55.5 69 Z" fill={red ? BLACK : RED} opacity={0.9} />
        <rect x={29.5} y={87} width={41} height={6.5} rx={2} fill={GOLD} />
        <circle cx={24.5} cy={51.5} r={3.6} fill={GOLD} />
        <circle cx={50} cy={39.5} r={3.6} fill={GOLD} />
        <circle cx={75.5} cy={51.5} r={3.6} fill={GOLD} />
        <circle cx={38} cy={90.25} r={1.4} fill={color} />
        <circle cx={50} cy={90.25} r={1.4} fill={color} />
        <circle cx={62} cy={90.25} r={1.4} fill={color} />
      </g>
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
        <CourtFace rank={rank} suit={suit} color={color} />
      ) : rank === "A" ? (
        <Pip suit={suit} x={50} y={70} size={suit === "S" ? 50 : 40} />
      ) : (
        (PIPS[rank] ?? []).map(([x, y, flip], i) => <Pip key={i} suit={suit} x={x} y={y} size={19} flip={flip} />)
      )}
      <CornerIndex rank={rank} suit={suit} />
      <g transform="rotate(180 50 70)">
        <CornerIndex rank={rank} suit={suit} />
      </g>
    </svg>
  );
}

export interface PlayingCardProps {
  card?: string;
  onClick?: () => void;
  selected?: boolean;
  /** false = a legal-move filter is active and this card cannot be played now. */
  playable?: boolean;
  size?: CardSize;
  back?: boolean;
  title?: string;
  animate?: "deal" | "play" | "flip" | false;
  className?: string;
  style?: CSSProperties;
}

export function PlayingCard({ card, onClick, selected, playable = true, size = "md", back, title, animate, className = "", style }: PlayingCardProps) {
  const anim = animate ? `pc-anim-${animate}` : "";
  if (back || !card) {
    return <span className={`pcard pc-back ${anim} ${className}`} data-size={size} style={style} role="img" aria-label="hidden card" />;
  }
  const common = {
    className: `pcard ${anim} ${className}`,
    "data-size": size,
    "data-selected": selected ? "true" : "false",
    "data-playable": playable ? "true" : "false",
    title: title ?? cardLabel(card),
    style,
  };
  if (onClick) {
    return (
      <button type="button" {...common} onClick={onClick} disabled={!playable} aria-pressed={selected} aria-label={cardLabel(card)}>
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

export function CardSlot({ size = "md", children }: { size?: CardSize; children?: ReactNode }) {
  return (
    <span className="pc-slot" data-size={size} aria-hidden={children ? undefined : true}>
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
 * A held hand: one row, slightly fanned, overlapping only as much as the width requires
 * (pure CSS grid — no measuring). Cards keep their order, so suits stay grouped.
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
