import React, { useState, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, StatusBar, KeyboardAvoidingView, Platform, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

let WebView = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

// ═══════════════════════════════════════════════════════════════════
//  ⚙️ SUPABASE CONFIG — Set these once from your .env file
//  These are your project's public (anon) keys — safe for client use
// ═══════════════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://baawqrqihlhsrghvjlpx.supabase.co';     // e.g. https://abcd1234.supabase.co
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0'; // e.g. eyJhbGciOi...

// Simple persistent storage (works on web + native)
const Store = {
  _mem: {},
  get(k) { try { return Platform.OS === 'web' ? localStorage.getItem(k) : (Store._mem[k] || null); } catch { return null; } },
  set(k, v) { try { if (Platform.OS === 'web') localStorage.setItem(k, v); Store._mem[k] = v; } catch {} },
  del(k) { try { if (Platform.OS === 'web') localStorage.removeItem(k); delete Store._mem[k]; } catch {} },
};

// ═══════════════════════════════════════════════════════════════════
//  OWNER APP
// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
//  OWNER APP — PREMIUM CREAM EDITION
// ═══════════════════════════════════════════════════════════════════
function OwnerApp() {
  // Navigation: gateway | masterKey | dashboard
  const [screen, setScreen] = useState('gateway');
  const [sb, setSb] = useState(null); 

  // Fields
  const [identifier, setIdentifier] = useState(''); // Email or Shop ID
  const [masterKey, setMasterKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shopData, setShopData] = useState(null);

  const webviewRef = useRef(null);

  useEffect(() => {
    // Check if already logged in/paired
    const savedShopId = Store.get('iva_shop_id');
    const savedPaired = Store.get('iva_paired');
    if (savedPaired === 'true' && savedShopId) {
      setScreen('dashboard');
    }
  }, []);

  const sbFetch = async (table, method, body, query = '') => {
    const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    };
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Network error');
    return data;
  };

  // ══════════════════════════════════════════════════════
  //  SECURE LOGIN (Email or Shop ID + Master Key)
  // ══════════════════════════════════════════════════════
  const renderGateway = () => (
    <ScrollView contentContainerStyle={s.scrollWrap} keyboardShouldPersistTaps="handled">
      <View style={s.branding}>
        <Text style={s.brandLogo}>IVA</Text>
        <Text style={s.brandTag}>Smart Billing Terminal</Text>
      </View>
      
      <View style={s.card}>
        <Text style={s.heading}>Secure Login</Text>
        <Text style={s.subheading}>Access your enterprise terminal from anywhere in the world.</Text>

        <Label>Business Email or Shop ID</Label>
        <TextInput 
          style={s.input} 
          value={identifier} 
          onChangeText={setIdentifier}
          placeholder="email@example.com or shop-xxxx" 
          placeholderTextColor="#94A3B8" 
          autoCapitalize="none" 
        />

        <Label>Master Access Key</Label>
        <TextInput 
          style={s.input} 
          value={masterKey} 
          onChangeText={setMasterKey}
          placeholder="Enter secret key (set in desktop app)" 
          placeholderTextColor="#94A3B8" 
          secureTextEntry 
        />

        {error ? <ErrBox msg={error} /> : null}

        <TouchableOpacity style={s.primaryBtn} disabled={loading} onPress={async () => {
          if (!identifier.trim() || !masterKey.trim()) { 
            setError('Please enter both Identifier and Key'); 
            return; 
          }
          setLoading(true); setError('');

          try {
            // Try as Email or Shop ID
            let shops = [];
            if (identifier.includes('@')) {
              shops = await sbFetch('shops', 'GET', null, `?owner_email=eq.${identifier.trim()}&master_key=eq.${masterKey.trim()}&select=id,name,is_active`);
            } else {
              shops = await sbFetch('shops', 'GET', null, `?id=eq.${identifier.trim()}&master_key=eq.${masterKey.trim()}&select=id,name,is_active`);
            }

            if (!shops || shops.length === 0) {
              setError('Log in failed. Invalid email, ID, or key.');
            } else {
              const shop = shops[0];
              if (!shop.is_active) {
                setError('Account inactive. Contact support.');
              } else {
                Store.set('iva_shop_id', shop.id);
                Store.set('iva_paired', 'true');
                setScreen('dashboard');
              }
            }
          } catch (e) { setError('Network gateway timeout.'); }
          setLoading(false);
        }}>
          <Text style={s.primaryBtnText}>{loading ? 'AUTHORIZING...' : 'SIGN IN TO TERMINAL'}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.infoBox}>
        <Text style={s.infoText}>Forget your key? Check your Desktop App → Settings → Master Key</Text>
      </View>

      <Text style={s.footerText}>© 2026 iVA Systems • Enterprise Cloud</Text>
    </ScrollView>
  );

  const renderDashboard = () => {
    const sid = Store.get('iva_shop_id');
    const html = buildDashboardHtml(sid);

    if (Platform.OS === 'web') {
      return (
        <View style={{ flex: 1, backgroundColor: '#FAF9F6' }}>
          {React.createElement('iframe', {
            srcDoc: html,
            style: { width: '100%', height: '100%', border: 'none', backgroundColor: '#FAF9F6' },
            title: 'Dashboard',
          })}
          <LogoutFloating onLogout={() => { Store.del('iva_paired'); setScreen('gateway'); }} />
        </View>
      );
    }

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FAF9F6' }} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor="#FAF9F6" />
        <WebView
          ref={webviewRef}
          source={{ html, baseUrl: 'https://cdn.jsdelivr.net' }}
          style={{ flex: 1, backgroundColor: '#FAF9F6' }}
          bounces={false}
          renderLoading={() => (
            <View style={s.loadingBox}>
              <ActivityIndicator size="large" color="#4F46E5" />
            </View>
          )}
        />
        <LogoutFloating onLogout={() => {
          Alert.alert('Session', 'Exit current terminal session?', [
            { text: 'Stay' },
            { text: 'Logout', style: 'destructive', onPress: () => {
              Store.del('iva_paired'); setScreen('gateway');
            }},
          ]);
        }} />
      </SafeAreaView>
    );
  };

  const buildDashboardHtml = (shopId) => `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Inter,-apple-system,sans-serif;background:#FAF9F6;color:#0F172A;padding-bottom:100px}
.header{padding:24px 20px;background:#FDFBF7;border-bottom:1px solid #E2E8F0;display:flex;justify-content:space-between;align-items:center}
.title{font-size:20px;font-weight:900;letter-spacing:-0.5px}
.status{background:#ECFDF5;color:#059669;font-size:10px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase}
.tabs{display:flex;gap:12px;padding:20px;background:#FDFBF7}
.tab{font-size:13px;font-weight:700;color:#64748B;cursor:pointer}
.tab.on{color:#4F46E5;text-decoration:underline;text-underline-offset:8px;text-decoration-thickness:2px}
.stats-grid{padding:0 20px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.card{background:white;padding:20px;border-radius:16px;border:1px solid #E2E8F0;box-shadow:0 1px 3px rgba(0,0,0,0.02)}
.label{font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;margin-bottom:8px}
.val{font-size:24px;font-weight:900;color:#0F172A}
.profit-hero{padding:24px;background:#0F172A;margin:20px;border-radius:24px;color:white}
.list-item{padding:16px;background:white;margin:10px 20px;border-radius:12px;border:1px solid #E2E8F0;display:flex;justify-content:space-between}
</style>
</head><body>
<div id="app">
  <div class="header"><div class="title">Terminal</div><div class="status">Live Sync</div></div>
  <div class="tabs"><div class="tab on">Metrics</div><div class="tab">Inventory</div><div class="tab">Invoices</div></div>
  <div id="root"></div>
</div>
<script>
const U="${SUPABASE_URL}",K="${SUPABASE_KEY}",S="${shopId}";
async function load(){
  try {
    const r=await fetch(U+'/rest/v1/shop_stats?shop_id=eq.'+S+'&select=stats_json,updated_at',{headers:{'apikey':K,'Authorization':'Bearer '+K}});
    const d=await r.json();
    if(!d||!d[0]) return;
    const s=d[0].stats_json;
    render(s);
  } catch(e){}
}
function render(s){
  const root=document.getElementById('root');
  root.innerHTML = \`
    <div class="profit-hero">
      <div class="label" style="color:#94A3B8">Est. Daily Profit</div>
      <div style="font-size:38px;font-weight:900">\\u20B9\${Number(s.todayProfit||0).toLocaleString()}</div>
    </div>
    <div class="stats-grid">
      <div class="card"><div class="label">Revenue</div><div class="val">\\u20B9\${Number(s.todaySales||0).toLocaleString()}</div></div>
      <div class="card"><div class="label">Bills</div><div class="val">\${s.todayBills||0}</div></div>
    </div>
  \`;
}
load();
setInterval(load,15000);
<\/script></body></html>`;

  return (
    <SafeAreaView style={s.container}>
      {screen === 'gateway' && renderGateway()}
      {screen === 'dashboard' && renderDashboard()}
    </SafeAreaView>
  );
}

