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
function OwnerApp() {
  const [screen, setScreen] = useState('login');
  const [sb, setSb] = useState(null);

  // Auth fields
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [authUser, setAuthUser] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Pairing
  const [shopId, setShopId] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [codeTimer, setCodeTimer] = useState(0);
  const [isPaired, setIsPaired] = useState(false);
  const [deviceId] = useState('dev-' + Math.random().toString(36).substr(2, 8));
  const timerRef = useRef(null);
  const pollRef = useRef(null);
  const webviewRef = useRef(null);

  // Dashboard data — fetched in React Native, passed to WebView
  const [dashData, setDashData] = useState(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [dashError, setDashError] = useState('');

  // ── Initialize on mount — always require login ──
  useEffect(() => {
    initClient();
    // Always start on login screen — login required every time app opens
    // After login, the app auto-detects paired shops via Supabase
    // No auto-navigate from local storage
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

  // ── Generic Supabase REST fetch ──
  const sbFetch = async (table, method, body, query = '') => {
    const url = `${SUPABASE_URL}/rest/v1/${table}${query}`;
    const headers = {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : undefined,
    };
    Object.keys(headers).forEach(k => headers[k] === undefined && delete headers[k]);
    const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.msg || JSON.stringify(data));
    return data;
  };

  const sbAuth = async (endpoint, body) => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/${endpoint}`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || data.message || 'Auth failed');
    return data;
  };

  // ══════════════════════════════════════════════════════
  //  FETCH DASHBOARD DATA (React Native side)
  // ══════════════════════════════════════════════════════
  const fetchDashboardData = async () => {
    if (!shopId) return;
    try {
      setDashLoading(true);
      setDashError('');
      const statsRes = await sbFetch('shop_stats', 'GET', null, `?shop_id=eq.${shopId}&select=stats_json,updated_at`);
      const shopRes = await sbFetch('shops', 'GET', null, `?id=eq.${shopId}&select=name,owner_name,mobile_number,owner_email`);
      if (!statsRes || !statsRes[0]) {
        setDashError('No data yet. Make sure desktop app is running & syncing.');
        setDashLoading(false);
        return;
      }
      const s = statsRes[0].stats_json;
      const ts = new Date(statsRes[0].updated_at).toLocaleString('en-IN');
      const sh = shopRes && shopRes[0] ? shopRes[0] : { name: 'My Shop', owner_name: 'Owner' };
      setDashData({ s, ts, sh });
      setDashLoading(false);
    } catch (e) {
      setDashError(e.message);
      setDashLoading(false);
    }
  };

  useEffect(() => {
    if (screen === 'dashboard' && shopId) {
      fetchDashboardData();
      const interval = setInterval(fetchDashboardData, 10000);
      return () => clearInterval(interval);
    }
  }, [screen, shopId]);

  // ══════════════════════════════════════════════════════
  //  REGISTER SCREEN
  // ══════════════════════════════════════════════════════
  const renderRegister = () => (
    <ScrollView contentContainerStyle={s.scrollWrap} keyboardShouldPersistTaps="handled">
      <View style={s.logoWrap}>
        <View style={[s.logoBadge, { backgroundColor: '#22c55e' }]}>
          <Text style={{ fontSize: 26 }}>📝</Text>
        </View>
      </View>
      <Text style={s.heading}>Create Account</Text>
      <Text style={s.subheading}>Register as a shop owner</Text>

      <Label>Owner Name</Label>
      <TextInput style={s.input} value={ownerName} onChangeText={setOwnerName}
        placeholder="Your full name" placeholderTextColor="#555" autoCapitalize="words" />

      <Label>Email Address</Label>
      <TextInput style={s.input} value={email} onChangeText={setEmail}
        placeholder="owner@email.com" placeholderTextColor="#555" autoCapitalize="none" keyboardType="email-address" />

      <Label>Mobile Number</Label>
      <TextInput style={s.input} value={mobile} onChangeText={(t) => setMobile(t.replace(/[^0-9+]/g, ''))}
        placeholder="+91 9876543210" placeholderTextColor="#555" keyboardType="phone-pad" maxLength={15} />

      <Label>Password</Label>
      <TextInput style={s.input} value={password} onChangeText={setPassword}
        placeholder="Min 6 characters" placeholderTextColor="#555" secureTextEntry />

      {error ? <ErrBox msg={error} /> : null}

      <TouchableOpacity style={s.primaryBtn} disabled={loading} onPress={async () => {
        if (!ownerName.trim() || !email.trim() || !mobile.trim() || !password.trim()) {
          setError('Please fill in all fields'); return;
        }
        if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
        setLoading(true); setError('');
        try {
          const authData = await sbAuth('signup', {
            email: email.trim(), password,
            data: { owner_name: ownerName.trim(), mobile: mobile.trim() },
          });
          if (authData.user && authData.user.identities && authData.user.identities.length === 0) {
            setError('This email is already registered. Please login or reset your password.');
            setLoading(false); return;
          }
          Alert.alert('✅ Account Created', 'You can now log in with your email and password.', [
            { text: 'Login', onPress: () => { setError(''); setScreen('login'); } }
          ]);
        } catch (e) { setError(e.message); }
        setLoading(false);
      }}>
        <Text style={s.primaryBtnText}>{loading ? '⏳ Creating...' : '🚀 CREATE ACCOUNT'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => { setError(''); setScreen('login'); }}>
        <Text style={s.linkText}>Already have an account? Login</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // ══════════════════════════════════════════════════════
  //  LOGIN SCREEN
  // ══════════════════════════════════════════════════════
  const renderLogin = () => (
    <ScrollView contentContainerStyle={s.scrollWrap} keyboardShouldPersistTaps="handled">
      <View style={s.logoWrap}>
        <View style={s.logoBadge}><Text style={{ fontSize: 26 }}>🔐</Text></View>
      </View>
      <Text style={s.heading}>Welcome Back</Text>
      <Text style={s.subheading}>Login to access your shop</Text>

      <Label>Email</Label>
      <TextInput style={s.input} value={email} onChangeText={setEmail}
        placeholder="owner@email.com" placeholderTextColor="#555" autoCapitalize="none" keyboardType="email-address" />

      <Label>Password</Label>
      <TextInput style={s.input} value={password} onChangeText={setPassword}
        placeholder="Enter password" placeholderTextColor="#555" secureTextEntry />

      {error ? <ErrBox msg={error} /> : null}

      <TouchableOpacity style={s.primaryBtn} disabled={loading} onPress={async () => {
        if (!email.trim() || !password.trim()) { setError('Fill in all fields'); return; }
        setLoading(true); setError('');
        try {
          const data = await sbAuth('token?grant_type=password', { email: email.trim(), password });
          setAuthUser(data.user || data);
          Store.set('iva_auth_token', data.access_token || '');
          const myEmail = email.trim();
          let autoShopId = null;
          const shops = await sbFetch('shops', 'GET', null, `?owner_email=eq.${myEmail}&select=id,name`);
          if (shops && shops.length > 0) {
            autoShopId = shops[0].id;
          } else {
            const devs = await sbFetch('paired_devices', 'GET', null, `?user_email=eq.${myEmail}&select=shop_id`);
            if (devs && devs.length > 0) autoShopId = devs[0].shop_id;
          }
          if (autoShopId) {
            Store.set('iva_shop_id', autoShopId);
            Store.set('iva_paired', 'true');
            setShopId(autoShopId);
            setIsPaired(true);
            await sbFetch('paired_devices', 'POST', {
              shop_id: autoShopId, user_id: data.user?.id || null, user_email: myEmail,
              device_name: Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android' : 'Web Browser',
              device_id: deviceId, is_active: true,
            });
            setScreen('dashboard');
          } else {
            setScreen('shopId');
          }
        } catch (e) { setError(e.message); }
        setLoading(false);
      }}>
        <Text style={s.primaryBtnText}>{loading ? '⏳ Logging in...' : '🔑 LOGIN'}</Text>
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 30 }}>
        <TouchableOpacity onPress={() => { setError(''); setScreen('register'); }}>
          <Text style={s.linkText}>Create Account</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setError(''); setScreen('forgot'); }}>
          <Text style={[s.linkText, { color: '#f59e0b' }]}>Forgot Password?</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // ══════════════════════════════════════════════════════
  //  FORGOT PASSWORD
  // ══════════════════════════════════════════════════════
  const renderForgot = () => (
    <ScrollView contentContainerStyle={s.scrollWrap} keyboardShouldPersistTaps="handled">
      <View style={s.logoWrap}>
        <View style={[s.logoBadge, { backgroundColor: '#f59e0b' }]}>
          <Text style={{ fontSize: 26 }}>🔑</Text>
        </View>
      </View>
      <Text style={s.heading}>Reset Password</Text>
      <Text style={s.subheading}>Enter your email to receive a code</Text>
      <Label>Email</Label>
      <TextInput style={s.input} value={email} onChangeText={setEmail}
        placeholder="owner@email.com" placeholderTextColor="#555" autoCapitalize="none" keyboardType="email-address" />
      {error ? <ErrBox msg={error} /> : null}
      <TouchableOpacity style={[s.primaryBtn, { backgroundColor: '#f59e0b' }]} disabled={loading} onPress={async () => {
        if (!email.trim()) { setError('Enter your email'); return; }
        setLoading(true); setError('');
        try {
          await sbAuth('recover', { email: email.trim() });
          Alert.alert('📧 OTP Sent', 'Check your inbox for the verification code.', [
            { text: 'OK', onPress: () => { setOtp(''); setScreen('forgot_otp'); } }
          ]);
        } catch (e) { setError(e.message); }
        setLoading(false);
      }}>
        <Text style={s.primaryBtnText}>{loading ? 'Sending...' : '📧 SEND OTP CODE'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => { setError(''); setScreen('login'); }}>
        <Text style={s.linkText}>← Back to Login</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderForgotOtp = () => (
    <ScrollView contentContainerStyle={s.scrollWrap} keyboardShouldPersistTaps="handled">
      <View style={s.logoWrap}><View style={[s.logoBadge, { backgroundColor: '#f59e0b' }]}><Text style={{ fontSize: 26 }}>💬</Text></View></View>
      <Text style={s.heading}>Enter OTP Code</Text>
      <Text style={s.subheading}>Enter the code sent to {email}</Text>
      <Label>Verification Code</Label>
      <TextInput style={s.input} value={otp} onChangeText={setOtp}
        placeholder="6-digit code" placeholderTextColor="#555" keyboardType="numeric" />
      {error ? <ErrBox msg={error} /> : null}
      <TouchableOpacity style={[s.primaryBtn, { backgroundColor: '#f59e0b' }]} disabled={loading} onPress={async () => {
        if (!otp.trim()) { setError('Enter the code from your email'); return; }
        setLoading(true); setError('');
        try {
          const data = await sbAuth('verify', { type: 'recovery', email: email.trim(), token: otp.trim() });
          setResetToken(data.access_token || data.session?.access_token);
          setScreen('forgot_reset');
        } catch (e) { setError(e.message); }
        setLoading(false);
      }}>
        <Text style={s.primaryBtnText}>{loading ? 'Verifying...' : 'VERIFY CODE'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const renderForgotReset = () => (
    <ScrollView contentContainerStyle={s.scrollWrap} keyboardShouldPersistTaps="handled">
      <View style={s.logoWrap}><View style={[s.logoBadge, { backgroundColor: '#f59e0b' }]}><Text style={{ fontSize: 26 }}>🔒</Text></View></View>
      <Text style={s.heading}>New Password</Text>
      <Text style={s.subheading}>Enter your new password below</Text>
      <Label>New Password</Label>
      <TextInput style={s.input} value={password} onChangeText={setPassword}
        placeholder="Min 6 chars" placeholderTextColor="#555" secureTextEntry />
      <Label>Confirm Password</Label>
      <TextInput style={s.input} value={confirmPassword} onChangeText={setConfirmPassword}
        placeholder="Re-enter password" placeholderTextColor="#555" secureTextEntry />
      {error ? <ErrBox msg={error} /> : null}
      <TouchableOpacity style={[s.primaryBtn, { backgroundColor: '#f59e0b' }]} disabled={loading} onPress={async () => {
        if (!password || password.length < 6) { setError('Password must be 6+ chars'); return; }
        if (password !== confirmPassword) { setError('Passwords do not match'); return; }
        setLoading(true); setError('');
        try {
          await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            method: 'PUT',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${resetToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
          });
          Alert.alert('✅ Success', 'Password updated successfully. You can now login.', [
            { text: 'Login', onPress: () => { setPassword(''); setScreen('login'); } }
          ]);
        } catch (e) { setError('Failed to update password. Try again.'); }
        setLoading(false);
      }}>
        <Text style={s.primaryBtnText}>{loading ? 'Updating...' : 'UPDATE PASSWORD'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // ══════════════════════════════════════════════════════
  //  ENTER SHOP ID
  // ══════════════════════════════════════════════════════
  const renderShopId = () => (
    <ScrollView contentContainerStyle={s.scrollWrap} keyboardShouldPersistTaps="handled">
      <View style={s.logoWrap}>
        <View style={[s.logoBadge, { backgroundColor: '#06b6d4' }]}>
          <Text style={{ fontSize: 26 }}>🏪</Text>
        </View>
      </View>
      <Text style={s.heading}>Link Your Shop</Text>
      <Text style={s.subheading}>
        Enter the Shop ID from your desktop POS app.{'\n'}Find it in Settings or on the sidebar.
      </Text>
      <Label>Shop ID</Label>
      <TextInput style={[s.input, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13 }]}
        value={shopId} onChangeText={setShopId}
        placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" placeholderTextColor="#444" autoCapitalize="none" />
      {error ? <ErrBox msg={error} /> : null}
      <TouchableOpacity style={[s.primaryBtn, { backgroundColor: '#06b6d4' }]} disabled={loading} onPress={async () => {
        const sid = shopId.trim();
        if (!sid || sid.length < 8) { setError('Enter a valid Shop ID'); return; }
        setLoading(true); setError('');
        try {
          const shops = await sbFetch('shops', 'GET', null, `?id=eq.${sid}&select=id,name`);
          if (!shops || shops.length === 0) { setError('Shop not found. Check the ID and try again.'); setLoading(false); return; }
          Store.set('iva_shop_id', sid);
          setShopId(sid);
          setScreen('pairing');
        } catch (e) { setError(e.message); }
        setLoading(false);
      }}>
        <Text style={s.primaryBtnText}>{loading ? 'Validating...' : '✅ VALIDATE SHOP'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.outlineBtn, { marginTop: 20 }]} onPress={() => { setAuthUser(null); setScreen('login'); }}>
        <Text style={s.outlineBtnText}>← Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // ══════════════════════════════════════════════════════
  //  PAIRING SCREEN
  // ══════════════════════════════════════════════════════
  const generatePairingCode = async () => {
    setLoading(true); setError('');
    try {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 120000).toISOString();
      await fetch(`${SUPABASE_URL}/rest/v1/pairing_codes?shop_id=eq.${shopId}&status=eq.pending`, {
        method: 'PATCH',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'expired' }),
      });
      await sbFetch('pairing_codes', 'POST', {
        shop_id: shopId, code, status: 'pending', device_id: deviceId,
        user_id: authUser?.id || null, expires_at: expiresAt,
      });
      setPairingCode(code);
      setCodeTimer(120);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setCodeTimer(prev => { if (prev <= 1) { clearInterval(timerRef.current); return 0; } return prev - 1; });
      }, 1000);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const result = await sbFetch('pairing_codes', 'GET', null, `?shop_id=eq.${shopId}&code=eq.${code}&select=status`);
          if (result && result[0] && result[0].status === 'used') {
            clearInterval(pollRef.current);
            clearInterval(timerRef.current);
            await sbFetch('paired_devices', 'POST', {
              shop_id: shopId, user_id: authUser?.id || null, user_email: email,
              device_name: Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android' : 'Web Browser',
              device_id: deviceId, is_active: true,
            });
            Store.set('iva_paired', 'true');
            Store.set('iva_shop_id', shopId);
            setIsPaired(true);
            setScreen('dashboard');
            Alert.alert('✅ Paired!', 'Your device is now linked to the shop.');
          }
        } catch {}
      }, 2000);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const renderPairing = () => {
    const isExpired = codeTimer === 0 && pairingCode;
    return (
      <ScrollView contentContainerStyle={s.scrollWrap} keyboardShouldPersistTaps="handled">
        <View style={s.logoWrap}>
          <View style={[s.logoBadge, { backgroundColor: '#8b5cf6' }]}>
            <Text style={{ fontSize: 26 }}>🔗</Text>
          </View>
        </View>
        <Text style={s.heading}>Pair Your Device</Text>
        <Text style={s.subheading}>
          Generate a pairing key and enter it{'\n'}in the desktop POS app to link this device.
        </Text>
        {pairingCode ? (
          <View style={{ marginVertical: 20 }}>
            <Text style={{ color: '#707085', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '700', textAlign: 'center', marginBottom: 12 }}>
              Your Pairing Key
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
              {pairingCode.split('').map((d, i) => (
                <View key={i} style={{
                  width: 46, height: 58, borderRadius: 14,
                  backgroundColor: isExpired ? 'rgba(239,68,68,0.08)' : 'rgba(139,92,246,0.12)',
                  borderWidth: 2, borderColor: isExpired ? 'rgba(239,68,68,0.25)' : 'rgba(139,92,246,0.35)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: isExpired ? '#ef4444' : 'white', fontSize: 26, fontWeight: '900' }}>{d}</Text>
                </View>
              ))}
            </View>
            {codeTimer > 0 && (
              <View style={{ marginTop: 16 }}>
                <View style={{ height: 5, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                  <View style={{
                    width: `${(codeTimer / 120) * 100}%`, height: '100%', borderRadius: 3,
                    backgroundColor: codeTimer > 30 ? '#22c55e' : codeTimer > 10 ? '#f59e0b' : '#ef4444',
                  }} />
                </View>
                <Text style={{ color: codeTimer > 30 ? '#22c55e' : '#f59e0b', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 6 }}>
                  ⏱ Expires in {Math.floor(codeTimer / 60)}:{String(codeTimer % 60).padStart(2, '0')}
                </Text>
              </View>
            )}
            {isExpired && (
              <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 12 }}>
                ⏰ Code expired. Generate a new one.
              </Text>
            )}
            {!isExpired && codeTimer > 0 && (
              <View style={{ backgroundColor: 'rgba(139,92,246,0.08)', borderRadius: 14, padding: 16, marginTop: 16, borderWidth: 1, borderColor: 'rgba(139,92,246,0.15)' }}>
                <Text style={{ color: '#c4b5fd', fontSize: 12, fontWeight: '700', textAlign: 'center', marginBottom: 6 }}>
                  📋 Enter this code in your desktop app
                </Text>
                <Text style={{ color: '#707085', fontSize: 11, textAlign: 'center', lineHeight: 18 }}>
                  Desktop POS → Click "🔗 Pair Mobile" → Enter the 6-digit key above
                </Text>
              </View>
            )}
          </View>
        ) : null}
        {error ? <ErrBox msg={error} /> : null}
        <TouchableOpacity
          style={[s.primaryBtn, { backgroundColor: '#8b5cf6' }]}
          disabled={loading || (codeTimer > 0 && !isExpired)}
          onPress={generatePairingCode}>
          <Text style={s.primaryBtnText}>
            {loading ? '⏳ Generating...' : pairingCode ? '🔄 GENERATE NEW CODE' : '🔑 GENERATE PAIRING KEY'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.outlineBtn, { marginTop: 16 }]} onPress={() => {
          if (timerRef.current) clearInterval(timerRef.current);
          if (pollRef.current) clearInterval(pollRef.current);
          setPairingCode(''); setCodeTimer(0); setScreen('shopId');
        }}>
          <Text style={s.outlineBtnText}>← Back</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // ══════════════════════════════════════════════════════
  //  DASHBOARD — data fetched in RN, rendered in WebView
  // ══════════════════════════════════════════════════════
  const renderDashboard = () => {
    if (dashLoading && !dashData) {
      return (
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={s.loadingText}>Loading Dashboard...</Text>
        </View>
      );
    }
    if (dashError && !dashData) {
      return (
        <View style={s.loadingBox}>
          <Text style={{ color: '#ef4444', fontSize: 15, fontWeight: '700', textAlign: 'center', padding: 20 }}>{dashError}</Text>
          <TouchableOpacity style={[s.primaryBtn, { marginTop: 16 }]} onPress={fetchDashboardData}>
            <Text style={s.primaryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (!dashData) return null;

    const html = buildDashboardHtml(dashData.s, dashData.ts, dashData.sh);

    if (Platform.OS === 'web') {
      return (
        <View style={{ flex: 1, backgroundColor: '#06060a', alignItems: 'center' }}>
          <View style={{ width: '100%', maxWidth: 480, flex: 1, backgroundColor: '#06060a' }}>
            {React.createElement('iframe', {
              srcDoc: html,
              style: { width: '100%', height: '100%', border: 'none', backgroundColor: '#06060a' },
              title: 'Dashboard',
            })}
          </View>
        </View>
      );
    }

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#06060a' }} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor="#06060a" />
        <WebView
          ref={webviewRef}
          source={{ html }}
          style={{ flex: 1, backgroundColor: '#06060a' }}
          bounces={false} overScrollMode="never" originWhitelist={['*']}
          javaScriptEnabled domStorageEnabled mixedContentMode="always"
          onMessage={(event) => {
            if (event.nativeEvent.data === 'logout') {
              Alert.alert('Logout', 'Unpair this device and logout?', [
                { text: 'Cancel' },
                { text: 'Logout', style: 'destructive', onPress: () => {
                  Store.del('iva_paired'); Store.del('iva_shop_id');
                  setIsPaired(false); setScreen('login');
                }},
              ]);
            }
          }}
        />
      </SafeAreaView>
    );
  };

  // ── Build dashboard HTML with data already fetched ──
  const buildDashboardHtml = (stats, ts, shop) => {
    // Serialize data into the HTML as a JSON blob — no fetch needed inside WebView
    const dataJSON = JSON.stringify({ stats, ts, shop, shopId }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

    return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{overflow-x:hidden;width:100%;max-width:100vw}
body{font-family:Inter,-apple-system,sans-serif;background:#06060a;color:#f0f0f5;-webkit-font-smoothing:antialiased;padding-bottom:60px}
.tabs{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;padding:14px 16px}
.tab{padding:7px 12px;border-radius:18px;font-size:10px;font-weight:700;border:1px solid #1a1a24;background:#0d0d14;color:#707085;cursor:pointer;white-space:nowrap;text-transform:uppercase;letter-spacing:.04em;text-align:center}
.tab.on{background:rgba(99,102,241,.15);color:#6366f1;border-color:#6366f1}
.pg{display:none;padding:0 16px 16px}.pg.on{display:block}
.card{background:#0d0d14;border:1px solid #1a1a24;border-radius:14px;padding:14px 16px;margin-bottom:8px}
.lbl{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#45455a;font-weight:700;margin-bottom:4px}
.row{display:flex;gap:10px}.row>div{flex:1}
.ch{display:none}.ch.on{display:flex}
.pd{display:none}.pd.on{display:block}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
</style>
</head><body>
<div id="app"></div>
<script>
var D = ${dataJSON};
var s = D.stats, ts = D.ts, sh = D.shop, S = D.shopId;

function fmt(n){if(!n&&n!==0)return '0';if(n>=100000)return (n/100000).toFixed(1)+'L';if(n>=1000)return (n/1000).toFixed(1)+'K';return Math.round(n);}
function fc(n){return '\\u20B9'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0});}
function pc(v){return (v||0)>=0?'#22c55e':'#ef4444';}

function render(){
  // AI chatbot
  var aiHTML = '<div class="card" style="margin-bottom:14px;background:linear-gradient(135deg,rgba(99,102,241,0.1),rgba(139,92,246,0.1));border:1px solid rgba(99,102,241,0.2)"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:800;color:#818cf8;margin-bottom:12px;display:flex;align-items:center;gap:6px"><span style="font-size:14px">\\u{1F916}</span> AI Assistant</div><div id="a-c" style="height:120px;overflow-y:auto;margin-bottom:10px;display:flex;flex-direction:column;gap:8px;font-size:11px;padding-right:4px"><div style="align-self:flex-start;background:rgba(255,255,255,0.05);padding:8px 12px;border-radius:12px;border-bottom-left-radius:0;color:#e2e8f0;max-width:85%">Hi! Ask me about sales, profit, stock, etc.</div></div><div style="display:flex;gap:8px"><input type="text" id="a-i" placeholder="Ask about profit, bills..." style="flex:1;background:#0d0d14;border:1px solid #1a1a24;color:white;border-radius:10px;padding:8px 12px;font-size:11px;outline:none" onkeypress="if(event.key===\'Enter\')aA()"><button onclick="aA()" style="background:#6366f1;color:white;border:none;padding:0 14px;border-radius:10px;font-weight:700;font-size:11px;cursor:pointer">Send</button></div></div>';

  // Charts
  var maxW=Math.max.apply(null,(s.weeklyBreakdown||[]).map(function(v){return v.total}).concat([1]));
  var wChart=(s.weeklyBreakdown||[]).map(function(v){return '<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100px;gap:4px"><div style="width:100%;background:#6366f1;border-radius:4px;height:'+((v.total/maxW)*80)+'px"></div><div style="font-size:8px;color:#707085">W'+v.week+'</div></div>';}).join('');
  var maxM=Math.max.apply(null,(s.monthlySalesBreakdown||[]).map(function(v){return v.total}).concat([1]));
  var mChart=(s.monthlySalesBreakdown||[]).slice(-6).map(function(v){return '<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100px;gap:4px"><div style="width:100%;background:#22c55e;border-radius:4px;height:'+((v.total/maxM)*80)+'px"></div><div style="font-size:8px;color:#707085">'+v.month.split('-')[1]+'</div></div>';}).join('');
  var maxY=Math.max.apply(null,(s.yearlyBreakdown||[]).map(function(v){return v.total}).concat([1]));
  var yChart=(s.yearlyBreakdown||[]).slice(0,5).reverse().map(function(v){return '<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100px;gap:4px"><div style="width:100%;background:#f59e0b;border-radius:4px;height:'+((v.total/maxY)*80)+'px"></div><div style="font-size:8px;color:#707085">'+v.year+'</div></div>';}).join('');
  var chartHTML='<div class="card" style="margin-bottom:14px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#707085;margin-bottom:12px">\\u{1F4CA} Graphical Profit Display</div><div class="tabs" style="padding:0;margin-bottom:10px"><div class="tab ch_tab on" onclick="C(\'tw\',this)">This Week</div><div class="tab ch_tab" onclick="C(\'tm\',this)">This Month</div><div class="tab ch_tab" onclick="C(\'ty\',this)">This Year</div></div><div id="c-tw" class="ch on" style="display:flex;gap:4px;align-items:flex-end">'+(wChart||'<div style="color:#707085;font-size:11px">No data</div>')+'</div><div id="c-tm" class="ch" style="display:none;gap:4px;align-items:flex-end">'+(mChart||'<div style="color:#707085;font-size:11px">No data</div>')+'</div><div id="c-ty" class="ch" style="display:none;gap:4px;align-items:flex-end">'+(yChart||'<div style="color:#707085;font-size:11px">No data</div>')+'</div></div>';
  var top=(s.topSelling||s.topProducts||[]).slice(0,6).map(function(p,i){return '<div class="card" style="display:flex;align-items:center;gap:10px"><div style="width:26px;height:26px;border-radius:8px;background:rgba(99,102,241,.12);color:#6366f1;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800">'+(i+1)+'</div><div style="flex:1"><div style="font-size:12px;font-weight:600">'+p.name+'</div><div style="font-size:10px;color:#707085">'+(p.total_sold||p.sold||0)+' sold</div></div><div style="font-size:12px;font-weight:700;color:#22c55e">'+fc(p.revenue||0)+'</div></div>';}).join('');

  // Products
  var lowThres=s.settings?(s.settings.lowStockThreshold||10):10;
  var allPs=s.allProductsList||[];
  var allPHTML=allPs.length?allPs.map(function(p){return '<div class="card"><div style="font-size:12px;font-weight:700">'+p.name+'</div><div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px"><span style="color:#707085">Stock: <b style="color:'+(p.quantity<=0?'#ef4444':p.quantity<=lowThres?'#f59e0b':'#22c55e')+'">'+p.quantity+' '+(p.unit||'')+'</b></span><span style="color:#22c55e;font-weight:800">'+fc(p.price)+'</span></div></div>';}).join(''):'<div style="text-align:center;padding:20px;color:#707085;font-size:12px">No products</div>';
  var lowPs=(s.lowStockProducts||[]).filter(function(p){return p.quantity>0;});
  var lowPHTML=lowPs.length?lowPs.map(function(p){return '<div class="card"><div style="display:flex;justify-content:space-between"><div style="font-size:12px;font-weight:700;color:#f59e0b">'+p.name+'</div><div style="font-size:11px;color:#707085">'+p.quantity+' '+(p.unit||'')+' left</div></div></div>';}).join(''):'<div style="text-align:center;padding:20px;color:#707085;font-size:12px">0 items - All stock levels are healthy</div>';
  var deadPs=allPs.filter(function(p){return p.quantity<=0;});
  var deadPHTML=deadPs.length?deadPs.map(function(p){return '<div class="card"><div style="font-size:12px;font-weight:700;color:#ef4444">'+p.name+' <span style="font-size:9px;color:#707085">(0 stock)</span></div></div>';}).join(''):'<div style="text-align:center;padding:20px;color:#707085;font-size:12px">0 items - No dead stock</div>';
  var expPHTML=(s.expiredProducts||[]).length?(s.expiredProducts||[]).map(function(p){return '<div class="card"><div style="display:flex;justify-content:space-between"><div style="font-size:12px;font-weight:700;color:#ef4444">'+p.name+'</div><div style="font-size:10px;color:#707085">Exp: '+p.expiry_date+'</div></div></div>';}).join(''):'<div style="text-align:center;padding:20px;color:#707085;font-size:12px">0 items - No expired products</div>';
  var tdy=new Date().getTime();
  var abtExpPHTML=(s.expiringProducts||[]).length?(s.expiringProducts||[]).map(function(p){var diff=Math.ceil((new Date(p.expiry_date).getTime()-tdy)/(1000*3600*24));return '<div class="card"><div style="display:flex;justify-content:space-between"><div style="font-size:12px;font-weight:700;color:#f59e0b">'+p.name+'</div><div style="font-size:10px;color:#707085">'+(diff>0?diff+' days left':'Expires today')+'</div></div></div>';}).join(''):'<div style="text-align:center;padding:20px;color:#707085;font-size:12px">0 items</div>';

  var prdTab='<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:6px;padding-bottom:10px;margin-bottom:10px"><div class="tab pd_tab on" onclick="P(\'all\',this)">All Products</div><div class="tab pd_tab" onclick="P(\'low\',this)">Low Stock</div><div class="tab pd_tab" onclick="P(\'dead\',this)">Dead Stock</div><div class="tab pd_tab" onclick="P(\'exp\',this)">Expired</div><div class="tab pd_tab" onclick="P(\'aexp\',this)">About to Expire</div></div><div id="p-all" class="pd on">'+allPHTML+'</div><div id="p-low" class="pd">'+lowPHTML+'</div><div id="p-dead" class="pd">'+deadPHTML+'</div><div id="p-exp" class="pd">'+expPHTML+'</div><div id="p-aexp" class="pd">'+abtExpPHTML+'</div>';

  // Alerts
  var hn=JSON.parse(localStorage.getItem('hn')||'[]');
  var notifs=[];
  (s.lowStockProducts||[]).filter(function(x){return x.quantity>0;}).forEach(function(o){notifs.push({id:'ls'+o.name.replace(/[^a-zA-Z0-9]/g,''),type:'Low Stock',msg:o.name+' - only '+o.quantity+' left',col:'#f59e0b'});});
  (s.outOfStockProducts||[]).forEach(function(o){notifs.push({id:'os'+o.name.replace(/[^a-zA-Z0-9]/g,''),type:'Dead Stock',msg:o.name+' - 0 stock!',col:'#ef4444'});});
  (s.expiredProducts||[]).forEach(function(o){notifs.push({id:'ex'+o.name.replace(/[^a-zA-Z0-9]/g,''),type:'Expired',msg:o.name+' expired on '+o.expiry_date,col:'#ef4444'});});
  (s.expiringProducts||[]).forEach(function(o){var diff=Math.ceil((new Date(o.expiry_date).getTime()-tdy)/(1000*3600*24));notifs.push({id:'ne'+o.name.replace(/[^a-zA-Z0-9]/g,''),type:'Expiring Soon',msg:o.name+' expires '+(diff>0?'in '+diff+' days':'today'),col:'#f59e0b'});});
  var activeNotifs=notifs.filter(function(n){return hn.indexOf(n.id)===-1;});
  var alHTML=activeNotifs.length===0?'<div style="text-align:center;padding:40px 20px;color:#707085;font-size:12px">\\u2705 No new alerts - Everything looks good!</div>':'<button onclick="clrA()" style="width:100%;padding:10px;background:rgba(255,255,255,0.05);color:white;border:1px solid #1a1a24;border-radius:10px;margin-bottom:14px;font-size:11px;font-weight:700;cursor:pointer">Clear All Alerts</button>'+activeNotifs.map(function(n){return '<div class="card" id="n-'+n.id+'" style="border-left:3px solid '+n.col+'"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div style="flex:1"><div style="font-size:10px;font-weight:800;color:'+n.col+';text-transform:uppercase;margin-bottom:4px">'+n.type+'</div><div style="font-size:12px;color:white">'+n.msg+'</div></div><div onclick="clrN(\''+n.id+'\')" style="color:#707085;font-size:18px;padding:4px 8px;cursor:pointer">&times;</div></div></div>';}).join('');

  // Invoices
  var hi=JSON.parse(localStorage.getItem('hi')||'[]');
  var activeInv=(s.recentInvoices||[]).filter(function(i){return hi.indexOf(String(i.id))===-1&&hi.indexOf(i.id)===-1;});
  var invHtml=activeInv.length===0?'<div style="text-align:center;padding:20px;color:#707085;font-size:12px">No recent bills</div>':activeInv.map(function(i){return '<div class="card" id="inv-'+i.id+'"><div style="display:flex;justify-content:space-between;margin-bottom:8px"><div style="font-size:12px;font-weight:700">#'+(i.bill_no||i.id)+' &middot; '+(i.customer_name||'Walk-in')+'</div><div style="font-size:12px;font-weight:800;color:#22c55e">'+fc(i.total_amount)+'</div></div><div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:10px;color:#707085">'+(i.bill_date||'')+' &middot; '+(i.payment_mode||'Cash')+'</div><div style="display:flex;gap:10px"><button onclick="vB(\''+i.id+'\')" style="background:#1a1a24;color:white;border:none;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer">View</button><button onclick="dB(\''+i.id+'\')" style="background:rgba(239,68,68,0.1);color:#ef4444;border:none;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer">Delete</button></div></div></div>';}).join('');

  // Profile
  var set=s.settings||{};
  var profHtml='<div class="card" style="text-align:center;padding:30px 16px;margin-top:10px"><div style="width:60px;height:60px;border-radius:18px;background:rgba(99,102,241,0.1);color:#6366f1;font-size:28px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px">\\u{1F3EA}</div><div style="font-size:20px;font-weight:900;color:white;margin-bottom:4px">'+sh.name+'</div><div style="font-size:11px;color:#818cf8;font-weight:600;margin-bottom:16px;font-style:italic">'+(set.storeTagline||'')+'</div><div style="text-align:left;background:#1a1a24;border-radius:12px;padding:14px;margin-bottom:20px;display:flex;flex-direction:column;gap:10px"><div><div class="lbl">Shop ID</div><div style="font-size:12px;font-family:monospace;color:#6366f1">'+S+'</div></div><div><div class="lbl">Owner Name</div><div style="font-size:12px;color:white">'+(sh.owner_name||'Owner')+'</div></div><div><div class="lbl">Owner Mobile</div><div style="font-size:12px;color:white">'+(sh.mobile_number||'N/A')+'</div></div><div><div class="lbl">WhatsApp Number</div><div style="font-size:12px;color:white">'+(set.whatsappNumber||'N/A')+'</div></div><div><div class="lbl">Store Address</div><div style="font-size:12px;color:white">'+(set.storeAddress||'N/A')+'</div></div><div><div class="lbl">GST Number</div><div style="font-size:12px;color:white">'+(set.gstNumber||'N/A')+'</div></div></div><button onclick="doLogout()" style="width:100%;padding:14px;background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.2);border-radius:12px;font-weight:800;font-size:13px;cursor:pointer">LOGOUT</button></div>';

  // Assemble
  var header='<div style="position:sticky;top:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:rgba(6,6,10,.92);backdrop-filter:blur(16px);border-bottom:1px solid #1a1a24"><div style="font-size:16px;font-weight:800">iVA <span style="color:#707085;font-weight:500;font-style:italic">Owner</span></div><div style="display:flex;align-items:center;gap:6px;background:rgba(34,197,94,.1);color:#22c55e;padding:4px 10px;border-radius:16px;font-size:9px;font-weight:700;text-transform:uppercase"><span style="width:6px;height:6px;border-radius:50%;background:#22c55e;animation:pulse 2s infinite"></span>Synced</div></div>';
  var navTabs='<div class="tabs"><div class="tab on" onclick="sw(\'ov\',this)">Overview</div><div class="tab" onclick="sw(\'prd\',this)">Products</div><div class="tab" onclick="sw(\'al\',this)">Alerts</div><div class="tab" onclick="sw(\'inv\',this)">Invoices</div><div class="tab" onclick="sw(\'prof\',this)">Profile</div></div>';

  document.getElementById('app').innerHTML = header + navTabs +
    '<div id="pg-ov" class="pg on"><div style="font-size:10px;color:#45455a;text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-bottom:14px">Updated &middot; '+ts+'</div>'+aiHTML+chartHTML+
    '<div style="padding:22px;border-radius:18px;background:linear-gradient(135deg,#0d0d1a,#111125);border:1px solid #1a1a24;margin-bottom:14px"><div class="lbl">Today\\u2019s Profit</div><div style="font-size:34px;font-weight:900;letter-spacing:-.03em;color:'+pc(s.todayProfit)+'">'+fc(s.todayProfit||0)+'</div><hr style="border:none;border-top:1px solid #1a1a24;margin:14px 0"><div style="display:flex;gap:20px"><div><div class="lbl">Revenue</div><div style="font-size:14px;font-weight:700">'+fc(s.todaySales||0)+'</div></div><div><div class="lbl">Bills</div><div style="font-size:14px;font-weight:700">'+(s.todayBills||0)+'</div></div></div></div>'+
    '<div class="card" style="margin-bottom:14px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#707085;margin-bottom:12px">\\u{1F4B0} Profit Summary</div><div class="row" style="text-align:center"><div><div class="lbl">Today</div><div style="font-size:15px;font-weight:800;color:'+pc(s.todayProfit)+'">'+fc(s.todayProfit||0)+'</div></div><div><div class="lbl">Week</div><div style="font-size:15px;font-weight:800;color:'+pc(s.weeklyProfit)+'">'+fc(s.weeklyProfit||0)+'</div></div></div><div class="row" style="text-align:center;margin-top:10px"><div><div class="lbl">Month</div><div style="font-size:15px;font-weight:800;color:'+pc(s.monthlyProfit)+'">'+fc(s.monthlyProfit||0)+'</div></div><div><div class="lbl">Overall</div><div style="font-size:15px;font-weight:800;color:'+pc(s.overallProfit)+'">'+fc(s.overallProfit||0)+'</div></div></div></div>'+
    '<div class="card" style="margin-bottom:14px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#707085;margin-bottom:12px">\\u{1F4C8} Sales Summary</div><div class="row" style="text-align:center"><div><div class="lbl">This Week</div><div style="font-size:15px;font-weight:800;color:white">'+fc(s.weeklySales||0)+'</div></div><div><div class="lbl">This Month</div><div style="font-size:15px;font-weight:800;color:white">'+fc(s.monthlySales||0)+'</div></div></div><div class="row" style="text-align:center;margin-top:10px"><div><div class="lbl">Overall Sales</div><div style="font-size:15px;font-weight:800;color:white">'+fc(s.overallSales||0)+'</div></div><div><div class="lbl">Total Bills</div><div style="font-size:15px;font-weight:800;color:white">'+(s.overallBills||0)+'</div></div></div></div>'+
    '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#707085;margin-bottom:8px">\\u{1F3C6} Top Sellers</div>'+top+'</div>'+
    '<div id="pg-prd" class="pg">'+prdTab+'</div>'+
    '<div id="pg-al" class="pg">'+alHTML+'</div>'+
    '<div id="pg-inv" class="pg">'+invHtml+'</div>'+
    '<div id="pg-prof" class="pg">'+profHtml+'</div>';
}

// Navigation helpers
function sw(id,el){var pgs=document.querySelectorAll('.pg');for(var i=0;i<pgs.length;i++)pgs[i].classList.remove('on');var tabs=document.querySelectorAll('.tabs>.tab');for(var i=0;i<tabs.length;i++)tabs[i].classList.remove('on');document.getElementById('pg-'+id).classList.add('on');el.classList.add('on');}
function C(id,el){var ch=document.querySelectorAll('.ch');for(var i=0;i<ch.length;i++)ch[i].classList.remove('on');var tabs=document.querySelectorAll('.ch_tab');for(var i=0;i<tabs.length;i++)tabs[i].classList.remove('on');document.getElementById('c-'+id).classList.add('on');el.classList.add('on');}
function P(id,el){var pd=document.querySelectorAll('.pd');for(var i=0;i<pd.length;i++)pd[i].classList.remove('on');var tabs=document.querySelectorAll('.pd_tab');for(var i=0;i<tabs.length;i++)tabs[i].classList.remove('on');document.getElementById('p-'+id).classList.add('on');el.classList.add('on');}

// Alert controls
function clrN(id){var hn=JSON.parse(localStorage.getItem('hn')||'[]');hn.push(String(id));localStorage.setItem('hn',JSON.stringify(hn));var el=document.getElementById('n-'+id);if(el)el.style.display='none';}
function clrA(){var hn=JSON.parse(localStorage.getItem('hn')||'[]');var els=document.querySelectorAll('[id^="n-"]');for(var i=0;i<els.length;i++){hn.push(String(els[i].id.replace('n-','')));els[i].style.display='none';}localStorage.setItem('hn',JSON.stringify(hn));}

// Invoice controls
function dB(id){if(confirm('Delete this bill from mobile view? This cannot be undone.')){var hi=JSON.parse(localStorage.getItem('hi')||'[]');hi.push(String(id));localStorage.setItem('hi',JSON.stringify(hi));var el=document.getElementById('inv-'+id);if(el)el.style.display='none';}}
function vB(id){var inv=null;var invs=s.recentInvoices||[];for(var i=0;i<invs.length;i++){if(String(invs[i].id)===String(id)){inv=invs[i];break;}}if(!inv)return;alert('--- BILL DETAILS ---\\n\\nBill No: '+(inv.bill_no||inv.id)+'\\nCustomer: '+(inv.customer_name||'Walk-in')+'\\nTotal: '+fc(inv.total_amount)+'\\nPayment: '+(inv.payment_mode||'Cash')+'\\nDate: '+(inv.bill_date||inv.created_at));}

// Logout
function doLogout(){if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage('logout');}else{window.parent.postMessage('logout','*');}}

// AI chatbot
function aA(){var inp=document.getElementById('a-i');if(!inp)return;var q=inp.value.trim().toLowerCase();if(!q)return;var chat=document.getElementById('a-c');chat.innerHTML+='<div style="align-self:flex-end;background:#6366f1;padding:8px 12px;border-radius:12px;border-bottom-right-radius:0;color:white;max-width:85%">'+q+'</div>';inp.value='';var ans='I am not sure. Try asking about profit, bills, sales, or products.';if(q.indexOf('today')!==-1&&(q.indexOf('profit')!==-1||q.indexOf('earning')!==-1))ans='Today\\'s profit is '+fc(s.todayProfit)+'.';else if(q.indexOf('today')!==-1&&q.indexOf('bill')!==-1)ans='You generated '+s.todayBills+' bills today.';else if(q.indexOf('today')!==-1&&q.indexOf('sale')!==-1)ans='Today\\'s sales revenue is '+fc(s.todaySales)+'.';else if(q.indexOf('week')!==-1&&q.indexOf('profit')!==-1)ans='This week\\'s profit is '+fc(s.weeklyProfit)+'.';else if(q.indexOf('week')!==-1&&q.indexOf('sale')!==-1)ans='Weekly sales: '+fc(s.weeklySales)+'.';else if(q.indexOf('month')!==-1&&q.indexOf('profit')!==-1)ans='Monthly profit: '+fc(s.monthlyProfit)+'.';else if(q.indexOf('month')!==-1&&q.indexOf('sale')!==-1)ans='Monthly sales: '+fc(s.monthlySales)+'.';else if(q.indexOf('product')!==-1||q.indexOf('item')!==-1)ans='You have '+(s.totalProducts||0)+' products registered.';else if(q.indexOf('low')!==-1&&q.indexOf('stock')!==-1)ans='There are '+(s.lowStockCount||0)+' low stock items.';else if(q.indexOf('overall')!==-1||q.indexOf('total')!==-1)ans='Overall profit: '+fc(s.overallProfit)+', Total sales: '+fc(s.overallSales)+', Bills: '+(s.overallBills||0);setTimeout(function(){chat.innerHTML+='<div style="align-self:flex-start;background:rgba(255,255,255,0.05);padding:8px 12px;border-radius:12px;border-bottom-left-radius:0;color:#e2e8f0;max-width:85%">'+ans+'</div>';chat.scrollTop=chat.scrollHeight;},300);}

// Web logout listener
window.addEventListener('message',function(e){if(e.data==='logout'){doLogout();}});

render();
</script></body></html>`;
  };

  // ── Web Listener for Logout ──
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleMsg = (e) => {
        if (e.data === 'logout') {
          Store.del('iva_paired'); Store.del('iva_shop_id');
          setIsPaired(false); setScreen('login');
        }
      };
      window.addEventListener('message', handleMsg);
      return () => window.removeEventListener('message', handleMsg);
    }
  }, []);

  // ── Main Render ──
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#06060a', alignItems: 'center' }}>
      <StatusBar barStyle="light-content" backgroundColor="#06060a" />
      <View style={{ width: '100%', maxWidth: 480, flex: 1, backgroundColor: '#06060a' }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          {screen === 'register' && renderRegister()}
          {screen === 'login' && renderLogin()}
          {screen === 'forgot' && renderForgot()}
          {screen === 'forgot_otp' && renderForgotOtp()}
          {screen === 'forgot_reset' && renderForgotReset()}
          {screen === 'shopId' && renderShopId()}
          {screen === 'pairing' && renderPairing()}
          {screen === 'dashboard' && renderDashboard()}
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

// ── Shared Components ──
const Label = ({ children }) => <Text style={s.label}>{children}</Text>;
const ErrBox = ({ msg }) => <Text style={s.errBox}>❌ {msg}</Text>;

// ── Provider Wrapper ──
export default function App() {
  return <SafeAreaProvider><OwnerApp /></SafeAreaProvider>;
}

// ══════════════════════════════════════════════════════
//  STYLES
// ══════════════════════════════════════════════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06060a' },
  scrollWrap: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 60 },
  logoWrap: { alignItems: 'center', marginBottom: 20 },
  logoBadge: { width: 60, height: 60, borderRadius: 18, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },

  heading: { color: 'white', fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 6, letterSpacing: -0.5 },
  subheading: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginBottom: 28, lineHeight: 20 },

  label: { color: '#64748b', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5, marginTop: 6 },
  input: { backgroundColor: '#111119', color: 'white', fontSize: 15, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#252532', marginBottom: 10 },

  primaryBtn: { backgroundColor: '#6366f1', padding: 16, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: 'white', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },

  outlineBtn: { padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#252532' },
  outlineBtnText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },

  linkText: { color: '#6366f1', fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 16 },
  errBox: { color: '#ef4444', fontSize: 12, fontWeight: '600', marginBottom: 10, padding: 10, backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: 10, textAlign: 'center', overflow: 'hidden' },

  loadingBox: { flex: 1, backgroundColor: '#06060a', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: 'white', fontSize: 16, marginTop: 14, fontWeight: '600' },
});
