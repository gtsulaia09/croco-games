import { create } from "zustand";
import type { MeResponse, NotificationDto, PresenceStatus, ServerLobbyMessage } from "@croco/shared/client";
import { ApiError, clearStepUp, get } from "../lib/api";
import { backendConfigured } from "../lib/config";
import { onAuthChange, signOutFirebase } from "../lib/firebase";
import { TicketSocket } from "../lib/socket";
import { useLocale } from "../i18n";

export type SessionStatus = "loading" | "unconfigured" | "signedOut" | "needsVerification" | "needsProfile" | "ready" | "suspended" | "error";

interface SessionState {
  status: SessionStatus;
  email: string | null;
  provider: string | null;
  me: MeResponse | null;
  unread: number;
  liveNotifications: NotificationDto[];
  presence: Record<string, PresenceStatus>;
  init(): Promise<void>;
  refresh(): Promise<void>;
  signOut(): Promise<void>;
  bumpUnread(delta: number): void;
  dismissLive(id: string): void;
}

let lobby: TicketSocket<ServerLobbyMessage> | null = null;
let started = false;

function startLobby(set: (p: Partial<SessionState>) => void, getState: () => SessionState): void {
  if (lobby) return;
  lobby = new TicketSocket<ServerLobbyMessage>(
    "/api/lobby/ticket",
    "/api/lobby/ws",
    (msg) => {
      if (msg.type === "hello") set({ unread: msg.unread });
      if (msg.type === "notification") {
        const st = getState();
        set({ liveNotifications: [msg.notification, ...st.liveNotifications].slice(0, 5), unread: st.unread + (msg.notification.kind === "friend_online" ? 0 : 1) });
      }
      if (msg.type === "presence") set({ presence: { ...getState().presence, [msg.userId]: msg.status } });
    },
    () => undefined,
  );
  void lobby.connect();
  // Report "away" when the tab is hidden for a while (presence status).
  document.addEventListener("visibilitychange", () => {
    lobby?.send({ type: "presence.set", status: document.hidden ? "away" : "online" });
  });
}

function stopLobby(): void {
  lobby?.close();
  lobby = null;
}

export const useSession = create<SessionState>((set, getState) => ({
  status: backendConfigured ? "loading" : "unconfigured",
  email: null,
  provider: null,
  me: null,
  unread: 0,
  liveNotifications: [],
  presence: {},

  async init() {
    if (!backendConfigured || started) return;
    started = true;
    await onAuthChange(async (user) => {
      if (!user) {
        stopLobby();
        clearStepUp();
        set({ status: "signedOut", me: null, email: null, provider: null });
        return;
      }
      const provider = user.providerData[0]?.providerId ?? "password";
      set({ email: user.email, provider });
      if (provider === "password" && !user.emailVerified) {
        set({ status: "needsVerification" });
        return;
      }
      await getState().refresh();
    });
  },

  async refresh() {
    try {
      const me = await get<MeResponse>("/api/me");
      set({ me, status: me.profile ? "ready" : "needsProfile" });
      if (me.profile) {
        if (me.profile.locale !== useLocale.getState().locale) useLocale.getState().setLocale(me.profile.locale);
        startLobby(set, getState);
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === "account_suspended") set({ status: "suspended" });
      else if (e instanceof ApiError && (e.code === "session_revoked" || e.code === "unauthenticated")) {
        await signOutFirebase();
      } else set({ status: "error" });
    }
  },

  async signOut() {
    stopLobby();
    clearStepUp();
    await signOutFirebase();
    set({ status: "signedOut", me: null });
  },

  bumpUnread(delta) {
    set({ unread: Math.max(0, getState().unread + delta) });
  },

  dismissLive(id) {
    set({ liveNotifications: getState().liveNotifications.filter((n) => n.id !== id) });
  },
}));
