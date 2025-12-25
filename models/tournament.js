const mongoose = require("mongoose");
const Schema = mongoose.Schema;

/* ================= TEAM SCHEMA ================= */
const teamSchema = new Schema(
  {
    name: { type: String, required: true },
    leader: {
      userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
      username: { type: String, required: true },
    },
    members: { type: [String], default: [] },
  },
  { _id: false }
);

/* ================= REGISTRATION SCHEMA ================= */
const registrationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    teamName: { type: String, required: true },
    payerName: { type: String, required: true },
    transactionId: { type: String, required: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    rejectionReason: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

/* ================= TOURNAMENT SCHEMA ================= */
const tournamentSchema = new Schema(
  {
    name: { type: String, required: true },
    game: { type: String, required: true },
    description: String,
    entryFee: { type: Number, default: 0 },
    prizePool: { type: Number, default: 0 },
    upiId: { type: String, required: false },
    teamLimit: { type: Number, required: true },
    
    // 🔥 DATE & TIME
    tournamentDate: { type: Date, required: true },
    matchTime: { type: String }, // e.g. "6:30 PM"
    registrationCloseTime: { type: String }, // e.g. "4:20 PM"

    type: { type: String, enum: ["regular", "scrim"], default: "regular" },
    timeSlot: { type: String },
    organizer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    registrations: [registrationSchema],
    teams: [teamSchema],
    roomDetails: {
      roomId: String,
      roomPassword: String,
      slotNumber: { type: Number, default: null },
      sharedAt: Date,
    },
    result: {
      firstPlace: { teamName: String, leader: String },
      secondPlace: { teamName: String, leader: String },
      thirdPlace: { teamName: String, leader: String },
      notes: String,
    },
  },
  { timestamps: true }
);

/* ================= VIRTUALS ================= */

// Tournament status
tournamentSchema.virtual("status").get(function () {
  if (!this.tournamentDate) return "upcoming";

  // Normalize dates to midnight (ignore time for status label)
  const tDate = new Date(this.tournamentDate);
  tDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (tDate > today) return "upcoming"; // Future date
  if (tDate < today) return "completed"; // Past date
  return "ongoing"; // Today
});

// Accepted teams count
tournamentSchema.virtual("acceptedCount").get(function () {
  if (!this.registrations) return 0;
  return this.registrations.filter((r) => r.status === "accepted").length;
});

// Available slots
tournamentSchema.virtual("availableSlots").get(function () {
  return this.teamLimit - this.acceptedCount;
});

tournamentSchema.set("toJSON", { virtuals: true });
tournamentSchema.set("toObject", { virtuals: true });

module.exports = mongoose.models.Tournament || mongoose.model("Tournament", tournamentSchema);