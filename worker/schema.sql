CREATE TABLE IF NOT EXISTS groups (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS scores (
  groupCode TEXT NOT NULL,
  day TEXT NOT NULL,
  playerId TEXT NOT NULL,
  nick TEXT NOT NULL,
  score INTEGER NOT NULL,
  detailJson TEXT NOT NULL,
  submittedAt INTEGER NOT NULL,
  PRIMARY KEY (groupCode, day, playerId)
);
CREATE TABLE IF NOT EXISTS dailies (
  day TEXT PRIMARY KEY,
  dataVersion TEXT NOT NULL,
  payloadJson TEXT NOT NULL,
  generatedAt INTEGER NOT NULL
);
