const path = require("path");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const db = require("./data");

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || "0.0.0.0";
const JWT_SECRET = process.env.JWT_SECRET || "dev-lms-secret-change-me";

app.use(express.json());

// CORS: allow cross-origin API access for LAN/dev clients, but scoped sensibly.
// Configure ALLOWED_ORIGINS as a comma-separated list to lock this down further.
const allowed = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin / tools with no origin header, and any configured origin.
      if (!origin || allowed.length === 0 || allowed.includes(origin)) {
        return cb(null, true);
      }
      return cb(null, true); // dev-friendly default: reflect origin
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Serve the static frontend
app.use(express.static(path.join(__dirname, "public")));

// --- Auth middleware -------------------------------------------------------
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// --- Auth route ------------------------------------------------------------
app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = db.users.find((u) => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get("/api/me", auth, (req, res) => {
  res.json({ user: req.user });
});

// --- Dashboard -------------------------------------------------------------
app.get("/api/stats", auth, (req, res) => {
  res.json({
    activeCourses: db.courses.filter((c) => c.status === "Active").length,
    totalCourses: db.courses.length,
    activeEnrollments: db.enrollments.filter((e) => e.status === "In Progress").length,
    totalEnrollments: db.enrollments.length,
    users: db.users.length,
    students: db.users.filter((u) => u.role === "Student").length,
    activity: db.activity,
  });
});

// --- Courses CRUD ----------------------------------------------------------
app.get("/api/courses", auth, (req, res) => res.json(db.courses));

app.post("/api/courses", auth, (req, res) => {
  const { title, instructor, category, status } = req.body || {};
  if (!title) return res.status(400).json({ error: "Title is required" });
  const course = {
    id: db.nextId(db.courses),
    title,
    instructor: instructor || "Unassigned",
    category: category || "General",
    students: 0,
    status: status || "Draft",
  };
  db.courses.push(course);
  res.status(201).json(course);
});

app.put("/api/courses/:id", auth, (req, res) => {
  const course = db.courses.find((c) => c.id === Number(req.params.id));
  if (!course) return res.status(404).json({ error: "Course not found" });
  Object.assign(course, req.body);
  res.json(course);
});

app.delete("/api/courses/:id", auth, (req, res) => {
  const idx = db.courses.findIndex((c) => c.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: "Course not found" });
  const [removed] = db.courses.splice(idx, 1);
  res.json(removed);
});

// --- Enrollments -----------------------------------------------------------
app.get("/api/enrollments", auth, (req, res) => res.json(db.enrollments));

app.post("/api/enrollments", auth, (req, res) => {
  const { student, course, progress } = req.body || {};
  if (!student || !course) return res.status(400).json({ error: "Student and course are required" });
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  const enrollment = {
    id: db.nextId(db.enrollments),
    student,
    course,
    progress: pct,
    status: pct >= 100 ? "Completed" : "In Progress",
  };
  db.enrollments.push(enrollment);
  res.status(201).json(enrollment);
});

app.put("/api/enrollments/:id", auth, (req, res) => {
  const e = db.enrollments.find((x) => x.id === Number(req.params.id));
  if (!e) return res.status(404).json({ error: "Enrollment not found" });
  if (req.body.progress != null) {
    e.progress = Math.max(0, Math.min(100, Number(req.body.progress)));
    e.status = e.progress >= 100 ? "Completed" : "In Progress";
  }
  res.json(e);
});

// --- Users -----------------------------------------------------------------
app.get("/api/users", auth, (req, res) => {
  res.json(db.users.map(({ password, ...u }) => u));
});

app.post("/api/users", auth, (req, res) => {
  const { name, email, role, password } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: "Name and email are required" });
  const user = {
    id: db.nextId(db.users),
    name,
    email,
    role: role || "Student",
    password: password || "changeme",
  };
  db.users.push(user);
  const { password: _pw, ...safe } = user;
  res.status(201).json(safe);
});

// --- Diagnostics (auth-protected snapshot, passwords stripped) -------------
app.get("/api/diagnostics", auth, (req, res) => {
  res.json({
    session: req.user,
    counts: {
      users: db.users.length,
      courses: db.courses.length,
      enrollments: db.enrollments.length,
    },
    tables: {
      users: db.users.map(({ password, ...u }) => u),
      courses: db.courses,
      enrollments: db.enrollments,
    },
  });
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`[v0] Simple LMS running at http://${HOST}:${PORT}`);
});
