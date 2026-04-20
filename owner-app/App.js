import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, StatusBar, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

let RNWebView = null;
if (Platform.OS !== 'web') {
  try {
    RNWebView = require('react-native-webview').WebView;
  } catch (e) {
    console.warn("WebView not available");
  }
}

/* ── CONFIGURATION (MASTER CONTROL PLANE) ── */
const GLOBAL_URL = 'https://baawqrqihlhsrghvjlpx.supabase.co';
const GLOBAL_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0';

const Store = {
  _mem: {},
  get(k) { try { return Platform.OS === 'web' ? localStorage.getItem(k) : (Store._mem[k] || null); } catch { return null; } },
  set(k, v) { try { if (Platform.OS === 'web') localStorage.setItem(k, v); Store._mem[k] = v; } catch { } },
  del(k) { try { if (Platform.OS === 'web') localStorage.removeItem(k); delete Store._mem[k]; } catch { } },
};

const Label = ({ children }) => <Text style={styles.l}>{children}</Text>;
const ErrBox = ({ msg }) => <Text style={styles.eb}>⚠️ {msg}</Text>;
const SuccessBox = ({ msg }) => <Text style={styles.sb}>✅ {msg}</Text>;

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shopIdInput, setShopIdInput] = useState('');
  const [pairingCode, setPairingCode] = useState('');

  const [session, setSession] = useState({ id: null, url: null, key: null });
  const [dashData, setDashData] = useState(null);
  const [dashLoading, setDashLoading] = useState(true);

  const pollRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      const paired = await Store.get('iva_paired');
      const sid = await Store.get('iva_shop_id');
      const sUrl = await Store.get('iva_shop_url');
      const sKey = await Store.get('iva_shop_key');
      if (paired === 'true' && sid && sUrl && sKey) {
        setSession({ id: sid, url: sUrl, key: sKey });
        setScreen('dashboard');
      } else {
        setScreen('start');
      }
    };
    init();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const fetchDashboardData = async () => {
    if (!session.id) return;
    try {
      setDashLoading(true);
      const statsRes = await fetch(`${GLOBAL_URL}/rest/v1/shop_stats?shop_id=eq.${session.id}&select=stats_json,updated_at`, {
        headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}` }
      });
      const statsJson = await statsRes.json();
      const shopRes = await fetch(`${GLOBAL_URL}/rest/v1/shops?id=eq.${session.id}`, {
        headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}` }
      });
      const shopData = await shopRes.json();
      setDashData({
        s: statsJson?.[0]?.stats_json || {},
        ts: statsJson?.[0]?.updated_at || '',
        sh: shopData?.[0] || { id: session.id }
      });
      setDashLoading(false);
    } catch (e) { setDashLoading(false); }
  };

  useEffect(() => {
    if (screen === 'dashboard' && session.id) {
      fetchDashboardData();
      const interval = setInterval(fetchDashboardData, 120000);
      return () => clearInterval(interval);
    }
  }, [screen, session]);

  const handleSignup = async () => {
    if (!email || !password || !fullName) { setError('Name, Email and Password required'); return; }
    setLoading(true); setError('');
    try {
      await fetch(`${GLOBAL_URL}/rest/v1/shops`, {
        method: 'POST',
        headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'shop-' + Math.random().toString(36).substr(2, 6), owner_name: fullName, owner_email: email.trim().toLowerCase(), master_key: password, validity_end: new Date(Date.now() + 365 * 86400000).toISOString() })
      });
      setSuccess('Enterprise Registered! Login to proceed.');
      setScreen('login');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleLogin = async () => {
    if (!email || !password) { setError('Enter credentials'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${GLOBAL_URL}/rest/v1/shops?owner_email=eq.${email.trim().toLowerCase()}&master_key=eq.${password}`, {
        headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}` }
      });
      const users = await res.json();
      if (users && users.length > 0) { setShopIdInput(users[0].id); setScreen('shopId'); }
      else setError('Invalid Master Key or Email');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const generatePairingCode = async () => {
    if (!shopIdInput) { setError('Enter Shop ID'); return; }
    setLoading(true); setError('');
    try {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await fetch(`${GLOBAL_URL}/rest/v1/pairing_codes`, {
        method: 'POST',
        headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: shopIdInput.trim(), code, status: 'pending', expires_at: new Date(Date.now() + 600000).toISOString() })
      });
      setPairingCode(code); setScreen('pairing');
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const res = await fetch(`${GLOBAL_URL}/rest/v1/pairing_codes?shop_id=eq.${shopIdInput.trim()}&code=eq.${code}&status=eq.used`, {
          headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}` }
        });
        const done = await res.json();
        if (done && done.length > 0) { clearInterval(pollRef.current); completePairing(shopIdInput.trim()); }
      }, 3000);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const completePairing = async (sid) => {
    try {
      const res = await fetch(`${GLOBAL_URL}/rest/v1/shops?id=eq.${sid}`, { headers: { 'apikey': GLOBAL_KEY, 'Authorization': `Bearer ${GLOBAL_KEY}` } });
      const shop = (await res.json())[0];
      if (shop.shop_supabase_url && shop.shop_supabase_key) {
        await Store.set('iva_shop_id', shop.id);
        await Store.set('iva_shop_url', shop.shop_supabase_url);
        await Store.set('iva_shop_key', shop.shop_supabase_key);
        await Store.set('iva_paired', 'true');
        setSession({ id: shop.id, url: shop.shop_supabase_url, key: shop.shop_supabase_key });
        setScreen('dashboard');
      } else {
        Alert.alert('Terminal Issue', 'Shop plane not ready. Contact support.');
        setScreen('shopId');
      }
    } catch (e) { setError(e.message); }
  };

  // ── ELITE SAAS DASHBOARD HTML ──
  const buildDashboardHtml = (stats, ts, shopInfo, tenUrl, tenKey) => {
    const json = JSON.stringify({ stats, ts, shop: shopInfo, url: tenUrl, key: tenKey })
      .replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

    return `<!DOCTYPE html><html><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js"><\/script>
<style>
:root{--bg:#020205;--card:#0a0a0f;--border:#151520;--text:#fff;--text-s:#888;--indigo:#6366f1;--green:#10b981;--red:#ef4444;--orange:#f59e0b;--card-h:#1a1a24}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Lexend',sans-serif;background:var(--bg);color:var(--text);height:100vh;overflow:hidden}
.sb_i{width:48px;height:48px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text-s);margin-bottom:20px;border-radius:14px;cursor:pointer;transition:0.2s}
.sb_i.on{color:var(--indigo);background:rgba(99,102,241,0.15);box-shadow:0 0 20px rgba(99,102,241,0.2)}
.sb_i span{font-size:7px;font-weight:700;margin-top:5px;text-transform:uppercase;letter-spacing:1px}
.pg{width:100%;display:none;height:100vh;overflow-y:auto;padding-bottom:120px;scroll-behavior:smooth}.pg.on{display:block}
.hdr{position:sticky;top:0;background:rgba(2,2,5,0.7);backdrop-filter:blur(20px);padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;z-index:1500}
.h_title{font-size:18px;font-weight:900;letter-spacing:1px;background:linear-gradient(90deg,#fff,#888);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.cont{padding:24px}.card{background:var(--card);border:1px solid var(--border);border-radius:28px;padding:22px;margin-bottom:22px;transition:0.3s}
.card:hover{border-color:var(--indigo)}
.lbl{font-size:9px;color:var(--text-s);font-weight:800;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:15px}
.stat_v{font-size:28px;font-weight:900;letter-spacing:-0.5px}
.item{background:var(--card);border:1px solid var(--border);padding:20px;border-radius:22px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center}
.ai-box{height:350px;overflow-y:auto;display:flex;flex-direction:column;gap:10px}
.ai-msg{padding:14px 18px;border-radius:20px;max-width:85%;font-size:13px;line-height:1.6}
.ai-l{background:var(--card-h);align-self:flex-start;border-bottom-left-radius:4px}
.ai-r{background:var(--indigo);align-self:flex-end;border-bottom-right-radius:4px}
.ai-in{display:flex;gap:12px;margin-top:15px;background:var(--card);padding:12px;border-radius:22px;border:1px solid var(--border)}
.ai-in input{flex:1;background:transparent;border:none;color:white;padding:10px;outline:none;font-family:inherit}
.ai-btn{background:var(--indigo);color:white;padding:10px 20px;border-radius:15px;font-weight:800;cursor:pointer;border:none}
.vip-card{display:flex;align-items:center;gap:15px;padding:15px 0;border-bottom:1px solid var(--border)}
.vip-rank{width:32px;height:32px;background:var(--indigo);display:flex;align-items:center;justify-content:center;border-radius:50%;font-weight:900;font-size:12px}
.sb{width:76px;height:100vh;border-right:1px solid var(--border);display:flex;flex-direction:column;align-items:center;padding:25px 0;position:fixed;left:-76px;z-index:2000;background:rgba(2,2,5,0.97);backdrop-filter:blur(20px);transition:left 0.25s ease}
.sb.open{left:0}.overlay{display:none;position:fixed;inset:0;z-index:1999;background:rgba(0,0,0,0.5)}.overlay.on{display:block}
.tog{background:rgba(255,255,255,0.05);border:1px solid var(--border);width:38px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:12px;cursor:pointer;flex-shrink:0}
.tog svg{width:18px;height:18px;stroke:var(--text-s);fill:none;stroke-width:2;stroke-linecap:round}
.sb_i svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
</style></head><body>
<div class="overlay" id="overlay" onclick="closeSb()"></div>
<div class="sb" id="sb">
  <div class="sb_i on" data-tab="overview"><svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg><span>Overview</span></div>
  <div class="sb_i" data-tab="items"><svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/></svg><span>Items</span></div>
  <div class="sb_i" data-tab="bills"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg><span>Bills</span></div>
  <div class="sb_i" data-tab="cust"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg><span>Clients</span></div>
  <div class="sb_i" data-tab="ai"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg><span>AI</span></div>
  <div class="sb_i" data-tab="prof"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg><span>Profile</span></div>
</div>
<div id="app"></div>
<script>
var D = ${json};
var s = D.stats || {};

async function live(path){
  try {
    var res = await fetch(D.url + "/rest/v1/" + path, { headers: { apikey: D.key, Authorization: 'Bearer '+D.key } });
    return await res.json();
  } catch(e) { return []; }
}

function hdr(tx){ return '<div class="hdr"><div class="h_title">'+tx+'</div><div style="font-size:10px;color:var(--text-s)">'+new Date().toLocaleTimeString()+'</div></div>'; }
function safeLogout(){ if(confirm("Terminate SaaS Session?")){ window.ReactNativeWebView ? window.ReactNativeWebView.postMessage("logout") : window.parent.postMessage("logout","*"); } }

// ── OVERVIEW: Today Stats + Overall Stats ──
async function renderOverviewStats(){
  try {
    var today = new Date(); today.setHours(0,0,0,0);

    // All invoices for overall calculation
    var allInvs = await live('invoices?select=local_id,total_amount,created_at&limit=5000');
    var rev = 0; var overallRev = 0;
    allInvs.forEach(function(i){
      var amt = parseFloat(i.total_amount || 0);
      overallRev += amt;
      if(new Date(i.created_at) >= today) rev += amt;
    });

    // Build products cost map: local_id -> cost_price
    var prods = await live('products?select=local_id,price,cost_price&limit=1000');
    var costMap = {};
    prods.forEach(function(p){ costMap[p.local_id] = { cost: parseFloat(p.cost_price || 0), sell: parseFloat(p.price || 0) }; });

    // Today's invoice items for today profit
    var todayLocalIds = allInvs.filter(function(i){ return new Date(i.created_at) >= today; }).map(function(i){ return i.local_id; }).filter(Boolean);
    var pft = 0;
    if(todayLocalIds.length > 0){
      var items = await live('invoice_items?select=product_id,quantity,price&invoice_id=in.('+todayLocalIds.join(',')+')');
      items.forEach(function(item){
        var ci = costMap[item.product_id];
        var sellP = parseFloat(item.price || (ci ? ci.sell : 0));
        var costP = ci ? ci.cost : 0;
        pft += (sellP - costP) * parseFloat(item.quantity || 1);
      });
    }

    // Overall profit from ALL invoice items
    var allItems = await live('invoice_items?select=product_id,quantity,price&limit=10000');
    var overallPft = 0;
    allItems.forEach(function(item){
      var ci = costMap[item.product_id];
      var sellP = parseFloat(item.price || (ci ? ci.sell : 0));
      var costP = ci ? ci.cost : 0;
      overallPft += (sellP - costP) * parseFloat(item.quantity || 1);
    });

    var el1 = document.getElementById('stat-rev');
    var el2 = document.getElementById('stat-pft');
    var el3 = document.getElementById('stat-orev');
    var el4 = document.getElementById('stat-opft');
    if(el1) el1.textContent = '\u20b9' + rev.toFixed(0);
    if(el2) el2.textContent = '\u20b9' + pft.toFixed(0);
    if(el3) el3.textContent = '\u20b9' + overallRev.toFixed(0);
    if(el4) el4.textContent = '\u20b9' + overallPft.toFixed(0);
  } catch(e) { console.log('stats err', e); }
}

// ── OVERVIEW: 3 Charts (real data from invoices) ──
async function renderOverviewCharts(){
  Chart.defaults.color = "#45455a";
  Chart.defaults.font.family = "'Lexend'";

  // CHART 1: Monthly Revenue vs Real Profit (invoice_items x products.cost_price via local_id)
  try {
    // Build cost map from products using local_id as key
    var allProds = await live('products?select=local_id,price,cost_price&limit=1000');
    var cMap = {};
    allProds.forEach(function(p){ cMap[p.local_id] = { cost: parseFloat(p.cost_price||0), sell: parseFloat(p.price||0) }; });

    // Fetch all invoices grouped by month
    var inv1 = await live('invoices?select=local_id,created_at,total_amount&order=created_at.asc&limit=2000');
    var byM = {};
    var localIdToMonth = {};
    inv1.forEach(function(i){
      var d = new Date(i.created_at);
      var k = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
      if(!byM[k]) byM[k] = { lbl: d.toLocaleString('en-US',{month:'short',year:'2-digit'}), sales:0, profit:0 };
      byM[k].sales += parseFloat(i.total_amount || 0);
      if(i.local_id) localIdToMonth[i.local_id] = k;
    });

    // Fetch all invoice_items and calculate profit per month
    var allItems = await live('invoice_items?select=invoice_id,product_id,quantity,price&limit=5000');
    allItems.forEach(function(item){
      var mk2 = localIdToMonth[item.invoice_id];
      if(!mk2 || !byM[mk2]) return;
      var ci = cMap[item.product_id];
      var sellP = parseFloat(item.price || (ci ? ci.sell : 0));
      var costP = ci ? ci.cost : 0;
      byM[mk2].profit += (sellP - costP) * parseFloat(item.quantity || 1);
    });

    var mk = Object.keys(byM).sort();
    new Chart(document.getElementById('c-growth'), {
      type:'bar',
      data:{ labels: mk.map(function(k){ return byM[k].lbl; }),
        datasets:[
          { label:'Revenue (Rs)', data: mk.map(function(k){ return Math.round(byM[k].sales); }), backgroundColor:'rgba(99,102,241,0.9)', borderRadius:8, borderSkipped:false },
          { label:'Profit (Rs)', data: mk.map(function(k){ return Math.round(byM[k].profit); }), backgroundColor:'rgba(16,185,129,0.9)', borderRadius:8, borderSkipped:false }
        ]
      },
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:true, labels:{ color:'#888', font:{size:10,weight:'bold'}, boxWidth:10 } },
          tooltip:{ callbacks:{ label: function(c){ return 'Rs '+c.raw; } } } },
        scales:{ x:{ grid:{display:false}, ticks:{color:'#555'} }, y:{ grid:{color:'rgba(255,255,255,0.03)'}, ticks:{ color:'#555', callback: function(v){ return 'Rs '+v; } } } }
      }
    });
  } catch(e) { console.log('c1 err', e); }

  // CHART 2: Peak Hour Analysis (bills per hour)
  try {
    var inv2 = await live('invoices?select=created_at&limit=2000');
    var perHr = {};
    for(var h=8; h<=21; h++){ perHr[h] = 0; }
    inv2.forEach(function(i){ var hr = new Date(i.created_at).getHours(); if(perHr.hasOwnProperty(hr)) perHr[hr]++; });
    var hKeys = Object.keys(perHr).map(Number).sort(function(a,b){ return a-b; });
    var hLabels = hKeys.map(function(hr){ return (hr%12||12)+(hr<12?'am':'pm'); });
    var hData = hKeys.map(function(hr){ return perHr[hr]; });
    new Chart(document.getElementById('c-peak'), {
      type:'line',
      data:{ labels: hLabels,
        datasets:[{ label:'Bills/Hour', data: hData, borderColor:'#6366f1', backgroundColor:'rgba(99,102,241,0.1)', tension:0.5, fill:true, pointBackgroundColor:'#6366f1', pointRadius:4, pointHoverRadius:7 }]
      },
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:true, labels:{ color:'#888', font:{size:10}, boxWidth:10 } } },
        scales:{ x:{ grid:{display:false}, ticks:{color:'#555'} }, y:{ grid:{color:'rgba(255,255,255,0.03)'}, beginAtZero:true, ticks:{color:'#555'} } }
      }
    });
  } catch(e) { console.log('c2 err', e); }

  // CHART 3: Last 7 days - actual daily revenue comparison
  try {
    var wLabels = [], dayKeys = [], dayMap = {};
    for(var j=6; j>=0; j--){
      var dd = new Date();
      dd.setDate(dd.getDate() - j);
      dd.setHours(0,0,0,0);
      var dk = dd.getFullYear()+'-'+(dd.getMonth()+1)+'-'+dd.getDate();
      var dl = dd.toLocaleDateString('en-US',{weekday:'short', month:'short', day:'numeric'});
      wLabels.push(dl); dayKeys.push(dk); dayMap[dk] = 0;
    }
    var sinceDate = new Date(); sinceDate.setDate(sinceDate.getDate()-6); sinceDate.setHours(0,0,0,0);
    var inv3 = await live('invoices?select=created_at,total_amount&created_at=gte.'+sinceDate.toISOString()+'&limit=2000');
    inv3.forEach(function(i){
      var d = new Date(i.created_at);
      var dk2 = d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
      if(dayMap.hasOwnProperty(dk2)) dayMap[dk2] += parseFloat(i.total_amount || 0);
    });
    var wData = dayKeys.map(function(k){ return Math.round(dayMap[k]); });
    var maxW = Math.max.apply(null, wData);
    new Chart(document.getElementById('c-week'), {
      type:'bar',
      data:{ labels: wLabels,
        datasets:[{ label:'Revenue (Rs)', data: wData,
          backgroundColor: wData.map(function(v){ return (v === maxW && maxW > 0) ? '#f59e0b' : 'rgba(245,158,11,0.28)'; }),
          borderRadius:10, borderSkipped:false
        }]
      },
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:true, labels:{ color:'#888', font:{size:10}, boxWidth:10 } },
          tooltip:{ callbacks:{ label: function(c){ return 'Rs '+c.raw; } } } },
        scales:{ x:{ grid:{display:false}, ticks:{color:'#555', font:{size:9}} }, y:{ grid:{color:'rgba(255,255,255,0.03)'}, beginAtZero:true, ticks:{ color:'#555', callback: function(v){ return 'Rs '+v; } } } }
      }
    });
  } catch(e) { console.log('c3 err', e); }
}

