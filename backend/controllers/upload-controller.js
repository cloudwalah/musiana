const uploadToCloud = require('../helpers/uploader')
const Music = require('../models/Music')

const uploadAudio = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please provide an audio file'
            })
        }

        if (!req.body.title) {
            return res.status(400).json({
                success: false,
                message: 'Please provide the title of the audio file'
            })
        }

        const { url, public_id, duration } = await uploadToCloud(req.file.path)

        const durationInSec = Math.ceil(duration)
        const minutes = Math.floor(durationInSec / 60)
        const seconds = (durationInSec - minutes * 60).toString().padStart(2, '0')

        const time = `${minutes}:${seconds}`

        const newMusic = await Music.create({
            title: req.body.title, url, public_id, duration: time
        })

        return res.status(200).json({
            success: true,
            message: 'Audio uploaded successfully',
            data: newMusic
        })
    } catch (error) {
        console.error('Upload error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to upload audio',
            error: error.message
        })
    }
}

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const path = require('path');
const fs = require('fs');
const https = require('https');
const ffmpegStatic = require('ffmpeg-static');
const cloudinary = require('../config/cloudinary');

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: status ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
};

const trimAudio = async (req, res) => {
  const { id } = req.params;
  const { startTime, endTime } = req.body; // in seconds, e.g. 10.5 or 120.0

  if (startTime === undefined || isNaN(startTime) || startTime < 0) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid startTime in seconds'
    });
  }

  if (endTime === undefined || isNaN(endTime) || endTime <= startTime) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid endTime in seconds that is greater than startTime'
    });
  }

  const tempInput = path.join(__dirname, `../uploads/trim_in_${Date.now()}.mp3`);
  const tempOutput = path.join(__dirname, `../uploads/trim_out_${Date.now()}.mp3`);

  try {
    // 1. Fetch song details
    const music = await Music.findById(id);
    if (!music) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    console.log(`✂️ Trimming song "${music.title}" from ${startTime}s to ${endTime}s...`);

    // 2. Download original audio from Cloudinary
    console.log(`📥 Downloading original track: ${music.url}`);
    await downloadFile(music.url, tempInput);

    // 3. Trim using ffmpeg-static
    console.log(`🎬 Running ffmpeg trim command...`);
    const duration = endTime - startTime;
    const cmd = `"${ffmpegStatic}" -y -ss ${startTime} -t ${duration} -i "${tempInput}" -acodec copy "${tempOutput}"`;
    await execPromise(cmd);

    if (!fs.existsSync(tempOutput)) {
      throw new Error('Trimmed file was not outputted by ffmpeg');
    }

    // 4. Upload trimmed file to Cloudinary
    console.log(`📤 Uploading trimmed file to Cloudinary...`);
    const uploadResult = await cloudinary.uploader.upload(tempOutput, {
      resource_type: 'video',
      folder: 'audio_files',
      format: 'mp3'
    });

    // 5. Delete old audio from Cloudinary
    if (music.public_id) {
      try {
        console.log(`🗑 Deleting old asset from Cloudinary: ${music.public_id}`);
        await cloudinary.uploader.destroy(music.public_id, { resource_type: 'video' });
      } catch (destroyError) {
        console.warn('⚠️ Cloudinary old asset deletion failed:', destroyError.message);
      }
    }

    // 6. Convert duration in seconds to mm:ss format
    const durationInSec = Math.ceil(uploadResult.duration);
    const minutes = Math.floor(durationInSec / 60);
    const seconds = (durationInSec - minutes * 60).toString().padStart(2, '0');
    const time = `${minutes}:${seconds}`;

    // 7. Update MongoDB record
    music.url = uploadResult.secure_url;
    music.public_id = uploadResult.public_id;
    music.duration = time;
    await music.save();

    console.log(`✅ Successfully trimmed and saved "${music.title}"`);

    return res.status(200).json({
      success: true,
      message: 'Audio trimmed and overwritten successfully',
      data: music
    });

  } catch (error) {
    console.error('❌ Trimming error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to trim audio',
      error: error.message
    });
  } finally {
    // Clean up temp files
    if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
    if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
  }
};

const trimAndDownloadAudio = async (req, res) => {
  const { id } = req.params;
  
  // Accept from query (GET) or body (POST)
  const startTimeVal = req.query.startTime !== undefined ? req.query.startTime : req.body.startTime;
  const endTimeVal = req.query.endTime !== undefined ? req.query.endTime : req.body.endTime;

  const startTime = parseFloat(startTimeVal);
  const endTime = parseFloat(endTimeVal);

  if (startTimeVal === undefined || isNaN(startTime) || startTime < 0) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid startTime in seconds'
    });
  }

  if (endTimeVal === undefined || isNaN(endTime) || endTime <= startTime) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid endTime in seconds that is greater than startTime'
    });
  }

  const tempInput = path.join(__dirname, `../uploads/trim_download_in_${Date.now()}.mp3`);
  const tempOutput = path.join(__dirname, `../uploads/trim_download_out_${Date.now()}.mp3`);

  try {
    const music = await Music.findById(id);
    if (!music) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    console.log(`✂️ Trimming song for ringtone download "${music.title}" from ${startTime}s to ${endTime}s...`);

    // Download original audio from Cloudinary
    await downloadFile(music.url, tempInput);

    // Trim using ffmpeg-static
    const duration = endTime - startTime;
    const cmd = `"${ffmpegStatic}" -y -ss ${startTime} -t ${duration} -i "${tempInput}" -acodec copy "${tempOutput}"`;
    await execPromise(cmd);

    if (!fs.existsSync(tempOutput)) {
      throw new Error('Trimmed file was not outputted by ffmpeg');
    }

    // Set clean filename: e.g. "Song Name_ringtone.mp3"
    const originalTitle = music.title || 'song';
    const safeTitle = originalTitle.replace(/[\\/:*?"<>|]/g, '_');
    const downloadName = `${safeTitle}_ringtone.mp3`;

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);

    // Send file and clean up afterwards
    res.download(tempOutput, downloadName, (err) => {
      // Clean up temp files
      if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
      if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);

      if (err) {
        console.error('Error sending file:', err);
      }
    });

  } catch (error) {
    console.error('❌ Trim and download error:', error);
    // Clean up temp files in case of error
    if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
    if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);

    return res.status(500).json({
      success: false,
      message: 'Failed to trim and download audio',
      error: error.message
    });
  }
};

const deleteAudio = async (req, res) => {
  const { id } = req.params;

  try {
    const music = await Music.findById(id);
    if (!music) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    // 1. Delete from Cloudinary
    if (music.public_id) {
      try {
        console.log(`🗑 Deleting track from Cloudinary: ${music.public_id}`);
        await cloudinary.uploader.destroy(music.public_id, { resource_type: 'video' });
      } catch (destroyError) {
        console.warn('⚠️ Cloudinary deletion failed:', destroyError.message);
      }
    }

    // 2. Remove reference from all playlists
    const Playlist = require('../models/Playlist');
    await Playlist.updateMany({}, { $pull: { songs: id } });

    // 3. Delete from database
    await Music.findByIdAndDelete(id);

    console.log(`✅ Successfully deleted song "${music.title}" from DB and Cloudinary`);

    return res.status(200).json({
      success: true,
      message: 'Song deleted successfully from DB and Cloudinary'
    });

  } catch (error) {
    console.error('❌ Deletion error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete song',
      error: error.message
    });
  }
};

module.exports = { uploadAudio, trimAudio, trimAndDownloadAudio, deleteAudio }