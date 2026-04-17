# 💊 PharmaPOS — Pharmacy Inventory & POS System

A complete offline-first Pharmacy POS and Inventory Management System for small-to-medium pharmacies in the Philippines.

**Stack:** React + Tailwind CSS (frontend) · Node.js + Express (backend) · SQLite (database)

---

## 🚀 Quick Start

### 1. Install dependencies (first time only)
```bash
chmod +x setup.sh start.sh
./setup.sh
```

### 2. (Optional) Load sample data
```bash
cd backend
node seed.js
cd ..
```

### 3. Start the system
```bash
./start.sh
```

Then open your browser at: **http://localhost:3000**

---

## 📁 Project Structure

```
pharmacy-system/
├── backend/
│   ├── src/
│   │   ├── index.js          ← Express server entry point
│   │   ├── db/schema.js      ← SQLite schema + init
│   │   └── routes/
│   │       ├── products.js   ← Product CRUD
│   │       ├── batches.js    ← Batch CRUD
│   │       ├── sales.js      ← Sales + FIFO logic
│   │       └── reports.js    ← Daily, inventory, expiring reports
│   ├── seed.js               ← Sample data loader
│   ├── pharmacy.db           ← SQLite database (auto-created)
│   └── package.json
│
└── frontend/
    └── src/
        ├── App.jsx           ← Root component, tab routing
        ├── api/client.js     ← API helper functions
        ├── components/
        │   └── Layout.jsx    ← Top nav + page wrapper
        └── pages/
            ├── POS.jsx       ← Point of Sale screen
            ├── Inventory.jsx ← Product & batch management
            └── Reports.jsx   ← Daily sales, inventory, expiry reports
```

---

## 🔄 FIFO Batch Deduction Logic

The core inventory logic lives in `backend/src/routes/sales.js` → `computeFifoBatchDeductions()`.

**How it works:**
1. When a sale is created, for each cart item we query all available, non-expired batches for that product, **ordered by expiry date ASC** (nearest expiry first).
2. We deduct stock from the batch with the nearest expiry date first.
3. If that batch doesn't have enough stock, we continue to the next batch until the full quantity is satisfied.
4. If total available stock is insufficient, the sale is rejected with an error.
5. All deductions are executed in a **single SQLite transaction** — either everything commits or nothing does.

**Example:**
- Amoxicillin Batch A: 5 units, expires June 2025
- Amoxicillin Batch B: 20 units, expires December 2025
- Customer buys 8 units → Batch A fully depleted (5), Batch B reduced by 3

---

## 🇵🇭 Philippine-Specific Features

- **Senior Citizen / PWD Discount:** 20% discount applied at checkout
- **Manual Discount:** Custom percentage override
- **Peso (₱) currency** throughout
- **Philippine date locale** on receipts

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /products | List products (with search, category filter) |
| POST | /products | Create product |
| PUT | /products/:id | Update product |
| DELETE | /products/:id | Delete product |
| GET | /batches/:product_id | Get batches for product |
| POST | /batches | Add batch |
| PUT | /batches/:id | Update batch |
| DELETE | /batches/:id | Delete batch |
| POST | /sales | Process sale (FIFO deduction) |
| GET | /sales | List sales |
| GET | /sales/:id | Get sale with items |
| GET | /reports/daily | Daily sales report |
| GET | /reports/daily/csv | Export daily report as CSV |
| GET | /reports/inventory | Full inventory report |
| GET | /reports/inventory/csv | Export inventory as CSV |
| GET | /reports/expiring | Products expiring within N days |

---

## ⚙ Configuration

- **Backend port:** 3001 (change in `backend/src/index.js`)
- **Frontend port:** 3000 (default Create React App)
- **Database:** `backend/pharmacy.db` (auto-created on first run)
- **API proxy:** Set in `frontend/package.json` → `"proxy": "http://localhost:3001"`

---

## 🖨 Receipt Printing

On the receipt screen, click **Print Receipt**. The page uses CSS `@media print` rules to print only the receipt — the rest of the UI is hidden.

For best results, use a 80mm thermal printer with your browser's print dialog.

---

## ⚠ Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Out-of-stock product | Not shown in POS search results |
| Expired batch | Excluded from FIFO selection (cannot be sold) |
| Insufficient stock | Sale rejected with clear error message |
| Partial batch depletion | Stock correctly reduced, batch remains |
| Multiple batches for one product | FIFO depletes nearest-expiry batch first |

---

## 🔐 Security Notes

- This is a **local/offline** system — no cloud, no internet required
- No authentication is implemented in this MVP (suitable for single-user or trusted-network use)
- For multi-user deployments, add JWT auth middleware to Express routes
