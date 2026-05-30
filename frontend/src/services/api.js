import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Backend URL — switches between local dev and production
const API_URL = 'http://192.168.29.92:3000/api';  // ✅ Local physical device (dev only)
// const API_URL = 'https://musiana-1e9c.onrender.com/api';  // Production (Render)

export const api = {
  // Register new user
  register: async (userName, email, password, role = 'user') => {
    console.log('🚀 Attempting registration...');
    console.log('📍 API URL:', `${API_URL}/users/register`);
    console.log('📦 Sending data:', { username: userName, email, role });
    
    const response = await axios.post(`${API_URL}/users/register`, {
      username: userName,  // Backend expects 'username' not 'userName'
      email,
      password,
      role
    });
    
    console.log('✅ Registration response:', response.data);
    return response.data;
  },

  // Login user
  login: async (username, password) => {
    console.log('🚀 Attempting login...');
    console.log('📍 API URL:', `${API_URL}/users/login`);
    console.log('👤 Username:', username);
    
    const response = await axios.post(`${API_URL}/users/login`, {
      username,
      password
    });
    
    console.log('✅ Login response:', response.data);
    return response.data;
  },

  // Fetch all music (requires authentication)
  fetchMusic: async () => {
    const token = await AsyncStorage.getItem('token');
    
    console.log('🚀 Fetching music...');
    console.log('📍 API URL:', `${API_URL}/fetch/music`);
    console.log('🔑 Token:', token ? 'Present' : 'Missing');
    
    const response = await axios.get(`${API_URL}/fetch/music`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Music fetched:', response.data);
    return response.data;
  },

  // Search music by query (requires authentication)
  searchMusic: async (query) => {
    const token = await AsyncStorage.getItem('token');
    
    console.log('🚀 Searching music...');
    console.log('📍 API URL:', `${API_URL}/search`);
    console.log('🔑 Token:', token ? 'Present' : 'Missing');
    
    const response = await axios.get(`${API_URL}/search`, {
      params: { q: query },
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Search response:', response.data);
    return response.data;
  },

  // Get stored token
  getToken: async () => {
    return await AsyncStorage.getItem('token');
  },

  // Save token
  saveToken: async (token) => {
    await AsyncStorage.setItem('token', token);
  },

  // Save user data
  saveUser: async (user) => {
    await AsyncStorage.setItem('user', JSON.stringify(user));
  },

  // Get user data
  getUser: async () => {
    const user = await AsyncStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  // Forgot password reset
  forgotPassword: async (username, email, newPassword) => {
    console.log('🚀 Attempting password reset...');
    console.log('📍 API URL:', `${API_URL}/users/forgot-password`);
    
    const response = await axios.post(`${API_URL}/users/forgot-password`, {
      username,
      email,
      newPassword
    });
    
    console.log('✅ Forgot password response:', response.data);
    return response.data;
  },

  // Change password (requires auth token)
  changePassword: async (oldPassword, newPassword) => {
    const token = await AsyncStorage.getItem('token');
    console.log('🚀 Attempting password change...');
    console.log('📍 API URL:', `${API_URL}/users/change-password`);
    console.log('🔑 Token:', token ? 'Present' : 'Missing');

    const response = await axios.post(`${API_URL}/users/change-password`, {
      oldPassword,
      newPassword
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('✅ Password changed response:', response.data);
    return response.data;
  },

  // Clear auth data (logout)
  clearAuth: async () => {
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('user');
  },

  // Get all users (Admin only)
  getAllUsers: async () => {
    const token = await AsyncStorage.getItem('token');
    console.log('🚀 Admin: Fetching all users...');
    
    const response = await axios.get(`${API_URL}/users`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    return response.data;
  },

  // Promote a user to admin (Admin only)
  promoteUser: async (userId) => {
    const token = await AsyncStorage.getItem('token');
    console.log(`🚀 Admin: Promoting user ${userId} to admin...`);
    
    const response = await axios.put(`${API_URL}/users/${userId}/promote`, {}, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    return response.data;
  }
};
