import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  SafeAreaView, 
  Dimensions, 
  Image, 
  Platform, 
  ActivityIndicator, 
  Alert,
  PanResponder,
  TextInput,
  Modal,
  TouchableWithoutFeedback
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { useAudio } from '../src/context/AudioContext';
import { api } from '../src/services/api';

const { width } = Dimensions.get('window');
const COVER_SIZE = width * 0.35;

export default function TrimScreen() {
  const { currentlyPlaying, play, pause: contextPause, musicList, setMusicList } = useAudio();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isRingtoneMode = mode === 'ringtone';

  // Parsing initial duration
  const parseDuration = (dStr: string) => {
    if (!dStr) return 180;
    const parts = dStr.split(':');
    if (parts.length === 2) {
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }
    return parseFloat(dStr) || 180;
  };

  const initialDuration = currentlyPlaying ? parseDuration(currentlyPlaying.duration) : 180;

  const [totalDuration, setTotalDuration] = useState(initialDuration);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(initialDuration);
  
  // Custom increment step configuration
  const [customStepStr, setCustomStepStr] = useState('0.1');

  // Local playback engine states
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPos, setPlaybackPos] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Custom themed Modal & Progress states
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showLoadingModal, setShowLoadingModal] = useState(false);
  const [trimProgress, setTrimProgress] = useState(0);
  const [trimProgressText, setTrimProgressText] = useState('');

  // Width of the slider track bar
  const [sliderWidth, setSliderWidth] = useState(0);

  // Refs to prevent stale closures in AV callbacks & gesture handlers
  const soundRef = useRef<Audio.Sound | null>(null);
  const trimStartRef = useRef(0);
  const trimEndRef = useRef(initialDuration);
  const sliderWidthRef = useRef(0);
  const totalDurationRef = useRef(initialDuration);
  const playbackPosRef = useRef(0);

  // Store absolute drag grant values
  const startValOnGrant = useRef(0);
  const endValOnGrant = useRef(0);

  useEffect(() => {
    trimStartRef.current = trimStart;
  }, [trimStart]);

  useEffect(() => {
    trimEndRef.current = trimEnd;
  }, [trimEnd]);

  useEffect(() => {
    sliderWidthRef.current = sliderWidth;
  }, [sliderWidth]);

  useEffect(() => {
    totalDurationRef.current = totalDuration;
  }, [totalDuration]);

  useEffect(() => {
    playbackPosRef.current = playbackPos;
  }, [playbackPos]);

  // Load local track on mount
  useEffect(() => {
    if (!currentlyPlaying) return;

    let localSound: Audio.Sound | null = null;

    const loadTrack = async () => {
      try {
        setIsLoading(true);
        console.log('🔄 TrimScreen: Loading audio locally for range verification:', currentlyPlaying.url);

        // Pause context playback on entry
        await contextPause();

        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: currentlyPlaying.url },
          { shouldPlay: false, progressUpdateIntervalMillis: 100 },
          onPlaybackStatusUpdate
        );

        localSound = newSound;
        setSound(newSound);
        soundRef.current = newSound;

        // Try to query actual duration from loaded sound metadata
        const status = await newSound.getStatusAsync();
        if (status.isLoaded && status.durationMillis) {
          const actualSec = status.durationMillis / 1000;
          setTotalDuration(actualSec);
          setTrimEnd(actualSec);
          trimEndRef.current = actualSec;
        }
        setIsLoading(false);
      } catch (err) {
        console.log('❌ TrimScreen: Failed to load audio locally:', err);
        setIsLoading(false);
        Alert.alert('Error', 'Failed to load audio for editing. Please check your connection.');
      }
    };

    loadTrack();

    return () => {
      if (localSound) {
        console.log('🧹 TrimScreen: Unloading local playback sound instance');
        localSound.unloadAsync();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentlyPlaying]);

  const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setPlaybackPos(status.positionMillis);
      
      // Auto limit / loop logic
      if (status.isPlaying) {
        if (status.positionMillis >= trimEndRef.current * 1000) {
          // Reached Point B -> pause and loop back to Point A
          console.log('🔁 Reached Point B. Looping back to Point A');
          soundRef.current?.pauseAsync();
          soundRef.current?.setPositionAsync(trimStartRef.current * 1000);
          setIsPlaying(false);
        }
      }
    }
  };

  const stopPlayback = async () => {
    if (soundRef.current && isPlaying) {
      await soundRef.current.pauseAsync();
      setIsPlaying(false);
    }
  };

  const handlePlayPauseRange = async () => {
    if (!sound) return;

    if (isPlaying) {
      await sound.pauseAsync();
      setIsPlaying(false);
    } else {
      // Seek to Point A if the current cursor position is outside the selected range
      const currentSec = playbackPos / 1000;
      if (currentSec < trimStart || currentSec >= trimEnd) {
        await sound.setPositionAsync(trimStart * 1000);
      }
      await sound.playAsync();
      setIsPlaying(true);
    }
  };

  const handleStartOver = async () => {
    if (!sound) return;
    await sound.setPositionAsync(trimStart * 1000);
    await sound.playAsync();
    setIsPlaying(true);
  };

  const formatTime = (secondsVal: number) => {
    const minutes = Math.floor(secondsVal / 60);
    const seconds = Math.floor(secondsVal % 60);
    const ms = Math.floor((secondsVal % 1) * 100);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}.${ms < 10 ? '0' : ''}${ms}`;
  };

  // Fine-tuning handlers
  const adjustStart = (delta: number) => {
    const newVal = Math.max(0, Math.min(trimStart + delta, trimEnd));
    setTrimStart(Math.round(newVal * 100) / 100);
  };

  const adjustEnd = (delta: number) => {
    const newVal = Math.max(trimStart, Math.min(trimEnd + delta, totalDuration));
    setTrimEnd(Math.round(newVal * 100) / 100);
  };

  const getCustomStep = () => {
    const val = parseFloat(customStepStr);
    return isNaN(val) || val <= 0 ? 0.1 : val;
  };

  // Draggable PanResponder for Pointer A (Start handle)
  const panResponderA = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        stopPlayback();
        startValOnGrant.current = trimStartRef.current;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (!sliderWidthRef.current) return;
        const timeDelta = (gestureState.dx / sliderWidthRef.current) * totalDurationRef.current;
        const targetVal = Math.max(0, Math.min(startValOnGrant.current + timeDelta, trimEndRef.current));
        setTrimStart(Math.round(targetVal * 100) / 100);
      }
    })
  ).current;

  // Draggable PanResponder for Pointer B (End handle)
  const panResponderB = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        stopPlayback();
        endValOnGrant.current = trimEndRef.current;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (!sliderWidthRef.current) return;
        const timeDelta = (gestureState.dx / sliderWidthRef.current) * totalDurationRef.current;
        const targetVal = Math.max(trimStartRef.current, Math.min(endValOnGrant.current + timeDelta, totalDurationRef.current));
        setTrimEnd(Math.round(targetVal * 100) / 100);
      }
    })
  ).current;

  // Draggable PanResponder for Playback Cursor
  const panResponderCursor = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        stopPlayback();
        startValOnGrant.current = playbackPosRef.current / 1000;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (!sliderWidthRef.current) return;
        const timeDelta = (gestureState.dx / sliderWidthRef.current) * totalDurationRef.current;
        const targetVal = Math.max(0, Math.min(startValOnGrant.current + timeDelta, totalDurationRef.current));
        setPlaybackPos(Math.round(targetVal * 1000));
      },
      onPanResponderRelease: async () => {
        if (soundRef.current) {
          await soundRef.current.setPositionAsync(playbackPosRef.current);
        }
      }
    })
  ).current;

  const startProgressSimulation = (isRingtone: boolean) => {
    setTrimProgress(0);
    const actionText = isRingtone ? 'Creating ringtone' : 'Trimming track';
    setTrimProgressText(`${actionText}... This may take a while. Approx. 10 seconds remaining`);
    
    const totalEstSeconds = 10;
    const interval = setInterval(() => {
      setTrimProgress((prev) => {
        if (prev >= 98) {
          clearInterval(interval);
          setTrimProgressText(`${actionText}... This may take a while. Approx. 1 second remaining`);
          return 98;
        }
        
        let step = 0.98;
        let nextVal = prev + step;
        
        const secondsRemaining = Math.max(1, Math.ceil(totalEstSeconds - (nextVal / 98) * totalEstSeconds));
        setTrimProgressText(`${actionText}... This may take a while. Approx. ${secondsRemaining} seconds remaining`);
        
        return Math.min(nextVal, 98);
      });
    }, 100);
    
    return interval;
  };

  const executeTrim = async () => {
    if (!currentlyPlaying) return;
    
    // Pause any active verification preview playback first
    await stopPlayback();
    
    setShowConfirmModal(false);
    setShowLoadingModal(true);
    
    const progressInterval = startProgressSimulation(isRingtoneMode);
    
    try {
      if (isRingtoneMode) {
        // Ringtone trim-download path for all users
        const token = await api.getToken();
        const originalTitle = currentlyPlaying.title || 'song';
        const safeTitle = originalTitle.replace(/[\\/:*?"<>|]/g, '_');
        const localUri = FileSystem.cacheDirectory + `${safeTitle}_ringtone.mp3`;
        
        // Use GET query parameters for legacy FileSystem compatibility
        const downloadUrl = `${api.getApiUrl()}/upload/trim-download/${currentlyPlaying._id}?startTime=${trimStart}&endTime=${trimEnd}`;
        
        const downloadResumable = FileSystem.createDownloadResumable(
          downloadUrl,
          localUri,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );
        
        const result = await downloadResumable.downloadAsync();
        
        clearInterval(progressInterval);
        
        if (result && result.uri) {
          setTrimProgress(100);
          setTrimProgressText('Success! Opening share sheet...');
          
          setTimeout(async () => {
            setShowLoadingModal(false);
            
            if (sound) {
              await sound.unloadAsync();
            }
            
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(result.uri, {
                mimeType: 'audio/mpeg',
                dialogTitle: `Save Ringtone: ${currentlyPlaying.title}`,
                UTI: 'public.mp3',
              });
            } else {
              Alert.alert('Error', 'Sharing/Saving is not supported on this device.');
            }
            
            router.back();
          }, 1000);
        } else {
          throw new Error('Failed to download trimmed ringtone');
        }
      } else {
        // Admin global trim overwrite path
        const response = await api.trimMusic(currentlyPlaying._id, trimStart, trimEnd);
        if (response.success) {
          clearInterval(progressInterval);
          setTrimProgress(100);
          setTrimProgressText('Success! Overwritten track globally.');
          
          // Let the user visually see 100% success before closing
          setTimeout(async () => {
            setShowLoadingModal(false);
            const newSong = response.data;
            
            if (sound) {
              await sound.unloadAsync();
            }

            // Immediately patch the in-memory music list/queue so the home
            // screen grid and mini-player show the updated duration/URL
            // without waiting for the next fetchMusic() call.
            const updatedList = musicList.map(s =>
              s._id === newSong._id ? newSong : s
            );
            setMusicList(updatedList);

            await play(newSong, true);
            router.back();
          }, 1200);
        }
      }
    } catch (err: any) {
      clearInterval(progressInterval);
      setShowLoadingModal(false);
      console.log('Trimming/Downloading error:', err);
      Alert.alert('Error', err.response?.data?.message || err.message || 'Failed to process audio track');
    }
  };

  const handleOpenConfirm = () => {
    if (trimEnd - trimStart <= 0) {
      Alert.alert('Error', 'Trimmed audio length must be greater than 0 seconds.');
      return;
    }
    setShowConfirmModal(true);
  };

  if (!currentlyPlaying) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No song selected for trimming</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Selection percentages for the timeline highlight
  const selectionStartPct = totalDuration > 0 ? (trimStart / totalDuration) * 100 : 0;
  const selectionEndPct = totalDuration > 0 ? (trimEnd / totalDuration) * 100 : 100;
  const selectionWidthPct = selectionEndPct - selectionStartPct;
  const cursorLeftPct = totalDuration > 0 ? (playbackPos / (totalDuration * 1000)) * 100 : 0;

  const currentStep = getCustomStep();

  return (
    <SafeAreaView style={styles.container}>
      {/* Hide Expo Router's native header */}
      <Stack.Screen options={{ headerShown: false }} />

      {/* Custom Left-Aligned Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitleLeft}>{isRingtoneMode ? 'Make Ringtone' : 'Trim Audio'}</Text>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>Loading audio stream...</Text>
        </View>
      ) : (
        <View style={styles.content}>
          {/* Song Card */}
          <View style={styles.songCard}>
            {currentlyPlaying.imageUrl ? (
              <Image source={{ uri: currentlyPlaying.imageUrl }} style={styles.coverImage} />
            ) : (
              <View style={styles.coverPlaceholder}>
                <Ionicons name="musical-notes" size={40} color="#fff" />
              </View>
            )}
            <View style={styles.songDetails}>
              <Text style={styles.songTitle} numberOfLines={1}>{currentlyPlaying.title}</Text>
              <Text style={styles.artistText}>Musiana Library</Text>
            </View>
          </View>

          {/* Unified Timeline & Double Pointer Track */}
          <View style={styles.timelineWrapper}>
            <View 
              style={styles.trackContainer}
              onLayout={(e) => setSliderWidth(e.nativeEvent.layout.width)}
            >
              <View style={styles.timelineTrack} pointerEvents="none">
                {/* Highlight selected range */}
                <View 
                  style={[
                    styles.timelineSelection, 
                    { left: `${selectionStartPct}%`, width: `${selectionWidthPct}%` }
                  ]} 
                />
                
                {/* Playback progress cursor indicator line */}
                <View 
                  style={[
                    styles.playbackCursor,
                    { left: `${cursorLeftPct}%` }
                  ]}
                />
              </View>

              {/* Pointer Handle A (Draggable) */}
              <View 
                style={[
                  styles.pointerHandle, 
                  styles.pointerHandleA,
                  { left: `${selectionStartPct}%` }
                ]}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                {...panResponderA.panHandlers}
              >
                <Text style={styles.pointerLabelText}>A</Text>
              </View>

              {/* Pointer Handle B (Draggable) */}
              <View 
                style={[
                  styles.pointerHandle, 
                  styles.pointerHandleB,
                  { left: `${selectionEndPct}%` }
                ]}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                {...panResponderB.panHandlers}
              >
                <Text style={styles.pointerLabelText}>B</Text>
              </View>

              {/* Playback Cursor Handle (Draggable) */}
              <View 
                style={[
                  styles.pointerHandleCursor,
                  { left: `${cursorLeftPct}%` }
                ]}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                {...panResponderCursor.panHandlers}
              >
                <Ionicons name="play" size={10} color="#8B5CF6" style={{ marginLeft: 2 }} />
              </View>
            </View>

            <View style={styles.timelineLabels}>
              {/* Top-left dynamically updating playback elapsed time indicator */}
              <Text style={styles.timelineLimitLabel}>{formatTime(playbackPos / 1000)}</Text>
              {/* Top-right song total duration limit */}
              <Text style={styles.timelineLimitLabel}>{formatTime(totalDuration)}</Text>
            </View>
          </View>

          {/* Adjustments Container */}
          <View style={styles.adjustmentsContainer}>
            
            {/* Custom Step Configuration */}
            <View style={styles.customStepConfigCard}>
              <Text style={styles.customStepConfigLabel}>Custom Nudge Step:</Text>
              <View style={styles.customStepInputWrapper}>
                <TextInput
                  style={styles.customStepInput}
                  keyboardType="numeric"
                  placeholder="0.10"
                  placeholderTextColor="#7C7899"
                  value={customStepStr}
                  onChangeText={setCustomStepStr}
                />
                <Text style={styles.customStepUnit}>seconds</Text>
              </View>
            </View>

            {/* START TRIM (Point A) */}
            <View style={styles.adjustSection}>
              <View style={styles.adjustLabelRow}>
                <Text style={styles.adjustTitle}>Pointer A (Start Cut)</Text>
                <Text style={styles.adjustValue}>{formatTime(trimStart)}</Text>
              </View>
              <View style={styles.fineTuneRow}>
                <TouchableOpacity style={styles.fineBtn} onPress={() => adjustStart(-1.0)}>
                  <Text style={styles.fineBtnText}>-1s</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.fineBtn} onPress={() => adjustStart(-0.5)}>
                  <Text style={styles.fineBtnText}>-0.5s</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.fineBtn} onPress={() => adjustStart(0.5)}>
                  <Text style={styles.fineBtnText}>+0.5s</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.fineBtn} onPress={() => adjustStart(1.0)}>
                  <Text style={styles.fineBtnText}>+1s</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.customNudgeRow}>
                <TouchableOpacity style={styles.customNudgeBtn} onPress={() => adjustStart(-currentStep)}>
                  <Text style={styles.customNudgeBtnText}>- {currentStep}s</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.customNudgeBtn} onPress={() => adjustStart(currentStep)}>
                  <Text style={styles.customNudgeBtnText}>+ {currentStep}s</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* END TRIM (Point B) */}
            <View style={styles.adjustSection}>
              <View style={styles.adjustLabelRow}>
                <Text style={styles.adjustTitle}>Pointer B (End Cut)</Text>
                <Text style={styles.adjustValue}>{formatTime(trimEnd)}</Text>
              </View>
              <View style={styles.fineTuneRow}>
                <TouchableOpacity style={styles.fineBtn} onPress={() => adjustEnd(-1.0)}>
                  <Text style={styles.fineBtnText}>-1s</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.fineBtn} onPress={() => adjustEnd(-0.5)}>
                  <Text style={styles.fineBtnText}>-0.5s</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.fineBtn} onPress={() => adjustEnd(0.5)}>
                  <Text style={styles.fineBtnText}>+0.5s</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.fineBtn} onPress={() => adjustEnd(1.0)}>
                  <Text style={styles.fineBtnText}>+1s</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.customNudgeRow}>
                <TouchableOpacity style={styles.customNudgeBtn} onPress={() => adjustEnd(-currentStep)}>
                  <Text style={styles.customNudgeBtnText}>- {currentStep}s</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.customNudgeBtn} onPress={() => adjustEnd(currentStep)}>
                  <Text style={styles.customNudgeBtnText}>+ {currentStep}s</Text>
                </TouchableOpacity>
              </View>
            </View>

          </View>

          {/* Local Range Verification Player */}
          <View style={styles.previewSection}>
            <View style={styles.previewButtonsRow}>
              <TouchableOpacity 
                style={[styles.previewPlayBtn, isPlaying && styles.previewPlayingBtn]} 
                onPress={handlePlayPauseRange}
              >
                <Ionicons 
                  name={isPlaying ? "pause" : "play"} 
                  size={20} 
                  color="#fff" 
                  style={{ marginRight: 6 }} 
                />
                <Text style={styles.previewPlayText}>
                  {isPlaying ? "Pause" : "Play"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.startOverBtn} 
                onPress={handleStartOver}
              >
                <Ionicons 
                  name="reload" 
                  size={18} 
                  color="#BDB4FF" 
                  style={{ marginRight: 6 }} 
                />
                <Text style={styles.startOverBtnText}>
                  Start Over
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.previewMeta}>
              Selected Segment: {formatTime(trimEnd - trimStart)}
            </Text>
          </View>

          {/* Action Row */}
          <View style={styles.actionRow}>
            <TouchableOpacity 
              style={styles.cancelBtn} 
              onPress={() => router.back()}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.saveBtn} 
              onPress={handleOpenConfirm}
            >
              <Ionicons name={isRingtoneMode ? "download-outline" : "cut"} size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.saveBtnText}>{isRingtoneMode ? 'Download' : 'Trim'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Custom Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowConfirmModal(false)}
        >
          <TouchableWithoutFeedback>
            <View style={styles.confirmModalContainer}>
              <Ionicons name={isRingtoneMode ? "information-circle-outline" : "warning"} size={48} color={isRingtoneMode ? "#8B5CF6" : "#FF3B30"} style={{ marginBottom: 15 }} />
              <Text style={styles.confirmModalTitle}>
                {isRingtoneMode ? 'Download this ringtone?' : 'Are you sure you want to trim?'}
              </Text>
              <Text style={styles.confirmModalSub}>
                {isRingtoneMode
                  ? 'This will trim the selected section and download it to your device. The original song will not be affected.'
                  : 'Trimming as admin, the trim would be reflected with all the users.'}
              </Text>
              
              <View style={styles.confirmActionRow}>
                <TouchableOpacity 
                  style={styles.confirmCancelBtn} 
                  onPress={() => setShowConfirmModal(false)}
                >
                  <Text style={styles.confirmCancelText}>Cancel</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.confirmSaveBtn} 
                  onPress={executeTrim}
                >
                  <Text style={styles.confirmSaveText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* Custom Loading Modal */}
      <Modal
        visible={showLoadingModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {}}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowLoadingModal(false)}
        >
          <TouchableWithoutFeedback>
            <View style={styles.loadingModalContainer}>
              <ActivityIndicator size="large" color="#8B5CF6" style={{ marginBottom: 20 }} />
              <Text style={styles.loadingModalTitle}>{isRingtoneMode ? 'Downloading Ringtone' : 'Trimming Audio'}</Text>
              <Text style={styles.loadingPercentage}>{Math.floor(trimProgress)}%</Text>
              
              {/* Progress Bar Track */}
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${trimProgress}%` }]} />
              </View>
              
              <Text style={styles.loadingProgressSub}>{trimProgressText}</Text>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#130D22',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#130D22',
  },
  loadingText: {
    color: '#7C7899',
    fontSize: 15,
    marginTop: 15,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
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
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: Platform.OS === 'ios' ? 15 : 45,
    paddingBottom: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#332354',
  },
  headerButton: {
    padding: 5,
    marginRight: 10,
  },
  headerTitleLeft: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  songCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1330',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#332354',
  },
  coverImage: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: 8,
  },
  coverPlaceholder: {
    width: COVER_SIZE,
    height: COVER_SIZE,
    borderRadius: 8,
    backgroundColor: '#332354',
    justifyContent: 'center',
    alignItems: 'center',
  },
  songDetails: {
    flex: 1,
    marginLeft: 15,
  },
  songTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  artistText: {
    fontSize: 14,
    color: '#BDB4FF',
  },
  timelineWrapper: {
    marginVertical: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#7C7899',
    marginBottom: 8,
    letterSpacing: 1,
  },
  trackContainer: {
    paddingVertical: 15,
    width: '100%',
    position: 'relative',
    justifyContent: 'center',
  },
  timelineTrack: {
    height: 12,
    backgroundColor: '#1C1330',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#332354',
    position: 'relative',
    overflow: 'hidden',
  },
  timelineSelection: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: '#8B5CF6',
    borderRadius: 4,
  },
  playbackCursor: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 2,
  },
  pointerHandle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#BDB4FF',
    position: 'absolute',
    top: 7, // Centered vertically over the track (15 padding + 12/2 height = 21. handle 28/2 = 14. 21 - 14 = 7.)
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 4,
    transform: [{ translateX: -14 }],
  },
  pointerHandleA: {
    borderColor: '#8B5CF6',
    borderWidth: 2.5,
  },
  pointerHandleB: {
    borderColor: '#FF3B30',
    borderWidth: 2.5,
  },
  pointerHandleCursor: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderColor: '#8B5CF6',
    borderWidth: 2,
    position: 'absolute',
    top: 10, // Centered vertically: container padding 15 + track 12/2 = 21. handle 22/2 = 11. 21 - 11 = 10.
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 4,
    transform: [{ translateX: -11 }],
  },
  pointerLabelText: {
    color: '#130D22',
    fontSize: 12,
    fontWeight: 'bold',
  },
  timelineLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  timelineLimitLabel: {
    fontSize: 12,
    color: '#7C7899',
    fontWeight: '500',
  },
  adjustmentsContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  customStepConfigCard: {
    backgroundColor: '#1C1330',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#332354',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  customStepConfigLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7C7899',
  },
  customStepInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customStepInput: {
    backgroundColor: '#130D22',
    borderWidth: 1,
    borderColor: '#332354',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
    width: 60,
    textAlign: 'center',
  },
  customStepUnit: {
    color: '#7C7899',
    fontSize: 12,
    marginLeft: 6,
  },
  adjustSection: {
    marginBottom: 16,
  },
  adjustLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  adjustTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#BDB4FF',
  },
  adjustValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  fineTuneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  fineBtn: {
    backgroundColor: '#251842',
    borderWidth: 1,
    borderColor: '#332354',
    borderRadius: 6,
    paddingVertical: 8,
    flex: 0.23,
    alignItems: 'center',
  },
  fineBtnText: {
    color: '#BDB4FF',
    fontSize: 12,
    fontWeight: '600',
  },
  customNudgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  customNudgeBtn: {
    backgroundColor: '#251842',
    borderWidth: 1,
    borderColor: '#332354',
    borderRadius: 6,
    paddingVertical: 8,
    flex: 0.48,
    alignItems: 'center',
  },
  customNudgeBtnText: {
    color: '#8B5CF6',
    fontSize: 12,
    fontWeight: '600',
  },
  previewSection: {
    alignItems: 'center',
    backgroundColor: '#1C1330',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#332354',
    padding: 15,
    marginVertical: 10,
  },
  previewButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  previewPlayBtn: {
    flex: 0.48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    borderRadius: 8,
    paddingVertical: 12,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  previewPlayingBtn: {
    backgroundColor: '#FF3B30',
    shadowColor: '#FF3B30',
  },
  previewPlayText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  startOverBtn: {
    flex: 0.48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#251842',
    borderWidth: 1,
    borderColor: '#332354',
    borderRadius: 8,
    paddingVertical: 12,
  },
  startOverBtnText: {
    color: '#BDB4FF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  previewMeta: {
    fontSize: 12,
    color: '#7C7899',
    marginTop: 4,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelBtn: {
    flex: 0.45,
    backgroundColor: '#251842',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#332354',
  },
  cancelBtnText: {
    color: '#7C7899',
    fontSize: 15,
    fontWeight: 'bold',
  },
  saveBtn: {
    flex: 0.5,
    flexDirection: 'row',
    backgroundColor: '#8B5CF6',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
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
    marginBottom: 24,
    lineHeight: 20,
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
  loadingModalContainer: {
    width: '80%',
    backgroundColor: '#1C1330',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#332354',
    alignItems: 'center',
  },
  loadingModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  loadingPercentage: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#8B5CF6',
    marginVertical: 10,
  },
  progressBarTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#130D22',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#332354',
    marginBottom: 15,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#8B5CF6',
    borderRadius: 4,
  },
  loadingProgressSub: {
    fontSize: 13,
    color: '#7C7899',
    textAlign: 'center',
  },
});