// Store items data globally for filter toggling
var _allProducts = [];
var _lowStockList = [];
var _expiryList = [];
var _deadList = [];
var _activeFilter = 'all'; // 'all' | 'low' | 'expiry' | 'dead'

function showFilteredItems(filter) {
  if(_activeFilter === filter) { _activeFilter = 'all'; } else { _activeFilter = filter; }
  // Update card active styles
  var cards = document.querySelectorAll('.inv-filter-card');
  cards.forEach(function(c){ c.style.boxShadow = 'none'; c.style.opacity = '0.6'; });
  if(_activeFilter !== 'all') {
    var activeCard = document.getElementById('fc-'+_activeFilter);
    if(activeCard) { activeCard.style.boxShadow = '0 0 15px rgba(99,102,241,0.4)'; activeCard.style.opacity = '1'; }
  } else {
    cards.forEach(function(c){ c.style.opacity = '1'; });
  }

  var listEl = document.getElementById('it-list');
  var titleEl = document.getElementById('it-title');
  if(!listEl) return;

  var items = [];
  if(_activeFilter === 'low') { items = _lowStockList; titleEl.textContent = 'Low Stock Items'; }
  else if(_activeFilter === 'expiry') { items = _expiryList; titleEl.textContent = 'Expiring Soon'; }
  else if(_activeFilter === 'dead') { items = _deadList; titleEl.textContent = 'Dead Stock'; }
  else { items = _allProducts; titleEl.textContent = 'Registered Products'; }

  if(items.length === 0) {
    listEl.innerHTML = '<p style="color:var(--text-s);text-align:center;padding:30px">No items found</p>';
    return;
  }

  listEl.innerHTML = items.map(function(p){
    var badge = '';
    if(_activeFilter === 'low' || (_activeFilter === 'all' && p.quantity < 10)) badge = '<span style="font-size:9px;background:rgba(239,68,68,0.15);color:var(--red);padding:2px 8px;border-radius:20px;margin-left:8px">LOW</span>';
    var extra = '';
    if(_activeFilter === 'expiry' && p.expiry_date) {
      var ed = new Date(p.expiry_date).toLocaleDateString('en-US',{month:'short',day:'numeric'});
      extra = '<div style="font-size:11px;color:var(--text-s)">Expires: <span style="font-weight:bold;color:#f59e0b">'+ed+'</span></div>';
    } else if(_activeFilter === 'dead') {
      extra = '<div style="font-size:11px;color:var(--text-s)">Stock: '+p.quantity+' &middot; No sales 30d</div>';
    } else {
      extra = '<div style="font-size:11px;color:var(--text-s)">'+(p.category_name||'')+(p.quantity!==undefined?' &middot; Stock: '+p.quantity:'')+' </div>';
    }
    var priceColor = _activeFilter === 'dead' ? 'var(--orange)' : 'var(--green)';
    return '<div class="item"><div><div style="font-weight:800">'+p.name+badge+'</div>'+extra+'</div><div style="color:'+priceColor+';font-weight:800">Rs '+p.price+'</div></div>';
  }).join('');
}

