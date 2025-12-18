const express = require("express");
const router = express.Router();
const Tournament = require("../models/tournament");
const WalletTransaction = require("../models/WalletTransaction");
const User = require("../models/User");
const mongoose = require("mongoose");

// Show form to create a new tournament
router.get("/tournaments/new", (req, res) => {
  if (!req.user || req.user.role !== "organizer") {
    return res.status(403).send("Access Denied");
  }
  res.render("organizer/newTournament");
});

router.post("/tournaments", async (req, res) => {
  try {
    const {
      name,
      game,
      description,
      startDate,
      endDate,
      timeSlot,
      type,
      entryFee,
    } = req.body;

    const organizerId = req.user._id;
    const PLATFORM_FEE = parseInt(process.env.PLATFORM_FEE) || 50;

    const organizer = await User.findById(organizerId);

    if (!organizer || organizer.wallet < PLATFORM_FEE) {
      return res.status(400).send("Insufficient wallet balance.");
    }

    const createdTournaments = [];

    if (type === "scrim") {
      const start = new Date(startDate);
      const end = new Date(endDate);
      let currentDate = new Date(start);

      while (currentDate <= end) {
        const day = currentDate.toISOString().split("T")[0];

        const newTournament = new Tournament({
          name: `${name} - ${day} (${timeSlot})`,
          game,
          description,
          startDate: new Date(currentDate),
          endDate: new Date(currentDate),
          timeSlot,
          type,
          entryFee,
          organizer: organizerId,
        });

        await newTournament.save();
        organizer.wallet -= PLATFORM_FEE;
        organizer.tournamentsCreated.push(newTournament._id);
        createdTournaments.push(newTournament._id);

        // 💾 Save WalletTransaction for each scrim day
        const transaction = await WalletTransaction.create({
          user: organizer._id,
          amount: PLATFORM_FEE,
          type: "debit",
          source: "Platform Fee - Scrim",
          tournament: newTournament._id,
          transactionId: "N/A",
          status: "done",
        });

        // ✅ Safely push to walletHistory
        if (!Array.isArray(organizer.walletHistory)) {
          organizer.walletHistory = [];
        }
        organizer.walletHistory.push(transaction._id);

        currentDate.setDate(currentDate.getDate() + 1);
      }

      await organizer.save();
      console.log("✅ Scrim tournaments created.");
    } else {
      const tournament = new Tournament({
        name,
        game,
        description,
        startDate,
        endDate,
        type,
        timeSlot: type === "scrim" ? timeSlot : undefined,
        entryFee,
        organizer: organizerId,
      });

      await tournament.save();

      organizer.wallet -= PLATFORM_FEE;
      organizer.tournamentsCreated.push(tournament._id);

      // 💾 Save WalletTransaction for normal tournament
      const transaction = await WalletTransaction.create({
        user: organizer._id,
        amount: PLATFORM_FEE,
        type: "debit",
        source: "Platform Fee - Tournament",
        tournament: tournament._id,
        transactionId: "N/A",
        status: "done",
      });

      // ✅ Safely push to walletHistory
      if (!Array.isArray(organizer.walletHistory)) {
        organizer.walletHistory = [];
      }
      console.log(transaction._id);
      organizer.walletHistory.push(transaction._id);

      await organizer.save();
      console.log("✅ Tournament created and fee deducted.");
    }

    res.redirect("/organizer/tournaments");
  } catch (err) {
    console.error("❌ Error creating tournament:", err);
    res.status(500).send("Server Error");
  }
});

// View all tournaments created by the logged-in organizer
router.get("/tournaments", async (req, res) => {
  try {
    if (!req.user || req.user.role !== "organizer") {
      return res.status(403).send("Access Denied");
    }

    const tournaments = await Tournament.find({ organizer: req.user._id });
    res.render("organizer/myTournaments", { tournaments });
  } catch (err) {
    console.error("Error fetching tournaments:", err);
    res.status(500).send("Server Error");
  }
});

