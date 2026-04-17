const fs = require("fs");
const path = require("path");
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { app, BrowserWindow, ipcMain, shell, dialog, globalShortcut } = require("electron");
const { execSync } = require("child_process");
const db = require("./db");
const { initWhatsApp, sendMessage, getStatus } = require("./whatsapp");
const { startDashboardServer, stopDashboardServer, getDashboardURL, getTunnelURL } = require("./dashboardServer");
const { v4: uuidv4 } = require("uuid");
const { createClient } = require('@supabase/supabase-js');

// ── HARDWARE LICENSING ──
function getMachineId() {
  try {
    const output = execSync("wmic csproduct get uuid").toString();
    const lines = output.trim().split("\n");
    // Usually line 0 is 'UUID' and line 1 is the actual ID
    return lines[lines.length - 1].trim();
  } catch (e) {
    return "unknown-hwid";
  }
}

// ── CLOUD SYNC ENGINE ──
let supabase = null;
function initSupabase(url, key) {
  if (!supabase && url && key) {
    try { supabase = createClient(url, key); } catch (e) { }
  }
}
async function syncToCloud(shopId) {
  if (!supabase) return;
  try {
    // 1. Sync Products (with category name join)
    const products = db.prepare(`
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.is_synced = 0
    `).all();

    for (const p of products) {
      const { id, is_synced, flag_low_stock, flag_out_of_stock, flag_expiry, flag_dead_stock, ...data } = p;
      const { error } = await supabase.from('products').upsert({
        ...data,
        local_id: id,
        shop_id: shopId,
        updated_at: new Date().toISOString()
      }, { onConflict: 'shop_id,local_id' });

      if (!error) db.prepare("UPDATE products SET is_synced = 1 WHERE id = ?").run(id);
      else console.error(`[Sync] Product error (ID: ${id}):`, error.message);
    }

    // 2. Sync Invoices
    const invoices = db.prepare("SELECT * FROM invoices WHERE is_synced = 0").all();
    for (const inv of invoices) {
      const { id, is_synced, ...data } = inv;
      const { error } = await supabase.from('invoices').upsert({
        ...data,
        local_id: id,
        shop_id: shopId
      }, { onConflict: 'shop_id,local_id' });

      if (!error) {
        db.prepare("UPDATE invoices SET is_synced = 1 WHERE id = ?").run(id);
        const items = db.prepare("SELECT * FROM invoice_items WHERE invoice_id = ?").all(id);
        await supabase.from('invoice_items').upsert(items.map(i => {
          const { id: itemId, ...itemData } = i;
          return { ...itemData, shop_id: shopId, local_id: itemId };
        }));
      } else {
        console.error(`[Sync] Invoice error (ID: ${id}):`, error.message);
      }
    }
    // 3. Push stats snapshot for mobile remote access
    await pushStatsSnapshot(shopId);
  } catch (e) {
    console.error("[Sync] General error:", e.message);
  }
}

// ── Register shop in Supabase (for mobile auth from anywhere) ──
async function registerShop(shopId) {
  if (!supabase) return;
  try {
    let storeName = "My Shop";
    let ownerName = "Shop Owner";
    let mobile = "";
    let email = "";
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    if (fs.existsSync(configPath)) {
      try {
        const s = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        storeName = s.storeName || storeName;
        ownerName = s.ownerName || ownerName;
        mobile = s.ownerPhone || mobile;
        email = s.ownerEmail || email;
      } catch (e) { }
    }
    await supabase.from("shops").upsert({
      id: shopId,
      name: storeName,
      owner_name: ownerName,
      mobile_number: mobile,
      owner_email: email,
      address: settings.storeAddress || '',
      gst_number: settings.gstNumber || '',
      master_key: process.env.MASTER_KEY || "owner123",
      updated_at: new Date().toISOString()
    });
  } catch (e) { }
}

