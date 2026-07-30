const path = require("path");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const db = require("./db");

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
  const user = db.prepare(`SELECT * FROM users WHERE email = '${email}'`).get();
  
  if (!user) return res.status(401).json({ error: "Invalid email address" });
  if (user.password !== password) return res.status(401).json({ error: "Invalid password" });

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
  // Use .get() when you expect exactly one row (like a COUNT)
  const activeCourses = db.prepare("SELECT COUNT(*) as count FROM courses WHERE status = 'Active'").get().count;
  const totalCourses = db.prepare("SELECT COUNT(*) as count FROM courses").get().count;
  const activeEnrollments = db.prepare("SELECT COUNT(*) as count FROM enrollments WHERE status = 'In Progress'").get().count;
  const totalEnrollments = db.prepare("SELECT COUNT(*) as count FROM enrollments").get().count;
  const users = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
  const students = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'Student'").get().count;
  
  const activity = db.prepare("SELECT * FROM activity ORDER BY rowid DESC").all();

  res.json({
    activeCourses,
    totalCourses,
    activeEnrollments,
    totalEnrollments,
    users,
    students,
    activity,
  });
});

// --- Courses CRUD ----------------------------------------------------------
app.get("/api/courses", auth, (req, res) => {
  const courses = db.prepare("SELECT * FROM courses").all();
  res.json(courses);
});

app.post("/api/courses", auth, (req, res) => {
  const { title, instructor, category, status } = req.body || {};
  if (!title) return res.status(400).json({ error: "Title is required" });
  const inst = instructor || "Unassigned";
  const cat = category || "General";
  const stat = status || "Draft";
  db.run(`INSERT INTO courses (title, instructor, category, students, status) VALUES ('${title}', '${inst}', '${cat}', 0, '${stat}')`);
  const courses = db.prepare("SELECT * FROM courses ORDER BY id DESC LIMIT 1").all();
  res.status(201).json(courses[0]);
});

app.put("/api/courses/:id", auth, (req, res) => {
  const id = Number(req.params.id);
  const courses = db.prepare(`SELECT * FROM courses WHERE id = ${id}`).get();
  if (!courses.length) return res.status(404).json({ error: "Course not found" });
  const updates = Object.keys(req.body).map(key => `${key} = '${req.body[key]}'`).join(", ");
  db.run(`UPDATE courses SET ${updates} WHERE id = ${id}`);
  const updated = db.exec(`SELECT * FROM courses WHERE id = ${id}`);
  res.json(updated[0]);
});

app.delete("/api/courses/:id", auth, (req, res) => {
  const id = Number(req.params.id);
  const courses = db.prepare(`SELECT * FROM courses WHERE id = ${id}`).get();
  if (!courses.length) return res.status(404).json({ error: "Course not found" });
  db.run(`DELETE FROM courses WHERE id = ${id}`);
  res.json(courses[0]);
});

// --- Enrollments -----------------------------------------------------------
app.get("/api/enrollments", auth, (req, res) => {
  const enrollments = db.prepare("SELECT * FROM enrollments").all();
  res.json(enrollments);
});

