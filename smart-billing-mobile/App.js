import React, { useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, StatusBar } from 'react-native';
import { WebView } from 'react-native-webview';

const TUNNEL_URL = "https://innoaivators-dashboard.loca.lt";

export default function App() {
  const [hasStarted, setHasStarted] = useState(false);
  const [loading, setLoading] = useState(true);

  if (!hasStarted) {
    return (
      <View style={styles.startScreen}>
        <StatusBar barStyle="light-content" backgroundColor="#1e1e2d" />
        <View style={styles.logoContainer}>
          <Text style={styles.brandTitle}><Text style={{color: '#6366f1'}}>iVA</Text> SmartBill</Text>
          <Text style={styles.brandSub}>INNOAIVATORS TECHNOLOGIES</Text>
        </View>
        
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>Connecting securely to your Shop's PC via Cloud Tunnel...</Text>
        </View>

        <TouchableOpacity style={styles.btn} onPress={() => setHasStarted(true)}>
          <Text style={styles.btnText}>CONNECT DASHBOARD</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1d27" />
      
      <WebView 
        source={{ 
          uri: TUNNEL_URL,
          headers: {
            // 🔥 This is the magic! It tells Localtunnel we are a real app,
            // so it skips the 503 "Click here to continue" warning screen completely!
            'Bypass-Tunnel-Reminder': 'true'
          }
        }}
        style={styles.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        javaScriptEnabled={true}
        domStorageEnabled={true}
      />

      {loading && (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loaderText}>Syncing Data...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1d27', // Matches web dark theme
  },
  webview: {
    flex: 1,
    backgroundColor: '#1a1d27',
  },
  loaderContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1d27',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10
  },
  loaderText: {
    color: '#94a3b8',
    marginTop: 12,
    fontWeight: '600'
  },
  // Start Screen Styles
  startScreen: {
    flex: 1,
    backgroundColor: '#1e1e2d',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.5
  },
  brandSub: {
    fontSize: 10,
    color: '#94a3b8',
    letterSpacing: 2,
    marginTop: 4
  },
  infoBox: {
    backgroundColor: '#2a2a3c',
    padding: 20,
    borderRadius: 12,
    marginBottom: 40,
    width: '100%',
    borderWidth: 1,
    borderColor: '#3f3f5a'
  },
  infoText: {
    color: '#cbd5e1',
    lineHeight: 22,
    textAlign: 'center'
  },
  btn: {
    backgroundColor: '#6366f1',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    width: '100%',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5
  },
  btnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: 1
  }
});
