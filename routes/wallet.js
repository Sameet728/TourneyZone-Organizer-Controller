const express = require("express");
const router = express.Router();
const User = require("../models/User");
const WalletTransaction = require("../models/WalletTransaction");

router.get("/deposit", async (req, res) => {
  const user = await User.findById(req.user._id);
  res.render("wallet/deposit", { user });
});

router.post("/deposit", async (req, res) => {
  try {
    const userId = req.user._id;
    const { amount, utr } = req.body;

    const depositAmount = parseInt(amount);
    if (isNaN(depositAmount) || depositAmount <= 0 || !utr) {
      return res.status(400).send("Invalid deposit data.");
    }

    const user = await User.findById(userId);

    const transaction = await WalletTransaction.create({
      user: user._id,
      amount: depositAmount,
      type: "credit",
      source: "UPI Manual Deposit",
      transactionId: utr,
      status: "processing", // Admin can later verify and mark as done
    });

    if (!Array.isArray(user.walletHistory)) user.walletHistory = [];
    user.walletHistory.push(transaction._id);
    await user.save();

    // ✅ Redirect based on role
    if (user.role === "organizer") {
      res.redirect("/organizer/wallet");
    } else {
      res.redirect("/player/wallet");
    }
  } catch (err) {
    console.error("❌ Error in wallet deposit:", err);
    res.status(500).send("Server Error");
  }
});

// Process bulk deposits
// Process bulk deposits
// Process bulk deposits
// Route: POST /bulk-deposit
const BulkDepositLog = require("../models/BulkDepositLog");

router.post("/bulk-deposit", async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).send("Access Denied");
    }
    const transactions = JSON.parse(req.body.transactions);

    if (!Array.isArray(transactions)) {
      return res.status(400).json({ error: "Invalid transactions data" });
    }

    const results = [];
    let successCount = 0;
    let failedCount = 0;

    for (const txn of transactions) {
      try {
        const deposit = await WalletTransaction.findOne({
          transactionId: txn.utr,
          status: "processing",
          type: "credit",
        }).populate("user");
        console.log(deposit);
        if (!deposit) {
          results.push({
            utr: txn.utr,
            status: "failed",
            message: "Transaction not found or already processed",
          });
          failedCount++;
          continue;
        }

        if (deposit.amount !== txn.amount) {
          results.push({
            utr: txn.utr,
            status: "failed",
            message: "Details do not match existing transaction",
          });
          failedCount++;
          continue;
        }

        deposit.status = "done";
        await deposit.save();

        const user = await User.findById(deposit.user._id);
        if (user) {
          user.wallet = (user.wallet || 0) + txn.amount;
          await user.save();
        }

        results.push({
          utr: txn.utr,
          status: "success",
          amount: deposit.amount,
          username: deposit.user.username,
        });
        successCount++;
      } catch (err) {
        results.push({
          utr: txn.utr,
          status: "failed",
          message: err.message,
        });
        failedCount++;
      }
    }

    // ✅ Save to DB
    await BulkDepositLog.create({
      processed: successCount,
      failed: failedCount,
      results,
    });

    // ✅ Store in session
    req.session.bulkDepositResult = {
      success: true,
      processed: successCount,
      failed: failedCount,
      results,
    };

    res.redirect("/admin/deposit/result");
  } catch (err) {
    console.error("Bulk deposit error:", err);
    res.status(500).json({
      error: "Server error processing bulk deposits",
      details: err.message,
    });
  }
});

module.exports = router;
