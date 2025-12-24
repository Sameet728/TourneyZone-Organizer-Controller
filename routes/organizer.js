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

router.post("/tournaments/:id/room", isOrganizer, async (req, res) => {
  try {
    const { roomId, roomPassword, matchTime } = req.body;

    // 1️⃣ Fetch tournament with registered users
    const tournament = await Tournament.findById(req.params.id)
      .populate("registrations.user", "email username")
      .populate("organizer", "username email");

    if (!tournament) {
      return res.send("Tournament not found");
    }

    // 2️⃣ Save room details
    tournament.roomDetails = {
      roomId,
      roomPassword,
      sharedAt: new Date(),
    };

    // 3️⃣ Save match time (STRING)
    tournament.matchTime = matchTime;

    await tournament.save();

    // 4️⃣ Email setup
    const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST, // e.g., smtp.gmail.com
  port: 587,                   // Use 587 for TLS
  secure: false,               // Must be false for port 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  // Add this 'tls' block to prevent some certificate errors
  tls: {
    ciphers: 'SSLv3' 
  }
});

    // 5️⃣ Filter accepted players
    const acceptedPlayers = tournament.registrations.filter(function (r) {
      return r.status === "accepted" && r.user && r.user.email;
    });

    // 6️⃣ Send email to each accepted player
    for (let r of acceptedPlayers) {
      await transporter.sendMail({
        to: r.user.email,

        subject: `🎮 You're In! Match Details for ${tournament.name} 🏆`,

        html: `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>

<body style="
  margin:0;
  padding:0;
  background:#f5f7fb;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
">

  <table width="100%" cellpadding="0" cellspacing="0" style="padding:20px;">
    <tr>
      <td align="center">

        <!-- MAIN CARD -->
        <table width="100%" cellpadding="0" cellspacing="0"
          style="
            max-width:560px;
            background:#ffffff;
            border-radius:14px;
            overflow:hidden;
            box-shadow:0 10px 30px rgba(0,0,0,0.08);
          ">

          <!-- HEADER -->
          <tr>
            <td style="
              padding:26px;
              background:linear-gradient(135deg,#6a11cb,#2575fc);
              color:#ffffff;
            ">
              <h2 style="margin:0;font-size:22px;">
                🎮 Match Room Details
              </h2>
              <p style="margin:6px 0 0;font-size:14px;opacity:0.9;">
                ${tournament.name}
              </p>
            </td>
          </tr>

          <!-- CONTENT -->
          <tr>
            <td style="padding:26px;color:#333333;">

              <p style="margin:0 0 12px;font-size:15px;">
                Hi <strong>${r.user.username}</strong> 👋
              </p>

              <p style="margin:0 0 18px;font-size:14px;color:#555;">
                Congratulations! You have been <strong>successfully accepted</strong>
                into the tournament. Below are your official match details.
              </p>

              <!-- DETAILS BOX -->
              <table width="100%" cellpadding="0" cellspacing="0"
                style="
                  background:#f7f9fc;
                  border-radius:10px;
                  padding:18px;
                ">

                <tr>
                  <td style="padding:8px 0;font-size:15px;">
                    🔑 <strong>Room ID:</strong>
                    <span style="color:#2575fc;font-weight:600;">
                      ${roomId}
                    </span>
                  </td>
                </tr>

                <tr>
                  <td style="padding:8px 0;font-size:15px;">
                    🔒 <strong>Password:</strong>
                    <span style="color:#2575fc;font-weight:600;">
                      ${roomPassword}
                    </span>
                  </td>
                </tr>

                <tr>
                  <td style="padding:8px 0;font-size:15px;">
                    ⏰ <strong>Match Time:</strong>
                    <span style="color:#e5533d;font-weight:600;">
                      ${matchTime}
                    </span>
                  </td>
                </tr>

              </table>

              <p style="margin:16px 0 0;font-size:13px;color:#666;">
                Please join the room at least <strong>10 minutes early</strong>
                to avoid any last-minute issues.
              </p>

              <!-- ORGANIZER -->
              <div style="
                margin-top:24px;
                padding-top:16px;
                border-top:1px solid #e6e8ef;
              ">
                <p style="margin:0;font-size:13px;color:#555;">
                  📞 <strong>Organizer Contact</strong>
                </p>

                <p style="margin:6px 0 0;font-size:13px;">
                  ${tournament.organizer.username}<br/>
                  <a href="mailto:${tournament.organizer.email}"
                     style="color:#2575fc;text-decoration:none;">
                    ${tournament.organizer.email}
                  </a>
                </p>
              </div>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" style="
              padding:18px;
              background:#fafafa;
              font-size:12px;
              color:#999;
            ">
              🚀 Powered by <strong>TourneyZone</strong><br/>
              Best of luck & play fair!
            </td>
          </tr>

        </table>
        <!-- END CARD -->

      </td>
    </tr>
  </table>

</body>
</html>
  `,
      });
    }

    // 7️⃣ Done
    res.redirect("back");
  } catch (err) {
    console.error(err);
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