// ── Push comprehensive stats snapshot to Supabase for mobile dashboard ──
async function pushStatsSnapshot(shopId) {
  if (!supabase) return;
  try {
    let settings = {};
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    if (fs.existsSync(configPath)) {
      try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (e) { }
    }

    const lowThreshold = settings.lowStockThreshold || 10;
    const expiryDays = settings.expiryAlertDays || 3;
    const deadThresholdDays = settings.deadStockThresholdDays || 30;

    const today = new Date().toISOString().split("T")[0];
    const inN = new Date(Date.now() + expiryDays * 86400000).toISOString().split("T")[0];

    const totalProducts = db.prepare("SELECT COUNT(*) as c FROM products").get().c;
    const totalCategories = db.prepare("SELECT COUNT(*) as c FROM categories").get().c;
    const todaySales = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE date(created_at)=date('now','localtime')").get().t;
    const todayBills = db.prepare("SELECT COUNT(*) as c FROM invoices WHERE date(created_at)=date('now','localtime')").get().c;
    const weeklySales = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE created_at>=datetime('now','-7 days')").get().t;
    const monthlySales = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices WHERE created_at>=datetime('now','-30 days')").get().t;
    const overallSales = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices").get().t;
    const expiredCount = db.prepare("SELECT COUNT(*) as c FROM products WHERE expiry_date IS NOT NULL AND expiry_date<?").get(today).c;
    const nearExpiryCount = db.prepare("SELECT COUNT(*) as c FROM products WHERE expiry_date IS NOT NULL AND expiry_date>=? AND expiry_date<=?").get(today, inN).c;
    const lowStockCount = db.prepare("SELECT COUNT(*) as c FROM products WHERE quantity>0 AND quantity<=?").get(lowThreshold).c;
    const outOfStock = db.prepare("SELECT COUNT(*) as c FROM products WHERE quantity<=0").get().c;

    const todayCost = db.prepare("SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as c FROM invoice_items ii JOIN products p ON ii.product_id=p.id JOIN invoices inv ON ii.invoice_id=inv.id WHERE date(inv.created_at)=date('now','localtime')").get().c;
    const weeklyCost = db.prepare("SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as c FROM invoice_items ii JOIN products p ON ii.product_id=p.id JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-7 days')").get().c;
    const monthlyCost = db.prepare("SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as c FROM invoice_items ii JOIN products p ON ii.product_id=p.id JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-30 days')").get().c;
    const overallCost = db.prepare("SELECT COALESCE(SUM(p.cost_price*ii.quantity),0) as c FROM invoice_items ii JOIN products p ON ii.product_id=p.id").get().c;
    const overallBills = db.prepare("SELECT COUNT(*) as c FROM invoices").get().c;

    const topProducts = db.prepare("SELECT p.name, SUM(ii.quantity) as sold, SUM(ii.price*ii.quantity) as revenue FROM invoice_items ii JOIN products p ON ii.product_id=p.id JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-30 days') GROUP BY ii.product_id ORDER BY sold DESC LIMIT 8").all();
    const dailySales = db.prepare("SELECT date(created_at,'localtime') as day, COUNT(*) as bills, COALESCE(SUM(total_amount),0) as total FROM invoices WHERE created_at>=datetime('now','-7 days') GROUP BY day ORDER BY day ASC").all();
    const monthlyBreakdown = db.prepare("SELECT strftime('%Y-%m',created_at,'localtime') as month, COUNT(*) as bills, COALESCE(SUM(total_amount),0) as total FROM invoices WHERE created_at>=datetime('now','-180 days') GROUP BY month ORDER BY month ASC").all();
    const yearlyBreakdown = db.prepare("SELECT strftime('%Y',created_at,'localtime') as year, COUNT(*) as bills, COALESCE(SUM(total_amount),0) as total FROM invoices GROUP BY year ORDER BY year DESC LIMIT 5").all();

    // Group by week for current month
    const weeklyBreakdown = db.prepare("SELECT strftime('%W',created_at,'localtime') as week, COALESCE(SUM(total_amount),0) as total, COALESCE(SUM((ii.price - COALESCE(p.cost_price, 0)) * ii.quantity),0) as profit FROM invoice_items ii JOIN products p ON ii.product_id=p.id JOIN invoices inv ON ii.invoice_id=inv.id WHERE strftime('%Y-%m',inv.created_at,'localtime') = strftime('%Y-%m','now','localtime') GROUP BY week ORDER BY week ASC").all();

    const peakHours = db.prepare("SELECT strftime('%H',created_at,'localtime') as hour, COUNT(*) as bills, COALESCE(SUM(total_amount),0) as revenue FROM invoices WHERE created_at>=datetime('now','-30 days') GROUP BY hour ORDER BY bills DESC LIMIT 24").all();
    const paymentBreakdown = db.prepare("SELECT payment_mode, COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM invoices WHERE created_at>=datetime('now','-30 days') GROUP BY payment_mode ORDER BY cnt DESC").all();

    const deadStock = db.prepare(`SELECT name, quantity FROM products WHERE quantity>0 AND id NOT IN (SELECT DISTINCT product_id FROM invoice_items ii JOIN invoices inv ON ii.invoice_id=inv.id WHERE inv.created_at>=datetime('now','-${deadThresholdDays} days'))`).all();
    const lowStockList = db.prepare("SELECT name, quantity, unit FROM products WHERE quantity>0 AND quantity<=? ORDER BY quantity ASC LIMIT 30").all(lowThreshold);
    const outOfStockList = db.prepare("SELECT name, unit FROM products WHERE quantity<=0 LIMIT 30").all();
    const expiredList = db.prepare("SELECT name, expiry_date, quantity FROM products WHERE expiry_date IS NOT NULL AND expiry_date<? ORDER BY expiry_date ASC LIMIT 30").all(today);
    const nearExpiList = db.prepare("SELECT name, expiry_date, quantity FROM products WHERE expiry_date IS NOT NULL AND expiry_date>=? AND expiry_date<=? ORDER BY expiry_date ASC LIMIT 30").all(today, inN);
    const rawInvoices = db.prepare("SELECT id, bill_no, bill_date, customer_name, customer_phone, payment_mode, total_amount, created_at FROM invoices ORDER BY created_at DESC LIMIT 50").all();
    const recentInvoices = rawInvoices.map(inv => {
      const items = db.prepare("SELECT ii.*, p.name FROM invoice_items ii JOIN products p ON ii.product_id = p.id WHERE ii.invoice_id = ?").all(inv.id);
      return { ...inv, items, date: inv.bill_date || inv.created_at };
    });

    const allProductsList = db.prepare("SELECT name, brand, quantity, price, unit FROM products ORDER BY name ASC LIMIT 1000").all();



    await supabase.from("shop_stats").upsert({
      shop_id: shopId,
      stats_json: {
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
        yearlyBreakdown, weeklyBreakdown,
        peakHours, paymentBreakdown, deadStock,
        lowStockProducts: lowStockList,
        outOfStockProducts: outOfStockList,
        expiredProducts: expiredList,
        expiringProducts: nearExpiList,
        recentInvoices,
        allProductsList,
        settings: {
          storeAddress: settings.storeAddress || '',
          storeTagline: settings.storeTagline || '',
          gstNumber: settings.gstNumber || '',
          whatsappNumber: settings.ownerPhone || '',
          expiryAlertDays: expiryDays,
          lowStockThreshold: lowThreshold,
          deadStockThresholdDays: deadThresholdDays
        }
      },
      updated_at: new Date().toISOString()
    });
  } catch (e) { }
}

