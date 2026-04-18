import React, { useState, useEffect } from "react";

const DEFAULTS = {
  storeName: "",
  tagline: "",
  storePhone: "",
  storeAddress: "",
  gstNumber: "",
  invoicePrefix: "INV",
  lowStockThreshold: 10,
  deadStockThresholdDays: 30,
  expiryAlertDays: 3,
  ownerPhone: "",
  whatsappAlerts: true,
  isCloudEnabled: false,
  masterKey: "owner123",
  supabaseUrl: "",
  supabaseKey: "",
  billLogo: "",
  upiId: "",
};

function SettingRow({ label, children, hint }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "16px 0", borderBottom: "1px solid var(--border)", gap: 20
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-1)" }}>{label}</div>
        {hint && <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0, minWidth: 200 }}>{children}</div>
    </div>
  );
}

function SectionTitle({ icon, title }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "16px 0 8px", borderBottom: "2px solid var(--primary)",
      marginBottom: 4, marginTop: 20
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: "var(--primary)", letterSpacing: ".05em", textTransform: "uppercase" }}>{title}</span>
    </div>
  );
}

export default function Settings() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const [saved, setSaved] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState("");
  const [expoUrl, setExpoUrl] = useState("");
  const [showQR, setShowQR] = useState(false);

  const loadSettingsData = () => {
    try {
      const raw = localStorage.getItem("smart_billing_settings");
      if (raw) setCfg(prev => ({ ...prev, ...JSON.parse(raw) }));
    } catch (e) {}

    window.api?.getDashboardUrl?.().then(url => {
      if (url) setTunnelUrl(url);
    }).catch(() => {});

    window.api?.getLocalIp?.().then(ip => {
      if (ip) setExpoUrl(`exp://${ip}:8081`);
    }).catch(() => {});

    window.api?.getShopId?.().then(id => {
      if (id) setCfg(prev => ({ ...prev, shopId: id }));
    });
  };

  useEffect(() => {
    loadSettingsData();

    // Listen for completion
    window.api?.onTunnelReady?.(data => {
      setTunnelUrl(data.url);
    });

    window.addEventListener('soft_refresh', loadSettingsData);
    return () => window.removeEventListener('soft_refresh', loadSettingsData);
  }, []);

  const set = (key, val) => setCfg(prev => ({ ...prev, [key]: val }));

  const save = () => {
    localStorage.setItem("smart_billing_settings", JSON.stringify(cfg));
    window.api?.saveAppSettings?.(cfg);
    if (window.api?.setWindowTitle && cfg.storeName) window.api.setWindowTitle(cfg.storeName);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    window.dispatchEvent(new Event('settings_updated'));
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      set("billLogo", reader.result);
    };
    reader.readAsDataURL(file);
  };

  const inputStyle = {
    height: 36, padding: "0 12px", borderRadius: 8,
    border: "1px solid var(--border-2)",
    background: "var(--surface-2)", color: "var(--text-1)",
    fontSize: 13, width: "100%", outline: "none",
    fontFamily: "inherit"
  };

  const numInputStyle = { ...inputStyle, width: 100 };

  const toggleStyle = (active) => ({
    width: 44, height: 24, borderRadius: 12,
    background: active ? "var(--primary)" : "#cbd5e1",
    border: "none", cursor: "pointer", position: "relative",
    transition: "background 0.2s", padding: 0
  });

  const toggleKnob = (active) => ({
    width: 18, height: 18, borderRadius: "50%",
    background: "#fff", position: "absolute",
    top: 3, left: active ? 23 : 3,
    transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)"
  });

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 16, flexShrink: 0
      }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-1)", margin: 0 }}>Settings</h2>
          <div style={{ fontSize: 11.5, color: "var(--text-4)", marginTop: 3 }}>Configure your billing application</div>
        </div>
        <div>
          <button onClick={save} style={{
            height: 36, padding: "0 18px", borderRadius: 8,
            border: "none", background: saved ? "#16a34a" : "var(--primary)",
            color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
            transition: "background .3s"
          }}>{saved ? "Saved" : "Save Changes"}</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingRight: 10 }}>
        
        {/* ── STORE INFO ── */}
        <SectionTitle icon="" title="Store Information" />

        <SettingRow label="Store Name">
          <input style={inputStyle} value={cfg.storeName} onChange={e => set("storeName", e.target.value)} placeholder="My Supermarket" />
        </SettingRow>

        <SettingRow label="Tagline (Optional)">
          <input style={inputStyle} value={cfg.tagline} onChange={e => set("tagline", e.target.value)} placeholder="Quality products, Best prices!" />
        </SettingRow>

        <SettingRow label="Store Phone / Mobile">
          <input style={inputStyle} value={cfg.storePhone} onChange={e => set("storePhone", e.target.value)} placeholder="98765 43210" />
        </SettingRow>

        <SettingRow label="Store Address">
          <textarea style={{ ...inputStyle, height: 60, padding: "8px 12px", resize: "none" }} value={cfg.storeAddress} onChange={e => set("storeAddress", e.target.value)} placeholder="No.123, Main Street..." />
        </SettingRow>

        {/* ── BILLING SETTINGS ── */}
        <SectionTitle icon="" title="Billing Details" />

        <SettingRow label="GST Number">
          <input style={{ ...inputStyle, fontFamily: "monospace", letterSpacing: ".05em" }} value={cfg.gstNumber} onChange={e => set("gstNumber", e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" />
        </SettingRow>

        <SettingRow label="Invoice Prefix">
          <input style={{ ...inputStyle, width: 100 }} value={cfg.invoicePrefix} onChange={e => set("invoicePrefix", e.target.value.toUpperCase())} placeholder="INV" maxLength={6} />
        </SettingRow>

        {/* ── UPI PAYMENT SETTINGS ── */}
        <SectionTitle icon="" title="UPI Payment (QR Code)" />
        
        <SettingRow label="UPI ID (VPA)" hint="Used to generate dynamic QR codes for customers to pay. (e.g. shopname@okicici)">
          <input style={inputStyle} value={cfg.upiId} onChange={e => set("upiId", e.target.value)} placeholder="yourname@upi" />
        </SettingRow>

        {/* ── LOGO FOR BILL ── */}
        <SectionTitle icon="" title="Bill Logo" />

        <SettingRow label="Upload Store Logo" hint="Displayed on printed bills/receipts (black & white format)">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {cfg.billLogo ? (
              <div style={{ position: "relative" }}>
                <img
                  src={cfg.billLogo}
                  alt="Logo"
                  style={{
                    width: 60, height: 60, objectFit: "contain",
                    borderRadius: 8, border: "1px solid var(--border)",
                    filter: "grayscale(100%)"
                  }}
                />
                <button
                  onClick={() => set("billLogo", "")}
                  style={{
                    position: "absolute", top: -6, right: -6,
                    width: 18, height: 18, borderRadius: "50%",
                    background: "#ef4444", color: "white", border: "none",
                    fontSize: 10, cursor: "pointer", display: "flex",
                    alignItems: "center", justifyContent: "center"
                  }}
                >×</button>
              </div>
            ) : (
              <label style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 60, height: 60, borderRadius: 8,
                border: "2px dashed var(--border)", cursor: "pointer",
                background: "var(--surface-2)", fontSize: 10, fontWeight: 800, color: "var(--text-4)"
              }}>
                UPLOAD
                <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
              </label>
            )}
            {!cfg.billLogo && (
              <label style={{
                padding: "6px 14px", borderRadius: 8,
                background: "var(--primary)", color: "#fff",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: "none"
              }}>
                Choose File
                <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
              </label>
            )}
          </div>
        </SettingRow>

        {/* ── ALERT SETTINGS ── */}
        <SectionTitle icon="" title="System Alerts" />

        <SettingRow label="Low Stock Alert Level" hint="Products with stock ≤ this value trigger alerts">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="number" style={numInputStyle} value={cfg.lowStockThreshold} min={1} max={100}
              onChange={e => set("lowStockThreshold", Number(e.target.value))} />
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>units</span>
          </div>
        </SettingRow>

        <SettingRow label="Dead Stock Threshold">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="number" style={numInputStyle} value={cfg.deadStockThresholdDays} min={1} max={365}
              onChange={e => set("deadStockThresholdDays", Number(e.target.value))} />
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>days (unsold)</span>
          </div>
        </SettingRow>

        <SettingRow label="Expiry Warning Days" hint="Alert when a product has ≤ this many days to expire">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="number" style={numInputStyle} value={cfg.expiryAlertDays} min={1} max={90}
              onChange={e => set("expiryAlertDays", Number(e.target.value))} />
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>days</span>
          </div>
        </SettingRow>

        <SectionTitle icon="" title="Automation & Notifications" />

        <SettingRow label="Owner WhatsApp Number" hint="For automated stock/expiry alerts via WhatsApp">
          <input style={inputStyle} value={cfg.ownerPhone} onChange={e => set("ownerPhone", e.target.value)} placeholder="919876543210 (with country code)" />
        </SettingRow>

        <SettingRow label="WhatsApp Alerts" hint="Send automated alerts for low stock, out of stock, and expiry">
          <button
            onClick={() => set("whatsappAlerts", !cfg.whatsappAlerts)}
            style={toggleStyle(cfg.whatsappAlerts)}
          >
            <div style={toggleKnob(cfg.whatsappAlerts)} />
          </button>
        </SettingRow>

        <SectionTitle icon="" title="Terminal Security" />

        <SettingRow label="Master Access Key" hint="This is the password used to link your Mobile App.">
          <input style={{ ...inputStyle, fontFamily: "monospace", letterSpacing: ".1em" }} 
            value={cfg.masterKey} 
            onChange={e => set("masterKey", e.target.value)} 
            placeholder="Enter a secure key" />
        </SettingRow>

        <SettingRow label="System Shop ID" hint="Unique identifier for this terminal.">
          <input style={{ ...inputStyle, background: "#f1f5f9", cursor: "default", fontFamily: "monospace", color: "#64748b" }} 
            value={cfg.shopId || "ID NOT FOUND"} 
            readOnly />
        </SettingRow>


        {/* ── BACKUP SETTINGS ── */}
        <SectionTitle icon="🛡️" title="Backup & Protection" />
        <div style={{ padding: "20px", background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid var(--border)", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Database Backup</div>
          <p style={{ fontSize: 11.5, color: "var(--text-3)", marginBottom: 16 }}>
            Safely export your entire business database to your computer. We recommend doing this once a week.
          </p>
          <button 
            onClick={async () => {
              const res = await window.api.createBackup();
              if (res.success) alert(res.message);
              else alert("Backup failed: " + res.error);
            }}
            style={{
              background: "#334155", color: "white", border: "none", 
              padding: "10px 16px", borderRadius: 8, fontSize: 12, 
              fontWeight: 700, cursor: "pointer"
            }}
          >
            Create Local Backup Now
          </button>
        </div>


        {/* ── ABOUT BRAND ── */}
        <SectionTitle icon="" title="About Software" />

        <div style={{
          background: "linear-gradient(135deg, #0f172a, #1e293b)",
          border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: 16, padding: "32px 24px", marginTop: 12, marginBottom: 40,
          textAlign: "center",
          boxShadow: "0 10px 30px rgba(0,0,0,0.1)"
        }}>
          <div style={{ letterSpacing: "-.02em", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <span style={{ 
              fontSize: 28, fontWeight: 900, 
              background: "linear-gradient(135deg, #818cf8, #c084fc)", 
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" 
            }}>INNOAIVATORS</span>
          </div>
          <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.8, maxWidth: 500, margin: "0 auto" }}>
            <div style={{ color: "#38bdf8", fontWeight: 700, marginBottom: 16, fontSize: 13, letterSpacing: 0.8, textTransform: "uppercase" }}>
              Transforming ideas into innovative digital solutions through cutting-edge technology and creative excellence.
            </div>
            <p style={{marginBottom: 12}}>
              We are a visionary technology partner committed to empowering businesses through seamless digital transformation. Our expertise lies in crafting high-performance, intelligent systems that bridge the gap between offline reliability and cloud-scale intelligence.
            </p>
            <p style={{marginBottom: 12, fontSize: 13, fontStyle: "italic", color: "#cbd5e1"}}>
              Driven by innovation, built for excellence.
            </p>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 24 }}>
            <div style={{ background: "rgba(255,255,255,0.05)", padding: "8px 16px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)" }}>
              <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 800 }}>Version</span><br/>
              <span style={{ fontSize: 13, color: "#f8fafc", fontWeight: 700 }}>2.2.0 Enterprise</span>
            </div>
            <div style={{ background: "rgba(255,255,255,0.05)", padding: "8px 16px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)" }}>
              <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 800 }}>Core</span><br/>
              <span style={{ fontSize: 13, color: "#10b981", fontWeight: 700 }}>Local-First AI Engine</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
