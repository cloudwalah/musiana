const { downloadStates, downloadAndUpload } = require('../helpers/downloader');
const Music = require('../models/Music');

/**
 * GET /api/search?q=song_title
 */
const searchMusic = async (req, res) => {
  try {
    const query = req.query.q;
    if (!query || query.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Query parameter "q" is required'
      });
    }

    const cleanQuery = query.trim();
    const cleanQueryLower = cleanQuery.toLowerCase();

    // 1. Search existing music in MongoDB first (case-insensitive title regex OR matching search query alias)
    const results = await Music.find({
      $or: [
        { title: { $regex: cleanQuery, $options: 'i' } },
        { searchQueries: cleanQueryLower }
      ]
    });

    if (results.length > 0) {
      return res.status(200).json({
        success: true,
        downloading: false,
        data: results
      });
    }

    // 2. If not found in DB, check if it is already in the download queue
    const activeState = downloadStates.get(cleanQueryLower);

    if (activeState) {
      if (activeState.status === 'failed') {
        return res.status(200).json({
          success: false,
          downloading: false,
          error: 'Song not available, please check again later!'
        });
      }

      if (activeState.status === 'success') {
        // Immediately return the song if the download finished during polling
        return res.status(200).json({
          success: true,
          downloading: false,
          data: [activeState.data]
        });
      }

      return res.status(200).json({
        success: true,
        downloading: true,
        status: activeState.status,
        progress: activeState.progress,
        message: `Downloading "${cleanQuery}": ${activeState.status} (${activeState.progress}%)`
      });
    }

    // 3. Trigger download process asynchronously (run in background, don't wait)
    downloadAndUpload(cleanQuery);

    return res.status(202).json({
      success: true,
      downloading: true,
      status: 'searching',
      progress: 0,
      message: `Searching the cloud and downloading "${cleanQuery}"... This will take a few moments.`
    });

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
