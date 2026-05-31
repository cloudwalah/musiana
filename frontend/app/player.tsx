import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Dimensions, Image, Platform, Modal, TextInput, Alert, ActivityIndicator, FlatList } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { useAudio } from '../src/context/AudioContext';
import { api } from '../src/services/api';

const { width } = Dimensions.get('window');
const ALBUM_ART_SIZE = width * 0.75;

export default function PlayerScreen() {
  const { 
    currentlyPlaying, 
    isPlaying, 
    position, 
    duration, 
    play,
    pause, 
    resume, 
    seek,
    isShuffle,
    isLoop,
    toggleShuffle,
    toggleLoop,
    playNext,
    playPrevious,
    queue,
    currentIndex,
    removeFromQueue,
    reorderQueue,
    clearQueue
  } = useAudio();

  // Local state to track sliding position, so it doesn't stutter while dragging
  const [isSliding, setIsSliding] = useState(false);
  const [slidingValue, setSlidingValue] = useState(0);

  // Queue drawer state
  const [showQueueModal, setShowQueueModal] = useState(false);

  // Admin states
  const [isAdmin, setIsAdmin] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);

  // Download states
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [showDownloadProgressModal, setShowDownloadProgressModal] = useState(false);
  const [downloadProgressText, setDownloadProgressText] = useState('');

  // Likes & Playlists state
  const [isLiked, setIsLiked] = useState(false);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [showPlaylistSelectModal, setShowPlaylistSelectModal] = useState(false);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);

  // If we are not sliding, sync the sliding value with the actual position
  useEffect(() => {
    if (!isSliding) {
      setSlidingValue(position);
    }
  }, [position, isSliding]);

  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const user = await AsyncStorage.getItem('user');
        if (user) {
          const parsed = JSON.parse(user);
          setIsAdmin(parsed.role === 'admin');
        }
      } catch (err) {
        console.log('Error checking role:', err);
      }
    };
    checkUserRole();
  }, []);

  useEffect(() => {
    const fetchLikedStatus = async () => {
      if (currentlyPlaying?._id) {
        try {
          const res = await api.checkSongLiked(currentlyPlaying._id);
          setIsLiked(!!res.liked);
        } catch (err) {
          console.log('Error checking liked status:', err);
        }
      }
    };
    fetchLikedStatus();
  }, [currentlyPlaying?._id]);

  const handleToggleLike = async () => {
    if (!currentlyPlaying?._id) return;
    try {
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const res = await api.toggleLikeSong(currentlyPlaying._id);
      setIsLiked(!!res.liked);
    } catch (err) {
      console.log('Error toggling like status:', err);
      Alert.alert('Error', 'Failed to update like status');
    }
  };

  const loadPlaylistsForSelection = async () => {
    try {
      setIsLoadingPlaylists(true);
      const res = await api.fetchPlaylists();
      const customPlaylists = res.data.filter((p: any) => !p.isDefault);
      setPlaylists(customPlaylists);
    } catch (err) {
      console.log('Error loading playlists:', err);
      Alert.alert('Error', 'Failed to load playlists');
    } finally {
      setIsLoadingPlaylists(false);
    }
  };

  if (!currentlyPlaying) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No song is currently playing</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const formatTime = (millis: number) => {
    if (isNaN(millis) || millis === null) return '0:00';
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const handleSlidingStart = () => {
    setIsSliding(true);
  };

  const handleSlidingComplete = async (value: number) => {
    await seek(value);
    setIsSliding(false);
  };

  const handleDownloadFull = async () => {
    setShowOptionsModal(false);

    if (!currentlyPlaying || !currentlyPlaying.url) {
      Alert.alert('Error', 'No audio URL found for this track.');
      return;
    }

    const originalTitle = currentlyPlaying.title || 'song';
    const safeTitle = originalTitle.replace(/[\\/:*?"<>|]/g, '_');
    const localUri = FileSystem.cacheDirectory + `${safeTitle}.mp3`;

    try {
      setShowDownloadProgressModal(true);
      setDownloadProgress(0);
      setDownloadProgressText('Initializing download...');

      const callback = (downloadProgressData: any) => {
        const progress = downloadProgressData.totalBytesWritten / downloadProgressData.totalBytesExpectedToWrite;
        const pct = Math.floor(progress * 100);
        setDownloadProgress(isNaN(pct) ? 0 : Math.min(pct, 99));
        setDownloadProgressText(`Downloading... ${pct}%`);
      };

      const downloadResumable = FileSystem.createDownloadResumable(
        currentlyPlaying.url,
        localUri,
        {},
        callback
      );

      const downloadResult = await downloadResumable.downloadAsync();
      
      if (downloadResult && downloadResult.uri) {
        setDownloadProgress(100);
        setDownloadProgressText('Download complete! Opening share sheet...');

        setTimeout(async () => {
          setShowDownloadProgressModal(false);
          
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(downloadResult.uri, {
              mimeType: 'audio/mpeg',
              dialogTitle: `Save ${currentlyPlaying.title}`,
              UTI: 'public.mp3',
            });
          } else {
            Alert.alert('Error', 'Sharing/Saving is not supported on this device.');
          }
        }, 1000);
      } else {
        throw new Error('Download failed');
      }

    } catch (err: any) {
      setShowDownloadProgressModal(false);
      console.log('Download full song error:', err);
      Alert.alert('Error', 'Failed to download the song. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-down" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Now Playing</Text>
        <TouchableOpacity onPress={() => setShowOptionsModal(true)} style={styles.headerButton}>
          <Ionicons name="ellipsis-horizontal" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Album Art Cover */}
      <View style={styles.content}>
        <View style={styles.albumArtContainer}>
          <View style={styles.albumArtCircle}>
            {currentlyPlaying.imageUrl ? (
              <Image source={{ uri: currentlyPlaying.imageUrl }} style={styles.playerCoverImage} />
            ) : (
              <Ionicons name="musical-notes" size={80} color="#fff" />
            )}
          </View>
        </View>

        {/* Song Info */}
        <View style={styles.songInfoRow}>
          <View style={styles.infoTextContainer}>
            <Text style={styles.songTitle} numberOfLines={1}>{currentlyPlaying.title}</Text>
            <Text style={styles.artistName}>Musiana Library</Text>
          </View>
          <TouchableOpacity onPress={handleToggleLike} style={styles.heartButton}>
            <Ionicons 
              name={isLiked ? 'heart' : 'heart-outline'} 
              size={30} 
              color={isLiked ? '#8B5CF6' : '#BDB4FF'} 
            />
          </TouchableOpacity>
        </View>

        {/* Timeline Slider */}
        <View style={styles.sliderContainer}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={duration || 1000} // prevent division by zero in UI
            value={slidingValue}
            minimumTrackTintColor="#8B5CF6"
            maximumTrackTintColor="#332354"
            thumbTintColor="#8B5CF6"
            onSlidingStart={handleSlidingStart}
            onSlidingComplete={handleSlidingComplete}
            onValueChange={(val) => setSlidingValue(val)}
          />
          <View style={styles.timeContainer}>
            <Text style={styles.timeText}>{formatTime(slidingValue)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </View>

        {/* Playback Controls */}
        <View style={styles.controlsContainer}>
          <TouchableOpacity style={styles.secondaryControl} onPress={playPrevious}>
            <Ionicons name="play-back-outline" size={32} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.playPauseButton} 
            onPress={isPlaying ? pause : resume}
          >
            <Ionicons 
              name={isPlaying ? 'pause' : 'play'} 
              size={40} 
              color="#fff" 
              style={isPlaying ? null : { marginLeft: 4 }} 
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryControl} onPress={playNext}>
            <Ionicons name="play-forward-outline" size={32} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Extra buttons (Shuffle, Repeat, Trim control) */}
        <View style={styles.extraControls}>
          <TouchableOpacity onPress={toggleShuffle}>
            <Ionicons 
              name="shuffle" 
              size={24} 
              color={isShuffle ? '#BDB4FF' : '#7C7899'} 
            />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={() => setShowQueueModal(true)}>
            <Ionicons name="list" size={24} color="#BDB4FF" />
          </TouchableOpacity>

          <TouchableOpacity onPress={async () => {
            await loadPlaylistsForSelection();
            setShowPlaylistSelectModal(true);
          }}>
            <Ionicons name="add-circle-outline" size={26} color="#BDB4FF" />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={toggleLoop}>
            <Ionicons 
              name="repeat" 
              size={24} 
              color={isLoop ? '#BDB4FF' : '#7C7899'} 
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Options Modal (All users) */}
      <Modal
        visible={showOptionsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowOptionsModal(false)}
      >
        <TouchableOpacity 
          style={styles.optionsOverlay} 
          activeOpacity={1} 
          onPress={() => setShowOptionsModal(false)}
        >
          <View style={styles.optionsContainer}>
            <Text style={styles.optionsTitle}>Track Actions</Text>
            
            {isAdmin && (
              <TouchableOpacity 
                style={styles.optionRow} 
                onPress={() => {
                  setShowOptionsModal(false);
                  router.push('/trim');
                }}
              >
                <Ionicons name="cut-outline" size={20} color="#FF3B30" style={{ marginRight: 10 }} />
                <Text style={styles.optionText}>Trim this audio (Global Edit)</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              style={styles.optionRow} 
              onPress={handleDownloadFull}
            >
              <Ionicons name="download-outline" size={20} color="#34C759" style={{ marginRight: 10 }} />
              <Text style={styles.optionText}>Download full song</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.optionRow} 
              onPress={() => {
                setShowOptionsModal(false);
                router.push('/trim?mode=ringtone');
              }}
            >
              <Ionicons name="musical-note-outline" size={20} color="#BDB4FF" style={{ marginRight: 10 }} />
              <Text style={styles.optionText}>Make ringtone</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.optionCancelRow} 
              onPress={() => setShowOptionsModal(false)}
            >
              <Text style={styles.optionCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Queue List Drawer Modal */}
      <Modal
        visible={showQueueModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowQueueModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.queueModalContainer}>
            <View style={styles.queueHeaderRow}>
              <Text style={styles.queueModalTitle}>Play Queue</Text>
              <TouchableOpacity onPress={clearQueue} style={styles.clearQueueBtn}>
                <Text style={styles.clearQueueBtnText}>Clear All</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={queue}
              keyExtractor={(item, idx) => `${item._id}-${idx}`}
              contentContainerStyle={{ paddingBottom: 20 }}
              style={{ width: '100%', maxHeight: Dimensions.get('window').height * 0.45 }}
              renderItem={({ item, index }) => {
                const isCurrent = index === currentIndex;
                const isUpcoming = index > currentIndex;

                if (!isCurrent && !isUpcoming) return null; // hide past songs

                return (
                  <View style={[styles.queueItem, isCurrent && styles.queueItemCurrent]}>
                    <View style={styles.queueItemInfo}>
                      <Text style={styles.queueItemTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      {isCurrent && <Text style={styles.nowPlayingBadge}>NOW PLAYING</Text>}
                    </View>

                    {isUpcoming && (
                      <View style={styles.queueItemActions}>
                        {/* Move Up */}
                        {index > currentIndex + 1 && (
                          <TouchableOpacity 
                            style={styles.queueActionBtn}
                            onPress={() => reorderQueue(index, index - 1)}
                          >
                            <Ionicons name="arrow-up" size={18} color="#BDB4FF" />
                          </TouchableOpacity>
                        )}
                        
                        {/* Move Down */}
                        {index < queue.length - 1 && (
                          <TouchableOpacity 
                            style={styles.queueActionBtn}
                            onPress={() => reorderQueue(index, index + 1)}
                          >
                            <Ionicons name="arrow-down" size={18} color="#BDB4FF" />
                          </TouchableOpacity>
                        )}

                        {/* Remove */}
                        <TouchableOpacity 
                          style={styles.queueActionBtn}
                          onPress={() => removeFromQueue(index)}
                        >
                          <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyQueueText}>Queue is empty</Text>
              }
            />

            <TouchableOpacity 
              style={styles.closeQueueBtn} 
              onPress={() => setShowQueueModal(false)}
            >
              <Text style={styles.closeQueueBtnText}>Close Queue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Playlist Selector Modal */}
      <Modal
        visible={showPlaylistSelectModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPlaylistSelectModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.playlistSelectContainer}>
            <Text style={styles.playlistSelectTitle}>Add to Playlist</Text>
            
            {isLoadingPlaylists ? (
              <ActivityIndicator size="large" color="#8B5CF6" style={{ marginVertical: 30 }} />
            ) : (
              <FlatList
                data={playlists}
                keyExtractor={(item) => item._id}
                style={{ width: '100%', maxHeight: Dimensions.get('window').height * 0.4 }}
                contentContainerStyle={{ paddingBottom: 15 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.playlistSelectItem}
                    onPress={async () => {
                      try {
                        const res = await api.addSongToPlaylist(item._id, currentlyPlaying._id);
                        if (res.success) {
                          Alert.alert('Success', `Added to ${item.name}`);
                          setShowPlaylistSelectModal(false);
                        } else {
                          Alert.alert('Error', res.message || 'Failed to add song to playlist');
                        }
                      } catch (err: any) {
                        const errorMsg = err.response?.data?.message || 'Failed to add song to playlist';
                        Alert.alert('Error', errorMsg);
                      }
                    }}
                  >
                    <View style={styles.playlistSelectItemIcon}>
                      <Ionicons name="musical-notes-outline" size={20} color="#8B5CF6" />
                    </View>
                    <View style={styles.playlistSelectItemInfo}>
                      <Text style={styles.playlistSelectItemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.playlistSelectItemCount}>
                        {item.songs?.length || 0} {item.songs?.length === 1 ? 'song' : 'songs'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward-outline" size={16} color="#7C7899" />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyPlaylistsContainer}>
                    <Text style={styles.emptyPlaylistsText}>No custom playlists found.</Text>
                    <Text style={styles.emptyPlaylistsSubtext}>Create one in the Library tab first.</Text>
                  </View>
                }
              />
            )}
            
            <TouchableOpacity
              style={styles.playlistSelectCancelBtn}
              onPress={() => setShowPlaylistSelectModal(false)}
            >
              <Text style={styles.playlistSelectCancelBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Custom Download Progress Modal */}
      <Modal
        visible={showDownloadProgressModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.downloadModalContainer}>
            <ActivityIndicator size="large" color="#8B5CF6" style={{ marginBottom: 20 }} />
            <Text style={styles.downloadModalTitle}>Downloading Song</Text>
            <Text style={styles.downloadPercentage}>{downloadProgress}%</Text>
            
            {/* Progress Bar Track */}
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${downloadProgress}%` }]} />
            </View>
            
            <Text style={styles.downloadProgressSub}>{downloadProgressText}</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#130D22',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#130D22',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#7C7899',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: Platform.OS === 'ios' ? 15 : 45,
    paddingBottom: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#332354',
  },
  headerButton: {
    padding: 5,
  },
  headerButtonPlaceholder: {
    width: 38,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 25,
    paddingBottom: 40,
  },
  albumArtContainer: {
    width: ALBUM_ART_SIZE,
    height: ALBUM_ART_SIZE,
    borderRadius: ALBUM_ART_SIZE / 2,
    backgroundColor: '#1C1330',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#332354',
  },
  albumArtCircle: {
    width: ALBUM_ART_SIZE - 20,
    height: ALBUM_ART_SIZE - 20,
    borderRadius: (ALBUM_ART_SIZE - 20) / 2,
    backgroundColor: '#130D22', // Sleek slate color for cover
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  playerCoverImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  infoContainer: {
    alignItems: 'center',
    marginVertical: 10,
    width: '100%',
  },
  songTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
    width: '100%',
  },
  artistName: {
    fontSize: 16,
    color: '#BDB4FF',
    fontWeight: '500',
  },
  sliderContainer: {
    width: '100%',
    alignItems: 'center',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '95%',
  },
  timeText: {
    fontSize: 13,
    color: '#7C7899',
    fontWeight: '500',
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '80%',
  },
  playPauseButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  secondaryControl: {
    padding: 10,
  },
  extraControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '65%',
    marginTop: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Removed old trim styles
  queueModalContainer: {
    width: '90%',
    backgroundColor: '#1C1330',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#332354',
    maxHeight: '80%',
    alignItems: 'center',
  },
  queueHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#332354',
    paddingBottom: 10,
  },
  queueModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  clearQueueBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#251842',
    borderRadius: 4,
  },
  clearQueueBtnText: {
    color: '#FF3B30',
    fontSize: 12,
    fontWeight: 'bold',
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#251842',
    width: '100%',
  },
  queueItemCurrent: {
    backgroundColor: '#251842',
    borderRadius: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 0,
  },
  queueItemInfo: {
    flex: 1,
    marginRight: 10,
  },
  queueItemTitle: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  nowPlayingBadge: {
    fontSize: 9,
    color: '#8B5CF6',
    fontWeight: 'bold',
    marginTop: 4,
  },
  queueItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  queueActionBtn: {
    padding: 6,
    marginLeft: 6,
  },
  emptyQueueText: {
    fontSize: 14,
    color: '#7C7899',
    textAlign: 'center',
    marginTop: 20,
  },
  closeQueueBtn: {
    paddingVertical: 10,
  },
  closeQueueBtnText: {
    color: '#7C7899',
    fontSize: 14,
    fontWeight: '500',
  },
  // Removed old trimBtnSaveFull style
  optionsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  optionsContainer: {
    backgroundColor: '#1C1330',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#332354',
  },
  optionsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#7C7899',
    marginBottom: 15,
    textAlign: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#251842',
  },
  optionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  optionCancelRow: {
    alignItems: 'center',
    paddingVertical: 15,
    marginTop: 5,
  },
  optionCancelText: {
    color: '#7C7899',
    fontSize: 16,
    fontWeight: 'bold',
  },
  downloadModalContainer: {
    width: '80%',
    backgroundColor: '#1C1330',
    borderRadius: 16,
    padding: 25,
    borderWidth: 1,
    borderColor: '#332354',
    alignItems: 'center',
  },
  downloadModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 5,
  },
  downloadPercentage: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#8B5CF6',
    marginBottom: 15,
  },
  progressBarTrack: {
    height: 6,
    width: '100%',
    backgroundColor: '#130D22',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 15,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#8B5CF6',
    borderRadius: 3,
  },
  downloadProgressSub: {
    fontSize: 12,
    color: '#7C7899',
    textAlign: 'center',
    lineHeight: 18,
  },
  songInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 20,
    marginVertical: 10,
  },
  infoTextContainer: {
    flex: 1,
    alignItems: 'flex-start',
    marginRight: 10,
  },
  heartButton: {
    padding: 10,
  },
  playlistSelectContainer: {
    width: '90%',
    backgroundColor: '#1C1330',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#332354',
    maxHeight: '70%',
    alignItems: 'center',
  },
  playlistSelectTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#332354',
    paddingBottom: 10,
    width: '100%',
    textAlign: 'center',
  },
  playlistSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#251842',
    width: '100%',
  },
  playlistSelectItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#251842',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  playlistSelectItemInfo: {
    flex: 1,
  },
  playlistSelectItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  playlistSelectItemCount: {
    fontSize: 12,
    color: '#7C7899',
    marginTop: 2,
  },
  playlistSelectCancelBtn: {
    marginTop: 15,
    paddingVertical: 10,
    width: '100%',
    alignItems: 'center',
  },
  playlistSelectCancelBtnText: {
    color: '#7C7899',
    fontSize: 16,
    fontWeight: 'bold',
  },
  emptyPlaylistsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
  },
  emptyPlaylistsText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  emptyPlaylistsSubtext: {
    color: '#7C7899',
    fontSize: 14,
    marginTop: 5,
    textAlign: 'center',
  },
});
