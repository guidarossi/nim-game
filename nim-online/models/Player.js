const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: { // NOVO CAMPO
        type: String,
        required: true
    },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    matchesPlayed: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Player', PlayerSchema);