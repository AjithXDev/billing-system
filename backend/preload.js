const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  addProduct: (data) => ipcRenderer.invoke("add-product", data),
  getProductsFull: () => ipcRenderer.invoke("get-products-full"),
  createInvoice: (data) => ipcRenderer.invoke("create-invoice", data),
  bulkUpdateProducts: (data) => ipcRenderer.invoke("bulkUpdateProducts", data),
  getCategories: () => ipcRenderer.invoke("get-categories"),
  searchCustomer: (phone) => ipcRenderer.invoke("search-customer", phone),
  editProduct: (data) => ipcRenderer.invoke("edit-product", data),
  deleteProduct: (id) => ipcRenderer.invoke("delete-product", id),
  sendWhatsapp: (phone, text) => ipcRenderer.invoke("send-whatsapp", phone, text),
});