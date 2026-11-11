CREATE TABLE ledger_state (
  user_id TEXT PRIMARY KEY NOT NULL,
  version INTEGER NOT NULL,
  payload TEXT NOT NULL
);
