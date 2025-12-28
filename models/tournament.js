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
    slotNumber: { type: Number, default: 0 },
    registrationCloseTime: { type: String }, // e.g. "4:20 PM"

    type: { type: String, enum: ["regular", "scrim"], default: "regular" },
    timeSlot: { type: String },
    organizer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    registrations: [registrationSchema],
    teams: [teamSchema],
    roomDetails: {
      roomId: String,
      roomPassword: String,

      sharedAt: Date,
    },
    isManuallyCompleted: {
      type: Boolean,
      default: false,
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

tournamentSchema.virtual("status").get(function () {

  if (!this.tournamentDate) return "upcoming";


  /* 1️⃣ Organizer-controlled completion (ONLY WAY on same day) */
  if (this.isManuallyCompleted === true) {
    return "completed";
  }

  // Compare dates in UTC (date only)
  const t = new Date(this.tournamentDate);
  const now = new Date();

  const tDateUTC = Date.UTC(
    t.getUTCFullYear(),
    t.getUTCMonth(),
    t.getUTCDate()
  );

  const todayUTC = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );

  

  /* 2️⃣ Past date → completed */
  if (todayUTC > tDateUTC) {
    return "completed";
  }

  /* 3️⃣ Future date → upcoming */
  if (todayUTC < tDateUTC) {
    return "upcoming";
  }

  /* 4️⃣ SAME DAY → ONGOING ✅ */
  return "ongoing";
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

tournamentSchema.virtual("activeRegistrations").get(function () {
  return this.registrations.filter(
    (r) => r.status === "pending" || r.status === "accepted"
  ).length;
});

tournamentSchema.set("toJSON", { virtuals: true });
tournamentSchema.set("toObject", { virtuals: true });

module.exports =
  mongoose.models.Tournament || mongoose.model("Tournament", tournamentSchema);
