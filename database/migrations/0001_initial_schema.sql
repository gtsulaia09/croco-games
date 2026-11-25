-- Croco Games — initial schema (Cloudflare D1 / SQLite).
-- Security notes:
--  * No passwords, password hashes, ID tokens or provider secrets are stored here.
--  * Firebase UIDs and emails are never returned by public API endpoints.
--  * The admin audit log is append-only (triggers below) and hash-chained by the Worker.
--  * All application queries use prepared statements with bound parameters.

CREATE TABLE users (
  id                    TEXT PRIMARY KEY CHECK (id GLOB 'u_*'),
  firebase_uid          TEXT NOT NULL UNIQUE CHECK (length(firebase_uid) BETWEEN 1 AND 128),
  email                 TEXT CHECK (email IS NULL OR length(email) <= 320),
  sign_in_provider      TEXT NOT NULL CHECK (sign_in_provider IN ('password', 'google.com', 'facebook.com')),
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  suspended_until       INTEGER,
  suspension_reason     TEXT,
  sessions_valid_after  INTEGER NOT NULL DEFAULT 0,
  created_at            INTEGER NOT NULL,
  last_seen_at          INTEGER NOT NULL
);

CREATE TABLE profiles (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username      TEXT NOT NULL CHECK (length(username) BETWEEN 3 AND 40),
  username_key  TEXT NOT NULL UNIQUE,
  avatar        TEXT NOT NULL CHECK (avatar GLOB 'a[0-9][0-9]'),
  locale        TEXT NOT NULL DEFAULT 'ka' CHECK (locale IN ('ka', 'en')),
  show_online   INTEGER NOT NULL DEFAULT 1 CHECK (show_online IN (0, 1)),
  created_at    INTEGER NOT NULL
);

CREATE TABLE roles (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'moderator')),
  granted_by  TEXT,
  granted_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, role)
);

CREATE TABLE user_sessions (
  id            TEXT PRIMARY KEY CHECK (id GLOB 's_*'),
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_time     INTEGER NOT NULL,
  provider      TEXT NOT NULL,
  device        TEXT NOT NULL,
  country       TEXT,
  ip_hash       TEXT,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  revoked_at    INTEGER,
  UNIQUE (user_id, auth_time)
);
CREATE INDEX user_sessions_user ON user_sessions(user_id, last_seen_at DESC);

CREATE TABLE admin_mfa (
  user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_enc      TEXT NOT NULL,
  key_version     INTEGER NOT NULL,
  enrolled_at     INTEGER,
  last_used_step  INTEGER,
  created_at      INTEGER NOT NULL
);

CREATE TABLE admin_recovery_codes (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  used_at     INTEGER,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, code_hash)
);

CREATE TABLE admin_step_up (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_time   INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX admin_step_up_user ON admin_step_up(user_id);

CREATE TABLE friend_requests (
  id            TEXT PRIMARY KEY CHECK (id GLOB 'fr_*'),
  from_user     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at    INTEGER NOT NULL,
  responded_at  INTEGER,
  CHECK (from_user <> to_user)
);
CREATE UNIQUE INDEX friend_requests_one_pending ON friend_requests(from_user, to_user) WHERE status = 'pending';
CREATE INDEX friend_requests_to ON friend_requests(to_user, status);

CREATE TABLE friends (
  user_a      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);
CREATE INDEX friends_b ON friends(user_b);

CREATE TABLE blocks (
  blocker     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (blocker, blocked),
  CHECK (blocker <> blocked)
);
CREATE INDEX blocks_blocked ON blocks(blocked);

CREATE TABLE game_types (
  id       TEXT PRIMARY KEY,
  family   TEXT NOT NULL,
  enabled  INTEGER NOT NULL DEFAULT 1
);
INSERT INTO game_types (id, family) VALUES
  ('joker', 'joker'), ('japanese_joker', 'joker'), ('bura3', 'bura'), ('bura5', 'bura'),
  ('holdem', 'poker'), ('shortdeck', 'poker'), ('omaha', 'poker'), ('omaha_hilo', 'poker'),
  ('dominoes', 'dominoes'), ('backgammon', 'backgammon');

CREATE TABLE rooms (
  id                TEXT PRIMARY KEY CHECK (id GLOB 'r_*'),
  game_type         TEXT NOT NULL REFERENCES game_types(id),
  name              TEXT NOT NULL,
  name_key          TEXT NOT NULL,
  visibility        TEXT NOT NULL CHECK (visibility IN ('public', 'private', 'invite')),
  has_password      INTEGER NOT NULL CHECK (has_password IN (0, 1)),
  host_id           TEXT NOT NULL REFERENCES users(id),
  players           INTEGER NOT NULL DEFAULT 0,
  max_players       INTEGER NOT NULL,
  spectators        INTEGER NOT NULL DEFAULT 0,
  allow_spectators  INTEGER NOT NULL CHECK (allow_spectators IN (0, 1)),
  phase             TEXT NOT NULL CHECK (phase IN ('waiting', 'playing', 'finished', 'closed')),
  stage             TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX rooms_browse ON rooms(game_type, phase, updated_at DESC);
CREATE INDEX rooms_host ON rooms(host_id, created_at DESC);

CREATE TABLE room_members (
  room_id    TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('player', 'spectator')),
  seat       INTEGER,
  joined_at  INTEGER NOT NULL,
  left_at    INTEGER,
  PRIMARY KEY (room_id, user_id)
);
-- A user can be an active member of at most one room at a time.
CREATE UNIQUE INDEX room_members_one_active ON room_members(user_id) WHERE left_at IS NULL;

CREATE TABLE invitations (
  id            TEXT PRIMARY KEY CHECK (id GLOB 'inv_*'),
  room_id       TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  from_user     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  responded_at  INTEGER
);
CREATE UNIQUE INDEX invitations_one_pending ON invitations(room_id, to_user) WHERE status = 'pending';
CREATE INDEX invitations_to ON invitations(to_user, created_at DESC);

CREATE TABLE invite_links (
  code_hash   TEXT PRIMARY KEY,
  room_id     TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  created_by  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  uses        INTEGER NOT NULL DEFAULT 0,
  max_uses    INTEGER NOT NULL
);

CREATE TABLE game_sessions (
  id           TEXT PRIMARY KEY CHECK (id GLOB 'm_*'),
  room_id      TEXT NOT NULL,
  game_type    TEXT NOT NULL REFERENCES game_types(id),
  status       TEXT NOT NULL CHECK (status IN ('active', 'finished', 'void')),
  rated        INTEGER NOT NULL DEFAULT 0,
  players      INTEGER NOT NULL,
  humans       INTEGER NOT NULL,
  started_at   INTEGER NOT NULL,
  finished_at  INTEGER,
  final_rev    INTEGER
);
CREATE INDEX game_sessions_finished ON game_sessions(game_type, finished_at DESC);

-- Public event log of a finished match (one compact row per match to bound D1 writes).
CREATE TABLE match_events (
  match_id     TEXT PRIMARY KEY REFERENCES game_sessions(id) ON DELETE CASCADE,
  events_json  TEXT NOT NULL,
  truncated    INTEGER NOT NULL DEFAULT 0
);

-- Match history / participants (bots have NULL user_id).
CREATE TABLE match_participants (
  match_id       TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  seat           INTEGER NOT NULL,
  user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_bot         INTEGER NOT NULL CHECK (is_bot IN (0, 1)),
  forfeited      INTEGER NOT NULL DEFAULT 0,
  placement      INTEGER NOT NULL,
  score          INTEGER NOT NULL,
  rating_before  INTEGER,
  rating_after   INTEGER,
  rating_delta   INTEGER,
  finished_at    INTEGER NOT NULL,
  game_type      TEXT NOT NULL,
  PRIMARY KEY (match_id, seat)
);
CREATE INDEX match_participants_user ON match_participants(user_id, finished_at DESC);
CREATE INDEX match_participants_game ON match_participants(game_type, finished_at DESC);

-- Per-game statistics and server-computed ratings (player_statistics + game_ratings).
CREATE TABLE game_ratings (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_type   TEXT NOT NULL REFERENCES game_types(id),
  rating      INTEGER NOT NULL DEFAULT 1500,
  matches     INTEGER NOT NULL DEFAULT 0,
  rated       INTEGER NOT NULL DEFAULT 0,
  wins        INTEGER NOT NULL DEFAULT 0,
  draws       INTEGER NOT NULL DEFAULT 0,
  losses      INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, game_type)
);
CREATE INDEX game_ratings_board ON game_ratings(game_type, rating DESC);

