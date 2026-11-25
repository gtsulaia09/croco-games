import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { AVATAR_IDS, checkUsername } from "@croco/shared/client";
import { post } from "../lib/api";
import { config } from "../lib/config";
import { useSession } from "../store/session";
import { useLocale, useT } from "../i18n";
import { Avatar, ErrorText } from "../components/ui";
import { BrandMark } from "../components/GameArt";

declare global {
  interface Window {
    turnstile?: {
      render(container: HTMLElement, opts: { sitekey: string; theme?: "dark"; callback: (token: string) => void; "expired-callback"?: () => void }): string;
      remove(widgetId: string): void;
    };
  }
}

export default function Setup() {
  const t = useT();
  const { status, refresh } = useSession();
  const { locale, setLocale } = useLocale();
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState("a01");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const siteKey = config.turnstileSiteKey;

  useEffect(() => {
    if (!siteKey || !turnstileRef.current) return;
    let widgetId: string | null = null;
    let cancelled = false;
    const mount = () => {
      if (cancelled || !turnstileRef.current || !window.turnstile) return;
      widgetId = window.turnstile.render(turnstileRef.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: (tok) => setTurnstileToken(tok),
        "expired-callback": () => setTurnstileToken(null),
      });
    };
    if (window.turnstile) {
      mount();
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", mount);
      document.head.appendChild(script);
    }
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey]);

  if (status !== "needsProfile") return <Navigate to="/" replace />;

  const local = checkUsername(username);
  const localError = username && !local.ok ? local.error : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!local.ok) return;
    setBusy(true);
    setError(null);
    try {
      await post("/api/me/profile", {
        username: local.value,
        avatar,
        locale,
        ...(turnstileToken ? { turnstileToken } : {}),
      });
      await refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="max-w-lg mx-auto mt-6 card overflow-hidden fade-in">
      <div className="bg-gradient-to-br from-[#0e3627] via-surface-2 to-surface px-6 py-5 border-b border-line flex items-center gap-3.5">
        <BrandMark size={38} />
        <div>
          <h1 className="text-xl font-black text-white">{t("setup.title")}</h1>
          <p className="text-xs text-muted">{t("app.tagline")}</p>
        </div>
      </div>
      <div className="p-6 grid gap-5">
        <div className="flex items-center gap-3.5 rounded-xl bg-surface-3 border border-line p-3">
          <Avatar id={avatar} size={50} ring="primary" />
          <div className="min-w-0">
            <div className="font-bold text-white truncate">{username.trim() || t("setup.username")}</div>
            <div className="text-xs text-muted">{locale === "ka" ? "ქართული" : "English"}</div>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="username">{t("setup.username")}</label>
          <input id="username" className="input" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} autoComplete="nickname" />
          <p className="text-xs text-muted mt-1.5">{t("setup.usernameHint")}</p>
          {localError && <div className="mt-2"><ErrorText error={localError === "reserved" ? "reserved" : localError === "invalid_characters" ? "invalid_characters" : "validation_failed"} /></div>}
        </div>
        <fieldset>
          <legend className="label">{t("setup.avatar")}</legend>
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 p-2.5 rounded-xl bg-surface-3 border border-line">
            {AVATAR_IDS.map((id) => (
              <button
                type="button"
                key={id}
                onClick={() => setAvatar(id)}
                className={`rounded-full p-0.5 transition-transform hover:scale-105 ${avatar === id ? "ring-2 ring-primary bg-primary/15" : ""}`}
                aria-pressed={avatar === id}
              >
                <Avatar id={id} size={36} />
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <span className="label">{t("setup.language")}</span>
          <div className="flex gap-2">
            {(["ka", "en"] as const).map((l) => (
              <button type="button" key={l} className={locale === l ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setLocale(l)}>
                {l === "ka" ? "ქართული" : "English"}
              </button>
            ))}
          </div>
        </div>
        {siteKey && <div ref={turnstileRef} />}
        <ErrorText error={error} />
        <button className="btn-primary h-11 w-full" disabled={busy || !local.ok || Boolean(siteKey && !turnstileToken)}>
          {t("setup.create")}
        </button>
      </div>
    </form>
  );
}
