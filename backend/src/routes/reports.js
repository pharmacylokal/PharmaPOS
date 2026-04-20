const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// All report endpoints require admin authentication

// GET /reports/daily?date=YYYY-MM-DD - daily sales summary (ADMIN ONLY)
router.get('/daily', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const date = req.query.date || new Date().toISOString().split('T')[0];

    // Sales summary for the day
    const summary = db.prepare(`
      SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN discount_type IS NOT NULL THEN total_amount END), 0) as discounted_sales,
        COALESCE(SUM(CASE WHEN discount_type = ''senior'' OR discount_type = ''pwd'' THEN 1 ELSE 0 END), 0) as sc_pwd_transactions
      FROM sales
      WHERE DATE(date) = ?
    `).get(date);

    // Per-product breakdown
    const breakdown = db.prepare(`
      SELECT 
        p.name as product_name,
        p.generic_name,
        p.category,
        SUM(si.quantity) as units_sold,
        SUM(si.subtotal) as revenue
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE DATE(s.date) = ?
      GROUP BY p.id
      ORDER BY revenue DESC
    `).all(date);

    // All individual transactions
    const transactions = db.prepare(`
      SELECT * FROM sales WHERE DATE(date) = ? ORDER BY date DESC
    `).all(date);

    res.json({ date, summary, breakdown, transactions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /reports/inventory - current stock levels per product (ADMIN ONLY)
router.get('/inventory', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = getDb();

    const inventory = db.prepare(`
      SELECT 
        p.id,
        p.name,
        p.generic_name,
        p.category,
        p.barcode,
        COUNT(b.id) as batch_count,
        COALESCE(SUM(CASE WHEN b.expiry_date >= DATE('now') THEN b.quantity ELSE 0 END), 0) as available_stock,
        COALESCE(SUM(CASE WHEN b.expiry_date < DATE('now') THEN b.quantity ELSE 0 END), 0) as expired_stock,
        MIN(CASE WHEN b.expiry_date >= DATE('now') AND b.quantity > 0 THEN b.expiry_date END) as nearest_expiry,
        MAX(b.selling_price) as max_price,
        MIN(b.selling_price) as min_price
      FROM products p
      LEFT JOIN batches b ON b.product_id = p.id
      GROUP BY p.id
      ORDER BY p.name ASC
    `).all();

    // Also return batch details for each product
    const batches = db.prepare(`
      SELECT b.*, p.name as product_name
      FROM batches b
      JOIN products p ON p.id = b.product_id
      ORDER BY b.expiry_date ASC
    `).all();

    res.json({ inventory, batches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /reports/expiring?days=30 - products expiring within N days (ADMIN ONLY)
router.get('/expiring', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const days = parseInt(req.query.days) || 30;

    const expiring = db.prepare(`
      SELECT 
        b.id as batch_id,
        b.batch_number,
        b.expiry_date,
        b.quantity,
        b.selling_price,
        p.id as product_id,
        p.name as product_name,
        p.generic_name,
        p.category,
        CAST(julianday(b.expiry_date) - julianday(DATE('now')) AS INTEGER) as days_until_expiry
      FROM batches b
      JOIN products p ON p.id = b.product_id
      WHERE 
        b.quantity > 0
        AND b.expiry_date >= DATE('now')
        AND b.expiry_date <= DATE('now', '+' || ? || ' days')
      ORDER BY b.expiry_date ASC
    `).all(days);

    // Also include already expired with stock (should not be sold!)
    const expired = db.prepare(`
      SELECT 
        b.id as batch_id,
        b.batch_number,
        b.expiry_date,
        b.quantity,
        p.name as product_name,
        p.category,
        CAST(julianday(DATE('now')) - julianday(b.expiry_date) AS INTEGER) as days_expired
      FROM batches b
      JOIN products p ON p.id = b.product_id
      WHERE b.quantity > 0 AND b.expiry_date < DATE('now')
      ORDER BY b.expiry_date ASC
    `).all();

    res.json({ days_filter: days, expiring, expired });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /reports/daily/csv?date=YYYY-MM-DD - export daily report as CSV (ADMIN ONLY)
router.get('/daily/csv', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const rows = db.prepare(`
      SELECT 
        s.id as sale_id,
        s.date,
        p.name as product,
        p.generic_name,
        si.quantity,
        si.price,
        si.subtotal,
        s.discount_type,
        s.discount_pct,
        s.total_amount,
        s.cashier
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE DATE(s.date) = ?
      ORDER BY s.date DESC
    `).all(date);

    // Build CSV string
    const headers = ['Sale ID','Date','Product','Generic Name','Qty','Unit Price','Subtotal','Discount Type','Discount %','Total','Cashier'];
    const csvLines = [headers.join(',')];
    for (const row of rows) {
      csvLines.push([
        row.sale_id, `"${row.date}"`, `"${row.product}"`, `"${row.generic_name || ''}"`,
        row.quantity, row.price, row.subtotal,
        row.discount_type || '', row.discount_pct, row.total_amount, row.cashier
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=sales_${date}.csv`);
    res.send(csvLines.join('\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /reports/inventory/csv - export inventory as CSV (ADMIN ONLY)
router.get('/inventory/csv', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = getDb();

    const rows = db.prepare(`
      SELECT 
        p.name, p.generic_name, p.category, p.barcode,
        b.batch_number, b.expiry_date, b.quantity, b.cost_price, b.selling_price,
        CASE WHEN b.expiry_date < DATE('now') THEN 'EXPIRED'
             WHEN b.expiry_date <= DATE('now', '+30 days') THEN 'EXPIRING SOON'
             ELSE 'OK' END as status
      FROM batches b
      JOIN products p ON p.id = b.product_id
      ORDER BY p.name, b.expiry_date
    `).all();

    const headers = ['Product','Generic Name','Category','Barcode','Batch #','Expiry Date','Quantity','Cost Price','Selling Price','Status'];
    const csvLines = [headers.join(',')];
    for (const row of rows) {
      csvLines.push([
        `"${row.name}"`, `"${row.generic_name || ''}"`, `"${row.category || ''}"`,
        `"${row.barcode || ''}"`, `"${row.batch_number}"`, row.expiry_date,
        row.quantity, row.cost_price, row.selling_price, row.status
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=inventory_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvLines.join('\n'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
