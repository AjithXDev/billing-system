import React from 'react';

const Header = ({ title }) => {
  return (
    <div className="header">
      <div className="header-title">{title}</div>
      <div className="header-actions">
        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Admin User</span>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>
          AU
        </div>
      </div>
    </div>
  );
};

export default Header;
