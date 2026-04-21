const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/schema');

const JWT_SECRET = process.env.JWT_SECRET || 'pharmapos_jwt_secret_2024';

function parsePermissions(permStr) {
  if (!permStr) return [];
  if (Array.isArray(permStr)) return permStr;
  try { return JSON.parse(permStr); } catch { return []; }
}


function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';

  try {
    // Priority 1: Bearer token (JWT)
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = {
        id: decoded.id,
        username: decoded.username,
        role: decoded.role,
        permissions: decoded.permissions || parsePermissions(decoded.permissions),
      };
      return next();
    }

    // Priority 2: Basic auth (backward compat)
    if (authHeader.startsWith('Basic ')) {
      const base64 = authHeader.slice(6);
      const decoded = Buffer.from(base64, 'base64').toString('utf8');
      const [username, password] = decoded.split(':');
      if (!username || !password) return res.status(401).json({ error: 'Invalid credentials format' });
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if (!user) return res.status(401).json({ error: 'Invalid username or password' });
      const validPassword = bcrypt.compareSync(password, user.password_hash);
      if (!validPassword) return res.status(401).json({ error: 'Invalid username or password' });
      req.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        permissions: parsePermissions(user.permissions),
      };
      return next();
    }

    return res.status(401).json({ error: 'Authentication required' });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please login again.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
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
    if (req.user && req.user.role === 'admin') return next();
    if (!req.user || !req.user.permissions.includes(permission)) {
      return res.status(403).json({ error: 'Permission denied: ' + permission });
    }
    next();
  };
}

module.exports = { requireAuth, requireAdmin, requirePermission };
