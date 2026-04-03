import React, { useState, useEffect } from "react";

const Inventory = () => {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    name: "", category_id: "", price: "", cost_price: "", quantity: "", unit: "Pcs", barcode: "", expiry_date: ""
  });

  const loadCategories = async () => {
    if (window.api && window.api.getCategories) {
      const cats = await window.api.getCategories();
      setCategories(cats);
      if (cats.length > 0) {
        setForm(prev => ({ ...prev, category_id: cats[0].id }));
      }
    }
  };

  useEffect(() => { loadCategories(); }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const addProduct = async (e) => {
    e.preventDefault();
    if (window.api && window.api.addProduct) {
      await window.api.addProduct({
        ...form,
        price: Number(form.price),
        cost_price: Number(form.cost_price) || 0,
        quantity: Number(form.quantity),
        category_id: Number(form.category_id),
        expiry_date: form.expiry_date || null
      });
      alert("Product registered in database!");
      setForm({ name: "", category_id: categories.length > 0 ? categories[0].id : "", price: "", cost_price: "", quantity: "", unit: "Pcs", barcode: "", expiry_date: "" });
    }
  };

  return (
    <div className="admin-scroll-area">
      <div className="admin-card">
        <div className="admin-card-header">Add New Product details</div>
        <div className="admin-card-body">
          <form onSubmit={addProduct}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '25px', marginBottom: '20px' }}>
              <div className="form-group">
                <label className="form-label">Product Name</label>
                <input className="form-input" name="name" value={form.name} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label className="form-label">Category (GST)</label>
                <select className="form-select" name="category_id" value={form.category_id} onChange={handleChange}>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Barcode / SKU</label>
                <input className="form-input" name="barcode" value={form.barcode} onChange={handleChange} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '25px', marginBottom: '20px' }}>
              <div className="form-group">
                <label className="form-label">Selling Price (₹)</label>
                <input className="form-input" name="price" type="number" step="0.01" value={form.price} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label className="form-label">Cost Price (₹)</label>
                <input className="form-input" name="cost_price" type="number" step="0.01" value={form.cost_price} onChange={handleChange} placeholder="Purchase cost" />
              </div>
              <div className="form-group">
                <label className="form-label">Opening Stock Qty</label>
                <input className="form-input" name="quantity" type="number" value={form.quantity} onChange={handleChange} required />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '25px', marginBottom: '20px' }}>
              <div className="form-group">
                <label className="form-label">Unit</label>
                <select className="form-select" name="unit" value={form.unit} onChange={handleChange}>
                  <option value="Pcs">Pcs</option>
                  <option value="Kg">Kg</option>
                  <option value="Box">Box</option>
                  <option value="Ltr">Ltr</option>
                  <option value="Strip">Strip (Pharma)</option>
                  <option value="Bottle">Bottle</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Expiry Date 🗓️</label>
                <input className="form-input" name="expiry_date" type="date" value={form.expiry_date} onChange={handleChange}
                  style={{ colorScheme: 'light' }}
                />
              </div>
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '20px', marginTop: '20px', textAlign: 'right' }}>
               <button className="btn-action">SAVE PRODUCT</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Inventory;
