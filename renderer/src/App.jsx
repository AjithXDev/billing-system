import React, { useState } from "react";
import POS from "./components/POS";
import Inventory from "./components/Inventory";
import ProductList from "./components/ProductList";
import BulkUpdate from "./components/BulkUpdate";
import "./App.css";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, errorInfo: error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("UI Crash Intercepted:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '50px', color: 'red', fontFamily: 'monospace' }}>
          <h2>Application Crash Detected!</h2>
          <p>{this.state.errorInfo && this.state.errorInfo.toString()}</p>
          <button onClick={() => window.location.reload()} style={{ padding: '10px' }}>Reload App</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [currentView, setCurrentView] = useState('pos');

  return (
    <ErrorBoundary>
      <div className="app-container">
      {/* VERTICAL ICON-ONLY SIDEBAR - HIDDEN ONLY ON POS SCREEN */}
      {currentView !== 'pos' && (
        <nav className="sidebar-vertical">
          <div className="sidebar-logo">S</div>

          <div 
            className={`sidebar-btn ${currentView === 'pos' ? 'active' : ''}`}
            onClick={() => setCurrentView('pos')}
            title="Billing Terminal"
          >
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>

          <div 
            className={`sidebar-btn ${currentView === 'add_product' ? 'active' : ''}`}
            onClick={() => setCurrentView('add_product')}
            title="Add New Product"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          </div>

          <div 
            className={`sidebar-btn ${currentView === 'product_list' ? 'active' : ''}`}
            onClick={() => setCurrentView('product_list')}
            title="Inventory List"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><line x1="12" y1="22" x2="12" y2="12"/></svg>
          </div>

          <div 
            className={`sidebar-btn ${currentView === 'bulk_update' ? 'active' : ''}`}
            onClick={() => setCurrentView('bulk_update')}
            title="Bulk Update Stock"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </div>
        </nav>
      )}

      {/* MAIN CONTENT WORKSPACE */}
      <main className="main-content">
        <header className="page-header" style={currentView === 'pos' ? { borderBottom: '1px solid #0284c7' } : {}}>
           <div className="page-title">
             {currentView === 'pos' && "Point of Sale (Billing)"}
             {currentView === 'add_product' && "Product Registration"}
             {currentView === 'product_list' && "Master Inventory"}
             {currentView === 'bulk_update' && "Bulk Stock Inward"}
           </div>

           {/* In POS view, we provide a menu button at the top header to return to Master Inventory */}
           {currentView === 'pos' && (
             <button 
                onClick={() => setCurrentView('product_list')}
                style={{
                  background: 'transparent', 
                  border: '1px solid #cbd5e1', 
                  padding: '6px 12px', 
                  borderRadius: '4px', 
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#475569'
                }}
             >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                Menu / Inventory
             </button>
           )}
        </header>
        
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          {currentView === 'pos' && <POS />}
          {currentView === 'add_product' && <Inventory />}
          {currentView === 'product_list' && <ProductList />}
          {currentView === 'bulk_update' && <BulkUpdate />}
        </div>
      </main>
    </div>
    </ErrorBoundary>
  );
}

export default App;