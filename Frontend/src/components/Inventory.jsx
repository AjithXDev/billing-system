import React, { useState, useEffect, useRef } from "react";
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from "html5-qrcode";

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
    image: "",
    default_discount: "",
    weight: "",
    brand: ""
  });
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isFetchingAPI, setIsFetchingAPI] = useState(false);
  const [detectedBarcode, setDetectedBarcode] = useState("");
  const [scanStatus, setScanStatus] = useState("Waiting for scanner...");
  const scanErrorCount = useRef(0);

  const loadCategories = async () => {
    if (window.api && window.api.getCategories) {
      const cats = await window.api.getCategories();
      setCategories(cats);
      if (cats.length > 0) {
        setForm(prev => ({ ...prev, category_id: cats[0].id }));
      }
    }
  };

  useEffect(() => {
    loadCategories();
    const onRefresh = () => loadCategories();
    window.addEventListener('soft_refresh', onRefresh);
    return () => window.removeEventListener('soft_refresh', onRefresh);
  }, []);

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
          image: form.image || null,
          weight: form.weight || null,
          brand: form.brand || null
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
          image: "",
          default_discount: "",
          weight: "",
          brand: ""
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

  const scannerRef = useRef(null);

  useEffect(() => {
    if (isScannerOpen && !scannerRef.current) {
      // Use explicit formats and horizontal qrbox to vastly improve 1D barcode success rate
      const scanner = new Html5QrcodeScanner("reader", { 
        fps: 20, // Increased FPS for faster detection
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          // Dynamic qrbox - horizontal for barcodes
          const width = viewfinderWidth * 0.8;
          const height = viewfinderHeight * 0.4;
          return { width, height };
        },
        aspectRatio: 1.0,
        showTorchButtonIfSupported: true,
        showZoomSliderIfSupported: true,
        rememberLastUsedCamera: true,
        useBarCodeDetectorIfSupported: true,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE
        ]
      }, false);
      scannerRef.current = scanner;
      
      setScanStatus("Camera active. Align barcode...");
      setDetectedBarcode("");
      scanErrorCount.current = 0;

      scanner.render(async (decodedText) => {
        // Validation: Ensure barcode is not just a few digits (most are 8+)
        if (!decodedText || decodedText.length < 8) {
          setScanStatus("⚠️ Incomplete scan. Hold steady...");
          return;
        }

        setDetectedBarcode(decodedText);
        setScanStatus("✅ Barcode captured! Fetching data...");
        
        // Success feedback
        if (scannerRef.current) {
          try { await scannerRef.current.clear(); } catch(e){}
          scannerRef.current = null;
        }
        
        setIsScannerOpen(false);
        setForm(prev => ({ ...prev, barcode: decodedText }));
        setIsFetchingAPI(true);
        
        try {
          // Add a small delay to ensure UI updates
          await new Promise(r => setTimeout(r, 400));
          const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${decodedText}.json`);
          const data = await res.json();
          
          if (data && data.status === 1) {
            const product = data.product;
            let updates = {};
            
            if (product.brands) {
              updates.brand = product.brands;
            }

            const rawName = product.product_name || product.product_name_en || product.generic_name || "";
            let baseName = product.brands ? `${product.brands} ${rawName}` : rawName;
            if (!baseName && product.brands) baseName = product.brands;

            // Integrates weight/size directly into the name as requested
            let weight = product.quantity || product.serving_size || "";
            if (weight && baseName) {
              updates.name = `${baseName} (${weight})`;
            } else if (baseName) {
              updates.name = baseName;
            } else if (weight) {
              updates.name = `Product (${weight})`;
            }

            // Still save weight to DB field for data integrity, even though UI input is removed
            if (weight) updates.weight = weight;

            // 3. IMAGE
            if (product.image_front_url || product.image_url || product.image_small_url) {
              updates.image = product.image_front_url || product.image_url || product.image_small_url;
            }

            // 4. CATEGORY MAPPING
            if (product.categories && categories.length > 0) {
              const catStr = product.categories.toLowerCase();
              const matched = categories.find(c => catStr.includes(c.name.toLowerCase()));
              if (matched) {
                updates.category_id = matched.id;
              }
            }
            
            setForm(prev => ({ ...prev, ...updates }));
            setScanStatus("✅ Product found and details filled!");
          } else {
             setScanStatus("❌ Product not found in database.");
             alert("Product details not found online. Please enter manually.");
          }
        } catch (err) {
          console.error("API Fetch Error:", err);
          setScanStatus("❌ Connection error while fetching data.");
        } finally {
          setIsFetchingAPI(false);
        }
      }, (error) => {
        // Show retry message if detecting but not decoding
        scanErrorCount.current += 1;
        if (scanErrorCount.current > 30) {
           setScanStatus("🔍 Align barcode clearly in the box...");
           scanErrorCount.current = 0;
        }
      });
    }

    return () => {
      // Cleanup on unmount or when `isScannerOpen` becomes false
      if (!isScannerOpen && scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [isScannerOpen, categories]);

  return (
    <div className="admin-scroll-area">
      <div className="admin-card">
        <div className="admin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Add New Product details</span>
          <button type="button" className="btn-primary" style={{ display: 'flex', gap: '8px', alignItems: 'center' }} onClick={() => setIsScannerOpen(true)}>
            📷 Add Product using Barcode
          </button>
        </div>
        <div className="admin-card-body">
          {isFetchingAPI && <div style={{ color: '#2563eb', marginBottom: '10px', fontWeight: 'bold' }}>Fetching product details...</div>}
          
          {isScannerOpen && (
            <div className="modal-overlay" onClick={() => setIsScannerOpen(false)}>
              <div className="invoice-modal" onClick={e => e.stopPropagation()} style={{ width: '450px', padding: '30px' }}>
                <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                   📸 Scan Product Barcode
                </h3>
                
                <div id="reader" style={{ width: '100%', borderRadius: '12px', overflow: 'hidden', border: '2px solid var(--border)', background: '#000' }}></div>
                
                <div style={{ marginTop: '20px', padding: '15px', background: '#f8fafc', borderRadius: '10px', textAlign: 'center' }}>
                   <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      Scanner Status
                   </div>
                   <div style={{ fontSize: '15px', fontWeight: '800', color: scanStatus.includes('✅') ? '#059669' : scanStatus.includes('⚠️') || scanStatus.includes('❌') ? '#ef4444' : '#2563eb' }}>
                      {scanStatus}
                   </div>
                   
                   {detectedBarcode && (
                     <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>DETECTED NUMBER</div>
                        <div style={{ fontSize: '20px', fontWeight: '900', color: '#1e293b', letterSpacing: '2px' }}>{detectedBarcode}</div>
                     </div>
                   )}
                </div>

                <div style={{ marginTop: '20px', fontSize: '11px', color: '#94a3b8', textAlign: 'center', fontStyle: 'italic' }}>
                   Ensure the barcode is well-lit and fits within the horizontal guide.
                </div>

                <button type="button" className="btn-outline" style={{ marginTop: '20px', width: '100%', height: '45px', fontWeight: '700' }} onClick={() => setIsScannerOpen(false)}>Cancel Scanning</button>
              </div>
            </div>
          )}

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
                 <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Product Name</label>
                    <input className="form-input" name="name" value={form.name} onChange={handleChange} placeholder="e.g. Dairy Milk (20g)" required autoFocus />
                 </div>
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <select className="form-select" name="category_id" value={form.category_id} onChange={handleChange}>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Brand</label>
                    <input className="form-input" name="brand" value={form.brand} onChange={handleChange} placeholder="e.g. Nestlé" />
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
              <div className="form-group">
                <label className="form-label">Default Discount (%)</label>
                <input className="form-input" name="default_discount" type="number" step="0.5" value={form.default_discount} onChange={handleChange} placeholder="e.g. 5" />
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
