import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Alert, TouchableOpacity, TextInput, Dimensions, Image } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/services/api';
import { useAudio, Music } from '../src/context/AudioContext';
import Slider from '@react-native-community/slider';

const { width } = Dimensions.get('window');
const GRID_ITEM_WIDTH = (width - 30) / 2;

type TabType = 'songs' | 'profile';

export default function HomeScreen() {
  const [musicList, setMusicList] = useState<Music[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Navigation & UI States
  const [activeTab, setActiveTab] = useState<TabType>('songs');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  // Auto-Downloader Search States
  const [searchLoading, setSearchLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState('');
  const [pollingIntervalId, setPollingIntervalId] = useState<any>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);
  
  // Profile & User States
  const [user, setUser] = useState<{ username: string; email: string; role?: string } | null>(null);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showProfilePassword, setShowProfilePassword] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Admin User Management States
  const [allUsers, setAllUsers] = useState<{ _id: string; username: string; email: string; role: string }[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // Consume audio playback controls and states from global context
  const { 
    currentlyPlaying, 
    isPlaying, 
    play, 
    pause, 
    resume,
    seek,
    position,
    duration,
    setMusicList: setContextMusicList
  } = useAudio();

  useEffect(() => {
    fetchMusic();
    loadUser();
  }, []);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
      }
    };
  }, [pollingIntervalId]);

  const stopPolling = () => {
    if (pollingIntervalId) {
      clearInterval(pollingIntervalId);
      setPollingIntervalId(null);
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    handleCancelSearch();
  };

  const startPolling = (query: string) => {
    const intervalId = setInterval(async () => {
      try {
        console.log(`⏳ Polling search for: "${query}"...`);
        const response = await api.searchMusic(query);
        if (response.success && !response.downloading) {
          console.log(`✅ Polling complete! Song downloaded.`);
          clearInterval(intervalId);
          setPollingIntervalId(null);
          
          setIsDownloading(false);
          setSearchLoading(false);
          setIsUnavailable(false);
          
          // Refresh general library
          fetchMusic();
        } else if (response.success && response.downloading) {
          if (response.message) {
            setDownloadMessage(response.message);
          }
        } else {
          console.log(`❌ Download failed for: "${query}"`);
          clearInterval(intervalId);
          setPollingIntervalId(null);
          setIsDownloading(false);
          setSearchLoading(false);
          setIsUnavailable(true);
        }
      } catch (err) {
        console.log('Error during search polling:', err);
      }
    }, 4000);
    
    setPollingIntervalId(intervalId);
  };

  const handleSearchSubmit = async () => {
    if (!searchQuery.trim()) {
      return;
    }
    
    stopPolling();
    setSearchLoading(true);
    setIsDownloading(false);
    setDownloadMessage('');
    setIsUnavailable(false);
    
    try {
      const response = await api.searchMusic(searchQuery);
      if (response.success) {
        if (response.downloading) {
          setIsDownloading(true);
          setDownloadMessage(response.message || 'Downloading your song... Please wait.');
          startPolling(searchQuery);
        } else {
          setSearchLoading(false);
          setIsUnavailable(false);
          fetchMusic();
        }
      } else {
        setIsDownloading(false);
        setSearchLoading(false);
        setIsUnavailable(true);
      }
    } catch (error: any) {
      console.log('❌ Search Error:', error);
      setIsDownloading(false);
      setSearchLoading(false);
      setIsUnavailable(true);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setIsDownloading(false);
    setSearchLoading(false);
    setIsUnavailable(false);
    stopPolling();
  };

  const handleCancelSearch = () => {
    setIsSearching(false);
    setSearchQuery('');
    setIsDownloading(false);
    setSearchLoading(false);
    setIsUnavailable(false);
    stopPolling();
  };

  const loadUser = async () => {
    try {
      const userData = await api.getUser();
      console.log('👤 Loaded user data in home.tsx:', userData);
      setUser(userData);
      if (userData && userData.role === 'admin') {
        setUsersLoading(true);
        try {
          const response = await api.getAllUsers();
          if (response.success) {
            setAllUsers(response.data || []);
          }
        } catch (fetchUsersErr) {
          console.log('Error fetching users:', fetchUsersErr);
        } finally {
          setUsersLoading(false);
        }
      }
    } catch (err) {
      console.log('Error loading user:', err);
    }
  };

  const handlePromoteToAdmin = async (userId: string, targetUsername: string) => {
    Alert.alert(
      'Promote User',
      `Are you sure you want to promote "${targetUsername}" to Admin?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Promote', 
          style: 'default',
          onPress: async () => {
            try {
              const response = await api.promoteUser(userId);
              if (response.success) {
                Alert.alert('Success', `"${targetUsername}" promoted to admin successfully!`);
                // Refresh list
                const usersResponse = await api.getAllUsers();
                if (usersResponse.success) {
                  setAllUsers(usersResponse.data || []);
                }
              }
            } catch (err: any) {
              console.log('Promote error:', err);
              Alert.alert('Error', err.response?.data?.message || 'Failed to promote user');
            }
          }
        }
      ]
    );
  };

  const fetchMusic = async () => {
    try {
      const token = await api.getToken();
      
      if (!token) {
        Alert.alert('Error', 'Please login first');
        router.replace('/');
        return;
      }

      const response = await api.fetchMusic();
      console.log('✅ Music fetched:', response);
      setMusicList(response.data || []);
      setContextMusicList(response.data || []);
      
    } catch (error: any) {
      console.log('❌ Fetch error:', error);
      Alert.alert('Error', error.response?.data?.message || 'Failed to fetch music');
      
      // If unauthorized, redirect to login
      if (error.response?.status === 401) {
        await api.clearAuth();
        router.replace('/');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (isPlaying) {
      await pause();
    }
    
    await api.clearAuth();
    router.replace('/');
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmNewPassword) {
      Alert.alert('Error', 'Please fill all password fields');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }

    setUpdatingPassword(true);
    try {
      const response = await api.changePassword(oldPassword, newPassword);
      Alert.alert('Success', response.message || 'Password changed successfully!');
      setOldPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (error: any) {
      console.log('❌ Change Password Error:', error);
      Alert.alert('Error', error.response?.data?.message || 'Failed to change password');
    } finally {
      setUpdatingPassword(false);
    }
  };

  // When clicking the row, load/play the song and open the full modal player
  const handleRowPress = async (item: Music) => {
    const filteredMusic = musicList.filter(song =>
      song.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const displayList = isSearching && searchQuery.trim() !== '' ? filteredMusic : musicList;
    setContextMusicList(displayList);

    if (currentlyPlaying?._id !== item._id) {
      await play(item);
    }
    router.push('/player');
  };

  // When clicking the play/pause icon, toggle playback inline without showing modal
  const handlePlayIconPress = async (item: Music) => {
    const filteredMusic = musicList.filter(song =>
      song.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const displayList = isSearching && searchQuery.trim() !== '' ? filteredMusic : musicList;
    setContextMusicList(displayList);

    if (currentlyPlaying?._id === item._id) {
      if (isPlaying) {
        await pause();
      } else {
        await resume();
      }
    } else {
      await play(item);
    }
  };

  // Main Item Renderer (Grid card)
  const renderMusicItem = ({ item }: { item: Music }) => {
    const isCurrentTrack = currentlyPlaying?._id === item._id;
    const isCurrentPlaying = isCurrentTrack && isPlaying;
    
    return (
      <TouchableOpacity 
        style={[
          styles.gridBox,
          isCurrentTrack && styles.musicBoxPlaying
        ]} 
        onPress={() => handleRowPress(item)}
      >
        <View style={styles.gridCover}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.gridCoverImage} />
          ) : (
            <Ionicons name="musical-notes-outline" size={40} color="#fff" />
          )}
          <TouchableOpacity 
            style={styles.gridPlayButton}
            onPress={() => handlePlayIconPress(item)}
          >
            <Ionicons 
              name={isCurrentPlaying ? 'pause' : 'play'} 
              size={18} 
              color="#BDB4FF" 
              style={isCurrentPlaying ? null : { marginLeft: 2 }}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.gridInfo}>
          <Text style={styles.gridTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.gridDuration}>⏱ {item.duration}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // --- SUB TAB RENDERS ---

  const renderSongsTab = () => {
    const filteredMusic = musicList.filter(song =>
      song.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const displayList = isSearching && searchQuery.trim() !== '' ? filteredMusic : musicList;
    const showEmptyState = isSearching && searchQuery.trim() !== '' && filteredMusic.length === 0;

    return (
      <View style={styles.tabContentContainer}>
        {/* Songs Header */}
        <View style={styles.header}>
          {isSearching ? (
            <View style={styles.headerSearchContainer}>
              <TouchableOpacity onPress={handleCancelSearch} style={styles.headerBackButton}>
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
              <TextInput
                style={styles.headerSearchInput}
                placeholder="Search library..."
                placeholderTextColor="#7C7899"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus={true}
                autoCapitalize="none"
                returnKeyType="search"
                onSubmitEditing={handleSearchSubmit}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={handleClearSearch} style={styles.headerClearButton}>
                  <Ionicons name="close-circle" size={18} color="#fff" />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <>
              <Text style={styles.headerTitle}>Musiana</Text>
            </>
          )}
        </View>

        {showEmptyState ? (
          searchLoading || isDownloading ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color="#8B5CF6" />
              <Text style={styles.loadingStatusText}>
                {isDownloading ? downloadMessage : 'Searching database...'}
              </Text>
            </View>
          ) : isUnavailable ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="alert-circle-outline" size={60} color="#FF3B30" style={{ marginBottom: 15 }} />
              <Text style={styles.emptyTextTitle}>Song not available</Text>
              <Text style={styles.emptyTextSubtitle}>
                "{searchQuery}" could not be downloaded from the cloud. Please check again later!
              </Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="cloud-download-outline" size={60} color="#7C7899" style={{ marginBottom: 15 }} />
              <Text style={styles.emptyTextTitle}>Song not in library</Text>
              <Text style={styles.emptyTextSubtitle}>
                "{searchQuery}" is not available in your library. Would you like to get this song from the cloud?
              </Text>
              <TouchableOpacity style={styles.getSongButton} onPress={handleSearchSubmit}>
                <Ionicons name="download-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.getSongButtonText}>Get the Song</Text>
              </TouchableOpacity>
            </View>
          )
        ) : displayList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No music available</Text>
          </View>
        ) : (
          <FlatList
            key="grid"
            numColumns={2}
            data={displayList}
            renderItem={renderMusicItem}
            keyExtractor={(item) => item._id}
            extraData={{ currentlyPlaying, isPlaying }}
            contentContainerStyle={[
              styles.listContainer,
              currentlyPlaying ? { paddingBottom: 160 } : { paddingBottom: 80 }
            ]}
            columnWrapperStyle={styles.gridRow}
          />
        )}
      </View>
    );
  };

  const renderProfileTab = () => {
    return (
      <View style={styles.tabContentContainer}>
        {/* Profile Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>User Profile</Text>
        </View>

        <FlatList
          data={[1]} // Wrap in FlatList so page remains scrollable
          keyExtractor={(item) => item.toString()}
          contentContainerStyle={[
            styles.profileScrollContainer,
            currentlyPlaying ? { paddingBottom: 160 } : { paddingBottom: 80 }
          ]}
          renderItem={() => (
            <View style={styles.profileContent}>
              {/* User details card */}
              <View style={styles.profileCard}>
                <View style={styles.avatarCircle}>
                  <Ionicons name="person" size={32} color="#fff" />
                </View>
                <View style={styles.profileDetails}>
                  <Text style={styles.profileUsername}>{user?.username || 'Username'}</Text>
                  <Text style={styles.profileEmail}>{user?.email || 'email@example.com'}</Text>
                </View>
              </View>

              {/* Password update form */}
              <View style={styles.formCard}>
                <Text style={styles.formTitle}>Change Password</Text>

                <View style={styles.formInputContainer}>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Old Password"
                    placeholderTextColor="#7C7899"
                    value={oldPassword}
                    onChangeText={setOldPassword}
                    secureTextEntry={!showProfilePassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity 
                    style={styles.formEyeButton}
                    onPress={() => setShowProfilePassword(!showProfilePassword)}
                  >
                    <Ionicons 
                      name={showProfilePassword ? 'eye-off-outline' : 'eye-outline'} 
                      size={20} 
                      color="#7C7899" 
                    />
                  </TouchableOpacity>
                </View>

                <View style={styles.formInputContainer}>
                  <TextInput
                    style={styles.formInput}
                    placeholder="New Password"
                    placeholderTextColor="#7C7899"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showProfilePassword}
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.formInputContainer}>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Confirm New Password"
                    placeholderTextColor="#7C7899"
                    value={confirmNewPassword}
                    onChangeText={setConfirmNewPassword}
                    secureTextEntry={!showProfilePassword}
                    autoCapitalize="none"
                  />
                </View>

                <TouchableOpacity 
                  style={styles.formSubmitButton}
                  onPress={handleChangePassword}
                  disabled={updatingPassword}
                >
                  <Text style={styles.formSubmitText}>
                    {updatingPassword ? 'Updating...' : 'Update Password'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Admin User Management Section */}
              {user?.role === 'admin' && (
                <View style={styles.formCard}>
                  <Text style={styles.formTitle}>Manage Users (Admin Only)</Text>
                  
                  {usersLoading ? (
                    <ActivityIndicator size="small" color="#8B5CF6" style={{ marginVertical: 10 }} />
                  ) : allUsers.length === 0 ? (
                    <Text style={styles.emptyText}>No users registered</Text>
                  ) : (
                    allUsers.map((u) => (
                      <View key={u._id} style={styles.userRow}>
                        <View style={styles.userInfo}>
                          <Text style={styles.userRowUsername}>{u.username}</Text>
                          <Text style={styles.userRowEmail}>{u.email}</Text>
                          <Text style={[
                            styles.userRoleBadge,
                            u.role === 'admin' ? styles.userRoleAdmin : styles.userRoleUser
                          ]}>
                            {u.role.toUpperCase()}
                          </Text>
                        </View>
                        {u.role !== 'admin' && (
                          <TouchableOpacity 
                            style={styles.promoteButton}
                            onPress={() => handlePromoteToAdmin(u._id, u.username)}
                          >
                            <Text style={styles.promoteButtonText}>Promote</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))
                  )}
                </View>
              )}

              {/* Logout button */}
              <TouchableOpacity style={styles.profileLogoutButton} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={20} color="#fff" style={styles.logoutIcon} />
                <Text style={styles.profileLogoutText}>Log Out</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={styles.loadingText}>Loading music...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Tab Switcher Body */}
      {activeTab === 'songs' && renderSongsTab()}
      {activeTab === 'profile' && renderProfileTab()}

      {/* Floating Mini Player Bar (Above bottom tab bar) */}
      {currentlyPlaying && (
        <View style={styles.miniPlayerContainer}>
          {/* Main Row: Art, Title, Play/Pause Button */}
          <View style={styles.miniPlayerMainRow}>
            <TouchableOpacity 
              style={styles.miniPlayerLeftClickable}
              onPress={() => router.push('/player')}
            >
              <View style={styles.miniPlayerArt}>
                {currentlyPlaying.imageUrl ? (
                  <Image source={{ uri: currentlyPlaying.imageUrl }} style={styles.miniPlayerCoverImage} />
                ) : (
                  <Ionicons name="musical-notes" size={20} color="#fff" />
                )}
              </View>
              <View style={styles.miniPlayerTitleContainer}>
                <Text style={styles.miniPlayerTitle} numberOfLines={1}>
                  {currentlyPlaying.title}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.miniPlayerPlayButton}
              onPress={() => isPlaying ? pause() : resume()}
            >
              <Ionicons 
                name={isPlaying ? 'pause' : 'play'} 
                size={18} 
                color="#BDB4FF" 
                style={isPlaying ? null : { marginLeft: 2 }}
              />
            </TouchableOpacity>
          </View>

          {/* Bottom: Ultra-thin Progress Line (Visual only, no gestures) */}
          <View style={styles.miniPlayerProgressBarBg}>
            <View 
              style={[
                styles.miniPlayerProgressBarActive, 
                { width: `${Math.min(100, Math.max(0, (position / (duration || 1)) * 100))}%` }
              ]} 
            />
          </View>
        </View>
      )}

      {/* Fixed Bottom Tab Navigation */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tabItem, (activeTab === 'songs' && !isSearching) && styles.tabItemActive]}
          onPress={() => handleTabChange('songs')}
        >
          <Ionicons 
            name={(activeTab === 'songs' && !isSearching) ? 'musical-notes' : 'musical-notes-outline'} 
            size={22} 
            color={(activeTab === 'songs' && !isSearching) ? '#BDB4FF' : '#7C7899'} 
          />
          <Text style={[styles.tabLabel, (activeTab === 'songs' && !isSearching) && styles.tabLabelActive]}>
            Songs
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabItem, isSearching && styles.tabItemActive]}
          onPress={() => {
            setActiveTab('songs');
            setIsSearching(true);
          }}
        >
          <Ionicons 
            name={isSearching ? 'search' : 'search-outline'} 
            size={22} 
            color={isSearching ? '#BDB4FF' : '#7C7899'} 
          />
          <Text style={[styles.tabLabel, isSearching && styles.tabLabelActive]}>
            Search
          </Text>
        </TouchableOpacity>
 
        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'profile' && styles.tabItemActive]}
          onPress={() => handleTabChange('profile')}
        >
          <Ionicons 
            name={activeTab === 'profile' ? 'person' : 'person-outline'} 
            size={22} 
            color={activeTab === 'profile' ? '#BDB4FF' : '#7C7899'} 
          />
          <Text style={[styles.tabLabel, activeTab === 'profile' && styles.tabLabelActive]}>
            Profile
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#130D22',
  },
  tabContentContainer: {
    flex: 1,
  },
  header: {
    backgroundColor: '#1C1330',
    padding: 20,
    paddingTop: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#332354',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#130D22',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#7C7899',
  },
  listContainer: {
    paddingHorizontal: 10,
    paddingTop: 15,
  },
  gridRow: {
    justifyContent: 'space-between',
  },
  musicBoxPlaying: {
    backgroundColor: '#251842',
    borderColor: '#8B5CF6',
  },
  gridBox: {
    backgroundColor: '#1C1330',
    borderRadius: 12,
    width: GRID_ITEM_WIDTH,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#332354',
  },
  gridCover: {
    height: 120,
    backgroundColor: '#130D22',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  gridCoverImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  gridPlayButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#251842',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  gridInfo: {
    padding: 10,
  },
  gridTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  gridDuration: {
    fontSize: 12,
    color: '#7C7899',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    fontSize: 16,
    color: '#7C7899',
  },
  miniPlayerContainer: {
    position: 'absolute',
    bottom: 80, // Sit directly above bottom tab bar
    left: 15,
    right: 15,
    backgroundColor: '#1C1330',
    borderRadius: 12,
    paddingTop: 10,
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#332354',
    overflow: 'hidden', // Clips the bottom corners of absolute progress bar
  },
  miniPlayerMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  miniPlayerLeftClickable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  miniPlayerArt: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#251842',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    overflow: 'hidden',
  },
  miniPlayerCoverImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  miniPlayerTitleContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  miniPlayerTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  miniPlayerPlayButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#251842',
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniPlayerProgressBarBg: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3, // Ultra-thin progress line
    backgroundColor: '#332354',
  },
  miniPlayerProgressBarActive: {
    height: '100%',
    backgroundColor: '#8B5CF6',
  },
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 65,
    backgroundColor: '#1C1330',
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#332354',
    paddingBottom: 10,
    justifyContent: 'space-around',
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  tabItemActive: {
    backgroundColor: 'transparent',
  },
  tabLabel: {
    fontSize: 11,
    color: '#7C7899',
    marginTop: 3,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: '#BDB4FF',
    fontWeight: 'bold',
  },
  headerSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    backgroundColor: '#251842',
    borderRadius: 8,
    paddingHorizontal: 8,
    height: 40,
    borderWidth: 1,
    borderColor: '#332354',
  },
  headerBackButton: {
    marginRight: 8,
  },
  headerSearchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    paddingVertical: 5,
  },
  headerClearButton: {
    padding: 4,
  },
  headerSearchIcon: {
    padding: 4,
  },
  loadingStatusText: {
    marginTop: 15,
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    paddingHorizontal: 30,
    fontWeight: '500',
  },
  emptyTextTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptyTextSubtitle: {
    fontSize: 14,
    color: '#7C7899',
    textAlign: 'center',
    paddingHorizontal: 40,
    marginBottom: 20,
    lineHeight: 20,
  },
  getSongButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  getSongButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  profileScrollContainer: {
    flexGrow: 1,
  },
  profileContent: {
    padding: 20,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1330',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#332354',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  profileDetails: {
    flex: 1,
  },
  profileUsername: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  profileEmail: {
    fontSize: 14,
    color: '#7C7899',
    marginTop: 2,
  },
  formCard: {
    backgroundColor: '#1C1330',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#332354',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 15,
  },
  formInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#332354',
    borderRadius: 8,
    marginBottom: 15,
    backgroundColor: '#130D22',
  },
  formInput: {
    flex: 1,
    padding: 12,
    fontSize: 15,
    color: '#FFFFFF',
  },
  formEyeButton: {
    padding: 12,
  },
  formSubmitButton: {
    backgroundColor: '#8B5CF6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 5,
  },
  formSubmitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  profileLogoutButton: {
    flexDirection: 'row',
    backgroundColor: '#FF3B30',
    padding: 15,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  profileLogoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  logoutIcon: {
    marginRight: 8,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#130D22',
  },
  userInfo: {
    flex: 1,
    marginRight: 10,
  },
  userRowUsername: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  userRowEmail: {
    fontSize: 12,
    color: '#7C7899',
    marginTop: 2,
  },
  userRoleBadge: {
    fontSize: 9,
    fontWeight: 'bold',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  userRoleAdmin: {
    backgroundColor: '#8B5CF6',
    color: '#FFFFFF',
  },
  userRoleUser: {
    backgroundColor: '#251842',
    color: '#7C7899',
  },
  promoteButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  promoteButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
