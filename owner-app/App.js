import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, StatusBar, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

let RNWebView = null;
if (Platform.OS !== 'web') {
  try {
    RNWebView = require('react-native-webview').WebView;
  } catch (e) {
    console.warn("WebView not available");
  }
}

const SUPABASE_URL = 'https://baawqrqihlhsrghvjlpx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0';

const Store = {
  _mem: {},
  get(k) { try { return Platform.OS === 'web' ? localStorage.getItem(k) : (Store._mem[k] || null); } catch { return null; } },
  set(k, v) { try { if (Platform.OS === 'web') localStorage.setItem(k, v); Store._mem[k] = v; } catch { } },
  del(k) { try { if (Platform.OS === 'web') localStorage.removeItem(k); delete Store._mem[k]; } catch { } },
};

const Label = ({ children }) => <Text style={styles.l}>{children}</Text>;
const ErrBox = ({ msg }) => <Text style={styles.eb}>⚠️ {msg}</Text>;
const SuccessBox = ({ msg }) => <Text style={styles.sb}>✅ {msg}</Text>;

function OwnerApp() {
  const [screen, setScreen] = useState('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [shopId, setShopId] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [deviceId, setDeviceId] = useState('');

  // New state for Shop ID input, Forgot Password, and OTP
  const [shopIdInput, setShopIdInput] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetAccessToken, setResetAccessToken] = useState('');

  const pollRef = useRef(null);
  const [dashData, setDashData] = useState(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [dashError, setDashError] = useState('');

  const sbFetch = async (table, method, body, query = '') => {
    const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
    const headers = { 
      'apikey': SUPABASE_KEY, 
      'Authorization': `Bearer ${SUPABASE_KEY}`, 
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : undefined
    };
    try {
      const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      if (res.status === 204) return null;
      const data = await res.json();
      if (!res.ok && res.status !== 409) throw new Error(data.message || 'Fetch failed');
      return data;
    } catch (e) {
      console.error("Fetch Error:", e);
      throw e;
    }
  };

  const sbAuth = async (endpoint, body) => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/${endpoint}`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.message || 'Auth failed');
    return data;
  };

  useEffect(() => {
    const init = async () => {
      const timeout = setTimeout(() => { if(screen === 'loading') setScreen('start'); }, 6000);
      let did = await Store.get('iva_device_id') || 'dev-' + Math.random().toString(36).substr(2, 8);
      Store.set('iva_device_id', did); setDeviceId(did);

      const paired = await Store.get('iva_paired');
      const sid = await Store.get('iva_shop_id');
      if (paired === 'true' && sid) {
        setShopId(sid);
        try {
          const activeDevices = await sbFetch('paired_devices', 'GET', null, `?shop_id=eq.${sid}&device_id=eq.${did}&is_active=eq.true`);
          clearTimeout(timeout);
          if (activeDevices && activeDevices.length > 0) { setScreen('dashboard'); }
          else { setScreen('start'); }
        } catch { clearTimeout(timeout); setScreen('start'); }
      } else { clearTimeout(timeout); setScreen('start'); }
    };
    init();

    const handleWebMsg = (e) => {
      if (e.data === 'logout') {
        Store.del('iva_paired'); Store.del('iva_shop_id'); setScreen('start');
      }
    };
    if (Platform.OS === 'web') {
      window.addEventListener('message', handleWebMsg);
      return () => window.removeEventListener('message', handleWebMsg);
    }
  }, []);

  const fetchDashboardData = async () => {
    if (!shopId) return;
    try {
      setDashLoading(true);
      const statsRes = await sbFetch('shop_stats', 'GET', null, `?shop_id=eq.${shopId}&select=stats_json,updated_at`);
      const shopRes = await sbFetch('shops', 'GET', null, `?id=eq.${shopId}&select=*`);
      if (!shopRes || !shopRes[0]) { setDashError('SHOP_DELETED'); return; }
      setDashData({ s: statsRes?.[0]?.stats_json || {}, ts: statsRes?.[0]?.updated_at || '', sh: shopRes[0] });
      setDashLoading(false);
    } catch (e) { setDashError(e.message); setDashLoading(false); }
  };

  useEffect(() => {
    if (screen === 'dashboard' && shopId) {
      fetchDashboardData();
      const interval = setInterval(fetchDashboardData, 60000);
      return () => clearInterval(interval);
    }
  }, [screen, shopId]);

  // ────────────────────────────────────────────
  // AUTH FLOW 1: Sign In (new user → Shop ID → Pair Key)
  // ────────────────────────────────────────────
  const signIn = async () => {
    if (!email || !password) { setError('Enter credentials'); return; }
    setLoading(true); setError('');
    try {
      await sbAuth('token?grant_type=password', { email: email.trim().toLowerCase(), password });
      setScreen('enter_shop_id');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  // ────────────────────────────────────────────
  // SHOP ID ENTRY → auto-generate pairing code
  // ────────────────────────────────────────────
  const submitShopId = async () => {
    const sid = shopIdInput.trim();
    if (!sid) { setError('Enter your Shop ID'); return; }
    setLoading(true); setError('');
    try {
      // Validate the shop exists
      const shops = await sbFetch('shops', 'GET', null, `?id=eq.${sid}&select=id`);
      if (!shops || shops.length === 0) { setError('Invalid Shop ID. Please check and try again.'); setLoading(false); return; }
      setShopId(sid);
      // Automatically generate pairing code
      await autoGeneratePairingCode(sid);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  // ────────────────────────────────────────────
  // AUTH FLOW 2: Login (returning user → dashboard or re-pair)
  // ────────────────────────────────────────────
  const quickLogin = async () => {
    if (!email || !password) { setError('Enter credentials'); return; }
    setLoading(true); setError('');
    try {
      await sbAuth('token?grant_type=password', { email: email.trim().toLowerCase(), password });
      const shops = await sbFetch('shops', 'GET', null, `?owner_email=eq.${email.trim().toLowerCase()}&select=id`);
      if (!shops || shops.length === 0) { setError('No shop found for this account.'); setLoading(false); return; }
      const sid = shops[0].id;
      setShopId(sid);
      // Check if this device is already paired
      const activeDevices = await sbFetch('paired_devices', 'GET', null, `?shop_id=eq.${sid}&device_id=eq.${deviceId}&is_active=eq.true`);
      if (activeDevices && activeDevices.length > 0) {
        // Device already paired — go straight to dashboard
        Store.set('iva_paired', 'true');
        Store.set('iva_shop_id', sid);
        setScreen('dashboard');
      } else {
        // Device not paired — generate pairing code
        await autoGeneratePairingCode(sid);
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  // ────────────────────────────────────────────
  // AUTO PAIR: Generate code + start polling
  // ────────────────────────────────────────────
  const autoGeneratePairingCode = async (sid) => {
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await sbFetch('pairing_codes', 'POST', { shop_id: sid, code, device_id: deviceId, status: 'pending', expires_at: new Date(Date.now() + 10 * 60000).toISOString() });
      setPairingCode(code);
      setScreen('pairing');
      // Clear any old poll
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const data = await sbFetch('pairing_codes', 'GET', null, `?shop_id=eq.${sid}&code=eq.${code}&select=status`);
          if (data && data[0] && data[0].status === 'used') {
            clearInterval(pollRef.current);
            const existing = await sbFetch('paired_devices', 'GET', null, `?shop_id=eq.${sid}&device_id=eq.${deviceId}`);
            if (existing && existing.length > 0) { await sbFetch('paired_devices', 'PATCH', { is_active: true, last_seen: new Date().toISOString() }, `?id=eq.${existing[0].id}`); }
            else { await sbFetch('paired_devices', 'POST', { shop_id: sid, device_id: deviceId, device_name: Platform.OS, is_active: true }); }
            Store.set('iva_paired', 'true'); Store.set('iva_shop_id', sid); setScreen('dashboard');
          }
        } catch { }
      }, 3000);
    } catch (e) {
      setError(e.message);
    }
  };

  // ────────────────────────────────────────────
  // FORGOT PASSWORD FLOW
  // ────────────────────────────────────────────
  const sendResetOtp = async () => {
    const em = resetEmail.trim().toLowerCase();
    if (!em) { setError('Enter your email address'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error_description || data.message || 'Failed to send reset code.');
      }
      setScreen('verify_otp');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const verifyOtp = async () => {
    if (!otp.trim()) { setError('Enter the verification code'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'recovery', token: otp.trim(), email: resetEmail.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Invalid or expired code');
      
      // Successfully verified! Now we have a session to update the password.
      setResetAccessToken(data.access_token);
      setScreen('reset_password');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const updatePassword = async () => {
    if (!newPassword || !confirmPassword) { setError('Fill in both fields'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${resetAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.message || 'Failed to update password'); }
      // Reset all forgot-password state
      setOtp(''); setNewPassword(''); setConfirmPassword(''); setResetEmail(''); setResetAccessToken('');
      setSuccess('Password updated successfully! You can now login.');
      setScreen('quick_login');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  // ────────────────────────────────────────────
  // DASHBOARD HTML (unchanged)
  // ────────────────────────────────────────────
  const buildDashboardHtml = (stats, ts, shopInfo) => {
    const json = JSON.stringify({ stats, ts, shopId, shop: shopInfo, deviceId }).replace(/`/g, '\\`').replace(/\$/g, '\\$');
    return `<!DOCTYPE html><html><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;600;800&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
:root{--bg:#020205;--card:#0a0a0f;--border:#151520;--text:#fff;--text-s:#888;--accent:#6366f1;--green:#22c55e;--red:#ef4444;--orange:#f97316}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Lexend',sans-serif;background:var(--bg);color:var(--text);height:100vh;overflow:hidden}
.sb{width:72px;height:100vh;background:var(--bg);border-right:1px solid var(--border);display:flex;flex-direction:column;align-items:center;padding:20px 0;position:fixed;left:-72px;z-index:1000;transition:0.3s}
.sb.on{left:0}
.sb_i{width:48px;height:48px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text-s);margin-bottom:20px;border-radius:12px;cursor:pointer}
.sb_i.on{color:var(--accent);background:rgba(99,102,241,0.1)}
.sb_i span{font-size:7px;font-weight:700;margin-top:4px}
.pg{width:100%;display:none;height:100vh;overflow-y:auto;padding-bottom:100px}.pg.on{display:block}
.hdr{position:sticky;top:0;background:rgba(2,2,5,0.8);backdrop-filter:blur(10px);padding:15px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;z-index:500}
.btn-m{background:rgba(255,255,255,0.05);padding:10px;border-radius:12px;cursor:pointer;width:40px;height:40px;display:flex;align-items:center;justify-content:center}
.cont{padding:20px}
.card{background:var(--card);border-radius:24px;border:1px solid var(--border);padding:18px;margin-bottom:20px}
.lbl{font-size:10px;color:var(--text-s);font-weight:800;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px}
.item{background:var(--card);border:1px solid var(--border);padding:18px;border-radius:20px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center}
.pill-row{display:flex;gap:10px;overflow-x:auto;padding-bottom:15px;margin-bottom:10px}
.pill{padding:8px 16px;border-radius:100px;background:rgba(255,255,255,0.03);border:1px solid var(--border);font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer}
.pill.on{border-color:var(--accent);color:var(--accent);background:rgba(99,102,241,0.1)}
.btn-v{background:var(--accent);color:#fff;padding:6px 14px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer}
.modal{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.98);display:none;z-index:2000;padding:20px;overflow-y:auto}
.ai-msg{padding:12px 18px;border-radius:18px;margin-bottom:15px;max-width:85%;word-wrap:break-word}
.ai-l{background:var(--card);border:1px solid var(--border);align-self:flex-start}
.ai-r{background:var(--accent);color:#fff;align-self:flex-end}
.ai-input-wrap{display:flex;gap:10px;margin-top:20px;background:var(--card);border:1px solid var(--border);padding:10px;border-radius:20px}
.ai-input{flex:1;background:transparent;border:none;color:white;padding:10px;outline:none;font-family:inherit}
.ai-send{background:var(--accent);border:none;color:white;padding:10px 20px;border-radius:15px;font-weight:800;cursor:pointer}
</style></head><body>
<div id="modal" class="modal"></div>
<div id="sidebar" class="sb">
  <div class="sb_i on" data-tab="overview">📊<span>Suite</span></div>
  <div class="sb_i" data-tab="items">📦<span>Items</span></div>
  <div class="sb_i" data-tab="bills">📜<span>Bills</span></div>
  <div class="sb_i" data-tab="alerts">⚠️<span>Alerts</span></div>
  <div class="sb_i" data-tab="ai">🤖<span>AI</span></div>
  <div class="sb_i" data-tab="prof">🏠<span>Profile</span></div>
</div>
<div id="app"></div>
<script>
var D = ${json}; var s = D.stats || {}; var currentProdTab = "ALL";
function toggleSidebar(){ document.getElementById("sidebar").classList.toggle("on"); }
function closeM(){ document.getElementById("modal").style.display="none"; }
function safeLogout(){ if(confirm("Logout from Innoaivators?")) { if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage("logout"); } else { window.parent.postMessage("logout", "*"); } } }

function handleAiSend(){
  var inp = document.getElementById("ai-inp"); if(!inp || !inp.value.trim()) return;
  var box = document.getElementById("ai-chat-box");
  var userMsg = '<div class="ai-msg ai-r">'+inp.value+'</div>'; box.innerHTML += userMsg;
  var val = inp.value.toLowerCase(); inp.value = "";
  setTimeout(function(){
    var reply = "";
    if(val.includes("profit")) reply = "Your profit for today is ₹"+(s.todayProfit || 0)+". The margins are looking great!";
    else if(val.includes("sale")) reply = "Total sales recorded today: ₹"+(s.todaySales || 0)+". Well done!";
    else if(val.includes("stock") || val.includes("inventory")) reply = "Inventory contains "+(s.allProductsList?.length || 0)+" items. "+(s.lowStockCount || 0)+" are at critical levels.";
    else reply = "I am your AI Business Consultant. I can track your daily sales, inventory levels, and profit growth. Ask me anything about your shop!";
    box.innerHTML += '<div class="ai-msg ai-l">'+reply+'</div>'; box.scrollTop = box.scrollHeight;
  }, 800);
}

function getExp(p){ return p.expiry_date || p.expiryDate || p.expiry || p.exp_date || "N/A"; }
function getItems(b){ return b.items || b.invoice_items || b.bill_items || b.products || []; }

function renderItems(){
  var list = s.allProductsList || [];
  if(currentProdTab === "LOW") list = list.filter(p=>p.quantity < 10);
  if(currentProdTab === "DEAD") list = s.deadStock || [];
  if(currentProdTab === "EXP") list = s.expiringProducts || [];
  
  var html = list.map(p=>'<div class="item"><div><div style="font-weight:800">'+p.name+'</div><div style="font-size:12px;color:var(--text-s)">Stock: <span style="color:var(--green)">'+p.quantity+'</span> &middot; Exp: '+getExp(p)+'</div></div><div style="color:var(--green);font-weight:800">₹'+p.price+'</div></div>').join('');
  document.getElementById("pg-items-list").innerHTML = html || '<p style="color:var(--text-s);text-align:center;padding:40px">No items to display here.</p>';
}

function render(){
  var h = (txt) => '<div class="hdr"><div class="btn-m" data-action="toggle">☰</div><div style="font-weight:800;letter-spacing:1px">'+txt.toUpperCase()+'</div><div style="width:40px"></div></div>';
  var ov = '<div id="pg-overview" class="pg on">'+h("Dashboard")+'<div class="cont"><div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:20px"><div class="card" style="margin:0;text-align:center;background:linear-gradient(135deg,#6366f1 0%,#4338ca 100%)"><div class="lbl" style="color:rgba(255,255,255,0.7)">Sales Today</div><div style="font-size:26px;font-weight:800">₹'+(s.todaySales||0)+'</div></div><div class="card" style="margin:0;text-align:center;border-color:var(--green)"><div class="lbl">Profit Today</div><div style="font-size:26px;font-weight:800;color:var(--green)">₹'+(s.todayProfit||0)+'</div></div></div><div class="card"><div class="lbl">Growth Pulse</div><div style="height:180px"><canvas id="c-growth"></canvas></div></div><div class="card"><div class="lbl">Customer Reach</div><div style="height:180px"><canvas id="c-reach"></canvas></div></div><div class="card"><div class="lbl">Peak Trading Hours</div><div style="height:180px"><canvas id="c-peak"></canvas></div></div></div></div>';
  var it = '<div id="pg-items" class="pg">'+h("Inventory")+'<div class="cont"><div class="pill-row"><div class="pill on" data-filter="ALL">ALL</div><div class="pill" data-filter="LOW">LOW STOCK</div><div class="pill" data-filter="EXP">NEAR EXPIRY</div><div class="pill" data-filter="DEAD">DEAD STOCK</div></div><div id="pg-items-list"></div></div></div>';
  var bl = '<div id="pg-bills" class="pg">'+h("Invoices")+'<div class="cont">' + (s.recentInvoices||[]).map(i=>'<div class="item"><div><div style="font-weight:800">#'+(i.bill_no||"WALK")+' &middot; '+(i.customer_name||'Walk-in')+'</div><div style="font-size:11px;color:var(--text-s)">'+(i.date || i.created_at)+'</div></div><div style="text-align:right"><div style="color:var(--green);font-weight:800;margin-bottom:8px">₹'+i.total_amount+'</div><div class="btn-v" data-bill-id="'+i.id+'">Receipt</div></div></div>').join("") + "</div></div>";
  var al = '<div id="pg-alerts" class="pg">'+h("Risk Analysis")+'<div class="cont">' + 
    '<div class="lbl" style="color:var(--red)">🚨 CRITICAL STOCK</div>' + ((s.lowStockProducts||[]).map(p=>'<div class="item" style="border-left:4px solid var(--red)"><div>'+p.name+'</div><div style="color:var(--red);font-weight:800">'+p.quantity+' '+ (p.unit || 'Units') +'</div></div>').join("") || '<p style="color:var(--text-s)">Inventory stable.</p>') +
    '<div class="lbl" style="margin-top:25px;color:var(--orange)">⚠️ EXPIRY TRACKER</div>' + ((s.expiringProducts||[]).map(p=>'<div class="item" style="border-left:4px solid var(--orange)"><div>'+p.name+'</div><div style="color:var(--orange);font-weight:800">EXP: '+getExp(p)+'</div></div>').join("") || '<p style="color:var(--text-s)">No near-term expiries.</p>') +
    '</div></div>';
  var ai = '<div id="pg-ai" class="pg">'+h("AI Assistant")+'<div class="cont" style="display:flex;flex-direction:column;height:calc(100vh - 100px)"><div id="ai-chat-box" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px"><div class="ai-msg ai-l">Hello Captain! I am your business consultant. How is Indian Mart doing today?</div></div><div class="ai-input-wrap"><input type="text" id="ai-inp" class="ai-input" placeholder="Ask about sales, profit..."><button class="ai-send" data-action="ai-send">SEND</button></div></div></div>';
  var pf = '<div id="pg-prof" class="pg">'+h("Control Center")+'<div class="cont"><div style="text-align:center;margin-bottom:30px"><div style="width:72px;height:72px;background:linear-gradient(135deg,#1e1e2d 0%,#0a0a0f 100%);border:1px solid var(--border);border-radius:24px;margin:0 auto 15px;display:flex;align-items:center;justify-content:center;font-size:32px">🏢</div><h2 style="font-weight:800;letter-spacing:1px">'+(D.shop?.name||"INDIAN MART")+'</h2><div style="color:var(--accent);font-size:12px;font-weight:800;margin-top:5px">'+D.shopId+'</div></div><div class="card"><div style="margin-bottom:15px"><div class="lbl">Business Owner</div><div style="font-weight:600">'+(D.shop?.owner_name || "N/A")+'</div></div><div style="margin-bottom:15px"><div class="lbl">Registered Address</div><div style="font-weight:600;font-size:13px;line-height:1.5">'+(D.shop?.address || s.settings?.storeAddress || "N/A")+'</div></div><div><div class="lbl">GST Identification Number</div><div style="font-weight:800;color:var(--green)">'+(D.shop?.gst_number || s.settings?.gstNumber || "N/A")+'</div></div></div><button data-action="logout" style="width:100%;text-align:center;background:#1a1a24;color:var(--red);border:1px solid #301010;padding:20px;border-radius:20px;font-weight:800;cursor:pointer;margin-top:20px">LOGOUT</button></div></div>';

  document.getElementById("app").innerHTML = ov + it + bl + al + ai + pf;
  renderItems();

  document.body.addEventListener("click", function(e){
    var el = e.target; var act = el.getAttribute("data-action"); if(act === "toggle") toggleSidebar();
    if(act === "logout") safeLogout(); if(act === "ai-send") handleAiSend();
    var sbi = el.closest(".sb_i"); if(sbi){ var tab = sbi.getAttribute("data-tab"); toggleSidebar(); document.querySelectorAll(".pg").forEach(p=>p.classList.remove("on")); document.querySelectorAll(".sb_i").forEach(s=>s.classList.remove("on")); document.getElementById("pg-"+tab).classList.add("on"); sbi.classList.add("on"); }
    var filt = el.getAttribute("data-filter"); if(filt){ currentProdTab = filt; document.querySelectorAll(".pill").forEach(p=>p.classList.remove("on")); el.classList.add("on"); renderItems(); }
    var bid = el.getAttribute("data-bill-id");
    if(bid){
       var b = (s.recentInvoices||[]).find(x=>x.id==bid); if(!b) return;
       var its = getItems(b);
       var bitems = its.map(i=>'<div style="background:rgba(255,255,255,0.03);padding:15px;border-radius:15px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center"><div><div style="font-weight:800;font-size:14px">'+(i.name||'Item')+'</div><div style="font-size:11px;color:var(--text-s);margin-top:4px">Qty: '+(i.quantity||i.qty||1)+' &middot; Rate: ₹'+(i.price||0)+'</div></div><div style="font-weight:800;color:var(--text)">₹'+(i.total||i.subtotal||0)+'</div></div>').join("");
       document.getElementById("modal").innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:25px"><div style="font-size:20px;font-weight:800">INVOICE #'+(b.bill_no||"?")+'</div><div data-action="close" style="font-size:32px;cursor:pointer">×</div></div><div style="max-height:65vh;overflow-y:auto">'+(bitems || '<p style="text-align:center;padding:20px;color:var(--text-s)">No items logged.</p>')+'</div><div style="margin-top:25px;padding-top:25px;border-top:1px dashed #333;display:flex;justify-content:space-between;align-items:center"><div style="font-size:14px;color:var(--text-s)">Net Amount Payable</div><div style="font-size:24px;font-weight:900;color:var(--green)">₹'+b.total_amount+'</div></div><button data-action="close" style="width:100%;background:var(--accent);color:white;border:none;padding:18px;border-radius:18px;margin-top:30px;font-weight:800;letter-spacing:1px">CLOSE RECEIPT</button>';
       document.getElementById("modal").style.display = "block";
    }
    if(el.getAttribute("data-action") === "close") closeM();
  });
  document.body.addEventListener("keypress", function(e){ if(e.key === "Enter" && document.activeElement.id === "ai-inp") handleAiSend(); });

  var mS = s.monthlySalesBreakdown || []; var mL = mS.map(m=>new Date(m.month).toLocaleString("en-US",{month:"short"}));
  Chart.defaults.color = "#888"; Chart.defaults.font.family = "'Lexend'";
  new Chart(document.getElementById("c-growth"), { type:"bar", data: { labels:mL, datasets:[{label:"Sales",data:mS.map(m=>m.total),backgroundColor:"#6366f1",borderRadius:6},{label:"Profit",data:mS.map(m=>m.total*0.3),backgroundColor:"#22c55e",borderRadius:6}] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{grid:{display:false}},y:{grid:{color:"#151520"}}} } });
  new Chart(document.getElementById("c-reach"), { type:"line", data: { labels:mL, datasets:[{label:"Bills",data:mS.map(m=>m.bills),borderColor:"#6366f1",tension:0.4,fill:true,backgroundColor:"rgba(99,102,241,0.05)"}] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{grid:{display:false}},y:{grid:{color:"#151520"}}} } });
  var pk = s.peakHours || [];
  new Chart(document.getElementById("c-peak"), { type:"line", data: { labels:pk.map(p=>p.hour+":00"), datasets:[{label:"Bills",data:pk.map(p=>p.bills),borderColor:"#f97316",tension:0.4,fill:true,backgroundColor:"rgba(249,115,22,0.05)"}] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{grid:{display:false}},y:{grid:{color:"#151520"}}} } });
}
render();
</script></body></html>`;
  };

  // ────────────────────────────────────────────
  // RENDER: First Page (Start Screen)
  // ────────────────────────────────────────────
  const renderStart = () => (
    <ScrollView contentContainerStyle={styles.sw} keyboardShouldPersistTaps="handled">
      <View style={styles.bh}>
        <Text style={styles.bt}>INNO<Text style={{color:'#6366f1'}}>AIVATORS</Text></Text>
        <Text style={styles.h}>Owner Access</Text>
      </View>
      <View style={styles.cg}>
        <TouchableOpacity style={styles.pb} onPress={() => { setError(''); setSuccess(''); setScreen('login'); }}>
          <Text style={styles.pt}>Sign In</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={{marginTop: 20, alignSelf: 'center'}} 
          onPress={() => { setError(''); setSuccess(''); setScreen('quick_login'); }}
        >
          <Text style={{color:'#888', fontSize: 13, fontWeight: '700'}}>
            Already have an account? <Text style={{color: '#6366f1'}}>Login</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // ────────────────────────────────────────────
  // RENDER: Sign In Page (Internal Email + Pass for Sign In Flow)
  // ────────────────────────────────────────────
  const renderSignIn = () => (
    <ScrollView contentContainerStyle={styles.sw} keyboardShouldPersistTaps="handled">
      <View style={styles.bh}>
        <Text style={styles.bt}>INNO<Text style={{color:'#6366f1'}}>AIVATORS</Text></Text>
        <Text style={styles.h}>Sign In</Text>
      </View>
      <View style={styles.cg}>
        <Label>Email</Label>
        <TextInput style={styles.i} value={email} onChangeText={setEmail} placeholder="owner@email.com" placeholderTextColor="#444" autoCapitalize="none" />
        <Label>Password</Label>
        <TextInput style={styles.i} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#444" secureTextEntry />
        {error ? <ErrBox msg={error} /> : null}
        <TouchableOpacity style={styles.pb} disabled={loading} onPress={signIn}>
          <Text style={styles.pt}>{loading ? 'Authenticating...' : 'Sign In'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.ob} onPress={() => setScreen('start')}>
          <Text style={styles.ot}>Back</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // ────────────────────────────────────────────
  // RENDER: Quick Login Page (For Existing Users)
  // ────────────────────────────────────────────
  const renderQuickLogin = () => (
    <ScrollView contentContainerStyle={styles.sw} keyboardShouldPersistTaps="handled">
      <View style={styles.bh}>
        <Text style={styles.bt}>INNO<Text style={{color:'#6366f1'}}>AIVATORS</Text></Text>
        <Text style={styles.h}>Login</Text>
      </View>
      <View style={styles.cg}>
        <Label>Email</Label>
        <TextInput style={styles.i} value={email} onChangeText={setEmail} placeholder="owner@email.com" placeholderTextColor="#444" autoCapitalize="none" />
        <Label>Password</Label>
        <TextInput style={styles.i} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#444" secureTextEntry />
        {error ? <ErrBox msg={error} /> : null}
        {success ? <SuccessBox msg={success} /> : null}
        <TouchableOpacity style={styles.pb} disabled={loading} onPress={quickLogin}>
          <Text style={styles.pt}>{loading ? 'Logging In...' : 'Login'}</Text>
        </TouchableOpacity>
        <View style={{flexDirection:'row', justifyContent:'center', marginTop: 16}}>
          <TouchableOpacity onPress={() => { setError(''); setSuccess(''); setResetEmail(email); setScreen('forgot'); }}>
            <Text style={{color:'#888', fontSize:13, fontWeight:'700'}}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.ob} onPress={() => setScreen('start')}>
          <Text style={styles.ot}>Back</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // ────────────────────────────────────────────
  // RENDER: Pairing screen (auto-generated code shown)
  // ────────────────────────────────────────────
  const renderPairing = () => (
    <ScrollView contentContainerStyle={styles.sw} keyboardShouldPersistTaps="handled">
      <View style={styles.bh}><Text style={styles.h}>Verification Code</Text><Text style={styles.sh}>Enter this code in your POS Desktop under Mobile Sync.</Text></View>
      <View style={styles.cg}>
        <Text style={{fontSize: 48, fontWeight: '900', color: '#6366f1', letterSpacing: 8, textAlign: 'center', marginVertical: 20}}>{pairingCode}</Text>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={{color: '#888', textAlign: 'center', marginTop: 15}}>Waiting for desktop POS to approve...</Text>
      </View>
    </ScrollView>
  );

  // ────────────────────────────────────────────
  // RENDER: Shop ID entry screen
  // ────────────────────────────────────────────
  const renderEnterShopId = () => (
    <ScrollView contentContainerStyle={styles.sw} keyboardShouldPersistTaps="handled">
      <View style={styles.bh}><Text style={styles.h}>Enter Shop ID</Text><Text style={styles.sh}>Enter the Shop ID provided during registration to link your device.</Text></View>
      <View style={styles.cg}>
        <Label>Shop ID</Label>
        <TextInput style={styles.i} value={shopIdInput} onChangeText={setShopIdInput} placeholder="e.g. shop_abc123" placeholderTextColor="#444" autoCapitalize="none" />
        {error ? <ErrBox msg={error} /> : null}
        <TouchableOpacity style={styles.pb} disabled={loading} onPress={submitShopId}><Text style={styles.pt}>{loading ? 'Verifying...' : 'Continue'}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.ob} onPress={() => { setError(''); setScreen('login'); }}><Text style={styles.ot}>Back</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // ────────────────────────────────────────────
  // RENDER: Forgot Password - enter email
  // ────────────────────────────────────────────
  const renderForgotPassword = () => (
    <ScrollView contentContainerStyle={styles.sw} keyboardShouldPersistTaps="handled">
      <View style={styles.bh}><Text style={styles.h}>Forgot Password</Text><Text style={styles.sh}>Enter your registered email. We'll send a verification code.</Text></View>
      <View style={styles.cg}>
        <Label>Email</Label>
        <TextInput style={styles.i} value={resetEmail} onChangeText={setResetEmail} placeholder="owner@email.com" placeholderTextColor="#444" autoCapitalize="none" keyboardType="email-address" />
        {error ? <ErrBox msg={error} /> : null}
        <TouchableOpacity style={styles.pb} disabled={loading} onPress={sendResetOtp}><Text style={styles.pt}>{loading ? 'Sending...' : 'Send Verification Code'}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.ob} onPress={() => { setError(''); setScreen('quick_login'); }}><Text style={styles.ot}>Back</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );

  // ────────────────────────────────────────────
  // RENDER: Verify OTP
  // ────────────────────────────────────────────
  const renderVerifyOtp = () => (
    <ScrollView contentContainerStyle={styles.sw} keyboardShouldPersistTaps="handled">
      <View style={styles.bh}><Text style={styles.h}>Enter Verification Code</Text><Text style={styles.sh}>Check your email for a 6-digit code sent to {resetEmail}</Text></View>
      <View style={styles.cg}>
        <Label>Verification Code</Label>
        <TextInput style={[styles.i, {textAlign: 'center', fontSize: 24, letterSpacing: 8}]} value={otp} onChangeText={setOtp} placeholder="000000" placeholderTextColor="#444" keyboardType="number-pad" maxLength={6} />
        {error ? <ErrBox msg={error} /> : null}
        <TouchableOpacity style={styles.pb} disabled={loading} onPress={verifyOtp}><Text style={styles.pt}>{loading ? 'Verifying...' : 'Verify Code'}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.ob} onPress={() => { setError(''); setScreen('forgot'); }}><Text style={styles.ot}>Resend Code</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );

  // ────────────────────────────────────────────
  // RENDER: Reset Password (new + confirm)
  // ────────────────────────────────────────────
  const renderResetPassword = () => (
    <ScrollView contentContainerStyle={styles.sw} keyboardShouldPersistTaps="handled">
      <View style={styles.bh}><Text style={styles.h}>Set New Password</Text><Text style={styles.sh}>Create a strong password for your account.</Text></View>
      <View style={styles.cg}>
        <Label>New Password</Label>
        <TextInput style={styles.i} value={newPassword} onChangeText={setNewPassword} placeholder="••••••••" placeholderTextColor="#444" secureTextEntry />
        <Label>Confirm Password</Label>
        <TextInput style={styles.i} value={confirmPassword} onChangeText={setConfirmPassword} placeholder="••••••••" placeholderTextColor="#444" secureTextEntry />
        {error ? <ErrBox msg={error} /> : null}
        <TouchableOpacity style={styles.pb} disabled={loading} onPress={updatePassword}><Text style={styles.pt}>{loading ? 'Updating...' : 'Update Password'}</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );

  // ────────────────────────────────────────────
  // RENDER: Dashboard (unchanged)
  // ────────────────────────────────────────────
  const renderDashboard = () => {
    if (dashLoading && !dashData) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: '#020205' }}><ActivityIndicator size="large" color="#6366f1" /></View>;
    if (dashError) return <View style={styles.sw}><ErrBox msg={dashError} /><TouchableOpacity style={styles.pb} onPress={fetchDashboardData}><Text style={styles.pt}>Retry</Text></TouchableOpacity></View>;
    const html = buildDashboardHtml(dashData?.s || {}, dashData?.ts || '', dashData?.sh || {});
    return (
      <View style={{ flex: 1 }}>
        {Platform.OS === 'web' ? (
          <iframe srcDoc={html} style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#020205' }} title="Dashboard" />
        ) : (
          RNWebView ? (
            <RNWebView source={{ html }} style={{ flex: 1, backgroundColor: '#020205' }} onMessage={(e) => { if (e.nativeEvent.data === 'logout') { Store.del('iva_paired'); Store.del('iva_shop_id'); setScreen('start'); } }} />
          ) : (
            <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><Text style={{color:'white'}}>System initializing...</Text></View>
          )
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.c}><StatusBar barStyle="light-content" backgroundColor="#020205" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {screen === 'loading' && <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator size="large" color="#6366f1" /><TouchableOpacity style={{marginTop:20, alignSelf:'center'}} onPress={()=>setScreen('start')}><Text style={{color:'#6366f1'}}>Jump to Start</Text></TouchableOpacity></View>}
        {screen === 'start' && renderStart()}
        {screen === 'login' && renderSignIn()}
        {screen === 'quick_login' && renderQuickLogin()}
        {screen === 'enter_shop_id' && renderEnterShopId()}
        {screen === 'pairing' && renderPairing()}
        {screen === 'forgot' && renderForgotPassword()}
        {screen === 'verify_otp' && renderVerifyOtp()}
        {screen === 'reset_password' && renderResetPassword()}
        {screen === 'dashboard' && renderDashboard()}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function App() { return <SafeAreaProvider><OwnerApp /></SafeAreaProvider>; }

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: '#020205' },
  sw: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  bh: { alignItems: 'center', marginBottom: 40 },
  bt: { color: 'white', fontSize: 28, fontWeight: '900' },
  h: { color: 'white', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  sh: { color: '#888', fontSize: 13, textAlign: 'center', marginTop: 10 },
  cg: { backgroundColor: '#0a0a0f', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#151520' },
  l: { color: '#888', fontSize: 10, fontWeight: '800', marginTop: 12, marginBottom: 6, textTransform: 'uppercase' },
  i: { backgroundColor: '#020205', color: 'white', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#151520' },
  pb: { backgroundColor: '#6366f1', padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 24 },
  pt: { color: 'white', fontWeight: '800', fontSize: 16 },
  ob: { padding: 18, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#151520', marginTop: 12 },
  ot: { color: '#888', fontWeight: '700' },
  eb: { color: '#ef4444', fontSize: 12, marginTop: 16, textAlign: 'center', backgroundColor: 'rgba(239,68,68,0.1)', padding: 12, borderRadius: 12 },
  sb: { color: '#22c55e', fontSize: 12, marginTop: 16, textAlign: 'center', backgroundColor: 'rgba(34,197,94,0.1)', padding: 12, borderRadius: 12 },
});