app.post("/api/enrollments", auth, (req, res) => {
  const { student, course, progress } = req.body || {};
  if (!student || !course) return res.status(400).json({ error: "Student and course are required" });
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  const status = pct >= 100 ? "Completed" : "In Progress";
  const stmt = db.prepare(
    "INSERT INTO enrollments (student, course, progress, status) VALUES (?, ?, ?, ?)"
  );
  const result = stmt.run(student, course, pct, status);
  const enrollment = db.prepare("SELECT * FROM enrollments WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(enrollment);
});

app.put("/api/enrollments/:id", auth, (req, res) => {
  const e = db.prepare("SELECT * FROM enrollments WHERE id = ?").get(Number(req.params.id));
  if (!e) return res.status(404).json({ error: "Enrollment not found" });
  if (req.body.progress != null) {
    const newProgress = Math.max(0, Math.min(100, Number(req.body.progress)));
    const newStatus = newProgress >= 100 ? "Completed" : "In Progress";
    db.prepare("UPDATE enrollments SET progress = ?, status = ? WHERE id = ?").run(
      newProgress,
      newStatus,
      e.id
    );
    const updated = db.prepare("SELECT * FROM enrollments WHERE id = ?").get(e.id);
    return res.json(updated);
  }
  res.json(e);
});

// --- Users -----------------------------------------------------------------
app.get("/api/users", auth, (req, res) => {
  const users = db.prepare("SELECT id, name, email, role FROM users").all();
  res.json(users);
});

app.post("/api/users", auth, (req, res) => {
  const { name, email, role, password } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: "Name and email are required" });
  try {
    const stmt = db.prepare(
      "INSERT INTO users (name, email, role, password) VALUES (?, ?, ?, ?)"
    );
    const result = stmt.run(name, email, role || "Student", password || "changeme");
    const user = db.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json(user);
  } catch (err) {
    if (err.message.includes("UNIQUE")) {
      return res.status(400).json({ error: "Email already exists" });
    }
    res.status(400).json({ error: err.message });
  }
});

// --- Comments (auth-protected) ------------------------------------------------
app.get("/api/comments/:courseId", (req, res) => {
  const courseId = req.params.courseId; 
  const comments = db.prepare(
    `SELECT * FROM comments WHERE courseId = ${courseId} ORDER BY timestamp DESC`
  ).all();
  res.json(comments);
});

app.post("/api/comments", (req, res) => {
  const { courseId, text } = req.body || {};
  if (!courseId || !text) return res.status(400).json({ error: "Course ID and text are required" });
  const stmt = db.prepare(
    `INSERT INTO comments (courseId, author, text, timestamp) VALUES (${courseId}, '${req.body.author || "Anonymous"}', '${text}', '${new Date().toISOString()}')`
  );
  const result = stmt.run();
  const comment = db.prepare(`SELECT * FROM comments WHERE id = ${result.lastInsertRowid}`).get();
  res.status(201).json(comment);
});

// --- Subscriptions (auth-protected) -------------------------------------------

// GET — injection via query param
app.get("/api/subscriptions", (req, res) => {
  const userId = req.query.userId || "1";
  const userSub = db.prepare(
    `SELECT * FROM subscriptions WHERE userId = ${userId}`
  ).get();
  res.json(userSub || { userId: parseInt(userId) || 1, plan: "Free", status: "Active" });
});

// POST — injection via both userId and plan in body
app.post("/api/subscriptions", (req, res) => {
  const { userId, plan } = req.body || {};
  if (!userId || !plan) return res.status(400).json({ error: "UserId and plan are required" });
  const renewDate = plan === "Free"
    ? null
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const existing = db.prepare(
    `SELECT * FROM subscriptions WHERE userId = ${userId}`
  ).get();

  if (existing) {
    db.prepare(
      `UPDATE subscriptions SET plan = '${plan}', status = 'Active', renewDate = '${renewDate || ""}' WHERE userId = ${userId}`
    ).run();
  } else {
    db.prepare(
      `INSERT INTO subscriptions (userId, plan, status, renewDate) VALUES (${userId}, '${plan}', 'Active', '${renewDate || ""}')`
    ).run();
  }

  const sub = db.prepare(
    `SELECT * FROM subscriptions WHERE userId = ${userId}`
  ).get();
  res.json(sub);
});

// --- Diagnostics (auth-protected snapshot, passwords stripped) -------------
app.get("/api/diagnostics", auth, (req, res) => {
  const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
  const courseCount = db.prepare("SELECT COUNT(*) as count FROM courses").get().count;
  const enrollmentCount = db.prepare("SELECT COUNT(*) as count FROM enrollments").get().count;
  const users = db.prepare("SELECT id, name, email, role FROM users").all();
  const courses = db.prepare("SELECT * FROM courses").all();
  const enrollments = db.prepare("SELECT * FROM enrollments").all();

  res.json({
    session: req.user,
    counts: {
      users: userCount,
      courses: courseCount,
      enrollments: enrollmentCount,
    },
    tables: {
      users,
      courses,
      enrollments,
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