async function logNotification(shopId, type, message) {
  if (!supabase) return;
  try { await supabase.from('notifications').insert({ shop_id: shopId, type, message }); } catch (e) { }
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true,
    frame: false,
    kiosk: true,
    title: "Innoaivators billing",
    icon: path.join(__dirname, "assets", "logo.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Dynamically set title if shop is already registered
  const settingsPath = path.join(app.getPath("userData"), "app_settings.json");
  if (fs.existsSync(settingsPath)) {
    try {
      const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (s.storeName) {
        mainWindow.setTitle(`${s.storeName} - Innoaivators`);
      }
    } catch (e) { }
  }

  // Handle Fullscreen Toggles
  const { globalShortcut } = require("electron");

  // Esc to exit kiosk/fullscreen
  globalShortcut.register("Escape", () => {
    if (mainWindow) {
      mainWindow.setKiosk(false);
      mainWindow.setFullScreen(false);
    }
  });

  // F11 to enter kiosk/fullscreen
  globalShortcut.register("F11", () => {
    if (mainWindow) {
      mainWindow.setKiosk(true);
      mainWindow.setFullScreen(true);
    }
  });

  // Completely remove the default top menu bar (File, Edit, View, etc.)
  mainWindow.setMenu(null);

  // Force the title to stay "Innoaivators billing" regardless of page content
  mainWindow.on('page-title-updated', (e) => e.preventDefault());

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, "..", "Frontend", "dist", "index.html"));
  } else {
    mainWindow.loadURL("http://localhost:5174");
  }

  // Start WhatsApp client AFTER the window has loaded so QR events reach the renderer
  mainWindow.webContents.once("did-finish-load", () => {
    initWhatsApp(mainWindow);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    stopDashboardServer();
  });

  // Start the background API & Mobile Dashboard server
  startDashboardServer(mainWindow);


  // 🟢 Initialize Cloud Sync & Alert Loop
  setInterval(async () => {
    try {
      const configPath = path.join(app.getPath("userData"), "app_settings.json");
      let settings = {};
      if (fs.existsSync(configPath)) {
        try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (e) { settings = {}; }
      }

      const url = settings.supabaseUrl || process.env.SUPABASE_URL;
      const key = settings.supabaseKey || process.env.SUPABASE_KEY;
      const currentShopId = process.env.SHOP_ID || 'billing-shop';

      // ── Local Notification Alerts (always run, independent of cloud) ──
      const today = new Date().toISOString().split('T')[0];
      const lowThreshold = settings.lowStockThreshold || 10;
      const expiryDays = settings.expiryAlertDays || 3;
      const deadThresholdDays = settings.deadStockThresholdDays || 30;
      const nearExpiryDate = new Date(Date.now() + expiryDays * 86400000).toISOString().split('T')[0];

      const expired = db.prepare("SELECT id, name, expiry_date FROM products WHERE expiry_date IS NOT NULL AND expiry_date < ? AND flag_expiry != 2").all(today);
      const nearExpiry = db.prepare("SELECT id, name, expiry_date FROM products WHERE expiry_date IS NOT NULL AND expiry_date >= ? AND expiry_date <= ? AND flag_expiry = 0").all(today, nearExpiryDate);
      const lowStock = db.prepare("SELECT id, name, quantity FROM products WHERE quantity > 0 AND quantity <= ? AND flag_low_stock = 0").all(lowThreshold);
      const outOfStock = db.prepare("SELECT id, name FROM products WHERE quantity <= 0 AND flag_out_of_stock = 0").all();

      const deadStock = db.prepare(`
          SELECT id, name FROM products 
          WHERE quantity > 0 AND flag_dead_stock = 0 AND id NOT IN (
            SELECT DISTINCT product_id FROM invoice_items ii 
            JOIN invoices inv ON ii.invoice_id = inv.id 
            WHERE inv.created_at >= datetime('now', '-${deadThresholdDays} days')
          )
        `).all();

      const insertNotif = db.prepare("INSERT INTO notifications (type, title, message) VALUES (?, ?, ?)");

      if (expired.length > 0) {
        const names = expired.slice(0, 5).map(p => p.name).join(', ');
        insertNotif.run('EXPIRY', `${expired.length} Products Expired!`, `⚠️ ${names}`);
      }
      if (nearExpiry.length > 0) {
        const names = nearExpiry.slice(0, 5).map(p => p.name).join(', ');
        insertNotif.run('NEAR_EXPIRY', `${nearExpiry.length} Products Expiring Soon!`, `⏰ ${names}`);
      }
      // ... (remaining notification types continue similarly)

      // WhatsApp Alerts (send outside transaction to prevent DB lock during network wait)
      if (settings.ownerPhone) {
        for (const p of lowStock) sendMessage(settings.ownerPhone, `📉 ${p.name} is low Stock (${p.quantity}).`);
        for (const p of outOfStock) sendMessage(settings.ownerPhone, `🚫 ${p.name} out of Stock!`);
        // ... etc
      }

      // UPDATE FLAGS IN ONE TRANSACTION TO REDUCE DISK I/O
      const resetFlags = db.transaction(() => {
        lowStock.forEach(p => db.prepare("UPDATE products SET flag_low_stock = 1 WHERE id = ?").run(p.id));
        outOfStock.forEach(p => db.prepare("UPDATE products SET flag_out_of_stock = 1 WHERE id = ?").run(p.id));
        nearExpiry.forEach(p => db.prepare("UPDATE products SET flag_expiry = 1 WHERE id = ?").run(p.id));
        expired.forEach(p => db.prepare("UPDATE products SET flag_expiry = 2 WHERE id = ?").run(p.id));
        deadStock.forEach(p => db.prepare("UPDATE products SET flag_dead_stock = 1 WHERE id = ?").run(p.id));
      });
      resetFlags();

      // ── Cloud Sync ──
      if (url && key && url.startsWith('http')) {
        initSupabase(url, key);
        // Register shop in Supabase for mobile auth from anywhere
        registerShop(currentShopId).catch(() => { });
        // Cloud sync is async and network-bound, keep it separate from tight local loops
        syncToCloud(currentShopId).catch(console.error);
      }
    } catch (e) { console.error("[Sync Loop Error]", e.message); }
  }, 60000);
}

app.whenReady().then(createWindow);

