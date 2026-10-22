-- bdnumbers initial schema

CREATE TABLE series (
  key         TEXT PRIMARY KEY,
  name_bn     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  unit        TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url  TEXT NOT NULL,
  cadence     TEXT NOT NULL,
  -- source module that produces the series; used to flag its points stale when a run fails
  source_key  TEXT NOT NULL
);

CREATE TABLE points (
  series_key TEXT NOT NULL,
  -- Dhaka-local YYYY-MM-DD (or YYYY-MM-DDTHH:MM for hourly series), so text order is time order
  date       TEXT NOT NULL,
  value      REAL NOT NULL,
  meta       TEXT CHECK (meta IS NULL OR json_valid(meta)),
  fetched_at TEXT NOT NULL,
  stale      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (series_key, date)
);

-- /api/changes.json looks up what was fetched today
CREATE INDEX points_fetched_at ON points (fetched_at);

CREATE TABLE runs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at     TEXT NOT NULL,
  finished_at    TEXT,
  source         TEXT NOT NULL,
  ok             INTEGER,
  error          TEXT,
  points_written INTEGER NOT NULL DEFAULT 0,
  -- cron expression, "manual" or "ingest"
  trigger        TEXT
);

CREATE INDEX runs_source_id ON runs (source, id);

CREATE TABLE manual_overrides (
  series_key TEXT NOT NULL,
  date       TEXT NOT NULL,
  value      REAL NOT NULL,
  note       TEXT,
  PRIMARY KEY (series_key, date)
);
