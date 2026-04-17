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

function OwnerApp() {
  const [screen, setScreen] = useState('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shopId, setShopId] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [deviceId, setDeviceId] = useState('');

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
      const timeout = setTimeout(() => { if(screen === 'loading') setScreen('login'); }, 6000);

      let did = await Store.get('iva_device_id');
      if (!did) {
        did = 'dev-' + Math.random().toString(36).substr(2, 8);
        Store.set('iva_device_id', did);
      }
      setDeviceId(did);

      const paired = await Store.get('iva_paired');
      const sid = await Store.get('iva_shop_id');
      if (paired === 'true' && sid) {
        setShopId(sid);
        try {
          const activeDevices = await sbFetch('paired_devices', 'GET', null, `?shop_id=eq.${sid}&device_id=eq.${did}&is_active=eq.true`);
          clearTimeout(timeout);
          if (activeDevices && activeDevices.length > 0) { setScreen('dashboard'); }
          else { setScreen('login'); }
        } catch { clearTimeout(timeout); setScreen('login'); }
      } else { clearTimeout(timeout); setScreen('login'); }
    };
    init();
  }, []);

  const fetchDashboardData = async () => {
    if (!shopId) return;
    try {
      setDashLoading(true);
      const statsRes = await sbFetch('shop_stats', 'GET', null, `?shop_id=eq.${shopId}&select=stats_json,updated_at`);
      const shopRes = await sbFetch('shops', 'GET', null, `?id=eq.${shopId}&select=id,name,owner_name,mobile_number,address,gst_number,is_active`);
      if (!shopRes || !shopRes[0]) { setDashError('SHOP_DELETED'); return; }
      if (!statsRes || !statsRes[0]) { setDashError('WAITING_SYNC'); return; }
      setDashData({ s: statsRes[0].stats_json, ts: statsRes[0].updated_at, sh: shopRes[0] });
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

  const login = async () => {
    if (!email || !password) { setError('Enter credentials'); return; }
    setLoading(true); setError('');
    try {
      await sbAuth('token?grant_type=password', { email: email.trim().toLowerCase(), password });
      const shops = await sbFetch('shops', 'GET', null, `?owner_email=eq.${email.trim().toLowerCase()}&select=id`);
      if (shops && shops.length > 0) { setShopId(shops[0].id); setScreen('pairing_jump'); }
      else { setScreen('shopId'); }
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const register = async () => {
    if (!email || !password || !ownerName) { setError('Fill all fields'); return; }
    setLoading(true); setError('');
    try {
      await sbAuth('signup', { email: email.trim().toLowerCase(), password });
      Alert.alert('Success', 'Account created! Please login.');
      setScreen('login');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const generatePairingCode = async () => {
    if (!shopId) { setError('Shop ID required'); return; }
    setLoading(true); setError('');
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await sbFetch('pairing_codes', 'POST', {
        shop_id: shopId, code, device_id: deviceId, status: 'pending',
        expires_at: new Date(Date.now() + 10 * 60000).toISOString()
      });
      setPairingCode(code); setScreen('pairing');
      pollRef.current = setInterval(async () => {
        try {
          const data = await sbFetch('pairing_codes', 'GET', null, `?shop_id=eq.${shopId}&code=eq.${code}&select=status`);
          if (data && data[0] && data[0].status === 'used') {
            clearInterval(pollRef.current);
            const existing = await sbFetch('paired_devices', 'GET', null, `?shop_id=eq.${shopId}&device_id=eq.${deviceId}`);
            if (existing && existing.length > 0) {
              await sbFetch('paired_devices', 'PATCH', { is_active: true, last_seen: new Date().toISOString() }, `?id=eq.${existing[0].id}`);
            } else {
              await sbFetch('paired_devices', 'POST', { shop_id: shopId, device_id: deviceId, device_name: Platform.OS, is_active: true });
            }
            Store.set('iva_paired', 'true'); Store.set('iva_shop_id', shopId);
            setScreen('dashboard');
          }
        } catch { }
      }, 3000);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const renderLogin = () => (
    <ScrollView contentContainerStyle={styles.sw} keyboardShouldPersistTaps="handled">
      <View style={styles.bh}><Text style={styles.bt}>INNO<Text style={{color:'#6366f1'}}>AIVATORS</Text></Text><Text style={styles.h}>Owner Login</Text></View>
      <View style={styles.cg}><Label>Email</Label><TextInput style={styles.i} value={email} onChangeText={setEmail} placeholder="owner@email.com" placeholderTextColor="#444" autoCapitalize="none" />
      <Label>Password</Label><TextInput style={styles.i} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#444" secureTextEntry />
      {error ? <ErrBox msg={error} /> : null}<TouchableOpacity style={styles.pb} disabled={loading} onPress={login}><Text style={styles.pt}>{loading ? '...' : 'Login'}</Text></TouchableOpacity>
      <TouchableOpacity style={styles.bl} onPress={() => { setScreen('register'); setError(''); }}><Text style={styles.blt}>New? <Text style={styles.blh}>Register</Text></Text></TouchableOpacity></View>
    </ScrollView>
  );

  const renderRegister = () => (
    <ScrollView contentContainerStyle={styles.sw} keyboardShouldPersistTaps="handled">
      <View style={styles.bh}><Text style={styles.bt}>INNO<Text style={{color:'#6366f1'}}>AIVATORS</Text></Text><Text style={styles.h}>Account</Text></View>
      <View style={styles.cg}><Label>Name</Label><TextInput style={styles.i} value={ownerName} onChangeText={setOwnerName} placeholder="Full Name" placeholderTextColor="#444" />
      <Label>Email</Label><TextInput style={styles.i} value={email} onChangeText={setEmail} placeholder="owner@email.com" placeholderTextColor="#444" autoCapitalize="none" />
      <Label>Password</Label><TextInput style={styles.i} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#444" secureTextEntry />
      {error ? <ErrBox msg={error} /> : null}<TouchableOpacity style={styles.pb} disabled={loading} onPress={register}><Text style={styles.pt}>{loading ? '...' : 'Sign Up'}</Text></TouchableOpacity>
      <TouchableOpacity style={styles.bl} onPress={() => { setScreen('login'); setError(''); }}><Text style={styles.blt}>Login</Text></TouchableOpacity></View>
    </ScrollView>
  );

  const renderShopId = () => (
    <View style={styles.sw}><Text style={styles.h}>Link Shop</Text><Text style={styles.sh}>Enter Shop ID from terminal.</Text>
      <TextInput style={styles.i} value={shopId} onChangeText={setShopId} placeholder="shop-xxxxxxxx" placeholderTextColor="#444" autoCapitalize="none" />
      {error ? <ErrBox msg={error} /> : null}<TouchableOpacity style={styles.pb} disabled={loading} onPress={generatePairingCode}><Text style={styles.pt}>Continue</Text></TouchableOpacity>
      <TouchableOpacity style={styles.ob} onPress={() => setScreen('login')}><Text style={styles.ot}>Back</Text></TouchableOpacity>
    </View>
  );

  const renderPairingJump = () => (
    <View style={styles.sw}><Text style={styles.h}>Ready!</Text><Text style={styles.sh}>ID: {shopId}</Text>
      <TouchableOpacity style={styles.pb} disabled={loading} onPress={generatePairingCode}><Text style={styles.pt}>Pair Device</Text></TouchableOpacity>
    </View>
  );

  const renderPairing = () => (
    <View style={styles.sw}><Text style={styles.h}>Pairing Code</Text><Text style={styles.sh}>Enter on Desktop Terminal</Text>
      <View style={{ backgroundColor: '#0d0d14', padding: 32, borderRadius: 24, marginVertical: 24 }}><Text style={{ fontSize: 48, fontWeight: '900', color: '#6366f1' }}>{pairingCode}</Text></View>
      <ActivityIndicator color="#6366f1" /><TouchableOpacity style={{ marginTop: 40 }} onPress={() => { setScreen('shopId'); clearInterval(pollRef.current); }}><Text style={{ color: '#6366f1' }}>Cancel</Text></TouchableOpacity>
    </View>
  );

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
.btn-m{background:rgba(255,255,255,0.05);padding:10px;border-radius:12px;cursor:pointer}
.cont{padding:20px}
.card{background:var(--card);border-radius:24px;border:1px solid var(--border);padding:18px;margin-bottom:20px}
.lbl{font-size:10px;color:var(--text-s);font-weight:800;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px}
.item{background:var(--card);border:1px solid var(--border);padding:18px;border-radius:20px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center}
.pill-row{display:flex;gap:10px;overflow-x:auto;padding-bottom:15px;margin-bottom:10px}
.pill{padding:8px 16px;border-radius:100px;background:rgba(255,255,255,0.03);border:1px solid var(--border);font-size:12px;font-weight:600;white-space:nowrap;cursor:pointer}
.pill.on{border-color:var(--accent);color:var(--accent)}
.btn-v{background:var(--accent);color:#fff;padding:6px 14px;border-radius:10px;font-size:11px;font-weight:700;cursor:pointer}
.modal{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);display:none;z-index:2000;padding:20px;overflow-y:auto}
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
function safeLogout(){
  if(confirm("Logout now?")) {
    if(window.ReactNativeWebView && window.ReactNativeWebView.postMessage){
      window.ReactNativeWebView.postMessage("logout");
    } else {
      alert("Native Logout logic triggered.");
    }
  }
}

function handleAiSend(){
  var inp = document.getElementById("ai-inp"); if(!inp || !inp.value.trim()) return;
  var box = document.getElementById("ai-chat-box");
  var userMsg = '<div class="ai-msg ai-r">'+inp.value+'</div>';
  box.innerHTML += userMsg;
  var val = inp.value.toLowerCase(); inp.value = "";
  setTimeout(function(){
    var reply = "";
    if(val.includes("profit")) reply = "Your profit for today is ₹"+(s.todayProfit || 0)+". Great progress!";
    else if(val.includes("sale")) reply = "Your today's sales are ₹"+(s.todaySales || 0)+". The momentum is looking very positive.";
    else if(val.includes("stock") || val.includes("inventory")) reply = "You currently have "+(s.allProductsList?.length || 0)+" products in total. "+(s.allProductsList?.filter(p=>p.quantity < 10).length || 0)+" items are running low on stock.";
    else if(val.includes("bill") || val.includes("invoice")) reply = "I've synced "+(s.recentInvoices?.length || 0)+" recent bills for your shop. You can view them in the Bills tab.";
    else reply = "As your AI assistant for "+(D.shop?.name || "this shop")+", I'm here to help. I've synced your latest data. Ask me about today's profit or stock levels!";
    
    box.innerHTML += '<div class="ai-msg ai-l">'+reply+'</div>';
    box.scrollTop = box.scrollHeight;
  }, 800);
}

function renderItems(){
  var list = s.allProductsList || [];
  if(currentProdTab === "LOW") list = list.filter(p=>p.quantity < 10);
  if(currentProdTab === "DEAD") list = list.filter(p=>p.quantity > 30 && (p.revenue||0) < 50);
  if(currentProdTab === "EXP") {
    var now = new Date();
    list = list.filter(p=>{
      if(!p.expiry_date) return false;
      var ed = new Date(p.expiry_date);
      var diffDays = (ed - now) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 30;
    });
  }
  var html = list.map(p=>'<div class="item"><div><div style="font-weight:800">'+p.name+'</div><div style="font-size:12px;color:var(--text-s)">Stock: <span style="color:var(--green)">'+p.quantity+'</span> &middot; Exp: '+(p.expiry_date||'N/A')+'</div></div><div style="color:var(--green);font-weight:800">₹'+p.price+'</div></div>').join('');
  var container = document.getElementById("pg-items-list"); if(container) container.innerHTML = html || '<p style="color:var(--text-s);text-align:center;padding:20px">No matching items</p>';
}
function render(){
  var header = (txt) => '<div class="hdr"><div class="btn-m" data-action="toggle">☰</div><div>'+txt+'</div><div style="width:40px"></div></div>';
  var pgOverview = '<div id="pg-overview" class="pg on">'+header("Overview")+'<div class="cont"><div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:20px"><div class="card" style="margin:0;text-align:center"><div class="lbl">Sales Today</div><div style="font-size:24px;font-weight:800">₹'+(s.todaySales||0)+'</div></div><div class="card" style="margin:0;text-align:center"><div class="lbl">Profit Today</div><div style="font-size:24px;font-weight:800;color:var(--green)">₹'+(s.todayProfit||0)+'</div></div></div><div class="card"><div class="lbl">Sales & Profit Growth</div><div style="height:180px"><canvas id="c-growth"></canvas></div></div><div class="card"><div class="lbl">Customer Bill Trend (Reach)</div><div style="height:180px"><canvas id="c-reach"></canvas></div></div><div class="card"><div class="lbl">Peak Time Analysis</div><div style="height:180px"><canvas id="c-peak"></canvas></div></div></div></div>';
  var pgItems = '<div id="pg-items" class="pg">'+header("Inventory")+'<div class="cont"><div class="pill-row"><div class="pill on" data-filter="ALL">ALL</div><div class="pill" data-filter="LOW">LOW STOCK</div><div class="pill" data-filter="EXP">NEAR EXPIRY</div><div class="pill" data-filter="DEAD">DEAD STOCK</div></div><div id="pg-items-list"></div></div></div>';
  var pgBills = '<div id="pg-bills" class="pg">'+header("Recent Bills")+'<div class="cont">' + (s.recentInvoices||[]).map(i=>'<div class="item"><div><div style="font-weight:800">#'+(i.bill_no||"WALK")+' &middot; '+(i.customer_name||'Walk-in')+'</div><div style="font-size:11px;color:var(--text-s)">'+i.date+'</div></div><div style="text-align:right"><div style="color:var(--green);font-weight:800;margin-bottom:8px">₹'+i.total_amount+'</div><div class="btn-v" data-bill-id="'+i.id+'">View Bill</div></div></div>').join("") + "</div></div>";
  var pgAlerts = '<div id="pg-alerts" class="pg">'+header("Risk Alerts")+'<div class="cont">' + 
    '<div class="lbl">⚠️ Critical Stock Alerts</div>' + ((s.allProductsList||[]).filter(p=>p.quantity < 5).map(p=>'<div class="item" style="border-left:4px solid var(--red)"><div>'+p.name+'</div><div style="color:var(--red);font-weight:800">ONLY '+p.quantity+' LEFT</div></div>').join("") || '<p style="color:var(--text-s);margin-bottom:20px">No stock alerts</p>') +
    '<div class="lbl" style="margin-top:20px">⏰ Expiry Warnings</div>' + ((s.allProductsList||[]).filter(p=>{if(!p.expiry_date)return false; var d=(new Date(p.expiry_date)-new Date())/(86400000); return d>=0 && d<=15;}).map(p=>'<div class="item" style="border-left:4px solid var(--orange)"><div>'+p.name+'</div><div style="color:var(--orange);font-weight:800">EXPIRES '+p.expiry_date+'</div></div>').join("") || '<p style="color:var(--text-s);margin-bottom:20px">No expiry alerts</p>') +
    '</div></div>';
  var pgAi = '<div id="pg-ai" class="pg">'+header("AI Insights")+'<div class="cont" style="display:flex;flex-direction:column;height:calc(100vh - 100px)">' +
      '<div id="ai-chat-box" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;padding-bottom:10px">' +
        '<div class="ai-msg ai-l">Hello! I am your business assistant. Ask me about your sales, today\\'s profit, or stock levels.</div>' +
      '</div>' +
      '<div class="ai-input-wrap">' +
        '<input type="text" id="ai-inp" class="ai-input" placeholder="Ask anything...">' +
        '<button class="ai-send" data-action="ai-send">SEND</button>' +
      '</div>' +
    '</div></div>';
  var pgProf = '<div id="pg-prof" class="pg">'+header("Profile")+'<div class="cont"><div style="text-align:center;margin-bottom:30px"><div style="width:64px;height:64px;background:#1a1a24;border-radius:18px;margin:0 auto 15px;display:flex;align-items:center;justify-content:center">🏙️</div><h2 style="font-weight:800">'+(D.shop?.name||"Shop Name")+'</h2></div><div class="card"><div style="margin-bottom:15px"><div class="lbl">Shop ID</div><div style="color:#6366f1;font-weight:600">'+D.shopId+'</div></div><div style="margin-bottom:15px"><div class="lbl">Owner</div><div style="font-weight:600">'+(D.shop?.owner_name||"N/A")+'</div></div><div style="margin-bottom:15px"><div class="lbl">Address</div><div style="font-weight:600">'+(D.shop?.address||"N/A")+'</div></div><div><div class="lbl">GST Number</div><div style="font-weight:600">'+(D.shop?.gst_number||"N/A")+'</div></div></div><button id="lo-btn" data-action="logout" style="width:100%;background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid #ef4444;padding:18px;border-radius:18px;font-weight:800;cursor:pointer">SECURE LOGOUT</button></div></div>';

  document.getElementById("app").innerHTML = pgOverview + pgItems + pgBills + pgAlerts + pgAi + pgProf;
  renderItems();

  document.body.addEventListener("click", function(e){
    var el = e.target; var act = el.getAttribute("data-action"); if(act === "toggle") toggleSidebar();
    if(act === "logout") safeLogout();
    if(act === "ai-send") handleAiSend();
    var sbi = el.closest(".sb_i"); if(sbi){ 
       var tab = sbi.getAttribute("data-tab"); toggleSidebar(); document.querySelectorAll(".pg").forEach(p=>p.classList.remove("on")); document.querySelectorAll(".sb_i").forEach(s=>s.classList.remove("on"));
       document.getElementById("pg-"+tab).classList.add("on"); sbi.classList.add("on");
    }
    var filt = el.getAttribute("data-filter"); if(filt){ currentProdTab = filt; document.querySelectorAll(".pill").forEach(p=>p.classList.remove("on")); el.classList.add("on"); renderItems(); }
    var bid = el.getAttribute("data-bill-id");
    if(bid){
       var b = (s.recentInvoices||[]).find(x=>x.id==bid); if(!b) return;
       var bitems = (b.items||[]).map(i=>'<div class="item"><div>'+i.name+' x '+i.quantity+'</div><div>₹'+i.total+'</div></div>').join("");
       document.getElementById("modal").innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:20px"><h3 style="font-weight:800">Bill #'+(b.bill_no||"WALK")+'</h3><div data-action="close" style="font-size:24px;cursor:pointer">×</div></div>' + bitems;
       document.getElementById("modal").style.display = "block";
    }
    if(el.getAttribute("data-action") === "close") closeM();
  });
  
  document.body.addEventListener("keypress", function(e){ if(e.key === "Enter" && document.activeElement.id === "ai-inp") handleAiSend(); });

  var monthly = s.monthlySalesBreakdown || []; var mLabels = monthly.map(m=>new Date(m.month).toLocaleString("en-US",{month:"short"}));
  new Chart(document.getElementById("c-growth"), { type:"bar", data: { labels:mLabels, datasets:[{label:"Sales",data:monthly.map(m=>m.total),backgroundColor:"#6366f1",borderRadius:8},{label:"Profit",data:monthly.map(m=>m.total*0.3),backgroundColor:"#22c55e",borderRadius:8}] }, options:{ responsive:true, maintainAspectRatio:false, scales:{ x:{grid:{display:false},ticks:{color:"#888"}}, y:{grid:{color:"#1a1a24"},ticks:{color:"#888"}}} } });
  new Chart(document.getElementById("c-reach"), { type:"line", data: { labels:mLabels, datasets:[{label:"Bills",data:monthly.map(m=>m.bills),borderColor:"#6366f1",tension:0.4,fill:true,backgroundColor:"rgba(99,102,241,0.1)"}] }, options:{ responsive:true, maintainAspectRatio:false, scales:{ x:{grid:{display:false},ticks:{color:"#888"}}, y:{grid:{color:"#1a1a24"},ticks:{color:"#888"}}} } });
  
  var peak = s.peakTimeAnalysis || [{hour:9,count:5},{hour:12,count:20},{hour:18,count:50},{hour:21,count:10}];
  new Chart(document.getElementById("c-peak"), { type:"line", data: { labels:peak.map(p=>p.hour+":00"), datasets:[{label:"Customer Footfall",data:peak.map(p=>p.count),borderColor:"#f97316",tension:0.4,fill:true,backgroundColor:"rgba(249,115,22,0.1)"}] }, options:{ responsive:true, maintainAspectRatio:false, scales:{ x:{grid:{display:false},ticks:{color:"#888"}}, y:{grid:{color:"#1a1a24"},ticks:{color:"#888"}}} } });
}
render();
</script></body></html>`;
  };

  const renderDashboard = () => {
    if (dashLoading && !dashData) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#020205' }}><ActivityIndicator size="large" color="#6366f1" /></View>;
    if (dashError) return <View style={styles.sw}><ErrBox msg={dashError} /><TouchableOpacity style={styles.pb} onPress={fetchDashboardData}><Text style={styles.pt}>Retry</Text></TouchableOpacity></View>;
    const html = buildDashboardHtml(dashData?.s || {}, dashData?.ts || '', dashData?.sh || {});
    return (
      <View style={{ flex: 1 }}>
        {Platform.OS === 'web' ? (
          <iframe srcDoc={html} style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#020205' }} title="Dashboard" />
        ) : (
          RNWebView ? (
            <RNWebView source={{ html }} style={{ flex: 1, backgroundColor: '#020205' }} onMessage={(e) => { if (e.nativeEvent.data === 'logout') { Store.del('iva_paired'); Store.del('iva_shop_id'); setScreen('login'); } }} />
          ) : (
            <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><Text style={{color:'white'}}>WebView Module Loading...</Text></View>
          )
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.c}><StatusBar barStyle="light-content" backgroundColor="#020205" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {screen === 'loading' && <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator size="large" color="#6366f1" />
          <TouchableOpacity style={{marginTop:20, alignSelf:'center'}} onPress={()=>setScreen('login')}><Text style={{color:'#6366f1'}}>Trouble loading? Click to Login</Text></TouchableOpacity>
        </View>}
        {screen === 'login' && renderLogin()}
        {screen === 'register' && renderRegister()}
        {screen === 'shopId' && renderShopId()}
        {screen === 'pairing_jump' && renderPairingJump()}
        {screen === 'pairing' && renderPairing()}
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
  bl: { marginTop: 24, alignItems: 'center' },
  blt: { color: '#444', fontSize: 13 },
  blh: { color: '#6366f1', fontWeight: '800' },
  eb: { color: '#ef4444', fontSize: 12, marginTop: 16, textAlign: 'center', backgroundColor: 'rgba(239,68,68,0.1)', padding: 12, borderRadius: 12 },
});
