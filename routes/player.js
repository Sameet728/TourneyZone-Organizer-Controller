const express = require("express");
const router = express.Router();
const Tournament = require("../models/tournament");

/* ================= MIDDLEWARE ================= */
function isPlayer(req, res, next) {
  if (!req.isAuthenticated() || req.user.role !== "player") {
    return res.redirect("/login");
  }
  next();
}

/* ================= HELPER FUNCTION ================= */
// Logic: Current Time MUST be less than TournamentDate + RegistrationCloseTime
function isRegistrationOpen(tournament) {
  if (!tournament.registrationCloseTime || !tournament.tournamentDate) {
    return true;
  }

  const now = new Date();
  const deadline = new Date(tournament.tournamentDate); // Get the day (Dec 25)

  // Parse "4:20 PM"
  let [timePart, modifier] = tournament.registrationCloseTime.split(" ");
  let [hours, minutes] = timePart.split(":");

  hours = parseInt(hours, 10);
  minutes = parseInt(minutes, 10);

  if (modifier) {
    modifier = modifier.toUpperCase();
    if (modifier === "PM" && hours < 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;
  }

  // Set the precise deadline time
  deadline.setHours(hours, minutes, 0, 0);

  // Return TRUE only if NOW is BEFORE Deadline
  return now <= deadline;
}

/* ================= ROUTES ================= */

router.get("/", isPlayer, async (req, res) => {
  try {
    const tournaments = await Tournament.find().sort({ createdAt: -1 });
    res.render("dashboards/player", { tournaments });
  } catch (err) {
    console.error(err);
    res.send("Unable to load dashboard");
  }
});

router.get("/tournaments", isPlayer, async (req, res) => {
  try {
    const tournaments = await Tournament.find()
      .populate("organizer", "username")
      .sort({ tournamentDate: 1 });
    res.render("player/viewTournaments", { tournaments });
  } catch (err) {
    console.error(err);
    res.send("Unable to load tournaments");
  }
});

router.get("/my-tournaments", isPlayer, async (req, res) => {
  try {
    const tournaments = await Tournament.find({ "registrations.user": req.user._id })
      .populate("organizer", "username")
      .sort({ tournamentDate: 1 });
    res.render("player/myTournaments", { tournaments });
  } catch (err) {
    console.error(err);
    res.send("Unable to load joined tournaments");
  }
});

router.get("/tournaments/:id", isPlayer, async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .populate("organizer", "username email")
      .populate("registrations.user", "username");

    if (!tournament) return res.send("Tournament not found");

    const registration = tournament.registrations.find(
      (r) => r.user && r.user._id.equals(req.user._id)
    );

    res.render("player/tournamentshow", {
      tournament,
      registration,
      user: req.user,
      registrationOpen: isRegistrationOpen(tournament),
    });
  } catch (err) {
    console.error(err);
    res.send("Unable to load tournament");
  }
});

router.get("/tournaments/:id/join", isPlayer, async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id).populate("organizer", "upiId");

    if (!tournament) return res.send("Tournament not found");

    if (!isRegistrationOpen(tournament)) {
      return res.send("Registration closed for this tournament");
    }

    const registration = tournament.registrations.find(
      (r) => r.user && r.user.equals(req.user._id)
    );

    res.render("player/joinTournamentForm", {
      tournament,
      registration,
      user: req.user,
    });
  } catch (err) {
    console.error(err);
    res.send("Unable to open join form");
  }
});

router.post("/tournaments/:id/register", isPlayer, async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.send("Tournament not found");

    // 1. Check Time/Date (Keep your existing helper if you use it)
    // if (!isRegistrationOpen(tournament)) { return res.send("Registration closed"); }

    // 2. Check if user already registered
    const already = tournament.registrations.find(
      (r) => r.user && r.user.equals(req.user._id)
    );
    if (already) return res.redirect("back");

    // ============================================================
    // 3. NEW LOGIC: Check Slots (Pending + Accepted)
    // ============================================================
    
    // Count how many people are currently taking up space
    // We ignore 'rejected' users so their spots are free
    const filledSlots = tournament.registrations.filter(reg => 
      reg.status === "pending" || reg.status === "accepted"
    ).length;

    // If the tournament is full, STOP here.
    if (filledSlots >= tournament.teamLimit) {
      return res.send("Registration Full! Waiting for organizer to clear rejected slots.");
    }

    // ============================================================

    const { teamName, payerName, transactionId, amount } = req.body;

    tournament.registrations.push({
      user: req.user._id,
      teamName,
      payerName,
      transactionId,
      amount,
      status: "pending", // This will now count towards the limit for the next person
    });

    await tournament.save();
    res.redirect(`/player/tournaments/${tournament._id}`);

  } catch (err) {
    console.error(err);
    res.send("Registration failed");
  }
});

router.get("/results", isPlayer, async (req, res) => {
  try {
    const tournaments = await Tournament.find({
      result: { $exists: true, $ne: null },
    }).sort({ tournamentDate: -1 });
    res.render("player/results", { tournaments });
  } catch (err) {
    console.error(err);
    res.send("Unable to load results");
  }
});

router.get("/results/:id", isPlayer, async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id).populate("organizer", "username email");

    if (!tournament || !tournament.result) {
      return res.send("Results not available");
    }
    res.render("player/showResult", { tournament });
  } catch (err) {
    console.error(err);
    res.send("Unable to load result");
  }
});


module.exports = router;
