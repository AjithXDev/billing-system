const Database = require("better-sqlite3");

const db = new Database("billing.db");


// 🟢 CATEGORIES TABLE (GST BASE)
db.prepare(`
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  gst INTEGER DEFAULT 0
)
`).run();


// 🟢 PRODUCTS TABLE (GST + CATEGORY LINK)
db.prepare(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER,
  price REAL NOT NULL,
  cost_price REAL,
  quantity INTEGER DEFAULT 0,
  unit TEXT,
  barcode TEXT UNIQUE,
  gst INTEGER DEFAULT 0, -- ✅ PRODUCT GST
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();


// 🟢 INVOICES TABLE
db.prepare(`
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  total_amount REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();


// 🟢 INVOICE ITEMS
db.prepare(`
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER,
  product_id INTEGER,
  quantity INTEGER,
  price REAL,
  gst_rate INTEGER,
  gst_amount REAL
)
`).run();


module.exports = db;