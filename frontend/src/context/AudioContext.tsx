import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Audio, AVPlaybackStatus, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';

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

  // Sync state reference variables
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);

  // Clean up sound on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

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
    
    // Auto-populate queue with library list if queue is empty
    if (queueRef.current.length === 0) {
      setQueue(list);
    }
  };

  const addToQueue = (song: Music) => {
    const newQueue = [...queueRef.current];
    const currentIdx = currentIndexRef.current;
    
    // Insert song right after the current index so it plays next
    newQueue.splice(currentIdx + 1, 0, song);
    setQueue(newQueue);
    console.log('➕ Queue: Added track to play next:', song.title);
  };

  const removeFromQueue = (index: number) => {
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
  };

  const reorderQueue = (fromIndex: number, toIndex: number) => {
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
  };

  const clearQueue = () => {
    setQueue([]);
    setCurrentIndex(-1);
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
        // Automatically play next song on completion
        playNext();
      }
    } else if (status.error) {
      console.error(`Playback error: ${status.error}`);
    }
  };

  const play = async (song: Music, skipHistoryPush = false) => {
    // Increment load ID to track this specific playback request
    const loadId = ++currentLoadIdRef.current;

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
      } else {
        setCurrentIndex(songIdx);
      }

      // Update playback history if playing a new song (and not going back via previous)
      if (!skipHistoryPush && currentlyPlayingRef.current && currentlyPlayingRef.current._id !== song._id) {
        const updatedHistory = [...playbackHistoryRef.current, currentlyPlayingRef.current];
        setPlaybackHistoryState(updatedHistory);
        playbackHistoryRef.current = updatedHistory;
      }

      // If there's an existing sound, stop and unload it first
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        setSound(null);
        soundRef.current = null;
      }

      // Configure audio mode
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

      // Check if a newer play request was triggered while loading this song
      if (loadId !== currentLoadIdRef.current) {
        console.log(`⏩ Context: Play request for "${song.title}" was superseded, discarding.`);
        await newSound.unloadAsync();
        return;
      }

      setSound(newSound);
      soundRef.current = newSound;
      setCurrentlyPlaying(song);
      currentlyPlayingRef.current = song;
      setIsPlaying(true);
    } catch (error) {
      console.error('❌ Context: Play error', error);
    }
  };

  const pause = async () => {
    try {
      if (soundRef.current && isPlaying) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
      }
    } catch (error) {
      console.error('❌ Context: Pause error', error);
    }
  };

  const resume = async () => {
    try {
      if (soundRef.current && !isPlaying) {
        await soundRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('❌ Context: Resume error', error);
    }
  };

  const seek = async (positionMs: number) => {
    try {
      if (soundRef.current) {
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
