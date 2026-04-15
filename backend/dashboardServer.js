/**
 * INNOAIVATORS Smart Billing — Owner Mobile Dashboard API Server
 * Runs inside the Electron main process on a local HTTP port.
 * Internet access via localtunnel — owner can access from ANYWHERE.
 */

const express = require("express");
const cors = require("cors");
const http = require("http");
const os = require("os");
const path = require("path");
const db = require("./db");

const PORT = 4567;
let server = null;
let localIP = "127.0.0.1";
let tunnelURL = null;   // Public internet URL (via localtunnel)
let tunnelObj = null;

const getSettings = () => {
    try {
        const { app } = require("electron");
        const fs = require("fs");
        const path = require("path");
        const configPath = path.join(app.getPath("userData"), "app_settings.json");
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch(e) {}
    return { masterKey: "owner123" };
};

/* ── Get local WiFi IP ─────────────────────────────── */
function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "127.0.0.1";
}

/* ── Helpers ─────────────────────────────────────────── */
function todayStr() { return new Date().toISOString().split("T")[0]; }
function in7days() { return new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0]; }
function inNdays(n) { return new Date(Date.now() + n * 86400000).toISOString().split("T")[0]; }

/* ── Reconnection Logic & Tunnel Management ── */
async function startTunnel(mainWindow) {
  const settings = getSettings();
  // Remove words that localtunnel blocks (like billing, bank, pay)
  const baseName = (settings.storeName || "mystore").toLowerCase().replace(/billing|invoice|pay/g, "app");
  const shopSlug = baseName.replace(/[^a-z0-9]/g, "-");
  
  // Create a persistent, stable identifier so the QR code NEVER changes
  const stableId = process.env.SHOP_ID || "store123";
  const stableSuffix = stableId.replace(/[^a-zA-Z0-9]/g, "").slice(-6); 
  const subdomain = `${shopSlug}-manager-${stableSuffix}`.toLowerCase();

  try {
    const localtunnel = require("localtunnel");
    
    // Close existing tunnel if any
    if (tunnelObj) {
      try { tunnelObj.close(); } catch(e) {}
    }

    tunnelObj = await localtunnel({ 
      port: PORT, 
      subdomain: subdomain 
    });

    tunnelURL = tunnelObj.url;
    console.log("[Sync Engine] Public URL:", tunnelURL);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("tunnel-ready", { url: tunnelURL });
    }

    tunnelObj.on("close", () => {
      console.log("[Sync Engine] Tunnel lost. Attempting reconnect in 30s...");
      tunnelURL = null;
      setTimeout(() => { if (mainWindow) startTunnel(mainWindow); }, 30000);
    });

    tunnelObj.on("error", (err) => {
      console.error("[Sync Engine] Tunnel error:", err.message);
      setTimeout(() => { if (mainWindow) startTunnel(mainWindow); }, 30000);
    });

  } catch (e) {
    console.warn("[Sync Engine] Offline mode. Waiting for internet...");
    setTimeout(() => { if (mainWindow) startTunnel(mainWindow); }, 60000); // Check every minute
  }
}

