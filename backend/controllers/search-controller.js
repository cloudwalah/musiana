const { downloadStates, downloadAndUpload } = require('../helpers/downloader');
const Music = require('../models/Music');

/**
 * GET /api/search?q=song_title
 */
const Playlist = require('../models/Playlist');

/**
 * GET /api/search?q=song_title&type=songs|playlists|both
 */
const searchMusic = async (req, res) => {
  try {
    const query = req.query.q;
    const type = req.query.type; // 'songs', 'playlists', or 'both'

    if (!query || query.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Query parameter "q" is required'
      });
    }

    const cleanQuery = query.trim();
    const cleanQueryLower = cleanQuery.toLowerCase();

    // 1. If searching ONLY public playlists
    if (type === 'playlists') {
      const playlists = await Playlist.find({
        isPrivate: false,
        $or: [
          { name: { $regex: cleanQuery, $options: 'i' } },
          { tags: { $regex: cleanQuery, $options: 'i' } }
        ]
      }).populate('songs').populate('user', 'username');

      return res.status(200).json({
        success: true,
        downloading: false,
        data: {
          songs: [],
          playlists
        }
      });
    }

    // 2. Fetch songs matching query
    const songs = await Music.find({
      $or: [
        { title: { $regex: cleanQuery, $options: 'i' } },
        { searchQueries: cleanQueryLower }
      ]
    });

    let playlists = [];
    if (type === 'both') {
      playlists = await Playlist.find({
        isPrivate: false,
        $or: [
          { name: { $regex: cleanQuery, $options: 'i' } },
          { tags: { $regex: cleanQuery, $options: 'i' } }
        ]
      }).populate('songs').populate('user', 'username');
    }

    // If songs are found in DB, return them
    if (songs.length > 0) {
      if (type === 'both' || type === 'songs') {
        return res.status(200).json({
          success: true,
          downloading: false,
          data: {
            songs,
            playlists
          }
        });
      } else {
        // Legacy direct array format
        return res.status(200).json({
          success: true,
          downloading: false,
          data: songs
        });
      }
    }

    // If no songs found in DB, check active download queue
    const activeState = downloadStates.get(cleanQueryLower);

    if (activeState) {
      if (activeState.status === 'failed') {
        if (type === 'both' || type === 'songs') {
          return res.status(200).json({
            success: false,
            downloading: false,
            data: { songs: [], playlists },
            error: 'Song not available, please check again later!'
          });
        } else {
          return res.status(200).json({
            success: false,
            downloading: false,
            error: 'Song not available, please check again later!'
          });
        }
      }

      if (activeState.status === 'success') {
        if (type === 'both' || type === 'songs') {
          return res.status(200).json({
            success: true,
            downloading: false,
            data: {
              songs: [activeState.data],
              playlists
            }
          });
        } else {
          return res.status(200).json({
            success: true,
            downloading: false,
            data: [activeState.data]
          });
        }
      }

      // Downloading in progress
      if (type === 'both' || type === 'songs') {
        return res.status(200).json({
          success: true,
          downloading: true,
          status: activeState.status,
          progress: activeState.progress,
          data: { songs: [], playlists },
          message: `Downloading "${cleanQuery}": ${activeState.status} (${activeState.progress}%)`
        });
      } else {
        return res.status(200).json({
          success: true,
          downloading: true,
          status: activeState.status,
          progress: activeState.progress,
          message: `Downloading "${cleanQuery}": ${activeState.status} (${activeState.progress}%)`
        });
      }
    }

    // Trigger download process asynchronously
    downloadAndUpload(cleanQuery);

    if (type === 'both' || type === 'songs') {
      return res.status(202).json({
        success: true,
        downloading: true,
        status: 'searching',
        progress: 0,
        data: { songs: [], playlists },
        message: `Searching the cloud and downloading "${cleanQuery}"... This will take a few moments.`
      });
    } else {
      return res.status(202).json({
        success: true,
        downloading: true,
        status: 'searching',
        progress: 0,
        message: `Searching the cloud and downloading "${cleanQuery}"... This will take a few moments.`
      });
    }

  } catch (error) {
    console.error('❌ Search Controller Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message
    });
  }
};

module.exports = {
  searchMusic
};
