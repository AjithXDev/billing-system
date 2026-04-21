import React, { useState, useEffect } from "react";
import POS from "./components/POS";
import Inventory from "./components/Inventory";
import ProductList from "./components/ProductList";
import BulkUpdate from "./components/BulkUpdate";
import Settings from "./components/Settings";
import History from "./components/History";
import Offers from "./components/Offers";
import ShopRegistration from "./components/ShopRegistration";
import PairingCode from "./components/PairingCode";
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
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
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

import LockScreen from "./components/LockScreen";

/* ── Main App ────────────────────────────────────────────────── */
function App() {
  const [currentView, setCurrentView]   = useState('pos');
  const [waStatus,    setWaStatus]      = useState('connecting');
  const [qrData,      setQrData]        = useState(null);
  const [showQR,      setShowQR]        = useState(false);
  const [appSettings, setAppSettings]   = useState({});
  const [license,     setLicense]       = useState({ is_active: true, hwid: '' });
  const [checking,    setChecking]      = useState(true);
  const [isRegistered, setIsRegistered] = useState(true);
  const [shopId, setShopId]             = useState('');
  const [showPairing, setShowPairing]   = useState(false);
  const [validityWarning, setValidityWarning] = useState(null); // { daysLeft, validityEnd }
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [lockData, setLockData] = useState(null); // { reason, expiry }

  const navItems = [
    { id: 'pos',          label: 'Billing Terminal',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg> },
    { id: 'product_list', label: 'Master Inventory',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg> },
    { id: 'add_product',  label: 'Register Product',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg> },
    { id: 'bulk_update',  label: 'Bulk inward', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> },
    { id: 'offers',       label: 'Offers & Promos',   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg> },
    { id: 'history',      label: 'Invoice History',    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> },
    { id: 'settings',     label: 'General Settings',  icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg> },
  ];

  // 1. View Change Cleanup & Focus Management
  useEffect(() => {
    setShowQR(false); // Clear blocking modal
    setTimeout(() => {
      const focusTarget = document.querySelector('.enterprise-workspace input:not([type="hidden"]), .enterprise-workspace select');
      if (focusTarget) focusTarget.focus();
    }, 200);
  }, [currentView]);

  // 2. Load Settings Logic — always sync from file first (survives app restart)
  const loadSettings = async () => {
    try {
      // Priority 1: Read from app_settings.json via IPC (survives restarts)
      if (window.api?.getAppSettings) {
        const fileSettings = await window.api.getAppSettings();
        if (fileSettings && Object.keys(fileSettings).length > 0) {
          // Merge with any localStorage extras
          const raw = localStorage.getItem("smart_billing_settings");
          const localSettings = raw ? JSON.parse(raw) : {};
          const merged = { ...localSettings, ...fileSettings };
          // Push back to localStorage so POS/other components can read it
          localStorage.setItem("smart_billing_settings", JSON.stringify(merged));
          setAppSettings(merged);
          // Sync window title
          if (window.api?.setWindowTitle && merged.storeName) {
            window.api.setWindowTitle(merged.storeName);
          }
          return;
        }
      }
      // Priority 2: Fallback to localStorage only
      const raw = localStorage.getItem("smart_billing_settings");
      if (raw) setAppSettings(JSON.parse(raw));
    } catch (e) {
      console.error("Failed to load settings:", e);
      // Last resort: localStorage
      try {
        const raw = localStorage.getItem("smart_billing_settings");
        if (raw) setAppSettings(JSON.parse(raw));
      } catch {}
    }
  };

  // 3. Application Hard Refresh
  const handleRefresh = () => {
    window.location.reload();
  };

  const checkLicense = async () => {
    if (!window.api) return setChecking(false);
    try {
      const res = await window.api.getLicenseStatus();
      setLicense(res);

      if (res.needsRegistration) {
        setIsRegistered(false);
        setShopId('');
      }

      const validity = await window.api.getValidity?.();
      if (validity) {
        if (validity.warningPhase && !warningDismissed) {
          setValidityWarning({ daysLeft: validity.daysLeft, validityEnd: validity.validityEnd });
        }
        // Only lock if NOT pending (pending = newly registered, awaiting admin activation)
        if (!validity.valid && !validity.isPending) {
          setLockData({ 
            reason: !validity.isActive ? 'Account Deactivated' : 'Subscription Expired', 
            expiry: validity.validityEnd,
            isPending: false
          });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkLicense();
    loadSettings();
    checkRegistration();
    window.addEventListener('settings_updated', loadSettings);

    if (!window.api) return () => window.removeEventListener('settings_updated', loadSettings);

    // ⚡ Realtime Remote Lock/Unlock Listener
    window.api.onAppLock?.((data) => {
      setLockData(data);
    });

    window.api.onAppUnlock?.(() => {
      setLockData(null);
    });

    window.api.onWhatsappQR(qr => {
      setQrData(qr);
      setWaStatus('qr');
    });

    window.api.onWhatsappStatus(status => {
      setWaStatus(status);
      if (status === 'ready') setShowQR(false);
    });

    // ⚡ Initial check in case it's already ready or has QR waiting
    if (window.api.getWhatsappStatus) {
      window.api.getWhatsappStatus().then(res => {
        if (res.ready) {
          setWaStatus('ready');
        } else if (res.qr) {
          setQrData(res.qr);
          setWaStatus('qr');
        }
      }).catch(() => {});
    }

    return () => window.removeEventListener('settings_updated', loadSettings);
  }, []);

  // Check shop registration
  const checkRegistration = async () => {
    if (!window.api?.getRegistrationStatus) return;
    try {
      const res = await window.api.getRegistrationStatus();
      setIsRegistered(res.isRegistered);
      setShopId(res.shopId);
    } catch {}
  };

  if (checking) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white' }}>
      Authenticating...
    </div>
  );

  // 🏪 GATE 1: Registration (Always shows first if not linked)
  if (!isRegistered && window.api?.registerShop) {
    return (
      <ShopRegistration 
        onRegistered={(id) => { 
          // ⚡ Force an immediate clean reload to mount the full application safely
          // This fixes the bug where the lock screen cache stuck even after admin activation
          window.location.reload();
        }} 
      />
    );
  }

  // 🔒 GATE 2: Lock Screen (Deactivation or Expiry - ONLY for registered, previously-active shops)
  // isPending means newly registered but never activated — do NOT lock them, they wait via ShopRegistration pending screen
  const isDeactivatedLock = lockData && !lockData.isPending;
  const isLicenseLock = license && license.is_active === false && !license.needsRegistration && !license.isPending;
  if (isDeactivatedLock || isLicenseLock) {
    const reason = lockData?.reason || (license.note?.includes("deactivated") ? "Account Deactivated" : "Subscription Expired");
    const expiry = lockData?.expiry || "";
    return <LockScreen reason={reason} expiry={expiry} />;
  }

  return (
    <ErrorBoundary>
      {lockData && <LockScreen reason={lockData.reason} expiry={lockData.expiry} />}
      
      <div className="enterprise-container" style={{ visibility: lockData ? 'hidden' : 'visible' }}>

        <aside className="enterprise-sidebar">
          {/* Sidebar Branding Area */}
          <div className="sidebar-brand">
            {appSettings.billLogo ? (
              <img src={appSettings.billLogo} alt="Logo" className="brand-logo-img" />
            ) : (
              <div className="brand-logo-fallback">
                {(appSettings.storeName || "I").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="brand-meta">
              <span className="brand-name-text">{appSettings.storeName || "Innoaivators"}</span>
              <span className="brand-tagline">{appSettings.tagline || "Innovate, Create, Elevate"}</span>
            </div>
          </div>

          {/* Navigation Menu */}
          <nav className="sidebar-menu">
            <div className="sidebar-group">
              <div className="sidebar-heading">Management</div>
              {navItems.map(item => (
                <div 
                  key={item.id} 
                  className={`sidebar-item ${currentView === item.id ? "active" : ""}`}
                  onClick={() => setCurrentView(item.id)}
                >
                  <div className="sidebar-icon">{item.icon}</div>
                  <span className="sidebar-label">{item.label}</span>
                </div>
              ))}
            </div>
          </nav>

          {/* Bottom Area */}
          <div className="sidebar-bottom">
            {shopId && (
              <button onClick={() => setShowPairing(true)} className="btn-sidebar-secondary">
                🔗 Pair Mobile Device
              </button>
            )}
            <button 
              onClick={() => waStatus === 'qr' ? setShowQR(true) : undefined} 
              className="btn-sidebar-whatsapp"
              style={{ color: waStatus === 'ready' ? '#16a34a' : undefined }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
              {waStatus === 'connecting' ? 'Connecting...' : waStatus === 'qr' ? 'Scan to Connect' : 'WhatsApp Connected'}
            </button>
          </div>
        </aside>

        {/* ── Main Workspace ──────────────────────────────────── */}
        <main className="enterprise-main">

          {/* ── Validity Warning Banner ── */}
          {validityWarning && (
            <div style={{
              background: 'linear-gradient(135deg, #f59e0b, #d97706)',
              padding: '10px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              color: 'white', fontSize: 13, fontWeight: 700,
              animation: 'pulse 2s ease-in-out infinite',
              borderBottom: '2px solid #b45309'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <span>
                  Your subscription expires in <strong>{validityWarning.daysLeft} day{validityWarning.daysLeft !== 1 ? 's' : ''}</strong>.
                  Please complete payment to continue using the application.
                </span>
              </div>
              <button onClick={() => setValidityWarning(null)} style={{
                background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white',
                padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700
              }}>Dismiss</button>
            </div>
          )}
          
          {/* Dashboard Header */}
          <header className="enterprise-header">
            <div className="header-breadcrumbs">
              <span className="breadcrumb-muted">Innoaivators</span>
              <span className="breadcrumb-separator">/</span>
              <span className="breadcrumb-active">
                {currentView === 'pos' ? 'Billing Terminal' :
                 currentView === 'history' ? 'Invoice History' :
                 currentView === 'product_list' ? 'Master Inventory' :
                 currentView === 'add_product' ? 'Register Product' :
                 currentView === 'bulk_update' ? 'Bulk inward' : 
                 currentView === 'offers' ? 'Offers & Promos' : 'Settings'}
              </span>
            </div>

            <div className="header-right">
              <button 
                onClick={handleRefresh} 
                className="header-btn">
                <span>🔄</span> Refresh
              </button>
              <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 8px' }}></div>
              <button 
                onClick={() => window.api?.minimizeWindow()} 
                className="header-btn" title="Minimize">
                <span>➖</span>
              </button>
              <button 
                onClick={() => { if(confirm('Are you sure you want to close the application?')) window.api?.closeWindow() }} 
                className="header-btn btn-close-app" title="Close Application">
                <span>✖️</span>
              </button>
            </div>
          </header>
          
          <div className="enterprise-workspace">
            {currentView === 'pos'          && <POS showQR={showQR} />}
            {currentView === 'add_product'  && <Inventory />}
            {currentView === 'product_list' && <ProductList />}
            {currentView === 'bulk_update'  && <BulkUpdate />}
            {currentView === 'offers'       && <Offers />}
            {currentView === 'settings'     && <Settings />}
            {currentView === 'history'      && <History />}
          </div>
        </main>

        {/* ── WhatsApp QR Modal ─────────────────────────────── */}
        {showQR && qrData && <WhatsAppQRModal qrData={qrData} onClose={() => setShowQR(false)} />}

        {/* ── Pairing Code Modal ─────────────────────────────── */}
        {showPairing && <PairingCode shopId={shopId} onClose={() => setShowPairing(false)} />}

        {/* ── Validity Warning Modal ─────────────────────────────── */}
        {validityWarning && !warningDismissed && (
          <div className="modal-overlay" style={{ zIndex: 9999 }}>
            <div className="modal-content" style={{ maxWidth: '420px', textAlign: 'center', padding: '30px', borderRadius: '16px', background: '#1e293b', border: '1px solid #eab308' }}>
              <div style={{ fontSize: '40px', marginBottom: '10px' }}>\u23f3</div>
              <h2 style={{ color: '#f8fafc', marginBottom: '10px', fontSize: '20px' }}>Subscription Notice</h2>
              <p style={{ color: '#cbd5e1', fontSize: '15px', marginBottom: '25px' }}>
                Only <strong style={{ color: '#eab308' }}>{validityWarning.daysLeft} days</strong> remaining. Please pay the subscription amount.
              </p>
              <button 
                onClick={() => { setWarningDismissed(true); setValidityWarning(null); }}
                style={{ background: '#3b82f6', color: 'white', padding: '10px 24px', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer', outline: 'none' }}>
                OK
              </button>
            </div>
          </div>
        )}

      </div>
    </ErrorBoundary>
  );
}

export default App;