// index.js (FINAL STABLE VERSION)

require("dotenv").config();

const express = require("express");
const app = express();
const path = require("path");
const mongoose = require("mongoose");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const session = require("express-session");
const MongoStore = require("connect-mongo");

const User = require("./models/User");
const WalletTransaction = require("./models/WalletTransaction");

// ================= MONGODB =================
const dburl = process.env.MONGO_URI;

mongoose
  .connect(dburl)
  .then(() => console.log("MongoDB Connected Successfully"))
  .catch((err) => console.error("MongoDB Error:", err));

// ================= MIDDLEWARE =================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// ================= SESSION =================
const store = MongoStore.create({
  mongoUrl: dburl,
  crypto: { secret: process.env.SESSION_SECRET },
  touchAfter: 24 * 3600,
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

// ================= PASSPORT =================
app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// ================= GLOBAL USER =================
app.use((req, res, next) => {
  res.locals.currentUser = req.user || null;
  next();
});

// ================= ROUTES =================
app.use("/organizer", require("./routes/organizer"));
app.use("/player", require("./routes/player"));
app.use("/tournament", require("./routes/tournament"));
app.use("/wallet", require("./routes/wallet"));

// ================= PAGES =================
app.get("/", (req, res) => res.render("home"));
app.get("/signup", (req, res) => res.render("users/signup"));
app.get("/login", (req, res) => res.render("users/login"));

// ================= AUTH =================
app.post("/signup", async (req, res) => {
  const { username, email, password, role, upiId } = req.body;

  const user = new User({
    username,
    email,
    role,
    upiId: role === "organizer" ? upiId : undefined,
  });

  await User.register(user, password);
  res.redirect("/login");
});

app.post("/login", passport.authenticate("local", {
  failureRedirect: "/login",
}), (req, res) => {
  if (req.user.role === "organizer") return res.redirect("/organizer");
  if (req.user.role === "player") return res.redirect("/player");
  if (req.user.role === "admin") return res.redirect("/admin");
  res.redirect("/");
});

app.get("/logout", (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect("/login");
  });
});

// ================= ADMIN =================
app.get("/admin", async (req, res) => {
  const tx = await WalletTransaction.find().populate("user");
  res.render("dashboards/admin", { tx });
});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
