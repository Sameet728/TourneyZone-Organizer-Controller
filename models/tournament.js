const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/* ================= TEAM SCHEMA ================= */
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

    members: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

/* ================= REGISTRATION SCHEMA ================= */
const registrationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    teamName: {
      type: String,
      required: true,
    },

    payerName: {
      type: String,
      required: true,
    },

    transactionId: {
      type: String, // UTR
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },

    rejectionReason: {
      type: String,
      default: "",
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true } // IMPORTANT → allows reg._id
);

/* ================= TOURNAMENT SCHEMA ================= */
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

    entryFee: {
      type: Number,
      default: 0,
    },

    teamLimit: {
      type: Number,
      required: true,
    },

    type: {
      type: String,
      enum: ["regular", "scrim"],
      default: "regular",
    },

    timeSlot: {
      type: String,
    },

    organizer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    registrations: [registrationSchema],

    teams: [teamSchema],

    roomDetails: {
      roomId: String,
      roomPassword: String,
      sharedAt: Date,
    },

    startDate: {
      type: Date,
      required: true,
    },
    matchTime: {
  type: String, // e.g. "18:30" or "6:30 PM"
  required: false,
},

    endDate: {
      type: Date,
      required: true,
    },

    result: {
      firstPlace: {
        teamName: String,
        leader: String,
      },
      secondPlace: {
        teamName: String,
        leader: String,
      },
      thirdPlace: {
        teamName: String,
        leader: String,
      },
      notes: String,
    },
  },
  { timestamps: true }
);

/* ================= VIRTUALS ================= */

// Status
tournamentSchema.virtual("status").get(function () {
  const now = new Date();
  if (now < this.startDate) return "upcoming";
  if (now >= this.startDate && now <= this.endDate) return "ongoing";
  return "completed";
});

// Accepted count
tournamentSchema.virtual("acceptedCount").get(function () {
  return this.registrations.filter(r => r.status === "accepted").length;
});

// Available slots
tournamentSchema.virtual("availableSlots").get(function () {
  return this.teamLimit - this.acceptedCount;
});

// Enable virtuals
tournamentSchema.set("toJSON", { virtuals: true });
tournamentSchema.set("toObject", { virtuals: true });

module.exports =
  mongoose.models.Tournament ||
  mongoose.model("Tournament", tournamentSchema);

