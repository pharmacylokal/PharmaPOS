/**
 * Seed script — populates the database with sample pharmacy data.
 * Run with: node seed.js (from the backend/ directory)
 */
const { getDb } = require('./src/db/schema');

const db = getDb();

// Clear existing data
db.exec(`
  DELETE FROM sale_items;
  DELETE FROM sales;
  DELETE FROM batches;
  DELETE FROM products;
`);

// ── Sample products ───────────────────────────────────────────
const products = [
  { name: 'Amoxicillin 500mg', generic_name: 'Amoxicillin', barcode: '4800888004000', category: 'Antibiotics' },
  { name: 'Biogesic 500mg', generic_name: 'Paracetamol', barcode: '4800004001001', category: 'Analgesics' },
  { name: 'Kremil-S', generic_name: 'Aluminum Hydroxide', barcode: '4800445001000', category: 'Antacids' },
  { name: 'Cetirizine 10mg', generic_name: 'Cetirizine HCl', barcode: '4800000000001', category: 'Antihistamines' },
  { name: 'Ascorbic Acid 500mg', generic_name: 'Vitamin C', barcode: '4800000000002', category: 'Vitamins & Supplements' },
  { name: 'Losartan 50mg', generic_name: 'Losartan Potassium', barcode: '4800000000003', category: 'Cardiovascular' },
  { name: 'Metformin 500mg', generic_name: 'Metformin HCl', barcode: '4800000000004', category: 'Diabetes' },
  { name: 'Claritin 10mg', generic_name: 'Loratadine', barcode: '4800000000005', category: 'Antihistamines' },
];

const insertProduct = db.prepare(
  `INSERT INTO products (name, generic_name, barcode, category) VALUES (?, ?, ?, ?)`
);

const productIds = {};
for (const p of products) {
  const result = insertProduct.run(p.name, p.generic_name, p.barcode, p.category);
  productIds[p.name] = result.lastInsertRowid;
}

// ── Sample batches (with varied expiry dates to test FIFO and alerts) ─
const today = new Date();
const future = (days) => {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

const insertBatch = db.prepare(
  `INSERT INTO batches (product_id, batch_number, expiry_date, quantity, cost_price, selling_price)
   VALUES (?, ?, ?, ?, ?, ?)`
);

const batches = [
  // Amoxicillin — 2 batches (FIFO test: first should deplete before second)
  { product: 'Amoxicillin 500mg', batch: 'AMX-2024-01', expiry: future(20), qty: 50, cost: 4.50, price: 8.00 },
  { product: 'Amoxicillin 500mg', batch: 'AMX-2024-02', expiry: future(180), qty: 100, cost: 4.50, price: 8.00 },

  // Biogesic — batch expiring very soon (30-day alert)
  { product: 'Biogesic 500mg', batch: 'BIO-2024-01', expiry: future(15), qty: 30, cost: 2.00, price: 4.00 },
  { product: 'Biogesic 500mg', batch: 'BIO-2024-02', expiry: future(365), qty: 200, cost: 2.00, price: 4.00 },

  // Kremil-S — normal stock
  { product: 'Kremil-S', batch: 'KRM-2024-01', expiry: future(90), qty: 80, cost: 5.00, price: 9.00 },

  // Cetirizine — expiring in 45 days (60-day alert)
  { product: 'Cetirizine 10mg', batch: 'CET-2024-01', expiry: future(45), qty: 25, cost: 3.00, price: 6.00 },

  // Vitamin C — good stock
  { product: 'Ascorbic Acid 500mg', batch: 'VTC-2024-01', expiry: future(300), qty: 500, cost: 1.50, price: 3.00 },

  // Losartan — low stock (trigger low stock alert)
  { product: 'Losartan 50mg', batch: 'LOS-2024-01', expiry: future(120), qty: 8, cost: 6.00, price: 12.00 },

  // Metformin
  { product: 'Metformin 500mg', batch: 'MET-2024-01', expiry: future(200), qty: 60, cost: 5.50, price: 10.00 },

  // Claritin
  { product: 'Claritin 10mg', batch: 'CLR-2024-01', expiry: future(150), qty: 40, cost: 7.00, price: 15.00 },
];

for (const b of batches) {
  const pid = productIds[b.product];
  if (pid) insertBatch.run(pid, b.batch, b.expiry, b.qty, b.cost, b.price);
}

console.log('✅ Database seeded successfully!');
console.log(`   ${products.length} products, ${batches.length} batches`);
console.log('\nSample data includes:');
console.log('  - Amoxicillin with 2 batches (tests FIFO deduction)');
console.log('  - Biogesic with batch expiring in 15 days (tests expiry alert)');
console.log('  - Losartan with only 8 units (tests low stock alert)');
