import React, { useState, useRef } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, StatusBar, KeyboardAvoidingView, Platform, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

// Only import WebView on native platforms (it crashes on web)
let WebView = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

function OwnerApp() {
  const [serverUrl, setServerUrl] = useState('http://10.85.105.219:4567');
  const [isConnected, setIsConnected] = useState(false);
  const [webError, setWebError] = useState(false);
  const webviewRef = useRef(null);

  // ── SETUP SCREEN (All Platforms) ──────────────────────────
  if (!isConnected) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#06060a" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.setupContainer}>
          <View style={styles.logoWrap}>
            <Text style={styles.logoText}>🛡️</Text>
          </View>
          <Text style={styles.title}>iVA Owner App</Text>
          <Text style={styles.subtitle}>
            Enter your Desktop POS IP address to connect.{'\n'}
            Find it via "ipconfig" on your computer.
          </Text>
          <TextInput 
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="http://10.85.105.219:4567"
            placeholderTextColor="#555"
            autoCapitalize="none"
            keyboardType="url"
            selectTextOnFocus={true}
          />
          <TouchableOpacity style={styles.button} onPress={() => {
            const url = serverUrl.trim();
            if (!url || url.includes('X') || url.includes('x:')) {
              Alert.alert('Invalid IP', 'Please replace the placeholder with your actual computer IP address.');
              return;
            }
            setWebError(false);
            setIsConnected(true);
          }}>
            <Text style={styles.buttonText}>CONNECT TO SERVER</Text>
          </TouchableOpacity>
          <Text style={styles.helpText}>
            Both devices must be on the same WiFi network
          </Text>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── WEB PLATFORM: Use iframe ─────────────────────────────
  if (Platform.OS === 'web') {
    return (
      <View style={styles.webviewContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#06060a" />
        <View style={styles.webTopBar}>
          <Text style={styles.webTopBarText}>📡 Connected to: {serverUrl}</Text>
          <TouchableOpacity onPress={() => setIsConnected(false)}>
            <Text style={styles.webDisconnectBtn}>Disconnect</Text>
          </TouchableOpacity>
        </View>
        {React.createElement('iframe', {
          src: serverUrl,
          style: { width: '100%', height: '100%', flex: 1, border: 'none', backgroundColor: '#06060a' },
          title: 'Owner Dashboard'
        })}
      </View>
    );
  }

  // ── NATIVE (Android/iOS): Use WebView ────────────────────
  if (webError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#06060a" />
        <View style={styles.errorContainer}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔌</Text>
          <Text style={styles.errorTitle}>Connection Failed</Text>
          <Text style={styles.errorText}>Could not reach server at:{'\n'}{serverUrl}</Text>
          <Text style={styles.errorSub}>Make sure your computer is running the POS app and both devices are on the same WiFi.</Text>
          <TouchableOpacity style={[styles.button, { marginTop: 24 }]} onPress={() => {
            setWebError(false);
            setIsConnected(false);
          }}>
            <Text style={styles.buttonText}>CHANGE IP ADDRESS</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.retryButton, { marginTop: 12 }]} onPress={() => {
            setWebError(false);
          }}>
            <Text style={styles.retryButtonText}>RETRY CONNECTION</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.webviewContainer} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#06060a" />
      {WebView && (
        <WebView 
          ref={webviewRef}
          source={{ uri: serverUrl }} 
          style={{ flex: 1, backgroundColor: '#06060a' }}
          bounces={false}
          overScrollMode="never"
          originWhitelist={['*']}
          allowsInlineMediaPlayback={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6366f1" />
              <Text style={styles.loadingText}>Connecting to Server...</Text>
              <Text style={styles.loadingSubText}>Make sure your POS app is running on the computer</Text>
            </View>
          )}
          onError={(syntheticEvent) => {
            console.log('WebView error:', syntheticEvent.nativeEvent);
            setWebError(true);
          }}
          onHttpError={(syntheticEvent) => {
            const { statusCode } = syntheticEvent.nativeEvent;
            console.log('HTTP error:', statusCode);
            if (statusCode >= 400) setWebError(true);
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ── WRAP WITH PROVIDER (required for SafeAreaView) ─────────
export default function App() {
  return (
    <SafeAreaProvider>
      <OwnerApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06060a' },
  webviewContainer: { flex: 1, backgroundColor: '#06060a' },
  setupContainer: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#06060a' },
  
  logoWrap: { alignItems: 'center', marginBottom: 16 },
  logoText: { fontSize: 48 },
  
  title: { color: 'white', fontSize: 28, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  subtitle: { color: '#888', fontSize: 14, marginBottom: 32, textAlign: 'center', lineHeight: 22 },
  helpText: { color: '#555', fontSize: 12, textAlign: 'center', marginTop: 16 },
  
  input: { 
    backgroundColor: '#111119', color: 'white', fontSize: 16, 
    padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#333', 
    marginBottom: 24 
  },
  
  button: { backgroundColor: '#6366f1', padding: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: 'white', fontSize: 16, fontWeight: 'bold', letterSpacing: 0.5 },
  
  retryButton: { 
    backgroundColor: 'transparent', padding: 16, borderRadius: 12, 
    alignItems: 'center', borderWidth: 1, borderColor: '#333' 
  },
  retryButtonText: { color: '#888', fontSize: 14, fontWeight: '600' },

  // Web platform top bar
  webTopBar: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#0d0d14',
    borderBottomWidth: 1, borderBottomColor: '#1a1a24'
  },
  webTopBarText: { color: '#888', fontSize: 12 },
  webDisconnectBtn: { color: '#6366f1', fontSize: 12, fontWeight: '700' },

  // Error screen
  errorContainer: { 
    flex: 1, backgroundColor: '#06060a', justifyContent: 'center', 
    alignItems: 'center', padding: 24 
  },
  errorTitle: { color: '#ef4444', fontSize: 24, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  errorText: { color: 'white', fontSize: 16, marginBottom: 12, textAlign: 'center' },
  errorSub: { color: '#888', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  
  // Loading screen
  loadingContainer: { 
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
    backgroundColor: '#06060a', justifyContent: 'center', alignItems: 'center', zIndex: 50 
  },
  loadingText: { color: 'white', fontSize: 18, marginTop: 16, fontWeight: '600' },
  loadingSubText: { color: '#888', fontSize: 12, marginTop: 8, textAlign: 'center' },
});
