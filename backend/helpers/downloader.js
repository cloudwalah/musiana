const { exec, spawn } = require('child_process');

const path = require('path');

// 1. Add local bin directory (for standalone yt-dlp download) to PATH
const localBin = path.join(__dirname, '../bin');
if (process.env.PATH && !process.env.PATH.includes(localBin)) {
  process.env.PATH = `${localBin}:${process.env.PATH}`;
}

// 2. Add ffmpeg-static path to environment PATH so yt-dlp/node can locate ffmpeg
try {
  const ffmpeg = require('ffmpeg-static');
  if (ffmpeg) {
    const ffmpegDir = path.dirname(ffmpeg);
    if (process.env.PATH && !process.env.PATH.includes(ffmpegDir)) {
      process.env.PATH = `${ffmpegDir}:${process.env.PATH}`;
    }
  }
} catch (ffmpegErr) {
  console.warn('⚠️ Could not load ffmpeg-static:', ffmpegErr.message);
}

// 3. On macOS (local dev): ensure Homebrew binaries are in PATH
if (process.platform === 'darwin' && process.env.PATH && !process.env.PATH.includes('/opt/homebrew/bin')) {
  process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`;
}
const util = require('util');
const fs = require('fs');
const cloudinary = require('../config/cloudinary');
const Music = require('../models/Music');

const execPromise = util.promisify(exec);

// Path to cookies.txt if provided (Render Secret File or local copy)
let cookiesPath = null;
const potentialCookiesPaths = [
  path.join(__dirname, '../cookies.txt'),          // backend/cookies.txt
  path.join(__dirname, '../../cookies.txt'),       // repository root/cookies.txt
  '/etc/secrets/cookies.txt',                      // Render default secret file path
  '/opt/render/project/src/cookies.txt',           // absolute path on Render repo root
  '/opt/render/project/src/backend/cookies.txt'    // absolute path on Render backend
];
for (const p of potentialCookiesPaths) {
  if (fs.existsSync(p)) {
    cookiesPath = p;
    break;
  }
}
const hasCookies = cookiesPath !== null;

// Map to track active download states and progress in real-time
// Key: cleanQuery (trimmed, lowercase)
// Value: { status: 'searching' | 'downloading' | 'uploading' | 'failed', progress: number, error?: string, timestamp: number }
const downloadStates = new Map();

/**
 * Background worker to download audio from YouTube, upload to Cloudinary, and save to MongoDB
 * @param {string} query 
 */
const downloadAndUpload = async (query, resolvedVideoId = null, resolvedTitle = null, resolvedImageUrl = null) => {
  const cleanQuery = query.trim().toLowerCase();
  
  if (downloadStates.has(cleanQuery)) {
    const currentState = downloadStates.get(cleanQuery);
    if (currentState.status !== 'failed') {
      console.log(`⏩ Already downloading query: "${query}"`);
      return;
    }
  }

  // Initialize status as searching
  downloadStates.set(cleanQuery, {
    status: 'searching',
    progress: 0,
    timestamp: Date.now()
  });
  
  console.log(`📥 Downloader started for query: "${query}" (Video ID: ${resolvedVideoId})`);

  let tempFile = '';

  try {
    let title = resolvedTitle;
    let videoId = resolvedVideoId;
    let thumbnailUrl = resolvedImageUrl;

    // 1. Search YouTube if videoId was not passed directly
    if (!videoId) {
      console.log(`🔍 Searching YouTube for: "${query}"`);
      const cookiesArg = hasCookies ? `--cookies "${cookiesPath}" --extractor-args "youtube:player_client=android"` : `--extractor-args "youtube:player_client=android"`;
      const { stdout } = await execPromise(`yt-dlp ${cookiesArg} --js-runtimes node --remote-components ejs:github --print "%(title)s###%(id)s###%(thumbnail)s" "ytsearch1:${query}"`);
      
      const parts = stdout.trim().split('###');
      if (parts.length < 3) {
        throw new Error('Failed to parse metadata from search results');
      }

      title = parts[0].trim();
      videoId = parts[1].trim();
      thumbnailUrl = parts[2].trim();
    }

    console.log(`🎵 Found on YouTube: "${title}" (ID: ${videoId})`);

    // Check if the exact title has been created while search was running
    const existing = await Music.findOne({ title });
    if (existing) {
      console.log(`⏩ Song "${title}" already exists in DB, skipping download.`);
      
      // Update its searchQueries to map this spelling to this song
      if (!existing.searchQueries) {
        existing.searchQueries = [];
      }
      if (!existing.searchQueries.includes(cleanQuery)) {
        existing.searchQueries.push(cleanQuery);
        await existing.save();
      }

      // Mark the state as success and pass the data so polling retrieves it
      downloadStates.set(cleanQuery, {
        status: 'success',
        progress: 100,
        data: existing,
        timestamp: Date.now()
      });

      // Automatically clean up this state from map in 20 seconds
      setTimeout(() => {
        if (downloadStates.get(cleanQuery)?.status === 'success') {
          downloadStates.delete(cleanQuery);
        }
      }, 20000);

      return;
    }

    // 2. Download and transcode audio to local temporary file
    tempFile = path.join(__dirname, `../uploads/temp_${Date.now()}`);
    console.log(`📥 Downloading audio stream from YouTube...`);
    
    // Update state to downloading
    downloadStates.set(cleanQuery, {
      status: 'downloading',
      progress: 0,
      timestamp: Date.now()
    });

    const downloadArgs = [];
    if (hasCookies) {
      downloadArgs.push('--cookies', cookiesPath);
    }
    downloadArgs.push(
      '--extractor-args', 'youtube:player_client=android',
      '--js-runtimes', 'node',
      '--remote-components', 'ejs:github',
      '--extract-audio',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '0',
      '--output',
      `${tempFile}.%(ext)s`,
      `https://www.youtube.com/watch?v=${videoId}`
    );

    const downloadProcess = spawn('yt-dlp', downloadArgs);

    await new Promise((resolve, reject) => {
      downloadProcess.stdout.on('data', (data) => {
        const str = data.toString();
        const match = str.match(/\[download\]\s+([\d.]+)%/);
        if (match) {
          const progress = parseFloat(match[1]);
          console.log(`📥 Download progress for "${query}": ${progress}%`);
          downloadStates.set(cleanQuery, {
            status: 'downloading',
            progress: Math.round(progress),
            timestamp: Date.now()
          });
        }
      });

      downloadProcess.stderr.on('data', (data) => {
        // Log stderr warnings but don't fail yet
        console.log(`yt-dlp stderr: ${data.toString().trim()}`);
      });

      downloadProcess.on('error', (err) => {
        console.error('Spawn error:', err);
        reject(err);
      });

      downloadProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`yt-dlp exited with code ${code}`));
        }
      });
    });

    const localFile = `${tempFile}.mp3`;
    if (!fs.existsSync(localFile)) {
      throw new Error('Transcoded audio file was not found on local disk');
    }

    console.log(`📤 Uploading "${title}" to Cloudinary...`);
    
    // Update state to uploading
    downloadStates.set(cleanQuery, {
      status: 'uploading',
      progress: 90,
      timestamp: Date.now()
    });

    // 3. Upload audio file to Cloudinary
    const audioResult = await cloudinary.uploader.upload(localFile, {
      resource_type: 'video',
      folder: 'audio_files',
      format: 'mp3'
    });

    // 4. Upload thumbnail cover image to Cloudinary
    let imageUrl = '';
    if (thumbnailUrl) {
      try {
        console.log(`📤 Uploading cover art image to Cloudinary...`);
        const imgResult = await cloudinary.uploader.upload(thumbnailUrl, {
          folder: 'audio_covers'
        });
        imageUrl = imgResult.secure_url;
      } catch (imgError) {
        console.error('⚠️ Cover art upload failed:', imgError.message);
      }
    }

    // 5. Convert duration in seconds to mm:ss format
    const durationInSec = Math.ceil(audioResult.duration);
    const minutes = Math.floor(durationInSec / 60);
    const seconds = (durationInSec - minutes * 60).toString().padStart(2, '0');
    const formattedDuration = `${minutes}:${seconds}`;

    // 6. Save document to MongoDB
    const newMusic = await Music.create({
      title,
      url: audioResult.secure_url,
      public_id: audioResult.public_id,
      duration: formattedDuration,
      imageUrl,
      searchQueries: [cleanQuery]
    });

    console.log(`✅ Successfully auto-downloaded and registered "${title}"`);
    
    // Set status to success so polling returns the new record
    downloadStates.set(cleanQuery, {
      status: 'success',
      progress: 100,
      data: newMusic,
      timestamp: Date.now()
    });

    // Clean up from state map after 20 seconds
    setTimeout(() => {
      if (downloadStates.get(cleanQuery)?.status === 'success') {
        downloadStates.delete(cleanQuery);
      }
    }, 20000);

  } catch (error) {
    console.error(`❌ Downloader failed for query "${query}":`, error.message);
    downloadStates.set(cleanQuery, {
      status: 'failed',
      progress: 0,
      error: error.message,
      timestamp: Date.now()
    });

    // Automatically remove failed state after 5 minutes so user can retry later
    setTimeout(() => {
      if (downloadStates.get(cleanQuery)?.status === 'failed') {
        downloadStates.delete(cleanQuery);
        console.log(`🧹 Cleared failed status for query: "${query}"`);
      }
    }, 5 * 60 * 1000);

  } finally {
    // Clean up temporary local files
    if (tempFile) {
      const localFile = `${tempFile}.mp3`;
      if (fs.existsSync(localFile)) {
        try {
          fs.unlinkSync(localFile);
          console.log(`🧹 Deleted temporary file: ${localFile}`);
        } catch (cleanupError) {
          console.error(`⚠️ Failed to delete temp file ${localFile}:`, cleanupError.message);
        }
      }
    }
  }
};