async function renderItems(){
  var all = await live('products?limit=500');
  _allProducts = all;
  _lowStockList = all.filter(function(p){ return p.quantity > 0 && p.quantity < 10; });

  // Expiry: next 30 days
  var dNow = new Date(); dNow.setHours(0,0,0,0);
  var d30 = new Date(); d30.setDate(dNow.getDate() + 30);
  _expiryList = all.filter(function(p) {
    if(!p.expiry_date) return false;
    var ex = new Date(p.expiry_date);
    return ex >= dNow && ex <= d30;
  });

  // Update count badges
  var ac = document.getElementById('all-count'); if(ac) ac.textContent = all.length;
  var lc = document.getElementById('low-count'); if(lc) lc.textContent = _lowStockList.length;
  var ec = document.getElementById('exp-count'); if(ec) ec.textContent = _expiryList.length;

  // Dead stock
  try {
    var thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate()-30); thirtyAgo.setHours(0,0,0,0);
    var recentInvs = await live('invoices?select=local_id&created_at=gte.'+thirtyAgo.toISOString());
    var activeIds = {}; recentInvs.forEach(function(i){ activeIds[i.local_id]=1; });
    var recentItems = await live('invoice_items?select=product_id,invoice_id&limit=5000');
    var soldPids = {}; recentItems.forEach(function(i){ if(activeIds[i.invoice_id]) soldPids[i.product_id]=1; });
    _deadList = all.filter(function(p){ return p.quantity > 0 && !soldPids[p.local_id]; });
    var dc = document.getElementById('dead-count'); if(dc) dc.textContent = _deadList.length;
  } catch(ex){ _deadList = []; }

  // Show based on current filter
  showFilteredItems(_activeFilter);
}

