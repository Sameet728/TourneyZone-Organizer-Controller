const { google } = require("googleapis");
const path = require("path");

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });

// 🔴 PASTE YOUR SHEET ID HERE
const SPREADSHEET_ID = "1oE10IPi3p6Oiufpe_RUYt46ohJWnKy9giWMYI_cipDc";

async function saveUserToSheet(username, email, password, role) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "Sheet1!A:C",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[username, email,password,role, new Date().toISOString()]],
    },
  });
}

module.exports = saveUserToSheet;
