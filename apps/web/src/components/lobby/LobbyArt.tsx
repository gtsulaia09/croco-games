import type { CSSProperties } from "react";
import { PlayingCard } from "../../games/cards";

/**
 * Lobby illustrations: the game's real cards (the same SVG cards as at the table) laid on an
 * emerald felt under a soft spotlight. No raster images, sharp at every DPI.
 */

type Placed = { card?: string; back?: boolean; x: number; y: number; r: number; z?: number };

function Scene({ cards, cw, className = "" }: { cards: Placed[]; cw: number; className?: string }) {
  return (
    <div className={`lobby-art ${className}`} aria-hidden="true">
      <div className="lobby-art-felt" />
      {cards.map((c, i) => (
        <span
          key={i}
          className="lobby-art-card"
          style={{ left: `${c.x}%`, top: `${c.y}%`, rotate: `${c.r}deg`, zIndex: c.z ?? i, "--cw": `${cw}px` } as CSSProperties}
        >
          <PlayingCard card={c.card} back={c.back} size="md" style={{ "--cw": `${cw}px` } as CSSProperties} />
        </span>
      ))}
    </div>
  );
}

export function JokerArt({ className, cw = 74 }: { className?: string; cw?: number }) {
  return (
    <Scene
      className={className}
      cw={cw}
      cards={[
        { card: "AS", x: 34, y: 54, r: -18 },
        { card: "KH", x: 44, y: 49, r: -6 },
        { card: "X1", x: 55, y: 47, r: 6, z: 5 },
        { card: "QD", x: 66, y: 52, r: 18 },
      ]}
    />
  );
}

export function JapaneseJokerArt({ className, cw = 62 }: { className?: string; cw?: number }) {
  return (
    <Scene
      className={className}
      cw={cw}
      cards={[
        { back: true, x: 27, y: 50, r: -4 },
        { card: "TS", x: 29.5, y: 45, r: 2 },
        { back: true, x: 50, y: 50, r: 3 },
        { card: "X2", x: 52.5, y: 45, r: -3, z: 4 },
        { back: true, x: 73, y: 50, r: -2 },
        { card: "AH", x: 75.5, y: 45, r: 4 },
      ]}
    />
  );
}

export function BuraArt({ className, cw = 70 }: { className?: string; cw?: number }) {
  return (
    <Scene
      className={className}
      cw={cw}
      cards={[
        { card: "KC", x: 30, y: 50, r: 90, z: 0 },
        { back: true, x: 27, y: 48, r: -3 },
        { back: true, x: 28, y: 47, r: -1 },
        { card: "AH", x: 57, y: 52, r: -12 },
        { card: "TH", x: 67, y: 49, r: 0 },
        { card: "KH", x: 77, y: 52, r: 12 },
      ]}
    />
  );
}

export function HeroArt({ className }: { className?: string }) {
  return (
    <Scene
      className={className}
      cw={86}
      cards={[
        { back: true, x: 22, y: 56, r: -24 },
        { card: "AS", x: 35, y: 50, r: -14 },
        { card: "X1", x: 50, y: 46, r: -2, z: 6 },
        { card: "KH", x: 64, y: 50, r: 11 },
        { card: "TD", x: 77, y: 57, r: 23 },
      ]}
    />
  );
}
