const Playlist = require('../models/Playlist');
const Music = require('../models/Music');

// Helper to get or lazily create default Liked playlist
const getOrCreateLikedPlaylist = async (userId) => {
  let likedPlaylist = await Playlist.findOne({ user: userId, isDefault: true });
  if (!likedPlaylist) {
    likedPlaylist = await Playlist.create({
      name: 'Liked',
      user: userId,
      isDefault: true,
      isPrivate: true,
      songs: []
    });
  }
  return likedPlaylist;
};

// GET /api/playlists
const getUserPlaylists = async (req, res) => {
  const userId = req.userInfo.userId;
  try {
    // Lazily ensure Liked playlist exists
    await getOrCreateLikedPlaylist(userId);

    // Fetch all playlists of the user, populating the songs
    const playlists = await Playlist.find({ user: userId })
      .populate('songs')
      .sort({ isDefault: -1, createdAt: -1 }); // Default Liked playlist first, then newest custom

    return res.status(200).json({
      success: true,
      data: playlists
    });
  } catch (error) {
    console.error('❌ getUserPlaylists Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch playlists',
      error: error.message
    });
  }
};

// POST /api/playlists
const createPlaylist = async (req, res) => {
  const userId = req.userInfo.userId;
  const { name, isPrivate, tags } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({
      success: false,
      message: 'Playlist name is required'
    });
  }

  if (name.trim().toLowerCase() === 'liked') {
    return res.status(400).json({
      success: false,
      message: 'The name "Liked" is reserved for the default liked playlist.'
    });
  }

  try {
    const cleanTags = Array.isArray(tags) 
      ? tags.map(t => t.trim().toLowerCase()).filter(Boolean) 
      : [];

    const newPlaylist = await Playlist.create({
      name: name.trim(),
      user: userId,
      isDefault: false,
      isPrivate: isPrivate !== undefined ? isPrivate : true,
      tags: cleanTags,
      songs: []
    });

    return res.status(201).json({
      success: true,
      message: 'Playlist created successfully',
      data: newPlaylist
    });
  } catch (error) {
    console.error('❌ createPlaylist Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create playlist',
      error: error.message
    });
  }
};

// DELETE /api/playlists/:id
const deletePlaylist = async (req, res) => {
  const userId = req.userInfo.userId;
  const { id } = req.params;

  try {
    const playlist = await Playlist.findOne({ _id: id, user: userId });
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }

    if (playlist.isDefault) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete the default liked songs playlist.'
      });
    }

    await Playlist.deleteOne({ _id: id });

    return res.status(200).json({
      success: true,
      message: 'Playlist deleted successfully'
    });
  } catch (error) {
    console.error('❌ deletePlaylist Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete playlist',
      error: error.message
    });
  }
};

// POST /api/playlists/:id/songs
const addSongToPlaylist = async (req, res) => {
  const userId = req.userInfo.userId;
  const { id } = req.params;
  const { songId } = req.body;

  if (!songId) {
    return res.status(400).json({
      success: false,
      message: 'Song ID is required'
    });
  }

  try {
    const playlist = await Playlist.findOne({ _id: id, user: userId });
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }

    const song = await Music.findById(songId);
    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    // Check if song already in playlist
    if (playlist.songs.includes(songId)) {
      return res.status(400).json({
        success: false,
        message: 'Song already exists in this playlist'
      });
    }

    playlist.songs.push(songId);
    await playlist.save();

    // Populate songs to return updated list
    const updated = await Playlist.findById(id).populate('songs');

    return res.status(200).json({
      success: true,
      message: 'Song added to playlist successfully',
      data: updated
    });
  } catch (error) {
    console.error('❌ addSongToPlaylist Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add song to playlist',
      error: error.message
    });
  }
};

// DELETE /api/playlists/:id/songs/:songId
const removeSongFromPlaylist = async (req, res) => {
  const userId = req.userInfo.userId;
  const { id, songId } = req.params;

  try {
    const playlist = await Playlist.findOne({ _id: id, user: userId });
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }

    // Check if song exists in playlist
    if (!playlist.songs.includes(songId)) {
      return res.status(400).json({
        success: false,
        message: 'Song is not in this playlist'
      });
    }

    playlist.songs = playlist.songs.filter(s => s.toString() !== songId);
    await playlist.save();

    const updated = await Playlist.findById(id).populate('songs');

    return res.status(200).json({
      success: true,
      message: 'Song removed from playlist successfully',
      data: updated
    });
  } catch (error) {
    console.error('❌ removeSongFromPlaylist Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove song from playlist',
      error: error.message
    });
  }
};

// POST /api/playlists/like/:songId
const toggleLikeSong = async (req, res) => {
  const userId = req.userInfo.userId;
  const { songId } = req.params;

  try {
    const song = await Music.findById(songId);
    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    const likedPlaylist = await getOrCreateLikedPlaylist(userId);

    const isLiked = likedPlaylist.songs.includes(songId);
    let liked = false;

    if (isLiked) {
      likedPlaylist.songs = likedPlaylist.songs.filter(s => s.toString() !== songId);
      liked = false;
    } else {
      likedPlaylist.songs.push(songId);
      liked = true;
    }

    await likedPlaylist.save();

    return res.status(200).json({
      success: true,
      message: liked ? 'Song liked successfully' : 'Song unliked successfully',
      liked
    });
  } catch (error) {
    console.error('❌ toggleLikeSong Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to toggle like on song',
      error: error.message
    });
  }
};

// GET /api/playlists/like/:songId
const checkSongLiked = async (req, res) => {
  const userId = req.userInfo.userId;
  const { songId } = req.params;

  try {
    const likedPlaylist = await getOrCreateLikedPlaylist(userId);
    const liked = likedPlaylist.songs.includes(songId);

    return res.status(200).json({
      success: true,
      liked
    });
  } catch (error) {
    console.error('❌ checkSongLiked Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check if song is liked',
    });
  }
};

// PATCH /api/playlists/:id
const updatePlaylist = async (req, res) => {
  const userId = req.userInfo.userId;
  const { id } = req.params;
  const { isPrivate, name, tags } = req.body;

  try {
    const playlist = await Playlist.findOne({ _id: id, user: userId });
    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: 'Playlist not found'
      });
    }

    if (playlist.isDefault) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify the default liked songs playlist.'
      });
    }

    if (isPrivate !== undefined) playlist.isPrivate = isPrivate;
    if (name !== undefined) playlist.name = name.trim();
    if (tags !== undefined) {
      playlist.tags = Array.isArray(tags)
        ? tags.map(t => t.trim().toLowerCase()).filter(Boolean)
        : tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    }

    await playlist.save();

    return res.status(200).json({
      success: true,
      message: 'Playlist updated successfully',
      data: playlist
    });
  } catch (error) {
    console.error('❌ updatePlaylist Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update playlist',
      error: error.message
    });
  }
};

module.exports = {
  getUserPlaylists,
  createPlaylist,
  deletePlaylist,
  addSongToPlaylist,
  removeSongFromPlaylist,
  toggleLikeSong,
  checkSongLiked,
  updatePlaylist
};
