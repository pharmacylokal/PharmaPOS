const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/schema');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ============================================================
// AUTH ROUTES
// ============================================================

// POST /auth/login - Login with username and password
// Returns user info (without password) and role
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Return user info without password
    res.json({
      id: user.id,
      username: user.username,
      role: user.role,
      created_at: user.created_at
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /auth/register - Create new user (admin only)
router.post('/register', requireAuth, requireAdmin, (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Validate role
    const validRoles = ['admin', 'cashier'];
    const userRole = (role || 'cashier').toLowerCase();
    if (!validRoles.includes(userRole)) {
      return res.status(400).json({ error: 'Role must be admin or cashier' });
    }

    const db = getDb();

    // Check if username exists
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    // Hash password
    const passwordHash = bcrypt.hashSync(password, 10);

    // Create user
    const result = db.prepare(`
      INSERT INTO users (username, password_hash, role)
      VALUES (?, ?, ?)
    `).run(username, passwordHash, userRole);

    const newUser = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newUser);
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// GET /auth/me - Get current user info
router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

module.exports = router;
