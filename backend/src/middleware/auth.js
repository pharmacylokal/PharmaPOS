const bcrypt = require('bcryptjs');
const { getDb } = require('../db/schema');

function parsePermissions(permStr) {
  if (!permStr) return [];
  if (Array.isArray(permStr)) return permStr;
  try {
    return JSON.parse(permStr);
  } catch {
    return [];
  }
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  
  if (!authHeader.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const base64 = authHeader.slice(6);
    const decoded = Buffer.from(base64, 'base64').toString('utf8');
    const [username, password] = decoded.split(':');

    if (!username || !password) {
      return res.status(401).json({ error: 'Invalid credentials format' });
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

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: parsePermissions(user.permissions)
    };

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
      return next();
    }
    if (!req.user || !req.user.permissions.includes(permission)) {
      return res.status(403).json({ error: 'Permission denied: ' + permission });
    }
    next();
  };
}

module.exports = { requireAuth, requireAdmin, requirePermission };
