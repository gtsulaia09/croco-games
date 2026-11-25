import { useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { AVATAR_IDS, checkUsername } from "@croco/shared/client";
import { post } from "../lib/api";
import { useSession } from "../store/session";
import { useLocale, useT } from "../i18n";
import { Avatar, ErrorText } from "../components/ui";

export default function Setup() {
  const t = useT();
  const { status, refresh } = useSession();
  const { locale, setLocale } = useLocale();
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState("a01");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  if (status !== "needsProfile") return <Navigate to="/" replace />;

  const local = checkUsername(username);
  const localError = username && !local.ok ? local.error : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!local.ok) return;
    setBusy(true);
    setError(null);
    try {
      await post("/api/me/profile", { username: local.value, avatar, locale });
      await refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="max-w-lg mx-auto mt-6 card p-6 grid gap-5 fade-in">
      <h1 className="text-xl font-bold">{t("setup.title")}</h1>
      <div>
        <label className="label" htmlFor="username">{t("setup.username")}</label>
        <input id="username" className="input" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} autoComplete="nickname" />
        <p className="text-xs text-muted mt-1">{t("setup.usernameHint")}</p>
        {localError && <ErrorText error={localError === "reserved" ? "reserved" : localError === "invalid_characters" ? "invalid_characters" : "validation_failed"} />}
      </div>
      <fieldset>
        <legend className="label">{t("setup.avatar")}</legend>
        <div className="grid grid-cols-8 gap-2">
          {AVATAR_IDS.map((id) => (
            <button type="button" key={id} onClick={() => setAvatar(id)} className={`rounded-full p-0.5 ${avatar === id ? "ring-2 ring-primary" : ""}`} aria-pressed={avatar === id}>
              <Avatar id={id} size={34} />
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <span className="label">{t("setup.language")}</span>
        <div className="flex gap-2">
          {(["ka", "en"] as const).map((l) => (
            <button type="button" key={l} className={locale === l ? "btn-primary btn-sm" : "btn-ghost btn-sm"} onClick={() => setLocale(l)}>
              {l === "ka" ? "ქართული" : "English"}
            </button>
          ))}
        </div>
      </div>
      <ErrorText error={error} />
      <button className="btn-primary h-11" disabled={busy || !local.ok}>
        {t("setup.create")}
      </button>
    </form>
  );
}
