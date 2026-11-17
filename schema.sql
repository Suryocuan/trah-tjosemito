CREATE TABLE IF NOT EXISTS people (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  gen        TEXT NOT NULL,
  parent_id  TEXT NOT NULL DEFAULT '',
  spouse_id  TEXT NOT NULL DEFAULT '',
  note       TEXT NOT NULL DEFAULT '',
  family_id  TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO people (id, name, gen, note)
VALUES ('mbah-tjosemito', 'Mbah Tjosemito', 'Leluhur utama', 'Leluhur utama Trah Tjosemito');
