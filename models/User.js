const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  role: {
    type: String,
    enum: ["admin", "organizer", "player"],
    default: "player",
  },
  name: {
    type: String,
    required: false,
  },
  wallet: {
    type: Number,
    default: 100,
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },

  // ✅ Tournaments this user has joined (for players)
  tournamentsJoined: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
    },
  ],
  // ✅ Tournaments this user has joined (for players)
  tournamentsCreated: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
    },
  ],
  // ✅ Tournaments this user has joined (for players)
  walletHistroy: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WalletTransaction",
    },
  ],
  verifiedAt: Date,
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
});

userSchema.plugin(passportLocalMongoose); // Adds username, password, methods

module.exports = mongoose.model("User", userSchema);
