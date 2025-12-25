const express = require("express");
const router = express.Router();
const Tournament = require("../models/tournament");
const User = require("../models/User");
const Brevo = require("@getbrevo/brevo");

/* ================= MIDDLEWARE ================= */

function isOrganizer(req, res, next) {
  if (!req.isAuthenticated() || req.user.role !== "organizer") {
    return res.redirect("/login");
  }
  next();
}

/* ================= DASHBOARD ================= */

router.get("/", isOrganizer, async (req, res) => {
  const tournaments = await Tournament.find({ organizer: req.user._id });
  res.render("dashboards/organizer", { tournaments });
});

/* ================= ORGANIZER TOURNAMENT LIST ================= */

router.get("/tournaments", isOrganizer, async (req, res) => {
  try {
    const tournaments = await Tournament.find({
      organizer: req.user._id,
    }).sort({ createdAt: -1 });

    res.render("organizer/myTournaments", { tournaments });
  } catch (err) {
    console.error(err);
    res.send("Error fetching tournaments");
  }
});

/* ================= CREATE TOURNAMENT ================= */

router.get("/tournaments/new", isOrganizer, (req, res) => {
  res.render("organizer/newtournament");
});

router.post("/tournaments", isOrganizer, async (req, res) => {
  try {
    const {
      name,
      game,
      description,
      entryFee,
      prizePool,
      teamLimit,
      slotNumber,
      type,
      timeSlot,
      matchTime,
      registrationCloseTime,
      tournamentDate,
    } = req.body;
    console.log(tournamentDate);

    const tournament = new Tournament({
      name,
      game,
      description,
      entryFee,
      prizePool,
      teamLimit,
      type,
      timeSlot: type === "scrim" ? timeSlot : undefined,
      
      registrationCloseTime,
      tournamentDate,
      upiId: req.user.upiId,
      organizer: req.user._id,
    });

    await tournament.save();

    req.user.tournamentsCreated.push(tournament._id);
    await req.user.save();

    res.redirect("/organizer");
  } catch (err) {
    console.error(err);
    res.send("Error creating tournament");
  }
});

/* ================= EDIT TOURNAMENT ================= */

router.get("/tournaments/:id/edit", isOrganizer, async (req, res) => {
  const tournament = await Tournament.findById(req.params.id);
  if (!tournament) return res.send("Tournament not found");

  res.render("organizer/editTournament", { tournament });
});

router.post("/tournaments/:id", isOrganizer, async (req, res) => {
  await Tournament.findByIdAndUpdate(req.params.id, req.body);
  res.redirect("/organizer");
});

/* ================= VIEW TOURNAMENT ================= */

router.get("/tournaments/:id", isOrganizer, async (req, res) => {
  const tournament = await Tournament.findById(req.params.id)
    .populate("organizer", "username email")
    .populate("registrations.user", "username email");

  if (!tournament) return res.send("Tournament not found");

  res.render("organizer/viewTournament", { tournament });
});

/* ================= ACCEPT PLAYER ================= */

router.post(
  "/tournaments/:tId/registrations/:rId/approve",
  isOrganizer,
  async (req, res) => {
    const { tId, rId } = req.params;

    const tournament = await Tournament.findById(tId).populate(
      "registrations.user",
      "username email"
    );

    const reg = tournament.registrations.id(rId);
    if (!reg) return res.send("Registration not found");

    if (tournament.acceptedCount >= tournament.teamLimit) {
      return res.send("Slots full");
    }

    reg.status = "accepted";

    tournament.teams.push({
      name: reg.teamName,
      leader: {
        userId: reg.user._id,
        username: reg.user.username,
      },
      members: [],
    });

    await tournament.save();

    const player = await User.findById(reg.user._id);
    if (!player.tournamentsJoined.includes(tournament._id)) {
      player.tournamentsJoined.push(tournament._id);
      await player.save();
    }

    res.redirect("back");
  }
);

/* ================= REJECT PLAYER ================= */

router.post(
  "/tournaments/:tId/registrations/:rId/reject",
  isOrganizer,
  async (req, res) => {
    const { reason } = req.body;

    const tournament = await Tournament.findById(req.params.tId);
    const reg = tournament.registrations.id(req.params.rId);

    reg.status = "rejected";
    reg.rejectionReason = reason || "Invalid UTR";

    await tournament.save();
    res.redirect("back");
  }
);

/* ================= SHARE ROOM DETAILS ================= */

