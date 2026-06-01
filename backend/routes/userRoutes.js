const express = require('express');
const {register, login, changePassword, forgotPassword, getAllUsers, promoteUserToAdmin, demoteAdminToUser} = require('../controllers/auth-controller')
const authMiddleware = require('../middlewares/auth-middleware');
const adminMiddleware = require('../middlewares/admin-middleware');
const router = express.Router();


router.post('/register', register)
router.post('/login', login)
router.post('/change-password', authMiddleware, changePassword)
router.post('/forgot-password', forgotPassword)
router.get('/', authMiddleware, adminMiddleware, getAllUsers)
router.put('/:id/promote', authMiddleware, adminMiddleware, promoteUserToAdmin)
router.put('/:id/demote', authMiddleware, adminMiddleware, demoteAdminToUser)

module.exports = router;