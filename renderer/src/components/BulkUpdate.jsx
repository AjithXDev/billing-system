import React, { useState, useEffect } from "react";

const BulkUpdate = () => {
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [updates, setUpdates] = useState({}); // store per product changes

  const load = async () => {
    if (window.api && window.api.getProducts) {
      const data = await window.api.getProducts();
      setProducts(data);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // 🔍 SEARCH SUGGESTIONS
  const handleSearch = (value) => {
    setFilter(value);

    if (value.trim() === "") {
      setSuggestions([]);
      return;
    }

    const filtered = products.filter(p =>
      p.name.toLowerCase().includes(value.toLowerCase()) ||
      (p.barcode && p.barcode.includes(value))
    );

    setSuggestions(filtered);
  };

  // ➕ HANDLE CHANGE PER PRODUCT
  const handleChange = (id, field, value) => {
    setUpdates(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  // 🚀 FINAL UPDATE
  const processUpdate = async () => {
    const payload = Object.keys(updates).map(id => ({
      id: Number(id),
      addQty: Number(updates[id]?.qty || 0),
      gst: Number(updates[id]?.gst || 0)
    }));

    if (window.api && window.api.bulkUpdateProducts) {
      await window.api.bulkUpdateProducts(payload);
      alert("Stock + GST Updated Successfully!");
      setUpdates({});
      load();
    }
  };

  return (
    <div className="admin-scroll-area">
      <div className="admin-card" style={{ maxWidth: "1100px" }}>
        
        <div className="admin-card-header">
          Smart Bulk Stock + GST Update
        </div>

        <div className="admin-card-body">

          {/* 🔍 SEARCH */}
          <div className="form-group" style={{ marginBottom: "20px", position: "relative" }}>
            <label className="form-label">Search Product</label>
            <input
              className="form-input"
              placeholder="Type 'mi' → milk, etc..."
              value={filter}
              onChange={(e) => handleSearch(e.target.value)}
            />

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="tally-suggestions">
                {suggestions.map(p => (
                  <div
                    key={p.id}
                    className="tally-suggestion-item"
                    onClick={() => {
                      setFilter(p.name);
                      setSuggestions([]);
                    }}
                  >
                    <span>{p.name}</span>
                    <span>₹{p.price}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 📊 TABLE */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th style={{ textAlign: "center" }}>Current</th>
                  <th style={{ textAlign: "center" }}>Add Qty</th>
                  <th style={{ textAlign: "center" }}>Final</th>
                  <th style={{ textAlign: "center" }}>GST %</th>
                </tr>
              </thead>

              <tbody>
                {products
                  .filter(p => p.name.toLowerCase().includes(filter.toLowerCase()))
                  .map(p => {
                    const add = Number(updates[p.id]?.qty || 0);
                    const gst = updates[p.id]?.gst || "";

                    return (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>

                        <td style={{ textAlign: "center" }}>
                          {p.quantity}
                        </td>

                        <td style={{ textAlign: "center" }}>
                          <input
                            type="number"
                            className="form-input"
                            style={{ width: "80px", textAlign: "center" }}
                            value={updates[p.id]?.qty || ""}
                            onChange={(e) =>
                              handleChange(p.id, "qty", e.target.value)
                            }
                          />
                        </td>

                        <td style={{ textAlign: "center", fontWeight: "bold" }}>
                          {p.quantity + add}
                        </td>

                        <td style={{ textAlign: "center" }}>
                          <input
                            type="number"
                            className="form-input"
                            style={{ width: "80px", textAlign: "center" }}
                            placeholder="GST %"
                            value={gst}
                            onChange={(e) =>
                              handleChange(p.id, "gst", e.target.value)
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* 🚀 BUTTON */}
          <div style={{ marginTop: "25px", textAlign: "right" }}>
            <button className="btn-action" onClick={processUpdate}>
              SAVE ALL UPDATES
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default BulkUpdate;