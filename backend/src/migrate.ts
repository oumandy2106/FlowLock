import "dotenv/config";
import pool from "./db.js";

const schema = `
CREATE TABLE IF NOT EXISTS integrators (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  api_key_hash VARCHAR(255) NOT NULL UNIQUE,
  platform_address VARCHAR(56),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agreements (
  id SERIAL PRIMARY KEY,
  on_chain_id BIGINT UNIQUE,
  payer VARCHAR(56) NOT NULL,
  provider VARCHAR(56) NOT NULL,
  settlement_asset VARCHAR(56) NOT NULL,
  platform VARCHAR(56),
  milestone_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(32) NOT NULL DEFAULT 'Draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS milestones (
  id SERIAL PRIMARY KEY,
  agreement_id INTEGER NOT NULL REFERENCES agreements(id),
  milestone_index INTEGER NOT NULL,
  amount BIGINT NOT NULL,
  delivery_deadline BIGINT NOT NULL,
  review_deadline BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Draft',
  metadata_hash VARCHAR(64),
  keeper_bounty BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agreement_id, milestone_index)
);

CREATE TABLE IF NOT EXISTS splits (
  id SERIAL PRIMARY KEY,
  milestone_id INTEGER NOT NULL REFERENCES milestones(id),
  recipient VARCHAR(56) NOT NULL,
  bps INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  agreement_id BIGINT,
  milestone_index INTEGER,
  payload JSONB,
  ledger BIGINT,
  tx_hash VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_dedup ON events(tx_hash, event_type, agreement_id, milestone_index);

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id SERIAL PRIMARY KEY,
  integrator_id INTEGER NOT NULL REFERENCES integrators(id),
  url VARCHAR(512) NOT NULL,
  secret_hash VARCHAR(255) NOT NULL,
  events_filter TEXT[],
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS keeper_runs (
  id SERIAL PRIMARY KEY,
  agreement_id BIGINT NOT NULL,
  milestone_index INTEGER NOT NULL,
  action VARCHAR(32) NOT NULL,
  tx_hash VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  bounty_earned BIGINT DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`;

async function migrate() {
  try {
    await pool.query(schema);
    console.log("Migration completed successfully — 7 tables created.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
