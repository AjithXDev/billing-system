const fs = require("fs");
const path = require("path");
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const db = require("./db");
const { initWhatsApp, sendMessage, getStatus } = require("./whatsapp");
const { startDashboardServer, stopDashboardServer, getDashboardURL, getTunnelURL } = require("./dashboardServer");
const { createClient } = require('@supabase/supabase-js');

// ── CLOUD SYNC ENGINE ──
let supabase = null;
function initSupabase(url, key) {
  if (!supabase && url && key) {
    try { supabase = createClient(url, key); } catch(e) {}
  }
}
async function syncToCloud(shopId) {
  if (!supabase) return;
  try {
    const products = db.prepare("SELECT * FROM products WHERE is_synced = 0").all();
    for (const p of products) {
      const { error } = await supabase.from('products').upsert({ ...p, shop_id: shopId, is_synced: 1 });
      if (!error) db.prepare("UPDATE products SET is_synced = 1 WHERE id = ?").run(p.id);
    }
    const invoices = db.prepare("SELECT * FROM invoices WHERE is_synced = 0").all();
    for (const inv of invoices) {
      const { error } = await supabase.from('invoices').upsert({ ...inv, shop_id: shopId, is_synced: 1 });
      if (!error) {
        db.prepare("UPDATE invoices SET is_synced = 1 WHERE id = ?").run(inv.id);
        const items = db.prepare("SELECT * FROM invoice_items WHERE invoice_id = ?").all(inv.id);
        await supabase.from('invoice_items').upsert(items.map(i => ({ ...i, shop_id: shopId })));
      }
    }
  } catch (e) {}
}
async function logNotification(shopId, type, message) {
  if (!supabase) return;
  try { await supabase.from('notifications').insert({ shop_id: shopId, type, message }); } catch(e) {}
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

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

  // 🟢 Auto-Generate Shop ID if missing in .env
  let shopId = process.env.SHOP_ID;
  if (!shopId) {
    shopId = `shop-${uuidv4().slice(0, 8)}`;
    // Append to .env for persistence
    try {
      fs.appendFileSync(path.join(__dirname, '..', '.env'), `\nSHOP_ID=${shopId}`);
      process.env.SHOP_ID = shopId;
      console.log("[Setup] Auto-generated Unique Shop ID:", shopId);
    } catch(e) { console.error("Failed to save SHOP_ID to .env"); }
  }

  // 🟢 Initialize Cloud Sync & Alert Loop
  setInterval(async () => {
    try {
        const configPath = path.join(app.getPath("userData"), "app_settings.json");
        let settings = {};
        if (fs.existsSync(configPath)) {
            settings = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }

        const url = settings.supabaseUrl || process.env.SUPABASE_URL;
        const key = settings.supabaseKey || process.env.SUPABASE_KEY;
        const currentShopId = process.env.SHOP_ID || 'billing-shop';

        // ── Local Notification Alerts (always run, independent of cloud) ──
        const today = new Date().toISOString().split('T')[0];
        const lowThreshold = settings.lowStockThreshold || 5;

        const expired = db.prepare("SELECT name FROM products WHERE expiry_date IS NOT NULL AND expiry_date < ?").all(today);
        const lowStock = db.prepare("SELECT name FROM products WHERE quantity > 0 AND quantity <= ?").all(lowThreshold);
        const outOfStock = db.prepare("SELECT name FROM products WHERE quantity <= 0").all();

        // Check if we already sent notifications in the last hour to avoid spamming
        const recentNotif = db.prepare("SELECT COUNT(*) as cnt FROM notifications WHERE created_at >= datetime('now', '-1 hour')").get().cnt;

        if (recentNotif === 0) {
          // Insert local notifications
          const insertNotif = db.prepare("INSERT INTO notifications (type, title, message) VALUES (?, ?, ?)");

          if (expired.length > 0) {
            const names = expired.slice(0, 5).map(p => p.name).join(', ');
            insertNotif.run('EXPIRY', `${expired.length} Products Expired!`, `⚠️ ${names}${expired.length > 5 ? ` and ${expired.length - 5} more...` : ''}`);
          }
          if (lowStock.length > 0) {
            const names = lowStock.slice(0, 5).map(p => p.name).join(', ');
            insertNotif.run('LOW_STOCK', `${lowStock.length} Products Low Stock`, `📉 ${names}${lowStock.length > 5 ? ` and ${lowStock.length - 5} more...` : ''}`);
          }
          if (outOfStock.length > 0) {
            const names = outOfStock.slice(0, 5).map(p => p.name).join(', ');
            insertNotif.run('OUT_OF_STOCK', `${outOfStock.length} Products Out of Stock!`, `🚫 ${names}${outOfStock.length > 5 ? ` and ${outOfStock.length - 5} more...` : ''}`);
          }

          // WhatsApp alerts to owner (if configured)
          if (settings.whatsappAlerts && settings.ownerPhone) {
            if (expired.length > 0) {
              sendMessage(settings.ownerPhone, `⚠️ EXPIRY ALERT: ${expired.length} products have expired in your shop. Please remove them immediately!`);
            }
            if (outOfStock.length > 0) {
              sendMessage(settings.ownerPhone, `🚫 OUT OF STOCK: ${outOfStock.length} products are out of stock. Restock urgently!`);
            }
            if (lowStock.length > 5) {
              sendMessage(settings.ownerPhone, `📉 LOW STOCK: ${lowStock.length} items are running low. Please restock!`);
            }
          }
        }

        // ── Cloud Sync ──
        if (url && key && url.startsWith('http')) {
            initSupabase(url, key);
            await syncToCloud(currentShopId);

            // Check for inventory alerts and log to Cloud
            if (settings.isCloudEnabled !== false) {
                // Dead Stock (No sales in 30 days)
                const deadStock = db.prepare(`
                  SELECT name FROM products 
                  WHERE quantity > 0 AND id NOT IN (
                    SELECT DISTINCT product_id FROM invoice_items ii 
                    JOIN invoices inv ON ii.invoice_id = inv.id 
                    WHERE inv.created_at >= datetime('now', '-30 days')
                  )
                `).all();

                if (expired.length > 0) {
                    await logNotification(currentShopId, 'EXPIRY', `${expired.length} products expired!`);
                }
                if (lowStock.length > 0) {
                    await logNotification(currentShopId, 'LOW_STOCK', `${lowStock.length} products running low!`);
                }
                if (outOfStock.length > 0) {
                    await logNotification(currentShopId, 'OUT_OF_STOCK', `${outOfStock.length} products out of stock!`);
                }
                if (deadStock.length > 10) {
                    await logNotification(currentShopId, 'DEAD_STOCK', `${deadStock.length} products haven't sold in 30 days.`);
                }
            }
        }
    } catch(e) { console.error("[Sync Loop Error]", e.message); }
  }, 60000); 
}

