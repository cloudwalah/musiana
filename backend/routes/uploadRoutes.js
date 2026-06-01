const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadAudio, trimAudio, trimAndDownloadAudio, deleteAudio } = require('../controllers/upload-controller');
const authMiddleware = require('../middlewares/auth-middleware')
const checkAdmin = require('../middlewares/admin-middleware')

// Configure multer to store files temporarily
const upload = multer({ dest: 'uploads/' });

// POST /api/upload/audio - Upload audio file
router.post('/audio', authMiddleware, checkAdmin, upload.single('audio'), uploadAudio);

// POST /api/upload/trim/:id - Trim audio file
router.post('/trim/:id', authMiddleware, checkAdmin, trimAudio);

// DELETE /api/upload/delete/:id - Delete audio file (Admin only)
router.delete('/delete/:id', authMiddleware, checkAdmin, deleteAudio);

// GET /api/upload/trim-download/:id - Trim and stream/download ringtone (all users)
router.get('/trim-download/:id', authMiddleware, trimAndDownloadAudio);

// POST /api/upload/trim-download/:id - Trim and stream/download ringtone (all users)
router.post('/trim-download/:id', authMiddleware, trimAndDownloadAudio);

module.exports = router;
