const jwt = require('jsonwebtoken');

const authMiddleware = async(req, res, next) => {
    try{
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];
        if(!token){
            return res.status(401).json({
                success: false,
                message: 'No Token provided'
            })
        }
        const deCodedToken = jwt.verify(token, process.env.JWT_ACCESS_TOKEN)
        req.userInfo = deCodedToken
        next();
    }catch(error){
        console.error('Auth middleware token verification failed:', error.message);
        return res.status(401).json({
            success: false,
            message: 'Access denied. Token is invalid or expired.'
        })
    }
}

module.exports = authMiddleware