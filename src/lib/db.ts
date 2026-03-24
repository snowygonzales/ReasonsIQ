import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "reasonsiq.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_models (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      model_name TEXT NOT NULL,
      description TEXT,
      context_length INTEGER,
      input_price_per_mtok REAL,
      output_price_per_mtok REAL,
      supports_caching INTEGER DEFAULT 0,
      cached_input_price REAL,
      image_input_price REAL,
      quality_tier TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gpu_offers (
      id INTEGER PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'vast.ai',
      gpu_model TEXT NOT NULL,
      gpu_count INTEGER DEFAULT 1,
      vram_gb REAL,
      price_per_hour REAL NOT NULL,
      cpu_cores INTEGER,
      ram_gb REAL,
      disk_gb REAL,
      disk_type TEXT,
      internet_speed_mbps REAL,
      region TEXT,
      reliability_score REAL,
      dlperf REAL,
      verified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      records_count INTEGER DEFAULT 0,
      error_message TEXT,
      synced_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_api_models_provider ON api_models(provider);
    CREATE INDEX IF NOT EXISTS idx_api_models_quality ON api_models(quality_tier);
    CREATE INDEX IF NOT EXISTS idx_api_models_input_price ON api_models(input_price_per_mtok);
    CREATE INDEX IF NOT EXISTS idx_gpu_offers_gpu_model ON gpu_offers(gpu_model);
    CREATE INDEX IF NOT EXISTS idx_gpu_offers_price ON gpu_offers(price_per_hour);

    -- User accounts
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Firm profiles (persistent company data)
    CREATE TABLE IF NOT EXISTS firms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      industry TEXT,
      team_size INTEGER,
      current_product TEXT,
      current_price_per_seat REAL,
      current_monthly_spend REAL,
      ai_description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Saved scenarios
    CREATE TABLE IF NOT EXISTS saved_scenarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firm_id INTEGER NOT NULL REFERENCES firms(id),
      name TEXT NOT NULL,
      params TEXT NOT NULL,
      result TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_firms_user ON firms(user_id);
    CREATE INDEX IF NOT EXISTS idx_scenarios_firm ON saved_scenarios(firm_id);
  `);
}
