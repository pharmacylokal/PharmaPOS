const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/schema');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ============================================================
// AUTH ROUTES
// ============================================================

// POST /auth/login - Login with username and password
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

// GET /auth/users - Get all users (admin only)
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare('SELECT id, username, role, created_at FROM users ORDER BY id ASC').all();
    res.json(users);
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PUT /auth/users/:id - Update user (admin only)
router.put('/users/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, role } = req.body;
    const db = getDb();

    // Check if user exists
    const existingUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Validate role if provided
    const validRoles = ['admin', 'cashier'];
    const userRole = (role || existingUser.role).toLowerCase();
    if (!validRoles.includes(userRole)) {
      return res.status(400).json({ error: 'Role must be admin or cashier' });
    }

    // Check if username is being changed and if it conflicts
    if (username && username !== existingUser.username) {
      const usernameExists = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, id);
      if (usernameExists) {
        return res.status(409).json({ error: 'Username already exists' });
      }
    }

    // Prepare update
    let newUsername = username || existingUser.username;
    let newRole = userRole;
    let newPasswordHash = existingUser.password_hash;

    // Hash new password if provided
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      newPasswordHash = bcrypt.hashSync(password, 10);
    }

    // Update user
    db.prepare(`
      UPDATE users SET username = ?, password_hash = ?, role = ?
      WHERE id = ?
    `).run(newUsername, newPasswordHash, newRole, id);

    const updatedUser = db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(id);
    res.json(updatedUser);
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// DELETE /auth/users/:id - Delete user (admin only)
router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    // Check if user exists
    const existingUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting yourself
    if (existingUser.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Delete user
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// POST /auth/change-password - Change own password
router.post('/change-password', requireAuth, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const db = getDb();

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Verify current password
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = bcrypt.compareSync(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash and save new password
    const newPasswordHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newPasswordHash, req.user.id);

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;