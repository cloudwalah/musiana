module.exports = async function () {
  try {
    const TrackPlayer = require('react-native-track-player').default;
    const { Event } = require('react-native-track-player');
    
    TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
    TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
    TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
    TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
    TrackPlayer.addEventListener(Event.RemoteSeek, (event) => TrackPlayer.seekTo(event.position));
  } catch (e) {
    console.log("TrackPlayer background events registration failed:", e);
  }
};
