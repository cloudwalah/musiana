import { router } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { View, TextInput, Text, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, ScrollView, Platform, ActivityIndicator, Modal, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/services/api';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Custom feedback modal states
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackIsError, setFeedbackIsError] = useState(false);

  const showFeedback = (title: string, message: string, isError = false) => {
    setFeedbackTitle(title);
    setFeedbackMessage(message);
    setFeedbackIsError(isError);
    setShowFeedbackModal(true);
  };

  useEffect(() => {
    checkExistingAuth();
  }, []);

  const checkExistingAuth = async () => {
    try {
      const token = await api.getToken();
      const userData = await api.getUser();
      if (token && userData) {
        console.log('🔑 Valid session found, auto-logging in...');
        router.replace('/home');
      } else {
        setCheckingAuth(false);
      }
    } catch (e) {
      console.log('Error checking existing auth:', e);
      setCheckingAuth(false);
    }
  };

  const handleLogin = async () => {
    if (!username || !password) {
      showFeedback('Error', 'Please fill all fields', true);
      return;
    }

    setLoading(true);
    try {
      const response = await api.login(username, password);
      console.log('📦 Full response:', response);
      
      // Backend returns 'accessToken', not 'token'
      if (response.accessToken) {
        await api.saveToken(response.accessToken);
      }
      
      // Save user data if available
      if (response.user) {
        await api.saveUser(response.user);
      }
      
      // Navigate to home screen
      router.replace('/home');
      
    } catch (error: any) {
      console.log('❌ Login Error:', error);
      showFeedback('Error', error.response?.data?.message || 'Login failed', true);
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <View style={{ flex: 1, backgroundColor: '#130D22', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoContainer}>
          <Ionicons name="musical-notes" size={70} color="#8B5CF6" style={styles.logoIcon} />
          <Text style={styles.logoText}>MUSIANA</Text>
        </View>
        
        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor="#7C7899"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        
        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Password"
            placeholderTextColor="#7C7899"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />
          <TouchableOpacity 
            style={styles.eyeButton}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Ionicons 
              name={showPassword ? 'eye-off-outline' : 'eye-outline'} 
              size={22} 
              color="#7C7899" 
            />
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity 
          style={styles.forgotContainer} 
          onPress={() => router.push('/forgot-password')}
        >
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.button} 
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Loading...' : 'Login'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity onPress={() => router.push('/register')}>
          <Text style={styles.link}>Don&apos;t have an account? Register</Text>
        </TouchableOpacity>

        {/* Custom Feedback Modal */}
        <Modal
          visible={showFeedbackModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowFeedbackModal(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowFeedbackModal(false)}
          >
            <TouchableWithoutFeedback>
              <View style={styles.feedbackModalContainer}>
                <Ionicons
                  name={feedbackIsError ? 'alert-circle' : 'checkmark-circle'}
                  size={48}
                  color={feedbackIsError ? '#FF3B30' : '#34C759'}
                  style={{ marginBottom: 12 }}
                />
                <Text style={styles.feedbackModalTitle}>{feedbackTitle}</Text>
                <Text style={styles.feedbackModalMessage}>{feedbackMessage}</Text>
                <TouchableOpacity
                  style={[styles.feedbackModalBtn, feedbackIsError && { backgroundColor: '#FF3B30' }]}
                  onPress={() => setShowFeedbackModal(false)}
                >
                  <Text style={styles.feedbackModalBtnText}>OK</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </TouchableOpacity>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#130D22',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingTop: 80,
    paddingBottom: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 50,
  },
  logoIcon: {
    textShadowColor: 'rgba(139, 92, 246, 0.3)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
  },
  logoText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 4,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#1C1330',
    borderWidth: 1,
    borderColor: '#332354',
    padding: 16,
    marginBottom: 16,
    borderRadius: 12,
    fontSize: 16,
    color: '#FFFFFF',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1330',
    borderWidth: 1,
    borderColor: '#332354',
    borderRadius: 12,
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: '#FFFFFF',
  },
  eyeButton: {
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  forgotContainer: {
    alignSelf: 'flex-end',
    marginBottom: 24,
  },
  forgotText: {
    color: '#BDB4FF',
    fontSize: 14,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#8B5CF6',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
  },
  link: {
    color: '#BDB4FF',
    textAlign: 'center',
    marginTop: 24,
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedbackModalContainer: {
    width: '80%',
    backgroundColor: '#1C1330',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#332354',
    alignItems: 'center',
  },
  feedbackModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  feedbackModalMessage: {
    fontSize: 14,
    color: '#BDB4FF',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  feedbackModalBtn: {
    backgroundColor: '#8B5CF6',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  feedbackModalBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});