// 🟢 GET CATEGORIES
ipcMain.handle("get-categories", async () => {
  return db.prepare("SELECT * FROM categories").all();
});

// 🟢 ADD PRODUCT (with expiry_date and weight)
ipcMain.handle("add-product", async (event, product) => {
  const {
    name,
    category_id,
    gst_rate,
    product_code,
    price_type,
    price,
    cost_price,
    quantity,
    unit,
    barcode,
    expiry_date,
    image,
    default_discount,
    weight,
    brand
  } = product;

  db.prepare(`
    INSERT INTO products 
    (name, category_id, gst_rate, product_code, price_type, price, cost_price, quantity, unit, barcode, expiry_date, image, default_discount, weight, brand)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name,
    category_id || null,
    gst_rate || 0,
    product_code || null,
    price_type || 'exclusive',
    price,
    cost_price || 0,
    quantity,
    unit,
    barcode ? String(barcode) : null,
    expiry_date || null,
    image || null,
    default_discount || 0,
    weight || null,
    brand || null
  );

  return { message: "Product added" };
});

// 🟢 EDIT PRODUCT (with expiry_date and weight)
ipcMain.handle("edit-product", async (event, product) => {
  const { id, name, category_id, gst_rate, product_code, price_type, price, cost_price, quantity, unit, barcode, expiry_date, image, default_discount, weight, brand } = product;

  // Fetch current to optionally reset flags if restocked
  const oldP = db.prepare("SELECT quantity, expiry_date FROM products WHERE id=?").get(id);
  let resetStock = quantity > 10 && oldP && oldP.quantity <= 10; // Simple restocking reset rule 
  let resetExpiry = oldP && (oldP.expiry_date !== expiry_date);

  db.prepare(`
    UPDATE products 
    SET name=?, category_id=?, gst_rate=?, product_code=?, price_type=?, price=?, cost_price=?, quantity=?, unit=?, barcode=?, expiry_date=?, image=?, default_discount=?, weight=?, brand=?,
        flag_low_stock = CASE WHEN ? THEN 0 ELSE flag_low_stock END,
        flag_out_of_stock = CASE WHEN ? THEN 0 ELSE flag_out_of_stock END,
        flag_expiry = CASE WHEN ? THEN 0 ELSE flag_expiry END
    WHERE id=?
  `).run(name, category_id || null, gst_rate || 0, product_code || null, price_type || 'exclusive', price, cost_price || 0, quantity, unit, barcode ? String(barcode) : null, expiry_date || null, image || null, default_discount || 0, weight || null, brand || null, resetStock ? 1 : 0, resetStock ? 1 : 0, resetExpiry ? 1 : 0, id);
  return { message: "Product updated" };
});

// 🟢 DELETE PRODUCT
ipcMain.handle("delete-product", async (event, id) => {
  db.prepare("DELETE FROM products WHERE id=?").run(id);
  return { message: "Product deleted" };
});

// 🟢 SEND WHATSAPP — AUTOMATIC (via whatsapp-web.js)
ipcMain.handle("send-whatsapp", async (event, phone, message) => {
  return sendMessage(phone, message);
});

// 🟢 GET WHATSAPP STATUS
ipcMain.handle("whatsapp-status", async () => {
  return getStatus();
});

// 🟢 GET LOCAL IP FOR EXPO QR CODE
ipcMain.handle("get-local-ip", () => {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) return iface.address;
    }
  }
  return "127.0.0.1";
});

// 🟢 GET DASHBOARD URL
ipcMain.handle("get-dashboard-url", () => {
  return getTunnelURL();
});

ipcMain.handle("save-app-settings", (event, settings) => {
  try {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle("get-app-settings", (event) => {
  try {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch (e) { }
  return null;
});

ipcMain.handle("set-window-title", (event, title) => {
  if (mainWindow) {
    mainWindow.setTitle(`${title} - Innoaivators`);
  }
});

ipcMain.handle("ask-ai-consultant", async (event, question) => {
  const q = question.toLowerCase();
  let answer = "I'm sorry, I don't have that data yet. Try asking about sales or stock.";

  if (q.includes("sale") || q.includes("revenue")) {
    const today = db.prepare(`SELECT SUM(total_amount) as t FROM invoices WHERE date(created_at)=date('now')`).get().t || 0;
    answer = `Today's total sales: ₹${today}.`;
  } else if (q.includes("best") || q.includes("top")) {
    const top = db.prepare(`SELECT p.name, SUM(ii.quantity) as q FROM invoice_items ii JOIN products p ON ii.product_id=p.id GROUP BY p.id ORDER BY q DESC LIMIT 1`).get();
    answer = top ? `Top product is ${top.name} (${top.q} sold).` : "No data.";
  } else if (q.includes("stock") || q.includes("low")) {
    const low = db.prepare(`SELECT COUNT(*) as c FROM products WHERE quantity <= 5`).get().c;
    answer = `You have ${low} items on low stock. Check alerts!`;
  } else if (q.includes("customer")) {
    const top = db.prepare(`SELECT customer_name, SUM(total_amount) as t FROM invoices WHERE customer_name != '' GROUP BY customer_phone ORDER BY t DESC LIMIT 1`).get();
    answer = top ? `Best customer: ${top.customer_name} (Lifetime ₹${top.t}).` : "No data.";
  }
  return answer;
});

ipcMain.handle("get-shop-id", () => {
  return process.env.SHOP_ID;
});

