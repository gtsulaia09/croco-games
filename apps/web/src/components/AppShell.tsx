import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { AlertTriangle, Bell, Dumbbell, Globe, Home, LogOut, Settings, Shield, Trophy, Users } from "lucide-react";
import { useSession } from "../store/session";
import { backendConfigured } from "../lib/config";
import { get } from "../lib/api";
import { useLocale, useT } from "../i18n";
import { Avatar, StatusDot } from "./ui";
import { BrandMark } from "./GameArt";

function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  return (
    <button
      className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full bg-surface-2 border border-line text-xs font-bold text-text-2 hover:border-line-strong hover:text-white transition-colors"
      onClick={() => setLocale(locale === "ka" ? "en" : "ka")}
      aria-label="language"
    >
      <Globe size={13} className="text-primary" />
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
    <div className="fixed bottom-20 sm:bottom-4 right-4 z-40 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]" aria-live="polite">
      {liveNotifications.map((n) => (
        <button
          key={n.id}
          className="card p-3.5 text-left text-sm fade-in border-primary/45 hover:border-primary flex items-start gap-2.5"
          onClick={() => dismissLive(n.id)}
        >
          <span className="size-2 mt-1.5 rounded-full bg-primary shrink-0" />
          <span className="flex-1 text-text-2">
            {t(`notifications.kinds.${n.kind}`, { name: n.actor?.username ?? "", room: String(n.data["roomName"] ?? ""), placement: String(n.data["placement"] ?? "") })}
          </span>
        </button>
      ))}
    </div>
  );
}

export function AppShell() {
  const t = useT();
  const navigate = useNavigate();
  const { me, unread, status, signOut } = useSession();
  const [maintenance, setMaintenance] = useState<string | null>(null);
  const isStaff = Boolean(me?.roles.length);

  useEffect(() => {
    if (!backendConfigured) return;
    let cancelled = false;
    void get<{ maintenanceMessage: string | null }>("/api/config/public")
      .then((r) => !cancelled && setMaintenance(r.maintenanceMessage || null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const links = [
    { to: "/", icon: Home, label: t("nav.dashboard"), end: true },
    { to: "/leaderboards", icon: Trophy, label: t("nav.leaderboards") },
    { to: "/friends", icon: Users, label: t("nav.friends") },
    { to: "/practice", icon: Dumbbell, label: t("nav.practice") },
  ];

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1.5 px-3 h-9 rounded-full text-xs xl:text-sm font-semibold whitespace-nowrap transition-all ${
      isActive
        ? "bg-primary/15 text-white border border-primary/40"
        : "text-muted hover:text-white hover:bg-surface/70 border border-transparent"
    }`;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-30 bg-bg-elevated border-b border-line">
        <div className="max-w-7xl mx-auto flex items-center gap-2.5 px-3 sm:px-5 h-14">
          <button className="flex items-center gap-2.5 text-left group shrink-0" onClick={() => navigate("/")}>
            <BrandMark size={30} />
            <span className="hidden sm:flex flex-col leading-none whitespace-nowrap">
              <span className="font-extrabold text-[15px] tracking-tight text-white">
                CROCO <span className="text-primary">GAMES</span>
              </span>
              <span className="text-[10px] font-medium text-muted mt-0.5">{t("app.badge")}</span>
            </span>
          </button>

          <nav className="hidden lg:flex items-center gap-1 ml-3 min-w-0" aria-label="main">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
                <l.icon size={15} className="shrink-0" /> {l.label}
              </NavLink>
            ))}
            {isStaff && (
              <NavLink to="/admin" className={linkClass}>
                <Shield size={15} className="text-gold shrink-0" /> {t("nav.admin")}
              </NavLink>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <LanguageToggle />
            {status === "ready" && (
              <>
                <NavLink
                  to="/notifications"
                  className="relative inline-flex items-center justify-center size-9 rounded-full bg-surface-2 border border-line text-text-2 hover:text-white hover:border-line-strong transition-colors"
                  aria-label={t("nav.notifications")}
                >
                  <Bell size={16} />
                  {unread > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-4.5 h-4.5 px-1 rounded-full bg-primary text-[#04180b] text-[10px] font-extrabold leading-[1.125rem] text-center">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </NavLink>
                <NavLink
                  to="/settings"
                  className="inline-flex items-center gap-2 pl-1 pr-2.5 h-9 rounded-full bg-surface-2 border border-line hover:border-primary/50 transition-colors"
                  aria-label={t("nav.settings")}
                >
                  <Avatar id={me?.profile?.avatar} size={28} />
                  <span className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-white max-w-28 truncate">
                    <StatusDot status="online" />
                    <span className="truncate">{me?.profile?.username}</span>
                  </span>
                </NavLink>
                <button
                  className="hidden sm:inline-flex items-center justify-center size-9 rounded-full bg-surface-2 border border-line text-muted hover:text-danger hover:border-danger/40 transition-colors"
                  onClick={() => void signOut()}
                  aria-label={t("nav.logout")}
                  title={t("nav.logout")}
                >
                  <LogOut size={15} />
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

      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-5 py-3.5 sm:py-5 pb-20 lg:pb-8">
        {maintenance && (
          <div role="status" className="card p-3.5 mb-4 border-warning/50 bg-warning/10 text-sm text-text-2 flex items-center gap-2.5">
            <AlertTriangle size={16} className="text-warning shrink-0" />
            <span>{maintenance}</span>
          </div>
        )}
        <Outlet />
      </main>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-bg-elevated border-t border-line grid grid-cols-5" aria-label="mobile">
        {[...links, isStaff ? { to: "/admin", icon: Shield, label: t("nav.admin") } : { to: "/settings", icon: Settings, label: t("nav.settings") }].map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={"end" in l ? l.end : false}
            className={({ isActive }) =>
              `relative min-w-0 flex flex-col items-center justify-center h-15 text-[11px] font-semibold gap-1 transition-colors ${
                isActive ? "text-primary" : "text-muted"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-primary" />}
                <l.icon size={19} />
                <span className="truncate max-w-full px-1">{l.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      {status === "ready" && <LiveToasts />}
    </div>
  );
}
