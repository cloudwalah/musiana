const mongoose = require('mongoose')

const MusicSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    url: {
        type: String,
        required: true,
        unique: true
    },
    public_id: {
        type: String,
        required: true,
        unique: true
    },
    duration: {
        type: String,
        required: true
    },
    imageUrl: {
        type: String,
        default: ''
    },
    searchQueries: {
        type: [String],
        default: []
    }
}, {timestamps: true})

module.exports = mongoose.model('Music', MusicSchema);