// 🟢 WINDOW CONTROLS
ipcMain.handle("minimize-window", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle("close-window", () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle("get-sync-status", () => {
  const pendingInvoices = db.prepare("SELECT COUNT(*) as cnt FROM invoices WHERE is_synced = 0").get().cnt;
  const pendingProducts = db.prepare("SELECT COUNT(*) as cnt FROM products WHERE is_synced = 0").get().cnt;
  return { pending: pendingInvoices + pendingProducts };
});


// 🔔 NOTIFICATION HANDLERS (Owner Alerts)
// ============================================================

ipcMain.handle("get-notifications", async (event, opts) => {
  const limit = opts?.limit || 50;
  const unreadOnly = opts?.unreadOnly || false;
  let query = "SELECT * FROM notifications";
  if (unreadOnly) query += " WHERE is_read = 0";
  query += " ORDER BY created_at DESC LIMIT ?";
  const notifications = db.prepare(query).all(limit);
  const unreadCount = db.prepare("SELECT COUNT(*) as cnt FROM notifications WHERE is_read = 0").get().cnt;
  return { notifications, unreadCount };
});

ipcMain.handle("mark-notification-read", async (event, id) => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(id);
  return { message: "Marked as read" };
});

ipcMain.handle("mark-all-notif-read", async () => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE is_read = 0").run();
  return { message: "All marked as read" };
});

ipcMain.handle("delete-notification", async (event, id) => {
  db.prepare("DELETE FROM notifications WHERE id = ?").run(id);
  return { message: "Notification deleted" };
});


// 🟢 GET PRODUCTS WITH CATEGORY GST (Backwards compatible fallback)
ipcMain.handle("get-products-full", () => {
  return db.prepare(`
    SELECT 
      p.*,
      COALESCE(p.gst_rate, c.gst, 0) as category_gst,
      COALESCE(c.name, 'General') as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
  `).all();
});


// 🟢 BULK UPDATE (STOCK ONLY)
ipcMain.handle("bulkUpdateProducts", async (event, updates) => {
  const stmt = db.prepare(`
    UPDATE products 
    SET 
      quantity = quantity + ?
    WHERE id = ?
  `);

  const transaction = db.transaction((items) => {
    for (const item of items) {
      stmt.run(item.addQty, item.id);
    }
  });

  transaction(updates);

  return { message: "Bulk update success 🔥" };
});


// 🟢 SEARCH CUSTOMER BY PHONE
ipcMain.handle("search-customer", async (event, phone) => {
  return db.prepare("SELECT * FROM customers WHERE phone = ?").get(phone);
});

