let analyticsContextSnapshot = null;
let analyticsRenderToken = 0;
const ANALYTICS_LOAD_METRIC_KEY = "worknest_analytics_load_ms";
const DASHBOARD_SUMMARY_CACHE_PREFIX = "worknest_dashboard_summary_v1";
const DASHBOARD_SUMMARY_MAX_AGE_MS = 10 * 60 * 1000;
const dashboardSummaryInflight = new Map();

function setAnalyticsContextSnapshot(data) {
  analyticsContextSnapshot = data || null;
}

function getAnalyticsContextSnapshot() {
  return analyticsContextSnapshot;
}

function getAnalyticsEstimatedLoadMs() {
  try {
    const saved = Number(localStorage.getItem(ANALYTICS_LOAD_METRIC_KEY) || 0);
    if (Number.isFinite(saved) && saved > 0) {
      return Math.min(Math.max(saved, 2500), 20000);
    }
  } catch (_err) {}
  return 6500;
}

function saveAnalyticsLoadMs(ms) {
  const value = Math.round(Number(ms) || 0);
  if (!Number.isFinite(value) || value <= 0) return;
  try {
    localStorage.setItem(ANALYTICS_LOAD_METRIC_KEY, String(value));
  } catch (_err) {}
}

function getDashboardSummaryCacheContext(input = {}) {
  const userId = String(
    input.userId ||
    sessionUser?.id ||
    sessionUser?.userId ||
    window.currentUser?.id ||
    ""
  ).trim();
  const workspaceId = String(
    input.workspaceId ||
    currentWorkspaceId ||
    sessionUser?.workspaceId ||
    sessionUser?.workspace_id ||
    "default"
  ).trim() || "default";
  return { userId, workspaceId };
}

function getAnalyticsViewerRole(input = {}) {
  return String(
    input.role ||
    sessionUser?.role ||
    window.currentUser?.role ||
    ""
  ).trim().toLowerCase();
}

function getDashboardSummaryCacheKey(input = {}) {
  const { userId, workspaceId } = getDashboardSummaryCacheContext(input);
  if (!userId || !workspaceId) return "";
  return `${DASHBOARD_SUMMARY_CACHE_PREFIX}:${userId}:${workspaceId}`;
}

function getCachedDashboardSummary(input = {}) {
  const { userId, workspaceId } = getDashboardSummaryCacheContext(input);
  const cacheKey = getDashboardSummaryCacheKey({ userId, workspaceId });
  if (!cacheKey) return null;
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      parsed.userId !== userId ||
      parsed.workspaceId !== workspaceId ||
      !parsed.data ||
      !parsed.cachedAt
    ) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    return parsed;
  } catch (_err) {
    try {
      localStorage.removeItem(cacheKey);
    } catch (_ignore) {}
    return null;
  }
}

function setCachedDashboardSummary({ userId, workspaceId, data, generatedAt = null } = {}) {
  const cacheKey = getDashboardSummaryCacheKey({ userId, workspaceId });
  if (!cacheKey || !data) return null;
  const payload = {
    userId: String(userId || "").trim(),
    workspaceId: String(workspaceId || "").trim() || "default",
    cachedAt: new Date().toISOString(),
    generatedAt: generatedAt || null,
    data
  };
  try {
    localStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch (_err) {
    return null;
  }
  return payload;
}

function clearCachedDashboardSummary(input = {}) {
  const { userId, workspaceId } = getDashboardSummaryCacheContext(input);
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(DASHBOARD_SUMMARY_CACHE_PREFIX)) continue;
      if (!userId) {
        keysToRemove.push(key);
        continue;
      }
      if (workspaceId) {
        if (key === `${DASHBOARD_SUMMARY_CACHE_PREFIX}:${userId}:${workspaceId}`) {
          keysToRemove.push(key);
        }
      } else if (key.startsWith(`${DASHBOARD_SUMMARY_CACHE_PREFIX}:${userId}:`)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (_err) {}
}

function isDashboardSummaryCacheStale(cached) {
  if (!cached?.cachedAt) return true;
  const cachedAt = new Date(cached.cachedAt).getTime();
  if (!Number.isFinite(cachedAt)) return true;
  return Date.now() - cachedAt > DASHBOARD_SUMMARY_MAX_AGE_MS;
}

async function fetchDashboardSummary(input = {}, options = {}) {
  const { userId, workspaceId } = getDashboardSummaryCacheContext(input);
  const role = getAnalyticsViewerRole(input);
  if (!userId || !workspaceId) return null;
  const cacheKey = getDashboardSummaryCacheKey({ userId, workspaceId });
  if (dashboardSummaryInflight.has(cacheKey)) {
    return dashboardSummaryInflight.get(cacheKey);
  }

  const request = (async () => {
    const endpoint = (() => {
      if (role === "teacher") return `/api/analytics/teacher-overview?workspaceId=${encodeURIComponent(workspaceId)}`;
      if (role === "student") return `/api/analytics/student-overview?workspaceId=${encodeURIComponent(workspaceId)}`;
      if (role === "super_admin") return `/api/analytics/school-overview?workspaceId=${encodeURIComponent(workspaceId)}`;
      return `/api/analytics/school-overview?workspaceId=${encodeURIComponent(workspaceId)}`;
    })();
    const payload = await fetchJSON(endpoint);
    const summary = payload?.summary || null;
    if (!summary) {
      throw new Error("Missing analytics summary");
    }
    setAnalyticsContextSnapshot(summary);
    setCachedDashboardSummary({
      userId,
      workspaceId,
      data: summary,
      generatedAt: payload?.generatedAt || null
    });
    return summary;
  })();

  dashboardSummaryInflight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    dashboardSummaryInflight.delete(cacheKey);
  }
}

