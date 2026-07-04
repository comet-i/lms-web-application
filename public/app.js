// ----------------------------------------------------------------------------
// Simple LMS — Vanilla JS client
// JWT stored in localStorage to persist sessions across reloads.
// ----------------------------------------------------------------------------

const TOKEN_KEY = "lms_token";
const USER_KEY = "lms_user";

const state = {
  token: localStorage.getItem(TOKEN_KEY),
  user: JSON.parse(localStorage.getItem(USER_KEY) || "null"),
  courseFilter: "",
  enrollFilter: "",
  userRoleFilter: "all",
};

const $ = (sel) => document.querySelector(sel);

// ---------- API helper ----------
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    // Only auto-logout if we had a token (expired session). Otherwise, pass error through.
    if (state.token) {
      logout();
      throw new Error("Session expired");
    }
    // Let login errors pass through with their specific message
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Authentication failed");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function initials(name) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ---------- Auth ----------
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = $("#login-error");
  errorEl.textContent = "";
  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ email: $("#email").value, password: $("#password").value }),
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    enterApp();
  } catch (err) {
    errorEl.textContent = err.message || "Login failed";
  }
});

$("#logout-btn").addEventListener("click", logout);

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  $("#app-view").hidden = true;
  $("#login-view").hidden = false;
}

function enterApp() {
  $("#login-view").hidden = true;
  $("#app-view").hidden = false;
  $("#user-name").textContent = state.user.name;
  $("#user-role").textContent = state.user.role;
  $("#user-initials").textContent = initials(state.user.name);
  navigate("dashboard");
}

// ---------- Routing ----------
const titles = {
  dashboard: ["Dashboard", "Platform overview and recent activity"],
  courses: ["Courses", "Manage active course listings"],
  enrollments: ["Enrollments", "Track student progress per course"],
  users: ["Users", "Platform members and access roles"],
  session: ["Session State", "Current authenticated session"],
  database: ["Database Snapshot", "Raw in-memory store contents"],
};

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => navigate(btn.dataset.view));
});

function navigate(view) {
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  const [title, subtitle] = titles[view] || ["", ""];
  $("#view-title").textContent = title;
  $("#view-subtitle").textContent = subtitle;
  $("#view-root").innerHTML = `<div class="empty">Loading…</div>`;
  renderers[view]();
}

