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

  // Shop Supabase Connection
  const [shopUrl, setShopUrl] = useState("");
  const [shopKey, setShopKey] = useState("");
  const [shopConnStatus, setShopConnStatus] = useState("idle"); // idle, testing, connected, error
  const [shopConnMsg, setShopConnMsg] = useState("");
  const [syncStatus, setSyncStatus] = useState("idle"); // idle, syncing, done, error
  const [syncMsg, setSyncMsg] = useState("");
  const [lastSynced, setLastSynced] = useState("");

  // Local Database
  const [localDbPath, setLocalDbPath] = useState("");
  const [localDbSaved, setLocalDbSaved] = useState(false);
  const [localDbMsg, setLocalDbMsg] = useState("");

  // Validity
  const [validity, setValidity] = useState(null);

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

    // Load shop Supabase config
    window.api?.getShopSupabase?.().then(config => {
      if (config) {
        setShopUrl(config.supabase_url || "");
        setShopKey(config.supabase_key || "");
        setShopConnStatus(config.is_connected ? "connected" : "idle");
        setLastSynced(config.last_synced || "");
      }
    });

    // Load local DB path
    window.api?.getLocalDbPath?.().then(p => {
      if (p) setLocalDbPath(p);
    });

    // Load validity
    window.api?.getValidity?.().then(v => {
      if (v) setValidity(v);
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

  // Shop Supabase handlers
  const handleSaveShopSupabase = async () => {
    if (!shopUrl || !shopKey) {
      setShopConnMsg("Please enter both URL and Key.");
      setShopConnStatus("error");
      return;
    }
    setShopConnStatus("testing");
    setShopConnMsg("Connecting to Cloud...");
    try {
      const testResult = await window.api.testShopConnection({ url: shopUrl, key: shopKey });
      if (testResult.success) {
        const saveResult = await window.api.saveShopSupabase({ url: shopUrl, key: shopKey });
        if (saveResult.success) {
          setShopConnStatus("connected");
          setShopConnMsg("✅ Cloud Connected.");
          
          // 🔄 AUTOMATIC RESTORE
          // If we just linked a Supabase, we should automatically pull data.
          setSyncStatus("syncing");
          setSyncMsg("🔄 Automatically restoring your data from cloud...");
          const restoreRes = await window.api.restoreFromCloud();
          if (restoreRes.success) {
            setSyncStatus("done");
            setSyncMsg("✅ Data Restored Successfully! Refreshing...");
            setTimeout(() => window.location.reload(), 2000);
          } else {
            setSyncStatus("error");
            setSyncMsg("Connection ok, but restore failed: " + restoreRes.error);
          }
        } else {
          setShopConnStatus("error");
          setShopConnMsg("Save failed: " + saveResult.error);
        }
      } else {
        setShopConnStatus("error");
        setShopConnMsg("Connection failed: " + testResult.error);
      }
    } catch (e) {
      setShopConnStatus("error");
      setShopConnMsg("Error: " + e.message);
    }
  };

  const handleSyncShop = async () => {
    setSyncStatus("syncing");
    setSyncMsg("Syncing data to cloud...");
    try {
      const res = await window.api.syncShopData();
      if (res.success) {
        setSyncStatus("done");
        setSyncMsg("✅ " + res.message);
        setLastSynced(new Date().toLocaleString());
      } else {
        setSyncStatus("error");
        setSyncMsg("❌ " + res.error);
      }
    } catch (e) {
      setSyncStatus("error");
      setSyncMsg("Error: " + e.message);
    }
    setTimeout(() => setSyncStatus("idle"), 5000);
  };

  const handleRestoreFromCloud = async () => {
    if (!confirm("This will restore all data from your cloud database. Existing local data may be overwritten. Continue?")) return;
    setSyncStatus("syncing");
    setSyncMsg("Restoring data from cloud...");
    try {
      const res = await window.api.restoreFromCloud();
      if (res.success) {
        setSyncStatus("done");
        setSyncMsg("✅ " + res.message);
      } else {
        setSyncStatus("error");
        setSyncMsg("❌ " + res.error);
      }
    } catch (e) {
      setSyncStatus("error");
      setSyncMsg("Error: " + e.message);
    }
    setTimeout(() => setSyncStatus("idle"), 8000);
  };

  // Local DB handlers
  const handleBrowseFolder = async () => {
    const p = await window.api?.browseFolder?.();
    if (p) setLocalDbPath(p);
  };

  const handleSaveLocalDb = async () => {
    if (!localDbPath) {
      setLocalDbMsg("Please enter a storage path.");
      return;
    }
    try {
      const res = await window.api.saveLocalDbPath(localDbPath);
      if (res.success) {
        setLocalDbSaved(true);
        setLocalDbMsg("✅ " + res.message);
        setTimeout(() => { setLocalDbSaved(false); setLocalDbMsg(""); }, 3000);
      } else {
        setLocalDbMsg("❌ " + res.error);
      }
    } catch (e) {
      setLocalDbMsg("Error: " + e.message);
    }
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

  const actionBtnStyle = (color, isActive) => ({
    height: 36, padding: "0 18px", borderRadius: 8,
    border: "none", background: isActive ? "#16a34a" : color,
    color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
    transition: "all .3s", opacity: isActive ? 0.8 : 1,
    display: "inline-flex", alignItems: "center", gap: 6
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
        
        {/* ── SUPABASE CONNECTION (Shop-Specific) ── */}
        <SectionTitle icon="🔗" title="Supabase Connection (Shop Database)" />
        
        <div style={{ 
          padding: "20px", background: "linear-gradient(135deg, rgba(99,102,241,0.05), rgba(139,92,246,0.05))", 
          borderRadius: 12, border: "1px solid rgba(99,102,241,0.15)", marginBottom: 12, marginTop: 8 
        }}>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 16, lineHeight: 1.6 }}>
            Connect this shop to its <strong>own Supabase project</strong>. Each shop should have a separate Supabase database.
            After entering your credentials, click <strong>Save</strong> to connect and <strong>Sync</strong> to push/pull data.
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4, display: "block" }}>Supabase URL</label>
              <input 
                style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12 }} 
                value={shopUrl} 
                onChange={e => setShopUrl(e.target.value)} 
                placeholder="https://your-project.supabase.co" 
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 4, display: "block" }}>Supabase Anon Key</label>
              <input 
                style={{ ...inputStyle, fontFamily: "monospace", fontSize: 11 }} 
                value={shopKey} 
                onChange={e => setShopKey(e.target.value)} 
                placeholder="eyJhbGciOiJIUzI1NiIs..." 
              />
            </div>

            {/* Connection Status */}
            {shopConnMsg && (
              <div style={{
                padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: shopConnStatus === "connected" ? "rgba(16,185,129,0.1)" : shopConnStatus === "error" ? "rgba(239,68,68,0.1)" : "rgba(99,102,241,0.1)",
                color: shopConnStatus === "connected" ? "#10b981" : shopConnStatus === "error" ? "#ef4444" : "#6366f1",
                border: `1px solid ${shopConnStatus === "connected" ? "rgba(16,185,129,0.2)" : shopConnStatus === "error" ? "rgba(239,68,68,0.2)" : "rgba(99,102,241,0.2)"}`
              }}>
                {shopConnMsg}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button 
                onClick={handleSaveShopSupabase} 
                disabled={shopConnStatus === "testing"}
                style={actionBtnStyle("#6366f1", shopConnStatus === "connected")}
              >
                {shopConnStatus === "testing" ? "⏳ Testing..." : shopConnStatus === "connected" ? "✅ Connected" : "💾 Save & Connect"}
              </button>

              <button 
                onClick={handleSyncShop} 
                disabled={syncStatus === "syncing" || shopConnStatus !== "connected"}
                style={actionBtnStyle("#0ea5e9", syncStatus === "done")}
              >
                {syncStatus === "syncing" ? "⏳ Syncing..." : "🔄 Sync Data"}
              </button>

              <button 
                onClick={handleRestoreFromCloud} 
                disabled={syncStatus === "syncing" || shopConnStatus !== "connected"}
                style={actionBtnStyle("#f59e0b", false)}
              >
                📥 Restore from Cloud
              </button>
            </div>

            {/* Sync Status */}
            {syncMsg && (
              <div style={{
                padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: syncStatus === "done" ? "rgba(16,185,129,0.1)" : syncStatus === "error" ? "rgba(239,68,68,0.1)" : "rgba(14,165,233,0.1)",
                color: syncStatus === "done" ? "#10b981" : syncStatus === "error" ? "#ef4444" : "#0ea5e9",
              }}>
                {syncMsg}
              </div>
            )}

            {lastSynced && (
              <div style={{ fontSize: 11, color: "var(--text-4)" }}>
                Last synced: {lastSynced}
              </div>
            )}
          </div>
        </div>


        {/* ── LOCAL DATABASE ── */}
        <SectionTitle icon="💾" title="Local Database" />
        
        <div style={{ 
          padding: "20px", background: "rgba(255,255,255,0.03)", 
          borderRadius: 12, border: "1px solid var(--border)", marginBottom: 12, marginTop: 8 
        }}>
          <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 16, lineHeight: 1.6 }}>
            Store all billing data locally at a custom path. Data will be saved here first, and automatically synced to your online database when internet is available.
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input 
              style={{ ...inputStyle, flex: 1, fontFamily: "monospace", fontSize: 12 }} 
              value={localDbPath} 
              onChange={e => setLocalDbPath(e.target.value)} 
              placeholder="D:\BillingData\MyShop" 
            />
            <button 
              onClick={handleBrowseFolder}
              style={{
                height: 36, padding: "0 14px", borderRadius: 8,
                border: "1px solid var(--border-2)", background: "var(--surface-2)",
                color: "var(--text-1)", fontSize: 12, fontWeight: 700, cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              📁 Browse
            </button>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button 
              onClick={handleSaveLocalDb}
              style={actionBtnStyle("#334155", localDbSaved)}
            >
              {localDbSaved ? "✅ Path Saved" : "💾 Save Path"}
            </button>
            
            {localDbMsg && (
              <span style={{ 
                fontSize: 12, fontWeight: 600, 
                color: localDbMsg.startsWith("✅") ? "#10b981" : "#ef4444" 
              }}>
                {localDbMsg}
              </span>
            )}
          </div>

          {localDbPath && (
            <div style={{ 
              marginTop: 12, padding: "10px 14px", borderRadius: 8,
              background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.15)",
              fontSize: 11, color: "#10b981", fontFamily: "monospace"
            }}>
              📂 Active Path: {localDbPath}
            </div>
          )}
        </div>


        {/* ── VALIDITY STATUS ── */}
        {validity && (
          <>
            <SectionTitle icon="⏳" title="Subscription Status" />
            <div style={{ 
              padding: "20px", borderRadius: 12, marginBottom: 12, marginTop: 8,
              background: validity.valid 
                ? (validity.warningPhase ? "linear-gradient(135deg, rgba(245,158,11,0.08), rgba(251,191,36,0.08))" : "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(52,211,153,0.08))")
                : "linear-gradient(135deg, rgba(239,68,68,0.08), rgba(248,113,113,0.08))",
              border: `1px solid ${validity.valid ? (validity.warningPhase ? "rgba(245,158,11,0.2)" : "rgba(16,185,129,0.2)") : "rgba(239,68,68,0.2)"}`
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ 
                    fontSize: 14, fontWeight: 800, 
                    color: validity.valid ? (validity.warningPhase ? "#f59e0b" : "#10b981") : "#ef4444" 
                  }}>
                    {validity.valid 
                      ? (validity.warningPhase ? "⚠️ Subscription Expiring Soon" : "✅ Subscription Active")
                      : "🔴 Subscription Expired"
                    }
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
                    {validity.validityEnd ? `Expires: ${new Date(validity.validityEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}` : ""}
                    {validity.isOffline ? " (Offline cache)" : ""}
                  </div>
                </div>
                <div style={{ 
                  fontSize: 28, fontWeight: 900, 
                  color: validity.valid ? (validity.warningPhase ? "#f59e0b" : "#10b981") : "#ef4444"
                }}>
                  {validity.daysLeft} <span style={{ fontSize: 12, fontWeight: 600 }}>days left</span>
                </div>
              </div>
            </div>
          </>
        )}


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
