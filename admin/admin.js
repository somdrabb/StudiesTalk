/* StudisNest Admin Portal (vanilla JS)
   Auth: uses x-user-id header (same style used by your existing app) :contentReference[oaicite:5]{index=5}
*/

const $ = (id) => document.getElementById(id);

const STORAGE_USER_ID = "studis_admin_user_id";
const STORAGE_ACCESS_TOKEN = "studis_admin_access_token";
const STORAGE_TAB = "studis_admin_current_tab";

let accessToken = "";

const AUTO_LOGOUT_MS = 30 * 60 * 1000;
const AUTO_EVENTS = ["mousemove", "click", "keydown", "touchstart"];
let autoLogoutTimer = null;
let autoLogoutEventsBound = false;

const state = {
  userId: "",
  me: null,
  workspaces: [],
  workspaceId: "all",
  currentTab: "overview",
  requests: {
    status: "pending",
    q: "",
    sort: "new",
    limit: 25,
    cursor: null,
    currentCursor: null,
    nextCursor: null,
    cursorHistory: [],
    items: [],
    counts: { pending: 0, approved: 0, rejected: 0, flagged: 0, all: 0 },
    selected: new Set(),
    loading: false
  }
};

const REQUESTS_DEBOUNCE_MS = 320;
let requestSearchTimer = null;

function formatEUR(n) {
  return `€${Number(n || 0).toFixed(2)}`;
}

function formatAdminTimestamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

const TAB_HEADERS = {
  overview: {
    title: "Overview",
    subtitle: "Key stats across your platform."
  },
  schools: {
    title: "Schools",
    subtitle: "All registered workspaces and schools."
  },
  users: {
    title: "Users",
    subtitle: "Search and manage admin/customer users."
  },
  billing: {
    title: "Billing",
    subtitle: "Invoices, payments and lifecycle."
  },
  settings: {
    title: "Settings",
    subtitle: "Workspace configuration and policies."
  },
  audit: {
    title: "Audit log",
    subtitle: "Track every admin action."
  },
  "school-requests": {
    title: "School requests",
    subtitle: "Review new schools waiting for approval."
  }
};

function persistUserId(id) {
  if (!id) {
    localStorage.removeItem(STORAGE_USER_ID);
    return;
  }
  localStorage.setItem(STORAGE_USER_ID, id);
}

function setAccessToken(token) {
  accessToken = token || "";
  if (!token) {
    localStorage.removeItem(STORAGE_ACCESS_TOKEN);
  } else {
    localStorage.setItem(STORAGE_ACCESS_TOKEN, token);
  }
}

function persistTab(tab) {
  if (!tab) return;
  state.currentTab = tab;
  localStorage.setItem(STORAGE_TAB, tab);
}

function setError(el, msg) {
  el.textContent = msg || "";
  el.hidden = !msg;
}

function resetAutoLogout() {
  if (!state.userId) return;
  if (autoLogoutTimer) clearTimeout(autoLogoutTimer);
  autoLogoutTimer = setTimeout(() => {
    setError($("globalError"), "You were logged out due to inactivity.");
    clearSession();
  }, AUTO_LOGOUT_MS);
}

function attachAutoLogoutEvents() {
  if (autoLogoutEventsBound) return;
  AUTO_EVENTS.forEach((event) => window.addEventListener(event, resetAutoLogout));
  autoLogoutEventsBound = true;
}

function startAutoLogoutTracking() {
  attachAutoLogoutEvents();
  resetAutoLogout();
}

function stopAutoLogoutTracking() {
  if (autoLogoutTimer) {
    clearTimeout(autoLogoutTimer);
    autoLogoutTimer = null;
  }
}

function showModal({ title, bodyHtml, footHtml }) {
  if (!state.me) {
    console.warn("Modal suppressed until admin session is active.");
    closeModal();
    return;
  }
  $("modalTitle").textContent = title || "Modal";
  $("modalBody").innerHTML = bodyHtml || "";
  $("modalFoot").innerHTML = footHtml || "";
  $("modal").hidden = false;
}

function closeModal() {
  $("modal").hidden = true;
  $("modalBody").innerHTML = "";
  $("modalFoot").innerHTML = "";
}

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? match[1] : "";
}

const modalCloseBtn = $("modalClose");
if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
const modalOverlay = $("modal");
if (modalOverlay) {
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });
}

const aiLimitsPanel = $("panel-ai-limits");
const aiLimitsBtn = $("btnSpeakingPractice");
const aiLimitsCloseBtn = $("btnAiLimitsClose");
function setAiLimitsVisible(visible) {
  if (!aiLimitsPanel) return;
  aiLimitsPanel.hidden = !visible;
  if (visible) {
    loadAiDefaultCap();
  }
}
if (aiLimitsBtn) {
  aiLimitsBtn.addEventListener("click", () => {
    const isVisible = aiLimitsPanel ? !aiLimitsPanel.hidden : false;
    setAiLimitsVisible(!isVisible);
  });
}
if (aiLimitsCloseBtn) {
  aiLimitsCloseBtn.addEventListener("click", () => {
    setAiLimitsVisible(false);
  });
}

function getWorkspaceSelectElement() {
  return document.getElementById("workspaceSelect");
}

function getWorkspaceForAiBudget() {
  const select = getWorkspaceSelectElement();
  const fallback = select?.value || "";
  const candidate = state.workspaceId && state.workspaceId !== "all" ? state.workspaceId : fallback;
  if (!candidate || candidate === "all") {
    return "";
  }
  return candidate;
}

async function fetchAiBudgetData(workspaceId) {
  const targetId = workspaceId || getWorkspaceForAiBudget();
  if (!targetId) return null;
  const params = new URLSearchParams({ workspaceId: targetId });
  const response = await fetch(`/api/admin/ai-budget?${params.toString()}`, { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to load AI budget");
  }
  return response.json();
}

async function fetchAiBudgetDefault() {
  const response = await fetch("/api/admin/ai-budget/default", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to load default AI budget");
  }
  return response.json();
}

async function refreshAiLimitsPanel() {
  const workspaceId = getWorkspaceForAiBudget();
  const workspaceInput = $("aiCapInput");
  const capCur = $("aiCapCurrent");
  const usedCur = $("aiCapUsed");

  if (!workspaceId) return;

  try {
    const workspaceData = await fetchAiBudgetData(workspaceId);
    if (workspaceInput) {
      workspaceInput.value =
        workspaceData?.monthly_cap_eur != null ? String(workspaceData.monthly_cap_eur) : "";
    }
    const workspaceCap = workspaceData?.monthly_cap_eur ?? 0;
    if (capCur) {
      capCur.textContent = formatEUR(workspaceCap);
    }
    if (usedCur) {
      usedCur.textContent = formatEUR(workspaceData?.used_eur ?? 0);
    }
  } catch (err) {
    console.warn("Could not refresh AI budget for workspace", err);
  }
}

async function loadAiDefaultCap() {
  const panel = $("panel-ai-limits");
  if (panel?.hasAttribute("hidden")) return;

  let response;
  try {
    response = await fetch("/api/admin/ai-budget/default", {
      credentials: "include"
    });
  } catch (err) {
    console.warn("Failed to load default cap", err);
    return;
  }

  if (response.status === 403) {
    const panelEl = document.getElementById("panel-ai-limits");
    if (panelEl) {
      panelEl.setAttribute("hidden", "hidden");
    }
    return;
  }

  if (!response.ok) return;
  const data = await response.json().catch(() => ({}));
  const defaultInput = $("aiDefaultCapInput");
  const defaultCurrent = $("aiDefaultCapCurrent");

  const value = Number(data.monthly_cap_eur || 0).toFixed(2);
  if (defaultInput) defaultInput.value = value;
  if (defaultCurrent) defaultCurrent.textContent = `€${value}`;
}

$("aiCapSaveBtn")?.addEventListener("click", async () => {
  const workspaceId = getWorkspaceForAiBudget();
  if (!workspaceId) {
    alert("Select a workspace first.");
    return;
  }
  const input = $("aiCapInput");
  const v = Number(input?.value ?? 0);
  try {
    await api(`/api/admin/ai-budget?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: { workspaceId, monthly_cap_eur: Math.max(0, v) }
    });
    await refreshAiLimitsPanel();
    alert("Workspace override saved.");
  } catch (err) {
    alert(err.message || "Could not save AI budget.");
  }
});

$("aiDefaultCapSaveBtn")?.addEventListener("click", async () => {
  const input = $("aiDefaultCapInput");
  const value = Number(input?.value || 0);
  if (Number.isNaN(value) || value < 0) {
    alert("Enter a non-negative amount.");
    return;
  }
  const response = await fetch("/api/admin/ai-budget/default", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ monthly_cap_eur: value })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(data.error || "Failed to save AI budget");
    return;
  }
  const defaultCurrent = $("aiDefaultCapCurrent");
  const formatted = `€${Number(data.monthly_cap_eur || 0).toFixed(2)}`;
  if (defaultCurrent) defaultCurrent.textContent = formatted;
  alert("Default AI budget saved.");
});

$("aiCapResetUsageBtn")?.addEventListener("click", async () => {
  const workspaceId = getWorkspaceForAiBudget();
  if (!workspaceId) {
    alert("Select a workspace first.");
    return;
  }
  try {
    await api(`/api/admin/ai-budget/reset?workspaceId=${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      body: { workspaceId }
    });
    await refreshAiLimitsPanel();
    alert("AI usage reset.");
  } catch (err) {
    alert(err.message || "Could not reset AI usage.");
  }
});

refreshAiLimitsPanel();

async function api(path, { method = "GET", body = null } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (state.userId) headers["x-user-id"] = state.userId;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers["x-csrf-token"] = csrfToken;
  }

  const resp = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
    credentials: "same-origin"
  });

  const ct = resp.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  const data = isJson
    ? await resp.json().catch(() => null)
    : await resp.text().catch(() => "");

  if (!resp.ok) {
    const msg = isJson && data && data.error
      ? data.error
      : typeof data === "string" && data.trim()
      ? data.slice(0, 180)
      : `HTTP ${resp.status}`;
    throw new Error(msg);
  }

  return isJson ? data : { ok: true, text: data };
}