// 🟢 CREATE INVOICE (CUSTOMER + PAYMENT + DISCOUNT)
ipcMain.handle("create-invoice", async (event, data) => {
  const { cart, customer, paymentMode } = data;
  let total = 0;

  cart.forEach(item => {
    const discountAmt = Number(item.discountAmt || 0);
    total += (item.total + item.gstAmt - discountAmt);
  });

  // Handle Customer Save/Update
  let customerId = null;
  if (customer && customer.phone) {
    const existing = db.prepare("SELECT * FROM customers WHERE phone = ?").get(customer.phone);
    if (!existing) {
      const res = db.prepare("INSERT INTO customers (name, phone, address) VALUES (?, ?, ?)").run(
        customer.name || "", customer.phone, customer.address || ""
      );
      customerId = res.lastInsertRowid;
    } else {
      db.prepare("UPDATE customers SET name = ?, address = ? WHERE phone = ?").run(
        customer.name || existing.name, customer.address || existing.address, customer.phone
      );
      customerId = existing.id;
    }
  }

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const currentMonth = now.toISOString().slice(0, 7); // "YYYY-MM"

  // Monthly sequential bill numbering
  const lastBill = db.prepare("SELECT bill_no FROM invoices WHERE strftime('%Y-%m', bill_date) = ? ORDER BY bill_no DESC LIMIT 1").get(currentMonth);
  const nextBillNo = lastBill ? (lastBill.bill_no + 1) : 1;

  const result = db.prepare(`
    INSERT INTO invoices (bill_no, bill_date, customer_name, customer_phone, customer_address, customer_id, payment_mode, total_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nextBillNo,
    today,
    customer?.name || "",
    customer?.phone || "",
    customer?.address || "",
    customerId,
    paymentMode || "Cash",
    total
  );

  const invoiceId = result.lastInsertRowid;
  const responseData = { message: "Invoice created successfully! 🔥", invoiceId, billNo: nextBillNo };

  const insertItem = db.prepare(`
    INSERT INTO invoice_items 
    (invoice_id, product_id, quantity, price, gst_rate, gst_amount, discount_percent, discount_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateStock = db.prepare(`
    UPDATE products
    SET quantity = quantity - ?
    WHERE id = ?
  `);

  const transaction = db.transaction((items) => {
    for (const item of items) {
      insertItem.run(
        invoiceId,
        item.id,
        item.qty,
        item.price,
        item.gstRate,
        item.gstAmt,
        item.discountPercent || 0,
        item.discountAmt || 0
      );

      updateStock.run(item.qty, item.id);
    }
  });

  transaction(cart);

  return responseData;
});

// ============================================================
// 🔥 INVOICE HISTORY HANDLERS
// ============================================================

// Get all invoices (with a mini product list for each)
ipcMain.handle("get-invoices", async () => {
  const invoices = db.prepare(`
    SELECT * FROM invoices ORDER BY created_at DESC
  `).all();

  // Attach a comma-separated product list string for each invoice
  const getItems = db.prepare(`
    SELECT p.name FROM invoice_items ii
    JOIN products p ON ii.product_id = p.id
    WHERE ii.invoice_id = ?
  `);

  return invoices.map(inv => {
    const items = getItems.all(inv.id);
    return {
      ...inv,
      productsList: items.map(i => i.name).join(', ')
    };
  });
});

// Get full details (line items) for a single invoice
ipcMain.handle("get-invoice-details", async (event, invoiceId) => {
  return db.prepare(`
    SELECT ii.*, p.name 
    FROM invoice_items ii
    JOIN products p ON ii.product_id = p.id
    WHERE ii.invoice_id = ?
  `).all(invoiceId);
});

// Delete an invoice and its items
ipcMain.handle("delete-invoice", async (event, invoiceId) => {
  db.prepare("DELETE FROM invoice_items WHERE invoice_id = ?").run(invoiceId);
  db.prepare("DELETE FROM invoices WHERE id = ?").run(invoiceId);
  return { message: "Invoice deleted" };
});

// ============================================================
// 🔥 HOLD / RESUME BILL HANDLERS
// ============================================================

// Hold current bill
ipcMain.handle("hold-bill", async (event, { cart, customer, label }) => {
  db.prepare(`
    INSERT INTO held_bills (label, cart_json, customer_json)
    VALUES (?, ?, ?)
  `).run(
    label || `Held ${new Date().toLocaleTimeString('en-IN')}`,
    JSON.stringify(cart),
    JSON.stringify(customer || {})
  );
  return { message: "Bill held" };
});

// Get all held bills
ipcMain.handle("get-held-bills", async () => {
  const rows = db.prepare("SELECT * FROM held_bills ORDER BY created_at DESC").all();
  return rows.map(r => ({
    ...r,
    cart: JSON.parse(r.cart_json),
    customer: JSON.parse(r.customer_json || '{}')
  }));
});

// Delete (discard) a held bill
ipcMain.handle("delete-held-bill", async (event, id) => {
  db.prepare("DELETE FROM held_bills WHERE id=?").run(id);
  return { message: "Held bill removed" };
});

// ============================================================
// 🔥 EXPIRY & STOCK DASHBOARD REPORTS
// ============================================================

// Get expiry alerts (expired + near-expiry within configurable days, default 3)
ipcMain.handle("get-expiry-alerts", async () => {
  const today = new Date().toISOString().split('T')[0];
  // Read settings for expiry alert days
  let expiryDays = 3;
  try {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    if (fs.existsSync(configPath)) {
      const settings = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expiryDays = settings.expiryAlertDays || 3;
    }
  } catch (e) { }
  const inN = new Date(Date.now() + expiryDays * 86400000).toISOString().split('T')[0];

  const expired = db.prepare(`
    SELECT p.*, c.name as category_name, c.gst as category_gst
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.expiry_date IS NOT NULL AND p.expiry_date < ?
    ORDER BY p.expiry_date ASC
  `).all(today);

  const nearExpiry = db.prepare(`
    SELECT p.*, c.name as category_name, c.gst as category_gst
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.expiry_date IS NOT NULL AND p.expiry_date >= ? AND p.expiry_date <= ?
    ORDER BY p.expiry_date ASC
  `).all(today, inN);

  return { expired, nearExpiry };
});

// Get low-stock and dead-stock products (with dynamic thresholds)
ipcMain.handle("get-stock-alerts", async (event, limits) => {
  const lowThreshold = limits?.lowStock || 5;
  const deadDays = limits?.deadStockDays || 30;

  const lowStock = db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.quantity > 0 AND p.quantity <= ?
    ORDER BY p.quantity ASC
  `).all(lowThreshold);

  // Dead stock = quantity > 0 but not sold in last X days
  // AND product must be older than X days (ignore newly added products)
  const deadStock = db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.quantity > 0
    AND p.created_at <= datetime('now', ?)
    AND p.id NOT IN (
      SELECT DISTINCT ii.product_id FROM invoice_items ii
      INNER JOIN invoices inv ON ii.invoice_id = inv.id
      WHERE inv.created_at >= datetime('now', ?)
    )
    ORDER BY p.quantity DESC
  `).all(`-${deadDays} days`, `-${deadDays} days`);

  return { lowStock, deadStock };
});

// Get dashboard summary stats
ipcMain.handle("get-dashboard-stats", async () => {
  const today = new Date().toISOString().split('T')[0];
  // Read settings
  let lowThreshold = 10;
  let expiryDays = 3;
  try {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    if (fs.existsSync(configPath)) {
      const settings = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      lowThreshold = settings.lowStockThreshold || 10;
      expiryDays = settings.expiryAlertDays || 3;
    }
  } catch (e) { }
  const inN = new Date(Date.now() + expiryDays * 86400000).toISOString().split('T')[0];

  const totalProducts = db.prepare("SELECT COUNT(*) as cnt FROM products").get().cnt;
  const totalCategories = db.prepare("SELECT COUNT(*) as cnt FROM categories").get().cnt;
  const todaySales = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices
    WHERE date(created_at) = date('now', 'localtime')
  `).get().total;
  const todayBills = db.prepare(`
    SELECT COUNT(*) as cnt FROM invoices
    WHERE date(created_at) = date('now', 'localtime')
  `).get().cnt;
  const expiredCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM products WHERE expiry_date IS NOT NULL AND expiry_date < ?
  `).get(today).cnt;
  const nearExpiryCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM products WHERE expiry_date IS NOT NULL AND expiry_date >= ? AND expiry_date <= ?
  `).get(today, inN).cnt;
  const lowStockCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM products WHERE quantity > 0 AND quantity <= ?
  `).get(lowThreshold).cnt;
  const outOfStock = db.prepare(`
    SELECT COUNT(*) as cnt FROM products WHERE quantity <= 0
  `).get().cnt;

  // Low stock product list for dashboard drilldown
  const lowStockProducts = db.prepare(`
    SELECT p.name, p.quantity, p.unit, c.name as category_name
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.quantity > 0 AND p.quantity <= ?
    ORDER BY p.quantity ASC
  `).all(lowThreshold);

  // Out of stock product list
  const outOfStockProducts = db.prepare(`
    SELECT p.name, p.unit, c.name as category_name
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.quantity <= 0
  `).all();

  // Expiring product list
  const expiringProducts = db.prepare(`
    SELECT p.name, p.expiry_date, p.quantity, c.name as category_name
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.expiry_date IS NOT NULL AND p.expiry_date >= ? AND p.expiry_date <= ?
    ORDER BY p.expiry_date ASC
  `).all(today, inN);

  // Expired product list
  const expiredProducts = db.prepare(`
    SELECT p.name, p.expiry_date, p.quantity, c.name as category_name
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.expiry_date IS NOT NULL AND p.expiry_date < ?
    ORDER BY p.expiry_date ASC
  `).all(today);

  // Profit Calculations: (Selling Price - Cost Price) * Quantity
  const calculateProfit = (timeframeStr) => {
    return db.prepare(`
      SELECT SUM((ii.price - COALESCE(p.cost_price, 0)) * ii.quantity) as profit
      FROM invoice_items ii
      JOIN products p ON ii.product_id = p.id
      JOIN invoices inv ON ii.invoice_id = inv.id
      WHERE inv.created_at >= datetime('now', '${timeframeStr}')
    `).get().profit || 0;
  };

  const todayProfit = calculateProfit('start of day');
  const weeklyProfit = calculateProfit('-7 days');
  const monthlyProfit = calculateProfit('-30 days');

  // Overall (all-time) profit
  const overallSales = db.prepare("SELECT COALESCE(SUM(total_amount),0) as t FROM invoices").get().t;
  const overallCostAll = db.prepare("SELECT COALESCE(SUM((ii.price - COALESCE(p.cost_price, 0)) * ii.quantity),0) as profit FROM invoice_items ii JOIN products p ON ii.product_id = p.id").get().profit || 0;
  const overallBills = db.prepare("SELECT COUNT(*) as c FROM invoices").get().c;

  // Top 5 products sold this month
  const topProducts = db.prepare(`
    SELECT p.name, SUM(ii.quantity) as sold
    FROM invoice_items ii
    JOIN products p ON ii.product_id = p.id
    JOIN invoices inv ON ii.invoice_id = inv.id
    WHERE inv.created_at >= datetime('now', '-30 days')
    GROUP BY ii.product_id
    ORDER BY sold DESC
    LIMIT 5
  `).all();

  const dailySales = db.prepare(`
    SELECT date(created_at) as day, SUM(total_amount) as total, COUNT(*) as bills
    FROM invoices 
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY day
    ORDER BY day ASC
  `).all();

  const monthlySalesBreakdown = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, SUM(total_amount) as total, COUNT(*) as bills
    FROM invoices 
    WHERE created_at >= datetime('now', '-12 months')
    GROUP BY month
    ORDER BY month ASC
  `).all();

  return {
    totalProducts, totalCategories, todaySales, todayBills,
    expiredCount, nearExpiryCount, lowStockCount, outOfStock,
    topProducts, todayProfit, weeklyProfit, monthlyProfit,
    overallProfit: overallCostAll, overallSales, overallBills,
    dailySales, monthlySalesBreakdown,
    lowStockProducts, outOfStockProducts, expiringProducts, expiredProducts
  };
});

// ============================================================
// 🔥 OFFERS HANDLERS
// ============================================================

ipcMain.handle("get-offers", async () => {
  return db.prepare(`
    SELECT o.*, 
           b.name as buy_product_name, 
           f.name as free_product_name
    FROM offers o
    JOIN products b ON o.buy_product_id = b.id
    JOIN products f ON o.free_product_id = f.id
    ORDER BY o.created_at DESC
  `).all();
});

ipcMain.handle("add-offer", async (event, offer) => {
  const { name, status, buy_product_id, buy_quantity, free_product_id, free_quantity } = offer;
  db.prepare(`
    INSERT INTO offers (name, status, buy_product_id, buy_quantity, free_product_id, free_quantity)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, status === undefined ? 1 : status, buy_product_id, buy_quantity, free_product_id, free_quantity);
  return { message: "Offer added" };
});

