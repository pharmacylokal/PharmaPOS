const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..\\..\\Pharmacy.db');

let db;

function getDb() {
  if (!db) {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema();
  }
  return db;
}

function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      generic_name TEXT,
      barcode    TEXT UNIQUE,
      category   TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_name    ON products(name);

    CREATE TABLE IF NOT EXISTS batches (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id   INTEGER NOT NULL,
      batch_number TEXT    NOT NULL,
      expiry_date  DATE    NOT NULL,
      quantity     INTEGER NOT NULL DEFAULT 0,
      cost_price   REAL    NOT NULL,
      selling_price REAL   NOT NULL,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_batches_product_expiry
      ON batches(product_id, expiry_date);

    CREATE TABLE IF NOT EXISTS sales (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      date         DATETIME DEFAULT CURRENT_TIMESTAMP,
      external_id  TEXT UNIQUE,
      total_amount REAL    NOT NULL,
      discount_type TEXT,
      discount_pct  REAL DEFAULT 0,
      cash_tendered REAL,
      change_given  REAL,
      cashier      TEXT DEFAULT 'cashier',
      user_id      INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id    INTEGER NOT NULL,
      batch_id   INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity   INTEGER NOT NULL,
      price      REAL    NOT NULL,
      subtotal   REAL    NOT NULL,
      FOREIGN KEY (sale_id)    REFERENCES sales(id)    ON DELETE CASCADE,
      FOREIGN KEY (batch_id)   REFERENCES batches(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      username     TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role         TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('admin', 'staff')),
      permissions  TEXT DEFAULT '[]',
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
  `);

  const salesColumns = db.prepare('PRAGMA table_info(sales)').all();
  const hasExternalId = salesColumns.some((col) => col.name === 'external_id');
  if (!hasExternalId) {
    db.exec('ALTER TABLE sales ADD COLUMN external_id TEXT;');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_external_id ON sales(external_id);');

  const hasUserId = salesColumns.some((col) => col.name === 'user_id');
  if (!hasUserId) {
    db.exec('ALTER TABLE sales ADD COLUMN user_id INTEGER;');
  }

  const userColumns = db.prepare('PRAGMA table_info(users)').all();
  const hasPermissions = userColumns.some((col) => col.name === 'permissions');
  if (!hasPermissions) {
    db.exec('ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT \'[]\';');
  }

  // All permissions for admin
  const adminPermissions = JSON.stringify([
    'inventory_view', 'inventory_add', 'inventory_edit', 'inventory_delete',
    'sales_pos', 'sales_returns', 'sales_discount',
    'batches_view', 'batches_manage',
    'reports_access', 'reports_export',
    'users_view', 'users_manage',
    'settings_view', 'settings_modify'
  ]);

  // Ensure default admin user always exists
  const adminPasswordHash = bcrypt.hashSync('admin123', 10);
  const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (existingAdmin) {
    db.prepare('UPDATE users SET password_hash = ?, role = ?, permissions = ? WHERE username = ?').run(adminPasswordHash, 'admin', adminPermissions, 'admin');
    console.log('Admin user updated with full permissions');
  } else {
    db.prepare(`
      INSERT INTO users (username, password_hash, role, permissions)
      VALUES (?, ?, ?, ?)
    `).run('admin', adminPasswordHash, 'admin', adminPermissions);
    console.log('Default admin user created: admin / admin123');
  }

  console.log('Database schema initialized');
}

module.exports = { getDb };