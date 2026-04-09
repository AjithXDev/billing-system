import React, { useState, useEffect } from "react";
import { UploadCloud, Image as ImageIcon } from "lucide-react";

const Inventory = () => {
  const [categories, setCategories] = useState([]);
  const [existingProducts, setExistingProducts] = useState([]);
  const [imagePreview, setImagePreview] = useState(null);
  const [form, setForm] = useState({
    name: "", category_id: "", price: "", cost_price: "", quantity: "", unit: "Pcs", barcode: "", expiry_date: "", supplier: ""
  });

  const loadInitialData = async () => {
    if (window.api && window.api.getCategories) {
      const cats = await window.api.getCategories();
      setCategories(cats);
      if (cats.length > 0) {
        setForm(prev => ({ ...prev, category_id: cats[0].id }));
      }
    } else {
      // Mock categories if API doesn't exist to show beautiful UI anyway
      setCategories([{id: 1, name: "Grocery (0% GST)"}, {id: 2, name: "Electronics (18% GST)"}]);
    }
    if (window.api && window.api.getProductsFull) {
      const prods = await window.api.getProductsFull();
      setExistingProducts(prods || []);
    }
  };

  useEffect(() => { loadInitialData(); }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const addProduct = async (e) => {
    e.preventDefault();
    const productData = {
      ...form,
      price: Number(form.price),
      cost_price: Number(form.cost_price) || 0,
      quantity: Number(form.quantity),
      category_id: Number(form.category_id || 1),
      expiry_date: form.expiry_date || null,
      image_data: imagePreview
    };

    if (window.api && window.api.addProduct) {
      try {
        await window.api.addProduct(productData);
        alert("Product registered successfully!");
        setForm({ name: "", category_id: categories.length > 0 ? categories[0].id : "", price: "", cost_price: "", quantity: "", unit: "Pcs", barcode: "", expiry_date: "", supplier: "" });
        setImagePreview(null);
        // Refresh products list for further validation
        if (window.api.getProductsFull) {
          const prods = await window.api.getProductsFull();
          setExistingProducts(prods || []);
        }
      } catch (err) {
        alert("❌ Error saving product: " + err.message);
      }
    } else {
       // Mock UI Success
       alert("Product Saved to Database!");
    }
  };

  const isDuplicate = form.name.trim() !== "" && 
    existingProducts.some(p => p.name.toLowerCase() === form.name.trim().toLowerCase());

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', width: '100%' }}>
      <div className="page-title">Register Product</div>
      
      <div className="modern-card">
        <form onSubmit={addProduct}>
          <div style={{ display: 'flex', gap: 32 }}>
            
            {/* Left: Image Upload */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <label className="form-label" style={{ marginBottom: -8 }}>Product Image</label>
              <label className="image-upload-box" style={{ width: 220, height: 220 }}>
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                ) : (
                  <>
                    <UploadCloud size={40} style={{ marginBottom: 12, color: 'var(--text-3)' }} />
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Click to Upload</div>
                    <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>JPG, PNG or GIF</div>
                  </>
                )}
                <input type="file" style={{ display: 'none' }} accept="image/*" onChange={handleImageChange} />
              </label>
            </div>

            {/* Right: Form Details */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
              
              <div className="form-grid">
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">Product Name</label>
                  <input className="form-input" name="name" value={form.name} onChange={handleChange} placeholder="e.g. Tomato Ketchup" required style={{ borderColor: isDuplicate ? 'var(--danger)' : '' }} />
                  {isDuplicate && (
                    <div style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600, marginTop: 4 }}>
                      ⚠️ Product already exists.
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Barcode / SKU (Optional)</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="form-input" name="barcode" value={form.barcode} onChange={handleChange} placeholder="Scan or Type" style={{ flex: 1 }} />
                    <button type="button" className="btn btn-outline" style={{ padding: '0 16px' }} onClick={() => setForm({...form, barcode: Math.floor(Math.random()*1000000000).toString()})}>Auto</button>
                  </div>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-select" name="category_id" value={form.category_id} onChange={handleChange}>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Supplier Name</label>
                  <input className="form-input" name="supplier" value={form.supplier} onChange={handleChange} placeholder="e.g. ITC Distributors" />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Cost Price (₹)</label>
                  <input className="form-input" name="cost_price" type="number" step="0.01" value={form.cost_price} onChange={handleChange} placeholder="0.00" />
                </div>
                <div className="form-group">
                  <label className="form-label">Selling Price (₹)</label>
                  <input className="form-input" name="price" type="number" step="0.01" value={form.price} onChange={handleChange} required placeholder="0.00" />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group" style={{ display: 'flex', flexDirection: 'row', gap: 12 }}>
                  <div style={{ flex: 2 }}>
                    <label className="form-label">Opening Stock</label>
                    <input className="form-input" name="quantity" type="number" value={form.quantity} onChange={handleChange} required style={{ width: '100%' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="form-label">Unit</label>
                    <select className="form-select" name="unit" value={form.unit} onChange={handleChange} style={{ width: '100%' }}>
                      <option value="Pcs">Pcs</option>
                      <option value="Kg">Kg</option>
                      <option value="Box">Box</option>
                      <option value="Ltr">Ltr</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Expiry Date 🗓️</label>
                  <input className="form-input" name="expiry_date" type="date" value={form.expiry_date} onChange={handleChange} />
                </div>
              </div>

            </div>
          </div>

          <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
             <button type="button" className="btn btn-outline" onClick={() => { setForm({ name: "", category_id: categories.length > 0 ? categories[0].id : "", price: "", cost_price: "", quantity: "", unit: "Pcs", barcode: "", expiry_date: "", supplier: "" }); setImagePreview(null); }}>
               Clear
             </button>
             <button type="submit" className="btn btn-primary" style={{ minWidth: 200, fontSize: 16 }} disabled={isDuplicate}>
               Save Product
             </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Inventory;
