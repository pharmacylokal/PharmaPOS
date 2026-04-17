const express = require('express');
const cors = require('cors');

// Initialize DB on startup
const { getDb } = require('./db/schema');
getDb(); // Creates tables if they don't exist

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const normalizeOrigin = (origin) => String(origin || '').trim().replace(/\/+$/, '').toLowerCase();
const ENV_ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);
const DEV_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'].map(normalizeOrigin);
const ALLOWED_ORIGINS = Array.from(new Set([...DEV_ALLOWED_ORIGINS, ...ENV_ALLOWED_ORIGINS]));

const corsOptions = {
  origin(origin, callback) {
    // Allow same-machine tools (no origin), local frontend, and configured origins.
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalized = normalizeOrigin(origin);
    // If CORS_ORIGIN is set, enforce only configured + local dev origins.
    // If unset, allow local dev origins only.
    const allowed = ENV_ALLOWED_ORIGINS.length > 0
      ? ALLOWED_ORIGINS.includes(normalized)
      : DEV_ALLOWED_ORIGINS.includes(normalized);

    if (allowed) {
      callback(null, true);
      return;
    }
    callback(new Error(`Not allowed by CORS: ${origin}`));
  },
};

// Middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

// Request logger (simple, no dependencies)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

// Routes
app.use('/products', require('./routes/products'));
app.use('/batches', require('./routes/batches'));
app.use('/sales', require('./routes/sales'));
app.use('/reports', require('./routes/reports'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 404 & Error handlers
app.use((req, res) => res.status(404).json({ error: 'Endpoint not found' }));
app.use((err, req, res, next) => {
  if (err && err.message && err.message.startsWith('Not allowed by CORS')) {
    res.status(403).json({ error: err.message });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, HOST, () => {
  console.log(`\nPharmacy API running on http://${HOST}:${PORT}`);
  console.log('Database: pharmacy.db');
  console.log(`CORS origins: ${ALLOWED_ORIGINS.join(', ') || '(none)'}`);
  console.log('\nEndpoints:');
  console.log('  GET/POST /products');
  console.log('  GET/POST /batches');
  console.log('  GET/POST /sales');
  console.log('  GET /reports/daily | /inventory | /expiring');
});