const Label = ({ children }) => <Text style={s.label}>{children}</Text>;
const ErrBox = ({ msg }) => <Text style={s.errBox}>{msg}</Text>;
const LogoutFloating = ({ onLogout }) => (
  <TouchableOpacity style={s.logoutBtn} onPress={onLogout}>
    <Text style={s.logoutBtnText}>Logout Session</Text>
  </TouchableOpacity>
);

export default function App() {
  return <SafeAreaProvider><OwnerApp /></SafeAreaProvider>;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF9F6' },
  scrollWrap: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  branding: { alignItems: 'center', marginBottom: 40 },
  brandLogo: { fontSize: 32, fontWeight: '900', color: '#0F172A', letterSpacing: -1 },
  brandTag: { fontSize: 13, color: '#64748B', fontWeight: '600', marginTop: 4 },
  
  card: { backgroundColor: '#FFFFFF', padding: 32, borderRadius: 32, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 8 },
  heading: { fontSize: 24, fontWeight: '900', color: '#0F172A', marginBottom: 8, letterSpacing: -0.5 },
  subheading: { fontSize: 14, color: '#64748B', lineHeight: 22, marginBottom: 24 },
  
  label: { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 8, marginLeft: 2 },
  input: { height: 56, backgroundColor: '#F8FAFC', paddingHorizontal: 20, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', color: '#0F172A', fontSize: 15, fontWeight: '600', marginBottom: 16 },
  
  primaryBtn: { height: 56, backgroundColor: '#0F172A', borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  
  errBox: { color: '#EF4444', backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12, fontSize: 13, fontWeight: '600', marginBottom: 16, textAlign: 'center' },
  footerText: { textAlign: 'center', color: '#94A3B8', fontSize: 11, fontWeight: '700', marginTop: 40 },
  
  backBtn: { marginBottom: 20, paddingVertical: 10 },
  backBtnText: { color: '#64748B', fontSize: 14, fontWeight: '700' },
  
  infoBox: { marginTop: 20, backgroundColor: '#FEF9C3', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#FEF08A' },
  infoText: { color: '#854D0E', fontSize: 11, fontWeight: '600', textAlign: 'center', lineHeight: 16 },

  logoutBtn: { position: 'absolute', bottom: 30, alignSelf: 'center', backgroundColor: '#FDFBF7', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0' },
  logoutBtnText: { color: '#EF4444', fontSize: 12, fontWeight: '800' },
  loadingBox: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FAF9F6', justifyContent: 'center', alignItems: 'center' }
});
