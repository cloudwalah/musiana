import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'http://192.168.29.92:3000/api';  // Local backend for Expo Go development
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
  searchMusic: async (query, type = 'songs') => {
    const token = await AsyncStorage.getItem('token');
    
    console.log('🚀 Searching music...');
    console.log('📍 API URL:', `${API_URL}/search`);
    console.log('🔑 Token:', token ? 'Present' : 'Missing');
    
    const response = await axios.get(`${API_URL}/search`, {
      params: { q: query, type },
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Search response:', response.data);
    return response.data;
  },

  // Fetch all playlists owned by user
  fetchPlaylists: async () => {
    const token = await AsyncStorage.getItem('token');
    const response = await axios.get(`${API_URL}/playlists`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data;
  },

  // Create custom playlist
  createPlaylist: async (name, tags = '', isPrivate = true) => {
    const token = await AsyncStorage.getItem('token');
    
    const tagsArray = typeof tags === 'string'
      ? tags.split(',').map(t => t.trim()).filter(Boolean)
      : tags;

    const response = await axios.post(`${API_URL}/playlists`, {
      name,
      tags: tagsArray,
      isPrivate
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data;
  },

  // Delete custom playlist
  deletePlaylist: async (playlistId) => {
    const token = await AsyncStorage.getItem('token');
    const response = await axios.delete(`${API_URL}/playlists/${playlistId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data;
  },

  // Update playlist properties (name, tags, isPrivate)
  updatePlaylist: async (playlistId, updates) => {
    const token = await AsyncStorage.getItem('token');
    const response = await axios.patch(`${API_URL}/playlists/${playlistId}`, updates, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data;
  },

  // Add song to playlist
  addSongToPlaylist: async (playlistId, songId) => {
    const token = await AsyncStorage.getItem('token');
    const response = await axios.post(`${API_URL}/playlists/${playlistId}/songs`, {
      songId
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data;
  },

  // Remove song from playlist
  removeSongFromPlaylist: async (playlistId, songId) => {
    const token = await AsyncStorage.getItem('token');
    const response = await axios.delete(`${API_URL}/playlists/${playlistId}/songs/${songId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data;
  },

  // Toggle like song
  toggleLikeSong: async (songId) => {
    const token = await AsyncStorage.getItem('token');
    const response = await axios.post(`${API_URL}/playlists/like/${songId}`, {}, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data;
  },

  // Check if song is liked
  checkSongLiked: async (songId) => {
    const token = await AsyncStorage.getItem('token');
    const response = await axios.get(`${API_URL}/playlists/like/${songId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
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
  },

  // Demote an admin to user (Admin/Super-Admin only)
  demoteUser: async (userId) => {
    const token = await AsyncStorage.getItem('token');
    console.log(`🚀 Admin: Demoting user ${userId} to user...`);
    
    const response = await axios.put(`${API_URL}/users/${userId}/demote`, {}, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    return response.data;
  },

  // Delete a song from the database and storage entirely (Admin only)
  deleteSong: async (songId) => {
    const token = await AsyncStorage.getItem('token');
    console.log(`🚀 Admin: Deleting song ${songId}...`);
    
    const response = await axios.delete(`${API_URL}/upload/delete/${songId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    return response.data;
  },

  // Trim a song between startTime and endTime (Admin only)
  trimMusic: async (musicId, startTime, endTime) => {
    const token = await AsyncStorage.getItem('token');
    console.log(`🚀 Admin: Trimming song ${musicId} from ${startTime}s to ${endTime}s...`);
    
    const response = await axios.post(`${API_URL}/upload/trim/${musicId}`, {
      startTime: parseFloat(startTime),
      endTime: parseFloat(endTime)
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    return response.data;
  },

  // Expose API URL helper for file downloads
  getApiUrl: () => API_URL
};
