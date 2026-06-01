const mongoose = require('mongoose')

const connectToDB = async() => {
    try{
        await mongoose.connect(process.env.MONGO_URI)
        console.log('✅ Connected to Mongo DB successfully')

        // Ensure super-admin user 'somu' exists and has the correct password & role
        try {
            const User = require('../models/User');
            const bcrypt = require('bcryptjs');
            const username = 'somu';
            const password = 'somu@2004';

            let user = await User.findOne({ username });
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            if (user) {
                user.role = 'super-admin';
                user.password = hashedPassword;
                await user.save();
                console.log('👑 Super-admin somu password and role verified/updated.');
            } else {
                await User.create({
                    username,
                    email: 'somu@musiana.com',
                    password: hashedPassword,
                    role: 'super-admin'
                });
                console.log('👑 Super-admin somu created successfully.');
            }
        } catch (seedErr) {
            console.error('❌ Failed to ensure super-admin user somu:', seedErr.message);
        }
    }catch(error){
        console.error('❌ Unable to connect to mongo DB:', error.message)
        console.error('Full error:', error)
    }
}

module.exports = connectToDB