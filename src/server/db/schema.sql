CREATE TABLE IF NOT EXISTS vault_files (
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
