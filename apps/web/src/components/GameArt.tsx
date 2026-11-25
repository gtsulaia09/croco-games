import type { GameType } from "@croco/shared/client";

/**
 * Bespoke, ultra-lightweight SVG visual identity for each of the 10 Croco Games.
 * Zero external raster assets, razor-sharp at every DPI, instant paint on low-end PCs.
 */

export interface GameVisualTheme {
  accentClass: string;
  badgeText: string;
  badgeClass: string;
  headerBg: string;
  category: "cards" | "poker" | "board";
}

export const GAME_THEMES: Record<GameType, GameVisualTheme> = {
  joker: {
    accentClass: "text-primary",
    badgeText: "4P · Trick",
    badgeClass: "bg-primary/15 text-primary border border-primary/30",
    headerBg: "from-[#0e4230] via-[#0b2b24] to-surface",
    category: "cards",
  },
  japanese_joker: {
    accentClass: "text-accent",
    badgeText: "2P · Duel",
    badgeClass: "bg-accent/15 text-accent border border-accent/30",
    headerBg: "from-[#0e3f4a] via-[#0a2730] to-surface",
    category: "cards",
  },
  bura3: {
    accentClass: "text-gold",
    badgeText: "31 pts · 3C",
    badgeClass: "bg-gold/15 text-gold border border-gold/30",
    headerBg: "from-[#352c13] via-[#1b2217] to-surface",
    category: "cards",
  },
  bura5: {
    accentClass: "text-[#5eead4]",
    badgeText: "5 Cards",
    badgeClass: "bg-[#14b8a6]/15 text-[#5eead4] border border-[#14b8a6]/30",
    headerBg: "from-[#123d38] via-[#0b2526] to-surface",
    category: "cards",
  },
  holdem: {
    accentClass: "text-primary",
    badgeText: "No-Limit",
    badgeClass: "bg-primary/15 text-primary border border-primary/30",
    headerBg: "from-[#0d422d] via-[#09261d] to-surface",
    category: "poker",
  },
  shortdeck: {
    accentClass: "text-[#fb7185]",
    badgeText: "6+ · 36C",
    badgeClass: "bg-[#e11d48]/15 text-[#fb7185] border border-[#e11d48]/30",
    headerBg: "from-[#451726] via-[#24131c] to-surface",
    category: "poker",
  },
  omaha: {
    accentClass: "text-accent",
    badgeText: "4 Hole · PLO",
    badgeClass: "bg-accent/15 text-accent border border-accent/30",
    headerBg: "from-[#0f3452] via-[#0b2135] to-surface",
    category: "poker",
  },
  omaha_hilo: {
    accentClass: "text-gold",
    badgeText: "Hi / Lo Split",
    badgeClass: "bg-gold/15 text-gold border border-gold/30",
    headerBg: "from-[#1e3252] via-[#142236] to-surface",
    category: "poker",
  },
  dominoes: {
    accentClass: "text-[#f8fafc]",
    badgeText: "Double-6",
    badgeClass: "bg-white/10 text-text-2 border border-white/15",
    headerBg: "from-[#173a42] via-[#0d2229] to-surface",
    category: "board",
  },
  backgammon: {
    accentClass: "text-[#f5b971]",
    badgeText: "Nardy · Cube",
    badgeClass: "bg-[#d97706]/15 text-[#f5b971] border border-[#d97706]/30",
    headerBg: "from-[#422817] via-[#241812] to-surface",
    category: "board",
  },
};

/** Brand geometric emblem for header and auth hero (Crocobet-inspired emerald crest). */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="cg-brand-bg" x1="0" y1="0" x2="36" y2="36">
          <stop offset="0%" stopColor="#1fd15b" />
          <stop offset="100%" stopColor="#0d7a34" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="32" height="32" rx="9" fill="url(#cg-brand-bg)" />
      <rect x="2.75" y="2.75" width="30.5" height="30.5" rx="8.25" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" />
      <path d="M18 7.5L25.5 17.5C25.5 21.8 22.1 24.5 18 24.5C13.9 24.5 10.5 21.8 10.5 17.5L18 7.5Z" fill="#052110" />
      <path d="M18 11.2L22.3 17.4C22.3 19.9 20.4 21.6 18 21.6C15.6 21.6 13.7 19.9 13.7 17.4L18 11.2Z" fill="#f5c451" />
      <path d="M15.4 26.8H20.6L19.4 22.8H16.6L15.4 26.8Z" fill="#052110" />
    </svg>
  );
}

