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
const nodemailer = require('nodemailer');

// ── EMAIL OTP SYSTEM ──
const otpStore = new Map(); // email -> { code, expiresAt }

// Gmail SMTP transporter (reads from .env)
function getEmailTransporter() {
  const gmailUser = process.env.GMAIL_USER || 'innoaivators@gmail.com';
  const gmailPass = process.env.GMAIL_APP_PASS;
  if (!gmailPass) {
    console.error('[EMAIL] ❌ GMAIL_APP_PASS not set in .env file!');
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailPass }
  });
}

async function sendOtpEmail(toEmail, otpCode) {
  const transporter = getEmailTransporter();
  if (!transporter) throw new Error('Email not configured. Set GMAIL_APP_PASS in .env');

  const gmailUser = process.env.GMAIL_USER || 'innoaivators@gmail.com';
  return transporter.sendMail({
    from: `"Innoaivators" <${gmailUser}>`,
    to: toEmail,
    subject: `🔐 Your Verification Code: ${otpCode}`,
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; background: #0f172a; border-radius: 16px; overflow: hidden; border: 1px solid #1e293b;">
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 800;">INNOAIVATORS</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 13px;">Smart Billing System</p>
        </div>
        <div style="padding: 32px; text-align: center;">
          <p style="color: #94a3b8; font-size: 14px; margin-bottom: 24px;">Your email verification code is:</p>
          <div style="background: rgba(99,102,241,0.15); border: 2px dashed #6366f1; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <span style="font-size: 40px; font-weight: 900; letter-spacing: 10px; color: #f8fafc; font-family: 'Courier New', monospace;">${otpCode}</span>
          </div>
          <p style="color: #64748b; font-size: 12px;">This code expires in <strong style="color: #f59e0b;">10 minutes</strong>.</p>
          <p style="color: #475569; font-size: 11px; margin-top: 20px;">If you did not request this, please ignore this email.</p>
        </div>
        <div style="background: #020617; padding: 16px; text-align: center; border-top: 1px solid #1e293b;">
          <p style="color: #475569; font-size: 10px; margin: 0;">© 2026 Innoaivators Systems • Secure Verification</p>
        </div>
      </div>
    `
  });
}

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
// Admin Supabase (central — for shop management, activation, validity)
let supabase = null;
function initSupabase(url, key) {
  if (!supabase && url && key) {
    try { supabase = createClient(url, key); } catch (e) { }
  }
}

// Shop-specific Supabase (separate DB per shop — for billing data)
let shopSupabase = null;
let shopSupabaseUrl = '';
let shopSupabaseKey = '';
function initShopSupabase(url, key) {
  if (url && key && url.startsWith('http')) {
    try {
      shopSupabase = createClient(url, key);
      shopSupabaseUrl = url;
      shopSupabaseKey = key;
      console.log('[ShopDB] ✅ Connected to shop Supabase:', url);
      return true;
    } catch (e) {
      console.error('[ShopDB] Connection failed:', e.message);
      return false;
    }
  }
  return false;
}

// ── Load shop Supabase config from SQLite on startup ──
function loadShopSupabaseConfig() {
  try {
    const config = db.prepare('SELECT * FROM shop_supabase_config ORDER BY id DESC LIMIT 1').get();
    if (config && config.supabase_url && config.supabase_key) {
      initShopSupabase(config.supabase_url, config.supabase_key);
    }
  } catch (e) { }
}

// ── LOCAL FILE BACKUP ──
function getLocalDbPath() {
  try {
    const config = db.prepare('SELECT storage_path FROM local_db_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
    return config ? config.storage_path : null;
  } catch (e) { return null; }
}

function syncToLocalPath() {
  const localPath = getLocalDbPath();
  if (!localPath) return;
  try {
    if (!fs.existsSync(localPath)) fs.mkdirSync(localPath, { recursive: true });
    const sourcePath = db.name;
    const destPath = path.join(localPath, 'billing_local.db');
    fs.copyFileSync(sourcePath, destPath);
    
    // Also save a JSON export for human-readable backup
    const exportData = {
      exportedAt: new Date().toISOString(),
      products: db.prepare('SELECT * FROM products').all(),
      categories: db.prepare('SELECT * FROM categories').all(),
      customers: db.prepare('SELECT * FROM customers').all(),
      invoices: db.prepare('SELECT * FROM invoices').all(),
      invoice_items: db.prepare('SELECT * FROM invoice_items').all(),
      offers: db.prepare('SELECT * FROM offers').all(),
      held_bills: db.prepare('SELECT * FROM held_bills').all(),
    };
    fs.writeFileSync(path.join(localPath, 'billing_data.json'), JSON.stringify(exportData, null, 2));
    console.log('[LocalDB] ✅ Data synced to:', localPath);
  } catch (e) {
    console.error('[LocalDB] Sync error:', e.message);
  }
}

// ── SYNC TO SHOP'S OWN SUPABASE ──
async function syncToShopSupabase() {
  if (!shopSupabase) return;
  try {
    // 1. Sync Products
    const products = db.prepare('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_synced = 0').all();
    for (const p of products) {
      const { id, is_synced, flag_low_stock, flag_out_of_stock, flag_expiry, flag_dead_stock, ...data } = p;
      const { error } = await shopSupabase.from('products').upsert({
        ...data,
        local_id: id,
        updated_at: new Date().toISOString()
      }, { onConflict: 'local_id' });
      if (!error) db.prepare('UPDATE products SET is_synced = 1 WHERE id = ?').run(id);
      else console.error('[ShopSync] Product error:', error.message);
    }

    // 2. Sync Invoices
    const invoices = db.prepare('SELECT * FROM invoices WHERE is_synced = 0').all();
    for (const inv of invoices) {
      const { id, is_synced, ...data } = inv;
      const { error } = await shopSupabase.from('invoices').upsert({
        ...data,
        local_id: id
      }, { onConflict: 'local_id' });
      if (!error) {
        db.prepare('UPDATE invoices SET is_synced = 1 WHERE id = ?').run(id);
        // Sync items for this invoice
        const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(id);
        for (const item of items) {
          const { id: itemId, ...itemData } = item;
          await shopSupabase.from('invoice_items').upsert({ ...itemData, local_id: itemId });
        }
      }
    }

    // 3. Sync Customers
    const customers = db.prepare('SELECT * FROM customers WHERE is_synced = 0').all();
    for (const c of customers) {
      const { id, is_synced, ...data } = c;
      const { error } = await shopSupabase.from('customers').upsert({
        ...data, local_id: id
      }, { onConflict: 'local_id' });
      if (!error) db.prepare('UPDATE customers SET is_synced = 1 WHERE id = ?').run(id);
    }

    // 4. Sync Categories
    const categories = db.prepare('SELECT * FROM categories').all();
    for (const cat of categories) {
      await shopSupabase.from('categories').upsert(cat, { onConflict: 'id' });
    }

    // Update last synced time
    db.prepare('UPDATE shop_supabase_config SET last_synced = datetime("now") WHERE id = (SELECT MAX(id) FROM shop_supabase_config)').run();
    console.log('[ShopSync] ✅ Data synced to shop Supabase');
  } catch (e) {
    console.error('[ShopSync] Error:', e.message);
  }
}

// ── RESTORE DATA FROM SHOP SUPABASE ──
async function restoreFromShopSupabase() {
  if (!shopSupabase) throw new Error('Shop Supabase not connected');
  try {
    // 1. Restore Products
    const { data: products } = await shopSupabase.from('products').select('*');
    if (products && products.length > 0) {
      const insertProduct = db.prepare(`
        INSERT OR REPLACE INTO products 
        (id, name, category_id, category_name, gst_rate, product_code, price_type, price, cost_price, quantity, unit, barcode, expiry_date, image, default_discount, weight, brand, is_synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      const txn = db.transaction((items) => {
        for (const p of items) {
          insertProduct.run(
            p.local_id || null, p.name, p.category_id, p.category_name, p.gst_rate || 0,
            p.product_code, p.price_type || 'exclusive', p.price, p.cost_price || 0,
            p.quantity, p.unit, p.barcode, p.expiry_date, p.image,
            p.default_discount || 0, p.weight, p.brand
          );
        }
      });
      txn(products);
      console.log(`[Restore] ✅ ${products.length} products restored`);
    }

    // 2. Restore Customers
    const { data: customers } = await shopSupabase.from('customers').select('*');
    if (customers && customers.length > 0) {
      const insertCustomer = db.prepare('INSERT OR REPLACE INTO customers (id, name, phone, address, is_synced) VALUES (?, ?, ?, ?, 1)');
      const txn = db.transaction((items) => {
        for (const c of items) {
          insertCustomer.run(c.local_id || null, c.name, c.phone, c.address);
        }
      });
      txn(customers);
      console.log(`[Restore] ✅ ${customers.length} customers restored`);
    }

    // 3. Restore Invoices
    const { data: invoices } = await shopSupabase.from('invoices').select('*');
    if (invoices && invoices.length > 0) {
      const insertInvoice = db.prepare(`
        INSERT OR REPLACE INTO invoices 
        (id, bill_no, bill_date, customer_name, customer_phone, customer_address, customer_id, payment_mode, total_amount, is_synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      const txn = db.transaction((items) => {
        for (const inv of items) {
          insertInvoice.run(
            inv.local_id || null, inv.bill_no, inv.bill_date, inv.customer_name,
            inv.customer_phone, inv.customer_address, inv.customer_id,
            inv.payment_mode, inv.total_amount
          );
        }
      });
      txn(invoices);
      console.log(`[Restore] ✅ ${invoices.length} invoices restored`);
    }

    // 4. Restore Invoice Items
    const { data: items } = await shopSupabase.from('invoice_items').select('*');
    if (items && items.length > 0) {
      const insertItem = db.prepare(`
        INSERT OR REPLACE INTO invoice_items 
        (id, invoice_id, product_id, quantity, price, gst_rate, gst_amount, discount_percent, discount_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const txn = db.transaction((rows) => {
        for (const i of rows) {
          insertItem.run(
            i.local_id || null, i.invoice_id, i.product_id, i.quantity,
            i.price, i.gst_rate, i.gst_amount, i.discount_percent || 0, i.discount_amount || 0
          );
        }
      });
      txn(items);
      console.log(`[Restore] ✅ ${items.length} invoice items restored`);
    }

    // 5. Restore Categories
    const { data: categories } = await shopSupabase.from('categories').select('*');
    if (categories && categories.length > 0) {
      for (const cat of categories) {
        try {
          db.prepare('INSERT OR REPLACE INTO categories (id, name, gst) VALUES (?, ?, ?)').run(cat.id, cat.name, cat.gst);
        } catch (e) { }
      }
    }

    // 6. Restore Offers
    const { data: offers } = await shopSupabase.from('offers').select('*');
    if (offers && offers.length > 0) {
      for (const off of offers) {
        try {
          db.prepare('INSERT OR REPLACE INTO offers (id, name, status, buy_product_id, buy_quantity, free_product_id, free_quantity) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
            off.local_id || null, off.name, off.status || 1, off.buy_product_id, off.buy_quantity, off.free_product_id, off.free_quantity
          );
        } catch (e) { }
      }
    }

    // 7. Restore Held Bills
    const { data: held } = await shopSupabase.from('held_bills').select('*');
    if (held && held.length > 0) {
      for (const h of held) {
        try {
          db.prepare('INSERT OR REPLACE INTO held_bills (id, label, cart_json, customer_json) VALUES (?, ?, ?, ?)').run(
            h.local_id || null, h.label, h.cart_json, h.customer_json
          );
        } catch (e) { }
      }
    }

    // 8. Restore Settings
    const { data: cloud_settings } = await shopSupabase.from('shop_settings').select('*');
    if (cloud_settings && cloud_settings.length > 0) {
      const configPath = path.join(app.getPath("userData"), "app_settings.json");
      let localSett = {};
      if (fs.existsSync(configPath)) {
        try { localSett = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
      }
      
      for (const s of cloud_settings) {
        localSett[s.key] = s.value;
      }
      
      // If we found a shopId in cloud, adopt it to local process/settings
      if (localSett.shopId) {
        process.env.SHOP_ID = localSett.shopId;
      }
      
      fs.writeFileSync(configPath, JSON.stringify(localSett, null, 2));
      console.log(`[Restore] ✅ Application settings restored and adopted.`);
    }

    return {
      products: products?.length || 0,
      customers: customers?.length || 0,
      invoices: invoices?.length || 0,
      items: items?.length || 0,
      categories: categories?.length || 0,
      offers: offers?.length || 0,
      held_bills: held?.length || 0,
      settings_restored: cloud_settings?.length || 0
    };
  } catch (e) {
    console.error('[Restore] Error:', e.message);
    throw e;
  }
}

// ── VALIDITY / SUBSCRIPTION SYSTEM ──
async function checkValidity(shopId) {
  if (!supabase || !shopId) {
    // Offline: check cached validity
    try {
      const cached = db.prepare('SELECT * FROM validity_cache ORDER BY id DESC LIMIT 1').get();
      if (cached) {
        const now = new Date();
        const end = new Date(cached.validity_end);
        const daysLeft = Math.ceil((end - now) / 86400000);
        return {
          valid: daysLeft > 0 && cached.is_paid,
          daysLeft: Math.max(0, daysLeft),
          validityEnd: cached.validity_end,
          isPaid: !!cached.is_paid,
          isOffline: true
        };
      }
    } catch (e) { }
    return { valid: true, daysLeft: 30, isOffline: true, note: 'No cached validity data' };
  }

  try {
    const { data: shop, error } = await supabase
      .from('shops')
      .select('is_active, is_paid, validity_start, validity_end')
      .eq('id', shopId)
      .single();

    if (error || !shop) return { valid: true, daysLeft: 30, note: 'Shop not found in cloud' };

    const now = new Date();
    const end = shop.validity_end ? new Date(shop.validity_end) : new Date(now.getTime() + 30 * 86400000);
    const daysLeft = Math.ceil((end - now) / 86400000);

    // Cache validity locally for offline use
    db.prepare('DELETE FROM validity_cache').run();
    db.prepare('INSERT INTO validity_cache (validity_start, validity_end, is_paid) VALUES (?, ?, ?)').run(
      shop.validity_start || now.toISOString(),
      end.toISOString(),
      shop.is_paid ? 1 : 0
    );

    return {
      valid: shop.is_active && daysLeft > 0,
      daysLeft: Math.max(0, daysLeft),
      validityEnd: end.toISOString(),
      isPaid: !!shop.is_paid,
      isActive: !!shop.is_active,
      warningPhase: daysLeft <= 7 && daysLeft > 0,
      isOffline: false
    };
  } catch (e) {
    console.error('[Validity] Error:', e.message);
    return { valid: true, daysLeft: 30, note: 'Check error: ' + e.message };
  }
}
async function syncToCloud(shopId) {
  if (!supabase || !shopId) return;
  try {
    // 0. Ensure shop is registered in cloud first
    await registerShop(shopId);

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
    title: "Innoaivators Billing System",
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

  // Force the title to stay "Innoaivators Billing System" regardless of page content
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


  // Load shop Supabase config on startup
  loadShopSupabaseConfig();

  // 🟢 Initialize Cloud Sync & Alert Loop
  setInterval(async () => {
    try {
      const configPath = path.join(app.getPath("userData"), "app_settings.json");
      let settings = {};
      if (fs.existsSync(configPath)) {
        try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (e) { settings = {}; }
      }

      const url = settings.supabaseUrl || process.env.SUPABASE_URL || 'https://baawqrqihlhsrghvjlpx.supabase.co';
      const key = settings.supabaseKey || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0';
      const currentShopId = settings.shopId || process.env.SHOP_ID;

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

      // WhatsApp Alerts (send outside transaction to prevent DB lock during network wait)
      if (settings.ownerPhone) {
        for (const p of lowStock) sendMessage(settings.ownerPhone, `📉 ${p.name} is low Stock (${p.quantity}).`);
        for (const p of outOfStock) sendMessage(settings.ownerPhone, `🚫 ${p.name} out of Stock!`);
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

      // ── Admin Cloud Sync (central Supabase) ──
      if (url && key && url.startsWith('http')) {
        initSupabase(url, key);
        if (currentShopId) {
          syncToCloud(currentShopId).catch(console.error);
        }
      }

      // ── Shop-specific Supabase Sync ──
      if (shopSupabase) {
        syncToShopSupabase().catch(e => console.error('[ShopSync Loop]', e.message));
      }

      // ── Local Database Path Sync ──
      syncToLocalPath();

      // ── Validity / Subscription Check ──
      if (currentShopId && supabase) {
        const validity = await checkValidity(currentShopId);
        if (validity.warningPhase && mainWindow) {
          mainWindow.webContents.send('validity-warning', {
            daysLeft: validity.daysLeft,
            validityEnd: validity.validityEnd
          });
        }
        if (!validity.valid && mainWindow) {
          mainWindow.webContents.send('validity-expired');
        }
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
  try {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    if (fs.existsSync(configPath)) {
      const settings = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (settings.shopId) return settings.shopId;
    }
  } catch (e) {}
  return process.env.SHOP_ID || null;
});

// 🟢 WINDOW CONTROLS
ipcMain.handle("minimize-window", () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle("close-window", () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle("create-backup", async () => {
  try {
    const backupDir = path.join(os.homedir(), "Documents", "Innoaivators_Backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sourcePath = db.name; // In better-sqlite3, db.name is the file path
    const backupPath = path.join(backupDir, `billing_backup_${timestamp}.db`);
    
    fs.copyFileSync(sourcePath, backupPath);
    
    // Open the folder for them
    shell.showItemInFolder(backupPath);
    
    return { success: true, message: `Backup saved to Documents/Innoaivators_Backups`, path: backupPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
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

  // 🔥 Trigger immediate cloud sync after local save
  try {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    if (fs.existsSync(configPath)) {
      const settings = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const shopIdValue = settings.shopId || process.env.SHOP_ID;
      if (shopIdValue && supabase) {
        syncToCloud(shopIdValue).catch(e => console.error("[Sync] Post-bill error:", e.message));
      }
    }
  } catch (e) { }

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

    let settings = {};
    if (fs.existsSync(configPath)) {
      try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
    }

    // Direct check in app_settings.json for persistence in production
    const shopIdValue = settings.shopId || process.env.SHOP_ID;

    if (!shopIdValue) {
      return { isRegistered: false, shopId: "" };
    }

    return { isRegistered: true, shopId: shopIdValue };
  } catch (e) {
    return { isRegistered: false, shopId: "" };
  }
});

// ============================================================
// 📧 EMAIL VERIFICATION (OTP) SYSTEM
// ============================================================

// Check if email already exists in shops table
ipcMain.handle("check-email-exists", async (event, email) => {
  if (!supabase) {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    let settings = {};
    if (fs.existsSync(configPath)) {
      try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
    }
    const url = settings.supabaseUrl || process.env.SUPABASE_URL || 'https://baawqrqihlhsrghvjlpx.supabase.co';
    const key = settings.supabaseKey || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0';
    if (url && key) initSupabase(url, key);
  }
  if (!supabase) return { exists: false };

  try {
    const { data, error } = await supabase
      .from('shops')
      .select('id')
      .eq('owner_email', email.trim().toLowerCase())
      .limit(1);
    if (error) return { exists: false };
    return { exists: data && data.length > 0 };
  } catch (e) {
    return { exists: false };
  }
});

// Send OTP to email (generates locally, sends via Gmail SMTP)
ipcMain.handle("send-otp", async (event, email) => {
  try {
    // Generate 6-digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    otpStore.set(email.trim().toLowerCase(), { code, expiresAt });

    // Send via Gmail
    await sendOtpEmail(email.trim(), code);
    console.log(`[OTP] \u2705 Code sent to ${email}`);
    return { success: true, message: 'Verification code sent to your email.' };
  } catch (e) {
    console.error('[OTP] \u274c Failed:', e.message);
    return { success: false, error: e.message };
  }
});

// Verify OTP (local verification — instant, no network needed)
ipcMain.handle("verify-otp", async (event, { email, code }) => {
  try {
    const stored = otpStore.get(email.trim().toLowerCase());
    if (!stored) {
      return { success: false, error: 'No verification code found. Click Verify Email first.' };
    }
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(email.trim().toLowerCase());
      return { success: false, error: 'Code expired. Please request a new one.' };
    }
    if (stored.code !== code.trim()) {
      return { success: false, error: 'Invalid code. Please check and try again.' };
    }
    // Success
    otpStore.delete(email.trim().toLowerCase());
    console.log(`[OTP] \u2705 Email ${email} verified!`);
    return { success: true };
  } catch (e) {
    return { success: false, error: 'Verification failed: ' + e.message };
  }
});

// Register shop in Supabase → get UUID
ipcMain.handle("register-shop", async (event, data) => {
  const { shopName, ownerName, mobileNumber, email, shopEmail } = data;

  // Get Supabase client  
  const configPath = path.join(app.getPath("userData"), "app_settings.json");
  let settings = {};
  if (fs.existsSync(configPath)) {
    try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
  }

  const url = settings.supabaseUrl || process.env.SUPABASE_URL || 'https://baawqrqihlhsrghvjlpx.supabase.co';
  const key = settings.supabaseKey || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0';

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
        owner_email: email, 
        mobile_number: mobileNumber,
        name: shopName,
        shop_email: shopEmail || email,
        master_key: settings.masterKey || "owner123",
        is_active: false 
      });

    if (error) {
      console.error("[Register] Supabase error:", error.message);
      return { success: false, error: error.message };
    }

    // Save carefully to local process
    process.env.SHOP_ID = newShopId;

    // Save to app_settings.json (Source of Truth)
    settings.shopId = newShopId;
    settings.storeName = shopName;
    settings.ownerName = ownerName;
    settings.ownerEmail = email; 
    settings.shopEmail = shopEmail || email;
    settings.ownerMobile = mobileNumber;
    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));

    console.log("[Register] Shop registered and pending activation:", newShopId);
    return { success: true, shopId: newShopId };
  } catch (e) {
    console.error("[Register] Critical error:", e.message);
    return { success: false, error: "System error: " + e.message };
  }
});

// 🟢 LOGIN TO EXISTING SHOP
ipcMain.handle("login-shop", async (event, data) => {
  const { email, masterKey } = data;

  const configPath = path.join(app.getPath("userData"), "app_settings.json");
  let settings = {};
  if (fs.existsSync(configPath)) {
    try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
  }

  const url = settings.supabaseUrl || process.env.SUPABASE_URL || 'https://baawqrqihlhsrghvjlpx.supabase.co';
  const key = settings.supabaseKey || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0';

  initSupabase(url, key);
  if (!supabase) return { success: false, error: "Cloud connection failed." };

  try {
    // Find shop by email and master key
    const { data: shopRecord, error } = await supabase
      .from("shops")
      .select("*")
      .eq("owner_email", email.trim().toLowerCase())
      .eq("master_key", masterKey)
      .single();

    if (error || !shopRecord) {
      return { success: false, error: "Invalid Email or Master Key. Check your credentials." };
    }

    // Save to local storage
    process.env.SHOP_ID = shopRecord.id;
    settings.shopId = shopRecord.id;
    settings.storeName = shopRecord.name;
    settings.ownerName = shopRecord.owner_name;
    settings.ownerEmail = shopRecord.owner_email;
    settings.shopEmail = shopRecord.shop_email || shopRecord.owner_email;
    settings.ownerMobile = shopRecord.mobile_number;
    settings.masterKey = shopRecord.master_key;
    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));

    console.log("[Login] Shop linked successfully:", shopRecord.id);
    return { success: true, shopId: shopRecord.id, name: shopRecord.name };
  } catch (e) {
    return { success: false, error: "Authentication failed: " + e.message };
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
    const url = settings.supabaseUrl || process.env.SUPABASE_URL || 'https://baawqrqihlhsrghvjlpx.supabase.co';
    const key = settings.supabaseKey || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0';
    if (url && key) initSupabase(url, key);
  }

  if (!supabase) return { success: false, error: "Supabase not connected" };

  // Load shopId directly from setting since .env may not exist in production
  let shopId = process.env.SHOP_ID;
  if (!shopId) {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    if (fs.existsSync(configPath)) {
      try { const s = JSON.parse(fs.readFileSync(configPath, 'utf-8')); shopId = s.shopId; } catch {}
    }
  }
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
    const url = settings.supabaseUrl || process.env.SUPABASE_URL || 'https://baawqrqihlhsrghvjlpx.supabase.co';
    const key = settings.supabaseKey || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0';
    if (url && key) initSupabase(url, key);
  }

  if (!supabase) return { is_active: true, hwid: machineId, note: "Offline mode or Supabase not connected" };

  try {
    let shopId = process.env.SHOP_ID || "";
    if (!shopId) {
      const configPath = path.join(app.getPath("userData"), "app_settings.json");
      if (fs.existsSync(configPath)) {
        try { const s = JSON.parse(fs.readFileSync(configPath, 'utf-8')); shopId = s.shopId || ""; } catch {}
      }
    }
    if (!shopId) return { is_active: false, hwid: machineId, note: "Waiting for registration..." };

    const { data: shopRecord, error } = await supabase
      .from("shops")
      .select("is_active")
      .eq("id", shopId)
      .single();

    if (error || !shopRecord) {
      // Shop DELETED by admin — wipe local registration so owner must re-register
      console.log(`[License] \ud83d\uddd1\ufe0f Shop ${shopId} deleted from cloud by admin. Clearing local data.`);

      const configPath2 = path.join(app.getPath("userData"), "app_settings.json");
      let settings2 = {};
      if (fs.existsSync(configPath2)) {
        try { settings2 = JSON.parse(fs.readFileSync(configPath2, 'utf-8')); } catch {}
      }
      if (settings2.shopId) {
        delete settings2.shopId;
        fs.writeFileSync(configPath2, JSON.stringify(settings2, null, 2));
      }
      process.env.SHOP_ID = "";

      return { is_active: false, needsRegistration: true, hwid: machineId, note: "Shop was deleted by admin. Please register again." };
    }

    if (!shopRecord.is_active) {
      return { is_active: false, hwid: machineId, note: "Pending activation. Admin has not yet activated this shop." };
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
    let shopId = process.env.SHOP_ID || "";
    if (!shopId) {
      const configPath = path.join(app.getPath("userData"), "app_settings.json");
      if (fs.existsSync(configPath)) {
        try { const s = JSON.parse(fs.readFileSync(configPath, 'utf-8')); shopId = s.shopId || ""; } catch {}
      }
    }
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

// ============================================================
// 🔗 SHOP SUPABASE CONNECTION (Separate DB per shop)
// ============================================================

// Save shop Supabase credentials
ipcMain.handle("save-shop-supabase", async (event, { url, key }) => {
  try {
    // Clear existing config
    db.prepare('DELETE FROM shop_supabase_config').run();
    // Insert new config
    db.prepare('INSERT INTO shop_supabase_config (supabase_url, supabase_key, is_connected) VALUES (?, ?, 1)').run(url, key);
    initShopSupabase(url, key);

    // Also save to admin Supabase for reference
    if (supabase) {
      const configPath = path.join(app.getPath("userData"), "app_settings.json");
      let settings = {};
      if (fs.existsSync(configPath)) {
        try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
      }
      const shopId = settings.shopId || process.env.SHOP_ID;
      if (shopId) {
        await supabase.from('shops').update({
          shop_supabase_url: url,
          shop_supabase_key: key
        }).eq('id', shopId);
      }
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Get shop Supabase config
ipcMain.handle("get-shop-supabase", async () => {
  try {
    const config = db.prepare('SELECT * FROM shop_supabase_config ORDER BY id DESC LIMIT 1').get();
    return config || null;
  } catch (e) {
    return null;
  }
});

// Test shop Supabase connection
ipcMain.handle("test-shop-connection", async (event, { url, key }) => {
  try {
    const testClient = createClient(url, key);
    // Try to list tables or read from a table
    const { data, error } = await testClient.from('products').select('id').limit(1);
    if (error && error.code !== 'PGRST116') {
      // PGRST116 = table not found, which is OK for a fresh database
      return { success: false, error: error.message };
    }
    return { success: true, message: 'Connection successful!' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Manual sync trigger
ipcMain.handle("sync-shop-data", async () => {
  if (!shopSupabase) return { success: false, error: 'Shop Supabase not connected. Enter URL and Key first.' };
  try {
    // Mark all records as unsynced to force full sync
    db.prepare('UPDATE products SET is_synced = 0').run();
    db.prepare('UPDATE invoices SET is_synced = 0').run();
    db.prepare('UPDATE customers SET is_synced = 0').run();
    await syncToShopSupabase();
    return { success: true, message: 'Data synced successfully!' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Restore data from shop's Supabase
ipcMain.handle("restore-from-cloud", async () => {
  if (!shopSupabase) return { success: false, error: 'Shop Supabase not connected. Enter URL and Key first.' };
  try {
    const result = await restoreFromShopSupabase();
    return { success: true, message: `Restored: ${result.products} products, ${result.invoices} invoices, ${result.customers} customers`, data: result };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ============================================================
// 💾 LOCAL DATABASE PATH CONFIGURATION
// ============================================================

ipcMain.handle("save-local-db-path", async (event, storagePath) => {
  try {
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }
    db.prepare('DELETE FROM local_db_config').run();
    db.prepare('INSERT INTO local_db_config (storage_path, is_active) VALUES (?, 1)').run(storagePath);
    // Immediately sync
    syncToLocalPath();
    return { success: true, message: `Local storage configured: ${storagePath}` };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle("get-local-db-path", async () => {
  try {
    const config = db.prepare('SELECT * FROM local_db_config WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();
    return config ? config.storage_path : '';
  } catch (e) {
    return '';
  }
});

ipcMain.handle("browse-folder", async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Local Database Storage Folder'
    });
    if (result.canceled || !result.filePaths.length) return '';
    return result.filePaths[0];
  } catch (e) {
    return '';
  }
});

// ============================================================
// ⏳ VALIDITY / SUBSCRIPTION SYSTEM
// ============================================================

ipcMain.handle("get-validity", async () => {
  try {
    const configPath = path.join(app.getPath("userData"), "app_settings.json");
    let settings = {};
    if (fs.existsSync(configPath)) {
      try { settings = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
    }
    const shopId = settings.shopId || process.env.SHOP_ID;
    
    // Initialize admin supabase if needed
    const url = settings.supabaseUrl || process.env.SUPABASE_URL || 'https://baawqrqihlhsrghvjlpx.supabase.co';
    const key = settings.supabaseKey || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0';
    if (url && key) initSupabase(url, key);

    return await checkValidity(shopId);
  } catch (e) {
    return { valid: true, daysLeft: 30, note: 'Error: ' + e.message };
  }
});
