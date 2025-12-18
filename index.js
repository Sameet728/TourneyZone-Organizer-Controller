// ===============================
// LOAD ENV FIRST (CRITICAL)
// ===============================
require("dotenv").config();

const express = require("express");
const app = express();
const path = require("path");
const mongoose = require("mongoose");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const session = require("express-session");
const MongoStore = require("connect-mongo");

const User = require("./models/User.js");
const WalletTransaction = require("./models/WalletTransaction.js");
const BulkDepositLog = require("./models/BulkDepositLog");

// ===============================
// ENV VALIDATION (FAIL FAST)
// ===============================
if (!process.env.MONGO_URI) {
  throw new Error("❌ MONGO_URI missing in .env");
}
if (!process.env.SESSION_SECRET) {
  throw new Error("❌ SESSION_SECRET missing in .env");
}

const dburl = process.env.MONGO_URI;

// ===============================
// BASIC APP SETUP
// ===============================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// ===============================
// CONNECT MONGODB FIRST
// ===============================
mongoose
  .connect(dburl)
  .then(() => console.log("✅ MongoDB Connected Successfully"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1);
  });

// ===============================
// SESSION CONFIG (AFTER DB)
// ===============================
app.use(
  session({
    name: "tourneyzone.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: dburl,
      collectionName: "sessions",
    }),
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  })
);

// ===============================
// PASSPORT CONFIG
// ===============================
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// ===============================
// CURRENT USER GLOBAL
// ===============================
app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  next();
});

// ===============================
// ROUTES
// ===============================
app.use("/organizer", require("./routes/organizer"));
app.use("/player", require("./routes/player"));
app.use("/tournament", require("./routes/tournament"));
app.use("/wallet", require("./routes/wallet"));

// ===============================
// ADMIN – BULK DEPOSIT RESULT
// ===============================
app.get("/admin/deposit/result", async (req, res) => {
  try {
    const logs = await BulkDepositLog.find()
      .sort({ createdAt: -1 })
      .limit(20);

    res.render("dashboards/depositResult", { logs });
  } catch (err) {
    console.error("❌ Error fetching bulk deposit results:", err);
    res.status(500).send("Server Error");
  }
});

// ===============================
// HOME
// ===============================
app.get("/", (req, res) => {
  res.render("home");
});

// ===============================
// AUTH
// ===============================
app.get("/signup", (req, res) => {
  res.render("users/signup");
});

// SIGNUP LOGIC (WITH UPI)
app.post("/signup", async (req, res) => {
  try {
    const { username, email, password, role, upiId } = req.body;

    if (!username || !email || !password || !role) {
      return res.send("All fields are required");
    }

    if (role === "organizer" && (!upiId || !upiId.trim())) {
      return res.send("UPI ID is required for organizers");
    }

    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
    });

    if (existingUser) {
      return res.send("Username or email already exists");
    }

    const newUser = new User({
      username,
      email,
      role,
      upiId: role === "organizer" ? upiId.trim() : undefined,
    });

    await User.register(newUser, password);

    console.log("✅ New user registered:", username);
    res.redirect("/login");
  } catch (err) {
    console.error("❌ Signup error:", err);
    res.redirect("/signup");
  }
});

app.get("/login", (req, res) => {
  res.render("users/login");
});

app.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user) => {
    if (err) return next(err);
    if (!user) return res.redirect("/login");

    req.logIn(user, (err) => {
      if (err) return next(err);

      switch (user.role) {
        case "admin":
          return res.redirect("/admin");
        case "organizer":
          return res.redirect("/organizer");
        case "player":
          return res.redirect("/player");
        default:
          return res.redirect("/");
      }
    });
  })(req, res, next);
});

app.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/login");
  });
});

// ===============================
// DASHBOARDS
// ===============================
app.get("/organizer", (req, res) => {
  res.render("dashboards/organizer");
});

app.get("/player", (req, res) => {
  res.render("dashboards/player");
});

app.get("/admin", async (req, res) => {
  const allTransactions = await WalletTransaction.find().populate("user");

  res.render("dashboards/admin", {
    withdrawalProcessing: allTransactions.filter(
      (t) => t.type === "debit" && t.status === "processing"
    ),
    withdrawalHistory: allTransactions.filter(
      (t) => t.type === "debit" && t.status === "done"
    ),
    depositProcessing: allTransactions.filter(
      (t) => t.type === "credit" && t.status === "processing"
    ),
    depositHistory: allTransactions.filter(
      (t) => t.type === "credit" && t.status === "done"
    ),
  });
});

// ===============================
// SERVER START
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 TourneyZone running on port ${PORT}`);
});
