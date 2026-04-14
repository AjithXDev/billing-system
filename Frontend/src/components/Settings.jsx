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
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-1)", margin: 0 }}>⚙️ Settings</h2>
          <div style={{ fontSize: 11.5, color: "var(--text-4)", marginTop: 3 }}>Configure your billing application</div>
        </div>
        <div>
          <button onClick={save} style={{
            height: 36, padding: "0 18px", borderRadius: 8,
            border: "none", background: saved ? "#16a34a" : "var(--primary)",
            color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
            transition: "background .3s"
          }}>{saved ? "✅ Saved!" : "💾 Save Changes"}</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingRight: 10 }}>
        
        {/* ── STORE INFO ── */}
        <SectionTitle icon="🏪" title="Store Information" />

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
        <SectionTitle icon="🧾" title="Billing Details" />

        <SettingRow label="GST Number">
          <input style={{ ...inputStyle, fontFamily: "monospace", letterSpacing: ".05em" }} value={cfg.gstNumber} onChange={e => set("gstNumber", e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" />
        </SettingRow>

        <SettingRow label="Invoice Prefix">
          <input style={{ ...inputStyle, width: 100 }} value={cfg.invoicePrefix} onChange={e => set("invoicePrefix", e.target.value.toUpperCase())} placeholder="INV" maxLength={6} />
        </SettingRow>

        {/* ── LOGO FOR BILL ── */}
        <SectionTitle icon="🖼️" title="Bill Logo" />

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
                background: "var(--surface-2)", fontSize: 24, color: "var(--text-4)"
              }}>
                📷
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
        <SectionTitle icon="🔔" title="System Alerts" />

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

        <SectionTitle icon="📱" title="Automation & Notifications" />

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


        {/* ── ABOUT BRAND ── */}
        <SectionTitle icon="ℹ️" title="About Software" />

        <div style={{
          background: "linear-gradient(135deg, var(--surface-2), var(--surface))",
          border: "1px solid var(--border)",
          borderRadius: 12, padding: 24, marginTop: 12, marginBottom: 40,
          textAlign: "center"
        }}>
          <div style={{ letterSpacing: "-.02em", marginBottom: 8 }}>
            <span style={{ fontSize: 24, fontWeight: 900, color: "var(--primary)" }}>INNOAIVATORS</span>
            <span style={{ fontSize: 24, fontWeight: 900, color: "var(--text-1)", marginLeft: 6 }}>TECHNOLOGIES</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-3)", lineHeight: 1.7, maxWidth: 400, margin: "0 auto" }}>
            <div style={{ color: "var(--text-2)", fontWeight: 600, marginBottom: 8 }}>Next-Gen Business Analytics & Retail Systems</div>
            We empower local businesses with hyper-fast offline billing coupled with real-time cloud analytics.<br/><br/>
            <i>"Turning raw data into smarter decisions."</i>
          </div>
          <div style={{ marginTop: 16, fontSize: 10.5, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700 }}>
            Version 2.1.0 · Local-First Architecture
          </div>
        </div>

      </div>
    </div>
  );
}
