import { useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { Lock, Mail } from "lucide-react";
import { useSession } from "../store/session";
import { backendConfigured, config } from "../lib/config";
import { registerWithEmail, requestPasswordReset, signInWithEmail, signInWithProvider } from "../lib/firebase";
import { useT } from "../i18n";
import { BrandMark } from "../components/GameArt";

export default function Login() {
  const t = useT();
  const status = useSession((s) => s.status);
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!backendConfigured) return <Navigate to="/practice" replace />;
  if (status === "ready" || status === "needsProfile" || status === "needsVerification") return <Navigate to="/" replace />;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      // Generic messages only: never reveal whether an account exists.
      setError(code.includes("popup") ? t("auth.popupBlocked") : t("auth.genericError"));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "reset") {
      await run(async () => {
        await requestPasswordReset(email);
        setMessage(t("auth.resetSent"));
      });
      return;
    }
    if (mode === "register" && password.length < 10) {
      setError(t("auth.weakPassword"));
      return;
    }
    await run(() => (mode === "login" ? signInWithEmail(email, password) : registerWithEmail(email, password)));
  }

  return (
    <div className="max-w-md mx-auto mt-6 card overflow-hidden fade-in">
      <div className="bg-gradient-to-br from-[#0e3627] via-surface-2 to-surface px-6 pt-6 pb-5 border-b border-line text-center">
        <div className="inline-flex justify-center mb-3">
          <BrandMark size={44} />
        </div>
        <h1 className="text-xl font-black tracking-tight text-white">{t("auth.title")}</h1>
        <p className="text-xs sm:text-sm text-muted mt-1">{t("auth.subtitle")}</p>
      </div>
      <div className="p-6">
        <div className="grid gap-2.5">
          <button className="btn-secondary h-11 w-full" disabled={busy} onClick={() => void run(() => signInWithProvider("google"))}>
            {t("auth.google")}
          </button>
          {config.facebookLogin && (
            <button className="btn-secondary h-11 w-full" disabled={busy} onClick={() => void run(() => signInWithProvider("facebook"))}>
              {t("auth.facebook")}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 my-5 text-xs text-muted uppercase tracking-wider">
          <span className="h-px bg-line flex-1" /> {t("auth.or")} <span className="h-px bg-line flex-1" />
        </div>
        <form onSubmit={(e) => void submit(e)} className="grid gap-3.5" noValidate>
          <div>
            <label className="label" htmlFor="email">{t("auth.email")}</label>
            <div className="relative">
              <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input id="email" className="input pl-10" type="email" autoComplete="email" required maxLength={320} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          {mode !== "reset" && (
            <div>
              <label className="label" htmlFor="password">{t("auth.password")}</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  id="password"
                  className="input pl-10"
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  minLength={mode === "register" ? 10 : 1}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-xl px-3 py-2">{error}</p>}
          {message && <p role="status" className="text-sm text-primary bg-primary/10 border border-primary/30 rounded-xl px-3 py-2">{message}</p>}
          <button className="btn-primary h-11 w-full" disabled={busy || !email}>
            {mode === "login" ? t("auth.login") : mode === "register" ? t("auth.register") : t("common.send")}
          </button>
        </form>
        <div className="flex flex-wrap justify-between gap-2 mt-5 pt-4 border-t border-line/70 text-xs font-semibold">
          <button className="text-primary hover:underline" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? `${t("auth.noAccount")} ${t("auth.register")}` : `${t("auth.haveAccount")} ${t("auth.login")}`}
          </button>
          {mode === "login" && (
            <button className="text-muted hover:text-white hover:underline" onClick={() => setMode("reset")}>
              {t("auth.forgot")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
