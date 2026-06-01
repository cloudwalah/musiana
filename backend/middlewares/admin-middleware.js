const adminMiddleware = (req, res, next) => {
  try {
    if (!req.userInfo || (req.userInfo.role !== 'admin' && req.userInfo.role !== 'super-admin')) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Admin permissions required'
      });
    }
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal Server Error in Admin Middleware'
    });
  }
};

module.exports = adminMiddleware;