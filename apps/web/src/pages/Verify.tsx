import { useState } from "react";
import { Navigate } from "react-router";
import { MailCheck } from "lucide-react";
import { reloadUser, resendVerification } from "../lib/firebase";
import { useSession } from "../store/session";
import { useT } from "../i18n";

export default function Verify() {
  const t = useT();
  const { status, email, refresh, signOut } = useSession();
  const [note, setNote] = useState<string | null>(null);
  if (status !== "needsVerification") return <Navigate to="/" replace />;
  return (
    <div className="max-w-md mx-auto mt-8 card overflow-hidden fade-in">
      <div className="p-6 text-center bg-gradient-to-br from-[#0e3627] via-surface-2 to-surface border-b border-line">
        <span className="size-12 rounded-2xl bg-primary/15 border border-primary/35 text-primary inline-flex items-center justify-center mb-3">
          <MailCheck size={24} />
        </span>
        <h1 className="text-xl font-black text-white">{t("auth.verifyTitle")}</h1>
      </div>
      <div className="p-6 grid gap-4">
        <p className="text-sm text-text-2 leading-relaxed">{t("auth.verifyBody", { email: email ?? "" })}</p>
        {note && (
          <p className="text-sm text-primary bg-primary/10 border border-primary/30 rounded-xl px-3 py-2" role="status">
            {note}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary flex-1"
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
    </div>
  );
}
