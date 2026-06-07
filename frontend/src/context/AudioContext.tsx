import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Audio, AVPlaybackStatus, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { NativeModules, Platform, PermissionsAndroid } from 'react-native';

// V5 (@rntp/player) uses TurboModules, so check both the TurboModule proxy and legacy NativeModules
const isTurboModuleEnabled = !!(global as any).__turboModuleProxy;
const isTrackPlayerSupported = isTurboModuleEnabled || !!NativeModules.TrackPlayer || !!NativeModules.TrackPlayerModule;

export interface Music {
  _id: string;
  title: string;
  duration: string;
  url: string;
  imageUrl?: string;
}

interface AudioContextProps {
  currentlyPlaying: Music | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  play: (song: Music, skipHistoryPush?: boolean) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  musicList: Music[];
  setMusicList: (list: Music[]) => void;
  isShuffle: boolean;
  isLoop: boolean;
  toggleShuffle: () => void;
  toggleLoop: () => void;
  playNext: () => Promise<void>;
  playPrevious: () => Promise<void>;
  
  // Queue extensions
  queue: Music[];
  currentIndex: number;
  addToQueue: (song: Music) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;

  // Active playlist tracking
  activePlaylistId: string | null;
  setActivePlaylistId: (id: string | null) => void;
}

