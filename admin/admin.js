
const $ = (id) => document.getElementById(id);

const STORAGE_USER_ID = "studis_admin_user_id";
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
  paymentGateways: {
    activeProvider: "stripe",
    environment: "test",
    providers: [],
    webhookEvents: [],
    auditEvents: [],
    feedback: { message: "", tone: "" },
    loadError: ""
  },
  costControl: {
    period: "monthly",
    overview: null,
    providerRows: [],
    workspaceRows: [],
    limits: [],
    alerts: [],
    providers: [],
    feedback: { message: "", tone: "" },
    loadError: ""
  },
  platformControl: {
    activeTab: "overview",
    globalSettings: null,
    workspaceOverride: null,
    effectiveSettings: null,
    selectedWorkspaceId: "",
    updatedAt: "",
    feedback: { message: "", tone: "" }
  },
  secrets: {
    enabled: false,
    environment: "production",
    providers: [],
    activeProvider: "",
    statuses: {},
    aiBudget: {
      defaultBudget: null,
      workspaceBudget: null,
      feedback: { message: "", tone: "" },
      loadError: ""
    },
    ownerEmail: {
      ownerSettings: null,
      workspaceSettings: null,
      feedback: { message: "", tone: "" },
      loadError: ""
    },
    emailControl: {
      activeTab: "overview",
      overview: null,
      settings: null,
      logs: [],
      templates: [],
      filters: {
        workspaceId: "",
        status: "all",
        limit: 50
      },
      feedback: { message: "", tone: "" },
      loadError: ""
    }
  },
  legal: {
    settings: null,
    versions: [],
    subprocessors: [],
    retention: null,
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
  },
  ownerControls: {
    operations: null,
    backups: null,
    lifecycle: null,
    support: null,
    incidents: null,
    dataGovernance: null,
    notifications: [],
    branding: null,
    reports: null
  },
  notificationControl: {
    selectedCampaignId: "",
    selectedAutomationRuleId: "",
    lastEstimate: null,
    stats: null,
    automation: null
  }
};

let settingsEditorSnapshot = {};
const PLATFORM_SETTINGS_KEY = "platform_admin_config";
const SETTINGS_FIELD_IDS = [
  "settings_defaults_ai_budget",
  "settings_defaults_max_users",
  "settings_workspaceDefaults_defaultStorageGb",
  "settings_workspaceDefaults_defaultEmailDailyLimit",
  "settings_workspaceDefaults_defaultSmsDailyLimit",
  "settings_costGovernance_platformMonthlyBudgetEur",
  "settings_costGovernance_workspaceMonthlyHardLimitEur",
  "settings_costGovernance_workspaceMonthlySoftLimitEur",
  "settings_costGovernance_alertThresholdPercent",
  "settings_costGovernance_blockOnHardLimit",
  "settings_provider_openai_enabled",
  "settings_provider_openai_monthlyLimitEur",
  "settings_provider_twilio_enabled",
  "settings_provider_twilio_dailySmsLimit",
  "settings_provider_twilio_monthlyLimitEur",
  "settings_provider_googleTranslate_enabled",
  "settings_provider_googleTranslate_monthlyCharacterLimit",
  "settings_provider_googleTranslate_monthlyLimitEur",
  "settings_provider_ionosEmail_enabled",
  "settings_provider_ionosEmail_dailyEmailLimit",
  "settings_provider_ionosEmail_monthlyLimitEur",
  "settings_provider_storage_enabled",
  "settings_provider_storage_maxGbPerWorkspace",
  "settings_provider_storage_monthlyLimitEur",
  "settings_provider_jitsi_enabled",
  "settings_provider_jitsi_monthlyLimitEur",
  "settings_ai_provider",
  "settings_ai_enabled",
  "settings_ai_realtime_enabled",
  "settings_ai_defaultModel",
  "settings_ai_realtimeVoice",
  "settings_ai_maxTokensPerRequest",
  "settings_ai_maxSessionSeconds",
  "settings_ai_idleTimeoutSeconds",
  "settings_ai_allowAiForNewWorkspaces",
  "settings_communication_email_enabled",
  "settings_communication_sms_enabled",
  "settings_communication_default_sender_name",
  "settings_communication_default_reply_to",
  "settings_communication_maxOtpPerUserPerDay",
  "settings_communication_maxEmailsPerWorkspacePerDay",
  "settings_communication_useOwnerEmailFallback",
  "settings_storage_default_adapter",
  "settings_storage_uploadEnabled",
  "settings_storage_max_upload_mb",
  "settings_storage_maxVideoMb",
  "settings_storage_retention_days",
  "settings_storage_allowedTypes",
  "settings_security_session_timeout_min",
  "settings_security_audit_retention_days",
  "settings_security_require_admin_2fa",
  "settings_security_requireEmailVerification",
  "settings_security_maxLoginAttempts",
  "settings_security_lockoutMinutes",
  "settings_security_requireStrongPasswords",
  "settings_security_allowDevBypass",
  "settings_features_ai",
  "settings_features_sms",
  "settings_features_email",
  "settings_features_liveClasses",
  "settings_features_recording",
  "settings_features_analytics",
  "settings_features_payments",
  "settings_subscriptions_defaultPlan",
  "settings_subscriptions_trialDays",
  "settings_subscriptions_autoSuspendOnFailedPayment",
  "settings_plan_starter_monthlyPriceEur",
  "settings_plan_starter_maxUsers",
  "settings_plan_starter_aiBudgetEur",
  "settings_plan_starter_storageGb",
  "settings_plan_professional_monthlyPriceEur",
  "settings_plan_professional_maxUsers",
  "settings_plan_professional_aiBudgetEur",
  "settings_plan_professional_storageGb",
  "settings_plan_enterprise_monthlyPriceEur",
  "settings_plan_enterprise_maxUsers",
  "settings_plan_enterprise_aiBudgetEur",
  "settings_plan_enterprise_storageGb",
  "settings_features_beta"
];

const REQUESTS_DEBOUNCE_MS = 320;
let requestSearchTimer = null;
const LEGAL_DOCUMENT_TYPES = ["privacy", "terms", "impressum", "cookies", "dpa", "ai_notice", "recording_notice", "subprocessor_list"];
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

const COST_CONTROL_PROVIDER_ORDER = [
  "openai",
  "twilio",
  "google_translate",
  "ionos_email",
  "storage",
  "jitsi",
  "custom"
];

function getCostProviderLabel(providerKey) {
  const normalized = String(providerKey || "").trim().toLowerCase();
  const fromOverview = (state.costControl.providers || []).find((row) => row.provider_key === normalized);
  if (fromOverview?.display_name) return fromOverview.display_name;
  const known = {
    openai: "OpenAI",
    twilio: "Twilio",
    google_translate: "Google Translate",
    ionos_email: "IONOS Email",
    storage: "Storage",
    jitsi: "Jitsi",
    custom: "Custom"
  };
  return known[normalized] || normalized || "Provider";
}

function setCostControlFeedback(message = "", tone = "") {
  state.costControl.feedback = { message, tone };
  const el = $("costControlFeedback");
  if (!el) return;
  el.textContent = message;
  el.className = `cost-control-feedback${tone ? ` is-${tone}` : ""}`;
}

function getAlertTone(alertType = "") {
  const normalized = String(alertType || "").trim().toLowerCase();
  if (normalized === "hard_limit" || normalized === "anomaly") return "failed";
  if (normalized === "soft_limit") return "warn";
  return "ok";
}

function getCostWorkspaceLabel(workspaceId) {
  if (!workspaceId) return "Platform default";
  return getWorkspaceLabelById(workspaceId);
}

function getCostLimitFor(workspaceId, providerKey, period = "monthly") {
  const normalizedProvider = String(providerKey || "").trim().toLowerCase();
  const normalizedPeriod = String(period || "monthly").trim().toLowerCase();
  const rows = Array.isArray(state.costControl.limits) ? state.costControl.limits : [];
  return rows.find((row) =>
    String(row.provider_key || "").trim().toLowerCase() === normalizedProvider &&
    String(row.period || "").trim().toLowerCase() === normalizedPeriod &&
    String(row.workspace_id || "") === String(workspaceId || "")
  ) || rows.find((row) =>
    String(row.provider_key || "").trim().toLowerCase() === normalizedProvider &&
    String(row.period || "").trim().toLowerCase() === normalizedPeriod &&
    row.workspace_id == null
  ) || null;
}

function getCostLimitStatus(limit, used = 0) {
  if (!limit || !limit.enabled) {
    return { label: "No limit", tone: "neutral" };
  }
  const hard = Number(limit.hard_limit_eur || 0);
  const soft = Number(limit.soft_limit_eur || 0);
  const value = Number(used || 0);
  if (hard > 0 && value >= hard) {
    return { label: "Hard cap reached", tone: "warn" };
  }
  if (soft > 0 && value >= soft) {
    return { label: "Soft alert", tone: "failed" };
  }
  return { label: "Within limit", tone: "ok" };
}

