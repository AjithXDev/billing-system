import React, { useState, useEffect } from "react";

export default function Offers() {
  const [offers, setOffers] = useState([]);
  const [products, setProducts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    id: null,
    name: "",
    status: 1,
    buy_product_id: "",
    buy_product_name: "",
    buy_quantity: 1,
    free_product_id: "",
    free_product_name: "",
    free_quantity: 1,
  });
  const [isEditing, setIsEditing] = useState(false);

  // Custom Searchable Dropdown component
  const SearchableSelect = ({ options, value, onChange, placeholder, style }) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const [filteredOptions, setFilteredOptions] = useState(options);
    const dropdownRef = React.useRef(null);

    useEffect(() => {
      setFilteredOptions(options.filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase())));
    }, [searchTerm, options]);

    useEffect(() => {
      const opt = options.find(o => o.value === value);
      if (opt) setSearchTerm(opt.label);
      else if (!value) setSearchTerm("");
    }, [value, options]);

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
      <div style={{ position: "relative", width: "100%" }} ref={dropdownRef}>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
            onChange(""); 
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          style={style}
          required={!value} // Require selection for form validation
        />
        {isOpen && filteredOptions.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0,
            background: "white", border: "1px solid #e2e8f0", 
            borderRadius: 8, marginTop: 4, zIndex: 1000, 
            maxHeight: 200, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
          }}>
            {filteredOptions.map((opt) => (
              <div
                key={opt.value}
                style={{
                  padding: "8px 12px", fontSize: 13, cursor: "pointer",
                  borderBottom: "1px solid #f1f5f9", background: "white", color: "#1e293b"
                }}
                onMouseOver={e => e.currentTarget.style.background = "#f8fafc"}
                onMouseOut={e => e.currentTarget.style.background = "white"}
                onMouseDown={() => {
                  setSearchTerm(opt.label);
                  onChange(opt.value);
                  setIsOpen(false);
                }}
              >
                {opt.label} <span style={{ color: "#94a3b8", fontSize: "11px", marginLeft: 4 }}>(Stock: {opt.quantity})</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    fetchOffers();
    fetchProducts();

    const onRefresh = () => { fetchOffers(); fetchProducts(); };
    window.addEventListener("soft_refresh", onRefresh);
    return () => window.removeEventListener("soft_refresh", onRefresh);
  }, []);

  const fetchOffers = async () => {
    try {
      if (window.api && window.api.getOffers) {
        const data = await window.api.getOffers();
        setOffers(data);
      }
    } catch (error) {
      console.error("Failed to fetch offers", error);
    }
  };

  const fetchProducts = async () => {
    try {
      if (window.api && window.api.getProductsFull) {
        const data = await window.api.getProductsFull();
        setProducts(data);
      }
    } catch (error) {
      console.error("Failed to fetch products", error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name.includes("id") || name.includes("quantity") ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.buy_product_id || !formData.free_product_id) {
      alert("Please select valid products from the list");
      return;
    }
    
    const finalData = {
      ...formData,
      name: `Buy ${formData.buy_quantity} ${formData.buy_product_name} Get ${formData.free_quantity} ${formData.free_product_name} Free`
    };

    try {
      if (isEditing) {
        await window.api.editOffer(finalData);
      } else {
        await window.api.addOffer(finalData);
      }
      setShowModal(false);
      fetchOffers();
      resetForm();
    } catch (error) {
      console.error("Failed to save offer", error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this offer?")) {
      await window.api.deleteOffer(id);
      fetchOffers();
    }
  };

  const toggleStatus = async (offer) => {
    const newStatus = offer.status === 1 ? 0 : 1;
    await window.api.toggleOfferStatus({ id: offer.id, status: newStatus });
    fetchOffers();
  };

  const openEditModal = (offer) => {
    setFormData({
      ...offer,
      buy_product_name: offer.buy_product_name || "",
      free_product_name: offer.free_product_name || ""
    });
    setIsEditing(true);
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      id: null,
      name: "",
      status: 1,
      buy_product_id: "",
      buy_product_name: "",
      buy_quantity: 1,
      free_product_id: "",
      free_product_name: "",
      free_quantity: 1,
    });
    setIsEditing(false);
  };

  /* ─── Inline Styles (matching existing project design system) ─── */
  const styles = {
    page: {
      padding: "30px 40px 40px 40px",
      maxWidth: 1200,
      margin: "0 auto",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      fontFamily: "Inter, system-ui, sans-serif",
    },
    headerCard: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-end",
      background: "white",
      padding: "24px 28px",
      borderRadius: 16,
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      border: "1px solid #e2e8f0",
      marginBottom: 28,
    },
    title: {
      fontSize: 26,
      fontWeight: 800,
      color: "#1e293b",
      letterSpacing: "-0.5px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      margin: 0,
    },
    titleIcon: {
      width: 32,
      height: 32,
      borderRadius: 8,
      background: "linear-gradient(135deg, #4f46e5, #6366f1)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "white",
      fontSize: 18,
    },
    subtitle: {
      color: "#64748b",
      marginTop: 6,
      fontWeight: 500,
      fontSize: 14,
    },
    btnPrimary: {
      background: "linear-gradient(135deg, #4f46e5, #6366f1)",
      color: "white",
      border: "none",
      padding: "12px 24px",
      borderRadius: 12,
      fontWeight: 700,
      fontSize: 14,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: 8,
      boxShadow: "0 4px 14px rgba(79, 70, 229, 0.3)",
      transition: "all 0.2s ease",
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
      gap: 20,
      overflowY: "auto",
      paddingBottom: 30,
    },
    emptyState: {
      gridColumn: "1 / -1",
      border: "2px dashed #e2e8f0",
      borderRadius: 16,
      padding: "60px 40px",
      textAlign: "center",
      color: "#94a3b8",
      background: "white",
    },
    emptyIcon: {
      fontSize: 52,
      marginBottom: 16,
      opacity: 0.5,
    },
    card: (isActive) => ({
      background: "white",
      borderRadius: 16,
      padding: "24px",
      border: `1px solid ${isActive ? "#e0e7ff" : "#e2e8f0"}`,
      boxShadow: isActive ? "0 4px 16px rgba(79, 70, 229, 0.08)" : "0 1px 3px rgba(0,0,0,0.04)",
      position: "relative",
      transition: "all 0.25s ease",
      opacity: isActive ? 1 : 0.7,
    }),
    cardTitle: {
      fontSize: 18,
      fontWeight: 800,
      color: "#1e293b",
      paddingRight: 36,
      marginBottom: 14,
      lineHeight: "1.3",
    },
    toggleBtn: (isActive) => ({
      position: "absolute",
      top: 24,
      right: 24,
      background: "none",
      border: "none",
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 700,
      padding: "4px 12px",
      borderRadius: 20,
      color: isActive ? "#16a34a" : "#94a3b8",
      backgroundColor: isActive ? "#dcfce7" : "#f1f5f9",
      transition: "all 0.2s",
    }),
    conditionBox: {
      background: "#f8fafc",
      borderRadius: 12,
      padding: "14px 16px",
      marginBottom: 18,
      border: "1px solid #f1f5f9",
    },
    condRow: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      fontSize: 14,
      color: "#475569",
      marginBottom: 6,
    },
    condLabel: {
      fontWeight: 800,
      color: "#1e293b",
      fontSize: 13,
    },
    condQty: (color) => ({
      background: color === "green" ? "#dcfce7" : "#e0e7ff",
      color: color === "green" ? "#16a34a" : "#4338ca",
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 12,
      fontWeight: 800,
    }),
    freeBadge: {
      marginLeft: "auto",
      fontSize: 11,
      fontWeight: 800,
      color: "white",
      background: "linear-gradient(135deg, #10b981, #059669)",
      padding: "3px 10px",
      borderRadius: 4,
    },
    disabledBadge: {
      position: "absolute",
      top: -10,
      left: -10,
      background: "#64748b",
      color: "white",
      fontSize: 10,
      fontWeight: 800,
      padding: "4px 12px",
      borderRadius: 20,
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      border: "2px solid white",
      zIndex: 1,
    },
    cardActions: {
      display: "flex",
      gap: 8,
      justifyContent: "flex-end",
      borderTop: "1px solid #f1f5f9",
      paddingTop: 14,
    },
    actionBtn: (hoverColor) => ({
      background: "none",
      border: "1px solid #e2e8f0",
      borderRadius: 8,
      padding: "6px 14px",
      cursor: "pointer",
      fontSize: 12,
      fontWeight: 600,
      color: "#64748b",
      display: "flex",
      alignItems: "center",
      gap: 5,
      transition: "all 0.2s",
    }),
    /* Modal */
    modalOverlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(15, 23, 42, 0.5)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      zIndex: 999,
    },
    modalBox: {
      background: "white",
      borderRadius: 20,
      boxShadow: "0 25px 60px rgba(0,0,0,0.2)",
      width: "100%",
      maxWidth: 520,
      overflow: "hidden",
      animation: "slideUp 0.25s ease",
    },
    modalHeader: {
      padding: "20px 24px",
      borderBottom: "1px solid #f1f5f9",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      background: "#f8fafc",
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: 800,
      color: "#1e293b",
      display: "flex",
      alignItems: "center",
      gap: 10,
    },
    modalClose: {
      background: "none",
      border: "none",
      fontSize: 20,
      color: "#94a3b8",
      cursor: "pointer",
      padding: "4px 8px",
      borderRadius: 6,
    },
    formBody: {
      padding: "24px",
      display: "flex",
      flexDirection: "column",
      gap: 18,
    },
    formLabel: {
      display: "block",
      fontSize: 12,
      fontWeight: 700,
      color: "#475569",
      marginBottom: 6,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    formInput: {
      width: "100%",
      border: "2px solid #e2e8f0",
      padding: "10px 14px",
      borderRadius: 10,
      fontSize: 14,
      outline: "none",
      transition: "border-color 0.2s",
      boxSizing: "border-box",
      fontFamily: "inherit",
    },
    formSelect: {
      width: "100%",
      border: "1px solid #cbd5e1",
      padding: "10px 12px",
      borderRadius: 8,
      fontSize: 13,
      outline: "none",
      background: "white",
      boxSizing: "border-box",
      fontFamily: "inherit",
    },
    formSection: (isBuy) => ({
      background: isBuy ? "#f8fafc" : "#eff6ff",
      padding: "16px",
      borderRadius: 12,
      border: `1px solid ${isBuy ? "#e2e8f0" : "#dbeafe"}`,
      position: "relative",
    }),
    sectionTitle: {
      fontWeight: 800,
      fontSize: 14,
      color: "#334155",
      marginBottom: 12,
      display: "flex",
      alignItems: "center",
      gap: 6,
    },
    rewardTag: {
      position: "absolute",
      top: -10,
      right: 14,
      background: "linear-gradient(135deg, #10b981, #059669)",
      color: "white",
      fontSize: 10,
      fontWeight: 800,
      padding: "3px 10px",
      borderRadius: 4,
      boxShadow: "0 2px 6px rgba(16, 185, 129, 0.3)",
    },
    formRow: {
      display: "grid",
      gridTemplateColumns: "1fr 100px",
      gap: 12,
    },
    formActions: {
      display: "flex",
      justifyContent: "flex-end",
      gap: 12,
      paddingTop: 6,
    },
    btnCancel: {
      padding: "10px 20px",
      background: "none",
      border: "none",
      color: "#64748b",
      fontWeight: 600,
      fontSize: 14,
      cursor: "pointer",
      borderRadius: 10,
    },
    btnSubmit: {
      padding: "10px 24px",
      background: "linear-gradient(135deg, #4f46e5, #6366f1)",
      color: "white",
      border: "none",
      fontWeight: 800,
      fontSize: 14,
      borderRadius: 10,
      cursor: "pointer",
      boxShadow: "0 4px 14px rgba(79, 70, 229, 0.3)",
      transition: "all 0.2s",
    },
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.headerCard}>
        <div>
          <h1 style={styles.title}>
            <div style={styles.titleIcon}>🎁</div>
            Offers & Promotions
          </h1>
          <p style={styles.subtitle}>Create and manage Buy-X-Get-Y offers</p>
        </div>
        <button
          style={styles.btnPrimary}
          onClick={() => { resetForm(); setShowModal(true); }}
          onMouseOver={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(79, 70, 229, 0.4)"; }}
          onMouseOut={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(79, 70, 229, 0.3)"; }}
        >
          + New Offer
        </button>
      </div>

      {/* Offers Grid */}
      <div style={styles.grid}>
        {offers.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>🎁</div>
            <p style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px 0" }}>No offers defined yet.</p>
            <p style={{ fontSize: 14, margin: 0 }}>Click "New Offer" to create a promotion.</p>
          </div>
        ) : (
          offers.map(offer => (
            <div
              key={offer.id}
              style={styles.card(!!offer.status)}
              onMouseOver={e => { if (offer.status) { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.08)"; } }}
              onMouseOut={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = offer.status ? "0 4px 16px rgba(79, 70, 229, 0.08)" : "0 1px 3px rgba(0,0,0,0.04)"; }}
            >
              {!offer.status && <div style={styles.disabledBadge}>DISABLED</div>}

              <div style={styles.cardTitle}>{offer.name}</div>

              <button
                style={styles.toggleBtn(!!offer.status)}
                onClick={() => toggleStatus(offer)}
              >
                {offer.status ? "● ON" : "○ OFF"}
              </button>

              <div style={styles.conditionBox}>
                <div style={styles.condRow}>
                  <span style={styles.condLabel}>Buy</span>
                  <span style={styles.condQty("blue")}>{offer.buy_quantity}</span>
                  <span style={{ fontWeight: 500 }}>{offer.buy_product_name}</span>
                </div>
                <div style={{ ...styles.condRow, marginBottom: 0 }}>
                  <span style={{ ...styles.condLabel, color: "#16a34a" }}>🎁 Get</span>
                  <span style={styles.condQty("green")}>{offer.free_quantity}</span>
                  <span style={{ fontWeight: 500 }}>{offer.free_product_name}</span>
                  <span style={styles.freeBadge}>FREE</span>
                </div>
              </div>

              <div style={styles.cardActions}>
                <button
                  style={styles.actionBtn("#4f46e5")}
                  onClick={() => openEditModal(offer)}
                  onMouseOver={e => { e.currentTarget.style.color = "#4f46e5"; e.currentTarget.style.borderColor = "#c7d2fe"; }}
                  onMouseOut={e => { e.currentTarget.style.color = "#64748b"; e.currentTarget.style.borderColor = "#e2e8f0"; }}
                >
                  ✏️ Edit
                </button>
                <button
                  style={styles.actionBtn("#ef4444")}
                  onClick={() => handleDelete(offer.id)}
                  onMouseOver={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.borderColor = "#fca5a5"; }}
                  onMouseOut={e => { e.currentTarget.style.color = "#64748b"; e.currentTarget.style.borderColor = "#e2e8f0"; }}
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div style={styles.modalBox} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <div style={styles.modalTitle}>
                🎁 {isEditing ? "Edit Offer" : "Create New Offer"}
              </div>
              <button style={styles.modalClose} onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleSubmit} style={styles.formBody}>
              {/* Buy Condition */}
              <div style={styles.formSection(true)}>
                <div style={styles.sectionTitle}>🛒 Condition (Buy)</div>
                <div style={styles.formRow}>
                  <div>
                    <label style={styles.formLabel}>Select Product</label>
                    <SearchableSelect
                      options={products.map(p => ({ label: p.name, value: p.id, quantity: p.quantity }))}
                      value={formData.buy_product_id}
                      onChange={(id) => {
                        const prod = products.find(p => p.id === id);
                        setFormData(prev => ({
                          ...prev,
                          buy_product_id: id,
                          buy_product_name: prod ? prod.name : ""
                        }));
                      }}
                      placeholder="Type or select product..."
                      style={styles.formInput}
                    />
                  </div>
                  <div>
                    <label style={styles.formLabel}>Req. Qty</label>
                    <input
                      type="number"
                      name="buy_quantity"
                      min="1"
                      value={formData.buy_quantity}
                      onChange={handleInputChange}
                      required
                      style={{ ...styles.formInput, textAlign: "center" }}
                      onFocus={e => e.target.style.borderColor = "#4f46e5"}
                      onBlur={e => e.target.style.borderColor = "#e2e8f0"}
                    />
                  </div>
                </div>
              </div>

              {/* Reward */}
              <div style={styles.formSection(false)}>
                <div style={styles.rewardTag}>REWARD</div>
                <div style={styles.sectionTitle}>🎁 Reward (Get Free)</div>
                <div style={styles.formRow}>
                  <div>
                    <label style={styles.formLabel}>Select Free Product</label>
                    <SearchableSelect
                      options={products.map(p => ({ label: p.name, value: p.id, quantity: p.quantity }))}
                      value={formData.free_product_id}
                      onChange={(id) => {
                        const prod = products.find(p => p.id === id);
                        setFormData(prev => ({
                          ...prev,
                          free_product_id: id,
                          free_product_name: prod ? prod.name : ""
                        }));
                      }}
                      placeholder="Type or select free item..."
                      style={styles.formInput}
                    />
                  </div>
                  <div>
                    <label style={styles.formLabel}>Free Qty</label>
                    <input
                      type="number"
                      name="free_quantity"
                      min="1"
                      value={formData.free_quantity}
                      onChange={handleInputChange}
                      required
                      style={{ ...styles.formInput, textAlign: "center" }}
                      onFocus={e => e.target.style.borderColor = "#4f46e5"}
                      onBlur={e => e.target.style.borderColor = "#e2e8f0"}
                    />
                  </div>
                </div>
              </div>

              <div style={styles.formActions}>
                <button type="button" style={styles.btnCancel} onClick={() => setShowModal(false)}>Cancel</button>
                <button
                  type="submit"
                  style={styles.btnSubmit}
                  onMouseOver={e => { e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseOut={e => { e.currentTarget.style.transform = "none"; }}
                >
                  {isEditing ? "Update Offer" : "Create Offer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
