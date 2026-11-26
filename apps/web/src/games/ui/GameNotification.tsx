import { useEffect, useState, type ReactNode } from "react";

export interface TableNotice {
  /** Changes whenever a new notice should be shown (e.g. a trick or hand signature). */
  id: string;
  tone?: "info" | "win" | "gold" | "warn";
  icon?: ReactNode;
  text: ReactNode;
}

/**
 * A short message that slides onto the top rail of the table (trick won, hand finished …) and
 * fades out by itself, even if the event that raised it is already over. It never covers cards
 * or controls. The notice that exists when the board mounts is not replayed.
 */
export function GameNotification({ notice, duration = 2600 }: { notice: TableNotice | null; duration?: number }) {
  const [state, setState] = useState<{ lastId: string | null; shown: TableNotice | null }>({ lastId: notice?.id ?? null, shown: null });
  if (notice && notice.id !== state.lastId) setState({ lastId: notice.id, shown: notice });

  useEffect(() => {
    if (!state.shown) return;
    const id = setTimeout(() => setState((s) => ({ ...s, shown: null })), duration);
    return () => clearTimeout(id);
  }, [state.shown, duration]);

  const shown = state.shown;
  return (
    <div className="pnotice-slot" aria-live="polite">
      {shown && (
        <div key={shown.id} className="pnotice" data-tone={shown.tone ?? "info"}>
          {shown.icon}
          <span>{shown.text}</span>
        </div>
      )}
    </div>
  );
}
