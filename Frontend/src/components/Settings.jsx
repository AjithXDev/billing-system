import React, { useState, useEffect } from "react";

const DEFAULTS = {
  storeName: "",
  tagline: "",
  storePhone: "",
  storeAddress: "",
  gstNumber: "",
  invoicePrefix: "INV",
  lowStockThreshold: 5,
  deadStockThresholdDays: 30,
  expiryAlertDays: 7,
  ownerPhone: "",
  isCloudEnabled: false,
  masterKey: "owner123",
  supabaseUrl: "",
  supabaseKey: "",
};

function SettingRow({ label, children }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "16px 0", borderBottom: "1px solid var(--border)", gap: 20
    }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-1)", flex: 1 }}>{label}</div>
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
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("smart_billing_settings");
      if (raw) setCfg({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch (e) {}

    // Get Internet Tunnel URL (for anywhere access)
    // First try if it's already generated
    window.api?.getDashboardUrl?.().then(url => {
      if (url) setTunnelUrl(url);
    }).catch(() => {});

    // Listen for completion
    window.api?.onTunnelReady?.(data => {
      setTunnelUrl(data.url);
    });

    // Get Auto-generated Shop ID
    window.api?.getShopId?.().then(id => {
      if (id) setCfg(prev => ({ ...prev, shopId: id }));
    });
  }, []);

  const set = (key, val) => setCfg(prev => ({ ...prev, [key]: val }));

  const save = () => {
    localStorage.setItem("smart_billing_settings", JSON.stringify(cfg));
    window.api?.saveAppSettings?.(cfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const inputStyle = {
    height: 36, padding: "0 12px", borderRadius: 8,
    border: "1px solid var(--border-2)",
    background: "var(--surface-2)", color: "var(--text-1)",
    fontSize: 13, width: "100%", outline: "none",
    fontFamily: "inherit"
  };

  const numInputStyle = { ...inputStyle, width: 100 };

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

        {/* ── ALERT SETTINGS ── */}
        <SectionTitle icon="🔔" title="System Alerts" />

        <SettingRow label="Low Stock Alert Level">
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

        <SettingRow label="Expiry Warning Days">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="number" style={numInputStyle} value={cfg.expiryAlertDays} min={1} max={90}
              onChange={e => set("expiryAlertDays", Number(e.target.value))} />
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>days</span>
          </div>
        </SettingRow>

        <SectionTitle icon="📱" title="Automation & Notifications" />

        <SettingRow label="Owner WhatsApp Number">
          <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
            <input style={inputStyle} value={cfg.ownerPhone} onChange={e => set("ownerPhone", e.target.value)} placeholder="919876543210 (with country code)" />
            <span style={{ fontSize: 10, color: "var(--text-4)" }}>For automated stock/expiry alerts via WhatsApp.</span>
          </div>
        </SettingRow>

        <SectionTitle icon="☁️" title="Cloud Remote Sync" />
        
        <div style={{ padding: "16px 0", borderBottom: "1px solid var(--border)", display: 'flex', gap: 30, alignItems: 'center' }}>
           <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>Mobile App Quick Link</div>
              <p style={{ fontSize: 11.5, color: "var(--text-4)", marginTop: 6, lineHeight: 1.6 }}>
                Scan this QR code from your **iVA SmartBill mobile app** to automatically connect this terminal to your phone. 
                No manual entry required.
              </p>
              <div style={{ marginTop: 15, display: 'flex', gap: 10 }}>
                 <div style={{ padding: '4px 12px', background: 'var(--surface-3)', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>
                    ID: {cfg.shopId || '...'}
                 </div>
                 <div style={{ padding: '4px 12px', background: '#dcfce7', color: '#166534', borderRadius: 20, fontSize: 10, fontWeight: 700 }}>
                    SYNC ENABLED
                 </div>
              </div>
           </div>
           <div style={{ background: '#fff', padding: 12, borderRadius: 16, border: '1px solid var(--border)' }}>
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(JSON.stringify({
                  shopId: cfg.shopId,
                  masterKey: cfg.masterKey
                }))}`} 
                alt="Quick Link QR" 
                style={{ width: 140, height: 140 }}
              />
           </div>
        </div>

        <SettingRow label="Master Access Key">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <input style={{ ...inputStyle, fontFamily: "monospace" }} type="text" value={cfg.masterKey} onChange={e => set("masterKey", e.target.value)} placeholder="Key for mobile login" />
            <span style={{ fontSize: 10, color: "var(--text-4)" }}>Required to unlock your dashboard on mobile. Change this for security.</span>
          </div>
        </SettingRow>

        <SettingRow label="Background Auto-Sync">
          <input type="checkbox" checked={cfg.isCloudEnabled} onChange={e => set("isCloudEnabled", e.target.checked)} />
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
            <i>“Turning raw data into smarter decisions.”</i>
          </div>
          <div style={{ marginTop: 16, fontSize: 10.5, color: "var(--text-4)", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700 }}>
            Version 2.0.0 · Local-First Architecture
          </div>
        </div>

      </div>
    </div>
  );
}
