/**
 * INNOAIVATORS Smart Billing — Owner Mobile Dashboard API Server
 * Runs inside the Electron main process on a local HTTP port.
 * Internet access via localtunnel — owner can access from ANYWHERE.
 */

const express  = require("express");
const cors     = require("cors");
const http     = require("http");
const os       = require("os");
const path     = require("path");
const db       = require("./db");

const PORT = 4567;
let server      = null;
let localIP     = "127.0.0.1";
let tunnelURL   = null;   // Public internet URL (via localtunnel)
let tunnelObj   = null;

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
function in7days()  { return new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0]; }
function inNdays(n) { return new Date(Date.now() + n * 86400000).toISOString().split("T")[0]; }

/* ── Start Internet Tunnel ──────────────────────────── */
async function startTunnel(mainWindow) {
  try {
    const localtunnel = require("localtunnel");
    tunnelObj = await localtunnel({ port: PORT, subdomain: "innoaivators-dashboard" });
    tunnelURL = tunnelObj.url;
    console.log("[Tunnel] Public URL:", tunnelURL);

    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send("tunnel-ready", { url: tunnelURL });
    }

    tunnelObj.on("close", () => {
      console.log("[Tunnel] Closed.");
      tunnelURL = null;
    });
    tunnelObj.on("error", (err) => {
      console.error("[Tunnel] Error:", err.message);
    });
  } catch (e) {
    console.warn("[Tunnel] Could not start internet tunnel:", e.message);
    // Fallback: local IP only
  }
}

/* ── Start API Server ────────────────────────────────── */
function startDashboardServer(mainWindow) {
  localIP = getLocalIP();
  const expressApp = express();
  expressApp.use(cors());
  expressApp.use(express.json());

  // ── Serve the mobile dashboard HTML ─────────────────
  expressApp.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "mobile-dashboard", "index.html"));
  });
  expressApp.use(express.static(path.join(__dirname, "..", "mobile-dashboard")));

  /* ══════════════════════════════════════════════════════
     API: Dashboard Summary Stats + Profit
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/stats", (req, res) => {
    try {
      const today = todayStr();
      const in7   = in7days();
      const in30  = inNdays(30);

      const totalProducts   = db.prepare("SELECT COUNT(*) as cnt FROM products").get().cnt;
      const totalCategories = db.prepare("SELECT COUNT(*) as cnt FROM categories").get().cnt;

      // Sales
      const todaySales   = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE date(created_at)=date('now','localtime')`).get().t;
      const todayBills   = db.prepare(`SELECT COUNT(*) as cnt FROM invoices WHERE date(created_at)=date('now','localtime')`).get().cnt;
      const weeklySales  = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE created_at>=datetime('now','-7 days')`).get().t;
      const monthlySales = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE created_at>=datetime('now','-30 days')`).get().t;

      // Alerts
      const expiredCount    = db.prepare(`SELECT COUNT(*) as cnt FROM products WHERE expiry_date IS NOT NULL AND expiry_date<?`).get(today).cnt;
      const nearExpiryCount = db.prepare(`SELECT COUNT(*) as cnt FROM products WHERE expiry_date IS NOT NULL AND expiry_date>=? AND expiry_date<=?`).get(today, in7).cnt;
      const lowStockCount   = db.prepare(`SELECT COUNT(*) as cnt FROM products WHERE quantity>0 AND quantity<=5`).get().cnt;
      const outOfStock      = db.prepare(`SELECT COUNT(*) as cnt FROM products WHERE quantity<=0`).get().cnt;

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

      const todayProfit   = todaySales   - todayCost;
      const weeklyProfit  = weeklySales  - weeklyCost;
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

      res.json({
        totalProducts, totalCategories,
        todaySales, todayBills, weeklySales, monthlySales,
        expiredCount, nearExpiryCount, lowStockCount, outOfStock,
        topProducts, dailySales, monthlySalesBreakdown,
        todayProfit, weeklyProfit, monthlyProfit,
        todayCost, weeklyCost, monthlyCost,
        peakHours, paymentBreakdown
      });
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });

  /* ══════════════════════════════════════════════════════
     API: Expiry Alerts
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/expiry", (req, res) => {
    try {
      const today = todayStr();
      const in30  = inNdays(30);   // show 30-day window for complete visibility
      const in7   = in7days();

      const expired    = db.prepare(`
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
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: Stock Alerts (low / dead / out-of-stock)
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/stock", (req, res) => {
    try {
      const lowStock = db.prepare(`
        SELECT p.*,c.name as category_name
        FROM products p LEFT JOIN categories c ON p.category_id=c.id
        WHERE p.quantity>0 AND p.quantity<=5
        ORDER BY p.quantity ASC
      `).all();

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
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: Analytics — Peak time, trends etc.
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/analytics", (req, res) => {
    try {
      // Peak hours (last 30 days)
      const peakHours = db.prepare(`
        SELECT strftime('%H', created_at,'localtime') as hour,
               COUNT(*) as bills,
               COALESCE(SUM(total_amount),0) as revenue
        FROM invoices
        WHERE created_at>=datetime('now','-30 days')
        GROUP BY hour ORDER BY hour ASC
      `).all();

      // Day of week analysis
      const dayOfWeek = db.prepare(`
        SELECT strftime('%w', created_at,'localtime') as dow,
               COUNT(*) as bills,
               COALESCE(SUM(total_amount),0) as revenue
        FROM invoices
        WHERE created_at>=datetime('now','-30 days')
        GROUP BY dow ORDER BY dow ASC
      `).all();

      // Category revenue breakdown
      const categoryRevenue = db.prepare(`
        SELECT c.name as category, COALESCE(SUM(ii.price*ii.quantity),0) as revenue, COUNT(DISTINCT ii.invoice_id) as orders
        FROM invoice_items ii
        JOIN products p ON ii.product_id=p.id
        LEFT JOIN categories c ON p.category_id=c.id
        JOIN invoices inv ON ii.invoice_id=inv.id
        WHERE inv.created_at>=datetime('now','-30 days')
        GROUP BY c.name ORDER BY revenue DESC LIMIT 10
      `).all();

      // Recently added products
      const recentProducts = db.prepare(`
        SELECT name, quantity, price, unit, created_at
        FROM products ORDER BY created_at DESC LIMIT 5
      `).all();

      res.json({ peakHours, dayOfWeek, categoryRevenue, recentProducts });
    } catch(e) { res.status(500).json({ error: e.message }); }
  });

  /* ══════════════════════════════════════════════════════
     API: Recent invoices
  ══════════════════════════════════════════════════════ */
  expressApp.get("/api/invoices", (req, res) => {
    try {
      const invoices = db.prepare(`SELECT * FROM invoices ORDER BY created_at DESC LIMIT 20`).all();
      res.json(invoices);
    } catch(e) { res.status(500).json({ error: e.message }); }
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
  if (tunnelObj) { try { tunnelObj.close(); } catch(e){} }
  if (server)    { server.close(); }
}

function getDashboardURL()     { return `http://${localIP}:${PORT}`; }
function getTunnelURL()        { return tunnelURL; }

module.exports = { startDashboardServer, stopDashboardServer, getDashboardURL, getTunnelURL };
