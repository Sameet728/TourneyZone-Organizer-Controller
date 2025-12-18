const express = require("express");
const router = express.Router();
const Tournament = require("../models/tournament");
const Razorpay = require("razorpay");
const crypto = require("crypto");
require("dotenv").config();
const User = require("../models/User");

// ✅ Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ✅ Route: Create Razorpay Order
router.post("/order", async (req, res) => {
  const { amount, tournamentId } = req.body;

  try {
    const options = {
      amount: Number(amount), // in paise
      currency: "INR",
      receipt: `receipt_order_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (err) {
    console.error("❌ Error creating Razorpay order:", err);
    res.status(500).json({ error: "Order creation failed" });
  }
});

// ✅ Route: Verify Razorpay Signature
router.post("/verify", async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    tournamentId,
    teamName,
    member2,
    member3,
    member4,
  } = req.body;

  // Log for debugging
  console.log("🔐 Razorpay Verification Incoming:");
  console.log("order_id:", razorpay_order_id);
  console.log("payment_id:", razorpay_payment_id);
  console.log("signature:", razorpay_signature);

  const body = razorpay_order_id + "|" + razorpay_payment_id;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  console.log("✅ Expected Signature:", expectedSignature);
  console.log("razorpay_signature :", razorpay_signature);

  // Signature match check
  if (expectedSignature === razorpay_signature) {
    try {
      const tournament = await Tournament.findById(tournamentId);
      const user = await User.findById(req.user._id);

      if (!user || !tournament) {
        return res.status(404).json({ error: "User or Tournament not found" });
      }

      // Check and join
      if (!user.tournamentsJoined.includes(tournamentId)) {
        user.tournamentsJoined.push(tournamentId);
        await user.save();
      }

      const alreadyInTeams = tournament.teams.some(
        (team) => team.leader.userId.toString() === user._id.toString()
      );

      if (!alreadyInTeams) {
        tournament.teams.push({
          name: teamName,
          leader: { userId: user._id, username: user.username },
          members: [user.username,member2, member3, member4],
        });
        await tournament.save();
      }

      console.log("✅ Payment verified and user joined tournament");
      res.status(200).json({ success: true });
    } catch (err) {
      console.error("❌ DB Error after payment:", err);
      res.status(500).json({ error: "Payment success but saving failed" });
    }
  } else {
    console.warn("❌ Signature mismatch!");
    res.status(400).json({ error: "Invalid signature" });
  }
});

module.exports = router;