async function renderBills(){
  var bills = await live('invoices?select=id,local_id,bill_no,customer_name,created_at,total_amount,payment_mode&order=created_at.desc&limit=50');
  document.getElementById('bl-list').innerHTML = bills.map(function(b){
    return '<div class="item" style="cursor:pointer;flex-direction:column;align-items:stretch" onclick="toggleBillItems('+b.local_id+')">'+'<div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-weight:800">#'+(b.bill_no||'WALK')+' &middot; '+(b.customer_name||'Walk-in')+'</div><div style="font-size:11px;color:var(--text-s)">'+new Date(b.created_at).toLocaleString()+'</div></div><div style="text-align:right"><div style="color:var(--green);font-weight:800">Rs '+b.total_amount+'</div><div style="font-size:9px;color:var(--text-s)">'+(b.payment_mode||'CASH')+'</div></div></div><div id="bi-'+b.local_id+'" style="display:none"></div></div>';
  }).join('') || '<p style="text-align:center;padding:40px;color:var(--text-s)">No Bills</p>';
}
async function toggleBillItems(lid){
  var el=document.getElementById('bi-'+lid); if(!el) return;
  if(el.style.display==='block'){el.style.display='none';return;}
  el.style.display='block'; el.innerHTML='<div style="color:var(--text-s);font-size:12px;padding:8px 0">Loading...</div>';
  try{
    var items=await live('invoice_items?select=product_id,quantity,price&invoice_id=eq.'+lid);
    var pids=items.map(function(i){return i.product_id;});
    var prods=pids.length?await live('products?select=local_id,name&local_id=in.('+pids.join(',')+')'):[]; 
    var nm={}; prods.forEach(function(p){nm[p.local_id]=p.name;});
    el.innerHTML='<div style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px">'+items.map(function(i){
      return '<div style="display:flex;justify-content:space-between;padding:5px 0;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.03)"><span>'+(nm[i.product_id]||'Item')+' x'+i.quantity+'</span><span style="color:var(--green)">Rs '+(i.price*i.quantity).toFixed(0)+'</span></div>';
    }).join('')+'</div>';
  }catch(ex){el.innerHTML='<p style="color:var(--text-s);font-size:12px">Error</p>';}
}