/** Distinct visual illustration banner for each of the 10 games. */
export function GameArtwork({ game, className = "w-full h-24" }: { game: GameType; className?: string }) {
  switch (game) {
    case "joker":
      return (
        <svg viewBox="0 0 240 96" className={className} aria-hidden="true">
          <circle cx="195" cy="48" r="52" fill="rgba(24,184,78,0.14)" />
          <g transform="translate(112 12) rotate(-14)">
            <rect width="42" height="60" rx="5" fill="#f7f4eb" stroke="#cfc8b6" />
            <text x="6" y="15" fontSize="11" fontWeight="800" fill="#161b22">A</text>
            <text x="21" y="40" textAnchor="middle" fontSize="22" fill="#161b22">♠</text>
          </g>
          <g transform="translate(148 10) rotate(2)">
            <rect width="44" height="64" rx="6" fill="#fae199" stroke="#d4a334" strokeWidth="1.5" />
            <text x="6" y="15" fontSize="9" fontWeight="900" fill="#6b4000">JK</text>
            <path d="M22 21L26 31L35 27L31 38H13L9 27L18 31L22 21Z" fill="#6b4000" />
            <circle cx="22" cy="18" r="2" fill="#c9252d" />
            <circle cx="9" cy="24" r="1.8" fill="#18b84e" />
            <circle cx="35" cy="24" r="1.8" fill="#18b84e" />
            <rect x="13" y="41" width="18" height="3.5" rx="1.5" fill="#6b4000" />
          </g>
          <g transform="translate(184 19) rotate(16)">
            <rect width="40" height="58" rx="5" fill="#f7f4eb" stroke="#cfc8b6" />
            <text x="6" y="15" fontSize="11" fontWeight="800" fill="#c9252d">K</text>
            <text x="20" y="39" textAnchor="middle" fontSize="21" fill="#c9252d">♥</text>
          </g>
        </svg>
      );

    case "japanese_joker":
      return (
        <svg viewBox="0 0 240 96" className={className} aria-hidden="true">
          <circle cx="176" cy="48" r="46" fill="rgba(34,184,230,0.14)" />
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${108 + i * 38} 18)`}>
              <rect x="3" y="4" width="32" height="48" rx="4" fill="#0d3546" stroke="#2a6880" />
              <rect width="32" height="48" rx="4" fill={i === 1 ? "#fae199" : "#f7f4eb"} stroke={i === 1 ? "#d4a334" : "#cfc8b6"} />
              {i === 1 ? (
                <path d="M16 14L19 22L26 19L23 28H9L6 19L13 22L16 14Z" fill="#6b4000" />
              ) : (
                <text x="16" y="31" textAnchor="middle" fontSize="18" fill={i === 0 ? "#c9252d" : "#161b22"}>
                  {i === 0 ? "♦" : "♣"}
                </text>
              )}
            </g>
          ))}
          <path d="M112 78H216" stroke="rgba(34,184,230,0.45)" strokeWidth="2" strokeDasharray="4 4" />
        </svg>
      );

    case "bura3":
      return (
        <svg viewBox="0 0 240 96" className={className} aria-hidden="true">
          <circle cx="176" cy="50" r="48" fill="rgba(245,196,81,0.14)" />
          <g transform="translate(115 16) rotate(-14)">
            <rect width="38" height="54" rx="5" fill="#f7f4eb" stroke="#cfc8b6" />
            <text x="6" y="14" fontSize="10" fontWeight="800" fill="#161b22">A</text>
            <text x="19" y="36" textAnchor="middle" fontSize="19" fill="#161b22">♠</text>
          </g>
          <g transform="translate(148 11)">
            <rect width="40" height="58" rx="5" fill="#f7f4eb" stroke="#d9aa38" strokeWidth="1.5" />
            <text x="6" y="14" fontSize="10" fontWeight="800" fill="#161b22">10</text>
            <text x="20" y="38" textAnchor="middle" fontSize="20" fill="#161b22">♠</text>
          </g>
          <g transform="translate(182 18) rotate(14)">
            <rect width="38" height="54" rx="5" fill="#f7f4eb" stroke="#cfc8b6" />
            <text x="6" y="14" fontSize="10" fontWeight="800" fill="#161b22">K</text>
            <text x="19" y="36" textAnchor="middle" fontSize="19" fill="#161b22">♠</text>
          </g>
          <rect x="148" y="64" width="40" height="18" rx="9" fill="#f5c451" />
          <text x="168" y="77" textAnchor="middle" fontSize="11" fontWeight="900" fill="#1e1303">31+</text>
        </svg>
      );

    case "bura5":
      return (
        <svg viewBox="0 0 240 96" className={className} aria-hidden="true">
          <circle cx="168" cy="52" r="50" fill="rgba(20,184,166,0.14)" />
          {[-20, -10, 0, 10, 20].map((rot, idx) => (
            <g key={rot} transform={`translate(${146 + idx * 9} ${18 + Math.abs(idx - 2) * 3}) rotate(${rot} 18 46)`}>
              <rect width="34" height="50" rx="4.5" fill="#f7f4eb" stroke="#c8c2b0" />
              <text x="5" y="13" fontSize="9" fontWeight="800" fill={idx % 2 ? "#c9252d" : "#161b22"}>
                {["A", "10", "K", "Q", "J"][idx]}
              </text>
              <text x="17" y="34" textAnchor="middle" fontSize="17" fill={idx % 2 ? "#c9252d" : "#161b22"}>
                {idx % 2 ? "♥" : "♣"}
              </text>
            </g>
          ))}
        </svg>
      );

    case "holdem":
      return (
        <svg viewBox="0 0 240 96" className={className} aria-hidden="true">
          <ellipse cx="170" cy="54" rx="64" ry="34" fill="#0d4f38" stroke="#3c2b1e" strokeWidth="4" />
          <ellipse cx="170" cy="54" rx="52" ry="24" fill="none" stroke="rgba(245,196,81,0.3)" strokeWidth="1" />
          <g transform="translate(132 18) rotate(-10)">
            <rect width="36" height="52" rx="5" fill="#f7f4eb" stroke="#cfc8b6" />
            <text x="5" y="14" fontSize="10" fontWeight="800" fill="#161b22">A</text>
            <text x="18" y="36" textAnchor="middle" fontSize="19" fill="#161b22">♠</text>
          </g>
          <g transform="translate(162 16) rotate(8)">
            <rect width="36" height="52" rx="5" fill="#f7f4eb" stroke="#cfc8b6" />
            <text x="5" y="14" fontSize="10" fontWeight="800" fill="#c9252d">A</text>
            <text x="18" y="36" textAnchor="middle" fontSize="19" fill="#c9252d">♥</text>
          </g>
          <circle cx="212" cy="64" r="11" fill="#18b84e" stroke="#fff" strokeWidth="2" strokeDasharray="4 3" />
          <circle cx="212" cy="64" r="6" fill="#0a4720" />
          <circle cx="200" cy="72" r="10" fill="#f5c451" stroke="#fff" strokeWidth="2" strokeDasharray="4 3" />
          <circle cx="200" cy="72" r="5" fill="#9a6b10" />
        </svg>
      );

    case "shortdeck":
      return (
        <svg viewBox="0 0 240 96" className={className} aria-hidden="true">
          <circle cx="175" cy="48" r="48" fill="rgba(225,29,72,0.18)" />
          <g transform="translate(120 18) rotate(-8)">
            <rect width="38" height="54" rx="5" fill="#f7f4eb" stroke="#cfc8b6" />
            <text x="6" y="14" fontSize="10" fontWeight="800" fill="#c9252d">6</text>
            <text x="19" y="37" textAnchor="middle" fontSize="19" fill="#c9252d">♦</text>
          </g>
          <g transform="translate(152 14) rotate(6)">
            <rect width="38" height="54" rx="5" fill="#f7f4eb" stroke="#cfc8b6" />
            <text x="6" y="14" fontSize="10" fontWeight="800" fill="#c9252d">A</text>
            <text x="19" y="37" textAnchor="middle" fontSize="19" fill="#c9252d">♦</text>
          </g>
          <rect x="178" y="48" width="44" height="28" rx="8" fill="#e11d48" stroke="#fda4af" strokeWidth="1.2" />
          <text x="200" y="67" textAnchor="middle" fontSize="15" fontWeight="900" fill="#fff">6+</text>
        </svg>
      );

    case "omaha":
      return (
        <svg viewBox="0 0 240 96" className={className} aria-hidden="true">
          <circle cx="168" cy="50" r="48" fill="rgba(34,184,230,0.16)" />
          {[
            { r: "A", s: "♠", c: "#161b22", rot: -16, x: 112, y: 22 },
            { r: "K", s: "♥", c: "#c9252d", rot: -5, x: 136, y: 14 },
            { r: "Q", s: "♦", c: "#c9252d", rot: 6, x: 160, y: 15 },
            { r: "J", s: "♣", c: "#161b22", rot: 17, x: 184, y: 23 },
          ].map((k) => (
            <g key={k.r} transform={`translate(${k.x} ${k.y}) rotate(${k.rot})`}>
              <rect width="34" height="50" rx="5" fill="#f7f4eb" stroke="#c8c2b0" />
              <text x="5" y="13" fontSize="9.5" fontWeight="800" fill={k.c}>{k.r}</text>
              <text x="17" y="34" textAnchor="middle" fontSize="17" fill={k.c}>{k.s}</text>
            </g>
          ))}
        </svg>
      );

    case "omaha_hilo":
      return (
        <svg viewBox="0 0 240 96" className={className} aria-hidden="true">
          <circle cx="145" cy="48" r="36" fill="rgba(245,196,81,0.16)" />
          <circle cx="195" cy="48" r="36" fill="rgba(34,184,230,0.16)" />
          <g transform="translate(114 16) rotate(-10)">
            <rect width="36" height="52" rx="5" fill="#f7f4eb" stroke="#f5c451" strokeWidth="1.5" />
            <text x="5" y="14" fontSize="10" fontWeight="800" fill="#161b22">A</text>
            <text x="18" y="35" textAnchor="middle" fontSize="18" fill="#161b22">♠</text>
          </g>
          <g transform="translate(148 20) rotate(4)">
            <rect width="36" height="52" rx="5" fill="#f7f4eb" stroke="#22b8e6" strokeWidth="1.5" />
            <text x="5" y="14" fontSize="10" fontWeight="800" fill="#c9252d">2</text>
            <text x="18" y="35" textAnchor="middle" fontSize="18" fill="#c9252d">♥</text>
          </g>
          <rect x="186" y="20" width="38" height="22" rx="6" fill="#f5c451" />
          <text x="205" y="35" textAnchor="middle" fontSize="10.5" fontWeight="900" fill="#1d1404">HI</text>
          <rect x="186" y="50" width="38" height="22" rx="6" fill="#22b8e6" />
          <text x="205" y="65" textAnchor="middle" fontSize="10.5" fontWeight="900" fill="#041922">LO 8</text>
        </svg>
      );

    case "dominoes":
      return (
        <svg viewBox="0 0 240 96" className={className} aria-hidden="true">
          <circle cx="170" cy="48" r="46" fill="rgba(255,255,255,0.08)" />
          <g transform="translate(110 28) rotate(-8)">
            <rect width="62" height="32" rx="5" fill="#f7f3e8" stroke="#c8bfa8" strokeWidth="1.5" />
            <line x1="31" y1="4" x2="31" y2="28" stroke="#5b5446" strokeWidth="1.5" />
            <circle cx="31" cy="16" r="2" fill="#c59936" />
            {[
              [9, 9], [16, 9], [23, 9], [9, 23], [16, 23], [23, 23],
              [40, 9], [52, 9], [46, 16], [40, 23], [52, 23],
            ].map(([cx, cy], idx) => (
              <circle key={idx} cx={cx} cy={cy} r="2.2" fill="#182026" />
            ))}
          </g>
          <g transform="translate(178 14) rotate(12)">
            <rect width="32" height="60" rx="5" fill="#f7f3e8" stroke="#c8bfa8" strokeWidth="1.5" />
            <line x1="4" y1="30" x2="28" y2="30" stroke="#5b5446" strokeWidth="1.5" />
            <circle cx="16" cy="30" r="2" fill="#c59936" />
            {[
              [10, 10], [22, 20],
              [10, 40], [22, 40], [10, 50], [22, 50],
            ].map(([cx, cy], idx) => (
              <circle key={idx} cx={cx} cy={cy} r="2.2" fill="#182026" />
            ))}
          </g>
        </svg>
      );

    case "backgammon":
      return (
        <svg viewBox="0 0 240 96" className={className} aria-hidden="true">
          <rect x="104" y="10" width="120" height="76" rx="8" fill="#2c1d13" stroke="#5d3f29" strokeWidth="2.5" />
          <rect x="110" y="15" width="108" height="66" rx="4" fill="#0c3a2d" />
          <rect x="161" y="15" width="6" height="66" fill="#2c1d13" />
          {[0, 1, 2, 3].map((i) => (
            <polygon
              key={`t${i}`}
              points={`${112 + i * 12},15 ${124 + i * 12},15 ${118 + i * 12},45`}
              fill={i % 2 ? "#c7ab7c" : "#8b2f2f"}
            />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <polygon
              key={`b${i}`}
              points={`${169 + i * 12},81 ${181 + i * 12},81 ${175 + i * 12},51`}
              fill={i % 2 ? "#8b2f2f" : "#c7ab7c"}
            />
          ))}
          <circle cx="118" cy="22" r="5.2" fill="#f7f2e4" stroke="#b3a68c" />
          <circle cx="118" cy="32" r="5.2" fill="#f7f2e4" stroke="#b3a68c" />
          <circle cx="175" cy="74" r="5.2" fill="#1a1f24" stroke="#d4a334" />
          <circle cx="175" cy="64" r="5.2" fill="#1a1f24" stroke="#d4a334" />
          <g transform="translate(186 24) rotate(-10)">
            <rect width="18" height="18" rx="3.5" fill="#faf6ec" stroke="#c8bfa8" />
            <circle cx="5" cy="5" r="1.6" fill="#161b22" />
            <circle cx="9" cy="9" r="1.6" fill="#161b22" />
            <circle cx="13" cy="13" r="1.6" fill="#161b22" />
          </g>
        </svg>
      );
  }
}

/** Mini icon emblem for game pills, headers, and room browser badges (zero emojis). */
export function GameBadgeIcon({ game, size = 20 }: { game: GameType; size?: number }) {
  switch (game) {
    case "joker":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 4L15 11L21 8L18.5 17H5.5L3 8L9 11L12 4Z" fill="#f5c451" stroke="#b8841c" strokeWidth="1.2" />
          <rect x="6" y="18.5" width="12" height="2.2" rx="1.1" fill="#18b84e" />
        </svg>
      );
    case "japanese_joker":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4" y="6" width="10" height="14" rx="2" fill="#154d6e" stroke="#22b8e6" strokeWidth="1.3" />
          <rect x="10" y="4" width="10" height="14" rx="2" fill="#f7f4eb" stroke="#d4a334" strokeWidth="1.3" />
          <circle cx="15" cy="11" r="2.6" fill="#c9252d" />
        </svg>
      );
    case "bura3":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3.5C12 3.5 5 10 5 14C5 16.5 7 18 9.2 18C10.4 18 11.3 17.5 12 16.6C12.7 17.5 13.6 18 14.8 18C17 18 19 16.5 19 14C19 10 12 3.5 12 3.5Z" fill="#f5c451" />
          <path d="M10 20.5H14L12.8 17H11.2L10 20.5Z" fill="#f5c451" />
        </svg>
      );
    case "bura5":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="8" r="3.4" fill="#5eead4" />
          <circle cx="8" cy="13.2" r="3.4" fill="#5eead4" />
          <circle cx="16" cy="13.2" r="3.4" fill="#5eead4" />
          <path d="M10 20.5H14L12.8 15.5H11.2L10 20.5Z" fill="#5eead4" />
        </svg>
      );
    case "holdem":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="#18b84e" stroke="#f7fafc" strokeWidth="2" strokeDasharray="3.5 2.5" />
          <circle cx="12" cy="12" r="4.5" fill="#07291f" />
        </svg>
      );
    case "shortdeck":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="2.5" y="4" width="19" height="16" rx="4" fill="#e11d48" />
          <text x="12" y="15.5" textAnchor="middle" fontSize="10.5" fontWeight="900" fill="#fff">6+</text>
        </svg>
      );
    case "omaha":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3.5L19.5 12L12 20.5L4.5 12L12 3.5Z" fill="#22b8e6" />
          <circle cx="12" cy="12" r="3" fill="#061824" />
        </svg>
      );
    case "omaha_hilo":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3.5L19.5 12H4.5L12 3.5Z" fill="#f5c451" />
          <path d="M12 20.5L19.5 12H4.5L12 20.5Z" fill="#22b8e6" />
        </svg>
      );
    case "dominoes":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="6" y="3" width="12" height="18" rx="2.5" fill="#f7f3e8" stroke="#8ea5b5" strokeWidth="1.2" />
          <line x1="7.5" y1="12" x2="16.5" y2="12" stroke="#182026" strokeWidth="1.2" />
          <circle cx="12" cy="7.5" r="1.5" fill="#182026" />
          <circle cx="9.5" cy="15" r="1.3" fill="#182026" />
          <circle cx="14.5" cy="18" r="1.3" fill="#182026" />
        </svg>
      );
    case "backgammon":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2.5" fill="#3a2518" stroke="#c7ab7c" strokeWidth="1.3" />
          <polygon points="5,5 9,5 7,13" fill="#c7ab7c" />
          <polygon points="9,5 13,5 11,13" fill="#a83232" />
          <polygon points="11,19 15,19 13,11" fill="#c7ab7c" />
          <circle cx="17" cy="16" r="2.2" fill="#f7f2e4" />
        </svg>
      );
  }
}
