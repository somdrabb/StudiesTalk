let calInitDone = false;
let calViewMode = "week";
let calView = { year: 0, month: 0 };
let calSelected = "";
let calAssigneeOnly = "";
let calTypeFilter = "all";
let calSearchQuery = "";
let calEventsCache = [];
let calEditingId = null;
let calModalSaving = false;
let calColorTouched = false;
let calDeleteConfirmResolver = null;
const CALENDAR_SIDEBAR_LOOKAHEAD_DAYS = 60;

function qs(id) {
  return document.getElementById(id);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function ymd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

function startOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - d.getDay());
  return ymd(d);
}

function endOfWeek(dateStr) {
  return addDays(startOfWeek(dateStr), 6);
}

function toMinutes(hhmm = "") {
  const [h, m] = String(hhmm).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function addHour(hhmm = "") {
  return addHours(hhmm, 1);
}

function addHours(hhmm = "", hoursToAdd = 1) {
  if (!hhmm) return "";
  const [hours, minutes] = String(hhmm).split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return "";
  const date = new Date();
  date.setHours(hours);
  date.setMinutes(minutes);
  date.setSeconds(0);
  date.setMilliseconds(0);
  date.setHours(date.getHours() + Number(hoursToAdd || 0));
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeDateToYMD(s) {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = String(s).match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
}

function getCalModalFields() {
  return {
    modal: qs("calEventModal"),
    title: qs("calTitleInput"),
    date: qs("calDateInput"),
    time: qs("calTimeInput"),
    endTime: qs("calEndInput"),
    allDay: qs("calAllDayInput"),
    meet: qs("calMeetInput"),
    notes: qs("calNotesInput"),
    color: qs("calColorInput"),
    remind: qs("calRemindInput"),
    modalTitle: qs("calModalTitle"),
    closeBtn: qs("calModalCloseBtn"),
    cancelBtn: qs("calCancelBtn"),
    saveBtn: qs("calSaveBtn"),
    deleteBtn: qs("calDeleteBtn"),
    deletePopover: qs("calDeletePopover"),
    deletePopoverCancel: qs("calDeletePopoverCancel"),
    deletePopoverConfirm: qs("calDeletePopoverConfirm"),
    alertPopover: qs("calAlertPopover"),
    alertPopoverText: qs("calAlertPopoverText"),
    alertPopoverOk: qs("calAlertPopoverOk")
  };
}

function syncCalTimeState() {
  const { time, allDay } = getCalModalFields();
  if (!time || !allDay) return;
  time.disabled = allDay.checked;
}

function closeCalModal() {
  const modal = qs("calEventModal");
  if (modal) modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
  calEditingId = null;
  const deleteBtn = qs("calDeleteBtn");
  if (deleteBtn) deleteBtn.classList.add("hidden");
  hideCalDeletePopover();
}

function showCalDeletePopover() {
  const { deletePopover } = getCalModalFields();
  if (deletePopover) deletePopover.classList.remove("hidden");
}

function hideCalDeletePopover() {
  const { deletePopover } = getCalModalFields();
  if (deletePopover) deletePopover.classList.add("hidden");
}

function showCalAlertPopover(message) {
  const { alertPopover, alertPopoverText } = getCalModalFields();
  if (alertPopoverText) {
    alertPopoverText.textContent = String(message || "This action could not be completed.");
  }
  if (alertPopover) alertPopover.classList.remove("hidden");
}

function hideCalAlertPopover() {
  const { alertPopover } = getCalModalFields();
  if (alertPopover) alertPopover.classList.add("hidden");
}

function resolveCalDeleteConfirm(result) {
  if (typeof calDeleteConfirmResolver === "function") {
    const resolver = calDeleteConfirmResolver;
    calDeleteConfirmResolver = null;
    resolver(!!result);
  }
  hideCalDeletePopover();
}

function confirmCalDelete() {
  hideCalDeletePopover();
  return new Promise((resolve) => {
    calDeleteConfirmResolver = resolve;
    showCalDeletePopover();
  });
}

function positionPlannerChips() {
  const chips = qs("plannerChips");
  const filterBtn = qs("plannerFilterBtn");
  const planner = document.querySelector("#calendarPanel .planner");
  if (!chips || !filterBtn || !planner) return;

  const plannerRect = planner.getBoundingClientRect();
  const filterRect = filterBtn.getBoundingClientRect();
  const left = Math.max(12, filterRect.left - plannerRect.left - 420);
  const top = Math.max(0, filterRect.bottom - plannerRect.top + 8);

  chips.style.setProperty("--planner-chips-left", `${left}px`);
  chips.style.setProperty("--planner-chips-top", `${top}px`);
}

function openCalModal({ mode = "add", event = null, date = calSelected, time = "", endTime = "", title = "" } = {}) {
  calEditingId = event ? event.id : null;

  const resolvedDate = event?.date || date || calSelected || ymd(new Date());
  const resolvedTime = event?.startTime || time || "";
  const resolvedEndTime = event?.endTime || endTime || "";
  const allDay = !resolvedTime && !resolvedEndTime;

  const titleInput = qs("calTitleInput");
  const dateInput = qs("calDateInput");
  const timeInput = qs("calTimeInput");
  const endInput = qs("calEndInput");
  const allDayInput = qs("calAllDayInput");
  const meetInput = qs("calMeetInput");
  const notesInput = qs("calNotesInput");
  const colorInput = qs("calColorInput");
  const remindInput = qs("calRemindInput");
  const modalTitle = qs("calModalTitle");
  const deleteBtn = qs("calDeleteBtn");

  if (modalTitle) modalTitle.textContent = event ? "Edit event" : "Add event";
  if (deleteBtn) deleteBtn.classList.toggle("hidden", !(event && event.canDelete));

  if (titleInput) titleInput.value = title || event?.title || "";
  if (dateInput) dateInput.value = resolvedDate;

  if (timeInput) {
    timeInput.value = resolvedTime;
    timeInput.disabled = allDay;
  }

  if (endInput) {
    endInput.value = resolvedEndTime;
    endInput.disabled = allDay;
  }

  if (allDayInput) allDayInput.checked = allDay;
  if (meetInput) meetInput.value = event?.meetLink || "";
  if (notesInput) notesInput.value = event?.notes || "";
  if (colorInput) colorInput.value = event?.color || "#1a73e8";
  if (remindInput) remindInput.value = String(event?.remindMin || 0);

  highlightColorChip(colorInput?.value);
  const modal = qs("calEventModal");
  if (modal) modal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  hideCalAlertPopover();
}

async function handleCalModalDelete() {
  if (calModalSaving || !calEditingId) return;
  const confirmed = await confirmCalDelete();
  if (!confirmed) return;

  try {
    calModalSaving = true;
    await fetchJSON(`/api/calendar/events/${encodeURIComponent(calEditingId)}`, {
      method: "DELETE",
      headers: buildCalendarApiHeaders()
    });

    closeCalModal();
    await renderCalendar();
  } catch (err) {
    console.error("Calendar delete request error:", err);
    showCalAlertPopover(err?.message || "Network error while deleting event.");
  } finally {
    calModalSaving = false;
  }
}

async function handleCalModalSave() {
  if (calModalSaving) return;

  const title = (qs("calTitleInput")?.value || "").trim();
  const dateRaw = qs("calDateInput")?.value || calSelected || ymd(new Date());
  const date = normalizeDateToYMD(dateRaw);
  const allDay = !!qs("calAllDayInput")?.checked;

  const startTime = allDay ? "" : (qs("calTimeInput")?.value || "").trim();
  const endTime = allDay ? "" : (qs("calEndInput")?.value || "").trim();

  const meetLink = (qs("calMeetInput")?.value || "").trim();
  const notes = (qs("calNotesInput")?.value || "").trim();
  const color = (qs("calColorInput")?.value || "#1a73e8").trim();
  const remindMin = Number(qs("calRemindInput")?.value || 0);

  if (!title || !date) {
    showCalAlertPopover("Title and date are required.");
    return;
  }

  if (!allDay && startTime && endTime && endTime <= startTime) {
    showCalAlertPopover("End time must be later than start time.");
    return;
  }

  const createdBy = (typeof getCurrentUserId === "function" ? getCurrentUserId() : "") || "";
  const workspaceId = currentWorkspaceId || "default";

  const endpoint = calEditingId
    ? `/api/calendar/events/${encodeURIComponent(calEditingId)}`
    : `/api/calendar/events`;

  const payload = calEditingId
    ? { title, date, startTime, endTime, meetLink, notes, remindMin, color, allDay }
    : { workspaceId, createdBy, title, date, startTime, endTime, meetLink, notes, remindMin, color, allDay };

  try {
    calModalSaving = true;
    await fetchJSON(endpoint, {
      method: calEditingId ? "PATCH" : "POST",
      headers: buildCalendarApiHeaders(),
      body: JSON.stringify(payload)
    });

    closeCalModal();
    calSelected = date;
    await renderCalendar();
  } catch (err) {
    console.error("Calendar save request error:", err);
    showCalAlertPopover(err?.message || "Network error while saving event.");
  } finally {
    calModalSaving = false;
  }
}

function initCalModalControls() {
  const {
    modal,
    closeBtn,
    cancelBtn,
    saveBtn,
    deleteBtn,
    deletePopover,
    deletePopoverCancel,
    deletePopoverConfirm,
    alertPopover,
    alertPopoverOk,
    allDay
  } = getCalModalFields();
  if (!modal) return;
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeCalModal();
    }
  });
  deletePopover?.addEventListener("click", (event) => {
    if (event.target === deletePopover) {
      resolveCalDeleteConfirm(false);
    }
  });
  alertPopover?.addEventListener("click", (event) => {
    if (event.target === alertPopover) {
      hideCalAlertPopover();
    }
  });
  closeBtn?.addEventListener("click", () => closeCalModal());
  cancelBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    closeCalModal();
  });
  saveBtn?.addEventListener("click", handleCalModalSave);
  deleteBtn?.addEventListener("click", handleCalModalDelete);
  deletePopoverCancel?.addEventListener("click", () => resolveCalDeleteConfirm(false));
  deletePopoverConfirm?.addEventListener("click", () => resolveCalDeleteConfirm(true));
  alertPopoverOk?.addEventListener("click", () => hideCalAlertPopover());
  allDay?.addEventListener("change", syncCalTimeState);
  initCalColorChips();
}