async function renderClients(){
  var invoices = await live('invoices?select=customer_name,total_amount');
  var stats = {};
  invoices.forEach(function(i){
    var n = i.customer_name || 'Walk-in';
    if(!stats[n]) stats[n] = { visits:0, spent:0 };
    stats[n].visits++;
    stats[n].spent += parseFloat(i.total_amount);
  });
  var tops = Object.keys(stats).map(function(k){ return { name:k, visits:stats[k].visits, spent:stats[k].spent }; }).sort(function(a,b){ return b.spent - a.spent; }).slice(0,5);
  document.getElementById("cl-list").innerHTML = tops.map(function(c,i){
    return '<div class="vip-card"><div class="vip-rank">'+(i+1)+'</div><div style="flex:1"><div style="font-weight:800">'+c.name+'</div><div style="font-size:10px;color:var(--text-s)">'+c.visits+' Visits</div></div><div style="color:var(--green);font-weight:800">Rs '+c.spent.toFixed(0)+'</div></div>';
  }).join('') || '<p style="color:var(--text-s)">No data</p>';
}

function handleAi(){
  var inp = document.getElementById("ai-i"); if(!inp || !inp.value.trim()) return;
  var box = document.getElementById("ai-b");
  box.innerHTML += '<div class="ai-msg ai-r">'+inp.value+'</div>';
  var v = inp.value.toLowerCase(); inp.value = "";
  setTimeout(function(){
    var r;
    if(v.includes("profit")) r = "Net Profit: Rs "+(s.todayProfit||0)+". Margin is calculated from invoice records.";
    else if(v.includes("sale")) r = "Revenue synced from database. Today: Rs "+(s.todaySales||0);
    else if(v.includes("customer")||v.includes("client")) r = "Client intelligence active. Check the Clients tab for VIP analysis.";
    else if(v.includes("stock")||v.includes("inventory")) r = "Inventory scan running. Navigate to Items tab for low-stock alerts.";
    else r = "iVA Elite online. Database: "+D.url.split('//')[1]+" is live and synced.";
    box.innerHTML += '<div class="ai-msg ai-l">'+r+'</div>';
    box.scrollTop = box.scrollHeight;
  }, 800);
}

