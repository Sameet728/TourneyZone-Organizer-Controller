// models/BulkDepositLog.js
const mongoose = require("mongoose");

const bulkDepositLogSchema = new mongoose.Schema({
  createdAt: {
    type: Date,
    default: Date.now,
  },
  processed: Number,
  failed: Number,
  results: [
    {
      utr: String,
      status: String, // success or failed
      amount: Number,
      username: String,
      message: String, // only for failed
    },
  ],
});

module.exports = mongoose.model("BulkDepositLog", bulkDepositLogSchema);