function initCalColorChips() {
  const colorInput = qs("calColorInput");
  if (!colorInput) return;
  document.querySelectorAll(".cal-color-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const color = chip.dataset.color;
      if (color) {
        colorInput.value = color;
      }
      document.querySelectorAll(".cal-color-chip").forEach((c) => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      calColorTouched = true;
    });
  });
  colorInput.addEventListener("input", () => {
    calColorTouched = true;
    highlightColorChip(colorInput.value);
  });
}

function highlightColorChip(selectedColor) {
  if (!selectedColor) return;
  const chips = document.querySelectorAll(".cal-color-chip");
  chips.forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.color === selectedColor);
  });
}

function getCurrentUserSafe() {
  try {
    return typeof getCurrentUserId === "function" ? getCurrentUserId() || "" : "";
  } catch {
    return "";
  }
}

function getCurrentRoleSafe() {
  try {
    const raw = sessionUser?.role || sessionUser?.userRole || "";
    return String(raw || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

function getCurrentWorkspaceHeaderSafe() {
  try {
    return String(
      currentWorkspaceId ||
      sessionUser?.workspaceId ||
      sessionUser?.workspace_id ||
      ""
    ).trim();
  } catch {
    return "";
  }
}

function buildCalendarApiHeaders() {
  const headers = {};
  const userId = getCurrentUserSafe();
  const role = getCurrentRoleSafe();
  const workspaceId = getCurrentWorkspaceHeaderSafe();
  if (userId) headers["x-user-id"] = userId;
  if (role) headers["x-user-role"] = role;
  if (workspaceId) headers["x-workspace-id"] = workspaceId;
  return headers;
}

function getWorkspaceSafe() {
  const sessionWs =
    typeof sessionUser !== "undefined"
      ? String(sessionUser?.workspaceId || sessionUser?.workspace_id || "").trim()
      : "";
  const storedWs =
    typeof currentWorkspaceId !== "undefined" && currentWorkspaceId
      ? String(currentWorkspaceId).trim()
      : "";
  const activeWs =
    typeof activeWorkspaceId !== "undefined" && activeWorkspaceId
      ? String(activeWorkspaceId).trim()
      : "";

  const candidate = sessionWs || storedWs || activeWs;
  if (!candidate) return "";

  if (candidate === "default") {
    const userDefault =
      typeof sessionUser !== "undefined" &&
      ["default"].includes(String(sessionUser?.workspaceId || sessionUser?.workspace_id || "").trim());
    if (userDefault) return "default";
    if (Array.isArray(workspaces) && workspaces.some((ws) => String(ws?.id || "") === "default")) {
      return "default";
    }
    return "";
  }

  return candidate;
}

function getWorkspaceDisplayName() {
  const wsId = getWorkspaceSafe();

  if (typeof getWorkspaceLabel === "function") {
    const label = getWorkspaceLabel(wsId);
    if (label && label !== wsId) return label;
  }

  if (typeof workspaces !== "undefined" && Array.isArray(workspaces)) {
    const match = workspaces.find((w) => {
      return String(w.id || w.workspaceId || "") === String(wsId);
    });
    if (match) return match.name || match.title || wsId;
  }

  if (typeof sessionUser !== "undefined") {
    if (sessionUser?.workspaceName) return sessionUser.workspaceName;
    if (sessionUser?.schoolName) return sessionUser.schoolName;
  }

  return wsId;
}

const CALENDAR_SOURCE_COLORS = {
  live_session: "#2563eb",
  class: "#2563eb",
  session: "#2563eb",
  homework: "#16a34a",
  exam: "#ef4444",
  speaking: "#8b5cf6",
  school_event: "#f59e0b",
  manual: "#2563eb"
};

function inferCalendarColor(event = {}, existingEvents = calEventsCache) {
  const normalizeKey = (obj, ...keys) => {
    for (const key of keys) {
      if (obj && obj[key]) return String(obj[key]);
    }
    return "";
  };

  const sourceId = normalizeKey(event, "sourceId", "source_id");
  const channelId = normalizeKey(event, "channelId", "channel_id");

  const matchByKey = (key, value) => {
    if (!value) return null;
    return existingEvents.find((ev) => {
      const compare = normalizeKey(ev, key, key.replace(/Id$/, "_id"));
      return compare && String(compare) === value && ev.color;
    });
  };

  const sourceMatch = matchByKey("sourceId", sourceId);
  if (sourceMatch && sourceMatch.color) return sourceMatch.color;

  const channelMatch = matchByKey("channelId", channelId);
  if (channelMatch && channelMatch.color) return channelMatch.color;

  const sourceTypeRaw = normalizeKey(event, "sourceType", "source_type").toLowerCase();
  const directMatch =
    Object.keys(CALENDAR_SOURCE_COLORS).find(
      (type) => type === sourceTypeRaw || (sourceTypeRaw && sourceTypeRaw.includes(type))
    ) || "";
  if (directMatch) return CALENDAR_SOURCE_COLORS[directMatch];

  const keyword = inferEventType(event);
  if (keyword && CALENDAR_SOURCE_COLORS[keyword]) return CALENDAR_SOURCE_COLORS[keyword];

  return CALENDAR_SOURCE_COLORS.manual;
}

function inferEventType(ev) {
  const t = String(ev?.title || "").toLowerCase();
  if (t.includes("homework")) return "homework";
  if (t.includes("exam")) return "exam";
  if (t.includes("speaking")) return "speaking";
  if (t.includes("class")) return "class";
  if (t.includes("school")) return "school";
  if (t.includes("club")) return "club";
  return "reminder";
}

function typeColor(type) {
  if (type === "class") return "#2563eb";
  if (type === "homework") return "#f59e0b";
  if (type === "exam") return "#ef4444";
  if (type === "speaking") return "#8b5cf6";
  if (type === "school") return "#16a34a";
  if (type === "club") return "#06b6d4";
  return "#64748b";
}

let workspaceRetryInterval = null;
const CALENDAR_WORKSPACE_READY_EVENT = "worknestWorkspaceReady";
const CALENDAR_PANEL_OPEN_EVENT = "calendarPanelOpened";

function clearWorkspaceWatcher() {
  if (workspaceRetryInterval) {
    clearInterval(workspaceRetryInterval);
    workspaceRetryInterval = null;
  }
}

function watchWorkspaceReady() {
  if (workspaceRetryInterval) return;
  workspaceRetryInterval = setInterval(() => {
    const ws = getWorkspaceSafe();
    if (ws) {
      clearWorkspaceWatcher();
      renderCalendar();
    }
  }, 350);
}

function handleWorkspaceReadyEvent() {
  if (!getWorkspaceSafe()) return;
  clearWorkspaceWatcher();
  renderCalendar();
}

window.addEventListener(CALENDAR_WORKSPACE_READY_EVENT, handleWorkspaceReadyEvent);
if (typeof window !== "undefined" && window.__calendarWorkspaceReady) {
  handleWorkspaceReadyEvent();
}

async function fetchCalendarEvents(from, to) {
  const ws = getWorkspaceSafe();
  if (!ws) {
    watchWorkspaceReady();
    return [];
  }
  const query =
    from && to
      ? `?workspaceId=${encodeURIComponent(ws)}&from=${from}&to=${to}`
      : `?workspaceId=${encodeURIComponent(ws)}`;

  const rows = await fetchJSON(`/api/calendar/events${query}`, {
    headers: buildCalendarApiHeaders()
  });

  console.log("calendar GET rows", rows);
  calEventsCache = Array.isArray(rows) ? rows.map(normalizeCalendarEvent) : [];
  console.log("normalized calendar rows", calEventsCache);
  return calEventsCache;
}

function normalizeCalendarEvent(ev) {
  if (!ev) return ev;
  let repeat = ev.repeat;
  if (!repeat && typeof ev.repeat_json === "string") {
    try {
      repeat = JSON.parse(ev.repeat_json);
    } catch {
      repeat = null;
    }
  }

  const dateValue = ev.date || ev.eventDate || ev.event_date || "";
  const notesValue = ev.notes || ev.description || "";
  const meetLinkValue = ev.meetLink || ev.meet_link || "";
  const detailsUrlValue = ev.detailsUrl || ev.details_url || "";
  const allDayValue =
    typeof ev.allDay === "boolean"
      ? ev.allDay
      : typeof ev.all_day === "number"
      ? !!ev.all_day
      : !!ev.all_day;

  const normalized = {
    id: ev.id,
    workspaceId: ev.workspaceId || ev.workspace_id || "",
    sourceType: ev.sourceType || ev.source_type || "manual",
    sourceId: ev.sourceId || ev.source_id || "",
    title: ev.title || "",
    description: notesValue,
    date: dateValue,
    eventDate: dateValue,
    startTime: ev.startTime || ev.start_time || "",
    endTime: ev.endTime || ev.end_time || "",
    notes: notesValue,
    meetLink: meetLinkValue,
    detailsUrl: detailsUrlValue,
    allDay: allDayValue,
    assigneeId: ev.assigneeId || ev.assignee_id || "",
    createdBy: ev.createdBy || ev.created_by || "",
    remindMin:
      ev.remindMin !== undefined
        ? Number(ev.remindMin)
        : ev.remind_min !== undefined
        ? Number(ev.remind_min)
        : 0,
    visibilityScope: ev.visibilityScope || ev.visibility_scope || "",
    targetType: ev.targetType || ev.target_type || "",
    targetId: ev.targetId || ev.target_id || "",
    canEdit:
      typeof ev.canEdit === "boolean"
        ? ev.canEdit
        : typeof ev.can_edit === "boolean"
        ? ev.can_edit
        : true,
    canDelete:
      typeof ev.canDelete === "boolean"
        ? ev.canDelete
        : typeof ev.can_delete === "boolean"
        ? ev.can_delete
        : false,
    color: ev.color || "#2563eb",
    repeat,
    done: typeof ev.done === "boolean" ? ev.done : !!ev.done
  };

  if (!normalized.color) {
    normalized.color = typeColor(inferEventType(normalized));
  }

  return normalized;
}

function expandRepeats(baseEvents, from, to) {
  const out = [];
  const fromTs = new Date(`${from}T00:00:00`).getTime();
  const toTs = new Date(`${to}T23:59:59`).getTime();

  for (const ev of baseEvents) {
    if (!ev.repeat || !ev.repeat.freq) {
      out.push(ev);
      continue;
    }

    const freq = String(ev.repeat.freq).toUpperCase();
    const interval = Math.max(1, Number(ev.repeat.interval || 1));
    let cur = new Date(`${ev.date}T00:00:00`);

    while (cur.getTime() <= toTs) {
      const ts = cur.getTime();
      const weekdayOk =
        !Array.isArray(ev.repeat.byWeekday) || ev.repeat.byWeekday.includes(cur.getDay());

      if (ts >= fromTs && ts <= toTs && weekdayOk) {
        out.push({ ...ev, date: ymd(cur), _occurrence: true, _baseId: ev.id });
      }

      if (freq === "DAILY") cur.setDate(cur.getDate() + interval);
      else if (freq === "WEEKLY") {
        if (Array.isArray(ev.repeat.byWeekday)) cur.setDate(cur.getDate() + 1);
        else cur.setDate(cur.getDate() + 7 * interval);
      } else if (freq === "MONTHLY") cur.setMonth(cur.getMonth() + interval);
      else break;
    }
  }

  return out;
}

function getFilteredEvents(rawEvents) {
  let events = [...rawEvents];

  if (calAssigneeOnly) {
    events = events.filter((e) => String(e.assigneeId || "") === String(calAssigneeOnly));
  }

  if (calSearchQuery.trim()) {
    const q = calSearchQuery.trim().toLowerCase();
    events = events.filter((e) => {
      return (
        String(e.title || "").toLowerCase().includes(q) ||
        String(e.notes || "").toLowerCase().includes(q)
      );
    });
  }

  if (calTypeFilter !== "all") {
    const me = getCurrentUserSafe();
    events = events.filter((e) => {
      if (calTypeFilter === "my") {
        return String(e.createdBy || e.assigneeId || "") === String(me);
      }
      return inferEventType(e) === calTypeFilter;
    });
  }

  return events;
}

function plannerRowHTML(ev) {
  const meta = [
    ev.startTime ? ev.startTime : "All day",
    inferEventType(ev)
  ].join(" • ");

  return `
    <div class="ps-row" data-id="${escapeHtml(ev.id)}">
      <span class="ps-dot" style="background:${escapeHtml(ev.color || "#2563eb")}"></span>
      <div>
        <div class="ps-row-title">${escapeHtml(ev.title || "Untitled")}</div>
        <div class="ps-row-sub">${escapeHtml(meta)}</div>
      </div>
    </div>
  `;
}

function renderSidebarLists(events) {
  const todayList = qs("plannerTodayList");
  const upcomingList = qs("plannerUpcomingList");
  const deadlineList = qs("plannerDeadlineList");
  const todayCount = qs("plannerTodayCount");
  const upcomingCount = qs("plannerUpcomingCount");
  const deadlineCount = qs("plannerDeadlineCount");
  const todayLabel = qs("plannerTodayLabel");

  const today = ymd(new Date());
  const weekEnd = addDays(today, 7);

  const todays = events
    .filter((e) => e.date === today)
    .sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")));

  const upcomingAll = events
    .filter((e) => e.date > today && e.date <= weekEnd)
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));

  const deadlinesAll = events
    .filter((e) => {
      const type = inferEventType(e);
      return (type === "homework" || type === "exam") && e.date >= today;
    })
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));

  const upcoming = upcomingAll.slice(0, 6);
  const deadlines = deadlinesAll.slice(0, 6);

  if (todayLabel) {
    todayLabel.textContent = new Date().toLocaleDateString(undefined, {
      weekday: "short",
      day: "2-digit",
      month: "short"
    });
  }

  if (todayCount) todayCount.textContent = String(todays.length);
  if (upcomingCount) upcomingCount.textContent = String(upcomingAll.length);
  if (deadlineCount) deadlineCount.textContent = String(deadlinesAll.length);

  if (todayList) {
    todayList.innerHTML = todays.length
      ? todays.map(plannerRowHTML).join("")
      : `<div class="ps-row"><div><div class="ps-row-title">No class or task today</div><div class="ps-row-sub">You are all caught up.</div></div></div>`;
  }

  if (upcomingList) {
    upcomingList.innerHTML = upcoming.length
      ? upcoming.map(plannerRowHTML).join("")
      : `<div class="ps-row"><div><div class="ps-row-title">No upcoming events</div><div class="ps-row-sub">Next 7 days are clear.</div></div></div>`;
  }

  if (deadlineList) {
    deadlineList.innerHTML = deadlines.length
      ? deadlines.map(plannerRowHTML).join("")
      : `<div class="ps-row"><div><div class="ps-row-title">No deadlines</div><div class="ps-row-sub">No homework or exams due soon.</div></div></div>`;
  }

  [todayList, upcomingList, deadlineList].forEach((container) => {
    if (!container) return;
    container.querySelectorAll(".ps-row[data-id]").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-id");
        const base = calEventsCache.find((x) => String(x.id) === String(id));
        if (base) openCalModal({ event: base });
      });
    });
  });
}