function openSb(){document.getElementById('sb').classList.add('open');document.getElementById('overlay').classList.add('on');}
function closeSb(){document.getElementById('sb').classList.remove('open');document.getElementById('overlay').classList.remove('on');}

function hdrWithTog(tx){ return '<div class="hdr"><div class="tog" onclick="openSb()"><svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></div><div class="h_title">'+tx+'</div><div style="width:38px"></div></div>'; }

var _currentTab = 'overview';

function render(){
  var ov = '<div id="pg-overview" class="pg on">'+hdrWithTog("Overview")+'<div class="cont">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px">' +
      '<div class="card" style="margin:0;background:linear-gradient(135deg,#6366f1 0%,#4338ca 100%)"><div class="lbl">Revenue Today</div><div class="stat_v" id="stat-rev" style="font-size:22px">...</div></div>' +
      '<div class="card" style="margin:0;border-left:4px solid var(--green)"><div class="lbl">Profit Today</div><div class="stat_v" style="color:var(--green);font-size:22px" id="stat-pft">...</div></div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:25px">' +
      '<div class="card" style="margin:0;border-left:4px solid var(--indigo)"><div class="lbl">Overall Sales</div><div class="stat_v" style="font-size:18px;color:var(--indigo)" id="stat-orev">...</div></div>' +
      '<div class="card" style="margin:0;border-left:4px solid #10b981"><div class="lbl">Overall Profit</div><div class="stat_v" style="font-size:18px;color:#10b981" id="stat-opft">...</div></div>' +
    '</div>' +
    '<div class="card"><div class="lbl">Sales vs Profit &mdash; Monthly Trend</div><div style="height:220px"><canvas id="c-growth"></canvas></div></div>' +
    '<div class="card"><div class="lbl">Peak Hour Analysis &mdash; Bills Per Hour</div><div style="height:190px"><canvas id="c-peak"></canvas></div></div>' +
    '<div class="card"><div class="lbl">Last 7 Days &mdash; Daily Revenue Comparison</div><div style="height:190px"><canvas id="c-week"></canvas></div></div>' +
    '</div></div>';
  var it = '<div id="pg-items" class="pg">'+hdrWithTog("Inventory")+'<div class="cont">' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px">' +
      '<div class="card inv-filter-card" id="fc-all" data-filter="all" style="margin:0;padding:12px;border-bottom:3px solid var(--indigo);cursor:pointer"><div class="lbl">Products</div><div style="font-size:18px;font-weight:900;color:var(--indigo)" id="all-count">...</div></div>' +
      '<div class="card inv-filter-card" id="fc-low" data-filter="low" style="margin:0;padding:12px;border-bottom:3px solid var(--red);cursor:pointer"><div class="lbl">Low Stock</div><div style="font-size:18px;font-weight:900;color:var(--red)" id="low-count">...</div></div>' +
      '<div class="card inv-filter-card" id="fc-expiry" data-filter="expiry" style="margin:0;padding:12px;border-bottom:3px solid #f59e0b;cursor:pointer"><div class="lbl">Near Expiry</div><div style="font-size:18px;font-weight:900;color:#f59e0b" id="exp-count">...</div></div>' +
      '<div class="card inv-filter-card" id="fc-dead" data-filter="dead" style="margin:0;padding:12px;border-bottom:3px solid var(--orange);cursor:pointer"><div class="lbl">Dead Stock</div><div style="font-size:18px;font-weight:900;color:var(--orange)" id="dead-count">...</div></div>' +
    '</div>' +
    '<div class="lbl" style="margin:5px 0 10px" id="it-title">All Products</div><div id="it-list"><div style="text-align:center;padding:40px;color:var(--text-s)">Loading...</div></div></div></div>';
  var bl = '<div id="pg-bills" class="pg">'+hdrWithTog("Invoices")+'<div class="cont"><div id="bl-list"><div style="text-align:center;padding:40px;color:var(--text-s)">Loading...</div></div></div></div>';
  var cl = '<div id="pg-cust" class="pg">'+hdrWithTog("Clients")+'<div class="cont"><div class="card"><div class="lbl">Top Spenders</div><div id="cl-list"><div style="color:var(--text-s)">Loading...</div></div></div></div></div>';
  var ai = '<div id="pg-ai" class="pg">'+hdrWithTog("AI Consultant")+'<div class="cont"><div class="card" style="background:var(--card-h)"><div class="ai-box" id="ai-b"><div class="ai-msg ai-l">iVA Elite Protocol Engaged. All systems live.</div></div><div class="ai-in"><input id="ai-i" placeholder="Ask about sales, profit, inventory..."><button class="ai-btn" onclick="handleAi()">SEND</button></div></div></div></div>';
  var pf = '<div id="pg-prof" class="pg">'+hdrWithTog("Profile")+'<div class="cont"><div style="text-align:center;padding:40px 0"><div style="font-size:48px;margin-bottom:15px">&#x1F3E2;</div><h2 style="font-weight:900">'+(D.shop?.store_name||D.shop?.owner_name||'INDIAN MART')+'</h2><div style="color:var(--indigo);font-weight:800;font-size:12px;margin-top:5px">'+D.shop?.id+'</div></div><div class="card"><div class="lbl">Owner</div><div style="font-weight:700">'+(D.shop?.owner_name||'-')+'</div><div class="lbl" style="margin-top:20px">GST Number</div><div style="font-weight:900;color:var(--green)">'+(D.shop?.gst_number||'Not Set')+'</div><div class="lbl" style="margin-top:20px">Email</div><div style="font-weight:700">'+(D.shop?.owner_email||'-')+'</div></div><button onclick="safeLogout()" style="width:100%;padding:20px;background:#1a1a24;color:var(--red);border-radius:24px;border:1px solid #301010;font-weight:900;cursor:pointer;margin-top:30px;font-family:Lexend">LOGOUT</button></div></div>';

  document.getElementById('app').innerHTML = ov + it + bl + cl + ai + pf;

  // Restore active tab after re-render
  document.querySelectorAll('.pg').forEach(function(p){ p.classList.remove('on'); });
  document.querySelectorAll('.sb_i').forEach(function(s){ s.classList.remove('on'); });
  var targetPg = document.getElementById('pg-'+_currentTab);
  if(targetPg) targetPg.classList.add('on');
  var targetSb = document.querySelector('.sb_i[data-tab="'+_currentTab+'"]');
  if(targetSb) targetSb.classList.add('on');

  document.body.addEventListener('click', function(e){
    // Sidebar tab switching
    var sbi = e.target.closest('.sb_i');
    if(sbi){
      var tab = sbi.getAttribute('data-tab');
      _currentTab = tab;
      document.querySelectorAll('.pg').forEach(function(p){ p.classList.remove('on'); });
      document.querySelectorAll('.sb_i').forEach(function(s){ s.classList.remove('on'); });
      document.getElementById('pg-'+tab).classList.add('on');
      sbi.classList.add('on');
      closeSb();
    }
    // Inventory filter card toggling
    var fc = e.target.closest('.inv-filter-card');
    if(fc){
      var f = fc.getAttribute('data-filter');
      if(f) showFilteredItems(f);
    }
  });

  renderOverviewStats();
  renderOverviewCharts();
  renderItems();
  renderBills();
  renderClients();
}