function renderCostMiniList(el, rows, renderer, emptyText) {
  if (!el) return;
  if (!rows || !rows.length) {
    el.innerHTML = `<div class="muted">${escapeHtml(emptyText || "No data")}</div>`;
    return;
  }
  el.innerHTML = rows.map(renderer).join("");
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
  "payment-gateways": {
    title: "Payment Gateways",
    subtitle: "Configure Stripe, PayPal, Mollie, webhooks, and payment secrets."
  },
  "cost-control": {
    title: "Cost Control",
    subtitle: "Usage governance, provider limits, alerts, and workspace cost visibility."
  },
  settings: {
    title: "Platform Control",
    subtitle: "Workspace configuration and policies."
  },
  operations: {
    title: "Operations Center",
    subtitle: "Production health, providers, uptime, backups, and failed jobs."
  },
  backups: {
    title: "Backup / Restore",
    subtitle: "Backup readiness, backup history, and restore dry-runs."
  },
  lifecycle: {
    title: "Workspace Lifecycle",
    subtitle: "Suspend, archive, transfer ownership, force logout, and reset overrides."
  },
  support: {
    title: "Support Mode",
    subtitle: "Audited read-only support impersonation sessions."
  },
  incidents: {
    title: "Incident / Maintenance",
    subtitle: "Maintenance mode, feature freeze, and incident history."
  },
  "data-governance": {
    title: "Data Governance",
    subtitle: "Retention, exports, deletion queue, legal, and DPA readiness."
  },
  secrets: {
    title: "Secrets / Integrations",
    subtitle: "Encrypted provider credentials with runtime env fallback."
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
  },
  notifications: {
    title: "Notifications",
    subtitle: "Platform announcements and operational notices."
  },
  branding: {
    title: "Branding / Domains",
    subtitle: "Platform identity, workspace branding, and custom domains."
  },
  reports: {
    title: "Reports",
    subtitle: "Owner-level SaaS reports and exports."
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
  window.__adminToken = accessToken || "";
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
    loadAIBudget();
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

function setAiBudgetFeedback(message = "", tone = "") {
  state.secrets.aiBudget.feedback = { message, tone };
  const el = $("aiBudgetFeedback");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("is-success", "is-error", "is-info");
  if (tone) el.classList.add(`is-${tone}`);
}

function setOwnerEmailFeedback(message = "", tone = "") {
  state.secrets.ownerEmail.feedback = { message, tone };
}

function setEmailControlFeedback(message = "", tone = "") {
  state.secrets.emailControl.feedback = { message, tone };
}

function getWorkspaceLabelById(workspaceId) {
  const match = (Array.isArray(state.workspaces) ? state.workspaces : []).find((workspace) => workspace.id === workspaceId);
  return match?.name || workspaceId || "Default Workspace";
}

async function refreshSecretsOwnerEmail() {
  state.secrets.ownerEmail.loadError = "";
  const workspaceId = getWorkspaceForAiBudget();
  try {
    const [ownerSettings, workspaceSettings] = await Promise.all([
      api("/api/admin/owner-email-settings"),
      workspaceId && workspaceId !== "all"
        ? api(`/api/admin/workspace-email-settings/${encodeURIComponent(workspaceId)}`).catch(() => null)
        : Promise.resolve(null)
    ]);
    state.secrets.ownerEmail.ownerSettings = ownerSettings || null;
    state.secrets.ownerEmail.workspaceSettings = workspaceSettings || null;
  } catch (error) {
    state.secrets.ownerEmail.loadError = error.message || "Failed to load owner email settings.";
  }
}

async function refreshSecretsEmailControl() {
  state.secrets.emailControl.loadError = "";
  const workspaceId = getWorkspaceForAiBudget();
  const status = state.secrets.emailControl.filters?.status || "all";
  const limit = state.secrets.emailControl.filters?.limit || 50;
  const workspaceQuery = workspaceId ? `workspaceId=${encodeURIComponent(workspaceId)}` : "";
  const joinQuery = (extra) => [workspaceQuery, extra].filter(Boolean).join("&");

  try {
    const [overview, settings, logsPayload, templatesPayload] = await Promise.all([
      api(`/api/admin/email-control/overview${workspaceQuery ? `?${workspaceQuery}` : ""}`),
      api(`/api/admin/email-control/settings${workspaceQuery ? `?${workspaceQuery}` : ""}`),
      api(`/api/admin/email-control/logs?${joinQuery(`status=${encodeURIComponent(status)}&limit=${encodeURIComponent(limit)}`)}`),
      api(`/api/admin/email-control/templates${workspaceQuery ? `?${workspaceQuery}` : ""}`)
    ]);
    state.secrets.emailControl.overview = overview || null;
    state.secrets.emailControl.settings = settings || null;
    state.secrets.emailControl.logs = Array.isArray(logsPayload?.logs) ? logsPayload.logs : [];
    state.secrets.emailControl.templates = Array.isArray(templatesPayload?.templates) ? templatesPayload.templates : [];
    state.secrets.emailControl.filters.workspaceId = workspaceId || "";
  } catch (error) {
    state.secrets.emailControl.loadError = error.message || "Failed to load Email Control Center.";
  }
}

function renderSecretsAiBudgetCard() {
  const mount = $("secretsAiBudgetMount");
  if (!mount) return;

  const workspaceId = getWorkspaceForAiBudget();
  const workspaceLabel = workspaceId && workspaceId !== "all" ? workspaceId : "No workspace selected";
  const budgetState = state.secrets.aiBudget || {};
  const defaultBudget = budgetState.defaultBudget || {};
  const workspaceBudget = budgetState.workspaceBudget || {};
  const feedback = budgetState.feedback || { message: "", tone: "" };
  const loadError = budgetState.loadError || "";
  const effectiveLimit = Number(
    workspaceBudget.monthly_limit_eur
      ?? workspaceBudget.monthly_cap_eur
      ?? defaultBudget.monthly_limit_eur
      ?? defaultBudget.monthly_cap_eur
      ?? 5
  );
  const used = Number(workspaceBudget.used_eur ?? workspaceBudget.used ?? 0);
  const remaining = Math.max(0, effectiveLimit - used);
  const hasWorkspaceOverride = workspaceBudget.workspace_id && workspaceBudget.workspace_id !== "all";
  const currentDefault = Number(defaultBudget.monthly_limit_eur ?? defaultBudget.monthly_cap_eur ?? 5);
  const currentWorkspaceCap = Number(workspaceBudget.monthly_limit_eur ?? workspaceBudget.monthly_cap_eur ?? 0);
  const percent = effectiveLimit > 0 ? Math.min(100, (used / effectiveLimit) * 100) : 0;

  mount.innerHTML = `
    <section class="secret-card ai-budget-secret-card" aria-label="AI budget governance">
      <div class="secret-card-head ai-budget-card-head">
        <div>
          <h3>AI Budget / Governance</h3>
          <p>Budget control, usage tracking, and hard-cap enforcement for every workspace.</p>
        </div>
        <span class="secret-status-badge is-${used >= effectiveLimit ? "warn" : "good"}">${used >= effectiveLimit ? "Cap reached" : "Active"}</span>
      </div>

      <div class="ai-budget-summary-grid">
        <div class="ai-budget-stat">
          <span class="ai-budget-stat-label">Global default</span>
          <strong>${formatEUR(currentDefault)}</strong>
          <small>Monthly default for all schools</small>
        </div>
        <div class="ai-budget-stat">
          <span class="ai-budget-stat-label">Workspace cap</span>
          <strong>${formatEUR(effectiveLimit)}</strong>
          <small>${hasWorkspaceOverride ? "Override active" : "Using global default"}</small>
        </div>
        <div class="ai-budget-stat">
          <span class="ai-budget-stat-label">Used this month</span>
          <strong>${formatEUR(used)}</strong>
          <small>Tracked from AI usage ledger</small>
        </div>
        <div class="ai-budget-stat">
          <span class="ai-budget-stat-label">Remaining</span>
          <strong>${formatEUR(remaining)}</strong>
          <small>${used >= effectiveLimit ? "New AI calls are blocked" : "Budget available"}</small>
        </div>
      </div>

      <div class="ai-budget-progress" aria-hidden="true">
        <span class="ai-budget-progress-bar" style="width:${percent}%"></span>
      </div>

      <div class="ai-budget-governance-list">
        <div><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Global AI budget is enforced across all schools.</span></div>
        <div><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Per-school override applies by workspace.</span></div>
        <div><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Usage tracking reads from <code>ai_usage_ledger</code> with ISO timestamps.</span></div>
        <div><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Hard limit enforcement blocks OpenAI realtime session creation when the cap is exceeded.</span></div>
        <div><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Cost tracking is written through <code>/api/ai/usage</code> and <code>/api/ai/runtime/end</code>.</span></div>
      </div>

      <div class="ai-budget-form-grid">
        <div class="secret-field-row ai-budget-field-row">
          <label for="secretsAiDefaultBudget">
            <span>Default monthly cap</span>
            <small>Applies to all workspaces unless overridden.</small>
            <div class="secret-mask">Current: <code>${escapeHtml(formatEUR(currentDefault))}</code></div>
          </label>
          <input
            class="input secret-field-input"
            id="secretsAiDefaultBudget"
            type="number"
            min="0"
            step="0.10"
            value="${escapeHtml(currentDefault.toFixed(2))}"
            placeholder="5.00"
          />
          <div class="secret-row-actions">
            <button class="btn btn-primary" type="button" data-ai-budget-action="save-default">Save default</button>
          </div>
        </div>

        <div class="secret-field-row ai-budget-field-row">
          <label for="secretsAiWorkspaceBudget">
            <span>Workspace override</span>
            <small>Selected workspace: ${escapeHtml(workspaceLabel)}</small>
            <div class="secret-mask">Current: <code>${escapeHtml(formatEUR(currentWorkspaceCap || effectiveLimit))}</code> ${hasWorkspaceOverride ? '<span class="secret-source-pill is-db">Override</span>' : '<span class="secret-source-pill is-env">Default</span>'}</div>
          </label>
          <input
            class="input secret-field-input"
            id="secretsAiWorkspaceBudget"
            type="number"
            min="0"
            step="0.10"
            value="${workspaceId && workspaceId !== "all" ? escapeHtml((currentWorkspaceCap || effectiveLimit).toFixed(2)) : ""}"
            placeholder="${workspaceId && workspaceId !== "all" ? "1.00" : "Select a workspace first"}"
            ${workspaceId && workspaceId !== "all" ? "" : "disabled"}
          />
          <div class="secret-row-actions">
            <button class="btn btn-secondary" type="button" data-ai-budget-action="save-workspace" ${workspaceId && workspaceId !== "all" ? "" : "disabled"}>Save override</button>
          </div>
        </div>
      </div>

      <div class="secret-card-warning">
        <strong>Implementation note:</strong> cost tracking uses structured server-side usage endpoints with workspace attribution instead of ad hoc client inserts. That keeps billing and governance data consistent.
      </div>

      ${loadError ? `<div class="secret-card-status is-error">${escapeHtml(loadError)}</div>` : ""}
      <div class="ai-budget-feedback${feedback.tone ? ` is-${feedback.tone}` : ""}" id="secretsAiBudgetFeedback">${escapeHtml(feedback.message || "")}</div>
    </section>
  `;
}

async function refreshSecretsAiBudget() {
  state.secrets.aiBudget.loadError = "";
  try {
    const [defaultBudget, workspaceBudget] = await Promise.all([
      fetchAiBudgetDefault(),
      fetchAiBudgetData().catch(() => null)
    ]);
    state.secrets.aiBudget.defaultBudget = defaultBudget || null;
    state.secrets.aiBudget.workspaceBudget = workspaceBudget || null;
  } catch (error) {
    state.secrets.aiBudget.loadError = error.message || "Failed to load AI budget controls.";
  }
}

async function refreshAiLimitsPanel() {
  const workspaceId = getWorkspaceForAiBudget();
  const workspaceInput = $("workspaceBudget");
  const capCur = $("workspaceBudgetCurrent");
  const usedCur = $("workspaceBudgetUsed");

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

async function loadAIBudget() {
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
  const defaultInput = $("aiDefaultBudget");
  const defaultCurrent = $("aiDefaultBudgetCurrent");
  const defaultUpdated = $("aiDefaultBudgetUpdated");

  const value = Number(data.monthly_limit_eur ?? data.monthly_cap_eur ?? 5).toFixed(2);
  if (defaultInput) defaultInput.value = value;
  if (defaultCurrent) defaultCurrent.textContent = `€${value}`;
  if (defaultUpdated) defaultUpdated.textContent = data.updated_at || "—";

  await refreshAiLimitsPanel();
}

async function saveWorkspaceBudget() {
  const workspaceId = getWorkspaceForAiBudget();
  if (!workspaceId) {
    setAiBudgetFeedback("Select a workspace first.", "error");
    return false;
  }
  const input = $("workspaceBudget");
  const v = Number(input?.value ?? 0);
  try {
    const response = await fetch(`/api/admin/ai-budget/workspace/${encodeURIComponent(workspaceId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ amount: Math.max(0, v) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Could not save workspace budget.");
    }
    await refreshAiLimitsPanel();
    setAiBudgetFeedback("Workspace override saved.", "success");
    return true;
  } catch (err) {
    setAiBudgetFeedback(err.message || "Could not save AI budget.", "error");
    return false;
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

async function saveDefaultBudget() {
  const input = $("aiDefaultBudget");
  const value = Number(input?.value || 0);
  if (Number.isNaN(value) || value < 0) {
    setAiBudgetFeedback("Enter a non-negative amount.", "error");
    return false;
  }
  const response = await fetch("/api/admin/ai-budget/default", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ amount: value })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    setAiBudgetFeedback(data.error || "Failed to save AI budget", "error");
    return false;
  }
  const defaultCurrent = $("aiDefaultBudgetCurrent");
  const formatted = `€${Number(data.amount ?? data.monthly_limit_eur ?? data.monthly_cap_eur ?? 0).toFixed(2)}`;
  if (defaultCurrent) defaultCurrent.textContent = formatted;
  const defaultUpdated = $("aiDefaultBudgetUpdated");
  if (defaultUpdated) defaultUpdated.textContent = data.updated_at || "just now";
  setAiBudgetFeedback("Default budget saved.", "success");
  return true;
}

$("aiDefaultBudgetSaveBtn")?.addEventListener("click", saveDefaultBudget);
$("workspaceBudgetSaveBtn")?.addEventListener("click", saveWorkspaceBudget);

window.loadAIBudget = loadAIBudget;
window.saveDefaultBudget = saveDefaultBudget;
window.saveWorkspaceBudget = saveWorkspaceBudget;

refreshAiLimitsPanel();

async function refreshMessages() {
  const workspaceId = getWorkspaceForAiBudget();
  const workspaceQuery = workspaceId ? `workspaceId=${encodeURIComponent(workspaceId)}` : "";
  const [overview, logsPayload] = await Promise.all([
    api(`/api/admin/email-control/overview${workspaceQuery ? `?${workspaceQuery}` : ""}`).catch(() => null),
    api(`/api/admin/email-control/logs?${[workspaceQuery, "status=all", "limit=12"].filter(Boolean).join("&")}`).catch(() => ({ logs: [] }))
  ]);
  setText("messagesInboxCount", overview?.inboxCount ?? 0);
  setText("messagesSentCount", overview?.sentCount ?? 0);
  setText("messagesFailedCount", overview?.failedCount ?? 0);
  setText("messagesTemplateCount", overview?.templatesCount ?? 0);
  const logs = Array.isArray(logsPayload?.logs) ? logsPayload.logs : [];
  setText("messagesTableMeta", `${logs.length} rows`);

  const table = $("messagesActivityTable");
  if (table) {
    renderTable(table, {
      columns: [
        { label: "Time", key: "createdAt", width: "170px", render: (row) => escapeHtml(formatAdminTimestamp(row.createdAt)) },
        { label: "Workspace", key: "workspaceName", width: "160px", render: (row) => escapeHtml(row.workspaceName || row.workspaceId || "Workspace") },
        { label: "Direction", key: "direction", width: "100px", align: "center", render: (row) => escapeHtml(row.direction || "outbound") },
        { label: "Subject", key: "subject", render: (row) => escapeHtml(row.subject || "—") },
        { label: "Status", key: "status", width: "120px", align: "center", render: (row) => `<span class="secret-status-badge is-${row.status === "failed" ? "failed" : row.status === "sent" ? "ok" : "warn"}">${escapeHtml(row.status || "—")}</span>` }
      ],
      rows: logs,
      emptyText: "No message activity loaded yet."
    });
  }
}

function getSecretStatusState(provider) {
  return state.secrets.statuses[provider] || { message: "", tone: "" };
}

function setSecretStatusState(provider, message = "", tone = "") {
  state.secrets.statuses[provider] = { message, tone };
  const statusEl = document.querySelector(`[data-secret-status="${provider}"]`);
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = "secret-card-status";
  if (tone) {
    statusEl.classList.add(`is-${tone}`);
  }
}

function getSecretSourcePill(source) {
  const normalized = String(source || "").toLowerCase();
  if (normalized === "db") return `<span class="secret-source-pill">DB override</span>`;
  if (normalized === "env") return `<span class="secret-source-pill is-env">Env fallback</span>`;
  if (normalized === "ignored") return `<span class="secret-source-pill is-ignored">Ignored</span>`;
  return `<span class="secret-source-pill is-unset">Unset</span>`;
}

function getSecretProviderBadge(provider) {
  const lastStatuses = (provider.secrets || [])
    .map((entry) => String(entry.lastTestStatus || "").toLowerCase())
    .filter(Boolean);
  if (lastStatuses.includes("failed")) return { label: "Test failed", tone: "failed" };
  if (lastStatuses.includes("ok")) return { label: "Tested", tone: "ok" };
  if (provider.enabled) return { label: "Configured", tone: "ok" };
  return { label: "Needs setup", tone: "warn" };
}

function getProviderScopedWarning(provider) {
  if (String(provider?.provider || '') !== 'google') return '';
  return 'File path credentials are deprecated for production. Use GOOGLE_TRANSLATE_KEY_JSON.';
}

function getEmailControlStatusBadge() {
  const overview = state.secrets.emailControl.overview || {};
  const alertCount = Array.isArray(overview.activeAlerts) ? overview.activeAlerts.length : 0;
  if (alertCount > 0) return { label: `${alertCount} alerts`, tone: "warn" };
  const providerTone = overview.providerStatus?.tone || "good";
  return {
    label: overview.providerStatus?.label || "Ready",
    tone: providerTone === "failed" ? "failed" : providerTone === "warn" ? "warn" : "good"
  };
}

function renderEmailControlTabs(activeTab) {
  const tabs = [
    ["overview", "Overview"],
    ["operations", "Operations"],
    ["configuration", "Configuration"]
  ];
  return tabs.map(([key, label]) => `
    <button
      class="email-control-tab${activeTab === key ? " is-active" : ""}"
      type="button"
      data-email-control-tab="${key}"
    >${escapeHtml(label)}</button>
  `).join("");
}

function renderEmailControlOverviewTab(emailControl) {
  const overview = emailControl.overview || {};
  const alerts = Array.isArray(overview.activeAlerts) ? overview.activeAlerts : [];
  const providerStatus = overview.providerStatus || { label: "Unknown", tone: "neutral" };
  const topProviders = [
    { label: "Inbox", value: String(overview.inboxCount ?? 0), meta: "Inbound messages" },
    { label: "Sent", value: String(overview.sentCount ?? 0), meta: "Outbound delivered" },
    { label: "Failed", value: String(overview.failedCount ?? 0), meta: "Need review" },
    { label: "Templates", value: String(overview.templatesCount ?? 0), meta: "Saved templates" },
    { label: "Success rate", value: `${Number(overview.successRate ?? 0)}%`, meta: "Sent vs failed" },
    { label: "Provider", value: providerStatus.label || "Unknown", meta: "Current delivery provider" }
  ];
  return `
    <section class="email-control-tab-panel">
      <div class="email-control-stat-grid">
        ${topProviders.map((item) => `
          <div class="email-control-stat-card">
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
            <small>${escapeHtml(item.meta)}</small>
          </div>
        `).join("")}
      </div>
      <div class="email-control-overview-grid">
        <div class="email-control-panel-card">
          <h4>Last activity</h4>
          <div class="email-control-meta-list">
            <div><span>Last sent</span><strong>${escapeHtml(formatAdminTimestamp(overview.lastSentAt))}</strong></div>
            <div><span>Last failed</span><strong>${escapeHtml(formatAdminTimestamp(overview.lastFailedAt))}</strong></div>
            <div><span>Provider status</span><strong class="email-control-tone-${escapeHtml(providerStatus.tone || "neutral")}">${escapeHtml(providerStatus.label || "Unknown")}</strong></div>
          </div>
        </div>
        <div class="email-control-panel-card">
          <h4>Active alerts</h4>
          <div class="email-control-alert-list">
            ${alerts.length ? alerts.map((alert) => `
              <div class="email-control-alert-item is-${escapeHtml(alert.tone || "warn")}">
                <i class="fa-solid ${alert.tone === "failed" ? "fa-triangle-exclamation" : "fa-circle-info"}" aria-hidden="true"></i>
                <span>${escapeHtml(alert.message || "")}</span>
              </div>
            `).join("") : `<div class="muted">No active alerts.</div>`}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderEmailControlOperationsTab(emailControl) {
  const filters = emailControl.filters || {};
  const logs = Array.isArray(emailControl.logs) ? emailControl.logs : [];
  const templates = Array.isArray(emailControl.templates) ? emailControl.templates : [];
  const logTable = buildTableHtml({
    columns: [
      { label: "Time", key: "createdAt", width: "170px", render: (row) => escapeHtml(formatAdminTimestamp(row.createdAt)) },
      { label: "Workspace", key: "workspaceName", width: "160px", render: (row) => `<div style="font-weight:700">${escapeHtml(row.workspaceName || row.workspaceId || "Workspace")}</div><div class="muted" style="font-size:12px">${escapeHtml(row.workspaceId || "")}</div>` },
      { label: "Direction", key: "direction", width: "90px", render: (row) => escapeHtml(row.direction || "outbound"), align: "center" },
      { label: "To / From", key: "toEmail", width: "220px", render: (row) => `<div>${escapeHtml(row.toEmail || "—")}</div><div class="muted" style="font-size:12px">${escapeHtml(row.fromEmail || "")}</div>` },
      { label: "Subject", key: "subject", render: (row) => escapeHtml(row.subject || "—") },
      { label: "Status", key: "status", width: "110px", align: "center", render: (row) => `<span class="secret-status-badge is-${row.status === "failed" ? "failed" : row.status === "sent" ? "ok" : "warn"}">${escapeHtml(row.status || "—")}</span>` },
      { label: "Provider", key: "providerKey", width: "120px", align: "center", render: (row) => escapeHtml(getCostProviderLabel(row.providerKey || "")) },
      { label: "Error", key: "errorMessage", width: "170px", render: (row) => escapeHtml(row.errorMessage || "—") },
      {
        label: "Action",
        key: "_action",
        width: "120px",
        align: "center",
        render: (row) => row.retryable
          ? `<button class="btn btn-ghost" type="button" data-email-control-action="retry-log" data-log-id="${escapeHtml(row.id)}">Retry</button>`
          : `<button class="btn btn-ghost" type="button" disabled>Retry</button>`
      }
    ],
    rows: logs,
    emptyText: "No delivery logs recorded."
  });
  const templateTable = buildTableHtml({
    columns: [
      { label: "Workspace", key: "workspaceName", width: "180px", render: (row) => escapeHtml(row.workspaceName || row.workspaceId || "Workspace") },
      { label: "Template", key: "templateKey", width: "180px", render: (row) => escapeHtml(row.templateKey || "template") },
      { label: "Subject", key: "subject", render: (row) => escapeHtml(row.subject || "—") },
      { label: "Status", key: "enabled", width: "110px", align: "center", render: (row) => `<span class="secret-status-badge is-${row.enabled ? "ok" : "warn"}">${row.enabled ? "Enabled" : "Disabled"}</span>` },
      { label: "Updated", key: "updatedAt", width: "160px", render: (row) => escapeHtml(formatAdminTimestamp(row.updatedAt)) }
    ],
    rows: templates,
    emptyText: "No templates available."
  });
  return `
    <section class="email-control-tab-panel">
      <div class="email-control-toolbar">
        <select class="input secret-field-input" id="emailControlWorkspaceFilter" data-email-control-filter="workspace">
          <option value="">All workspaces</option>
          ${(Array.isArray(state.workspaces) ? state.workspaces : []).map((workspace) => `
            <option value="${escapeHtml(workspace.id)}" ${filters.workspaceId === workspace.id ? "selected" : ""}>${escapeHtml(workspace.name || workspace.id)}</option>
          `).join("")}
        </select>
        <select class="input secret-field-input" id="emailControlStatusFilter" data-email-control-filter="status">
          ${["all", "sent", "failed", "pending", "inbound", "outbound"].map((value) => `
            <option value="${value}" ${filters.status === value ? "selected" : ""}>${escapeHtml(value)}</option>
          `).join("")}
        </select>
        <div class="email-control-quick-links">
          <button class="btn btn-ghost" type="button" data-email-control-action="show-failed">Failed mail</button>
          <button class="btn btn-ghost" type="button" data-email-control-action="open-configuration">Email settings</button>
        </div>
      </div>
      <div class="email-control-panel-card">
        <h4>Delivery logs / message activity</h4>
        <div class="table">${logTable}</div>
      </div>
      <div class="email-control-panel-card">
        <h4>Templates</h4>
        <div class="table">${templateTable}</div>
      </div>
    </section>
  `;
}

function renderEmailControlConfigurationTab(emailControl) {
  const settings = emailControl.settings || {};
  const owner = settings.ownerSettings || {};
  const workspace = settings.workspaceSettings || {};
  const effective = settings.effectiveSender || {};
  const lastTest = settings.lastTestResult || null;
  const workspaceId = getWorkspaceForAiBudget();
  const workspaceLabel = workspaceId ? getWorkspaceLabelById(workspaceId) : "No workspace selected";
  return `
    <section class="email-control-tab-panel">
      <div class="email-control-preview-card">
        <div>
          <strong>Current effective sender</strong>
          <div class="muted">${escapeHtml(effective.senderName || "Not configured")} • ${escapeHtml(effective.fromEmail || "No email")}</div>
          <div class="muted">${escapeHtml(settings.helperText || "")}</div>
        </div>
        <div class="email-control-preview-badges">
          <span class="secret-status-badge is-${effective.mode === "workspace" ? "ok" : "warn"}">${escapeHtml(effective.mode === "workspace" ? "Workspace override" : "Owner fallback")}</span>
        </div>
      </div>
      <div class="ai-budget-form-grid">
        <div class="secret-field-row ai-budget-field-row owner-email-block">
          <label class="owner-email-section-title" for="emailControlOwnerName">
            <span>Owner Email</span>
            <small>Main platform email identity.</small>
          </label>
          <label class="toggle owner-email-toggle">
            <input id="emailControlOwnerEnabled" type="checkbox" ${owner.owner_enabled ? "checked" : ""} />
            <span>Enabled</span>
          </label>
          <input class="input secret-field-input" id="emailControlOwnerName" value="${escapeHtml(owner.owner_name || "Platform Owner")}" placeholder="Platform Owner" />
          <input class="input secret-field-input" id="emailControlOwnerEmail" type="email" value="${escapeHtml(owner.owner_email || "")}" placeholder="owner@example.com" />
          <input class="input secret-field-input" id="emailControlOwnerPrefix" value="${escapeHtml(owner.owner_subject_prefix || "[StudiesTalk Owner]")}" placeholder="[StudiesTalk Owner]" />
          <textarea class="input secret-field-input" id="emailControlOwnerSignature" rows="4" placeholder="Kind regards,&#10;Platform Owner">${escapeHtml(owner.owner_signature || "")}</textarea>
          <div class="secret-row-actions owner-email-actions">
            <button class="btn btn-primary" type="button" data-email-control-action="save-owner">Save owner email</button>
          </div>
        </div>
        <div class="secret-field-row ai-budget-field-row owner-email-block">
          <label class="owner-email-section-title" for="emailControlWorkspaceEmail">
            <span>Workspace Email</span>
            <small>Selected workspace: ${escapeHtml(workspaceLabel)}</small>
          </label>
          <select class="input secret-field-input" id="emailControlConfigurationWorkspace" data-email-control-filter="workspace">
            <option value="">Select workspace</option>
            ${(Array.isArray(state.workspaces) ? state.workspaces : []).map((entry) => `
              <option value="${escapeHtml(entry.id)}" ${workspaceId === entry.id ? "selected" : ""}>${escapeHtml(entry.name || entry.id)}</option>
            `).join("")}
          </select>
          <label class="toggle owner-email-toggle">
            <input id="emailControlWorkspaceEnabled" type="checkbox" ${workspace.workspace_email_enabled ? "checked" : ""} ${workspaceId ? "" : "disabled"} />
            <span>Enable workspace email</span>
          </label>
          <input class="input secret-field-input" id="emailControlWorkspaceEmail" type="email" value="${escapeHtml(workspace.workspace_email || "")}" placeholder="school-admin@example.com" ${workspaceId ? "" : "disabled"} />
          <input class="input secret-field-input" id="emailControlWorkspaceSender" value="${escapeHtml(workspace.workspace_sender_name || workspaceLabel)}" placeholder="School sender name" ${workspaceId ? "" : "disabled"} />
          <input class="input secret-field-input" id="emailControlWorkspacePrefix" value="${escapeHtml(workspace.workspace_subject_prefix || "[School]")}" placeholder="[School]" ${workspaceId ? "" : "disabled"} />
          <textarea class="input secret-field-input" id="emailControlWorkspaceSignature" rows="4" placeholder="Signature / footer" ${workspaceId ? "" : "disabled"}>${escapeHtml(workspace.workspace_signature || "")}</textarea>
          <label class="toggle owner-email-toggle">
            <input id="emailControlWorkspaceFallback" type="checkbox" ${workspace.use_owner_fallback ? "checked" : ""} ${workspaceId ? "" : "disabled"} />
            <span>Use owner fallback</span>
          </label>
          <div class="secret-row-actions owner-email-actions">
            <button class="btn btn-primary" type="button" data-email-control-action="save-workspace" ${workspaceId ? "" : "disabled"}>Save workspace email</button>
          </div>
        </div>
      </div>
      <div class="secret-field-row ai-budget-field-row owner-email-block owner-email-block--test">
        <label class="owner-email-section-title" for="emailControlTestTo">
          <span>Send Test Email</span>
          <small>Owner fallback vs workspace override is applied based on the selected mode.</small>
        </label>
        <select class="input secret-field-input" id="emailControlTestMode">
          <option value="owner">Owner</option>
          <option value="workspace" ${workspaceId ? "" : "disabled"}>Selected workspace</option>
        </select>
        <input class="input secret-field-input" id="emailControlTestTo" type="email" placeholder="recipient@example.com" />
        <input class="input secret-field-input" id="emailControlTestSubject" placeholder="Test subject" />
        <textarea class="input secret-field-input" id="emailControlTestMessage" rows="4" placeholder="Write a test message..."></textarea>
        <div class="secret-row-actions owner-email-actions">
          <button class="btn btn-secondary" type="button" data-email-control-action="send-test">Send test</button>
          ${lastTest ? `<button class="btn btn-ghost" type="button" data-email-control-action="open-operations">Delivery logs</button>` : ""}
        </div>
        <div class="email-control-last-test">
          <strong>Last test result</strong>
          <span>${lastTest ? `${escapeHtml(formatAdminTimestamp(lastTest.createdAt))} • ${escapeHtml(lastTest.status || "sent")} • ${escapeHtml(lastTest.toEmail || "")}` : "No test email sent yet."}</span>
        </div>
      </div>
    </section>
  `;
}

function ensureActiveSecretProvider(providers) {
  const list = Array.isArray(providers) ? providers : [];
  const current = String(state.secrets.activeProvider || "").trim();
  if (current === "email-control" || current === "owner-email") {
    if (current === "owner-email") {
      state.secrets.emailControl.activeTab = "configuration";
      state.secrets.activeProvider = "email-control";
    }
    return { provider: "email-control", label: "Email Control Center", secrets: [] };
  }
  if (current === "ai-budget") {
    return { provider: "ai-budget", label: "AI Budget / Governance", secrets: [] };
  }
  if (!list.length) {
    state.secrets.activeProvider = "email-control";
    return { provider: "email-control", label: "Email Control Center", secrets: [] };
  }
  const matched = list.find((provider) => String(provider.provider || "") === current);
  if (matched) return matched;
  state.secrets.activeProvider = "email-control";
  return { provider: "email-control", label: "Email Control Center", secrets: [] };
}

function renderSecretsPanel() {
  const grid = $("secretProviderGrid");
  const aiBudgetMount = $("secretsAiBudgetMount");
  const warning = $("secretsMasterWarning");
  const envBadge = $("secretsEnvironmentBadge");
  if (!grid) return;

  if (envBadge) {
    envBadge.textContent = state.secrets.environment || "production";
  }
  if (warning) {
    warning.hidden = !!state.secrets.enabled;
  }
  if (aiBudgetMount) {
    aiBudgetMount.innerHTML = "";
  }

  const providers = Array.isArray(state.secrets.providers) ? state.secrets.providers : [];
  const activeProvider = ensureActiveSecretProvider(providers);
  const aiBudgetState = state.secrets.aiBudget || {};
  const ownerEmailState = state.secrets.ownerEmail || {};
  const emailControlState = state.secrets.emailControl || {};
  const aiBudgetLimit = Number(
    aiBudgetState.workspaceBudget?.monthly_limit_eur
      ?? aiBudgetState.workspaceBudget?.monthly_cap_eur
      ?? aiBudgetState.defaultBudget?.monthly_limit_eur
      ?? aiBudgetState.defaultBudget?.monthly_cap_eur
      ?? 5
  );
  const aiBudgetUsed = Number(aiBudgetState.workspaceBudget?.used_eur ?? 0);
  const providerOrder = ["openai", "twilio", "email", "google", "jitsi", "storage", "analytics"];
  const orderedProviders = [...providers].sort((a, b) => {
    const aIndex = providerOrder.indexOf(String(a.provider || ""));
    const bIndex = providerOrder.indexOf(String(b.provider || ""));
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });
  const emailControlBadge = getEmailControlStatusBadge();
  const listMarkup = [
    {
      provider: "email-control",
      label: "Email Control Center",
      meta: "3 tabs",
      badge: emailControlBadge
    },
    {
      provider: "ai-budget",
      label: "AI Budget / Governance",
      meta: "5 controls",
      badge: {
        label: aiBudgetUsed >= aiBudgetLimit ? "Cap reached" : "Active",
        tone: aiBudgetUsed >= aiBudgetLimit ? "warn" : "good"
      }
    },
    ...orderedProviders.map((provider) => {
      const badge = getSecretProviderBadge(provider);
      const configuredCount = Array.isArray(provider.secrets)
        ? provider.secrets.filter((field) => field.enabled || field.source === "env" || field.source === "db").length
        : 0;
      return {
        provider: provider.provider,
        label: provider.label || provider.provider,
        meta: `${configuredCount} fields`,
        badge
      };
    })
  ].map((item) => {
    const isActive = activeProvider && item.provider === activeProvider.provider;
    return `
      <button
        class="secret-provider-nav${isActive ? " is-active" : ""}"
        type="button"
        data-secret-nav="${escapeHtml(item.provider)}"
        aria-pressed="${isActive ? "true" : "false"}"
      >
        <span class="secret-provider-nav-copy">
          <span class="secret-provider-nav-title">${escapeHtml(item.label)}</span>
          <span class="secret-provider-nav-meta">${escapeHtml(item.meta)}</span>
        </span>
        <span class="secret-status-badge is-${item.badge.tone}">${escapeHtml(item.badge.label)}</span>
      </button>
    `;
  }).join("");

  let detailMarkup = "";
  if (activeProvider?.provider === "email-control") {
    detailMarkup = `
      <section class="secret-card ai-budget-secret-card email-control-shell" aria-label="Email Control Center">
        <div class="secret-card-head ai-budget-card-head">
          <div>
            <h3>Email Control Center</h3>
            <p>Operational email usage, sender behavior, logs, templates, and test sending.</p>
          </div>
          <span class="secret-status-badge is-${emailControlBadge.tone}">${escapeHtml(emailControlBadge.label)}</span>
        </div>
        <div class="email-control-tabs" role="tablist" aria-label="Email Control Center tabs">
          ${renderEmailControlTabs(emailControlState.activeTab || "overview")}
        </div>
        ${emailControlState.loadError ? `<div class="secret-card-status is-error">${escapeHtml(emailControlState.loadError)}</div>` : ""}
        ${emailControlState.activeTab === "operations"
          ? renderEmailControlOperationsTab(emailControlState)
          : emailControlState.activeTab === "configuration"
            ? renderEmailControlConfigurationTab(emailControlState)
            : renderEmailControlOverviewTab(emailControlState)}
        <div class="ai-budget-feedback${emailControlState.feedback?.tone ? ` is-${emailControlState.feedback.tone}` : ""}" id="emailControlFeedbackInline">${escapeHtml(emailControlState.feedback?.message || "")}</div>
      </section>
    `;
  } else if (activeProvider?.provider === "ai-budget") {
    const workspaceId = getWorkspaceForAiBudget();
    const workspaceLabel = workspaceId && workspaceId !== "all" ? workspaceId : "No workspace selected";
    const budgetState = state.secrets.aiBudget || {};
    const defaultBudget = budgetState.defaultBudget || {};
    const workspaceBudget = budgetState.workspaceBudget || {};
    const feedback = budgetState.feedback || { message: "", tone: "" };
    const loadError = budgetState.loadError || "";
    const effectiveLimit = Number(
      workspaceBudget.monthly_limit_eur
        ?? workspaceBudget.monthly_cap_eur
        ?? defaultBudget.monthly_limit_eur
        ?? defaultBudget.monthly_cap_eur
        ?? 5
    );
    const used = Number(workspaceBudget.used_eur ?? workspaceBudget.used ?? 0);
    const remaining = Math.max(0, effectiveLimit - used);
    const hasWorkspaceOverride = workspaceBudget.workspace_id && workspaceBudget.workspace_id !== "all";
    const currentDefault = Number(defaultBudget.monthly_limit_eur ?? defaultBudget.monthly_cap_eur ?? 5);
    const currentWorkspaceCap = Number(workspaceBudget.monthly_limit_eur ?? workspaceBudget.monthly_cap_eur ?? 0);
    const percent = effectiveLimit > 0 ? Math.min(100, (used / effectiveLimit) * 100) : 0;

    detailMarkup = `
      <section class="secret-card ai-budget-secret-card" aria-label="AI budget governance">
        <div class="secret-card-head ai-budget-card-head">
          <div>
            <h3>AI Budget / Governance</h3>
            <p>Budget control, usage tracking, and hard-cap enforcement for every workspace.</p>
          </div>
          <span class="secret-status-badge is-${used >= effectiveLimit ? "warn" : "good"}">${used >= effectiveLimit ? "Cap reached" : "Active"}</span>
        </div>

        <div class="ai-budget-summary-grid">
          <div class="ai-budget-stat">
            <span class="ai-budget-stat-label">Global default</span>
            <strong>${formatEUR(currentDefault)}</strong>
            <small>Monthly default for all schools</small>
          </div>
          <div class="ai-budget-stat">
            <span class="ai-budget-stat-label">Workspace cap</span>
            <strong>${formatEUR(effectiveLimit)}</strong>
            <small>${hasWorkspaceOverride ? "Override active" : "Using global default"}</small>
          </div>
          <div class="ai-budget-stat">
            <span class="ai-budget-stat-label">Used this month</span>
            <strong>${formatEUR(used)}</strong>
            <small>Tracked from AI usage ledger</small>
          </div>
          <div class="ai-budget-stat">
            <span class="ai-budget-stat-label">Remaining</span>
            <strong>${formatEUR(remaining)}</strong>
            <small>${used >= effectiveLimit ? "New AI calls are blocked" : "Budget available"}</small>
          </div>
        </div>

        <div class="ai-budget-progress" aria-hidden="true">
          <span class="ai-budget-progress-bar" style="width:${percent}%"></span>
        </div>

        <div class="ai-budget-governance-list">
          <div><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Global AI budget is enforced across all schools.</span></div>
          <div><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Per-school override applies by workspace.</span></div>
          <div><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Usage tracking reads from <code>ai_usage_ledger</code> with ISO timestamps.</span></div>
          <div><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Hard limit enforcement blocks OpenAI realtime session creation when the cap is exceeded.</span></div>
          <div><i class="fa-solid fa-circle-check" aria-hidden="true"></i><span>Cost tracking is written through <code>/api/ai/usage</code> and <code>/api/ai/runtime/end</code>.</span></div>
        </div>

        <div class="ai-budget-form-grid">
          <div class="secret-field-row ai-budget-field-row">
            <label for="secretsAiDefaultBudget">
              <span>Default monthly cap</span>
              <small>Applies to all workspaces unless overridden.</small>
              <div class="secret-mask">Current: <code>${escapeHtml(formatEUR(currentDefault))}</code></div>
            </label>
            <input
              class="input secret-field-input"
              id="secretsAiDefaultBudget"
              type="number"
              min="0"
              step="0.10"
              value="${escapeHtml(currentDefault.toFixed(2))}"
              placeholder="5.00"
            />
            <div class="secret-row-actions">
              <button class="btn btn-primary" type="button" data-ai-budget-action="save-default">Save default</button>
            </div>
          </div>

          <div class="secret-field-row ai-budget-field-row">
            <label for="secretsAiWorkspaceBudget">
              <span>Workspace override</span>
              <small>Selected workspace: ${escapeHtml(workspaceLabel)}</small>
              <div class="secret-mask">Current: <code>${escapeHtml(formatEUR(currentWorkspaceCap || effectiveLimit))}</code> ${hasWorkspaceOverride ? '<span class="secret-source-pill is-db">Override</span>' : '<span class="secret-source-pill is-env">Default</span>'}</div>
            </label>
            <input
              class="input secret-field-input"
              id="secretsAiWorkspaceBudget"
              type="number"
              min="0"
              step="0.10"
              value="${workspaceId && workspaceId !== "all" ? escapeHtml((currentWorkspaceCap || effectiveLimit).toFixed(2)) : ""}"
              placeholder="${workspaceId && workspaceId !== "all" ? "1.00" : "Select a workspace first"}"
              ${workspaceId && workspaceId !== "all" ? "" : "disabled"}
            />
            <div class="secret-row-actions">
              <button class="btn btn-secondary" type="button" data-ai-budget-action="save-workspace" ${workspaceId && workspaceId !== "all" ? "" : "disabled"}>Save override</button>
            </div>
          </div>
        </div>

        <div class="secret-card-warning">
          <strong>Implementation note:</strong> cost tracking uses structured server-side usage endpoints with workspace attribution instead of ad hoc client inserts. That keeps billing and governance data consistent.
        </div>

        ${loadError ? `<div class="secret-card-status is-error">${escapeHtml(loadError)}</div>` : ""}
        <div class="ai-budget-feedback${feedback.tone ? ` is-${feedback.tone}` : ""}" id="secretsAiBudgetFeedback">${escapeHtml(feedback.message || "")}</div>
      </section>
    `;
  } else if (activeProvider?.provider === "owner-email") {
    const workspaceId = getWorkspaceForAiBudget();
    const workspaceLabel = workspaceId && workspaceId !== "all" ? getWorkspaceLabelById(workspaceId) : "Default Workspace";
    const ownerState = state.secrets.ownerEmail || {};
    const ownerSettings = ownerState.ownerSettings || {};
    const workspaceSettings = ownerState.workspaceSettings || {};
    const feedback = ownerState.feedback || { message: "", tone: "" };
    const loadError = ownerState.loadError || "";
    const ownerEnabled = !!ownerSettings.enabled;
    const workspaceEnabled = !!workspaceSettings.enabled;

    detailMarkup = `
      <section class="secret-card ai-budget-secret-card owner-email-detail-card" aria-label="Owner email setup">
        <div class="secret-card-head ai-budget-card-head">
          <div>
            <h3>Owner Email Setup</h3>
            <p>Manage system-wide and workspace email behavior.</p>
          </div>
          <span class="secret-status-badge is-${ownerEnabled ? "good" : "warn"}">${ownerEnabled ? "Enabled" : "Needs setup"}</span>
        </div>

        <div class="ai-budget-form-grid">
          <div class="secret-field-row ai-budget-field-row owner-email-block">
            <label class="owner-email-section-title" for="ownerEmailDisplayNameInline">
              <span>Owner Email</span>
              <small>Main platform email identity</small>
              <div class="secret-mask">Current: <code>${escapeHtml(ownerSettings.owner_email || "owner@example.com")}</code></div>
            </label>
            <label class="toggle owner-email-toggle">
              <input id="ownerEmailEnabledInline" type="checkbox" ${ownerEnabled ? "checked" : ""} />
              <span>Enabled</span>
            </label>
            <input class="input secret-field-input" id="ownerEmailDisplayNameInline" value="${escapeHtml(ownerSettings.display_name || "Platform Owner")}" placeholder="Platform Owner" />
            <input class="input secret-field-input" id="ownerEmailAddressInline" type="email" value="${escapeHtml(ownerSettings.owner_email || "")}" placeholder="owner@example.com" />
            <input class="input secret-field-input" id="ownerEmailSubjectPrefixInline" value="${escapeHtml(ownerSettings.subject_prefix || "[StudiesTalk Owner]")}" placeholder="[StudiesTalk Owner]" />
            <textarea class="input secret-field-input" id="ownerEmailFooterInline" rows="4" placeholder="Kind regards,&#10;Platform Owner">${escapeHtml(ownerSettings.footer_text || "")}</textarea>
            <div class="secret-row-actions owner-email-actions">
              <button class="btn btn-primary" type="button" data-owner-email-action="save-owner">Save owner email</button>
            </div>
          </div>

          <div class="secret-field-row ai-budget-field-row owner-email-block">
            <label class="owner-email-section-title" for="workspaceEmailBrandInline">
              <span>Workspace Email</span>
              <small>Override email per school</small>
              <div class="secret-mask">Current: <code>${escapeHtml(workspaceLabel)}</code> ${workspaceId && workspaceId !== "all" ? '<span class="secret-source-pill is-db">Workspace</span>' : '<span class="secret-source-pill is-env">Select workspace</span>'}</div>
            </label>
            <label class="toggle owner-email-toggle">
              <input id="workspaceEmailEnabledInline" type="checkbox" ${workspaceEnabled ? "checked" : ""} ${workspaceId && workspaceId !== "all" ? "" : "disabled"} />
              <span>Enable workspace email</span>
            </label>
            <input class="input secret-field-input" id="workspaceEmailBrandInline" value="${escapeHtml(workspaceSettings.brand_school_name || workspaceLabel)}" placeholder="Default Workspace" ${workspaceId && workspaceId !== "all" ? "" : "disabled"} />
            <div class="secret-inline-actions">
              <input class="input secret-field-input" id="workspaceEmailReplyToInline" type="email" value="${escapeHtml(workspaceSettings.reply_to_email || "")}" placeholder="school-admin@example.com" ${workspaceId && workspaceId !== "all" ? "" : "disabled"} />
              <button class="btn btn-ghost" type="button" data-owner-email-action="use-owner" ${workspaceId && workspaceId !== "all" ? "" : "disabled"}>Use owner</button>
            </div>
            <input class="input secret-field-input" id="workspaceEmailSubjectPrefixInline" value="${escapeHtml(workspaceSettings.subject_prefix || "[School]")}" placeholder="[School]" ${workspaceId && workspaceId !== "all" ? "" : "disabled"} />
            <textarea class="input secret-field-input" id="workspaceEmailFooterInline" rows="4" placeholder="Signature / footer" ${workspaceId && workspaceId !== "all" ? "" : "disabled"}>${escapeHtml(workspaceSettings.footer_text || "")}</textarea>
            <div class="secret-row-actions owner-email-actions">
              <button class="btn btn-primary" type="button" data-owner-email-action="save-workspace" ${workspaceId && workspaceId !== "all" ? "" : "disabled"}>Save workspace email</button>
            </div>
          </div>
        </div>

        <div class="secret-field-row ai-budget-field-row owner-email-block owner-email-block--test">
          <label class="owner-email-section-title" for="ownerEmailTestToInline">
            <span>Send Test Email</span>
            <small>Use the effective owner or workspace identity to validate delivery.</small>
          </label>
          <input class="input secret-field-input" id="ownerEmailTestToInline" type="email" placeholder="recipient@example.com" />
          <input class="input secret-field-input" id="ownerEmailTestSubjectInline" placeholder="Test subject" />
          <select class="input secret-field-input" id="ownerEmailTestScopeInline">
            <option value="owner">Owner email</option>
            <option value="workspace">Workspace email</option>
          </select>
          <textarea class="input secret-field-input" id="ownerEmailTestBodyInline" rows="4" placeholder="Write a test message..."></textarea>
          <div class="secret-row-actions owner-email-actions">
            <button class="btn btn-secondary" type="button" data-owner-email-action="send-test">Send test</button>
          </div>
        </div>

        ${loadError ? `<div class="secret-card-status is-error">${escapeHtml(loadError)}</div>` : ""}
        <div class="ai-budget-feedback${feedback.tone ? ` is-${feedback.tone}` : ""}" id="ownerEmailStatusInline">${escapeHtml(feedback.message || "")}</div>
      </section>
    `;
  } else if (activeProvider) {
    const resolvedProvider = providers.find((provider) => provider.provider === activeProvider.provider);
    if (!resolvedProvider) {
      detailMarkup = `<div class="card"><div class="muted" style="padding:16px;">Provider not found.</div></div>`;
    } else {
      const badge = getSecretProviderBadge(resolvedProvider);
      const status = getSecretStatusState(resolvedProvider.provider);
      const fieldRows = (resolvedProvider.secrets || []).map((field) => {
      const inputType = field.secret ? "password" : "text";
      const placeholder = field.secret
        ? "Enter new value to update"
        : (field.displayValue || "");
      const isIgnored = !!field.ignored;
      const displayValue = field.secret
        ? (field.maskedValue || "Not stored")
        : (field.displayValue || field.maskedValue || "Not stored");
      const rotateButton = field.secret
        ? `<button class="btn btn-ghost" type="button" data-secret-action="rotate" data-provider="${resolvedProvider.provider}" data-key-name="${field.keyName}">Rotate</button>`
        : "";
      const deleteButton = field.enabled || field.source === "db"
        ? `<button class="btn btn-ghost" type="button" data-secret-action="delete" data-provider="${resolvedProvider.provider}" data-key-name="${field.keyName}">Delete</button>`
        : "";
      const inputMarkup = field.hideInput
        ? `<div class="secret-field-note is-muted">${escapeHtml(field.ignoredReason || "Ignored.")}</div>`
        : `<input
            class="input secret-field-input"
            type="${inputType}"
            autocomplete="off"
            data-secret-input="true"
            data-provider="${resolvedProvider.provider}"
            data-key-name="${field.keyName}"
            placeholder="${escapeHtml(placeholder)}"
          />`;
      return `
        <div class="secret-field-row${isIgnored ? " is-ignored" : ""}">
          <label>
            <span>${escapeHtml(field.label || field.keyName)}</span>
            <small>${escapeHtml(field.keyName)}</small>
            <div class="secret-mask">Current: <code>${escapeHtml(displayValue)}</code> ${getSecretSourcePill(field.source)}</div>
          </label>
          ${inputMarkup}
          <div class="secret-row-actions">
            ${rotateButton}
            ${deleteButton}
          </div>
        </div>
      `;
    }).join("");
      const providerWarning = getProviderScopedWarning(resolvedProvider);

      detailMarkup = `
      <article class="secret-card" data-provider-card="${resolvedProvider.provider}">
        <div class="secret-card-head">
          <div>
            <h3>${escapeHtml(resolvedProvider.label || resolvedProvider.provider)}</h3>
            <p>Encrypted at rest. Raw secrets are never returned by the API.</p>
          </div>
          <span class="secret-status-badge is-${badge.tone}">${escapeHtml(badge.label)}</span>
        </div>
        <div class="secret-field-list">${fieldRows}</div>
        ${providerWarning ? `<div class="secret-field-note is-warning">${escapeHtml(providerWarning)}</div>` : ""}
        <div class="secret-card-warning">
          <strong>Warning:</strong> after save or rotate, only masked status remains visible. Changing the platform master key without re-encryption makes stored secrets unreadable.
        </div>
        <div class="secret-actions">
          <button class="btn btn-primary" type="button" data-secret-action="save-provider" data-provider="${resolvedProvider.provider}">Save changes</button>
          <button class="btn btn-secondary" type="button" data-secret-action="test-provider" data-provider="${resolvedProvider.provider}">Test connection</button>
        </div>
        <div class="secret-card-status${status.tone ? ` is-${status.tone}` : ""}" data-secret-status="${resolvedProvider.provider}">${escapeHtml(status.message || "")}</div>
      </article>
    `;
    }
  }

  grid.innerHTML = `
    <aside class="secret-provider-list" aria-label="Secret providers">
      ${listMarkup}
    </aside>
    <div class="secret-provider-detail">
      ${detailMarkup}
    </div>
  `;
}

async function refreshSecrets() {
  const payload = await api("/api/admin/secrets");
  state.secrets.enabled = !!payload?.enabled;
  state.secrets.environment = payload?.environment || "production";
  state.secrets.providers = Array.isArray(payload?.providers) ? payload.providers : [];
  await refreshSecretsAiBudget();
  await refreshSecretsOwnerEmail();
  await refreshSecretsEmailControl();
  renderSecretsPanel();
}

const PAYMENT_GATEWAY_FIELD_LABELS = {
  STRIPE_PUBLIC_KEY: "Public key",
  STRIPE_SECRET_KEY: "Secret key",
  STRIPE_WEBHOOK_SECRET: "Webhook secret",
  STRIPE_PRICE_STARTER: "Starter price ID",
  STRIPE_PRICE_PRO: "Pro price ID",
  STRIPE_PRICE_ENTERPRISE: "Enterprise price ID",
  PAYPAL_CLIENT_ID: "Client ID",
  PAYPAL_CLIENT_SECRET: "Client secret",
  PAYPAL_WEBHOOK_ID: "Webhook ID",
  PAYPAL_MODE: "PayPal mode",
  MOLLIE_API_KEY: "API key",
  MOLLIE_WEBHOOK_SECRET: "Webhook secret",
  MOLLIE_PROFILE_ID: "Profile ID"
};

function setPaymentGatewaysFeedback(message = "", tone = "") {
  state.paymentGateways.feedback = { message, tone };
  const el = $("paymentGatewaysError");
  if (!el) return;
  el.textContent = message || "";
  el.hidden = !message;
  el.className = `alert${tone ? ` is-${tone}` : ""}`;
}

function getPaymentProvider(providerKey) {
  const key = String(providerKey || state.paymentGateways.activeProvider || "stripe").toLowerCase();
  return (state.paymentGateways.providers || []).find((provider) => provider.provider === key) || null;
}

function gatewayBadgeTone(provider) {
  if (!provider?.enabled) return { label: "Disabled", tone: "warn" };
  if ((provider.fields || []).some((field) => field.configured)) return { label: provider.active ? "Active" : "Ready", tone: "ok" };
  return { label: "Needs keys", tone: "failed" };
}

function gatewaySummaryIcon(title = "") {
  const key = String(title || "").toLowerCase();
  if (key.includes("stripe")) return "fa-brands fa-stripe";
  if (key.includes("paypal")) return "fa-brands fa-paypal";
  if (key.includes("mollie")) return "fa-solid fa-credit-card";
  if (key.includes("active")) return "fa-solid fa-toggle-on";
  if (key.includes("webhook")) return "fa-solid fa-link";
  if (key.includes("last")) return "fa-regular fa-clock";
  if (key.includes("failed")) return "fa-solid fa-triangle-exclamation";
  return "fa-solid fa-circle-info";
}

function gatewayVisualKey(value = "") {
  const key = String(value || "").toLowerCase();
  if (key.includes("stripe")) return "stripe";
  if (key.includes("paypal")) return "paypal";
  if (key.includes("mollie")) return "mollie";
  if (key.includes("active")) return "active";
  if (key.includes("webhook")) return "webhook";
  if (key.includes("failed")) return "failed";
  if (key.includes("last") || key.includes("event")) return "event";
  return "default";
}

function gatewayFieldInputType(field) {
  if (field.secret) return "password";
  if (/PRICE|PROFILE|PUBLIC|CLIENT|MODE/.test(field.keyName || "")) return "text";
  return "text";
}

function renderPaymentGatewaysPanel() {
  const summaryEl = $("paymentGatewaySummary");
  const tabsEl = $("paymentGatewayTabs");
  const panelEl = $("paymentGatewayPanel");
  const payloadState = state.paymentGateways || {};
  const providers = Array.isArray(payloadState.providers) ? payloadState.providers : [];
  const specialTab = payloadState.activeProvider === "webhooks" || payloadState.activeProvider === "events";
  const activeProvider = specialTab ? null : (getPaymentProvider(payloadState.activeProvider) || providers[0] || null);
  if (activeProvider) state.paymentGateways.activeProvider = activeProvider.provider;

  if (summaryEl) {
    const webhookHealth = payloadState.webhookHealth || {};
    const lastPaymentEvent = (payloadState.auditEvents || []).find((event) => /payment|active_provider|saved|tested|rotated|deleted/.test(event.event_type || ""));
    const failedEvents = (payloadState.auditEvents || []).filter((event) => event.status === "failed").length;
    const cards = [
      ...["stripe", "paypal", "mollie"].map((key) => {
        const provider = providers.find((entry) => entry.provider === key) || { label: key, enabled: false, fields: [] };
        const badge = gatewayBadgeTone(provider);
        return {
          title: provider.label || key,
          value: badge.label,
          tone: badge.tone,
          meta: provider.lastTestAt ? `Last test ${formatAdminTimestamp(provider.lastTestAt)}` : "Not tested"
        };
      }),
      { title: "Active provider", value: payloadState.activeProvider || "stripe", tone: "ok", meta: payloadState.environment || "test" },
      { title: "Webhook health", value: webhookHealth.signatureVerificationStatus || "Not tested", tone: "warn", meta: webhookHealth.lastWebhookReceivedAt ? `Last ${formatAdminTimestamp(webhookHealth.lastWebhookReceivedAt)}` : "No webhook event" },
      { title: "Last payment event", value: lastPaymentEvent ? formatAdminTimestamp(lastPaymentEvent.created_at) : "None", tone: "warn", meta: lastPaymentEvent?.message || "No gateway events yet" },
      { title: "Failed events", value: String(failedEvents), tone: failedEvents ? "failed" : "ok", meta: "Latest provider/audit failures" }
    ];
    summaryEl.innerHTML = cards.map((card) => `
      <article class="gateway-card is-${escapeHtml(card.tone || "neutral")} gateway-visual-${escapeHtml(gatewayVisualKey(card.title))}">
        <div class="gateway-card-top">
          <span>${escapeHtml(card.title)}</span>
          <i class="${escapeHtml(gatewaySummaryIcon(card.title))}" aria-hidden="true"></i>
        </div>
        <strong>${escapeHtml(card.value)}</strong>
        <small>${escapeHtml(card.meta || "")}</small>
      </article>
    `).join("");
  }

  if (tabsEl) {
    tabsEl.innerHTML = [
      ...providers.map((provider) => ({ key: provider.provider, label: provider.label || provider.provider })),
      { key: "webhooks", label: "Webhooks" },
      { key: "events", label: "Audit / Events" }
    ].map((item) => `
      <button class="gateway-tab gateway-visual-${escapeHtml(gatewayVisualKey(item.key))}${payloadState.activeProvider === item.key ? " is-active" : ""}" type="button" data-gateway-provider="${escapeHtml(item.key)}">
        <i class="${escapeHtml(gatewaySummaryIcon(item.key))}" aria-hidden="true"></i>
        <span>${escapeHtml(item.label)}</span>
      </button>
    `).join("");
  }

  if (!panelEl) return;
  if (!activeProvider && !specialTab) {
    panelEl.innerHTML = `<div class="gateway-empty">Payment gateway settings are not available.</div>`;
    return;
  }

  if (payloadState.activeProvider === "webhooks") {
    const webhookHealth = payloadState.webhookHealth || {};
    panelEl.innerHTML = `
      <section class="gateway-provider-panel-card">
        <div class="secret-card-head">
          <div>
            <h3>Webhook Health</h3>
            <p>Signature and event status. Raw webhook secrets are never shown.</p>
          </div>
          <button class="btn btn-ghost" type="button" data-gateway-action="refresh-events">Refresh events</button>
        </div>
        <div class="gateway-webhook-grid">
          ${["stripe", "paypal", "mollie"].map((key) => `<div><span>${escapeHtml(key)}</span><strong>${escapeHtml(webhookHealth[key] || "not_tested")}</strong></div>`).join("")}
          <div><span>Last received</span><strong>${escapeHtml(formatAdminTimestamp(webhookHealth.lastWebhookReceivedAt))}</strong></div>
          <div><span>Last failed</span><strong>${escapeHtml(webhookHealth.lastFailedWebhook?.message || "None")}</strong></div>
          <div><span>Signature verification</span><strong>${escapeHtml(webhookHealth.signatureVerificationStatus || "Not tested")}</strong></div>
        </div>
      </section>
    `;
    return;
  }

  if (payloadState.activeProvider === "events") {
    const rows = payloadState.auditEvents || [];
    panelEl.innerHTML = `
      <section class="gateway-provider-panel-card">
        <div class="secret-card-head">
          <div>
            <h3>Gateway Events</h3>
            <p>Provider changes, tests, rotations, deletes, and webhook events.</p>
          </div>
          <button class="btn btn-ghost" type="button" data-gateway-action="refresh-events">Refresh events</button>
        </div>
        <div class="gateway-events-table">
          ${buildTableHtml({
            rows,
            emptyText: "No payment gateway events yet.",
            columns: [
              { label: "Time", key: "created_at", width: "170px", render: (row) => escapeHtml(formatAdminTimestamp(row.created_at)) },
              { label: "Provider", key: "provider", width: "110px", render: (row) => escapeHtml(row.provider || "platform") },
              { label: "Event", key: "event_type", render: (row) => escapeHtml(row.event_type || "") },
              { label: "Status", key: "status", width: "100px", render: (row) => `<span class="gateway-status-badge is-${row.status === "failed" ? "failed" : "ok"}">${escapeHtml(row.status || "ok")}</span>` },
              { label: "Message", key: "message", render: (row) => escapeHtml(row.message || "—") }
            ]
          })}
        </div>
      </section>
    `;
    return;
  }

  const badge = gatewayBadgeTone(activeProvider);
  const fieldRows = (activeProvider.fields || []).map((field) => {
    const current = field.maskedValue || (field.configured ? "Configured" : "Not stored");
    const isSecret = !!field.secret;
    const source = field.source || "unset";
    return `
      <div class="gateway-secret-row">
        <div class="gateway-secret-meta">
          <div class="gateway-secret-title">
            <span>${escapeHtml(PAYMENT_GATEWAY_FIELD_LABELS[field.keyName] || field.keyName)}</span>
            ${isSecret ? `<span class="gateway-secret-chip">Secret</span>` : ""}
          </div>
          <small>${escapeHtml(field.keyName)}</small>
          <div class="gateway-secret-current">
            <span>Current</span>
            <code>${escapeHtml(current)}</code>
            <span class="secret-source-pill is-${escapeHtml(source)}">${escapeHtml(source)}</span>
          </div>
        </div>
        <input
          class="input secret-field-input"
          type="${gatewayFieldInputType(field)}"
          autocomplete="off"
          data-gateway-input="true"
          data-provider="${escapeHtml(activeProvider.provider)}"
          data-key-name="${escapeHtml(field.keyName)}"
          data-secret="${field.secret ? "1" : "0"}"
          placeholder="${field.secret ? "Enter new value to update" : "Optional update value"}"
        />
        <div class="secret-row-actions">
          ${field.secret ? `<button class="btn btn-ghost" type="button" data-gateway-action="rotate" data-provider="${escapeHtml(activeProvider.provider)}" data-key-name="${escapeHtml(field.keyName)}">Rotate</button>` : ""}
          ${field.configured ? `<button class="btn btn-ghost" type="button" data-gateway-action="delete" data-provider="${escapeHtml(activeProvider.provider)}" data-key-name="${escapeHtml(field.keyName)}">Delete</button>` : ""}
        </div>
      </div>
    `;
  }).join("");

  panelEl.innerHTML = `
    <section class="gateway-provider-panel-card" data-gateway-card="${escapeHtml(activeProvider.provider)}">
      <div class="secret-card-head">
        <div>
          <span class="gateway-provider-kicker">Provider configuration</span>
          <h3>${escapeHtml(activeProvider.label || activeProvider.provider)}</h3>
          <p>Encrypted update-only configuration. Stored secret values stay masked.</p>
        </div>
        <span class="gateway-status-badge is-${escapeHtml(badge.tone)}">${escapeHtml(badge.label)}</span>
      </div>

      <div class="gateway-controls-grid">
        <label class="gateway-control-card secret-toggle">
          <span>Gateway</span>
          <strong>${activeProvider.enabled ? "Enabled" : "Disabled"}</strong>
          <input type="checkbox" id="gatewayEnabled_${escapeHtml(activeProvider.provider)}" ${activeProvider.enabled ? "checked" : ""} />
        </label>
        <label class="gateway-control-card">
          <span>Mode</span>
          <select class="input secret-field-input" id="gatewayMode_${escapeHtml(activeProvider.provider)}">
            <option value="test" ${activeProvider.mode === "test" ? "selected" : ""}>test</option>
            <option value="live" ${activeProvider.mode === "live" ? "selected" : ""}>live</option>
          </select>
        </label>
        <div class="gateway-control-card">
          <span>Active provider</span>
          <button class="btn btn-secondary" type="button" data-gateway-action="set-active" data-provider="${escapeHtml(activeProvider.provider)}" ${activeProvider.active ? "disabled" : ""}>
            ${activeProvider.active ? "Currently active" : "Make active"}
          </button>
        </div>
      </div>

      <div class="gateway-section-label">
        <div>
          <span>Configuration keys</span>
          <strong>${(activeProvider.fields || []).filter((field) => field.configured).length}/${(activeProvider.fields || []).length} configured</strong>
        </div>
        <small>Leave fields blank to keep existing values.</small>
      </div>

      <div class="gateway-secret-list">${fieldRows}</div>

      <div class="gateway-webhook-grid">
        <div><span>Webhook configured</span><strong>${activeProvider.webhookConfigured ? "Yes" : "No"}</strong></div>
        <div><span>Last webhook</span><strong>${escapeHtml(formatAdminTimestamp(activeProvider.webhookLastReceivedAt))}</strong></div>
        <div><span>Last test</span><strong>${escapeHtml(activeProvider.lastTestStatus || "Not tested")}</strong></div>
        <div><span>Last tested at</span><strong>${escapeHtml(formatAdminTimestamp(activeProvider.lastTestAt))}</strong></div>
      </div>

      <div class="gateway-danger-zone">
        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
        <span>Switching live mode, rotating, deleting, and disabling require confirmation.</span>
      </div>

      <div class="secret-actions">
        <button class="btn btn-primary" type="button" data-gateway-action="save" data-provider="${escapeHtml(activeProvider.provider)}">Save</button>
        <button class="btn btn-secondary" type="button" data-gateway-action="test" data-provider="${escapeHtml(activeProvider.provider)}">Test connection</button>
      </div>
    </section>
  `;
}

async function refreshPaymentGateways() {
  state.paymentGateways.loadError = "";
  try {
    const [payload, eventsPayload] = await Promise.all([
      api(`/api/admin/payment-gateways?environment=${encodeURIComponent(state.paymentGateways.environment || "test")}`),
      api("/api/admin/payment-gateways/events").catch(() => ({ rows: [] }))
    ]);
    state.paymentGateways.environment = payload?.environment || state.paymentGateways.environment || "test";
    state.paymentGateways.activeProvider = state.paymentGateways.activeProvider === "webhooks" || state.paymentGateways.activeProvider === "events"
      ? state.paymentGateways.activeProvider
      : payload?.activeProvider || state.paymentGateways.activeProvider || "stripe";
    state.paymentGateways.providers = Array.isArray(payload?.providers) ? payload.providers : [];
    state.paymentGateways.webhookHealth = payload?.webhookHealth || {};
    state.paymentGateways.auditEvents = Array.isArray(eventsPayload?.rows) ? eventsPayload.rows : [];
    setPaymentGatewaysFeedback(state.paymentGateways.feedback?.message || "", state.paymentGateways.feedback?.tone || "");
  } catch (error) {
    state.paymentGateways.loadError = error.message || "Failed to load payment gateways.";
    setPaymentGatewaysFeedback(state.paymentGateways.loadError, "error");
  }
  renderPaymentGatewaysPanel();
}

function collectGatewayProviderPayload(providerKey) {
  const provider = getPaymentProvider(providerKey);
  const enabled = $(`gatewayEnabled_${providerKey}`)?.checked || false;
  const mode = $(`gatewayMode_${providerKey}`)?.value || "test";
  const payload = { enabled, mode, environment: mode };
  document.querySelectorAll(`[data-gateway-input="true"][data-provider="${providerKey}"]`).forEach((input) => {
    const value = String(input.value || "").trim();
    if (!value) return;
    payload[input.dataset.keyName] = value;
  });
  if (provider?.enabled && !enabled && !confirmTypedAction({ message: `Disable ${provider.label || providerKey}?`, expected: "DISABLE" })) return null;
  if (provider?.mode !== "live" && mode === "live" && !confirmTypedAction({ message: `Switch ${provider.label || providerKey} to live mode?`, expected: "LIVE" })) return null;
  return payload;
}

async function saveGatewayProvider(providerKey) {
  const payload = collectGatewayProviderPayload(providerKey);
  if (!payload) return;
  setPaymentGatewaysFeedback("Saving payment gateway...", "info");
  await api(`/api/admin/payment-gateways/${encodeURIComponent(providerKey)}`, { method: "POST", body: payload });
  setPaymentGatewaysFeedback("Payment gateway saved.", "success");
  state.paymentGateways.environment = payload.mode || state.paymentGateways.environment;
  await refreshPaymentGateways();
}

async function testGatewayProvider(providerKey) {
  setPaymentGatewaysFeedback("Testing payment gateway...", "info");
  const result = await api(`/api/admin/payment-gateways/${encodeURIComponent(providerKey)}/test`, {
    method: "POST",
    body: { environment: $(`gatewayMode_${providerKey}`)?.value || state.paymentGateways.environment || "test" }
  });
  setPaymentGatewaysFeedback(result?.message || "Gateway test completed.", result?.status === "failed" ? "error" : "success");
  await refreshPaymentGateways();
}

async function rotateGatewaySecret(providerKey, keyName) {
  if (!confirmTypedAction({ message: `Rotate ${providerKey}/${keyName}?`, expected: "ROTATE" })) return;
  const value = window.prompt(`Enter the new value for ${keyName}:`);
  if (!String(value || "").trim()) return;
  await api(`/api/admin/payment-gateways/${encodeURIComponent(providerKey)}/rotate`, {
    method: "POST",
    body: { keyName, value, environment: $(`gatewayMode_${providerKey}`)?.value || state.paymentGateways.environment || "test" }
  });
  setPaymentGatewaysFeedback("Secret rotated.", "success");
  await refreshPaymentGateways();
}

async function deleteGatewaySecret(providerKey, keyName) {
  if (!confirmTypedAction({ message: `Delete ${providerKey}/${keyName}? Env fallback may remain.`, expected: "DELETE" })) return;
  await api(`/api/admin/payment-gateways/${encodeURIComponent(providerKey)}/${encodeURIComponent(keyName)}?environment=${encodeURIComponent($(`gatewayMode_${providerKey}`)?.value || state.paymentGateways.environment || "test")}`, { method: "DELETE" });
  setPaymentGatewaysFeedback("Secret deleted.", "success");
  await refreshPaymentGateways();
}

async function setPaymentActiveProvider(providerKey) {
  if (!confirmAction(`Change active payment provider to ${providerKey}?`)) return;
  await api("/api/admin/payment-gateways/active-provider", { method: "POST", body: { provider: providerKey } });
  state.paymentGateways.activeProvider = providerKey;
  setPaymentGatewaysFeedback("Active payment provider updated.", "success");
  await refreshPaymentGateways();
}

function renderCostControlPanel() {
  const statsEl = $("costOverviewStats");
  const topProvidersEl = $("costTopProviders");
  const topSchoolsEl = $("costTopSchools");
  const activeAlertsEl = $("costActiveAlerts");
  const providerTableEl = $("costProviderTable");
  const workspaceTableEl = $("costWorkspaceTable");
  const limitsTableEl = $("costLimitsTable");
  const alertsTableEl = $("costAlertsTable");
  const errorEl = $("costControlError");
  const periodSelect = $("costControlPeriod");
  const workspaceSelect = $("costLimitWorkspace");
  const providerSelect = $("costLimitProvider");
  const limitPeriodSelect = $("costLimitPeriodSelect");
  const overview = state.costControl.overview || {
    totals: {},
    top_providers: [],
    top_workspaces: [],
    active_alerts: [],
    provider_breakdown: []
  };
  const limits = Array.isArray(state.costControl.limits) ? state.costControl.limits : [];
  const alerts = Array.isArray(state.costControl.alerts) ? state.costControl.alerts : [];
  const providerRows = Array.isArray(state.costControl.providerRows) ? state.costControl.providerRows : [];
  const workspaceRows = Array.isArray(state.costControl.workspaceRows) ? state.costControl.workspaceRows : [];

  if (periodSelect) periodSelect.value = state.costControl.period || "monthly";
  if (limitPeriodSelect) limitPeriodSelect.value = state.costControl.period || "monthly";

  if (errorEl) {
    setError(errorEl, state.costControl.loadError || "");
  }

  if (workspaceSelect) {
    const selected = String(workspaceSelect.value || "platform");
    workspaceSelect.innerHTML = [
      `<option value="platform">Platform default</option>`,
      ...(Array.isArray(state.workspaces) ? state.workspaces : []).map((workspace) => (
        `<option value="${escapeHtml(workspace.id)}">${escapeHtml(workspace.name || workspace.id)}</option>`
      ))
    ].join("");
    workspaceSelect.value = selected && [...workspaceSelect.options].some((option) => option.value === selected)
      ? selected
      : "platform";
  }

  if (providerSelect) {
    const options = providerRows.length
      ? providerRows.map((row) => ({ provider_key: row.provider_key, display_name: row.display_name }))
      : COST_CONTROL_PROVIDER_ORDER.map((provider_key) => ({ provider_key, display_name: getCostProviderLabel(provider_key) }));
    const selected = String(providerSelect.value || "openai");
    providerSelect.innerHTML = options.map((row) => (
      `<option value="${escapeHtml(row.provider_key)}">${escapeHtml(row.display_name || row.provider_key)}</option>`
    )).join("");
    providerSelect.value = selected && [...providerSelect.options].some((option) => option.value === selected)
      ? selected
      : (providerSelect.options[0]?.value || "openai");
  }

  if (statsEl) {
    statsEl.innerHTML = `
      <div class="cost-stat-card is-neutral">
        <span>Total today</span>
        <strong>${formatEUR(overview.totals?.today_cost_eur || 0)}</strong>
      </div>
      <div class="cost-stat-card is-good">
        <span>Total this month</span>
        <strong>${formatEUR(overview.totals?.monthly_cost_eur || 0)}</strong>
      </div>
      <div class="cost-stat-card is-info">
        <span>Total this year</span>
        <strong>${formatEUR(overview.totals?.yearly_cost_eur || 0)}</strong>
      </div>
      <div class="cost-stat-card ${(overview.active_alerts || []).length ? "is-warn" : "is-good"}">
        <span>Active alerts</span>
        <strong>${Number((overview.active_alerts || []).length || 0)}</strong>
      </div>
    `;
  }

  renderCostMiniList(
    topProvidersEl,
    overview.top_providers || [],
    (row) => `
      <div class="cost-mini-row">
        <div>
          <strong>${escapeHtml(row.display_name || getCostProviderLabel(row.provider_key))}</strong>
          <span>${escapeHtml(row.provider_key || "")}</span>
        </div>
        <strong>${formatEUR(row.total_cost_eur || 0)}</strong>
      </div>
    `,
    "No provider usage recorded."
  );

  renderCostMiniList(
    topSchoolsEl,
    overview.top_workspaces || [],
    (row) => `
      <div class="cost-mini-row">
        <div>
          <strong>${escapeHtml(getCostWorkspaceLabel(row.workspace_id))}</strong>
          <span>${escapeHtml(row.workspace_id || "")}</span>
        </div>
        <strong>${formatEUR(row.total_cost_eur || 0)}</strong>
      </div>
    `,
    "No workspace usage recorded."
  );

  renderCostMiniList(
    activeAlertsEl,
    (overview.active_alerts || []).slice(0, 6),
    (row) => `
      <div class="cost-mini-row is-${getAlertTone(row.alert_type)}">
        <div>
          <strong>${escapeHtml(getCostWorkspaceLabel(row.workspace_id))}</strong>
          <span>${escapeHtml(`${row.provider_key || "platform"} • ${row.alert_type || "alert"}`)}</span>
        </div>
        <strong>${formatEUR(row.current_cost_eur || 0)}</strong>
      </div>
    `,
    "No active alerts."
  );

  if (providerTableEl) {
    const providerPeriodField = state.costControl.period === "daily"
      ? "today_cost_eur"
      : state.costControl.period === "yearly"
        ? "yearly_cost_eur"
        : "monthly_cost_eur";
    renderTable(providerTableEl, {
      columns: [
        {
          label: "Provider",
          key: "provider_key",
          width: "220px",
          align: "left",
          render: (row) => `
            <div style="font-weight:800">${escapeHtml(row.display_name || getCostProviderLabel(row.provider_key))}</div>
            <div class="muted" style="font-size:12px">${escapeHtml(row.provider_key || "")}</div>
          `
        },
        { label: "Today", key: "today_cost_eur", width: "140px", align: "center", render: (row) => escapeHtml(formatEUR(row.today_cost_eur || 0)) },
        { label: "This month", key: "monthly_cost_eur", width: "140px", align: "center", render: (row) => escapeHtml(formatEUR(row.monthly_cost_eur || 0)) },
        { label: "This year", key: "yearly_cost_eur", width: "140px", align: "center", render: (row) => escapeHtml(formatEUR(row.yearly_cost_eur || 0)) },
        {
          label: "Scope",
          key: "_scope",
          width: "160px",
          align: "center",
          render: (row) => {
            const limit = getCostLimitFor(null, row.provider_key, state.costControl.period);
            return escapeHtml(limit ? getCostWorkspaceLabel(limit.workspace_id) : "No limit");
          }
        },
        {
          label: "Period",
          key: "_period",
          width: "100px",
          align: "center",
          render: (row) => {
            const limit = getCostLimitFor(null, row.provider_key, state.costControl.period);
            return escapeHtml(limit?.period || "—");
          }
        },
        {
          label: "Soft",
          key: "_soft",
          width: "110px",
          align: "center",
          render: (row) => {
            const limit = getCostLimitFor(null, row.provider_key, state.costControl.period);
            return escapeHtml(limit?.soft_limit_eur != null ? formatEUR(limit.soft_limit_eur) : "—");
          }
        },
        {
          label: "Hard",
          key: "_hard",
          width: "110px",
          align: "center",
          render: (row) => {
            const limit = getCostLimitFor(null, row.provider_key, state.costControl.period);
            return escapeHtml(limit?.hard_limit_eur != null ? formatEUR(limit.hard_limit_eur) : "—");
          }
        },
        {
          label: "Units",
          key: "_units",
          width: "100px",
          align: "center",
          render: (row) => {
            const limit = getCostLimitFor(null, row.provider_key, state.costControl.period);
            return escapeHtml(limit?.unit_limit != null ? String(limit.unit_limit) : "—");
          }
        },
        {
          label: "Status",
          key: "_status",
          width: "160px",
          align: "center",
          render: (row) => {
            const status = getCostLimitStatus(
              getCostLimitFor(null, row.provider_key, state.costControl.period),
              row[providerPeriodField]
            );
            return `<span class="secret-status-badge is-${status.tone}">${escapeHtml(status.label)}</span>`;
          }
        },
        {
          label: "Action",
          key: "_action",
          width: "110px",
          align: "center",
          render: (row) => {
            const limit = getCostLimitFor(null, row.provider_key, state.costControl.period);
            return limit
              ? `<button class="btn btn-ghost" type="button" data-cost-control-action="delete-limit" data-limit-id="${escapeHtml(limit.id)}">Delete</button>`
              : "—";
          }
        }
      ],
      rows: providerRows,
      emptyText: "No provider cost data loaded yet."
    });
  }

  if (workspaceTableEl) {
    renderTable(workspaceTableEl, {
      columns: [
        {
          label: "School",
          key: "workspace_id",
          width: "220px",
          render: (row) => `
            <div style="font-weight:800">${escapeHtml(row.workspace_name || getCostWorkspaceLabel(row.workspace_id))}</div>
            <div class="muted" style="font-size:12px">${escapeHtml(row.workspace_id || "")}</div>
          `
        },
        { label: "Selected period", key: "total_cost_eur", width: "130px", render: (row) => escapeHtml(formatEUR(row.total_cost_eur || 0)) },
        ...COST_CONTROL_PROVIDER_ORDER.slice(0, 6).map((providerKey) => ({
          label: getCostProviderLabel(providerKey),
          key: providerKey,
          width: "120px",
          render: (row) => {
            const providerCosts = row.provider_costs || {};
            return escapeHtml(formatEUR(providerCosts[providerKey] || 0));
          }
        })),
        {
          label: "Limit status",
          key: "_status",
          render: (row) => {
            const openaiLimit = getCostLimitFor(row.workspace_id, "openai", state.costControl.period);
            const providerCosts = row.provider_costs || {};
            const status = getCostLimitStatus(openaiLimit, providerCosts.openai || 0);
            return `<span class="secret-status-badge is-${status.tone}">${escapeHtml(status.label)}</span>`;
          }
        }
      ],
      rows: workspaceRows,
      emptyText: "No workspace cost breakdown loaded yet."
    });
  }

  if (alertsTableEl) {
    renderTable(alertsTableEl, {
      columns: [
        { label: "School", key: "workspace_id", width: "180px", render: (row) => escapeHtml(getCostWorkspaceLabel(row.workspace_id)) },
        { label: "Provider", key: "provider_key", width: "140px", render: (row) => escapeHtml(getCostProviderLabel(row.provider_key)) },
        { label: "Type", key: "alert_type", width: "120px", render: (row) => escapeHtml(row.alert_type || "alert") },
        { label: "Period", key: "period", width: "100px", render: (row) => escapeHtml(row.period || "monthly") },
        { label: "Threshold", key: "threshold_eur", width: "110px", render: (row) => escapeHtml(row.threshold_eur != null ? formatEUR(row.threshold_eur) : "—") },
        { label: "Current", key: "current_cost_eur", width: "110px", render: (row) => escapeHtml(formatEUR(row.current_cost_eur || 0)) },
        { label: "Created", key: "created_at", width: "180px", render: (row) => escapeHtml(formatAdminTimestamp(row.created_at)) },
        {
          label: "Action",
          key: "_action",
          render: (row) => row.acknowledged
            ? `<span class="secret-status-badge is-ok">Acknowledged</span>`
            : `<button class="btn btn-ghost" type="button" data-cost-control-action="ack-alert" data-alert-id="${escapeHtml(row.id)}">Acknowledge</button>`
        }
      ],
      rows: alerts,
      emptyText: "No cost alerts recorded."
    });
  }

  const feedback = state.costControl.feedback || { message: "", tone: "" };
  setCostControlFeedback(feedback.message || "", feedback.tone || "");
}

async function refreshCostControl() {
  state.costControl.loadError = "";
  try {
    const period = state.costControl.period || "monthly";
    const [overview, limitsPayload, alertsPayload] = await Promise.all([
      api(`/api/admin/cost-control/overview?period=${encodeURIComponent(period)}`),
      api("/api/admin/cost-control/limits"),
      api("/api/admin/cost-control/alerts")
    ]);
    state.costControl.overview = overview || null;
    state.costControl.providers = Array.isArray(overview?.provider_breakdown) ? overview.provider_breakdown : [];
    state.costControl.providerRows = state.costControl.providers;
    state.costControl.limits = Array.isArray(limitsPayload?.rows) ? limitsPayload.rows : [];
    state.costControl.alerts = Array.isArray(alertsPayload?.rows) ? alertsPayload.rows : [];

    const workspaces = Array.isArray(state.workspaces) ? state.workspaces : [];
    const summaries = await Promise.all(workspaces.map(async (workspace) => {
      try {
        const summary = await api(`/api/admin/cost-control/workspaces/${encodeURIComponent(workspace.id)}/summary?period=${encodeURIComponent(period)}`);
        return { workspace, summary };
      } catch (_err) {
        return { workspace, summary: null };
      }
    }));
    state.costControl.workspaceRows = summaries.map(({ workspace, summary }) => {
      const providerCosts = {};
      for (const row of summary?.providers || []) {
        providerCosts[row.provider_key] = Number(row.total_cost_eur || 0);
      }
      return {
        workspace_id: workspace.id,
        workspace_name: workspace.name || workspace.id,
        total_cost_eur: Number(summary?.total_cost_eur || 0),
        provider_costs: providerCosts
      };
    });
  } catch (error) {
    state.costControl.loadError = error.message || "Failed to load cost control data.";
  }
  renderCostControlPanel();
}

async function saveCostControlLimit() {
  const workspaceId = $("costLimitWorkspace")?.value || "platform";
  const providerKey = $("costLimitProvider")?.value || "openai";
  const period = $("costLimitPeriodSelect")?.value || "monthly";
  const softLimitEur = $("costLimitSoft")?.value ? Number($("costLimitSoft").value) : null;
  const hardLimitEur = $("costLimitHard")?.value ? Number($("costLimitHard").value) : null;
  const unitLimit = $("costLimitUnits")?.value ? Number($("costLimitUnits").value) : null;
  try {
    await api("/api/admin/cost-control/limits", {
      method: "POST",
      body: {
        workspaceId,
        providerKey,
        period,
        softLimitEur,
        hardLimitEur,
        unitLimit,
        enabled: true
      }
    });
    setCostControlFeedback("Limit saved.", "success");
    await refreshCostControl();
  } catch (error) {
    setCostControlFeedback(error.message || "Failed to save limit.", "error");
  }
}

async function deleteCostControlLimit(limitId) {
  try {
    await api(`/api/admin/cost-control/limits/${encodeURIComponent(limitId)}`, {
      method: "DELETE"
    });
    setCostControlFeedback("Limit deleted.", "success");
    await refreshCostControl();
  } catch (error) {
    setCostControlFeedback(error.message || "Failed to delete limit.", "error");
  }
}

async function acknowledgeCostAlert(alertId) {
  try {
    await api(`/api/admin/cost-control/alerts/${encodeURIComponent(alertId)}/acknowledge`, {
      method: "POST"
    });
    setCostControlFeedback("Alert acknowledged.", "success");
    await refreshCostControl();
  } catch (error) {
    setCostControlFeedback(error.message || "Failed to acknowledge alert.", "error");
  }
}

async function exportCostControlCsv() {
  try {
    const period = state.costControl.period || "monthly";
    const response = await fetch(`/api/admin/cost-control/export.csv?period=${encodeURIComponent(period)}`, {
      credentials: "same-origin"
    });
    if (!response.ok) {
      const data = await response.text().catch(() => "");
      throw new Error(data || "Failed to export CSV.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cost-control-${period}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    setCostControlFeedback(error.message || "Failed to export CSV.", "error");
  }
}

async function saveSecretProvider(provider) {
  const card = document.querySelector(`[data-provider-card="${provider}"]`);
  if (!card) return;
  const inputs = [...card.querySelectorAll('[data-secret-input="true"]')];
  const changed = inputs
    .map((input) => ({
      keyName: input.dataset.keyName,
      value: String(input.value || "")
    }))
    .filter((entry) => entry.value.trim());

  if (!changed.length) {
    setSecretStatusState(provider, "No changes to save.", "info");
    return;
  }

  setSecretStatusState(provider, "Saving secrets...", "info");
  for (const entry of changed) {
    await api(`/api/admin/secrets/${encodeURIComponent(provider)}/${encodeURIComponent(entry.keyName)}`, {
      method: "PUT",
      body: { value: entry.value, enabled: true }
    });
  }
  inputs.forEach((input) => {
    input.value = "";
  });
  await refreshSecrets();
  setSecretStatusState(provider, "Saved successfully.", "success");
}

async function rotateSecretField(provider, keyName) {
  const input = document.querySelector(`[data-secret-input="true"][data-provider="${provider}"][data-key-name="${keyName}"]`);
  const value = String(input?.value || "").trim();
  if (!value) {
    setSecretStatusState(provider, `Enter a new value for ${keyName} before rotating.`, "error");
    return;
  }
  setSecretStatusState(provider, `Rotating ${keyName}...`, "info");
  await api(`/api/admin/secrets/${encodeURIComponent(provider)}/${encodeURIComponent(keyName)}/rotate`, {
    method: "POST",
    body: { value }
  });
  if (input) input.value = "";
  await refreshSecrets();
  setSecretStatusState(provider, `${keyName} rotated.`, "success");
}

async function deleteSecretField(provider, keyName) {
  setSecretStatusState(provider, `Deleting ${keyName}...`, "info");
  const result = await api(`/api/admin/secrets/${encodeURIComponent(provider)}/${encodeURIComponent(keyName)}`, {
    method: "DELETE"
  });
  await refreshSecrets();
  setSecretStatusState(provider, result?.message || `${keyName} deleted. Env fallback remains if present.`, "success");
}

async function testSecretProvider(provider) {
  setSecretStatusState(provider, "Testing provider...", "info");
  const result = await api(`/api/admin/secrets/${encodeURIComponent(provider)}/test`, {
    method: "POST"
  });
  await refreshSecrets();
  setSecretStatusState(
    provider,
    `${result?.status || "unknown"}: ${result?.message || "No test message."}`,
    String(result?.status || "").toLowerCase() === "ok" ? "success" : "error"
  );
}

async function completeMfaChallenge(challenge) {
  if (!challenge?.mfaToken) {
    throw new Error("MFA challenge is missing.");
  }
  let setupText = "";
  if (challenge.mfaSetupRequired) {
    const setupResp = await fetch("/api/auth/mfa/setup/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mfaToken: challenge.mfaToken }),
      credentials: "same-origin"
    });
    const setup = await setupResp.json().catch(() => ({}));
    if (!setupResp.ok) throw new Error(setup.error || "Could not start MFA setup.");
    setupText = `MFA setup required.\n\nAdd this secret to your authenticator app:\n${setup.secret}\n\n`;
  }
  const code = window.prompt(`${setupText}Enter your 6-digit authenticator code:`);
  if (!code) throw new Error("MFA code is required.");
  const verifyResp = await fetch("/api/auth/mfa/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mfaToken: challenge.mfaToken, code }),
    credentials: "same-origin"
  });
  const verified = await verifyResp.json().catch(() => ({}));
  if (!verifyResp.ok) throw new Error(verified.error || "MFA verification failed.");
  return verified;
}

function requireReason(value, label = "Reason") {
  const reason = String(value || "").trim();
  if (!reason) throw new Error(`${label} is required for this action.`);
  return reason;
}

function confirmAction(message) {
  return window.confirm(message);
}

function confirmTypedAction({ message, expected }) {
  const typed = window.prompt(`${message}\n\nType ${expected} to confirm:`);
  return String(typed || "").trim() === String(expected || "").trim();
}

async function confirmNotificationSend(campaignId, label) {
  const stats = await api(`/api/admin/notifications-control/campaigns/${encodeURIComponent(campaignId)}/stats`).catch(() => null);
  const totals = stats?.stats || stats || {};
  const pending = Number(totals.pending || totals.pendingTotal || totals.pending_email || totals.pendingSms || 0);
  return confirmAction(`${label}\n\nPending deliveries: ${pending || "unknown"}\nConfirm before sending.`);
}

async function api(path, { method = "GET", body = null } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
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

const OWNER_TABS = new Set([
  "operations",
  "backups",
  "lifecycle",
  "support",
  "incidents",
  "data-governance",
  "notifications",
  "branding",
  "reports"
]);

function ownerErrorId(tab) {
  return `${String(tab || "").replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Error`;
}

function renderOwnerSummary(el, cards = []) {
  if (!el) return;
  el.innerHTML = cards.map((card) => `
    <div class="owner-summary-card${card.tone ? ` is-${escapeHtml(card.tone)}` : ""}">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
      ${card.note ? `<small>${escapeHtml(card.note)}</small>` : ""}
    </div>
  `).join("") || `<div class="table-empty">No owner-control data loaded yet.</div>`;
}

function workspaceOptions({ includeAll = false } = {}) {
  const rows = Array.isArray(state.workspaces) ? state.workspaces : [];
  const options = includeAll ? [`<option value="">All workspaces</option>`] : [];
  for (const workspace of rows) {
    const id = workspace.id || "";
    options.push(`<option value="${escapeHtml(id)}">${escapeHtml(workspace.name || id)}</option>`);
  }
  return options.join("");
}

function syncOwnerWorkspaceSelects() {
  const ids = [
    "lifecycleWorkspace",
    "supportWorkspace",
    "governanceWorkspace",
    "brandingWorkspace",
    "reportsWorkspace"
  ];
  ids.forEach((id) => {
    const el = $(id);
    if (el) el.innerHTML = workspaceOptions({ includeAll: id === "reportsWorkspace" });
  });
  const notificationWorkspace = $("notificationWorkspace");
  if (notificationWorkspace) notificationWorkspace.innerHTML = workspaceOptions();
  const notificationAutomationWorkspace = $("notificationAutomationWorkspace");
  if (notificationAutomationWorkspace) notificationAutomationWorkspace.innerHTML = workspaceOptions();
}

function formatOwnerStatus(value) {
  const text = String(value == null ? "unknown" : value);
  const tone = ["ok", "completed", "active", "ready", "configured", "sent"].includes(text.toLowerCase())
    ? "ok"
    : ["failed", "critical", "blocked_missing_stripe_key"].includes(text.toLowerCase())
      ? "failed"
      : "warn";
  return `<span class="secret-status-badge is-${tone}">${escapeHtml(text)}</span>`;
}

function renderOperations(data, logs = null, jobs = null) {
  renderOwnerSummary($("operationsSummary"), [
    { label: "Database", value: data.databaseMode || "unknown", tone: "ok" },
    { label: "Uptime", value: `${Math.round(Number(data.uptimeSeconds || 0) / 60)} min`, tone: "ok" },
    { label: "Active sessions", value: data.activeSessions ?? 0, tone: "ok" },
    { label: "Failed jobs", value: jobs?.rows?.filter((row) => row.status === "failed").length ?? data.failedJobs ?? 0, tone: Number(jobs?.rows?.filter((row) => row.status === "failed").length || data.failedJobs || 0) ? "failed" : "ok" },
    { label: "4xx / 5xx", value: `${logs?.fourXxCount ?? 0} / ${logs?.fiveXxCount ?? 0}`, tone: Number(logs?.fiveXxCount || 0) ? "failed" : "ok" },
    { label: "Last backup", value: data.lastBackup?.status || "none", tone: data.lastBackup ? "ok" : "warn" },
    { label: "Storage", value: data.diskUsage?.available === false ? "check failed" : "available", tone: data.diskUsage?.available === false ? "warn" : "ok" },
    { label: "Generated", value: formatAdminTimestamp(data.generatedAt), tone: "ok" }
  ]);
  renderTable($("operationsTable"), {
    columns: [
      { label: "Provider", key: "label", render: (row) => escapeHtml(row.label || row.key) },
      { label: "Status", key: "status", render: (row) => formatOwnerStatus(row.status) },
      { label: "Message", key: "message", render: (row) => escapeHtml(row.message || "") },
      { label: "Action", key: "_action", render: (row) => `<button class="btn btn-ghost" type="button" data-owner-action="provider-test" data-provider="${escapeHtml(row.key)}">Test</button>` }
    ],
    rows: data.providers || [],
    emptyText: "No provider health data loaded."
  });
}

function renderBackups(status, history, evidence = null) {
  const latestBackup = evidence?.latestBackup || null;
  const latestVerify = evidence?.latestVerification || null;
  const latestDryRun = evidence?.latestRestoreDryRun || null;
  const latestRestoreTest = evidence?.latestRestoreTest || null;
  renderOwnerSummary($("backupsSummary"), [
    { label: "Backup health", value: status.health || "unknown", tone: status.health === "ok" ? "ok" : "warn" },
    { label: "Last backup", value: latestBackup?.status || status.latest?.status || "none", tone: latestBackup || status.latest ? "ok" : "warn" },
    { label: "Last verification", value: latestVerify?.status || "none", tone: latestVerify ? "ok" : "warn" },
    { label: "Restore dry-run", value: latestDryRun?.status || "none", tone: latestDryRun ? "ok" : "warn" },
    { label: "Restore test", value: latestRestoreTest?.status || "none", tone: latestRestoreTest ? "ok" : "warn" },
    { label: "Failed events", value: evidence?.failed?.length ?? 0, tone: Number(evidence?.failed?.length || 0) ? "failed" : "ok" },
    { label: "Retention", value: `${status.retentionDays || 30} days` }
  ]);
  renderTable($("backupsTable"), {
    columns: [
      { label: "Type", key: "type", render: (row) => escapeHtml(row.type || "manual") },
      { label: "Status", key: "status", render: (row) => formatOwnerStatus(row.status) },
      { label: "File", key: "file_path", render: (row) => escapeHtml(row.file_path || row.filePath || "metadata only") },
      { label: "Started", key: "started_at", render: (row) => escapeHtml(formatAdminTimestamp(row.started_at || row.startedAt)) }
    ],
    rows: evidence?.events?.length ? evidence.events : history || [],
    emptyText: "No backup runs recorded yet."
  });
}

function renderLifecycle(data) {
  syncOwnerWorkspaceSelects();
  renderTable($("lifecycleTable"), {
    columns: [
      { label: "Workspace", key: "workspace_id", render: (row) => escapeHtml(row.workspace_id || "") },
      { label: "Action", key: "action", render: (row) => escapeHtml(row.action || "") },
      { label: "Reason", key: "reason", render: (row) => escapeHtml(row.reason || "") },
      { label: "Created", key: "created_at", render: (row) => escapeHtml(formatAdminTimestamp(row.created_at)) }
    ],
    rows: data.events || [],
    emptyText: "No lifecycle events recorded."
  });
}

function renderSupport(data) {
  syncOwnerWorkspaceSelects();
  const activeRows = data.activeSessions || data.rows || [];
  renderTable($("supportTable"), {
    columns: [
      { label: "Actor", key: "actor_user_id", render: (row) => escapeHtml(row.actor_user_id || row.super_admin_id || "") },
      { label: "Target user", key: "target_user_id", render: (row) => escapeHtml(row.target_user_id || "") },
      { label: "Workspace", key: "workspace_id", render: (row) => escapeHtml(row.workspace_id || "") },
      { label: "Mode", key: "mode", render: () => "Read-only" },
      { label: "Reason", key: "reason", render: (row) => escapeHtml(row.reason || "") },
      { label: "Expires", key: "expires_at", render: (row) => escapeHtml(formatAdminTimestamp(row.expires_at)) }
    ],
    rows: activeRows,
    emptyText: "No active support sessions."
  });
  renderTable($("supportHistoryTable"), {
    columns: [
      { label: "Actor", key: "super_admin_id", render: (row) => escapeHtml(row.actor_user_id || row.super_admin_id || "") },
      { label: "Workspace", key: "workspace_id", render: (row) => escapeHtml(row.workspace_id || "") },
      { label: "Reason", key: "reason", render: (row) => escapeHtml(row.reason || "") },
      { label: "Started", key: "started_at", render: (row) => escapeHtml(formatAdminTimestamp(row.started_at)) },
      { label: "Ended", key: "ended_at", render: (row) => escapeHtml(row.ended_at ? formatAdminTimestamp(row.ended_at) : "Active") }
    ],
    rows: data.sessionHistory || [],
    emptyText: "No support sessions recorded."
  });
  renderTable($("supportAccessTable"), {
    columns: [
      { label: "When", key: "timestamp", render: (row) => escapeHtml(formatAdminTimestamp(row.timestamp)) },
      { label: "Actor", key: "actor_user_id", render: (row) => escapeHtml(row.actor_user_id || "") },
      { label: "Workspace", key: "workspace_id", render: (row) => escapeHtml(row.workspace_id || "") },
      { label: "Data", key: "resource_type", render: (row) => escapeHtml(row.resource_type || "") },
      { label: "Resource", key: "resource_id", render: (row) => escapeHtml(row.resource_id || "") }
    ],
    rows: data.accessEvents || [],
    emptyText: "No support access events recorded."
  });
}

function renderIncidents(data) {
  const maintenance = data.maintenance || {};
  const enabled = $("maintenanceEnabled");
  const message = $("maintenanceMessage");
  if (enabled) enabled.checked = Number(maintenance.enabled || 0) === 1;
  if (message) message.value = maintenance.public_message || "";
  const disabled = (() => {
    try { return new Set(JSON.parse(maintenance.disabled_features_json || "[]")); } catch { return new Set(); }
  })();
  document.querySelectorAll("[data-maint-feature]").forEach((input) => {
    input.checked = disabled.has(input.dataset.maintFeature);
  });
  renderTable($("incidentsTable"), {
    columns: [
      { label: "Title", key: "title", render: (row) => escapeHtml(row.title || "") },
      { label: "Severity", key: "severity", render: (row) => formatOwnerStatus(row.severity || "info") },
      { label: "Status", key: "status", render: (row) => formatOwnerStatus(row.status || "open") },
      { label: "Created", key: "created_at", render: (row) => escapeHtml(formatAdminTimestamp(row.created_at)) }
    ],
    rows: data.incidents || [],
    emptyText: "No incidents recorded."
  });
}

function renderDataGovernance(overview, rows) {
  syncOwnerWorkspaceSelects();
  renderOwnerSummary($("dataGovernanceSummary"), [
    { label: "Recording retention", value: `${overview.retention?.recordingsDays || 365} days` },
    { label: "Backup retention", value: `${overview.retention?.backupsDays || 30} days` },
    { label: "Audit retention", value: `${overview.retention?.auditDays || 365} days` },
    { label: "Pending queue", value: overview.pendingRequests || 0, tone: Number(overview.pendingRequests || 0) ? "warn" : "ok" }
  ]);
  renderTable($("dataGovernanceTable"), {
    columns: [
      { label: "Workspace", key: "workspace_id", render: (row) => escapeHtml(row.workspace_id || "") },
      { label: "Type", key: "request_type", render: (row) => escapeHtml(row.request_type || "") },
      { label: "Status", key: "status", render: (row) => formatOwnerStatus(row.status || "pending") },
      { label: "Created", key: "created_at", render: (row) => escapeHtml(formatAdminTimestamp(row.created_at)) }
    ],
    rows,
    emptyText: "No data governance requests."
  });
}

function parseOwnerJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_err) {
    return fallback;
  }
}

function formatCurrencyEUR(value) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

function getSelectedNotificationChannels() {
  return Array.from(document.querySelectorAll("[data-notification-channel]:checked")).map((el) => el.value);
}

function getSelectedNotificationWorkspaces() {
  const select = $("notificationWorkspace");
  if (!select) return [];
  return Array.from(select.selectedOptions || []).map((option) => option.value).filter(Boolean);
}

function updateNotificationEstimate() {
  const channels = getSelectedNotificationChannels();
  const workspaceCount = getSelectedNotificationWorkspaces().length;
  const targetType = $("notificationTargetType")?.value || "all_workspaces";
  const base = Number(state.workspaces?.length || 0) * 25;
  const recipients = targetType === "selected_workspaces"
    ? Math.max(0, workspaceCount * 25)
    : targetType === "role"
      ? Math.max(0, Math.round(base / 3))
      : targetType === "plan"
        ? 0
      : Math.max(0, base);
  const sms = channels.includes("sms") ? recipients * 0.08 : 0;
  const email = channels.includes("email") ? recipients * 0.0005 : 0;
  if ($("notificationEstimatedRecipients")) $("notificationEstimatedRecipients").textContent = recipients.toLocaleString();
  if ($("notificationEstimatedSms")) $("notificationEstimatedSms").textContent = formatCurrencyEUR(sms);
  if ($("notificationEstimatedEmail")) $("notificationEstimatedEmail").textContent = formatCurrencyEUR(email);
  if ($("notificationCharCount")) {
    const chars = ($("notificationBody")?.value || "").length;
    $("notificationCharCount").textContent = `${chars} chars${chars > 160 ? " / multi-SMS" : ""}`;
  }
}

function renderNotificationTemplates(templates) {
  const el = $("notificationTemplates");
  if (!el) return;
  const automationTemplate = $("notificationAutomationTemplate");
  if (automationTemplate) {
    automationTemplate.innerHTML = `<option value="">No template</option>${templates.map((template) => `<option value="${escapeHtml(template.id || "")}">${escapeHtml(template.name || template.id || "Template")}</option>`).join("")}`;
  }
  if (!templates.length) {
    el.innerHTML = `<div class="table-empty">No templates yet.</div>`;
    return;
  }
  el.innerHTML = templates.map((template) => `
    <button class="notification-template" type="button" data-owner-action="notification-template" data-subject="${escapeHtml(template.subject || "")}" data-body="${escapeHtml(template.body || "")}">
      <span>${escapeHtml(template.name || "Template")}</span>
      <small>${escapeHtml(template.channel || "in_app")}</small>
    </button>
  `).join("");
}

function formatNotificationTarget(row) {
  const config = row.targetConfig || parseOwnerJson(row.target_config_json, {});
  if (row.target_type === "selected_workspaces") return `${(config.workspaceIds || []).length} workspaces`;
  if (row.target_type === "role") return `Role: ${config.role || "—"}`;
  if (row.target_type === "plan") return `Plan: ${config.plan || "—"}`;
  return "All workspaces";
}

function getSelectedAutomationChannels() {
  return Array.from(document.querySelectorAll("[data-notification-automation-channel]:checked")).map((el) => el.value);
}

function getSelectedAutomationWorkspaces() {
  const select = $("notificationAutomationWorkspace");
  if (!select) return [];
  return Array.from(select.selectedOptions || []).map((option) => option.value).filter(Boolean);
}

function formatAutomationTrigger(triggerKey) {
  const labels = {
    ai_budget_80: "AI budget reaches 80%",
    workspace_inactive_7_days: "Workspace inactive 7 days",
    failed_payment: "Failed payment",
    failed_email_delivery_gt_10: "Failed email deliveries > 10",
    storage_usage_80: "Storage usage over 80%"
  };
  return labels[triggerKey] || triggerKey || "Unknown trigger";
}

function renderNotificationAutomations(data = {}) {
  const rules = Array.isArray(data.rows) ? data.rows : [];
  const runs = Array.isArray(data.runs) ? data.runs : [];
  renderTable($("notificationAutomationRules"), {
    columns: [
      { label: "Rule", key: "name", render: (row) => `<strong>${escapeHtml(row.name || "")}</strong>` },
      { label: "Trigger", key: "trigger_key", render: (row) => escapeHtml(formatAutomationTrigger(row.trigger_key)) },
      { label: "Channels", key: "channels_json", render: (row) => (row.channels || parseOwnerJson(row.channels_json, [])).map((channel) => `<span class="notification-channel-pill">${escapeHtml(channel)}</span>`).join(" ") },
      { label: "State", key: "enabled", render: (row) => formatOwnerStatus(Number(row.enabled || 0) ? "enabled" : "disabled") },
      { label: "Cooldown", key: "cooldown_minutes", render: (row) => `${Number(row.cooldown_minutes || 0).toLocaleString()} min` },
      { label: "Last run", key: "last_run_at", render: (row) => escapeHtml(formatAdminTimestamp(row.last_run_at)) },
      { label: "Action", key: "_action", render: (row) => `
        <div class="owner-actions">
          <button class="btn btn-ghost" type="button" data-owner-action="notification-automation-test" data-id="${escapeHtml(row.id)}">Test</button>
          <button class="btn btn-ghost" type="button" data-owner-action="notification-automation-toggle" data-id="${escapeHtml(row.id)}" data-enabled="${Number(row.enabled || 0) ? "0" : "1"}">${Number(row.enabled || 0) ? "Disable" : "Enable"}</button>
          <button class="btn btn-ghost" type="button" data-owner-action="notification-automation-delete" data-id="${escapeHtml(row.id)}">Delete</button>
        </div>
      ` }
    ],
    rows: rules,
    emptyText: "No automation rules yet."
  });
  renderTable($("notificationAutomationRuns"), {
    columns: [
      { label: "Rule", key: "rule_name", render: (row) => escapeHtml(row.rule_name || row.rule_id || "") },
      { label: "Trigger", key: "trigger_key", render: (row) => escapeHtml(formatAutomationTrigger(row.trigger_key)) },
      { label: "Status", key: "status", render: (row) => formatOwnerStatus(row.status || "unknown") },
      { label: "Result", key: "result_json", render: (row) => {
        const result = parseOwnerJson(row.result_json, {});
        const recipients = Number(result.estimatedRecipients || 0).toLocaleString();
        const cost = formatCurrencyEUR(result.estimatedCost || 0);
        return `${recipients} recipients / ${cost}`;
      } },
      { label: "Created", key: "created_at", render: (row) => escapeHtml(formatAdminTimestamp(row.created_at)) }
    ],
    rows: runs,
    emptyText: "No automation tests have run yet."
  });
}

function renderNotificationStats(stats) {
  renderOwnerSummary($("notificationDeliveryStats"), [
    { label: "Pending", value: stats?.pending || 0, tone: Number(stats?.pending || 0) ? "warn" : "" },
    { label: "Sent", value: stats?.sent || 0 },
    { label: "Delivered", value: stats?.delivered || 0, tone: Number(stats?.delivered || 0) ? "ok" : "" },
    { label: "Failed", value: stats?.failed || 0, tone: Number(stats?.failed || 0) ? "failed" : "ok" },
    { label: "Pending email", value: stats?.emailPending || 0, tone: Number(stats?.emailPending || 0) ? "warn" : "" },
    { label: "Sent email", value: stats?.emailSent || 0, tone: Number(stats?.emailSent || 0) ? "ok" : "" },
    { label: "Failed email", value: stats?.emailFailed || 0, tone: Number(stats?.emailFailed || 0) ? "failed" : "ok" },
    { label: "Pending SMS", value: stats?.smsPending || 0, tone: Number(stats?.smsPending || 0) ? "warn" : "" },
    { label: "Sent SMS", value: stats?.smsSent || 0, tone: Number(stats?.smsSent || 0) ? "ok" : "" },
    { label: "Failed SMS", value: stats?.smsFailed || 0, tone: Number(stats?.smsFailed || 0) ? "failed" : "ok" },
    { label: "SMS cost", value: formatCurrencyEUR(stats?.smsCost || 0) },
    { label: "Skipped", value: stats?.skipped || 0 },
    { label: "Total cost", value: formatCurrencyEUR(stats?.totalCost || 0) }
  ]);
}

function renderNotifications(data) {
  syncOwnerWorkspaceSelects();
  const rows = Array.isArray(data) ? data : (data.campaigns?.rows || data.rows || []);
  const templates = Array.isArray(data?.templates) ? data.templates : [];
  const summary = data?.campaigns?.summary || data?.summary || {};
  const estimate = state.notificationControl.lastEstimate;
  renderOwnerSummary($("notificationsSummary"), [
    { label: "Drafts", value: summary.drafts || 0 },
    { label: "Scheduled", value: summary.scheduled || 0, tone: Number(summary.scheduled || 0) ? "warn" : "" },
    { label: "Sent this month", value: summary.sentThisMonth || 0, tone: Number(summary.sentThisMonth || 0) ? "ok" : "" },
    { label: "Failed", value: summary.failed || 0, tone: Number(summary.failed || 0) ? "failed" : "ok" },
    { label: "Estimated monthly cost", value: formatCurrencyEUR(summary.estimatedMonthlyCost || 0) }
  ]);
  renderNotificationTemplates(templates);
  renderNotificationAutomations(data.automation || state.notificationControl.automation || {});
  renderNotificationStats(state.notificationControl.stats || {});
  if (estimate) {
    if ($("notificationEstimatedRecipients")) $("notificationEstimatedRecipients").textContent = Number(estimate.recipients || 0).toLocaleString();
    if ($("notificationEstimatedSms")) $("notificationEstimatedSms").textContent = formatCurrencyEUR(estimate.smsCost || 0);
    if ($("notificationEstimatedEmail")) $("notificationEstimatedEmail").textContent = formatCurrencyEUR(estimate.emailCost || 0);
  }
  renderTable($("notificationsTable"), {
    columns: [
      { label: "Title", key: "title", render: (row) => escapeHtml(row.title || "") },
      { label: "Channels", key: "channels_json", render: (row) => (row.channels || parseOwnerJson(row.channels_json, [])).map((channel) => `<span class="notification-channel-pill">${escapeHtml(channel)}</span>`).join(" ") },
      { label: "Target", key: "target_type", render: (row) => escapeHtml(formatNotificationTarget(row)) },
      { label: "Status", key: "status", render: (row) => formatOwnerStatus(row.status || "draft") },
      { label: "Scheduled", key: "scheduled_at", render: (row) => escapeHtml(formatAdminTimestamp(row.scheduled_at)) },
      { label: "Recipients", key: "delivery_count", render: (row) => Number(row.delivery_count || 0).toLocaleString() },
      { label: "Sent", key: "sent_count", render: (row) => Number(row.sent_count || 0).toLocaleString() },
      { label: "Failed", key: "failed_count", render: (row) => Number(row.failed_count || 0).toLocaleString() },
      { label: "Estimated cost", key: "estimated_cost", render: (row) => formatCurrencyEUR(row.estimated_cost || 0) },
      { label: "Action", key: "_action", render: (row) => `
        <div class="owner-actions">
          <button class="btn btn-ghost" type="button" data-owner-action="notification-select" data-id="${escapeHtml(row.id)}">View</button>
          <button class="btn btn-ghost" type="button" data-owner-action="notification-estimate-row" data-id="${escapeHtml(row.id)}">Estimate</button>
          <button class="btn btn-ghost" type="button" data-owner-action="notification-build-row" data-id="${escapeHtml(row.id)}">Build deliveries</button>
          <button class="btn btn-secondary" type="button" data-owner-action="notification-send-in-app-row" data-id="${escapeHtml(row.id)}">Send in-app</button>
          <button class="btn btn-primary" type="button" data-owner-action="notification-send-email-row" data-id="${escapeHtml(row.id)}">Send email</button>
          <button class="btn btn-ghost" type="button" data-owner-action="notification-retry-email-row" data-id="${escapeHtml(row.id)}">Retry failed email</button>
          <button class="btn btn-ghost" type="button" data-owner-action="notification-send-sms-dry-run-row" data-id="${escapeHtml(row.id)}">Send SMS dry-run</button>
          <button class="btn btn-secondary" type="button" data-owner-action="notification-send-sms-row" data-id="${escapeHtml(row.id)}">Send SMS</button>
          <button class="btn btn-ghost" type="button" data-owner-action="notification-retry-sms-row" data-id="${escapeHtml(row.id)}">Retry failed SMS</button>
          <button class="btn btn-ghost" type="button" data-owner-action="notification-cancel-row" data-id="${escapeHtml(row.id)}">Cancel</button>
        </div>
      ` }
    ],
    rows,
    emptyText: "No notification campaigns yet."
  });
  if (!estimate) updateNotificationEstimate();
}

function renderBranding(data) {
  syncOwnerWorkspaceSelects();
  const settings = data.platform?.settings || {};
  if ($("brandingPlatformName")) $("brandingPlatformName").value = settings.platformName || "StudiesTalk";
  if ($("brandingSupportEmail")) $("brandingSupportEmail").value = settings.supportEmail || "";
  if ($("brandingLogoUrl")) $("brandingLogoUrl").value = settings.logoUrl || "";
  if ($("brandingDefaultTheme")) $("brandingDefaultTheme").value = settings.defaultTheme || "default";
  renderTable($("brandingTable"), {
    columns: [
      { label: "Workspace", key: "workspace_id", render: (row) => escapeHtml(row.workspace_id || "") },
      { label: "Domain", key: "domain", render: (row) => escapeHtml(row.domain || "") },
      { label: "Status", key: "status", render: (row) => formatOwnerStatus(row.status || "pending") },
      { label: "Token", key: "verification_token", render: (row) => escapeHtml(row.verification_token || "") }
    ],
    rows: data.domains || [],
    emptyText: "No custom domains configured."
  });
}

function renderReports(data) {
  syncOwnerWorkspaceSelects();
  renderOwnerSummary($("reportsSummary"), (data.cards || []).map((card) => ({
    label: card.label,
    value: card.value,
    tone: "ok"
  })));
}

async function refreshOwnerControl(tab = state.currentTab) {
  const errorEl = $(ownerErrorId(tab));
  setError(errorEl, "");
  try {
    if (tab === "operations") {
      const [data, logs, jobs] = await Promise.all([
        api("/api/admin/operations/health"),
        api("/api/admin/operations/logs/summary"),
        api("/api/admin/operations/jobs")
      ]);
      state.ownerControls.operations = data;
      renderOperations(data, logs, jobs);
    } else if (tab === "backups") {
      const [status, history, evidence] = await Promise.all([
        api("/api/admin/backups/status"),
        api("/api/admin/backups/history"),
        api("/api/admin/backups/evidence")
      ]);
      renderBackups(status, history.rows || [], evidence);
    } else if (tab === "lifecycle") {
      const data = await api("/api/admin/workspaces/lifecycle");
      renderLifecycle(data);
    } else if (tab === "support") {
      const data = await api("/api/admin/support/impersonation/active");
      renderSupport(data);
    } else if (tab === "incidents") {
      const data = await api("/api/admin/incidents");
      renderIncidents(data);
    } else if (tab === "data-governance") {
      const [overview, requests] = await Promise.all([
        api("/api/admin/data-governance/overview"),
        api("/api/admin/data-governance/delete-requests")
      ]);
      renderDataGovernance(overview, requests.rows || []);
    } else if (tab === "notifications") {
      const [campaigns, templates, automation] = await Promise.all([
        api("/api/admin/notifications-control/campaigns"),
        api("/api/admin/notifications-control/templates"),
        api("/api/admin/notifications-control/automation-rules")
      ]);
      state.notificationControl.automation = automation;
      if (state.notificationControl.selectedCampaignId) {
        state.notificationControl.stats = await api(`/api/admin/notifications-control/campaigns/${encodeURIComponent(state.notificationControl.selectedCampaignId)}/stats`).catch(() => null);
      }
      renderNotifications({ campaigns, templates: templates.rows || [], automation });
    } else if (tab === "branding") {
      const data = await api("/api/admin/branding");
      renderBranding(data);
    } else if (tab === "reports") {
      const data = await api("/api/admin/reports/overview");
      renderReports(data);
    }
  } catch (error) {
    setError(errorEl, error.message || "Failed to load owner controls.");
  }
}

function buildTableHtml({ columns, rows, emptyText = "No data" }) {
  if (!rows || !rows.length) {
    return `<div class="table-empty muted">${emptyText}</div>`;
  }

  const thead = columns
    .map((c) => {
      const styles = [];
      if (c.width) styles.push(`width:${c.width}`);
      if (c.align) styles.push(`text-align:${c.align}`);
      return `<th style="${styles.join(";")}">${escapeHtml(c.label)}</th>`;
    })
    .join("");

  const tbody = rows
    .map((r) => {
      const tds = columns
        .map((c) => {
          const v = typeof c.render === "function" ? c.render(r) : r[c.key];
          const styles = [];
          if (c.align) styles.push(`text-align:${c.align}`);
          return `<td${styles.length ? ` style="${styles.join(";")}"` : ""}>${v ?? ""}</td>`;
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");

  return `<table class="table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`;
}

function renderTable(el, { columns, rows, emptyText = "No data" }) {
  el.innerHTML = buildTableHtml({ columns, rows, emptyText });
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
  document.body.classList.add("admin-authenticated");
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
  document.body.classList.remove("admin-authenticated");
  persistUserId(null);
  localStorage.removeItem("studis_admin_access_token");
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

const btnSecretsRefreshEl = $("btnSecretsRefresh");
if (btnSecretsRefreshEl) {
  btnSecretsRefreshEl.addEventListener("click", () => {
    refreshSecrets().catch((e) => setError($("globalError"), e.message));
  });
}

const btnPaymentGatewaysRefreshEl = $("btnPaymentGatewaysRefresh");
if (btnPaymentGatewaysRefreshEl) {
  btnPaymentGatewaysRefreshEl.addEventListener("click", () => {
    refreshPaymentGateways().catch((e) => setError($("globalError"), e.message));
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
        body: JSON.stringify(payload),
        credentials: "same-origin"
      });
      let result = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(result.error || `Login failed (${resp.status})`);
      }
      if (result.mfaRequired) {
        result = await completeMfaChallenge(result);
      }

      state.userId = result.userId || result.user?.userId || result.user?.id || identifier;
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

[
  "notificationTargetType",
  "notificationWorkspace",
  "notificationPlan",
  "notificationUsage",
  "notificationRole",
  "notificationBody"
].forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.addEventListener(id === "notificationBody" ? "input" : "change", updateNotificationEstimate);
});
document.querySelectorAll("[data-notification-channel]").forEach((el) => {
  el.addEventListener("change", updateNotificationEstimate);
});

document.addEventListener("click", (event) => {
  const gatewayTab = event.target.closest("[data-gateway-provider]");
  if (gatewayTab) {
    state.paymentGateways.activeProvider = String(gatewayTab.dataset.gatewayProvider || "stripe").trim();
    renderPaymentGatewaysPanel();
    return;
  }

  const gatewayActionButton = event.target.closest("[data-gateway-action]");
  if (gatewayActionButton) {
    const action = gatewayActionButton.dataset.gatewayAction;
    const provider = gatewayActionButton.dataset.provider;
    const keyName = gatewayActionButton.dataset.keyName;
    const run = async () => {
      if (action === "save") {
        await saveGatewayProvider(provider);
      } else if (action === "test") {
        await testGatewayProvider(provider);
      } else if (action === "rotate") {
        await rotateGatewaySecret(provider, keyName);
      } else if (action === "delete") {
        await deleteGatewaySecret(provider, keyName);
      } else if (action === "set-active") {
        await setPaymentActiveProvider(provider);
      } else if (action === "refresh-events") {
        await refreshPaymentGateways();
      }
    };
    run().catch((error) => {
      setPaymentGatewaysFeedback(error.message || "Payment gateway action failed.", "error");
      renderPaymentGatewaysPanel();
    });
    return;
  }

  const costActionButton = event.target.closest("[data-cost-control-action]");
  if (costActionButton) {
    const action = costActionButton.dataset.costControlAction;
    const limitId = costActionButton.dataset.limitId;
    const alertId = costActionButton.dataset.alertId;
    const run = async () => {
      if (action === "save-limit") {
        await saveCostControlLimit();
      } else if (action === "delete-limit") {
        await deleteCostControlLimit(limitId);
      } else if (action === "ack-alert") {
        await acknowledgeCostAlert(alertId);
      }
    };
    run().catch((error) => setCostControlFeedback(error.message || "Cost control action failed.", "error"));
    return;
  }

  const ownerActionButton = event.target.closest("[data-owner-action]");
  if (ownerActionButton) {
    const action = ownerActionButton.dataset.ownerAction;
    const run = async () => {
      if (action === "refresh") {
        await refreshOwnerControl(ownerActionButton.dataset.ownerTarget || state.currentTab);
      } else if (action === "provider-test") {
        await api(`/api/admin/operations/test-provider/${encodeURIComponent(ownerActionButton.dataset.provider || "")}`, { method: "POST", body: {} });
        await refreshOwnerControl("operations");
      } else if (action === "backup-run") {
        if (!confirmAction("Run a manual backup now?")) return;
        await api("/api/admin/backups/run", { method: "POST", body: {} });
        await refreshOwnerControl("backups");
      } else if (action === "restore-dry-run") {
        if (!confirmTypedAction({ message: "Run restore dry-run verification?", expected: "DRY RUN" })) return;
        await api("/api/admin/backups/restore-dry-run", { method: "POST", body: {} });
        await refreshOwnerControl("backups");
      } else if (action === "lifecycle-run") {
        const workspaceId = $("lifecycleWorkspace")?.value || "";
        const lifecycleAction = $("lifecycleAction")?.value || "suspend";
        const reason = requireReason($("lifecycleReason")?.value || "", "Lifecycle reason");
        const typedActions = new Set(["suspend", "archive", "force-logout", "reset-overrides", "transfer-owner"]);
        if (typedActions.has(lifecycleAction) && !confirmTypedAction({
          message: `Apply ${lifecycleAction} to workspace ${workspaceId}?`,
          expected: lifecycleAction.toUpperCase()
        })) return;
        await api(`/api/admin/workspaces/${encodeURIComponent(workspaceId)}/${encodeURIComponent(lifecycleAction)}`, {
          method: "POST",
          body: {
            reason,
            ownerUserId: $("lifecycleOwnerUserId")?.value || ""
          }
        });
        await refreshOwnerControl("lifecycle");
      } else if (action === "support-start") {
        const reason = requireReason($("supportReason")?.value || "", "Support reason");
        await api("/api/admin/support/impersonation/start", {
          method: "POST",
          body: {
            workspaceId: $("supportWorkspace")?.value || "",
            targetUserId: $("supportTargetUser")?.value || "",
            readOnly: $("supportReadOnly")?.checked !== false,
            reason
          }
        });
        await refreshOwnerControl("support");
      } else if (action === "support-end") {
        if (!confirmAction("End active support sessions?")) return;
        await api("/api/admin/support/impersonation/end", { method: "POST", body: {} });
        await refreshOwnerControl("support");
      } else if (action === "support-export") {
        window.location.href = "/api/admin/support/audit/export?format=csv";
      } else if (action === "maintenance-save") {
        if ($("maintenanceEnabled")?.checked && !requireReason($("maintenanceMessage")?.value || "", "Maintenance public message")) return;
        const disabledFeatures = [...document.querySelectorAll("[data-maint-feature]:checked")].map((input) => input.dataset.maintFeature);
        await api("/api/admin/maintenance", {
          method: "POST",
          body: {
            enabled: $("maintenanceEnabled")?.checked || false,
            publicMessage: $("maintenanceMessage")?.value || "",
            disabledFeatures
          }
        });
        await refreshOwnerControl("incidents");
      } else if (action === "incident-create") {
        requireReason($("incidentInternalNote")?.value || $("incidentPublicMessage")?.value || "", "Incident reason or note");
        await api("/api/admin/incidents", {
          method: "POST",
          body: {
            title: $("incidentTitle")?.value || "",
            severity: $("incidentSeverity")?.value || "info",
            publicMessage: $("incidentPublicMessage")?.value || "",
            internalNote: $("incidentInternalNote")?.value || ""
          }
        });
        await refreshOwnerControl("incidents");
      } else if (action === "governance-create") {
        const workspaceId = $("governanceWorkspace")?.value || "";
        const type = $("governanceType")?.value || "export";
        const reason = requireReason($("governanceReason")?.value || "", "Governance reason");
        if (type === "delete" && !confirmTypedAction({ message: `Create data deletion request for ${workspaceId}?`, expected: "DELETE" })) return;
        if (type === "export") {
          await api(`/api/admin/data-governance/export/${encodeURIComponent(workspaceId)}`, {
            method: "POST",
            body: { reason }
          });
        } else {
          await api("/api/admin/data-governance/delete-request", {
            method: "POST",
            body: { workspaceId, reason }
          });
        }
        await refreshOwnerControl("data-governance");
      } else if (action === "notification-create") {
        const workspaceIds = getSelectedNotificationWorkspaces();
        const sendMode = $("notificationSendMode")?.value || "draft";
        const result = await api("/api/admin/notifications-control/campaigns", {
          method: "POST",
          body: {
            title: $("notificationTitle")?.value || "",
            description: $("notificationDescription")?.value || "",
            subject: $("notificationSubject")?.value || "",
            body: $("notificationBody")?.value || "",
            channels: getSelectedNotificationChannels(),
            priority: $("notificationPriority")?.value || "normal",
            targetType: $("notificationTargetType")?.value || "all_workspaces",
            workspaceIds,
            plan: $("notificationPlan")?.value || "",
            role: $("notificationRole")?.value || "",
            status: sendMode === "scheduled" ? "scheduled" : "draft",
            scheduledAt: $("notificationScheduledAt")?.value || null
          }
        });
        state.notificationControl.selectedCampaignId = result?.row?.id || "";
        state.notificationControl.lastEstimate = null;
        await refreshOwnerControl("notifications");
      } else if (action === "notification-select") {
        state.notificationControl.selectedCampaignId = ownerActionButton.dataset.id || "";
        state.notificationControl.stats = await api(`/api/admin/notifications-control/campaigns/${encodeURIComponent(state.notificationControl.selectedCampaignId)}/stats`);
        await refreshOwnerControl("notifications");
      } else if (action === "notification-estimate" || action === "notification-estimate-row") {
        const campaignId = ownerActionButton.dataset.id || state.notificationControl.selectedCampaignId;
        if (!campaignId) throw new Error("Save or select a campaign before estimating.");
        state.notificationControl.selectedCampaignId = campaignId;
        state.notificationControl.lastEstimate = await api(`/api/admin/notifications-control/campaigns/${encodeURIComponent(campaignId)}/estimate`, { method: "POST", body: {} });
        await refreshOwnerControl("notifications");
      } else if (action === "notification-build-deliveries" || action === "notification-build-row") {
        const campaignId = ownerActionButton.dataset.id || state.notificationControl.selectedCampaignId;
        if (!campaignId) throw new Error("Save or select a campaign before building deliveries.");
        state.notificationControl.selectedCampaignId = campaignId;
        await api(`/api/admin/notifications-control/campaigns/${encodeURIComponent(campaignId)}/build-deliveries`, { method: "POST", body: {} });
        state.notificationControl.stats = await api(`/api/admin/notifications-control/campaigns/${encodeURIComponent(campaignId)}/stats`);
        state.notificationControl.lastEstimate = await api(`/api/admin/notifications-control/campaigns/${encodeURIComponent(campaignId)}/estimate`, { method: "POST", body: {} });
        await refreshOwnerControl("notifications");
      } else if (action === "notification-send-row" || action === "notification-dry-run-row" || action === "notification-send-in-app-row" || action === "notification-send-email-row" || action === "notification-send-sms-dry-run-row" || action === "notification-send-sms-row") {
        const campaignId = ownerActionButton.dataset.id || state.notificationControl.selectedCampaignId;
        if (!campaignId) throw new Error("Select a campaign before sending.");
        state.notificationControl.selectedCampaignId = campaignId;
        const endpoint = action === "notification-send-email-row"
          ? "send-email"
          : action === "notification-send-sms-dry-run-row" || action === "notification-send-sms-row"
            ? "send-sms"
          : action === "notification-send-in-app-row"
            ? "send-in-app"
            : "send";
        if (action === "notification-send-sms-row" && !confirmAction("SMS can create provider charges. Confirm before sending.")) return;
        if (!action.includes("dry-run") && !await confirmNotificationSend(campaignId, `Send ${endpoint} campaign?`)) return;
        await api(`/api/admin/notifications-control/campaigns/${encodeURIComponent(campaignId)}/${endpoint}`, {
          method: "POST",
          body: { dryRun: action === "notification-dry-run-row" || action === "notification-send-sms-dry-run-row" }
        });
        state.notificationControl.stats = await api(`/api/admin/notifications-control/campaigns/${encodeURIComponent(campaignId)}/stats`);
        await refreshOwnerControl("notifications");
      } else if (action === "notification-retry-email-row") {
        const campaignId = ownerActionButton.dataset.id || state.notificationControl.selectedCampaignId;
        if (!campaignId) throw new Error("Select a campaign before retrying email.");
        state.notificationControl.selectedCampaignId = campaignId;
        const failed = await api(`/api/admin/notifications-control/deliveries?campaignId=${encodeURIComponent(campaignId)}&status=failed&channel=email&limit=100`);
        const rows = Array.isArray(failed?.rows) ? failed.rows : [];
        if (!rows.length) throw new Error("No failed email deliveries to retry.");
        if (!confirmAction(`Retry ${rows.length} failed email delivery row(s)?`)) return;
        for (const row of rows) {
          await api(`/api/admin/notifications-control/deliveries/${encodeURIComponent(row.id)}/retry-email`, { method: "POST", body: {} });
        }
        state.notificationControl.stats = await api(`/api/admin/notifications-control/campaigns/${encodeURIComponent(campaignId)}/stats`);
        await refreshOwnerControl("notifications");
      } else if (action === "notification-retry-sms-row") {
        const campaignId = ownerActionButton.dataset.id || state.notificationControl.selectedCampaignId;
        if (!campaignId) throw new Error("Select a campaign before retrying SMS.");
        if (!confirmAction("SMS can create provider charges. Confirm before sending.")) return;
        state.notificationControl.selectedCampaignId = campaignId;
        const failed = await api(`/api/admin/notifications-control/deliveries?campaignId=${encodeURIComponent(campaignId)}&status=failed&channel=sms&limit=25`);
        const rows = Array.isArray(failed?.rows) ? failed.rows : [];
        if (!rows.length) throw new Error("No failed SMS deliveries to retry.");
        if (!confirmAction(`Retry ${rows.length} failed SMS delivery row(s)?`)) return;
        for (const row of rows) {
          await api(`/api/admin/notifications-control/deliveries/${encodeURIComponent(row.id)}/retry-sms`, { method: "POST", body: {} });
        }
        state.notificationControl.stats = await api(`/api/admin/notifications-control/campaigns/${encodeURIComponent(campaignId)}/stats`);
        await refreshOwnerControl("notifications");
      } else if (action === "notification-cancel-row") {
        const campaignId = ownerActionButton.dataset.id || state.notificationControl.selectedCampaignId;
        if (!campaignId) throw new Error("Select a campaign before cancelling.");
        if (!confirmTypedAction({ message: `Cancel notification campaign ${campaignId}?`, expected: "CANCEL" })) return;
        state.notificationControl.selectedCampaignId = campaignId;
        await api(`/api/admin/notifications-control/campaigns/${encodeURIComponent(campaignId)}/cancel`, { method: "POST", body: {} });
        state.notificationControl.stats = await api(`/api/admin/notifications-control/campaigns/${encodeURIComponent(campaignId)}/stats`);
        await refreshOwnerControl("notifications");
      } else if (action === "notification-template") {
        if ($("notificationSubject")) $("notificationSubject").value = ownerActionButton.dataset.subject || "";
        if ($("notificationBody")) $("notificationBody").value = ownerActionButton.dataset.body || "";
        updateNotificationEstimate();
      } else if (action === "notification-preview") {
        const text = ($("notificationBody")?.value || "Hello {{name}}, your school {{workspace}}...")
          .replaceAll("{{name}}", "Amina")
          .replaceAll("{{workspace}}", "North Campus")
          .replaceAll("{{plan}}", "Pro")
          .replaceAll("{{message}}", "maintenance starts tonight");
        if ($("notificationPreview")) $("notificationPreview").textContent = text;
        updateNotificationEstimate();
      } else if (action === "notification-automation-create") {
        const result = await api("/api/admin/notifications-control/automation-rules", {
          method: "POST",
          body: {
            name: $("notificationAutomationName")?.value || "",
            triggerKey: $("notificationAutomationTrigger")?.value || "ai_budget_80",
            channels: getSelectedAutomationChannels(),
            templateId: $("notificationAutomationTemplate")?.value || "",
            targetType: $("notificationAutomationTargetType")?.value || "all_workspaces",
            workspaceIds: getSelectedAutomationWorkspaces(),
            role: $("notificationAutomationRole")?.value || "",
            plan: $("notificationAutomationPlan")?.value || "",
            cooldownMinutes: $("notificationAutomationCooldown")?.value || 1440,
            enabled: $("notificationAutomationEnabled")?.checked !== false
          }
        });
        state.notificationControl.selectedAutomationRuleId = result?.row?.id || "";
        await refreshOwnerControl("notifications");
      } else if (action === "notification-automation-toggle") {
        await api(`/api/admin/notifications-control/automation-rules/${encodeURIComponent(ownerActionButton.dataset.id || "")}`, {
          method: "PATCH",
          body: { enabled: ownerActionButton.dataset.enabled === "1" }
        });
        await refreshOwnerControl("notifications");
      } else if (action === "notification-automation-test") {
        state.notificationControl.selectedAutomationRuleId = ownerActionButton.dataset.id || "";
        await api(`/api/admin/notifications-control/automation-rules/${encodeURIComponent(state.notificationControl.selectedAutomationRuleId)}/test`, { method: "POST", body: {} });
        await refreshOwnerControl("notifications");
      } else if (action === "notification-automation-delete") {
        if (!confirmTypedAction({ message: "Delete this notification automation rule?", expected: "DELETE" })) return;
        await api(`/api/admin/notifications-control/automation-rules/${encodeURIComponent(ownerActionButton.dataset.id || "")}`, { method: "DELETE" });
        await refreshOwnerControl("notifications");
      } else if (action === "branding-save") {
        await api("/api/admin/branding/platform", {
          method: "PATCH",
          body: {
            settings: {
              platformName: $("brandingPlatformName")?.value || "StudiesTalk",
              supportEmail: $("brandingSupportEmail")?.value || "",
              logoUrl: $("brandingLogoUrl")?.value || "",
              defaultTheme: $("brandingDefaultTheme")?.value || "default"
            }
          }
        });
        await refreshOwnerControl("branding");
      } else if (action === "branding-workspace-save") {
        await api(`/api/admin/branding/workspaces/${encodeURIComponent($("brandingWorkspace")?.value || "")}`, {
          method: "PATCH",
          body: { settings: { domain: $("brandingDomain")?.value || "" } }
        });
        await refreshOwnerControl("branding");
      } else if (action === "branding-domain-verify") {
        await api(`/api/admin/branding/domains/${encodeURIComponent($("brandingWorkspace")?.value || "")}/verify`, { method: "POST", body: {} });
        await refreshOwnerControl("branding");
      } else if (action === "reports-export") {
        window.location.href = "/api/admin/reports/export.csv?type=overview";
      }
    };
    run().catch((error) => setError($(ownerErrorId(state.currentTab)), error.message || "Owner-control action failed."));
    return;
  }

  const providerNav = event.target.closest("[data-secret-nav]");
  if (providerNav) {
    state.secrets.activeProvider = String(providerNav.dataset.secretNav || "").trim();
    renderSecretsPanel();
    return;
  }

  const emailControlTabButton = event.target.closest("[data-email-control-tab]");
  if (emailControlTabButton) {
    state.secrets.emailControl.activeTab = String(emailControlTabButton.dataset.emailControlTab || "overview");
    renderSecretsPanel();
    return;
  }

  const emailControlAction = event.target.closest("[data-email-control-action]");
  if (emailControlAction) {
    const action = emailControlAction.dataset.emailControlAction;
    const logId = emailControlAction.dataset.logId;
    const run = async () => {
      const workspaceId = getWorkspaceForAiBudget();
      if (action === "open-configuration") {
        state.secrets.emailControl.activeTab = "configuration";
        renderSecretsPanel();
        return;
      }
      if (action === "open-operations") {
        state.secrets.emailControl.activeTab = "operations";
        await refreshSecrets();
        return;
      }
      if (action === "show-failed") {
        state.secrets.emailControl.activeTab = "operations";
        state.secrets.emailControl.filters.status = "failed";
        await refreshSecrets();
        return;
      }
      if (action === "save-owner") {
        setEmailControlFeedback("Saving owner email...", "info");
        await api("/api/admin/email-control/owner", {
          method: "POST",
          body: {
            owner_enabled: $("emailControlOwnerEnabled")?.checked ? 1 : 0,
            owner_name: $("emailControlOwnerName")?.value || "",
            owner_email: $("emailControlOwnerEmail")?.value || "",
            owner_subject_prefix: $("emailControlOwnerPrefix")?.value || "",
            owner_signature: $("emailControlOwnerSignature")?.value || ""
          }
        });
        setEmailControlFeedback("Owner email saved.", "success");
        await refreshSecrets();
        state.secrets.emailControl.activeTab = "configuration";
        return;
      }
      if (action === "save-workspace") {
        if (!workspaceId) {
          setEmailControlFeedback("Select a workspace first.", "error");
          renderSecretsPanel();
          return;
        }
        setEmailControlFeedback("Saving workspace email...", "info");
        await api("/api/admin/email-control/workspace", {
          method: "POST",
          body: {
            workspaceId,
            workspace_email_enabled: $("emailControlWorkspaceEnabled")?.checked ? 1 : 0,
            workspace_email: $("emailControlWorkspaceEmail")?.value || "",
            workspace_sender_name: $("emailControlWorkspaceSender")?.value || "",
            workspace_subject_prefix: $("emailControlWorkspacePrefix")?.value || "",
            workspace_signature: $("emailControlWorkspaceSignature")?.value || "",
            use_owner_fallback: $("emailControlWorkspaceFallback")?.checked ? 1 : 0
          }
        });
        setEmailControlFeedback("Workspace email saved.", "success");
        await refreshSecrets();
        state.secrets.emailControl.activeTab = "configuration";
        return;
      }
      if (action === "send-test") {
        setEmailControlFeedback("Sending test email...", "info");
        const response = await api("/api/admin/email-control/test-send", {
          method: "POST",
          body: {
            mode: $("emailControlTestMode")?.value || "owner",
            workspaceId: workspaceId || "",
            to: $("emailControlTestTo")?.value || "",
            subject: $("emailControlTestSubject")?.value || "",
            message: $("emailControlTestMessage")?.value || ""
          }
        });
        setEmailControlFeedback(response?.mock ? "Test email logged in mock mode." : "Test email sent.", "success");
        await refreshSecrets();
        state.secrets.emailControl.activeTab = "configuration";
        return;
      }
      if (action === "retry-log") {
        setEmailControlFeedback("Retrying failed email...", "info");
        await api(`/api/admin/email-control/logs/${encodeURIComponent(logId)}/retry`, {
          method: "POST"
        });
        setEmailControlFeedback("Retry sent.", "success");
        state.secrets.emailControl.activeTab = "operations";
        await refreshSecrets();
      }
    };

    run().catch((error) => {
      setEmailControlFeedback(error.message || "Email control action failed.", "error");
      renderSecretsPanel();
    });
    return;
  }

  const button = event.target.closest("[data-secret-action]");
  if (button) {
    const action = button.dataset.secretAction;
    const provider = button.dataset.provider;
    const keyName = button.dataset.keyName;

    const run = async () => {
      if (action === "save-provider") {
        await saveSecretProvider(provider);
      } else if (action === "test-provider") {
        await testSecretProvider(provider);
      } else if (action === "rotate") {
        if (!confirmTypedAction({ message: `Rotate secret ${provider}/${keyName}?`, expected: "ROTATE" })) return;
        await rotateSecretField(provider, keyName);
      } else if (action === "delete") {
        if (!confirmTypedAction({ message: `Delete secret ${provider}/${keyName}? Env fallback may remain.`, expected: "DELETE" })) return;
        await deleteSecretField(provider, keyName);
      }
    };

    run().catch((error) => {
      if (provider) {
        setSecretStatusState(provider, error.message || "Secrets action failed.", "error");
      } else {
        setError($("globalError"), error.message || "Secrets action failed.");
      }
    });
    return;
  }

  const aiBudgetButton = event.target.closest("[data-ai-budget-action]");
  if (aiBudgetButton) {
    const action = aiBudgetButton.dataset.aiBudgetAction;
    const run = async () => {
      if (action === "save-default") {
        const input = $("secretsAiDefaultBudget");
        const value = Number(input?.value || 0);
        if (Number.isNaN(value) || value < 0) {
          setAiBudgetFeedback("Enter a non-negative amount.", "error");
          renderSecretsPanel();
          return;
        }
        const response = await fetch("/api/admin/ai-budget/default", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ amount: value })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || "Failed to save default AI budget.");
        }
        setAiBudgetFeedback("Default budget saved.", "success");
        await refreshSecrets();
      } else if (action === "save-workspace") {
        const workspaceId = getWorkspaceForAiBudget();
        if (!workspaceId || workspaceId === "all") {
          setAiBudgetFeedback("Select a workspace first.", "error");
          renderSecretsPanel();
          return;
        }
        const input = $("secretsAiWorkspaceBudget");
        const value = Number(input?.value || 0);
        if (Number.isNaN(value) || value < 0) {
          setAiBudgetFeedback("Enter a non-negative amount.", "error");
          renderSecretsPanel();
          return;
        }
        const response = await fetch(`/api/admin/ai-budget/workspace/${encodeURIComponent(workspaceId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ amount: value })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || "Failed to save workspace override.");
        }
        setAiBudgetFeedback("Workspace override saved.", "success");
        await refreshSecrets();
      }
    };

    run().catch((error) => {
      setAiBudgetFeedback(error.message || "AI budget action failed.", "error");
      renderSecretsPanel();
    });
    return;
  }

  const ownerEmailButton = event.target.closest("[data-owner-email-action]");
  if (ownerEmailButton) {
    const action = ownerEmailButton.dataset.ownerEmailAction;
    const run = async () => {
      const workspaceId = getWorkspaceForAiBudget();
      if (action === "use-owner") {
        const ownerInput = $("ownerEmailAddressInline");
        const workspaceReplyTo = $("workspaceEmailReplyToInline");
        if (workspaceReplyTo) {
          workspaceReplyTo.value = String(ownerInput?.value || "").trim();
        }
        return;
      }

      if (action === "save-owner") {
        setOwnerEmailFeedback("Saving owner email...", "info");
        await api("/api/admin/owner-email-settings", {
          method: "POST",
          body: {
            enabled: $("ownerEmailEnabledInline")?.checked ? 1 : 0,
            display_name: $("ownerEmailDisplayNameInline")?.value || "",
            owner_email: $("ownerEmailAddressInline")?.value || "",
            subject_prefix: $("ownerEmailSubjectPrefixInline")?.value || "",
            footer_text: $("ownerEmailFooterInline")?.value || ""
          }
        });
        setOwnerEmailFeedback("Owner email saved.", "success");
        await refreshSecrets();
        return;
      }

      if (action === "save-workspace") {
        if (!workspaceId || workspaceId === "all") {
          setOwnerEmailFeedback("Select a workspace first.", "error");
          renderSecretsPanel();
          return;
        }
        setOwnerEmailFeedback("Saving workspace email...", "info");
        await api(`/api/admin/workspace-email-settings/${encodeURIComponent(workspaceId)}`, {
          method: "POST",
          body: {
            enabled: $("workspaceEmailEnabledInline")?.checked ? 1 : 0,
            brand_school_name: $("workspaceEmailBrandInline")?.value || "",
            reply_to_email: $("workspaceEmailReplyToInline")?.value || "",
            subject_prefix: $("workspaceEmailSubjectPrefixInline")?.value || "",
            footer_text: $("workspaceEmailFooterInline")?.value || "",
            manual_body_text: ""
          }
        });
        setOwnerEmailFeedback("Workspace email saved.", "success");
        await refreshSecrets();
        return;
      }

      if (action === "send-test") {
        const scope = $("ownerEmailTestScopeInline")?.value || "owner";
        if (scope === "workspace" && (!workspaceId || workspaceId === "all")) {
          setOwnerEmailFeedback("Select a workspace first.", "error");
          renderSecretsPanel();
          return;
        }
        setOwnerEmailFeedback("Sending test email...", "info");
        const path = scope === "workspace"
          ? `/api/admin/workspace-email-settings/${encodeURIComponent(workspaceId)}/test`
          : "/api/admin/owner-email-settings/test";
        await api(path, {
          method: "POST",
          body: {
            to: $("ownerEmailTestToInline")?.value || "",
            subject: $("ownerEmailTestSubjectInline")?.value || "",
            body: $("ownerEmailTestBodyInline")?.value || ""
          }
        });
        setOwnerEmailFeedback("Test email sent.", "success");
        renderSecretsPanel();
      }
    };

    run().catch((error) => {
      setOwnerEmailFeedback(error.message || "Owner email action failed.", "error");
      renderSecretsPanel();
    });
    return;
  }
});

document.addEventListener("change", (event) => {
  const filter = event.target.closest("[data-email-control-filter]");
  if (!filter) return;
  const key = filter.dataset.emailControlFilter;
  if (key === "workspace") {
    state.secrets.emailControl.filters.workspaceId = String(filter.value || "").trim();
    const topWorkspace = getWorkspaceSelectElement();
    if (topWorkspace) {
      topWorkspace.value = state.secrets.emailControl.filters.workspaceId || "all";
      state.workspaceId = topWorkspace.value;
      updateWorkspaceMeta();
    }
  } else if (key === "status") {
    state.secrets.emailControl.filters.status = String(filter.value || "all").trim().toLowerCase();
  }
  refreshSecrets().catch((error) => {
    setEmailControlFeedback(error.message || "Failed to refresh Email Control Center.", "error");
    renderSecretsPanel();
  });
});

$("btnCostControlRefresh")?.addEventListener("click", () => {
  refreshCostControl().catch((error) => setCostControlFeedback(error.message || "Failed to refresh cost control.", "error"));
});

$("btnCostControlExport")?.addEventListener("click", () => {
  exportCostControlCsv().catch((error) => setCostControlFeedback(error.message || "Failed to export CSV.", "error"));
});

$("costControlPeriod")?.addEventListener("change", async (event) => {
  state.costControl.period = String(event.target?.value || "monthly").trim().toLowerCase();
  await refreshCostControl();
});

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

            <div class="invoice-field">
              <label class="invoice-label" for="inv_vat_rate">VAT rate (%)</label>
              <input class="input invoice-input" id="inv_vat_rate" type="number" min="0" step="0.01" value="19" />
              <div class="invoice-help">Configurable tax rate; verify with accounting before selling.</div>
            </div>

            <div class="invoice-field">
              <label class="invoice-label" for="inv_reverse_charge">Reverse charge note</label>
              <input class="input invoice-input" id="inv_reverse_charge" placeholder="Optional reverse charge note" />
              <div class="invoice-help">Use only when applicable to the buyer.</div>
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
        const vatRate = Number($("inv_vat_rate")?.value || 0);
        const reverseChargeNote = $("inv_reverse_charge")?.value.trim() || "";

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
              dueDate,
              vatRate,
              reverseChargeNote
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
  state.secrets.activeProvider = "email-control";
  state.secrets.emailControl.activeTab = "configuration";
  setTab("secrets");
  persistTab("secrets");
  refreshSecrets().catch((err) => setError($("globalError"), err.message));
});

$("msgGoEmailSettingsPageTop")?.addEventListener("click", () => {
  state.secrets.activeProvider = "email-control";
  state.secrets.emailControl.activeTab = "configuration";
  setTab("secrets");
  persistTab("secrets");
  refreshSecrets().catch((err) => setError($("globalError"), err.message));
});

$("msgOpenInboxPage")?.addEventListener("click", () => {
  state.secrets.activeProvider = "email-control";
  state.secrets.emailControl.activeTab = "operations";
  state.secrets.emailControl.filters.status = "inbound";
  setTab("secrets");
  persistTab("secrets");
  refreshSecrets().catch((err) => setError($("globalError"), err.message));
});

$("msgOpenSentPage")?.addEventListener("click", () => {
  state.secrets.activeProvider = "email-control";
  state.secrets.emailControl.activeTab = "operations";
  state.secrets.emailControl.filters.status = "sent";
  setTab("secrets");
  persistTab("secrets");
  refreshSecrets().catch((err) => setError($("globalError"), err.message));
});

$("msgOpenFailedPage")?.addEventListener("click", () => {
  state.secrets.activeProvider = "email-control";
  state.secrets.emailControl.activeTab = "operations";
  state.secrets.emailControl.filters.status = "failed";
  setTab("secrets");
  persistTab("secrets");
  refreshSecrets().catch((err) => setError($("globalError"), err.message));
});

$("btnMessagesRefresh")?.addEventListener("click", () => {
  refreshMessages().catch((err) => setError($("globalError"), err.message));
});
$("btnCreateInvoiceTop")?.addEventListener("click", () => {
  $("btnCreateInvoice")?.click();
});

$("btnOpenStripePortal")?.addEventListener("click", async () => {
  try {
    const workspaceId = state.workspaceId || "all";
    if (!workspaceId || workspaceId === "all") {
      alert("Select a workspace before opening the Stripe portal.");
      return;
    }
    const result = await api(`/api/admin/billing/stripe/workspaces/${encodeURIComponent(workspaceId)}/portal-session`, {
      method: "POST",
      body: {}
    });
    if (result?.url) window.open(result.url, "_blank", "noopener");
  } catch (err) {
    alert(err.message);
  }
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
  state.secrets.activeProvider = "email-control";
  state.secrets.emailControl.activeTab = "configuration";
  setTab("secrets");
  persistTab("secrets");
  refreshSecrets().catch((err) => setError($("globalError"), err.message));
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
  await refreshCostControl();
  await refreshMessages();
  await refreshSettings();
  await refreshSecrets();
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
    case "payment-gateways":
      await refreshPaymentGateways().catch(() => {});
      break;
    case "cost-control":
      await refreshCostControl().catch(() => {});
      break;
    case "operations":
    case "backups":
    case "lifecycle":
    case "support":
    case "incidents":
    case "data-governance":
    case "notifications":
    case "branding":
    case "reports":
      await refreshOwnerControl(tab).catch(() => {});
      break;
    case "settings":
      await refreshSettings().catch(() => {});
      break;
    case "secrets":
      await refreshSecrets().catch(() => {});
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
  localStorage.removeItem("studis_admin_access_token");
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

  const trust = overview.trust || {};
  const activeSupportSessions = Number(trust.activeSupportSessions || 0);
  if (activeSupportSessions > 0) {
    attentionItems.push({
      tone: "warn",
      icon: "fa-user-secret",
      title: `${activeSupportSessions} active support session${activeSupportSessions === 1 ? "" : "s"}`,
      meta: trust.lastSupportAccess ? `Last access: ${formatAdminTimestamp(trust.lastSupportAccess.timestamp)}` : "Support mode is currently active."
    });
  }
  if (trust.lastIncident) {
    attentionItems.push({
      tone: "warn",
      icon: "fa-shield-heart",
      title: "Recent incident evidence",
      meta: trust.lastIncident.publicMessage || trust.lastIncident.status || "Incident log has recent activity."
    });
  }
  if (trust.lastBackupRestoreTest) {
    attentionItems.push({
      tone: "success",
      icon: "fa-database",
      title: "Restore test evidence available",
      meta: formatAdminTimestamp(trust.lastBackupRestoreTest.finishedAt || trust.lastBackupRestoreTest.startedAt)
    });
  }
  if (trust.lastBillingFailure) {
    attentionItems.push({
      tone: "danger",
      icon: "fa-credit-card",
      title: "Recent billing failure",
      meta: trust.lastBillingFailure.invoiceNumber || trust.lastBillingFailure.id || "Invoice requires review."
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
  const stripeWorkspace = data.stripe?.workspace || null;
  const subscriptionStatus = String(stripeWorkspace?.stripeSubscriptionStatus || stripeWorkspace?.status || "").toLowerCase();
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

  if (data.stripe && !data.stripe.configured) {
    attentionItems.push({
      tone: "info",
      title: "Stripe subscriptions not configured",
      meta: "Manual invoices still work. Configure Stripe env values before enabling subscription checkout."
    });
  }

  if (stripeWorkspace) {
    attentionItems.unshift({
      tone: subscriptionStatus === "active" || subscriptionStatus === "trialing" ? "info" : subscriptionStatus === "past_due" || subscriptionStatus === "canceled" ? "danger" : "warn",
      title: `Subscription status: ${subscriptionStatus || "not set"}`,
      meta: stripeWorkspace.currentPeriodEnd ? `Current period ends ${formatAdminTimestamp(stripeWorkspace.currentPeriodEnd)}` : "Stripe subscription status is shown when available."
    });
    attentionItems.push({
      tone: "info",
      title: `VAT: ${stripeWorkspace.vatId || "not configured"} • ${stripeWorkspace.billingCountry || "country missing"}`,
      meta: `Currency ${stripeWorkspace.invoiceCurrency || stripeWorkspace.currency || "EUR"}${stripeWorkspace.reverseChargeApplicable ? " • reverse charge flagged" : ""}`
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
          <div class="billing-id">${escapeHtml(r.invoiceNumber || r.id || "—")}</div>
          <div class="muted" style="font-size:12px">${escapeHtml(r.id || "")}</div>
        `
      },
      {
        label: "Legal",
        key: "_legal",
        width: "130px",
        render: (r) => {
          const complete = !!(r.invoiceNumber && r.buyerCompanyName && (r.grossAmount != null || r.amountCents != null));
          return `<span class="billing-status-badge ${complete ? "billing-status-paid" : "billing-status-open"}">${complete ? "Ready" : "Missing"}</span>`;
        }
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
        if (!confirmTypedAction({ message: `Mark invoice ${invoiceId} as paid?`, expected: "PAID" })) return;
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
  warning.style.display = "none";
}

function cloneSettingsObject(value) {
  try {
    return JSON.parse(JSON.stringify(value && typeof value === "object" ? value : {}));
  } catch {
    return {};
  }
}

function isPlainSettingsObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function buildSettingsDiff(base, next) {
  if (Array.isArray(base) || Array.isArray(next)) {
    const baseJson = JSON.stringify(base ?? null);
    const nextJson = JSON.stringify(next ?? null);
    return baseJson === nextJson ? undefined : cloneSettingsObject(next);
  }
  if (!isPlainSettingsObject(base) || !isPlainSettingsObject(next)) {
    return JSON.stringify(base ?? null) === JSON.stringify(next ?? null) ? undefined : next;
  }

  const diff = {};
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(next || {})]);
  for (const key of keys) {
    const valueDiff = buildSettingsDiff(base?.[key], next?.[key]);
    if (valueDiff !== undefined) {
      diff[key] = valueDiff;
    }
  }
  return Object.keys(diff).length ? diff : undefined;
}

function getDefaultPlatformSettings() {
  return {
    workspaceDefaults: {
      maxUsersPerWorkspace: 50,
      defaultAiBudgetEur: 5,
      defaultStorageGb: 5,
      defaultEmailDailyLimit: 500,
      defaultSmsDailyLimit: 50
    },
    features: {
      aiEnabled: true,
      smsEnabled: true,
      emailEnabled: true,
      liveClassesEnabled: true,
      recordingEnabled: false,
      analyticsEnabled: true,
      paymentsEnabled: false,
      beta: false
    },
    costGovernance: {
      platformMonthlyBudgetEur: 100,
      workspaceMonthlyHardLimitEur: 20,
      workspaceMonthlySoftLimitEur: 15,
      alertThresholdPercent: 80,
      blockOnHardLimit: true
    },
    providerLimits: {
      openai: {
        monthlyLimitEur: 10,
        enabled: true
      },
      twilio: {
        dailySmsLimit: 50,
        monthlyLimitEur: 10,
        enabled: true
      },
      googleTranslate: {
        monthlyCharacterLimit: 500000,
        monthlyLimitEur: 10,
        enabled: true
      },
      ionosEmail: {
        dailyEmailLimit: 500,
        monthlyLimitEur: 5,
        enabled: true
      },
      storage: {
        maxGbPerWorkspace: 5,
        monthlyLimitEur: 5,
        enabled: true
      },
      jitsi: {
        monthlyLimitEur: 20,
        enabled: false
      }
    },
    ai: {
      provider: "openai",
      enabled: true,
      realtimeEnabled: true,
      defaultModel: "gpt-4o-mini",
      realtimeVoice: "alloy",
      maxTokensPerRequest: 4000,
      maxSessionSeconds: 1800,
      idleTimeoutSeconds: 45,
      allowAiForNewWorkspaces: true
    },
    communication: {
      emailEnabled: true,
      smsEnabled: true,
      defaultSenderName: "StudiesTalk",
      defaultReplyTo: "",
      maxOtpPerUserPerDay: 5,
      maxEmailsPerWorkspacePerDay: 500,
      useOwnerEmailFallback: true
    },
    storage: {
      defaultAdapter: "local",
      uploadEnabled: true,
      maxFileMb: 25,
      maxVideoMb: 200,
      retentionDays: 365,
      allowedTypes: ["pdf", "docx", "png", "jpg", "jpeg", "mp3", "mp4"]
    },
    security: {
      sessionTimeoutMinutes: 60,
      auditRetentionDays: 365,
      requireAdmin2fa: false,
      requireEmailVerification: true,
      maxLoginAttempts: 8,
      lockoutMinutes: 15,
      requireStrongPasswords: true,
      allowDevBypass: false
    },
    subscriptions: {
      defaultPlan: "starter",
      trialDays: 14,
      autoSuspendOnFailedPayment: false,
      plans: {
        starter: {
          monthlyPriceEur: 49,
          maxUsers: 50,
          aiBudgetEur: 5,
          storageGb: 5
        },
        professional: {
          monthlyPriceEur: 149,
          maxUsers: 200,
          aiBudgetEur: 25,
          storageGb: 50
        },
        enterprise: {
          monthlyPriceEur: 499,
          maxUsers: 1000,
          aiBudgetEur: 100,
          storageGb: 250
        }
      }
    }
  };
}

function toNumberOrFallback(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePlatformSettings(settings = {}) {
  const defaults = getDefaultPlatformSettings();
  const source = settings && typeof settings === "object" ? settings : {};
  return {
    workspaceDefaults: {
      maxUsersPerWorkspace: Math.max(1, Math.round(toNumberOrFallback(source.workspaceDefaults?.maxUsersPerWorkspace, defaults.workspaceDefaults.maxUsersPerWorkspace))),
      defaultAiBudgetEur: Math.max(0, toNumberOrFallback(source.workspaceDefaults?.defaultAiBudgetEur, defaults.workspaceDefaults.defaultAiBudgetEur)),
      defaultStorageGb: Math.max(0, toNumberOrFallback(source.workspaceDefaults?.defaultStorageGb, defaults.workspaceDefaults.defaultStorageGb)),
      defaultEmailDailyLimit: Math.max(0, Math.round(toNumberOrFallback(source.workspaceDefaults?.defaultEmailDailyLimit, defaults.workspaceDefaults.defaultEmailDailyLimit))),
      defaultSmsDailyLimit: Math.max(0, Math.round(toNumberOrFallback(source.workspaceDefaults?.defaultSmsDailyLimit, defaults.workspaceDefaults.defaultSmsDailyLimit)))
    },
    features: {
      aiEnabled: source.features?.aiEnabled !== false,
      smsEnabled: source.features?.smsEnabled !== false,
      emailEnabled: source.features?.emailEnabled !== false,
      liveClassesEnabled: source.features?.liveClassesEnabled !== false,
      recordingEnabled: !!source.features?.recordingEnabled,
      analyticsEnabled: source.features?.analyticsEnabled !== false,
      paymentsEnabled: !!source.features?.paymentsEnabled,
      beta: !!source.features?.beta
    },
    costGovernance: {
      platformMonthlyBudgetEur: Math.max(0, toNumberOrFallback(source.costGovernance?.platformMonthlyBudgetEur, defaults.costGovernance.platformMonthlyBudgetEur)),
      workspaceMonthlyHardLimitEur: Math.max(0, toNumberOrFallback(source.costGovernance?.workspaceMonthlyHardLimitEur, defaults.costGovernance.workspaceMonthlyHardLimitEur)),
      workspaceMonthlySoftLimitEur: Math.max(0, toNumberOrFallback(source.costGovernance?.workspaceMonthlySoftLimitEur, defaults.costGovernance.workspaceMonthlySoftLimitEur)),
      alertThresholdPercent: Math.min(100, Math.max(0, Math.round(toNumberOrFallback(source.costGovernance?.alertThresholdPercent, defaults.costGovernance.alertThresholdPercent)))),
      blockOnHardLimit: source.costGovernance?.blockOnHardLimit !== false
    },
    providerLimits: {
      openai: {
        enabled: source.providerLimits?.openai?.enabled !== false,
        monthlyLimitEur: Math.max(0, toNumberOrFallback(source.providerLimits?.openai?.monthlyLimitEur, defaults.providerLimits.openai.monthlyLimitEur))
      },
      twilio: {
        enabled: source.providerLimits?.twilio?.enabled !== false,
        dailySmsLimit: Math.max(0, Math.round(toNumberOrFallback(source.providerLimits?.twilio?.dailySmsLimit, defaults.providerLimits.twilio.dailySmsLimit))),
        monthlyLimitEur: Math.max(0, toNumberOrFallback(source.providerLimits?.twilio?.monthlyLimitEur, defaults.providerLimits.twilio.monthlyLimitEur))
      },
      googleTranslate: {
        enabled: source.providerLimits?.googleTranslate?.enabled !== false,
        monthlyCharacterLimit: Math.max(0, Math.round(toNumberOrFallback(source.providerLimits?.googleTranslate?.monthlyCharacterLimit, defaults.providerLimits.googleTranslate.monthlyCharacterLimit))),
        monthlyLimitEur: Math.max(0, toNumberOrFallback(source.providerLimits?.googleTranslate?.monthlyLimitEur, defaults.providerLimits.googleTranslate.monthlyLimitEur))
      },
      ionosEmail: {
        enabled: source.providerLimits?.ionosEmail?.enabled !== false,
        dailyEmailLimit: Math.max(0, Math.round(toNumberOrFallback(source.providerLimits?.ionosEmail?.dailyEmailLimit, defaults.providerLimits.ionosEmail.dailyEmailLimit))),
        monthlyLimitEur: Math.max(0, toNumberOrFallback(source.providerLimits?.ionosEmail?.monthlyLimitEur, defaults.providerLimits.ionosEmail.monthlyLimitEur))
      },
      storage: {
        enabled: source.providerLimits?.storage?.enabled !== false,
        maxGbPerWorkspace: Math.max(0, toNumberOrFallback(source.providerLimits?.storage?.maxGbPerWorkspace, defaults.providerLimits.storage.maxGbPerWorkspace)),
        monthlyLimitEur: Math.max(0, toNumberOrFallback(source.providerLimits?.storage?.monthlyLimitEur, defaults.providerLimits.storage.monthlyLimitEur))
      },
      jitsi: {
        enabled: !!source.providerLimits?.jitsi?.enabled,
        monthlyLimitEur: Math.max(0, toNumberOrFallback(source.providerLimits?.jitsi?.monthlyLimitEur, defaults.providerLimits.jitsi.monthlyLimitEur))
      }
    },
    ai: {
      provider: String(source.ai?.provider || defaults.ai.provider || "openai"),
      enabled: source.ai?.enabled !== false,
      realtimeEnabled: source.ai?.realtimeEnabled !== false,
      defaultModel: String(source.ai?.defaultModel || defaults.ai.defaultModel || ""),
      realtimeVoice: String(source.ai?.realtimeVoice || defaults.ai.realtimeVoice || ""),
      maxTokensPerRequest: Math.max(1, Math.round(toNumberOrFallback(source.ai?.maxTokensPerRequest, defaults.ai.maxTokensPerRequest))),
      maxSessionSeconds: Math.max(1, Math.round(toNumberOrFallback(source.ai?.maxSessionSeconds, defaults.ai.maxSessionSeconds))),
      idleTimeoutSeconds: Math.max(1, Math.round(toNumberOrFallback(source.ai?.idleTimeoutSeconds, defaults.ai.idleTimeoutSeconds))),
      allowAiForNewWorkspaces: source.ai?.allowAiForNewWorkspaces !== false
    },
    communication: {
      emailEnabled: source.communication?.emailEnabled !== false,
      smsEnabled: source.communication?.smsEnabled !== false,
      defaultSenderName: String(source.communication?.defaultSenderName || defaults.communication.defaultSenderName || ""),
      defaultReplyTo: String(source.communication?.defaultReplyTo || ""),
      maxOtpPerUserPerDay: Math.max(0, Math.round(toNumberOrFallback(source.communication?.maxOtpPerUserPerDay, defaults.communication.maxOtpPerUserPerDay))),
      maxEmailsPerWorkspacePerDay: Math.max(0, Math.round(toNumberOrFallback(source.communication?.maxEmailsPerWorkspacePerDay, defaults.communication.maxEmailsPerWorkspacePerDay))),
      useOwnerEmailFallback: source.communication?.useOwnerEmailFallback !== false
    },
    storage: {
      defaultAdapter: String(source.storage?.defaultAdapter || defaults.storage.defaultAdapter || "local"),
      uploadEnabled: source.storage?.uploadEnabled !== false,
      maxFileMb: Math.max(1, Math.round(toNumberOrFallback(source.storage?.maxFileMb, defaults.storage.maxFileMb))),
      maxVideoMb: Math.max(1, Math.round(toNumberOrFallback(source.storage?.maxVideoMb, defaults.storage.maxVideoMb))),
      retentionDays: Math.max(0, Math.round(toNumberOrFallback(source.storage?.retentionDays, defaults.storage.retentionDays))),
      allowedTypes: Array.isArray(source.storage?.allowedTypes)
        ? source.storage.allowedTypes.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
        : defaults.storage.allowedTypes.slice()
    },
    security: {
      sessionTimeoutMinutes: Math.max(5, Math.round(toNumberOrFallback(source.security?.sessionTimeoutMinutes, defaults.security.sessionTimeoutMinutes))),
      auditRetentionDays: Math.max(0, Math.round(toNumberOrFallback(source.security?.auditRetentionDays, defaults.security.auditRetentionDays))),
      requireAdmin2fa: !!source.security?.requireAdmin2fa,
      requireEmailVerification: source.security?.requireEmailVerification !== false,
      maxLoginAttempts: Math.max(1, Math.round(toNumberOrFallback(source.security?.maxLoginAttempts, defaults.security.maxLoginAttempts))),
      lockoutMinutes: Math.max(1, Math.round(toNumberOrFallback(source.security?.lockoutMinutes, defaults.security.lockoutMinutes))),
      requireStrongPasswords: source.security?.requireStrongPasswords !== false,
      allowDevBypass: !!source.security?.allowDevBypass
    },
    subscriptions: {
      defaultPlan: String(source.subscriptions?.defaultPlan || defaults.subscriptions.defaultPlan || "starter"),
      trialDays: Math.max(0, Math.round(toNumberOrFallback(source.subscriptions?.trialDays, defaults.subscriptions.trialDays))),
      autoSuspendOnFailedPayment: !!source.subscriptions?.autoSuspendOnFailedPayment,
      plans: {
        starter: {
          monthlyPriceEur: Math.max(0, toNumberOrFallback(source.subscriptions?.plans?.starter?.monthlyPriceEur, defaults.subscriptions.plans.starter.monthlyPriceEur)),
          maxUsers: Math.max(1, Math.round(toNumberOrFallback(source.subscriptions?.plans?.starter?.maxUsers, defaults.subscriptions.plans.starter.maxUsers))),
          aiBudgetEur: Math.max(0, toNumberOrFallback(source.subscriptions?.plans?.starter?.aiBudgetEur, defaults.subscriptions.plans.starter.aiBudgetEur)),
          storageGb: Math.max(0, toNumberOrFallback(source.subscriptions?.plans?.starter?.storageGb, defaults.subscriptions.plans.starter.storageGb))
        },
        professional: {
          monthlyPriceEur: Math.max(0, toNumberOrFallback(source.subscriptions?.plans?.professional?.monthlyPriceEur, defaults.subscriptions.plans.professional.monthlyPriceEur)),
          maxUsers: Math.max(1, Math.round(toNumberOrFallback(source.subscriptions?.plans?.professional?.maxUsers, defaults.subscriptions.plans.professional.maxUsers))),
          aiBudgetEur: Math.max(0, toNumberOrFallback(source.subscriptions?.plans?.professional?.aiBudgetEur, defaults.subscriptions.plans.professional.aiBudgetEur)),
          storageGb: Math.max(0, toNumberOrFallback(source.subscriptions?.plans?.professional?.storageGb, defaults.subscriptions.plans.professional.storageGb))
        },
        enterprise: {
          monthlyPriceEur: Math.max(0, toNumberOrFallback(source.subscriptions?.plans?.enterprise?.monthlyPriceEur, defaults.subscriptions.plans.enterprise.monthlyPriceEur)),
          maxUsers: Math.max(1, Math.round(toNumberOrFallback(source.subscriptions?.plans?.enterprise?.maxUsers, defaults.subscriptions.plans.enterprise.maxUsers))),
          aiBudgetEur: Math.max(0, toNumberOrFallback(source.subscriptions?.plans?.enterprise?.aiBudgetEur, defaults.subscriptions.plans.enterprise.aiBudgetEur)),
          storageGb: Math.max(0, toNumberOrFallback(source.subscriptions?.plans?.enterprise?.storageGb, defaults.subscriptions.plans.enterprise.storageGb))
        }
      }
    }
  };
}

function setCheckboxValue(id, checked) {
  const node = $(id);
  if (node) node.checked = !!checked;
}

function writePlatformSettingsForm(settings = {}) {
  const normalized = normalizePlatformSettings(settings);
  if ($("settings_defaults_ai_budget")) $("settings_defaults_ai_budget").value = String(normalized.workspaceDefaults.defaultAiBudgetEur);
  if ($("settings_defaults_max_users")) $("settings_defaults_max_users").value = String(normalized.workspaceDefaults.maxUsersPerWorkspace);
  if ($("settings_workspaceDefaults_defaultStorageGb")) $("settings_workspaceDefaults_defaultStorageGb").value = String(normalized.workspaceDefaults.defaultStorageGb);
  if ($("settings_workspaceDefaults_defaultEmailDailyLimit")) $("settings_workspaceDefaults_defaultEmailDailyLimit").value = String(normalized.workspaceDefaults.defaultEmailDailyLimit);
  if ($("settings_workspaceDefaults_defaultSmsDailyLimit")) $("settings_workspaceDefaults_defaultSmsDailyLimit").value = String(normalized.workspaceDefaults.defaultSmsDailyLimit);
  if ($("settings_costGovernance_platformMonthlyBudgetEur")) $("settings_costGovernance_platformMonthlyBudgetEur").value = String(normalized.costGovernance.platformMonthlyBudgetEur);
  if ($("settings_costGovernance_workspaceMonthlyHardLimitEur")) $("settings_costGovernance_workspaceMonthlyHardLimitEur").value = String(normalized.costGovernance.workspaceMonthlyHardLimitEur);
  if ($("settings_costGovernance_workspaceMonthlySoftLimitEur")) $("settings_costGovernance_workspaceMonthlySoftLimitEur").value = String(normalized.costGovernance.workspaceMonthlySoftLimitEur);
  if ($("settings_costGovernance_alertThresholdPercent")) $("settings_costGovernance_alertThresholdPercent").value = String(normalized.costGovernance.alertThresholdPercent);
  setCheckboxValue("settings_costGovernance_blockOnHardLimit", normalized.costGovernance.blockOnHardLimit);
  setCheckboxValue("settings_provider_openai_enabled", normalized.providerLimits.openai.enabled);
  if ($("settings_provider_openai_monthlyLimitEur")) $("settings_provider_openai_monthlyLimitEur").value = String(normalized.providerLimits.openai.monthlyLimitEur);
  setCheckboxValue("settings_provider_twilio_enabled", normalized.providerLimits.twilio.enabled);
  if ($("settings_provider_twilio_dailySmsLimit")) $("settings_provider_twilio_dailySmsLimit").value = String(normalized.providerLimits.twilio.dailySmsLimit);
  if ($("settings_provider_twilio_monthlyLimitEur")) $("settings_provider_twilio_monthlyLimitEur").value = String(normalized.providerLimits.twilio.monthlyLimitEur);
  setCheckboxValue("settings_provider_googleTranslate_enabled", normalized.providerLimits.googleTranslate.enabled);
  if ($("settings_provider_googleTranslate_monthlyCharacterLimit")) $("settings_provider_googleTranslate_monthlyCharacterLimit").value = String(normalized.providerLimits.googleTranslate.monthlyCharacterLimit);
  if ($("settings_provider_googleTranslate_monthlyLimitEur")) $("settings_provider_googleTranslate_monthlyLimitEur").value = String(normalized.providerLimits.googleTranslate.monthlyLimitEur);
  setCheckboxValue("settings_provider_ionosEmail_enabled", normalized.providerLimits.ionosEmail.enabled);
  if ($("settings_provider_ionosEmail_dailyEmailLimit")) $("settings_provider_ionosEmail_dailyEmailLimit").value = String(normalized.providerLimits.ionosEmail.dailyEmailLimit);
  if ($("settings_provider_ionosEmail_monthlyLimitEur")) $("settings_provider_ionosEmail_monthlyLimitEur").value = String(normalized.providerLimits.ionosEmail.monthlyLimitEur);
  setCheckboxValue("settings_provider_storage_enabled", normalized.providerLimits.storage.enabled);
  if ($("settings_provider_storage_maxGbPerWorkspace")) $("settings_provider_storage_maxGbPerWorkspace").value = String(normalized.providerLimits.storage.maxGbPerWorkspace);
  if ($("settings_provider_storage_monthlyLimitEur")) $("settings_provider_storage_monthlyLimitEur").value = String(normalized.providerLimits.storage.monthlyLimitEur);
  setCheckboxValue("settings_provider_jitsi_enabled", normalized.providerLimits.jitsi.enabled);
  if ($("settings_provider_jitsi_monthlyLimitEur")) $("settings_provider_jitsi_monthlyLimitEur").value = String(normalized.providerLimits.jitsi.monthlyLimitEur);
  if ($("settings_ai_provider")) $("settings_ai_provider").value = normalized.ai.provider;
  setCheckboxValue("settings_ai_enabled", normalized.ai.enabled);
  setCheckboxValue("settings_ai_realtime_enabled", normalized.ai.realtimeEnabled);
  if ($("settings_ai_defaultModel")) $("settings_ai_defaultModel").value = normalized.ai.defaultModel;
  if ($("settings_ai_realtimeVoice")) $("settings_ai_realtimeVoice").value = normalized.ai.realtimeVoice;
  if ($("settings_ai_maxTokensPerRequest")) $("settings_ai_maxTokensPerRequest").value = String(normalized.ai.maxTokensPerRequest);
  if ($("settings_ai_maxSessionSeconds")) $("settings_ai_maxSessionSeconds").value = String(normalized.ai.maxSessionSeconds);
  if ($("settings_ai_idleTimeoutSeconds")) $("settings_ai_idleTimeoutSeconds").value = String(normalized.ai.idleTimeoutSeconds);
  setCheckboxValue("settings_ai_allowAiForNewWorkspaces", normalized.ai.allowAiForNewWorkspaces);
  setCheckboxValue("settings_communication_email_enabled", normalized.communication.emailEnabled);
  setCheckboxValue("settings_communication_sms_enabled", normalized.communication.smsEnabled);
  if ($("settings_communication_default_sender_name")) $("settings_communication_default_sender_name").value = normalized.communication.defaultSenderName;
  if ($("settings_communication_default_reply_to")) $("settings_communication_default_reply_to").value = normalized.communication.defaultReplyTo;
  if ($("settings_communication_maxOtpPerUserPerDay")) $("settings_communication_maxOtpPerUserPerDay").value = String(normalized.communication.maxOtpPerUserPerDay);
  if ($("settings_communication_maxEmailsPerWorkspacePerDay")) $("settings_communication_maxEmailsPerWorkspacePerDay").value = String(normalized.communication.maxEmailsPerWorkspacePerDay);
  setCheckboxValue("settings_communication_useOwnerEmailFallback", normalized.communication.useOwnerEmailFallback);
  if ($("settings_storage_default_adapter")) $("settings_storage_default_adapter").value = normalized.storage.defaultAdapter;
  setCheckboxValue("settings_storage_uploadEnabled", normalized.storage.uploadEnabled);
  if ($("settings_storage_max_upload_mb")) $("settings_storage_max_upload_mb").value = String(normalized.storage.maxFileMb);
  if ($("settings_storage_maxVideoMb")) $("settings_storage_maxVideoMb").value = String(normalized.storage.maxVideoMb);
  if ($("settings_storage_retention_days")) $("settings_storage_retention_days").value = String(normalized.storage.retentionDays);
  if ($("settings_storage_allowedTypes")) $("settings_storage_allowedTypes").value = normalized.storage.allowedTypes.join(", ");
  if ($("settings_security_session_timeout_min")) $("settings_security_session_timeout_min").value = String(normalized.security.sessionTimeoutMinutes);
  if ($("settings_security_audit_retention_days")) $("settings_security_audit_retention_days").value = String(normalized.security.auditRetentionDays);
  setCheckboxValue("settings_security_require_admin_2fa", normalized.security.requireAdmin2fa);
  setCheckboxValue("settings_security_requireEmailVerification", normalized.security.requireEmailVerification);
  if ($("settings_security_maxLoginAttempts")) $("settings_security_maxLoginAttempts").value = String(normalized.security.maxLoginAttempts);
  if ($("settings_security_lockoutMinutes")) $("settings_security_lockoutMinutes").value = String(normalized.security.lockoutMinutes);
  setCheckboxValue("settings_security_requireStrongPasswords", normalized.security.requireStrongPasswords);
  setCheckboxValue("settings_security_allowDevBypass", normalized.security.allowDevBypass);
  setCheckboxValue("settings_features_ai", normalized.features.aiEnabled);
  setCheckboxValue("settings_features_sms", normalized.features.smsEnabled);
  setCheckboxValue("settings_features_email", normalized.features.emailEnabled);
  setCheckboxValue("settings_features_liveClasses", normalized.features.liveClassesEnabled);
  setCheckboxValue("settings_features_recording", normalized.features.recordingEnabled);
  setCheckboxValue("settings_features_analytics", normalized.features.analyticsEnabled);
  setCheckboxValue("settings_features_payments", normalized.features.paymentsEnabled);
  setCheckboxValue("settings_features_beta", normalized.features.beta);
  if ($("settings_subscriptions_defaultPlan")) $("settings_subscriptions_defaultPlan").value = normalized.subscriptions.defaultPlan;
  if ($("settings_subscriptions_trialDays")) $("settings_subscriptions_trialDays").value = String(normalized.subscriptions.trialDays);
  setCheckboxValue("settings_subscriptions_autoSuspendOnFailedPayment", normalized.subscriptions.autoSuspendOnFailedPayment);
  ["starter", "professional", "enterprise"].forEach((planKey) => {
    const plan = normalized.subscriptions.plans?.[planKey] || {};
    if ($(`settings_plan_${planKey}_monthlyPriceEur`)) $(`settings_plan_${planKey}_monthlyPriceEur`).value = String(plan.monthlyPriceEur ?? "");
    if ($(`settings_plan_${planKey}_maxUsers`)) $(`settings_plan_${planKey}_maxUsers`).value = String(plan.maxUsers ?? "");
    if ($(`settings_plan_${planKey}_aiBudgetEur`)) $(`settings_plan_${planKey}_aiBudgetEur`).value = String(plan.aiBudgetEur ?? "");
    if ($(`settings_plan_${planKey}_storageGb`)) $(`settings_plan_${planKey}_storageGb`).value = String(plan.storageGb ?? "");
  });
}

function collectPlatformSettingsFromForm() {
  return normalizePlatformSettings({
    workspaceDefaults: {
      defaultAiBudgetEur: $("settings_defaults_ai_budget")?.value,
      maxUsersPerWorkspace: $("settings_defaults_max_users")?.value,
      defaultStorageGb: $("settings_workspaceDefaults_defaultStorageGb")?.value,
      defaultEmailDailyLimit: $("settings_workspaceDefaults_defaultEmailDailyLimit")?.value,
      defaultSmsDailyLimit: $("settings_workspaceDefaults_defaultSmsDailyLimit")?.value
    },
    costGovernance: {
      platformMonthlyBudgetEur: $("settings_costGovernance_platformMonthlyBudgetEur")?.value,
      workspaceMonthlyHardLimitEur: $("settings_costGovernance_workspaceMonthlyHardLimitEur")?.value,
      workspaceMonthlySoftLimitEur: $("settings_costGovernance_workspaceMonthlySoftLimitEur")?.value,
      alertThresholdPercent: $("settings_costGovernance_alertThresholdPercent")?.value,
      blockOnHardLimit: !!$("settings_costGovernance_blockOnHardLimit")?.checked
    },
    providerLimits: {
      openai: {
        enabled: !!$("settings_provider_openai_enabled")?.checked,
        monthlyLimitEur: $("settings_provider_openai_monthlyLimitEur")?.value
      },
      twilio: {
        enabled: !!$("settings_provider_twilio_enabled")?.checked,
        dailySmsLimit: $("settings_provider_twilio_dailySmsLimit")?.value,
        monthlyLimitEur: $("settings_provider_twilio_monthlyLimitEur")?.value
      },
      googleTranslate: {
        enabled: !!$("settings_provider_googleTranslate_enabled")?.checked,
        monthlyCharacterLimit: $("settings_provider_googleTranslate_monthlyCharacterLimit")?.value,
        monthlyLimitEur: $("settings_provider_googleTranslate_monthlyLimitEur")?.value
      },
      ionosEmail: {
        enabled: !!$("settings_provider_ionosEmail_enabled")?.checked,
        dailyEmailLimit: $("settings_provider_ionosEmail_dailyEmailLimit")?.value,
        monthlyLimitEur: $("settings_provider_ionosEmail_monthlyLimitEur")?.value
      },
      storage: {
        enabled: !!$("settings_provider_storage_enabled")?.checked,
        maxGbPerWorkspace: $("settings_provider_storage_maxGbPerWorkspace")?.value,
        monthlyLimitEur: $("settings_provider_storage_monthlyLimitEur")?.value
      },
      jitsi: {
        enabled: !!$("settings_provider_jitsi_enabled")?.checked,
        monthlyLimitEur: $("settings_provider_jitsi_monthlyLimitEur")?.value
      }
    },
    ai: {
      provider: $("settings_ai_provider")?.value,
      enabled: !!$("settings_ai_enabled")?.checked,
      realtimeEnabled: !!$("settings_ai_realtime_enabled")?.checked,
      defaultModel: $("settings_ai_defaultModel")?.value,
      realtimeVoice: $("settings_ai_realtimeVoice")?.value,
      maxTokensPerRequest: $("settings_ai_maxTokensPerRequest")?.value,
      maxSessionSeconds: $("settings_ai_maxSessionSeconds")?.value,
      idleTimeoutSeconds: $("settings_ai_idleTimeoutSeconds")?.value,
      allowAiForNewWorkspaces: !!$("settings_ai_allowAiForNewWorkspaces")?.checked
    },
    communication: {
      emailEnabled: !!$("settings_communication_email_enabled")?.checked,
      smsEnabled: !!$("settings_communication_sms_enabled")?.checked,
      defaultSenderName: $("settings_communication_default_sender_name")?.value || "",
      defaultReplyTo: $("settings_communication_default_reply_to")?.value || "",
      maxOtpPerUserPerDay: $("settings_communication_maxOtpPerUserPerDay")?.value,
      maxEmailsPerWorkspacePerDay: $("settings_communication_maxEmailsPerWorkspacePerDay")?.value,
      useOwnerEmailFallback: !!$("settings_communication_useOwnerEmailFallback")?.checked
    },
    storage: {
      defaultAdapter: $("settings_storage_default_adapter")?.value,
      uploadEnabled: !!$("settings_storage_uploadEnabled")?.checked,
      maxFileMb: $("settings_storage_max_upload_mb")?.value,
      maxVideoMb: $("settings_storage_maxVideoMb")?.value,
      retentionDays: $("settings_storage_retention_days")?.value,
      allowedTypes: String($("settings_storage_allowedTypes")?.value || "").split(",").map((item) => item.trim()).filter(Boolean)
    },
    security: {
      sessionTimeoutMinutes: $("settings_security_session_timeout_min")?.value,
      auditRetentionDays: $("settings_security_audit_retention_days")?.value,
      requireAdmin2fa: !!$("settings_security_require_admin_2fa")?.checked,
      requireEmailVerification: !!$("settings_security_requireEmailVerification")?.checked,
      maxLoginAttempts: $("settings_security_maxLoginAttempts")?.value,
      lockoutMinutes: $("settings_security_lockoutMinutes")?.value,
      requireStrongPasswords: !!$("settings_security_requireStrongPasswords")?.checked,
      allowDevBypass: !!$("settings_security_allowDevBypass")?.checked
    },
    features: {
      aiEnabled: !!$("settings_features_ai")?.checked,
      smsEnabled: !!$("settings_features_sms")?.checked,
      emailEnabled: !!$("settings_features_email")?.checked,
      liveClassesEnabled: !!$("settings_features_liveClasses")?.checked,
      recordingEnabled: !!$("settings_features_recording")?.checked,
      analyticsEnabled: !!$("settings_features_analytics")?.checked,
      paymentsEnabled: !!$("settings_features_payments")?.checked,
      beta: !!$("settings_features_beta")?.checked
    },
    subscriptions: {
      defaultPlan: $("settings_subscriptions_defaultPlan")?.value,
      trialDays: $("settings_subscriptions_trialDays")?.value,
      autoSuspendOnFailedPayment: !!$("settings_subscriptions_autoSuspendOnFailedPayment")?.checked,
      plans: {
        starter: {
          monthlyPriceEur: $("settings_plan_starter_monthlyPriceEur")?.value,
          maxUsers: $("settings_plan_starter_maxUsers")?.value,
          aiBudgetEur: $("settings_plan_starter_aiBudgetEur")?.value,
          storageGb: $("settings_plan_starter_storageGb")?.value
        },
        professional: {
          monthlyPriceEur: $("settings_plan_professional_monthlyPriceEur")?.value,
          maxUsers: $("settings_plan_professional_maxUsers")?.value,
          aiBudgetEur: $("settings_plan_professional_aiBudgetEur")?.value,
          storageGb: $("settings_plan_professional_storageGb")?.value
        },
        enterprise: {
          monthlyPriceEur: $("settings_plan_enterprise_monthlyPriceEur")?.value,
          maxUsers: $("settings_plan_enterprise_maxUsers")?.value,
          aiBudgetEur: $("settings_plan_enterprise_aiBudgetEur")?.value,
          storageGb: $("settings_plan_enterprise_storageGb")?.value
        }
      }
    }
  });
}

function pickPlatformControlSection(settings, section) {
  const normalized = normalizePlatformSettings(settings);
  switch (section) {
    case "workspaceDefaults":
      return { workspaceDefaults: normalized.workspaceDefaults };
    case "features":
      return { features: normalized.features };
    case "costGovernance":
      return { costGovernance: normalized.costGovernance };
    case "providerLimits":
      return { providerLimits: normalized.providerLimits };
    case "ai":
      return { ai: normalized.ai };
    case "communication":
      return { communication: normalized.communication };
    case "storage":
      return { storage: normalized.storage };
    case "security":
      return { security: normalized.security };
    case "subscriptions":
      return { subscriptions: normalized.subscriptions };
    default:
      return normalized;
  }
}

function setPlatformControlFeedback(message = "", tone = "") {
  state.platformControl.feedback = { message, tone };
  const status = $("settingsSaveStatus");
  if (status) status.textContent = message || "Platform settings loaded.";
}

function renderPlatformControlOverview(settings = {}) {
  const normalized = normalizePlatformSettings(settings);
  setText("platformControlOverviewBudget", formatEUR(normalized.costGovernance.platformMonthlyBudgetEur));
  setText("platformControlOverviewUsers", normalized.workspaceDefaults.maxUsersPerWorkspace);
  setText("platformControlOverviewStorage", `${normalized.workspaceDefaults.defaultStorageGb} GB`);
  setText("platformControlOverviewPlan", normalized.subscriptions.defaultPlan || "starter");
  setText("platformControlLastSaved", state.platformControl.updatedAt || "—");
}

function renderPlatformControlTabs() {
  const active = state.platformControl.activeTab || "overview";
  document.querySelectorAll("[data-platform-control-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.platformControlTab === active);
  });
  document.querySelectorAll("[data-platform-control-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.platformControlPanel !== active;
  });
}

async function refreshPlatformControlWorkspacePreview() {
  const workspaceId = state.platformControl.selectedWorkspaceId || "";
  const overrideStatus = $("platformControlOverrideStatus");
  const preview = $("platformControlEffectivePreview");
  if (overrideStatus) overrideStatus.textContent = "";
  if (preview) preview.textContent = "{\n  \"settings\": {}\n}";

  if (!workspaceId) {
    state.platformControl.workspaceOverride = null;
    state.platformControl.effectiveSettings = null;
    if (overrideStatus) overrideStatus.textContent = "Select a workspace to view or save overrides.";
    return;
  }

  const [overridePayload, effectivePayload] = await Promise.all([
    api(`/api/admin/platform-control/workspaces/${encodeURIComponent(workspaceId)}`).catch(() => ({ settings: {} })),
    api(`/api/admin/platform-control/effective/${encodeURIComponent(workspaceId)}`)
  ]);
  state.platformControl.workspaceOverride = overridePayload?.settings || {};
  state.platformControl.effectiveSettings = effectivePayload?.settings || {};
  if (preview) {
    preview.textContent = JSON.stringify(state.platformControl.effectiveSettings, null, 2);
  }
  if (overrideStatus) {
    overrideStatus.textContent = "Effective settings preview loaded.";
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
  const snapshot = normalizePlatformSettings(settings);
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
  const status = $("settingsSaveStatus");
  const error = $("settingsError");
  const workspaceName = $("settingsWorkspaceName");
  const overrideSelect = $("platformControlWorkspaceSelect");

  if (status) status.textContent = "";
  if (error) {
    error.textContent = "";
    error.hidden = true;
  }
  if (workspaceName) workspaceName.textContent = "Platform Global";
  updateWorkspaceWarning();

  const data = await api(`/api/admin/platform-control/global`);
  const settings = normalizePlatformSettings(data.settings || {});
  state.platformControl.globalSettings = settings;
  state.platformControl.updatedAt = data.row?.updated_at || "";

  writePlatformSettingsForm(settings);
  writeSettingsJson(settings);
  renderPlatformControlOverview(settings);

  if (overrideSelect) {
    const current = state.platformControl.selectedWorkspaceId || "";
    overrideSelect.innerHTML = `<option value="">Select workspace</option>` + (state.workspaces || [])
      .filter((workspace) => String(workspace.id || '').trim() && String(workspace.id) !== 'default')
      .map((workspace) => `<option value="${escapeHtml(workspace.id)}">${escapeHtml(workspace.name || workspace.id)}</option>`)
      .join('');
    overrideSelect.value = current;
  }

  await refreshPlatformControlWorkspacePreview().catch(() => {});
  renderPlatformControlTabs();
  if (status) status.textContent = "Platform settings loaded.";
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

function ensureLegalVersionCards() {
  const container = $("legalVersionCards");
  if (!container) return;
  const labels = {
    ai_notice: "AI Notice",
    recording_notice: "Recording Notice",
    subprocessor_list: "Subprocessor List"
  };
  for (const documentType of LEGAL_DOCUMENT_TYPES) {
    if (getLegalVersionCard(documentType)) continue;
    const article = document.createElement("article");
    article.className = "legal-preview-card";
    article.dataset.documentType = documentType;
    article.innerHTML = `
      <div class="legal-version-header">
        <strong>${escapeHtml(labels[documentType] || documentType)}</strong>
        <span class="legal-status-badge" data-role="status">Draft</span>
      </div>
      <div class="legal-form-grid">
        <input class="input" data-field="locale" value="en" placeholder="Locale" />
        <input class="input" data-field="version" placeholder="Version" />
        <input class="input legal-span-2" data-field="title" placeholder="Title" />
        <textarea class="input legal-textarea legal-span-2" data-field="body" placeholder="Configurable placeholder. Review with legal counsel before production use."></textarea>
      </div>
      <div class="legal-doc-actions">
        <button class="btn btn-ghost" type="button" data-action="save-version">Save document</button>
        <button class="btn btn-primary" type="button" data-action="publish-version">Publish document</button>
      </div>
    `;
    container.appendChild(article);
  }
}

function renderLegalVersionCards(versions = []) {
  ensureLegalVersionCards();
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
  const requiredDocs = ["privacy", "terms", "impressum", "dpa", "cookies"].filter(
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
      : "Before real launch, publish privacy, terms, impressum, dpa, and cookies.";
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

function renderLegalReadinessTables() {
  renderTable($("legalSubprocessorsTable"), {
    rows: state.legal.subprocessors || [],
    emptyText: "No subprocessors configured.",
    columns: [
      { label: "Provider", key: "provider_name", render: (row) => escapeHtml(row.provider_name || "") },
      { label: "Service", key: "service_type", render: (row) => escapeHtml(row.service_type || "—") },
      { label: "Location", key: "data_location", render: (row) => escapeHtml(row.data_location || "—") },
      { label: "DPA", key: "dpa_available", width: "80px", render: (row) => Number(row.dpa_available || 0) ? "Yes" : "No" },
      { label: "Active", key: "active", width: "80px", render: (row) => Number(row.active || 0) ? "Yes" : "No" }
    ]
  });
  renderTable($("dataCoverageTable"), {
    rows: state.legal.retention?.coverage || [],
    emptyText: "No data coverage map loaded.",
    columns: [
      { label: "Domain", key: "label", render: (row) => escapeHtml(row.label || row.key || "") },
      { label: "Tables", key: "tables", render: (row) => escapeHtml((row.tables || []).join(", ")) },
      { label: "Covered", key: "covered", width: "90px", render: (row) => row.covered ? "Yes" : "No" }
    ]
  });
  const retention = state.legal.retention?.retention || {};
  Object.entries(retention).forEach(([key, value]) => {
    const input = $(`retention_${key}`);
    if (input) input.value = value ?? "";
  });
}

async function refreshLegalPanel() {
  showLegalStatus("");
  const [settingsPayload, versionsPayload, subprocessorsPayload, retentionPayload] = await Promise.all([
    api("/api/admin/legal-settings"),
    api("/api/admin/legal-versions"),
    api("/api/admin/legal/subprocessors").catch(() => ({ rows: [] })),
    api("/api/admin/data-governance/retention").catch(() => ({ retention: {}, coverage: [] }))
  ]);
  state.legal.settings = normalizeLegalAdminSettings(settingsPayload.settings || {});
  state.legal.versions = Array.isArray(versionsPayload.versions) ? versionsPayload.versions : [];
  state.legal.subprocessors = Array.isArray(subprocessorsPayload.rows) ? subprocessorsPayload.rows : [];
  state.legal.retention = retentionPayload || { retention: {}, coverage: [] };
  state.legal.publishRequirements = Array.isArray(settingsPayload.publishRequirements) ? settingsPayload.publishRequirements : [];
  populateLegalPanel(state.legal.settings);
  renderLegalVersionCards(state.legal.versions);
  renderLegalReadinessTables();
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
  if (!confirmTypedAction({ message: "Publish platform legal settings?", expected: "PUBLISH" })) return;
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
  if (!confirmTypedAction({ message: `Publish ${payload.document_type} legal document?`, expected: "PUBLISH" })) return;
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

SETTINGS_FIELD_IDS.forEach((id) => {
  const node = $(id);
  if (!node) return;
  const eventName = node.type === "checkbox" || node.tagName === "SELECT" ? "change" : "input";
  node.addEventListener(eventName, () => {
    const error = $("settingsError");
    if (error) {
      error.textContent = "";
      error.hidden = true;
    }
    writeSettingsJson(collectPlatformSettingsFromForm());
  });
});

$("settingsJson")?.addEventListener("change", () => {
  try {
    const parsed = normalizePlatformSettings(JSON.parse($("settingsJson").value || "{}"));
    settingsEditorSnapshot = cloneSettingsObject(parsed);
    writePlatformSettingsForm(parsed);
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
    const parsed = normalizePlatformSettings(JSON.parse(raw));
    writeSettingsJson(parsed);
  } catch {
    const error = $("settingsError");
    if (error) {
      error.textContent = "Invalid JSON";
      error.hidden = false;
    }
  }
});

// Validate JSON
$("btnValidateJson")?.addEventListener("click", () => {
  try {
    const parsed = normalizePlatformSettings(JSON.parse($("settingsJson").value));
    settingsEditorSnapshot = cloneSettingsObject(parsed);
    writePlatformSettingsForm(parsed);
    const error = $("settingsError");
    if (error) {
      error.textContent = "";
      error.hidden = true;
    }
    const status = $("settingsSaveStatus");
    if (status) status.textContent = "Advanced JSON is valid.";
  } catch (e) {
    const error = $("settingsError");
    if (error) {
      error.textContent = e.message;
      error.hidden = false;
    }
  }
});

async function persistPlatformSettings(settings, successMessage = "Platform settings saved.") {
  const status = $("settingsSaveStatus");
  const error = $("settingsError");
  if (status) status.textContent = "";
  if (error) {
    error.textContent = "";
    error.hidden = true;
  }

  if (status) status.textContent = "Saving...";

  try {
    const normalized = normalizePlatformSettings(settings);
    const response = await api(`/api/admin/platform-control/global`, {
      method: "PATCH",
      body: { settings: normalized }
    });

    settingsEditorSnapshot = cloneSettingsObject(normalized);
    state.platformControl.globalSettings = normalizePlatformSettings(response?.row?.settings || normalized);
    state.platformControl.updatedAt = response?.row?.updated_at || state.platformControl.updatedAt;
    writePlatformSettingsForm(state.platformControl.globalSettings);
    writeSettingsJson(state.platformControl.globalSettings);
    renderPlatformControlOverview(state.platformControl.globalSettings);
    if (status) status.textContent = successMessage;
  } catch (e) {
    if (error) {
      error.textContent = e.message;
      error.hidden = false;
    }
    if (status) status.textContent = "Save failed";
  }
}

document.querySelectorAll("[data-settings-save]").forEach((button) => {
  button.addEventListener("click", async () => {
    const fullSettings = collectPlatformSettingsFromForm();
    const partial = pickPlatformControlSection(fullSettings, button.dataset.settingsSave || "");
    await persistPlatformSettings(partial, `${button.dataset.settingsSave} settings saved.`);
  });
});

$("btnSaveSettings")?.addEventListener("click", async () => {
  try {
    const parsed = normalizePlatformSettings(JSON.parse($("settingsJson").value || "{}"));
    await persistPlatformSettings(parsed, "Advanced JSON saved.");
  } catch (e) {
    const error = $("settingsError");
    if (error) {
      error.textContent = e.message;
      error.hidden = false;
    }
  }
});

$("btnPlatformControlSaveAll")?.addEventListener("click", async () => {
  const fullSettings = collectPlatformSettingsFromForm();
  await persistPlatformSettings(fullSettings, "Platform settings saved.");
});

document.querySelectorAll("[data-platform-control-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    state.platformControl.activeTab = button.dataset.platformControlTab || "overview";
    renderPlatformControlTabs();
  });
});

$("platformControlWorkspaceSelect")?.addEventListener("change", async (event) => {
  state.platformControl.selectedWorkspaceId = String(event.target.value || "").trim();
  await refreshPlatformControlWorkspacePreview().catch((error) => {
    const status = $("platformControlOverrideStatus");
    if (status) status.textContent = error.message || "Failed to load workspace preview.";
  });
});

$("btnPlatformControlSaveWorkspaceOverride")?.addEventListener("click", async () => {
  const workspaceId = state.platformControl.selectedWorkspaceId || "";
  if (!workspaceId) {
    const status = $("platformControlOverrideStatus");
    if (status) status.textContent = "Select a workspace first.";
    return;
  }
  const fullSettings = collectPlatformSettingsFromForm();
  const globalSettings = normalizePlatformSettings(state.platformControl.globalSettings || {});
  const overridePatch = buildSettingsDiff(globalSettings, fullSettings) || {};
  try {
    const response = await api(`/api/admin/platform-control/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: "PATCH",
      body: { settings: overridePatch }
    });
    state.platformControl.workspaceOverride = response?.row?.settings || overridePatch;
    const status = $("platformControlOverrideStatus");
    if (status) status.textContent = Object.keys(overridePatch).length ? "Workspace override saved." : "Workspace override matches global settings.";
    await refreshPlatformControlWorkspacePreview();
  } catch (error) {
    const status = $("platformControlOverrideStatus");
    if (status) status.textContent = error.message || "Failed to save workspace override.";
  }
});

$("btnPlatformControlResetWorkspaceOverride")?.addEventListener("click", async () => {
  const workspaceId = state.platformControl.selectedWorkspaceId || "";
  if (!workspaceId) {
    const status = $("platformControlOverrideStatus");
    if (status) status.textContent = "Select a workspace first.";
    return;
  }
  try {
    if (!confirmTypedAction({ message: `Reset platform override for workspace ${workspaceId}?`, expected: "RESET" })) return;
    await api(`/api/admin/platform-control/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: "DELETE"
    });
    const status = $("platformControlOverrideStatus");
    if (status) status.textContent = "Workspace override reset.";
    await refreshPlatformControlWorkspacePreview();
  } catch (error) {
    const status = $("platformControlOverrideStatus");
    if (status) status.textContent = error.message || "Failed to reset workspace override.";
  }
});

$("btnPlatformControlResetGlobal")?.addEventListener("click", async () => {
  try {
    if (!confirmTypedAction({ message: "Reset global platform settings to defaults?", expected: "RESET" })) return;
    const response = await api(`/api/admin/platform-control/global/reset`, {
      method: "POST"
    });
    const normalized = normalizePlatformSettings(response?.row?.settings || {});
    state.platformControl.globalSettings = normalized;
    state.platformControl.updatedAt = response?.row?.updated_at || "";
    writePlatformSettingsForm(normalized);
    writeSettingsJson(normalized);
    renderPlatformControlOverview(normalized);
    setPlatformControlFeedback("Global settings reset to defaults.");
  } catch (error) {
    const err = $("settingsError");
    if (err) {
      err.textContent = error.message || "Failed to reset global settings.";
      err.hidden = false;
    }
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

$("btnLegalPreviewDpa")?.addEventListener("click", () => {
  window.open("/dpa", "_blank", "noopener");
});

$("btnLegalPreviewTrust")?.addEventListener("click", () => {
  window.open("/trust", "_blank", "noopener");
});

$("btnSubprocessorSave")?.addEventListener("click", async () => {
  try {
    await api("/api/admin/legal/subprocessors", {
      method: "POST",
      body: {
        provider_name: $("subprocessorProviderName")?.value || "",
        service_type: $("subprocessorServiceType")?.value || "",
        data_location: $("subprocessorDataLocation")?.value || "",
        purpose: $("subprocessorPurpose")?.value || "",
        legal_basis: $("subprocessorLegalBasis")?.value || "",
        dpa_available: !!$("subprocessorDpaAvailable")?.checked,
        privacy_url: $("subprocessorPrivacyUrl")?.value || "",
        active: true
      }
    });
    ["subprocessorProviderName", "subprocessorServiceType", "subprocessorDataLocation", "subprocessorPurpose", "subprocessorLegalBasis", "subprocessorPrivacyUrl"].forEach((id) => {
      const el = $(id);
      if (el) el.value = "";
    });
    if ($("subprocessorDpaAvailable")) $("subprocessorDpaAvailable").checked = false;
    await refreshLegalPanel();
    showLegalStatus("Subprocessor saved.", "success");
  } catch (err) {
    showLegalStatus(err.message || "Could not save subprocessor.", "error");
  }
});

$("btnRetentionSave")?.addEventListener("click", async () => {
  try {
    const body = {};
    [
      "audit_log_retention_days",
      "security_log_retention_days",
      "backup_retention_days",
      "file_retention_days",
      "deleted_user_retention_days",
      "learning_data_retention_months",
      "message_retention_days",
      "recording_retention_days",
      "email_log_retention_days"
    ].forEach((key) => {
      body[key] = Number($(`retention_${key}`)?.value || 0);
    });
    state.legal.retention = await api("/api/admin/data-governance/retention", {
      method: "POST",
      body
    });
    renderLegalReadinessTables();
    showLegalStatus("Retention settings saved.", "success");
  } catch (err) {
    showLegalStatus(err.message || "Could not save retention settings.", "error");
  }
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
