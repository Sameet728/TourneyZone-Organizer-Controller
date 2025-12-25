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
          name: "SVxArena",
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
  <style>
    /* Client-specific resets */
    body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    img { border: 0; line-height: 100%; outline: none; text-decoration: none; }
    
    /* Animations (Progressive Enhancement - works in Apple Mail/iOS) */
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.4); }
      70% { box-shadow: 0 0 0 10px rgba(124, 58, 237, 0); }
      100% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0); }
    }
    .cta-button:hover { background-color: #6d28d9 !important; transform: translateY(-2px); }
  </style>
</head>
<body style="background-color: #f5f3ff; margin: 0; padding: 40px 0;">

  <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.1); margin: 0 auto;">
    
    <tr>
      <td style="padding: 40px 30px; background: linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%); text-align: center;">
        <div style="font-size: 40px; margin-bottom: 10px;">🎮</div>
        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Match Credentials</h1>
        <p style="margin: 5px 0 0; color: #ddd6fe; font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">${tournament.name}</p>
      </td>
    </tr>

    <tr>
      <td style="padding: 40px 30px; background-color: #ffffff;">
        
        <p style="margin: 0 0 20px; font-size: 18px; color: #1e293b;">
          Hi <strong>${r.user.username}</strong> 👋
        </p>
        
        <p style="margin: 0 0 30px; font-size: 16px; color: #64748b; line-height: 1.6;">
          Your registration has been <strong style="color: #10b981;">accepted</strong>! Get ready to dominate. Here are your private room details.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 2px dashed #ddd6fe; border-radius: 16px; margin-bottom: 30px;">
          <tr>
            <td style="padding: 25px;">
              
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="50%" style="padding-bottom: 20px;">
                    <p style="margin: 0; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">Room ID</p>
                    <p style="margin: 5px 0 0; font-size: 20px; font-weight: 800; color: #7c3aed; font-family: monospace;">${roomId}</p>
                  </td>
                  <td width="50%" style="padding-bottom: 20px;">
                    <p style="margin: 0; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">Password</p>
                    <p style="margin: 5px 0 0; font-size: 20px; font-weight: 800; color: #1e293b; font-family: monospace;">${roomPassword}</p>
                  </td>
                </tr>
                <tr>
                  <td width="50%">
                    <p style="margin: 0; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">Start Time</p>
                    <p style="margin: 5px 0 0; font-size: 16px; font-weight: 600; color: #1e293b;">${matchTime}</p>
                  </td>
                  <td width="50%">
                    <p style="margin: 0; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px;">Your Slot</p>
                    <p style="margin: 5px 0 0; font-size: 16px; font-weight: 600; color: #7c3aed;">#${slotNumber}</p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center">
              <a href="#" class="cta-button" style="display: inline-block; padding: 16px 32px; background-color: #7c3aed; color: #ffffff; font-weight: 700; text-decoration: none; border-radius: 12px; font-size: 16px; animation: pulse 2s infinite;">
                🚀 Enter Match Room
              </a>
              <p style="margin-top: 15px; font-size: 12px; color: #94a3b8;">
                ⚠️ Please join the lobby 10 minutes before start time.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <tr>
      <td style="padding: 30px; background-color: #f5f3ff; border-top: 1px solid #ede9fe;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="40" valign="top">
              <div style="width: 40px; height: 40px; background-color: #e0e7ff; border-radius: 50%; text-align: center; line-height: 40px; font-size: 20px;">🛡️</div>
            </td>
            <td style="padding-left: 15px;">
              <p style="margin: 0; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase;">Organizer Contact</p>
              <p style="margin: 4px 0 0; font-weight: 700; color: #1e293b;">${organizerName}</p>
              <a href="mailto:${organizerEmail}" style="color: #7c3aed; font-size: 13px; text-decoration: none; font-weight: 500;">${organizerEmail}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr>
      <td style="padding: 15px; text-align: center; background-color: #1e1b4b; color: #6366f1; font-size: 12px; font-weight: 600;">
        Powered by <strong style="color: #ffffff;">SVxArena</strong>
      </td>
    </tr>

  </table>

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


