const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  addProduct: (data) => ipcRenderer.invoke("add-product", data),
  getProductsFull: () => ipcRenderer.invoke("get-products-full"),
  createInvoice: (cart) => ipcRenderer.invoke("create-invoice", cart),
  bulkUpdateProducts: (data) => ipcRenderer.invoke("bulkUpdateProducts", data),
});