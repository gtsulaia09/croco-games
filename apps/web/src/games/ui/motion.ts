/**
 * Card flights between the hand, the seats and the felt (presentation only).
 *
 * Uses the Web Animations API on transform/opacity, so layout never jumps: the card is
 * rendered in its final place and animated *from* where it came from. Every helper is a no-op
 * when the user prefers reduced motion or the tab is hidden.
 */

const rects = new Map<string, DOMRect>();

export function motionAllowed(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (document.hidden) return false;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Remember where a card was on screen just before it is played. */
export function rememberCardRect(card: string, el: Element | null): void {
  if (el) rects.set(card, el.getBoundingClientRect());
}

function takeCardRect(card: string): DOMRect | undefined {
  const r = rects.get(card);
  rects.delete(card);
  return r;
}

/** The on-screen anchor of a seat (its avatar), used as the source/target of flights. */
export function seatRect(scope: Element | null, seat: number): DOMRect | undefined {
  const el = scope?.querySelector(`[data-seat-anchor="${seat}"]`);
  return el ? el.getBoundingClientRect() : undefined;
}

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/**
 * Animate a card that has just appeared on the felt from where it was played: the player's own
 * hand (exact rect) or an opponent's seat (small and face-on).
 */
export function flyIn(el: HTMLElement | null, card: string, fallback?: DOMRect): void {
  if (!el || !motionAllowed()) return;
  const from = takeCardRect(card) ?? fallback;
  const to = el.getBoundingClientRect();
  if (!from || to.width === 0) return;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const scale = Math.max(0.35, Math.min(1.6, from.width / to.width));
  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.85 },
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
    ],
    { duration: 420, easing: EASE },
  );
}

/** Sweep the cards of a finished trick toward the winner's seat. */
export function sweepTo(els: HTMLElement[], target: DOMRect | undefined, duration = 460): void {
  if (!target || !motionAllowed()) return;
  els.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    const dx = target.left + target.width / 2 - (r.left + r.width / 2);
    const dy = target.top + target.height / 2 - (r.top + r.height / 2);
    el.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0 },
      ],
      { duration, delay: i * 35, easing: "cubic-bezier(0.55, 0, 0.45, 1)", fill: "forwards" },
    );
  });
}
