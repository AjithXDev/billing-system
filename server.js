/**
 * Smart Billing — Standalone Web Server (No Electron Required)
 *
 * Features:
 *   ✅ Offline-first: All data saved locally in SQLite
 *   ✅ Auto-sync to Supabase when internet is available
 *   ✅ Serves mobile dashboard with Supabase credentials pre-injected
 *   ✅ Shop auto-registers in Supabase for mobile auth
 *   ✅ Stats snapshot pushed to Supabase for any-network mobile access
 *   ✅ Multi-shop isolation via shop_id
 *
 * Usage: node server.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const fs = require("fs");
const db = require("./backend/db");

// ── Supabase Cloud Sync Engine ─────────────────────────────────
let supabase = null;
let isOnline = false;

function initSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (url && key && url.startsWith("http")) {
    try {
      const { createClient } = require("@supabase/supabase-js");
      supabase = createClient(url, key);
      console.log("  ☁️  Supabase connected — will sync when online");
    } catch (e) {
      console.log("  ⚠️  Supabase SDK not found — running offline only");
    }
  } else {
    console.log("  📦 No Supabase credentials — running offline only");
  }
}

async function checkOnline() {
  try {
    const http = require("http");
    return new Promise((resolve) => {
      const req = http.get("http://clients3.google.com/generate_204", { timeout: 3000 }, (res) => {
        isOnline = res.statusCode === 204;
        resolve(isOnline);
      });
      req.on("error", () => { isOnline = false; resolve(false); });
      req.on("timeout", () => { req.destroy(); isOnline = false; resolve(false); });
    });
  } catch (e) {
    isOnline = false;
    return false;
  }
}

// ── Register this shop in Supabase (for mobile auth) ───────────
async function registerShopInSupabase() {
  if (!supabase) return;
  const online = await checkOnline();
  if (!online) return;

  const shopId  = process.env.SHOP_ID   || "billing-shop";
  const masterKey = process.env.MASTER_KEY || "owner123";

  try {
    // Load store name from settings if available
    let storeName = "My Shop";
    try {
      const settingsPath = path.join(__dirname, "app_settings.json");
      if (fs.existsSync(settingsPath)) {
        const s = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        storeName = s.storeName || storeName;
      }
    } catch (e) {}

    await supabase.from("shops").upsert({
      id: shopId,
      name: storeName,
      master_key: masterKey,
      updated_at: new Date().toISOString()
    });
    console.log(`  🏪 Shop registered in cloud: ${shopId}`);
  } catch (e) {
    // Silently fail
  }
}

// ── Compute & Push Stats Snapshot to Supabase ──────────────────
// Mobile reads this directly — works from ANY network
async function pushStatsSnapshot(shopId) {
  if (!supabase || !isOnline) return;
  try {
    const today = new Date().toISOString().split("T")[0];
    const in7   = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

    const totalProducts   = db.prepare("SELECT COUNT(*) as c FROM products").get().c;
    const totalCategories = db.prepare("SELECT COUNT(*) as c FROM categories").get().c;
    const todaySales      = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE date(created_at)=date('now','localtime')").get().t;
    const todayBills      = db.prepare("SELECT COUNT(*) as c FROM invoices WHERE date(created_at)=date('now','localtime')").get().c;
    const weeklySales     = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE created_at>=datetime('now','-7 days')").get().t;
    const monthlySales    = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE created_at>=datetime('now','-30 days')").get().t;
    const expiredCount    = db.prepare("SELECT COUNT(*) as c FROM products WHERE expiry_date IS NOT NULL AND expiry_date<?").get(today).c;
    const nearExpiryCount = db.prepare("SELECT COUNT(*) as c FROM products WHERE expiry_date IS NOT NULL AND expiry_date>=? AND expiry_date<=?").get(today, in7).c;
    const lowStockCount   = db.prepare("SELECT COUNT(*) as c FROM products WHERE quantity>0 AND quantity<=10").get().c;
    const outOfStock      = db.prepare("SELECT COUNT(*) as c FROM products WHERE quantity<=0").get().c;

    const todayCost   = db.prepare("SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as c FROM invoice_items ii JOIN products p ON ii.product_id=p.id JOIN invoices inv ON ii.invoice_id=inv.id WHERE date(inv.created_at)=date('now','localtime')").get().c;
    const weeklyCost  = db.prepare("SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as c FROM invoice_items ii JOIN products p ON ii.product_id=p.id JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-7 days')").get().c;
    const monthlyCost = db.prepare("SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as c FROM invoice_items ii JOIN products p ON ii.product_id=p.id JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-30 days')").get().c;

    // ── OVERALL (ALL-TIME) PROFIT ──
    const overallSales = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices").get().t;
    const overallCost  = db.prepare("SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as c FROM invoice_items ii JOIN products p ON ii.product_id=p.id").get().c;
    const overallBills = db.prepare("SELECT COUNT(*) as c FROM invoices").get().c;

    const topProducts = db.prepare("SELECT p.name, SUM(ii.quantity) as sold, SUM(ii.price*ii.quantity) as revenue FROM invoice_items ii JOIN products p ON ii.product_id=p.id JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-30 days') GROUP BY ii.product_id ORDER BY sold DESC LIMIT 8").all();
    const dailySales  = db.prepare("SELECT date(created_at,'localtime') as day, COUNT(*) as bills, COALESCE(SUM(total_amount),0) as total FROM invoices WHERE created_at>=datetime('now','-7 days') GROUP BY day ORDER BY day ASC").all();
    const monthlyBreakdown = db.prepare("SELECT strftime('%Y-%m',created_at,'localtime') as month, COUNT(*) as bills, COALESCE(SUM(total_amount),0) as total FROM invoices WHERE created_at>=datetime('now','-180 days') GROUP BY month ORDER BY month ASC").all();
    const peakHours   = db.prepare("SELECT strftime('%H',created_at,'localtime') as hour, COUNT(*) as bills, COALESCE(SUM(total_amount),0) as revenue FROM invoices WHERE created_at>=datetime('now','-30 days') GROUP BY hour ORDER BY bills DESC LIMIT 24").all();
    const paymentBreakdown = db.prepare("SELECT payment_mode, COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM invoices WHERE created_at>=datetime('now','-30 days') GROUP BY payment_mode ORDER BY cnt DESC").all();
    const deadStock   = db.prepare("SELECT name, quantity FROM products WHERE quantity>0 AND id NOT IN (SELECT DISTINCT product_id FROM invoice_items ii JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-60 days'))").all();
    const lowStockList = db.prepare("SELECT name, quantity, unit FROM products WHERE quantity>0 AND quantity<=10 ORDER BY quantity ASC LIMIT 30").all();
    const outOfStockList = db.prepare("SELECT name, unit FROM products WHERE quantity<=0 LIMIT 30").all();
    const expiredList = db.prepare("SELECT name, expiry_date, quantity FROM products WHERE expiry_date IS NOT NULL AND expiry_date<? ORDER BY expiry_date ASC LIMIT 30").all(today);
    const nearExpiList = db.prepare("SELECT name, expiry_date, quantity FROM products WHERE expiry_date IS NOT NULL AND expiry_date>=? AND expiry_date<=? ORDER BY expiry_date ASC LIMIT 30").all(today, in7);

    // ── Recent invoices for mobile history ──
    const recentInvoices = db.prepare("SELECT id, bill_no, bill_date, customer_name, customer_phone, payment_mode, total_amount, created_at FROM invoices ORDER BY created_at DESC LIMIT 50").all();

    const statsSnapshot = {
      totalProducts, totalCategories,
      todaySales, todayBills, weeklySales, monthlySales,
      overallSales, overallCost, overallBills,
      expiredCount, nearExpiryCount, lowStockCount, outOfStock,
      todayProfit: todaySales - todayCost,
      weeklyProfit: weeklySales - weeklyCost,
      monthlyProfit: monthlySales - monthlyCost,
      overallProfit: overallSales - overallCost,
      todayCost, weeklyCost, monthlyCost,
      topSelling: topProducts.map(p => ({ ...p, total_sold: p.sold })),
      topProducts, dailySales, monthlySalesBreakdown: monthlyBreakdown,
      peakHours, paymentBreakdown, deadStock,
      lowStockProducts: lowStockList,
      outOfStockProducts: outOfStockList,
      expiredProducts: expiredList,
      expiringProducts: nearExpiList,
      recentInvoices,
    };

    await supabase.from("shop_stats").upsert({
      shop_id: shopId,
      stats_json: statsSnapshot,
      updated_at: new Date().toISOString()
    });
    console.log("  📊 Stats snapshot pushed to cloud");
  } catch (e) {
    // silent — will retry next cycle
  }
}

// ── Sync local SQLite → Supabase ──────────────────────────────
async function syncToCloud() {
  if (!supabase) return;
  const online = await checkOnline();
  if (!online) return;

  const shopId = process.env.SHOP_ID || "billing-shop";
  try {
    // Sync unsynced products
    const products = db.prepare("SELECT * FROM products WHERE is_synced = 0").all();
    let syncedProducts = 0;
    for (const p of products) {
      const catRow = p.category_id ? db.prepare("SELECT name FROM categories WHERE id=?").get(p.category_id) : null;
      const { error } = await supabase.from("products").upsert({
        id: p.id,
        shop_id: shopId,
        name: p.name,
        category_name: catRow?.name || "General",
        gst_rate: p.gst_rate || 0,
        product_code: p.product_code,
        price_type: p.price_type,
        price: p.price,
        cost_price: p.cost_price || 0,
        quantity: p.quantity,
        unit: p.unit,
        barcode: p.barcode,
        expiry_date: p.expiry_date,
        is_synced: 1,
        updated_at: new Date().toISOString()
      });
      if (!error) {
        db.prepare("UPDATE products SET is_synced = 1 WHERE id = ?").run(p.id);
        syncedProducts++;
      }
    }

    // Sync unsynced invoices
    const invoices = db.prepare("SELECT * FROM invoices WHERE is_synced = 0").all();
    let syncedInvoices = 0;
    for (const inv of invoices) {
      const { error } = await supabase.from("invoices").upsert({
        id: inv.id,
        shop_id: shopId,
        bill_no: inv.bill_no,
        bill_date: inv.bill_date,
        customer_name: inv.customer_name,
        customer_phone: inv.customer_phone,
        customer_address: inv.customer_address,
        payment_mode: inv.payment_mode,
        total_amount: inv.total_amount,
        is_synced: 1,
        created_at: inv.created_at
      });
      if (!error) {
        db.prepare("UPDATE invoices SET is_synced = 1 WHERE id = ?").run(inv.id);
        syncedInvoices++;
        // Sync invoice items
        const items = db.prepare("SELECT * FROM invoice_items WHERE invoice_id = ?").all(inv.id);
        if (items.length > 0) {
          await supabase.from("invoice_items").upsert(
            items.map(i => ({ ...i, shop_id: shopId }))
          );
        }
      }
    }

    if (syncedProducts > 0 || syncedInvoices > 0) {
      console.log(`  ✅ Synced: ${syncedProducts} products, ${syncedInvoices} invoices`);
    }

    // Always push stats snapshot for mobile dashboard
    await pushStatsSnapshot(shopId);

    // Sync notifications to cloud
    const notifs = db.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 20").all();
    if (notifs.length > 0) {
      await supabase.from("notifications").upsert(
        notifs.map(n => ({ ...n, shop_id: shopId, id: undefined }))
      );
    }

  } catch (e) {
    // Silently fail — will retry next cycle
  }
}

// ── Alert Check (local notifications) ─────────────────────────
function runAlertCheck() {
  try {
    const today = new Date().toISOString().split("T")[0];
    const lowThreshold = 5;
    const expired  = db.prepare("SELECT name FROM products WHERE expiry_date IS NOT NULL AND expiry_date < ?").all(today);
    const lowStock = db.prepare("SELECT name FROM products WHERE quantity > 0 AND quantity <= ?").all(lowThreshold);
    const outOfStock = db.prepare("SELECT name FROM products WHERE quantity <= 0").all();
    const recentNotif = db.prepare("SELECT COUNT(*) as cnt FROM notifications WHERE created_at >= datetime('now', '-1 hour')").get().cnt;
    if (recentNotif === 0) {
      const ins = db.prepare("INSERT INTO notifications (type, title, message) VALUES (?, ?, ?)");
      if (expired.length > 0) {
        const names = expired.slice(0, 5).map(p => p.name).join(", ");
        ins.run("EXPIRY", `${expired.length} Products Expired!`, `⚠️ ${names}${expired.length > 5 ? ` and ${expired.length - 5} more...` : ""}`);
      }
      if (lowStock.length > 0) {
        const names = lowStock.slice(0, 5).map(p => p.name).join(", ");
        ins.run("LOW_STOCK", `${lowStock.length} Products Low Stock`, `📉 ${names}${lowStock.length > 5 ? ` and ${lowStock.length - 5} more...` : ""}`);
      }
      if (outOfStock.length > 0) {
        const names = outOfStock.slice(0, 5).map(p => p.name).join(", ");
        ins.run("OUT_OF_STOCK", `${outOfStock.length} Products Out of Stock!`, `🚫 ${names}${outOfStock.length > 5 ? ` and ${outOfStock.length - 5} more...` : ""}`);
      }
    }
  } catch (e) {
    console.error("[Alert Check Error]", e.message);
  }
}

// ── Express API Server ─────────────────────────────────────────
const express = require("express");
const cors = require("cors");
const PORT = 4567;

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// ── Serve Mobile Dashboard (with Supabase credentials injected) ──
// This is the magic: first time owner accesses on local WiFi,
// the page gets credentials stored in localStorage → future access
// from anywhere works via Supabase directly.
app.get("/", (req, res) => {
  const mobilePath = path.join(__dirname, "mobile-dashboard", "index.html");
  if (!fs.existsSync(mobilePath)) {
    return res.json({ status: "Smart Billing API Server running" });
  }
  let html = fs.readFileSync(mobilePath, "utf-8");
  // Inject live credentials so mobile can sync from anywhere later
  html = html.replace("__SUPABASE_URL__", process.env.SUPABASE_URL || "");
  html = html.replace("__SUPABASE_KEY__", process.env.SUPABASE_KEY || "");
  html = html.replace("__SHOP_ID__",      process.env.SHOP_ID     || "");
  html = html.replace("__MASTER_KEY__",   process.env.MASTER_KEY  || "");
  html = html.replace("__LOCAL_API__",    `http://${getLocalIP()}:${PORT}`);
  res.send(html);
});
app.use(express.static(path.join(__dirname, "mobile-dashboard")));

// ── Config endpoint (for mobile to get credentials) ────────────
app.get("/api/config", (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseKey: process.env.SUPABASE_KEY || "",
    shopId:      process.env.SHOP_ID     || "",
    localApi:    `http://${getLocalIP()}:${PORT}`
  });
});

// ── Auth ────────────────────────────────────────────────────────
app.post("/api/auth", (req, res) => {
  const { key } = req.body;
  if (key === (process.env.MASTER_KEY || "owner123")) {
    res.json({ success: true, shopId: process.env.SHOP_ID });
  } else {
    res.status(401).json({ success: false });
  }
});

// ── Sync Status ──────────────────────────────────────────────────
app.get("/api/sync-status", (req, res) => {
  const pendingInvoices = db.prepare("SELECT COUNT(*) as cnt FROM invoices WHERE is_synced = 0").get().cnt;
  const pendingProducts = db.prepare("SELECT COUNT(*) as cnt FROM products WHERE is_synced = 0").get().cnt;
  res.json({ pending: pendingInvoices + pendingProducts, isOnline, hasSupabase: !!supabase });
});

// ── Force Sync ───────────────────────────────────────────────────
app.post("/api/sync-now", async (req, res) => {
  await syncToCloud();
  const pendingInvoices = db.prepare("SELECT COUNT(*) as cnt FROM invoices WHERE is_synced = 0").get().cnt;
  const pendingProducts = db.prepare("SELECT COUNT(*) as cnt FROM products WHERE is_synced = 0").get().cnt;
  res.json({ pending: pendingInvoices + pendingProducts, isOnline });
});

// ── Categories ───────────────────────────────────────────────────
app.get("/api/categories", (req, res) => {
  try { res.json(db.prepare("SELECT * FROM categories").all()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Products ─────────────────────────────────────────────────────
app.get("/api/products/full", (req, res) => {
  try {
    res.json(db.prepare(`
      SELECT p.*, COALESCE(p.gst_rate, c.gst, 0) as category_gst, COALESCE(c.name, 'General') as category_name
      FROM products p LEFT JOIN categories c ON p.category_id = c.id
    `).all());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/products", (req, res) => {
  try {
    const { name, category_id, gst_rate, product_code, price_type, price, cost_price, quantity, unit, barcode, expiry_date, image } = req.body;
    db.prepare(`
      INSERT INTO products (name, category_id, gst_rate, product_code, price_type, price, cost_price, quantity, unit, barcode, expiry_date, image)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, category_id || null, gst_rate || 0, product_code || null, price_type || "exclusive", price, cost_price || 0, quantity, unit, barcode ? String(barcode) : null, expiry_date || null, image || null);
    res.json({ message: "Product added" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/products/:id", (req, res) => {
  try {
    const { name, category_id, gst_rate, product_code, price_type, price, cost_price, quantity, unit, barcode, expiry_date, image } = req.body;
    db.prepare(`
      UPDATE products SET name=?, category_id=?, gst_rate=?, product_code=?, price_type=?, price=?, cost_price=?, quantity=?, unit=?, barcode=?, expiry_date=?, image=?, is_synced=0
      WHERE id=?
    `).run(name, category_id || null, gst_rate || 0, product_code || null, price_type || "exclusive", price, cost_price || 0, quantity, unit, barcode ? String(barcode) : null, expiry_date || null, image || null, req.params.id);
    res.json({ message: "Product updated" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/products/:id", (req, res) => {
  try {
    db.prepare("DELETE FROM products WHERE id=?").run(req.params.id);
    res.json({ message: "Product deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/products/bulk", (req, res) => {
  try {
    const updates = req.body;
    const stmt = db.prepare("UPDATE products SET quantity = quantity + ?, is_synced=0 WHERE id = ?");
    db.transaction((items) => { for (const item of items) stmt.run(item.addQty, item.id); })(updates);
    res.json({ message: "Bulk updated" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Customers ────────────────────────────────────────────────────
app.get("/api/customers/:phone", (req, res) => {
  try { res.json(db.prepare("SELECT * FROM customers WHERE phone = ?").get(req.params.phone) || null); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Invoices ─────────────────────────────────────────────────────
app.post("/api/invoices", (req, res) => {
  try {
    const { cart, customer, paymentMode } = req.body;
    let total = 0;
    cart.forEach((item) => { total += (item.total + item.gstAmt); });
    let customerId = null;
    if (customer && customer.phone) {
      const existing = db.prepare("SELECT * FROM customers WHERE phone = ?").get(customer.phone);
      if (!existing) {
        customerId = db.prepare("INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)").run(customer.name || "", customer.phone, customer.address || "").lastInsertRowid;
      } else {
        db.prepare("UPDATE customers SET name = ?, address = ? WHERE phone = ?").run(customer.name || existing.name, customer.address || existing.address, customer.phone);
        customerId = existing.id;
      }
    }
    const today = new Date().toISOString().split("T")[0];
    const lastBill = db.prepare("SELECT bill_no FROM invoices WHERE bill_date = ? ORDER BY bill_no DESC LIMIT 1").get(today);
    const nextBillNo = lastBill ? (lastBill.bill_no + 1) : 1;
    const result = db.prepare(`
      INSERT INTO invoices (bill_no, bill_date, customer_name, customer_phone, customer_address, customer_id, payment_mode, total_amount, is_synced)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(nextBillNo, today, customer?.name || "", customer?.phone || "", customer?.address || "", customerId, paymentMode || "Cash", total);
    const invoiceId = result.lastInsertRowid;
    const insertItem = db.prepare("INSERT INTO invoice_items (invoice_id, product_id, quantity, price, gst_rate, gst_amount) VALUES (?, ?, ?, ?, ?, ?)");
    const updateStock = db.prepare("UPDATE products SET quantity = quantity - ?, is_synced=0 WHERE id = ?");
    db.transaction((items) => {
      for (const item of items) {
        insertItem.run(invoiceId, item.id, item.qty, item.price, item.gstRate, item.gstAmt);
        updateStock.run(item.qty, item.id);
      }
    })(cart);
    res.json({ message: "Invoice created successfully! 🔥", invoiceId, billNo: nextBillNo });
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.get("/api/invoices", (req, res) => {
  try {
    const invoices = db.prepare("SELECT * FROM invoices ORDER BY created_at DESC").all();
    const itemsStmt = db.prepare("SELECT p.name FROM invoice_items ii JOIN products p ON ii.product_id = p.id WHERE ii.invoice_id = ?");
    res.json(invoices.map((r) => ({ ...r, productsList: itemsStmt.all(r.id).map((i) => i.name).join(", ") })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/invoices/:id/items", (req, res) => {
  try {
    res.json(db.prepare("SELECT ii.*, p.name FROM invoice_items ii JOIN products p ON ii.product_id = p.id WHERE ii.invoice_id = ?").all(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/invoices/:id", (req, res) => {
  try {
    db.prepare("DELETE FROM invoice_items WHERE invoice_id = ?").run(req.params.id);
    db.prepare("DELETE FROM invoices WHERE id = ?").run(req.params.id);
    res.json({ message: "Invoice deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Held Bills ───────────────────────────────────────────────────
app.post("/api/held-bills", (req, res) => {
  try {
    const { cart, customer, label } = req.body;
    db.prepare("INSERT INTO held_bills (label, cart_json, customer_json) VALUES (?, ?, ?)").run(
      label || `Held ${new Date().toLocaleTimeString("en-IN")}`, JSON.stringify(cart), JSON.stringify(customer || {})
    );
    res.json({ message: "Bill held" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/held-bills", (req, res) => {
  try {
    const rows = db.prepare("SELECT * FROM held_bills ORDER BY created_at DESC").all();
    res.json(rows.map((r) => ({ ...r, cart: JSON.parse(r.cart_json), customer: JSON.parse(r.customer_json || "{}") })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/held-bills/:id", (req, res) => {
  try { db.prepare("DELETE FROM held_bills WHERE id=?").run(req.params.id); res.json({ message: "Removed" }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Dashboard Stats ───────────────────────────────────────────────
app.get("/api/stats", (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    const totalProducts   = db.prepare("SELECT COUNT(*) as cnt FROM products").get().cnt;
    const totalCategories = db.prepare("SELECT COUNT(*) as cnt FROM categories").get().cnt;
    const todaySales  = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE date(created_at)=date('now','localtime')").get().t;
    const todayBills  = db.prepare("SELECT COUNT(*) as cnt FROM invoices WHERE date(created_at)=date('now','localtime')").get().cnt;
    const weeklySales = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE created_at>=datetime('now','-7 days')").get().t;
    const monthlySales = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE created_at>=datetime('now','-30 days')").get().t;
    const expiredCount = db.prepare("SELECT COUNT(*) as cnt FROM products WHERE expiry_date IS NOT NULL AND expiry_date<?").get(today).cnt;
    const nearExpiryCount = db.prepare("SELECT COUNT(*) as cnt FROM products WHERE expiry_date IS NOT NULL AND expiry_date>=? AND expiry_date<=?").get(today, in7).cnt;
    const lowStockCount = db.prepare("SELECT COUNT(*) as cnt FROM products WHERE quantity>0 AND quantity<=5").get().cnt;
    const outOfStock = db.prepare("SELECT COUNT(*) as cnt FROM products WHERE quantity<=0").get().cnt;
    const topProducts = db.prepare("SELECT p.name, SUM(ii.quantity) as sold, SUM(ii.price*ii.quantity) as revenue FROM invoice_items ii JOIN products p ON ii.product_id=p.id JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-30 days') GROUP BY ii.product_id ORDER BY sold DESC LIMIT 8").all();
    const dailySales = db.prepare("SELECT date(created_at,'localtime') as day, COUNT(*) as bills, COALESCE(SUM(total_amount),0) as total FROM invoices WHERE created_at>=datetime('now','-7 days') GROUP BY day ORDER BY day ASC").all();
    const monthlySalesBreakdown = db.prepare("SELECT strftime('%Y-%m', created_at,'localtime') as month, COUNT(*) as bills, COALESCE(SUM(total_amount),0) as total FROM invoices WHERE created_at>=datetime('now','-180 days') GROUP BY month ORDER BY month ASC").all();
    const calcCost = (where) => db.prepare(`SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as cost FROM invoice_items ii JOIN products p ON ii.product_id=p.id JOIN invoices inv ON ii.invoice_id=inv.id WHERE ${where}`).get().cost;
    const todayCost   = calcCost("date(inv.created_at)=date('now','localtime')");
    const weeklyCost  = calcCost("inv.created_at>=datetime('now','-7 days')");
    const monthlyCost = calcCost("inv.created_at>=datetime('now','-30 days')");
    const peakHours = db.prepare("SELECT strftime('%H', created_at,'localtime') as hour, COUNT(*) as bills, COALESCE(SUM(total_amount),0) as revenue FROM invoices WHERE created_at>=datetime('now','-30 days') GROUP BY hour ORDER BY bills DESC LIMIT 24").all();
    const paymentBreakdown = db.prepare("SELECT payment_mode, COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM invoices WHERE created_at>=datetime('now','-30 days') GROUP BY payment_mode ORDER BY cnt DESC").all();
    const deadStock = db.prepare("SELECT name, quantity FROM products WHERE quantity>0 AND id NOT IN (SELECT DISTINCT product_id FROM invoice_items ii JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-60 days'))").all();
    const lowStockProducts   = db.prepare("SELECT name, quantity, unit FROM products WHERE quantity>0 AND quantity<=10 ORDER BY quantity ASC LIMIT 30").all();
    const outOfStockProducts = db.prepare("SELECT name, unit FROM products WHERE quantity<=0 LIMIT 30").all();
    const expiredProducts    = db.prepare("SELECT name, expiry_date, quantity FROM products WHERE expiry_date IS NOT NULL AND expiry_date<? ORDER BY expiry_date ASC LIMIT 30").all(today);
    const expiringProducts   = db.prepare("SELECT name, expiry_date, quantity FROM products WHERE expiry_date IS NOT NULL AND expiry_date>=? AND expiry_date<=? ORDER BY expiry_date ASC LIMIT 30").all(today, in7);
    // ── OVERALL (ALL-TIME) PROFIT ──
    const overallSales = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices").get().t;
    const overallCostAll = calcCost("1=1");
    const overallBills = db.prepare("SELECT COUNT(*) as c FROM invoices").get().c;

    res.json({
      totalProducts, totalCategories, todaySales, todayBills, weeklySales, monthlySales,
      overallSales, overallCost: overallCostAll, overallBills,
      expiredCount, nearExpiryCount, lowStockCount, outOfStock,
      topSelling: topProducts.map((p) => ({ ...p, total_sold: p.sold })),
      topProducts, dailySales, monthlySalesBreakdown,
      todayProfit: todaySales - todayCost, weeklyProfit: weeklySales - weeklyCost, monthlyProfit: monthlySales - monthlyCost,
      overallProfit: overallSales - overallCostAll,
      todayCost, weeklyCost, monthlyCost, peakHours, paymentBreakdown, deadStock,
      lowStockProducts, outOfStockProducts, expiredProducts, expiringProducts
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Expiry / Stock / Analytics ────────────────────────────────────
app.get("/api/expiry", (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const in30  = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    const expired    = db.prepare("SELECT p.*,c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE p.expiry_date IS NOT NULL AND p.expiry_date<? ORDER BY p.expiry_date ASC").all(today);
    const nearExpiry = db.prepare("SELECT p.*,c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE p.expiry_date IS NOT NULL AND p.expiry_date>=? AND p.expiry_date<=? ORDER BY p.expiry_date ASC").all(today, in30);
    res.json({ expired, nearExpiry });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/stock", (req, res) => {
  try {
    const lowStock   = db.prepare("SELECT p.*,c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE p.quantity>0 AND p.quantity<=5 ORDER BY p.quantity ASC").all();
    const deadStock  = db.prepare("SELECT p.*,c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE p.quantity>0 AND p.id NOT IN (SELECT DISTINCT ii.product_id FROM invoice_items ii INNER JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-30 days')) ORDER BY p.quantity DESC").all();
    const outOfStock = db.prepare("SELECT p.*,c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE p.quantity<=0").all();
    res.json({ lowStock, deadStock, outOfStock });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/analytics", (req, res) => {
  try {
    const peakHours = db.prepare("SELECT strftime('%H', created_at,'localtime') as hour, COUNT(*) as bills, SUM(total_amount) as revenue FROM invoices WHERE created_at >= datetime('now', '-30 days') GROUP BY hour ORDER BY hour ASC").all();
    const categoryRevenue = db.prepare("SELECT c.name as category, SUM(ii.price * ii.quantity) as revenue FROM invoice_items ii JOIN products p ON ii.product_id = p.id LEFT JOIN categories c ON p.category_id = c.id JOIN invoices inv ON ii.invoice_id = inv.id WHERE inv.created_at >= datetime('now', '-30 days') GROUP BY category ORDER BY revenue DESC").all();
    const topSelling = db.prepare("SELECT p.name, SUM(ii.quantity) as total_sold, SUM(ii.price * ii.quantity) as total_revenue FROM invoice_items ii JOIN products p ON ii.product_id = p.id JOIN invoices inv ON ii.invoice_id = inv.id WHERE inv.created_at >= datetime('now', '-30 days') GROUP BY p.id ORDER BY total_sold DESC LIMIT 10").all();
    const customerBehavior = db.prepare("SELECT customer_name, customer_phone, COUNT(*) as visit_count, SUM(total_amount) as lifetime_value FROM invoices WHERE customer_phone IS NOT NULL AND customer_phone != '' GROUP BY customer_phone ORDER BY lifetime_value DESC LIMIT 10").all();
    const deadStock = db.prepare("SELECT name, quantity, unit, price FROM products WHERE quantity > 0 AND id NOT IN (SELECT DISTINCT product_id FROM invoice_items ii JOIN invoices inv ON ii.invoice_id = inv.id WHERE inv.created_at >= datetime('now', '-60 days'))").all();
    res.json({ peakHours, categoryRevenue, topSelling, customerBehavior, deadStock });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── AI Chatbot ────────────────────────────────────────────────────
app.post("/api/ai/ask", (req, res) => {
  try {
    const { question } = req.body;
    const q = question.toLowerCase();
    let answer = "I can tell you about sales, top products, stock alerts, or your best customers!";
    if (q.includes("sale") || q.includes("revenue")) {
      const t = db.prepare("SELECT SUM(total_amount) as t FROM invoices WHERE date(created_at)=date('now')").get().t || 0;
      answer = `Your total sales for today is ₹${t}.`;
    } else if (q.includes("product") || q.includes("most sold") || q.includes("best") || q.includes("top")) {
      const top = db.prepare("SELECT p.name, SUM(ii.quantity) as q FROM invoice_items ii JOIN products p ON ii.product_id=p.id GROUP BY p.id ORDER BY q DESC LIMIT 1").get();
      answer = top ? `Your top selling product is ${top.name} with ${top.q} units sold.` : "No sales data found.";
    } else if (q.includes("stock") || q.includes("low")) {
      const low = db.prepare("SELECT COUNT(*) as c FROM products WHERE quantity <= 5").get().c;
      answer = `You have ${low} products running low on stock. Check the inventory alerts!`;
    } else if (q.includes("expiry") || q.includes("expired")) {
      const exp = db.prepare("SELECT COUNT(*) as c FROM products WHERE expiry_date < date('now')").get().c;
      answer = `${exp} products have already expired. Please remove them from the shelves.`;
    } else if (q.includes("customer") || q.includes("buyer")) {
      const top = db.prepare("SELECT customer_name, SUM(total_amount) as t FROM invoices WHERE customer_name != '' GROUP BY customer_phone ORDER BY t DESC LIMIT 1").get();
      answer = top ? `Your most valuable customer is ${top.customer_name} with a lifetime spend of ₹${top.t}.` : "No customer data available.";
    }
    res.json({ answer });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Notifications ─────────────────────────────────────────────────
app.get("/api/notifications", (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const unreadOnly = req.query.unread === "true";
    let query = "SELECT * FROM notifications";
    if (unreadOnly) query += " WHERE is_read = 0";
    query += " ORDER BY created_at DESC LIMIT ?";
    const notifications = db.prepare(query).all(limit);
    const unreadCount = db.prepare("SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0").get().cnt;
    res.json({ notifications, unreadCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/notifications/read", (req, res) => {
  try {
    const { id } = req.body;
    if (id) db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(id);
    else db.prepare("UPDATE notifications SET is_read = 1 WHERE is_read = 0").run();
    res.json({ message: "Marked as read" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/notifications/:id", (req, res) => {
  try { db.prepare("DELETE FROM notifications WHERE id = ?").run(req.params.id); res.json({ message: "Deleted" }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── App Settings ──────────────────────────────────────────────────
app.get("/api/settings", (req, res) => {
  try {
    const settingsPath = path.join(__dirname, "app_settings.json");
    if (fs.existsSync(settingsPath)) {
      res.json(JSON.parse(fs.readFileSync(settingsPath, "utf-8")));
    } else {
      res.json({});
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/settings", (req, res) => {
  try {
    fs.writeFileSync(path.join(__dirname, "app_settings.json"), JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Get Local IP helper ────────────────────────────────────────────
function getLocalIP() {
  const os = require("os");
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "127.0.0.1";
}

// ── Start Server ──────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", async () => {
  const localIP = getLocalIP();
  console.log("");
  console.log("  ╔══════════════════════════════════════════════════════╗");
  console.log("  ║       🚀 Smart Billing — Web Server Mode            ║");
  console.log("  ╠══════════════════════════════════════════════════════╣");
  console.log(`  ║  API Server:    http://localhost:${PORT}               ║`);
  console.log(`  ║  Local IP:      http://${localIP}:${PORT}       ║`);
  console.log("  ║  Frontend:      http://localhost:5174                ║");
  console.log("  ║  Database:      Local SQLite (offline-first)        ║");
  console.log("  ╚══════════════════════════════════════════════════════╝");
  console.log(`  📱 Share this URL with owner mobile: http://${localIP}:${PORT}`);
  console.log("");

  // Initialize Supabase + register shop
  initSupabase();
  await registerShopInSupabase();

  // Initial sync
  await syncToCloud();

  // Periodic sync every 60 seconds
  setInterval(async () => {
    await syncToCloud();
  }, 60000);

  // Alert checks every 60 seconds
  runAlertCheck();
  setInterval(runAlertCheck, 60000);
});
