import React, { useState, useEffect, useMemo } from 'react';
import { 
  View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, 
  StatusBar, TextInput, ScrollView, Dimensions, Alert, RefreshControl
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { createClient } from '@supabase/supabase-js';

// ── GLOBAL CONFIG ──
const GLOBAL_CONFIG = {
  supabaseUrl: "https://baawqrqihlhsrghvjlpx.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYXdxcnFpaGxoc3JnaHZqbHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3Nzk2NzgsImV4cCI6MjA5MTM1NTY3OH0.h1mfhgS8G3IYcZ96L8T3YXkmxtbYJv95rJM39z1Clw0"
};

const { width } = Dimensions.get('window');

// ── UI COMPONENTS (Shadcn Style) ─────────────────────────

const ShadcnCard = ({ children, style }) => (
  <View style={[styles.shCard, style]}>{children}</View>
);

const Badge = ({ label, type = 'default' }) => {
  const bg = { default: '#1e293b', danger: '#fecaca', success: '#dcfce7', warning: '#fef3c7' }[type];
  const text = { default: '#94a3b8', danger: '#991b1b', success: '#166534', warning: '#92400e' }[type];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: text }]}>{label}</Text>
    </View>
  );
};

// ── NATIVE PRO INSIGHTS ───────────────────────────────────
const NativeInsights = ({ config }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ 
    sales: 0, bills: 0, 
    peakHour: '--', topProducts: [], 
    deadStock: 0, lowStock: [], expired: [] 
  });
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const supabase = createClient(GLOBAL_CONFIG.supabaseUrl, GLOBAL_CONFIG.supabaseKey);
      const today = new Date().toISOString().split('T')[0];
      
      // 1. Fetch Invoices (for Sales, Bills, and Peak Time)
      const { data: invoices } = await supabase
        .from('invoices')
        .select('total_amount, created_at, items_json')
        .eq('shop_id', config.shopId);

      const todayInvoices = invoices?.filter(i => i.created_at.startsWith(today)) || [];
      const totalSales = todayInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

      // 2. AI Peak Time Analysis
      let hourMap = {};
      invoices?.forEach(inv => {
        const hour = new Date(inv.created_at).getHours();
        hourMap[hour] = (hourMap[hour] || 0) + 1;
      });
      const peakHour = Object.keys(hourMap).reduce((a, b) => hourMap[a] > hourMap[b] ? a : b, '--');
      const peakLabel = peakHour !== '--' ? `${peakHour}:00 - ${parseInt(peakHour)+1}:00` : '--';

      // 3. Top Products Analysis
      let productMap = {};
      invoices?.forEach(inv => {
        const items = JSON.parse(inv.items_json || '[]');
        items.forEach(it => {
          productMap[it.name] = (productMap[it.name] || 0) + it.qty;
        });
      });
      const topProducts = Object.entries(productMap)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([name, qty]) => ({ name, qty }));

      // 4. Stock Health (Global check)
      const { data: globalProducts } = await supabase
        .from('products')
        .select('*')
        .eq('shop_id', config.shopId);

      const expired = globalProducts?.filter(p => p.expiry_date && p.expiry_date < today) || [];
      const lowStock = globalProducts?.filter(p => p.quantity > 0 && p.quantity <= 10) || [];
      
      // Dead Stock (Products with 0 sales in filtered invoices)
      const soldNames = new Set(Object.keys(productMap));
      const deadStockCount = globalProducts?.filter(p => !soldNames.has(p.name)).length || 0;

      setData({
        sales: totalSales,
        bills: todayInvoices.length,
        peakHour: peakLabel,
        topProducts,
        deadStock: deadStockCount,
        lowStock,
        expired
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return <View style={styles.centered}><ActivityIndicator color="#fff" /></View>;

  return (
    <ScrollView 
      style={{ flex: 1 }} 
      contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchData();}} tintColor="#fff" />}
    >
      <View style={styles.shHeader}>
        <Text style={styles.shHeaderTitle}>Business Intelligence</Text>
        <Text style={styles.shHeaderSub}>AI-Powered Shop Analytics</Text>
      </View>

      {/* TODAY'S REVENUE (Shadcn Hero) */}
      <ShadcnCard style={{ backgroundColor: '#fff', borderBottomWidth: 5, borderBottomColor: '#6366f1' }}>
        <Text style={[styles.shCardSub, { color: '#64748b' }]}>Today's Revenue</Text>
        <Text style={[styles.shCardMain, { color: '#0f172a' }]}>₹{data.sales.toLocaleString()}</Text>
        <View style={styles.shRow}>
          <Text style={{ fontSize: 12, color: '#64748b' }}>{data.bills} Total Bills</Text>
          <Badge label="TRENDING UP" type="success" />
        </View>
      </ShadcnCard>

      {/* AI INSIGHTS GRID */}
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
        <ShadcnCard style={{ flex: 1 }}>
          <Text style={styles.shCardSub}>Busiest Hour</Text>
          <Text style={styles.shCardSmall}>{data.peakHour}</Text>
        </ShadcnCard>
        <ShadcnCard style={{ flex: 1 }}>
          <Text style={styles.shCardSub}>Dead Stock</Text>
          <Text style={[styles.shCardSmall, { color: '#ef4444' }]}>{data.deadStock} Items</Text>
        </ShadcnCard>
      </View>

      {/* TOP SELLING PRODUCTS */}
      <Text style={styles.shSectionTitle}>Top Sold This Month</Text>
      <ShadcnCard style={{ padding: 0, overflow: 'hidden' }}>
        {data.topProducts.map((p, i) => (
          <View key={i} style={[styles.shListItem, i === 4 && { borderBottomWidth: 0 }]}>
             <Text style={styles.shItemName}>{p.name}</Text>
             <Text style={styles.shItemQty}>{p.qty} Sold</Text>
          </View>
        ))}
      </ShadcnCard>

      {/* INVENTORY ALERTS */}
      <Text style={styles.shSectionTitle}>Critical Alerts</Text>
      {data.expired.length > 0 && (
        <ShadcnCard style={{ borderColor: '#fca5a5', backgroundColor: '#fef2f2', marginBottom: 12 }}>
          <Text style={{ color: '#991b1b', fontWeight: '800', fontSize: 12 }}>🚨 {data.expired.length} ITEMS EXPIRED</Text>
          <Text style={{ color: '#b91c1c', fontSize: 10, marginTop: 4 }}>Immediate removal recommended from shelf.</Text>
        </ShadcnCard>
      )}
      {data.lowStock.length > 0 && (
        <ShadcnCard style={{ borderColor: '#fde68a', backgroundColor: '#fffbeb' }}>
          <Text style={{ color: '#92400e', fontWeight: '800', fontSize: 12 }}>📉 {data.lowStock.length} ITEMS LOW STOCK</Text>
          <Text style={{ color: '#a16207', fontSize: 10, marginTop: 4 }}>Consider restocking these items soon.</Text>
        </ShadcnCard>
      )}
      
    </ScrollView>
  );
};

