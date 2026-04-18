import React, { useState } from "react";
import logoUrl from "../assets/logo.png";

/**
 * ShopRegistration — Dual-Panel Enterprise Setup Interface.
 * Implements a world-class split-screen layout similar to top-tier SaaS products.
 */
export default function ShopRegistration({ onRegistered }) {
  const [isLoginMode, setIsLoginMode] = useState(false);
  const [shopName, setShopName]   = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [mobile, setMobile]       = useState("");
  const [email, setEmail]         = useState("");
  const [masterKey, setMasterKey] = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");

    const handleRegister = async () => {
        if (!shopName.trim() || !ownerName.trim() || !mobile.trim() || !email.trim()) {
            setError("All credentials are required to provision your terminal.");
            return;
        }
        if (mobile.trim().length < 10) {
            setError("Mobile number must be at least 10 digits.");
            return;
        }
        if (!email.includes("@")) {
            setError("Please enter a valid business email.");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const result = await window.api.registerShop({
                shopName: shopName.trim(),
                ownerName: ownerName.trim(),
                mobileNumber: mobile.trim(),
                email: email.trim()
            });

            if (result.success) {
                await completeAuthAndLaunch(result.shopId, shopName, ownerName, mobile, email, "owner123");
            } else {
                setError(result.error || "Cloud gateway timeout. Check connection.");
            }
        } catch (e) {
            setError("System failed to establish cloud handshake.");
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = async () => {
        if (!email.trim() || !masterKey.trim()) {
            setError("Identification email and master key are required.");
            return;
        }
        setLoading(true);
        setError("");

        try {
            const result = await window.api.loginShop({
                email: email.trim(),
                masterKey: masterKey.trim()
            });

            if (result.success) {
                await completeAuthAndLaunch(result.shopId, result.name, result.ownerName, result.mobileNumber, email, masterKey);
            } else {
                setError(result.error || "Invalid credentials. Try again.");
            }
        } catch (e) {
            setError("Failed to verify credentials with cloud.");
        } finally {
            setLoading(false);
        }
    };

    const completeAuthAndLaunch = async (id, name, owner, phone, email, mKey) => {
        try {
            const currentSettings = await window.api.getAppSettings() || {};
            const newSettings = {
                ...currentSettings,
                shopId: id,
                storeName: name || currentSettings.storeName,
                ownerName: owner || currentSettings.ownerName,
                ownerPhone: phone || currentSettings.ownerPhone,
                ownerEmail: email || currentSettings.ownerEmail,
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

      {/* RIGHT PANEL: Registration/Login Form */}
      <div className="form-panel">
          <div className="form-inner">
              <div className="form-header">
                <h1>{isLoginMode ? "Existing System Link" : "Initial Setup"}</h1>
                <p>{isLoginMode ? "Sign in to synchronize your existing shop data." : "Register your terminal to begin operations."}</p>
              </div>

              <div className="setup-form">
                  {isLoginMode ? (
                      <>
                          <div className="input-group">
                              <label>Business Email</label>
                              <input
                                  type="email"
                                  value={email}
                                  onChange={(e) => setEmail(e.target.value)}
                                  placeholder="owner@enterprise.com"
                                  autoFocus
                              />
                          </div>
                          <div className="input-group">
                              <label>Master Access Key</label>
                              <input
                                  type="password"
                                  value={masterKey}
                                  onChange={(e) => setMasterKey(e.target.value)}
                                  placeholder="••••••••"
                                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                              />
                          </div>
                      </>
                  ) : (
                      <>
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

                          <div className="input-group">
                              <label>Primary Owner Identity</label>
                              <input
                                type="text"
                                value={ownerName}
                                onChange={(e) => setOwnerName(e.target.value)}
                                placeholder="Full Legal Name"
                              />
                          </div>

                          <div className="input-group">
                              <label>Business Email</label>
                              <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="owner@email.com"
                              />
                          </div>

                          <div className="input-group">
                              <label>Communication Hub (Mobile)</label>
                              <input
                                type="tel"
                                value={mobile}
                                onChange={(e) => setMobile(e.target.value.replace(/[^0-9+]/g, ""))}
                                placeholder="+91 XXXX XXXX XX"
                                maxLength={15}
                                onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                              />
                          </div>
                      </>
                  )}

                  {error && <div className="setup-error">⚠️ {error}</div>}

                  <button className="setup-submit-btn" onClick={isLoginMode ? handleLogin : handleRegister} disabled={loading}>
                      {loading ? "Establishing Secure Connection..." : isLoginMode ? "Verify & Link Terminal" : "Register & Launch Terminal"}
                  </button>

                  <div style={{ textAlign: "center", marginTop: 10 }}>
                      <button 
                        onClick={() => { setIsLoginMode(!isLoginMode); setError(""); }}
                        style={{ background: "none", border: "none", color: "#6366f1", fontWeight: "700", cursor: "pointer", fontSize: 13 }}
                      >
                          {isLoginMode ? "Don't have a shop? Register New" : "Already have a shop? Sign In"}
                      </button>
                  </div>
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
        .form-panel { flex: 1; background: #020617; display: flex; align-items: center; justify-content: center; padding: 60px; border-left: 1px solid rgba(255,255,255,0.05); }
        .form-inner { width: 100%; max-width: 440px; }
        .form-header { margin-bottom: 40px; }
        .form-header h1 { color: white; font-size: 32px; font-weight: 800; margin-bottom: 8px; letter-spacing: -0.02em; }
        .form-header p { color: #64748b; font-size: 16px; font-weight: 500; }

        .setup-form { display: flex; flex-direction: column; gap: 24px; }
        .input-group label { display: block; color: #475569; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px; }
        .input-group input {
            width: 100%; height: 60px; background: #0f172a; border: 1px solid #1e293b;
            border-radius: 16px; padding: 0 24px; color: white; font-size: 16px; font-weight: 500;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); outline: none;
        }
        .input-group input:focus { border-color: #6366f1; background: #1e293b; box-shadow: 0 0 0 4px rgba(99,102,241,0.1); }

        .setup-submit-btn {
            height: 64px; margin-top: 16px; background: #6366f1; color: white; border: none;
            border-radius: 18px; font-size: 16px; font-weight: 700; cursor: pointer;
            transition: all 0.3s;
        }
        .setup-submit-btn:hover:not(:disabled) { background: #4f46e5; transform: translateY(-2px); box-shadow: 0 10px 30px rgba(99,102,241,0.3); }
        .setup-submit-btn:disabled { opacity: 0.6; cursor: wait; }

        .setup-error { color: #fb7185; font-size: 14px; font-weight: 600; padding: 14px; border-radius: 12px; background: rgba(225,29,72,0.1); border: 1px solid rgba(225,29,72,0.2); text-align: center; }
        .form-footer { margin-top: 40px; text-align: center; }
        .status-indicator { display: inline-flex; align-items: center; gap: 10px; color: #475569; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; }
        .pulse-dot { width: 8px; height: 8px; background: #22c55e; border-radius: 50%; box-shadow: 0 0 12px #22c55e; animation: pulse 2s infinite; }

        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        /* SUCCESS MODE */
        .success-mode { align-items: center; justify-content: center; background: radial-gradient(circle, #0f172a 0%, #020617 100%); }
        .success-overlay-content { text-align: center; animation: popIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .congrats-orb { font-size: 80px; margin-bottom: 24px; animation: bounce 2s infinite; }
        .success-overlay-content h1 { color: white; font-size: 48px; font-weight: 900; margin-bottom: 16px; letter-spacing: -0.04em; }
        .success-overlay-content p { color: #94a3b8; font-size: 20px; line-height: 1.6; margin-bottom: 40px; }
        .launch-progress { width: 300px; height: 8px; background: rgba(255,255,255,0.05); border-radius: 10px; margin: 0 auto; overflow: hidden; }
        @keyframes loadFill { to { width: 100%; } }

        .launch-status {
            color: #64748b; font-size: 13px; font-weight: 700; text-transform: uppercase;
            letter-spacing: 0.15em; margin-bottom: 20px; display: flex; align-items: center; justify-content: center; gap: 10px;
        }

        /* RESPONSIVE */
        @media (max-width: 1000px) {
            .visual-panel { display: none; }
            .form-panel { border-left: none; }
        }
      `}</style>
    </div>
  );
}
