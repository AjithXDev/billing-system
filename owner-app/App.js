import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, StatusBar, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

let WebView = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

// ═══════════════════════════════════════════════════════════════════
//  SUPABASE CONFIG
// ═══════════════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://baawqrqihlhsrghvjlpx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0';

// Simple persistent storage
const Store = {
  _mem: {},
  get(k) { try { return Platform.OS === 'web' ? localStorage.getItem(k) : (Store._mem[k] || null); } catch { return null; } },
  set(k, v) { try { if (Platform.OS === 'web') localStorage.setItem(k, v); Store._mem[k] = v; } catch { } },
  del(k) { try { if (Platform.OS === 'web') localStorage.removeItem(k); delete Store._mem[k]; } catch { } },
};

// ═══════════════════════════════════════════════════════════════════
//  OWNER APP
// ═══════════════════════════════════════════════════════════════════
function OwnerApp() {
  const [screen, setScreen] = useState('login');
  const [sb, setSb] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authUser, setAuthUser] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shopId, setShopId] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [codeTimer, setCodeTimer] = useState(0);
  const [isPaired, setIsPaired] = useState(false);
  const [deviceId] = useState('dev-' + Math.random().toString(36).substr(2, 8));

  const timerRef = useRef(null);
  const pollRef = useRef(null);
  const webviewRef = useRef(null);
  const [dashData, setDashData] = useState(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [dashError, setDashError] = useState('');

  useEffect(() => {
    initClient();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const initClient = () => {
    try {
      if (typeof window !== 'undefined' && window.supabase) {
        const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        setSb(client);
        return client;
      }
      return null;
    } catch { return null; }
  };

  const sbFetch = async (table, method, body, query = '') => {
    const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
    const headers = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Fetch failed');
    return data;
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

  const fetchDashboardData = async () => {
    if (!shopId) return;
    try {
      setDashLoading(true);
      const statsRes = await sbFetch('shop_stats', 'GET', null, `?shop_id=eq.${shopId}&select=stats_json,updated_at`);
      const shopRes = await sbFetch('shops', 'GET', null, `?id=eq.${shopId}&select=id,name,is_active`);
      
      if (!shopRes || !shopRes[0]) {
        setDashError('SHOP_DELETED');
        setDashLoading(false);
        return;
      }
      if (!shopRes[0].is_active) {
        setDashError('SHOP_INACTIVE');
        setDashLoading(false);
        return;
      }

      if (!statsRes || !statsRes[0]) {
        setDashError('WAITING_SYNC');
        setDashLoading(false);
        return;
      }
      setDashData({ s: statsRes[0].stats_json, ts: statsRes[0].updated_at, sh: shopRes[0] });
      setDashLoading(false);
    } catch (e) {
      setDashError(e.message);
      setDashLoading(false);
    }
  };

  useEffect(() => {
    if (screen === 'dashboard' && shopId) {
      fetchDashboardData();
      const interval = setInterval(fetchDashboardData, 15000);
      return () => clearInterval(interval);
    }
  }, [screen, shopId]);

  // ══════════════════════════════════════════════════════
  //  SCREENS
  // ══════════════════════════════════════════════════════
  const renderLogin = () => (
    <ScrollView contentContainerStyle={s.scrollWrap}>
      <View style={s.brandHeaderWrap}>
        <Text style={s.brandText}>INNO<Text style={{ color: '#6366f1' }}>AIVATORS</Text></Text>
        <Text style={s.heading}>Sign In</Text>
        <Text style={s.subheading}>Manage your business smarter.</Text>
      </View>
      <View style={s.cardGroup}>
        <Label>Email</Label>
        <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="owner@email.com" placeholderTextColor="#555" autoCapitalize="none" />
        <Label>Password</Label>
        <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#555" secureTextEntry />
        {error ? <ErrBox msg={error} /> : null}
        <TouchableOpacity style={s.primaryBtn} disabled={loading} onPress={async () => {
          setLoading(true); setError('');
          try {
            const data = await sbAuth('token?grant_type=password', { email: email.trim(), password });
            setAuthUser(data.user);
            const shops = await sbFetch('shops', 'GET', null, `?owner_email=eq.${email.trim()}&select=id`);
            if (shops && shops.length > 0) {
              setShopId(shops[0].id);
              setScreen('dashboard');
            } else { setScreen('shopId'); }
          } catch (e) { setError(e.message); }
          setLoading(false);
        }}>
          <Text style={s.primaryBtnText}>{loading ? 'Checking...' : 'Login'}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={s.bottomLinkWrap} onPress={() => setScreen('register')}>
        <Text style={s.bottomLinkText}>New? <Text style={s.bottomLinkHighlight}>Create Account</Text></Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderRegister = () => (
    <ScrollView contentContainerStyle={s.scrollWrap}>
      <Text style={s.heading}>Create Account</Text>
      <View style={s.cardGroup}>
        <Label>Name</Label><TextInput style={s.input} value={ownerName} onChangeText={setOwnerName} />
        <Label>Email</Label><TextInput style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" />
        <Label>Password</Label><TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={s.primaryBtn} onPress={() => setScreen('login')}>
          <Text style={s.primaryBtnText}>Sign Up</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const renderShopId = () => (
    <ScrollView contentContainerStyle={s.scrollWrap}>
      <Text style={s.heading}>Link Shop</Text>
      <TextInput style={s.input} value={shopId} onChangeText={setShopId} placeholder="Enter Shop ID" />
      <TouchableOpacity style={s.primaryBtn} onPress={() => setScreen('dashboard')}><Text style={s.primaryBtnText}>Link</Text></TouchableOpacity>
    </ScrollView>
  );

  const renderDashboard = () => {
    if (dashLoading && !dashData) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#06060a' }}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={{ color: '#94a3b8', fontSize: 13, marginTop: 16, fontWeight: '600' }}>Contacting Secure Nodes...</Text>
        </View>
      );
    }

    if (dashError === 'SHOP_DELETED' || dashError === 'SHOP_INACTIVE') {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#06060a' }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(239,68,68,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 24 }}>
            <Text style={{ fontSize: 40 }}>🚫</Text>
          </View>
          <Text style={{ color: 'white', fontSize: 24, fontWeight: '800', textAlign: 'center' }}>Account Restricted</Text>
          <Text style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', marginTop: 12, lineHeight: 22 }}>
            Your shop registration has been {dashError === 'SHOP_DELETED' ? 'permanently removed' : 'deactivated'} by the Innoaivators Master Administration.
          </Text>
          <TouchableOpacity 
            style={{ marginTop: 40, backgroundColor: '#1e293b', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
            onPress={() => setScreen('login')}
          >
            <Text style={{ color: 'white', fontWeight: '700' }}>Return to Login</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (dashError === 'WAITING_SYNC') {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#06060a' }}>
          <ActivityIndicator color="#6366f1" />
          <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', marginTop: 24 }}>Initializing Cloud Channel</Text>
          <Text style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 8 }}>
            Setting up encrypted bridge. Please ensure your desktop terminal is online.
          </Text>
        </View>
      );
    }

    const html = buildDashboardHtml(dashData?.s || {}, dashData?.ts || '', dashData?.sh || {});
    return (
      <View style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" backgroundColor="#06060a" />
        {Platform.OS === 'web' ? (
          <iframe srcDoc={html} style={{ width: '100%', height: '100%', border: 'none' }} />
        ) : (
          <WebView source={{ html }} style={{ flex: 1, backgroundColor: '#06060a' }} onMessage={(e) => {
            if (e.nativeEvent.data === 'logout') setScreen('login');
          }} />
        )}
      </View>
    );
  };

  const buildDashboardHtml = (stats, ts, shop) => {
    const dataJSON = JSON.stringify({ stats, ts, shop, shopId }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
    return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,sans-serif;background:#06060a;color:#f0f0f5;overflow-x:hidden}
.card{background:#0d0d14;border:1px solid #1a1a24;border-radius:14px;padding:14px;margin-bottom:12px}
.lbl{font-size:9px;text-transform:uppercase;color:#45455a;font-weight:700;margin-bottom:4px}
.sb{width:64px;height:100vh;background:#06060a;border-right:1px solid #1a1a24;display:flex;flex-direction:column;align-items:center;padding:16px 0;position:fixed;left:0}
.sb_t{width:48px;height:48px;display:flex;align-items:center;justify-content:center;color:#45455a;margin-bottom:12px}
.sb_t.on{color:#6366f1}
.pg{margin-left:64px;padding:16px;display:none}.pg.on{display:block}
#tt{position:absolute;background:rgba(15,23,42,0.95);border:1px solid #6366f1;border-radius:6px;padding:4px 8px;font-size:10px;pointer-events:none;opacity:0;z-index:999;color:white}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
</style>
</head><body>
<div id="tt"></div>
<div id="app"></div>
<script>
var D = ${dataJSON};
var s = D.stats || {}, sh = D.shop || {}, S = D.shopId;
function fc(n){return '\\u20B9'+Number(n||0).toLocaleString('en-IN');}

var T = document.getElementById('tt');
function st(txt, x, y){ T.innerHTML = txt; T.style.left = (x+10)+'px'; T.style.top = (y-30)+'px'; T.style.opacity = '1'; }
function ht(){ T.style.opacity = '0'; }

function gBar(d1, d2, c1, c2, lbls){
  var m=Math.max.apply(null,d1.concat(d2).concat([1])), bw=100/d1.length;
  return '<svg viewBox="0 0 100 80" style="width:100%;height:120px;overflow:visible">' +
    d1.map(function(v,i){
      var h1=(v/m)*70, h2=(d2[i]/m)*70, x=i*bw;
      return '<rect x="'+(x+2)+'" y="'+(70-h1)+'" width="'+(bw/2-2)+'" height="'+h1+'" fill="'+c1+'" rx="1" onmouseover="st(\\'Sales: '+fc(v)+'\\',event.pageX,event.pageY)" onmouseout="ht()" ontouchstart="st(\\'Sales: '+fc(v)+'\\',event.touches[0].pageX,event.touches[0].pageY)"/>' +
             '<rect x="'+(x+bw/2)+'" y="'+(70-h2)+'" width="'+(bw/2-2)+'" height="'+h2+'" fill="'+c2+'" rx="1" onmouseover="st(\\'Profit: '+fc(d2[i])+'\\',event.pageX,event.pageY)" onmouseout="ht()" ontouchstart="st(\\'Profit: '+fc(d2[i])+'\\',event.touches[0].pageX,event.touches[0].pageY)"/>';
    }).join('') + '</svg>';
}

function sStep(d, col, lbls){
  var m=Math.max.apply(null,d.concat([1])), g=100/(d.length-1), p='M 0 70';
  d.forEach(function(v,i){ var x=i*g, y=70-(v/m)*60; if(i>0) p += ' L '+(x-g/2)+' '+(70-(d[i-1]/m)*60)+' L '+x+' '+y; else p += ' L 0 '+y; });
  p += ' L 100 70 Z';
  return '<svg viewBox="0 0 100 80" style="width:100%;height:100px;overflow:visible"><path d="'+p+'" fill="'+col+'" fill-opacity="0.1" stroke="'+col+'" stroke-width="2"/>' +
    d.map(function(v,i){ return '<circle cx="'+(i*g)+'" cy="'+(70-(v/m)*60)+'" r="2" fill="'+col+'" onmouseover="st(\\'Reach: '+v+'\\',event.pageX,event.pageY)" onmouseout="ht()"/>'; }).join('') + '</svg>';
}

function hBar(d, col){
  var m=Math.max.apply(null,d.map(function(x){return x.v}).concat([1]));
  return d.map(function(item){
    var w=(item.v/m)*100;
    return '<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:9px;color:#707085"><span>'+item.t+'</span><span>'+item.v+' bills</span></div><div style="height:4px;background:rgba(255,255,255,0.05);border-radius:2px;margin-top:2px"><div style="width:'+w+'%;height:100%;background:'+col+';border-radius:2px"></div></div></div>';
  }).join('');
}

function render(){
  var mths = (s.monthlySalesBreakdown||[]).slice(-6);
  var salesD = mths.map(function(v){return v.total||0;});
  var profD = mths.map(function(v){return v.profit||(v.total*0.15)||0;});
  var reachD = mths.map(function(v){return v.bills||0;});

  var invHTs = s.recentInvoices || [];
  var hrs = {}; 
  invHTs.forEach(function(i){
    var d = i.created_at || i.bill_date || "";
    var h = -1;
    if(d.indexOf('T') !== -1) h = parseInt(d.split('T')[1].split(':')[0]);
    else if(d.indexOf(':') !== -1){ var p=d.split(' '); h=parseInt((p.length>1?p[1]:p[0]).split(':')[0]); }
    if(!isNaN(h)) hrs[h] = (hrs[h]||0)+1;
  });
  var pkData = []; for(var h in hrs) pkData.push({t:h+':00', v:hrs[h]});
  pkData.sort(function(a,b){return b.v - a.v;});
  var top5Peak = pkData.slice(0,5);

  var topSelling = (s.topSelling||[]).filter(function(p){return (p.total_sold||0)>0;}).slice(0,5);

  var ovHTML = '<div id="pg-ov" class="pg on">' +
    '<div class="card"><div class="lbl">Sales vs Profit</div>' + gBar(salesD, profD, '#6366f1', '#22c55e', mths) + '</div>' +
    '<div class="card"><div class="lbl">Customer Reach</div>' + sStep(reachD, '#f59e0b', mths) + '</div>' +
    '<div class="card"><div class="lbl">Peak Hours (Top 5)</div>' + (top5Peak.length ? hBar(top5Peak, '#6366f1') : 'No data') + '</div>' +
    '<div class="card"><div class="lbl">Top Products (Top 5)</div>' + (topSelling.map(function(p,i){return '<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:6px"><span>'+(i+1)+'. '+p.name+'</span><span style="color:#22c55e">'+p.total_sold+' sold</span></div>';}).join('') || 'No sales') + '</div>' +
    '</div>';

  var nav = '<div class="sb"><div class="sb_t on">S</div><div class="sb_t">P</div><div class="sb_t">A</div><div class="sb_t" onclick="window.ReactNativeWebView.postMessage(\\'logout\\')">L</div></div>';
  
  document.getElementById('app').innerHTML = nav + ovHTML;
}
render();
</script></body></html>`;
  };

  return (
    <SafeAreaView style={s.container}>
      {screen === 'login' && renderLogin()}
      {screen === 'register' && renderRegister()}
      {screen === 'shopId' && renderShopId()}
      {screen === 'dashboard' && renderDashboard()}
    </SafeAreaView>
  );
}

const Label = ({ children }) => <Text style={s.label}>{children}</Text>;
const ErrBox = ({ msg }) => <Text style={s.errBox}>❌ {msg}</Text>;

export default function App() {
  return <SafeAreaProvider><OwnerApp /></SafeAreaProvider>;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06060a' },
  scrollWrap: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  brandHeaderWrap: { alignItems: 'center', marginBottom: 32 },
  brandText: { color: 'white', fontSize: 24, fontWeight: '900' },
  heading: { color: 'white', fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  subheading: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginBottom: 20 },
  cardGroup: { background: '#1e293b', borderRadius: 16, padding: 20 },
  label: { color: '#94a3b8', fontSize: 10, fontWeight: '700', marginBottom: 5, marginTop: 10 },
  input: { backgroundColor: '#0f172a', color: 'white', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#334155' },
  primaryBtn: { backgroundColor: '#6366f1', padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 20 },
  primaryBtnText: { color: 'white', fontWeight: '800' },
  bottomLinkWrap: { marginTop: 20, alignItems: 'center' },
  bottomLinkText: { color: '#94a3b8', fontSize: 13 },
  bottomLinkHighlight: { color: '#6366f1', fontWeight: '700' },
  errBox: { color: '#ef4444', fontSize: 12, marginTop: 10, textAlign: 'center' },
});
