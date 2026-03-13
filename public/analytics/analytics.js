let analyticsContextSnapshot = null;

function setAnalyticsContextSnapshot(data) {
  analyticsContextSnapshot = data || null;
}

function getAnalyticsContextSnapshot() {
  return analyticsContextSnapshot;
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

async function renderAnalyticsPanel() {
  const panel = document.getElementById("analyticsPanel");
  if (!panel) return;

  panel.innerHTML = `
    <div class="analytics-shell">
      <div class="analytics-loading">
        <div class="analytics-loading-card">
          <div class="analytics-loading-title">Loading school analytics…</div>
          <div class="analytics-loading-subtitle">Preparing class engagement, homework completion, and teacher activity.</div>
        </div>
      </div>
    </div>
  `;

  try {
    const workspaceId = (sessionUser && sessionUser.workspaceId) || currentWorkspaceId || "default";
    const users = await fetchJSON(`/api/users?workspaceId=${encodeURIComponent(workspaceId)}`);
    const list = Array.isArray(users) ? users : [];
    userDirectoryCache = list;
    userDirectoryLoaded = true;

    const students = list.filter((u) => String(u.role || "").toLowerCase() === "student");
    const teachers = list.filter((u) => String(u.role || "").toLowerCase() === "teacher");
    const admins = list.filter((u) => {
      const role = normalizeRole(u.role || u.userRole);
      return role === "school_admin" || role === "super_admin";
    });

    const activeStudents = students.filter(
      (u) => String(u.status || "").toLowerCase() === "active"
    );
    const inactiveStudents = students.filter(
      (u) => String(u.status || "").toLowerCase() !== "active"
    );

    const courseCounts = students.reduce((acc, u) => {
      const key = (u.courseLevel || u.course_level || "").trim().toUpperCase() || "Unspecified";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const workspaceChannels = (channels || []).filter(
      (c) => (c.workspaceId || "default") === workspaceId
    );

    const channelCounts = { classes: 0, clubs: 0, exams: 0, tools: 0, homework: 0 };
    workspaceChannels.forEach((c) => {
      const cat = normalizeChannelCategory(c.category);
      if (channelCounts[cat] !== undefined) channelCounts[cat] += 1;
    });

    const totalGroups =
      channelCounts.classes + channelCounts.clubs + channelCounts.exams + channelCounts.tools;

    await Promise.all(
      workspaceChannels.map((c) => ensureMessagesForChannelId(c.id).catch(() => null))
    );

    const userById = new Map(
      list.map((u) => [String(u.id || u.userId || ""), u]).filter(([id]) => id)
    );

    const messageCounts = new Map();
    const authorCounts = new Map();
    const authorLast = new Map();
    const categoryCounts = { messages: 0, homework: 0, exams: 0 };
    const homeworkSubmissionsByChannel = new Map();
    const homeworkPostsByTeacher = new Map();

    workspaceChannels.forEach((ch) => {
      const msgs = messagesByChannel[ch.id] || [];
      messageCounts.set(ch.id, msgs.length);
      const category = normalizeChannelCategory(ch.category);
      const isHomework = category === "homework";
      const isExam = category === "exams";

      msgs.forEach((msg) => {
        const authorKey = String(msg.author || "").trim();
        if (authorKey) {
          authorCounts.set(authorKey, (authorCounts.get(authorKey) || 0) + 1);
          authorLast.set(authorKey, msg.time || "");
        }

        categoryCounts.messages += 1;
        if (isExam) categoryCounts.exams += 1;
        if (isHomework) {
          categoryCounts.homework += 1;

          const authorRole = resolveUserRole(msg.author, msg.initials) || "";
          const roleKey = normalizeRole(authorRole);

          if (roleKey === "student") {
            homeworkSubmissionsByChannel.set(
              ch.id,
              (homeworkSubmissionsByChannel.get(ch.id) || 0) + 1
            );
          }

          if (
            roleKey === "teacher" ||
            roleKey === "school_admin" ||
            roleKey === "super_admin"
          ) {
            homeworkPostsByTeacher.set(
              authorKey,
              (homeworkPostsByTeacher.get(authorKey) || 0) + 1
            );
          }
        }
      });
    });

    const classRows = workspaceChannels
      .filter((c) => normalizeChannelCategory(c.category) === "classes")
      .map((ch) => {
        const messages = messageCounts.get(ch.id) || 0;
        const hw = getHomeworkChannelForClassId(ch.id);
        const homework = hw ? messageCounts.get(hw.id) || 0 : 0;
        return {
          id: ch.id,
          name: ch.name,
          messages,
          homework,
          students: 0
        };
      });

    await Promise.all(
      classRows.map(async (row) => {
        const members = await fetchChannelMembers(row.id);
        let count = 0;
        members.forEach((uid) => {
          const user = userById.get(String(uid));
          if (user && String(user.role || "").toLowerCase() === "student") count += 1;
        });
        row.students = count;
      })
    );

    const classRowsSorted = classRows.slice().sort((a, b) => b.messages - a.messages);
    const maxMessages = Math.max(1, ...classRowsSorted.map((r) => r.messages || 0));

    const teacherRows = teachers.map((t) => {
      const key = t.name || t.email || t.username || "";
      const messages = authorCounts.get(key) || 0;
      const homeworkCount = homeworkPostsByTeacher.get(key) || 0;
      const last = authorLast.get(key) || "—";
      return {
        name: t.name || t.email || "Teacher",
        messages,
        homeworkCount,
        last,
        initials: analyticsInitials(t.name || t.email || "Teacher")
      };
    });

    const anyTeacherActive = teacherRows.some((t) => t.messages > 0);

    const toolChannels = workspaceChannels.filter(
      (c) => normalizeChannelCategory(c.category) === "tools"
    );

    let mostUsedTool = "—";
    if (toolChannels.length) {
      const topTool = toolChannels
        .slice()
        .sort((a, b) => (messageCounts.get(b.id) || 0) - (messageCounts.get(a.id) || 0))[0];
      if (topTool?.name) mostUsedTool = topTool.name;
    }

    const homeworkChannels = workspaceChannels.filter(
      (c) => normalizeChannelCategory(c.category) === "homework"
    );

    const homeworkCreated = homeworkChannels.length;
    const totalHomeworkSubmissions = Array.from(homeworkSubmissionsByChannel.values()).reduce(
      (sum, val) => sum + val,
      0
    );
    const avgSubmissions =
      homeworkCreated > 0 ? Math.round(totalHomeworkSubmissions / homeworkCreated) : 0;
    const completionRate =
      homeworkCreated > 0
        ? Math.min(100, Math.round((avgSubmissions / Math.max(1, students.length)) * 100))
        : 0;

    const engagementCounts = students.reduce(
      (acc, s) => {
        const key = s.name || s.email || "";
        const count = authorCounts.get(key) || 0;
        if (count >= 5) acc.high += 1;
        else if (count >= 1) acc.medium += 1;
        else acc.low += 1;
        return acc;
      },
      { high: 0, medium: 0, low: 0 }
    );

    const totalEngagement =
      engagementCounts.high + engagementCounts.medium + engagementCounts.low || 1;
    const highStop = Math.round((engagementCounts.high / totalEngagement) * 100);
    const medStop = Math.round((engagementCounts.medium / totalEngagement) * 100);
    const donutStyle = `conic-gradient(#22c55e 0 ${highStop}%, #f59e0b ${highStop}% ${highStop + medStop}%, #ef4444 ${highStop + medStop}% 100%)`;

    const dayLabels = analyticsDayLabels(7);
    const activityBars = dayLabels.map((label, idx) => {
      const spread = Math.max(1, 1 - idx * 0.04);
      const base = Math.max(1, categoryCounts.messages);
      const msgHeight = Math.max(10, Math.round((categoryCounts.messages / base) * 92 * spread));
      const hwHeight = Math.max(8, Math.round((categoryCounts.homework / base) * 78 * spread));
      const exHeight = Math.max(8, Math.round((categoryCounts.exams / base) * 64 * spread));
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

    const classTableRows = classRowsSorted
      .map((row) => {
        const ratio = Math.round((row.messages / maxMessages) * 100);
        const status = row.messages >= 8 ? "active" : row.messages >= 3 ? "low" : "risk";
        return `
          <div class="class-row">
            <div class="class-name">${escapeHtml(row.name)}</div>
            <div class="class-students">${row.students}</div>
            <div class="class-bar"><span style="width:${ratio}%"></span></div>
            <div class="class-homework">${row.homework}</div>
            <div class="class-status status-${status}">${status}</div>
          </div>
        `;
      })
      .join("");

    const insights = [];
    if (inactiveStudents.length) {
      insights.push(`⚠️ ${inactiveStudents.length} students are currently inactive and may need follow-up.`);
    }
    if (classRows.some((r) => r.messages < 2)) {
      insights.push("📉 Some classes show low message activity and may need teacher intervention.");
    }
    if (homeworkCreated === 0) {
      insights.push("📌 No homework channels created yet for this workspace.");
    }
    if (!insights.length) {
      insights.push("✅ Student and class activity looks healthy this week.");
    }

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

    setAnalyticsContextSnapshot({
      workspaceId,
      workspaceName: getWorkspaceLabel(workspaceId),
      students: students.length,
      activeStudents: activeStudents.length,
      inactiveStudents: inactiveStudents.length,
      teachers: teachers.length,
      admins: admins.length,
      channelCounts,
      totalGroups,
      topClasses: classRowsSorted.slice(0, 3).map((row) => ({
        name: row.name,
        messages: row.messages,
        homework: row.homework,
        students: row.students
      })),
      mostUsedTool,
      homeworkCreated,
      avgSubmissions,
      completionRate,
      engagementCounts,
      insights
    });

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
                  for ${escapeHtml(getWorkspaceLabel(workspaceId))}.
                </p>
              </div>
              <div class="analytics-hero-meta">
                <span class="analytics-meta-pill">Workspace: ${escapeHtml(getWorkspaceLabel(workspaceId))}</span>
                <span class="analytics-meta-pill">Students: ${students.length}</span>
                <span class="analytics-meta-pill">Teachers: ${teachers.length}</span>
                <span class="analytics-meta-pill">Admins: ${admins.length}</span>
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
              <div class="stat-value">${students.length}</div>
              <div class="stat-meta">Active ${activeStudents.length} · Inactive ${inactiveStudents.length}</div>
              <div class="stat-trend">Enrollment overview</div>
            </article>

            <article class="stat-card">
              <div class="stat-top">
                <div class="stat-label">Teachers</div>
                <div class="stat-icon"><i class="fa-solid fa-chalkboard-user"></i></div>
              </div>
              <div class="stat-value">${teachers.length}</div>
              <div class="stat-meta">Admins ${admins.length}</div>
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
                <div class="activity-note">Based on loaded workspace messages and channel activity.</div>
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
                            <div class="teacher-avatar">${escapeHtml(t.initials)}</div>
                            <div>
                              <div class="teacher-name">${escapeHtml(t.name)}</div>
                              <div class="teacher-role">Teacher</div>
                            </div>
                          </div>
                          <div class="teacher-meta">Messages ${t.messages} · Homework ${t.homeworkCount}</div>
                          <div class="teacher-last">Last active: ${escapeHtml(t.last)}</div>
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
                      <strong>${students.length}</strong>
                      <span>students</span>
                    </div>
                  </div>

                  <div class="engagement-legend">
                    <div class="engagement-legend-row">
                      <span class="legend-left"><i class="dot dot-green"></i>High engagement</span>
                      <strong>${engagementCounts.high}</strong>
                    </div>
                    <div class="engagement-legend-row">
                      <span class="legend-left"><i class="dot dot-orange"></i>Medium engagement</span>
                      <strong>${engagementCounts.medium}</strong>
                    </div>
                    <div class="engagement-legend-row">
                      <span class="legend-left"><i class="dot dot-red"></i>Inactive</span>
                      <strong>${engagementCounts.low}</strong>
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
  } catch (err) {
    console.error("Failed to load analytics", err);
    panel.innerHTML = `
      <div class="analytics-shell">
        <div class="analytics-loading">
          <div class="analytics-loading-card">
            <div class="analytics-loading-title">Could not load analytics.</div>
            <div class="analytics-loading-subtitle">Please try again after the workspace data is available.</div>
          </div>
        </div>
      </div>
    `;
  }
}