import React, { useState, useEffect } from "react";
import { Search, Save, PackagePlus } from "lucide-react";

const BulkUpdate = () => {
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState("");
  const [updates, setUpdates] = useState({});

  const load = async () => {
    if (window.api && window.api.getProductsFull) {
      setProducts(await window.api.getProductsFull());
    } else {
      // Mock data
      setProducts([
        { id: 1, name: "Tomato Ketchup", category_gst: 0, quantity: 10, unit: "Pcs", price: 120 },
        { id: 2, name: "Milk 1L", category_gst: 5, quantity: 40, unit: "Pcs", price: 65 },
        { id: 3, name: "Bread", category_gst: 0, quantity: 5, unit: "Pcs", price: 40 }
      ]);
    }
  };

  useEffect(() => { load(); }, []);

  const handleChange = (id, value) => {
    setUpdates(prev => ({ ...prev, [id]: value }));
  };

  const processUpdate = async () => {
    const payload = Object.keys(updates)
      .map(id => ({ id: Number(id), addQty: Number(updates[id] || 0) }))
      .filter(u => u.addQty !== 0);

    if (payload.length === 0) {
      alert("No changes to save.");
      return;
    }

    if (window.api && window.api.bulkUpdateProducts) {
      try {
        await window.api.bulkUpdateProducts(payload);
        alert("Stock Updated Successfully!");
        setUpdates({});
        load();
      } catch (err) {
        alert("❌ Error updating stock: " + err.message);
      }
    } else {
      alert("Stock Updated Successfully! (Mock)");
      setUpdates({});
    }
  };

  const filteredProducts = products.filter(p => !filter || p.name?.toLowerCase().includes(filter.toLowerCase()) || p.barcode?.includes(filter));
  const hasChanges = Object.values(updates).some(val => Number(val) !== 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Bulk Stock Inward</span>
        {hasChanges && (
          <button className="btn btn-primary" onClick={processUpdate}>
            <Save size={18} /> Save All {Object.keys(updates).filter(k => updates[k] !== "").length} Changes
          </button>
        )}
      </div>

      <div className="modern-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0 }}>
        
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
          <div className="header-search" style={{ width: 400 }}>
            <Search size={18} />
            <input type="text" placeholder="Search product to update stock..." value={filter} onChange={e => setFilter(e.target.value)} />
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-3)' }}>
            <PackagePlus size={18} />
            <span style={{ fontSize: 13 }}>Fast bulk entry</span>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table className="modern-table">
            <thead>
              <tr>
                <th>Product</th>
                <th style={{ textAlign: "center" }}>Current Stock</th>
                <th style={{ textAlign: "center", width: 140 }}>Add Quantity</th>
                <th style={{ textAlign: "center" }}>Final Stock</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(p => {
                const addedQty = Number(updates[p.id] || 0);
                const finalQty = p.quantity + addedQty;
                const isUpdated = addedQty !== 0;

                return (
                  <tr key={p.id} style={{ background: isUpdated ? 'var(--primary-light)' : 'transparent' }}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Price: ₹{p.price}</div>
                    </td>
                    <td style={{ textAlign: "center", fontSize: 16, fontWeight: 600 }}>{p.quantity} <span style={{ fontSize: 12, fontWeight: 500 }}>{p.unit}</span></td>
                    <td style={{ textAlign: "center" }}>
                      <input 
                        type="number" 
                        className="form-input" 
                        style={{ width: 100, height: 40, textAlign: "center", fontWeight: 700, borderColor: isUpdated ? 'var(--primary)' : 'var(--border-2)' }} 
                        value={updates[p.id] || ""} 
                        onChange={(e) => handleChange(p.id, e.target.value)}
                        placeholder="+0"
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{ 
                        fontSize: 18, 
                        fontWeight: 800, 
                        color: isUpdated ? 'var(--primary)' : 'var(--text-1)' 
                      }}>
                        {finalQty} 
                      </span>
                      <span style={{ fontSize: 12, marginLeft: 4, fontWeight: 500, color: 'var(--text-3)' }}>
                        {p.unit}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan="4" style={{ textAlign: "center", padding: 40, color: 'var(--text-4)' }}>No products found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
};

export default BulkUpdate;