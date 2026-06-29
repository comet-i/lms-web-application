// Lightweight in-memory "database". Seeded on boot.
// Plain arrays keep the architecture intentionally simple.

const users = [
  { id: 1, name: "Ada Lovelace", email: "admin@lms.dev", password: "admin123", role: "Admin" },
  { id: 2, name: "Grace Hopper", email: "grace@lms.dev", password: "teach123", role: "Instructor" },
  { id: 3, name: "Alan Turing", email: "alan@lms.dev", password: "teach123", role: "Instructor" },
  { id: 4, name: "Katherine Johnson", email: "kat@lms.dev", password: "learn123", role: "Student" },
  { id: 5, name: "Linus Torvalds", email: "linus@lms.dev", password: "learn123", role: "Student" },
  { id: 6, name: "Margaret Hamilton", email: "maggie@lms.dev", password: "learn123", role: "Student" },
];

const courses = [
  { id: 1, title: "Intro to JavaScript", instructor: "Grace Hopper", category: "Programming", students: 2, status: "Active" },
  { id: 2, title: "Algorithms 101", instructor: "Alan Turing", category: "Computer Science", students: 1, status: "Active" },
  { id: 3, title: "Web Accessibility", instructor: "Grace Hopper", category: "Design", students: 1, status: "Draft" },
  { id: 4, title: "Discrete Mathematics", instructor: "Alan Turing", category: "Mathematics", students: 0, status: "Active" },
];

const enrollments = [
  { id: 1, student: "Katherine Johnson", course: "Intro to JavaScript", progress: 72, status: "In Progress" },
  { id: 2, student: "Linus Torvalds", course: "Intro to JavaScript", progress: 100, status: "Completed" },
  { id: 3, student: "Margaret Hamilton", course: "Algorithms 101", progress: 45, status: "In Progress" },
  { id: 4, student: "Katherine Johnson", course: "Web Accessibility", progress: 10, status: "In Progress" },
];

const activity = [
  { id: 1, text: "Linus Torvalds completed Intro to JavaScript", time: "2h ago" },
  { id: 2, text: "Grace Hopper published Web Accessibility (Draft)", time: "5h ago" },
  { id: 3, text: "Margaret Hamilton enrolled in Algorithms 101", time: "1d ago" },
  { id: 4, text: "New user Katherine Johnson joined as Student", time: "2d ago" },
];

// Simple incrementing id helpers
const nextId = (arr) => (arr.length ? Math.max(...arr.map((x) => x.id)) + 1 : 1);

module.exports = { users, courses, enrollments, activity, nextId };
