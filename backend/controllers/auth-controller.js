const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const register = async (req, res) => {
    try {
        const { username, email, password, role } = req.body;

        //check for existing username or email
        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all the required fields'
            })
        }
        const checkExistingUser = await User.findOne({ $or: [{ username }, { email }] })
        if (checkExistingUser) {
            return res.status(409).json({
                success: false,
                message: 'Username or Email already exists'
            })
        }
        //hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await User.create({
            username, email, password: hashedPassword, role: role || 'user'
        });
        if (!newUser) {
            return res.status(400).json(
                {
                    message: 'Unable to register! Please try again'
                })
        }
        res.status(201).json({
            success: true,
            message: 'User created successfully'
        })
    } catch (error) {
        console.error('❌ Registration Error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal Server Error',
            error: error.message
        })
    }

}

const login = async (req, res) => {
    try {
        const { username, password } = req.body
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all the required fields'
            })
        }

        const user = await User.findOne({ username })
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            })
        }

        const checkPassword = await bcrypt.compare(password, user.password)
        if (!checkPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid Credentials'
            })
        }

        const accessToken = jwt.sign({
            userId: user._id,
            username,
            role: user.role
        }, process.env.JWT_ACCESS_TOKEN, {
            expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN
        })

        res.status(200).json({
            success: true,
            message: 'User logged in successfully',
            accessToken,
            user: {
                username: user.username,
                email: user.email,
                role: user.role
            }
        })


    } catch (error) {
        console.error('❌ Login Error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal Server Error',
            error: error.message
        })
    }
}

const changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body
        const userId = req.userInfo.userId
        const user = await User.findOne({ _id: userId })
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            })
        }

        const checkPassword = await bcrypt.compare(oldPassword, user.password)
        if (!checkPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid Credentials'
            })
        }

        const salt = await bcrypt.genSalt(10)
        const newHashedPassword = await bcrypt.hash(newPassword, salt)

        user.password = newHashedPassword
        await user.save()

        res.status(200).json({
            success: true,
            message: 'Password changed successfully'
        })

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Internal Server Error'
        })
    }
}

const forgotPassword = async (req, res) => {
    try {
        const { username, email, newPassword } = req.body;
        if (!username || !email || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all the required fields'
            });
        }

        const user = await User.findOne({ username, email });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'No user found with the provided username and email'
            });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedNewPassword = await bcrypt.hash(newPassword, salt);

        user.password = hashedNewPassword;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password reset successfully'
        });

    } catch (error) {
        console.error('❌ Forgot Password Error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal Server Error',
            error: error.message
        });
    }
}

const getAllUsers = async (req, res) => {
    try {
        const users = await User.find({}, 'username email role');
        res.status(200).json({
            success: true,
            data: users
        });
    } catch (error) {
        console.error('❌ Get Users Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve users',
            error: error.message
        });
    }
}

const promoteUserToAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        user.role = 'admin';
        await user.save();

        res.status(200).json({
            success: true,
            message: `User ${user.username} has been promoted to admin successfully`,
            data: {
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('❌ Promote User Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to promote user to admin',
            error: error.message
        });
    }
}

const demoteAdminToUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (user.role === 'super-admin') {
            return res.status(400).json({
                success: false,
                message: 'Cannot demote a super-admin'
            });
        }

        user.role = 'user';
        await user.save();

        res.status(200).json({
            success: true,
            message: `User ${user.username} has been demoted to user successfully`,
            data: {
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error('❌ Demote User Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to demote user to user',
            error: error.message
        });
    }
}

module.exports = { register, login, changePassword, forgotPassword, getAllUsers, promoteUserToAdmin, demoteAdminToUser }