import React, { useState, useEffect } from "react";

const ProductList = () => {
  const [products, setProducts] = useState([]);
  
  const load = async () => {
    if (window.api && window.api.getProductsFull) {
      setProducts(await window.api.getProductsFull());
    }
  };
  
  useEffect(() => { load(); }, []);

  return (
    <div className="admin-scroll-area">
      <div className="admin-card" style={{ maxWidth: '100%' }}>
         <div className="admin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Inventory Records ({products.length})</span>
            <button className="btn-action" style={{ padding: '6px 15px', fontSize: '0.8rem' }} onClick={load}>Refresh Data</button>
         </div>

         <div className="admin-card-body" style={{ padding: '0' }}>
            <table className="data-table">
              <thead>
                <tr>
                   <th style={{ width: '80px', paddingLeft: '25px' }}>ID</th>
                   <th>Item Description</th>
                   <th>Barcode</th>
                   <th>Rate (₹)</th>
                   <th>Closing Stock</th>
                   <th>Unit</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                   <tr key={p.id}>
                      <td style={{ paddingLeft: '25px', color: '#64748b' }}>#{p.id}</td>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td style={{ fontFamily: 'monospace' }}>{p.barcode || '-'}</td>
                      <td style={{ fontWeight: 600, color: '#059669' }}>₹{p.price.toFixed(2)}</td>
                      <td style={{ fontWeight: 600 }}>{p.quantity}</td>
                      <td>{p.unit}</td>
                   </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '50px', color: '#94a3b8' }}>No records found.</td>
                  </tr>
                )}
              </tbody>
            </table>
         </div>
      </div>
    </div>
  );
};

export default ProductList;
