import type { CSSProperties, ReactNode } from "react";

/**
 * The card table: a padded navy-leather rail with a gold inlay around an emerald felt that is
 * lit from above. `shape` picks the geometry: "oval" for four seats around the table, "duel"
 * for two players facing each other. Children are laid out by the board's own grid.
 */
export function GameTable({
  shape = "oval",
  felt = "emerald",
  className = "",
  children,
  overlay,
  style,
  label,
}: {
  shape?: "oval" | "duel";
  felt?: "emerald" | "sapphire" | "wine";
  className?: string;
  children: ReactNode;
  /** Absolutely positioned layer above the felt (notifications, decision sheets). */
  overlay?: ReactNode;
  style?: CSSProperties;
  label?: string;
}) {
  return (
    <section className={`ptable ${className}`} data-shape={shape} style={style} aria-label={label}>
      <div className="ptable-felt" data-felt={felt}>
        <div className="ptable-emblem" aria-hidden="true">
          <svg viewBox="0 0 120 120">
            <path d="M60 8L104 60L60 112L16 60Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M60 20L94 60L60 100L26 60Z" fill="none" stroke="currentColor" strokeWidth="0.6" />
            <path d="M60 42C60 42 49 53 49 60.5C49 64.5 52 67 55.2 67C57.2 67 58.8 66 60 64.4C61.2 66 62.8 67 64.8 67C68 67 71 64.5 71 60.5C71 53 60 42 60 42ZM56.4 77H63.6L61.2 68.4H58.8Z" fill="currentColor" />
          </svg>
        </div>
        {children}
      </div>
      {overlay}
    </section>
  );
}
