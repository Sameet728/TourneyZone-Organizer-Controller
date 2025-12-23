// routes/tournament.js

const express = require("express");
const router = express.Router();
const Tournament = require("../models/tournament");

// ================= SHOW TOURNAMENT (PLAYER VIEW) =================
router.get("/:id", async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .populate("organizer", "username email")
      .populate("registrations.user", "username email");

    if (!tournament) {
      return res.status(404).send("Tournament not found");
    }

    let registration = null;

    if (req.user && req.user.role === "player") {
      registration = tournament.registrations.find(
        (r) => r.user && r.user._id.equals(req.user._id)
      );
    }

    res.render("player/tournamentshow", {
      tournament,
      user: req.user,
      registration,
    });
  } catch (err) {
    console.error("❌ Error loading tournament:", err);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
