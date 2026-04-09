import React, { useState, useEffect } from "react";
import { Edit, Trash2, Search as SearchIcon, Filter, Image as ImageIcon } from "lucide-react";

const ProductList = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");

  const load = async () => {
    if (window.api && window.api.getProductsFull) {
      setProducts(await window.api.getProductsFull());
    } else {
      // Mock Data 
      setProducts([
        { id: 1, name: "Tomato Ketchup", category_name: "Grocery", barcode: "123456789", price: 120, cost_price: 90, quantity: 4, unit: "Pcs" },
        { id: 2, name: "Milk 1L", category_name: "Dairy", barcode: "987654321", price: 65, cost_price: 50, quantity: 40, unit: "Pcs", expiry_date: "2026-05-01" },
        { id: 3, name: "Bread", category_name: "Bakery", barcode: "111222333", price: 40, cost_price: 30, quantity: 2, unit: "Pcs", expiry_date: "2026-04-10" },
      ]);
    }

    if (window.api && window.api.getCategories) {
      setCategories(await window.api.getCategories());
    } else {
      setCategories([{id: 1, name: "Grocery"}, {id: 2, name: "Dairy"}, {id: 3, name: "Bakery"}]);
    }
  };
  
  useEffect(() => { load(); }, []);

  const handleDelete = async (id, name) => {
    if (window.confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) {
      if (window.api && window.api.deleteProduct) {
        await window.api.deleteProduct(id);
        load();
      } else {
        setProducts(prev => prev.filter(p => p.id !== id));
      }
    }
  };

  const handleEdit = (product) => {
    setEditingProduct({ ...product });
    setEditModalOpen(true);
  };

  const saveEdit = async () => {
    if (!editingProduct.name || !editingProduct.price) {
      alert("Name and Selling Price are required!");
      return;
    }
    if (window.api && window.api.editProduct) {
      await window.api.editProduct(editingProduct);
      setEditModalOpen(false);
      load();
    } else {
      setProducts(prev => prev.map(p => p.id === editingProduct.id ? editingProduct : p));
      setEditModalOpen(false);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditingProduct({...editingProduct, image_url: reader.result});
      };
      reader.readAsDataURL(file);
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name?.toLowerCase().includes(searchQuery.toLowerCase()) || p.barcode?.includes(searchQuery);
    const matchesCategory = filterCategory === "All" || p.category_name === filterCategory || String(p.category_id) === String(filterCategory);
    return matchesSearch && matchesCategory;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-title">Master Inventory</div>

      <div className="modern-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0 }}>
        
        {/* Toolbar */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 16, flex: 1 }}>
            <div className="header-search" style={{ width: 320 }}>
              <SearchIcon size={18} />
              <input type="text" placeholder="Search by name or barcode..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <div style={{ position: 'relative' }}>
              <Filter size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)' }} />
              <select className="form-select" style={{ paddingLeft: 42, width: 200, height: 40 }} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                <option value="All">All Categories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)' }}>
            Showing {filteredProducts.length} Products
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table className="modern-table">
            <thead>
              <tr>
                <th style={{ width: 60, textAlign: 'center' }}>Image</th>
                <th>Product Name</th>
                <th>Barcode</th>
                <th>Selling Price</th>
                <th>Stock</th>
                <th>Expiry Date</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(p => {
                const isLowStock = p.quantity <= 5;
                const isOutOfStock = p.quantity === 0;
                
                return (
                  <tr key={p.id}>
                    <td style={{ textAlign: 'center' }}>
                      {p.image_url ? (
                        <img src={p.image_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', color: 'var(--text-4)' }}>
                          <ImageIcon size={20} />
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{p.category_name || "Uncategorized"}</div>
                    </td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--text-2)' }}>{p.barcode || '—'}</td>
                    <td style={{ fontWeight: 700 }}>₹{Number(p.price).toFixed(2)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ 
                          width: 8, height: 8, borderRadius: '50%', 
                          background: isOutOfStock ? 'var(--danger)' : isLowStock ? 'var(--warning)' : 'var(--success)'
                        }} />
                        <span style={{ fontWeight: 600 }}>{p.quantity} {p.unit}</span>
                      </div>
                    </td>
                    <td>
                      {p.expiry_date ? (
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{p.expiry_date}</span>
                      ) : <span style={{ color: 'var(--text-4)' }}>N/A</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button className="btn-outline" style={{ height: 32, padding: '0 12px' }} onClick={() => handleEdit(p)}>
                          <Edit size={14} /> Edit
                        </button>
                        <button className="btn-outline" style={{ height: 32, padding: '0 12px', color: 'var(--danger)', borderColor: 'var(--danger-bg)' }} onClick={() => handleDelete(p.id, p.name)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: 40, color: 'var(--text-4)' }}>No products found matching your criteria.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && editingProduct && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 700 }}>
            <h2 style={{ fontSize: 20, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>Edit Product</h2>
            
            <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
              {/* Image Editor */}
              <div style={{ width: 140 }}>
                <label className="image-upload-box" style={{ width: 140, height: 140 }}>
                  {editingProduct.image_url ? (
                     <img src={editingProduct.image_url} alt="" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 12 }} />
                  ) : (
                    <div style={{ textAlign: 'center', color: 'var(--text-3)' }}>
                      <ImageIcon size={32} style={{ marginBottom: 8 }}/>
                      <div style={{ fontSize: 12 }}>Change Image</div>
                    </div>
                  )}
                  <input type="file" style={{ display: 'none' }} accept="image/*" onChange={handleImageChange} />
                </label>
              </div>

              {/* Form Details */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Product Name</label>
                  <input className="form-input" value={editingProduct.name} onChange={e => setEditingProduct({...editingProduct, name: e.target.value})} />
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Category</label>
                    <select className="form-select" value={editingProduct.category_id || ""} onChange={e => setEditingProduct({...editingProduct, category_id: parseInt(e.target.value)})}>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">Barcode</label>
                    <input className="form-input" value={editingProduct.barcode || ""} onChange={e => setEditingProduct({...editingProduct, barcode: e.target.value})} />
                  </div>
                </div>
              </div>
            </div>

            <div className="form-grid" style={{ marginBottom: 24 }}>
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
                <label className="form-label">Expiry Date</label>
                <input type="date" className="form-input" value={editingProduct.expiry_date || ""} onChange={e => setEditingProduct({...editingProduct, expiry_date: e.target.value || null})} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="btn btn-outline" onClick={() => setEditModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductList;
