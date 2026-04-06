const Database = require("better-sqlite3");
const path = require("path");

// Safe Electron app reference — works even if loaded before app.whenReady()
let app;
try {
  app = require("electron").app;
} catch (e) {
  app = null;
}

const isDev = !app || !app.isPackaged;
const dbPath = (isDev || !app)
  ? path.join(__dirname, "billing.db")
  : path.join(app.getPath("userData"), "billing.db");

const db = new Database(dbPath);



// 🟢 CATEGORIES TABLE (GST BASE)
db.prepare(`
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  gst INTEGER DEFAULT 0
)
`).run();

// Seed Categories if empty
const catCount = db.prepare("SELECT COUNT(*) as count FROM categories").get();
if (catCount.count === 0) {
  const insertCat = db.prepare("INSERT INTO categories (name, gst) VALUES (?, ?)");
  const defaultCats = [
    { name: "General (0%)", gst: 0 },
    { name: "Essential (5%)", gst: 5 },
    { name: "Standard (12%)", gst: 12 },
    { name: "Premium (18%)", gst: 18 },
    { name: "Luxury (28%)", gst: 28 }
  ];
  for (const cat of defaultCats) {
    insertCat.run(cat.name, cat.gst);
  }
}


// 🟢 PRODUCTS TABLE (GST FROM CATEGORY LINK)
db.prepare(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER,
  price REAL NOT NULL,
  cost_price REAL DEFAULT 0,
  quantity INTEGER DEFAULT 0,
  unit TEXT,
  barcode TEXT UNIQUE,
  expiry_date TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();

// Safe migration: add columns if they are missing from older versions
try { db.prepare("ALTER TABLE products ADD COLUMN expiry_date TEXT DEFAULT NULL").run(); } catch (e) { }
try { db.prepare("ALTER TABLE products ADD COLUMN category_id INTEGER").run(); } catch (e) { }
try { db.prepare("ALTER TABLE products ADD COLUMN cost_price REAL DEFAULT 0").run(); } catch (e) { }
try { db.prepare("ALTER TABLE products ADD COLUMN unit TEXT").run(); } catch (e) { }
try { db.prepare("ALTER TABLE products ADD COLUMN barcode TEXT").run(); } catch (e) { }

// 🟢 HELD BILLS TABLE (Hold/Resume Feature)
db.prepare(`
CREATE TABLE IF NOT EXISTS held_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT,
  cart_json TEXT NOT NULL,
  customer_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();


// 🟢 CUSTOMERS TABLE
db.prepare(`
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  phone TEXT UNIQUE,
  address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();

// 🟢 INVOICES TABLE
db.prepare(`
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  customer_id INTEGER,
  payment_mode TEXT,
  total_amount REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();

try {
  db.prepare("ALTER TABLE invoices ADD COLUMN customer_name TEXT").run();
  db.prepare("ALTER TABLE invoices ADD COLUMN customer_phone TEXT").run();
  db.prepare("ALTER TABLE invoices ADD COLUMN customer_address TEXT").run();
  db.prepare("ALTER TABLE invoices ADD COLUMN customer_id INTEGER").run();
  db.prepare("ALTER TABLE invoices ADD COLUMN payment_mode TEXT").run();
} catch (e) {
  // Ignore
}

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