app.whenReady().then(createWindow);

// 🟢 GET CATEGORIES
ipcMain.handle("get-categories", async () => {
  return db.prepare("SELECT * FROM categories").all();
});

// 🟢 ADD PRODUCT (with expiry_date)
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
    image
  } = product;

  db.prepare(`
    INSERT INTO products 
    (name, category_id, gst_rate, product_code, price_type, price, cost_price, quantity, unit, barcode, expiry_date, image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    image || null
  );

  return { message: "Product added" };
});

// 🟢 EDIT PRODUCT (with expiry_date)
ipcMain.handle("edit-product", async (event, product) => {
  const { id, name, category_id, gst_rate, product_code, price_type, price, cost_price, quantity, unit, barcode, expiry_date, image } = product;
  db.prepare(`
    UPDATE products 
    SET name=?, category_id=?, gst_rate=?, product_code=?, price_type=?, price=?, cost_price=?, quantity=?, unit=?, barcode=?, expiry_date=?, image=?
    WHERE id=?
  `).run(name, category_id || null, gst_rate || 0, product_code || null, price_type || 'exclusive', price, cost_price || 0, quantity, unit, barcode ? String(barcode) : null, expiry_date || null, image || null, id);
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
  } catch (e) {}
  return null;
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

ipcMain.handle("get-sync-status", () => {
  const pendingInvoices = db.prepare("SELECT COUNT(*) as cnt FROM invoices WHERE is_synced = 0").get().cnt;
  const pendingProducts = db.prepare("SELECT COUNT(*) as cnt FROM products WHERE is_synced = 0").get().cnt;
  return { pending: pendingInvoices + pendingProducts };
});

// ============================================================
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

// 🟢 CREATE INVOICE (CUSTOMER + PAYMENT)
ipcMain.handle("create-invoice", async (event, data) => {
  const { cart, customer, paymentMode } = data;
  let total = 0;

  cart.forEach(item => {
    total += (item.total + item.gstAmt);
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

  const today = new Date().toISOString().split('T')[0];
  const lastBill = db.prepare("SELECT bill_no FROM invoices WHERE bill_date = ? ORDER BY bill_no DESC LIMIT 1").get(today);
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
  // We return both to the frontend
  const responseData = { message: "Invoice created successfully! 🔥", invoiceId, billNo: nextBillNo };

  const insertItem = db.prepare(`
    INSERT INTO invoice_items 
    (invoice_id, product_id, quantity, price, gst_rate, gst_amount)
    VALUES (?, ?, ?, ?, ?, ?)
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
        item.gstAmt
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

// Get expiry alerts (expired + near-expiry within 7 days)
ipcMain.handle("get-expiry-alerts", async () => {
  const today = new Date().toISOString().split('T')[0];
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

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
  `).all(today, in7);

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
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  const lowThreshold = 5;

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
  `).get(today, in7).cnt;
  const lowStockCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM products WHERE quantity > 0 AND quantity <= ?
  `).get(lowThreshold).cnt;
  const outOfStock = db.prepare(`
    SELECT COUNT(*) as cnt FROM products WHERE quantity <= 0
  `).get().cnt;

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
    dailySales, monthlySalesBreakdown
  };
});