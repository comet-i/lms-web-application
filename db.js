const Database = require("better-sqlite3");
const path = require("path");

// Use in-memory database for now, or file-based if preferred
const dbPath = process.env.DB_PATH || path.join(__dirname, "lms.db");
const db = new Database(dbPath);

// Enable foreign keys
db.pragma("foreign_keys = ON");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    instructor TEXT NOT NULL,
    category TEXT NOT NULL,
    students INTEGER DEFAULT 0,
    status TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student TEXT NOT NULL,
    course TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    status TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    time TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    courseId INTEGER NOT NULL,
    author TEXT NOT NULL,
    text TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (courseId) REFERENCES courses(id)
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL UNIQUE,
    plan TEXT NOT NULL,
    status TEXT NOT NULL,
    renewDate TEXT,
    FOREIGN KEY (userId) REFERENCES users(id)
  );
`);

// Seed initial data if tables are empty
const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;

if (userCount === 0) {
  const insertUser = db.prepare(
    "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)"
  );
  const users = [
    ["Ada Lovelace", "admin@lms.dev", "admin123", "Admin"],
    ["Grace Hopper", "grace@lms.dev", "teach123", "Instructor"],
    ["Alan Turing", "alan@lms.dev", "teach123", "Instructor"],
    ["Katherine Johnson", "kat@lms.dev", "learn123", "Student"],
    ["Linus Torvalds", "linus@lms.dev", "learn123", "Student"],
    ["Margaret Hamilton", "maggie@lms.dev", "learn123", "Student"],
  ];
  users.forEach((u) => insertUser.run(...u));

  const insertCourse = db.prepare(
    "INSERT INTO courses (title, instructor, category, students, status) VALUES (?, ?, ?, ?, ?)"
  );
  const courses = [
    ["Intro to JavaScript", "Grace Hopper", "Programming", 2, "Active"],
    ["Algorithms 101", "Alan Turing", "Computer Science", 1, "Active"],
    ["Web Accessibility", "Grace Hopper", "Design", 1, "Draft"],
    ["Discrete Mathematics", "Alan Turing", "Mathematics", 0, "Active"],
  ];
  courses.forEach((c) => insertCourse.run(...c));

  const insertEnrollment = db.prepare(
    "INSERT INTO enrollments (student, course, progress, status) VALUES (?, ?, ?, ?)"
  );
  const enrollments = [
    ["Katherine Johnson", "Intro to JavaScript", 72, "In Progress"],
    ["Linus Torvalds", "Intro to JavaScript", 100, "Completed"],
    ["Margaret Hamilton", "Algorithms 101", 45, "In Progress"],
    ["Katherine Johnson", "Web Accessibility", 10, "In Progress"],
  ];
  enrollments.forEach((e) => insertEnrollment.run(...e));

  const insertActivity = db.prepare("INSERT INTO activity (text, time) VALUES (?, ?)");
  const activities = [
    ["Linus Torvalds completed Intro to JavaScript", "2h ago"],
    ["Grace Hopper published Web Accessibility (Draft)", "5h ago"],
    ["Margaret Hamilton enrolled in Algorithms 101", "1d ago"],
    ["New user Katherine Johnson joined as Student", "2d ago"],
  ];
  activities.forEach((a) => insertActivity.run(...a));

  const insertComment = db.prepare(
    "INSERT INTO comments (courseId, author, text, timestamp) VALUES (?, ?, ?, ?)"
  );
  const comments = [
    [1, "Katherine Johnson", "Great introductory course!", new Date(Date.now() - 3600000).toISOString()],
    [1, "Linus Torvalds", "Very helpful resources.", new Date(Date.now() - 7200000).toISOString()],
  ];
  comments.forEach((c) => insertComment.run(...c));

  const insertSubscription = db.prepare(
    "INSERT INTO subscriptions (userId, plan, status, renewDate) VALUES (?, ?, ?, ?)"
  );
  const subscriptions = [
    [1, "Enterprise", "Active", "2025-01-15"],
    [2, "Premium", "Active", "2024-12-20"],
    [3, "Basic", "Active", "2024-11-30"],
    [4, "Free", "Active", null],
    [5, "Free", "Active", null],
    [6, "Basic", "Active", "2024-12-10"],
  ];
  subscriptions.forEach((s) => insertSubscription.run(...s));
}

module.exports = db;
