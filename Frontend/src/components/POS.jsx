import React, { useState, useEffect, useRef } from "react";
import { Search } from "lucide-react";

/* ─────────────────── helpers ─────────────────────────── */
const todayStr = () => new Date().toISOString().split("T")[0];

function isExpired(product) {
  if (!product || !product.expiry_date) return false;
  return product.expiry_date < todayStr();
}

/* ─────────────────── Held Bills Panel ───────────────── */
function HeldBillsPanel({ onResume, onClose }) {
  const [heldBills, setHeldBills] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const data = await window.api?.getHeldBills?.() || [];
    setHeldBills(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const discard = async (id) => {
    await window.api?.deleteHeldBill?.(id);
    await load();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="invoice-modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          ⏸️ Held Bills ({heldBills.length})
        </div>
        {loading ? (
          <div style={{ textAlign: "center", color: "var(--text-3)", padding: "20px 0" }}>Loading…</div>
        ) : heldBills.length === 0 ? (
          <div style={{
            textAlign: "center", color: "var(--text-4)", padding: "30px 0",
            background: "var(--surface-2)", borderRadius: 10
          }}>🗂️ No bills on hold right now</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 360, overflowY: "auto" }}>
            {heldBills.map(bill => (
              <div key={bill.id} style={{
                background: "var(--surface-2)", borderRadius: 10,
                border: "1px solid var(--border)", padding: "12px 14px",
                display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--text-1)" }}>{bill.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>
                    {bill.cart?.length || 0} items · {bill.customer?.name || "Walk-in"}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 2 }}>
                    Held at: {new Date(bill.created_at).toLocaleTimeString("en-IN")}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => { onResume(bill); onClose(); }}
                    style={{
                      padding: "6px 14px", background: "var(--primary)", color: "#fff",
                      border: "none", borderRadius: 7, fontWeight: 700, fontSize: 12, cursor: "pointer"
                    }}
                  >▶ Resume</button>
                  <button
                    onClick={() => discard(bill.id)}
                    style={{
                      padding: "6px 10px", background: "#ef444420", color: "#ef4444",
                      border: "1px solid #ef444440", borderRadius: 7, fontWeight: 700, fontSize: 12, cursor: "pointer"
                    }}
                  >🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} className="btn-outline" style={{ width: "100%", marginTop: 16 }}>Close</button>
      </div>
    </div>
  );
}

/* ─────────────────── Main POS Component ────────────── */
const POS = () => {
  const emptyRow = () => ({ tempId: Date.now() + Math.random(), name: "", price: 0, qty: 0, total: 0, gstRate: 0, gstAmt: 0 });

  const [billItems, setBillItems] = useState([emptyRow()]);
  const [currentRow, setCurrentRow] = useState(0);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSugIndex, setSelectedSugIndex] = useState(0);
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceSuccess, setInvoiceSuccess] = useState(false);
  const [lastInvoiceId, setLastInvoiceId] = useState(null);
  const [customer, setCustomer] = useState({ name: "", phone: "", address: "" });
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [amountReceived, setAmountReceived] = useState("");
  const [checkoutStep, setCheckoutStep] = useState(1);
  const [allProducts, setAllProducts] = useState([]);
  const [showHeldBills, setShowHeldBills] = useState(false);
  const [heldCount, setHeldCount] = useState(0);
  const [settings, setSettings] = useState({ storeName: "iVA BILLING", storeAddress: "123 Business Road...", storePhone: "+91 90000 00000", gstNumber: "" });
  const [syncPending, setSyncPending] = useState(0);
  
  // ── NEW TERMINAL STATES ──
  const [terminalActive, setTerminalActive] = useState(false);
  const [billingMode, setBillingMode] = useState(null); // 'photo' or 'tally'
  
  const inputRefs = useRef({}); 
  const tallyInputRef = useRef(null);

  // 🟢 Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeys = (e) => {
      // F2 or Ctrl+F to focus search in Tally mode
      if ((e.key === 'F2' || (e.ctrlKey && e.key === 'f')) && billingMode === 'tally') {
        e.preventDefault();
        inputRefs.current[`${currentRow}_name`]?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, [billingMode, currentRow]);

  // Full Screen Trigger
  const enterFullScreen = () => {
    const elem = document.documentElement;
    if (elem.requestFullscreen) elem.requestFullscreen();
    else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
    else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
  };

  const startTerminal = (mode) => {
    setBillingMode(mode);
    setTerminalActive(true);
    enterFullScreen();
  };

  /* ── Load settings ── */
  const loadSettings = () => {
    try {
      const raw = localStorage.getItem("smart_billing_settings");
      if (raw) setSettings(JSON.parse(raw));
    } catch (e) {}
  };

  /* ── Load products & held bill count ── */
  useEffect(() => {
    if (window.api?.getProductsFull) {
      window.api.getProductsFull()
        .then(data => setAllProducts(Array.isArray(data) ? data : []))
        .catch(() => setAllProducts([]));
    }
    refreshHeldCount();
    loadSettings();

    // Focus first row on start
    setTimeout(() => inputRefs.current["0_name"]?.focus(), 100);

    const syncCheck = setInterval(() => {
      window.api?.getSyncStatus?.().then(res => setSyncPending(res.pending));
    }, 10000);
    return () => clearInterval(syncCheck);
  }, []);

  const refreshHeldCount = async () => {
    const held = await window.api?.getHeldBills?.() || [];
    setHeldCount(held.length);
  };

  /* ── Hold current bill ── */
  const holdBill = async () => {
    const validItems = billItems.filter(i => i.qty > 0 && i.id);
    if (validItems.length === 0) {
      alert("Nothing to hold — add at least one item.");
      return;
    }
    const label = customer.name
      ? `${customer.name} (${customer.phone || "no phone"})`
      : `Bill held at ${new Date().toLocaleTimeString("en-IN")}`;
    await window.api?.holdBill?.({ cart: validItems, customer, label });
    // Reset for next customer
    setBillItems([emptyRow()]);
    setCustomer({ name: "", phone: "", address: "" });
    refreshHeldCount();
    alert(`✅ Bill held for "${label}". You can resume it anytime.`);
  };

  /* ── Get available stock for a product (accounting for items already in the cart) ── */
  const getProductStock = (productId) => {
    const product = allProducts.find(p => p.id === productId);
    return product ? Number(product.quantity || 0) : 0;
  };

  /* ── Add Product from Grid ── */
  const addProductToCart = (product) => {
    if (!product) return;
    if (isExpired(product)) {
      alert(`🚫 "${product.name}" is EXPIRED (${product.expiry_date})!\nThis product cannot be added to billing.`);
      return;
    }
    const availableStock = Number(product.quantity || 0);
    if (availableStock <= 0) {
      alert(`🚫 "${product.name}" is OUT OF STOCK!\nCannot add to billing.`);
      return;
    }

    const priceType = product.price_type || 'exclusive';
    const catGst = Number(product.gst_rate || product.category_gst || 0);
    const price = Number(product.price || 0);

    const existingIdx = billItems.findIndex(i => i.id === product.id);
    if (existingIdx >= 0) {
      const currentQty = Number(billItems[existingIdx].qty || 0);
      if (currentQty >= availableStock) {
        alert(`⚠️ Stock limit reached!\n"${product.name}" has only ${availableStock} in stock.`);
        return;
      }
      updateQty(existingIdx, currentQty + 1);
    } else {
      let total, gstAmt;
      const quantity = 1;
      if (priceType === 'inclusive') {
        total = price * quantity;
        const taxable = total / (1 + catGst / 100);
        gstAmt = total - taxable;
      } else {
        const taxable = price * quantity;
        gstAmt = (taxable * catGst) / 100;
        total = taxable + gstAmt;
      }
      
      const newRow = {
        tempId: Date.now() + Math.random(),
        id: product.id,
        name: product.name || "",
        price,
        price_type: priceType,
        qty: quantity,
        total: priceType === 'inclusive' ? total - gstAmt : price * quantity,
        gstRate: catGst,
        gstAmt,
        expiry_date: product.expiry_date || null,
        image: product.image || null,
        maxStock: availableStock
      };

      const currentValid = billItems.filter(i => i.id);
      setBillItems([...currentValid, newRow]);
    }
  };

  /* ── Resume held bill ── */
  const resumeBill = async (bill) => {
    // Restore cart with fresh product data (to get latest prices/expiry)
    const restoredCart = bill.cart.map(i => ({
      ...i,
      tempId: Date.now() + Math.random()
    }));
    setBillItems([...restoredCart, emptyRow()]);
    setCustomer(bill.customer || { name: "", phone: "", address: "" });
    // Remove from db
    await window.api?.deleteHeldBill?.(bill.id);
    refreshHeldCount();
  };

  /* ── Product search ── */
  const handleInputChange = (index, value) => {
    const safeValue = typeof value === "string" ? value : "";
    const updated = [...billItems];
    updated[index] = {
      ...updated[index],
      name: safeValue,
      id: null,
      price: 0,
      total: 0,
      gstRate: 0,
      gstAmt: 0
    };
    setBillItems(updated);

    const matchVal = safeValue.trim().toLowerCase();
    if (matchVal.length > 0) {
      const filtered = allProducts.filter(p => {
        if (!p) return false;
        const pName = p.name ? String(p.name).toLowerCase() : "";
        const pBarcode = p.barcode ? String(p.barcode).trim().toLowerCase() : "";
        const pCode = p.product_code ? String(p.product_code).toLowerCase() : "";
        return pName.includes(matchVal) || pBarcode === matchVal || pCode === matchVal;
      });
      setSuggestions(filtered);
      setSelectedSugIndex(0);
    } else {
      setSuggestions([]);
    }
  };

  /* ── Select product (with expiry guard + stock check) ── */
  const selectProduct = (product, index) => {
    if (!product) return;

    // 🔥 EXPIRY BLOCK
    if (isExpired(product)) {
      alert(`🚫 "${product.name}" is EXPIRED (${product.expiry_date})!\nThis product cannot be added to billing.`);
      return;
    }

    const availableStock = Number(product.quantity || 0);
    if (availableStock <= 0) {
      alert(`🚫 "${product.name}" is OUT OF STOCK!\nCannot add to billing.`);
      return;
    }

    const updated = [...billItems];
    const catGst = Number(product.gst_rate || product.category_gst || 0);
    const price = Number(product.price || 0);
    const quantity = 1;
    const priceType = product.price_type || 'exclusive';

    let total, gstAmt;
    if (priceType === 'inclusive') {
      total = price * quantity;
      const taxable = total / (1 + catGst / 100);
      gstAmt = total - taxable;
    } else {
      const taxable = price * quantity;
      gstAmt = (taxable * catGst) / 100;
      total = taxable + gstAmt;
    }

    updated[index] = {
      ...updated[index],
      id: product.id,
      name: product.name || "",
      price,
      price_type: priceType,
      qty: quantity,
      total: priceType === 'inclusive' ? total - gstAmt : price * quantity, 
      gstRate: catGst,
      gstAmt: gstAmt,
      expiry_date: product.expiry_date || null,
      maxStock: availableStock
    };

    setBillItems(updated);
    setSuggestions([]);
  };

  const addNewRow = () => {
    const newIdx = billItems.length;
    const newRow = emptyRow();
    setBillItems(prev => [...prev, newRow]);
    setTimeout(() => {
      inputRefs.current[`${newIdx}_name`]?.focus();
      // Scroll to bottom of table if needed
      const tableBody = document.getElementById("tally-body");
      if (tableBody) tableBody.scrollTop = tableBody.scrollHeight;
    }, 10);
  };

  const filteredProducts = allProducts;

  const handleKeyDown = (e, index, field) => {
    if (field === "name") {
      if (e.key === "ArrowDown") { 
        e.preventDefault(); 
        setSelectedSugIndex(p => Math.min(p + 1, Math.max(0, suggestions.length - 1))); 
      }
      if (e.key === "ArrowUp") { 
        e.preventDefault(); 
        setSelectedSugIndex(p => Math.max(p - 1, 0)); 
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (suggestions.length > 0 && suggestions[selectedSugIndex]) {
          selectProduct(suggestions[selectedSugIndex], index);
        } else if (billItems[index].id) {
          // If already selected, move to Qty
          inputRefs.current[`${index}_qty`]?.focus();
        } else if (index === billItems.length - 1 && billItems[index].name === "") {
          // Empty row Enter -> Finish
          handleGenerateClick();
        }
      }
    } else if (field === "qty" && e.key === "Enter") {
      e.preventDefault();
      addNewRow();
    } else if (e.key === "Escape") {
      setSuggestions([]);
    }
  };

  const updateQty = (idx, q) => {
    const updated = [...billItems];
    let newQty = parseFloat(q) || 0;
    const item = updated[idx];

    // 🔥 Stock limit enforcement
    const maxStock = item.maxStock || getProductStock(item.id);
    if (newQty > maxStock) {
      newQty = maxStock;
      // Brief visual feedback — we cap at max
    }
    if (newQty < 0) newQty = 0;

    const priceType = item.price_type || 'exclusive';
    const rate = Number(item.gstRate || 0);
    const price = Number(item.price || 0);

    let total, gstAmt, taxable;
    if (priceType === 'inclusive') {
      total = price * newQty;
      taxable = total / (1 + rate / 100);
      gstAmt = total - taxable;
    } else {
      taxable = price * newQty;
      gstAmt = (taxable * rate) / 100;
      total = taxable + gstAmt;
    }

    const cgstRate = rate / 2;
    const sgstRate = rate / 2;
    const cgstAmt = gstAmt / 2;
    const sgstAmt = gstAmt / 2;

    updated[idx] = { 
      ...item, 
      qty: newQty, 
      total: taxable, 
      gstAmt: gstAmt,
      cgstRate,
      sgstRate,
      cgstAmt,
      sgstAmt,
      maxStock: maxStock
    };
    setBillItems(updated);
  };

  const removeRow = (idx) => {
    if (billItems.length === 1 && !billItems[0].id) { setBillItems([emptyRow()]); return; }
    const updated = billItems.filter((_, i) => i !== idx);
    setBillItems(updated.length ? updated : [emptyRow()]);
  };

  const qtyTotal = billItems.reduce((s, i) => s + Number(i.qty || 0), 0);
  const subtotal = billItems.reduce((s, i) => s + Number(i.total || 0), 0);
  const taxTotal = billItems.reduce((s, i) => s + Number(i.gstAmt || 0), 0);
  const totalCGST = billItems.reduce((s, i) => s + Number(i.cgstAmt || 0), 0);
  const totalSGST = billItems.reduce((s, i) => s + Number(i.sgstAmt || 0), 0);
  const grandTotal = Number(subtotal + taxTotal).toFixed(2);

  const handlePhoneChange = async (e) => {
    const p = e.target.value;
    setCustomer(prev => ({ ...prev, phone: p }));
    if (p.length >= 10 && window.api?.searchCustomer) {
      const existing = await window.api.searchCustomer(p);
      if (existing) setCustomer(prev => ({ ...prev, name: existing.name || prev.name, address: existing.address || prev.address }));
    }
  };

  const handleGenerateClick = () => {
    const invalidItems = billItems.filter(i => i.name.trim() !== "" && !i.id);
    if (invalidItems.length > 0) {
      alert("Please add a valid product. Unregistered products cannot be billed.");
      return;
    }

    const validItems = billItems.filter(i => i.qty > 0 && i.id);
    if (validItems.length === 0) { alert("Please add at least one item before generating a bill."); return; }
    setAmountReceived("");
    setPaymentMode("Cash");
    setCheckoutStep(1);
    setShowInvoice(true);
  };

  const finalizeInvoice = async () => {
    const validItems = billItems.filter(i => i.qty > 0 && i.id);
    if (validItems.length === 0) return;
    if (paymentMode === "Cash" && Math.round(Number(amountReceived) * 100) < Math.round(Number(grandTotal) * 100)) {
      alert(`Insufficient Cash! Need ₹${(Number(grandTotal) - Number(amountReceived)).toFixed(2)} more.`);
      return;
    }
    if (window.api?.createInvoice) {
      const res = await window.api.createInvoice({ cart: validItems, customer, paymentMode });
      setLastInvoiceId(res.billNo); // Use billNo instead of autoincrement ID for display
      setInvoiceSuccess(true);
      if (customer?.phone?.length >= 10 && window.api.sendWhatsapp) {
        window.api.sendWhatsapp(customer.phone, `Thanks for shopping at ${settings.storeName}! Your bill total is ₹${grandTotal}. Have a great day! 🛍️`);
      }
    }
  };

  const closeSuccess = () => {
    setBillItems([emptyRow()]);
    setCustomer({ name: "", phone: "", address: "" });
    setShowInvoice(false);
    setTimeout(() => setInvoiceSuccess(false), 300);
  };

  /* ════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════ */
  if (!terminalActive) {
    return (
      <div style={{
        height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", background: "var(--bg)",
        gap: 40, padding: 40
      }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: "var(--text-1)", marginBottom: 10 }}>Select Billing Terminal</h1>
          <p style={{ color: "var(--text-3)", fontSize: 16 }}>Choose your preferred method to start billing</p>
        </div>
        
        <div style={{ display: "flex", gap: 30, width: "100%", maxWidth: 900 }}>
          {/* PHOTO METHOD */}
          <div 
            onClick={() => startTerminal('photo')}
            style={{
              flex: 1, background: "white", borderRadius: 24, padding: 40,
              border: "2px solid var(--border)", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center",
              transition: "transform 0.2s, border-color 0.2s",
              boxShadow: "0 10px 40px rgba(0,0,0,0.05)"
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.transform = "translateY(-5px)"; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "none"; }}
          >
            <div style={{ fontSize: 60, marginBottom: 20 }}>📸</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: "var(--text-1)" }}>Photo Method</h2>
            <p style={{ textAlign: "center", color: "var(--text-4)", fontSize: 14, marginTop: 10 }}>
              Visual grid selection. Best for touchscreens and quick identification of items.
            </p>
          </div>

          {/* TALLY METHOD */}
          <div 
            onClick={() => startTerminal('tally')}
            style={{
              flex: 1, background: "white", borderRadius: 24, padding: 40,
              border: "2px solid var(--border)", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center",
              transition: "transform 0.2s, border-color 0.2s",
              boxShadow: "0 10px 40px rgba(0,0,0,0.05)"
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = "#10b981"; e.currentTarget.style.transform = "translateY(-5px)"; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "none"; }}
          >
            <div style={{ fontSize: 60, marginBottom: 20 }}>⌨️</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: "var(--text-1)" }}>Tally Method</h2>
            <p style={{ textAlign: "center", color: "var(--text-4)", fontSize: 14, marginTop: 10 }}>
              Keyboard-first list interface. Best for barcodes and rapid bulk entry.
            </p>
          </div>
        </div>
        
        <div style={{ fontSize: 12, color: "var(--text-4)", marginTop: 20 }}>
          Terminal will automatically enter Full-Screen mode after selection.
        </div>
      </div>
    );
  }

  return (
    <div className="pos-container" style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 1000, background: "var(--bg)" }}>

      {/* ── HELD BILLS PANEL ─── */}
      {showHeldBills && (
        <HeldBillsPanel
          onResume={resumeBill}
          onClose={() => { setShowHeldBills(false); refreshHeldCount(); }}
        />
      )}

      {/* ── CHECKOUT MODAL ───── */}
      {showInvoice && (
        <div className="modal-overlay" style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: invoiceSuccess ? "white" : "rgba(15, 23, 42, 0.6)",
          zIndex: 1000,
          display: invoiceSuccess ? "block" : "flex",
          justifyContent: "center", alignItems: "center",
          overflowY: "auto"
        }}>
          {!invoiceSuccess ? (
            <div className="modal-content" style={{
              background: "white", padding: "30px", borderRadius: "12px",
              width: "650px", maxHeight: "90vh", overflowY: "auto",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)"
            }}>
              {checkoutStep === 1 && (
                <>
                  <h2 style={{ marginTop: 0, marginBottom: "20px", color: "#0f172a" }}>1. Customer & Order Summary</h2>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginBottom: "20px" }}>
                    <div className="form-group">
                      <label className="form-label">Phone Number (Auto Search)</label>
                      <input className="form-input" placeholder="e.g. 9876543210" value={customer.phone} onChange={handlePhoneChange} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Customer Name</label>
                      <input className="form-input" placeholder="e.g. John Doe" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                      <label className="form-label">Address</label>
                      <input className="form-input" placeholder="e.g. 1st street, city..." value={customer.address} onChange={e => setCustomer({ ...customer, address: e.target.value })} />
                    </div>
                  </div>

                  <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px", fontSize: "0.9rem", color: "#475569" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left", color: "#1e293b" }}>
                        <th style={{ padding: "8px 0" }}>Item</th>
                        <th style={{ padding: "8px 0", textAlign: "center" }}>Qty</th>
                        <th style={{ padding: "8px 0", textAlign: "right" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billItems.filter(i => i.qty > 0 && i.id).map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "10px 0", fontWeight: "500" }}>
                            {item.name} <br />
                            <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                              ₹{item.price} ({item.price_type}) + {item.gstRate}% GST
                            </span>
                          </td>
                          <td style={{ padding: "10px 0", textAlign: "center" }}>{item.qty}</td>
                          <td style={{ padding: "10px 0", textAlign: "right", fontWeight: "bold", color: "#0f172a" }}>₹{(item.total + item.gstAmt).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "20px", borderTop: "2px solid #e2e8f0", paddingTop: "15px" }}>
                    <div style={{ color: "#64748b", fontSize: "0.85rem" }}>
                      Subtotal: ₹{subtotal.toFixed(2)}<br/>
                      CGST (Total): ₹{totalCGST.toFixed(2)}<br/>
                      SGST (Total): ₹{totalSGST.toFixed(2)}
                    </div>
                    <div style={{ textAlign: "right", fontSize: "1.4rem", fontWeight: "800", color: "var(--primary)" }}>
                      Payable: ₹{grandTotal}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: "15px" }}>
                    <button onClick={() => setShowInvoice(false)} className="btn-outline">Cancel</button>
                    <button onClick={() => setCheckoutStep(2)} className="btn-primary">Continue to Payment ➔</button>
                  </div>
                </>
              )}

              {checkoutStep === 2 && (
                <>
                  <h2 style={{ marginTop: 0, marginBottom: "20px", color: "#0f172a" }}>2. Payment Verification</h2>
                  <div style={{ textAlign: "center", marginBottom: "25px" }}>
                    <div style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#0f172a" }}>₹{grandTotal}</div>
                    <div style={{ color: "#64748b", fontSize: "0.9rem" }}>Net Payable Amount</div>
                  </div>

                  <div style={{ border: "1px solid #e2e8f0", padding: "20px", borderRadius: "8px", marginBottom: "25px" }}>
                    <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: "bold" }}>
                        <input type="radio" checked={paymentMode === "Cash"} onChange={() => setPaymentMode("Cash")} /> 💵 Cash
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: "bold" }}>
                        <input type="radio" checked={paymentMode === "UPI"} onChange={() => setPaymentMode("UPI")} /> 📱 UPI (GPay/PhonePe)
                      </label>
                    </div>

                    {paymentMode === "Cash" && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "15px" }}>
                        <div>
                          <label className="form-label">Amount Given By Customer (₹)</label>
                          <input type="text" inputMode="decimal" className="form-input" style={{ fontSize: "1.2rem", padding: "12px" }}
                            value={amountReceived} onChange={e => setAmountReceived(e.target.value.replace(/[^0-9.]/g, ''))} placeholder={`₹ ${grandTotal}`} />
                        </div>
                        {amountReceived && Number(amountReceived) >= Number(grandTotal) && (
                          <div style={{ padding: "15px", backgroundColor: "#ecfdf5", borderRadius: "6px", fontSize: "1.2rem", color: "#059669", textAlign: "center", fontWeight: "bold" }}>
                            Give Change: ₹{(Number(amountReceived) - Number(grandTotal)).toFixed(2)}
                          </div>
                        )}
                      </div>
                    )}

                    {paymentMode === "UPI" && (
                      <div style={{ display: "flex", alignItems: "center", gap: "20px", backgroundColor: "#f8fafc", padding: "20px", borderRadius: "8px" }}>
                        <div style={{ width: "80px", height: "80px", background: "#e2e8f0", display: "flex", justifyContent: "center", alignItems: "center", borderRadius: "8px" }}>
                          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                            <rect x="7" y="7" width="3" height="3"></rect>
                            <rect x="14" y="7" width="3" height="3"></rect>
                            <rect x="7" y="14" width="3" height="3"></rect>
                            <rect x="14" y="14" width="3" height="3"></rect>
                          </svg>
                        </div>
                        <div>
                          <div style={{ fontWeight: "bold", color: "#0f172a", fontSize: "1.1rem" }}>Scan Shop QR</div>
                          <div style={{ fontSize: "0.9rem", color: "#64748b", marginTop: "5px" }}>
                            Validate the exact payment of <b>₹{grandTotal}</b> on your phone before confirming this bill.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: "15px" }}>
                    <button onClick={() => setCheckoutStep(1)} className="btn-outline">Back</button>
                    <button onClick={finalizeInvoice} className="btn-primary" style={{ flex: 1, fontSize: "1.05rem" }}>
                      Complete Payment ✓
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* ── PRINTABLE INVOICE ─ */
            <div className="printable-invoice" style={{ background: "white", maxWidth: "800px", margin: "40px auto", padding: "40px", boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #333", paddingBottom: "20px", marginBottom: "30px" }}>
                <div>
                  <h1 style={{ margin: "0 0 5px 0", fontSize: "2.5rem", fontFamily: "Inter, sans-serif" }}>
                    <span style={{ color: "#111", letterSpacing: "-1px", textTransform: "uppercase" }}>{settings.storeName || "iVA BILLING"}</span>
                  </h1>
                  <div style={{ color: "#555", fontSize: "0.9rem" }}>{settings.storeAddress}</div>
                  <div style={{ color: "#555", fontSize: "0.9rem" }}>Phone: {settings.storePhone}</div>
                  {settings.gstNumber && <div style={{ color: "#555", fontSize: "0.9rem", fontWeight: "bold", marginTop: 5 }}>GSTIN: {settings.gstNumber}</div>}
                </div>
                <div style={{ textAlign: "right" }}>
                  <h2 style={{ margin: "0 0 10px 0", color: "#333", letterSpacing: "2px" }}>TAX INVOICE</h2>
                  <div><strong>Bill No:</strong> #{lastInvoiceId}</div>
                  <div><strong>Date:</strong> {new Date().toLocaleDateString()}</div>
                  <div><strong>Time:</strong> {new Date().toLocaleTimeString()}</div>
                </div>
              </div>

              <div style={{ marginBottom: "30px" }}>
                <strong>Bill To:</strong><br />
                {customer.name ? (
                  <><div>{customer.name}</div><div>{customer.phone}</div><div>{customer.address}</div></>
                ) : (
                  <div>Walk-in Customer</div>
                )}
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "30px", border: "1px solid #333" }}>
                <thead>
                  <tr style={{ backgroundColor: "#e6f0fa", borderBottom: "1px solid #333" }}>
                    <th style={{ padding: "12px", textAlign: "left", borderRight: "1px solid #333" }}>Item Description</th>
                    <th style={{ padding: "12px", textAlign: "center", borderRight: "1px solid #333" }}>Qty</th>
                    <th style={{ padding: "12px", textAlign: "right", borderRight: "1px solid #333" }}>Rate</th>
                    <th style={{ padding: "12px", textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {billItems.filter(i => i.qty > 0 && i.id).map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #ccc" }}>
                      <td style={{ padding: "12px", borderRight: "1px solid #333" }}>
                        {item.name}
                        <div style={{ fontSize: "0.8rem", color: "#666", marginTop: "4px" }}>+ {item.gstRate}% GST (₹{item.gstAmt.toFixed(2)})</div>
                      </td>
                      <td style={{ padding: "12px", textAlign: "center", borderRight: "1px solid #333" }}>{item.qty}</td>
                      <td style={{ padding: "12px", textAlign: "right", borderRight: "1px solid #333" }}>₹{item.price.toFixed(2)}</td>
                      <td style={{ padding: "12px", textAlign: "right" }}>₹{(item.total + item.gstAmt).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: "flex", justifyContent: "space-between", gap: "40px" }}>
                {/* GST BREAKDOWN TABLE */}
                <div style={{ flex: 1 }}>
                   <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", border: "1px solid #ddd" }}>
                      <thead>
                         <tr style={{ background: "#f8fafc", borderBottom: "1px solid #ddd" }}>
                            <th style={{ padding: "5px", textAlign: "left" }}>GST %</th>
                            <th style={{ padding: "5px", textAlign: "right" }}>Taxable</th>
                            <th style={{ padding: "5px", textAlign: "right" }}>CGST</th>
                            <th style={{ padding: "5px", textAlign: "right" }}>SGST</th>
                         </tr>
                      </thead>
                      <tbody>
                         {[0, 5, 12, 18, 28].map(rate => {
                            const items = billItems.filter(i => i.qty > 0 && Number(i.gstRate) === rate);
                            if (items.length === 0) return null;
                            const tax = items.reduce((s, i) => s + i.gstAmt, 0);
                            const base = items.reduce((s, i) => s + i.total, 0);
                            return (
                               <tr key={rate} style={{ borderBottom: "1px solid #eee" }}>
                                  <td style={{ padding: "5px" }}>{rate}%</td>
                                  <td style={{ padding: "5px", textAlign: "right" }}>₹{base.toFixed(2)}</td>
                                  <td style={{ padding: "5px", textAlign: "right" }}>₹{(tax / 2).toFixed(2)}</td>
                                  <td style={{ padding: "5px", textAlign: "right" }}>₹{(tax / 2).toFixed(2)}</td>
                               </tr>
                            );
                         })}
                      </tbody>
                   </table>
                </div>

                <div style={{ width: "250px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #eee", fontSize: "0.9rem" }}>
                    <span>Total Taxable:</span><span>₹{subtotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #eee", fontSize: "0.9rem" }}>
                    <span>Total CGST:</span><span>₹{totalCGST.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #333", fontSize: "0.9rem" }}>
                    <span>Total SGST:</span><span>₹{totalSGST.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", fontWeight: "900", fontSize: "1.4rem", color: "#000" }}>
                    <span>TOTAL:</span><span>₹{grandTotal}</span>
                  </div>
                  <div style={{ fontSize: "0.8rem", textAlign: "right", color: "#666", marginTop: -5 }}>{paymentMode} Payment</div>
                </div>
              </div>

              <div style={{ marginTop: "50px", textAlign: "center", color: "#666", fontSize: "0.9rem", borderTop: "1px solid #ccc", paddingTop: "20px" }}>
                Returns are accepted within 30 days of the purchase date.<br />
                Thank You for your business!
              </div>

              <div className="no-print" style={{ marginTop: "40px", display: "flex", justifyContent: "center", gap: "20px" }}>
                <button onClick={() => window.print()} style={{ padding: "12px 25px", background: "#333", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", fontSize: "1rem" }}>🖨️ PRINT INVOICE</button>
                <button onClick={closeSuccess} style={{ padding: "12px 25px", background: "#0284c7", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold", fontSize: "1rem" }}>CLOSE & START NEW</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MAIN LAYOUT ─── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", height: "100%", background: "var(--bg)" }}>
        
        {/* LEFT PANEL: PRODUCTS SELECTION */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px", overflow: "hidden" }}>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{billingMode === 'photo' ? '🖼️ Photo Billing' : '⌨️ Tally Billing'}</h2>
              <div style={{ fontSize: 12, color: "var(--text-4)" }}>Terminal Active · Full Screen Mode</div>
            </div>
            <button onClick={() => { setTerminalActive(false); if(document.exitFullscreen) document.exitFullscreen(); }} className="btn-outline" style={{ padding: "6px 12px", fontSize: 11 }}>Exit Terminal</button>
          </div>

          {billingMode === 'photo' ? (
            /* PHOTO GRID */
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "20px", overflowY: "auto", paddingBottom: "30px", alignContent: "flex-start" }}>
              {filteredProducts.map(p => {
              const isOutOfStock = Number(p.quantity || 0) <= 0;
              const isLowStock = !isOutOfStock && Number(p.quantity || 0) <= 5;
              const isDisabled = isExpired(p) || isOutOfStock;
              return (
                <div 
                  key={p.id} 
                  style={{
                    background: "white",
                    borderRadius: "var(--r-lg)",
                    border: `1px solid ${isOutOfStock ? '#ef444440' : isLowStock ? '#f59e0b40' : 'var(--border)'}`,
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "var(--shadow-sm)",
                    opacity: isDisabled ? 0.5 : 1,
                    transition: "all 0.2s ease"
                  }}
                >
                  <div style={{ height: "140px", background: "#f8fafc", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid var(--border)" }}>
                    {p.image ? (
                      <img src={p.image} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ fontSize: "40px", color: "#cbd5e1" }}>🛍️</div>
                    )}
                    {isExpired(p) && (
                      <div style={{ position: "absolute", top: 10, right: 10, background: "#ef4444", color: "white", fontSize: "10px", fontWeight: "bold", padding: "2px 6px", borderRadius: "10px" }}>
                        EXPIRED
                      </div>
                    )}
                    {isOutOfStock && !isExpired(p) && (
                      <div style={{ position: "absolute", top: 10, right: 10, background: "#ef4444", color: "white", fontSize: "10px", fontWeight: "bold", padding: "2px 6px", borderRadius: "10px" }}>
                        OUT OF STOCK
                      </div>
                    )}
                    {isLowStock && (
                      <div style={{ position: "absolute", top: 10, right: 10, background: "#f59e0b", color: "white", fontSize: "10px", fontWeight: "bold", padding: "2px 6px", borderRadius: "10px" }}>
                        LOW STOCK
                      </div>
                    )}
                  </div>
                  <div style={{ padding: "15px", display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: "600", fontSize: "14px", color: "var(--text-1)", marginBottom: "4px", lineHeight: "1.3" }}>{p.name}</div>
                      <div style={{ fontSize: "11px", color: isOutOfStock ? '#ef4444' : isLowStock ? '#f59e0b' : 'var(--text-3)', fontWeight: isOutOfStock || isLowStock ? 600 : 400, marginBottom: "10px" }}>
                        Stock: {p.quantity} {p.unit}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontWeight: "700", color: "var(--primary)", fontSize: "15px" }}>₹{p.price}</div>
                      <button 
                        onClick={() => addProductToCart(p)}
                        disabled={isDisabled}
                        style={{
                          background: isDisabled ? '#94a3b8' : 'var(--primary)', color: "white", border: "none",
                          width: "32px", height: "32px", borderRadius: "50%",
                          fontSize: "20px", display: "flex", alignItems: "center", justifyContent: "center", 
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >+</button>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          ) : (
            /* TALLY LIST VIEW */
            /* ── TALLY TERMINAL VIEW ── */
            <div className="pos-container" style={{ flex: 1, display: "flex", flexDirection: "column", background: "white", borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden", position: "relative" }}>
              

              {/* Tally Table Header */}
              <div className="pos-table-header">
                <div>S.NO</div>
                <div>DESCRIPTION</div>
                <div>RATE (₹)</div>
                <div>QTY</div>
                <div>GST %</div>
                <div>GST (₹)</div>
                <div>AMOUNT (₹)</div>
              </div>

              {/* Tally Table Body */}
              <div id="tally-body" style={{ flex: 1, overflowY: "auto", position: "relative" }}>
                {billItems.map((item, idx) => (
                  <div 
                    key={item.tempId || idx} 
                    className="pos-row" 
                    style={{ background: currentRow === idx ? "rgba(37, 99, 235, 0.05)" : "transparent" }}
                  >
                    <div className="pos-cell" style={{ color: "var(--text-4)", fontSize: 11 }}>{idx + 1}</div>
                    
                    {/* Description / Search Cell */}
                    <div className="pos-cell" style={{ position: "relative" }}>
                      <input 
                        ref={el => inputRefs.current[`${idx}_name`] = el}
                        className="pos-input"
                        style={{ textAlign: "left", fontWeight: item.id ? 700 : 400 }}
                        placeholder="Type to search..."
                        value={item.name}
                        onChange={(e) => handleInputChange(idx, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, idx, "name")}
                        onFocus={() => setCurrentRow(idx)}
                      />
                      
                      {/* Tally-style Suggestion Box */}
                      {suggestions.length > 0 && currentRow === idx && (
                        <div className="tally-suggestions" style={{ left: 0, width: "100%", minWidth: 400 }}>
                          <div style={{ padding: "6px 12px", background: "var(--surface-3)", fontSize: 10, fontWeight: 800, color: "var(--text-4)", borderBottom: "1px solid var(--border)", letterSpacing: 1 }}>LIST OF STOCK ITEMS</div>
                          {suggestions.map((s, sIdx) => (
                            <div 
                              key={s.id}
                              className={`tally-suggestion-item ${sIdx === selectedSugIndex ? 'selected' : ''}`}
                              onClick={() => selectProduct(s, idx)}
                            >
                              <span>{s.name} <small style={{ marginLeft: 8, opacity: 0.6 }}>({s.product_code || 'N/A'})</small></span>
                              <span>₹{s.price} | Stock: {s.quantity}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pos-cell" style={{ color: "var(--text-3)" }}>{item.price ? `₹${item.price}` : ""}</div>
                    
                    <div className="pos-cell">
                      {item.id ? (
                        <div className="qty-stepper">
                          <button 
                            className="qty-btn qty-minus"
                            onClick={() => updateQty(idx, (item.qty || 0) - 1)}
                            disabled={!item.qty || item.qty <= 0}
                          >–</button>
                          <span className="qty-display">{item.qty || 0}</span>
                          <button 
                            className="qty-btn qty-plus"
                            onClick={() => updateQty(idx, (item.qty || 0) + 1)}
                            disabled={item.qty >= (item.maxStock || getProductStock(item.id))}
                          >+</button>
                          {item.id && <span className="qty-stock-hint">/{item.maxStock || getProductStock(item.id)}</span>}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-4)', fontSize: 12 }}>—</span>
                      )}
                    </div>

                    <div className="pos-cell" style={{ color: "var(--text-4)" }}>{item.id ? `${item.gstRate}%` : "0"}</div>
                    <div className="pos-cell" style={{ color: "var(--text-3)" }}>{item.gstAmt ? item.gstAmt.toFixed(2) : "0.00"}</div>
                    <div className="pos-cell" style={{ fontWeight: 800, color: "var(--text-1)" }}>{item.total ? (item.total + item.gstAmt).toFixed(2) : "0.00"}</div>
                  </div>
                ))}
                
                {/* Empty spacer for visual balance */}
                <div style={{ height: 100 }}></div>
              </div>

              {/* Tally Terminal Footer (The Dark Status Bar) */}
              <div className="pos-footer">
                 <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 20 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }}></div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Cloud Secured</span>
                 </div>

                 <div className="pos-footer-col">
                    <span className="footer-label">Total Qty</span>
                    <span className="footer-val">{qtyTotal}</span>
                 </div>

                 <div className="pos-footer-col">
                    <span className="footer-label">Taxable Amt</span>
                    <span className="footer-val">₹{subtotal.toFixed(2)}</span>
                 </div>

                 <div className="pos-footer-col">
                    <span className="footer-label">Total GST</span>
                    <span className="footer-val">₹{taxTotal.toFixed(2)}</span>
                 </div>

                 <div className="pos-footer-col">
                    <span className="footer-label">Net Payable</span>
                    <span className="footer-val" style={{ color: "#3b82f6", fontSize: 20 }}>₹{grandTotal}</span>
                 </div>

                 <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                    <button onClick={holdBill} className="btn-outline" style={{ background: "transparent", border: "1px solid #f59e0b", color: "#f59e0b", padding: "0 20px" }}>⏸ Hold</button>
                    <button onClick={() => setShowHeldBills(true)} className="btn-outline" style={{ background: "#4f46e520", border: "1px solid #4f46e540", color: "#c7d2fe", padding: "0 20px" }}>▶ Resume</button>
                    <button onClick={handleGenerateClick} className="btn-invoice" style={{ height: 42, background: "#2563eb", borderRadius: 8 }}>GENERATE BILL</button>
                 </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL: CART (Only visible in Photo mode) */}
        {billingMode === 'photo' && (
          <div style={{ width: "400px", background: "white", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", boxShadow: "-4px 0 15px rgba(0,0,0,0.03)" }}>
            
            <div style={{ padding: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)" }}>
               <div style={{ fontWeight: "700", fontSize: "16px", color: "var(--text-1)" }}>Current Bill</div>
               <div style={{ background: "var(--primary-light)", color: "var(--primary)", padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "600" }}>{qtyTotal} Items</div>
            </div>

            {/* Cart Items List */}
            <div style={{ flex: 1, overflowY: "auto", padding: "15px", display: "flex", flexDirection: "column", gap: "15px" }}>
              {billItems.filter(i => i.id).map((item, idx) => {
                const stock = item.maxStock || getProductStock(item.id);
                const atMax = item.qty >= stock;
                return (
                <div key={item.tempId} style={{ display: "flex", gap: "12px", background: "var(--surface-2)", padding: "10px", borderRadius: "var(--r-md)" }}>
                  <div style={{ width: "50px", height: "50px", borderRadius: "6px", overflow: "hidden", background: "var(--border)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                     {item.image ? (
                        <img src={item.image} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                     ) : (
                        <span style={{ fontSize: "20px", color: "white" }}>🛍️</span>
                     )}
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                     <div style={{ fontWeight: "600", fontSize: "13.5px", color: "var(--text-1)", lineHeight: "1.2" }}>{item.name}</div>
                     <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                           <span style={{ fontSize: "12px", color: "var(--text-3)" }}>₹{item.price}</span>
                           <div className="cart-qty-stepper">
                             <button
                               className="cart-qty-btn"
                               onClick={() => updateQty(idx, (item.qty || 0) - 1)}
                               disabled={!item.qty || item.qty <= 0}
                             >–</button>
                             <span className="cart-qty-val">{item.qty}</span>
                             <button
                               className="cart-qty-btn"
                               onClick={() => updateQty(idx, (item.qty || 0) + 1)}
                               disabled={atMax}
                               title={atMax ? `Max stock: ${stock}` : ''}
                             >+</button>
                           </div>
                        </div>
                        <div style={{ fontWeight: "700", fontSize: "13px", color: "var(--text-1)" }}>₹{(item.total + item.gstAmt).toFixed(2)}</div>
                     </div>
                     {atMax && <div style={{ fontSize: "10px", color: "#f59e0b", fontWeight: 600, marginTop: 2 }}>⚠ Max stock ({stock})</div>}
                  </div>
                  <button 
                    onClick={() => removeRow(idx)}
                    style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#ef444415", color: "#ef4444", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "center", fontSize: "14px" }}
                  >×</button>
                </div>
              );
              })}
              {billItems.filter(i => i.id).length === 0 && (
                <div style={{ textAlign: "center", color: "var(--text-4)", marginTop: "40px", fontSize: "14px" }}>
                   <div style={{ fontSize: "40px", marginBottom: "10px" }}>🛒</div>
                   Cart is empty.<br/>Add products from the left.
                </div>
              )}
            </div>

            {/* Cart Footer */}
            <div style={{ background: "#f8fafc", borderTop: "1px solid var(--border)", padding: "20px" }}>
               <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px", color: "var(--text-3)" }}>
                 <span>Taxable Amount</span>
                 <span>₹{subtotal.toFixed(2)}</span>
               </div>
               <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px", fontSize: "13px", color: "var(--text-3)" }}>
                 <span>Total GST</span>
                 <span>₹{taxTotal.toFixed(2)}</span>
               </div>
               <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px", fontSize: "18px", fontWeight: "800", color: "var(--text-1)" }}>
                 <span>Net Payable</span>
                 <span style={{ color: "var(--primary)" }}>₹{grandTotal}</span>
               </div>

               <div style={{ display: "flex", gap: "10px" }}>
                 <button 
                   onClick={holdBill}
                   style={{ flex: 1, padding: "12px", background: "white", border: "1px solid #f59e0b", color: "#f59e0b", borderRadius: "var(--r-md)", fontWeight: "700", cursor: "pointer" }}
                 >⏸️ Hold</button>
                 <button 
                   onClick={() => setShowHeldBills(true)}
                   style={{ flex: 1, position: "relative", padding: "12px", background: "white", border: "1px solid #7c3aed", color: "#7c3aed", borderRadius: "var(--r-md)", fontWeight: "700", cursor: "pointer" }}
                 >
                   ▶ Resume
                   {heldCount > 0 && <span style={{ position: "absolute", top: "-5px", right: "-5px", background: "#ef4444", color: "white", borderRadius: "50%", padding: "2px 6px", fontSize: "10px" }}>{heldCount}</span>}
                 </button>
               </div>
               <button 
                 onClick={handleGenerateClick}
                 style={{ width: "100%", marginTop: "15px", padding: "15px", background: "var(--primary)", color: "white", border: "none", borderRadius: "var(--r-md)", fontWeight: "700", fontSize: "16px", cursor: "pointer", boxShadow: "0 4px 12px rgba(0, 82, 204, 0.25)" }}
               >NEXT ➔</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default POS;