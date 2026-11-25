import type { ErrorCode } from "@croco/shared";

const STATUS: Partial<Record<ErrorCode, number>> = {
  bad_request: 400,
  validation_failed: 400,
  unauthenticated: 401,
  token_expired: 401,
  session_revoked: 401,
  forbidden: 403,
  email_not_verified: 403,
  account_suspended: 403,
  recent_auth_required: 403,
  mfa_required: 403,
  mfa_not_enrolled: 403,
  step_up_required: 403,
  blocked: 403,
  registration_closed: 403,
  room_creation_closed: 403,
  room_password_invalid: 403,
  turnstile_failed: 403,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  profile_exists: 409,
  username_taken: 409,
  already_in_room: 409,
  already_friends: 409,
  request_pending: 409,
  room_full: 409,
  room_closed: 409,
  not_in_room: 409,
  invitation_expired: 410,
  payload_too_large: 413,
  unsupported_media_type: 415,
  profile_required: 428,
  mfa_invalid: 401,
  room_password_locked: 429,
  rate_limited: 429,
  service_unavailable: 503,
  internal_error: 500,
};

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly fields?: Record<string, string>,
    readonly headers?: Record<string, string>,
  ) {
    super(code);
    this.name = "ApiError";
  }

  get status(): number {
    return STATUS[this.code] ?? 400;
  }
}

export const err = (code: ErrorCode, fields?: Record<string, string>) => new ApiError(code, fields);