function formatAnalyticsEta(ms) {
  const totalSeconds = Math.max(1, Math.ceil((Number(ms) || 0) / 1000));
  return totalSeconds <= 2 ? `${totalSeconds} sec` : `about ${totalSeconds} sec`;
}

function buildAnalyticsSkeletonMarkup({
  stageLabel = "Preparing dashboard",
  progress = 12,
  estimateMs = getAnalyticsEstimatedLoadMs()
} = {}) {
  const safeProgress = Math.max(4, Math.min(100, Math.round(progress)));
  return `
    <div class="analytics-skeleton-shell">
      <div class="analytics-skeleton-status">
        <div>
          <div class="analytics-skeleton-status-label">School dashboard is assembling</div>
          <div class="analytics-skeleton-status-stage">${escapeHtml(stageLabel)}</div>
        </div>
        <div class="analytics-skeleton-status-meta">
          <strong>${safeProgress}%</strong>
          <span>ETA ${formatAnalyticsEta(estimateMs)}</span>
        </div>
      </div>

      <div class="analytics-skeleton-progress">
        <span class="analytics-skeleton-progress-fill" style="width:${safeProgress}%"></span>
      </div>

      <div class="analytics-skeleton-hero">
        <div class="analytics-skeleton-hero-main analytics-skeleton-panel">
          <div class="analytics-skeleton-line analytics-skeleton-line--sm analytics-skeleton-block"></div>
          <div class="analytics-skeleton-line analytics-skeleton-line--xl analytics-skeleton-block"></div>
          <div class="analytics-skeleton-line analytics-skeleton-line--lg analytics-skeleton-block"></div>
          <div class="analytics-skeleton-pills">
            <span class="analytics-skeleton-pill analytics-skeleton-block"></span>
            <span class="analytics-skeleton-pill analytics-skeleton-block"></span>
            <span class="analytics-skeleton-pill analytics-skeleton-block"></span>
          </div>
        </div>
        <div class="analytics-skeleton-hero-side analytics-skeleton-panel">
          <div class="analytics-skeleton-line analytics-skeleton-line--md analytics-skeleton-block"></div>
          <div class="analytics-skeleton-control analytics-skeleton-block"></div>
          <div class="analytics-skeleton-control analytics-skeleton-block"></div>
          <div class="analytics-skeleton-control analytics-skeleton-block"></div>
        </div>
      </div>

      <div class="analytics-skeleton-stats">
        <div class="analytics-skeleton-stat analytics-skeleton-panel analytics-skeleton-block"></div>
        <div class="analytics-skeleton-stat analytics-skeleton-panel analytics-skeleton-block"></div>
        <div class="analytics-skeleton-stat analytics-skeleton-panel analytics-skeleton-block"></div>
        <div class="analytics-skeleton-stat analytics-skeleton-panel analytics-skeleton-block"></div>
      </div>

      <div class="analytics-skeleton-row">
        <div class="analytics-skeleton-chart analytics-skeleton-panel">
          <div class="analytics-skeleton-line analytics-skeleton-line--lg analytics-skeleton-block"></div>
          <div class="analytics-skeleton-chart-bars">
            <span class="analytics-skeleton-bar analytics-skeleton-block"></span>
            <span class="analytics-skeleton-bar analytics-skeleton-block"></span>
            <span class="analytics-skeleton-bar analytics-skeleton-block"></span>
            <span class="analytics-skeleton-bar analytics-skeleton-block"></span>
            <span class="analytics-skeleton-bar analytics-skeleton-block"></span>
            <span class="analytics-skeleton-bar analytics-skeleton-block"></span>
            <span class="analytics-skeleton-bar analytics-skeleton-block"></span>
          </div>
        </div>
        <div class="analytics-skeleton-highlights analytics-skeleton-panel">
          <div class="analytics-skeleton-highlight analytics-skeleton-block"></div>
          <div class="analytics-skeleton-highlight analytics-skeleton-block"></div>
          <div class="analytics-skeleton-highlight analytics-skeleton-block"></div>
        </div>
      </div>

      <div class="analytics-skeleton-table analytics-skeleton-panel">
        <div class="analytics-skeleton-line analytics-skeleton-line--lg analytics-skeleton-block"></div>
        <div class="analytics-skeleton-table-row analytics-skeleton-block"></div>
        <div class="analytics-skeleton-table-row analytics-skeleton-block"></div>
        <div class="analytics-skeleton-table-row analytics-skeleton-block"></div>
        <div class="analytics-skeleton-table-row analytics-skeleton-block"></div>
      </div>
    </div>
  `;
}

