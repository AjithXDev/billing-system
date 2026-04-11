import React, { useState, useEffect, useRef } from "react";

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
  const [settings, setSettings] = useState({ storeName: "iVA BILLING", storeAddress: "123 Business Road...", storePhone: "+91 90000 00000" });
  const [syncPending, setSyncPending] = useState(0);
  const inputRefs = useRef([]);

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
    inputRefs.current[0]?.focus();

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

  /* ── Select product (with expiry guard) ── */
  const selectProduct = (product, index) => {
    if (!product) return;

    // 🔥 EXPIRY BLOCK
    if (isExpired(product)) {
      alert(`🚫 "${product.name}" is EXPIRED (${product.expiry_date})!\nThis product cannot be added to billing.`);
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
      expiry_date: product.expiry_date || null
    };

    setBillItems(updated);
    setSuggestions([]);
    setTimeout(() => inputRefs.current[index + "_qty"]?.focus(), 10);
  };

  const addNewRow = () => {
    const newRow = emptyRow();
    setBillItems(prev => [...prev, newRow]);
    setTimeout(() => inputRefs.current[billItems.length]?.focus(), 10);
  };

  const handleKeyDown = (e, index, field) => {
    if (field === "name") {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedSugIndex(p => Math.min(p + 1, Math.max(0, suggestions.length - 1))); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedSugIndex(p => Math.max(p - 1, 0)); }
      if (e.key === "Enter") {
        if (suggestions.length > 0 && suggestions[selectedSugIndex]) {
          selectProduct(suggestions[selectedSugIndex], index);
        } else {
          addNewRow();
        }
      }
    } else if (field === "qty" && e.key === "Enter") {
      addNewRow();
    }
  };

  const updateQty = (idx, q) => {
    const updated = [...billItems];
    const newQty = parseFloat(q) || 0;
    const item = updated[idx];
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

    updated[idx] = { 
      ...item, 
      qty: newQty, 
      total: taxable, 
      gstAmt: gstAmt 
    };
    setBillItems(updated);
  };

  const removeRow = (idx) => {
    if (billItems.length === 1) { setBillItems([emptyRow()]); return; }
    setBillItems(billItems.filter((_, i) => i !== idx));
  };

  const qtyTotal = billItems.reduce((s, i) => s + Number(i.qty || 0), 0);
  const subtotal = billItems.reduce((s, i) => s + Number(i.total || 0), 0);
  const taxTotal = billItems.reduce((s, i) => s + Number(i.gstAmt || 0), 0);
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
  return (
    <div className="pos-container" style={{ position: "relative" }}>

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

                  <div style={{ textAlign: "right", fontSize: "1.25rem", fontWeight: "600", marginBottom: "25px", color: "hsl(var(--foreground))" }}>
                    Net Payable: <span>₹{grandTotal}</span>
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
                  <div style={{ color: "#555" }}>{settings.storeAddress}</div>
                  <div style={{ color: "#555" }}>Phone: {settings.storePhone}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <h2 style={{ margin: "0 0 10px 0", color: "#333" }}>INVOICE</h2>
                  <div><strong>Bill No:</strong> #{lastInvoiceId}</div>
                  <div><strong>Date:</strong> {new Date().toLocaleDateString()}</div>
                  <div><strong>Payment Via:</strong> {paymentMode}</div>
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

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ width: "300px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #eee" }}>
                    <span>Subtotal:</span><span>₹{subtotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #333" }}>
                    <span>Total GST:</span><span>₹{taxTotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", fontWeight: "bold", fontSize: "1.2rem" }}>
                    <span>NET PAYABLE:</span><span>₹{grandTotal}</span>
                  </div>
                  {paymentMode === "Cash" && amountReceived && (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", color: "#555" }}>
                      <span>Cash Tendered:</span><span>₹{Number(amountReceived).toFixed(2)}</span>
                    </div>
                  )}
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

      {/* ── COLUMN HEADERS ─── */}
      <div className="pos-table-header">
        <div>S.NO</div>
        <div style={{ textAlign: "left", paddingLeft: "15px" }}>DESCRIPTION</div>
        <div>RATE (₹)</div>
        <div>QTY</div>
        <div>GST %</div>
        <div>GST (₹)</div>
        <div>AMOUNT (₹)</div>
      </div>

      {/* ── ITEM ROWS ────────── */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: "100px" }}>
        {billItems.map((item, idx) => (
          <div key={item.tempId} className="pos-row" style={{ position: "relative", zIndex: currentRow === idx ? 100 : 1 }}>
            <div className="pos-cell" style={{ justifyContent: "center" }}>
              {idx + 1}
            </div>

            <div className="pos-cell" style={{ position: "relative" }}>
              <input
                className="pos-input"
                ref={el => (inputRefs.current[idx] = el)}
                value={item.name}
                onFocus={() => setCurrentRow(idx)}
                onChange={e => handleInputChange(idx, e.target.value)}
                onKeyDown={e => handleKeyDown(e, idx, "name")}
                placeholder="Type to search..."
              />

              {/* Expiry warning badge on row */}
              {item.expiry_date && item.expiry_date >= todayStr() && (
                <span style={{
                  position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                  background: "#fef3c7", color: "#d97706",
                  border: "1px solid #fde68a",
                  borderRadius: 20, fontSize: 9.5, fontWeight: 700,
                  padding: "1px 6px", pointerEvents: "none"
                }}>
                  EXP {item.expiry_date}
                </span>
              )}

              {suggestions.length > 0 && idx === currentRow && (
                <div className="tally-suggestions">
                  {suggestions.map((p, sIdx) => (
                    <div
                      key={p.id}
                      className={`tally-suggestion-item ${sIdx === selectedSugIndex ? "selected" : ""}`}
                      onClick={() => selectProduct(p, idx)}
                      style={isExpired(p) ? { opacity: 0.5, pointerEvents: "none" } : {}}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px' }}>
                          {p.product_code && <span style={{ color: 'var(--primary)', marginRight: 6 }}>[{p.product_code}]</span>}
                          {p.name}
                          {isExpired(p) && <span style={{ fontSize: 10, color: "#ef4444", marginLeft: 5 }}>[EXPIRED]</span>}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                          ₹{p.price} • Stock: {p.quantity} {p.unit}
                        </span>
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--primary)' }}>₹{p.price}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pos-cell" style={{ background: '#f8fafc', color: '#64748b' }}>
              ₹{item.price || "0"}
            </div>

            <div className="pos-cell">
              <input
                className="pos-input"
                ref={el => (inputRefs.current[idx + "_qty"] = el)}
                value={item.qty || ""}
                onChange={e => updateQty(idx, e.target.value)}
                onKeyDown={e => handleKeyDown(e, idx, "qty")}
              />
            </div>

            <div className="pos-cell">{item.gstRate}</div>
            <div className="pos-cell">{Number(item.gstAmt || 0).toFixed(2)}</div>
            <div className="pos-cell" style={{ position: "relative" }}>
              {Number((item.total || 0) + (item.gstAmt || 0)).toFixed(2)}
              {idx > 0 && (
                <button
                  onClick={() => removeRow(idx)}
                  style={{
                    position: "absolute", right: 4,
                    width: 18, height: 18, borderRadius: "50%",
                    border: "none", background: "#ef444430", color: "#ef4444",
                    fontSize: 11, cursor: "pointer", lineHeight: 1,
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}
                >×</button>
              )}
            </div>
          </div>
        ))}
      </div>

      
      {/* ── FOOTER ─── */}
      <div className="pos-footer">
        <div className="pos-footer-col" style={{ width: 140 }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ 
                width: 8, height: 8, borderRadius: '50%', 
                background: syncPending > 0 ? '#f59e0b' : '#10b981',
                boxShadow: syncPending > 0 ? '0 0 8px #f59e0b' : '0 0 8px #10b981'
              }}></div>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)' }}>
                {syncPending > 0 ? `SYNCING (${syncPending})` : 'CLOUD SECURED'}
              </span>
           </div>
        </div>

        <div className="pos-footer-col">
          <span className="footer-label">TOTAL QTY</span>
          <span className="footer-val">{qtyTotal}</span>
        </div>
        <div className="pos-footer-col">
          <span className="footer-label">TAXABLE AMT</span>
          <span className="footer-val">₹{subtotal.toFixed(2)}</span>
        </div>
        <div className="pos-footer-col">
          <span className="footer-label">TOTAL GST</span>
          <span className="footer-val">₹{taxTotal.toFixed(2)}</span>
        </div>
        <div className="pos-footer-col">
          <span className="footer-label">NET PAYABLE</span>
          <span className="footer-val">₹{grandTotal}</span>
        </div>

        {/* HOLD BILL BUTTON */}
        <button
          onClick={holdBill}
          style={{
            marginLeft: "auto",
            padding: "0 20px", height: 42,
            background: "transparent",
            border: "1px solid #f59e0b",
            color: "#f59e0b",
            borderRadius: "var(--r-md)",
            fontSize: 13, fontWeight: 700,
            cursor: "pointer", transition: "all .15s",
            display: "flex", alignItems: "center", gap: 6
          }}
        >
          ⏸️ Hold
        </button>

        {/* RESUME BUTTON with count badge */}
        <button
          onClick={() => setShowHeldBills(true)}
          style={{
            position: "relative",
            padding: "0 20px", height: 42,
            background: "#7c3aed20",
            border: "1px solid #7c3aed",
            color: "#7c3aed",
            borderRadius: "var(--r-md)",
            fontSize: 13, fontWeight: 700,
            cursor: "pointer", transition: "all .15s",
            display: "flex", alignItems: "center", gap: 6
          }}
        >
          ▶ Resume
          {heldCount > 0 && (
            <span style={{
              position: "absolute", top: -6, right: -6,
              background: "#ef4444", color: "#fff",
              borderRadius: "50%", width: 18, height: 18,
              fontSize: 10, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>{heldCount}</span>
          )}
        </button>

        <button className="btn-invoice" onClick={handleGenerateClick}>
          GENERATE BILL
        </button>
      </div>
    </div>
  );
};

export default POS;