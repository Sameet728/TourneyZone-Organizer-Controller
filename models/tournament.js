const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Team Schema (embedded)
const teamSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    leader: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      username: {
        type: String,
        required: true,
      },
    },
    members: [String], // Only store names (strings) of optional members
  },
  { _id: false }
);

// Main Tournament Schema
const tournamentSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    game: {
      type: String,
      required: true,
    },
    description: String,

    type: {
      type: String,
      enum: ["regular", "scrim"],
      default: "regular",
    },
    entryFee: {
      type: Number,
      default: 0,
    },
    teamLimit: {
      type: Number,
      default: 50,
    },

    timeSlot: {
      type: String,
      enum: [
        "9 AM - 12 PM",
        "12 PM - 3 PM",
        "3 PM - 6 PM",
        "6 PM - 9 PM",
        "9 PM - 12 AM",
      ],
      required: function () {
        return this.type === "scrim";
      },
    },

    organizer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    teams: [teamSchema], // Array of team objects

    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    isPaidToOrganizer: {
      type: Boolean,
      default: false,
    },
    result: {
      firstPlace: {
        teamName: String,
        score: Number,
      },
      secondPlace: {
        teamName: String,
        score: Number,
      },
      thirdPlace: {
        teamName: String,
        score: Number,
      },
      notes: String,
    },
  },
  { timestamps: true }
);

// ✅ Virtual "status" property (auto-calculated from dates)
tournamentSchema.virtual("status").get(function () {
  const now = new Date();
  if (now < this.startDate) return "upcoming";
  if (now >= this.startDate && now <= this.endDate) return "ongoing";
  return "completed";
});

// ✅ Enable virtuals when converting to JSON or object
tournamentSchema.set("toJSON", { virtuals: true });
tournamentSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Tournament", tournamentSchema);