function renderCalendarMonth(grid, events) {
  grid.className = "calendar-grid";
  grid.dataset.view = "month";
  grid.innerHTML = "";

  const first = new Date(calView.year, calView.month, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(calView.year, calView.month + 1, 0).getDate();

  for (let i = 0; i < startDow; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day is-empty";
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = ymd(new Date(calView.year, calView.month, day));
    const dayEvents = events
      .filter((ev) => ev.date === dateStr)
      .sort((a, b) => String(a.startTime || "").localeCompare(String(b.startTime || "")));

    const visible = dayEvents.slice(0, 3);
    const overflow = Math.max(0, dayEvents.length - visible.length);

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "calendar-day";

    if (dateStr === ymd(new Date())) cell.classList.add("is-today");
    if (dateStr === calSelected) cell.classList.add("is-selected");

    cell.innerHTML = `
      <div class="cal-day-header">
        <span class="cal-num">${day}</span>
      </div>
      <button type="button" class="cal-plus">+</button>
      ${
        visible.length
          ? `<div class="cal-day-events">
              ${visible
                .map(
                  (ev) => `
                    <div class="cal-chip" data-id="${escapeHtml(ev.id)}">
                      <span class="cal-chip-dot" style="background:${escapeHtml(ev.color)}"></span>
                      <span class="cal-chip-time">${escapeHtml(ev.startTime || "All-day")}</span>
                      <span>${escapeHtml(ev.title)}</span>
                    </div>
                  `
                )
                .join("")}
              ${overflow ? `<button type="button" class="cal-more">+${overflow} more</button>` : ""}
            </div>`
          : ""
      }
    `;

      cell.addEventListener("click", (e) => {
        if (e.target.closest(".cal-plus") || e.target.closest(".cal-chip") || e.target.closest(".cal-more")) return;
        calSelected = dateStr;
        openCalModal({
          date: dateStr,
          time: "09:00",
          endTime: addHour("09:00"),
          title: "Reminder – "
        });
      });

    cell.querySelector(".cal-plus")?.addEventListener("click", (e) => {
      e.stopPropagation();
      openCalModal({ date: dateStr });
    });

    cell.querySelectorAll(".cal-chip").forEach((chip) => {
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = chip.getAttribute("data-id");
        const base = calEventsCache.find((x) => String(x.id) === String(id));
        if (base) openCalModal({ event: base });
      });
    });

    grid.appendChild(cell);
  }
}

