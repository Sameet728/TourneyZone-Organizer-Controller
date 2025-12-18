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

// MongoDB URL
const dburl = process.env.MONGO_URI;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "/public")));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.json());

// MongoDB Connection

async function main() {
  try {
    await mongoose.connect(dburl);
    console.log("MongoDB Connected Successfully");
    // ✅ THEN CREATE SESSION STORE
    const store = MongoStore.create({
      mongoUrl: dburl,
      crypto: { secret: process.env.SESSION_SECRET },
      touchAfter: 24 * 3600,
    });

    store.on("error", (e) => {
      console.log("❌ SESSION STORE ERROR", e);
    });

    app.use(
      session({
        store,
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
          httpOnly: true,
          maxAge: 7 * 24 * 60 * 60 * 1000,
        },
      })
    );

   
    
  } catch (err) {
    console.error("MongoDB Error:", err);
  }
}

main();
 // Passport
    app.use(passport.initialize());
    app.use(passport.session());
    passport.use(new LocalStrategy(User.authenticate()));
    passport.serializeUser(User.serializeUser());
    passport.deserializeUser(User.deserializeUser());


// Current user
    app.use((req, res, next) => {
      res.locals.currentUser = req.user;
      next();
    });

// ✅ =============== AUTH ROUTES ===============

const organizerRoutes = require("./routes/organizer");
app.use("/organizer", organizerRoutes);
const playerRoutes = require("./routes/player");
app.use("/player", playerRoutes);
const tournamentRoutes = require("./routes/tournament");
app.use("/tournament", tournamentRoutes);
// const paymentRoutes = require("./routes/payment");
// app.use("/payment", paymentRoutes);
const walletRoutes = require("./routes/wallet");
app.use("/wallet", walletRoutes);
const BulkDepositLog = require("./models/BulkDepositLog"); // ✅ import your model

app.get("/admin/deposit/result", async (req, res) => {
  try {
    // ✅ Get all past bulk deposit logs, latest first
    const logs = await BulkDepositLog.find().sort({ createdAt: -1 }).limit(20); // optional limit

    res.render("dashboards/depositResult", { logs });
  } catch (err) {
    console.error("❌ Error fetching bulk deposit results:", err);
    res.status(500).send("Server Error");
  }
});

//home page
app.get("/", (req, res) => {
  res.render("home");
});

// Signup Page
app.get("/signup", (req, res) => {
  res.render("users/signup");
});

// Signup Logic
app.post("/signup", async (req, res) => {
  try {
    const { username, email, password, role, upiId } = req.body;

    // Basic validation
    if (!username || !email || !password || !role) {
      return res.send("All fields are required");
    }

    // Organizer must provide UPI ID
    if (role === "organizer" && (!upiId || upiId.trim() === "")) {
      return res.send("UPI ID is required for organizers");
    }

    // Check duplicate username or email
    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
    });

    if (existingUser) {
      return res.send("Username or email already exists.");
    }

    // Create new user
    const newUser = new User({
      username,
      email,
      role,
      upiId: role === "organizer" ? upiId.trim() : undefined,
    });

    // Register user (passport-local-mongoose)
    await User.register(newUser, password);

    console.log("✅ New user registered:", username);

    res.redirect("/login");
  } catch (err) {
    console.error("❌ Signup error:", err);
    res.redirect("/signup");
  }
});

// Login Page
app.get("/login", (req, res) => {
  res.render("users/login");
});

// Login Logic
app.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      console.error("Authentication error:", err);
      return next(err);
    }
    if (!user) {
      console.log("❌ Invalid email or password");
      return res.redirect("/login");
    }

    req.logIn(user, (err) => {
      if (err) {
        console.error("Login error:", err);
        return next(err);
      }

      console.log("✅ Logged in:", user.username, "| Role:", user.role);

      // Redirect based on role
      switch (user.role) {
        case "admin":
          return res.redirect("/admin");
        case "organizer":
          return res.redirect("/organizer");
        case "player":
          return res.redirect("/player");
        default:
          console.warn("Unknown role, redirecting to default dashboard.");
          return res.redirect("/dashboard");
      }
    });
  })(req, res, next);
});

// Logout
app.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/login");
  });
});

// Dummy Dashboard (You can make separate for roles later)
app.get("/dashboard", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/login");
  }
  res.send(`Welcome ${req.user}!`);
});

//organizer page render
app.get("/organizer", (req, res) => {
  res.render("dashboards/organizer");
});
//player page render
app.get("/player", (req, res) => {
  res.render("dashboards/player");
});
//admin page render
// Admin Dashboard Route
app.get("/admin", async (req, res) => {
  const allTransactions = await WalletTransaction.find().populate("user");

  const withdrawalProcessing = allTransactions.filter(
    (tx) => tx.type === "debit" && tx.status === "processing"
  );
  const withdrawalHistory = allTransactions.filter(
    (tx) => tx.type === "debit" && tx.status === "done"
  );

  const depositProcessing = allTransactions.filter(
    (tx) => tx.type === "credit" && tx.status === "processing"
  );
  const depositHistory = allTransactions.filter(
    (tx) => tx.type === "credit" && tx.status === "done"
  );

  res.render("dashboards/admin", {
    withdrawalProcessing,
    withdrawalHistory,
    depositProcessing,
    depositHistory,
  });

  // res.render("dashboards/admin", {
  //   processingTransactions,
  //   paidTransactions,
  // });
});
//update transaction to sucesss for admin
app.post("/admin/transactions/:id/update", async (req, res) => {
  const { transactionId, status } = req.body;

  await WalletTransaction.findByIdAndUpdate(req.params.id, {
    transactionId,
    status,
  });

  res.redirect("/admin");
});
app.post("/admin/transactions/:id/verify", async (req, res) => {
  try {
    const transactionId = req.params.id;
    const txn = await WalletTransaction.findById(transactionId);

    if (!txn || txn.status !== "processing" || txn.type !== "credit") {
      return res.status(400).send("Invalid or already verified transaction.");
    }

    // Update transaction status
    txn.status = "done";
    await txn.save();

    // Credit amount to user wallet
    const user = await User.findById(txn.user);
    user.wallet += txn.amount;
    await user.save();

    res.redirect("/admin");
  } catch (err) {
    console.error("❌ Error verifying deposit:", err);
    res.status(500).send("Server Error");
  }
});

// Server Start
app.listen(3000, () => {
  console.log("Server running on port 3000");
});


