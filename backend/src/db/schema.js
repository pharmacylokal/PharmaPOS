const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Render: set DB_PATH=/var/data/pharmacy.db and mount persistent disk at /var/data
// Local dev fallback keeps DB in backend root.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../pharmacy.db');

let db;

function getDb() {
  if (!db) {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL'); // Better concurrent performance
    db.pragma('foreign_keys = ON');  // Enforce FK constraints
    initializeSchema();
  }
  return db;
}

function initializeSchema() {
  db.exec(`
    -- Products table: stores product master data
    CREATE TABLE IF NOT EXISTS products (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,           -- Brand name
      generic_name TEXT,                  -- Generic/chemical name
      barcode    TEXT UNIQUE,             -- Optional barcode (EAN/UPC)
      category   TEXT,                   -- e.g., Antibiotics, Vitamins, etc.
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Index for fast barcode and name lookups (critical for POS speed)
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_name    ON products(name);

    -- Batches table: each product can have multiple batches
    -- Stock is tracked per batch (not total), enabling FIFO
    CREATE TABLE IF NOT EXISTS batches (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id   INTEGER NOT NULL,
      batch_number TEXT    NOT NULL,
      expiry_date  DATE    NOT NULL,      -- Format: YYYY-MM-DD
      quantity     INTEGER NOT NULL DEFAULT 0,
      cost_price   REAL    NOT NULL,      -- Purchase cost
      selling_price REAL   NOT NULL,      -- Retail price
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    -- Index for FIFO queries: get batches by product ordered by expiry (nearest first)
    CREATE INDEX IF NOT EXISTS idx_batches_product_expiry
      ON batches(product_id, expiry_date);

    -- Sales table: each transaction
    CREATE TABLE IF NOT EXISTS sales (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      date         DATETIME DEFAULT CURRENT_TIMESTAMP,
      external_id  TEXT UNIQUE,
      total_amount REAL    NOT NULL,
      discount_type TEXT,                -- 'senior', 'pwd', 'manual', or NULL
      discount_pct  REAL DEFAULT 0,     -- Discount percentage applied
      cash_tendered REAL,
      change_given  REAL,
      cashier       TEXT DEFAULT 'cashier'
    );

    -- Sale items: line items linked to specific batches
    CREATE TABLE IF NOT EXISTS sale_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id    INTEGER NOT NULL,
      batch_id   INTEGER NOT NULL,
      product_id INTEGER NOT NULL,       -- Denormalized for easier reporting
      quantity   INTEGER NOT NULL,
      price      REAL    NOT NULL,       -- Selling price at time of sale
      subtotal   REAL    NOT NULL,       -- quantity * price
      FOREIGN KEY (sale_id)    REFERENCES sales(id)    ON DELETE CASCADE,
      FOREIGN KEY (batch_id)   REFERENCES batches(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    -- Index for sales reports
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
    CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
  `);

  // Lightweight migration for existing DBs created before external_id existed.
  const salesColumns = db.prepare('PRAGMA table_info(sales)').all();
  const hasExternalId = salesColumns.some((col) => col.name === 'external_id');
  if (!hasExternalId) {
    db.exec('ALTER TABLE sales ADD COLUMN external_id TEXT;');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_external_id ON sales(external_id);');

  console.log('Database schema initialized');
}

module.exports = { getDb };
