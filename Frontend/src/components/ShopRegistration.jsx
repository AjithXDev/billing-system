import React, { useState } from "react";
import logoUrl from "../assets/logo.png";

/**
 * ShopRegistration — Enterprise Setup Interface.
 * Registration-only flow with Email OTP verification.
 * - Shows only on first launch
 * - 4 fields: Business Name, Owner Name, Email (with OTP), Mobile
 * - Duplicate email blocked, duplicate phone allowed
 */
export default function ShopRegistration({ onRegistered }) {
  const [shopName, setShopName]   = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [mobile, setMobile]       = useState("");
  const [email, setEmail]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

  // Email verification state
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpSent, setOtpSent]       = useState(false);
  const [otpCode, setOtpCode]       = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpMsg, setOtpMsg]         = useState("");
  const [otpError, setOtpError]     = useState("");
  const [emailError, setEmailError] = useState("");

  // ── Send OTP ──
  const handleSendOtp = async () => {
    if (!email.trim() || !email.includes("@")) {
      setEmailError("Please enter a valid email address first.");
      return;
    }
    setOtpLoading(true);
    setEmailError("");
    setOtpError("");
    setOtpMsg("");

    try {
      // 1. Check if email already exists
      const exists = await window.api.checkEmailExists(email.trim());
      if (exists.exists) {
        setEmailError("Email already exists. Please use a different email.");
        setOtpLoading(false);
        return;
      }

      // 2. Send OTP
      const result = await window.api.sendOtp(email.trim());
      if (result.success) {
        setOtpSent(true);
        setOtpMsg("✅ Verification code sent to " + email.trim());
      } else {
        setOtpError(result.error || "Failed to send verification code.");
      }
    } catch (e) {
      setOtpError("Network error. Please check your connection.");
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Verify OTP ──
  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) {
      setOtpError("Please enter the full 6-digit code.");
      return;
    }
    setOtpLoading(true);
    setOtpError("");

    try {
      const result = await window.api.verifyOtp({ email: email.trim(), code: otpCode });
      if (result.success) {
        setEmailVerified(true);
        setOtpMsg("✅ Email verified successfully!");
        setOtpError("");
      } else {
        setOtpError(result.error || "Invalid verification code.");
      }
    } catch (e) {
      setOtpError("Verification failed. Try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  // ── Register ──
  const handleRegister = async () => {
    if (!shopName.trim() || !ownerName.trim() || !mobile.trim() || !email.trim()) {
      setError("All fields are required to register your terminal.");
      return;
    }
    if (mobile.trim().length < 10) {
      setError("Mobile number must be at least 10 digits.");
      return;
    }
    if (!emailVerified) {
      setError("Please verify your email before registering.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await window.api.registerShop({
        shopName: shopName.trim(),
        ownerName: ownerName.trim(),
        mobileNumber: mobile.trim(),
        email: email.trim(),
        shopEmail: email.trim()
      });

      if (result.success) {
        await completeAuthAndLaunch(result.shopId, shopName, ownerName, mobile, email, email, "owner123");
      } else {
        setError(result.error || "Cloud gateway timeout. Check connection.");
      }
    } catch (e) {
      setError("System failed to establish cloud handshake.");
    } finally {
      setLoading(false);
    }
  };

  const completeAuthAndLaunch = async (id, name, owner, phone, email, sEmail, mKey) => {
    try {
      const currentSettings = await window.api.getAppSettings() || {};
      const newSettings = {
        ...currentSettings,
        shopId: id,
        storeName: name || currentSettings.storeName,
        ownerName: owner || currentSettings.ownerName,
        ownerPhone: phone || currentSettings.ownerPhone,
        ownerEmail: email || currentSettings.ownerEmail,
        shopEmail: sEmail || currentSettings.shopEmail,
        masterKey: mKey || currentSettings.masterKey
      };
      await window.api.saveAppSettings(newSettings);
      localStorage.setItem("smart_billing_settings", JSON.stringify(newSettings));
      if (window.api.setWindowTitle && name) window.api.setWindowTitle(name);
      window.dispatchEvent(new CustomEvent('settings_updated'));
      onRegistered(id);
    } catch (err) { console.error("Sync error:", err); }
  };

  return (
    <div className="setup-container">
      {/* LEFT PANEL: Branding & Visuals */}
      <div className="visual-panel">
        <div className="gradient-mesh"></div>
        <div className="panel-content">
          <div className="setup-logo-container">
            <img src={logoUrl} alt="Innoaivators" className="setup-logo-img" />
          </div>
          <h1 className="brand-name">Innoaivators</h1>
          <h2 className="setup-tagline">Innovate, Create, Elevate.<br/><span>Partner in Digital Transformation.</span></h2>
          <p className="setup-description">
            Your Strategic Partner in Intelligent Automation and Advanced Business Analytics. 
            Built for the modern enterprise, designed for scale.
          </p>
          <ul className="feature-list">
            <li><span className="dot"></span> Autonomous Business Intelligence</li>
            <li><span className="dot"></span> Unified Cloud-to-Edge Ecosystem</li>
            <li><span className="dot"></span> Next-Gen Intelligent Automation</li>
            <li><span className="dot"></span> Military-Grade Transaction Security</li>
          </ul>
          <div className="panel-footer">
            © 2026 Innoaivators Systems • Version 4.0 Pro
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: Registration Form */}
      <div className="form-panel">
        <div className="form-inner">
          <div className="form-header">
            <h1>Initial Setup</h1>
            <p>Register your terminal to begin operations.</p>
          </div>

          <div className="setup-form">
            {/* 1. Business Name */}
            <div className="input-group">
              <label>Business / Venture Name</label>
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="e.g. Phoenix Enterprises"
                autoFocus
              />
            </div>

            {/* 2. Owner Name */}
            <div className="input-group">
              <label>Primary Owner Identity (Name)</label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Full Legal Name"
              />
            </div>

            {/* 3. Owner Email + Verify */}
            <div className="input-group">
              <label>Owner Personal Email</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    // Reset verification if email changes
                    if (emailVerified) {
                      setEmailVerified(false);
                      setOtpSent(false);
                      setOtpCode("");
                      setOtpMsg("");
                    }
                    setEmailError("");
                  }}
                  placeholder="owner@gmail.com"
                  disabled={emailVerified}
                  style={emailVerified ? { borderColor: "#22c55e", background: "rgba(34,197,94,0.05)" } : {}}
                />
                {/* Verify / Verified badge */}
                {!emailVerified && !otpSent && (
                  <button
                    onClick={handleSendOtp}
                    disabled={otpLoading || !email.includes("@")}
                    className="verify-btn"
                  >
                    {otpLoading ? "⏳" : "📧"} Verify
                  </button>
                )}
                {emailVerified && (
                  <div className="verified-badge">✅ Verified</div>
                )}
              </div>

              {/* Email error (duplicate) */}
              {emailError && (
                <div className="field-error">{emailError}</div>
              )}

              {/* OTP Input Row (appears after code is sent) */}
              {otpSent && !emailVerified && (
                <div className="otp-section">
                  <div style={{ fontSize: 12, color: "#10b981", fontWeight: 600, marginBottom: 8 }}>
                    {otpMsg}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                      onKeyDown={(e) => e.key === "Enter" && otpCode.length === 6 && handleVerifyOtp()}
                      placeholder="Enter 6-digit code"
                      maxLength={6}
                      className="otp-input"
                      autoFocus
                    />
                    <button
                      onClick={handleVerifyOtp}
                      disabled={otpLoading || otpCode.length !== 6}
                      className="verify-btn confirm"
                    >
                      {otpLoading ? "⏳" : "✓"} Confirm
                    </button>
                  </div>
                  {otpError && <div className="field-error">{otpError}</div>}
                  <button
                    onClick={handleSendOtp}
                    disabled={otpLoading}
                    style={{
                      background: "none", border: "none", color: "#6366f1",
                      fontSize: 12, fontWeight: 700, cursor: "pointer",
                      padding: "6px 0", marginTop: 4
                    }}
                  >
                    Resend Code
                  </button>
                </div>
              )}
            </div>

            {/* 4. Mobile Number */}
            <div className="input-group">
              <label>Owner Mobile Number (Communication)</label>
              <input
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/[^0-9+]/g, ""))}
                placeholder="+91 XXXX XXXX XX"
                maxLength={15}
                onKeyDown={(e) => e.key === "Enter" && emailVerified && handleRegister()}
              />
            </div>

            {error && <div className="setup-error">⚠️ {error}</div>}

            <button
              className="setup-submit-btn"
              onClick={handleRegister}
              disabled={loading || !emailVerified}
              style={!emailVerified ? { opacity: 0.5, cursor: "not-allowed" } : {}}
            >
              {loading ? "Establishing Secure Connection..." : !emailVerified ? "🔒 Verify Email to Continue" : "Register & Launch Terminal"}
            </button>
          </div>

          <div className="form-footer">
            <div className="status-indicator">
              <span className="pulse-dot"></span> Secure Cloud Link Active
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .setup-container {
          position: fixed; inset: 0; z-index: 999999;
          display: flex; background: #020617;
          font-family: 'Inter', -apple-system, sans-serif;
          animation: fadeIn 0.6s ease-out;
        }

        /* VISUAL PANEL */
        .visual-panel {
          flex: 1.2; position: relative; overflow: hidden;
          background: #0f172a; display: flex; align-items: center; padding: 80px;
        }
        .gradient-mesh {
          position: absolute; inset: 0; opacity: 0.4;
          background: 
            radial-gradient(circle at 20% 30%, #6366f1 0%, transparent 40%),
            radial-gradient(circle at 80% 70%, #a855f7 0%, transparent 40%);
          filter: blur(80px); animation: meshFloat 20s infinite alternate;
        }
        @keyframes meshFloat { 0% { transform: scale(1); } 100% { transform: scale(1.2) rotate(5deg); } }

        .panel-content { position: relative; z-index: 10; width: 100%; }

        .setup-logo-container {
          width: 72px; height: 72px; background: white; border-radius: 20px;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 24px; box-shadow: 0 15px 35px rgba(0,0,0,0.2);
          overflow: hidden; padding: 10px;
        }
        .setup-logo-img { width: 100%; height: 100%; object-fit: contain; }
        
        .brand-name { color: rgba(255,255,255,0.5); font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 8px; }
        
        .setup-tagline { color: #f8fafc; font-size: 42px; font-weight: 900; line-height: 1.1; letter-spacing: -0.04em; margin-bottom: 20px; }
        .setup-tagline span { color: #818cf8; }
        
        .setup-description { color: #94a3b8; font-size: 16px; font-weight: 500; line-height: 1.6; margin-bottom: 40px; max-width: 480px; }

        .feature-list { list-style: none; padding: 0; margin-bottom: 60px; }
        .feature-list li { color: #e2e8f0; font-size: 17px; font-weight: 600; margin-bottom: 18px; display: flex; align-items: center; gap: 12px; }
        .feature-list .dot { width: 8px; height: 8px; background: #6366f1; border-radius: 50%; box-shadow: 0 0 10px #6366f1; }
        .panel-footer { position: absolute; bottom: 40px; left: 80px; color: #475569; font-size: 13px; font-weight: 700; letter-spacing: 0.05em; }

        /* FORM PANEL */
        .form-panel { flex: 1; background: #020617; display: flex; align-items: center; justify-content: center; padding: 60px; border-left: 1px solid rgba(255,255,255,0.05); overflow-y: auto; }
        .form-inner { width: 100%; max-width: 440px; }
        .form-header { margin-bottom: 40px; }
        .form-header h1 { color: white; font-size: 32px; font-weight: 800; margin-bottom: 8px; letter-spacing: -0.02em; }
        .form-header p { color: #64748b; font-size: 16px; font-weight: 500; }

        .setup-form { display: flex; flex-direction: column; gap: 20px; }
        .input-group label { display: block; color: #475569; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px; }
        .input-group input {
          width: 100%; height: 56px; background: #0f172a; border: 1px solid #1e293b;
          border-radius: 14px; padding: 0 20px; color: white; font-size: 15px; font-weight: 500;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); outline: none;
          box-sizing: border-box;
        }
        .input-group input:focus { border-color: #6366f1; background: #1e293b; box-shadow: 0 0 0 4px rgba(99,102,241,0.1); }
        .input-group input:disabled { opacity: 0.7; cursor: not-allowed; }

        /* Verify Button */
        .verify-btn {
          height: 56px; padding: 0 18px; border-radius: 14px; border: none;
          background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white;
          font-size: 13px; font-weight: 700; cursor: pointer;
          transition: all 0.3s; white-space: nowrap;
          display: flex; align-items: center; gap: 6px;
        }
        .verify-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(99,102,241,0.4); }
        .verify-btn:disabled { opacity: 0.5; cursor: wait; }
        .verify-btn.confirm {
          background: linear-gradient(135deg, #22c55e, #16a34a);
        }
        .verify-btn.confirm:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(34,197,94,0.4); }

        /* Verified Badge */
        .verified-badge {
          height: 56px; padding: 0 16px; border-radius: 14px;
          background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3);
          color: #22c55e; font-size: 13px; font-weight: 700;
          display: flex; align-items: center; gap: 6px; white-space: nowrap;
        }

        /* OTP Section */
        .otp-section {
          margin-top: 12px; padding: 16px; border-radius: 12px;
          background: rgba(99,102,241,0.05); border: 1px solid rgba(99,102,241,0.15);
          animation: slideDown 0.3s ease-out;
        }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }

        .otp-input {
          flex: 1; height: 48px !important; text-align: center;
          font-size: 22px !important; font-weight: 800 !important;
          letter-spacing: 8px; font-family: 'JetBrains Mono', monospace;
          border-color: #6366f1 !important;
        }

        /* Field error */
        .field-error {
          color: #ef4444; font-size: 12px; font-weight: 600;
          margin-top: 8px; padding: 8px 12px; border-radius: 8px;
          background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.15);
        }

        .setup-submit-btn {
          height: 64px; margin-top: 8px; background: #6366f1; color: white; border: none;
          border-radius: 18px; font-size: 16px; font-weight: 700; cursor: pointer;
          transition: all 0.3s;
        }
        .setup-submit-btn:hover:not(:disabled) { background: #4f46e5; transform: translateY(-2px); box-shadow: 0 10px 30px rgba(99,102,241,0.3); }
        .setup-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .setup-error { color: #fb7185; font-size: 14px; font-weight: 600; padding: 14px; border-radius: 12px; background: rgba(225,29,72,0.1); border: 1px solid rgba(225,29,72,0.2); text-align: center; }
        .form-footer { margin-top: 30px; text-align: center; }
        .status-indicator { display: inline-flex; align-items: center; gap: 10px; color: #475569; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; }
        .pulse-dot { width: 8px; height: 8px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 12px #22c55e; animation: pulse 2s infinite; }

        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        @media (max-width: 1000px) {
          .visual-panel { display: none; }
          .form-panel { border-left: none; }
        }
      `}</style>
    </div>
  );
}
