import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, SafeAreaView, StatusBar, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { WebView } from 'react-native-webview';

export default function App() {
  const [serverUrl, setServerUrl] = useState('http://10.85.105.219:4567');
  const [isConnected, setIsConnected] = useState(true);

  if (!isConnected) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#06060a" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.setupContainer}>
          <Text style={styles.title}>iVA Owner App</Text>
          <Text style={styles.subtitle}>Enter your Desktop Server IP to connect securely over your network.</Text>
          <TextInput 
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="http://10.85.105.219:4567"
            placeholderTextColor="#666"
            autoCapitalize="none"
            keyboardType="url"
          />
          <TouchableOpacity style={styles.button} onPress={() => setIsConnected(true)}>
            <Text style={styles.buttonText}>CONNECT SERVER</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.webviewContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#06060a" />
        <iframe 
          src={serverUrl} 
          style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#06060a' }}
          title="Owner Dashboard"
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.webviewContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#06060a" />
      <WebView 
        source={{ uri: serverUrl }} 
        style={{ flex: 1, backgroundColor: '#06060a' }}
        bounces={false}
        overScrollMode="never"
        renderError={(e) => {
           return (
             <View style={styles.errorContainer}>
               <Text style={styles.errorTitle}>Connection Failed</Text>
               <Text style={styles.errorText}>Could not reach the server at:{'\n'}{serverUrl}</Text>
               <Text style={styles.errorSub}>Please make sure your computer is turned on and running the POS system.</Text>
               <TouchableOpacity style={[styles.button, {marginTop: 20}]} onPress={() => setIsConnected(false)}>
                 <Text style={styles.buttonText}>CHANGE IP ADDRESS</Text>
               </TouchableOpacity>
             </View>
           );
        }}
        onError={() => setIsConnected(false)} // If it completely fails, go back to IP screen
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#06060a' },
  webviewContainer: { flex: 1, backgroundColor: '#06060a' },
  setupContainer: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#06060a' },
  title: { color: 'white', fontSize: 28, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  subtitle: { color: '#888', fontSize: 14, marginBottom: 32, textAlign: 'center', lineHeight: 22 },
  input: { backgroundColor: '#111119', color: 'white', fontSize: 16, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#333', marginBottom: 24 },
  button: { backgroundColor: '#6366f1', padding: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  errorContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#06060a', justifyContent: 'center', padding: 24, zIndex: 100 },
  errorTitle: { color: '#ef4444', fontSize: 24, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  errorText: { color: 'white', fontSize: 16, marginBottom: 12, textAlign: 'center' },
  errorSub: { color: '#888', fontSize: 14, textAlign: 'center' }
});
