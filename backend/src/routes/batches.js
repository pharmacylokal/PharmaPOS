const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');

// GET /batches/:product_id — all batches for a product, ordered by expiry (FIFO order)
router.get('/:product_id', (req, res) => {
  try {
    const db = getDb();
    const batches = db.prepare(`
      SELECT b.*, p.name as product_name, p.generic_name
      FROM batches b
      JOIN products p ON p.id = b.product_id
      WHERE b.product_id = ?
      ORDER BY b.expiry_date ASC
    `).all(req.params.product_id);

    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /batches — add a new batch to a product
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { product_id, batch_number, expiry_date, quantity, cost_price, selling_price } = req.body;
    const parsedQuantity = Number(quantity);
    const parsedCostPrice = Number(cost_price || 0);
    const parsedSellingPrice = Number(selling_price);

    // Validate required fields
    if (!product_id || !batch_number || !expiry_date || Number.isNaN(parsedQuantity) || Number.isNaN(parsedSellingPrice)) {
      return res.status(400).json({ 
        error: 'Required: product_id, batch_number, expiry_date, quantity, selling_price' 
      });
    }
    if (parsedQuantity < 0) {
      return res.status(400).json({ error: 'Quantity cannot be negative' });
    }
    if (parsedSellingPrice < 0 || parsedCostPrice < 0) {
      return res.status(400).json({ error: 'Prices cannot be negative' });
    }

    // Check product exists
    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(product_id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const stmt = db.prepare(`
      INSERT INTO batches (product_id, batch_number, expiry_date, quantity, cost_price, selling_price)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(product_id, batch_number, expiry_date, parsedQuantity, parsedCostPrice, parsedSellingPrice);

    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /batches/:id — update batch (e.g., adjust stock, fix price)
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const { batch_number, expiry_date, quantity, cost_price, selling_price } = req.body;
    const parsedQuantity = Number(quantity);
    const parsedCostPrice = Number(cost_price || 0);
    const parsedSellingPrice = Number(selling_price);

    const existing = db.prepare('SELECT id FROM batches WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Batch not found' });
    if (!batch_number || !expiry_date || Number.isNaN(parsedQuantity) || Number.isNaN(parsedSellingPrice)) {
      return res.status(400).json({ error: 'Required: batch_number, expiry_date, quantity, selling_price' });
    }
    if (parsedQuantity < 0) {
      return res.status(400).json({ error: 'Quantity cannot be negative' });
    }
    if (parsedSellingPrice < 0 || parsedCostPrice < 0) {
      return res.status(400).json({ error: 'Prices cannot be negative' });
    }

    const result = db.prepare(`
      UPDATE batches 
      SET batch_number=?, expiry_date=?, quantity=?, cost_price=?, selling_price=?
      WHERE id=?
    `).run(batch_number, expiry_date, parsedQuantity, parsedCostPrice, parsedSellingPrice, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(req.params.id);
    res.json(batch);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /batches/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const batch = db.prepare('SELECT id FROM batches WHERE id = ?').get(req.params.id);
    if (!batch) return res.status(404).json({ error: 'Batch not found' });

    const result = db.prepare('DELETE FROM batches WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('FOREIGN KEY constraint failed')) {
      return res.status(409).json({ error: 'Cannot delete batch with sales history' });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
