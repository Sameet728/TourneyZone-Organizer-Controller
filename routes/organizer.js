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

/* ================= ACCEPT PLAYER ================= */
router.post(
  "/tournaments/:tId/registrations/:rId/approve",
  isOrganizer,
  async (req, res) => {
    try {
      const { tId, rId } = req.params;

      const tournament = await Tournament.findById(tId).populate(
        "registrations.user",
        "username email"
      );

      const reg = tournament.registrations.id(rId);
      if (!reg) return res.send("Registration not found");

      // 1. SECURITY CHECK: Ensure we don't exceed limit by accepting
      // We calculate actual accepted teams (not pending)
      if (tournament.teams.length >= tournament.teamLimit) {
        return res.send(
          "Error: Team Limit Reached. You cannot accept more teams."
        );
      }

      // 2. Update Status
      reg.status = "accepted";

      // 3. Add to Teams Array
      tournament.teams.push({
        name: reg.teamName,
        leader: {
          userId: reg.user._id,
          username: reg.user.username,
        },
        members: [],
      });

      // 4. Save Tournament
      await tournament.save();

      // 5. Update Player Profile
      const player = await User.findById(reg.user._id);
      if (!player.tournamentsJoined.includes(tournament._id)) {
        player.tournamentsJoined.push(tournament._id);
        await player.save();
      }

      res.redirect("back");
    } catch (err) {
      console.error(err);
      res.send("Error approving player");
    }
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
    // We only need Room ID, Password, and Time from the form.
    // We will generate slot numbers automatically.
    const { roomId, roomPassword, matchTime } = req.body;

    const tournament = await Tournament.findById(req.params.id)
      .populate("registrations.user", "username email")
      .populate("organizer", "username email");

    if (!tournament) return res.send("Tournament not found");

    // 1. Update Room Details in Database
    // We save the generic room info here.
    tournament.roomDetails = {
      roomId,
      roomPassword,
      sharedAt: new Date(),
    };
    tournament.matchTime = matchTime;

    await tournament.save();

    // 2. Setup Email API
    const apiInstance = new Brevo.TransactionalEmailsApi();
    apiInstance.setApiKey(
      Brevo.TransactionalEmailsApiApiKeys.apiKey,
      process.env.BREVO_API_KEY
    );

    const organizerName =
      tournament.organizer?.username || "SVx Arena Organizer";
    const organizerEmail =
      tournament.organizer?.email || "support@svxarena.com";

    // 3. Get ONLY Accepted Players
    const acceptedPlayers = tournament.registrations.filter(
      (r) => r.status === "accepted" && r.user?.email
    );

    // 4. Send Emails with Unique Slots
    // Start counting from 1
    let currentSlot = 1;

    for (const r of acceptedPlayers) {
      // Assign unique slot to this specific team, then increment for the next one
      const mySlot = currentSlot++;

      await apiInstance.sendTransacEmail({
        sender: {
          name: "SVx Arena",
          email: "no-reply@svxarena.com",
        },
        to: [
          {
            email: r.user.email,
            name: r.user.username,
          },
        ],
        subject: `⚡ Match Ready! ${tournament.name} Room Details`,
        htmlContent: `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Match Credentials</title>
  <style>
    body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; }
    .card { background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(124, 58, 237, 0.1); max-width: 500px; margin: 40px auto; border: 1px solid #f1f5f9; }
    .header { background: linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%); padding: 40px 30px; text-align: center; }
    .content { padding: 40px 30px; }
    .details-box { background-color: #f5f3ff; border: 1px dashed #8b5cf6; border-radius: 16px; padding: 20px; margin: 25px 0; }
    .label { font-size: 11px; font-weight: 700; color: #7c3aed; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px 0; }
    .value { font-size: 18px; font-weight: 800; color: #1e293b; margin: 0; font-family: monospace; }
    .btn { display: block; width: 100%; background-color: #1e293b; color: #ffffff; font-weight: 700; text-align: center; padding: 16px 0; border-radius: 12px; text-decoration: none; font-size: 16px; margin-top: 10px; }
    .footer { background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>

  <div class="card">
    
    <div class="header">
      <div style="font-size: 48px; margin-bottom: 10px;">🎮</div>
      <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800;">Match Credentials</h1>
      <p style="margin: 5px 0 0; color: #e9d5ff; font-size: 14px; font-weight: 500;">${tournament.name}</p>
    </div>

    <div class="content">
      <p style="margin: 0 0 15px; font-size: 18px; color: #1e293b;">
        Hi <strong>${r.user.username}</strong> 👋
      </p>
      <p style="margin: 0; font-size: 15px; color: #64748b; line-height: 1.6;">
        The lobby is open! Here are your private access details. Please sit in your assigned slot.
      </p>

      <div class="details-box">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-bottom: 20px;">
              <p class="label">Room ID</p>
              <p class="value" style="font-size: 22px; color: #7c3aed;">${roomId}</p>
            </td>
            <td style="padding-bottom: 20px;">
              <p class="label">Password</p>
              <p class="value">${roomPassword}</p>
            </td>
          </tr>
          <tr>
            <td>
              <p class="label" style="color: #64748b;">Start Time</p>
              <p class="value" style="font-family: sans-serif;">${matchTime}</p>
            </td>
            <td>
              <p class="label" style="color: #64748b;">Your Slot</p>
              <p class="value" style="color: #ea580c; font-size: 24px;">#${mySlot}</p>
            </td>
          </tr>
        </table>
      </div>

      <a href="#" class="btn">🚀 Enter Match Room</a>
      
      <p style="text-align: center; margin-top: 15px; font-size: 12px; color: #94a3b8;">
        ⚠️ Join the lobby 10 mins before start.
      </p>
    </div>

    <div class="footer">
      <p style="margin: 0 0 5px;">Hosted by <strong>${organizerName}</strong></p>
      <p style="margin: 0;">Powered by <strong style="color: #7c3aed;">SVx Arena</strong></p>
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
  try {
    const tournament = await Tournament.findById(req.params.id).populate(
      "organizer",
      "username email"
    );

    if (!tournament) {
      return res.status(404).send("Tournament not found");
    }

    // 🔐 OWNER CHECK (VERY IMPORTANT)
    if (tournament.organizer._id.toString() !== req.user._id.toString()) {
      return res.status(403).send("You are not allowed to submit results for this tournament");
    }

    // ⛔ Optional but recommended: status check
    if (tournament.status !== "ongoing" && tournament.status !== "completed") {
      return res.status(400).send("Results can only be submitted after tournament starts");
    }

    res.render("organizer/submitResults", {
      tournament,
      user: req.user
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Unable to load results page");
  }
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

    if (!tournament) {
      return res.status(404).send("Tournament not found");
    }

    /* 🔐 OWNER CHECK */
    if (tournament.organizer.toString() !== req.user._id.toString()) {
      return res.status(403).send("Not authorized to submit results");
    }

    /* ⛔ Prevent early submission (before tournament day) */
    const t = new Date(tournament.tournamentDate);
    const now = new Date();

    const tUTC = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
    const todayUTC = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    );

    if (todayUTC < tUTC) {
      return res.status(400).send("Tournament has not started yet");
    }

    /* 🔎 Find teams */
    const findTeamByLeader = (username) =>
      tournament.teams.find((t) => t.leader.username === username);

    const firstTeam = findTeamByLeader(firstLeaderUsername);
    const secondTeam = findTeamByLeader(secondLeaderUsername);
    const thirdTeam = findTeamByLeader(thirdLeaderUsername);

    if (!firstTeam || !secondTeam || !thirdTeam) {
      return res.status(400).send("Invalid team selection");
    }

    /* 🚫 Prevent duplicate winners */
    const leaders = [
      firstLeaderUsername,
      secondLeaderUsername,
      thirdLeaderUsername,
    ];
    if (new Set(leaders).size !== 3) {
      return res.status(400).send("Same team cannot occupy multiple positions");
    }

    /* 🏆 SAVE RESULTS */
    tournament.result = {
      firstPlace: {
        teamName: firstTeam.name,
        leader: firstTeam.leader.username,
      },
      secondPlace: {
        teamName: secondTeam.name,
        leader: secondTeam.leader.username,
      },
      thirdPlace: {
        teamName: thirdTeam.name,
        leader: thirdTeam.leader.username,
      },
      notes,
    };

    /* ✅ MARK COMPLETED (IMPORTANT) */
    tournament.isManuallyCompleted = true;

    await tournament.save();

    res.redirect(`/organizer/tournaments/${tournament._id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error submitting results");
  }
});


const mongoose = require("mongoose");
router.post("/tournaments/:id/delete", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!req.user) {
      await session.abortTransaction();
      return res.status(401).send("Login required");
    }

    const tournament = await Tournament.findById(req.params.id).session(
      session
    );

    if (!tournament) {
      await session.abortTransaction();
      return res.status(404).send("Tournament not found");
    }

    // 🔐 Authorization check
    if (
      tournament.organizer.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      await session.abortTransaction();
      return res.status(403).send("Not authorized");
    }

    const tournamentId = tournament._id;

    /* ---------------------------------
       1️⃣ REMOVE FROM ORGANIZER
    ----------------------------------*/
    await User.updateOne(
      { _id: tournament.organizer },
      { $pull: { tournamentsCreated: tournamentId } },
      { session }
    );

    /* ---------------------------------
       2️⃣ REMOVE FROM ALL PLAYERS
    ----------------------------------*/
    await User.updateMany(
      { tournamentsJoined: tournamentId },
      { $pull: { tournamentsJoined: tournamentId } },
      { session }
    );

    /* ---------------------------------
       3️⃣ DELETE TOURNAMENT
    ----------------------------------*/
    await Tournament.deleteOne({ _id: tournamentId }).session(session);

    await session.commitTransaction();
    session.endSession();

    console.log("Tournament fully deleted & references cleaned");

    res.redirect("/organizer/tournaments");
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error(err);
    res.status(500).send("Failed to delete tournament");
  }
});

module.exports = router;
