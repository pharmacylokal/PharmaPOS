const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');

function getSaleWithItems(db, saleId) {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
  const saleItems = db.prepare(`
    SELECT si.*, p.name as product_name, b.batch_number, b.expiry_date
    FROM sale_items si
    JOIN products p ON p.id = si.product_id
    JOIN batches b ON b.id = si.batch_id
    WHERE si.sale_id = ?
  `).all(saleId);
  return { sale, items: saleItems, change: sale?.change_given || 0 };
}

// For each cart item, deduct stock from nearest-expiry batches first.
function computeFifoBatchDeductions(db, productId, quantityNeeded) {
  const availableBatches = db.prepare(`
    SELECT id, batch_number, expiry_date, quantity, selling_price
    FROM batches
    WHERE product_id = ?
      AND quantity > 0
      AND expiry_date >= DATE('now')
    ORDER BY expiry_date ASC
  `).all(productId);

  const deductions = []; // { batchId, qty, price }
  let remaining = quantityNeeded;

  for (const batch of availableBatches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    deductions.push({
      batchId: batch.id,
      batchNumber: batch.batch_number,
      qty: take,
      price: batch.selling_price,
    });
    remaining -= take;
  }

  if (remaining > 0) {
    throw new Error(`Insufficient stock. Only ${quantityNeeded - remaining} units available.`);
  }

  return deductions;
}

// POST /sales - process a sale (requires authentication, any role)
router.post('/', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const {
      items,
      discount_type,
      discount_pct,
      cash_tendered,
      external_id,
    } = req.body;

    // Use the logged-in user as cashier
    const cashierName = req.user.username;
    const userId = req.user.id;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    const normalizedExternalId = String(external_id || '').trim() || null;
    if (normalizedExternalId) {
      const existing = db
        .prepare('SELECT id FROM sales WHERE external_id = ?')
        .get(normalizedExternalId);
      if (existing) {
        return res.status(200).json({ ...getSaleWithItems(db, existing.id), duplicate: true });
      }
    }

    // 1) Compute FIFO deductions up-front.
    const allDeductions = [];
    for (const item of items) {
      const deductions = computeFifoBatchDeductions(db, item.product_id, item.quantity);
      allDeductions.push({ productId: item.product_id, deductions });
    }

    // 2) Calculate totals.
    let subtotal = 0;
    for (const { deductions } of allDeductions) {
      for (const d of deductions) {
        subtotal += d.qty * d.price;
      }
    }

    const discPct = parseFloat(discount_pct) || 0;
    const discountAmount = subtotal * (discPct / 100);
    const totalAmount = subtotal - discountAmount;
    const changeGiven = cash_tendered ? parseFloat(cash_tendered) - totalAmount : 0;

    // 3) Execute all writes atomically.
    const processSale = db.transaction(() => {
      const saleResult = db.prepare(`
        INSERT INTO sales (external_id, total_amount, discount_type, discount_pct, cash_tendered, change_given, cashier, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        normalizedExternalId,
        totalAmount,
        discount_type || null,
        discPct,
        cash_tendered || null,
        changeGiven,
        cashierName,
        userId
      );

      const saleId = saleResult.lastInsertRowid;
      const insertItem = db.prepare(`
        INSERT INTO sale_items (sale_id, batch_id, product_id, quantity, price, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const deductStock = db.prepare('UPDATE batches SET quantity = quantity - ? WHERE id = ?');

      for (const { productId, deductions } of allDeductions) {
        for (const d of deductions) {
          insertItem.run(saleId, d.batchId, productId, d.qty, d.price, d.qty * d.price);
          deductStock.run(d.qty, d.batchId);
        }
      }

      return saleId;
    });

    const saleId = processSale();
    res.status(201).json(getSaleWithItems(db, saleId));
  } catch (err) {
    console.error('POST /sales error:', err);

    if (String(err.message || '').includes('UNIQUE constraint failed: sales.external_id')) {
      const db = getDb();
      const normalizedExternalId = String(req.body?.external_id || '').trim();
      if (normalizedExternalId) {
        const existing = db.prepare('SELECT id FROM sales WHERE external_id = ?').get(normalizedExternalId);
        if (existing) {
          return res.status(200).json({ ...getSaleWithItems(db, existing.id), duplicate: true });
        }
      }
    }

    if (String(err.message || '').includes('Insufficient stock')) {
      return res.status(409).json({ error: err.message });
    }

    res.status(500).json({ error: err.message });
  }
});

// GET /sales - list all sales (admin only)
router.get('/', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const { date, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM sales WHERE 1=1';
    const params = [];

    if (date) {
      query += ' AND DATE(date) = ?';
      params.push(date);
    }

    query += ' ORDER BY date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit, 10), parseInt(offset, 10));

    const sales = db.prepare(query).all(...params);
    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /sales/:id - single sale with line items (admin only)
router.get('/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const items = db.prepare(`
      SELECT si.*, p.name as product_name, p.generic_name, b.batch_number, b.expiry_date
      FROM sale_items si
      JOIN products p ON p.id = si.product_id
      JOIN batches b ON b.id = si.batch_id
      WHERE si.sale_id = ?
    `).all(req.params.id);

    res.json({ sale, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
