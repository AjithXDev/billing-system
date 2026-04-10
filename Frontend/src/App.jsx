import React, { useState, useEffect } from "react";
import POS from "./components/POS";
import Inventory from "./components/Inventory";
import ProductList from "./components/ProductList";
import BulkUpdate from "./components/BulkUpdate";
import Settings from "./components/Settings";
import logoUrl from "./assets/logo.png";
import "./App.css";

/* ── Mobile Dashboard View ────────── */
function MobileDashboardView() {
  const [url, setUrl] = useState("Generating...");
  useEffect(() => {
    window.api.getDashboardUrl().then(u => setUrl(u || "https://local-link-active.com"));
  }, []);

  return (
    <div className="admin-scroll-area">
      <div className="admin-card" style={{ maxWidth: 600, margin: '40px auto', textAlign: 'center' }}>
        <div className="admin-card-header">Owner Remote Access 📱</div>
        <div className="admin-card-body" style={{ padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 20 }}>🌍</div>
          <h2 style={{ marginBottom: 10 }}>Access From Anywhere</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 30 }}>
            Share this link to your phone or scan the QR code to track your business profit, stock, and analytics in real-time from anywhere in the world.
          </p>
          
          <div style={{ background: 'var(--surface-2)', padding: 15, borderRadius: 10, border: '1px solid var(--border)', marginBottom: 30 }}>
            <div style={{ fontSize: 11, color: 'var(--text-4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 5 }}>Your Public Link</div>
            <div style={{ color: 'var(--primary)', fontWeight: 800, fontSize: 16 }}>{url}</div>
          </div>

          <div style={{ background: '#fff', padding: 20, display: 'inline-block', borderRadius: 15, border: '1px solid var(--border)' }}>
             <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`} alt="QR" />
          </div>
          
          <div style={{ marginTop: 30, fontSize: 12, color: 'var(--text-4)' }}>
            ⚠️ Power and Internet must be ON at this Billing PC.
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Error Boundary ──────────────────────────────────────────── */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, errorInfo: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, errorInfo: error }; }
  componentDidCatch(error, errorInfo) { console.error("UI Crash:", error, errorInfo); }
  render() {
    if (this.state.hasError) return (
      <div style={{ padding: 50, fontFamily: 'monospace' }}>
        <h2>Crash Detected</h2>
        <p>{this.state.errorInfo?.toString()}</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
    return this.props.children;
  }
}

/* ── WhatsApp QR Modal ───────────────────────────────────────── */
function WhatsAppQRModal({ qrData, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="invoice-modal" style={{ textAlign: 'center', maxWidth: 380 }}
           onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
          📱 Link WhatsApp
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>
          Scan this QR with your phone's WhatsApp app to enable automatic billing messages.
        </p>
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrData)}`}
          alt="WhatsApp QR"
          style={{ borderRadius: 8, border: '1px solid var(--border)', width: 220, height: 220 }}
        />
        <p style={{ fontSize: 11.5, color: 'var(--text-4)', marginTop: 14 }}>
          WhatsApp → Linked Devices → Link a Device → Scan
        </p>
        <button className="btn-outline" onClick={onClose} style={{ marginTop: 20, width: '100%' }}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

/* ── WhatsApp Status Pill ────────────────────────────────────── */
function WAPill({ status, onClick }) {
  const map = {
    connecting:    { label: 'WhatsApp: Connecting…', color: '#d97706', bg: '#fffbeb' },
    qr:            { label: 'Scan QR to Link',        color: '#2563eb', bg: '#eff6ff' },
    authenticated: { label: 'WhatsApp: Linking…',     color: '#7c3aed', bg: '#f5f3ff' },
    ready:         { label: '● WhatsApp Connected',   color: '#16a34a', bg: '#f0fdf4' },
    disconnected:  { label: 'WhatsApp: Disconnected', color: '#dc2626', bg: '#fef2f2' },
  };
  const s = map[status] || map.connecting;
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 11px', borderRadius: 20,
      background: s.bg, color: s.color,
      border: `1px solid ${s.color}30`,
      fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
      marginTop: 'auto', marginBottom: 12, width: 'calc(100% - 16px)', marginLeft: 8,
      justifyContent: 'center', transition: 'opacity .15s'
    }}>
      {s.label}
    </button>
  );
}