render();
<\/script></body></html>`;
  };

  const renderDashboardData = () => {
    if (dashLoading && !dashData) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: '#020205' }}><ActivityIndicator size="large" color="#6366f1" /></View>;
    const html = buildDashboardHtml(dashData?.s || {}, dashData?.ts || '', dashData?.sh || {}, session.url, session.key);

    if (Platform.OS === 'web') {
      return (
        <View style={{ flex: 1, backgroundColor: '#020205' }}>
          <iframe srcDoc={html} style={{ width: '100%', height: '100%', border: 'none' }} title="Dashboard" />
        </View>
      );
    }

    return (
      <View style={{ flex: 1 }}>
        {RNWebView ? (
          <RNWebView source={{ html }} style={{ flex: 1, backgroundColor: '#020205' }}
            onMessage={(e) => {
              if (e.nativeEvent.data === 'logout') {
                Alert.alert('Logout', 'Terminate SaaS session?', [
                  { text: 'Cancel' },
                  { text: 'Logout', style: 'destructive', onPress: () => { Store.del('iva_paired'); setScreen('start'); } }
                ]);
              }
            }}
          />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: 'white' }}>Loading...</Text></View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.c}>
        <StatusBar barStyle="light-content" backgroundColor="#020205" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          {screen === 'loading' && <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator size="large" color="#6366f1" /></View>}
          {screen === 'start' && renderStart()}
          {screen === 'signup' && renderSignup()}
          {screen === 'login' && renderLogin()}
          {screen === 'shopId' && renderShopId()}
          {screen === 'pairing' && renderPairing()}
          {screen === 'dashboard' && renderDashboardData()}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );

  function renderStart() {
    return (
      <ScrollView contentContainerStyle={styles.sw}>
        <View style={styles.bh}><Text style={styles.bt}>INNO<Text style={{ color: '#6366f1' }}>AIVATORS</Text></Text><Text style={[styles.h, { fontSize: 18 }]}>Enterprise SaaS Plane</Text></View>
        <View style={styles.cg}>
          <TouchableOpacity style={styles.pb} onPress={() => setScreen('signup')}><Text style={styles.pt}>Create Corporate ID</Text></TouchableOpacity>
          <TouchableOpacity style={styles.ob} onPress={() => setScreen('login')}><Text style={styles.ot}>Login to Portal</Text></TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  function renderSignup() {
    return (
      <ScrollView contentContainerStyle={styles.sw}>
        <View style={styles.bh}><Text style={styles.h}>Enrollment</Text></View>
        <View style={styles.cg}>
          <Label>Business Owner</Label><TextInput style={styles.i} value={fullName} onChangeText={setFullName} placeholderTextColor="#444" />
          <Label>Admin Email</Label><TextInput style={styles.i} value={email} onChangeText={setEmail} placeholderTextColor="#444" autoCapitalize="none" />
          <Label>Master Key</Label><TextInput style={styles.i} value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor="#444" />
          {error ? <ErrBox msg={error} /> : null}
          <TouchableOpacity style={styles.pb} onPress={handleSignup}><Text style={styles.pt}>REGISTER</Text></TouchableOpacity>
          <TouchableOpacity style={styles.ob} onPress={() => setScreen('start')}><Text style={styles.ot}>Back</Text></TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  function renderLogin() {
    return (
      <ScrollView contentContainerStyle={styles.sw}>
        <View style={styles.bh}><Text style={styles.h}>Portal Login</Text></View>
        <View style={styles.cg}>
          <Label>Email</Label><TextInput style={styles.i} value={email} onChangeText={setEmail} placeholderTextColor="#444" autoCapitalize="none" />
          <Label>Auth Key</Label><TextInput style={styles.i} value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor="#444" />
          {error ? <ErrBox msg={error} /> : null}
          {success ? <SuccessBox msg={success} /> : null}
          <TouchableOpacity style={styles.pb} onPress={handleLogin}><Text style={styles.pt}>ACCESS PORTAL</Text></TouchableOpacity>
          <TouchableOpacity style={styles.ob} onPress={() => setScreen('start')}><Text style={styles.ot}>Back</Text></TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  function renderShopId() {
    return (
      <ScrollView contentContainerStyle={styles.sw}>
        <View style={styles.bh}><Text style={styles.h}>Identity Link</Text></View>
        <View style={styles.cg}>
          <Label>Target Shop ID</Label><TextInput style={styles.i} value={shopIdInput} onChangeText={setShopIdInput} placeholder="shop-XXXXXX" placeholderTextColor="#444" autoCapitalize="none" />
          {error ? <ErrBox msg={error} /> : null}
          <TouchableOpacity style={styles.pb} onPress={generatePairingCode}><Text style={styles.pt}>Request Pair Code</Text></TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  function renderPairing() {
    return (
      <ScrollView contentContainerStyle={styles.sw}>
        <View style={styles.bh}><Text style={styles.h}>Sync Verification</Text><Text style={styles.sh}>Enter this code in your Desktop Terminal.</Text></View>
        <View style={styles.cg}>
          <Text style={{ fontSize: 52, fontWeight: '900', color: '#6366f1', textAlign: 'center', marginVertical: 30, letterSpacing: 10 }}>{pairingCode}</Text>
          <ActivityIndicator size="small" color="#6366f1" style={{ marginTop: 10 }} />
          <Text style={{ color: '#555', textAlign: 'center', marginTop: 12, fontSize: 11 }}>Waiting for desktop approval...</Text>
        </View>
      </ScrollView>
    );
  }
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: '#020205' },
  sw: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  bh: { alignItems: 'center', marginBottom: 40 },
  bt: { color: 'white', fontSize: 26, fontWeight: '900' },
  h: { color: 'white', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  sh: { color: '#888', fontSize: 13, textAlign: 'center', marginTop: 10 },
  cg: { backgroundColor: '#0a0a0f', borderRadius: 32, padding: 30, borderWidth: 1, borderColor: '#151520' },
  l: { color: '#888', fontSize: 10, fontWeight: '800', marginTop: 12, marginBottom: 6, textTransform: 'uppercase' },
  i: { backgroundColor: '#020205', color: 'white', padding: 18, borderRadius: 20, borderWidth: 1, borderColor: '#151520' },
  pb: { backgroundColor: '#6366f1', padding: 20, borderRadius: 20, alignItems: 'center', marginTop: 24 },
  pt: { color: 'white', fontWeight: '800', fontSize: 16 },
  ob: { padding: 18, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#151520', marginTop: 15 },
  ot: { color: '#888', fontWeight: '700' },
  eb: { color: '#ef4444', fontSize: 12, marginTop: 16, textAlign: 'center', backgroundColor: 'rgba(239,68,68,0.1)', padding: 12, borderRadius: 12 },
  sb: { color: '#22c55e', fontSize: 12, marginTop: 16, textAlign: 'center', backgroundColor: 'rgba(34,197,94,0.1)', padding: 12, borderRadius: 12 },
});
