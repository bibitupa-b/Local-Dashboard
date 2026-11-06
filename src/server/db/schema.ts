export const SCHEMA = `
CREATE TABLE IF NOT EXISTS vault_files (
  connection_id TEXT NOT NULL DEFAULT 'legacy',
  path TEXT NOT NULL,
  hash TEXT NOT NULL,
  mtime TEXT NOT NULL,
  size INTEGER NOT NULL,
  previous_text TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (connection_id, path)
);

CREATE TABLE IF NOT EXISTS vault_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id TEXT NOT NULL DEFAULT 'legacy',
  path TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  added INTEGER NOT NULL DEFAULT 0,
  removed INTEGER NOT NULL DEFAULT 0,
  diff TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS vault_changes_detected ON vault_changes (detected_at);
CREATE INDEX IF NOT EXISTS vault_changes_connection ON vault_changes (connection_id);

CREATE TABLE IF NOT EXISTS drive_files (
  connection_id TEXT NOT NULL DEFAULT 'legacy',
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  modified_time TEXT NOT NULL,
  parents TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (connection_id, id)
);

CREATE TABLE IF NOT EXISTS drive_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id TEXT NOT NULL DEFAULT 'legacy',
  file_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  detected_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS drive_changes_detected ON drive_changes (detected_at);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id TEXT NOT NULL DEFAULT 'legacy',
  path TEXT NOT NULL,
  text TEXT NOT NULL,
  occurrence INTEGER NOT NULL DEFAULT 0,
  tag TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  UNIQUE (connection_id, path, text, occurrence)
);

CREATE INDEX IF NOT EXISTS tasks_open ON tasks (done, tag);

CREATE TABLE IF NOT EXISTS briefings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  trigger TEXT NOT NULL,
  markdown TEXT NOT NULL,
  digest_meta TEXT NOT NULL DEFAULT '{}',
  body TEXT,
  digest TEXT NOT NULL DEFAULT '',
  feedback TEXT,
  kind TEXT NOT NULL DEFAULT 'daily',
  opens INTEGER NOT NULL DEFAULT 0
);

CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  source UNINDEXED,
  ref UNINDEXED,
  title,
  body,
  date UNINDEXED,
  meta UNINDEXED,
  tokenize = 'unicode61'
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS briefing_feedback (
  briefing_id INTEGER NOT NULL,
  bullet_index INTEGER NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (briefing_id, bullet_index)
);

CREATE TABLE IF NOT EXISTS resurfaced (
  path TEXT PRIMARY KEY,
  last_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mail_folders (
  connection_id TEXT NOT NULL DEFAULT 'legacy',
  path TEXT NOT NULL,
  uid_validity TEXT NOT NULL,
  last_uid INTEGER NOT NULL DEFAULT 0,
  last_sync TEXT,
  PRIMARY KEY (connection_id, path)
);

CREATE TABLE IF NOT EXISTS mail_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id TEXT NOT NULL DEFAULT 'legacy',
  folder TEXT NOT NULL,
  uid INTEGER NOT NULL,
  message_id TEXT,
  in_reply_to TEXT,
  references_json TEXT NOT NULL DEFAULT '[]',
  thread_key TEXT,
  sender TEXT NOT NULL,
  subject TEXT NOT NULL,
  date TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  starred INTEGER NOT NULL DEFAULT 0,
  snippet TEXT NOT NULL DEFAULT '',
  body TEXT,
  attachments TEXT NOT NULL DEFAULT '[]',
  bulk INTEGER NOT NULL DEFAULT 0,
  UNIQUE (connection_id, folder, uid)
);

CREATE INDEX IF NOT EXISTS mail_messages_recent ON mail_messages (folder, date);
CREATE INDEX IF NOT EXISTS mail_messages_unread ON mail_messages (seen, folder);

CREATE TABLE IF NOT EXISTS weather_daily (
  connection_id TEXT NOT NULL DEFAULT 'legacy',
  date TEXT NOT NULL,
  min REAL NOT NULL,
  max REAL NOT NULL,
  precipitation INTEGER NOT NULL DEFAULT 0,
  code INTEGER NOT NULL DEFAULT 0,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (connection_id, date)
);

CREATE TABLE IF NOT EXISTS rss_items (
  connection_id TEXT NOT NULL DEFAULT 'legacy',
  id TEXT NOT NULL,
  feed TEXT NOT NULL,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  published TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (connection_id, id)
);

CREATE INDEX IF NOT EXISTS rss_items_published ON rss_items (published);

CREATE TABLE IF NOT EXISTS slack_mentions (
  connection_id TEXT NOT NULL DEFAULT 'legacy',
  channel_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  is_dm INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (connection_id, channel_id, ts)
);

CREATE TABLE IF NOT EXISTS google_tasks (
  connection_id TEXT NOT NULL DEFAULT 'legacy',
  id TEXT NOT NULL,
  list_id TEXT NOT NULL,
  title TEXT NOT NULL,
  due TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (connection_id, id)
);

CREATE INDEX IF NOT EXISTS google_tasks_due ON google_tasks (due);

CREATE TABLE IF NOT EXISTS calendar_events (
  connection_id TEXT NOT NULL DEFAULT 'legacy',
  id TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  attendees TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (connection_id, id)
);

CREATE INDEX IF NOT EXISTS calendar_events_start ON calendar_events (start);

CREATE TABLE IF NOT EXISTS browser_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id TEXT NOT NULL DEFAULT 'legacy',
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  visited_at TEXT NOT NULL,
  UNIQUE (connection_id, url, visited_at)
);

CREATE INDEX IF NOT EXISTS browser_visits_time ON browser_visits (visited_at);

CREATE TABLE IF NOT EXISTS github_items (
  connection_id TEXT NOT NULL DEFAULT 'legacy',
  id TEXT NOT NULL,
  kind TEXT NOT NULL,
  repo TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (connection_id, id)
);

CREATE TABLE IF NOT EXISTS drive_doc_text (
  connection_id TEXT NOT NULL DEFAULT 'legacy',
  file_id TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (connection_id, file_id)
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
