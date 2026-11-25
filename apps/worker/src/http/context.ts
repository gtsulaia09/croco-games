import type { Context } from "hono";
import type { VerifiedFirebaseToken } from "@croco/security";
import type { AppConfig, Env } from "../env";

export type Role = "admin" | "moderator";

export interface UserRow {
  id: string;
  firebase_uid: string;
  email: string | null;
  sign_in_provider: string;
  status: "active" | "suspended" | "deleted";
  suspended_until: number | null;
  sessions_valid_after: number;
  created_at: number;
  last_seen_at: number;
  username: string | null;
  avatar: string | null;
  locale: "ka" | "en" | null;
  show_online: number | null;
  profile_created_at: number | null;
}

export interface SessionRow {
  id: string;
  user_id: string;
  auth_time: number;
  last_seen_at: number;
  revoked_at: number | null;
  country: string | null;
}

export interface AuthState {
  token: VerifiedFirebaseToken;
  user: UserRow;
  session: SessionRow;
  roles: Set<Role>;
  identityVerified: boolean;
}

export interface Variables {
  requestId: string;
  config: AppConfig;
  ip: string;
  ipHash: string;
  country: string | null;
  auth: AuthState;
}

export type AppEnv = { Bindings: Env; Variables: Variables };
export type Ctx = Context<AppEnv>;