function buildAnalyticsSnapshotPreview(snapshot, stageLabel = "Refreshing in background") {
  if (!snapshot) return "";
  const topClasses = Array.isArray(snapshot.topClasses)
    ? snapshot.topClasses.slice(0, 3)
    : Array.isArray(snapshot.classRowsSorted)
    ? snapshot.classRowsSorted.slice(0, 3)
    : [];
  const insights = Array.isArray(snapshot.insights) ? snapshot.insights.slice(0, 2) : [];
  return `
    <div class="analytics-refresh-preview">
      <div class="analytics-refresh-preview-head">
        <div>
          <div class="analytics-refresh-preview-label">Showing last snapshot</div>
          <div class="analytics-refresh-preview-name">${escapeHtml(snapshot.workspaceName || "School Analytics")}</div>
        </div>
        <div class="analytics-refresh-preview-stage">${escapeHtml(stageLabel)}</div>
      </div>

      <div class="analytics-refresh-preview-grid">
        <div class="analytics-refresh-stat">
          <span>Students</span>
          <strong>${Number(snapshot.students || 0)}</strong>
        </div>
        <div class="analytics-refresh-stat">
          <span>Teachers</span>
          <strong>${Number(snapshot.teachers || 0)}</strong>
        </div>
        <div class="analytics-refresh-stat">
          <span>Completion</span>
          <strong>${Number(snapshot.completionRate || 0)}%</strong>
        </div>
        <div class="analytics-refresh-stat">
          <span>Groups</span>
          <strong>${Number(snapshot.totalGroups || 0)}</strong>
        </div>
      </div>

      ${
        topClasses.length
          ? `<div class="analytics-refresh-list">
              ${topClasses
                .map(
                  (row) => `
                    <div class="analytics-refresh-item">
                      <span>${escapeHtml(row.name || "Class")}</span>
                      <strong>${Number(row.messages || 0)} msgs</strong>
                    </div>
                  `
                )
                .join("")}
            </div>`
          : ""
      }

      ${
        insights.length
          ? `<div class="analytics-refresh-insights">
              ${insights.map((item) => `<div class="analytics-refresh-insight">${escapeHtml(item)}</div>`).join("")}
            </div>`
          : ""
      }
    </div>
  `;
}

function renderAnalyticsLoadingState(panel, options = {}) {
  if (!panel) return;
  const {
    progress = 12,
    title = "Preparing analytics",
    subtitle = "Refreshing class activity, student participation, and teaching trends.",
    stageLabel = "Starting refresh",
    estimateMs = getAnalyticsEstimatedLoadMs(),
    snapshot = getAnalyticsContextSnapshot()
  } = options;
  panel.innerHTML = `
    <div class="analytics-shell">
      <div class="analytics-loading analytics-loading--rich">
        ${buildAnalyticsSnapshotPreview(snapshot, stageLabel)}
        ${buildAnalyticsSkeletonMarkup({ stageLabel: title || stageLabel, progress, estimateMs })}
      </div>
    </div>
  `;
}

function openAnalyticsPanel() {
  if (typeof showPanel === "function") {
    showPanel("analyticsPanel");
  }
  if (typeof renderAnalyticsPanel === "function") {
    renderAnalyticsPanel();
  }
}

function analyticsInitials(name = "") {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] || "")
    .join("")
    .toUpperCase() || "T";
}

function analyticsDayLabels(days = 7) {
  const out = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(d.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase());
  }
  return out;
}

function insightTone(text = "") {
  const t = String(text).toLowerCase();
  if (t.includes("inactive") || t.includes("risk")) return "danger";
  if (t.includes("low") || t.includes("no ")) return "warning";
  return "success";
}

