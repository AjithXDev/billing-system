import React, { useState, useEffect } from "react";
import { Save, Store, Receipt, Bell, Moon, Sun } from "lucide-react";

export default function Settings() {
  const [cfg, setCfg] = useState({
    storeName: "Supermarket POS",
    storeAddress: "",
    gstNumber: "",
    invoicePrefix: "INV",
    lowStockThreshold: 5,
    theme: "light",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("smart_billing_settings");
      if (raw) setCfg(JSON.parse(raw));
    } catch (e) {}
  }, []);

  const handleChange = (e) => {
    setCfg({ ...cfg, [e.target.name]: e.target.value });
  };

  const handleTheme = (theme) => {
    setCfg({ ...cfg, theme });
    // Real implementation would inject CSS variables based on theme
  };

  const save = () => {
    localStorage.setItem("smart_billing_settings", JSON.stringify(cfg));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Settings</span>
        <button className="btn btn-primary" onClick={save} style={{ background: saved ? 'var(--success)' : 'var(--primary)' }}>
          <Save size={18} /> {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 800 }}>
          
          {/* Store Info */}
          <div className="modern-card">
            <h3 style={{ fontSize: 18, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Store size={20} color="var(--primary)" /> Store Information
            </h3>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Store Name</label>
                <input className="form-input" name="storeName" value={cfg.storeName} onChange={handleChange} placeholder="Supermarket XYZ" />
              </div>
              <div className="form-group">
                <label className="form-label">GST Number</label>
                <input className="form-input" name="gstNumber" value={cfg.gstNumber} onChange={handleChange} placeholder="22AAAAA0000A1Z5" />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Address</label>
                <input className="form-input" name="storeAddress" value={cfg.storeAddress} onChange={handleChange} placeholder="Full address for invoice printing..." />
              </div>
            </div>
          </div>

          {/* Invoice Settings */}
          <div className="modern-card">
            <h3 style={{ fontSize: 18, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Receipt size={20} color="var(--primary)" /> Invoice Settings
            </h3>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Invoice Prefix</label>
                <input className="form-input" name="invoicePrefix" value={cfg.invoicePrefix} onChange={handleChange} placeholder="INV" />
              </div>
              <div className="form-group">
                <label className="form-label">Invoice Footer Message</label>
                <input className="form-input" name="footerMessage" value={cfg.footerMessage || ""} onChange={handleChange} placeholder="Thank you for shopping with us!" />
              </div>
            </div>
          </div>

          {/* Theme Settings */}
          <div className="modern-card">
            <h3 style={{ fontSize: 18, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Moon size={20} color="var(--primary)" /> Appearance
            </h3>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Application Theme</label>
                <div style={{ display: 'flex', gap: 16 }}>
                  <button 
                    className={`btn ${cfg.theme === 'light' ? 'btn-primary' : 'btn-outline'}`} 
                    onClick={() => handleTheme('light')}
                    style={{ flex: 1 }}
                  >
                    <Sun size={18} /> Light Mode
                  </button>
                  <button 
                    className={`btn ${cfg.theme === 'dark' ? 'btn-primary' : 'btn-outline'}`} 
                    onClick={() => handleTheme('dark')}
                    style={{ flex: 1 }}
                  >
                    <Moon size={18} /> Dark Mode
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
