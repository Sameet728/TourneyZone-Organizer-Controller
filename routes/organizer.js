const express = require("express");
const router = express.Router();
const Tournament = require("../models/tournament");
const User = require("../models/User");
const nodemailer = require("nodemailer");

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
      startDate,
      endDate,
      entryFee,
      teamLimit,
      type,
      timeSlot,
    } = req.body;

    const tournament = new Tournament({
      name,
      game,
      description,
      startDate,
      endDate,
      entryFee,
      teamLimit,
      type,
      timeSlot: type === "scrim" ? timeSlot : undefined,
      organizer: req.user._id,
      upiId: req.user.upiId, // ✅ SAME UPI AS ORGANIZER
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

    // ✅ add tournament to player
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

/* ================= SEND ROOM DETAILS + MATCH TIME ================= */

const Brevo = require("@getbrevo/brevo");

router.post("/tournaments/:id/room", isOrganizer, async (req, res) => {
  try {
    const { roomId, roomPassword, matchTime } = req.body;

    // 1️⃣ Fetch tournament with users + organizer
    const tournament = await Tournament.findById(req.params.id)
      .populate("registrations.user", "username email")
      .populate("organizer", "username email");

    if (!tournament) {
      return res.send("Tournament not found");
    }

    // 2️⃣ Save room + match time
    tournament.roomDetails = {
      roomId,
      roomPassword,
      sharedAt: new Date(),
    };
    tournament.matchTime = matchTime;
    await tournament.save();

    // 3️⃣ Brevo API init
    const apiInstance = new Brevo.TransactionalEmailsApi();
    apiInstance.setApiKey(
      Brevo.TransactionalEmailsApiApiKeys.apiKey,
      process.env.BREVO_API_KEY
    );

    // 4️⃣ Organizer fallback protection
    const organizerName =
      tournament.organizer?.username || "Tournament Organizer";
    const organizerEmail =
      tournament.organizer?.email || "support@tourneyzone.com";

    // 5️⃣ Accepted players only
    const acceptedPlayers = tournament.registrations.filter(
      r => r.status === "accepted" && r.user?.email
    );

    // 6️⃣ Send email to each accepted player
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
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>

<body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="padding:20px;">
    <tr>
      <td align="center">

        <table width="100%" cellpadding="0" cellspacing="0"
          style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.08);">

          <!-- HEADER -->
          <tr>
            <td style="padding:28px;background:linear-gradient(135deg,#6366f1,#22d3ee);color:#ffffff;">
              <h2 style="margin:0;font-size:22px;">🎮 Match Room Details</h2>
              <p style="margin:6px 0 0;font-size:14px;opacity:0.95;">
                ${tournament.name}
              </p>
            </td>
          </tr>

          <!-- CONTENT -->
          <tr>
            <td style="padding:28px;color:#1f2937;">

              <p style="margin:0 0 14px;font-size:15px;">
                Hi <strong>${r.user.username}</strong> 👋
              </p>

              <p style="margin:0 0 18px;font-size:14px;color:#4b5563;">
                You are officially <strong>accepted</strong> into the tournament.
                Below are your match details.
              </p>

              <!-- DETAILS -->
              <div style="background:#f8fafc;border-radius:12px;padding:18px;">
                <p style="margin:6px 0;font-size:15px;">
                  🔑 <strong>Room ID:</strong>
                  <span style="color:#2563eb;font-weight:600;">${roomId}</span>
                </p>
                <p style="margin:6px 0;font-size:15px;">
                  🔒 <strong>Password:</strong>
                  <span style="color:#2563eb;font-weight:600;">${roomPassword}</span>
                </p>
                <p style="margin:6px 0;font-size:15px;">
                  ⏰ <strong>Match Time:</strong>
                  <span style="color:#dc2626;font-weight:600;">${matchTime}</span>
                </p>
              </div>

              <p style="margin:16px 0 0;font-size:13px;color:#6b7280;">
                Please join the room at least <strong>10 minutes early</strong>.
              </p>

              <!-- ORGANIZER -->
              <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
                <p style="margin:0;font-size:13px;color:#374151;">
                  📞 <strong>Organizer Contact</strong>
                </p>
                <p style="margin:6px 0 0;font-size:13px;">
                  ${organizerName}<br/>
                  <a href="mailto:${organizerEmail}" style="color:#2563eb;text-decoration:none;">
                    ${organizerEmail}
                  </a>
                </p>
              </div>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" style="padding:18px;background:#f9fafb;font-size:12px;color:#9ca3af;">
              🚀 Powered by <strong>TourneyZone</strong><br/>
              Play fair. Win big.
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
        `,
      });
    }

    // 7️⃣ Done
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
    "username email upiId"
  );
  console.log(tournament);

  if (!tournament) {
    return res.send("Tournament not found");
  }

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

    if (tournament.status !== "completed") {
      return res.send("Tournament must be completed before submitting results");
    }

    // 🔎 helper to find team by leader username
    const findTeamByLeader = (leaderUsername) => {
      return tournament.teams.find(
        (team) => team.leader.username === leaderUsername
      );
    };

    const firstTeam = findTeamByLeader(firstLeaderUsername);
    const secondTeam = findTeamByLeader(secondLeaderUsername);
    const thirdTeam = findTeamByLeader(thirdLeaderUsername);

    if (!firstTeam || !secondTeam || !thirdTeam) {
      return res.send("Invalid team selection");
    }

    // ✅ SAVE RESULT (MATCHING SCHEMA)
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

    await tournament.save();

    res.redirect(`/organizer/tournaments/${tournament._id}`);
  } catch (err) {
    console.error(err);
    res.send("Error submitting results");
  }
});

module.exports = router;



