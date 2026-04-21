const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/schema');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Valid permissions list
const VALID_PERMISSIONS = [
  // Inventory
  'inventory_view', 'inventory_add', 'inventory_edit', 'inventory_delete',
  // Sales
  'sales_pos', 'sales_returns', 'sales_discount',
  // Batches
  'batches_view', 'batches_manage',
  // Reports
  'reports_access', 'reports_export',
  // Users (admin only)
  'users_view', 'users_manage',
  // Settings (admin only)
  'settings_view', 'settings_modify',
];

// Permission inheritance rules
const PERMISSION_INHERITS = {
  inventory_add: ['inventory_view'],
  inventory_edit: ['inventory_view', 'inventory_add'],
  inventory_delete: ['inventory_view', 'inventory_add', 'inventory_edit'],
  batches_manage: ['batches_view'],
  users_manage: ['users_view'],
  settings_modify: ['settings_view'],
};

function parsePermissions(permStr) {
  if (!permStr) return [];
  if (Array.isArray(permStr)) return permStr;
  try { return JSON.parse(permStr); } catch { return []; }
}

// Apply inheritance rules
function applyPermissionInheritance(permissions) {
  const all = [...new Set(permissions)];
  for (const perm of permissions) {
    if (PERMISSION_INHERITS[perm]) {
      for (const inherited of PERMISSION_INHERITS[perm]) {
        if (!all.includes(inherited)) {
          all.push(inherited);
        }
      }
    }
  }
  return all;
}

// Filter and validate permissions
function validatePermissions(permissions) {
  if (!permissions || !Array.isArray(permissions)) return [];
  const filtered = permissions.filter(p => VALID_PERMISSIONS.includes(p));
  return applyPermissionInheritance(filtered);
}

router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });
    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Invalid username or password' });
    res.json({ 
      id: user.id, 
      username: user.username, 
      role: user.role, 
      permissions: parsePermissions(user.permissions), 
      created_at: user.created_at 
    });
  } catch (err) { console.error('Login error:', err); res.status(500).json({ error: 'Login failed' }); }
});

router.post('/register', requireAuth, requireAdmin, (req, res) => {
  try {
    const { username, password, permissions } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    
    // Validate permissions - non-admin cannot grant admin-only permissions
    let userPermissions = validatePermissions(permissions || []);
    const isAdminUser = req.user.role === 'admin';
    const adminOnlyPerms = ['users_view', 'users_manage', 'settings_view', 'settings_modify'];
    if (!isAdminUser) {
      userPermissions = userPermissions.filter(p => !adminOnlyPerms.includes(p));
    }
    
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Username already exists' });
    
    const passwordHash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password_hash, role, permissions) VALUES (?, ?, ?, ?)').run(
      username, 
      passwordHash, 
      'staff', 
      JSON.stringify(userPermissions)
    );
    
    const newUser = db.prepare('SELECT id, username, role, permissions, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    newUser.permissions = parsePermissions(newUser.permissions);
    res.status(201).json(newUser);
  } catch (err) { console.error('Register error:', err); res.status(500).json({ error: 'Failed to create user' }); }
});

router.get('/me', requireAuth, (req, res) => { res.json(req.user); });

router.get('/users', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = getDb();
    const users = db.prepare('SELECT id, username, role, permissions, created_at FROM users ORDER BY id ASC').all();
    users.forEach(u => u.permissions = parsePermissions(u.permissions));
    res.json(users);
  } catch (err) { console.error('Get users error:', err); res.status(500).json({ error: 'Failed to fetch users' }); }
});

router.put('/users/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, permissions } = req.body;
    const db = getDb();
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    
    // Validate permissions
    let userPermissions = validatePermissions(permissions || []);
    
    if (username && username !== existing.username) {
      const exists = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, id);
      if (exists) return res.status(409).json({ error: 'Username already exists' });
    }
    
    let newUsername = username || existing.username;
    let newHash = existing.password_hash;
    if (password) { if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' }); newHash = bcrypt.hashSync(password, 10); }
    
    db.prepare('UPDATE users SET username = ?, password_hash = ?, role = ?, permissions = ? WHERE id = ?').run(
      newUsername, 
      newHash, 
      existing.role, 
      JSON.stringify(userPermissions), 
      id
    );
    
    const updated = db.prepare('SELECT id, username, role, permissions, created_at FROM users WHERE id = ?').get(id);
    updated.permissions = parsePermissions(updated.permissions);
    res.json(updated);
  } catch (err) { console.error('Update user error:', err); res.status(500).json({ error: 'Failed to update user' }); }
});

router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'User not found' });
    if (existing.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ message: 'User deleted successfully' });
  } catch (err) { console.error('Delete user error:', err); res.status(500).json({ error: 'Failed to delete user' }); }
});

router.post('/change-password', requireAuth, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const db = getDb();
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) return res.status(401).json({ error: 'Current password is incorrect' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 10), req.user.id);
    res.json({ message: 'Password changed successfully' });
  } catch (err) { console.error('Change password error:', err); res.status(500).json({ error: 'Failed to change password' }); }
});

module.exports = router;