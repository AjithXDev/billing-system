import React, { useState, useEffect, useRef } from "react";

const POS = () => {
  // ✅ FIX 1: GST default 0 (not 18)
  const [billItems, setBillItems] = useState([
    { tempId: Date.now(), name: "", price: 0, qty: 0, total: 0, gstRate: 0, gstAmt: 0 }
  ]);

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
  const inputRefs = useRef([]);

  const [allProducts, setAllProducts] = useState([]);
  const [billsReady, setBillsReady] = useState(false);

  useEffect(() => {
    if (window.api && window.api.getProductsFull) {
      window.api.getProductsFull()
        .then((data) => setAllProducts(Array.isArray(data) ? data : []))
        .catch(() => setAllProducts([]));
    }
    inputRefs.current[0]?.focus();
  }, []);

  // 🔍 SEARCH PRODUCTS FAST ON FRONTEND
  const handleInputChange = (index, value) => {
    const safeValue = typeof value === 'string' ? value : "";

    const updated = [...billItems];
    updated[index] = { ...updated[index], name: safeValue };
    setBillItems(updated);

    const matchVal = safeValue.trim().toLowerCase();

    if (matchVal.length > 0) {
      const filtered = (allProducts || []).filter(p => {
        if (!p) return false;
        const pName = p.name ? String(p.name).toLowerCase() : "";
        const pBarcode = p.barcode ? String(p.barcode).trim().toLowerCase() : "";
        return pName.includes(matchVal) || pBarcode === matchVal;
      });

      setSuggestions(filtered);
      setSelectedSugIndex(0);
    } else {
      setSuggestions([]);
    }
  };

  // ✅ SELECT PRODUCT (GST FROM CATEGORY)
  const selectProduct = (product, index) => {
    if (!product) return;
    const updated = [...billItems];
    const catGst = Number(product.category_gst || 0);
    const price = Number(product.price || 0);

    updated[index] = {
      ...updated[index],
      id: product.id,
      name: product.name || "",
      price: price,
      qty: 1,
      total: price,
      gstRate: catGst,
      gstAmt: (price * catGst) / 100
    };

    setBillItems(updated);
    setSuggestions([]);
    setTimeout(() => inputRefs.current[index + "_qty"]?.focus(), 10);
  };

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
        if (suggestions.length > 0 && suggestions[selectedSugIndex]) {
          selectProduct(suggestions[selectedSugIndex], index);
        }
      }
    } else if (field === "qty" && e.key === "Enter") {
      const newRow = {
        tempId: Date.now(),
        name: "",
        price: 0,
        qty: 0,
        total: 0,
        gstRate: 0,
        gstAmt: 0
      };
      setBillItems([...billItems, newRow]);
      setTimeout(() => inputRefs.current[billItems.length]?.focus(), 10);
    }
  };

  // ✅ UPDATE QTY WITH GST
  const updateQty = (idx, q) => {
    const updated = [...billItems];
    const newQty = parseFloat(q) || 0;

    updated[idx] = { ...updated[idx], qty: newQty };
    updated[idx].total = newQty * Number(updated[idx].price || 0);
    updated[idx].gstAmt = (updated[idx].total * Number(updated[idx].gstRate || 0)) / 100;

    setBillItems(updated);
  };

  const qtyTotal = billItems.reduce((s, i) => s + Number(i.qty || 0), 0);
  const subtotal = billItems.reduce((s, i) => s + Number(i.total || 0), 0);
  const taxTotal = billItems.reduce((s, i) => s + Number(i.gstAmt || 0), 0);
  const grandTotal = Number(subtotal + taxTotal).toFixed(2);

  const handlePhoneChange = async (e) => {
    const p = e.target.value;
    setCustomer(prev => ({ ...prev, phone: p }));
    if (p.length >= 10 && window.api && window.api.searchCustomer) {
      const existing = await window.api.searchCustomer(p);
      if (existing) {
        setCustomer(prev => ({ ...prev, name: existing.name || prev.name, address: existing.address || prev.address }));
      }
    }
  };

  const handleGenerateClick = () => {
    const validItems = billItems.filter(i => i.qty > 0 && i.id);
    if (validItems.length === 0) {
      alert("Please add at least one item before generating a bill.");
      return;
    }
    setAmountReceived("");
    setPaymentMode("Cash");
    setCheckoutStep(1);
    setShowInvoice(true);
  };

  const finalizeInvoice = async () => {
    const validItems = billItems.filter(i => i.qty > 0 && i.id);
    if (validItems.length === 0) return;

    if (paymentMode === "Cash" && Number(amountReceived) < Number(grandTotal)) {
      alert(`Insufficient Cash! Need ₹${(Number(grandTotal) - Number(amountReceived)).toFixed(2)} more.`);
      return;
    }

    if (window.api && window.api.createInvoice) {
      const payload = {
        cart: validItems,
        customer: customer,
        paymentMode: paymentMode
      };
      const res = await window.api.createInvoice(payload);
      setLastInvoiceId(res.invoiceId);
      setInvoiceSuccess(true);
    }
  };

  const closeSuccess = () => {
    setBillItems([{ tempId: Date.now(), name: "", price: 0, qty: 0, total: 0, gstRate: 0, gstAmt: 0 }]);
    setCustomer({ name: "", phone: "", address: "" });
    setShowInvoice(false);
    setTimeout(() => setInvoiceSuccess(false), 300);
  };

  return (
    <div className="pos-container" style={{ position: 'relative' }}>

      {/* FINAL CHECKOUT MODAL & INVOICE PRINT VIEW */}
      {showInvoice && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: invoiceSuccess ? 'white' : 'rgba(15, 23, 42, 0.6)',
          zIndex: 1000,
          display: invoiceSuccess ? 'block' : 'flex',
          justifyContent: 'center', alignItems: 'center',
          overflowY: 'auto'
        }}>
          {!invoiceSuccess ? (
            <div className="modal-content" style={{
              background: 'white', padding: '30px', borderRadius: '12px',
              width: '650px', maxHeight: '90vh', overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
            }}>
              {checkoutStep === 1 && (
                <>
                  <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#0f172a' }}>1. Customer & Order Summary</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                    <div className="form-group">
                      <label className="form-label">Phone Number (Auto Search)</label>
                      <input className="form-input" placeholder="e.g. 9876543210" value={customer.phone} onChange={handlePhoneChange} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Customer Name</label>
                      <input className="form-input" placeholder="e.g. John Doe" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label className="form-label">Address</label>
                      <input className="form-input" placeholder="e.g. 1st street, city..." value={customer.address} onChange={e => setCustomer({ ...customer, address: e.target.value })} />
                    </div>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '0.9rem', color: '#475569' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#1e293b' }}>
                        <th style={{ padding: '8px 0' }}>Item</th>
                        <th style={{ padding: '8px 0', textAlign: 'center' }}>Qty</th>
                        <th style={{ padding: '8px 0', textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billItems.filter(i => i.qty > 0 && i.id).map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 0', fontWeight: '500' }}>{item.name} <br /><span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>₹{item.price} + {item.gstRate}% GST</span></td>
                          <td style={{ padding: '10px 0', textAlign: 'center' }}>{item.qty}</td>
                          <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 'bold', color: '#0f172a' }}>₹{(item.total + item.gstAmt).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ textAlign: 'right', fontSize: '1.3rem', fontWeight: 'bold', marginBottom: '25px', color: '#0f172a' }}>
                    Net Payable: <span style={{ color: '#0284c7' }}>₹{grandTotal}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px' }}>
                    <button onClick={() => setShowInvoice(false)} style={{
                      padding: '10px 20px', background: 'white', border: '1px solid #cbd5e1',
                      borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#64748b'
                    }}>
                      Cancel
                    </button>
                    <button onClick={() => setCheckoutStep(2)} style={{
                      padding: '10px 20px', background: '#0284c7', border: 'none',
                      borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: 'white'
                    }}>
                      Continue to Payment ➔
                    </button>
                  </div>
                </>
              )}

              {checkoutStep === 2 && (
                <>
                  <h2 style={{ marginTop: 0, marginBottom: '20px', color: '#0f172a' }}>2. Payment Verification</h2>

                  <div style={{ textAlign: 'center', marginBottom: '25px' }}>
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#0f172a' }}>₹{grandTotal}</div>
                    <div style={{ color: '#64748b', fontSize: '0.9rem' }}>Net Payable Amount</div>
                  </div>

                  <div style={{ border: '1px solid #e2e8f0', padding: '20px', borderRadius: '8px', marginBottom: '25px' }}>
                    <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                        <input type="radio" checked={paymentMode === "Cash"} onChange={() => setPaymentMode("Cash")} /> 💵 Cash
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                        <input type="radio" checked={paymentMode === "UPI"} onChange={() => setPaymentMode("UPI")} /> 📱 UPI (GPay/PhonePe)
                      </label>
                    </div>

                    {paymentMode === "Cash" && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '15px' }}>
                        <div>
                          <label className="form-label">Amount Given By Customer (₹)</label>
                          <input type="number" className="form-input" style={{ fontSize: '1.2rem', padding: '12px' }} value={amountReceived} onChange={e => setAmountReceived(e.target.value)} placeholder={`₹ ${grandTotal}`} />
                        </div>
                        {amountReceived && Number(amountReceived) >= Number(grandTotal) && (
                          <div style={{ padding: '15px', backgroundColor: '#ecfdf5', borderRadius: '6px', fontSize: '1.2rem', color: '#059669', textAlign: 'center', fontWeight: 'bold' }}>
                            Give Change: ₹{(Number(amountReceived) - Number(grandTotal)).toFixed(2)}
                          </div>
                        )}
                      </div>
                    )}

                    {paymentMode === "UPI" && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px' }}>
                        <div style={{ width: '80px', height: '80px', background: '#e2e8f0', display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '8px' }}>
                          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><rect x="7" y="7" width="3" height="3"></rect><rect x="14" y="7" width="3" height="3"></rect><rect x="7" y="14" width="3" height="3"></rect><rect x="14" y="14" width="3" height="3"></rect></svg>
                        </div>
                        <div>
                          <div style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '1.1rem' }}>Scan Shop QR</div>
                          <div style={{ fontSize: '0.9rem', color: '#64748b', marginTop: '5px' }}>Validate the exact payment of <b>₹{grandTotal}</b> on your phone before confirming this bill.</div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px' }}>
                    <button onClick={() => setCheckoutStep(1)} style={{
                      padding: '10px 20px', background: 'white', border: '1px solid #cbd5e1',
                      borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: '#64748b'
                    }}>
                      Back
                    </button>
                    <button onClick={finalizeInvoice} style={{
                      padding: '10px 20px', background: '#10b981', border: 'none', flex: 1,
                      borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', color: 'white', fontSize: '1.1rem'
                    }}>
                      Complete Payment ✓
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* 🔥 PRINTABLE INVOICE VIEW EXACTLY MATCHING USER'S IMAGE 🔥 */
            <div className="printable-invoice" style={{
              background: 'white',
              maxWidth: '800px',
              margin: '40px auto',
              padding: '40px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #333', paddingBottom: '20px', marginBottom: '30px' }}>
                <div>
                  <h1 style={{ margin: '0 0 5px 0', fontSize: '2rem', color: '#111' }}>SMART BILLING STORE</h1>
                  <div style={{ color: '#555' }}>123 Business Road, Market City 60001</div>
                  <div style={{ color: '#555' }}>Phone: +91 90000 00000</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <h2 style={{ margin: '0 0 10px 0', color: '#333' }}>INVOICE</h2>
                  <div><strong>Invoice #:</strong> {lastInvoiceId}</div>
                  <div><strong>Date:</strong> {new Date().toLocaleDateString()}</div>
                  <div><strong>Payment Via:</strong> {paymentMode}</div>
                </div>
              </div>

              <div style={{ marginBottom: '30px' }}>
                <strong>Bill To:</strong><br />
                {customer.name ? (
                  <>
                    <div>{customer.name}</div>
                    <div>{customer.phone}</div>
                    <div>{customer.address}</div>
                  </>
                ) : (
                  <div>Walk-in Customer</div>
                )}
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px', border: '1px solid #333' }}>
                <thead>
                  <tr style={{ backgroundColor: '#e6f0fa', borderBottom: '1px solid #333' }}>
                    <th style={{ padding: '12px', textAlign: 'left', borderRight: '1px solid #333' }}>Item Description</th>
                    <th style={{ padding: '12px', textAlign: 'center', borderRight: '1px solid #333' }}>Qty</th>
                    <th style={{ padding: '12px', textAlign: 'right', borderRight: '1px solid #333' }}>Rate</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {billItems.filter(i => i.qty > 0 && i.id).map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #ccc' }}>
                      <td style={{ padding: '12px', borderRight: '1px solid #333' }}>
                        {item.name}
                        <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>+ {item.gstRate}% GST (₹{item.gstAmt.toFixed(2)})</div>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', borderRight: '1px solid #333' }}>{item.qty}</td>
                      <td style={{ padding: '12px', textAlign: 'right', borderRight: '1px solid #333' }}>₹{(item.price).toFixed(2)}</td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>₹{(item.total + item.gstAmt).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ width: '300px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
                    <span>Subtotal:</span>
                    <span>₹{subtotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #333' }}>
                    <span>Total GST:</span>
                    <span>₹{taxTotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', fontWeight: 'bold', fontSize: '1.2rem' }}>
                    <span>NET PAYABLE:</span>
                    <span>₹{grandTotal}</span>
                  </div>
                  {paymentMode === "Cash" && amountReceived && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', color: '#555' }}>
                      <span>Cash Tendered:</span>
                      <span>₹{Number(amountReceived).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: '50px', textAlign: 'center', color: '#666', fontSize: '0.9rem', borderTop: '1px solid #ccc', paddingTop: '20px' }}>
                Returns are accepted within 30 days of the purchase date.<br />
                Thank You for your business!
              </div>

              {/* NO-PRINT ACTION BAR */}
              <div className="no-print" style={{ marginTop: '40px', display: 'flex', justifyContent: 'center', gap: '20px' }}>
                <button onClick={() => window.print()} style={{ padding: '12px 25px', background: '#333', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>🖨️ PRINT INVOICE</button>
                <button onClick={closeSuccess} style={{ padding: '12px 25px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>CLOSE & START NEW</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* HEADER */}
      <div className="pos-table-header">
        <div>S.NO</div>
        <div style={{ textAlign: "left", paddingLeft: "15px" }}>DESCRIPTION</div>
        <div>RATE (₹)</div>
        <div>QTY</div>
        <div>GST %</div>
        <div>GST (₹)</div>
        <div>AMOUNT (₹)</div>
      </div>

      {/* ROWS */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {billItems.map((item, idx) => (
          <div key={item.tempId} className="pos-row">
            <div className="pos-cell" style={{ justifyContent: "center" }}>
              {idx + 1}
            </div>

            {/* ✅ FIX 2: INPUT WORKING */}
            <div className="pos-cell" style={{ position: "relative" }}>
              <input
                className="pos-input"
                ref={el => (inputRefs.current[idx] = el)}
                value={item.name}
                onFocus={() => setCurrentRow(idx)} // 🔥 IMPORTANT FIX
                onChange={(e) =>
                  handleInputChange(idx, e.target.value)
                }
                onKeyDown={(e) =>
                  handleKeyDown(e, idx, "name")
                }
                placeholder="Type to search..."
              />

              {suggestions.length > 0 && idx === currentRow && (
                <div className="tally-suggestions">
                  {suggestions.map((p, sIdx) => (
                    <div
                      key={p.id}
                      className={`tally-suggestion-item ${sIdx === selectedSugIndex ? "selected" : ""
                        }`}
                      onClick={() => selectProduct(p, idx)}
                    >
                      <span>{p.name}</span>
                      <span>₹{p.price}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pos-cell">
              <input className="pos-input" value={item.price || ""} readOnly />
            </div>

            <div className="pos-cell">
              <input
                className="pos-input"
                ref={el => (inputRefs.current[idx + "_qty"] = el)}
                value={item.qty || ""}
                onChange={(e) => updateQty(idx, e.target.value)}
                onKeyDown={(e) =>
                  handleKeyDown(e, idx, "qty")
                }
              />
            </div>

            <div className="pos-cell">{item.gstRate}</div>
            <div className="pos-cell">
              {Number(item.gstAmt || 0).toFixed(2)}
            </div>
            <div className="pos-cell">
              {Number((item.total || 0) + (item.gstAmt || 0)).toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {/* FOOTER */}
      <div className="pos-footer">
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

        <button
          className="btn-invoice"
          onClick={handleGenerateClick}
        >
          GENERATE BILL
        </button>
      </div>
    </div>
  );
};

export default POS;