import { Stack } from 'expo-router';
import { AudioProvider } from '../src/context/AudioContext';

try {
  const TrackPlayer = require('react-native-track-player').default;
  TrackPlayer.registerPlaybackService(() => require('../track-player-services'));
} catch (e) {
  console.log("TrackPlayer playback service skipped (running in Expo Go)");
}

export default function RootLayout() {
  return (
    <AudioProvider>
      <Stack screenOptions={{ contentStyle: { backgroundColor: '#130D22' } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
        <Stack.Screen 
          name="home" 
          options={{ 
            title: 'Home',
            headerShown: false  // Hide default header, we have custom one
          }} 
        />
        <Stack.Screen 
          name="player" 
          options={{ 
            presentation: 'modal',
            headerShown: false
          }} 
        />
      </Stack>
    </AudioProvider>
  );
}