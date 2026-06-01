import React, { useCallback, useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, Alert, TouchableOpacity, TextInput, Dimensions, Image, Modal, BackHandler, TouchableWithoutFeedback, Animated, Easing, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../src/services/api';
import { useAudio, Music } from '../src/context/AudioContext';
import Slider from '@react-native-community/slider';

const { width } = Dimensions.get('window');
const GRID_ITEM_WIDTH = (width - 30) / 2;

// MarqueeText component for auto-scrolling long text
const MarqueeText = ({ text, style }: { text: string; style: any }) => {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [textWidth, setTextWidth] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    animatedValue.setValue(0);
    if (textWidth > containerWidth && containerWidth > 0) {
      const spacerWidth = 50;
      const scrollRange = textWidth + spacerWidth;
      const duration = scrollRange * 35; // 35ms per pixel scroll speed

      const animation = Animated.loop(
        Animated.timing(animatedValue, {
          toValue: -scrollRange,
          duration: duration,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      animation.start();
      return () => animation.stop();
    }
  }, [text, textWidth, containerWidth]);

  const isScrollable = textWidth > containerWidth && containerWidth > 0;

  return (
    <View
      style={{
        width: '100%',
        alignSelf: 'stretch',
        overflow: 'hidden',
        alignItems: isScrollable ? 'flex-start' : 'center',
        justifyContent: 'center',
      }}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {/* Hidden container to measure actual untruncated text width */}
      <View style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Text
            style={[style, { width: 'auto' }]}
            numberOfLines={1}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              console.log("📏 Home Screen: Measured unconstrained text width:", w);
              setTextWidth(w);
            }}
          >
            {text}
          </Text>
        </ScrollView>
      </View>

      <Animated.View
        style={{
          flexDirection: 'row',
          transform: [{ translateX: animatedValue }],
          width: isScrollable ? (textWidth * 2 + 50) : '100%',
          justifyContent: isScrollable ? 'flex-start' : 'center',
        }}
      >
        <Text
          style={[style, { width: 'auto', textAlign: isScrollable ? 'left' : 'center' }]}
          numberOfLines={1}
        >
          {text}
        </Text>
        {isScrollable && (
          <>
            <View style={{ width: 50 }} />
            <Text
              style={[style, { width: 'auto', textAlign: 'left' }]}
              numberOfLines={1}
            >
              {text}
            </Text>
          </>
        )}
      </Animated.View>
    </View>
  );
};

