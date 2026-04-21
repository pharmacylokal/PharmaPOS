const express = require('express');
const cors = require('cors');

const { getDb } = require('./db/schema');
getDb();

const app = express();
const path = require('path');
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

function normalizeOrigin(origin) {
  return String(origin || '').trim().replace(/\/+$/, '').toLowerCase();
}

const ENV_ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

const DEV_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://localhost:8080', 'http://127.0.0.1:3000', 'http://127.0.0.1:8080'].map(normalizeOrigin);
const ALLOWED_ORIGINS = Array.from(new Set([...DEV_ALLOWED_ORIGINS, ...ENV_ALLOWED_ORIGINS]));
const corsOptions = {
  origin(origin, callback) {
    if (!origin) { callback(null, true); return; }
    const normalized = normalizeOrigin(origin);
    const allowed = ENV_ALLOWED_ORIGINS.length > 0
      ? ALLOWED_ORIGINS.includes(normalized)
      : DEV_ALLOWED_ORIGINS.includes(normalized);
    if (allowed) { callback(null, true); return; }
    callback(new Error("Not allowed by CORS: " + origin));
  },
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(req.method + " " + req.path + " -> " + res.statusCode + " (" + (Date.now() - start) + "ms)");
  });
  next();
});

app.get("/", (req, res) => res.json({ status: "PharmaPOS API", version: "1.0.0" }));

app.use("/auth", require("./routes/auth"));
app.use("/products", require("./routes/products"));
app.use("/batches", require("./routes/batches"));
app.use("/sales", require("./routes/sales"));
app.use("/reports", require("./routes/reports"));

app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

app.use((req, res) => res.status(404).json({ error: "Endpoint not found" }));
app.use((err, req, res, next) => {
  if (err && err.message && err.message.startsWith("Not allowed by CORS")) {
    res.status(403).json({ error: err.message });
    return;
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.use(express.static(path.join(__dirname, '../frontend/build')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/build/index.html')));

app.listen(PORT, HOST, () => {
  console.log("\nPharmacy API running on http://" + HOST + ":" + PORT);
  console.log("Database: pharmacy.db");
  console.log("CORS origins: " + (ALLOWED_ORIGINS.join(", ") || "(none)"));
  console.log("\nEndpoints:");
  console.log("  POST /auth/login | /auth/register");
  console.log("  GET/POST /products (admin: POST/PUT/DELETE)");
  console.log("  GET/POST /batches (admin: POST/PUT/DELETE)");
  console.log("  GET/POST /sales");
  console.log("  GET /reports/* (admin only)");
});
