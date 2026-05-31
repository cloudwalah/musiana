const express = require('express');
const {
  getUserPlaylists,
  createPlaylist,
  deletePlaylist,
  addSongToPlaylist,
  removeSongFromPlaylist,
  toggleLikeSong,
  checkSongLiked
} = require('../controllers/playlist-controller');
const authMiddleware = require('../middlewares/auth-middleware');

const router = express.Router();

// Apply authMiddleware to all playlist routes
router.use(authMiddleware);

// GET /api/playlists - Get all playlists for logged-in user
router.get('/', getUserPlaylists);

// POST /api/playlists - Create new playlist
router.post('/', createPlaylist);

// DELETE /api/playlists/:id - Delete playlist
router.delete('/:id', deletePlaylist);

// POST /api/playlists/:id/songs - Add a song to playlist
router.post('/:id/songs', addSongToPlaylist);

// DELETE /api/playlists/:id/songs/:songId - Remove a song from playlist
router.delete('/:id/songs/:songId', removeSongFromPlaylist);

// POST /api/playlists/like/:songId - Toggle like on a song
router.post('/like/:songId', toggleLikeSong);

// GET /api/playlists/like/:songId - Check if a song is liked
router.get('/like/:songId', checkSongLiked);

module.exports = router;