// ── MAIN APP CONTAINER ───────────────────────────────────

export default function App() {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);
  const [activeTab, setActiveTab] = useState('insights'); 
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('smart_billing_config_v2').then(saved => {
      if (saved) setConfig(JSON.parse(saved));
      setLoading(false);
    });
  }, []);

  const handleBarCodeScanned = ({ data }) => {
    setShowScanner(false);
    try {
      const scannedData = JSON.parse(data);
      if (scannedData.shopId) {
        AsyncStorage.setItem('smart_billing_config_v2', data);
        setConfig(scannedData);
      }
    } catch(e) {}
  };

  if (loading) return null;

  if (showScanner) {
    return (
      <View style={{flex: 1, backgroundColor: '#000'}}>
        <CameraView style={StyleSheet.absoluteFill} onBarcodeScanned={handleBarCodeScanned} />
        <TouchableOpacity style={styles.scannerClose} onPress={() => setShowScanner(false)}>
           <Text style={{color:'#fff', fontWeight: '800'}}>BACK</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        
        {!config ? (
           <View style={styles.onboarding}>
              <Text style={styles.logoText}><Text style={{color: '#6366f1'}}>iVA</Text> SmartBill</Text>
              <TouchableOpacity style={styles.shBtn} onPress={() => setShowScanner(true)}>
                <Text style={styles.shBtnText}>SCAN TERMINAL QR</Text>
              </TouchableOpacity>
           </View>
        ) : (
          <>
            <View style={{ flex: 1 }}>
              {activeTab === 'insights' ? (
                <NativeInsights config={config} />
              ) : (
                <WebView 
                  source={{ uri: `https://${config.shopId}-owner.loca.lt`, headers: { 'Bypass-Tunnel-Reminder': 'true' } }}
                  style={{ flex: 1, backgroundColor: '#0f172a' }}
                />
              )}
            </View>

            <View style={styles.navbar}>
               <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('insights')}>
                  <Text style={[styles.navIcon, activeTab === 'insights' && { color: '#fff' }]}>📅</Text>
                  <Text style={[styles.navLabel, activeTab === 'insights' && { color: '#fff' }]}>Insights</Text>
               </TouchableOpacity>
               <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('live')}>
                  <Text style={[styles.navIcon, activeTab === 'live' && { color: '#fff' }]}>🕹️</Text>
                  <Text style={[styles.navLabel, activeTab === 'live' && { color: '#fff' }]}>Live</Text>
               </TouchableOpacity>
               <TouchableOpacity style={styles.navItem} onPress={() => { AsyncStorage.removeItem('smart_billing_config_v2'); setConfig(null); }}>
                  <Text style={styles.navIcon}>⚙️</Text>
                  <Text style={styles.navLabel}>Unlink</Text>
               </TouchableOpacity>
            </View>
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  onboarding: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  logoText: { color: '#fff', fontSize: 32, fontWeight: '900', marginBottom: 40 },
  
  // Shadcn Theme Components
  shHeader: { marginBottom: 25 },
  shHeaderTitle: { color: '#fff', fontSize: 24, fontWeight: '900' },
  shHeaderSub: { color: '#64748b', fontSize: 13, fontWeight: '600', marginTop: 4 },
  
  shCard: { backgroundColor: '#1e293b', borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#334155' },
  shCardSub: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, color: '#94a3b8', textTransform: 'uppercase' },
  shCardMain: { fontSize: 36, fontWeight: '900', marginTop: 10, marginBottom: 15 },
  shCardSmall: { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 8 },
  shRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shSectionTitle: { color: '#64748b', fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 15, textTransform: 'uppercase' },
  
  shListItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' },
  shItemName: { color: '#fff', fontSize: 13, fontWeight: '700' },
  shItemQty: { color: '#6366f1', fontSize: 12, fontWeight: '800' },

  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 9, fontWeight: '900' },

  shBtn: { backgroundColor: '#6366f1', paddingVertical: 18, width: '100%', borderRadius: 12, alignItems: 'center' },
  shBtnText: { color: '#fff', fontWeight: '900', fontSize: 14 },

  navbar: { flexDirection: 'row', height: 80, backgroundColor: '#1e293b', borderTopWidth: 1, borderTopColor: '#334155', paddingBottom: 15 },
  navItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  navIcon: { fontSize: 20, color: '#64748b' },
  navLabel: { fontSize: 10, fontWeight: '800', color: '#64748b', marginTop: 4 },
  scannerClose: { position: 'absolute', bottom: 50, alignSelf: 'center', backgroundColor: '#ef4444', padding: 15, borderRadius: 30 }
});
