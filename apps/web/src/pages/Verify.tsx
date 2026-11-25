import { useState } from "react";
import { Navigate } from "react-router";
import { reloadUser, resendVerification } from "../lib/firebase";
import { useSession } from "../store/session";
import { useT } from "../i18n";

export default function Verify() {
  const t = useT();
  const { status, email, refresh, signOut } = useSession();
  const [note, setNote] = useState<string | null>(null);
  if (status !== "needsVerification") return <Navigate to="/" replace />;
  return (
    <div className="max-w-md mx-auto mt-6 card p-6 fade-in grid gap-4">
      <h1 className="text-xl font-bold">{t("auth.verifyTitle")}</h1>
      <p className="text-sm text-text-2">{t("auth.verifyBody", { email: email ?? "" })}</p>
      {note && <p className="text-sm text-primary" role="status">{note}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          className="btn-primary"
          onClick={async () => {
            const user = await reloadUser();
            if (user?.emailVerified) await refresh();
          }}
        >
          {t("auth.iVerified")}
        </button>
        <button
          className="btn-secondary"
          onClick={async () => {
            await resendVerification().catch(() => undefined);
            setNote(t("auth.resent"));
          }}
        >
          {t("auth.resend")}
        </button>
        <button className="btn-ghost" onClick={() => void signOut()}>
          {t("nav.logout")}
        </button>
      </div>
    </div>
  );
}
