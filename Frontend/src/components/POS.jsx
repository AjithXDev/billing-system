import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Plus, Minus, Search as SearchIcon, Printer, CheckCircle, Trash2, X, Pause, Play, ShoppingCart, ArrowRight, ChevronLeft } from "lucide-react";

const todayStr = () => new Date().toISOString().split("T")[0];

const POS = () => {
  const [allProducts, setAllProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [discount, setDiscount] = useState(0);
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(1);
  const [amountReceived, setAmountReceived] = useState("");
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  const [invoiceSuccess, setInvoiceSuccess] = useState(false);
  const [lastInvoiceId, setLastInvoiceId] = useState(null);

  // Hold / Resume
  const [heldBills, setHeldBills] = useState([]);
  const [showHeld, setShowHeld] = useState(false);

  // Cart panel toggle (starts hidden, shows when items added)
  const [showCart, setShowCart] = useState(false);

  const searchRef = useRef(null);

  // Load products
  const loadProducts = useCallback(() => {
    if (window.api?.getProductsFull) {
      window.api.getProductsFull()
        .then(data => setAllProducts(Array.isArray(data) ? data : []))
        .catch(() => setAllProducts([]));
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // Load held bills
  const loadHeldBills = useCallback(() => {
    if (window.api?.getHeldBills) {
      window.api.getHeldBills()
        .then(data => setHeldBills(Array.isArray(data) ? data : []))
        .catch(() => setHeldBills([]));
    }
  }, []);

  useEffect(() => { loadHeldBills(); }, [loadHeldBills]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery) return allProducts;
    const q = searchQuery.toLowerCase();
    return allProducts.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase().includes(q) ||
      p.category_name?.toLowerCase().includes(q)
    );
  }, [allProducts, searchQuery]);

  // Add to Cart
  const addToCart = useCallback((product) => {
    if (product.expiry_date && product.expiry_date < todayStr()) {
      alert(`🚫 "${product.name}" is EXPIRED! Cannot add.`);
      return;
    }

    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      } else {
        return [...prev, {
          id: product.id,
          name: product.name,
          price: Number(product.price || 0),
          qty: 1,
          gstRate: Number(product.category_gst || 0),
          image: product.image_url
        }];
      }
    });
    setShowCart(true);
  }, []);

  const updateQty = (id, delta) => {
    setCart(prev => prev.map(i => {
      if (i.id === id) {
        const newQty = Math.max(1, i.qty + delta);
        return { ...i, qty: newQty };
      }
      return i;
    }));
  };

  const removeItem = (id) => {
    setCart(prev => {
      const next = prev.filter(i => i.id !== id);
      if (next.length === 0) setShowCart(false);
      return next;
    });
  };

  // Prevent input jank by preventing full product grid re-render on every keystroke in sidebar arrays.
  const productGridJSX = useMemo(() => (
    <div className="product-grid">
      {filteredProducts.map(p => (
        <div className="product-card" key={p.id} onClick={() => addToCart(p)}>
          {p.image_url ? (
            <img src={p.image_url} alt={p.name} className="product-card-img" />
          ) : (
            <div className="product-card-img-placeholder">
              <span style={{ fontSize: 24, opacity: 0.5 }}>🛒</span>
            </div>
          )}
          <div className="product-card-title">{p.name}</div>
          <div className="product-card-price">₹{Number(p.price).toFixed(2)}</div>
          {p.barcode && <div className="product-card-barcode">{p.barcode}</div>}
          {p.quantity !== undefined && p.quantity <= 5 && (
            <div style={{ fontSize: 10, color: p.quantity === 0 ? 'var(--danger)' : 'var(--warning)', fontWeight: 700, marginTop: 4 }}>
              {p.quantity === 0 ? 'OUT OF STOCK' : `Only ${p.quantity} left`}
            </div>
          )}
          <div className="product-card-add">
            <Plus size={20} />
          </div>
        </div>
      ))}
      {filteredProducts.length === 0 && (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-4)', gridColumn: '1/-1', fontSize: 16 }}>
          No products matched your search.
        </div>
      )}
    </div>
  ), [filteredProducts, addToCart]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Enter" && searchQuery && filteredProducts.length === 1) {
        addToCart(filteredProducts[0]);
        setSearchQuery("");
        searchRef.current?.focus();
      } else if (e.key === "F2") {
        e.preventDefault();
        handleCheckoutClick();
      } else if (e.key === "F4" && invoiceSuccess) {
        e.preventDefault();
        window.print();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchQuery, filteredProducts, cart, invoiceSuccess, addToCart]);

  // Totals
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const taxTotal = cart.reduce((sum, item) => sum + ((item.price * item.qty) * item.gstRate / 100), 0);
  const grandTotal = subtotal + taxTotal - Number(discount);

  const handleCheckoutClick = () => {
    if (cart.length === 0) { alert("Cart is empty!"); return; }
    setShowCheckout(true);
    setCheckoutStep(1);
    setAmountReceived("");
    setPaymentMode("Cash");
  };

  // ── HOLD BILL ──
  const holdCurrentBill = async () => {
    if (cart.length === 0) { alert("Cart is empty, nothing to hold."); return; }
    const label = `Hold #${heldBills.length + 1} — ${cart.length} items`;
    if (window.api?.holdBill) {
      await window.api.holdBill({ cart, customer, label });
    }
    setCart([]);
    setCustomer({ name: "", phone: "" });
    setDiscount(0);
    setShowCart(false);
    loadHeldBills();
  };

  // ── RESUME BILL ──
  const resumeBill = async (bill) => {
    setCart(bill.cart || []);
    setCustomer(bill.customer || { name: "", phone: "" });
    setShowCart(true);
    if (window.api?.deleteHeldBill) {
      await window.api.deleteHeldBill(bill.id);
    }
    setShowHeld(false);
    loadHeldBills();
  };

  const deleteHeldBill = async (id) => {
    if (window.api?.deleteHeldBill) {
      await window.api.deleteHeldBill(id);
    }
    loadHeldBills();
  };

  const finalizeInvoice = async () => {
    if (paymentMode === "Cash" && amountReceived && Math.round(Number(amountReceived)*100) < Math.round(grandTotal*100)) {
      alert(`Insufficient Cash! Need ₹${(grandTotal - Number(amountReceived)).toFixed(2)} more.`);
      return;
    }

    // Build cart items for backend with total and gstAmt fields
    const cartForBackend = cart.map(item => ({
      ...item,
      total: item.price * item.qty,
      gstAmt: (item.price * item.qty) * item.gstRate / 100
    }));

    if (window.api?.createInvoice) {
      try {
        const res = await window.api.createInvoice({ cart: cartForBackend, customer, paymentMode, discount });
        setLastInvoiceId(res.invoiceId);
        setInvoiceSuccess(true);
        loadProducts(); // Refresh stock
        
        // 🔥 Send automatic WhatsApp message
        if (window.api.sendWhatsapp && customer.phone) {
          window.api.sendWhatsapp(
            customer.phone,
            "Thank you for purchasing our products. Please visit again."
          );
        }
      } catch (e) {
        alert("Error creating invoice: " + (e.message || "Unknown error"));
      }
    } else {
      setLastInvoiceId("INV-" + Math.floor(Math.random()*10000));
      setInvoiceSuccess(true);
    }
  };

  const resetPOS = () => {
    setCart([]);
    setCustomer({ name: "", phone: "" });
    setDiscount(0);
    setShowCheckout(false);
    setInvoiceSuccess(false);
    setShowCart(false);
    loadProducts();
  };

  return (
    <div className="pos-layout">

      {/* ── LEFT: Products (75% or full when cart hidden) ── */}
      <div className="pos-products-area" style={{ flex: showCart ? '0 0 75%' : '1' }}>
        {/* Top Actions Bar */}
        <div className="pos-topbar">
          <div className="header-search" style={{ flex: 1 }}>
            <SearchIcon size={18} />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by product name, barcode, or keyword... (Enter to add)"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div className="pos-topbar-actions">
            {/* Hold Button */}
            <button className="btn btn-outline" onClick={holdCurrentBill} title="Hold current bill (F3)">
              <Pause size={16} /> Hold
            </button>
            {/* Resume Button */}
            <button className="btn btn-outline" onClick={() => { loadHeldBills(); setShowHeld(true); }}
              style={{ position: 'relative' }}>
              <Play size={16} /> Resume
              {heldBills.length > 0 && (
                <span className="held-badge">{heldBills.length}</span>
              )}
            </button>
            {/* Cart Toggle */}
            <button className="btn btn-primary" onClick={() => setShowCart(!showCart)}
              style={{ position: 'relative' }}>
              <ShoppingCart size={16} /> Cart
              {cart.length > 0 && (
                <span className="held-badge" style={{ background: '#fff', color: 'var(--primary)' }}>{cart.length}</span>
              )}
            </button>
          </div>
        </div>

        {/* Product Grid */}
        {productGridJSX}
      </div>

      {/* ── RIGHT: Cart Panel (slides in when items added) ── */}
      {showCart && (
        <div className="pos-cart-panel">
          <div className="cart-panel-header">
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Current Cart</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '2px 10px', borderRadius: 12, fontSize: 13, fontWeight: 700 }}>
                {cart.length} items
              </span>
              <button onClick={() => setShowCart(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="cart-items-scroll">
            {cart.map(item => (
              <div className="cart-item" key={item.id}>
                <div className="cart-item-info">
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>₹{item.price.toFixed(2)} × {item.qty}</div>
                </div>
                <div className="cart-item-controls">
                  <div className="qty-control">
                    <button className="qty-btn" onClick={() => updateQty(item.id, -1)}><Minus size={12} /></button>
                    <span className="qty-input">{item.qty}</span>
                    <button className="qty-btn" onClick={() => updateQty(item.id, 1)}><Plus size={12} /></button>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', minWidth: 60, textAlign: 'right' }}>
                    ₹{((item.price * item.qty) * (1 + item.gstRate/100)).toFixed(2)}
                  </div>
                  <button onClick={() => removeItem(item.id)}
                    style={{ border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', padding: 4 }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Summary Footer */}
          <div className="cart-summary-footer">
            <div className="summary-row"><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
            <div className="summary-row"><span>GST</span><span>₹{taxTotal.toFixed(2)}</span></div>
            <div className="summary-row" style={{ alignItems: 'center' }}>
              <span>Discount</span>
              <input type="number" className="form-input"
                style={{ width: 80, height: 32, textAlign: 'right', padding: '0 8px' }}
                value={discount} onChange={e => setDiscount(Math.max(0, Number(e.target.value)))} />
            </div>
            <div className="summary-row total">
              <span>TOTAL</span>
              <span>₹{Math.max(0, grandTotal).toFixed(2)}</span>
            </div>

            <button className="checkout-btn" onClick={handleCheckoutClick} disabled={cart.length === 0}>
              <span>Next <ArrowRight size={18} /></span>
              <span style={{ fontWeight: 800 }}>₹{Math.max(0, grandTotal).toFixed(2)}</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Held Bills Modal ── */}
      {showHeld && (
        <div className="modal-overlay" onClick={() => setShowHeld(false)}>
          <div className="modal-content" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0 }}>Held Bills</h2>
              <button onClick={() => setShowHeld(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={24} /></button>
            </div>

            {heldBills.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-4)' }}>No held bills</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {heldBills.map(bill => (
                  <div key={bill.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '14px 16px', background: 'var(--surface-2)', borderRadius: 'var(--r-md)',
                    border: '1px solid var(--border)'
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-1)', fontSize: 14 }}>{bill.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{bill.cart?.length || 0} items</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" style={{ height: 34, padding: '0 14px', fontSize: 13 }} onClick={() => resumeBill(bill)}>
                        <Play size={14} /> Resume
                      </button>
                      <button className="btn btn-outline" style={{ height: 34, padding: '0 12px', color: 'var(--danger)' }} onClick={() => deleteHeldBill(bill.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Checkout / Bill Summary Modal ── */}
      {showCheckout && (
        <div className="modal-overlay">
          {!invoiceSuccess ? (
            <div className="modal-content" style={{ maxWidth: 550 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
                <h2 style={{ margin: 0 }}>
                  {checkoutStep === 1 ? 'Bill Summary' : 'Payment'}
                </h2>
                <button onClick={() => setShowCheckout(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={24} /></button>
              </div>

              {checkoutStep === 1 && (
                <div>
                  {/* Bill Summary Table */}
                  <table className="modern-table" style={{ marginBottom: 20 }}>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th style={{ textAlign: 'center' }}>Qty</th>
                        <th style={{ textAlign: 'right' }}>Price</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map(item => (
                        <tr key={item.id}>
                          <td style={{ fontWeight: 600 }}>{item.name}</td>
                          <td style={{ textAlign: 'center' }}>{item.qty}</td>
                          <td style={{ textAlign: 'right' }}>₹{item.price.toFixed(2)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>₹{((item.price * item.qty) * (1 + item.gstRate/100)).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ background: 'var(--surface-2)', padding: 16, borderRadius: 12, marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span>Subtotal</span><span style={{ fontWeight: 600 }}>₹{subtotal.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span>GST</span><span style={{ fontWeight: 600 }}>₹{taxTotal.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span>Discount</span><span style={{ fontWeight: 600 }}>-₹{Number(discount).toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid var(--border)', paddingTop: 12, marginTop: 8 }}>
                      <span style={{ fontSize: 20, fontWeight: 800 }}>Grand Total</span>
                      <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary)' }}>₹{grandTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="form-grid" style={{ marginBottom: 20 }}>
                    <div className="form-group">
                      <label className="form-label">Customer Phone</label>
                      <input className="form-input" value={customer.phone} onChange={e => setCustomer({...customer, phone: e.target.value})} placeholder="Mobile number" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Customer Name</label>
                      <input className="form-input" value={customer.name} onChange={e => setCustomer({...customer, name: e.target.value})} placeholder="Optional" />
                    </div>
                  </div>

                  <button className="btn btn-primary" style={{ width: '100%', height: 50, fontSize: 16 }} onClick={() => setCheckoutStep(2)}>
                    Next: Payment <ArrowRight size={18} />
                  </button>
                </div>
              )}

              {checkoutStep === 2 && (
                <div>
                  <div className="payment-methods" style={{ marginBottom: 24 }}>
                    <div className={`pay-btn ${paymentMode === 'Cash' ? 'active' : ''}`} onClick={() => setPaymentMode('Cash')}>
                      <span style={{ fontSize: 24 }}>💵</span> CASH
                    </div>
                    <div className={`pay-btn ${paymentMode === 'UPI' ? 'active' : ''}`} onClick={() => setPaymentMode('UPI')}>
                      <span style={{ fontSize: 24 }}>📱</span> UPI
                    </div>
                    <div className={`pay-btn ${paymentMode === 'Card' ? 'active' : ''}`} onClick={() => setPaymentMode('Card')}>
                      <span style={{ fontSize: 24 }}>💳</span> CARD
                    </div>
                  </div>

                  {paymentMode === 'Cash' && (
                    <div className="form-group" style={{ marginBottom: 24 }}>
                      <label className="form-label">Amount Received (₹)</label>
                      <input type="number" className="form-input"
                        style={{ fontSize: 20, height: 56, textAlign: 'center' }}
                        value={amountReceived} onChange={e => setAmountReceived(e.target.value)} autoFocus />
                      {Number(amountReceived) >= grandTotal && (
                        <div style={{ margin: '12px 0 0', padding: 16, background: 'var(--success-bg)', color: 'var(--success)', borderRadius: 8, textAlign: 'center', fontSize: 18, fontWeight: 700 }}>
                          Change: ₹{(Number(amountReceived) - grandTotal).toFixed(2)}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 12 }}>
                    <button className="btn btn-outline" style={{ flex: 1, height: 50 }} onClick={() => setCheckoutStep(1)}>
                      <ChevronLeft size={18} /> Back
                    </button>
                    <button className="btn btn-primary" style={{ flex: 2, height: 50, fontSize: 16 }} onClick={finalizeInvoice}>
                      Complete Payment
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="modal-content" style={{ textAlign: 'center', padding: '40px 24px' }}>
              <div style={{ width: 80, height: 80, background: 'var(--success-bg)', color: 'var(--success)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                <CheckCircle size={48} />
              </div>
              <h2 style={{ fontSize: 24, marginBottom: 8, color: 'var(--text-1)' }}>Payment Successful!</h2>
              <p style={{ color: 'var(--text-3)', marginBottom: 24 }}>Invoice #{lastInvoiceId} created successfully.</p>
              
              <div style={{ background: 'var(--surface-2)', padding: '16px', borderRadius: '12px', marginBottom: '32px', textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', marginBottom: 12, textTransform: 'uppercase' }}>Final Bill Summary</div>
                <table className="modern-table" style={{ marginBottom: 16, width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '8px 0' }}>Item</th>
                      <th style={{ textAlign: 'center', padding: '8px 0' }}>Qty</th>
                      <th style={{ textAlign: 'right', padding: '8px 0' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map(item => (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 600, padding: '8px 0' }}>{item.name}</td>
                        <td style={{ textAlign: 'center', padding: '8px 0' }}>{item.qty}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, padding: '8px 0' }}>₹{((item.price * item.qty) * (1 + item.gstRate/100)).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px dashed var(--border)', paddingTop: 12 }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>Total Paid ({paymentMode})</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>₹{grandTotal.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button className="btn btn-primary" style={{ width: '100%', height: 50 }} onClick={() => window.print()}>
                  <Printer size={20} /> Print Receipt (F4)
                </button>
                <button className="btn btn-outline" style={{ width: '100%', height: 50 }} onClick={resetPOS}>
                  New Bill
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default POS;