router.post("/tournaments/:id/room", isOrganizer, async (req, res) => {
  try {
    const { roomId, roomPassword, matchTime ,slotNumber } = req.body;
    console.log(slotNumber);

    const tournament = await Tournament.findById(req.params.id)
      .populate("registrations.user", "username email")
      .populate("organizer", "username email");

    if (!tournament) return res.send("Tournament not found");

    tournament.roomDetails = {
      roomId,
      roomPassword,
      slotNumber,
      sharedAt: new Date(),
    };
    tournament.matchTime = matchTime;

    await tournament.save();

    const apiInstance = new Brevo.TransactionalEmailsApi();
    apiInstance.setApiKey(
      Brevo.TransactionalEmailsApiApiKeys.apiKey,
      process.env.BREVO_API_KEY
    );

    const organizerName =
      tournament.organizer?.username || "Tournament Organizer";
    const organizerEmail =
      tournament.organizer?.email || "support@tourneyzone.com";

    const acceptedPlayers = tournament.registrations.filter(
      (r) => r.status === "accepted" && r.user?.email
    );

    for (const r of acceptedPlayers) {
      await apiInstance.sendTransacEmail({
        sender: {
          name: "TourneyZone",
          email: "sameetpisal@gmail.com",
        },
        to: [
          {
            email: r.user.email,
            name: r.user.username,
          },
        ],
        subject: `🎮 Match Ready! ${tournament.name} Room Details 🏆`,
        htmlContent: `
<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:20px auto;background:#ffffff;border-radius:14px;overflow:hidden;">
    <div style="padding:24px;background:linear-gradient(135deg,#6366f1,#22d3ee);color:#fff;">
      <h2 style="margin:0;">🎮 Match Room Details</h2>
      <p style="margin:6px 0 0;">${tournament.name}</p>
    </div>
    <div style="padding:24px;color:#1f2937;">
      <p>Hi <strong>${r.user.username}</strong> 👋</p>
      <p>You have been <strong>accepted</strong>. Here are your match details:</p>
      <div style="background:#f8fafc;padding:16px;border-radius:10px;">
        <p><strong>Room ID:</strong> ${roomId}</p>
        <p><strong>Password:</strong> ${roomPassword}</p>
        <p><strong>Match Time:</strong> ${matchTime}</p>
        <p><strong>Slot Number:</strong> ${slotNumber}</p>
      </div>
      <p style="margin-top:16px;">Please join 10 minutes early.</p>
      <hr/>
      <p><strong>Organizer Contact</strong><br/>
        ${organizerName}<br/>
        <a href="mailto:${organizerEmail}">${organizerEmail}</a>
      </p>
    </div>
    <div style="padding:14px;text-align:center;background:#f9fafb;color:#9ca3af;font-size:12px;">
      🚀 Powered by <strong>TourneyZone</strong>
    </div>
  </div>
</body>
</html>
        `,
      });
    }

    res.redirect(req.get("Referrer") || "/organizer");
  } catch (err) {
    console.error("Brevo send error:", err);
    res.send("Failed to send room details");
  }
});

/* ================= SUBMIT RESULTS ================= */

router.get("/tournaments/:id/results", isOrganizer, async (req, res) => {
  const tournament = await Tournament.findById(req.params.id).populate(
    "organizer",
    "username email"
  );

  if (!tournament) return res.send("Tournament not found");

  res.render("organizer/submitResults", { tournament });
});

router.post("/tournaments/:id/results", isOrganizer, async (req, res) => {
  try {
    const {
      firstLeaderUsername,
      secondLeaderUsername,
      thirdLeaderUsername,
      notes,
    } = req.body;

    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.send("Tournament not found");

    const findTeamByLeader = (username) =>
      tournament.teams.find((t) => t.leader.username === username);

    const firstTeam = findTeamByLeader(firstLeaderUsername);
    const secondTeam = findTeamByLeader(secondLeaderUsername);
    const thirdTeam = findTeamByLeader(thirdLeaderUsername);

    if (!firstTeam || !secondTeam || !thirdTeam) {
      return res.send("Invalid team selection");
    }

    tournament.result = {
      firstPlace: { teamName: firstTeam.name, leader: firstTeam.leader.username },
      secondPlace: { teamName: secondTeam.name, leader: secondTeam.leader.username },
      thirdPlace: { teamName: thirdTeam.name, leader: thirdTeam.leader.username },
      notes,
    };

    await tournament.save();
    res.redirect(`/organizer/tournaments/${tournament._id}`);
  } catch (err) {
    console.error(err);
    res.send("Error submitting results");
  }
});

module.exports = router;
