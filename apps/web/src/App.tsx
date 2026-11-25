import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { createHashRouter, Navigate, RouterProvider } from "react-router";
import { AppShell } from "./components/AppShell";
import { Spinner } from "./components/ui";
import { useSession } from "./store/session";
import { useLocale, useT } from "./i18n";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Login = lazy(() => import("./pages/Login"));
const Verify = lazy(() => import("./pages/Verify"));
const Setup = lazy(() => import("./pages/Setup"));
const Rooms = lazy(() => import("./pages/Rooms"));
const RoomPage = lazy(() => import("./pages/RoomPage"));
const Leaderboards = lazy(() => import("./pages/Leaderboards"));
const Friends = lazy(() => import("./pages/Friends"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Settings = lazy(() => import("./pages/Settings"));
const Admin = lazy(() => import("./pages/Admin"));
const Practice = lazy(() => import("./pages/Practice"));
const Invite = lazy(() => import("./pages/Invite"));

/** Client-side routing guard (UX only — every permission is enforced by the server). */
function RequireReady({ children }: { children: ReactNode }) {
  const status = useSession((s) => s.status);
  const t = useT();
  switch (status) {
    case "loading":
      return <Spinner />;
    case "unconfigured":
      return <Navigate to="/practice" replace />;
    case "signedOut":
      return <Navigate to="/login" replace />;
    case "needsVerification":
      return <Navigate to="/verify" replace />;
    case "needsProfile":
      return <Navigate to="/setup" replace />;
    case "suspended":
      return <p className="card p-6 text-center">{t("errors.account_suspended")}</p>;
    case "error":
      return <p className="card p-6 text-center">{t("errors.service_unavailable")}</p>;
    default:
      return <>{children}</>;
  }
}

const page = (el: ReactNode, guarded = true) => <Suspense fallback={<Spinner />}>{guarded ? <RequireReady>{el}</RequireReady> : el}</Suspense>;

const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: page(<Dashboard />, false) },
      { path: "/login", element: page(<Login />, false) },
      { path: "/verify", element: page(<Verify />, false) },
      { path: "/setup", element: page(<Setup />, false) },
      { path: "/games/:gameType", element: page(<Rooms />) },
      { path: "/room/:roomId", element: page(<RoomPage />) },
      { path: "/invite/:code", element: page(<Invite />) },
      { path: "/leaderboards", element: page(<Leaderboards />) },
      { path: "/leaderboards/:gameType", element: page(<Leaderboards />) },
      { path: "/friends", element: page(<Friends />) },
      { path: "/notifications", element: page(<Notifications />) },
      { path: "/settings", element: page(<Settings />) },
      { path: "/admin", element: page(<Admin />) },
      { path: "/practice", element: page(<Practice />, false) },
      { path: "/practice/:gameType", element: page(<Practice />, false) },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  const init = useSession((s) => s.init);
  const locale = useLocale((s) => s.locale);
  useEffect(() => {
    void init();
  }, [init]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    const syncVisibility = () => {
      document.documentElement.dataset["hidden"] = document.hidden ? "true" : "false";
    };
    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);
  return <RouterProvider router={router} />;
}