// ---------- Views ----------
const renderers = {
  async dashboard() {
    const s = await api("/api/stats");
    $("#view-root").innerHTML = `
      <div class="stat-grid">
        ${statCard("Active Courses", s.activeCourses, `${s.totalCourses} total`)}
        ${statCard("Active Enrollments", s.activeEnrollments, `${s.totalEnrollments} total`)}
        ${statCard("Users", s.users, `${s.students} students`)}
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Recent Activity</h3></div>
        <div class="panel-body">
          <ul class="activity-list">
            ${s.activity
              .map((a) => `<li><span>${esc(a.text)}</span><time>${esc(a.time)}</time></li>`)
              .join("")}
          </ul>
        </div>
      </div>`;
  },

  async courses() {
    const courses = await api("/api/courses");
    const root = $("#view-root");
    const filtered = courses.filter((c) =>
      `${c.title} ${c.instructor} ${c.category}`.toLowerCase().includes(state.courseFilter.toLowerCase())
    );
    root.innerHTML = `
      <div class="panel section-gap">
        <div class="panel-head"><h3>Add Course</h3></div>
        <div class="panel-body">
          <form id="course-form" class="inline-form">
            <label>Title<input name="title" required placeholder="Course title" /></label>
            <label>Instructor<input name="instructor" placeholder="Instructor" /></label>
            <label>Category<input name="category" placeholder="Category" /></label>
            <label>Status
              <select name="status"><option>Active</option><option>Draft</option></select>
            </label>
            <button class="btn btn-primary" type="submit">Add Course</button>
          </form>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <h3>Course Listings</h3>
          <div class="toolbar">
            <input id="course-search" type="search" placeholder="Filter courses…" value="${esc(state.courseFilter)}" />
          </div>
        </div>
        <table>
          <thead><tr><th>Title</th><th>Instructor</th><th>Category</th><th>Students</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${
              filtered.length
                ? filtered
                    .map(
                      (c) => `<tr style="cursor: pointer;" data-course-id="${c.id}">
                        <td>${esc(c.title)}</td>
                        <td>${esc(c.instructor)}</td>
                        <td>${esc(c.category)}</td>
                        <td>${c.students}</td>
                        <td>${badge(c.status, c.status === "Active" ? "green" : "muted")}</td>
                        <td onclick="event.stopPropagation();"><button class="btn btn-danger btn-sm" data-del="${c.id}">Delete</button></td>
                      </tr>`
                    )
                    .join("")
                : `<tr><td colspan="6" class="empty">No courses match your filter.</td></tr>`
            }
          </tbody>
        </table>
      </div>`;

    const search = $("#course-search");
    search.addEventListener("input", () => {
      state.courseFilter = search.value;
      renderers.courses();
    });

    $("#course-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      await api("/api/courses", {
        method: "POST",
        body: JSON.stringify({
          title: f.title.value,
          instructor: f.instructor.value,
          category: f.category.value,
          status: f.status.value,
        }),
      });
      state.courseFilter = "";
      renderers.courses();
    });

    root.querySelectorAll("[data-del]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        await api(`/api/courses/${btn.dataset.del}`, { method: "DELETE" });
        renderers.courses();
      })
    );

    root.querySelectorAll("tr[data-course-id]").forEach((row) =>
      row.addEventListener("click", () => {
        const courseId = parseInt(row.dataset.courseId);
        state.currentCourseId = courseId;
        renderers.courseDetail();
      })
    );
  },

  async courseDetail() {
    if (!state.currentCourseId) return renderers.courses();
    const courses = await api("/api/courses");
    const course = courses.find((c) => c.id === state.currentCourseId);
    if (!course) return renderers.courses();
    const comments = await api(`/api/comments/${state.currentCourseId}`);
    const root = $("#view-root");
    root.innerHTML = `
      <div class="panel section-gap">
        <div class="panel-head">
          <button class="btn btn-light btn-sm" id="back-btn">← Back to Courses</button>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>${esc(course.title)}</h3></div>
        <div class="panel-body">
          <p><strong>Instructor:</strong> ${esc(course.instructor)}</p>
          <p><strong>Category:</strong> ${esc(course.category)}</p>
          <p><strong>Students Enrolled:</strong> ${course.students}</p>
          <p><strong>Status:</strong> ${badge(course.status, course.status === "Active" ? "green" : "muted")}</p>
        </div>
      </div>
      <div class="panel">
        <div class="panel-body">
          <div class="comments-section">
            <div class="comments-header">
              <h4>Discussion & Comments</h4>
            </div>
            <div class="comment-form">
              <textarea id="comment-text" placeholder="Share your thoughts or ask a question..."></textarea>
              <div class="comment-form-actions">
                <button id="comment-submit" class="btn btn-primary">Post Comment</button>
                <button id="comment-cancel" class="btn btn-light">Clear</button>
              </div>
            </div>
            <div class="comment-list">
              ${comments.length ? comments.map((cm) => `
                <div class="comment-item">
                  <div class="comment-meta">
                    <span class="comment-author">${esc(cm.author)}</span>
                    <span>${new Date(cm.timestamp).toLocaleDateString()}</span>
                  </div>
                  <div class="comment-text">${esc(cm.text)}</div>
                </div>
              `).join("") : `<p class="empty">No comments yet. Be the first to comment!</p>`}
            </div>
          </div>
        </div>
      </div>`;

    $("#back-btn").addEventListener("click", () => {
      state.currentCourseId = null;
      renderers.courses();
    });

    $("#comment-submit").addEventListener("click", async () => {
      const text = $("#comment-text").value.trim();
      if (!text) return;
      await api("/api/comments", {
        method: "POST",
        body: JSON.stringify({ courseId: state.currentCourseId, text }),
      });
      renderers.courseDetail();
    });

    $("#comment-cancel").addEventListener("click", () => {
      $("#comment-text").value = "";
    });
  },

  async enrollments() {
    const list = await api("/api/enrollments");
    const root = $("#view-root");
    const filtered = list.filter((e) =>
      `${e.student} ${e.course}`.toLowerCase().includes(state.enrollFilter.toLowerCase())
    );
    root.innerHTML = `
      <div class="panel section-gap">
        <div class="panel-head"><h3>Enroll Student</h3></div>
        <div class="panel-body">
          <form id="enroll-form" class="inline-form">
            <label>Student<input name="student" required placeholder="Student name" /></label>
            <label>Course<input name="course" required placeholder="Course title" /></label>
            <label>Progress %<input name="progress" type="number" min="0" max="100" value="0" /></label>
            <button class="btn btn-primary" type="submit">Enroll</button>
          </form>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <h3>Enrollment Ledger</h3>
          <div class="toolbar">
            <input id="enroll-search" type="search" placeholder="Filter enrollments…" value="${esc(state.enrollFilter)}" />
          </div>
        </div>
        <table>
          <thead><tr><th>Student</th><th>Course</th><th>Progress</th><th>Status</th></tr></thead>
          <tbody>
            ${
              filtered.length
                ? filtered
                    .map(
                      (e) => `<tr>
                        <td>${esc(e.student)}</td>
                        <td>${esc(e.course)}</td>
                        <td>
                          <span class="progress"><span style="width:${e.progress}%"></span></span>
                          <span class="progress-label">${e.progress}%</span>
                        </td>
                        <td>${badge(e.status, e.status === "Completed" ? "green" : "amber")}</td>
                      </tr>`
                    )
                    .join("")
                : `<tr><td colspan="4" class="empty">No enrollments match your filter.</td></tr>`
            }
          </tbody>
        </table>
      </div>`;

    const search = $("#enroll-search");
    search.addEventListener("input", () => {
      state.enrollFilter = search.value;
      renderers.enrollments();
    });

    $("#enroll-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      await api("/api/enrollments", {
        method: "POST",
        body: JSON.stringify({
          student: f.student.value,
          course: f.course.value,
          progress: Number(f.progress.value),
        }),
      });
      state.enrollFilter = "";
      renderers.enrollments();
    });
  },

  async users() {
    const users = await api("/api/users");
    const root = $("#view-root");
    const filtered =
      state.userRoleFilter === "all" ? users : users.filter((u) => u.role === state.userRoleFilter);
    root.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h3>Platform Members</h3>
          <div class="toolbar">
            <select id="role-filter">
              <option value="all">All roles</option>
              <option value="Admin">Admin</option>
              <option value="Instructor">Instructor</option>
              <option value="Student">Student</option>
            </select>
          </div>
        </div>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>
            ${filtered
              .map(
                (u) => `<tr>
                  <td>${esc(u.name)}</td>
                  <td>${esc(u.email)}</td>
                  <td>${badge(u.role, roleColor(u.role))}</td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>`;
    const filter = $("#role-filter");
    filter.value = state.userRoleFilter;
    filter.addEventListener("change", () => {
      state.userRoleFilter = filter.value;
      renderers.users();
    });
  },

  async subscriptions() {
    const sub = await api("/api/subscriptions");
    const root = $("#view-root");
    const plans = [
      { name: "Basic", price: "$9.99", period: "/month", features: ["Up to 5 courses", "Community support", "Basic analytics"] },
      { name: "Premium", price: "$29.99", period: "/month", features: ["Unlimited courses", "Priority support", "Advanced analytics", "Custom branding"] },
      { name: "Enterprise", price: "Custom", period: "pricing", features: ["Everything in Premium", "Dedicated account manager", "API access", "Custom integrations"] },
    ];
    root.innerHTML = `
      <div class="panel section-gap">
        <div class="panel-head"><h3>Current Plan</h3></div>
        <div class="panel-body">
          <p style="margin: 0; font-size: 1.2rem;"><strong>${esc(sub.plan)}</strong> ${sub.renewDate ? `(Renews: ${sub.renewDate})` : ""}</p>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Choose Your Plan</h3></div>
        <div class="panel-body">
          <div class="pricing-grid">
            ${plans.map((p, i) => `
              <div class="pricing-card ${sub.plan === p.name ? "active" : ""}">
                <div class="pricing-header">
                  <h3 class="pricing-name">${esc(p.name)}</h3>
                  <div class="pricing-price">${esc(p.price)}<span class="period">${esc(p.period)}</span></div>
                </div>
                <div class="pricing-features">
                  <ul>
                    ${p.features.map((f) => `<li>${esc(f)}</li>`).join("")}
                  </ul>
                </div>
                <div class="pricing-action">
                  <button class="btn ${sub.plan === p.name ? "btn-primary" : "btn-light"}" data-plan="${esc(p.name)}">
                    ${sub.plan === p.name ? "Current Plan" : "Select Plan"}
                  </button>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      </div>`;
    
    root.querySelectorAll("[data-plan]").forEach((btn) => {
      if (btn.textContent.includes("Current Plan")) {
        btn.disabled = true;
      } else {
        btn.addEventListener("click", async () => {
          await api("/api/subscriptions", {
            method: "POST",
            body: JSON.stringify({ plan: btn.dataset.plan }),
          });
          renderers.subscriptions();
        });
      }
    });
  },

  async session() {
    const data = await api("/api/me");
    $("#view-root").innerHTML = `
      <div class="panel">
        <div class="panel-head"><h3>Active Session (decoded JWT claims)</h3></div>
        <div class="panel-body">
          <div class="code-block">${esc(JSON.stringify(data.user, null, 2))}</div>
        </div>
      </div>`;
  },

  async database() {
    const data = await api("/api/diagnostics");
    $("#view-root").innerHTML = `
      <div class="stat-grid">
        ${statCard("Users", data.counts.users, "records")}
        ${statCard("Courses", data.counts.courses, "records")}
        ${statCard("Enrollments", data.counts.enrollments, "records")}
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Raw Store Snapshot</h3></div>
        <div class="panel-body">
          <div class="code-block">${esc(JSON.stringify(data.tables, null, 2))}</div>
        </div>
      </div>`;
  },
};

// ---------- Small render helpers ----------
function statCard(label, value, sub) {
  return `<div class="stat-card">
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value">${esc(value)}</div>
    <div class="stat-sub">${esc(sub)}</div>
  </div>`;
}
function badge(text, color) {
  return `<span class="badge badge-${color}">${esc(text)}</span>`;
}
function roleColor(role) {
  return role === "Admin" ? "navy" : role === "Instructor" ? "amber" : "muted";
}

// ---------- Boot ----------
if (state.token && state.user) {
  enterApp();
} else {
  $("#login-view").hidden = false;
}
