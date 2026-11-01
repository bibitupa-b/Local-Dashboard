export const SCHEMA = `CREATE TABLE IF NOT EXISTS vault_files (
  path TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  mtime TEXT NOT NULL,
  size INTEGER NOT NULL,
  previous_text TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS vault_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  added INTEGER NOT NULL DEFAULT 0,
  removed INTEGER NOT NULL DEFAULT 0,
  diff TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS vault_changes_detected ON vault_changes (detected_at);

CREATE TABLE IF NOT EXISTS drive_files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  modified_time TEXT NOT NULL,
  parents TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS drive_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  detected_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS drive_changes_detected ON drive_changes (detected_at);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  text TEXT NOT NULL,
  occurrence INTEGER NOT NULL DEFAULT 0,
  tag TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  UNIQUE (path, text, occurrence)
);

CREATE INDEX IF NOT EXISTS tasks_open ON tasks (done, tag);

CREATE TABLE IF NOT EXISTS briefings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  trigger TEXT NOT NULL,
  markdown TEXT NOT NULL,
  digest_meta TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mail_folders (
  path TEXT PRIMARY KEY,
  uid_validity TEXT NOT NULL,
  last_uid INTEGER NOT NULL DEFAULT 0,
  last_sync TEXT
);

CREATE TABLE IF NOT EXISTS mail_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder TEXT NOT NULL,
  uid INTEGER NOT NULL,
  message_id TEXT,
  sender TEXT NOT NULL,
  subject TEXT NOT NULL,
  date TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  starred INTEGER NOT NULL DEFAULT 0,
  snippet TEXT NOT NULL DEFAULT '',
  body TEXT,
  attachments TEXT NOT NULL DEFAULT '[]',
  bulk INTEGER NOT NULL DEFAULT 0,
  UNIQUE (folder, uid)
);

CREATE INDEX IF NOT EXISTS mail_messages_recent ON mail_messages (folder, date);
CREATE INDEX IF NOT EXISTS mail_messages_unread ON mail_messages (seen, folder);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed'
);

CREATE INDEX IF NOT EXISTS calendar_events_start ON calendar_events (start);

CREATE TABLE IF NOT EXISTS browser_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  visited_at TEXT NOT NULL,
  UNIQUE (url, visited_at)
);

CREATE INDEX IF NOT EXISTS browser_visits_time ON browser_visits (visited_at);

CREATE TABLE IF NOT EXISTS github_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  repo TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drive_doc_text (
  file_id TEXT PRIMARY KEY,
  text TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  service TEXT NOT NULL,
  label TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  secret TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS connections_service ON connections (service);
`
