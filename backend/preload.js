const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  addProduct:          (data)         => ipcRenderer.invoke("add-product", data),
  getProductsFull:     ()             => ipcRenderer.invoke("get-products-full"),
  createInvoice:       (data)         => ipcRenderer.invoke("create-invoice", data),
  bulkUpdateProducts:  (data)         => ipcRenderer.invoke("bulkUpdateProducts", data),
  getCategories:       ()             => ipcRenderer.invoke("get-categories"),
  searchCustomer:      (phone)        => ipcRenderer.invoke("search-customer", phone),
  editProduct:         (data)         => ipcRenderer.invoke("edit-product", data),
  deleteProduct:       (id)           => ipcRenderer.invoke("delete-product", id),

  // 🔥 Hold / Resume Bill
  holdBill:            (data)         => ipcRenderer.invoke("hold-bill", data),
  getHeldBills:        ()             => ipcRenderer.invoke("get-held-bills"),
  deleteHeldBill:      (id)           => ipcRenderer.invoke("delete-held-bill", id),

  // 🔥 Expiry & Stock Reports
  getExpiryAlerts:     ()             => ipcRenderer.invoke("get-expiry-alerts"),
  getStockAlerts:      ()             => ipcRenderer.invoke("get-stock-alerts"),
  getDashboardStats:   ()             => ipcRenderer.invoke("get-dashboard-stats"),

  // 🔥 Owner Mobile Dashboard URL
  getDashboardUrl:     ()             => ipcRenderer.invoke("get-dashboard-url"),
  getTunnelUrl:        ()             => ipcRenderer.invoke("get-tunnel-url"),
  onDashboardReady:    (cb)           => ipcRenderer.on("dashboard-server-ready", (_e, data) => cb(data)),
  onTunnelReady:       (cb)           => ipcRenderer.on("tunnel-ready", (_e, data) => cb(data)),

  // WhatsApp — automatic sending
  sendWhatsapp:        (phone, text)  => ipcRenderer.invoke("send-whatsapp", phone, text),
  getWhatsappStatus:   ()             => ipcRenderer.invoke("whatsapp-status"),

  // Listen for QR code or status events pushed from main process
  onWhatsappQR:        (cb)           => ipcRenderer.on("whatsapp-qr",     (_e, qr)     => cb(qr)),
  onWhatsappStatus:    (cb)           => ipcRenderer.on("whatsapp-status",  (_e, status) => cb(status)),
});