function renderTeacherAnalyticsSummary(panel, summary) {
  const classRowsSorted = Array.isArray(summary.classRowsSorted) ? summary.classRowsSorted : [];
  const teacherRows = Array.isArray(summary.teacherRows) ? summary.teacherRows : [];
  const courseCounts = summary.courseCounts || {};
  const insights = Array.isArray(summary.insights) ? summary.insights : [];
  const courseCards = Object.entries(courseCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([course, count]) => `
      <div class="course-card">
        <div class="course-name">${escapeHtml(course)}</div>
        <div class="course-value">${count}</div>
        <div class="course-meta">assigned students</div>
      </div>
    `)
    .join("");
  const classTableRows = classRowsSorted
    .map((row) => `
      <div class="class-row">
        <div class="class-name">${escapeHtml(row.name || "Class")}</div>
        <div class="class-students">${Number(row.students || 0)}</div>
        <div class="class-bar"><span style="width:${Math.max(8, Number(row.attendanceRate || 0))}%"></span></div>
        <div class="class-homework">${Number(row.homework || 0)}</div>
        <div class="class-status status-${Number(row.attendanceRate || 0) >= 75 ? "active" : Number(row.attendanceRate || 0) >= 40 ? "low" : "risk"}">${Number(row.attendanceRate || 0)}%</div>
      </div>
    `)
    .join("");
  panel.innerHTML = `
    <div class="analytics-shell">
      <div class="analytics-wrap">
        <section class="analytics-hero">
          <div class="analytics-hero-main">
            <div class="analytics-kicker">Teaching Analytics</div>
            <div>
              <h1 class="analytics-title">Assigned Class Performance</h1>
              <p class="analytics-subtitle">
                Attendance, homework progress, and engagement for students taught by ${escapeHtml(summary.teacher?.name || "your teacher account")}.
              </p>
            </div>
            <div class="analytics-hero-meta">
              <span class="analytics-meta-pill">Students: ${Number(summary.students || 0)}</span>
              <span class="analytics-meta-pill">Classes: ${Number(summary.totalGroups || 0)}</span>
              <span class="analytics-meta-pill">Attendance: ${Number(summary.attendanceRate || 0)}%</span>
              <span class="analytics-meta-pill">Homework: ${Number(summary.completionRate || 0)}%</span>
            </div>
          </div>
        </section>

        <section class="analytics-grid">
          <article class="stat-card"><div class="stat-top"><div class="stat-label">Assigned students</div><div class="stat-icon"><i class="fa-solid fa-user-graduate"></i></div></div><div class="stat-value">${Number(summary.students || 0)}</div><div class="stat-meta">Active ${Number(summary.activeStudents || 0)} · Inactive ${Number(summary.inactiveStudents || 0)}</div><div class="stat-trend">Only your classes</div></article>
          <article class="stat-card"><div class="stat-top"><div class="stat-label">Classes</div><div class="stat-icon"><i class="fa-solid fa-people-group"></i></div></div><div class="stat-value">${Number(summary.totalGroups || 0)}</div><div class="stat-meta">Assigned sections only</div><div class="stat-trend">No school-wide totals</div></article>
          <article class="stat-card"><div class="stat-top"><div class="stat-label">Attendance</div><div class="stat-icon"><i class="fa-solid fa-calendar-check"></i></div></div><div class="stat-value">${Number(summary.attendanceRate || 0)}%</div><div class="stat-meta">Average across assigned students</div><div class="stat-trend">Recent attendance records</div></article>
          <article class="stat-card"><div class="stat-top"><div class="stat-label">Homework</div><div class="stat-icon"><i class="fa-solid fa-book-open-reader"></i></div></div><div class="stat-value">${Number(summary.completionRate || 0)}%</div><div class="stat-meta">Completion across assigned students</div><div class="stat-trend">Based on owned classes</div></article>
        </section>

        <section class="analytics-split">
          <div class="analytics-panel">
            <div class="analytics-panel-header">
              <div>
                <h2 class="analytics-panel-title">Class Performance</h2>
                <div class="analytics-panel-subtitle">Only classes assigned to you</div>
              </div>
            </div>
            <div class="class-table">
              <div class="class-head">
                <span>Class</span>
                <span>Students</span>
                <span>Attendance</span>
                <span>Homework</span>
                <span>Status</span>
              </div>
              <div class="class-body">${classTableRows || `<div class="analytics-empty">No assigned classes yet.</div>`}</div>
            </div>
          </div>
          <div class="analytics-section">
            <div class="analytics-panel">
              <div class="analytics-panel-header">
                <div><h2 class="analytics-panel-title">Teacher Scope</h2><div class="analytics-panel-subtitle">Your own teaching analytics only</div></div>
              </div>
              <div class="teacher-list">
                ${teacherRows.map((t) => `
                  <div class="teacher-card">
                    <div class="teacher-top"><div class="teacher-avatar">${escapeHtml(t.initials || analyticsInitials(t.name || "T"))}</div><div><div class="teacher-name">${escapeHtml(t.name || "Teacher")}</div><div class="teacher-role">Your account</div></div></div>
                    <div class="teacher-meta">Attendance records ${Number(t.messages || 0)} · Homework actions ${Number(t.homeworkCount || 0)}</div>
                    <div class="teacher-last">${escapeHtml(t.last || "Assigned classes only")}</div>
                  </div>`).join("")}
              </div>
            </div>
            <div class="analytics-panel">
              <div class="analytics-panel-header">
                <div><h2 class="analytics-panel-title">Level Mix</h2><div class="analytics-panel-subtitle">Students in your assigned classes</div></div>
              </div>
              <div class="course-grid">${courseCards || `<div class="analytics-empty">No assigned students yet.</div>`}</div>
            </div>
          </div>
        </section>

        <section class="analytics-panel">
          <div class="analytics-panel-header">
            <div><h2 class="analytics-panel-title">Teaching Notes</h2><div class="analytics-panel-subtitle">No unrelated students or school-wide metrics are shown here</div></div>
          </div>
          <div class="analytics-insights">${insights.map((text) => `<div class="insight-item ${insightTone(text)}">${escapeHtml(text)}</div>`).join("")}</div>
        </section>
      </div>
    </div>
  `;
}

