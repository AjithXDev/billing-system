import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, 
  StatusBar, TextInput, ScrollView, Dimensions, Alert, RefreshControl,
  SafeAreaView
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  LayoutGrid,
  Zap,
  Clock,
  Package,
  History,
  LogOut,
  ScanLine,
  AlertTriangle
} from 'lucide-react-native';

const THEME = {
  bg: '#0f172a',
  card: '#1e293b',
  primary: '#38bdf8',
  secondary: '#818cf8',
  text: '#f8fafc',
  muted: '#94a3b8',
  danger: '#f43f5e',
  warning: '#fbbf24',
  success: '#10b981'
};

const STORAGE_KEY = '@shop_tunnel_url';

export default function App() {
  const [activeTab, setActiveTab] = useState('insights');
  const [stats, setStats] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  // 🟢 Load Saved URL on Start
  useEffect(() => {
    const loadUrl = async () => {
      try {
        const savedUrl = await AsyncStorage.getItem(STORAGE_KEY);
        if (savedUrl) setUrl(savedUrl);
      } catch (e) {}
    };
    loadUrl();
  }, []);

  // 🟢 Fetch Data helper
  const fetchAllData = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      const sResp = await fetch(`${url}/api/stats`, { 
        headers: { 'Bypass-Tunnel-Reminder': 'true', 'Accept': 'application/json' } 
      });
      
      const contentType = sResp.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
         throw new Error("Invalid response. Reconnect tunnel.");
      }

      const sData = await sResp.json();
      setStats(sData);

      const iResp = await fetch(`${url}/api/invoices`, { 
        headers: { 'Bypass-Tunnel-Reminder': 'true', 'Accept': 'application/json' } 
      });
      if (iResp.ok) {
        const iData = await iResp.json();
        setInvoices(iData);
      }
    } catch (e) {
      console.warn("Fetch Error:", e);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (url) {
      fetchAllData();
      AsyncStorage.setItem(STORAGE_KEY, url);
    }
  }, [url, fetchAllData]);

  // 🟢 Handle QR Scan
  const handleBarCodeScanned = ({ data }) => {
    if (data.startsWith('http')) {
      const cleanUrl = data.trim();
      setUrl(cleanUrl);
      setIsScanning(false);
      Alert.alert("Success", "Shop connected via QR code!");
    } else {
      Alert.alert("Invalid QR", "The scanned QR does not contain a valid tunnel URL.");
    }
  };

  if (isScanning) {
    if (!permission) return <View style={styles.center}><ActivityIndicator color={THEME.primary} /></View>;
    if (!permission.granted) {
      return (
        <View style={styles.center}>
          <Text style={{ color: 'white', textAlign: 'center', marginBottom: 20 }}>Camera access is needed to scan the QR.</Text>
          <TouchableOpacity onPress={requestPermission} style={styles.entryBtn}>
            <Text style={styles.entryBtnText}>Enable Camera</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.scannerContainer}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          onBarcodeScanned={handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
        <View style={styles.overlay}>
           <View style={styles.scanFrame} />
           <Text style={styles.scanText}>Aim at Desktop Settings QR</Text>
           <TouchableOpacity onPress={() => setIsScanning(false)} style={styles.cancelBtn}>
              <Text style={{ color: 'white', fontWeight: 'bold' }}>Cancel</Text>
           </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!url) {
    return (
      <View style={[styles.center, { backgroundColor: THEME.bg }]}>
        <StatusBar barStyle="light-content" />
        <Zap size={60} color={THEME.primary} style={{ marginBottom: 20 }} />
        <Text style={styles.entryTitle}>Owner Dashboard</Text>
        <Text style={{ color: THEME.muted, marginBottom: 30, textAlign: 'center' }}>Hyper-Fast Shop Monitoring</Text>
        
        <TouchableOpacity style={styles.entryBtn} onPress={() => setIsScanning(true)}>
          <ScanLine size={24} color={THEME.bg} style={{ marginRight: 10 }} />
          <Text style={styles.entryBtnText}>SCAN QR TO START</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 25, width: '100%' }}>
           <View style={{ flex: 1, height: 1, backgroundColor: THEME.card }} />
           <Text style={{ color: THEME.muted, marginHorizontal: 15 }}>OR MANUALLY</Text>
           <View style={{ flex: 1, height: 1, backgroundColor: THEME.card }} />
        </View>

        <TextInput 
          style={styles.entryInput}
          placeholder="Paste Tunnel URL..."
          placeholderTextColor={THEME.muted}
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
    );
  }

  const renderInsights = () => (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchAllData} tintColor={THEME.primary} />}
    >
      <View style={styles.headerArea}>
        <Text style={styles.welcome}>Live Analytics</Text>
        <Text style={styles.subWelcome}>Your metrics are looking good!</Text>
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>TODAY'S REVENUE</Text>
        <Text style={styles.heroValue}>₹{stats?.todaySales?.toLocaleString() || '0'}</Text>
        <View style={styles.heroFooter}>
          <Text style={styles.heroSub}>{stats?.todayBills || 0} Bills Generated</Text>
          <View style={styles.badge}><Text style={styles.badgeText}>TRENDING UP</Text></View>
        </View>
      </View>

      <View style={styles.grid}>
        <View style={styles.gridItem}>
           <Clock size={20} color={THEME.muted} />
           <Text style={styles.gridLabel}>PEAK HOUR</Text>
           <Text style={styles.gridValue}>{stats?.peakHours?.[0]?.hour || 'N'}:00</Text>
        </View>
        <View style={styles.gridItem}>
           <Package size={20} color={THEME.muted} />
           <Text style={styles.gridLabel}>LOW STOCK</Text>
           <Text style={[styles.gridValue, { color: (stats?.lowStockCount || 0) > 0 ? THEME.danger : THEME.text }]}>{stats?.lowStockCount || 0} Items</Text>
        </View>
      </View>

      <Text style={styles.sectionHeader}>MOST SOLD (30D)</Text>
      <View style={styles.listCard}>
        {(stats?.topSelling || []).slice(0, 3).map((p, i) => (
          <View key={i} style={styles.listItem}>
            <Text style={styles.listItemName} numberOfLines={1}>{p.name || 'Unknown'}</Text>
            <Text style={styles.listItemValue}>{p.total_sold || 0} Sold</Text>
          </View>
        ))}
        {(stats?.topSelling || []).length === 0 && <Text style={{ color: THEME.muted, padding: 10 }}>No sales yet.</Text>}
      </View>

      <Text style={styles.sectionHeader}>DASHBOARD ALERTS</Text>
      <View style={[styles.alertCard, { backgroundColor: (stats?.lowStockCount || 0) > 0 ? '#fef2f2' : '#f0fdf4' }]}>
         <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            { (stats?.lowStockCount || 0) > 0 ? <AlertTriangle color={THEME.danger} size={24} /> : <Zap color={THEME.success} size={24} /> }
            <Text style={{ fontWeight: 'bold', color: (stats?.lowStockCount || 0) > 0 ? THEME.danger : THEME.success, fontSize: 16 }}>
               {(stats?.lowStockCount || 0) > 0 ? 'RESTOCK ITEMS' : 'SYSTEM HEALTHY'}
            </Text>
         </View>
         <Text style={{ color: THEME.muted, marginTop: 5 }}>
            {(stats?.lowStockCount || 0) > 0 ? `${stats.lowStockCount} items are running low. Check Master Inventory.` : 'Your shop is performing optimally.'}
         </Text>
      </View>
      <View style={{ height: 100 }} />
    </ScrollView>
  );

  const renderLive = () => (
    <ScrollView style={styles.container}>
      <Text style={styles.welcome}>Live Feed</Text>
      <Text style={styles.subWelcome}>All recent transactions</Text>
      <View style={{ marginTop: 20 }}>
        {invoices.map((inv, i) => (
          <View key={i} style={styles.invoiceItem}>
             <View style={{ flex: 1 }}>
                <Text style={styles.invNo}>#{inv.bill_no}</Text>
                <Text style={styles.invCust} numberOfLines={1}>{inv.customer_name || 'Walk-in Customer'}</Text>
             </View>
             <Text style={styles.invAmt}>₹{inv.total_amount}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.main}>
      <StatusBar barStyle="light-content" />
      {activeTab === 'insights' ? renderInsights() : activeTab === 'live' ? renderLive() : (
        <View style={styles.center}>
           <LogOut size={50} color={THEME.danger} />
           <Text style={[styles.entryTitle, { marginTop: 20 }]}>Sign Out?</Text>
           <TouchableOpacity 
             style={[styles.entryBtn, { backgroundColor: THEME.danger }]} 
             onPress={async () => {
                await AsyncStorage.removeItem(STORAGE_KEY);
                setUrl('');
                setActiveTab('insights');
             }}
           >
              <Text style={styles.entryBtnText}>Unlink Device</Text>
           </TouchableOpacity>
        </View>
      )}

      <View style={styles.nav}>
         <TouchableOpacity onPress={() => setActiveTab('insights')} style={styles.navItem}>
            <LayoutGrid color={activeTab === 'insights' ? THEME.primary : THEME.muted} />
            <Text style={[styles.navText, activeTab === 'insights' && { color: THEME.primary }]}>Insights</Text>
         </TouchableOpacity>
         <TouchableOpacity onPress={() => setActiveTab('live')} style={styles.navItem}>
            <History color={activeTab === 'live' ? THEME.primary : THEME.muted} />
            <Text style={[styles.navText, activeTab === 'live' && { color: THEME.primary }]}>Live</Text>
         </TouchableOpacity>
         <TouchableOpacity onPress={() => setActiveTab('unlink')} style={styles.navItem}>
            <LogOut color={activeTab === 'unlink' ? THEME.primary : THEME.muted} />
            <Text style={[styles.navText, activeTab === 'unlink' && { color: THEME.primary }]}>Unlink</Text>
         </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  main: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, backgroundColor: THEME.bg },
  container: { flex: 1, padding: 20 },
  entryTitle: { fontSize: 32, fontWeight: 'bold', color: THEME.text, marginBottom: 10 },
  entryInput: { width: '100%', height: 60, backgroundColor: THEME.card, borderRadius: 15, padding: 15, color: THEME.text, fontSize: 13, marginBottom: 20, textAlign: 'center' },
  entryBtn: { backgroundColor: THEME.primary, width: '100%', height: 60, borderRadius: 15, justifyContent: 'center', alignItems: 'center', flexDirection: 'row' },
  entryBtnText: { color: THEME.bg, fontWeight: 'bold', fontSize: 18 },
  headerArea: { marginBottom: 25 },
  welcome: { fontSize: 32, fontWeight: '800', color: THEME.text },
  subWelcome: { fontSize: 16, color: THEME.muted },
  heroCard: { backgroundColor: THEME.card, padding: 25, borderRadius: 25, borderBottomWidth: 4, borderBottomColor: THEME.secondary },
  heroLabel: { color: THEME.muted, fontSize: 12, fontWeight: 'bold', letterSpacing: 1.5 },
  heroValue: { color: THEME.text, fontSize: 44, fontWeight: '900', marginVertical: 10 },
  heroFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroSub: { color: THEME.muted },
  badge: { backgroundColor: '#10b98120', padding: 5, borderRadius: 8 },
  badgeText: { color: THEME.success, fontSize: 10, fontWeight: 'bold' },
  grid: { flexDirection: 'row', gap: 15, marginTop: 20 },
  gridItem: { flex: 1, backgroundColor: '#1e293b', padding: 20, borderRadius: 20, gap: 10 },
  gridLabel: { color: THEME.muted, fontSize: 10, fontWeight: 'bold' },
  gridValue: { color: THEME.text, fontSize: 24, fontWeight: 'bold' },
  sectionHeader: { fontSize: 12, fontWeight: 'bold', color: THEME.muted, marginTop: 30, marginBottom: 15, letterSpacing: 1 },
  listCard: { backgroundColor: THEME.card, borderRadius: 20, padding: 10 },
  listItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderBottomWidth: 1, borderBottomColor: '#ffffff05' },
  listItemName: { color: THEME.text, fontSize: 16, fontWeight: '600', flex: 1 },
  listItemValue: { color: THEME.secondary, fontWeight: 'bold' },
  alertCard: { padding: 20, borderRadius: 20 },
  nav: { flexDirection: 'row', backgroundColor: THEME.card, height: 80, borderTopWidth: 1, borderTopColor: '#ffffff05' },
  navItem: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  navText: { fontSize: 11, color: THEME.muted, marginTop: 4 },
  invoiceItem: { backgroundColor: THEME.card, padding: 15, borderRadius: 15, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 15 },
  invNo: { color: THEME.primary, fontWeight: 'bold' },
  invCust: { color: THEME.text, fontSize: 14 },
  invAmt: { color: THEME.text, fontWeight: 'bold', fontSize: 18 },
  scannerContainer: { flex: 1, backgroundColor: 'black' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 250, height: 250, borderWidth: 2, borderColor: THEME.primary, borderRadius: 20, borderStyle: 'dashed' },
  scanText: { color: 'white', marginTop: 20, fontSize: 18, fontWeight: 'bold' },
  cancelBtn: { position: 'absolute', bottom: 50, padding: 15, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10 }
});
