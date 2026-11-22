import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','agent')),
  password_hash TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

-- Titular de posiciones. kind='token' (Renta Work) o 'prestamo' (préstamo preexistente importado).
CREATE TABLE IF NOT EXISTS holders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'token' CHECK (kind IN ('token','prestamo')),
  -- Visibilidad en la tabla de posiciones. Por decisión del negocio todos los participantes se ven
  -- entre sí ('completo'); el administrador puede ocultar o anonimizar a alguien puntual.
  consent TEXT NOT NULL DEFAULT 'completo' CHECK (consent IN ('ninguno','agregado','anonimo','completo')),
  consent_at TEXT,
  auto_reinvest INTEGER NOT NULL DEFAULT 0,
  auto_reinvest_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  developer TEXT,
  address TEXT,
  unit TEXT,
  typology TEXT,
  surface_m2 TEXT,
  ref_price_cents INTEGER,
  delivery TEXT,
  source_url TEXT,
  source_note TEXT,
  image_url TEXT
);

CREATE TABLE IF NOT EXISTS m2_prices (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  price_cents INTEGER NOT NULL,
  effective_date TEXT NOT NULL,
  source TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS emissions (
  id INTEGER PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  name TEXT NOT NULL,
  rate_bps INTEGER NOT NULL,
  term_months INTEGER,
  term_status TEXT NOT NULL DEFAULT 'propuesta' CHECK (term_status IN ('propuesta','confirmado')),
  cap_cents INTEGER,                 -- NULL = cupo sin definir (no se aceptan nuevas compras)
  cap_includes_reinvestments INTEGER NOT NULL DEFAULT 1,
  early_redemption_terms TEXT,
  exit_terms TEXT,
  open INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY,
  holder_id INTEGER NOT NULL REFERENCES holders(id),
  emission_id INTEGER REFERENCES emissions(id),
  origin TEXT NOT NULL CHECK (origin IN ('aporte','comision','reinversion','saldo_importado')),
  tokens INTEGER NOT NULL DEFAULT 0,
  principal_cents INTEGER NOT NULL,
  outstanding_cents INTEGER NOT NULL,
  rate_bps INTEGER NOT NULL,
  activation_date TEXT NOT NULL,
  maturity_date TEXT,
  settlements_count INTEGER NOT NULL DEFAULT 0,
  accrual_from TEXT NOT NULL,
  carry TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'activa' CHECK (status IN ('activa','vencida','cancelada')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Fuente de verdad de los saldos. Sólo suman los movimientos 'completada'.
CREATE TABLE IF NOT EXISTS movements (
  id INTEGER PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  holder_id INTEGER NOT NULL REFERENCES holders(id),
  position_id INTEGER REFERENCES positions(id),
  type TEXT NOT NULL CHECK (type IN (
    'compra_aporte','compra_comision','saldo_inicial_importado','liquidacion','reinversion',
    'cobro_intereses','rescate','devolucion_capital','reverso','ajuste')),
  status TEXT NOT NULL CHECK (status IN ('pendiente','aprobada','completada','rechazada')),
  description TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  capital_delta INTEGER NOT NULL DEFAULT 0,
  tokens_delta INTEGER NOT NULL DEFAULT 0,
  available_delta INTEGER NOT NULL DEFAULT 0,
  external_flow INTEGER NOT NULL DEFAULT 0, -- + recibido por el inversor, − aportado por el inversor (para XIRR y gráficos)
  capital_after INTEGER,
  tokens_after INTEGER,
  available_after INTEGER,
  reference TEXT,
  commission_id INTEGER REFERENCES commissions(id),
  emission_id INTEGER REFERENCES emissions(id),
  reverses_id INTEGER REFERENCES movements(id),
  idempotency_key TEXT UNIQUE,
  data TEXT,
  notice TEXT,
  created_by INTEGER REFERENCES users(id),
  decided_by INTEGER REFERENCES users(id),
  decided_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS movements_holder ON movements(holder_id, effective_date);

-- Puente con rendiciones del CRM: comisiones en USD efectivamente disponibles.
CREATE TABLE IF NOT EXISTS commissions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  rendicion_ref TEXT NOT NULL UNIQUE,
  description TEXT,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'disponible' CHECK (status IN ('pendiente','disponible','cerrada')),
  collected_cents INTEGER NOT NULL DEFAULT 0,
  invested_cents INTEGER NOT NULL DEFAULT 0,
  reserved_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  holder_id INTEGER NOT NULL REFERENCES holders(id),
  title TEXT NOT NULL,
  kind TEXT NOT NULL,
  file_path TEXT,
  mime TEXT,
  movement_id INTEGER REFERENCES movements(id),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  data TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let instance: Database.Database | null = null;

// Columnas y tablas agregadas después de la primera versión. Idempotente.
const MIGRATIONS = [
  "ALTER TABLE holders ADD COLUMN goal_kind TEXT CHECK (goal_kind IN ('capital','ingreso'))", // meta elegida por el usuario
  "ALTER TABLE holders ADD COLUMN goal_cents INTEGER",
  "ALTER TABLE holders ADD COLUMN commission_pct INTEGER NOT NULL DEFAULT 0", // % de cada comisión en USD que se invierte solo
  "ALTER TABLE emissions ADD COLUMN issuer TEXT", // quién responde (razón social)
  "ALTER TABLE emissions ADD COLUMN costs TEXT", // costos, si los hay
  `CREATE TABLE IF NOT EXISTS project_updates (
     id INTEGER PRIMARY KEY,
     project_id INTEGER NOT NULL REFERENCES projects(id),
     update_date TEXT NOT NULL,
     title TEXT NOT NULL,
     body TEXT,
     image_url TEXT,
     created_by INTEGER REFERENCES users(id),
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
];

function migrate(db: Database.Database) {
  for (const sql of MIGRATIONS) {
    try {
      db.exec(sql);
    } catch (e) {
      if (!/duplicate column/i.test(String(e))) throw e;
    }
  }
}

export function dbPath(): string {
  return process.env.DATABASE_PATH || path.join(process.cwd(), "data", "renta-work.db");
}

export function getDb(): Database.Database {
  if (instance) return instance;
  const p = dbPath();
  if (p !== ":memory:") fs.mkdirSync(path.dirname(p), { recursive: true });
  instance = new Database(p);
  instance.exec(SCHEMA);
  migrate(instance);
  return instance;
}

/** Sólo para pruebas: usa una base nueva. */
export function resetDbForTests(p = ":memory:") {
  instance?.close();
  instance = null;
  process.env.DATABASE_PATH = p;
  return getDb();
}

export function tx<T>(fn: () => T): T {
  const db = getDb();
  return db.transaction(fn).immediate();
}
