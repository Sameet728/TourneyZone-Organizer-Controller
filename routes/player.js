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

/* ================= DASHBOARD ================= */

router.get("/", isPlayer, async (req, res) => {
  const tournaments = await Tournament.find();
  res.render("dashboards/player", { tournaments });
});


/* ================= BROWSE TOURNAMENTS ================= */

router.get("/tournaments", isPlayer, async (req, res) => {
  try {
    const tournaments = await Tournament.find()
      .populate("organizer", "username")
      .sort({ createdAt: -1 });

    res.render("player/viewTournaments", { tournaments });
  } catch (err) {
    console.error(err);
    res.send("Unable to load tournaments");
  }
});

/* ================= JOINED TOURNAMENTS ================= */

router.get("/my-tournaments", isPlayer, async (req, res) => {
  try {
    const tournaments = await Tournament.find({
      "registrations.user": req.user._id,
    })
      .populate("organizer", "username")
      .sort({ startDate: 1 });

    res.render("player/mytournaments", { tournaments });
  } catch (err) {
    console.error(err);
    res.send("Unable to load joined tournaments");
  }
});



/* ================= VIEW TOURNAMENT ================= */

router.get("/tournaments/:id", isPlayer, async (req, res) => {
  const tournament = await Tournament.findById(req.params.id)
    .populate("organizer", "username email")
    .populate("registrations.user", "username");

  if (!tournament) return res.send("Tournament not found");

  // 🔑 find current player's registration
  const registration = tournament.registrations.find(
    (r) => r.user && r.user._id.equals(req.user._id)
  );

  res.render("player/tournamentShow", {
    tournament,
    registration,
    user: req.user,
  });
});

/* ================= JOIN FORM ================= */

router.get("/tournaments/:id/join", isPlayer, async (req, res) => {
  const tournament = await Tournament.findById(req.params.id).populate(
    "organizer",
    "upiId"
  );

  if (!tournament) return res.send("Tournament not found");

  const registration = tournament.registrations.find(
    (r) => r.user && r.user.equals(req.user._id)
  );

  res.render("player/joinTournamentForm", {
    tournament,
    registration,
    user: req.user,
  });
});

/* ================= SUBMIT REGISTRATION ================= */

router.post("/tournaments/:id/register", isPlayer, async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.send("Tournament not found");

    // Prevent duplicate registration
    const already = tournament.registrations.find(
      (r) => r.user && r.user.equals(req.user._id)
    );
    if (already) return res.redirect("back");

    const { teamName, payerName, transactionId, amount } = req.body;

    tournament.registrations.push({
      user: req.user._id,
      teamName,
      payerName,
      transactionId,
      amount,
      status: "pending",
    });

    await tournament.save();
    res.redirect(`/player/tournaments/${tournament._id}`);
  } catch (err) {
    console.error(err);
    res.send("Registration failed");
  }
});

/* ================= VIEW RESULTS ================= */

/* ================= RESULTS : LIST ALL TOURNAMENTS ================= */

router.get("/results", isPlayer, async (req, res) => {
  try {
    const tournaments = await Tournament.find({
      result: { $exists: true, $ne: null }
    }).sort({ endDate: -1 });

    res.render("player/results", { tournaments });
  } catch (err) {
    console.error(err);
    res.send("Unable to load results");
  }
});

router.get("/results/:id", isPlayer, async (req, res) => {
  const tournament = await Tournament.findById(req.params.id)
    .populate("organizer", "username email");

  if (!tournament || !tournament.result) {
    return res.send("Results not available");
  }

  res.render("player/showResult", { tournament });
});



module.exports = router;
