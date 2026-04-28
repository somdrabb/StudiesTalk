
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
  audit: {
    q: "",
    type: "all",
    sort: "new",
    rows: []
  },
  billing: {
    status: "all",
    invoices: [],
    payments: []
  },
  legal: {
    settings: null,
    versions: [],
    publishRequirements: []
  },
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

let settingsEditorSnapshot = {};

const REQUESTS_DEBOUNCE_MS = 320;
let requestSearchTimer = null;
const LEGAL_DOCUMENT_TYPES = ["privacy", "terms", "impressum", "cookies", "dpa"];
const LEGAL_PANEL_FIELD_IDS = [
  "legal_company_name",
  "legal_operator_name",
  "legal_address",
  "legal_email",
  "legal_phone",
  "legal_vat_id",
  "legal_tax_number",
  "legal_business_registration",
  "legal_responsible_person",
  "legal_supervisory_authority",
  "legal_hosting_provider",
  "legal_video_provider",
  "legal_ai_provider",
  "legal_email_provider",
  "legal_sms_provider",
  "legal_storage_provider",
  "legal_analytics_provider",
  "legal_recording_retention_days",
  "legal_security_log_retention_days",
  "legal_backup_retention_days",
  "legal_learning_data_retention_months",
  "legal_support_email",
  "legal_privacy_email",
  "legal_liability_text",
  "legal_sla_text",
  "legal_gdpr_dpa_text",
  "legal_ai_notice_text",
  "legal_recording_notice_text",
  "legal_cookie_notice_text",
  "legal_locale_default"
];

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
  legal: {
    title: "Legal / Compliance",
    subtitle: "Published legal settings, document versions, and acceptance readiness."
  },
  audit: {
    title: "Audit log",
    subtitle: "Track every admin action."
  },
  "school-requests": {
    title: "School requests",
    subtitle: "Review new schools waiting for approval."
  },
  messages: {
    title: "Messages",
    subtitle: "Manage inbox, outgoing email, and communication settings."
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
  if (!el) return;
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

  const modal = $("modal");
  const titleEl = $("modalTitle");
  const bodyEl = $("modalBody");
  const footEl = $("modalFoot");

  if (!modal || !titleEl || !bodyEl || !footEl) return;

  titleEl.textContent = title || "Modal";
  bodyEl.innerHTML = bodyHtml || "";
  footEl.innerHTML = footHtml || "";
  modal.hidden = false;
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

$("btnResetJson")?.addEventListener("click", async () => {
  try {
    await refreshSettings();
    const status = $("settingsSaveStatus");
    const error = $("settingsError");
    if (status) status.textContent = "Editor reset to saved version.";
    if (error) {
      error.textContent = "";
      error.hidden = true;
    }
  } catch (e) {
    const error = $("settingsError");
    if (error) {
      error.textContent = e.message;
      error.hidden = false;
    }
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

async function refreshMessages() {
  setText("messagesInboxCount", 0);
  setText("messagesSentCount", 0);
  setText("messagesFailedCount", 0);
  setText("messagesTemplateCount", 0);
  setText("messagesTableMeta", "0 rows");

  const table = $("messagesActivityTable");
  if (table) {
    table.innerHTML = `<div class="muted" style="padding:14px;">No message activity loaded yet.</div>`;
  }
}

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
    const error = new Error(msg);
    error.status = resp.status;
    throw error;
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
        refreshActiveTab().catch(() => { });
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
// Start-Create Invoice POPUP Card // Billing-Section- INPU-1
const btnCreateInvoiceEl = $("btnCreateInvoice");
if (btnCreateInvoiceEl) {
  btnCreateInvoiceEl.addEventListener("click", () => {
    const workspaceOptions = [
      `<option value="">Select workspace</option>`,
      ...(state.workspaces || []).map(
        (ws) =>
          `<option value="${escapeHtml(ws.id)}" ${
            state.workspaceId === ws.id ? "selected" : ""
          }>${escapeHtml(ws.name || ws.id)}</option>`
      )
    ].join("");

    showModal({
      title: "Create Invoice",
      bodyHtml: `
        <div class="invoice-modal">
          <div class="invoice-modal-hero">
            <div class="invoice-modal-icon">
              <i class="fa-solid fa-file-invoice-dollar" aria-hidden="true"></i>
            </div>
            <div>
              <h3>Create a new invoice</h3>
              <p class="muted">Create a billing record for a workspace and set the due date.</p>
            </div>
          </div>

          <div class="invoice-form-grid">
            <div class="invoice-field invoice-field-full">
              <label class="invoice-label" for="inv_workspace">Workspace</label>
              <select class="input invoice-input" id="inv_workspace">
                ${workspaceOptions}
              </select>
              <div class="invoice-help">Choose which school or workspace will receive this invoice.</div>
            </div>

            <div class="invoice-field">
              <label class="invoice-label" for="inv_amount">Amount (EUR cents)</label>
              <input
                class="input invoice-input"
                id="inv_amount"
                type="number"
                min="1"
                step="1"
                placeholder="4999"
              />
              <div class="invoice-help">Example: 4999 = €49.99</div>
            </div>

            <div class="invoice-field">
              <label class="invoice-label" for="inv_due">Due date</label>
              <input
                class="input invoice-input"
                id="inv_due"
                type="date"
              />
              <div class="invoice-help">Select when payment should be due.</div>
            </div>

            <div class="invoice-field invoice-field-full">
              <label class="invoice-label" for="inv_desc">Description</label>
              <input
                class="input invoice-input"
                id="inv_desc"
                placeholder="Monthly subscription"
              />
              <div class="invoice-help">Short billing note shown internally or on the invoice.</div>
            </div>
          </div>

          <div class="invoice-inline-note">
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
            <span>Invoices are created in EUR and will appear immediately in the billing panel.</span>
          </div>
        </div>
      `,
      footHtml: `
        <button class="btn btn-ghost" type="button" id="inv_cancel">Cancel</button>
        <button class="btn btn-primary" type="button" id="inv_save">
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
          <span>Create invoice</span>
        </button>
      `
    });

    $("inv_cancel")?.addEventListener("click", closeModal);

    const invSaveEl = $("inv_save");
    if (invSaveEl) {
      invSaveEl.addEventListener("click", async () => {
        const workspaceId = $("inv_workspace")?.value.trim() || state.workspaceId;
        const amountCents = Number($("inv_amount")?.value.trim());
        const description = $("inv_desc")?.value.trim();
        const dueDate = $("inv_due")?.value.trim() || null;

        if (!workspaceId) {
          alert("Please select a workspace.");
          return;
        }

        if (!amountCents || amountCents <= 0) {
          alert("Please enter a valid amount.");
          return;
        }

        if (!description) {
          alert("Please enter a description.");
          return;
        }

        try {
          await api("/api/admin/invoices", {
            method: "POST",
            body: {
              workspaceId,
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
// End-Create Invoice POPUP Card // Billing-Section- INPU-1

$("msgGoEmailSettingsPage")?.addEventListener("click", () => {
  setTab("settings");
  persistTab("settings");
});

$("msgGoEmailSettingsPageTop")?.addEventListener("click", () => {
  setTab("settings");
  persistTab("settings");
});

$("msgOpenInboxPage")?.addEventListener("click", () => {
  alert("Inbox page is not built yet.");
});

$("msgOpenSentPage")?.addEventListener("click", () => {
  alert("Sent mail page is not built yet.");
});

$("msgOpenFailedPage")?.addEventListener("click", () => {
  alert("Failed mail page is not built yet.");
});

$("btnMessagesRefresh")?.addEventListener("click", () => {
  alert("Messages refresh is not connected yet.");
});
$("btnCreateInvoiceTop")?.addEventListener("click", () => {
  $("btnCreateInvoice")?.click();
});

$("btnExportBilling")?.addEventListener("click", () => {
  const payload = {
    workspaceId: state.workspaceId,
    exportedAt: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8"
  });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `billing-export-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
});

$("billingStatusFilter")?.addEventListener("change", (e) => {
  state.billing.status = e.target.value || "all";
  refreshBilling().catch((err) => setError($("globalError"), err.message));
});

$("billingWorkspaceFilter")?.addEventListener("change", async (e) => {
  state.workspaceId = e.target.value || "all";
  const globalWorkspaceSelect = $("workspaceSelect");
  if (globalWorkspaceSelect) globalWorkspaceSelect.value = state.workspaceId;
  updateWorkspaceMeta();
  await refreshAll();
});

$("btnOwnerEmailSettings")?.addEventListener("click", () => {
  openOwnerEmailSettingsModal().catch((err) => alert(err.message));
});

const schoolSearchEl = $("schoolSearch");
if (schoolSearchEl) {
  schoolSearchEl.addEventListener("input", () => refreshSchools().catch(() => { }));
}

const userSearchEl = $("userSearch");
if (userSearchEl) {
  userSearchEl.addEventListener("input", () => refreshUsers().catch(() => { }));
}

/* ===== Audit filters ===== */
$("auditSearch")?.addEventListener("input", (e) => {
  state.audit.q = e.target.value || "";
  applyAuditFilters();
});

$("auditActionFilter")?.addEventListener("change", (e) => {
  state.audit.type = e.target.value || "all";
  applyAuditFilters();
});

$("auditSort")?.addEventListener("change", (e) => {
  state.audit.sort = e.target.value || "new";
  applyAuditFilters();
});

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
  const billingSel = $("billingWorkspaceFilter");

  const list = await api("/api/admin/workspaces");
  state.workspaces = list || [];

  sel.innerHTML = "";
  sel.insertAdjacentHTML("beforeend", `<option value="all">All workspaces</option>`);
  if (billingSel) {
    billingSel.innerHTML = "";
    billingSel.insertAdjacentHTML("beforeend", `<option value="all">All workspaces</option>`);
  }

  for (const ws of state.workspaces) {
    const option = `<option value="${escapeHtml(ws.id)}">${escapeHtml(ws.name || ws.id)}</option>`;
    sel.insertAdjacentHTML("beforeend", option);
    billingSel?.insertAdjacentHTML("beforeend", option);
  }

  // Keep selection if possible
  const desired = state.workspaceId || "all";
  const hasOption = [...sel.options].some((o) => o.value === desired);

  state.workspaceId = hasOption ? desired : "all";
  sel.value = state.workspaceId;
  if (billingSel) billingSel.value = state.workspaceId;

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
  const billingSel = $("billingWorkspaceFilter");
  if (billingSel && billingSel.value !== selectedValue) {
    billingSel.value = selectedValue;
  }
}


async function refreshAll() {
  if (!state.userId) return;

  updateWorkspaceMeta();
  setError($("globalError"), "");

  await refreshOverview();
  await refreshSchools();
  await refreshApprovedMissingWorkspaces();
  await refreshUsers();
  await refreshBilling();
  await refreshMessages();
  await refreshSettings();
  await refreshLegalPanel();
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
    case "messages":
      await refreshMessages().catch(() => {});
      break;
    case "schools":
      await refreshSchools().catch(() => {});
      await refreshApprovedMissingWorkspaces().catch(() => {});
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
    case "legal":
      await refreshLegalPanel().catch(() => {});
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

$("btnResetJson")?.addEventListener("click", async () => {
  try {
    await refreshSettings();
    const status = $("settingsSaveStatus");
    const error = $("settingsError");
    if (status) status.textContent = "Editor reset to saved version.";
    if (error) {
      error.textContent = "";
      error.hidden = true;
    }
  } catch (e) {
    const error = $("settingsError");
    if (error) {
      error.textContent = e.message;
      error.hidden = false;
    }
  }
});

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
wireOverviewActions();

async function refreshAccessToken() {
  const refresh = await fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" });
  if (!refresh.ok) return false;

  const payload = await refresh.json().catch(() => ({}));
  if (payload?.accessToken) {
    setAccessToken(payload.accessToken);
  }
  return true;
}

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
    let me;
    try {
      me = await api("/api/admin/me");
    } catch (error) {
      if (error.status !== 401 || !(await refreshAccessToken())) {
        throw error;
      }
      me = await api("/api/admin/me");
    }
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
  const [overview, requestsCounts, auditRows, billingData] = await Promise.all([
    api("/api/admin/overview").catch(() => ({})),
    api("/api/admin/requests/counts").catch(() => ({})),
    api(`/api/admin/audit?workspaceId=${encodeURIComponent(state.workspaceId || "all")}`).catch(() => []),
    api(`/api/admin/billing/${encodeURIComponent(state.workspaceId || "all")}`).catch(() => ({ invoices: [], payments: [] }))
  ]);

  /* ---------- Main KPI cards ---------- */
  setText("kpiSchools", overview.schools ?? "—");
  setText("kpiUsers", overview.users ?? "—");
  setText("kpiSubs", overview.activeSubscriptions ?? "—");
  setText("kpiOpenInvoices", overview.openInvoices ?? "—");

  const setKpiDelta = (id, value) => {
    const el = $(id);
    if (!el) return;
    el.textContent = value || value === 0 ? `↑ +${value} this week` : "—";
  };

  setKpiDelta("kpiSchoolsDelta", overview.schoolsDelta ?? overview.delta?.schools);
  setKpiDelta("kpiUsersDelta", overview.usersDelta ?? overview.delta?.users);
  setKpiDelta("kpiSubsDelta", overview.subscriptionsDelta ?? overview.delta?.subscriptions);
  setKpiDelta("kpiOpenInvoicesDelta", overview.openInvoicesDelta ?? overview.delta?.openInvoices);

  /* ---------- Platform health ---------- */
  setHealthCard("healthDb", "Healthy", "Connected and responsive", "good");

  const failedEmails = Number(overview.failedEmailsToday ?? 0);
  setHealthCard(
    "healthEmail",
    failedEmails > 0 ? "Attention" : "Healthy",
    failedEmails > 0 ? `${failedEmails} failed email(s) today` : "Outbound delivery normal",
    failedEmails > 0 ? "warn" : "good"
  );

  const aiUsed = Number(overview.aiUsedEur ?? 0);
  const aiCap = Number(overview.aiCapEur ?? 0);
  const aiNearLimit = aiCap > 0 && aiUsed >= aiCap * 0.8;
  setHealthCard(
    "healthAi",
    aiNearLimit ? "Watch" : "Healthy",
    aiCap > 0 ? `${formatEUR(aiUsed)} / ${formatEUR(aiCap)} used` : "Usage within limits",
    aiNearLimit ? "warn" : "good"
  );

  const otpIssues = Number(overview.otpIssuesToday ?? 0);
  setHealthCard(
    "healthOtp",
    otpIssues > 0 ? "Watch" : "Healthy",
    otpIssues > 0 ? `${otpIssues} OTP issue(s) today` : "Verification service available",
    otpIssues > 0 ? "warn" : "good"
  );

  const backupText = overview.lastBackupAt
    ? `Last backup: ${formatAdminTimestamp(overview.lastBackupAt)}`
    : "Last backup: —";

  setHealthCard(
    "healthBackup",
    overview.lastBackupAt ? "Available" : "Check",
    backupText,
    overview.lastBackupAt ? "good" : "warn"
  );

  const pendingCount = Number(requestsCounts.pending ?? 0);
  setHealthCard(
    "healthRequest",
    String(pendingCount),
    "Pending school approvals",
    pendingCount > 0 ? "warn" : "neutral"
  );

  /* ---------- Needs attention ---------- */
  const attentionItems = [];

  if (pendingCount > 0) {
    attentionItems.push({
      tone: "warn",
      icon: "fa-inbox",
      title: `${pendingCount} pending school request${pendingCount === 1 ? "" : "s"}`,
      meta: "Review and approve new schools waiting for activation."
    });
  }

  const openInvoices = Number(overview.openInvoices ?? 0);
  if (openInvoices > 0) {
    attentionItems.push({
      tone: "warn",
      icon: "fa-file-invoice-dollar",
      title: `${openInvoices} open invoice${openInvoices === 1 ? "" : "s"}`,
      meta: "Billing items still unpaid or waiting for action."
    });
  }

  if (failedEmails > 0) {
    attentionItems.push({
      tone: "danger",
      icon: "fa-envelope-circle-xmark",
      title: `${failedEmails} failed email${failedEmails === 1 ? "" : "s"} today`,
      meta: "Check outbound email delivery and retry failed operations."
    });
  }

  const highRiskAudit = Array.isArray(auditRows)
    ? auditRows.filter((row) => getAuditRisk(row.action || "") === "high").length
    : 0;

  if (highRiskAudit > 0) {
    attentionItems.push({
      tone: "danger",
      icon: "fa-triangle-exclamation",
      title: `${highRiskAudit} high-risk audit event${highRiskAudit === 1 ? "" : "s"}`,
      meta: "Recent deletes or destructive actions need review."
    });
  }

  if (attentionItems.length === 0) {
    attentionItems.push({
      tone: "success",
      icon: "fa-circle-check",
      title: "Platform looks stable",
      meta: "No urgent owner-level action detected from current signals."
    });
  }

  renderOverviewAttention(attentionItems);

  /* ---------- Top workspaces ---------- */
  const workspaceRows = [...(state.workspaces || [])]
    .map((ws) => {
      const signal = ws.status === "active" ? "Active workspace" : `Status: ${ws.status || "—"}`;
      return {
        ...ws,
        activityScore:
          (String(ws.status || "").toLowerCase() === "active" ? 10 : 0) +
          (ws.schoolCode ? 3 : 0),
        signal
      };
    })
    .sort((a, b) => Number(b.activityScore || 0) - Number(a.activityScore || 0))
    .slice(0, 6);

  renderTopWorkspaces(workspaceRows);

  /* ---------- Recent platform activity ---------- */
  renderTable($("overviewAudit"), {
    columns: [
      {
        label: "Time",
        key: "createdAt",
        width: "180px",
        render: (r) => escapeHtml(formatAdminTimestamp(r.createdAt))
      },
      {
        label: "Workspace",
        key: "workspaceId",
        width: "170px",
        render: (r) => escapeHtml(r.workspaceId || "—")
      },
      {
        label: "Actor",
        key: "actor",
        width: "150px",
        render: (r) => escapeHtml(r.actor || "—")
      },
      {
        label: "Action",
        key: "action",
        width: "260px",
        render: (r) => `
          <span class="audit-action-tag">
            <i class="fa-solid ${getAuditActionIcon(r.action || "")}" aria-hidden="true"></i>
            <span>${escapeHtml(r.action || "—")}</span>
          </span>
        `
      },
      {
        label: "Risk",
        key: "_risk",
        width: "110px",
        render: (r) => getAuditRiskBadge(r.action || "")
      },
      {
        label: "Target",
        key: "target",
        width: "140px",
        render: (r) => escapeHtml(r.target || "—")
      }
    ],
    rows: Array.isArray(auditRows) ? auditRows.slice(0, 12) : [],
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

  const total = rows.length;
  const approved = rows.filter((w) => String(w.status || "").toLowerCase() === "approved").length;
  const protectedCount = rows.filter((w) => w.id === "default").length;

  setText("schoolsSummaryTotal", total);
  setText("schoolsSummaryApproved", approved);
  setText("schoolsSummaryProtected", protectedCount);
  setText("schoolsTableMeta", `${total} school${total === 1 ? "" : "s"}`);

  renderTable($("schoolsTable"), {
    columns: [
      {
        label: "School",
        key: "name",
        width: "360px",
        render: (r) => `
          <div class="school-primary">
            <div class="school-primary-title">${escapeHtml(r.name || "—")}</div>
            <div class="school-primary-sub">${escapeHtml(r.id || "—")}</div>
          </div>
        `
      },
      {
        label: "Code",
        key: "schoolCode",
        width: "160px",
        render: (r) =>
          r.schoolCode
            ? `<span class="school-code-badge">${escapeHtml(r.schoolCode)}</span>`
            : `<span class="school-code-missing">Missing code</span>`
      },
      {
        label: "Status",
        key: "status",
        width: "140px",
        render: (r) => {
          const status = String(r.status || "unknown").toLowerCase();
          const cls =
            status === "approved" ? "school-status-approved"
              : status === "paused" || status === "archived" ? "school-status-paused"
                : "school-status-other";

          return `<span class="school-status-badge ${cls}">${escapeHtml(status)}</span>`;
        }
      },
      {
        label: "Type",
        key: "_type",
        width: "140px",
        render: (r) =>
          r.id === "default"
            ? `<span class="school-tag is-system">System</span>`
            : `<span class="school-tag">Customer</span>`
      },
      {
        label: "Actions",
        key: "_actions",
        width: "220px",
        render: (r) =>
          r.id === "default"
            ? `<span class="school-protected"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Protected</span>`
            : `
              <div class="school-actions">
                <button class="school-btn-manage" data-action="manage-workspace" data-id="${escapeHtml(r.id)}">Manage</button>
                <button class="school-btn-danger" data-action="delete-workspace" data-id="${escapeHtml(r.id)}">Delete</button>
              </div>
            `
      }
    ],
    rows,
    emptyText: "No schools found."
  });

  $("schoolsTable")
    .querySelectorAll("button[data-action='manage-workspace']")
    .forEach((btn) => {
      btn.addEventListener("click", async () => {
        const workspaceId = btn.getAttribute("data-id");
        state.workspaceId = workspaceId;
        const workspaceSelectEl = $("workspaceSelect");
        if (workspaceSelectEl) workspaceSelectEl.value = workspaceId;
        updateWorkspaceMeta();
        setTab("settings");
        persistTab("settings");
        await refreshActiveTab().catch((e) => setError($("globalError"), e.message));
      });
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

  
}

async function refreshApprovedMissingWorkspaces() {
  const el = $("approvedMissingTable");
  if (!el) return;

  const rows = await api("/api/admin/approved-requests-missing-workspace");
  setText("schoolsSummaryPendingCreation", rows.length);
  setText("approvedMissingMeta", `${rows.length} pending creation`);

  renderTable(el, {
    columns: [
      {
        label: "Approved at",
        key: "reviewedAt",
        width: "180px",
        render: (r) => `<span class="approved-request-time">${escapeHtml(formatAdminTimestamp(r.reviewedAt || r.createdAt))}</span>`
      },
      {
        label: "School",
        key: "school",
        render: (r) => `
          <div class="approved-request-primary">
            <div class="approved-request-primary-title">${escapeHtml(getSchoolName(r.data) || "—")}</div>
            <div class="approved-request-primary-sub">${escapeHtml(r.email || "—")}</div>
          </div>
        `
      },
      {
        label: "Workspace slug",
        key: "slug",
        width: "220px",
        render: (r) => `<span class="school-slug-badge">${escapeHtml(getWorkspaceSlug(r.data) || "—")}</span>`
      },
      {
        label: "Status",
        key: "st",
        width: "120px",
        render: () => `<span class="school-status-badge school-status-approved">approved</span>`
      },
      {
        label: "Actions",
        key: "_a",
        width: "220px",
        render: (r) => `
          <div class="school-actions">
            <button class="school-btn-create" data-createws="${escapeHtml(r.id)}">
              <i class="fa-solid fa-plus" aria-hidden="true"></i>
              <span>Create workspace</span>
            </button>
          </div>
        `
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

        $("okClose")?.addEventListener("click", closeModal);

        await refreshSchools();
        await refreshApprovedMissingWorkspaces();
        await refreshUsers();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function refreshBilling() {
  const ws = state.workspaceId;
  const data = await api(`/api/admin/billing/${encodeURIComponent(ws)}`);

  const invoices = data.invoices || [];
  const payments = data.payments || [];
  state.billing.invoices = invoices;
  state.billing.payments = payments;

  const now = Date.now();

  const openInvoices = invoices.filter((row) => String(row.status || "").toLowerCase() !== "paid");
  const overdueInvoices = openInvoices.filter((row) => {
    if (!row.dueDate) return false;
    const due = new Date(row.dueDate).getTime();
    return !Number.isNaN(due) && due < now;
  });

  const collectedAmount = payments.reduce((sum, row) => sum + Number(row.amountCents || 0), 0);

  setText("billingOpenInvoicesCount", openInvoices.length);
  setText("billingOverdueCount", overdueInvoices.length);
  setText("billingCollectedAmount", moneyEUR(collectedAmount));
  setText("billingPaymentsCount", payments.length);
  setText("billingInvoicesMeta", `${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`);
  setText("billingPaymentsMeta", `${payments.length} payment${payments.length === 1 ? "" : "s"}`);

  const attentionItems = [];

  if (overdueInvoices.length > 0) {
    attentionItems.push({
      tone: "danger",
      title: `${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? "" : "s"}`,
      meta: "These invoices are past due and need follow-up."
    });
  }

  if (openInvoices.length > 0) {
    attentionItems.push({
      tone: "warn",
      title: `${openInvoices.length} open invoice${openInvoices.length === 1 ? "" : "s"}`,
      meta: "There are unpaid billing items waiting for action."
    });
  }

  if (payments.length === 0) {
    attentionItems.push({
      tone: "info",
      title: "No payments recorded yet",
      meta: "Once invoices are paid, they will appear here."
    });
  }

  const attentionEl = $("billingAttentionList");
  if (attentionEl) {
    attentionEl.innerHTML = attentionItems.length
      ? attentionItems.map((item) => `
          <div class="billing-attention-item is-${item.tone}">
            <div class="billing-attention-icon">
              <i class="fa-solid ${item.tone === "danger" ? "fa-triangle-exclamation"
          : item.tone === "warn" ? "fa-clock"
            : "fa-circle-info"
        }" aria-hidden="true"></i>
            </div>
            <div class="billing-attention-content">
              <div class="billing-attention-title">${escapeHtml(item.title)}</div>
              <div class="billing-attention-meta">${escapeHtml(item.meta)}</div>
            </div>
          </div>
        `).join("")
      : `
        <div class="billing-attention-item is-info">
          <div class="billing-attention-icon">
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          </div>
          <div class="billing-attention-content">
            <div class="billing-attention-title">No billing alerts yet</div>
            <div class="billing-attention-meta">Once invoices and payments exist, this area will show follow-up actions.</div>
          </div>
        </div>
      `;
  }

  renderTable($("invoicesTable"), {
    columns: [
      {
        label: "Invoice",
        key: "id",
        width: "180px",
        render: (r) => `
          <div class="billing-id">${escapeHtml(r.id || "—")}</div>
        `
      },
      {
        label: "Amount",
        key: "amountCents",
        width: "140px",
        render: (r) => `<span class="billing-amount">${escapeHtml(moneyEUR(r.amountCents))}</span>`
      },
      {
        label: "Status",
        key: "status",
        width: "120px",
        render: (r) => {
          const status = String(r.status || "unknown").toLowerCase();
          const cls =
            status === "paid" ? "billing-status-paid"
              : status === "open" ? "billing-status-open"
                : status === "void" ? "billing-status-void"
                  : "billing-status-other";

          return `<span class="billing-status-badge ${cls}">${escapeHtml(status)}</span>`;
        }
      },
      {
        label: "Due",
        key: "dueDate",
        width: "140px",
        render: (r) => {
          if (!r.dueDate) return "—";
          const dueTs = new Date(r.dueDate).getTime();
          const overdue = !Number.isNaN(dueTs) && dueTs < now && String(r.status || "").toLowerCase() !== "paid";
          return `<span class="${overdue ? "billing-due-overdue" : ""}">${escapeHtml(r.dueDate)}</span>`;
        }
      },
      {
        label: "Action",
        key: "_a",
        width: "160px",
        render: (r) =>
          String(r.status || "").toLowerCase() === "paid"
            ? `<span class="muted">Paid</span>`
            : `<button class="btn btn-secondary" data-action="mark-paid" data-id="${escapeHtml(r.id)}">Mark paid</button>`
      }
    ],
    rows: invoices,
    emptyText: "No invoices created yet."
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
      {
        label: "Payment",
        key: "id",
        width: "180px",
        render: (r) => `<div class="billing-id">${escapeHtml(r.id || "—")}</div>`
      },
      {
        label: "Invoice",
        key: "invoiceId",
        width: "180px",
        render: (r) => `<div class="billing-id">${escapeHtml(r.invoiceId || "—")}</div>`
      },
      {
        label: "Amount",
        key: "amountCents",
        width: "140px",
        render: (r) => `<span class="billing-amount">${escapeHtml(moneyEUR(r.amountCents))}</span>`
      },
      {
        label: "Provider",
        key: "provider",
        width: "120px",
        render: (r) => escapeHtml(r.provider || "manual")
      },
      {
        label: "Paid at",
        key: "createdAt",
        render: (r) => escapeHtml(formatAdminTimestamp(r.createdAt))
      }
    ],
    rows: payments,
    emptyText: "No payments recorded yet."
  });
}

function updateWorkspaceWarning() {
  const warning = $("settingsWorkspaceWarning");

  if (!warning) return;

  if (!state.workspaceId || state.workspaceId === "all") {
    warning.style.display = "block";
  } else {
    warning.style.display = "none";
  }
}

function cloneSettingsObject(value) {
  try {
    return JSON.parse(JSON.stringify(value && typeof value === "object" ? value : {}));
  } catch {
    return {};
  }
}

function normalizeLegalSettings(legal = {}, fallbackCompanyName = "") {
  const source = legal && typeof legal === "object" ? legal : {};
  const providers = source.providers && typeof source.providers === "object" ? source.providers : {};
  const read = (value) => (typeof value === "string" ? value : "");
  return {
    company_name: read(source.company_name) || fallbackCompanyName || "",
    address: read(source.address),
    email: read(source.email),
    phone: read(source.phone),
    vat_id: read(source.vat_id),
    providers: {
      hosting: read(providers.hosting),
      video: read(providers.video),
      ai: read(providers.ai),
      email: read(providers.email),
      sms: read(providers.sms),
      storage: read(providers.storage)
    },
    retention: read(source.retention),
    liability: read(source.liability)
  };
}

function getSettingsWorkspaceName() {
  const ws = state.workspaceId;
  const selected = (state.workspaces || []).find((workspace) => String(workspace.id) === String(ws));
  return selected?.name || (ws && ws !== "all" ? ws : "");
}

function writeSettingsJson(settings = {}) {
  const editor = $("settingsJson");
  if (!editor) return;
  const snapshot = cloneSettingsObject(settings);
  settingsEditorSnapshot = snapshot;
  editor.value = JSON.stringify(snapshot, null, 2);
}

function loadLegalSettings(settings = {}) {
  const legal = normalizeLegalSettings(settings.legal || {}, getSettingsWorkspaceName());
  const fields = {
    legal_company: legal.company_name,
    legal_address: legal.address,
    legal_email: legal.email,
    legal_phone: legal.phone,
    legal_vat: legal.vat_id,
    legal_hosting: legal.providers.hosting,
    legal_ai: legal.providers.ai,
    legal_email_provider: legal.providers.email,
    legal_storage: legal.providers.storage,
    legal_retention: legal.retention,
    legal_liability: legal.liability
  };
  Object.entries(fields).forEach(([id, value]) => {
    const node = $(id);
    if (node) node.value = value || "";
  });
}

function buildLegalSettingsFromForm() {
  return {
    company_name: ($("legal_company")?.value || "").trim(),
    address: ($("legal_address")?.value || "").trim(),
    email: ($("legal_email")?.value || "").trim(),
    phone: ($("legal_phone")?.value || "").trim(),
    vat_id: ($("legal_vat")?.value || "").trim(),
    providers: {
      hosting: ($("legal_hosting")?.value || "").trim(),
      video: "",
      ai: ($("legal_ai")?.value || "").trim(),
      email: ($("legal_email_provider")?.value || "").trim(),
      sms: "",
      storage: ($("legal_storage")?.value || "").trim()
    },
    retention: ($("legal_retention")?.value || "").trim(),
    liability: ($("legal_liability")?.value || "").trim()
  };
}

function mergeLegalSettingsIntoEditor() {
  const error = $("settingsError");
  let baseSettings = cloneSettingsObject(settingsEditorSnapshot);
  const editor = $("settingsJson");
  if (editor) {
    try {
      baseSettings = JSON.parse(editor.value || "{}");
    } catch (_err) {}
  }
  baseSettings.legal = buildLegalSettingsFromForm();
  writeSettingsJson(baseSettings);
  if (error) {
    error.textContent = "";
    error.hidden = true;
  }
}

async function refreshSettings() {
  const ws = state.workspaceId;
  const status = $("settingsSaveStatus");
  const error = $("settingsError");
  const workspaceName = $("settingsWorkspaceName");

  if (status) status.textContent = "";
  if (error) {
    error.textContent = "";
    error.hidden = true;
  }
  if (workspaceName) {
    workspaceName.textContent = ws === "all" ? "All workspaces" : getSettingsWorkspaceName() || "No workspace selected";
  }
  updateWorkspaceWarning();

  if (ws === "all") {
    writeSettingsJson({ note: "Select a specific workspace to edit settings." });
    loadLegalSettings({});
    if (status) status.textContent = "Select a workspace before saving.";
    return;
  }
  const data = await api(`/api/admin/workspace-settings/${encodeURIComponent(ws)}`);
  writeSettingsJson(data.settings || {});
  loadLegalSettings(data.settings || {});
}

function showLegalStatus(message = "", tone = "info") {
  const node = $("legalSaveStatus");
  if (!node) return;
  node.textContent = message;
  node.hidden = !message;
  node.style.color = tone === "error" ? "#991b1b" : tone === "success" ? "#166534" : "#475569";
}

function normalizeLegalAdminSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  return {
    company_name: source.company_name || "",
    operator_name: source.operator_name || "",
    legal_address: source.legal_address || "",
    legal_email: source.legal_email || "",
    phone: source.phone || "",
    vat_id: source.vat_id || "",
    tax_number: source.tax_number || "",
    business_registration: source.business_registration || "",
    responsible_person: source.responsible_person || "",
    supervisory_authority: source.supervisory_authority || "",
    hosting_provider: source.hosting_provider || "",
    video_provider: source.video_provider || "",
    ai_provider: source.ai_provider || "",
    email_provider: source.email_provider || "",
    sms_provider: source.sms_provider || "",
    storage_provider: source.storage_provider || "",
    analytics_provider: source.analytics_provider || "",
    recording_retention_days: source.recording_retention_days ?? "",
    security_log_retention_days: source.security_log_retention_days ?? "",
    backup_retention_days: source.backup_retention_days ?? "",
    learning_data_retention_months: source.learning_data_retention_months ?? "",
    support_email: source.support_email || "",
    privacy_email: source.privacy_email || "",
    terms_version: source.terms_version || "",
    privacy_version: source.privacy_version || "",
    impressum_version: source.impressum_version || "",
    liability_text: source.liability_text || "",
    sla_text: source.sla_text || "",
    gdpr_dpa_text: source.gdpr_dpa_text || "",
    ai_notice_text: source.ai_notice_text || "",
    recording_notice_text: source.recording_notice_text || "",
    cookie_notice_text: source.cookie_notice_text || "",
    locale_default: source.locale_default || "en",
    is_published: !!source.is_published,
    published_at: source.published_at || "",
    updated_at: source.updated_at || ""
  };
}

function collectLegalPanelSettings() {
  return normalizeLegalAdminSettings({
    company_name: $("legal_company_name")?.value.trim() || "",
    operator_name: $("legal_operator_name")?.value.trim() || "",
    legal_address: $("legal_address")?.value.trim() || "",
    legal_email: $("legal_email")?.value.trim() || "",
    phone: $("legal_phone")?.value.trim() || "",
    vat_id: $("legal_vat_id")?.value.trim() || "",
    tax_number: $("legal_tax_number")?.value.trim() || "",
    business_registration: $("legal_business_registration")?.value.trim() || "",
    responsible_person: $("legal_responsible_person")?.value.trim() || "",
    supervisory_authority: $("legal_supervisory_authority")?.value.trim() || "",
    hosting_provider: $("legal_hosting_provider")?.value.trim() || "",
    video_provider: $("legal_video_provider")?.value.trim() || "",
    ai_provider: $("legal_ai_provider")?.value.trim() || "",
    email_provider: $("legal_email_provider")?.value.trim() || "",
    sms_provider: $("legal_sms_provider")?.value.trim() || "",
    storage_provider: $("legal_storage_provider")?.value.trim() || "",
    analytics_provider: $("legal_analytics_provider")?.value.trim() || "",
    recording_retention_days: $("legal_recording_retention_days")?.value || "",
    security_log_retention_days: $("legal_security_log_retention_days")?.value || "",
    backup_retention_days: $("legal_backup_retention_days")?.value || "",
    learning_data_retention_months: $("legal_learning_data_retention_months")?.value || "",
    support_email: $("legal_support_email")?.value.trim() || "",
    privacy_email: $("legal_privacy_email")?.value.trim() || "",
    liability_text: $("legal_liability_text")?.value || "",
    sla_text: $("legal_sla_text")?.value || "",
    gdpr_dpa_text: $("legal_gdpr_dpa_text")?.value || "",
    ai_notice_text: $("legal_ai_notice_text")?.value || "",
    recording_notice_text: $("legal_recording_notice_text")?.value || "",
    cookie_notice_text: $("legal_cookie_notice_text")?.value || "",
    locale_default: $("legal_locale_default")?.value.trim() || "en"
  });
}

function populateLegalPanel(settings = {}) {
  const normalized = normalizeLegalAdminSettings(settings);
  const fields = {
    legal_company_name: normalized.company_name,
    legal_operator_name: normalized.operator_name,
    legal_address: normalized.legal_address,
    legal_email: normalized.legal_email,
    legal_phone: normalized.phone,
    legal_vat_id: normalized.vat_id,
    legal_tax_number: normalized.tax_number,
    legal_business_registration: normalized.business_registration,
    legal_responsible_person: normalized.responsible_person,
    legal_supervisory_authority: normalized.supervisory_authority,
    legal_hosting_provider: normalized.hosting_provider,
    legal_video_provider: normalized.video_provider,
    legal_ai_provider: normalized.ai_provider,
    legal_email_provider: normalized.email_provider,
    legal_sms_provider: normalized.sms_provider,
    legal_storage_provider: normalized.storage_provider,
    legal_analytics_provider: normalized.analytics_provider,
    legal_recording_retention_days: normalized.recording_retention_days,
    legal_security_log_retention_days: normalized.security_log_retention_days,
    legal_backup_retention_days: normalized.backup_retention_days,
    legal_learning_data_retention_months: normalized.learning_data_retention_months,
    legal_support_email: normalized.support_email,
    legal_privacy_email: normalized.privacy_email,
    legal_liability_text: normalized.liability_text,
    legal_sla_text: normalized.sla_text,
    legal_gdpr_dpa_text: normalized.gdpr_dpa_text,
    legal_ai_notice_text: normalized.ai_notice_text,
    legal_recording_notice_text: normalized.recording_notice_text,
    legal_cookie_notice_text: normalized.cookie_notice_text,
    legal_locale_default: normalized.locale_default
  };
  Object.entries(fields).forEach(([id, value]) => {
    const node = $(id);
    if (node) node.value = value ?? "";
  });
}

function getLegalVersionCard(documentType) {
  return document.querySelector(`.legal-preview-card[data-document-type="${documentType}"]`);
}

function renderLegalVersionCards(versions = []) {
  LEGAL_DOCUMENT_TYPES.forEach((documentType) => {
    const card = getLegalVersionCard(documentType);
    if (!card) return;
    const active = versions.find((item) => item.document_type === documentType && item.is_active);
    const latest = active || versions.find((item) => item.document_type === documentType) || null;
    card.dataset.versionId = latest?.id || "";
    const status = card.querySelector('[data-role="status"]');
    if (status) {
      status.textContent = latest?.is_active ? "Published" : "Draft";
      status.classList.toggle("is-published", !!latest?.is_active);
    }
    ["locale", "version", "title", "body"].forEach((field) => {
      const input = card.querySelector(`[data-field="${field}"]`);
      if (!input) return;
      input.value = latest?.[field] ?? "";
    });
  });
}

function updateLegalPublishUi() {
  const settings = collectLegalPanelSettings();
  const versions = state.legal.versions || [];
  const requiredDocs = ["privacy", "terms", "impressum"].filter(
    (type) => !versions.some((item) => item.document_type === type && item.is_active)
  );
  const missing = [];
  if (!settings.company_name) missing.push("company_name");
  if (!settings.operator_name) missing.push("operator_name");
  if (!settings.legal_address) missing.push("legal_address");
  if (!settings.legal_email) missing.push("legal_email");
  requiredDocs.forEach((type) => missing.push(`${type} document`));
  state.legal.publishRequirements = missing;
  const copy = $("legalMissingFields");
  if (copy) {
    copy.textContent = missing.length
      ? `Publish blocked until these are filled: ${missing.join(", ")}`
      : "Publish requirements are complete.";
  }
  const publishBtn = $("btnLegalPublish");
  if (publishBtn) publishBtn.disabled = missing.length > 0;
  const badge = $("legalPublishStatusBadge");
  const published = !!state.legal.settings?.is_published;
  if (badge) {
    badge.textContent = published ? "Published" : "Draft";
    badge.classList.toggle("is-published", published);
  }
  const updated = $("legalLastUpdated");
  if (updated) {
    updated.textContent = `Last updated: ${state.legal.settings?.updated_at ? formatAdminTimestamp(state.legal.settings.updated_at) : "—"}`;
  }
}

async function refreshLegalPanel() {
  showLegalStatus("");
  const [settingsPayload, versionsPayload] = await Promise.all([
    api("/api/admin/legal-settings"),
    api("/api/admin/legal-versions")
  ]);
  state.legal.settings = normalizeLegalAdminSettings(settingsPayload.settings || {});
  state.legal.versions = Array.isArray(versionsPayload.versions) ? versionsPayload.versions : [];
  state.legal.publishRequirements = Array.isArray(settingsPayload.publishRequirements) ? settingsPayload.publishRequirements : [];
  populateLegalPanel(state.legal.settings);
  renderLegalVersionCards(state.legal.versions);
  updateLegalPublishUi();
}

async function saveLegalDraft() {
  showLegalStatus("Saving legal draft…", "info");
  const payload = collectLegalPanelSettings();
  const result = await api("/api/admin/legal-settings", {
    method: "PUT",
    body: payload
  });
  state.legal.settings = normalizeLegalAdminSettings(result.settings || payload);
  updateLegalPublishUi();
  showLegalStatus("Legal draft saved.", "success");
}

async function publishLegalSettings() {
  showLegalStatus("Publishing legal settings…", "info");
  const result = await api("/api/admin/legal-settings/publish", {
    method: "POST",
    body: {}
  });
  state.legal.settings = normalizeLegalAdminSettings(result.settings || {});
  updateLegalPublishUi();
  showLegalStatus("Legal settings published.", "success");
}

function readLegalVersionCard(card) {
  return {
    document_type: String(card?.dataset.documentType || "").trim(),
    locale: card?.querySelector('[data-field="locale"]')?.value.trim() || "en",
    version: card?.querySelector('[data-field="version"]')?.value.trim() || "",
    title: card?.querySelector('[data-field="title"]')?.value.trim() || "",
    body: card?.querySelector('[data-field="body"]')?.value || ""
  };
}

async function saveLegalVersionCard(card) {
  if (!card) return;
  const payload = readLegalVersionCard(card);
  const versionId = String(card.dataset.versionId || "").trim();
  showLegalStatus(`Saving ${payload.document_type} document…`, "info");
  const result = versionId
    ? await api(`/api/admin/legal-versions/${encodeURIComponent(versionId)}`, {
        method: "PUT",
        body: payload
      })
    : await api("/api/admin/legal-versions", {
        method: "POST",
        body: payload
      });
  card.dataset.versionId = result.version?.id || versionId;
  await refreshLegalPanel();
  showLegalStatus(`${payload.document_type} document saved.`, "success");
}

async function publishLegalVersionCard(card) {
  if (!card) return;
  const versionId = String(card.dataset.versionId || "").trim();
  if (!versionId) {
    showLegalStatus("Save the document before publishing it.", "error");
    return;
  }
  const payload = readLegalVersionCard(card);
  showLegalStatus(`Publishing ${payload.document_type} document…`, "info");
  await api(`/api/admin/legal-versions/${encodeURIComponent(versionId)}/publish`, {
    method: "POST",
    body: {}
  });
  await refreshLegalPanel();
  showLegalStatus(`${payload.document_type} document published.`, "success");
}
function getAuditGroup(action = "") {
  const value = String(action || "").toLowerCase();

  if (value.startsWith("user.")) return "User";
  if (value.startsWith("workspace.")) return "Workspace";
  if (value.startsWith("school_request.")) return "School Request";
  if (value.startsWith("billing.") || value.includes("invoice") || value.includes("payment")) return "Billing";
  if (value.startsWith("settings.") || value.includes("config")) return "Settings";
  return "General";
}

function getAuditRisk(action = "") {
  const value = String(action || "").toLowerCase();

  if (
    value.includes("delete") ||
    value.includes("reject") ||
    value.includes("disable") ||
    value.includes("remove")
  ) return "high";

  if (
    value.includes("update") ||
    value.includes("approve") ||
    value.includes("create_workspace") ||
    value.includes("bulk")
  ) return "medium";

  return "low";
}

function getAuditRiskBadge(action = "") {
  const risk = getAuditRisk(action);
  const label = risk.charAt(0).toUpperCase() + risk.slice(1);
  return `<span class="audit-badge audit-badge-${risk}">${label}</span>`;
}

function getAuditActionIcon(action = "") {
  const value = String(action || "").toLowerCase();

  if (value.startsWith("user.")) return "fa-user-gear";
  if (value.startsWith("workspace.")) return "fa-building";
  if (value.startsWith("school_request.")) return "fa-school";
  if (value.includes("invoice") || value.includes("payment")) return "fa-file-invoice-dollar";
  if (value.includes("settings") || value.includes("config")) return "fa-sliders";
  if (value.includes("delete")) return "fa-trash";
  return "fa-clipboard-list";
}

function buildAuditDetails(row) {
  const parts = [];

  if (row.workspaceId) parts.push(`Workspace: ${row.workspaceId}`);
  if (row.actor) parts.push(`Actor: ${row.actor}`);
  if (row.target) parts.push(`Target: ${row.target}`);
  if (row.action) parts.push(`Action: ${row.action}`);

  return parts.join(" • ") || "No extra details";
}

function renderAuditTable(rows) {
  const el = $("auditTable");
  const summary = $("auditSummary");

  if (!el) return;

  if (!rows || !rows.length) {
    el.innerHTML = `<div class="audit-empty">No audit rows found.</div>`;
    if (summary) summary.textContent = "0 rows";
    return;
  }

  if (summary) {
    summary.textContent = `${rows.length} row${rows.length === 1 ? "" : "s"}`;
  }

  const thead = `
    <thead>
      <tr>
        <th class="audit-col-time">Time</th>
        <th class="audit-col-workspace">Workspace</th>
        <th class="audit-col-actor">Actor</th>
        <th class="audit-col-action">Action</th>
        <th class="audit-col-target">Target</th>
        <th class="audit-col-group">Group</th>
        <th class="audit-col-risk">Risk</th>
        <th class="audit-col-details">Details</th>
      </tr>
    </thead>
  `;

  const tbody = rows.map((row) => {
    const action = row.action || "—";
    const actor = row.actor || "—";
    const workspace = row.workspaceId || "—";
    const target = row.target || "—";
    const group = getAuditGroup(action);
    const details = buildAuditDetails(row);

    return `
      <tr>
        <td class="audit-col-time">
          <div class="audit-cell-main">${escapeHtml(formatAdminTimestamp(row.createdAt))}</div>
        </td>

        <td class="audit-col-workspace">
          <div class="audit-cell-main">${escapeHtml(workspace)}</div>
        </td>

        <td class="audit-col-actor">
          <div class="audit-cell-main">${escapeHtml(actor)}</div>
        </td>

        <td class="audit-col-action">
          <div class="audit-action-tag">
            <i class="fa-solid ${getAuditActionIcon(action)}" aria-hidden="true"></i>
            <span>${escapeHtml(action)}</span>
          </div>
        </td>

        <td class="audit-col-target">
          <div class="audit-cell-main">${escapeHtml(target)}</div>
        </td>

        <td class="audit-col-group">
          <div class="audit-cell-main">${escapeHtml(group)}</div>
        </td>

        <td class="audit-col-risk">
          ${getAuditRiskBadge(action)}
        </td>

        <td class="audit-col-details">
          ${escapeHtml(details)}
        </td>
      </tr>
    `;
  }).join("");

  el.innerHTML = `<table>${thead}<tbody>${tbody}</tbody></table>`;
}

async function refreshAudit() {
  const ws = state.workspaceId;
  const data = await api(`/api/admin/audit?workspaceId=${encodeURIComponent(ws)}`);

  state.audit.rows = Array.isArray(data) ? data : [];

  applyAuditFilters();
}
function applyAuditFilters() {
  let rows = [...(state.audit.rows || [])];

  const q = String(state.audit.q || "").trim().toLowerCase();
  const type = String(state.audit.type || "all").toLowerCase();
  const sort = String(state.audit.sort || "new").toLowerCase();

  if (q) {
    rows = rows.filter((row) => {
      return [
        row.createdAt,
        row.workspaceId,
        row.actor,
        row.action,
        row.target
      ]
        .map((v) => String(v || "").toLowerCase())
        .some((v) => v.includes(q));
    });
  }

  if (type !== "all") {
    rows = rows.filter((row) => String(row.action || "").toLowerCase().startsWith(`${type}.`));
  }

  rows.sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return sort === "old" ? aTime - bTime : bTime - aTime;
  });

  renderAuditTable(rows);
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
// =========================================================
// School requests - Start - SCRE-1
// =========================================================
async function refreshSchoolRequests({ reset = false } = {}) {
  if (reset) {
    resetRequestPagination({ clearSelection: true });
  }

  const tableEl = $("requestsTable");
  if (!tableEl) return;

  // -------------------------------------------------------
  // Local config
  // -------------------------------------------------------
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

  // -------------------------------------------------------
  // Helpers
  // -------------------------------------------------------
  const buildParams = () => {
    const params = new URLSearchParams({
      status,
      sort,
      limit: String(limit)
    });

    if (search) params.set("search", search);
    if (state.requests.cursor) params.set("cursor", state.requests.cursor);

    return params;
  };

  const renderLoadingState = () => {
    tableEl.innerHTML = `
      <div class="requests-empty-state">
        <div class="requests-empty-visual">
          <div class="requests-empty-icon">
            <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
          </div>
        </div>
        <div class="requests-empty-content">
          <h3>Loading requests</h3>
          <p>Please wait while we fetch the latest school applications.</p>
        </div>
      </div>
    `;
  };

  const renderStatusSelect = (row) => {
    const current = String(row.status || "pending").toLowerCase();
    const reason = (row.reviewNote || row.reason || "").trim();

    const options = STATUS_OPTIONS.map(
      (opt) => `<option value="${opt}"${opt === current ? " selected" : ""}>${STATUS_LABELS[opt]}</option>`
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

  const renderEmptyState = () => {
    const isFiltered = Boolean(search) || status !== "all";

    tableEl.innerHTML = isFiltered
      ? `
        <div class="requests-empty-state is-filtered">
          <div class="requests-empty-visual">
            <div class="requests-empty-icon">
              <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            </div>
            <div class="requests-empty-orbit orbit-1"></div>
            <div class="requests-empty-orbit orbit-2"></div>
          </div>

          <div class="requests-empty-content">
            <h3>No matching requests found</h3>
            <p>
              There are no school requests for the current filter or search.
              Try changing the status, clearing the search, or switching the sort.
            </p>
          </div>

          <div class="requests-empty-actions">
            <button class="btn btn-ghost" type="button" id="reqClearFiltersBtn">
              Clear filters
            </button>
          </div>
        </div>
      `
      : `
        <div class="requests-empty-state is-success">
          <div class="requests-empty-visual">
            <div class="requests-empty-icon">
              <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
            </div>
            <div class="requests-empty-orbit orbit-1"></div>
            <div class="requests-empty-orbit orbit-2"></div>
          </div>

          <div class="requests-empty-content">
            <h3>All caught up</h3>
            <p>
              There are currently no school requests waiting for review.
              New requests will appear here automatically when schools apply.
            </p>
          </div>

          <div class="requests-empty-meta">
            <div class="requests-empty-meta-card">
              <span>Pending</span>
              <strong>${escapeHtml(String(state.requests.counts.pending ?? 0))}</strong>
            </div>
            <div class="requests-empty-meta-card">
              <span>Approved</span>
              <strong>${escapeHtml(String(state.requests.counts.approved ?? 0))}</strong>
            </div>
            <div class="requests-empty-meta-card">
              <span>Rejected</span>
              <strong>${escapeHtml(String(state.requests.counts.rejected ?? 0))}</strong>
            </div>
            <div class="requests-empty-meta-card">
              <span>Flagged</span>
              <strong>${escapeHtml(String(state.requests.counts.flagged ?? 0))}</strong>
            </div>
          </div>
        </div>
      `;

    $("reqClearFiltersBtn")?.addEventListener("click", () => {
      state.requests.q = "";
      state.requests.status = "all";
      state.requests.sort = "new";

      if ($("reqSearch")) $("reqSearch").value = "";
      if ($("reqSort")) $("reqSort").value = "new";

      document.querySelectorAll("#reqChips .chip").forEach((chip) => {
        chip.classList.toggle("is-active", chip.dataset.status === "all");
      });

      refreshSchoolRequests({ reset: true }).catch((e) => {
        setError($("globalError"), e.message);
      });
    });

    updateBulkBar();
    updateRequestPagination({ pageSize: 0, hasNext: false });
  };

  const renderRequestTable = (rows) => {
    renderTable(tableEl, {
      columns: [
        {
          label: "",
          key: "_sel",
          width: "42px",
          render: (r) => `
            <input
              type="checkbox"
              data-sel="${escapeHtml(r.id)}"
              ${state.requests.selected.has(r.id) ? "checked" : ""}
            />
          `
        },
        {
          label: "Created",
          key: "createdAt",
          width: "180px",
          render: (r) => escapeHtml(new Date(r.createdAt).toLocaleString())
        },
        {
          label: "School",
          key: "school",
          render: (r) => {
            const name = getSchoolName(r.data) || "—";
            const dup = duplicateHints(rows, r);
            return `${escapeHtml(name)} ${dup}`;
          }
        },
        {
          label: "Email",
          key: "email",
          render: (r) => escapeHtml(r.email || "—")
        },
        {
          label: "Phone",
          key: "phone",
          width: "160px",
          render: (r) => escapeHtml(getPhone(r.data) || "—")
        },
        {
          label: "Status",
          key: "status",
          width: "150px",
          render: (r) => renderStatusSelect(r)
        },
        {
          label: "Actions",
          key: "_a",
          width: "320px",
          render: (r) => {
            const currentStatus = String(r.status || "").toLowerCase();
            const isPending = currentStatus === "pending";
            const isFlagged = currentStatus === "flagged";

            const approveBtn = isPending
              ? `<button class="btn btn-primary" data-approve="${escapeHtml(r.id)}">Approve</button>`
              : "";

            const rejectBtn = isPending
              ? `<button class="btn btn-ghost" data-reject="${escapeHtml(r.id)}">Reject</button>`
              : "";

            const flagBtn = (isPending || isFlagged)
              ? `<button class="btn btn-ghost" data-flag="${escapeHtml(r.id)}">Flag</button>`
              : "";

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
      rows
    });
  };

  const bindSelectionEvents = () => {
    tableEl.querySelectorAll("input[data-sel]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const id = checkbox.getAttribute("data-sel");
        if (!id) return;

        if (checkbox.checked) state.requests.selected.add(id);
        else state.requests.selected.delete(id);

        updateBulkBar();
      });
    });
  };

  const bindStatusEvents = () => {
    tableEl.querySelectorAll(".req-status-select").forEach((select) => {
      select.addEventListener("change", (event) => {
        const target = event.currentTarget;
        const id = target.getAttribute("data-id");
        const oldStatus = target.getAttribute("data-status");
        const newStatus = target.value;

        if (!id || newStatus === oldStatus) return;

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
  };

  const openDetails = (id, rows) => {
    const row = rows.find((item) => String(item.id) === String(id));
    if (!row) return;

    const data = row.data || {};
    const raw = JSON.stringify(data, null, 2);

    showModal({
      title: "School request details",
      bodyHtml: `
        <div class="admin-row">
          <div><b>School:</b> ${escapeHtml(getSchoolName(data) || "—")}</div>
          <div><b>Email:</b> ${escapeHtml(row.email || "—")}</div>
          <div><b>Phone:</b> ${escapeHtml(getPhone(data) || "—")}</div>
          <div><b>Contact:</b> ${escapeHtml(getContact(data) || "—")}</div>
          <div><b>Address:</b> ${escapeHtml(getAddress(data) || "—")}</div>
          <div><b>City/Country:</b> ${escapeHtml(`${getCity(data) || "—"} / ${getCountry(data) || "—"}`)}</div>
          <div><b>Workspace slug:</b> ${escapeHtml(getWorkspaceSlug(data) || "—")}</div>
          <div><b>Status:</b> ${badge(row.status)}</div>
          <div><b>Internal note:</b> ${escapeHtml(row.reviewNote || "—")}</div>
        </div>
        <hr class="admin-hr" />
        <details>
          <summary><b>Raw JSON</b></summary>
          <pre style="white-space:pre-wrap;margin:10px 0 0 0">${escapeHtml(raw)}</pre>
        </details>
      `,
      footHtml: `<button class="btn btn-ghost" id="modalCloseBtn">Close</button>`
    });

    $("modalCloseBtn")?.addEventListener("click", closeModal);
  };

  const actionModal = async (action, id) => {
    const pretty =
      action === "approve" ? "Approve" :
      action === "reject" ? "Reject" :
      "Flag";

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

    $("actCancel")?.addEventListener("click", closeModal);

    $("actConfirm")?.addEventListener("click", async () => {
      const note = $("noteText")?.value.trim() || "";

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
  };

  const bindActionEvents = (rows) => {
    const handleClick = (event) => {
      const btn = event.target.closest("button");
      if (!btn) return;

      if (btn.dataset.view) {
        openDetails(btn.dataset.view, rows);
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
  };

  // -------------------------------------------------------
  // Start loading
  // -------------------------------------------------------
  state.requests.loading = true;
  renderLoadingState();

  try {
    const payload = await api(`/api/admin/requests?${buildParams().toString()}`);
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

    if (!rows.length) {
      renderEmptyState();
      return;
    }

    renderRequestTable(rows);
    bindSelectionEvents();
    bindStatusEvents();
    bindActionEvents(rows);

    updateBulkBar();
    updateRequestPagination({
      pageSize: rows.length,
      hasNext: Boolean(state.requests.nextCursor)
    });
  } catch (err) {
    tableEl.innerHTML = `
      <div class="muted" style="padding:16px">
        Failed to load school requests. ${escapeHtml(err.message)}
      </div>
    `;
    throw err;
  } finally {
    state.requests.loading = false;
  }
}
// School requests - End - SCRE-1

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

// ===============================
// SETTINGS PAGE UX IMPROVEMENTS
// ===============================

[
  "legal_company",
  "legal_address",
  "legal_email",
  "legal_phone",
  "legal_vat",
  "legal_hosting",
  "legal_ai",
  "legal_email_provider",
  "legal_storage",
  "legal_retention",
  "legal_liability"
].forEach((id) => {
  $(id)?.addEventListener("input", mergeLegalSettingsIntoEditor);
});

$("settingsJson")?.addEventListener("change", () => {
  try {
    const parsed = JSON.parse($("settingsJson").value || "{}");
    settingsEditorSnapshot = cloneSettingsObject(parsed);
    loadLegalSettings(parsed);
    const error = $("settingsError");
    if (error) {
      error.textContent = "";
      error.hidden = true;
    }
  } catch (e) {
    const error = $("settingsError");
    if (error) {
      error.textContent = e.message;
      error.hidden = false;
    }
  }
});

// Format JSON
$("btnFormatJson")?.addEventListener("click", () => {
  try {
    const raw = $("settingsJson").value;
    const parsed = JSON.parse(raw);
    writeSettingsJson(parsed);
    loadLegalSettings(parsed);
  } catch {
    alert("Invalid JSON");
  }
});

// Validate JSON
$("btnValidateJson")?.addEventListener("click", () => {
  try {
    const parsed = JSON.parse($("settingsJson").value);
    settingsEditorSnapshot = cloneSettingsObject(parsed);
    loadLegalSettings(parsed);
    alert("✅ JSON is valid");
  } catch (e) {
    alert("❌ Invalid JSON:\n" + e.message);
  }
});

// Save feedback (override your old one visually)
$("btnSaveSettings")?.addEventListener("click", async () => {
  const status = $("settingsSaveStatus");
  const error = $("settingsError");
  if (status) status.textContent = "";
  if (error) {
    error.textContent = "";
    error.hidden = true;
  }

  if (!state.workspaceId || state.workspaceId === "all") {
    if (status) status.textContent = "Select a specific workspace before saving.";
    return;
  }

  if (status) status.textContent = "Saving...";

  try {
    const raw = $("settingsJson").value;
    const parsed = JSON.parse(raw);

    await api(`/api/admin/workspace-settings/${encodeURIComponent(state.workspaceId)}`, {
      method: "PUT",
      body: { settings: parsed }
    });

    settingsEditorSnapshot = cloneSettingsObject(parsed);
    loadLegalSettings(parsed);
    if (status) status.textContent = "✅ Saved successfully";
  } catch (e) {
    if (error) {
      error.textContent = e.message;
      error.hidden = false;
    }
    if (status) status.textContent = "Save failed";
  }
});

LEGAL_PANEL_FIELD_IDS.forEach((id) => {
  $(id)?.addEventListener("input", updateLegalPublishUi);
});

$("btnLegalSaveDraft")?.addEventListener("click", async () => {
  try {
    await saveLegalDraft();
  } catch (err) {
    showLegalStatus(err.message || "Could not save legal draft.", "error");
  }
});

$("btnLegalPublish")?.addEventListener("click", async () => {
  try {
    await publishLegalSettings();
  } catch (err) {
    showLegalStatus(err.message || "Could not publish legal settings.", "error");
  }
});

$("btnLegalPreviewPrivacy")?.addEventListener("click", () => {
  window.open("/privacy", "_blank", "noopener");
});

$("btnLegalPreviewTerms")?.addEventListener("click", () => {
  window.open("/terms", "_blank", "noopener");
});

$("btnLegalPreviewImpressum")?.addEventListener("click", () => {
  window.open("/impressum", "_blank", "noopener");
});

document.getElementById("legalVersionCards")?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const card = button.closest(".legal-preview-card");
  if (!card) return;
  try {
    if (button.dataset.action === "save-version") {
      await saveLegalVersionCard(card);
    } else if (button.dataset.action === "publish-version") {
      await saveLegalVersionCard(card);
      await publishLegalVersionCard(card);
    }
  } catch (err) {
    showLegalStatus(err.message || "Legal document action failed.", "error");
  }
});
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

/* =========================================
   OVERVIEW HELPERS
   Platform owner dashboard logic
========================================= */

function setText(id, value, fallback = "—") {
  const el = $(id);
  if (!el) return;
  el.textContent = value ?? fallback;
}

function setHealthCard(idPrefix, status, meta, tone = "neutral") {
  const valueEl = $(`${idPrefix}Status`);
  const metaEl = $(`${idPrefix}Meta`);

  if (valueEl) valueEl.textContent = status || "—";
  if (metaEl) metaEl.textContent = meta || "—";

  const card = valueEl?.closest(".health-card");
  if (card) {
    card.classList.remove("is-good", "is-warn", "is-neutral", "is-danger");
    card.classList.add(
      tone === "good" ? "is-good" :
        tone === "warn" ? "is-warn" :
          tone === "danger" ? "is-danger" :
            "is-neutral"
    );
  }
}

function renderOverviewAttention(items = []) {
  const el = $("overviewAttentionList");
  const countEl = $("attentionCount");
  if (!el) return;

  if (!items.length) {
    el.innerHTML = `
      <div class="attention-item is-info">
        <div class="attention-icon"><i class="fa-solid fa-circle-info" aria-hidden="true"></i></div>
        <div class="attention-content">
          <div class="attention-title">No alerts loaded yet</div>
          <div class="attention-meta">Connect real overview signals here</div>
        </div>
      </div>
    `;
    if (countEl) countEl.textContent = "0 active items";
    return;
  }

  if (countEl) {
    countEl.textContent = `${items.length} active item${items.length === 1 ? "" : "s"}`;
  }

  el.innerHTML = items.map((item) => `
    <div class="attention-item is-${escapeHtml(item.tone || "info")}">
      <div class="attention-icon">
        <i class="fa-solid ${escapeHtml(item.icon || "fa-circle-info")}" aria-hidden="true"></i>
      </div>
      <div class="attention-content">
        <div class="attention-title">${escapeHtml(item.title || "Alert")}</div>
        <div class="attention-meta">${escapeHtml(item.meta || "")}</div>
      </div>
    </div>
  `).join("");
}

function renderTopWorkspaces(rows = []) {
  const el = $("topWorkspacesTable");
  const summaryEl = $("topWorkspaceSummary");
  if (!el) return;

  if (!rows.length) {
    el.innerHTML = `<div class="muted" style="padding: 14px;">No workspace summary loaded yet.</div>`;
    if (summaryEl) summaryEl.textContent = "Platform-wide tenant snapshot";
    return;
  }

  if (summaryEl) {
    summaryEl.textContent = `${rows.length} workspace${rows.length === 1 ? "" : "s"} shown`;
  }

  renderTable(el, {
    columns: [
      {
        label: "Workspace",
        key: "name",
        width: "220px",
        render: (r) => `
          <div style="font-weight:800">${escapeHtml(r.name || r.id || "—")}</div>
          <div class="muted" style="font-size:12px">${escapeHtml(r.id || "—")}</div>
        `
      },
      {
        label: "Code",
        key: "schoolCode",
        width: "130px",
        render: (r) => escapeHtml(r.schoolCode || "—")
      },
      {
        label: "Status",
        key: "status",
        width: "120px",
        render: (r) => escapeHtml(r.status || "—")
      },
      {
        label: "Activity",
        key: "activity",
        width: "160px",
        render: (r) => {
          const score = Number(r.activityScore || 0);
          return `
            <div style="font-weight:800">${score}</div>
            <div class="muted" style="font-size:12px">derived score</div>
          `;
        }
      },
      {
        label: "School Code / Signal",
        key: "_signal",
        render: (r) => escapeHtml(r.signal || "Active workspace")
      }
    ],
    rows,
    emptyText: "No workspace summary loaded yet."
  });
}

function exportOverviewSnapshot() {
  const payload = {
    generatedAt: new Date().toISOString(),
    workspaceFilter: state.workspaceId,
    overview: {
      schools: $("kpiSchools")?.textContent || "—",
      users: $("kpiUsers")?.textContent || "—",
      subscriptions: $("kpiSubs")?.textContent || "—",
      openInvoices: $("kpiOpenInvoices")?.textContent || "—"
    }
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8"
  });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `platform-overview-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function ownerEmailStatus(message, tone = "") {
  const el = $("ownerEmailStatus");
  if (!el) return;
  el.textContent = message || "";
  el.className = `owner-email-status ${tone ? `is-${tone}` : ""}`.trim();
}

function setInputValue(id, value) {
  const el = $(id);
  if (el) el.value = value ?? "";
}

function getOwnerEmailWorkspaceId() {
  const select = $("ownerEmailWorkspaceSelect");
  return String(select?.value || "").trim();
}

function fillOwnerEmailWorkspaceSelect() {
  const select = $("ownerEmailWorkspaceSelect");
  if (!select) return;
  select.innerHTML = "";
  const workspaces = Array.isArray(state.workspaces) ? state.workspaces : [];
  workspaces.forEach((workspace) => {
    select.insertAdjacentHTML(
      "beforeend",
      `<option value="${escapeHtml(workspace.id)}">${escapeHtml(workspace.name || workspace.id)}</option>`
    );
  });
  const desired = state.workspaceId && state.workspaceId !== "all" ? state.workspaceId : workspaces[0]?.id || "";
  if (desired) select.value = desired;
}

async function loadOwnerEmailSettingsIntoModal() {
  const settings = await api("/api/admin/owner-email-settings");
  const enabled = $("ownerEmailEnabled");
  if (enabled) enabled.checked = !!settings.enabled;
  setInputValue("ownerEmailDisplayName", settings.display_name || "Platform Owner");
  setInputValue("ownerEmailAddress", settings.owner_email || "");
  setInputValue("ownerEmailSubjectPrefix", settings.subject_prefix || "");
  setInputValue("ownerEmailFooter", settings.footer_text || "");
}

async function loadWorkspaceEmailSettingsIntoModal() {
  const workspaceId = getOwnerEmailWorkspaceId();
  const panel = $("ownerWorkspaceEmailPanel");
  if (!workspaceId) {
    if (panel) panel.hidden = true;
    return;
  }
  if (panel) panel.hidden = false;
  const settings = await api(`/api/admin/workspace-email-settings/${encodeURIComponent(workspaceId)}`);
  const enabled = $("workspaceEmailEnabled");
  if (enabled) enabled.checked = !!settings.enabled;
  setInputValue("workspaceEmailBrand", settings.brand_school_name || "");
  setInputValue("workspaceEmailReplyTo", settings.reply_to_email || "");
  setInputValue("workspaceEmailSubjectPrefix", settings.subject_prefix || "");
  setInputValue("workspaceEmailFooter", settings.footer_text || "");
}

async function openOwnerEmailSettingsModal() {
  if (!state.workspaces.length) {
    await loadWorkspaces();
  }

  showModal({
    title: "Owner email setup",
    bodyHtml: `
      <div class="owner-email-modern">

  <!-- HEADER -->
  <div class="owner-email-top">
    <div>
      <h2>📧 Owner Email Setup</h2>
      <p>Manage system-wide and workspace email behavior</p>
    </div>
  </div>

  <!-- GRID -->
  <div class="owner-email-grid-modern">

    <!-- OWNER EMAIL -->
    <div class="email-card">
      <div class="email-card-head">
        <div>
          <h3>Owner Email</h3>
          <p>Main platform email identity</p>
        </div>

        <label class="toggle">
          <input id="ownerEmailEnabled" type="checkbox" />
          <span>Enabled</span>
        </label>
      </div>

      <div class="email-form">
        <input id="ownerEmailDisplayName" placeholder="Display name (e.g. Platform Owner)" />
        <input id="ownerEmailAddress" type="email" placeholder="owner@example.com" />
        <input id="ownerEmailSubjectPrefix" placeholder="[WorkNest Owner]" />
        <textarea id="ownerEmailFooter" placeholder="Signature / footer"></textarea>
      </div>

      <div class="email-actions">
        <button class="btn-primary" id="ownerEmailSaveBtn">Save owner email</button>
      </div>
    </div>

    <!-- WORKSPACE EMAIL -->
    <div class="email-card">
      <div class="email-card-head">
        <div>
          <h3>Workspace Email</h3>
          <p>Override email per school</p>
        </div>
      </div>

      <div class="email-form">
        <select id="ownerEmailWorkspaceSelect"></select>

        <label class="toggle">
          <input id="workspaceEmailEnabled" type="checkbox" />
          <span>Enable workspace email</span>
        </label>

        <input id="workspaceEmailBrand" placeholder="School / brand name" />

        <div class="inline">
          <input id="workspaceEmailReplyTo" type="email" placeholder="school-admin@example.com" />
          <button class="btn-ghost" id="workspaceUseOwnerEmailBtn">Use owner</button>
        </div>

        <input id="workspaceEmailSubjectPrefix" placeholder="[School]" />
        <textarea id="workspaceEmailFooter" placeholder="Signature / footer"></textarea>
      </div>

      <div class="email-actions">
        <button class="btn-primary" id="workspaceEmailSaveBtn">Save workspace email</button>
      </div>
    </div>

    <!-- TEST EMAIL -->
    <div class="email-card test">
      <div class="email-card-head">
        <h3>Send Test Email</h3>
      </div>

      <div class="email-form">
        <input id="ownerEmailTestTo" type="email" placeholder="recipient@example.com" />
        <input id="ownerEmailTestSubject" placeholder="Test subject" />

        <select id="ownerEmailTestScope">
          <option value="owner">Owner email</option>
          <option value="workspace">Workspace email</option>
        </select>

        <textarea id="ownerEmailTestBody" placeholder="Write a test message..."></textarea>
      </div>

      <div class="email-actions">
        <button class="btn-secondary" id="ownerEmailTestBtn">Send test</button>
        <div id="ownerEmailStatus" class="status"></div>
      </div>
    </div>

  </div>

</div>
    `,
    footHtml: `<button class="btn btn-ghost" type="button" id="ownerEmailCloseBtn">Close</button>`
  });

  fillOwnerEmailWorkspaceSelect();
  $("ownerEmailCloseBtn")?.addEventListener("click", closeModal);
  $("ownerEmailWorkspaceSelect")?.addEventListener("change", () => {
    loadWorkspaceEmailSettingsIntoModal().catch((err) => ownerEmailStatus(err.message, "error"));
  });
  $("workspaceUseOwnerEmailBtn")?.addEventListener("click", () => {
    setInputValue("workspaceEmailReplyTo", $("ownerEmailAddress")?.value || "");
  });
  $("ownerEmailSaveBtn")?.addEventListener("click", async () => {
    ownerEmailStatus("Saving owner email...");
    try {
      await api("/api/admin/owner-email-settings", {
        method: "POST",
        body: {
          enabled: $("ownerEmailEnabled")?.checked ? 1 : 0,
          display_name: $("ownerEmailDisplayName")?.value || "",
          owner_email: $("ownerEmailAddress")?.value || "",
          subject_prefix: $("ownerEmailSubjectPrefix")?.value || "",
          footer_text: $("ownerEmailFooter")?.value || ""
        }
      });
      ownerEmailStatus("Owner email saved.", "success");
    } catch (err) {
      ownerEmailStatus(err.message, "error");
    }
  });
  $("workspaceEmailSaveBtn")?.addEventListener("click", async () => {
    const workspaceId = getOwnerEmailWorkspaceId();
    if (!workspaceId) return ownerEmailStatus("Select a workspace first.", "error");
    ownerEmailStatus("Saving workspace email...");
    try {
      await api(`/api/admin/workspace-email-settings/${encodeURIComponent(workspaceId)}`, {
        method: "POST",
        body: {
          enabled: $("workspaceEmailEnabled")?.checked ? 1 : 0,
          brand_school_name: $("workspaceEmailBrand")?.value || "",
          reply_to_email: $("workspaceEmailReplyTo")?.value || "",
          subject_prefix: $("workspaceEmailSubjectPrefix")?.value || "",
          footer_text: $("workspaceEmailFooter")?.value || "",
          manual_body_text: ""
        }
      });
      ownerEmailStatus("Workspace email saved.", "success");
    } catch (err) {
      ownerEmailStatus(err.message, "error");
    }
  });
  $("ownerEmailTestBtn")?.addEventListener("click", async () => {
    const scope = $("ownerEmailTestScope")?.value || "owner";
    const workspaceId = getOwnerEmailWorkspaceId();
    if (scope === "workspace" && !workspaceId) {
      return ownerEmailStatus("Select a workspace first.", "error");
    }
    ownerEmailStatus("Sending test email...");
    try {
      const path = scope === "workspace"
        ? `/api/admin/workspace-email-settings/${encodeURIComponent(workspaceId)}/test`
        : "/api/admin/owner-email-settings/test";
      await api(path, {
        method: "POST",
        body: {
          to: $("ownerEmailTestTo")?.value || "",
          subject: $("ownerEmailTestSubject")?.value || "",
          body: $("ownerEmailTestBody")?.value || ""
        }
      });
      ownerEmailStatus("Test email sent.", "success");
    } catch (err) {
      ownerEmailStatus(err.message, "error");
    }
  });

  await loadOwnerEmailSettingsIntoModal();
  await loadWorkspaceEmailSettingsIntoModal();
}

function wireOverviewActions() {
  $("btnOverviewRefresh")?.addEventListener("click", () => {
    refreshOverview().catch((e) => setError($("globalError"), e.message));
  });

  $("btnOverviewExport")?.addEventListener("click", () => {
    exportOverviewSnapshot();
  });

  $("qaAddSchool")?.addEventListener("click", () => {
    $("btnUpsertWorkspace")?.click();
  });

  $("qaApproveRequests")?.addEventListener("click", async () => {
    setTab("school-requests");
    persistTab("school-requests");
    await refreshActiveTab().catch((e) => setError($("globalError"), e.message));
  });

  $("qaCreateInvoice")?.addEventListener("click", () => {
    $("btnCreateInvoice")?.click();
  });

  $("qaOpenAi")?.addEventListener("click", () => {
    $("btnSpeakingPractice")?.click();
  });

  $("qaOpenAudit")?.addEventListener("click", async () => {
    setTab("audit");
    persistTab("audit");
    await refreshActiveTab().catch((e) => setError($("globalError"), e.message));
  });

  $("qaOpenSettings")?.addEventListener("click", async () => {
    setTab("settings");
    persistTab("settings");
    await refreshActiveTab().catch((e) => setError($("globalError"), e.message));
  });
}