// Render edit form
router.get("/tournaments/:id/edit", async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) return res.status(404).send("Tournament not found");

    if (
      !req.user ||
      req.user.role !== "organizer" ||
      !tournament.organizer.equals(req.user._id)
    ) {
      return res.status(403).send("Access Denied");
    }

    res.render("organizer/editTournament", { tournament });
  } catch (err) {
    console.error("Edit load error:", err);
    res.status(500).send("Server Error");
  }
});

// Handle tournament update
router.post("/tournaments/:id", async (req, res) => {
  try {
    const { name, game, description, startDate, endDate, status } = req.body;

    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).send("Tournament not found");

    if (
      !req.user ||
      req.user.role !== "organizer" ||
      !tournament.organizer.equals(req.user._id)
    ) {
      return res.status(403).send("Access Denied");
    }

    tournament.name = name;
    tournament.game = game;
    tournament.description = description;
    tournament.startDate = startDate;
    tournament.endDate = endDate;
    tournament.status = status;

    await tournament.save();
    res.redirect("/organizer/tournaments");
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).send("Update Failed");
  }
});

// View tournament details
router.get("/tournaments/:id", async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .populate("organizer", "username email")
      .populate("teams.members", "username email");

    if (!tournament) {
      return res.status(404).send("Tournament not found");
    }
    console.log(tournament);
    res.render("organizer/viewTournament", { tournament });
  } catch (err) {
    console.error("Error fetching tournament:", err);
    res.status(500).send("Server Error");
  }
});

// GET Results Submission Form
router.get("/tournaments/:id/results", async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id).populate({
      path: "teams.leader.userId",
      select: "username",
    });

    if (!tournament) {
      return res
        .status(404)
        .render("error", { message: "Tournament not found" });
    }

    if (tournament.status !== "completed") {
      return res.status(403).render("error", {
        message: "Tournament must be completed to submit results",
      });
    }

    if (!req.user._id.equals(tournament.organizer)) {
      return res.status(403).render("error", {
        message: "Only the tournament organizer can submit results",
      });
    }

    res.render("organizer/submitResults", {
      tournament,
      currentUser: req.user,
    });
  } catch (err) {
    console.error("Error loading results form:", err);
    res.status(500).render("error", { message: "Server error" });router.post("/tournaments/:id/results", async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) {
      return res.status(404).send("Tournament not found");
    }
    if (tournament.isPaidToOrganizer) {
      return res.send("Results already submitted");
    }

    const entryFee = Number(tournament.entryFee) || 0;
    const totalPrizePool = entryFee * (tournament.teams?.length || 0);
    const x = totalPrizePool / 7;

    const payouts = {
      first: 3 * x,
      second: 2 * x,
      third: x,
      organizer: x,
    };

    async function creditWalletAndLog(username, amount, source, tournamentId) {
      const user = await User.findOne({ username: String(username).trim() });
      if (!user) throw new Error(`User not found: ${username}`);

      const transaction = await WalletTransaction.create({
        user: user._id,
        amount,
        type: "credit",
        source,
        tournament: tournamentId,
        transactionId: `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        status: "done",
        date: new Date(),
      });

      user.wallet += amount;
      user.walletHistroy.push(transaction._id);
      await user.save();
    }

    await creditWalletAndLog(req.body.firstLeaderUsername, payouts.first, "Tournament 1st place prize", tournament._id);
    await creditWalletAndLog(req.body.secondLeaderUsername, payouts.second, "Tournament 2nd place prize", tournament._id);
    await creditWalletAndLog(req.body.thirdLeaderUsername, payouts.third, "Tournament 3rd place prize", tournament._id);
    await creditWalletAndLog(req.user.username, payouts.organizer, "Tournament organizer share", tournament._id);

    tournament.isPaidToOrganizer = false;
    await tournament.save();

    res.send("Payouts processed successfully.");
  } catch (err) {
    console.error("Error processing payouts:", err);
    res.status(500).send(err.message);
  }
});

  }
});

// Route: POST /organizer/tournaments/:id/results
router.post("/tournaments/:id/results", async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) {
      return res.status(404).send("Tournament not found");
    }

    // Ensure only the organizer can submit results
    if (!tournament.organizer.equals(req.user._id)) {
      return res.status(403).send("Only the organizer can submit results");
    }

    // Prevent double payouts
    if (tournament.isPaidToOrganizer) {
      return res.redirect(`/organizer/tournaments/${tournament._id}?message=Results+already+submitted`);
    }

    const entryFee = Number(tournament.entryFee) || 0;
    const totalPrizePool = entryFee * (tournament.teams?.length || 0);
    const x = totalPrizePool / 7;

    const payouts = {
      first: 3 * x,
      second: 2 * x,
      third: x,
      organizer: x,
    };

    // ✅ Helper: credit wallet + log transaction (safer order)
    async function creditWalletAndLog(username, amount, source, tournamentId) {
      const user = await User.findOne({ username: username.trim() });
      if (!user) {
        throw new Error(`User not found: ${username}`);
      }

      // Step 1: Update wallet balance
      user.wallet += amount;
      await user.save();

      // Step 2: Create wallet transaction
      const transaction = await WalletTransaction.create({
        user: user._id,
        amount,
        type: "credit",
        source,
        tournament: tournamentId,
        transactionId: `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        status: "done",
        date: new Date(),
      });

      // Step 3: Link transaction to user
      user.walletHistroy.push(transaction._id);
      await user.save();
    }

    // Process payouts
    await creditWalletAndLog(
      req.body.firstLeaderUsername,
      payouts.first,
      "Tournament 1st place prize",
      tournament._id
    );
    await creditWalletAndLog(
      req.body.secondLeaderUsername,
      payouts.second,
      "Tournament 2nd place prize",
      tournament._id
    );
    await creditWalletAndLog(
      req.body.thirdLeaderUsername,
      payouts.third,
      "Tournament 3rd place prize",
      tournament._id
    );

    // Organizer payout
    await creditWalletAndLog(
      req.user.username,
      payouts.organizer,
      "Tournament organizer share",
      tournament._id
    );

    // Mark as paid
    tournament.isPaidToOrganizer = true;
    await tournament.save();

    // ✅ Redirect back to tournament page with success message
    res.redirect(`/organizer/tournaments/${tournament._id}?message=Payouts+processed+successfully`);
  } catch (err) {
    console.error("Error processing payouts:", err.message);
    res.redirect(`/organizer/tournaments/${req.params.id}?error=${encodeURIComponent(err.message)}`);
  }
});