type TabType = 'songs' | 'profile' | 'playlists';

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

  // Playlists & Library States
  const [userPlaylists, setUserPlaylists] = useState<any[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [showCreatePlaylistModal, setShowCreatePlaylistModal] = useState(false);
  const [createPlaylistName, setCreatePlaylistName] = useState('');
  const [createPlaylistTags, setCreatePlaylistTags] = useState('');
  const [createPlaylistIsPrivate, setCreatePlaylistIsPrivate] = useState(true);
  const [selectedPlaylist, setSelectedPlaylist] = useState<any>(null);

  // Custom styled confirmation modal states
  const [showRemoveSongModal, setShowRemoveSongModal] = useState(false);
  const [songToRemove, setSongToRemove] = useState<any>(null);

  const [showDeletePlaylistModal, setShowDeletePlaylistModal] = useState(false);
  const [playlistToDelete, setPlaylistToDelete] = useState<any>(null);

  const [showVisibilityModal, setShowVisibilityModal] = useState(false);
  const [playlistToUpdate, setPlaylistToUpdate] = useState<any>(null);

  // Dropdown options menu state
  const [activeDropdownPlaylistId, setActiveDropdownPlaylistId] = useState<string | null>(null);

  // Logout confirmation modal
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Custom feedback modal states
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackIsError, setFeedbackIsError] = useState(false);

  // Promote / Demote confirmation modal states
  const [showPromoteConfirmModal, setShowPromoteConfirmModal] = useState(false);
  const [showDemoteConfirmModal, setShowDemoteConfirmModal] = useState(false);
  const [userToPromote, setUserToPromote] = useState<{ id: string; username: string } | null>(null);
  const [userToDemote, setUserToDemote] = useState<{ id: string; username: string } | null>(null);

  const showFeedback = (title: string, message: string, isError = false) => {
    setFeedbackTitle(title);
    setFeedbackMessage(message);
    setFeedbackIsError(isError);
    setShowFeedbackModal(true);
  };

  // Search type selector: songs vs playlists vs both
  const [searchType, setSearchType] = useState<'songs' | 'playlists' | 'both'>('songs');
  const [searchResultsPlaylists, setSearchResultsPlaylists] = useState<any[]>([]);

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
    setMusicList: setContextMusicList,
    addToQueue,
    clearQueue,
    isShuffle,
    toggleShuffle,
    activePlaylistId,
    setActivePlaylistId
  } = useAudio();

  // Re-fetch the music list every time this screen comes into focus.
  // This ensures that after a trim (or any other mutation), the home screen
  // always reflects the latest data from the server without needing a full
  // app reload.
  const fetchUserPlaylists = async (shouldRefreshSelected = true) => {
    try {
      setLibraryLoading(true);
      const res = await api.fetchPlaylists();
      setUserPlaylists(res.data || []);
      if (shouldRefreshSelected && selectedPlaylist) {
        const updatedPlaylist = res.data.find((p: any) => p._id === selectedPlaylist._id);
        if (updatedPlaylist) {
          setSelectedPlaylist(updatedPlaylist);
        }
      }
    } catch (err) {
      console.log('Error fetching user playlists:', err);
    } finally {
      setLibraryLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchMusic();
      loadUser();
      fetchUserPlaylists();
    }, [selectedPlaylist?._id])
  );

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
      }
    };
  }, [pollingIntervalId]);

  // Intercept hardware back button when a playlist is open
  useEffect(() => {
    const onBackPress = () => {
      if (selectedPlaylist) {
        setSelectedPlaylist(null);
        return true; // prevent default behavior (app exit)
      }
      return false; // follow default behavior
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);

    return () => backHandler.remove();
  }, [selectedPlaylist]);

  const stopPolling = () => {
    if (pollingIntervalId) {
      clearInterval(pollingIntervalId);
      setPollingIntervalId(null);
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    handleCancelSearch();
    setSelectedPlaylist(null);
    if (tab === 'playlists') {
      fetchUserPlaylists(false);
    }
  };

  const startPolling = (query: string) => {
    const intervalId = setInterval(async () => {
      try {
        console.log(`⏳ Polling search for: "${query}"...`);
        const response = await api.searchMusic(query, searchType);
        if (response.success && !response.downloading) {
          console.log(`✅ Polling complete! Song downloaded.`);
          clearInterval(intervalId);
          setPollingIntervalId(null);
          
          setIsDownloading(false);
          setSearchLoading(false);
          setIsUnavailable(false);
          
          if (response.data && response.data.playlists) {
            setSearchResultsPlaylists(response.data.playlists);
          }
          
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
    setSearchResultsPlaylists([]);
    
    try {
      const response = await api.searchMusic(searchQuery, searchType);
      if (response.success) {
        if (response.data && response.data.playlists) {
          setSearchResultsPlaylists(response.data.playlists);
        }
        
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
    setSearchResultsPlaylists([]);
    stopPolling();
  };

  const handleCancelSearch = () => {
    setIsSearching(false);
    setSearchQuery('');
    setIsDownloading(false);
    setSearchLoading(false);
    setIsUnavailable(false);
    setSearchResultsPlaylists([]);
    setSearchType('songs');
    stopPolling();
  };

  const loadUser = async () => {
    try {
      const userData = await api.getUser();
      console.log('👤 Loaded user data in home.tsx:', userData);
      setUser(userData);
      if (userData && (userData.role === 'admin' || userData.role === 'super-admin')) {
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

  const handlePromoteToAdmin = (userId: string, targetUsername: string) => {
    setUserToPromote({ id: userId, username: targetUsername });
    setShowPromoteConfirmModal(true);
  };

  const handleConfirmPromote = async () => {
    if (!userToPromote) return;
    setShowPromoteConfirmModal(false);
    try {
      const response = await api.promoteUser(userToPromote.id);
      if (response.success) {
        showFeedback('Success', `"${userToPromote.username}" promoted to admin successfully!`);
        // Refresh list
        const usersResponse = await api.getAllUsers();
        if (usersResponse.success) {
          setAllUsers(usersResponse.data || []);
        }
      }
    } catch (err: any) {
      console.log('Promote error:', err);
      showFeedback('Error', err.response?.data?.message || 'Failed to promote user', true);
    } finally {
      setUserToPromote(null);
    }
  };

  const handleDemoteToUser = (userId: string, targetUsername: string) => {
    setUserToDemote({ id: userId, username: targetUsername });
    setShowDemoteConfirmModal(true);
  };

  const handleConfirmDemote = async () => {
    if (!userToDemote) return;
    setShowDemoteConfirmModal(false);
    try {
      const response = await api.demoteUser(userToDemote.id);
      if (response.success) {
        showFeedback('Success', `"${userToDemote.username}" demoted to user successfully!`);
        // Refresh list
        const usersResponse = await api.getAllUsers();
        if (usersResponse.success) {
          setAllUsers(usersResponse.data || []);
        }
      }
    } catch (err: any) {
      console.log('Demote error:', err);
      showFeedback('Error', err.response?.data?.message || 'Failed to demote user', true);
    } finally {
      setUserToDemote(null);
    }
  };

  const fetchMusic = async () => {
    try {
      const token = await api.getToken();
      
      if (!token) {
        showFeedback('Error', 'Please login first', true);
        router.replace('/');
        return;
      }

      const response = await api.fetchMusic();
      console.log('✅ Music fetched:', response);
      setMusicList(response.data || []);
      setContextMusicList(response.data || []);
      
    } catch (error: any) {
      console.log('❌ Fetch error:', error);
      showFeedback('Error', error.response?.data?.message || 'Failed to fetch music', true);
      
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
    
    setActivePlaylistId(null);
    await api.clearAuth();
    router.replace('/');
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmNewPassword) {
      showFeedback('Error', 'Please fill all password fields', true);
      return;
    }

    if (newPassword !== confirmNewPassword) {
      showFeedback('Error', 'New passwords do not match', true);
      return;
    }

    setUpdatingPassword(true);
    try {
      const response = await api.changePassword(oldPassword, newPassword);
      showFeedback('Success', response.message || 'Password changed successfully!');
      setOldPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (error: any) {
      console.log('❌ Change Password Error:', error);
      showFeedback('Error', error.response?.data?.message || 'Failed to change password', true);
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handlePlayPlaylist = async (playlist: any) => {
    if (!playlist.songs || playlist.songs.length === 0) {
      showFeedback('Empty Playlist', 'There are no songs in this playlist.', true);
      return;
    }
    
    clearQueue();
    setContextMusicList(playlist.songs);
    setActivePlaylistId(playlist._id);
    
    if (isShuffle) {
      const randomIndex = Math.floor(Math.random() * playlist.songs.length);
      await play(playlist.songs[randomIndex]);
    } else {
      await play(playlist.songs[0]);
    }
  };

  const handleConfirmRemoveSong = async () => {
    if (!selectedPlaylist || !songToRemove) return;
    try {
      if (selectedPlaylist.isDefault) {
        await api.toggleLikeSong(songToRemove._id);
      } else {
        await api.removeSongFromPlaylist(selectedPlaylist._id, songToRemove._id);
      }
      setShowRemoveSongModal(false);
      setSongToRemove(null);
      await fetchUserPlaylists();
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Failed to remove song';
      showFeedback('Error', errorMsg, true);
    }
  };

  const handleConfirmDeletePlaylist = async () => {
    if (!playlistToDelete) return;
    try {
      const res = await api.deletePlaylist(playlistToDelete._id);
      if (res.success) {
        if (selectedPlaylist && selectedPlaylist._id === playlistToDelete._id) {
          setSelectedPlaylist(null);
        }
        setShowDeletePlaylistModal(false);
        setPlaylistToDelete(null);
        await fetchUserPlaylists(false);
      } else {
        showFeedback('Error', res.message || 'Failed to delete playlist', true);
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Failed to delete playlist';
      showFeedback('Error', errorMsg, true);
    }
  };

  const handleConfirmVisibilityChange = async () => {
    if (!playlistToUpdate) return;
    try {
      const targetVisibility = !playlistToUpdate.isPrivate;
      const res = await api.updatePlaylist(playlistToUpdate._id, { isPrivate: targetVisibility });
      if (res.success) {
        if (selectedPlaylist && selectedPlaylist._id === playlistToUpdate._id) {
          setSelectedPlaylist({ ...selectedPlaylist, isPrivate: targetVisibility });
        }
        setShowVisibilityModal(false);
        setPlaylistToUpdate(null);
        await fetchUserPlaylists(false);
      } else {
        showFeedback('Error', res.message || 'Failed to update visibility', true);
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || 'Failed to update visibility';
      showFeedback('Error', errorMsg, true);
    }
  };

  const handleOpenPlaylistDetails = (playlist: any) => {
    setSelectedPlaylist(playlist);
  };

  // When clicking the row, load/play the song and open the full modal player
  const handleRowPress = async (item: Music) => {
    const filteredMusic = musicList.filter(song =>
      song.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
    const displayList = isSearching && searchQuery.trim() !== '' ? filteredMusic : musicList;
    setContextMusicList(displayList);

    if (currentlyPlaying?._id !== item._id) {
      setActivePlaylistId(null);
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
      setActivePlaylistId(null);
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
          <View style={styles.gridDetailsRow}>
            <Text style={styles.gridDuration}>⏱ {item.duration}</Text>
            <TouchableOpacity 
              style={styles.gridQueueButton}
              onPress={() => addToQueue(item)}
            >
              <Ionicons name="add-circle-outline" size={18} color="#BDB4FF" />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // --- SUB TAB RENDERS ---

  const renderPlaylistDetails = () => {
    if (!selectedPlaylist) return null;
    return (
      <View style={styles.tabContentContainer}>
        <View style={styles.headerPlaylistDetails}>
          <TouchableOpacity onPress={() => setSelectedPlaylist(null)} style={styles.detailsBackBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitleLeft} numberOfLines={1}>
            {selectedPlaylist.name}
          </Text>
          {selectedPlaylist.isDefault ? (
            <View style={{ width: 10 }} />
          ) : (
            <TouchableOpacity
              style={styles.detailsHeaderOptionsBtn}
              onPress={() => setActiveDropdownPlaylistId(
                activeDropdownPlaylistId === selectedPlaylist._id ? null : selectedPlaylist._id
              )}
            >
              <Ionicons name="ellipsis-vertical" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Inline dropdown for playlist detail header options */}
        {!selectedPlaylist.isDefault && activeDropdownPlaylistId === selectedPlaylist._id && (
          <>
            <TouchableOpacity
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: 'transparent',
                zIndex: 990,
              }}
              activeOpacity={1}
              onPress={() => setActiveDropdownPlaylistId(null)}
            />
            <View style={[styles.playlistDropdownMenu, { position: 'absolute', top: 52, right: 10, zIndex: 995 }]}>
              <TouchableOpacity
                style={styles.playlistDropdownOption}
                onPress={() => {
                  setActiveDropdownPlaylistId(null);
                  setPlaylistToUpdate(selectedPlaylist);
                  setShowVisibilityModal(true);
                }}
              >
                <Ionicons name={selectedPlaylist.isPrivate ? 'eye-outline' : 'eye-off-outline'} size={16} color="#BDB4FF" />
                <Text style={styles.playlistDropdownOptionText}>
                  {selectedPlaylist.isPrivate ? 'Make Public' : 'Make Private'}
                </Text>
              </TouchableOpacity>
              <View style={styles.playlistDropdownDivider} />
              <TouchableOpacity
                style={styles.playlistDropdownOption}
                onPress={() => {
                  setActiveDropdownPlaylistId(null);
                  setPlaylistToDelete(selectedPlaylist);
                  setShowDeletePlaylistModal(true);
                }}
              >
                <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                <Text style={[styles.playlistDropdownOptionText, { color: '#FF3B30' }]}>Delete Playlist</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <FlatList
          data={selectedPlaylist.songs || []}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[
            styles.listContainer,
            currentlyPlaying ? { paddingBottom: 160 } : { paddingBottom: 80 }
          ]}
          style={{ width: '100%', flex: 1 }}
          ListHeaderComponent={
            <View style={styles.detailsHeaderSection}>
              <View style={styles.detailsHeaderLeft}>
                <Text style={styles.detailsMeta}>
                  {selectedPlaylist.isDefault ? 'Default Playlist' : (selectedPlaylist.isPrivate ? 'Private' : 'Public')}
                </Text>
                
                {selectedPlaylist.tags && selectedPlaylist.tags.length > 0 && (
                  <View style={styles.detailsTagsContainer}>
                    {selectedPlaylist.tags.map((tag: string, index: number) => (
                      <View key={index} style={styles.detailsTagBadge}>
                        <Text style={styles.detailsTagText}>#{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              
              {selectedPlaylist.songs && selectedPlaylist.songs.length > 0 && (
                <View style={styles.detailsHeaderActions}>
                  <TouchableOpacity
                    style={[styles.playlistHeaderActionBtn, isShuffle && styles.playlistHeaderActionBtnActive]}
                    onPress={toggleShuffle}
                  >
                    <Ionicons name="shuffle" size={20} color={isShuffle ? '#BDB4FF' : '#7C7899'} />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.playlistHeaderActionBtnPlay}
                    onPress={() => handlePlayPlaylist(selectedPlaylist)}
                  >
                    <Ionicons name="play" size={20} color="#FFFFFF" style={{ marginLeft: 2 }} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          }
          renderItem={({ item, index }) => {
            const isPlayingCurrent = currentlyPlaying?._id === item._id && isPlaying && activePlaylistId === selectedPlaylist._id;
            return (
              <View style={styles.detailsSongItem}>
                <TouchableOpacity
                  style={styles.detailsSongClickable}
                  onPress={async () => {
                    if (currentlyPlaying?._id !== item._id) {
                      setActivePlaylistId(selectedPlaylist._id);
                      await play(item);
                    } else if (!isPlaying) {
                      await resume();
                    }
                    router.push('/player');
                  }}
                >
                  <Text style={styles.detailsSongNumber}>{index + 1}</Text>
                  <View style={styles.detailsSongArt}>
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.detailsSongCover} />
                    ) : (
                      <Ionicons name="musical-note" size={18} color="#BDB4FF" />
                    )}
                  </View>
                  <View style={styles.detailsSongInfo}>
                    <Text style={[styles.detailsSongTitle, isPlayingCurrent && { color: '#8B5CF6' }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.detailsSongSub}>⏱ {item.duration}</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.detailsSongOptionsBtn}
                  onPress={() => {
                    setSongToRemove(item);
                    setShowRemoveSongModal(true);
                  }}
                >
                  <Ionicons name="ellipsis-vertical" size={20} color="#7C7899" />
                </TouchableOpacity>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.detailsEmptyContainer}>
              <Text style={styles.detailsEmptyText}>No songs in this playlist</Text>
              <Text style={styles.detailsEmptySub}>Add songs from the search or player menu</Text>
            </View>
          }
        />
      </View>
    );
  };

  // --- SUB TAB RENDERS ---

  const renderPlaylistSearchItem = ({ item }: { item: any }) => (
    <TouchableOpacity 
      style={styles.playlistRowItem} 
      onPress={() => handleOpenPlaylistDetails(item)}
    >
      <View style={styles.playlistRowIcon}>
        <Ionicons name="musical-notes" size={24} color="#8B5CF6" />
      </View>
      <View style={styles.playlistRowInfo}>
        <Text style={styles.playlistRowName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.playlistRowMeta} numberOfLines={1}>
          By {item.user?.username || 'Unknown'} • {item.songs?.length || 0} songs
        </Text>
        {item.tags && item.tags.length > 0 && (
          <Text style={styles.playlistRowTags} numberOfLines={1}>
            {item.tags.map((t: string) => `#${t}`).join(' ')}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color="#7C7899" />
    </TouchableOpacity>
  );

  const renderSearchPills = () => {
    if (!isSearching) return null;

    const isSongsActive = searchType === 'songs' || searchType === 'both';
    const isPlaylistsActive = searchType === 'playlists' || searchType === 'both';

    return (
      <View style={styles.pillsContainer}>
        <TouchableOpacity 
          style={[styles.pill, isSongsActive && styles.pillActive]} 
          onPress={() => {
            let newType: 'songs' | 'playlists' | 'both';
            if (searchType === 'songs') {
              newType = 'songs'; // Unticking songs when only songs is active -> stays songs (fallback)
            } else if (searchType === 'playlists') {
              newType = 'both'; // Playlists was active, ticking songs -> both active
            } else {
              newType = 'playlists'; // Both active, unticking songs -> only playlists active
            }
            setSearchType(newType);
            if (newType === 'songs') {
              setSearchResultsPlaylists([]);
            }
            if (searchQuery.trim()) {
              setTimeout(() => handleSearchSubmit(), 50);
            }
          }}
        >
          <Text style={[styles.pillText, isSongsActive && styles.pillTextActive]}>Songs</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.pill, isPlaylistsActive && styles.pillActive]} 
          onPress={() => {
            let newType: 'songs' | 'playlists' | 'both';
            if (searchType === 'playlists') {
              newType = 'songs'; // Unticking playlists when only playlists is active -> fallback to songs
            } else if (searchType === 'songs') {
              newType = 'both'; // Songs was active, ticking playlists -> both active
            } else {
              newType = 'songs'; // Both active, unticking playlists -> only songs active
            }
            setSearchType(newType);
            if (newType === 'songs') {
              setSearchResultsPlaylists([]);
            }
            if (searchQuery.trim()) {
              setTimeout(() => handleSearchSubmit(), 50);
            }
          }}
        >
          <Text style={[styles.pillText, isPlaylistsActive && styles.pillTextActive]}>Playlists</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderSongsTab = () => {
    const filteredMusic = musicList.filter(song =>
      song.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const displayList = isSearching && searchQuery.trim() !== '' ? filteredMusic : musicList;

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
                placeholder={searchType === 'songs' ? "Search or download songs..." : searchType === 'playlists' ? "Search playlists..." : "Search songs & playlists..."}
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
              <TouchableOpacity 
                style={styles.headerProfileSquare}
                onPress={() => handleTabChange('profile')}
              >
                <Ionicons name="person" size={18} color="#BDB4FF" />
              </TouchableOpacity>
            </>
          )}
        </View>

        {isSearching && searchQuery.trim() !== '' ? (
          searchType === 'songs' ? (
            <FlatList
              key="songs-grid"
              ListHeaderComponent={renderSearchPills()}
              numColumns={2}
              data={filteredMusic}
              renderItem={renderMusicItem}
              keyExtractor={(item) => item._id}
              ListEmptyComponent={
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
                      &quot;{searchQuery}&quot; could not be downloaded from the cloud.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="cloud-download-outline" size={60} color="#7C7899" style={{ marginBottom: 15 }} />
                    <Text style={styles.emptyTextTitle}>Song not in library</Text>
                    <Text style={styles.emptyTextSubtitle}>
                      &quot;{searchQuery}&quot; is not in your library. Download it from the cloud?
                    </Text>
                    <TouchableOpacity style={styles.getSongButton} onPress={handleSearchSubmit}>
                      <Ionicons name="download-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.getSongButtonText}>Get the Song</Text>
                    </TouchableOpacity>
                  </View>
                )
              }
              contentContainerStyle={[
                styles.listContainer,
                currentlyPlaying ? { paddingBottom: 160 } : { paddingBottom: 80 }
              ]}
              columnWrapperStyle={filteredMusic.length > 0 ? styles.gridRow : null}
            />
          ) : searchType === 'playlists' ? (
            <FlatList
              key="playlists-list"
              ListHeaderComponent={renderSearchPills()}
              numColumns={1}
              data={searchResultsPlaylists}
              renderItem={renderPlaylistSearchItem}
              keyExtractor={(item) => item._id}
              ListEmptyComponent={
                searchLoading ? (
                  <ActivityIndicator size="large" color="#8B5CF6" style={{ marginTop: 40 }} />
                ) : (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="folder-open-outline" size={60} color="#7C7899" style={{ marginBottom: 15 }} />
                    <Text style={styles.emptyTextTitle}>No Playlists Found</Text>
                    <Text style={styles.emptyTextSubtitle}>
                      No public playlists match &quot;{searchQuery}&quot;.
                    </Text>
                  </View>
                )
              }
              contentContainerStyle={[
                styles.listContainer,
                currentlyPlaying ? { paddingBottom: 160 } : { paddingBottom: 80 }
              ]}
            />
          ) : (
            <FlatList
              key="both-grid"
              ListHeaderComponent={
                <View>
                  {renderSearchPills()}
                  {filteredMusic.length > 0 && (
                    <Text style={styles.sectionHeaderTitle}>Songs</Text>
                  )}
                </View>
              }
              numColumns={2}
              data={filteredMusic}
              renderItem={renderMusicItem}
              keyExtractor={(item) => `song-${item._id}`}
              columnWrapperStyle={filteredMusic.length > 0 ? styles.gridRow : null}
              ListFooterComponent={
                <View style={{ marginTop: 20 }}>
                  {searchResultsPlaylists.length > 0 && (
                    <Text style={styles.sectionHeaderTitle}>Playlists</Text>
                  )}
                  {searchResultsPlaylists.length > 0 ? (
                    searchResultsPlaylists.map((p) => (
                      <View key={`playlist-${p._id}`}>
                        {renderPlaylistSearchItem({ item: p })}
                      </View>
                    ))
                  ) : (
                    filteredMusic.length === 0 && searchResultsPlaylists.length === 0 && !searchLoading && (
                      <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No matching songs or playlists found</Text>
                      </View>
                    )
                  )}
                  {searchLoading && searchResultsPlaylists.length === 0 && (
                    <ActivityIndicator size="small" color="#8B5CF6" style={{ marginVertical: 20 }} />
                  )}
                </View>
              }
              contentContainerStyle={[
                styles.listContainer,
                currentlyPlaying ? { paddingBottom: 160 } : { paddingBottom: 80 }
              ]}
            />
          )
        ) : (
          <FlatList
            key="general-grid"
            numColumns={2}
            data={musicList}
            renderItem={renderMusicItem}
            keyExtractor={(item) => item._id}
            extraData={{ currentlyPlaying, isPlaying }}
            ListHeaderComponent={renderSearchPills()}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No music available</Text>
              </View>
            }
            contentContainerStyle={[
              styles.listContainer,
              currentlyPlaying ? { paddingBottom: 160 } : { paddingBottom: 80 }
            ]}
            columnWrapperStyle={musicList.length > 0 ? styles.gridRow : null}
          />
        )}
      </View>
    );
  };

  const renderPlaylistItem = ({ item }: { item: any }) => {
    const songCount = item.songs?.length || 0;
    const isDropdownActive = activeDropdownPlaylistId === item._id;

    return (
      <View 
        style={[
          styles.playlistCardItem,
          isDropdownActive && { zIndex: 1000, elevation: 10 }
        ]}
      >
        <TouchableOpacity 
          style={styles.playlistCardClickableArea}
          onPress={() => handleOpenPlaylistDetails(item)}
        >
          <View style={[styles.playlistCardIcon, item.isDefault && styles.playlistCardIconDefault]}>
            <Ionicons 
              name={item.isDefault ? "heart" : "musical-notes"} 
              size={28} 
              color={item.isDefault ? "#FF3B30" : "#BDB4FF"} 
            />
          </View>
          <View style={styles.playlistCardInfo}>
            <Text style={styles.playlistCardName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.playlistCardSub}>
              {item.isDefault ? 'Default Playlist' : (item.isPrivate ? 'Private' : 'Public')} • {songCount} {songCount === 1 ? 'song' : 'songs'}
            </Text>
            {item.tags && item.tags.length > 0 && (
              <Text style={styles.playlistCardTags} numberOfLines={1}>
                {item.tags.map((t: string) => `#${t}`).join(' ')}
              </Text>
            )}
          </View>
        </TouchableOpacity>
        {item.isDefault ? null : (
          <TouchableOpacity 
            style={{ padding: 10 }}
            onPress={() => {
              setActiveDropdownPlaylistId(isDropdownActive ? null : item._id);
            }}
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#7C7899" />
          </TouchableOpacity>
        )}

        {!item.isDefault && isDropdownActive && (
          <>
            <TouchableOpacity
              style={{
                position: 'absolute',
                top: -Dimensions.get('window').height,
                bottom: -Dimensions.get('window').height,
                left: -Dimensions.get('window').width,
                right: -Dimensions.get('window').width,
                backgroundColor: 'transparent',
                zIndex: 990,
              }}
              activeOpacity={1}
              onPress={() => setActiveDropdownPlaylistId(null)}
            />
            <View style={styles.playlistDropdownMenu}>
              <TouchableOpacity 
                style={styles.playlistDropdownOption}
                onPress={() => {
                  setActiveDropdownPlaylistId(null);
                  setPlaylistToUpdate(item);
                  setShowVisibilityModal(true);
                }}
              >
                <Ionicons 
                  name={item.isPrivate ? "globe-outline" : "lock-closed-outline"} 
                  size={16} 
                  color="#BDB4FF" 
                />
                <Text style={styles.playlistDropdownOptionText}>
                  {item.isPrivate ? 'Make Public' : 'Make Private'}
                </Text>
              </TouchableOpacity>
              
              <View style={styles.playlistDropdownDivider} />
              
              <TouchableOpacity 
                style={styles.playlistDropdownOption}
                onPress={() => {
                  setActiveDropdownPlaylistId(null);
                  setPlaylistToDelete(item);
                  setShowDeletePlaylistModal(true);
                }}
              >
                <Ionicons name="trash-outline" size={16} color="#FF3B30" />
                <Text style={[styles.playlistDropdownOptionText, { color: '#FF3B30' }]}>
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    );
  };

  const renderPlaylistsTab = () => {
    return (
      <View style={styles.tabContentContainer}>
        {/* Library Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Library</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity 
              style={styles.createPlaylistHeaderBtn}
              onPress={() => {
                setCreatePlaylistName('');
                setCreatePlaylistTags('');
                setCreatePlaylistIsPrivate(true);
                setShowCreatePlaylistModal(true);
              }}
            >
              <Ionicons name="add" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.headerProfileSquare, { marginLeft: 12 }]}
              onPress={() => handleTabChange('profile')}
            >
              <Ionicons name="person" size={18} color="#BDB4FF" />
            </TouchableOpacity>
          </View>
        </View>

        {libraryLoading && userPlaylists.length === 0 ? (
          <ActivityIndicator size="large" color="#8B5CF6" style={{ marginTop: 55 }} />
        ) : userPlaylists.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="library-outline" size={60} color="#7C7899" style={{ marginBottom: 15 }} />
            <Text style={styles.emptyTextTitle}>Create Playlists</Text>
            <Text style={styles.emptyTextSubtitle}>
              Organize your music by creating custom playlists!
            </Text>
          </View>
        ) : (
          <FlatList
            data={userPlaylists}
            renderItem={renderPlaylistItem}
            keyExtractor={(item) => item._id}
            contentContainerStyle={[
              styles.listContainer,
              currentlyPlaying ? { paddingBottom: 160 } : { paddingBottom: 80 }
            ]}
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
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity
            style={styles.profileHeaderLogoutBtn}
            onPress={() => setShowLogoutModal(true)}
          >
            <Ionicons name="log-out-outline" size={22} color="#FF3B30" />
          </TouchableOpacity>
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
              {(user?.role === 'admin' || user?.role === 'super-admin') && (
                <View style={styles.formCard}>
                  <Text style={styles.formTitle}>Manage Users</Text>
                  
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
                            u.role === 'super-admin' ? { backgroundColor: '#8B5CF6', color: '#FFFFFF' } : u.role === 'admin' ? styles.userRoleAdmin : styles.userRoleUser
                          ]}>
                            {u.role.toUpperCase()}
                          </Text>
                        </View>
                        {u.username !== user?.username && u.role !== 'super-admin' && (
                          u.role === 'admin' ? (
                            user?.role === 'super-admin' ? (
                              <TouchableOpacity 
                                style={[styles.promoteButton, { backgroundColor: '#FF3B30' }]}
                                onPress={() => handleDemoteToUser(u._id, u.username)}
                              >
                                <Text style={styles.promoteButtonText}>Demote</Text>
                              </TouchableOpacity>
                            ) : null
                          ) : (
                            <TouchableOpacity 
                              style={styles.promoteButton}
                              onPress={() => handlePromoteToAdmin(u._id, u.username)}
                            >
                              <Text style={styles.promoteButtonText}>Promote</Text>
                            </TouchableOpacity>
                          )
                        )}
                      </View>
                    ))
                  )}
                </View>
              )}


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

      {/* Custom Themed Confirmation Modals */}
      <Modal
        visible={showRemoveSongModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowRemoveSongModal(false);
          setSongToRemove(null);
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowRemoveSongModal(false);
            setSongToRemove(null);
          }}
        >
          <TouchableWithoutFeedback>
            <View style={styles.confirmModalContainer}>
              <Text style={styles.confirmModalTitle}>Remove Song</Text>
              <Text style={styles.confirmModalSub}>
                Are you sure you want to remove this song from the playlist?
              </Text>
              {songToRemove && (
                <Text style={styles.confirmModalBoldText} numberOfLines={2}>
                  {songToRemove.title}
                </Text>
              )}
              <View style={styles.confirmActionRow}>
                <TouchableOpacity
                  style={styles.confirmCancelBtn}
                  onPress={() => {
                    setShowRemoveSongModal(false);
                    setSongToRemove(null);
                  }}
                >
                  <Text style={styles.confirmCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmSaveBtn}
                  onPress={handleConfirmRemoveSong}
                >
                  <Text style={styles.confirmSaveText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showDeletePlaylistModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowDeletePlaylistModal(false);
          setPlaylistToDelete(null);
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowDeletePlaylistModal(false);
            setPlaylistToDelete(null);
          }}
        >
          <TouchableWithoutFeedback>
            <View style={styles.confirmModalContainer}>
              <Text style={styles.confirmModalTitle}>Delete Playlist</Text>
              <Text style={styles.confirmModalSub}>
                Are you sure you want to delete this playlist?
              </Text>
              {playlistToDelete && (
                <Text style={styles.confirmModalBoldText} numberOfLines={2}>
                  {playlistToDelete.name}
                </Text>
              )}
              <View style={styles.confirmActionRow}>
                <TouchableOpacity
                  style={styles.confirmCancelBtn}
                  onPress={() => {
                    setShowDeletePlaylistModal(false);
                    setPlaylistToDelete(null);
                  }}
                >
                  <Text style={styles.confirmCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmSaveBtn}
                  onPress={handleConfirmDeletePlaylist}
                >
                  <Text style={styles.confirmSaveText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showVisibilityModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowVisibilityModal(false);
          setPlaylistToUpdate(null);
        }}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowVisibilityModal(false);
            setPlaylistToUpdate(null);
          }}
        >
          <TouchableWithoutFeedback>
            <View style={styles.confirmModalContainer}>
              <Text style={styles.confirmModalTitle}>Change Visibility</Text>
              {playlistToUpdate && (
                <Text style={styles.confirmModalSub}>
                  This will change the visibility for the playlist from{" "}
                  <Text style={{ fontWeight: 'bold' }}>
                    {playlistToUpdate.isPrivate ? 'private' : 'public'}
                  </Text>{" "}
                  to{" "}
                  <Text style={{ fontWeight: 'bold' }}>
                    {playlistToUpdate.isPrivate ? 'public' : 'private'}
                  </Text>.
                </Text>
              )}
              {playlistToUpdate && (
                <Text style={styles.confirmModalBoldText} numberOfLines={2}>
                  {playlistToUpdate.name}
                </Text>
              )}
              <View style={styles.confirmActionRow}>
                <TouchableOpacity
                  style={styles.confirmCancelBtn}
                  onPress={() => {
                    setShowVisibilityModal(false);
                    setPlaylistToUpdate(null);
                  }}
                >
                  <Text style={styles.confirmCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmSaveBtn, { backgroundColor: '#8B5CF6' }]}
                  onPress={handleConfirmVisibilityChange}
                >
                  <Text style={styles.confirmSaveText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* Logout Confirmation Modal */}
      <Modal
        visible={showLogoutModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowLogoutModal(false)}
        >
          <TouchableWithoutFeedback>
            <View style={styles.confirmModalContainer}>
              <Text style={styles.confirmModalTitle}>Log Out</Text>
              <Text style={styles.confirmModalSub}>
                Are you sure you want to log out of this account?
              </Text>
              <View style={styles.confirmActionRow}>
                <TouchableOpacity
                  style={styles.confirmCancelBtn}
                  onPress={() => setShowLogoutModal(false)}
                >
                  <Text style={styles.confirmCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.confirmSaveBtn, { backgroundColor: '#FF3B30' }]}
                  onPress={() => {
                    setShowLogoutModal(false);
                    handleLogout();
                  }}
                >
                  <Text style={styles.confirmSaveText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* Tab Switcher Body */}
      {activeTab === 'songs' && (
        selectedPlaylist ? renderPlaylistDetails() : renderSongsTab()
      )}
      {activeTab === 'playlists' && (
        selectedPlaylist ? renderPlaylistDetails() : renderPlaylistsTab()
      )}
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
                <MarqueeText text={currentlyPlaying.title} style={styles.miniPlayerTitle} />
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
            setSelectedPlaylist(null);
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
          style={[styles.tabItem, activeTab === 'playlists' && styles.tabItemActive]}
          onPress={() => handleTabChange('playlists')}
        >
          <Ionicons 
            name={activeTab === 'playlists' ? 'library' : 'library-outline'} 
            size={22} 
            color={activeTab === 'playlists' ? '#BDB4FF' : '#7C7899'} 
          />
          <Text style={[styles.tabLabel, activeTab === 'playlists' && styles.tabLabelActive]}>
            Library
          </Text>
        </TouchableOpacity>
 

      </View>

      {/* Create Playlist Modal */}
      <Modal
        visible={showCreatePlaylistModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCreatePlaylistModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCreatePlaylistModal(false)}
        >
          <TouchableWithoutFeedback>
            <View style={styles.playlistModalContainer}>
              <Text style={styles.playlistModalTitle}>Create Playlist</Text>
              
              <TextInput
                style={styles.playlistModalInput}
                placeholder="Playlist Name"
                placeholderTextColor="#7C7899"
                value={createPlaylistName}
                onChangeText={setCreatePlaylistName}
                autoCapitalize="words"
              />
              
              <TextInput
                style={styles.playlistModalInput}
                placeholder="Tags (comma separated, e.g. gym, chill)"
                placeholderTextColor="#7C7899"
                value={createPlaylistTags}
                onChangeText={setCreatePlaylistTags}
                autoCapitalize="none"
              />
              
              <View style={styles.privacyContainer}>
                <Text style={styles.privacyLabel}>Privacy:</Text>
                <View style={styles.privacyButtons}>
                  <TouchableOpacity
                    style={[styles.privacyBtn, createPlaylistIsPrivate && styles.privacyBtnActive]}
                    onPress={() => setCreatePlaylistIsPrivate(true)}
                  >
                    <Ionicons name="lock-closed" size={16} color={createPlaylistIsPrivate ? '#FFFFFF' : '#7C7899'} />
                    <Text style={[styles.privacyBtnText, createPlaylistIsPrivate && styles.privacyBtnTextActive]}>Private</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.privacyBtn, !createPlaylistIsPrivate && styles.privacyBtnActive]}
                    onPress={() => setCreatePlaylistIsPrivate(false)}
                  >
                    <Ionicons name="globe" size={16} color={!createPlaylistIsPrivate ? '#FFFFFF' : '#7C7899'} />
                    <Text style={[styles.privacyBtnText, !createPlaylistIsPrivate && styles.privacyBtnTextActive]}>Public</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              <View style={styles.playlistModalActions}>
                <TouchableOpacity
                  style={styles.playlistCancelBtn}
                  onPress={() => setShowCreatePlaylistModal(false)}
                >
                  <Text style={styles.playlistCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.playlistCreateBtn}
                  onPress={async () => {
                    if (!createPlaylistName.trim()) {
                      showFeedback('Error', 'Playlist name is required', true);
                      return;
                    }
                    try {
                      const res = await api.createPlaylist(
                        createPlaylistName.trim(),
                        createPlaylistTags.trim(),
                        createPlaylistIsPrivate
                      );
                      if (res.success) {
                        setShowCreatePlaylistModal(false);
                        setCreatePlaylistName('');
                        setCreatePlaylistTags('');
                        setCreatePlaylistIsPrivate(true);
                        await fetchUserPlaylists();
                      } else {
                        showFeedback('Error', res.message || 'Failed to create playlist', true);
                      }
                    } catch (err: any) {
                      const errorMsg = err.response?.data?.message || 'Failed to create playlist';
                      showFeedback('Error', errorMsg, true);
                    }
                  }}
                >
                  <Text style={styles.playlistCreateBtnText}>Create</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* Promote User Confirmation Modal */}
      <Modal
        visible={showPromoteConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowPromoteConfirmModal(false);
          setUserToPromote(null);
        }}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => {
            setShowPromoteConfirmModal(false);
            setUserToPromote(null);
          }}
        >
          <TouchableWithoutFeedback>
            <View style={styles.confirmModalContainer}>
              <Text style={styles.confirmModalTitle}>Promote User</Text>
              {userToPromote && (
                <Text style={styles.confirmModalSub}>
                  Are you sure you want to promote <Text style={{ fontWeight: 'bold' }}>{userToPromote.username}</Text> to Admin?
                </Text>
              )}
              <View style={styles.confirmActionRow}>
                <TouchableOpacity 
                  style={styles.confirmCancelBtn}
                  onPress={() => {
                    setShowPromoteConfirmModal(false);
                    setUserToPromote(null);
                  }}
                >
                  <Text style={styles.confirmCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.confirmSaveBtn, { backgroundColor: '#8B5CF6' }]}
                  onPress={handleConfirmPromote}
                >
                  <Text style={styles.confirmSaveText}>Promote</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* Demote User Confirmation Modal */}
      <Modal
        visible={showDemoteConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowDemoteConfirmModal(false);
          setUserToDemote(null);
        }}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => {
            setShowDemoteConfirmModal(false);
            setUserToDemote(null);
          }}
        >
          <TouchableWithoutFeedback>
            <View style={styles.confirmModalContainer}>
              <Text style={styles.confirmModalTitle}>Demote Admin</Text>
              {userToDemote && (
                <Text style={styles.confirmModalSub}>
                  Are you sure you want to demote <Text style={{ fontWeight: 'bold' }}>{userToDemote.username}</Text> to a regular User?
                </Text>
              )}
              <View style={styles.confirmActionRow}>
                <TouchableOpacity 
                  style={styles.confirmCancelBtn}
                  onPress={() => {
                    setShowDemoteConfirmModal(false);
                    setUserToDemote(null);
                  }}
                >
                  <Text style={styles.confirmCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.confirmSaveBtn}
                  onPress={handleConfirmDemote}
                >
                  <Text style={styles.confirmSaveText}>Demote</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* Custom Feedback Modal (replaces Alert.alert) */}
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
  gridDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  gridQueueButton: {
    padding: 2,
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
  profileHeaderLogoutBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
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
  pillsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 10,
    marginVertical: 10,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1C1330',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#332354',
  },
  pillActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  pillText: {
    color: '#7C7899',
    fontSize: 14,
    fontWeight: '500',
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginHorizontal: 10,
    marginTop: 15,
    marginBottom: 10,
  },
  playlistRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1330',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#332354',
  },
  playlistRowIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#251842',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  playlistRowInfo: {
    flex: 1,
  },
  playlistRowName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  playlistRowMeta: {
    fontSize: 13,
    color: '#BDB4FF',
    marginTop: 2,
  },
  playlistRowTags: {
    fontSize: 11,
    color: '#7C7899',
    marginTop: 4,
  },
  createPlaylistHeaderBtn: {
    padding: 4,
  },
  playlistCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1330',
    borderRadius: 12,
    padding: 15,
    marginHorizontal: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#332354',
  },
  playlistCardClickableArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  playlistCardIcon: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: '#251842',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  playlistCardIconDefault: {
    backgroundColor: '#251842',
  },
  playlistCardInfo: {
    flex: 1,
  },
  playlistCardName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  playlistCardSub: {
    fontSize: 13,
    color: '#BDB4FF',
    marginTop: 3,
  },
  playlistCardTags: {
    fontSize: 11,
    color: '#7C7899',
    marginTop: 5,
  },
  playlistModalContainer: {
    width: '85%',
    backgroundColor: '#1C1330',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#332354',
    alignItems: 'center',
  },
  playlistModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 20,
    textAlign: 'center',
  },
  playlistModalInput: {
    width: '100%',
    backgroundColor: '#130D22',
    color: '#FFFFFF',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#332354',
  },
  privacyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
    paddingHorizontal: 5,
  },
  privacyLabel: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  privacyButtons: {
    flexDirection: 'row',
  },
  privacyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#130D22',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#332354',
  },
  privacyBtnActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  privacyBtnText: {
    color: '#7C7899',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  privacyBtnTextActive: {
    color: '#FFFFFF',
  },
  playlistModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  playlistCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    marginRight: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#332354',
  },
  playlistCancelBtnText: {
    color: '#7C7899',
    fontSize: 15,
    fontWeight: 'bold',
  },
  playlistCreateBtn: {
    flex: 1,
    backgroundColor: '#8B5CF6',
    paddingVertical: 12,
    alignItems: 'center',
    marginLeft: 10,
    borderRadius: 8,
  },
  playlistCreateBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  detailsModalContainer: {
    width: '90%',
    height: '80%',
    backgroundColor: '#1C1330',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#332354',
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#332354',
    paddingBottom: 12,
  },
  detailsTitleContainer: {
    flex: 1,
    marginRight: 10,
  },
  detailsName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  detailsMeta: {
    fontSize: 13,
    color: '#BDB4FF',
    marginTop: 4,
  },
  detailsTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  detailsTagBadge: {
    backgroundColor: '#251842',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#332354',
  },
  detailsTagText: {
    color: '#7C7899',
    fontSize: 11,
  },
  detailsActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 15,
  },
  detailsPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
  },
  detailsPlayBtnDisabled: {
    backgroundColor: '#130D22',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#332354',
    justifyContent: 'center',
  },
  detailsPlayBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  detailsPlayBtnTextDisabled: {
    color: '#7C7899',
    fontWeight: 'bold',
    fontSize: 14,
  },
  detailsDeletePlaylistBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#251842',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  detailsDeletePlaylistBtnText: {
    color: '#FF3B30',
    fontWeight: 'bold',
    fontSize: 14,
  },
  detailsSongItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#251842',
  },
  detailsSongClickable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  detailsSongArt: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#251842',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  detailsSongCover: {
    width: '100%',
    height: '100%',
  },
  detailsSongInfo: {
    flex: 1,
  },
  detailsSongTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  detailsSongSub: {
    fontSize: 12,
    color: '#7C7899',
    marginTop: 2,
  },
  detailsSongRemoveBtn: {
    padding: 6,
  },
  detailsEmptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  detailsEmptyText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  detailsEmptySub: {
    color: '#7C7899',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsPlayIconBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  detailsSongOptionsBtn: {
    padding: 10,
  },
  detailsHeaderSection: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#251842',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailsHeaderLeft: {
    flex: 1,
    paddingRight: 15,
  },
  detailsHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playlistHeaderActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#251842',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#332354',
  },
  playlistHeaderActionBtnActive: {
    borderColor: '#8B5CF6',
    backgroundColor: '#332354',
  },
  playlistHeaderActionBtnPlay: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  headerPlaylistDetails: {
    backgroundColor: '#1C1330',
    padding: 20,
    paddingTop: 60,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#332354',
  },
  detailsBackBtn: {
    marginRight: 15,
  },
  headerTitleLeft: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    flex: 1,
  },
  detailsHeaderOptionsBtn: {
    padding: 6,
    marginLeft: 8,
  },
  headerPlayPlaylistBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  detailsSongNumber: {
    fontSize: 14,
    color: '#7C7899',
    width: 24,
    textAlign: 'center',
    marginRight: 8,
    fontWeight: '500',
  },
  playlistDropdownMenu: {
    position: 'absolute',
    right: 12,
    top: 50,
    backgroundColor: '#251842',
    borderColor: '#332354',
    borderWidth: 1,
    borderRadius: 8,
    width: 160,
    zIndex: 995,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  playlistDropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  playlistDropdownOptionText: {
    color: '#FFFFFF',
    fontSize: 13,
    marginLeft: 8,
    fontWeight: '500',
  },
  playlistDropdownDivider: {
    height: 1,
    backgroundColor: '#332354',
  },
  confirmModalContainer: {
    width: '85%',
    backgroundColor: '#1C1330',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#332354',
    alignItems: 'center',
  },
  confirmModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  confirmModalSub: {
    fontSize: 14,
    color: '#BDB4FF',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  confirmModalBoldText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  confirmActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  confirmCancelBtn: {
    flex: 0.46,
    backgroundColor: '#251842',
    borderWidth: 1,
    borderColor: '#332354',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmCancelText: {
    color: '#7C7899',
    fontSize: 15,
    fontWeight: 'bold',
  },
  confirmSaveBtn: {
    flex: 0.46,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmSaveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
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
  headerProfileSquare: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#251842',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#332354',
  },
});