/* ── Start API Server ────────────────────────────────── */
function startDashboardServer(mainWindow) {
  localIP = getLocalIP();
  const expressApp = express();
  expressApp.use(cors());
  expressApp.use(express.json({ limit: '50mb' }));

  // ── Serve the mobile dashboard HTML ─────────────────
  expressApp.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "mobile-dashboard", "index.html"));
  });
  expressApp.use(express.static(path.join(__dirname, "..", "mobile-dashboard")));

  expressApp.post("/api/auth", (req, res) => {
    const { key } = req.body;
    const settings = getSettings();
    if (key === settings.masterKey) {
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false });
    }
  });

  /* ══════════════════════════════════════════════════════
     API: Dashboard Summary Stats + Profit
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/stats", (req, res) => {
    try {
      const today = todayStr();
      const in30 = inNdays(30);

      const totalProducts = db.prepare("SELECT COUNT(*) as cnt FROM products").get().cnt;
      const totalCategories = db.prepare("SELECT COUNT(*) as cnt FROM categories").get().cnt;

      // Sales
      const todaySales = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE date(created_at)=date('now','localtime')`).get().t;
      const todayBills = db.prepare(`SELECT COUNT(*) as cnt FROM invoices WHERE date(created_at)=date('now','localtime')`).get().cnt;
      const weeklySales = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE created_at>=datetime('now','-7 days')`).get().t;
      const monthlySales = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE created_at>=datetime('now','-30 days')`).get().t;

      // Alerts
      const settings = getSettings();
      const lowThreshold = settings.lowStockThreshold || 10;
      const expiryAlertDays = settings.expiryAlertDays || 3;
      const inExpiry = inNdays(expiryAlertDays);

      const expiredCount = db.prepare(`SELECT COUNT(*) as cnt FROM products WHERE expiry_date IS NOT NULL AND expiry_date<?`).get(today).cnt;
      const nearExpiryCount = db.prepare(`SELECT COUNT(*) as cnt FROM products WHERE expiry_date IS NOT NULL AND expiry_date>=? AND expiry_date<=?`).get(today, inExpiry).cnt;
      const lowStockCount = db.prepare(`SELECT COUNT(*) as cnt FROM products WHERE quantity>0 AND quantity<=?`).get(lowThreshold).cnt;
      const outOfStock = db.prepare(`SELECT COUNT(*) as cnt FROM products WHERE quantity<=0`).get().cnt;

      // Product lists for drilldown
      const lowStockProducts = db.prepare(`SELECT p.name, p.quantity, p.unit FROM products p WHERE p.quantity>0 AND p.quantity<=? ORDER BY p.quantity ASC`).all(lowThreshold);
      const outOfStockProducts = db.prepare(`SELECT p.name, p.unit FROM products p WHERE p.quantity<=0`).all();
      const expiringProducts = db.prepare(`SELECT p.name, p.expiry_date, p.quantity FROM products p WHERE p.expiry_date IS NOT NULL AND p.expiry_date>=? AND p.expiry_date<=? ORDER BY p.expiry_date ASC`).all(today, inExpiry);
      const expiredProducts = db.prepare(`SELECT p.name, p.expiry_date, p.quantity FROM products p WHERE p.expiry_date IS NOT NULL AND p.expiry_date<? ORDER BY p.expiry_date ASC`).all(today);

      // Top 5 products this month
      const topProducts = db.prepare(`
        SELECT p.name, SUM(ii.quantity) as sold, SUM(ii.price*ii.quantity) as revenue
        FROM invoice_items ii
        JOIN products p ON ii.product_id=p.id
        JOIN invoices inv ON ii.invoice_id=inv.id
        WHERE inv.created_at>=datetime('now','-30 days')
        GROUP BY ii.product_id ORDER BY sold DESC LIMIT 8
      `).all();

      // Daily sales last 7 days
      const dailySales = db.prepare(`
        SELECT date(created_at,'localtime') as day,
               COUNT(*) as bills,
               COALESCE(SUM(total_amount),0) as total
        FROM invoices
        WHERE created_at>=datetime('now','-7 days')
        GROUP BY day ORDER BY day ASC
      `).all();

      // Monthly sales last 6 months
      const monthlySalesBreakdown = db.prepare(`
        SELECT strftime('%Y-%m', created_at,'localtime') as month,
               COUNT(*) as bills,
               COALESCE(SUM(total_amount),0) as total
        FROM invoices
        WHERE created_at>=datetime('now','-180 days')
        GROUP BY month ORDER BY month ASC
      `).all();

      // ── PROFIT CALCULATIONS ──────────────────────────
      const todayCost = db.prepare(`
        SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as cost
        FROM invoice_items ii
        JOIN products p ON ii.product_id=p.id
        JOIN invoices inv ON ii.invoice_id=inv.id
        WHERE date(inv.created_at)=date('now','localtime')
      `).get().cost;

      const weeklyCost = db.prepare(`
        SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as cost
        FROM invoice_items ii
        JOIN products p ON ii.product_id=p.id
        JOIN invoices inv ON ii.invoice_id=inv.id
        WHERE inv.created_at>=datetime('now','-7 days')
      `).get().cost;

      const monthlyCost = db.prepare(`
        SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as cost
        FROM invoice_items ii
        JOIN products p ON ii.product_id=p.id
        JOIN invoices inv ON ii.invoice_id=inv.id
        WHERE inv.created_at>=datetime('now','-30 days')
      `).get().cost;

      const todayProfit = todaySales - todayCost;
      const weeklyProfit = weeklySales - weeklyCost;
      const monthlyProfit = monthlySales - monthlyCost;

      // ── PEAK TIME ANALYSIS ───────────────────────────
      const peakHours = db.prepare(`
        SELECT strftime('%H', created_at,'localtime') as hour,
               COUNT(*) as bills,
               COALESCE(SUM(total_amount),0) as revenue
        FROM invoices
        WHERE created_at>=datetime('now','-30 days')
        GROUP BY hour ORDER BY bills DESC LIMIT 24
      `).all();

      // Payment mode breakdown
      const paymentBreakdown = db.prepare(`
        SELECT payment_mode, COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total
        FROM invoices
        WHERE created_at>=datetime('now','-30 days')
        GROUP BY payment_mode ORDER BY cnt DESC
      `).all();

      // Dead Stock (No sales in 60 days)
      const deadStock = db.prepare(`
        SELECT name, quantity FROM products
        WHERE quantity > 0 AND id NOT IN (
          SELECT DISTINCT product_id FROM invoice_items ii
          JOIN invoices inv ON ii.invoice_id = inv.id
          WHERE inv.created_at >= datetime('now', '-60 days')
        )
      `).all();

      res.json({
        totalProducts, totalCategories,
        todaySales, todayBills, weeklySales, monthlySales,
        expiredCount, nearExpiryCount, lowStockCount, outOfStock,
        topSelling: topProducts.map(p => ({ ...p, total_sold: p.sold })), 
        dailySales, monthlySalesBreakdown,
        todayProfit, weeklyProfit, monthlyProfit,
        todayCost, weeklyCost, monthlyCost,
        peakHours, paymentBreakdown,
        deadStock,
        lowStockProducts, outOfStockProducts, expiringProducts, expiredProducts
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /* ══════════════════════════════════════════════════════
     API: Expiry Alerts
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/expiry", (req, res) => {
    try {
      const today = todayStr();
      const in30 = inNdays(30);   // show 30-day window for complete visibility
      const in7 = in7days();

      const expired = db.prepare(`
        SELECT p.*,c.name as category_name
        FROM products p LEFT JOIN categories c ON p.category_id=c.id
        WHERE p.expiry_date IS NOT NULL AND p.expiry_date<?
        ORDER BY p.expiry_date ASC
      `).all(today);

      const nearExpiry = db.prepare(`
        SELECT p.*,c.name as category_name
        FROM products p LEFT JOIN categories c ON p.category_id=c.id
        WHERE p.expiry_date IS NOT NULL AND p.expiry_date>=? AND p.expiry_date<=?
        ORDER BY p.expiry_date ASC
      `).all(today, in30);

      res.json({ expired, nearExpiry });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: Invoices History
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/invoices", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM invoices ORDER BY created_at DESC").all();
      const itemsStmt = db.prepare(`
        SELECT p.name
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        WHERE ii.invoice_id = ?
      `);
      res.json(rows.map(r => ({
        ...r,
        productsList: itemsStmt.all(r.id).map(i => i.name).join(", ")
      })));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /* ══════════════════════════════════════════════════════
     API: Invoice Details (line items)
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/invoices/:id/items", (req, res) => {
    try {
      const items = db.prepare(`
        SELECT ii.quantity, ii.price, ii.gst_rate, ii.gst_amount, p.name
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        WHERE ii.invoice_id = ?
      `).all(req.params.id);
      res.json(items);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: Delete Invoice
  ══════════════════════════════════════════════════════ */
  expressApp.delete("/api/invoices/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM invoice_items WHERE invoice_id = ?").run(req.params.id);
      db.prepare("DELETE FROM invoices WHERE id = ?").run(req.params.id);
      res.json({ message: "Invoice deleted" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: Stock Alerts (low / dead / out-of-stock)
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/stock", (req, res) => {
    try {
      const settings = getSettings();
      const lowThreshold = settings.lowStockThreshold || 10;

      const lowStock = db.prepare(`
        SELECT p.*,c.name as category_name
        FROM products p LEFT JOIN categories c ON p.category_id=c.id
        WHERE p.quantity>0 AND p.quantity<=?
        ORDER BY p.quantity ASC
      `).all(lowThreshold);

      const deadStock = db.prepare(`
        SELECT p.*,c.name as category_name
        FROM products p LEFT JOIN categories c ON p.category_id=c.id
        WHERE p.quantity>0
        AND p.id NOT IN (
          SELECT DISTINCT ii.product_id FROM invoice_items ii
          INNER JOIN invoices inv ON ii.invoice_id=inv.id
          WHERE inv.created_at>=datetime('now','-30 days')
        )
        ORDER BY p.quantity DESC
      `).all();

      const outOfStock = db.prepare(`
        SELECT p.*,c.name as category_name
        FROM products p LEFT JOIN categories c ON p.category_id=c.id
        WHERE p.quantity<=0
      `).all();

      res.json({ lowStock, deadStock, outOfStock });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: Analytics — Peak time, trends etc.
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/analytics", (req, res) => {
    try {
      // 1. Peak hours (last 30 days)
      const peakHours = db.prepare(`
        SELECT strftime('%H', created_at,'localtime') as hour,
               COUNT(*) as bills,
               SUM(total_amount) as revenue
        FROM invoices
        WHERE created_at >= datetime('now', '-30 days')
        GROUP BY hour ORDER BY hour ASC
      `).all();

      // 2. Category revenue breakdown
      const categoryRevenue = db.prepare(`
        SELECT c.name as category, SUM(ii.price * ii.quantity) as revenue
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        LEFT JOIN categories c ON p.category_id = c.id
        JOIN invoices inv ON ii.invoice_id = inv.id
        WHERE inv.created_at >= datetime('now', '-30 days')
        GROUP BY category ORDER BY revenue DESC
      `).all();

      // 3. Top 10 selling products (last 30 days)
      const topSelling = db.prepare(`
        SELECT p.name, SUM(ii.quantity) as total_sold, SUM(ii.price * ii.quantity) as total_revenue
        FROM invoice_items ii
        JOIN products p ON ii.product_id = p.id
        JOIN invoices inv ON ii.invoice_id = inv.id
        WHERE inv.created_at >= datetime('now', '-30 days')
        GROUP BY p.id ORDER BY total_sold DESC LIMIT 10
      `).all();

      // 4. Customer behavior (Frequent buyers / High value)
      const customerBehavior = db.prepare(`
        SELECT customer_name, customer_phone, COUNT(*) as visit_count, SUM(total_amount) as lifetime_value
        FROM invoices
        WHERE customer_phone IS NOT NULL AND customer_phone != ''
        GROUP BY customer_phone ORDER BY lifetime_value DESC LIMIT 10
      `).all();

      // 5. Dead Stock: Products with quantity > 0 but no sales in last 60 days
      const deadStock = db.prepare(`
        SELECT name, quantity, unit, price FROM products
        WHERE quantity > 0 AND id NOT IN (
          SELECT DISTINCT product_id FROM invoice_items ii
          JOIN invoices inv ON ii.invoice_id = inv.id
          WHERE inv.created_at >= datetime('now', '-60 days')
        )
      `).all();

      res.json({ peakHours, categoryRevenue, topSelling, customerBehavior, deadStock });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: Recent invoices
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/invoices", (req, res) => {
    try {
      const invoices = db.prepare(`SELECT * FROM invoices ORDER BY created_at DESC LIMIT 20`).all();
      res.json(invoices);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: For Localhost Web Browser Fallback
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/categories", (req, res) => {
    try { res.json(db.prepare("SELECT * FROM categories").all()); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.get("/api/products/full", (req, res) => {
    try {
      res.json(db.prepare(`
        SELECT p.*, c.gst as category_gst, c.name as category_name
        FROM products p LEFT JOIN categories c ON p.category_id = c.id
      `).all());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.post("/api/products", (req, res) => {
    try {
      const { name, category_id, price, cost_price, quantity, unit, barcode, expiry_date, image } = req.body;
      db.prepare(`INSERT INTO products (name, category_id, price, cost_price, quantity, unit, barcode, expiry_date, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        name, category_id || null, price, cost_price || 0, quantity, unit, barcode ? String(barcode) : null, expiry_date || null, image || null
      );
      res.json({ message: "Product added" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.put("/api/products/:id", (req, res) => {
    try {
      const { name, category_id, price, cost_price, quantity, unit, barcode, expiry_date, image } = req.body;
      db.prepare(`UPDATE products SET name=?, category_id=?, price=?, cost_price=?, quantity=?, unit=?, barcode=?, expiry_date=?, image=? WHERE id=?`).run(
        name, category_id || null, price, cost_price || 0, quantity, unit, barcode ? String(barcode) : null, expiry_date || null, image || null, req.params.id
      );
      res.json({ message: "Product updated" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.delete("/api/products/:id", (req, res) => {
    try { db.prepare(`DELETE FROM products WHERE id=?`).run(req.params.id); res.json({ message: "Product deleted" }); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.post("/api/products/bulk", (req, res) => {
    try {
      const updates = req.body;
      const stmt = db.prepare(`UPDATE products SET quantity = quantity + ? WHERE id = ?`);
      const trans = db.transaction((items) => { for (const item of items) stmt.run(item.addQty, item.id); });
      trans(updates);
      res.json({ message: "Bulk updated" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.get("/api/customers/:phone", (req, res) => {
    try { res.json(db.prepare("SELECT * FROM customers WHERE phone = ?").get(req.params.phone) || null); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.post("/api/invoices", (req, res) => {
    try {
      const { cart, customer, paymentMode } = req.body;
      let total = 0;
      cart.forEach(item => { total += (item.total + item.gstAmt); });

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

      const invRes = db.prepare(`INSERT INTO invoices (customer_name, customer_phone, customer_address, customer_id, payment_mode, total_amount) VALUES (?, ?, ?, ?, ?, ?)`).run(
        customer?.name || "", customer?.phone || "", customer?.address || "", customerId, paymentMode || "Cash", total
      );
      const invoiceId = invRes.lastInsertRowid;

      const insertItem = db.prepare(`INSERT INTO invoice_items (invoice_id, product_id, quantity, price, gst_rate, gst_amount) VALUES (?, ?, ?, ?, ?, ?)`);
      const updateStock = db.prepare(`UPDATE products SET quantity = quantity - ? WHERE id = ?`);

      db.transaction((items) => {
        for (const item of items) {
          insertItem.run(invoiceId, item.id, item.qty, item.price, item.gstRate, item.gstAmt);
          updateStock.run(item.qty, item.id);
        }
      })(cart);
      res.json({ message: "Invoice created", invoiceId });
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
  });

  expressApp.post("/api/held-bills", (req, res) => {
    try {
      const { cart, customer, label } = req.body;
      db.prepare(`INSERT INTO held_bills (label, cart_json, customer_json) VALUES (?, ?, ?)`).run(
        label || `Held ${new Date().toLocaleTimeString('en-IN')}`, JSON.stringify(cart), JSON.stringify(customer || {})
      );
      res.json({ message: "Held" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.get("/api/held-bills", (req, res) => {
    try {
      const rows = db.prepare("SELECT * FROM held_bills ORDER BY created_at DESC").all();
      res.json(rows.map(r => ({ ...r, cart: JSON.parse(r.cart_json), customer: JSON.parse(r.customer_json || '{}') })));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.delete("/api/held-bills/:id", (req, res) => {
    try { db.prepare("DELETE FROM held_bills WHERE id=?").run(req.params.id); res.json({ message: "Removed" }); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: Offers & Promotions
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/offers", (req, res) => {
    try {
      res.json(db.prepare(`
        SELECT o.*, b.name as buy_product_name, f.name as free_product_name
        FROM offers o
        JOIN products b ON o.buy_product_id = b.id
        JOIN products f ON o.free_product_id = f.id
        ORDER BY o.created_at DESC
      `).all());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.post("/api/offers", (req, res) => {
    try {
      const { name, status, buy_product_id, buy_quantity, free_product_id, free_quantity } = req.body;
      db.prepare(`INSERT INTO offers (name, status, buy_product_id, buy_quantity, free_product_id, free_quantity) VALUES (?, ?, ?, ?, ?, ?)`).run(
        name, status === undefined ? 1 : status, buy_product_id, buy_quantity, free_product_id, free_quantity
      );
      res.json({ message: "Offer added" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.put("/api/offers/:id", (req, res) => {
    try {
      const { name, status, buy_product_id, buy_quantity, free_product_id, free_quantity } = req.body;
      db.prepare(`UPDATE offers SET name=?, status=?, buy_product_id=?, buy_quantity=?, free_product_id=?, free_quantity=? WHERE id=?`).run(
        name, status, buy_product_id, buy_quantity, free_product_id, free_quantity, req.params.id
      );
      res.json({ message: "Offer updated" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.delete("/api/offers/:id", (req, res) => {
    try { db.prepare("DELETE FROM offers WHERE id=?").run(req.params.id); res.json({ message: "Offer deleted" }); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.post("/api/offers/:id/toggle", (req, res) => {
    try {
      const { status } = req.body;
      db.prepare("UPDATE offers SET status=? WHERE id=?").run(status, req.params.id);
      res.json({ message: "Status toggled" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: AI CHATBOT (Business Insights)
  ══════════════════════════════════════════════════════ */
  expressApp.post("/api/ai/ask", (req, res) => {
    try {
      const { question } = req.body;
      const q = question.toLowerCase();
      let answer = "I'm sorry, I don't have that data yet.";

      if (q.includes("sale") || q.includes("revenue")) {
        const today = db.prepare(`SELECT SUM(total_amount) as t FROM invoices WHERE date(created_at)=date('now')`).get().t || 0;
        answer = `Your total sales for today is ₹${today}.`;
      } else if (q.includes("product") || q.includes("most sold")) {
        const top = db.prepare(`
          SELECT p.name, SUM(ii.quantity) as q FROM invoice_items ii JOIN products p ON ii.product_id=p.id GROUP BY p.id ORDER BY q DESC LIMIT 1
        `).get();
        answer = top ? `Your top selling product is ${top.name} with ${top.q} units sold.` : "No sales data found.";
      } else if (q.includes("stock") || q.includes("low")) {
        const low = db.prepare(`SELECT COUNT(*) as c FROM products WHERE quantity <= 5`).get().c;
        answer = `You have ${low} products running low on stock. Check the inventory alerts!`;
      } else if (q.includes("expiry") || q.includes("expired")) {
        const exp = db.prepare(`SELECT COUNT(*) as c FROM products WHERE expiry_date < date('now')`).get().c;
        answer = `${exp} products have already expired. Please remove them from the shelves.`;
      } else if (q.includes("customer") || q.includes("buyer")) {
        const top = db.prepare(`SELECT customer_name, SUM(total_amount) as t FROM invoices WHERE customer_name != '' GROUP BY customer_phone ORDER BY t DESC LIMIT 1`).get();
        answer = top ? `Your most valuable customer is ${top.customer_name} with a lifetime spend of ₹${top.t}.` : "No customer data available.";
      } else {
        answer = "I can tell you about sales, top products, stock alerts, or your best customers!";
      }

      res.json({ answer });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: Notifications (Owner Mobile Alerts)
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/notifications", (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const unreadOnly = req.query.unread === 'true';
      
      let query = "SELECT * FROM notifications";
      if (unreadOnly) query += " WHERE is_read = 0";
      query += " ORDER BY created_at DESC LIMIT ?";
      
      const notifications = db.prepare(query).all(limit);
      const unreadCount = db.prepare("SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0").get().cnt;
      
      res.json({ notifications, unreadCount });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.post("/api/notifications/read", (req, res) => {
    try {
      const { id } = req.body;
      if (id) {
        db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(id);
      } else {
        db.prepare("UPDATE notifications SET is_read = 1 WHERE is_read = 0").run();
      }
      res.json({ message: "Marked as read" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  expressApp.delete("/api/notifications/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM notifications WHERE id = ?").run(req.params.id);
      res.json({ message: "Notification deleted" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  /* ── Start HTTP server ────────────────────────────── */
  server = http.createServer(expressApp);
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Dashboard API] Local: http://${localIP}:${PORT}`);
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send("dashboard-server-ready", {
        ip: localIP, port: PORT, url: `http://${localIP}:${PORT}`
      });
    }
    // Start internet tunnel after server is up
    startTunnel(mainWindow);
  });

  server.on("error", (err) => {
    console.error("[Dashboard API] Error:", err.message);
  });
}

function stopDashboardServer() {
  if (tunnelObj) { try { tunnelObj.close(); } catch (e) { } }
  if (server) { server.close(); }
}

function getDashboardURL() { return `http://${localIP}:${PORT}`; }
function getTunnelURL() { return tunnelURL; }

module.exports = { startDashboardServer, stopDashboardServer, getDashboardURL, getTunnelURL };