/* ── Main App ────────────────────────────────────────────────── */
function App() {
  const [currentView, setCurrentView]   = useState('pos');
  const [waStatus,    setWaStatus]      = useState('connecting');
  const [qrData,      setQrData]        = useState(null);
  const [showQR,      setShowQR]        = useState(false);
  const [alertState,  setAlertState]    = useState({ lowStock: [], deadStock: [] });
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [lastNotified, setLastNotified] = useState(0); // timestamp to avoid spamming

  useEffect(() => {
    if (!window.api) return;

    // Listen for QR code from main process
    window.api.onWhatsappQR(qr => {
      setQrData(qr);
      setWaStatus('qr');
      setShowQR(true);   // auto-open QR modal
    });

    // Listen for status updates
    window.api.onWhatsappStatus(status => {
      setWaStatus(status);
      if (status === 'ready') setShowQR(false);
    });

    // Initial alert check & background monitor
    const checkAlerts = async () => {
      try {
        const raw = localStorage.getItem("smart_billing_settings");
        const cfg = raw ? JSON.parse(raw) : { lowStockThreshold: 5, deadStockThresholdDays: 30 };
        
        const stockAlerts = await window.api.getStockAlerts({
          lowStock: cfg.lowStockThreshold,
          deadStockDays: cfg.deadStockThresholdDays
        });

        // Identify NEW alerts to avoid re-notifying same items instantly
        const newLow = stockAlerts.lowStock.filter(p => !alertState.lowStock.find(ap => ap.id === p.id));
        const newDead = stockAlerts.deadStock.filter(p => !alertState.deadStock.find(ap => ap.id === p.id));

        if (newLow.length > 0 || newDead.length > 0) {
          setShowAlertModal(true); // Trigger pop-up only for NEW alerts
          
          // Send automatic message to owner if phone exists and WhatsApp is ready
          const now = Date.now();
          if (cfg.ownerPhone && now - lastNotified > 3600000) { // Max once per hour
            let msg = `⚠️ *Smart Billing Alert*\n\n`;
            if (newLow.length > 0) msg += `📉 *Low Stock:* ${newLow.map(p => p.name).join(', ')}\n`;
            if (newDead.length > 0) msg += `💀 *Dead Stock:* ${newDead.map(p => p.name).join(', ')}\n`;
            msg += `\nPlease check your inventory.`;

            window.api.sendWhatsapp(cfg.ownerPhone, msg).catch(console.error);
            setLastNotified(now);
          }
        }

        setAlertState(stockAlerts);
      } catch (err) {
        console.error("Alert check failed:", err);
      }
    };

    checkAlerts();
    const interval = setInterval(checkAlerts, 300000); // Check every 5 mins
    return () => clearInterval(interval);
  }, [alertState, lastNotified]);

  const navItems = [
    { id: 'pos',          label: 'Billing Terminal',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { id: 'product_list', label: 'Master Inventory',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><line x1="12" y1="22" x2="12" y2="12"/></svg> },
    { id: 'add_product',  label: 'Register Product',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> },
    { id: 'bulk_update',  label: 'Bulk Stock Inward', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> },
    { id: 'settings',     label: 'Settings',          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
  ];

  const viewLabels = { pos: 'Point of Sale', product_list: 'Inventory Management', add_product: 'Product Registration', bulk_update: 'Bulk Stock Entry', settings: 'Settings' };

  return (
    <ErrorBoundary>
      <div className="app-container">

        {/* ── Sidebar (hidden on full-screen POS) ───────────── */}
        {currentView !== 'pos' && (
          <aside className="enterprise-sidebar">
            <div className="sidebar-brand">
              <img src={logoUrl} alt="iVA INNOAIVATORS" className="brand-logo-img"
                onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
              <div className="brand-logo-fallback" style={{ display: 'none' }}>iVA</div>
            </div>

            <div className="sidebar-menu">
              <div className="sidebar-heading">MAIN MENU</div>
              {navItems.map(item => (
                <div key={item.id}
                  className={`sidebar-item ${currentView === item.id ? 'active' : ''}`}
                  onClick={() => setCurrentView(item.id)}>
                  <div className="sidebar-icon">
                    {item.icon}
                  </div>
                  <span className="sidebar-label">{item.label}</span>
                </div>
              ))}
            </div>

            {/* WhatsApp connection pill at bottom of sidebar */}
            <WAPill
              status={waStatus}
              onClick={() => waStatus === 'qr' ? setShowQR(true) : undefined}
            />
          </aside>
        )}

        {/* ── Main workspace ────────────────────────────────── */}
        <main className="enterprise-main">
          <header className="enterprise-header">
            <div className="header-breadcrumbs">
              <span className="breadcrumb-muted">Dashboard</span>
              <span className="breadcrumb-separator">/</span>
              <span className="breadcrumb-active">{viewLabels[currentView]}</span>
            </div>

            {/* WhatsApp pill in header when on POS view */}
            {currentView === 'pos' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <WAPill status={waStatus} onClick={() => waStatus === 'qr' ? setShowQR(true) : undefined} />
                <button className="btn-return-menu" onClick={() => setCurrentView('product_list')}>
                  ← Dashboard
                </button>
              </div>
            )}
          </header>
          
          <div className="enterprise-workspace">
            {currentView === 'pos'          && <POS />}
            {currentView === 'add_product'  && <Inventory />}
            {currentView === 'product_list' && <ProductList />}
            {currentView === 'bulk_update'  && <BulkUpdate />}
            {currentView === 'settings'     && <Settings />}
          </div>
        </main>

        {/* ── WhatsApp QR Modal ─────────────────────────────── */}
        {showQR && qrData && <WhatsAppQRModal qrData={qrData} onClose={() => setShowQR(false)} />}

        {/* 🚨 Stock Alert Modal */}
        {showAlertModal && (alertState.lowStock.length > 0 || alertState.deadStock.length > 0) && (
          <div className="modal-overlay" onClick={() => setShowAlertModal(false)}>
            <div className="invoice-modal" style={{ maxWidth: 450, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
              <h2 style={{ margin: '0 0 10px 0', color: 'var(--text-1)' }}>Inventory Warning</h2>
              <div style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 20 }}>
                {alertState.lowStock.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    📉 <b>{alertState.lowStock.length} items</b> are running low on stock.
                  </div>
                )}
                {alertState.deadStock.length > 0 && (
                  <div>
                    💀 <b>{alertState.deadStock.length} items</b> identified as dead stock (not sold recently).
                  </div>
                )}
                <div style={{ marginTop: 12, padding: 10, background: 'var(--surface-2)', borderRadius: 8, fontSize: 12 }}>
                  Owner has been notified via WhatsApp (if configured).
                </div>
              </div>
              <button className="btn-primary" style={{ width: '100%' }} onClick={() => setShowAlertModal(false)}>
                Okay, I'll Check
              </button>
            </div>
          </div>
        )}

      </div>
    </ErrorBoundary>
  );
}

export default App;