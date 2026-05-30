require('dotenv').config();
const express = require('express');
const connectToDB = require('./database/db')
const userRoutes = require('./routes/userRoutes')
const uploadRoutes = require('./routes/uploadRoutes')
const fetchRoutes = require('./routes/fetchRoutes')
const searchRoutes = require('./routes/searchRoutes')

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json())

connectToDB();

app.use('/api/users', userRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/fetch', fetchRoutes);
app.use('/api/search', searchRoutes);

app.get('/api/debug', async (req, res) => {
    const { exec } = require('child_process');
    const util = require('util');
    const path = require('path');
    const execPromise = util.promisify(exec);
    
    // 1. Inject paths to match downloader.js
    const localBin = path.join(__dirname, 'bin');
    if (process.env.PATH && !process.env.PATH.includes(localBin)) {
        process.env.PATH = `${localBin}:${process.env.PATH}`;
    }
    
    try {
        const ffmpegStatic = require('ffmpeg-static');
        if (ffmpegStatic) {
            const ffmpegDir = path.dirname(ffmpegStatic);
            if (process.env.PATH && !process.env.PATH.includes(ffmpegDir)) {
                process.env.PATH = `${ffmpegDir}:${process.env.PATH}`;
            }
        }
    } catch (ffmpegErr) {
        console.warn('⚠️ Could not load ffmpeg-static in debug:', ffmpegErr.message);
    }

    const fs = require('fs');
    let cookiesPath = null;
    const potentialCookiesPaths = [
        path.join(__dirname, 'cookies.txt'),          // backend/cookies.txt
        path.join(__dirname, '../cookies.txt'),       // repository root/cookies.txt
        '/etc/secrets/cookies.txt',                      // Render default secret file path
        '/opt/render/project/src/cookies.txt',        // absolute path on Render repo root
        '/opt/render/project/src/backend/cookies.txt' // absolute path on Render backend
    ];
    for (const p of potentialCookiesPaths) {
        if (fs.existsSync(p)) {
            cookiesPath = p;
            break;
        }
    }
    const hasCookies = cookiesPath !== null;

    const debugInfo = {
        platform: process.platform,
        nodeVersion: process.version,
        envPath: process.env.PATH,
        cookiesDetected: hasCookies,
        cookiesPath: cookiesPath,
        ytDlpPath: null,
        ffmpegPath: null,
        ytDlpVersion: null,
        testSearch: null,
        errors: []
    };

    try {
        const { stdout } = await execPromise('which yt-dlp');
        debugInfo.ytDlpPath = stdout.trim();
    } catch (e) {
        debugInfo.errors.push(`which yt-dlp failed: ${e.message}`);
    }

    try {
        const { stdout } = await execPromise('which ffmpeg');
        debugInfo.ffmpegPath = stdout.trim();
    } catch (e) {
        debugInfo.errors.push(`which ffmpeg failed: ${e.message}`);
    }

    if (!debugInfo.ytDlpPath) {
        const findPaths = [
            path.join(localBin, 'yt-dlp'),
            '/home/render/.local/bin/yt-dlp',
            '/opt/render/.local/bin/yt-dlp',
            '/root/.local/bin/yt-dlp',
            '/opt/render/project/src/backend/bin/yt-dlp',
            '~/.local/bin/yt-dlp'
        ];
        for (const p of findPaths) {
            try {
                const { stdout } = await execPromise(`test -f ${p} && echo "exists" || echo "no"`);
                if (stdout.trim() === 'exists') {
                    debugInfo.ytDlpPath = p;
                    break;
                }
            } catch (err) {}
        }
    }

    const ytDlpCmd = debugInfo.ytDlpPath || 'yt-dlp';
    try {
        const { stdout } = await execPromise(`${ytDlpCmd} --version`);
        debugInfo.ytDlpVersion = stdout.trim();
    } catch (e) {
        debugInfo.errors.push(`yt-dlp --version failed: ${e.message}`);
    }

    const cookiesArg = hasCookies ? `--cookies "${cookiesPath}"` : '';
    try {
        const { stdout } = await execPromise(`${ytDlpCmd} ${cookiesArg} --js-runtimes node --print "%(title)s" "ytsearch1:adele hello"`);
        debugInfo.testSearch = stdout.trim();
    } catch (e) {
        debugInfo.errors.push(`test search failed: ${e.message}`);
    }

    try {
        const { stdout } = await execPromise('find /opt/render/project/src /etc/secrets -name "*cookies*" 2>/dev/null || find /opt/render/project/src -name "*cookies*"');
        debugInfo.foundCookiesFiles = stdout.trim().split('\n').filter(Boolean);
    } catch (e) {
        debugInfo.errors.push(`find cookies failed: ${e.message}`);
    }

    res.json(debugInfo);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})