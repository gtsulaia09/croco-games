import { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { Bell, Dumbbell, Home, LogOut, Settings, Shield, Trophy, Users } from "lucide-react";
import { useSession } from "../store/session";
import { backendConfigured } from "../lib/config";
import { useLocale, useT } from "../i18n";
import { Avatar } from "./ui";

function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  return (
    <button className="btn-ghost btn-sm" onClick={() => setLocale(locale === "ka" ? "en" : "ka")} aria-label="language">
      {locale === "ka" ? "EN" : "ქარ"}
    </button>
  );
}

function LiveToasts() {
  const { liveNotifications, dismissLive } = useSession();
  const t = useT();
  useEffect(() => {
    if (!liveNotifications.length) return;
    const id = setTimeout(() => dismissLive(liveNotifications[liveNotifications.length - 1]!.id), 6000);
    return () => clearTimeout(id);
  }, [liveNotifications, dismissLive]);
  return (
    <div className="fixed bottom-20 sm:bottom-4 right-4 z-40 flex flex-col gap-2 w-72" aria-live="polite">
      {liveNotifications.map((n) => (
        <button key={n.id} className="card p-3 text-left text-sm fade-in hover:border-primary" onClick={() => dismissLive(n.id)}>
          {t(`notifications.kinds.${n.kind}`, { name: n.actor?.username ?? "", room: String(n.data["roomName"] ?? ""), placement: String(n.data["placement"] ?? "") })}
        </button>
      ))}
    </div>
  );
}

export function AppShell() {
  const t = useT();
  const navigate = useNavigate();
  const { me, unread, status, signOut } = useSession();
  const isStaff = Boolean(me?.roles.length);
  const links = [
    { to: "/", icon: Home, label: t("nav.dashboard"), end: true },
    { to: "/leaderboards", icon: Trophy, label: t("nav.leaderboards") },
    { to: "/friends", icon: Users, label: t("nav.friends") },
    { to: "/practice", icon: Dumbbell, label: t("nav.practice") },
  ];
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 h-9 rounded-full text-sm ${isActive ? "bg-surface text-white" : "text-muted hover:text-white"}`;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-30 bg-bg/95 border-b border-line">
        <div className="max-w-7xl mx-auto flex items-center gap-3 px-3 sm:px-5 h-14">
          <button className="flex items-center gap-2 font-bold text-white" onClick={() => navigate("/")}>
            <img src="./icon.svg" alt="" width={28} height={28} />
            <span className="hidden sm:inline">Croco Games</span>
          </button>
          <nav className="hidden md:flex items-center gap-1 ml-4" aria-label="main">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
                <l.icon size={16} /> {l.label}
              </NavLink>
            ))}
            {isStaff && (
              <NavLink to="/admin" className={linkClass}>
                <Shield size={16} /> {t("nav.admin")}
              </NavLink>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <LanguageToggle />
            {status === "ready" && (
              <>
                <NavLink to="/notifications" className="btn-ghost btn-sm relative" aria-label={t("nav.notifications")}>
                  <Bell size={18} />
                  {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-[10px] leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}
                </NavLink>
                <NavLink to="/settings" className="btn-ghost btn-sm" aria-label={t("nav.settings")}>
                  <Avatar id={me?.profile?.avatar} size={26} />
                </NavLink>
                <button className="btn-ghost btn-sm hidden sm:inline-flex" onClick={() => void signOut()} aria-label={t("nav.logout")}>
                  <LogOut size={16} />
                </button>
              </>
            )}
            {status === "signedOut" && backendConfigured && (
              <NavLink to="/login" className="btn-primary btn-sm">
                {t("nav.login")}
              </NavLink>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-5 py-4 pb-24 md:pb-6">
        <Outlet />
      </main>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface-2 border-t border-line grid grid-cols-5" aria-label="mobile">
        {[...links, isStaff ? { to: "/admin", icon: Shield, label: t("nav.admin") } : { to: "/settings", icon: Settings, label: t("nav.settings") }].map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={"end" in l ? l.end : false}
            className={({ isActive }) => `flex flex-col items-center justify-center h-16 text-[11px] gap-1 ${isActive ? "text-primary" : "text-muted"}`}
          >
            <l.icon size={20} />
            {l.label}
          </NavLink>
        ))}
      </nav>
      {status === "ready" && <LiveToasts />}
    </div>
  );
}
