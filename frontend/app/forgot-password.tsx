import { router } from 'expo-router';
import React, { useState } from 'react';
import { View, TextInput, Text, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, ScrollView, Platform, Modal, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/services/api';

export default function ForgotPasswordScreen() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

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

  const handleReset = async () => {
    if (!username || !email || !newPassword || !confirmPassword) {
      showFeedback('Error', 'Please fill all fields', true);
      return;
    }

    if (newPassword !== confirmPassword) {
      showFeedback('Error', 'New passwords do not match', true);
      return;
    }

    setLoading(true);
    try {
      const response = await api.forgotPassword(username, email, newPassword);
      showFeedback('Success', response.message || 'Password reset successful!');
      setTimeout(() => {
        router.back();
      }, 1500);
    } catch (error: any) {
      console.log('❌ Password Reset Error:', error);
      showFeedback('Reset Failed', error.response?.data?.message || 'Password reset failed', true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
        
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#7C7899"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
        />
        
        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="New Password"
            placeholderTextColor="#7C7899"
            value={newPassword}
            onChangeText={setNewPassword}
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

        <View style={styles.passwordContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Confirm New Password"
            placeholderTextColor="#7C7899"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
          />
        </View>
        
        <TouchableOpacity 
          style={styles.button} 
          onPress={handleReset}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Loading...' : 'Reset Password'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>Back to Login</Text>
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
    marginBottom: 45,
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
    marginBottom: 16,
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
