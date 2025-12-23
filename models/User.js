const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },

  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },

  role: {
    type: String,
    enum: ["admin", "organizer", "player"],
    default: "player",
  },

  // Organizer payment info
  upiId: {
    type: String,
    default: null,
  },

  // Wallet system
  wallet: {
    type: Number,
    default: 0,
  },

  // Player tournaments
  tournamentsJoined: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
    },
  ],

  // Organizer tournaments
  tournamentsCreated: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
    },
  ],

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// 🔐 Passport plugin (adds hash, salt, authenticate etc.)
userSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model("User", userSchema);
