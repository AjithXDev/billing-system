import React, { useState, useEffect } from "react";
import POS from "./components/POS";
import Inventory from "./components/Inventory";
import ProductList from "./components/ProductList";
import BulkUpdate from "./components/BulkUpdate";
import Settings from "./components/Settings";
import History from "./components/History";
import OwnerDashboard from "./components/OwnerDashboard";
import logoUrl from "./assets/logo.png";
import { Search } from "lucide-react";
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
      <div className="invoice-modal" style={{ textAlign: 'center', maxWidth: 380, color: 'var(--text-1)' }}
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

/* ── Main App ────────────────────────────────────────────────── */
function App() {
  const [currentView, setCurrentView]   = useState('pos');
  const [waStatus,    setWaStatus]      = useState('connecting');
  const [qrData,      setQrData]        = useState(null);
  const [showQR,      setShowQR]        = useState(false);
  const [alertState,  setAlertState]    = useState({ lowStock: [], deadStock: [] });
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [lastNotified, setLastNotified] = useState(0);

  useEffect(() => {
    if (!window.api) return;

    window.api.onWhatsappQR(qr => {
      setQrData(qr);
      setWaStatus('qr');
      setShowQR(true);
    });

    window.api.onWhatsappStatus(status => {
      setWaStatus(status);
      if (status === 'ready') setShowQR(false);
    });

    const checkAlerts = async () => {
      try {
        const raw = localStorage.getItem("smart_billing_settings");
        const cfg = raw ? JSON.parse(raw) : { lowStockThreshold: 5, deadStockThresholdDays: 30 };
        
        const stockAlerts = await window.api.getStockAlerts({
          lowStock: cfg.lowStockThreshold,
          deadStockDays: cfg.deadStockThresholdDays
        });

        const newLow = stockAlerts.lowStock.filter(p => !alertState.lowStock.find(ap => ap.id === p.id));
        const newDead = stockAlerts.deadStock.filter(p => !alertState.deadStock.find(ap => ap.id === p.id));

        if (newLow.length > 0 || newDead.length > 0) {
          setShowAlertModal(true);
          
          const now = Date.now();
          if (cfg.ownerPhone && now - lastNotified > 3600000) {
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
    const interval = setInterval(checkAlerts, 300000);
    return () => clearInterval(interval);
  }, [alertState, lastNotified]);

  const navItems = [
    { id: 'dashboard',    label: 'Dashboard',         icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg> },
    { id: 'pos',          label: 'Billing Terminal',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg> },
    { id: 'product_list', label: 'Master Inventory',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg> },
    { id: 'add_product',  label: 'Register Product',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg> },
    { id: 'bulk_update',  label: 'Bulk Stock Inward', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> },
    { id: 'history',      label: 'History',           icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> },
    { id: 'settings',     label: 'Settings',          icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg> },
  ];

  return (
    <ErrorBoundary>
      <div className="app-container">

        {/* ── Sidebar ─────────────────────────────────────────── */}
        <aside className="enterprise-sidebar">
          <div className="sidebar-brand">
            <span style={{ fontSize: 20, fontWeight: 900, color: '#3b82f6', letterSpacing: -0.5 }}>iVA</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>POS</span>
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

          {/* Bottom Area */}
          <div className="sidebar-bottom">
            <button onClick={() => waStatus === 'qr' ? setShowQR(true) : undefined} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 8,
              background: '#f0fdf4', color: '#16a34a',
              border: `1px solid #16a34a30`, clear: 'both',
              fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
              justifyContent: 'center', transition: 'opacity .15s',
              marginTop: 4
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
              {waStatus === 'connecting' ? 'Connecting...' : waStatus === 'qr' ? 'Scan to Link' : 'WhatsApp Connected'}
            </button>
          </div>
        </aside>

        {/* ── Main Workspace ──────────────────────────────────── */}
        <main className="enterprise-main">
          
          {/* Top Global Header */}
          <header className="enterprise-header">
            <div className="header-title-area">
              <span className="header-app-title">Supermarket POS</span>
              <div className="header-search">
                <Search />
                <input type="text" placeholder="Search customer, products..." />
              </div>
            </div>

            <div className="header-right">
              <div className="header-user-info">
                <div className="header-user-name">
                  <div className="name">Store Admin</div>
                  <div className="role">Manager</div>
                </div>
                <div className="header-avatar">A</div>
              </div>
            </div>
          </header>
          
          <div className="enterprise-workspace">
            {currentView === 'dashboard'    && <OwnerDashboard />} {/* Fallback if missing OwnerDashboard separately */}
            {currentView === 'owner'        && <OwnerDashboard />}
            {currentView === 'pos'          && <POS />}
            {currentView === 'add_product'  && <Inventory />}
            {currentView === 'product_list' && <ProductList />}
            {currentView === 'bulk_update'  && <BulkUpdate />}
            {currentView === 'settings'     && <Settings />}
            {currentView === 'history'      && <History />}
          </div>
        </main>

        {/* ── WhatsApp QR Modal ─────────────────────────────── */}
        {showQR && qrData && <WhatsAppQRModal qrData={qrData} onClose={() => setShowQR(false)} />}

        {/* 🚨 Stock Alert Modal */}
        {showAlertModal && (alertState.lowStock.length > 0 || alertState.deadStock.length > 0) && (
          <div className="modal-overlay" onClick={() => setShowAlertModal(false)}>
            <div className="invoice-modal" style={{ maxWidth: 450, textAlign: 'center', color: 'var(--text-1)' }} onClick={e => e.stopPropagation()}>
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