const fetchYouTubeMetadata = async (query) => {
  try {
    const cookiesArg = hasCookies ? `--cookies "${cookiesPath}" --extractor-args "youtube:player_client=android"` : `--extractor-args "youtube:player_client=android"`;
    const { stdout } = await execPromise(`yt-dlp ${cookiesArg} --js-runtimes node --remote-components ejs:github --print "%(title)s###%(id)s###%(thumbnail)s" "ytsearch1:${query}"`);
    
    const parts = stdout.trim().split('###');
    if (parts.length < 3) {
      return null;
    }
    return {
      title: parts[0].trim(),
      videoId: parts[1].trim(),
      thumbnailUrl: parts[2].trim()
    };
  } catch (error) {
    console.error(`❌ Error fetching YouTube metadata for query "${query}":`, error.message);
    return null;
  }
};

const fetchMultipleYouTubeMetadata = async (query, count = 5) => {
  try {
    const cookiesArg = hasCookies ? `--cookies "${cookiesPath}" --extractor-args "youtube:player_client=android"` : `--extractor-args "youtube:player_client=android"`;
    const { stdout } = await execPromise(`yt-dlp ${cookiesArg} --js-runtimes node --remote-components ejs:github --print "%(title)s###%(id)s###%(thumbnail)s" "ytsearch${count}:${query}"`);
    
    const lines = stdout.trim().split('\n').filter(Boolean);
    const results = [];
    for (const line of lines) {
      const parts = line.split('###');
      if (parts.length >= 3) {
        results.push({
          title: parts[0].trim(),
          videoId: parts[1].trim(),
          thumbnailUrl: parts[2].trim()
        });
      }
    }
    return results;
  } catch (error) {
    console.error(`❌ Error fetching multiple YouTube metadata for query "${query}":`, error.message);
    return [];
  }
};

module.exports = {
  downloadStates,
  downloadAndUpload,
  fetchYouTubeMetadata,
  fetchMultipleYouTubeMetadata
};
