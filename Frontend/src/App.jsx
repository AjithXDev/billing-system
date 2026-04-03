import React, { useState, useEffect } from "react";
import POS from "./components/POS";
import Inventory from "./components/Inventory";
import ProductList from "./components/ProductList";
import BulkUpdate from "./components/BulkUpdate";
import Settings from "./components/Settings";
import logoUrl from "./assets/logo.png";
import "./App.css";

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
  const [dashboardUrl, setDashboardUrl] = useState(null);
  const [showDashQR,  setShowDashQR]    = useState(false);

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

    // Listen for dashboard server ready
    window.api.onDashboardReady?.(data => {
      setDashboardUrl(data.url);
    });

    // Also try to get URL if server already started
    window.api.getDashboardUrl?.().then(url => {
      if (url) setDashboardUrl(url);
    }).catch(() => {});
  }, []);

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
                  <div className="sidebar-icon">{item.icon}</div>
                  <span className="sidebar-label">{item.label}</span>
                </div>
              ))}
            </div>

            {/* 📱 Mobile Dashboard Link */}
            {dashboardUrl && (
              <button
                onClick={() => setShowDashQR(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 11px', borderRadius: 20,
                  background: '#7c3aed18', color: '#7c3aed',
                  border: '1px solid #7c3aed40',
                  fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                  marginBottom: 6, width: 'calc(100% - 16px)', marginLeft: 8,
                  justifyContent: 'center', transition: 'opacity .15s'
                }}
              >
                📱 Owner Dashboard
              </button>
            )}

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

        {/* ── Mobile Dashboard QR Modal ─────────────────── */}
        {showDashQR && dashboardUrl && (
          <div className="modal-overlay" onClick={() => setShowDashQR(false)}>
            <div className="invoice-modal" style={{ textAlign: 'center', maxWidth: 380 }}
                 onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>📱 Owner Mobile Dashboard</div>
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 16 }}>
                Scan this QR on your phone (same WiFi network) to open the Owner Dashboard.
              </p>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(dashboardUrl)}`}
                alt="Dashboard QR"
                style={{ borderRadius: 8, border: '1px solid var(--border)', width: 200, height: 200 }}
              />
              <p style={{
                fontSize: 12, color: 'var(--primary)', fontWeight: 700,
                marginTop: 14, letterSpacing: '.01em',
                background: 'var(--primary-light)', borderRadius: 8, padding: '8px 12px'
              }}>{dashboardUrl}</p>
              <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 6 }}>
                Make sure your phone is on the same WiFi as this computer.
              </p>
              <button className="btn-outline" onClick={() => setShowDashQR(false)} style={{ marginTop: 14, width: '100%' }}>Close</button>
            </div>
          </div>
        )}

      </div>
    </ErrorBoundary>
  );
}

export default App;