import React, { useState, useEffect } from "react";

const ProductList = () => {
  const [products, setProducts] = useState([]);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [categories, setCategories] = useState([]);
  
  const load = async () => {
    if (window.api && window.api.getProductsFull) {
      setProducts(await window.api.getProductsFull());
    }
    if (window.api && window.api.getCategories) {
      setCategories(await window.api.getCategories());
    }
  };
  
  useEffect(() => { load(); }, []);

  const handleDelete = async (id, name) => {
    if (window.confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) {
      if (window.api.deleteProduct) {
        await window.api.deleteProduct(id);
        load();
      }
    }
  };

  const handleEdit = (product) => {
    setEditingProduct({ ...product }); // create copy
    setEditModalOpen(true);
  };

  const saveEdit = async () => {
    if (!editingProduct.name || !editingProduct.price) {
      alert("Name and Selling Price are required!");
      return;
    }
    if (window.api.editProduct) {
      await window.api.editProduct(editingProduct);
      setEditModalOpen(false);
      load();
    }
  };

  return (
    <div className="admin-scroll-area">
      {isEditModalOpen && editingProduct && (
        <div className="modal-overlay">
          <div className="invoice-modal">
            <h2 style={{ marginBottom: '20px', color: '#0f172a' }}>Edit Product</h2>
            <div className="form-group">
              <label className="form-label">Product Name</label>
              <input className="form-input" value={editingProduct.name} onChange={e => setEditingProduct({...editingProduct, name: e.target.value})} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
              <div className="form-group">
                <label className="form-label">Selling Price</label>
                <input type="number" className="form-input" value={editingProduct.price} onChange={e => setEditingProduct({...editingProduct, price: parseFloat(e.target.value)})} />
              </div>
              <div className="form-group">
                <label className="form-label">Cost Price</label>
                <input type="number" className="form-input" value={editingProduct.cost_price} onChange={e => setEditingProduct({...editingProduct, cost_price: parseFloat(e.target.value)})} />
              </div>
              <div className="form-group">
                <label className="form-label">Stock Quantity</label>
                <input type="number" className="form-input" value={editingProduct.quantity} onChange={e => setEditingProduct({...editingProduct, quantity: parseInt(e.target.value)})} />
              </div>
              <div className="form-group">
                <label className="form-label">Unit</label>
                <select className="form-select" value={editingProduct.unit} onChange={e => setEditingProduct({...editingProduct, unit: e.target.value})}>
                  <option value="PCS">PCS</option>
                  <option value="KG">KG</option>
                  <option value="LTR">LTR</option>
                  <option value="BOX">BOX</option>
                  <option value="PKT">PKT</option>
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginTop: '10px' }}>
              <label className="form-label">Barcode</label>
              <input className="form-input" value={editingProduct.barcode || ""} onChange={e => setEditingProduct({...editingProduct, barcode: e.target.value})} />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-select" value={editingProduct.category_id || ""} onChange={e => setEditingProduct({...editingProduct, category_id: parseInt(e.target.value)})}>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Expiry Date 🗓️</label>
              <input type="date" className="form-input" value={editingProduct.expiry_date || ""}
                onChange={e => setEditingProduct({...editingProduct, expiry_date: e.target.value || null})}
                style={{ colorScheme: 'light' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '30px' }}>
              <button className="btn-outline" onClick={() => setEditModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={saveEdit}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      <div className="admin-card" style={{ maxWidth: '100%' }}>
         <div className="admin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Inventory Records ({products.length})</span>
            <button className="btn-action" style={{ padding: '6px 15px', fontSize: '0.8rem' }} onClick={load}>Refresh Data</button>
         </div>

         <div className="admin-card-body" style={{ padding: '0' }}>
            <table className="data-table">
              <thead>
                <tr>
                   <th style={{ width: '80px', paddingLeft: '25px' }}>ID</th>
                   <th>Item Description</th>
                   <th>Barcode</th>
                   <th>Rate (₹)</th>
                   <th>Stock</th>
                   <th>Unit</th>
                   <th>Expiry</th>
                   <th style={{ textAlign: 'right', paddingRight: '25px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                 {products.map(p => {
                    const today = new Date().toISOString().split('T')[0];
                    const expired = p.expiry_date && p.expiry_date < today;
                    const near = p.expiry_date && !expired && p.expiry_date <= new Date(Date.now() + 7*86400000).toISOString().split('T')[0];
                    return (
                   <tr key={p.id}>
                       <td style={{ paddingLeft: '25px', color: '#64748b' }}>#{p.id}</td>
                       <td style={{ fontWeight: 600, color: expired ? '#ef4444' : 'inherit' }}>{p.name}{expired && <span style={{ fontSize: 10, background: '#ef444420', color: '#ef4444', borderRadius: 4, padding: '1px 5px', marginLeft: 6 }}>EXPIRED</span>}</td>
                       <td style={{ fontFamily: 'monospace' }}>{p.barcode || '-'}</td>
                       <td style={{ fontWeight: 600, color: '#059669' }}>₹{p.price.toFixed(2)}</td>
                       <td style={{ fontWeight: 600 }}>{p.quantity}</td>
                       <td>{p.unit}</td>
                       <td>
                         {p.expiry_date ? (
                           <span style={{
                             fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                             background: expired ? '#ef444420' : near ? '#fef3c7' : '#dcfce7',
                             color: expired ? '#ef4444' : near ? '#d97706' : '#16a34a',
                             border: `1px solid ${expired ? '#fca5a5' : near ? '#fde68a' : '#86efac'}`
                           }}>{p.expiry_date}</span>
                         ) : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                       </td>
                       <td style={{ textAlign: 'right', paddingRight: '25px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                          <button onClick={() => handleEdit(p)} className="btn-outline" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>Edit</button>
                          <button onClick={() => handleDelete(p.id, p.name)} className="btn-outline" style={{ padding: '6px 12px', fontSize: '0.85rem', color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}>Delete</button>
                       </td>
                    </tr>
                    );
                 })}
                {products.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '50px', color: '#94a3b8' }}>No records found.</td>
                  </tr>
                )}
              </tbody>
            </table>
         </div>
      </div>
    </div>
  );
};

export default ProductList;