CREATE TABLE notifications (
  id          TEXT PRIMARY KEY CHECK (id GLOB 'n_*'),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  actor_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  data_json   TEXT NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL,
  read_at     INTEGER
);
CREATE INDEX notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE reports (
  id                TEXT PRIMARY KEY CHECK (id GLOB 'rp_*'),
  reporter_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  room_id           TEXT,
  message_id        TEXT,
  message_snapshot  TEXT,
  reason            TEXT NOT NULL,
  details           TEXT,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned')),
  created_at        INTEGER NOT NULL,
  resolved_by       TEXT,
  resolved_at       INTEGER,
  note              TEXT
);
CREATE INDEX reports_status ON reports(status, created_at DESC);
CREATE INDEX reports_reporter ON reports(reporter_id, created_at DESC);

CREATE TABLE integrity_flags (
  id           TEXT PRIMARY KEY CHECK (id GLOB 'if_*'),
  match_id     TEXT,
  user_id      TEXT,
  kind         TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned')),
  created_at   INTEGER NOT NULL,
  resolved_by  TEXT,
  resolved_at  INTEGER,
  note         TEXT
);
CREATE INDEX integrity_flags_status ON integrity_flags(status, created_at DESC);

CREATE TABLE security_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            INTEGER NOT NULL,
  kind          TEXT NOT NULL,
  user_id       TEXT,
  ip_hash       TEXT,
  country       TEXT,
  details_json  TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX security_events_kind ON security_events(kind, ts DESC);
CREATE INDEX security_events_user ON security_events(user_id, ts DESC);

-- Append-only administrative audit log with a SHA-256 hash chain (computed by the Worker).
CREATE TABLE admin_audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            INTEGER NOT NULL,
  actor_id      TEXT NOT NULL,
  action        TEXT NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  details_json  TEXT NOT NULL DEFAULT '{}',
  ip_hash       TEXT,
  prev_hash     TEXT NOT NULL,
  hash          TEXT NOT NULL UNIQUE
);
CREATE TRIGGER admin_audit_logs_no_update BEFORE UPDATE ON admin_audit_logs
BEGIN
  SELECT RAISE(ABORT, 'admin_audit_logs is append-only');
END;
-- Rows younger than 365 days can never be deleted (retention window).
CREATE TRIGGER admin_audit_logs_retention BEFORE DELETE ON admin_audit_logs
WHEN OLD.ts > (CAST(strftime('%s', 'now') AS INTEGER) - 31536000) * 1000
BEGIN
  SELECT RAISE(ABORT, 'admin_audit_logs rows are retained for 365 days');
END;

CREATE TABLE platform_settings (
  key         TEXT PRIMARY KEY,
  value_json  TEXT NOT NULL,
  updated_by  TEXT,
  updated_at  INTEGER NOT NULL
);
