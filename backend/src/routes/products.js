const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// GET /products - Anyone can list products
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { search, category } = req.query;

    let query = `
      SELECT 
        p.*,
        COALESCE(SUM(b.quantity), 0) AS total_stock,
        MIN(b.expiry_date) AS nearest_expiry,
        MIN(b.selling_price) AS min_price,
        MAX(b.selling_price) AS max_price,
        (
          SELECT b2.selling_price
          FROM batches b2
          WHERE b2.product_id = p.id
            AND b2.quantity > 0
            AND b2.expiry_date >= DATE('now')
          ORDER BY b2.expiry_date ASC, b2.id ASC
          LIMIT 1
        ) AS current_price
      FROM products p
      LEFT JOIN batches b ON b.product_id = p.id AND b.quantity > 0 AND b.expiry_date >= DATE('now')
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ` AND (p.name LIKE ? OR p.generic_name LIKE ? OR p.barcode = ?)`;
      params.push(`%${search}%`, `%${search}%`, search);
    }
    if (category) {
      query += ` AND p.category = ?`;
      params.push(category);
    }

    query += ` GROUP BY p.id ORDER BY p.name ASC`;

    const products = db.prepare(query).all(...params);
    res.json(products);
  } catch (err) {
    console.error('GET /products error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /products/categories/list - Anyone can list categories
router.get('/categories/list', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category`
    ).all();
    res.json(rows.map(r => r.category));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /products/:id - Anyone can view product details
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const batches = db.prepare(
      'SELECT * FROM batches WHERE product_id = ? ORDER BY expiry_date ASC'
    ).all(req.params.id);

    res.json({ ...product, batches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /products - ADMIN ONLY
router.post('/', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { name, generic_name, barcode, category } = req.body;

    if (!name) return res.status(400).json({ error: 'Product name is required' });

    const stmt = db.prepare(`
      INSERT INTO products (name, generic_name, barcode, category)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(name, generic_name || null, barcode || null, category || null);

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(product);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Barcode already exists for another product' });
    }
    res.status(500).json({ error: err.message });
  }
});

// PUT /products/:id - ADMIN ONLY
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const { name, generic_name, barcode, category } = req.body;
    if (!name) return res.status(400).json({ error: 'Product name is required' });

    const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const result = db.prepare(`
      UPDATE products SET name=?, generic_name=?, barcode=?, category=? WHERE id=?
    `).run(name, generic_name || null, barcode || null, category || null, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    res.json(product);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Barcode already exists for another product' });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE /products/:id - ADMIN ONLY
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const result = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('FOREIGN KEY constraint failed')) {
      return res.status(409).json({ error: 'Cannot delete product with sales history' });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
