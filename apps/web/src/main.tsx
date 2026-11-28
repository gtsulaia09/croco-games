import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// After a deploy, a tab that was already open still points at the previous build's file names.
// Those files are gone, so opening another screen fails to load its code (Vite reports this as
// "vite:preloadError"). Reload into the new build instead of showing an error page — at most
// once a minute, so a file that is really missing cannot cause a reload loop.
window.addEventListener("vite:preloadError", () => {
  const key = "croco:reloaded-for-new-build";
  try {
    if (Date.now() - Number(sessionStorage.getItem(key) ?? 0) < 60_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    return; // No storage to remember the reload: show the error rather than risk a loop.
  }
  window.location.reload();
});

// Clickjacking defence for hosts that cannot send frame-ancestors (e.g. GitHub Pages):
// refuse to render inside any frame.
if (window.top !== window.self) {
  document.body.textContent = "";
} else {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => undefined);
    });
  }
}
