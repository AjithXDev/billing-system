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
  const inputRefs = useRef([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // 🔍 SEARCH PRODUCTS
  const handleInputChange = async (index, value) => {
    const updated = [...billItems];
    updated[index].name = value;
    setBillItems(updated);

    if (value.trim().length > 0) {
      if (window.api && window.api.getProducts) {
        const dbProducts = await window.api.getProducts();

        const filtered = dbProducts.filter(p =>
          p.name.toLowerCase().includes(value.toLowerCase()) ||
          (p.barcode && p.barcode.includes(value))
        );

        setSuggestions(filtered);
        setSelectedSugIndex(0);
      }
    } else {
      setSuggestions([]);
    }
  };

  // ✅ SELECT PRODUCT (GST 0 default)
  const selectProduct = (product, index) => {
    const updated = [...billItems];
    updated[index] = {
      ...updated[index],
      id: product.id,
      name: product.name,
      price: product.price,
      qty: 1,
      total: product.price,
      gstRate: product.gst || 0, // ✅ dynamic GST
      gstAmt: (product.price * (product.gst || 0)) / 100
    };

    setBillItems(updated);
    setSuggestions([]);
    setTimeout(() => inputRefs.current[index + "_qty"]?.focus(), 10);
  };

  const handleKeyDown = (e, index, field) => {
    if (field === "name") {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSugIndex(p => Math.min(p + 1, suggestions.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSugIndex(p => Math.max(p - 1, 0));
      }
      if (e.key === "Enter") {
        if (suggestions.length > 0) {
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
    updated[idx].qty = parseFloat(q) || 0;
    updated[idx].total = updated[idx].qty * updated[idx].price;

    updated[idx].gstAmt =
      (updated[idx].total * updated[idx].gstRate) / 100;

    setBillItems(updated);
  };

  const qtyTotal = billItems.reduce((s, i) => s + (i.qty || 0), 0);
  const subtotal = billItems.reduce((s, i) => s + (i.total || 0), 0);
  const taxTotal = billItems.reduce((s, i) => s + (i.gstAmt || 0), 0);
  const grandTotal = (subtotal + taxTotal).toFixed(2);

  return (
    <div className="pos-container">

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
                      className={`tally-suggestion-item ${
                        sIdx === selectedSugIndex ? "selected" : ""
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
              {item.gstAmt.toFixed(2)}
            </div>
            <div className="pos-cell">
              {(item.total + item.gstAmt).toFixed(2)}
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
          onClick={() => setShowInvoice(true)}
        >
          GENERATE BILL
        </button>
      </div>
    </div>
  );
};

export default POS;