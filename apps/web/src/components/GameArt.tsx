import type { GameType } from "@croco/shared/client";

/**
 * Bespoke, ultra-lightweight SVG visual identity for Croco Games (2026 Studio Edition).
 * Zero external raster assets, razor-sharp at every DPI, instant paint on low-end PCs.
 */

export interface GameVisualTheme {
  accentClass: string;
  badgeClass: string;
  headerBg: string;
  category: "cards" | "poker" | "board";
}

export const GAME_THEMES: Record<GameType, GameVisualTheme> = {
  joker: {
    accentClass: "text-primary",
    badgeClass: "bg-primary/14 text-primary border border-primary/30",
    headerBg: "from-[#0c3528] via-surface to-surface",
    category: "cards",
  },
  japanese_joker: {
    accentClass: "text-accent",
    badgeClass: "bg-accent/14 text-accent border border-accent/30",
    headerBg: "from-[#0e2d44] via-surface to-surface",
    category: "cards",
  },
  bura3: {
    accentClass: "text-gold",
    badgeClass: "bg-gold/14 text-gold border border-gold/30",
    headerBg: "from-[#2d2412] via-surface to-surface",
    category: "cards",
  },
  bura5: {
    accentClass: "text-primary",
    badgeClass: "bg-primary/14 text-primary border border-primary/30",
    headerBg: "from-[#10352e] via-surface to-surface",
    category: "cards",
  },
  holdem: {
    accentClass: "text-primary",
    badgeClass: "bg-primary/14 text-primary border border-primary/30",
    headerBg: "from-[#0c3528] via-surface to-surface",
    category: "poker",
  },
  shortdeck: {
    accentClass: "text-danger",
    badgeClass: "bg-danger/14 text-danger border border-danger/30",
    headerBg: "from-[#351523] via-surface to-surface",
    category: "poker",
  },
  omaha: {
    accentClass: "text-accent",
    badgeClass: "bg-accent/14 text-accent border border-accent/30",
    headerBg: "from-[#0f2c46] via-surface to-surface",
    category: "poker",
  },
  omaha_hilo: {
    accentClass: "text-gold",
    badgeClass: "bg-gold/14 text-gold border border-gold/30",
    headerBg: "from-[#1a2944] via-surface to-surface",
    category: "poker",
  },
  dominoes: {
    accentClass: "text-text",
    badgeClass: "bg-white/10 text-text-2 border border-white/15",
    headerBg: "from-[#162d38] via-surface to-surface",
    category: "board",
  },
  backgammon: {
    accentClass: "text-gold",
    badgeClass: "bg-gold/14 text-gold border border-gold/30",
    headerBg: "from-[#312014] via-surface to-surface",
    category: "board",
  },
};

