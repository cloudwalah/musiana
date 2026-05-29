import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';

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

  // Refs to avoid stale React closures inside AVPlayback callbacks
  const soundRef = useRef<Audio.Sound | null>(null);
  const musicListRef = useRef<Music[]>([]);
  const currentlyPlayingRef = useRef<Music | null>(null);
  const isShuffleRef = useRef<boolean>(false);
  const isLoopRef = useRef<boolean>(false);
  const playbackHistoryRef = useRef<Music[]>([]);

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

  const setMusicList = (list: Music[]) => {
    setMusicListState(list);
    musicListRef.current = list;
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
    try {
      console.log('🎵 Context: Playing song', song.title);
      
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
      } as any);

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: song.url },
        { shouldPlay: true, progressUpdateIntervalMillis: 500 },
        onPlaybackStatusUpdate
      );

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
    const list = musicListRef.current;
    const current = currentlyPlayingRef.current;
    
    if (list.length === 0) return;

    if (isLoopRef.current && current) {
      // Loop current: replay current song
      await seek(0);
      if (soundRef.current) {
        await soundRef.current.playAsync();
        setIsPlaying(true);
      } else {
        await play(current);
      }
      return;
    }

    if (isShuffleRef.current) {
      // Shuffle: choose a random song in list
      const randomIndex = Math.floor(Math.random() * list.length);
      const nextSong = list[randomIndex];
      await play(nextSong);
    } else {
      // Linear next in playlist list
      let nextIndex = 0;
      if (current) {
        const currentIndex = list.findIndex(s => s._id === current._id);
        if (currentIndex !== -1 && currentIndex < list.length - 1) {
          nextIndex = currentIndex + 1;
        }
      }
      const nextSong = list[nextIndex];
      await play(nextSong);
    }
  };

  const playPrevious = async () => {
    const current = currentlyPlayingRef.current;
    if (!current) return;

    // Reset song if current progress is >= 3 seconds
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
      // Go back to the previously played song in history stack
      const prevSong = history[history.length - 1];
      const updatedHistory = history.slice(0, -1);
      setPlaybackHistoryState(updatedHistory);
      playbackHistoryRef.current = updatedHistory;
      await play(prevSong, true); // skipHistoryPush = true
    } else {
      // No history, fallback to linear previous in musicList
      const list = musicListRef.current;
      if (list.length === 0) return;
      let prevIndex = list.length - 1;
      const currentIndex = list.findIndex(s => s._id === current._id);
      if (currentIndex > 0) {
        prevIndex = currentIndex - 1;
      }
      const prevSong = list[prevIndex];
      await play(prevSong, true); // skipHistoryPush = true
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
