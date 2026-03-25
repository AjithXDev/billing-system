const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const db = require("./database/db");

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadURL("http://localhost:5173");
}

app.whenReady().then(createWindow);


// 🟢 ADD PRODUCT
ipcMain.handle("add-product", async (event, product) => {
  const {
    name,
    category_id,
    price,
    cost_price,
    quantity,
    unit,
    barcode,
    gst
  } = product;

  db.prepare(`
    INSERT INTO products 
    (name, category_id, price, cost_price, quantity, unit, barcode, gst)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name,
    category_id || null,
    price,
    cost_price,
    quantity,
    unit,
    barcode,
    gst || 0
  );

  return { message: "Product added" };
});


// 🟢 GET PRODUCTS WITH CATEGORY GST
ipcMain.handle("get-products-full", () => {
  return db.prepare(`
    SELECT 
      p.*,
      c.gst as category_gst
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
  `).all();
});


// 🟢 GET PRODUCTS (BASIC)
ipcMain.handle("get-products", async () => {
  return db.prepare("SELECT * FROM products").all();
});


// 🟢 BULK UPDATE (STOCK + GST)
ipcMain.handle("bulkUpdateProducts", async (event, updates) => {
  const stmt = db.prepare(`
    UPDATE products 
    SET 
      quantity = quantity + ?, 
      gst = ?
    WHERE id = ?
  `);

  const transaction = db.transaction((items) => {
    for (const item of items) {
      stmt.run(item.addQty, item.gst, item.id);
    }
  });

  transaction(updates);

  return { message: "Bulk update success 🔥" };
});


// 🟢 CREATE INVOICE (WITH GST SAVE)
ipcMain.handle("create-invoice", async (event, cart) => {
  let total = 0;

  cart.forEach(item => {
    total += (item.total + item.gstAmt);
  });

  const result = db.prepare(`
    INSERT INTO invoices (total_amount)
    VALUES (?)
  `).run(total);

  const invoiceId = result.lastInsertRowid;

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

  return { message: "Invoice created 🔥", invoiceId };
});