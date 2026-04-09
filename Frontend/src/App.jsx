import React, { useState, useEffect } from "react";
import POS from "./components/POS";
import Inventory from "./components/Inventory";
import ProductList from "./components/ProductList";
import BulkUpdate from "./components/BulkUpdate";
import Settings from "./components/Settings";
import OwnerDashboard from "./components/OwnerDashboard";
import Chatbot from "./components/Chatbot";
import History from "./components/History";
import { LayoutDashboard, Monitor, Package, PlusCircle, ArrowDownToLine, Settings as SettingsIcon, Search, Sparkles, FileClock } from "lucide-react";

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
      <div className="modal-content" style={{ textAlign: 'center', maxWidth: 380 }}
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
        <button className="btn btn-outline" onClick={onClose} style={{ marginTop: 20, width: '100%' }}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

/* ── WhatsApp Status Pill ────────────────────────────────────── */
function WAPill({ status, onClick }) {
  const isConnected = status === 'ready';
  const label = isConnected ? '● WhatsApp Connected' : 'Connect to WhatsApp';
  const color = isConnected ? '#16a34a' : '#2563eb';
  const bg = isConnected ? '#f0fdf4' : '#eff6ff';

  return (
    <button onClick={!isConnected ? onClick : undefined} className="wa-pill" style={{
      background: bg, color: color, border: `1px solid ${color}30`, cursor: isConnected ? 'default' : 'pointer'
    }}>
      {label}
    </button>
  );
}

/* ── Main App ────────────────────────────────────────────────── */
function App() {
  const [currentView, setCurrentView] = useState('pos');
  const [waStatus,    setWaStatus]    = useState('connecting');
  const [qrData,      setQrData]     = useState(null);
  const [showQR,      setShowQR]     = useState(false);
  const [dashboardUrl, setDashboardUrl] = useState(null);
  const [showDashQR,  setShowDashQR] = useState(false);

  useEffect(() => {
    if (!window.api) return;

    window.api.onWhatsappQR?.(qr => {
      setQrData(qr);
      setWaStatus('qr');
      // Intentionally DO NOT auto-show the QR code modal
    });

    // Listen for status updates
    window.api.onWhatsappStatus?.(status => {
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
    { id: 'dashboard',    label: 'Dashboard',         icon: <LayoutDashboard size={20} /> },
    { id: 'pos',          label: 'Billing Terminal',  icon: <Monitor size={20} /> },
    { id: 'product_list', label: 'Master Inventory',  icon: <Package size={20} /> },
    { id: 'add_product',  label: 'Register Product',  icon: <PlusCircle size={20} /> },
    { id: 'bulk_update',  label: 'Bulk Stock Inward', icon: <ArrowDownToLine size={20} /> },
    { id: 'history',      label: 'History',           icon: <FileClock size={20} /> },
    { id: 'settings',     label: 'Settings',          icon: <SettingsIcon size={20} /> },
    { id: 'chatbot',      label: 'AI Chatbot',        icon: <Sparkles size={20} /> },
  ];

  return (
    <ErrorBoundary>
      <div className="app-container">

        {/* ── Sidebar ── */}
        <aside className="enterprise-sidebar">
          <div className="sidebar-brand">
            <div className="brand-logo-fallback"><span>iVA</span> POS</div>
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
            <button className="wa-pill" onClick={() => setShowDashQR(true)}
              style={{ background: '#7c3aed18', color: '#7c3aed', border: '1px solid #7c3aed40', marginBottom: 6 }}>
              📱 Owner Dashboard
            </button>
          )}

          {/* WhatsApp connection pill at bottom of sidebar */}
          <WAPill
            status={waStatus}
            onClick={() => {
              if (waStatus !== 'ready') {
                setShowQR(true);
              }
            }}
          />
        </aside>

        {/* ── Main workspace ────────────────────────────────── */}
        <main className="enterprise-main">
          {/* Top Bar */}
          <header className="enterprise-header">
            <div className="header-left">
              <div className="header-store-name">Supermarket POS</div>
              <div className="header-search">
                <Search size={18} />
                <input type="text" placeholder="Search customer, products..." />
              </div>
            </div>

            <div className="header-right">
              <div className="header-profile">
                <div className="profile-info">
                  <span className="profile-name">Store Admin</span>
                  <span className="profile-role">Manager</span>
                </div>
                <div className="profile-avatar">A</div>
              </div>
            </div>
          </header>

          {/* Active View Container */}
          <div className="enterprise-workspace">
            {currentView === 'dashboard'    && <OwnerDashboard />}
            {currentView === 'pos'          && <POS />}
            {currentView === 'add_product'  && <Inventory />}
            {currentView === 'product_list' && <ProductList />}
            {currentView === 'bulk_update'  && <BulkUpdate />}
            {currentView === 'history'      && <History />}
            {currentView === 'settings'     && <Settings />}
            {currentView === 'chatbot'      && <Chatbot />}
          </div>
        </main>

        {/* ── WhatsApp QR Modal ─────────────────────────────── */}
        {showQR && qrData && <WhatsAppQRModal qrData={qrData} onClose={() => setShowQR(false)} />}

        {/* ── Mobile Dashboard QR Modal ─────────────────── */}
        {showDashQR && dashboardUrl && (
          <div className="modal-overlay" onClick={() => setShowDashQR(false)}>
            <div className="modal-content" style={{ textAlign: 'center', maxWidth: 380 }}
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
              <button className="btn btn-outline" onClick={() => setShowDashQR(false)} style={{ marginTop: 14, width: '100%' }}>Close</button>
            </div>
          </div>
        )}

      </div>
    </ErrorBoundary>
  );
}

export default App;