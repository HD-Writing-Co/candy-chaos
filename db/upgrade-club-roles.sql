CREATE TABLE IF NOT EXISTS club_roles (
  user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('moderator','admin'))
);
