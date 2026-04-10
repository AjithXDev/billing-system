const { createClient } = require('@supabase/supabase-js');
const db = require('./db');
const fs = require('fs');
const path = require('path');

let supabase = null;

const getSettings = () => {
  try {
    const configPath = path.join(process.env.APPDATA, 'smart-billing', 'app_settings.json'); // electron default storage check
    // Actually using a more robust way since we are inside electron main context
    // We already have a mechanism in main.js. Let's make it fetchable.
  } catch(e) {}
  return null;
};

function initSupabase(url, key) {
  if (!url || !key) return null;
  supabase = createClient(url, key);
  return supabase;
}

async function syncToCloud(shopId, customSupabase = null) {
  const client = customSupabase || supabase;
  if (!client) return;

  try {
    // 1. Sync Invoices
    const unsyncedInvoices = db.prepare("SELECT * FROM invoices WHERE is_synced = 0 LIMIT 50").all();
    for (const inv of unsyncedInvoices) {
      const items = db.prepare("SELECT * FROM invoice_items WHERE invoice_id = ?").all(inv.id);
      const { error } = await client
        .from('invoices')
        .upsert({
          shop_id: shopId,
          local_id: inv.id,
          bill_no: inv.bill_no,
          bill_date: inv.bill_date,
          customer_name: inv.customer_name,
          total_amount: inv.total_amount,
          payment_mode: inv.payment_mode,
          created_at: inv.created_at,
          items_json: JSON.stringify(items)
        });

      if (!error) db.prepare("UPDATE invoices SET is_synced = 1 WHERE id = ?").run(inv.id);
    }

    // 2. Sync Products (Incremental)
    const unsyncedProducts = db.prepare("SELECT * FROM products WHERE is_synced = 0 LIMIT 100").all();
    if (unsyncedProducts.length > 0) {
      const { error } = await client.from('products').upsert(unsyncedProducts.map(p => ({
        shop_id: shopId,
        local_id: p.id,
        name: p.name,
        price: p.price,
        cost_price: p.cost_price,
        quantity: p.quantity,
        expiry_date: p.expiry_date
      })));
      if (!error) {
        db.transaction((items) => {
          const stmt = db.prepare("UPDATE products SET is_synced = 1 WHERE id = ?");
          for (const item of items) stmt.run(item.id);
        })(unsyncedProducts);
      }
    }

    // 3. Sync Customers
    const unsyncedCustomers = db.prepare("SELECT * FROM customers WHERE is_synced = 0 LIMIT 50").all();
    if (unsyncedCustomers.length > 0) {
      const { error } = await client.from('customers').upsert(unsyncedCustomers.map(c => ({
        shop_id: shopId,
        local_id: c.id,
        name: c.name,
        phone: c.phone,
        address: c.address
      })));
      if (!error) {
        db.transaction((items) => {
          const stmt = db.prepare("UPDATE customers SET is_synced = 1 WHERE id = ?");
          for (const item of items) stmt.run(item.id);
        })(unsyncedCustomers);
      }
    }

  } catch (e) {
    console.error("[Sync] Background sync failed:", e.message);
  }
}

// Function to log WhatsApp alerts to Cloud
async function logNotification(shopId, type, message) {
  if (!supabase) return;
  await supabase.from('notifications').insert({
    shop_id: shopId,
    type,
    message,
    created_at: new Date().toISOString()
  });
}

module.exports = { initSupabase, syncToCloud, logNotification };
