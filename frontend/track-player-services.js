// V5 (@rntp/player) background event handler
// This is registered via TrackPlayer.registerBackgroundEventHandler() in _layout.tsx
// With V5's default 'native' handling, remote commands (play/pause/next/prev/seek)
// are handled natively without JS — this handler is only needed for custom logic.
// For now we keep it minimal and let native handling do the work.

module.exports = function () {
  return async function (event) {
    // V5 handles play/pause/next/prev/seek natively by default.
    // Add custom logic here if needed (e.g., analytics, custom skip behavior).
    console.log('Background event:', event.type);
  };
};
