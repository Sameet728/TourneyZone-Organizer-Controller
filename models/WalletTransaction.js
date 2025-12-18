const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  amount: {
    type: Number,
    required: true,
    
  },

  type: {
    type: String,
    enum: ["credit", "debit"],
    required: true,
  },

  source: {
    type: String,
    default: "N/A",
  }, // e.g., Tournament Earnings / UPI Withdrawal

  tournament: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tournament",
    default: null,
  },

  transactionId: {
    type: String,
    default: "N/A",
  }, // For withdrawals, else keep "N/A"

  upiId: {
    type: String,
    default: null,
  }, // Only used in withdrawals

  status: {
    type: String,
    enum: ["processing", "done"],
    default: "done",
  }, // Set "processing" for withdrawals

  date: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