function renderTable(el, { columns, rows, emptyText = "No data" }) {
  if (!rows || !rows.length) {
    el.innerHTML = `<div style="padding:12px" class="muted">${emptyText}</div>`;
    return;
  }

  const thead = columns
    .map((c) => `<th style="${c.width ? `width:${c.width}` : ""}">${escapeHtml(c.label)}</th>`)
    .join("");

  const tbody = rows
    .map((r) => {
      const tds = columns
        .map((c) => {
          const v = typeof c.render === "function" ? c.render(r) : r[c.key];
          return `<td>${v ?? ""}</td>`;
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");

  el.innerHTML = `<table class="table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function moneyEUR(cents) {
  const v = Number(cents || 0) / 100;
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
}

function setTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach((p) => (p.hidden = true));
  const panel = $(`panel-${tab}`);
  if (panel) {
    panel.hidden = false;
  } else {
    console.warn("Missing panel:", `panel-${tab}`);
  }
  updateHeader(tab);
}

function updateHeader(tab) {
  const { title, subtitle } = TAB_HEADERS[tab] || {
    title: "Admin Dashboard",
    subtitle: "Manage schools, users, billing and settings"
  };
  const titleEl = $("pageTitle");
  const subtitleEl = $("pageSubtitle");
  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle;
}

function wireKpiNavigation() {
  document.querySelectorAll(".kpi[data-target]").forEach((kpi) => {
    kpi.addEventListener("click", () => {
      const target = kpi.dataset.target;
      if (target) {
        setTab(target);
        persistTab(target);
        refreshActiveTab().catch(() => {});
      }
    });
  });
}

function wireNavToolHighlight() {
  const tools = document.querySelectorAll(".nav-tool");
  tools.forEach((btn) =>
    btn.addEventListener("click", () => {
      tools.forEach((tool) => tool.classList.remove("is-active"));
      btn.classList.add("is-active");
    })
  );
}

function setHidden(id, hidden) {
  const el = $(id);
  if (!el) return;
  if (hidden) {
    el.setAttribute("hidden", "");
  } else {
    el.removeAttribute("hidden");
    el.style.display = "";
  }
}

function showLoginCard(visible) {
  setHidden("loginCard", !visible);
}

function activateAdminView(me) {
  state.me = me;
  const nameEl = $("adminUserName");
  if (nameEl) nameEl.textContent = me.name || me.email || me.id;
  const metaEl = $("adminUserMeta");
  if (metaEl) metaEl.textContent = `${me.role} • ${me.workspaceId}`;
  setHidden("adminUserBadge", false);
  setHidden("btnLogout", false);
  showLoginCard(false);
  setHidden("adminApp", false);
  persistUserId(state.userId);
  startAutoLogoutTracking();
}

function clearSession() {
  state.userId = "";
  state.me = null;
  persistUserId(null);
  setAccessToken("");
  setHidden("adminApp", true);
  showLoginCard(true);
  setHidden("btnLogout", true);
  setHidden("adminUserBadge", true);
  stopAutoLogoutTracking();
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    setTab(btn.dataset.tab);
    persistTab(btn.dataset.tab);
    refreshActiveTab().catch((e) => setError($("globalError"), e.message));
  });
});

const btnRefreshEl = $("btnRefresh");
if (btnRefreshEl) {
  btnRefreshEl.addEventListener("click", () => {
    refreshAll().catch((e) => setError($("globalError"), e.message));
  });
}

const btnLogoutEl = $("btnLogout");
if (btnLogoutEl) {
  btnLogoutEl.addEventListener("click", () => {
    clearSession();
    setError($("globalError"), "");
  });
}

const btnLoginEl = $("btnLogin");
if (btnLoginEl) {
  btnLoginEl.addEventListener("click", async () => {
    setError($("loginError"), "");
    const identifier = $("loginUserId").value.trim();
    const password = $("loginPassword").value;
    if (!identifier || !password) {
      return setError($("loginError"), "Please enter your email/ID and password.");
    }

    try {
      const payload = identifier.includes("@")
        ? { email: identifier.toLowerCase(), password }
        : { login: identifier.toLowerCase(), password };
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(result.error || `Login failed (${resp.status})`);
      }

      state.userId = result.userId || result.user || identifier;
      if (result.accessToken) {
        setAccessToken(result.accessToken);
      }

      persistUserId(state.userId);

      const me = await api("/api/admin/me");
      activateAdminView(me);

      $("loginPassword").value = "";

      await loadWorkspaces();
      await refreshAll();
      const savedTab = localStorage.getItem(STORAGE_TAB) || "overview";
      setTab(savedTab);
      persistTab(savedTab);
    } catch (e) {
      setError($("loginError"), e.message);
    }
  });
}

const workspaceSelect = $("workspaceSelect");
if (workspaceSelect) {
  workspaceSelect.addEventListener("change", async () => {
    state.workspaceId = workspaceSelect.value;
    await refreshAll();
  });
}

const btnUpsertWorkspaceEl = $("btnUpsertWorkspace");
if (btnUpsertWorkspaceEl) {
  btnUpsertWorkspaceEl.addEventListener("click", () => {
    showModal({
      title: "Add/Update School (Workspace)",
      bodyHtml: `
      <div class="admin-row">
        <label class="admin-label">Workspace ID (leave empty to create)</label>
        <input class="admin-input" id="ws_id" placeholder="e.g. default or ws_123" />
      </div>
      <div class="admin-row">
        <label class="admin-label">Name</label>
        <input class="admin-input" id="ws_name" placeholder="School Name" />
      </div>
      <div class="admin-row">
        <label class="admin-label">School Code</label>
        <input class="admin-input" id="ws_code" placeholder="SCHOOL-0001" />
      </div>
      <div class="admin-row">
        <label class="admin-label">Status</label>
        <select class="admin-input" id="ws_status">
          <option value="active">active</option>
          <option value="paused">paused</option>
          <option value="archived">archived</option>
        </select>
      </div>
    `,
    footHtml: `<button class="btn btn-primary" id="ws_save">Save</button>`
  });

  const wsSaveEl = document.getElementById("ws_save");
  if (wsSaveEl) {
    wsSaveEl.addEventListener("click", async () => {
      const payload = {
        id: document.getElementById("ws_id").value.trim() || null,
        name: document.getElementById("ws_name").value.trim(),
        schoolCode: document.getElementById("ws_code").value.trim() || null,
        status: document.getElementById("ws_status").value
      };
      try {
        await api("/api/admin/workspaces/upsert", { method: "POST", body: payload });
        closeModal();
        await loadWorkspaces();
        await refreshAll();
      } catch (e) {
        alert(e.message);
      }
    });
  }
  });
}

const btnCreateInvoiceEl = $("btnCreateInvoice");
if (btnCreateInvoiceEl) {
  btnCreateInvoiceEl.addEventListener("click", () => {
    showModal({
      title: "Create Invoice",
    bodyHtml: `
      <div class="admin-row">
        <label class="admin-label">Workspace</label>
        <div class="muted">${escapeHtml(state.workspaceId)}</div>
      </div>
      <div class="admin-row">
        <label class="admin-label">Amount (EUR cents)</label>
        <input class="admin-input" id="inv_amount" placeholder="e.g. 4999" />
      </div>
      <div class="admin-row">
        <label class="admin-label">Description</label>
        <input class="admin-input" id="inv_desc" placeholder="Monthly subscription" />
      </div>
      <div class="admin-row">
        <label class="admin-label">Due date (YYYY-MM-DD)</label>
        <input class="admin-input" id="inv_due" placeholder="2026-03-01" />
      </div>
    `,
    footHtml: `<button class="btn btn-primary" id="inv_save">Create</button>`
  });

    const invSaveEl = document.getElementById("inv_save");
    if (invSaveEl) {
      invSaveEl.addEventListener("click", async () => {
        const amountCents = Number(document.getElementById("inv_amount").value.trim());
        const description = document.getElementById("inv_desc").value.trim();
        const dueDate = document.getElementById("inv_due").value.trim() || null;

        try {
          await api("/api/admin/invoices", {
            method: "POST",
            body: {
              workspaceId: state.workspaceId,
              amountCents,
              currency: "EUR",
              description,
              dueDate
            }
          });
          closeModal();
          await refreshAll();
        } catch (e) {
          alert(e.message);
        }
      });
    }
  });
}

const btnSaveSettingsEl = $("btnSaveSettings");
if (btnSaveSettingsEl) {
  btnSaveSettingsEl.addEventListener("click", async () => {
    setError($("settingsMsg"), "");
  try {
    const raw = $("settingsJson").value.trim() || "{}";
    const parsed = JSON.parse(raw);
    await api(`/api/admin/workspace-settings/${encodeURIComponent(state.workspaceId)}`, {
      method: "PUT",
      body: { settings: parsed }
    });
    setError($("settingsMsg"), "Saved ✅");
  } catch (e) {
    setError($("settingsMsg"), e.message);
  }
  });
}

const schoolSearchEl = $("schoolSearch");
if (schoolSearchEl) {
  schoolSearchEl.addEventListener("input", () => refreshSchools().catch(() => {}));
}
const userSearchEl = $("userSearch");
if (userSearchEl) {
  userSearchEl.addEventListener("input", () => refreshUsers().catch(() => {}));
}

const requestPanel = {
  searchInput: $("reqSearch"),
  sortSelect: $("reqSort"),
  chips: $("reqChips"),
  prevBtn: $("reqPrevPage"),
  nextBtn: $("reqNextPage")
};

if (requestPanel.searchInput) {
  requestPanel.searchInput.addEventListener("input", () => {
    state.requests.q = requestPanel.searchInput.value.trim();
    scheduleRequestRefresh({ reset: true });
  });
}

if (requestPanel.sortSelect) {
  requestPanel.sortSelect.addEventListener("change", () => {
    state.requests.sort = requestPanel.sortSelect.value;
    scheduleRequestRefresh({ reset: true });
  });
}

if (requestPanel.chips) {
  requestPanel.chips.addEventListener("click", (event) => {
    event.preventDefault();
    const chip = event.target.closest(".chip");
    if (!chip) return;
    const status = chip.getAttribute("data-status");
    if (!status || status === state.requests.status) return;
    state.requests.status = status;
    document.querySelectorAll("#reqChips .chip").forEach((c) =>
      c.classList.toggle("is-active", c === chip)
    );
    scheduleRequestRefresh({ reset: true });
  });
}

const bulkPanel = {
  selectAll: $("bulkSelectAll"),
  clear: $("bulkClear"),
  approve: $("bulkApprove"),
  reject: $("bulkReject"),
  flag: $("bulkFlag"),
  export: $("bulkExport")
};

if (bulkPanel.selectAll) {
  bulkPanel.selectAll.addEventListener("click", () => {
    for (const row of state.requests.items) {
      if (row?.id) state.requests.selected.add(row.id);
    }
    updateBulkBar();
  });
}

if (bulkPanel.clear) {
  bulkPanel.clear.addEventListener("click", () => {
    state.requests.selected.clear();
    updateBulkBar();
  });
}

if (bulkPanel.approve) {
  bulkPanel.approve.addEventListener("click", () => bulkAction("approve").catch((e) => alert(e.message)));
}

if (bulkPanel.reject) {
  bulkPanel.reject.addEventListener("click", () => bulkAction("reject").catch((e) => alert(e.message)));
}

if (bulkPanel.flag) {
  bulkPanel.flag.addEventListener("click", () => bulkAction("flag").catch((e) => alert(e.message)));
}

if (bulkPanel.export) {
  bulkPanel.export.addEventListener("click", () => exportRequestsCsv());
}

if (requestPanel.prevBtn) {
  requestPanel.prevBtn.addEventListener("click", () => {
    if (!state.requests.cursorHistory.length) return;
    state.requests.cursor = state.requests.cursorHistory.pop();
    refreshSchoolRequests().catch((e) => setError($("globalError"), e.message));
  });
}

if (requestPanel.nextBtn) {
  requestPanel.nextBtn.addEventListener("click", () => {
    if (!state.requests.nextCursor) return;
    state.requests.cursorHistory.push(state.requests.currentCursor);
    state.requests.cursor = state.requests.nextCursor;
    refreshSchoolRequests().catch((e) => setError($("globalError"), e.message));
  });
}

async function loadWorkspaces() {
  const sel = $("workspaceSelect");
  if (!sel) return;

  const list = await api("/api/admin/workspaces");
  state.workspaces = list || [];

  sel.innerHTML = "";
  sel.insertAdjacentHTML("beforeend", `<option value="all">All workspaces</option>`);

  for (const ws of state.workspaces) {
    sel.insertAdjacentHTML(
      "beforeend",
      `<option value="${escapeHtml(ws.id)}">${escapeHtml(ws.name || ws.id)}</option>`
    );
  }

  // Keep selection if possible
  const desired = state.workspaceId || "all";
  const hasOption = [...sel.options].some((o) => o.value === desired);

  state.workspaceId = hasOption ? desired : "all";
  sel.value = state.workspaceId;

  updateWorkspaceMeta();
}


function updateWorkspaceMeta() {
  const metaEl = $("workspaceMeta");
  const sel = $("workspaceSelect");
  if (!metaEl || !sel) return;

  // If select has no options yet, avoid reading .value
  const selectedValue = sel.value || state.workspaceId || "all";

  const ws = state.workspaces.find((w) => String(w.id) === String(selectedValue));
  const meta = ws
    ? `Code: ${ws.schoolCode || "—"} • Status: ${ws.status || "—"}`
    : selectedValue === "all"
    ? "Showing global view"
    : "Workspace not found";

  metaEl.textContent = meta;
}


async function refreshAll() {
  // Don’t refresh anything if not logged in
  if (!state.userId) return;

  updateWorkspaceMeta();
  setError($("globalError"), "");

  await refreshOverview();
  await refreshSchools();
  await refreshUsers();
  await refreshBilling();
  await refreshSettings();
  await refreshAudit();
  await refreshSchoolRequestCounts();
  await refreshSchoolRequests({ reset: true });
}


async function refreshActiveTab() {
  const tab = state.currentTab || "overview";
  switch (tab) {
    case "overview":
      await refreshOverview().catch(() => {});
      break;
    case "schools":
      await refreshSchools().catch(() => {});
      break;
    case "users":
      await refreshUsers().catch(() => {});
      break;
    case "billing":
      await refreshBilling().catch(() => {});
      break;
    case "settings":
      await refreshSettings().catch(() => {});
      break;
    case "audit":
      await refreshAudit().catch(() => {});
      break;
    case "school-requests":
      await refreshSchoolRequestCounts().catch(() => {});
      await refreshSchoolRequests({ reset: true }).catch(() => {});
      break;
    default:
      await refreshOverview().catch(() => {});
      break;
  }
}

function wireLoginEnter() {
  const u = $("loginUserId");
  const p = $("loginPassword");
  if (!u || !p) return;

  const onKey = (e) => {
    if (e.key === "Enter") $("btnLogin")?.click();
  };
  u.addEventListener("keydown", onKey);
  p.addEventListener("keydown", onKey);
}

wireLoginEnter();
wireKpiNavigation();
wireNavToolHighlight();

async function restoreSessionFromStorage() {
  const savedTab = localStorage.getItem(STORAGE_TAB) || "overview";
  const storedUserId = localStorage.getItem(STORAGE_USER_ID);
  const storedToken = localStorage.getItem(STORAGE_ACCESS_TOKEN);
  if (storedToken) {
    setAccessToken(storedToken);
  }
  if (!storedUserId) {
    setTab(savedTab);
    return;
  }
  state.userId = storedUserId;
  try {
    if (!accessToken) {
      const refresh = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
      if (refresh.ok) {
        const payload = await refresh.json().catch(() => ({}));
        if (payload?.accessToken) {
          setAccessToken(payload.accessToken);
        }
      }
    }
    const me = await api("/api/admin/me");
    activateAdminView(me);
    await loadWorkspaces();
    await refreshAll();
  } catch (error) {
    console.error("Restoring admin session failed", error);
    clearSession();
  }
  setTab(savedTab);
}

async function refreshOverview() {
  const data = await api("/api/admin/overview");
  $("kpiSchools").textContent = data.schools ?? "—";
  $("kpiUsers").textContent = data.users ?? "—";
  $("kpiSubs").textContent = data.activeSubscriptions ?? "—";
  $("kpiOpenInvoices").textContent = data.openInvoices ?? "—";

  const setKpiDelta = (id, value) => {
    const el = $(id);
    if (!el) return;
    if (value || value === 0) {
      el.textContent = `↑ +${value} this week`;
    } else {
      el.textContent = "—";
    }
  };
  setKpiDelta("kpiSchoolsDelta", data.schoolsDelta ?? data.delta?.schools);
  setKpiDelta("kpiUsersDelta", data.usersDelta ?? data.delta?.users);
  setKpiDelta("kpiSubsDelta", data.subscriptionsDelta ?? data.delta?.subscriptions);
  setKpiDelta("kpiOpenInvoicesDelta", data.openInvoicesDelta ?? data.delta?.openInvoices);

  renderTable($("overviewAudit"), {
    columns: [
      { label: "Time", key: "createdAt", width: "180px", render: (r) => escapeHtml(new Date(r.createdAt).toLocaleString()) },
      { label: "Actor", key: "actor", width: "160px", render: (r) => escapeHtml(r.actor || "—") },
      { label: "Action", key: "action", render: (r) => escapeHtml(r.action || "—") },
      { label: "Target", key: "target", render: (r) => escapeHtml(r.target || "—") }
    ],
    rows: data.recentAudit || [],
    emptyText: "No recent audit events."
  });
}

async function refreshSchools() {
  const q = $("schoolSearch").value.trim().toLowerCase();
  const rows = state.workspaces.filter((w) => {
    if (!q) return true;
    return (
      String(w.name || "").toLowerCase().includes(q) ||
      String(w.id || "").toLowerCase().includes(q) ||
      String(w.schoolCode || "").toLowerCase().includes(q)
    );
  });

  renderTable($("schoolsTable"), {
    columns: [
      { label: "ID", key: "id", width: "170px", render: (r) => `<code>${escapeHtml(r.id)}</code>` },
      { label: "Name", key: "name", render: (r) => escapeHtml(r.name || "—") },
      { label: "Code", key: "schoolCode", width: "140px", render: (r) => escapeHtml(r.schoolCode || "—") },
      { label: "Status", key: "status", width: "120px", render: (r) => escapeHtml(r.status || "—") },
      {
        label: "Actions",
        key: "_actions",
        width: "140px",
        render: (r) =>
          r.id === "default"
            ? `<span class="muted">Protected</span>`
            : `<button class="btn btn-danger" data-action="delete-workspace" data-id="${escapeHtml(r.id)}">Delete</button>`
      }
    ],
    rows
  });

  $("schoolsTable")
    .querySelectorAll("button[data-action='delete-workspace']")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const workspaceId = btn.getAttribute("data-id");
        showModal({
          title: "Delete workspace",
          bodyHtml: `
            <p>Deleting <strong>${escapeHtml(workspaceId)}</strong> removes all associated channels, users, and data. This cannot be undone.</p>
            <p class="muted">Please export what you need before continuing.</p>
            <div class="admin-row">
              <label class="admin-label">Type the workspace ID to confirm</label>
              <input class="admin-input" id="confirm_workspace_name" placeholder="${escapeHtml(workspaceId)}" />
            </div>
          `,
          footHtml: `
            <button class="btn btn-ghost" id="cancel_delete_workspace">Cancel</button>
            <button class="btn btn-danger" id="confirm_delete_workspace" disabled>Delete workspace</button>
          `
        });

        const cancelBtn = document.getElementById("cancel_delete_workspace");
        const confirmBtn = document.getElementById("confirm_delete_workspace");
        const confirmInput = document.getElementById("confirm_workspace_name");

        cancelBtn?.addEventListener("click", closeModal);
        if (confirmInput && confirmBtn) {
          const validate = () => {
            confirmBtn.disabled = confirmInput.value.trim() !== workspaceId;
          };
          confirmInput.addEventListener("input", validate);
          validate();
        }

        confirmBtn?.addEventListener("click", async () => {
          try {
            await api(`/api/admin/workspaces/${encodeURIComponent(workspaceId)}`, {
              method: "DELETE"
            });
            closeModal();
            await loadWorkspaces();
            await refreshAll();
          } catch (error) {
            alert(error.message);
          }
        });
      });
    });
}

async function refreshUsers() {
  const q = $("userSearch").value.trim().toLowerCase();
  const ws = state.workspaceId;
  const data = await api(`/api/admin/users?workspaceId=${encodeURIComponent(ws)}`);
  const rows = (data || []).filter((u) => {
    if (!q) return true;
    return (
      String(u.name || "").toLowerCase().includes(q) ||
      String(u.email || "").toLowerCase().includes(q) ||
      String(u.username || "").toLowerCase().includes(q)
    );
  });
  const displayRows = [...rows];
  if (state.me) {
    const selfIndex = displayRows.findIndex((r) => r.id === state.me.id);
    const base = selfIndex >= 0 ? (displayRows[selfIndex] || {}) : {};

    const myRow = {
      ...base,
      id: state.me.id,
      name: state.me.name || base.name || "—",
      email: state.me.email || base.email || "—",
      role: state.me.role || base.role || "super_admin",
      displayRole: state.me.displayRole,
      status: (state.me.status || base.status || "active").toLowerCase()
    };

    if (selfIndex >= 0) displayRows[selfIndex] = myRow; else displayRows.unshift(myRow);
  }

  renderTable($("usersTable"), {
    columns: [
      {
        label: "",
        key: "_select",
        width: "44px",
        render: () => `<span class="table-row-select" aria-hidden="true"></span>`
      },
      { label: "ID", key: "id", width: "160px", render: (r) => `<code>${escapeHtml(r.id)}</code>` },
      { label: "Name", key: "name", render: (r) => escapeHtml(r.name || "—") },
      { label: "Email", key: "email", render: (r) => escapeHtml(r.email || "—") },
      { label: "Role", key: "role", width: "120px", render: (r) => escapeHtml(r.displayRole || r.role || "—") },
      {
        label: "Status",
        key: "status_display",
        width: "120px",
        render: (r) => {
          const status = (r.status || "active").toLowerCase();
          const label = status === "disabled" ? "Disabled" : "Active";
          return `<span class="user-status user-status-${status}">${escapeHtml(label)}</span>`;
        }
      },
      {
        label: "Activate / Deactivate",
        key: "_status_toggle",
        width: "180px",
        render: (r) => {
          const status = (r.status || "active").toLowerCase();
          const isActive = status === "active";
          const nextStatus = isActive ? "disabled" : "active";
          const label = isActive ? "Deactivate" : "Activate";
          const isSelfRow = state.me && state.me.id === r.id;
          const btnClass = isSelfRow ? "btn btn-ghost" : isActive ? "btn btn-ghost" : "btn btn-secondary";
          const disabledAttr = isSelfRow ? 'disabled title="Protected super admin account"' : "";
          return `<button class="${btnClass}" data-action="toggle-status" data-id="${escapeHtml(
            r.id
          )}" data-status="${nextStatus}" ${disabledAttr}>${label}</button>`;
        }
      },
      {
        label: "Actions",
        key: "_actions",
        width: "210px",
        render: (r) => `
          <button class="btn btn-secondary" data-action="make-admin" data-id="${escapeHtml(r.id)}">Set role…</button>
        `
      },
      {
        label: "Delete",
        key: "_delete",
        width: "140px",
      render: (r) => {
        const isSelfRow = state.me && state.me.id === r.id;
        const disabledAttr = isSelfRow ? 'disabled title="Protected super admin account"' : "";
        return `
          <button class="btn btn-danger" data-action="delete-user" data-id="${escapeHtml(r.id)}" ${disabledAttr}>Delete</button>
        `;
      }
    }
    ],
    rows: displayRows
  });

  // actions
  $("usersTable").querySelectorAll("button[data-action='make-admin']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      showModal({
        title: "Update user role",
        bodyHtml: `
          <div class="admin-row">
            <label class="admin-label">User</label>
            <div><code>${escapeHtml(id)}</code></div>
          </div>
          <div class="admin-row">
            <label class="admin-label">Role</label>
            <select class="admin-input" id="new_role">
              <option value="student">student</option>
              <option value="teacher">teacher</option>
              <option value="school_admin">school_admin</option>
              <option value="admin">admin</option>
              <option value="super_admin">super_admin</option>
            </select>
          </div>
          <div class="admin-row">
            <label class="admin-label">Status</label>
            <select class="admin-input" id="new_status">
              <option value="active">active</option>
              <option value="disabled">disabled</option>
            </select>
          </div>
        `,
        footHtml: `<button class="btn btn-primary" id="save_user">Save</button>`
      });

      const saveUserBtn = document.getElementById("save_user");
      if (saveUserBtn) {
        saveUserBtn.addEventListener("click", async () => {
          const roleInput = document.getElementById("new_role");
          const statusInput = document.getElementById("new_status");
          if (!roleInput || !statusInput) {
            alert("Missing form fields.");
            return;
          }
          try {
            await api(`/api/admin/users/${encodeURIComponent(id)}`, {
              method: "PATCH",
              body: {
                role: roleInput.value,
                status: statusInput.value
              }
            });
            closeModal();
            await refreshUsers();
          } catch (e) {
            alert(e.message);
          }
        });
      }
    });
  });

  $("usersTable")
    .querySelectorAll("button[data-action='toggle-status']")
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (btn.disabled) return;
        const id = btn.getAttribute("data-id");
        const targetStatus = btn.getAttribute("data-status");
        if (!id || !targetStatus) return;
        try {
          await api(`/api/admin/users/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: { status: targetStatus }
          });
          await refreshUsers();
        } catch (error) {
          alert(error.message);
        }
      });
    });

  $("usersTable")
    .querySelectorAll("button[data-action='delete-user']")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        const id = btn.getAttribute("data-id");
        if (!id) return;
        showModal({
          title: "Delete user",
          bodyHtml: `
            <p>Deleting <strong>${escapeHtml(id)}</strong> removes the user and all workspace links.</p>
            <div class="admin-row">
              <label class="admin-label">Type the user ID to confirm</label>
              <input class="admin-input" id="confirm_delete_user_id" placeholder="${escapeHtml(id)}" />
            </div>
          `,
          footHtml: `
            <button class="btn btn-ghost" id="cancel_delete_user">Cancel</button>
            <button class="btn btn-danger" id="confirm_delete_user" disabled>Delete user</button>
          `
        });

        const cancelBtn = document.getElementById("cancel_delete_user");
        const confirmBtn = document.getElementById("confirm_delete_user");
        const confirmInput = document.getElementById("confirm_delete_user_id");

        cancelBtn?.addEventListener("click", closeModal);

        if (confirmInput && confirmBtn) {
          const validate = () => {
            confirmBtn.disabled = confirmInput.value.trim() !== id;
          };
          confirmInput.addEventListener("input", validate);
          validate();
        }

        confirmBtn?.addEventListener("click", async () => {
          try {
            await api(`/api/admin/users/${encodeURIComponent(id)}`, {
              method: "DELETE"
            });
            closeModal();
            await refreshUsers();
          } catch (error) {
            alert(error.message);
          }
        });
      });
    });

  await refreshApprovedMissingWorkspaces();
}

async function refreshApprovedMissingWorkspaces() {
  const el = $("approvedMissingTable");
  if (!el) return;

  const rows = await api("/api/admin/approved-requests-missing-workspace");

  renderTable(el, {
    columns: [
      {
        label: "Approved at",
        key: "reviewedAt",
        width: "180px",
        render: (r) => escapeHtml(new Date(r.reviewedAt || r.createdAt).toLocaleString())
      },
      {
        label: "School",
        key: "school",
        render: (r) => escapeHtml(getSchoolName(r.data) || "—")
      },
      { label: "Email", key: "email", render: (r) => escapeHtml(r.email || "—") },
      {
        label: "Workspace slug",
        key: "slug",
        width: "220px",
        render: (r) => escapeHtml(getWorkspaceSlug(r.data) || "—")
      },
      {
        label: "Status",
        key: "st",
        width: "120px",
        render: () => `<span class="badge approved">approved</span>`
      },
      {
        label: "Actions",
        key: "_a",
        width: "180px",
        render: (r) => `<button class="btn btn-primary" data-createws="${escapeHtml(r.id)}">Create workspace</button>`
      }
    ],
    rows,
    emptyText: "No approved requests waiting for workspace creation."
  });

  el.querySelectorAll("button[data-createws]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-createws");
      try {
        const payload = await api(`/api/admin/school-requests/${encodeURIComponent(id)}/create-workspace`, {
          method: "POST",
          body: {}
        });
        showModal({
          title: "Workspace created",
          bodyHtml: `
            <div><strong>Workspace:</strong> ${escapeHtml(payload.workspaceId)}</div>
            <div><strong>Admin email:</strong> ${escapeHtml(payload.adminEmail)}</div>
            <div><strong>Temporary password:</strong> <code>${escapeHtml(payload.tempPassword || "(existing user)")}</code></div>
            <div>
              <strong>Email:</strong>
              ${payload.emailSent
                ? `<span style="color:#16a34a">✅ Sent via <strong>${escapeHtml(payload.emailProvider || "provider")}</strong></span>`
                : `<span style="color:#dc2626">❌ Not sent (${escapeHtml(payload.emailError || "unknown error")})</span>`}
            </div>
            <p class="muted">The temporary password was emailed to the school admin. They should change it after first login.</p>
          `,
          footHtml: `<button class="btn btn-primary" id="okClose">Done</button>`
        });
        const okCloseBtn = $("okClose");
        if (okCloseBtn) {
          okCloseBtn.addEventListener("click", closeModal);
        }
        await refreshSchools();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function refreshBilling() {
  const ws = state.workspaceId;
  const data = await api(`/api/admin/billing/${encodeURIComponent(ws)}`);

  renderTable($("invoicesTable"), {
    columns: [
      { label: "Invoice", key: "id", width: "140px", render: (r) => `<code>${escapeHtml(r.id)}</code>` },
      { label: "Amount", key: "amountCents", width: "140px", render: (r) => escapeHtml(moneyEUR(r.amountCents)) },
      { label: "Status", key: "status", width: "110px", render: (r) => escapeHtml(r.status) },
      { label: "Due", key: "dueDate", width: "120px", render: (r) => escapeHtml(r.dueDate || "—") },
      {
        label: "Action",
        key: "_a",
        width: "160px",
        render: (r) =>
          r.status === "paid"
            ? `<span class="muted">—</span>`
            : `<button class="btn btn-secondary" data-action="mark-paid" data-id="${escapeHtml(r.id)}">Mark paid</button>`
      }
    ],
    rows: data.invoices || [],
    emptyText: "No invoices."
  });

  $("invoicesTable").querySelectorAll("button[data-action='mark-paid']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const invoiceId = btn.getAttribute("data-id");
      try {
        await api(`/api/admin/invoices/${encodeURIComponent(invoiceId)}/mark-paid`, {
          method: "POST",
          body: { workspaceId: state.workspaceId }
        });
        await refreshBilling();
        await refreshOverview();
      } catch (e) {
        alert(e.message);
      }
    });
  });

  renderTable($("paymentsTable"), {
    columns: [
      { label: "Payment", key: "id", width: "140px", render: (r) => `<code>${escapeHtml(r.id)}</code>` },
      { label: "Invoice", key: "invoiceId", width: "140px", render: (r) => `<code>${escapeHtml(r.invoiceId)}</code>` },
      { label: "Amount", key: "amountCents", width: "140px", render: (r) => escapeHtml(moneyEUR(r.amountCents)) },
      { label: "Provider", key: "provider", width: "110px", render: (r) => escapeHtml(r.provider || "manual") },
      { label: "Time", key: "createdAt", render: (r) => escapeHtml(new Date(r.createdAt).toLocaleString()) }
    ],
    rows: data.payments || [],
    emptyText: "No payments."
  });
}

async function refreshSettings() {
  const ws = state.workspaceId;
  if (ws === "all") {
    $("settingsJson").value = JSON.stringify({ note: "Select a specific workspace to edit settings." }, null, 2);
    return;
  }
  const data = await api(`/api/admin/workspace-settings/${encodeURIComponent(ws)}`);
  $("settingsJson").value = JSON.stringify(data.settings || {}, null, 2);
}

async function refreshAudit() {
  const ws = state.workspaceId;
  const data = await api(`/api/admin/audit?workspaceId=${encodeURIComponent(ws)}`);
  renderTable($("auditTable"), {
    columns: [
      { label: "Time", key: "createdAt", width: "180px", render: (r) => escapeHtml(new Date(r.createdAt).toLocaleString()) },
      { label: "Workspace", key: "workspaceId", width: "140px", render: (r) => escapeHtml(r.workspaceId || "—") },
      { label: "Actor", key: "actor", width: "160px", render: (r) => escapeHtml(r.actor || "—") },
      { label: "Action", key: "action", render: (r) => escapeHtml(r.action || "—") },
      { label: "Target", key: "target", render: (r) => escapeHtml(r.target || "—") }
    ],
    rows: data || [],
    emptyText: "No audit rows."
  });
}

async function refreshSchoolRequestCounts() {
  if (!$("c_pending")) return;
  try {
    const counts = await api("/api/admin/requests/counts");
    state.requests.counts = {
      pending: counts.pending ?? 0,
      approved: counts.approved ?? 0,
      rejected: counts.rejected ?? 0,
      flagged: counts.flagged ?? 0,
      all: counts.all ?? 0
    };
    updateChipCounts(state.requests.counts);
    return state.requests.counts;
  } catch (error) {
    console.warn("refreshSchoolRequestCounts failed", error);
    return state.requests.counts;
  }
}

function resetRequestPagination({ clearSelection = false } = {}) {
  state.requests.cursor = null;
  state.requests.currentCursor = null;
  state.requests.nextCursor = null;
  state.requests.cursorHistory = [];
  if (clearSelection) {
    state.requests.selected.clear();
    updateBulkBar();
  }
}

function scheduleRequestRefresh({ reset = false } = {}) {
  if (reset) {
    resetRequestPagination({ clearSelection: true });
  }
  if (requestSearchTimer) clearTimeout(requestSearchTimer);
  requestSearchTimer = setTimeout(() => {
    requestSearchTimer = null;
    refreshSchoolRequests().catch((e) => setError($("globalError"), e.message));
  }, REQUESTS_DEBOUNCE_MS);
}

function updateRequestPagination({ pageSize = 0, hasNext = false } = {}) {
  const infoEl = $("reqPageInfo");
  const hintEl = $("reqPageHint");
  const pageNumber = state.requests.cursorHistory.length + 1;
  if (infoEl) {
    infoEl.textContent = `Page ${pageNumber} · ${pageSize} row${pageSize === 1 ? "" : "s"}`;
  }
  if (hintEl) {
    hintEl.textContent = hasNext ? "More results available" : "End of results";
  }
  if (requestPanel.prevBtn) requestPanel.prevBtn.disabled = state.requests.cursorHistory.length === 0;
  if (requestPanel.nextBtn) requestPanel.nextBtn.disabled = !hasNext;
}

async function refreshSchoolRequests({ reset = false } = {}) {
  if (reset) {
    resetRequestPagination({ clearSelection: true });
  }
  const tableEl = $("requestsTable");
  if (!tableEl) return;

  const status = state.requests.status || "pending";
  const search = state.requests.q || "";
  const sort = state.requests.sort || "new";
  const limit = Number(state.requests.limit) || 25;
  const STATUS_OPTIONS = ["pending", "approved", "rejected", "flagged"];
  const STATUS_LABELS = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    flagged: "Flagged"
  };
  const STATUS_ACTIONS = {
    approved: "approve",
    rejected: "reject",
    flagged: "flag"
  };

  const params = new URLSearchParams({
    status,
    sort,
    limit: String(limit)
  });
  if (search) params.set("search", search);
  if (state.requests.cursor) params.set("cursor", state.requests.cursor);

  const renderStatusSelect = (row) => {
    const current = String(row.status || "pending").toLowerCase();
    const reason = (row.reviewNote || row.reason || "").trim();
    const options = STATUS_OPTIONS.map(
      (opt) =>
        `<option value="${opt}"${opt === current ? " selected" : ""}>${STATUS_LABELS[opt]}</option>`
    ).join("");
    return `
      <div class="status-cell"${reason ? ` title="${escapeHtml(reason)}"` : ""}>
        <select class="req-status-select" data-id="${escapeHtml(row.id)}" data-status="${escapeHtml(current)}">
          ${options}
        </select>
        ${
          current === "rejected" && reason
            ? `<span class="status-note" title="${escapeHtml(reason)}">!</span>`
            : ""
        }
      </div>
    `;
  };

  state.requests.loading = true;
  tableEl.innerHTML = `<div class="muted" style="padding:16px">Loading school requests…</div>`;

  try {
    const payload = await api(`/api/admin/requests?${params.toString()}`);
    const rows = Array.isArray(payload?.items) ? payload.items : [];
    state.requests.items = rows;
    state.requests.nextCursor = payload?.nextCursor || null;
    state.requests.currentCursor = state.requests.cursor;
    if (payload?.counts) {
      state.requests.counts = {
        pending: payload.counts.pending ?? 0,
        approved: payload.counts.approved ?? 0,
        rejected: payload.counts.rejected ?? 0,
        flagged: payload.counts.flagged ?? 0,
        all: payload.counts.all ?? 0
      };
      updateChipCounts(state.requests.counts);
    }

    renderTable(tableEl, {
      columns: [
        {
          label: "",
          key: "_sel",
          width: "42px",
          render: (r) => `
            <input type="checkbox" data-sel="${escapeHtml(r.id)}" ${state.requests.selected.has(r.id) ? "checked" : ""} />
          `
        },
        { label: "Created", key: "createdAt", width: "180px", render: (r) => escapeHtml(new Date(r.createdAt).toLocaleString()) },
        {
          label: "School",
          key: "school",
          render: (r) => {
            const name = getSchoolName(r.data) || "—";
            const dup = duplicateHints(rows, r);
            return `${escapeHtml(name)} ${dup}`;
          }
        },
        { label: "Email", key: "email", render: (r) => escapeHtml(r.email || "—") },
        { label: "Phone", key: "phone", width: "160px", render: (r) => escapeHtml(getPhone(r.data) || "—") },
        { label: "Status", key: "status", width: "150px", render: (r) => renderStatusSelect(r) },
        {
          label: "Actions",
          key: "_a",
          width: "320px",
          render: (r) => {
            const isPending = String(r.status).toLowerCase() === "pending";
            const isFlagged = String(r.status).toLowerCase() === "flagged";

            const approveBtn = isPending ? `<button class="btn btn-primary" data-approve="${escapeHtml(r.id)}">Approve</button>` : "";
            const rejectBtn = isPending ? `<button class="btn btn-ghost" data-reject="${escapeHtml(r.id)}">Reject</button>` : "";
            const flagBtn = (isPending || isFlagged) ? `<button class="btn btn-ghost" data-flag="${escapeHtml(r.id)}">Flag</button>` : "";

            return `
              <div class="req-actions">
                <button class="btn btn-ghost" data-view="${escapeHtml(r.id)}">View</button>
                ${approveBtn}
                ${rejectBtn}
                ${flagBtn}
              </div>
            `;
          }
        }
      ],
      rows,
      emptyText: "No school requests."
    });

    tableEl.querySelectorAll("input[data-sel]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const id = cb.getAttribute("data-sel");
        if (cb.checked) state.requests.selected.add(id);
        else state.requests.selected.delete(id);
        updateBulkBar();
      });
    });

    tableEl.querySelectorAll(".req-status-select").forEach((select) => {
      select.addEventListener("change", (event) => {
        const target = event.currentTarget;
        const id = target.getAttribute("data-id");
        const oldStatus = target.getAttribute("data-status");
        const newStatus = target.value;
        if (newStatus === oldStatus) return;
        const action = STATUS_ACTIONS[newStatus];
        if (!action) {
          target.value = oldStatus;
          return;
        }
        target.disabled = true;
        target.value = oldStatus;
        actionModal(action, id)
          .catch((err) => setError($("globalError"), err.message))
          .finally(() => {
            target.disabled = false;
          });
      });
    });

    const openDetails = (id) => {
      const r = rows.find((x) => String(x.id) === id);
      if (!r) return;
      const d = r.data || {};
      const raw = JSON.stringify(d, null, 2);
      showModal({
        title: "School request details",
        bodyHtml: `
          <div class="admin-row">
            <div><b>School:</b> ${escapeHtml(getSchoolName(d) || "—")}</div>
            <div><b>Email:</b> ${escapeHtml(r.email || "—")}</div>
            <div><b>Phone:</b> ${escapeHtml(getPhone(d) || "—")}</div>
            <div><b>Contact:</b> ${escapeHtml(getContact(d) || "—")}</div>
            <div><b>Address:</b> ${escapeHtml(getAddress(d) || "—")}</div>
            <div><b>City/Country:</b> ${escapeHtml(`${getCity(d) || "—"} / ${getCountry(d) || "—"}`)}</div>
            <div><b>Workspace slug:</b> ${escapeHtml(getWorkspaceSlug(d) || "—")}</div>
            <div><b>Status:</b> ${badge(r.status)}</div>
            <div><b>Internal note:</b> ${escapeHtml(r.reviewNote || "—")}</div>
          </div>
          <hr class="admin-hr" />
          <details>
            <summary><b>Raw JSON</b></summary>
            <pre style="white-space:pre-wrap;margin:10px 0 0 0">${escapeHtml(raw)}</pre>
          </details>
        `,
        footHtml: `<button class="btn btn-ghost" id="modalCloseBtn">Close</button>`
      });
      const modalCloseBtnElm = $("modalCloseBtn");
      if (modalCloseBtnElm) {
        modalCloseBtnElm.addEventListener("click", closeModal);
      }
    };

    async function actionModal(action, id) {
      const pretty = action === "approve" ? "Approve" : action === "reject" ? "Reject" : "Flag";
      showModal({
        title: `${pretty} request`,
        bodyHtml: `
          <div class="admin-row">
            <div class="muted">You are about to <b>${pretty.toLowerCase()}</b> this request.</div>
          </div>
          <div class="admin-row">
            <label class="admin-label">Internal note (optional)</label>
            <textarea class="admin-input admin-textarea" id="noteText" style="min-height:140px"></textarea>
          </div>
        `,
        footHtml: `
          <button class="btn btn-ghost" id="actCancel">Cancel</button>
          <button class="btn btn-primary" id="actConfirm">${pretty}</button>
        `
      });

      const actCancelBtn = $("actCancel");
      if (actCancelBtn) {
        actCancelBtn.addEventListener("click", closeModal);
      }
      const actConfirmBtn = $("actConfirm");
      if (actConfirmBtn) {
        actConfirmBtn.addEventListener("click", async () => {
          const noteTextarea = $("noteText");
          if (!noteTextarea) return;
          const note = noteTextarea.value.trim();
          await api(`/api/admin/school-requests/${encodeURIComponent(id)}/${action}`, {
            method: "POST",
            body: { note }
          });
          closeModal();
          state.requests.selected.delete(id);
          updateBulkBar();
          await refreshSchoolRequestCounts();
          await refreshSchoolRequests();
        });
      }
    }

    const handleClick = (event) => {
      const btn = event.target.closest("button");
      if (!btn) return;
      if (btn.dataset.view) {
        openDetails(btn.dataset.view);
        return;
      }
      if (btn.dataset.approve) {
        actionModal("approve", btn.dataset.approve).catch((e) => alert(e.message));
        return;
      }
      if (btn.dataset.reject) {
        actionModal("reject", btn.dataset.reject).catch((e) => alert(e.message));
        return;
      }
      if (btn.dataset.flag) {
        actionModal("flag", btn.dataset.flag).catch((e) => alert(e.message));
      }
    };

    if (tableEl._schoolRequestHandler) {
      tableEl.removeEventListener("click", tableEl._schoolRequestHandler);
    }
    tableEl._schoolRequestHandler = handleClick;
    tableEl.addEventListener("click", handleClick);

    updateBulkBar();
    updateRequestPagination({ pageSize: rows.length, hasNext: Boolean(state.requests.nextCursor) });
  } catch (err) {
    tableEl.innerHTML = `<div class="muted" style="padding:16px">Failed to load school requests. ${escapeHtml(err.message)}</div>`;
    throw err;
  } finally {
    state.requests.loading = false;
  }
}

async function downloadRequestsCsv({ ids } = {}) {
  const headers = {};
  const opts = {
    method: ids ? "POST" : "GET",
    credentials: "same-origin",
    headers: { ...headers }
  };
  let url = "/api/admin/requests/export.csv";
  if (ids && ids.length) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify({ ids });
  } else {
    const params = new URLSearchParams({
      status: state.requests.status || "pending",
      sort: state.requests.sort || "new"
    });
    if (state.requests.q) params.set("search", state.requests.q);
    url = `${url}?${params.toString()}`;
  }
  const resp = await fetch(url, opts);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || `Export failed (${resp.status})`);
  }
  const csvText = await resp.text();
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const statusLabel = state.requests.status || "pending";
  a.download = ids && ids.length
    ? `school_requests_selected_${Date.now()}.csv`
    : `school_requests_${statusLabel}_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function exportRequestsCsv() {
  const ids = [...state.requests.selected];
  if (ids.length) {
    showModal({
      title: "Export CSV",
      bodyHtml: `
        <p class="muted">Export ${ids.length} selected requests or the current filter (status: <strong>${escapeHtml(state.requests.status)}</strong>).</p>
      `,
      footHtml: `
        <button class="btn btn-ghost" id="exportCancel">Cancel</button>
        <button class="btn btn-secondary" id="exportFilter">Export filtered</button>
        <button class="btn btn-primary" id="exportSelected">Export selected (${ids.length})</button>
      `
    });
    $("exportCancel")?.addEventListener("click", closeModal);
    $("exportFilter")?.addEventListener("click", async () => {
      closeModal();
      try {
        await downloadRequestsCsv();
      } catch (err) {
        alert(err.message);
      }
    });
    $("exportSelected")?.addEventListener("click", async () => {
      closeModal();
      try {
        await downloadRequestsCsv({ ids });
      } catch (err) {
        alert(err.message);
      }
    });
    return;
  }
  downloadRequestsCsv().catch((err) => alert(err.message));
}

function updateChipCounts(counts = {}) {
  ["pending", "approved", "rejected", "flagged", "all"].forEach((status) => {
    const countEl = $(`c_${status}`);
    if (countEl) {
      countEl.textContent = String(counts[status] ?? 0);
    }
  });
}

function badge(status) {
  const s = String(status || "").toLowerCase();
  return `<span class="badge ${escapeHtml(s || "unknown")}">${escapeHtml(s || "—")}</span>`;
}

function requestForm(data) {
  return data?.form || data || {};
}

function getSchoolName(data) {
  const form = requestForm(data);
  return (
    data?.schoolName ||
    data?.school_name ||
    data?.school ||
    data?.name ||
    form?.schoolName ||
    form?.workspaceName ||
    form?.school ||
    form?.name ||
    form?.workspace_id ||
    ""
  );
}

function getPhone(data) {
  const form = requestForm(data);
  const phone = form?.phone || form?.mobile || form?.phoneNumber || data?.phone || data?.mobile;
  const prefix = form?.countryCode || data?.countryCode || "";
  return prefix && phone ? `${prefix} ${phone}` : phone || "";
}

function getCity(data) {
  const form = requestForm(data);
  return form?.city || form?.locationCity || data?.city || data?.locationCity || "";
}

function getCountry(data) {
  const form = requestForm(data);
  return form?.country || form?.locationCountry || data?.country || data?.locationCountry || "";
}

function getAddress(data) {
  const form = requestForm(data);
  return form?.street || form?.address || data?.address || "";
}

function getContact(data) {
  const form = requestForm(data);
  return (
    form?.contactPerson ||
    form?.contact_name ||
    form?.adminName ||
    form?.contact ||
    data?.contactPerson ||
    data?.contact ||
    ""
  );
}

function getWorkspaceSlug(data) {
  const form = requestForm(data);
  return (
    form?.workspaceSlug ||
    form?.workspace_id ||
    form?.workspace ||
    data?.workspaceSlug ||
    data?.workspace_id ||
    data?.workspace ||
    ""
  );
}

function duplicateHints(rows, row) {
  const email = String(row.email || "").toLowerCase();
  const phone = String(getPhone(row.data) || "").toLowerCase();
  const school = String(getSchoolName(row.data) || "").toLowerCase();

  let dupEmail = 0,
    dupPhone = 0,
    dupSchool = 0;
  for (const r of rows) {
    if (r.id === row.id) continue;
    if (email && String(r.email || "").toLowerCase() === email) dupEmail++;
    if (phone && String(getPhone(r.data) || "").toLowerCase() === phone) dupPhone++;
    if (school && String(getSchoolName(r.data) || "").toLowerCase() === school) dupSchool++;
  }

  const parts = [];
  if (dupEmail) parts.push(`same email ×${dupEmail}`);
  if (dupPhone) parts.push(`same phone ×${dupPhone}`);
  if (dupSchool) parts.push(`same school ×${dupSchool}`);

  if (!parts.length) return "";
  const title = parts.join(" • ");
  return `<span class="warn" title="${escapeHtml(title)}">!</span>`;
}

function updateBulkBar() {
  const bar = $("bulkbar");
  if (!bar) return;
  const count = state.requests.selected.size;
  const countEl = $("bulkCount");
  if (countEl) {
    countEl.textContent = String(count);
  }
  bar.hidden = count === 0;
}

async function bulkAction(action) {
  const ids = [...state.requests.selected];
  if (!ids.length) {
    alert("Select at least one request.");
    return;
  }

  const prettyAction = action === "approve" ? "Approve" : action === "reject" ? "Reject" : "Flag";
  showModal({
    title: `${prettyAction} ${ids.length} request(s)`,
    bodyHtml: `
      <div class="admin-row">
        <div class="muted">This will set status to <b>${prettyAction.toLowerCase()}</b> for selected requests.</div>
      </div>
      <div class="admin-row">
        <label class="admin-label">Internal note (optional)</label>
        <textarea class="admin-input admin-textarea" id="bulk_note" style="min-height:140px"></textarea>
      </div>
    `,
    footHtml: `
      <button class="btn btn-ghost" id="bulkCancel">Cancel</button>
      <button class="btn btn-primary" id="bulkConfirm">${prettyAction}</button>
    `
  });

  $("bulkCancel")?.addEventListener("click", closeModal);
  $("bulkConfirm")?.addEventListener("click", async () => {
    const note = $("bulk_note")?.value.trim();
    await api(`/api/admin/requests/bulk`, {
      method: "POST",
      body: { action, ids, note }
    });
    closeModal();
    state.requests.selected.clear();
    updateBulkBar();
    await refreshSchoolRequestCounts();
    await refreshSchoolRequests();
  });
}


function showSchoolRequestDetails(row) {
  const data = row.data || {};
  const schoolLabel = getSchoolName(data) || "—";
  const email = row.email || data?.email || "—";
  const phone = getPhone(data) || "—";
  const note = row.reviewNote || "—";
  const bodyHtml = `
    <div class="detail-row"><strong>School:</strong> ${escapeHtml(schoolLabel)}</div>
    <div class="detail-row"><strong>Email:</strong> ${escapeHtml(email)}</div>
    <div class="detail-row"><strong>Phone:</strong> ${escapeHtml(phone)}</div>
    <div class="detail-row"><strong>Address:</strong> ${escapeHtml(getAddress(data) || "—")}</div>
    <div class="detail-row"><strong>City:</strong> ${escapeHtml(getCity(data) || "—")}</div>
    <div class="detail-row"><strong>Country:</strong> ${escapeHtml(getCountry(data) || "—")}</div>
    <div class="detail-row"><strong>Contact:</strong> ${escapeHtml(getContact(data) || "—")}</div>
    <div class="detail-row"><strong>Workspace slug:</strong> ${escapeHtml(getWorkspaceSlug(data) || "—")}</div>
    <div class="detail-row"><strong>Status:</strong> ${badge(row.status)}</div>
    <div class="detail-row"><strong>Internal note:</strong> ${escapeHtml(note)}</div>
    <div class="detail-row">
      <strong>Raw payload:</strong>
      <pre>${escapeHtml(JSON.stringify(row.data || {}, null, 2))}</pre>
    </div>`;
  showModal({
    title: `School request #${row.id}`,
    bodyHtml,
    footHtml: `<button class="btn btn-ghost" onclick="closeModal()">Close</button>`
  });
}
 

// initial view
(async () => {
  await restoreSessionFromStorage();
})();

(function () {
  const sidebar = document.getElementById("adminSidebar");
  const toggleBtn = document.getElementById("sidebarToggle");
  const mobileBtn = document.getElementById("mobileNavBtn");
  const backdrop = document.getElementById("sidebarBackdrop");

  const notifBadge = document.getElementById("notifBadge");
  const reqPendingBadge = document.getElementById("reqPendingBadge");

  const KEY_SIDEBAR = "studis_admin_sidebar"; // "expanded" | "collapsed"

  if (!sidebar) return;

  function setSidebarExpanded(expanded) {
    sidebar.classList.toggle("is-expanded", expanded);
    sidebar.classList.toggle("is-collapsed", !expanded);
    localStorage.setItem(KEY_SIDEBAR, expanded ? "expanded" : "collapsed");
  }

  const saved = localStorage.getItem(KEY_SIDEBAR);
  setSidebarExpanded(saved === "expanded");

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const expanded = sidebar.classList.contains("is-expanded");
      setSidebarExpanded(!expanded);
    });
  }

  let lastFocused = null;

  const getFocusable = () =>
    [...sidebar.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((el) => el.offsetParent !== null);

  const trapKeydown = (e) => {
    if (e.key === "Escape") {
      closeMobile();
      return;
    }
    if (e.key !== "Tab") return;

    const focusables = getFocusable();
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const openMobile = () => {
    lastFocused = document.activeElement;
    sidebar.classList.add("is-mobile-open");
    if (backdrop) backdrop.hidden = false;
    document.body.style.overflow = "hidden";

    setTimeout(() => {
      const focusables = getFocusable();
      (focusables[0] || sidebar).focus?.();
    }, 0);

    window.addEventListener("keydown", trapKeydown, true);
  };

  const closeMobile = () => {
    sidebar.classList.remove("is-mobile-open");
    if (backdrop) backdrop.hidden = true;
    document.body.style.overflow = "";

    window.removeEventListener("keydown", trapKeydown, true);

    if (mobileBtn) mobileBtn.focus();
    else if (lastFocused && lastFocused.focus) lastFocused.focus();
  };

  if (mobileBtn) mobileBtn.addEventListener("click", openMobile);
  if (backdrop) backdrop.addEventListener("click", closeMobile);

  sidebar.addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (tab && sidebar.classList.contains("is-mobile-open")) closeMobile();
  });

  let touchStartX = null;
  sidebar.addEventListener("touchstart", (e) => {
    if (e.touches.length) touchStartX = e.touches[0].clientX;
  });
  sidebar.addEventListener("touchmove", (e) => {
    if (touchStartX === null) return;
    const delta = e.touches[0].clientX - touchStartX;
    if (sidebar.classList.contains("is-mobile-open") && delta < -40) {
      closeMobile();
    }
  });
  sidebar.addEventListener("touchend", () => {
    touchStartX = null;
  });

  window.setNotifBadge = function (value) {
    if (!notifBadge) return;
    notifBadge.classList.remove("is-dot");

    if (value === "dot") {
      notifBadge.textContent = "";
      notifBadge.hidden = false;
      notifBadge.classList.add("is-dot");
      return;
    }

    const n = Number(value || 0);
    if (!n) {
      notifBadge.hidden = true;
      notifBadge.textContent = "0";
      return;
    }
    notifBadge.hidden = false;
    notifBadge.textContent = n > 99 ? "99+" : String(n);
  };

  window.setRequestsPendingBadge = function (pending) {
    if (!reqPendingBadge) return;
    const n = Number(pending || 0);
    if (n <= 0) {
      reqPendingBadge.hidden = true;
      reqPendingBadge.textContent = "0";
      return;
    }
    reqPendingBadge.hidden = false;
    reqPendingBadge.textContent = n > 99 ? "99+" : String(n);
  };

  const pendingChipCount = document.getElementById("c_pending");
  if (pendingChipCount) {
    const syncPending = () => {
      const val = pendingChipCount.textContent || "0";
      window.setRequestsPendingBadge(val);
    };
    const mo = new MutationObserver(syncPending);
    mo.observe(pendingChipCount, { childList: true, characterData: true, subtree: true });
    syncPending();
  }
})();