const AudioContext = createContext<AudioContextProps | undefined>(undefined);

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<Music | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  // Navigational & Queue States
  const [musicList, setMusicListState] = useState<Music[]>([]);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isLoop, setIsLoop] = useState(false);
  const [playbackHistory, setPlaybackHistoryState] = useState<Music[]>([]);

  // Stateful Queue States
  const [queue, setQueueState] = useState<Music[]>([]);
  const [currentIndex, setCurrentIndexState] = useState<number>(-1);

  // Active playlist tracking (which playlist initiated current playback)
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);

  // Track player flags
  const [useNativeTrackPlayer, setUseNativeTrackPlayer] = useState(false);
  const useNativeTrackPlayerRef = useRef(false);

  // Refs to avoid stale React closures inside AVPlayback callbacks
  const soundRef = useRef<Audio.Sound | null>(null);
  const musicListRef = useRef<Music[]>([]);
  const currentlyPlayingRef = useRef<Music | null>(null);
  const isShuffleRef = useRef<boolean>(false);
  const isLoopRef = useRef<boolean>(false);
  const playbackHistoryRef = useRef<Music[]>([]);
  const currentLoadIdRef = useRef<number>(0);
  
  const queueRef = useRef<Music[]>([]);
  const currentIndexRef = useRef<number>(-1);
  const userAddedCountRef = useRef<number>(0);

  // Sync state reference variables
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  // Clean up sound on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
      if (useNativeTrackPlayerRef.current) {
        try {
          const TrackPlayer = require('@rntp/player');
          TrackPlayer.destroy().catch(() => {});
        } catch (e) {}
      }
    };
  }, []);

  // Setup TrackPlayer dynamically
  useEffect(() => {
    let active = true;
    let eventListeners: any[] = [];
    
    const initTrackPlayer = async () => {
      if (!isTrackPlayerSupported) {
        if (active) {
          setUseNativeTrackPlayer(false);
          useNativeTrackPlayerRef.current = false;
        }
        return;
      }
      try {
        const TPModule = require('@rntp/player');
        const TrackPlayer = TPModule.default || TPModule;
        const { Event, PlayerCommand } = TPModule;
        
        if (Platform.OS === 'android' && Platform.Version >= 33) {
          try {
            await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS');
          } catch (err) {
            console.log('Failed to request notification permission', err);
          }
        }
        
        // V5: setupPlayer is synchronous
        try {
          TrackPlayer.setupPlayer({
            contentType: 'music',
            handleAudioBecomingNoisy: true,
            android: {
              wakeMode: 'network',
              notification: {
                channelId: 'musiana_channel',
                channelName: 'Musiana',
                smallIcon: 'notification_icon'
              }
            },
          });
        } catch (e: any) {
          if (e?.message?.includes('already set up')) {
            console.log('TrackPlayer already set up, continuing...');
          } else {
            throw e;
          }
        }

        // V5: setCommands replaces updateOptions for notification/lockscreen controls
        TrackPlayer.setCommands({
          capabilities: [
            PlayerCommand.PlayPause,
            PlayerCommand.Next,
            PlayerCommand.Previous,
            PlayerCommand.Seek,
          ],
        });
        
        if (active) {
          setUseNativeTrackPlayer(true);
          useNativeTrackPlayerRef.current = true;
          console.log("✅ Native TrackPlayer V5 is available and configured.");
        }

        // V5: MediaItemTransition replaces PlaybackActiveTrackChanged
        const activeTrackListener = TrackPlayer.addEventListener(Event.MediaItemTransition, async (event: any) => {
          if (active) {
            const index = TrackPlayer.getActiveMediaItemIndex();
            if (index !== undefined && index !== null) {
              const q = queueRef.current;
              if (index >= 0 && index < q.length) {
                const matchedSong = q[index];
                setCurrentlyPlaying(matchedSong);
                currentlyPlayingRef.current = matchedSong;
                setCurrentIndex(index);
                userAddedCountRef.current = 0;
              }
            }
          }
        });
        eventListeners.push(activeTrackListener);

        // V5: IsPlayingChanged replaces PlaybackState
        const playbackStateListener = TrackPlayer.addEventListener(Event.IsPlayingChanged, (event: any) => {
          if (active) {
            setIsPlaying(event.playing);
          }
        });
        eventListeners.push(playbackStateListener);

      } catch (err) {
        console.log("⚠️ Native TrackPlayer not available (falling back to Expo AV):", err);
        if (active) {
          setUseNativeTrackPlayer(false);
          useNativeTrackPlayerRef.current = false;
        }
      }
    };

    initTrackPlayer();

    return () => {
      active = false;
      eventListeners.forEach(l => l.remove());
    };
  }, []);

  // Sync Loop Mode to TrackPlayer RepeatMode
  useEffect(() => {
    if (useNativeTrackPlayer) {
      try {
        const TPModule = require('@rntp/player');
        const TrackPlayer = TPModule.default || TPModule;
        const { RepeatMode } = require('@rntp/player');
        TrackPlayer.setRepeatMode(isLoop ? RepeatMode.One : RepeatMode.All);
      } catch (e) {
        console.error("Failed to sync loop mode to TrackPlayer:", e);
      }
    }
  }, [isLoop, useNativeTrackPlayer]);

  // Periodic progress tracker for TrackPlayer
  useEffect(() => {
    let interval: any;
    if (isPlaying && useNativeTrackPlayer) {
      interval = setInterval(() => {
        try {
          const TPModule = require('@rntp/player');
        const TrackPlayer = TPModule.default || TPModule;
          const progress = TrackPlayer.getProgress();
          setPosition(progress.position * 1000); // convert seconds to ms
          setDuration(progress.duration * 1000);
        } catch (e) {
          // ignore
        }
      }, 500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, useNativeTrackPlayer]);

  const setQueue = (newQueue: Music[]) => {
    setQueueState(newQueue);
    queueRef.current = newQueue;
  };

  const setCurrentIndex = (index: number) => {
    setCurrentIndexState(index);
    currentIndexRef.current = index;
  };

  const setMusicList = (list: Music[]) => {
    setMusicListState(list);
    musicListRef.current = list;
    setQueue(list); // Always update queue context so it aligns with displayed tab/search
  };

  const addToQueue = async (song: Music) => {
    const newQueue = [...queueRef.current];
    const currentIdx = currentIndexRef.current;
    
    // Insert song in FIFO order relative to other user-queued songs
    const insertIdx = currentIdx + 1 + userAddedCountRef.current;
    newQueue.splice(insertIdx, 0, song);
    setQueue(newQueue);
    userAddedCountRef.current += 1;
    console.log('➕ Queue: Added track to play next:', song.title);

    if (useNativeTrackPlayer) {
      try {
        const TPModule = require('@rntp/player');
        const TrackPlayer = TPModule.default || TPModule;
        const mediaItem = {
          mediaId: song._id,
          url: song.url,
          title: song.title,
          artist: 'Musiana Library',
          artworkUrl: song.imageUrl || undefined,
          duration: parseFloat(song.duration) || 0,
        };
        TrackPlayer.insertMediaItem(insertIdx, mediaItem);
      } catch (e) {
        console.error("TrackPlayer addToQueue error:", e);
      }
    }

    // If no song is currently playing, start playing this song
    if (!currentlyPlayingRef.current) {
      await play(song);
    }
  };

  const removeFromQueue = async (index: number) => {
    const newQueue = [...queueRef.current];
    if (index < 0 || index >= newQueue.length) return;

    newQueue.splice(index, 1);

    let nextIdx = currentIndexRef.current;
    if (index < currentIndexRef.current) {
      nextIdx -= 1;
    } else if (index === currentIndexRef.current) {
      nextIdx = Math.min(nextIdx, newQueue.length - 1);
    }

    setQueue(newQueue);
    setCurrentIndex(nextIdx);

    if (useNativeTrackPlayer) {
      try {
        const TPModule = require('@rntp/player');
        const TrackPlayer = TPModule.default || TPModule;
        TrackPlayer.removeMediaItem(index);
      } catch (e) {
        console.error("TrackPlayer removeFromQueue error:", e);
      }
    }
  };

  const reorderQueue = async (fromIndex: number, toIndex: number) => {
    const newQueue = [...queueRef.current];
    if (fromIndex < 0 || fromIndex >= newQueue.length || toIndex < 0 || toIndex >= newQueue.length) return;

    const [movedItem] = newQueue.splice(fromIndex, 1);
    newQueue.splice(toIndex, 0, movedItem);

    let nextIdx = currentIndexRef.current;
    if (fromIndex === currentIndexRef.current) {
      nextIdx = toIndex;
    } else {
      if (fromIndex < currentIndexRef.current && toIndex >= currentIndexRef.current) {
        nextIdx -= 1;
      } else if (fromIndex > currentIndexRef.current && toIndex <= currentIndexRef.current) {
        nextIdx += 1;
      }
    }

    setQueue(newQueue);
    setCurrentIndex(nextIdx);

    if (useNativeTrackPlayer) {
      try {
        const TPModule = require('@rntp/player');
        const TrackPlayer = TPModule.default || TPModule;
        const mediaItems = newQueue.map(s => ({
          mediaId: s._id,
          url: s.url,
          title: s.title,
          artist: 'Musiana Library',
          artworkUrl: s.imageUrl || undefined,
          duration: parseFloat(s.duration) || 0,
        }));
        TrackPlayer.setMediaItems(mediaItems, nextIdx);
      } catch (e) {
        console.error("TrackPlayer reorderQueue error:", e);
      }
    }
  };

  const clearQueue = async () => {
    setQueue([]);
    setCurrentIndex(-1);
    if (useNativeTrackPlayer) {
      try {
        const TPModule = require('@rntp/player');
        const TrackPlayer = TPModule.default || TPModule;
        TrackPlayer.clear();
      } catch (e) {
        console.error("TrackPlayer clearQueue error:", e);
      }
    }
  };

  const toggleShuffle = () => {
    setIsShuffle(prev => {
      const next = !prev;
      isShuffleRef.current = next;
      return next;
    });
  };

  const toggleLoop = () => {
    setIsLoop(prev => {
      const next = !prev;
      isLoopRef.current = next;
      return next;
    });
  };

  const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis);
      setDuration(status.durationMillis || 0);
      setIsPlaying(status.isPlaying);
      
      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
        playNext();
      }
    } else if (status.error) {
      console.error(`Playback error: ${status.error}`);
    }
  };

  const play = async (song: Music, skipHistoryPush = false) => {
    const loadId = ++currentLoadIdRef.current;
    userAddedCountRef.current = 0; // Reset user queue count on new track load

    try {
      console.log('🎵 Context: Playing song', song.title);
      
      // Update queue tracking index
      let songIdx = queueRef.current.findIndex(s => s._id === song._id);
      if (songIdx === -1) {
        const newQueue = [...queueRef.current];
        const insertIdx = currentIndexRef.current + 1;
        newQueue.splice(insertIdx, 0, song);
        setQueue(newQueue);
        setCurrentIndex(insertIdx);
        songIdx = insertIdx;
      } else {
        setCurrentIndex(songIdx);
      }

      // Update playback history
      if (!skipHistoryPush && currentlyPlayingRef.current && currentlyPlayingRef.current._id !== song._id) {
        const updatedHistory = [...playbackHistoryRef.current, currentlyPlayingRef.current];
        setPlaybackHistoryState(updatedHistory);
        playbackHistoryRef.current = updatedHistory;
      }

      if (useNativeTrackPlayer) {
        const TPModule = require('@rntp/player');
        const TrackPlayer = TPModule.default || TPModule;
        const mediaItems = queueRef.current.map(s => ({
          mediaId: s._id,
          url: s.url,
          title: s.title,
          artist: 'Musiana Library',
          artworkUrl: s.imageUrl || undefined,
          duration: parseFloat(s.duration) || 0,
        }));
        TrackPlayer.setMediaItems(mediaItems, songIdx);
        TrackPlayer.play();
        setCurrentlyPlaying(song);
        currentlyPlayingRef.current = song;
        setIsPlaying(true);
      } else {
        // Expo AV Fallback
        if (soundRef.current) {
          await soundRef.current.unloadAsync().catch(() => {});
          setSound(null);
          soundRef.current = null;
        }

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          staysActiveInBackground: true,
          playsInSilentModeIOS: true,
          shouldRouteThroughEarpieceIOS: false,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        } as any);

        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: song.url },
          { shouldPlay: true, progressUpdateIntervalMillis: 500 },
          onPlaybackStatusUpdate
        );

        if (loadId !== currentLoadIdRef.current) {
          await newSound.unloadAsync().catch(() => {});
          return;
        }

        setSound(newSound);
        soundRef.current = newSound;
        setCurrentlyPlaying(song);
        currentlyPlayingRef.current = song;
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('❌ Context: Play error', error);
    }
  };

  const pause = async () => {
    try {
      if (useNativeTrackPlayer) {
        const TPModule = require('@rntp/player');
        const TrackPlayer = TPModule.default || TPModule;
        TrackPlayer.pause();
        setIsPlaying(false);
      } else if (soundRef.current && isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      }
    } catch (error) {
      console.error('❌ Context: Pause error', error);
    }
  };

  const resume = async () => {
    try {
      if (useNativeTrackPlayer) {
        const TPModule = require('@rntp/player');
        const TrackPlayer = TPModule.default || TPModule;
        TrackPlayer.play();
        setIsPlaying(true);
      } else if (soundRef.current && !isPlaying) {
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('❌ Context: Resume error', error);
    }
  };

  const seek = async (positionMs: number) => {
    try {
      if (useNativeTrackPlayer) {
        const TPModule = require('@rntp/player');
        const TrackPlayer = TPModule.default || TPModule;
        TrackPlayer.seekTo(positionMs / 1000);
        setPosition(positionMs);
      } else if (soundRef.current) {
        await soundRef.current.setPositionAsync(positionMs);
        setPosition(positionMs);
      }
    } catch (error) {
      console.error('❌ Context: Seek error', error);
    }
  };

  const playNext = async () => {
    const q = queueRef.current;
    const currentIdx = currentIndexRef.current;
    
    if (q.length === 0) return;

    if (useNativeTrackPlayer) {
      try {
        const TPModule = require('@rntp/player');
        const TrackPlayer = TPModule.default || TPModule;
        TrackPlayer.skipToNext();
      } catch (e) {
        console.error("TrackPlayer playNext error:", e);
      }
      return;
    }

    if (isLoopRef.current && currentIdx !== -1) {
      await seek(0);
      if (soundRef.current) {
        await soundRef.current.playAsync();
        setIsPlaying(true);
      } else {
        await play(q[currentIdx]);
      }
      return;
    }

    if (isShuffleRef.current) {
      const randomIndex = Math.floor(Math.random() * q.length);
      await play(q[randomIndex]);
    } else {
      let nextIdx = 0;
      if (currentIdx !== -1 && currentIdx < q.length - 1) {
        nextIdx = currentIdx + 1;
      }
      await play(q[nextIdx]);
    }
  };

  const playPrevious = async () => {
    const q = queueRef.current;
    const currentIdx = currentIndexRef.current;
    if (q.length === 0) return;

    if (useNativeTrackPlayer) {
      try {
        const TPModule = require('@rntp/player');
        const TrackPlayer = TPModule.default || TPModule;
        if (position >= 3000) {
          TrackPlayer.seekTo(0);
          setPosition(0);
        } else {
          TrackPlayer.skipToPrevious();
        }
      } catch (e) {
        console.error("TrackPlayer playPrevious error:", e);
      }
      return;
    }

    if (position >= 3000) {
      await seek(0);
      if (soundRef.current) {
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
      return;
    }

    const history = playbackHistoryRef.current;
    if (history.length > 0) {
      const prevSong = history[history.length - 1];
      const updatedHistory = history.slice(0, -1);
      setPlaybackHistoryState(updatedHistory);
      playbackHistoryRef.current = updatedHistory;
      await play(prevSong, true);
    } else {
      let prevIdx = q.length - 1;
      if (currentIdx > 0) {
        prevIdx = currentIdx - 1;
      }
      await play(q[prevIdx], true);
    }
  };

  return (
    <AudioContext.Provider
      value={{
        currentlyPlaying,
        isPlaying,
        position,
        duration,
        play,
        pause,
        resume,
        seek,
        musicList,
        setMusicList,
        isShuffle,
        isLoop,
        toggleShuffle,
        toggleLoop,
        playNext,
        playPrevious,
        queue,
        currentIndex,
        addToQueue,
        removeFromQueue,
        reorderQueue,
        clearQueue,
        activePlaylistId,
        setActivePlaylistId,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};