function renderCalendarWeek(grid, events, fromDate) {
  grid.className = "cal-week-scroll";
  grid.dataset.view = "week";
  grid.innerHTML = "";

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";

  const days = Array.from({ length: 7 }, (_, i) => addDays(fromDate, i));
  const START_HOUR = 6;
  const END_HOUR = 24;
  const SLOT_HOURS = 2;
  const slotCount = Math.ceil((END_HOUR - START_HOUR) / SLOT_HOURS);
  const totalMinutes = (END_HOUR - START_HOUR) * 60;
  const gridHeight = grid.clientHeight || Math.max(window.innerHeight - 220, 480);
  const availableHeight = Math.max(360, gridHeight - 70);
  const slotHeight = Math.max(28, Math.floor(availableHeight / slotCount));

  const shell = document.createElement("div");
  shell.style.display = "grid";
  shell.style.gridTemplateColumns = "72px 1fr";
  shell.style.gap = "10px";
  shell.style.padding = "14px";

  const gutter = document.createElement("div");
  gutter.style.border = isDark
    ? "1px solid rgba(148,163,184,.18)"
    : "1px solid rgba(15,23,42,.08)";
  gutter.style.borderRadius = "18px";
  gutter.style.overflow = "hidden";
  gutter.style.position = "relative";
  gutter.style.background = isDark ? "rgba(15,23,42,.86)" : "#fff";
  gutter.innerHTML = `<div style="height:46px;border-bottom:${isDark ? "1px solid rgba(148,163,184,.18)" : "1px solid rgba(15,23,42,.08)"}"></div>`;

  for (let h = START_HOUR; h < END_HOUR; h += SLOT_HOURS) {
    const t = document.createElement("div");
    t.style.minHeight = `${slotHeight}px`;
    t.style.display = "flex";
    t.style.flexDirection = "column";
    t.style.alignItems = "center";
    t.style.justifyContent = "center";
    t.style.paddingTop = "0";
    t.style.borderTop = isDark
      ? "1px solid rgba(148,163,184,.14)"
      : "1px solid rgba(15,23,42,.06)";
    t.style.fontSize = "12px";
    t.style.fontWeight = "900";
    t.style.color = isDark ? "rgba(226,232,240,.62)" : "rgba(15,23,42,.55)";
    const endLabel = Math.min(END_HOUR, h + SLOT_HOURS);
    t.innerHTML = `
      <span>${String(h).padStart(2, "0")}:00</span>
      <span style="font-size:10px;font-weight:800;opacity:.7;line-height:1.1;">to</span>
      <span>${String(endLabel).padStart(2, "0")}:00</span>
    `;
    gutter.appendChild(t);
  }

  const board = document.createElement("div");
  board.style.border = isDark
    ? "1px solid rgba(148,163,184,.18)"
    : "1px solid rgba(15,23,42,.08)";
  board.style.borderRadius = "18px";
  board.style.overflow = "hidden";
  board.style.background = isDark ? "rgba(15,23,42,.86)" : "#fff";

  const head = document.createElement("div");
  head.style.display = "grid";
  head.style.gridTemplateColumns = "repeat(7,1fr)";
  head.style.borderBottom = isDark
    ? "1px solid rgba(148,163,184,.18)"
    : "1px solid rgba(15,23,42,.08)";
  days.forEach((d) => {
    const h = document.createElement("div");
    h.style.height = "46px";
    h.style.display = "flex";
    h.style.alignItems = "center";
    h.style.justifyContent = "center";
    h.style.fontSize = "12px";
    h.style.fontWeight = "900";
    h.style.textTransform = "uppercase";
    h.style.letterSpacing = ".08em";
    h.style.color = isDark ? "rgba(226,232,240,.72)" : "rgba(15,23,42,.65)";
    h.textContent = new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
      day: "2-digit"
    });
    head.appendChild(h);
  });

  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gridTemplateColumns = "repeat(7,1fr)";

  days.forEach((day) => {
    const col = document.createElement("div");
    col.style.position = "relative";
    col.style.minHeight = `${slotCount * slotHeight}px`;
    col.style.borderLeft = isDark
      ? "1px solid rgba(148,163,184,.14)"
      : "1px solid rgba(15,23,42,.06)";
    col.style.background = isDark ? "rgba(30,41,59,.48)" : "rgba(15,23,42,.01)";

    // TODO: support true all-day events by showing them at the top of each day column.
    for (let i = 0; i < slotCount; i++) {
      const slot = document.createElement("div");
      slot.className = "cal-slot";
      slot.style.height = `${slotHeight}px`;
      slot.style.borderTop = isDark
        ? "1px solid rgba(148,163,184,.14)"
        : "1px solid rgba(15,23,42,.06)";
      const hour = START_HOUR + i * SLOT_HOURS;
      const time = `${String(hour).padStart(2, "0")}:00`;
      slot.dataset.date = day;
      slot.dataset.time = time;
      slot.addEventListener("click", () => {
        calSelected = day;
        openCalModal({
          date: day,
          time,
          endTime: addHours(time, SLOT_HOURS),
          title: "Reminder – "
        });
      });
      col.appendChild(slot);
    }

    col.addEventListener("dblclick", (e) => {
      if (e.target.closest(".cal-block")) return;
      calSelected = day;
      openCalModal({ date: day, title: "Reminder – " });
    });

    events
      .filter((e) => e.date === day)
      .forEach((ev) => {
        const startMin = toMinutes(ev.startTime || "");
        if (startMin == null) return;

        const endMin = toMinutes(ev.endTime || "");
        const duration = endMin != null && endMin > startMin ? endMin - startMin : 60;
        const topMin = Math.max(0, startMin - START_HOUR * 60);

        const block = document.createElement("div");
        block.className = "cal-block";
        block.style.position = "absolute";
        block.style.left = "0";
        block.style.right = "0";
        block.style.top = `${(topMin / totalMinutes) * (slotCount * slotHeight) + 1}px`;
        block.style.height = `${Math.max(26, (duration / totalMinutes) * (slotCount * slotHeight) - 2)}px`;
        block.style.borderRadius = "0";
        block.style.padding = "8px 10px";
        block.style.border = "none";
        block.style.background = ev.color || "#2563eb";
        block.style.color = "#0f172a";
        block.style.boxShadow = "none";
        block.style.cursor = "pointer";

        block.innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;font-weight:900;color:rgba(15,23,42,.70)">
            <span>${escapeHtml(ev.startTime || "")}</span>
            <span>${inferEventType(ev)}</span>
          </div>
          <div style="margin-top:4px;font-size:13px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${escapeHtml(ev.title)}
          </div>
        `;

        block.addEventListener("click", (e) => {
          e.stopPropagation();
          const base = calEventsCache.find((x) => String(x.id) === String(ev.id));
          openCalModal({ event: base || ev });
        });

        col.appendChild(block);
      });

    body.appendChild(col);
  });

  board.appendChild(head);
  board.appendChild(body);
  shell.appendChild(gutter);
  shell.appendChild(board);
  grid.appendChild(shell);
}

function renderCalendarAgenda(grid, events, from, to) {
  grid.className = "calendar-grid";
  grid.dataset.view = "agenda";

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";

  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);

  const byDate = new Map();
  events.forEach((ev) => {
    if (!byDate.has(ev.date)) byDate.set(ev.date, []);
    byDate.get(ev.date).push(ev);
  });

  grid.innerHTML = days
    .map((d) => {
      const list = (byDate.get(d) || []).sort((a, b) =>
        `${a.startTime}`.localeCompare(`${b.startTime}`)
      );

      return `
        <div style="border:${isDark ? "1px solid rgba(148,163,184,.20)" : "1px solid rgba(15,23,42,.08)"};border-radius:18px;background:${isDark ? "rgba(15,23,42,.78)" : "#fff"};box-shadow:${isDark ? "0 18px 40px rgba(2,6,23,.45)" : "0 12px 24px rgba(15,23,42,.06)"};padding:14px;">
          <div style="font-size:15px;font-weight:900;margin-bottom:10px;color:${isDark ? "rgba(248,250,252,.94)" : "inherit"};">${escapeHtml(d)}</div>
          ${
            list.length
              ? list
                  .map(
                    (ev) => `
                      <button class="agenda-row" data-id="${escapeHtml(ev.id)}" type="button">
                        <span class="cal-badge">${escapeHtml(ev.startTime || "All-day")}</span>
                        <span style="font-weight:900;flex:1;">${escapeHtml(ev.title)}</span>
                      </button>
                    `
                  )
                  .join("")
            : `<button class="agenda-row agenda-empty-create" data-date="${escapeHtml(d)}" type="button">
                 <span class="cal-badge">+</span>
                 <span style="font-weight:900;flex:1;">Add task or reminder</span>
               </button>`
        }
      </div>
    `;
  })
  .join("");

  grid.querySelectorAll(".agenda-row[data-id]").forEach((row) => {
    row.addEventListener("click", () => {
      const id = row.getAttribute("data-id");
      const base = calEventsCache.find((x) => String(x.id) === String(id));
      if (base) openCalModal({ event: base });
    });
  });

  grid.querySelectorAll(".agenda-empty-create").forEach((row) => {
      row.addEventListener("click", () => {
        const date = row.getAttribute("data-date");
        if (!date) return;
        calSelected = date;
        openCalModal({
          date,
          time: "09:00",
          endTime: addHour("09:00"),
          title: "Reminder – "
        });
      });
    });
}

function renderMiniMonth() {
  const miniGrid = qs("miniMonthGrid");
  const miniLabel = qs("miniMonthLabel");
  if (!miniGrid || !miniLabel) return;

  const monthNames = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];

  miniLabel.textContent = `${monthNames[calView.month]} ${calView.year}`;
  miniGrid.innerHTML = "";

  const first = new Date(calView.year, calView.month, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(calView.year, calView.month + 1, 0).getDate();
  const today = ymd(new Date());

  // add leading empty slots so first day aligns with weekday
  for (let i = 0; i < startDow; i++) {
    const filler = document.createElement("button");
    filler.type = "button";
    filler.className = "mini-day is-empty";
    filler.disabled = true;
    miniGrid.appendChild(filler);
  }

  for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mini-day";
    const dateObj = new Date(calView.year, calView.month, dayNum);
    const dateStr = ymd(dateObj);

    btn.textContent = String(dayNum);
    if (dateStr === today) btn.classList.add("is-today");
    if (dateStr === calSelected) btn.classList.add("is-selected");

    btn.addEventListener("click", async () => {
      calSelected = dateStr;
      calView.year = dateObj.getFullYear();
      calView.month = dateObj.getMonth();
      await renderCalendar();
    });

    miniGrid.appendChild(btn);
  }
}

async function renderCalendar() {
  const grid = qs("calendarGrid");
  const monthLabel = qs("calMonthLabel");
  const workspaceLabel = qs("plannerWorkspaceName");
  if (!grid || !monthLabel) return;

  if (workspaceLabel) {
  workspaceLabel.textContent = getWorkspaceDisplayName();
}

  let from;
  let to;

  if (calViewMode === "month") {
    const first = new Date(calView.year, calView.month, 1);
    const last = new Date(calView.year, calView.month + 1, 0);
    from = ymd(first);
    to = ymd(last);
    monthLabel.textContent = first.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric"
    });
  } else {
    from = startOfWeek(calSelected);
    to = calViewMode === "week" ? endOfWeek(calSelected) : addDays(from, 27);
    monthLabel.textContent = new Date(`${from}T00:00:00`).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric"
    });
  }

  const today = ymd(new Date());
  const sidebarTo = addDays(today, CALENDAR_SIDEBAR_LOOKAHEAD_DAYS);
  const requestFrom = from < today ? from : today;
  const requestTo = to > sidebarTo ? to : sidebarTo;

  await fetchCalendarEvents(requestFrom, requestTo);

  const expanded = expandRepeats(calEventsCache, from, to);
  const filtered = getFilteredEvents(expanded);
  const sidebarEvents = expandRepeats(calEventsCache, today, sidebarTo);

  const weekdays = document.querySelector("#calendarPanel .calendar-weekdays");
  if (weekdays) weekdays.style.display = calViewMode === "month" ? "grid" : "none";

  if (calViewMode === "month") renderCalendarMonth(grid, filtered);
  if (calViewMode === "week") renderCalendarWeek(grid, filtered, from);
  if (calViewMode === "agenda") renderCalendarAgenda(grid, filtered, from, to);

  renderMiniMonth();
  renderSidebarLists(sidebarEvents);
}

async function initCalendarIfNeeded() {
  if (calInitDone) return;
  calInitDone = true;

  initCalModalControls();

  const now = new Date();
  calView.year = now.getFullYear();
  calView.month = now.getMonth();
  calSelected = ymd(now);

  document.querySelectorAll("[data-cal-view]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll("[data-cal-view]").forEach((b) => b.classList.remove("pbtn-active"));
      btn.classList.add("pbtn-active");
      calViewMode = btn.getAttribute("data-cal-view") || "week";
      await renderCalendar();
    });
  });

  qs("calSaveBtn")?.addEventListener("click", handleCalModalSave);
  qs("calAllDayInput")?.addEventListener("change", (e) => {
    const disabled = e.target.checked;
    const timeInput = qs("calTimeInput");
    const endInput = qs("calEndInput");
    if (timeInput) timeInput.disabled = disabled;
    if (endInput) endInput.disabled = disabled;
  });

  qs("calPrevBtn")?.addEventListener("click", async () => {
    if (calViewMode === "week" || calViewMode === "agenda") {
      calSelected = addDays(calSelected, -7);
    } else {
      calView.month -= 1;
      if (calView.month < 0) {
        calView.month = 11;
        calView.year -= 1;
      }
    }
    await renderCalendar();
  });

  qs("calNextBtn")?.addEventListener("click", async () => {
    if (calViewMode === "week" || calViewMode === "agenda") {
      calSelected = addDays(calSelected, 7);
    } else {
      calView.month += 1;
      if (calView.month > 11) {
        calView.month = 0;
        calView.year += 1;
      }
    }
    await renderCalendar();
  });

  qs("calTodayBtn")?.addEventListener("click", async () => {
    const d = new Date();
    calView.year = d.getFullYear();
    calView.month = d.getMonth();
    calSelected = ymd(d);
    await renderCalendar();
  });

  qs("miniMonthPrev")?.addEventListener("click", async () => {
    calView.month -= 1;
    if (calView.month < 0) {
      calView.month = 11;
      calView.year -= 1;
    }
    await renderCalendar();
  });

  qs("miniMonthNext")?.addEventListener("click", async () => {
    calView.month += 1;
    if (calView.month > 11) {
      calView.month = 0;
      calView.year += 1;
    }
    await renderCalendar();
  });

  qs("plannerSearch")?.addEventListener("input", async (e) => {
    calSearchQuery = e.target.value || "";
    await renderCalendar();
  });

  qs("plannerChips")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-filter]");
    if (!btn) return;
    calTypeFilter = btn.getAttribute("data-filter") || "all";
    document.querySelectorAll("#plannerChips .chip").forEach((chip) => chip.classList.remove("chip-active"));
    btn.classList.add("chip-active");
    qs("plannerChips")?.classList.remove("is-open");
    await renderCalendar();
  });

  qs("plannerFilterBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    positionPlannerChips();
    qs("plannerChips")?.classList.toggle("is-open");
  });

  qs("plannerQuickActions")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");

    if (action === "createHomework") openCalModal({ date: calSelected, title: "Homework – " });
    if (action === "scheduleExam") openCalModal({ date: calSelected, title: "Exam – " });
    if (action === "addSpeaking") openCalModal({ date: calSelected, title: "Speaking session – " });
    if (action === "addReminder") openCalModal({ date: calSelected, title: "Reminder – " });
  });

  qs("calAddBtn")?.addEventListener("click", () =>
    openCalModal({
      date: calSelected,
      time: "09:00",
      endTime: addHour("09:00"),
      title: "Reminder – "
    })
  );

  const assigneeSelect = qs("calAssigneeFilter");
  if (assigneeSelect && Array.isArray(window.userDirectoryCache)) {
    assigneeSelect.innerHTML =
      `<option value="">All assignees</option>` +
      window.userDirectoryCache
        .map((u) => {
          const id = u.id || u.userId || u.email || "";
          const name = u.name || u.username || u.email || id;
          return `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`;
        })
        .join("");

    assigneeSelect.addEventListener("change", async () => {
      calAssigneeOnly = assigneeSelect.value || "";
      await renderCalendar();
    });
  }

  await renderCalendar();
}

document.addEventListener("DOMContentLoaded", initCalendarIfNeeded);
document.addEventListener(CALENDAR_PANEL_OPEN_EVENT, () => {
  if (calInitDone) {
    renderCalendar();
  } else {
    initCalendarIfNeeded();
  }
});

document.addEventListener("click", (e) => {
  const chips = qs("plannerChips");
  const filterBtn = qs("plannerFilterBtn");
  if (chips?.classList.contains("is-open")) {
    if (!chips.contains(e.target) && !filterBtn?.contains(e.target)) {
      chips.classList.remove("is-open");
    }
  }
  const chip = e.target.closest(".cal-color-chip");
  if (!chip) return;
  const input = document.getElementById("calColorInput");
  const color = chip.getAttribute("data-color");
  if (input && color) {
    input.value = color;
    highlightColorChip(color);
  }
});

window.addEventListener("resize", () => {
  positionPlannerChips();
});
