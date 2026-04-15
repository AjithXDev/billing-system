import React, { useState } from "react";

/**
 * ShopRegistration — First-launch screen for desktop POS.
 * Asks for Owner Name + Mobile Number → registers in Supabase → saves shop_id locally.
 */
export default function ShopRegistration({ onRegistered }) {
  const [ownerName, setOwnerName] = useState("");
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRegister = async () => {
    if (!ownerName.trim() || !mobile.trim()) {
      setError("Please fill in all fields");
      return;
    }
    if (mobile.trim().length < 10) {
      setError("Enter a valid mobile number");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await window.api.registerShop({
        ownerName: ownerName.trim(),
        mobileNumber: mobile.trim(),
      });

      if (result.success) {
        onRegistered(result.shopId);
      } else {
        setError(result.error || "Registration failed. Check internet connection.");
      }
    } catch (e) {
      setError("Failed to register. Make sure Supabase is configured in Settings.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      height: "100vh", width: "100vw", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
      position: "fixed", top: 0, left: 0, zIndex: 10000,
    }}>
      {/* Animated background orbs */}
      <div style={{ position: "absolute", top: "10%", left: "15%", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.15), transparent)", filter: "blur(60px)", animation: "float 8s ease-in-out infinite" }} />
      <div style={{ position: "absolute", bottom: "10%", right: "15%", width: 250, height: 250, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.12), transparent)", filter: "blur(50px)", animation: "float 6s ease-in-out infinite reverse" }} />

      <div style={{
        background: "rgba(15,23,42,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(99,102,241,0.2)", borderRadius: 24, padding: "48px 40px",
        maxWidth: 440, width: "90%", textAlign: "center",
        boxShadow: "0 25px 60px -12px rgba(0,0,0,0.5), 0 0 80px rgba(99,102,241,0.08)",
      }}>
        {/* Logo */}
        <div style={{
          width: 64, height: 64, borderRadius: 20, margin: "0 auto 24px",
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex",
          alignItems: "center", justifyContent: "center", fontSize: 28,
          boxShadow: "0 12px 40px rgba(99,102,241,0.4)",
        }}>🏪</div>

        <h1 style={{ color: "white", fontSize: 26, fontWeight: 800, marginBottom: 8, letterSpacing: "-0.02em" }}>
          Welcome to iVA
        </h1>
        <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 32, lineHeight: 1.5 }}>
          Set up your shop to start billing.<br/>
          This registers your shop in the cloud for remote monitoring.
        </p>

        {/* Owner Name */}
        <div style={{ textAlign: "left", marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Owner Name
          </label>
          <input
            type="text"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="Enter shop owner's name"
            style={{
              width: "100%", padding: "14px 16px", borderRadius: 12,
              background: "rgba(30,41,59,0.8)", border: "1px solid rgba(99,102,241,0.2)",
              color: "white", fontSize: 15, outline: "none",
              transition: "border-color 0.2s",
            }}
            autoFocus
          />
        </div>

        {/* Mobile Number */}
        <div style={{ textAlign: "left", marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Mobile Number
          </label>
          <input
            type="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/[^0-9+]/g, ""))}
            placeholder="+91 9876543210"
            maxLength={15}
            style={{
              width: "100%", padding: "14px 16px", borderRadius: 12,
              background: "rgba(30,41,59,0.8)", border: "1px solid rgba(99,102,241,0.2)",
              color: "white", fontSize: 15, outline: "none",
              transition: "border-color 0.2s",
            }}
            onKeyDown={(e) => e.key === "Enter" && handleRegister()}
          />
        </div>

        {/* Error */}
        {error && (
          <p style={{ color: "#ef4444", fontSize: 13, fontWeight: 600, marginBottom: 16, padding: "10px 14px", background: "rgba(239,68,68,0.1)", borderRadius: 10 }}>
            ❌ {error}
          </p>
        )}

        {/* Register Button */}
        <button
          onClick={handleRegister}
          disabled={loading}
          style={{
            width: "100%", padding: "16px", borderRadius: 14, border: "none",
            background: loading ? "#475569" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
            color: "white", fontSize: 15, fontWeight: 700, cursor: loading ? "wait" : "pointer",
            letterSpacing: "0.04em", textTransform: "uppercase",
            transition: "all 0.2s", boxShadow: loading ? "none" : "0 8px 24px rgba(99,102,241,0.3)",
          }}
        >
          {loading ? "⏳ Registering..." : "🚀 Register Shop"}
        </button>

        <p style={{ color: "#475569", fontSize: 11, marginTop: 16, lineHeight: 1.5 }}>
          Your data is securely stored in the cloud.<br/>
          A unique Shop ID will be generated for you.
        </p>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        input:focus {
          border-color: #6366f1 !important;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
        }
      `}</style>
    </div>
  );
}
