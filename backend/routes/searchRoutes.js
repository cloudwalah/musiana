const express = require('express');
const { searchMusic, triggerDownload } = require('../controllers/search-controller');
const authMiddleware = require('../middlewares/auth-middleware');

const router = express.Router();

// GET /api/search?q=query
router.get('/', authMiddleware, searchMusic);

// POST /api/search/download
router.post('/download', authMiddleware, triggerDownload);

module.exports = router;
