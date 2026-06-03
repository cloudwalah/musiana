const { downloadStates, downloadAndUpload, fetchYouTubeMetadata, fetchMultipleYouTubeMetadata } = require('../helpers/downloader');
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

    const includePreview = req.query.includePreview === 'true';
    let previews = [];

    if (includePreview) {
      // Fetch multiple YouTube metadata previews (top 5 options)
      const metadataList = await fetchMultipleYouTubeMetadata(cleanQuery, 5);
      if (metadataList && metadataList.length > 0) {
        previews = metadataList.map(metadata => ({
          _id: `preview-${metadata.videoId}`,
          title: metadata.title,
          imageUrl: metadata.thumbnailUrl,
          query: cleanQuery,
          videoId: metadata.videoId,
          isPreview: true
        }));
      }
    }

    if (type === 'both' || type === 'songs') {
      return res.status(200).json({
        success: true,
        downloading: false,
        data: {
          songs: [],
          playlists,
          previews
        }
      });
    } else {
      return res.status(200).json({
        success: true,
        downloading: false,
        data: {
          songs: [],
          previews
        }
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

/**
 * POST /api/search/download
 */
const triggerDownload = async (req, res) => {
  try {
    const { query, videoId, title, imageUrl } = req.body;

    if (!query || query.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Query parameter "query" is required in request body'
      });
    }

    const cleanQuery = query.trim();
    const cleanQueryLower = cleanQuery.toLowerCase();

    // Check if song already exists in DB by title (if title is provided) or by query
    let existing = null;
    if (title) {
      existing = await Music.findOne({ title });
    }
    if (!existing) {
      existing = await Music.findOne({
        $or: [
          { title: { $regex: cleanQuery, $options: 'i' } },
          { searchQueries: cleanQueryLower }
        ]
      });
    }

    if (existing) {
      return res.status(200).json({
        success: true,
        downloading: false,
        data: existing,
        message: 'Song already available'
      });
    }

    // Check if already downloading
    const activeState = downloadStates.get(cleanQueryLower);
    if (activeState && activeState.status !== 'failed') {
      return res.status(200).json({
        success: true,
        downloading: true,
        status: activeState.status,
        progress: activeState.progress,
        message: `Download already in progress`
      });
    }

    // Trigger download asynchronously, passing video details
    downloadAndUpload(cleanQuery, videoId, title, imageUrl);

    return res.status(202).json({
      success: true,
      downloading: true,
      status: 'searching',
      progress: 0,
      message: `Searching the cloud and downloading "${cleanQuery}"... This will take a few moments.`
    });

  } catch (error) {
    console.error('❌ Trigger Download Controller Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message
    });
  }
};

module.exports = {
  searchMusic,
  triggerDownload
};
