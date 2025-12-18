const express = require("express");
const router = express.Router();
const Tournament = require("../models/tournament");
// Show detailed tournament page
router.get("/:id", async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id).populate("organizer");
    if (!tournament) {
      return res.status(404).send("Tournament not found.");
    }

    // Check if logged-in player has already joined
    let alreadyJoined = false;
    if (req.user && req.user.role === 'player') {
      alreadyJoined = req.user.tournamentsJoined.includes(tournament._id);
    }

    res.render("player/tournamentshow", {
      tournament,
      alreadyJoined,
      user: req.user
      // razorpayKey removed ✅
    });
  } catch (err) {
    console.error("Error loading tournament:", err);
    res.status(500).send("Server error");
  }
});



module.exports = router;