//wallet rendering
router.get("/wallet", async (req, res) => {
  try {
    const organizer = await User.findById(req.user._id);
    const transactions = await WalletTransaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate("tournament", "name");

    res.render("organizer/wallet", {
      user: req.user,
      walletBalance: organizer.wallet || 0,
      transactions,
    });
  } catch (err) {
    console.error("Wallet page error:", err);
    res.status(500).send("Server Error");
  }
});

// wallet withdraw rendering
// Show Withdraw Form
router.get("/wallet/withdraw", async (req, res) => {
  if (!req.user) {
    return res.status(403).send("Access denied");
  }

  const user = await User.findById(req.user._id);
  res.render("organizer/withdraw", { walletBalance: user.wallet || 0 });
});

// Handle Withdraw Request
router.post("/wallet/withdraw", async (req, res) => {
  const { upiId, amount } = req.body;
  const user = await User.findById(req.user._id);

  if (!upiId || !amount || isNaN(amount)) {
    return res.status(400).send("Invalid UPI ID or amount");
  }

  const withdrawalAmount = parseInt(amount);
  if (withdrawalAmount > user.wallet) {
    return res.status(400).send("Insufficient balance");
  }

  // Deduct from wallet
  user.wallet -= withdrawalAmount;
  await user.save();

  // Save transaction with status "processing"
  const txn = new WalletTransaction({
    user: user._id,
    amount: withdrawalAmount,
    type: "debit",
    upiId,
    status: "processing", // later change to "done" manually
    transactionId: "TBD_MANUALLY",
    source: "UPI Withdrawal",
  });

  await txn.save();
  res.redirect("/organizer/wallet");
});

module.exports = router;
