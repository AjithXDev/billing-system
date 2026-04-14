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
    { name: "Grocery", gst: 0 },
    { name: "Snacks & Biscuits", gst: 18 },
    { name: "Soft Drinks", gst: 28 },
    { name: "Dairy Products", gst: 5 },
    { name: "Cosmetics", gst: 18 },
    { name: "General", gst: 0 }
  ];
  for (const cat of defaultCats) {
    insertCat.run(cat.name, cat.gst);
  }
}

// 🟢 MIGRATION: Rename existing categories from "GST labels" to "Proper Names"
try {
  db.prepare("UPDATE categories SET name = 'Grocery & General' WHERE name = 'General (0%)'").run();
  db.prepare("UPDATE categories SET name = 'Essential Food' WHERE name = 'Essential (5%)'").run();
  db.prepare("UPDATE categories SET name = 'Standard Items' WHERE name = 'Standard (12%)'").run();
  db.prepare("UPDATE categories SET name = 'Premium Snacks' WHERE name = 'Premium (18%)'").run();
  db.prepare("UPDATE categories SET name = 'Luxury & Drinks' WHERE name = 'Luxury (28%)'").run();
} catch (e) { }


// 🟢 PRODUCTS TABLE (GST FROM CATEGORY LINK + DIRECT GST)
db.prepare(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category_id INTEGER,
  gst_rate REAL DEFAULT 0,
  product_code TEXT UNIQUE,
  price_type TEXT DEFAULT 'exclusive',
  price REAL NOT NULL,
  cost_price REAL DEFAULT 0,
  quantity INTEGER DEFAULT 0,
  unit TEXT,
  barcode TEXT UNIQUE,
  expiry_date TEXT DEFAULT NULL,
  image TEXT DEFAULT NULL,
  default_discount REAL DEFAULT 0,
  flag_low_stock INTEGER DEFAULT 0,
  flag_out_of_stock INTEGER DEFAULT 0,
  flag_expiry INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();

// Safe migration: add columns if they are missing from older versions
try { db.prepare("ALTER TABLE products ADD COLUMN expiry_date TEXT DEFAULT NULL").run(); } catch (e) { }
try { db.prepare("ALTER TABLE products ADD COLUMN category_id INTEGER").run(); } catch (e) { }
try { db.prepare("ALTER TABLE products ADD COLUMN cost_price REAL DEFAULT 0").run(); } catch (e) { }
try { db.prepare("ALTER TABLE products ADD COLUMN unit TEXT").run(); } catch (e) { }
try { db.prepare("ALTER TABLE products ADD COLUMN barcode TEXT").run(); } catch (e) { }
try { db.prepare("ALTER TABLE products ADD COLUMN gst_rate REAL DEFAULT 0").run(); } catch (e) { }
try { db.prepare("ALTER TABLE products ADD COLUMN product_code TEXT").run(); } catch (e) { }
try { db.prepare("ALTER TABLE products ADD COLUMN price_type TEXT DEFAULT 'exclusive'").run(); } catch (e) { }
try { db.prepare("ALTER TABLE products ADD COLUMN image TEXT DEFAULT NULL").run(); } catch (e) { }
try { db.prepare("ALTER TABLE products ADD COLUMN default_discount REAL DEFAULT 0").run(); } catch (e) { }
try { db.prepare("ALTER TABLE products ADD COLUMN flag_low_stock INTEGER DEFAULT 0").run(); } catch (e) { }
try { db.prepare("ALTER TABLE products ADD COLUMN flag_out_of_stock INTEGER DEFAULT 0").run(); } catch (e) { }
try { db.prepare("ALTER TABLE products ADD COLUMN flag_expiry INTEGER DEFAULT 0").run(); } catch (e) { }
try { db.prepare("ALTER TABLE products ADD COLUMN flag_dead_stock INTEGER DEFAULT 0").run(); } catch (e) { }

// Migration: If gst_rate is 0 and category_id exists, copy gst from categories
try {
  db.prepare(`
    UPDATE products 
    SET gst_rate = (SELECT gst FROM categories WHERE categories.id = products.category_id)
    WHERE (gst_rate IS NULL OR gst_rate = 0) AND category_id IS NOT NULL
  `).run();
} catch (e) { console.error("Migration error:", e.message); }

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
  bill_no INTEGER,
  bill_date TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  customer_id INTEGER,
  payment_mode TEXT,
  total_amount REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();

try { db.prepare("ALTER TABLE invoices ADD COLUMN bill_no INTEGER").run(); } catch(e){}
try { db.prepare("ALTER TABLE invoices ADD COLUMN bill_date TEXT").run(); } catch(e){}
try { db.prepare("ALTER TABLE invoices ADD COLUMN is_synced INTEGER DEFAULT 0").run(); } catch(e){}

// Sync tracking for other tables
try { db.prepare("ALTER TABLE products ADD COLUMN is_synced INTEGER DEFAULT 0").run(); } catch(e){}
try { db.prepare("ALTER TABLE customers ADD COLUMN is_synced INTEGER DEFAULT 0").run(); } catch(e){}

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
  gst_amount REAL,
  discount_percent REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0
)
`).run();

// Migration: add discount columns if missing
try { db.prepare("ALTER TABLE invoice_items ADD COLUMN discount_percent REAL DEFAULT 0").run(); } catch(e){}
try { db.prepare("ALTER TABLE invoice_items ADD COLUMN discount_amount REAL DEFAULT 0").run(); } catch(e){}


// 🟢 NOTIFICATIONS TABLE (Owner Mobile Alerts)
db.prepare(`
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  title TEXT,
  message TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();

// 🟢 OFFERS TABLE (Buy X Get Y Free)
db.prepare(`
CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status INTEGER DEFAULT 1, -- 1 for Active, 0 for Inactive
  buy_product_id INTEGER NOT NULL,
  buy_quantity INTEGER NOT NULL,
  free_product_id INTEGER NOT NULL,
  free_quantity INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();

module.exports = db;