import React from 'react';

const Navbar = ({ currentView, setCurrentView }) => {
  return (
    <div className="top-nav">
      <div style={{ marginRight: '40px', color: 'white', fontWeight: '900', fontSize: '1.4rem', letterSpacing: '1px' }}>
        SMART<span style={{ color: '#3498db' }}>POS</span>
      </div>

      <div 
        className={`nav-link ${currentView === 'pos' ? 'active' : ''}`}
        onClick={() => setCurrentView('pos')}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        Billing
      </div>

      <div 
        className={`nav-link ${currentView === 'add_product' ? 'active' : ''}`}
        onClick={() => setCurrentView('add_product')}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        Add Product
      </div>

      <div 
        className={`nav-link ${currentView === 'product_list' ? 'active' : ''}`}
        onClick={() => setCurrentView('product_list')}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
        Inventory List
      </div>

      <div 
        className={`nav-link ${currentView === 'bulk_update' ? 'active' : ''}`}
        onClick={() => setCurrentView('bulk_update')}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Bulk Update
      </div>
    </div>
  );
};

export default Navbar;
