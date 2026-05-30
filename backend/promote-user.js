require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const promoteUser = async () => {
  try {
    if (!process.env.MONGO_URI) {
      console.error('❌ MONGO_URI is missing in .env');
      process.exit(1);
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const usernameToPromote = 'sumu';
    console.log(`🔍 Searching for user "${usernameToPromote}"...`);
    
    const user = await User.findOne({ username: usernameToPromote });
    
    if (!user) {
      console.error(`❌ User "${usernameToPromote}" not found in database.`);
      console.log('💡 Creating the user "sumu" as admin instead with password "sumu@2004"...');
      
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('sumu@2004', salt);
      
      const newUser = await User.create({
        username: 'sumu',
        email: 'sumu@musiana.com',
        password: hashedPassword,
        role: 'admin'
      });
      
      console.log(`🎉 Created admin user successfully! ID: ${newUser._id}`);
    } else {
      user.role = 'admin';
      await user.save();
      console.log(`🎉 Successfully promoted user "${usernameToPromote}" to admin!`);
    }
  } catch (error) {
    console.error('❌ Database error:', error);
  } finally {
    mongoose.connection.close();
    console.log('🔌 Closed MongoDB connection');
  }
};

promoteUser();
