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
  TextInput
} from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { useAudio } from '../src/context/AudioContext';
import { api } from '../src/services/api';

const { width } = Dimensions.get('window');
const COVER_SIZE = width * 0.35;

export default function TrimScreen() {
  const { currentlyPlaying, play, pause: contextPause } = useAudio();

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
  const [isTrimming, setIsTrimming] = useState(false);

  // Width of the slider track bar
  const [sliderWidth, setSliderWidth] = useState(0);

  // Refs to prevent stale closures in AV callbacks & gesture handlers
  const soundRef = useRef<Audio.Sound | null>(null);
  const trimStartRef = useRef(0);
  const trimEndRef = useRef(initialDuration);
  const sliderWidthRef = useRef(0);
  const totalDurationRef = useRef(initialDuration);

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

  const handleConfirmTrim = async () => {
    if (!currentlyPlaying) return;

    if (trimEnd - trimStart <= 0) {
      Alert.alert('Error', 'Trimmed audio length must be greater than 0 seconds.');
      return;
    }

    Alert.alert(
      '⚠ WARNING: Destructive Overwrite',
      `This will permanently trim "${currentlyPlaying.title}" to [${formatTime(trimStart)} - ${formatTime(trimEnd)}]. The original track will be overwritten on the database and Cloudinary. This action is irreversible.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Overwrite',
          style: 'destructive',
          onPress: async () => {
            setIsTrimming(true);
            try {
              const response = await api.trimMusic(currentlyPlaying._id, trimStart, trimEnd);
              if (response.success) {
                Alert.alert('Success', 'Audio track trimmed successfully!');
                const newSong = response.data;
                
                // Unload local sound
                if (sound) {
                  await sound.unloadAsync();
                }
                
                // Play new song in context
                await play(newSong, true);
                router.back();
              }
            } catch (err: any) {
              console.log('Trimming error:', err);
              Alert.alert('Error', err.response?.data?.message || 'Failed to trim audio track');
            } finally {
              setIsTrimming(false);
            }
          }
        }
      ]
    );
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
        <Text style={styles.headerTitleLeft}>Trim Audio</Text>
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
                
                {/* Playback progress cursor indicator */}
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
              disabled={isTrimming}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.saveBtn} 
              onPress={handleConfirmTrim}
              disabled={isTrimming}
            >
              {isTrimming ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="cut" size={18} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.saveBtnText}>Confirm & Trim</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
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
});