function renderStudentAnalyticsSummary(panel, summary) {
  const performance = summary.studentPerformance || {};
  const attendance = performance.attendance || {};
  const homework = performance.homework || {};
  const certificates = performance.certificates || {};
  const payment = summary.payment || {};
  const recentAttendance = Array.isArray(attendance.recent) ? attendance.recent : [];
  const homeworkItems = Array.isArray(homework.items) ? homework.items : [];
  panel.innerHTML = `
    <div class="analytics-shell">
      <div class="analytics-wrap">
        <section class="analytics-hero">
          <div class="analytics-hero-main">
            <div class="analytics-kicker">My Progress</div>
            <div>
              <h1 class="analytics-title">Student Analytics</h1>
              <p class="analytics-subtitle">
                Attendance, assignments, progress, and billing for ${escapeHtml(summary.student?.name || "your account")}.
              </p>
            </div>
            <div class="analytics-hero-meta">
              <span class="analytics-meta-pill">Attendance: ${Number(attendance.attendanceRate || 0)}%</span>
              <span class="analytics-meta-pill">Homework: ${Number(homework.completionRate || 0)}%</span>
              <span class="analytics-meta-pill">Level: ${escapeHtml(performance.progress?.cefrLevel || summary.student?.courseLevel || "—")}</span>
              <span class="analytics-meta-pill">Billing: ${escapeHtml(payment.status || "clear")}</span>
            </div>
          </div>
        </section>

        <section class="analytics-grid">
          <article class="stat-card"><div class="stat-top"><div class="stat-label">Attendance</div><div class="stat-icon"><i class="fa-solid fa-calendar-check"></i></div></div><div class="stat-value">${Number(attendance.attendanceRate || 0)}%</div><div class="stat-meta">Present ${Number(attendance.present || 0)} · Absent ${Number(attendance.absent || 0)}</div><div class="stat-trend">Only your attendance</div></article>
          <article class="stat-card"><div class="stat-top"><div class="stat-label">Homework</div><div class="stat-icon"><i class="fa-solid fa-book"></i></div></div><div class="stat-value">${Number(homework.completionRate || 0)}%</div><div class="stat-meta">Completed ${Number(homework.completedItems || 0)} · Pending ${Number(homework.pendingItems || 0)}</div><div class="stat-trend">Only your assignments</div></article>
          <article class="stat-card"><div class="stat-top"><div class="stat-label">Progress</div><div class="stat-icon"><i class="fa-solid fa-chart-line"></i></div></div><div class="stat-value">${Number(performance.progress?.completionPct || 0)}%</div><div class="stat-meta">CEFR ${escapeHtml(performance.progress?.cefrLevel || "—")}</div><div class="stat-trend">Updated ${escapeHtml(performance.progress?.updatedAt || "—")}</div></article>
          <article class="stat-card"><div class="stat-top"><div class="stat-label">Payments</div><div class="stat-icon"><i class="fa-solid fa-file-invoice-dollar"></i></div></div><div class="stat-value">${Number(payment.pendingCount || 0)}</div><div class="stat-meta">Pending invoices</div><div class="stat-trend">${escapeHtml(payment.status || "clear")}</div></article>
        </section>

        <section class="analytics-split">
          <div class="analytics-panel">
            <div class="analytics-panel-header">
              <div><h2 class="analytics-panel-title">Recent Attendance</h2><div class="analytics-panel-subtitle">Only your class records</div></div>
            </div>
            <div class="class-table">
              <div class="class-head"><span>Class</span><span>Date</span><span>Status</span><span></span><span></span></div>
              <div class="class-body">
                ${recentAttendance.length ? recentAttendance.map((row) => `
                  <div class="class-row">
                    <div class="class-name">${escapeHtml(row.className || "Class")}</div>
                    <div class="class-students">${escapeHtml(row.sessionDate || "—")}</div>
                    <div class="class-bar"><span style="width:${String(row.status || "").toLowerCase() === "present" ? 100 : 35}%"></span></div>
                    <div class="class-homework">${escapeHtml(String(row.status || "").toLowerCase())}</div>
                    <div class="class-status status-${String(row.status || "").toLowerCase() === "present" ? "active" : "risk"}">${escapeHtml(String(row.status || "").toLowerCase())}</div>
                  </div>
                `).join("") : `<div class="analytics-empty">No attendance records yet.</div>`}
              </div>
            </div>
          </div>
          <div class="analytics-section">
            <div class="analytics-panel">
              <div class="analytics-panel-header">
                <div><h2 class="analytics-panel-title">Assignment Progress</h2><div class="analytics-panel-subtitle">Only work assigned to you</div></div>
              </div>
              <div class="teacher-list">
                ${homeworkItems.length ? homeworkItems.map((item) => `
                  <div class="teacher-card">
                    <div class="teacher-top"><div class="teacher-avatar"><i class="fa-solid fa-book-open"></i></div><div><div class="teacher-name">${escapeHtml(item.title || "Homework")}</div><div class="teacher-role">${escapeHtml(item.className || "Class")}</div></div></div>
                    <div class="teacher-meta">Due ${escapeHtml(item.dueDate || "—")}</div>
                    <div class="teacher-last">${Number(item.completed || 0) === 1 ? "Completed" : "Pending"}</div>
                  </div>`).join("") : `<div class="analytics-empty">No homework items yet.</div>`}
              </div>
            </div>
            <div class="analytics-panel">
              <div class="analytics-panel-header">
                <div><h2 class="analytics-panel-title">Billing & Certificates</h2><div class="analytics-panel-subtitle">Only your own financial and achievement records</div></div>
              </div>
              <div class="analytics-insights">
                <div class="insight-item ${Number(payment.pendingCount || 0) > 0 ? "warning" : "success"}">Payment status: ${escapeHtml(payment.status || "clear")}</div>
                <div class="insight-item ${Number(payment.pendingCount || 0) > 0 ? "warning" : "success"}">Pending invoices: ${Number(payment.pendingCount || 0)}</div>
                <div class="insight-item success">Certificates issued: ${Number(certificates.totalCertificates || 0)}</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;
}

function renderSchoolAnalyticsSummary(panel, summary) {
  if (!panel || !summary) return;
  setAnalyticsContextSnapshot(summary);

  const students = Number(summary.students || 0);
  const activeStudents = Number(summary.activeStudents || 0);
  const inactiveStudents = Number(summary.inactiveStudents || 0);
  const teachers = Number(summary.teachers || 0);
  const admins = Number(summary.admins || 0);
  const channelCounts = summary.channelCounts || { classes: 0, clubs: 0, exams: 0, tools: 0, homework: 0 };
  const categoryCounts = summary.categoryCounts || { messages: 0, homework: 0, exams: 0 };
  const totalGroups = Number(summary.totalGroups || 0);
  const classRowsSorted = Array.isArray(summary.classRowsSorted) ? summary.classRowsSorted : [];
  const teacherRows = Array.isArray(summary.teacherRows) ? summary.teacherRows : [];
  const anyTeacherActive = !!summary.anyTeacherActive;
  const mostUsedTool = summary.mostUsedTool || "—";
  const homeworkCreated = Number(summary.homeworkCreated || 0);
  const avgSubmissions = Number(summary.avgSubmissions || 0);
  const completionRate = Number(summary.completionRate || 0);
  const engagementCounts = summary.engagementCounts || { high: 0, medium: 0, low: 0 };
  const insights = Array.isArray(summary.insights) ? summary.insights : [];
  const courseCounts = summary.courseCounts || {};
  const workspaceId = summary.workspaceId || currentWorkspaceId || "default";
  const workspaceName = summary.workspaceName || getWorkspaceLabel(workspaceId);

  const totalEngagement =
    engagementCounts.high + engagementCounts.medium + engagementCounts.low || 1;
  const highStop = Math.round((engagementCounts.high / totalEngagement) * 100);
  const medStop = Math.round((engagementCounts.medium / totalEngagement) * 100);
  const donutStyle = `conic-gradient(#22c55e 0 ${highStop}%, #f59e0b ${highStop}% ${highStop + medStop}%, #ef4444 ${highStop + medStop}% 100%)`;

  const dayLabels = analyticsDayLabels(7);
  const activityBars = dayLabels.map((label, idx) => {
    const spread = Math.max(1, 1 - idx * 0.04);
    const base = Math.max(1, Number(categoryCounts.messages || 0));
    const msgHeight = Math.max(10, Math.round((Number(categoryCounts.messages || 0) / base) * 92 * spread));
    const hwHeight = Math.max(8, Math.round((Number(categoryCounts.homework || 0) / base) * 78 * spread));
    const exHeight = Math.max(8, Math.round((Number(categoryCounts.exams || 0) / base) * 64 * spread));
    return `
      <div class="activity-day">
        <div class="activity-stack">
          <span class="bar bar-blue" style="height:${msgHeight}px"></span>
          <span class="bar bar-green" style="height:${hwHeight}px"></span>
          <span class="bar bar-orange" style="height:${exHeight}px"></span>
        </div>
        <div class="activity-label">${label}</div>
      </div>
    `;
  }).join("");

  const maxMessages = Math.max(1, ...classRowsSorted.map((row) => Number(row.messages || 0)));
  const classTableRows = classRowsSorted
    .map((row) => {
      const ratio = Math.round((Number(row.messages || 0) / maxMessages) * 100);
      const status = Number(row.messages || 0) >= 8 ? "active" : Number(row.messages || 0) >= 3 ? "low" : "risk";
      return `
        <div class="class-row">
          <div class="class-name">${escapeHtml(row.name)}</div>
          <div class="class-students">${Number(row.students || 0)}</div>
          <div class="class-bar"><span style="width:${ratio}%"></span></div>
          <div class="class-homework">${Number(row.homework || 0)}</div>
          <div class="class-status status-${status}">${status}</div>
        </div>
      `;
    })
    .join("");

  const courseCards = Object.entries(courseCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([course, count]) => `
      <div class="course-card">
        <div class="course-name">${escapeHtml(course)}</div>
        <div class="course-value">${count}</div>
        <div class="course-meta">enrolled students</div>
      </div>
    `)
    .join("");

  panel.innerHTML = `
    <div class="analytics-shell">
      <div class="analytics-wrap">

        <section class="analytics-hero">
          <div class="analytics-hero-main">
            <div class="analytics-kicker">Language School Insights</div>
            <div>
              <h1 class="analytics-title">School Analytics</h1>
              <p class="analytics-subtitle">
                Monitor class health, homework usage, teacher activity, and student engagement
                for ${escapeHtml(workspaceName)}.
              </p>
            </div>
            <div class="analytics-hero-meta">
              <span class="analytics-meta-pill">Workspace: ${escapeHtml(workspaceName)}</span>
              <span class="analytics-meta-pill">Students: ${students}</span>
              <span class="analytics-meta-pill">Teachers: ${teachers}</span>
              <span class="analytics-meta-pill">Admins: ${admins}</span>
            </div>
          </div>

          <aside class="analytics-hero-side">
            <div class="analytics-filter-title">Filter analytics view</div>
            <div class="analytics-filters">
              <select>
                <option>Last 7 days</option>
                <option>Last 30 days</option>
                <option>Term</option>
              </select>
              <select>
                <option>All classes</option>
              </select>
              <select>
                <option>All teachers</option>
              </select>
              <select>
                <option>All tools</option>
                <option>Homework</option>
                <option>Exams</option>
              </select>
            </div>
          </aside>
        </section>

        <section class="analytics-grid">
          <article class="stat-card">
            <div class="stat-top">
              <div class="stat-label">Students</div>
              <div class="stat-icon"><i class="fa-solid fa-user-graduate"></i></div>
            </div>
            <div class="stat-value">${students}</div>
            <div class="stat-meta">Active ${activeStudents} · Inactive ${inactiveStudents}</div>
            <div class="stat-trend">Enrollment overview</div>
          </article>

          <article class="stat-card">
            <div class="stat-top">
              <div class="stat-label">Teachers</div>
              <div class="stat-icon"><i class="fa-solid fa-chalkboard-user"></i></div>
            </div>
            <div class="stat-value">${teachers}</div>
            <div class="stat-meta">Admins ${admins}</div>
            <div class="stat-trend">Last active: ${anyTeacherActive ? "Recent" : "—"}</div>
          </article>

          <article class="stat-card">
            <div class="stat-top">
              <div class="stat-label">Groups</div>
              <div class="stat-icon"><i class="fa-solid fa-people-group"></i></div>
            </div>
            <div class="stat-value">${totalGroups}</div>
            <div class="stat-meta">Classes ${channelCounts.classes} · Clubs ${channelCounts.clubs} · Exams ${channelCounts.exams}</div>
            <div class="stat-trend">Top class: ${classRowsSorted[0]?.name ? escapeHtml(classRowsSorted[0].name) : "—"}</div>
          </article>

          <article class="stat-card">
            <div class="stat-top">
              <div class="stat-label">School Tools</div>
              <div class="stat-icon"><i class="fa-solid fa-toolbox"></i></div>
            </div>
            <div class="stat-value">${channelCounts.tools}</div>
            <div class="stat-meta">Homework spaces ${channelCounts.homework}</div>
            <div class="stat-trend">Most used: ${escapeHtml(mostUsedTool)}</div>
          </article>
        </section>

        <section class="analytics-row">
          <div class="analytics-panel">
            <div class="analytics-panel-header">
              <div>
                <h2 class="analytics-panel-title">School Activity</h2>
                <div class="analytics-panel-subtitle">Messages, homework, and exams across the last 7 days</div>
              </div>
              <div class="analytics-badge">
                <i class="fa-solid fa-wave-square"></i>
                Weekly pulse
              </div>
            </div>

            <div class="activity-chart">
              <div class="activity-legend">
                <span><i class="dot dot-blue"></i>Messages</span>
                <span><i class="dot dot-green"></i>Homework</span>
                <span><i class="dot dot-orange"></i>Exams</span>
              </div>
              <div class="activity-bars">${activityBars}</div>
              <div class="activity-note">Based on prepared workspace analytics summary.</div>
            </div>
          </div>

          <div class="analytics-panel">
            <div class="analytics-panel-header">
              <div>
                <h2 class="analytics-panel-title">Teaching Highlights</h2>
                <div class="analytics-panel-subtitle">Quick operational overview for admins and teachers</div>
              </div>
            </div>

            <div class="analytics-highlights">
              <div class="highlight-card">
                <div class="highlight-top">
                  <div class="highlight-title">Homework completion</div>
                  <i class="fa-solid fa-book-open-reader"></i>
                </div>
                <div class="highlight-value">${completionRate}%</div>
                <div class="highlight-meta">Average submissions per homework: ${avgSubmissions}</div>
              </div>

              <div class="highlight-card">
                <div class="highlight-top">
                  <div class="highlight-title">Most active class</div>
                  <i class="fa-solid fa-bolt"></i>
                </div>
                <div class="highlight-value">${escapeHtml(classRowsSorted[0]?.name || "—")}</div>
                <div class="highlight-meta">Based on total message activity this period</div>
              </div>

              <div class="highlight-card">
                <div class="highlight-top">
                  <div class="highlight-title">Most used tool</div>
                  <i class="fa-solid fa-screwdriver-wrench"></i>
                </div>
                <div class="highlight-value">${escapeHtml(mostUsedTool)}</div>
                <div class="highlight-meta">Highest interaction among tool channels</div>
              </div>
            </div>
          </div>
        </section>

        <section class="analytics-split">
          <div class="analytics-panel">
            <div class="analytics-panel-header">
              <div>
                <h2 class="analytics-panel-title">Class Engagement Overview</h2>
                <div class="analytics-panel-subtitle">Student presence, message activity, and homework by class</div>
              </div>
            </div>

            <div class="class-table">
              <div class="class-head">
                <span>Class</span>
                <span>Students</span>
                <span>Messages</span>
                <span>Homework</span>
                <span>Status</span>
              </div>
              <div class="class-body">
                ${classTableRows || `<div class="analytics-empty">No classes yet.</div>`}
              </div>
            </div>
          </div>

          <div class="analytics-section">
            <div class="analytics-panel">
              <div class="analytics-panel-header">
                <div>
                  <h2 class="analytics-panel-title">Teacher Activity</h2>
                  <div class="analytics-panel-subtitle">Message and homework contribution by teacher</div>
                </div>
              </div>

              <div class="teacher-list">
                ${
                  teacherRows.length
                    ? teacherRows.map((t) => `
                      <div class="teacher-card">
                        <div class="teacher-top">
                          <div class="teacher-avatar">${escapeHtml(t.initials || analyticsInitials(t.name || "Teacher"))}</div>
                          <div>
                            <div class="teacher-name">${escapeHtml(t.name)}</div>
                            <div class="teacher-role">Teacher</div>
                          </div>
                        </div>
                        <div class="teacher-meta">Messages ${Number(t.messages || 0)} · Homework ${Number(t.homeworkCount || 0)}</div>
                        <div class="teacher-last">Last active: ${escapeHtml(t.last || "—")}</div>
                      </div>
                    `).join("")
                    : `<div class="analytics-empty">No teachers yet.</div>`
                }
              </div>
            </div>

            <div class="analytics-panel">
              <div class="analytics-panel-header">
                <div>
                  <h2 class="analytics-panel-title">Student Engagement Levels</h2>
                  <div class="analytics-panel-subtitle">Participation grouped by message activity</div>
                </div>
              </div>

              <div class="mini-kpis">
                <div class="mini-kpi">
                  <div class="mini-kpi-label">Homework created</div>
                  <div class="mini-kpi-value">${homeworkCreated}</div>
                </div>
                <div class="mini-kpi">
                  <div class="mini-kpi-label">Avg submissions</div>
                  <div class="mini-kpi-value">${avgSubmissions}</div>
                </div>
              </div>

              <div class="engagement-card">
                <div class="donut-wrap">
                  <div class="donut" style="background:${donutStyle};"></div>
                  <div class="donut-center">
                    <strong>${students}</strong>
                    <span>students</span>
                  </div>
                </div>

                <div class="engagement-legend">
                  <div class="engagement-legend-row">
                    <span class="legend-left"><i class="dot dot-green"></i>High engagement</span>
                    <strong>${Number(engagementCounts.high || 0)}</strong>
                  </div>
                  <div class="engagement-legend-row">
                    <span class="legend-left"><i class="dot dot-orange"></i>Medium engagement</span>
                    <strong>${Number(engagementCounts.medium || 0)}</strong>
                  </div>
                  <div class="engagement-legend-row">
                    <span class="legend-left"><i class="dot dot-red"></i>Inactive</span>
                    <strong>${Number(engagementCounts.low || 0)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="analytics-panel">
          <div class="analytics-panel-header">
            <div>
              <h2 class="analytics-panel-title">Admin Insights</h2>
              <div class="analytics-panel-subtitle">Suggested follow-up areas for school management</div>
            </div>
          </div>

          <div class="analytics-insights">
            ${insights.map((text) => `
              <div class="insight-item ${insightTone(text)}">${escapeHtml(text)}</div>
            `).join("")}
          </div>
        </section>

        <section class="analytics-panel">
          <div class="analytics-panel-header">
            <div>
              <h2 class="analytics-panel-title">Course Enrollment</h2>
              <div class="analytics-panel-subtitle">Student distribution by level or course group</div>
            </div>
          </div>

          <div class="course-grid">
            ${courseCards || `<div class="analytics-empty">No courses available yet.</div>`}
          </div>
        </section>
      </div>
    </div>
  `;
}

function renderAnalyticsSummary(panel, summary) {
  if (!panel || !summary) return;
  setAnalyticsContextSnapshot(summary);
  if (summary.scope === "teacher") {
    return renderTeacherAnalyticsSummary(panel, summary);
  }
  if (summary.scope === "student") {
    return renderStudentAnalyticsSummary(panel, summary);
  }
  return renderSchoolAnalyticsSummary(panel, summary);
}

async function renderAnalyticsPanel() {
  const panel = document.getElementById("analyticsPanel");
  if (!panel) return;

  const renderToken = ++analyticsRenderToken;
  const startedAt = Date.now();
  const cacheContext = getDashboardSummaryCacheContext();
  const cached = getCachedDashboardSummary(cacheContext);

  if (cached?.data) {
    renderAnalyticsSummary(panel, cached.data);
  } else {
    renderAnalyticsLoadingState(panel, {
      progress: 10,
      title: "Preparing analytics",
      subtitle: "Loading the prepared dashboard summary from your workspace.",
      stageLabel: "Reading dashboard summary"
    });
  }

  const shouldRefresh = !cached || isDashboardSummaryCacheStale(cached);
  if (!shouldRefresh && cached?.data) {
    return;
  }

  try {
    const freshSummary = await fetchDashboardSummary(cacheContext, { force: !cached });
    if (renderToken !== analyticsRenderToken) return;
    if (freshSummary) {
      saveAnalyticsLoadMs(Date.now() - startedAt);
      renderAnalyticsSummary(panel, freshSummary);
    }
  } catch (err) {
    console.error("Failed to load analytics", err);
    if (renderToken !== analyticsRenderToken) return;
    if (cached?.data) return;
    panel.innerHTML = `
      <div class="analytics-shell">
        <div class="analytics-loading analytics-loading--rich">
          ${buildAnalyticsSnapshotPreview(getAnalyticsContextSnapshot(), "Refresh paused")}
          ${buildAnalyticsSkeletonMarkup({
            stageLabel: "Dashboard summary unavailable",
            progress: 100,
            estimateMs: 1000
          })}
        </div>
      </div>
    `;
  }
}

async function prefetchDashboardSummary(options = {}) {
  const cacheContext = getDashboardSummaryCacheContext(options);
  if (!cacheContext.userId || !cacheContext.workspaceId) return null;
  const cached = getCachedDashboardSummary(cacheContext);
  if (cached?.data && !options.force && !isDashboardSummaryCacheStale(cached)) {
    setAnalyticsContextSnapshot(cached.data);
    return cached.data;
  }
  try {
    return await fetchDashboardSummary(cacheContext, { force: !!options.force });
  } catch (err) {
    if (cached?.data) {
      setAnalyticsContextSnapshot(cached.data);
      return cached.data;
    }
    throw err;
  }
}

if (typeof window !== "undefined") {
  window.getCachedDashboardSummary = getCachedDashboardSummary;
  window.setCachedDashboardSummary = setCachedDashboardSummary;
  window.clearCachedDashboardSummary = clearCachedDashboardSummary;
  window.prefetchDashboardSummary = prefetchDashboardSummary;

  window.addEventListener("worknestAuthReady", (event) => {
    const detail = event?.detail || {};
    void prefetchDashboardSummary({
      userId: detail.user?.id || detail.user?.userId || "",
      workspaceId: detail.workspaceId || detail.user?.workspaceId || detail.user?.workspace_id || "",
      force: true
    }).catch(() => null);
  });

  window.addEventListener("worknestWorkspaceReady", (event) => {
    const workspaceId = String(event?.detail?.workspaceId || "").trim();
    if (!workspaceId) return;
    void prefetchDashboardSummary({ workspaceId }).catch(() => null);
    const panel = document.getElementById("analyticsPanel");
    if (panel && !panel.classList.contains("hidden")) {
      void renderAnalyticsPanel();
    }
  });

  if (sessionUser?.id || sessionUser?.userId) {
    void prefetchDashboardSummary().catch(() => null);
  }
}