ipcMain.handle("edit-offer", async (event, offer) => {
  const { id, name, status, buy_product_id, buy_quantity, free_product_id, free_quantity } = offer;
  db.prepare(`
    UPDATE offers SET name=?, status=?, buy_product_id=?, buy_quantity=?, free_product_id=?, free_quantity=?
    WHERE id=?
  `).run(name, status, buy_product_id, buy_quantity, free_product_id, free_quantity, id);
  return { message: "Offer updated" };
});

ipcMain.handle("delete-offer", async (event, id) => {
  db.prepare("DELETE FROM offers WHERE id=?").run(id);
  return { message: "Offer deleted" };
});

ipcMain.handle("toggle-offer-status", async (event, { id, status }) => {
  db.prepare("UPDATE offers SET status=? WHERE id=?").run(status, id);
  return { message: "Offer status updated" };
});

// ============================================================
// 🏪 SHOP REGISTRATION & DEVICE PAIRING
// ============================================================

// Check if shop is registered
ipcMain.handle("get-registration-status", async () => {
  try {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    const envPath = path.join(__dirname, '..', '.env');

    let settings = {};
    if (fs.existsSync(configPath)) {
      try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
    }

    // DIRECT FILE CHECK: Don't trust process.env cache
    let envContent = "";
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }

    const hasShopId = envContent.includes("SHOP_ID=");
    const match = envContent.match(/SHOP_ID=(.+)/);
    const shopIdValue = match ? match[1].trim() : "";

    if (!hasShopId || !shopIdValue) {
      // Forcefully Wipe local cache
      if (settings.shopId) {
        delete settings.shopId;
        fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
      }
      return { isRegistered: false, shopId: "" };
    }

    return { isRegistered: true, shopId: shopIdValue };
  } catch (e) {
    return { isRegistered: false, shopId: "" };
  }
});

