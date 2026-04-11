import React, { useState, useEffect } from "react";

const Inventory = () => {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    name: "",
    category_id: "",
    gst_rate: "0",
    product_code: "",
    price_type: "exclusive",
    price: "",
    cost_price: "",
    quantity: "",
    unit: "Pcs",
    barcode: "",
    expiry_date: "",
    image: ""
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
      try {
        await window.api.addProduct({
          ...form,
          price: Number(form.price),
          cost_price: Number(form.cost_price) || 0,
          quantity: Number(form.quantity),
          category_id: Number(form.category_id),
          gst_rate: Number(form.gst_rate),
          product_code: form.product_code || null,
          price_type: form.price_type,
          expiry_date: form.expiry_date || null,
          image: form.image || null
        });
        alert("Product registered in database! 🔥");
        setForm({
          name: "",
          category_id: categories.length > 0 ? categories[0].id : "",
          gst_rate: "0",
          product_code: "",
          price_type: "exclusive",
          price: "",
          cost_price: "",
          quantity: "",
          unit: "Pcs",
          barcode: "",
          expiry_date: "",
          image: ""
        });
      } catch (err) {
        alert("❌ Error saving product: " + err.message);
      }
    } else {
      alert("Error: Database connection not found! Please ensure you are running the app as a Desktop Application (Electron), not in a regular web browser.");
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm({ ...form, image: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="admin-scroll-area">
      <div className="admin-card">
        <div className="admin-card-header">Add New Product details</div>
        <div className="admin-card-body">
          <form onSubmit={addProduct}>
            
            {/* Image Upload box */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '25px', alignItems: 'flex-start' }}>
               <div style={{ width: '120px', height: '120px', borderRadius: '8px', border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#f8fafc', position: 'relative' }}>
                 {form.image ? (
                   <img src={form.image} alt="Product" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                 ) : (
                   <div style={{ textAlign: 'center', color: 'var(--text-4)', fontSize: '12px' }}>
                     📷<br/>No Image
                   </div>
                 )}
                 <input type="file" accept="image/*" onChange={handleImageChange} style={{ opacity: 0, position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
               </div>
               <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px' }}>
                 <div className="form-group">
                   <label className="form-label">Product Name</label>
                   <input className="form-input" name="name" value={form.name} onChange={handleChange} required />
                 </div>
                 <div className="form-group">
                   <label className="form-label">Category</label>
                   <select className="form-select" name="category_id" value={form.category_id} onChange={handleChange}>
                     {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                   </select>
                 </div>
               </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '25px', marginBottom: '20px' }}>
              <div className="form-group">
                <label className="form-label">Short Code / Unique ID</label>
                <input className="form-input" name="product_code" value={form.product_code} onChange={handleChange} placeholder="e.g. 101" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '25px', marginBottom: '20px' }}>
              <div className="form-group">
                <label className="form-label">GST Rate (%)</label>
                <select className="form-select" name="gst_rate" value={form.gst_rate} onChange={handleChange}>
                  <option value="0">0% (Nil)</option>
                  <option value="5">5% (Essential)</option>
                  <option value="12">12% (Standard)</option>
                  <option value="18">18% (Premium)</option>
                  <option value="28">28% (Luxury)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Barcode / SKU</label>
                <input className="form-input" name="barcode" value={form.barcode} onChange={handleChange} placeholder="Scan or type..." />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '25px', marginBottom: '20px' }}>
              <div className="form-group">
                <label className="form-label">Selling Price (₹)</label>
                <input className="form-input" name="price" type="number" step="0.01" value={form.price} onChange={handleChange} required />
                <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                   <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input type="radio" name="price_type" value="exclusive" checked={form.price_type === 'exclusive'} onChange={handleChange} /> + GST
                   </label>
                   <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input type="radio" name="price_type" value="inclusive" checked={form.price_type === 'inclusive'} onChange={handleChange} /> Incl. GST
                   </label>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Cost Price (₹)</label>
                <input className="form-input" name="cost_price" type="number" step="0.01" value={form.cost_price} onChange={handleChange} placeholder="Purchase cost" />
                {(form.price && form.cost_price) && (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '8px', color: (Number(form.price) - Number(form.cost_price)) >= 0 ? '#059669' : '#ef4444', fontSize: '11px', fontWeight: 800 }}>
                    💰 Profit: ₹{(Number(form.price) - Number(form.cost_price)).toFixed(2)} 
                    ({(((Number(form.price) - Number(form.cost_price)) / Number(form.cost_price)) * 100).toFixed(1)}%)
                  </div>
                )}
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
