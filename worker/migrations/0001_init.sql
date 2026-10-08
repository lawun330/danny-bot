CREATE TABLE users (
  telegram_id INTEGER PRIMARY KEY,
  nickname TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  currency TEXT NOT NULL DEFAULT 'MMK',
  spreadsheet_id TEXT,
  sheet_id INTEGER,
  sheet_title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  telegram_id INTEGER PRIMARY KEY,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);