// Register shop in Supabase → get UUID
ipcMain.handle("register-shop", async (event, data) => {
  const { shopName, ownerName, mobileNumber, email } = data;

  // Get Supabase client  
  const configPath = path.join(app.getPath("userData"), "app_settings.json");
  let settings = {};
  if (fs.existsSync(configPath)) {
    try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
  }

  const url = settings.supabaseUrl || process.env.SUPABASE_URL;
  const key = settings.supabaseKey || process.env.SUPABASE_KEY;

  if (!url || !key || !url.startsWith('http')) {
    return { success: false, error: "Supabase not configured. Please contact support." };
  }

  initSupabase(url, key);
  if (!supabase) {
    return { success: false, error: "Cloud connection failed. Please check internet." };
  }

  try {
    // Generate a local Shop ID (shop-xxxxxxxx format)
    const newShopId = `shop-${uuidv4().slice(0, 8)}`;

    // Create shop in Supabase (status default is disabled in DB)
    const { error } = await supabase
      .from("shops")
      .insert({
        id: newShopId,
        owner_name: ownerName,
        owner_email: email, // New field for email login
        mobile_number: mobileNumber,
        name: shopName || settings.storeName || "My Shop",
        master_key: process.env.MASTER_KEY || settings.masterKey || "owner123",
        is_active: false // Explicitly set to false until admin reviews
      });

    if (error) {
      console.error("[Register] Supabase error:", error.message);
      return { success: false, error: error.message };
    }

    // Save to .env
    try {
      const envPath = path.join(__dirname, '..', '.env');
      let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
      if (envContent.includes('SHOP_ID=')) {
        envContent = envContent.replace(/SHOP_ID=.*/g, `SHOP_ID=${newShopId}`);
      } else {
        envContent += `\nSHOP_ID=${newShopId}`;
      }
      fs.writeFileSync(envPath, envContent);
      process.env.SHOP_ID = newShopId;
    } catch (e) { console.error("[Register] .env error:", e.message); }

    // Save to app_settings.json
    settings.shopId = newShopId;
    settings.storeName = shopName;
    settings.ownerName = ownerName;
    settings.ownerEmail = email; // Save locally
    settings.ownerMobile = mobileNumber;
    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));

    console.log("[Register] Shop registered and pending activation:", newShopId);
    return { success: true, shopId: newShopId };
  } catch (e) {
    console.error("[Register] Critical error:", e.message);
    return { success: false, error: "System error: " + e.message };
  }
});

// Generate 6-digit pairing code
// Desktop VALIDATES a pairing code (generated by mobile app)
ipcMain.handle("validate-pairing-code", async (event, code) => {
  if (!supabase) {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    let settings = {};
    if (fs.existsSync(configPath)) {
      try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
    }
    const url = settings.supabaseUrl || process.env.SUPABASE_URL;
    const key = settings.supabaseKey || process.env.SUPABASE_KEY;
    if (url && key) initSupabase(url, key);
  }

  if (!supabase) return { success: false, error: "Supabase not connected" };

  const shopId = process.env.SHOP_ID;
  if (!shopId || shopId.length < 8) return { success: false, error: "Shop not registered" };

  try {
    // Find matching pending code for this shop
    const { data, error } = await supabase
      .from("pairing_codes")
      .select("*")
      .eq("shop_id", shopId)
      .eq("code", code)
      .eq("status", "pending")
      .single();

    if (error || !data) {
      return { success: false, error: "Invalid code. Make sure you generated a new code in the Owner App." };
    }

    // Check expiry
    if (new Date(data.expires_at) < new Date()) {
      // Mark as expired
      await supabase.from("pairing_codes").update({ status: "expired" }).eq("id", data.id);
      return { success: false, error: "Code expired. Generate a new one in the Owner App." };
    }

    // Mark code as used
    await supabase
      .from("pairing_codes")
      .update({ status: "used" })
      .eq("id", data.id);

    console.log(`[Pairing] ✅ Code ${code} validated — device paired!`);
    return { success: true, deviceId: data.device_id };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// 🟢 LICENSE CHECK (For Admin Dashboard Activation)
ipcMain.handle("get-license-status", async () => {
  const machineId = getMachineId();
  if (!supabase) {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    let settings = {};
    if (fs.existsSync(configPath)) {
      try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
    }
    const url = settings.supabaseUrl || process.env.SUPABASE_URL;
    const key = settings.supabaseKey || process.env.SUPABASE_KEY;
    if (url && key) initSupabase(url, key);
  }

  if (!supabase) return { is_active: true, hwid: machineId, note: "Offline mode or Supabase not connected" };

  try {
    const shopId = process.env.SHOP_ID || "";
    if (!shopId) return { is_active: false, needsRegistration: true, hwid: machineId, note: "Shop not registered" };

    const { data: shopRecord, error } = await supabase
      .from("shops")
      .select("is_active")
      .eq("id", shopId)
      .single();

    if (error || !shopRecord) {
      // If shop record not found, it might have been deleted by the Admin.
      // Wipe the local registration to allow the user to register again.
      console.log(`[License] ⚠️ Shop ${shopId} not found in cloud. Wiping local registration.`);

      const configPath = path.join(app.getPath("userData"), "app_settings.json");
      const envPath = path.join(__dirname, '..', '.env');

      // Wipe .env entry
      if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf-8');
        envContent = envContent.replace(/SHOP_ID=.*/g, '');
        fs.writeFileSync(envPath, envContent);
      }
      process.env.SHOP_ID = "";

      return { is_active: false, needsRegistration: true, hwid: machineId, note: "Shop registration was removed by admin." };
    }

    if (!shopRecord.is_active) {
      return { is_active: false, needsRegistration: false, hwid: machineId, note: "Access denied. Admin has deactivated this shop." };
    }

    console.log(`[License] ✅ Shop ${shopId} is active!`);
    return { is_active: true, hwid: machineId };
  } catch (e) {
    return { is_active: true, hwid: machineId, note: "Sync issue: " + e.message };
  }
});

// Check pairing status
ipcMain.handle("get-pairing-status", async (event, code) => {
  if (!supabase) return { status: "unknown" };

  try {
    const shopId = process.env.SHOP_ID;
    const { data, error } = await supabase
      .from("pairing_codes")
      .select("status, device_id, user_id")
      .eq("shop_id", shopId)
      .eq("code", code)
      .single();

    if (error || !data) return { status: "unknown" };
    return { status: data.status, deviceId: data.device_id, userId: data.user_id };
  } catch {
    return { status: "unknown" };
  }
});