/** Signature emerald-mint squircle crest with crowned spade mark. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="cg-brand-bg" x1="3" y1="2" x2="33" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3bf0aa" />
          <stop offset="100%" stopColor="#0ea86d" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="32" height="32" rx="10" fill="url(#cg-brand-bg)" />
      <rect x="2.75" y="2.75" width="30.5" height="30.5" rx="9.25" stroke="rgba(255,255,255,0.34)" strokeWidth="1.25" />
      <path
        d="M18 7.6C18 7.6 9.6 15.2 9.6 19.9C9.6 22.6 11.7 24.5 14.3 24.5C15.7 24.5 16.8 23.9 17.6 22.8C17.4 24.4 16.6 25.9 15.2 27H20.8C19.4 25.9 18.6 24.4 18.4 22.8C19.2 23.9 20.3 24.5 21.7 24.5C24.3 24.5 26.4 22.6 26.4 19.9C26.4 15.2 18 7.6 18 7.6Z"
        fill="#041c12"
      />
      <path d="M13.8 16.4L15.8 18.7L18 15.5L20.2 18.7L22.2 16.4L21.3 20.6H14.7L13.8 16.4Z" fill="#f4c566" />
    </svg>
  );
}

/** Distinct visual illustration banner for each of the 10 games. */
export function GameArtwork({ game, className = "w-full h-24" }: { game: GameType; className?: string }) {
  switch (game) {
    case "joker":
      return (
        <svg viewBox="0 0 240 96" className={className} aria-hidden="true">
          <circle cx="195" cy="48" r="52" fill="rgba(34,229,155,0.14)" />
          <g transform="translate(112 12) rotate(-14)">
            <rect width="42" height="60" rx="6" fill="#ffffff" stroke="#d8dee9" />
            <text x="6" y="15" fontSize="11" fontWeight="800" fill="#0f172a">A</text>
            <text x="21" y="40" textAnchor="middle" fontSize="22" fill="#0f172a">♠</text>
          </g>
          <g transform="translate(148 10) rotate(2)">
            <rect width="44" height="64" rx="6" fill="#fef3c7" stroke="#f4c566" strokeWidth="1.5" />
            <text x="6" y="15" fontSize="9" fontWeight="900" fill="#78350f">JK</text>
            <path d="M22 21L26 31L35 27L31 38H13L9 27L18 31L22 21Z" fill="#78350f" />
            <circle cx="22" cy="18" r="2" fill="#e11d48" />
            <circle cx="9" cy="24" r="1.8" fill="#10b981" />
            <circle cx="35" cy="24" r="1.8" fill="#10b981" />
            <rect x="13" y="41" width="18" height="3.5" rx="1.5" fill="#78350f" />
          </g>
          <g transform="translate(184 19) rotate(16)">
            <rect width="40" height="58" rx="6" fill="#ffffff" stroke="#d8dee9" />
            <text x="6" y="15" fontSize="11" fontWeight="800" fill="#e11d48">K</text>
            <text x="20" y="39" textAnchor="middle" fontSize="21" fill="#e11d48">♥</text>
          </g>
        </svg>
      );

    case "japanese_joker":
      return (
        <svg viewBox="0 0 240 96" className={className} aria-hidden="true">
          <circle cx="176" cy="48" r="46" fill="rgba(92,200,255,0.14)" />
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${108 + i * 38} 18)`}>
              <rect x="3" y="4" width="32" height="48" rx="5" fill="#0d3546" stroke="#38bdf8" strokeOpacity="0.45" />
              <rect width="32" height="48" rx="5" fill={i === 1 ? "#fef3c7" : "#ffffff"} stroke={i === 1 ? "#f4c566" : "#d8dee9"} />
              {i === 1 ? (
                <path d="M16 14L19 22L26 19L23 28H9L6 19L13 22L16 14Z" fill="#78350f" />
              ) : (
                <text x="16" y="31" textAnchor="middle" fontSize="18" fill={i === 0 ? "#e11d48" : "#0f172a"}>
                  {i === 0 ? "♦" : "♣"}
                </text>
              )}
            </g>
          ))}
        </svg>
      );

    case "bura3":
      return (
        <svg viewBox="0 0 240 96" className={className} aria-hidden="true">
          <circle cx="176" cy="50" r="48" fill="rgba(244,197,102,0.14)" />
          <g transform="translate(115 16) rotate(-14)">
            <rect width="38" height="54" rx="5" fill="#ffffff" stroke="#d8dee9" />
            <text x="6" y="14" fontSize="10" fontWeight="800" fill="#0f172a">A</text>
            <text x="19" y="36" textAnchor="middle" fontSize="19" fill="#0f172a">♠</text>
          </g>
          <g transform="translate(148 11)">
            <rect width="40" height="58" rx="5" fill="#ffffff" stroke="#f4c566" strokeWidth="1.5" />
            <text x="6" y="14" fontSize="10" fontWeight="800" fill="#0f172a">10</text>
            <text x="20" y="38" textAnchor="middle" fontSize="20" fill="#0f172a">♠</text>
          </g>
          <g transform="translate(182 18) rotate(14)">
            <rect width="38" height="54" rx="5" fill="#ffffff" stroke="#d8dee9" />
            <text x="6" y="14" fontSize="10" fontWeight="800" fill="#0f172a">K</text>
            <text x="19" y="36" textAnchor="middle" fontSize="19" fill="#0f172a">♠</text>
          </g>
          <rect x="148" y="64" width="40" height="18" rx="9" fill="#f4c566" />
          <text x="168" y="77" textAnchor="middle" fontSize="11" fontWeight="900" fill="#1e1303">31+</text>
        </svg>
      );

    case "bura5":
      return (
        <svg viewBox="0 0 240 96" className={className} aria-hidden="true">
          <circle cx="168" cy="52" r="50" fill="rgba(34,229,155,0.14)" />
          {[-20, -10, 0, 10, 20].map((rot, idx) => (
            <g key={rot} transform={`translate(${146 + idx * 9} ${18 + Math.abs(idx - 2) * 3}) rotate(${rot} 18 46)`}>
              <rect width="34" height="50" rx="5" fill="#ffffff" stroke="#d8dee9" />
              <text x="5" y="13" fontSize="9" fontWeight="800" fill={idx % 2 ? "#e11d48" : "#0f172a"}>
                {["A", "10", "K", "Q", "J"][idx]}
              </text>
              <text x="17" y="34" textAnchor="middle" fontSize="17" fill={idx % 2 ? "#e11d48" : "#0f172a"}>
                {idx % 2 ? "♥" : "♣"}
              </text>
            </g>
          ))}
        </svg>
      );

    case "holdem":
      return (
        <svg viewBox="0 0 240 96" className={className} aria-hidden="true">
          <ellipse cx="170" cy="54" rx="64" ry="34" fill="#0a664b" stroke="#23324d" strokeWidth="4" />
          <ellipse cx="170" cy="54" rx="52" ry="24" fill="none" stroke="rgba(244,197,102,0.35)" strokeWidth="1" />
          <g transform="translate(132 18) rotate(-10)">
            <rect width="36" height="52" rx="5" fill="#ffffff" stroke="#d8dee9" />
            <text x="5" y="14" fontSize="10" fontWeight="800" fill="#0f172a">A</text>
            <text x="18" y="36" textAnchor="middle" fontSize="19" fill="#0f172a">♠</text>
          </g>
          <g transform="translate(162 16) rotate(8)">
            <rect width="36" height="52" rx="5" fill="#ffffff" stroke="#d8dee9" />
            <text x="5" y="14" fontSize="10" fontWeight="800" fill="#e11d48">A</text>
            <text x="18" y="36" textAnchor="middle" fontSize="19" fill="#e11d48">♥</text>
          </g>
          <circle cx="212" cy="64" r="11" fill="#22e59b" stroke="#fff" strokeWidth="2" strokeDasharray="4 3" />
          <circle cx="212" cy="64" r="6" fill="#063b27" />
          <circle cx="200" cy="72" r="10" fill="#f4c566" stroke="#fff" strokeWidth="2" strokeDasharray="4 3" />
          <circle cx="200" cy="72" r="5" fill="#9a6b10" />
        </svg>
      );

    case "shortdeck":
      return (
        <svg viewBox="0 0 240 96" className={className} aria-hidden="true">
          <circle cx="175" cy="48" r="48" fill="rgba(255,92,114,0.16)" />
          <g transform="translate(120 18) rotate(-8)">
            <rect width="38" height="54" rx="5" fill="#ffffff" stroke="#d8dee9" />
            <text x="6" y="14" fontSize="10" fontWeight="800" fill="#e11d48">6</text>
            <text x="19" y="37" textAnchor="middle" fontSize="19" fill="#e11d48">♦</text>
          </g>
          <g transform="translate(152 14) rotate(6)">
            <rect width="38" height="54" rx="5" fill="#ffffff" stroke="#d8dee9" />
            <text x="6" y="14" fontSize="10" fontWeight="800" fill="#e11d48">A</text>
            <text x="19" y="37" textAnchor="middle" fontSize="19" fill="#e11d48">♦</text>
          </g>
          <rect x="178" y="48" width="44" height="28" rx="8" fill="#ff5c72" stroke="#fda4af" strokeWidth="1.2" />
          <text x="200" y="67" textAnchor="middle" fontSize="15" fontWeight="900" fill="#fff">6+</text>
        </svg>
      );

    case "omaha":
      return (
        <svg viewBox="0 0 240 96" className={className} aria-hidden="true">
          <circle cx="168" cy="50" r="48" fill="rgba(92,200,255,0.15)" />
          {[
            { r: "A", s: "♠", c: "#0f172a", rot: -16, x: 112, y: 22 },
            { r: "K", s: "♥", c: "#e11d48", rot: -5, x: 136, y: 14 },
            { r: "Q", s: "♦", c: "#e11d48", rot: 6, x: 160, y: 15 },
            { r: "J", s: "♣", c: "#0f172a", rot: 17, x: 184, y: 23 },
          ].map((k) => (
            <g key={k.r} transform={`translate(${k.x} ${k.y}) rotate(${k.rot})`}>
              <rect width="34" height="50" rx="5" fill="#ffffff" stroke="#d8dee9" />
              <text x="5" y="13" fontSize="9.5" fontWeight="800" fill={k.c}>{k.r}</text>
              <text x="17" y="34" textAnchor="middle" fontSize="17" fill={k.c}>{k.s}</text>
            </g>
          ))}
        </svg>
      );

    case "omaha_hilo":
      return (
        <svg viewBox="0 0 240 96" className={className} aria-hidden="true">
          <circle cx="145" cy="48" r="36" fill="rgba(244,197,102,0.16)" />
          <circle cx="195" cy="48" r="36" fill="rgba(92,200,255,0.16)" />
          <g transform="translate(114 16) rotate(-10)">
            <rect width="36" height="52" rx="5" fill="#ffffff" stroke="#f4c566" strokeWidth="1.5" />
            <text x="5" y="14" fontSize="10" fontWeight="800" fill="#0f172a">A</text>
            <text x="18" y="35" textAnchor="middle" fontSize="18" fill="#0f172a">♠</text>
          </g>
          <g transform="translate(148 20) rotate(4)">
            <rect width="36" height="52" rx="5" fill="#ffffff" stroke="#5cc8ff" strokeWidth="1.5" />
            <text x="5" y="14" fontSize="10" fontWeight="800" fill="#e11d48">2</text>
            <text x="18" y="35" textAnchor="middle" fontSize="18" fill="#e11d48">♥</text>
          </g>
          <rect x="186" y="20" width="38" height="22" rx="6" fill="#f4c566" />
          <text x="205" y="35" textAnchor="middle" fontSize="10.5" fontWeight="900" fill="#1d1404">HI</text>
          <rect x="186" y="50" width="38" height="22" rx="6" fill="#5cc8ff" />
          <text x="205" y="65" textAnchor="middle" fontSize="10.5" fontWeight="900" fill="#041922">LO 8</text>
        </svg>
      );

    case "dominoes":
      return (
        <svg viewBox="0 0 240 96" className={className} aria-hidden="true">
          <circle cx="170" cy="48" r="46" fill="rgba(255,255,255,0.08)" />
          <g transform="translate(110 28) rotate(-8)">
            <rect width="62" height="32" rx="5" fill="#f8f5ec" stroke="#cbd5e1" strokeWidth="1.5" />
            <line x1="31" y1="4" x2="31" y2="28" stroke="#64748b" strokeWidth="1.5" />
            <circle cx="31" cy="16" r="2" fill="#f4c566" />
            {[
              [9, 9], [16, 9], [23, 9], [9, 23], [16, 23], [23, 23],
              [40, 9], [52, 9], [46, 16], [40, 23], [52, 23],
            ].map(([cx, cy], idx) => (
              <circle key={idx} cx={cx} cy={cy} r="2.2" fill="#0f172a" />
            ))}
          </g>
          <g transform="translate(178 14) rotate(12)">
            <rect width="32" height="60" rx="5" fill="#f8f5ec" stroke="#cbd5e1" strokeWidth="1.5" />
            <line x1="4" y1="30" x2="28" y2="30" stroke="#64748b" strokeWidth="1.5" />
            <circle cx="16" cy="30" r="2" fill="#f4c566" />
            {[
              [10, 10], [22, 20],
              [10, 40], [22, 40], [10, 50], [22, 50],
            ].map(([cx, cy], idx) => (
              <circle key={idx} cx={cx} cy={cy} r="2.2" fill="#0f172a" />
            ))}
          </g>
        </svg>
      );

    case "backgammon":
      return (
        <svg viewBox="0 0 240 96" className={className} aria-hidden="true">
          <rect x="104" y="10" width="120" height="76" rx="8" fill="#1e293b" stroke="#475569" strokeWidth="2.5" />
          <rect x="110" y="15" width="108" height="66" rx="4" fill="#084c3a" />
          <rect x="161" y="15" width="6" height="66" fill="#1e293b" />
          {[0, 1, 2, 3].map((i) => (
            <polygon
              key={`t${i}`}
              points={`${112 + i * 12},15 ${124 + i * 12},15 ${118 + i * 12},45`}
              fill={i % 2 ? "#e2d4b7" : "#be123c"}
            />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <polygon
              key={`b${i}`}
              points={`${169 + i * 12},81 ${181 + i * 12},81 ${175 + i * 12},51`}
              fill={i % 2 ? "#be123c" : "#e2d4b7"}
            />
          ))}
          <circle cx="118" cy="22" r="5.2" fill="#f8fafc" stroke="#94a3b8" />
          <circle cx="118" cy="32" r="5.2" fill="#f8fafc" stroke="#94a3b8" />
          <circle cx="175" cy="74" r="5.2" fill="#0f172a" stroke="#f4c566" />
          <circle cx="175" cy="64" r="5.2" fill="#0f172a" stroke="#f4c566" />
          <g transform="translate(186 24) rotate(-10)">
            <rect width="18" height="18" rx="3.5" fill="#ffffff" stroke="#cbd5e1" />
            <circle cx="5" cy="5" r="1.6" fill="#0f172a" />
            <circle cx="9" cy="9" r="1.6" fill="#0f172a" />
            <circle cx="13" cy="13" r="1.6" fill="#0f172a" />
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
          <path d="M12 4L15 11L21 8L18.5 17H5.5L3 8L9 11L12 4Z" fill="#f4c566" stroke="#b8841c" strokeWidth="1.2" />
          <rect x="6" y="18.5" width="12" height="2.2" rx="1.1" fill="#22e59b" />
        </svg>
      );
    case "japanese_joker":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4" y="6" width="10" height="14" rx="2" fill="#133a54" stroke="#5cc8ff" strokeWidth="1.3" />
          <rect x="10" y="4" width="10" height="14" rx="2" fill="#ffffff" stroke="#f4c566" strokeWidth="1.3" />
          <circle cx="15" cy="11" r="2.6" fill="#e11d48" />
        </svg>
      );
    case "bura3":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3.5C12 3.5 5 10 5 14C5 16.5 7 18 9.2 18C10.4 18 11.3 17.5 12 16.6C12.7 17.5 13.6 18 14.8 18C17 18 19 16.5 19 14C19 10 12 3.5 12 3.5Z" fill="#f4c566" />
          <path d="M10 20.5H14L12.8 17H11.2L10 20.5Z" fill="#f4c566" />
        </svg>
      );
    case "bura5":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="8" r="3.4" fill="#22e59b" />
          <circle cx="8" cy="13.2" r="3.4" fill="#22e59b" />
          <circle cx="16" cy="13.2" r="3.4" fill="#22e59b" />
          <path d="M10 20.5H14L12.8 15.5H11.2L10 20.5Z" fill="#22e59b" />
        </svg>
      );
    case "holdem":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="#22e59b" stroke="#f8fafc" strokeWidth="2" strokeDasharray="3.5 2.5" />
          <circle cx="12" cy="12" r="4.5" fill="#06291d" />
        </svg>
      );
    case "shortdeck":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="2.5" y="4" width="19" height="16" rx="4" fill="#ff5c72" />
          <text x="12" y="15.5" textAnchor="middle" fontSize="10.5" fontWeight="900" fill="#fff">6+</text>
        </svg>
      );
    case "omaha":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3.5L19.5 12L12 20.5L4.5 12L12 3.5Z" fill="#5cc8ff" />
          <circle cx="12" cy="12" r="3" fill="#08121e" />
        </svg>
      );
    case "omaha_hilo":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3.5L19.5 12H4.5L12 3.5Z" fill="#f4c566" />
          <path d="M12 20.5L19.5 12H4.5L12 20.5Z" fill="#5cc8ff" />
        </svg>
      );
    case "dominoes":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="6" y="3" width="12" height="18" rx="2.5" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.2" />
          <line x1="7.5" y1="12" x2="16.5" y2="12" stroke="#0f172a" strokeWidth="1.2" />
          <circle cx="12" cy="7.5" r="1.5" fill="#0f172a" />
          <circle cx="9.5" cy="15" r="1.3" fill="#0f172a" />
          <circle cx="14.5" cy="18" r="1.3" fill="#0f172a" />
        </svg>
      );
    case "backgammon":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2.5" fill="#1e293b" stroke="#f4c566" strokeWidth="1.3" />
          <polygon points="5,5 9,5 7,13" fill="#e2d4b7" />
          <polygon points="9,5 13,5 11,13" fill="#be123c" />
          <polygon points="11,19 15,19 13,11" fill="#e2d4b7" />
          <circle cx="17" cy="16" r="2.2" fill="#f8fafc" />
        </svg>
      );
  }
}
