const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  addProduct:          (data)         => ipcRenderer.invoke("add-product", data),
  getProductsFull:     ()             => ipcRenderer.invoke("get-products-full"),
  createInvoice:       (data)         => ipcRenderer.invoke("create-invoice", data),
  getInvoices:         ()             => ipcRenderer.invoke("get-invoices"),
  getInvoiceDetails:   (id)           => ipcRenderer.invoke("get-invoice-details", id),
  deleteInvoice:       (id)           => ipcRenderer.invoke("delete-invoice", id),
  bulkUpdateProducts:  (data)         => ipcRenderer.invoke("bulkUpdateProducts", data),
  getCategories:       ()             => ipcRenderer.invoke("get-categories"),
  searchCustomer:      (phone)        => ipcRenderer.invoke("search-customer", phone),
  editProduct:         (data)         => ipcRenderer.invoke("edit-product", data),
  deleteProduct:       (id)           => ipcRenderer.invoke("delete-product", id),

  // 🔥 Hold / Resume Bill
  holdBill:            (data)         => ipcRenderer.invoke("hold-bill", data),
  getHeldBills:        ()             => ipcRenderer.invoke("get-held-bills"),
  deleteHeldBill:      (id)           => ipcRenderer.invoke("delete-held-bill", id),

  // 🔥 Offers & Promotions
  getOffers:           ()             => ipcRenderer.invoke("get-offers"),
  addOffer:            (data)         => ipcRenderer.invoke("add-offer", data),
  editOffer:           (data)         => ipcRenderer.invoke("edit-offer", data),
  deleteOffer:         (id)           => ipcRenderer.invoke("delete-offer", id),
  toggleOfferStatus:   (data)         => ipcRenderer.invoke("toggle-offer-status", data),


  // 🔥 Expiry & Stock Reports
  getExpiryAlerts:     ()             => ipcRenderer.invoke("get-expiry-alerts"),
  getStockAlerts:      ()             => ipcRenderer.invoke("get-stock-alerts"),
  getDashboardStats:   ()             => ipcRenderer.invoke("get-dashboard-stats"),

  // 🔥 Owner Mobile Dashboard URL & Cloud Sync
  getLocalIp:          ()             => ipcRenderer.invoke("get-local-ip"),
  getDashboardUrl:     ()             => ipcRenderer.invoke("get-dashboard-url"),
  onTunnelReady:       (cb)           => ipcRenderer.on("tunnel-ready", (_e, data) => cb(data)),
  getShopId:           ()             => ipcRenderer.invoke("get-shop-id"),
  saveAppSettings:     (data)         => ipcRenderer.invoke("save-app-settings", data),
  getAppSettings:      ()             => ipcRenderer.invoke("get-app-settings"),

  // WhatsApp — automatic sending
  sendWhatsapp:        (phone, text)  => ipcRenderer.invoke("send-whatsapp", phone, text),
  getWhatsappStatus:   ()             => ipcRenderer.invoke("whatsapp-status"),

  // Listen for QR code or status events pushed from main process
  onWhatsappQR:        (cb)           => ipcRenderer.on("whatsapp-qr",     (_e, qr)     => cb(qr)),
  onWhatsappStatus:    (cb)           => ipcRenderer.on("whatsapp-status",  (_e, status) => cb(status)),

  // AI & Analytics
  askAIConsultant:     (question)     => ipcRenderer.invoke("ask-ai-consultant", question),

  // 🔔 Notifications (Owner Alerts)
  getNotifications:    (opts)         => ipcRenderer.invoke("get-notifications", opts),
  markNotificationRead:(id)           => ipcRenderer.invoke("mark-notification-read", id),
  markAllNotifRead:    ()             => ipcRenderer.invoke("mark-all-notif-read"),
  deleteNotification:  (id)           => ipcRenderer.invoke("delete-notification", id),
  getSyncStatus:       ()             => ipcRenderer.invoke("get-sync-status"),
  getLicenseStatus:    ()             => ipcRenderer.invoke("get-license-status"),
});