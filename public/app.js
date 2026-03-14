"use strict";

// ===================== "REAL" DATA (from backend) =====================
let channels = [];
const homeworkNoteChannels = new Map();
let dms = [];
let messagesByChannel = {}; // { [channelId]: Message[] }
let savedMessagesById = {};
let workspaces = [];
let currentWorkspaceId = "default";
let employees = [];
let adminWorkspaces = [];
let adminUsers = [];
let adminUsersAll = [];
let adminCurrentWorkspace = "default";
let adminLoggedIn = false;
let adminLoggedInSuper = false;
let adminDockActive = false;
let sessionUser = null;
let adminChannelWorkspaceId = "default";
let adminChannelUsers = [];
let adminChannelSelectedMembers = new Set();
let adminChannelWorkspaceId2 = "default";
let adminChannelUsers2 = [];
let adminChannelSelectedMembers2 = new Set();
let adminUserChannelOptions = [];
let adminUserSelectedChannelIds = new Set();
let adminChannels = [];
let adminChannelsByWorkspace = {};
let adminChannelsAll = [];
let adminSchoolRequests = [];
let directoryViewRole = null;
let adminAssignSelectedUserId = null;
let adminAssignSelectedWorkspaceId = null;
let adminAssignSelectedChannelId = null;
let eventSource = null;
let pendingUploads = []; // files uploaded but not yet sent in a message
let threadPendingUploads = []; // files uploaded for thread replies
let deepLinkTarget = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordingKind = null; // "audio" | "video"
let recStartTs = 0;
let recPausedMs = 0;
let recTimerInt = null;
let isRecPaused = false;
let recordingShouldUpload = true;
let recordingTarget = "main";
let recStream = null;
let messageMenuCloseHandlerBound = false;
let filesCache = [];
let filesScopeChannelId = null; // channelId or "dm:<id>"
let filesTypeFilter = "all"; // all | file | audio | video | image
let filesCategoryFilter = "all"; // all | homework | materials | media | exams
let filesQuery = "";
let filesScopeMode = "all"; // "current" | "all"
let filesSortMode = "newest"; // newest | oldest | name | size
let filesRangeMode = "all"; // all | today | 7d | 30d
let isHomeView = false;
let policyAccepted = true;
let policyRequired = false;
let policyCheckInFlight = false;
let policyRedirecting = false;
// default channel id still used by UI
let currentChannelId = "general";
let currentThreadMessage = null;
let currentThreadChannelId = null;
let typingTimeout = null;
let lastReadIndexByChannel = {};
const unreadState = new Map(); // channelId -> { count, lastMsgId, lastText, lastTime, mentionCount, lastTs }
let showSavedOnly = false;
let pendingClearCultureChannelId = null;
let isSendingThread = false;
let searchDebounce = null;
let searchPreloadInFlight = null;
let lastSearchRequest = 0;
let userDirectoryCache = [];
let userDirectoryLoaded = false;
let currentProfileTargetName = "";
let currentProfileTargetId = null;
let currentDmId = null;
let channelMembersCache = new Map();
let dmMemberSelection = new Set();
let dmCreateSelection = new Set();
let dmMemberModalMode = "add"; // "add" or "edit"
let channelAssignSelection = new Set();
let scrollState = {};
let scrollAnchors = {};
let starredChannels = [];
let dragPayload = null;
let mutedChannels = new Set();
let dmLastVisited = {};
let channelSearchTerm = "";
let isRestoringView = false;
let didRestoreView = false;
let chatScrollRaf = 0;
let voiceRecordStatusTimer = null;
const channelSearchTerms = {};
const nicknamesByChannel = {}; // channelId -> { authorKey: nickname }
const dmMembersCache = {};
const POLICY_VERSION = "v1";
const API_BASE = ""; // same origin
const workspaceProfileCache = new Map();
const OPENING_HOURS_DAYS = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" }
];
const OPENING_HOURS_STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "half-open", label: "Half open" },
  { value: "closed", label: "Closed" }
];
const OPENING_HOURS_STATUS_LABELS = {
  open: "Open",
  "half-open": "Half open",
  closed: "Closed"
};
// shared storage keys / state
const DENSITY_STORAGE_KEY = "worknest_density";
const SAVED_MESSAGES_STORAGE_KEY = "worknest_saved_messages";
const SUPER_ADMIN_WORKSPACE_PREF_KEY = "currentWorkspaceId";
const CURRENT_WORKSPACE_STORAGE_KEY = "currentWorkspaceId";
function getCurrentWorkspaceId() {
  return currentWorkspaceId || "default";
}
const CURRENT_CHANNEL_STORAGE_KEY = "worknest_current_channel";
const LAST_VIEW_STORAGE_KEY = "worknest_last_view";
const LAST_ACTIVE_VIEW_KEY = "worknest_last_active_view";
const SCROLL_STATE_STORAGE_KEY = "worknest_scroll_state";
const SIDEBAR_SCROLL_KEY = "worknest_sidebar_scroll_v1";
const SCROLL_ANCHOR_STORAGE_KEY = "worknest_scroll_anchor_v1";
const LAST_RAIL_VIEW_KEY = "worknest_last_rail";
const MUTE_KEY = "worknest_muted_channels_v1";
const STAR_KEY = "worknest_starred_channels_v1";
const DM_LAST_VISIT_KEY = "worknest_dm_last_visit_v1";
const REGISTRATION_MODAL_STATE_KEY = "worknest_registration_modal_state";
let ACCESS_TOKEN = null;

// ---- TASKS UI ----
const TASKS_CHANNEL_IDS = new Set(["teachers-task", "school-task"]);
let tasksDock = null;
let tasksBtn = null;
let tasksOpen = false;
let tasksCacheByChannel = {}; // channelId -> tasks[]
let tasksCommentsCache = {}; // taskId -> comments[]

let emojiTargetTaskId = null;
let emojiTargetTaskCommentId = null;

function setAccessToken(token) {
  ACCESS_TOKEN = token || null;
}
// ----------------------------
// Login overlay helpers (FIX)
// ----------------------------
function hideLoginOverlay() {
  const el = document.getElementById("loginOverlay");
  if (!el) return;
  el.classList.add("hidden");
  el.style.display = "none";
  document.body.classList.remove("login-open");
}

function showLoginOverlay() {
  const el = document.getElementById("loginOverlay");
  if (!el) return;
  el.classList.remove("hidden");
  el.style.display = "flex";
  document.body.classList.add("login-open");
}

// -----------------------------
// After login / refresh bootstrap
// -----------------------------
async function bootstrapAfterAuth(user, options = {}) {
  const actualUser = user || window.currentUser;
  if (!actualUser) return;

  window.currentUser = actualUser;
  persistSessionUser(actualUser);

  const authWorkspaceId = String(
    actualUser?.workspaceId ||
    actualUser?.workspace_id ||
    window.selectedWorkspaceId ||
    currentWorkspaceId ||
    "default"
  ).trim();
  if (authWorkspaceId) {
    window.selectedWorkspaceId = authWorkspaceId;
    currentWorkspaceId = authWorkspaceId;
    const wsSelect = document.getElementById("workspaceSelect");
    if (wsSelect) wsSelect.value = authWorkspaceId;
  }

  const loginOverlay = document.getElementById("loginOverlay");
  if (loginOverlay) {
    loginOverlay.classList.add("hidden");
    loginOverlay.style.display = "none";
  }

  await loadWorkspaces?.();
  await loadUsers?.(authWorkspaceId);
  await loadChannels?.();
  await refreshAll?.();

  if (options.showToastOnLogin) {
    showToast("Logged in");
  }
}

async function loadWorkspaces() {
  if (typeof loadWorkspacesFromServer === "function") {
    return loadWorkspacesFromServer();
  }
}

async function loadUsers(_workspaceId) {
  return;
}

async function loadChannels() {
  if (typeof loadChannelsForWorkspace === "function") {
    return loadChannelsForWorkspace(currentWorkspaceId);
  }
}

async function refreshAll() {
  return;
}
const teachersSection = document.getElementById("teachersSection");
const teachersChannelsContainer = document.getElementById("teachersChannelsContainer");
const known = new Set(["classes","clubs","exams","tools","homework","teachers"]);
const ADMIN_ROLE_VALUES = new Set(["school_admin", "super_admin"]);
// drafts
const DRAFT_KEY_PREFIX = "worknest_draft_";

function normalizeRole(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (
    raw === "admin" ||
    raw === "schooladmin" ||
    raw === "workspace_admin" ||
    raw === "workspaceadmin" ||
    raw === "owner"
  ) {
    return "school_admin";
  }
  if (raw === "superadmin" || raw === "super-admin") {
    return "super_admin";
  }
  if (raw === "instructor") {
    return "teacher";
  }
  return raw;
}



function loadStarred(){try{starredChannels=JSON.parse(localStorage.getItem(STAR_KEY)||"[]")||[]}catch(a){starredChannels=[]}}

function saveStarred(){try{localStorage.setItem(STAR_KEY,JSON.stringify(starredChannels))}catch(t){}}

function isStarred(n){return starredChannels.includes(String(n))}

function starChannel(channelId) {
  const id = String(channelId);
  if (!starredChannels.includes(id)) starredChannels.unshift(id);
  saveStarred();
}
function unstarChannel(channelId) {
  starredChannels = starredChannels.filter((x) => x !== String(channelId));
  saveStarred();
}

function loadDmLastVisited() {
  try {
    dmLastVisited = JSON.parse(localStorage.getItem(DM_LAST_VISIT_KEY) || "{}") || {};
  } catch (_e) {
    dmLastVisited = {};
  }
}
function saveDmLastVisited() {
  try {
    localStorage.setItem(DM_LAST_VISIT_KEY, JSON.stringify(dmLastVisited));
  } catch (_e) {
    /* ignore */
  }
}
function markDmVisited(dmId) {
  if (!dmId) return;
  dmLastVisited[String(dmId)] = Date.now();
  saveDmLastVisited();
}
function getDmLastVisited(dmId) {
  return Number(dmLastVisited[String(dmId)] || 0);
}

function loadMuted() {
  try {
    const arr = JSON.parse(localStorage.getItem(MUTE_KEY) || "[]") || [];
    mutedChannels = new Set(arr.map(String));
  } catch (_e) {
    mutedChannels = new Set();
  }
}
function saveMuted() {
  try {
    localStorage.setItem(MUTE_KEY, JSON.stringify(Array.from(mutedChannels)));
  } catch (_e) {
    /* ignore */
  }
}
function isChannelMuted(channelId) {
  return mutedChannels.has(String(channelId));
}
function toggleMute(channelId) {
  const id = String(channelId);
  if (mutedChannels.has(id)) mutedChannels.delete(id);
  else mutedChannels.add(id);
  saveMuted();
}

loadStarred();
loadMuted();
loadDmLastVisited();

const CULTURE_EXCHANGE_LANGUAGES=[{code:"en",label:"English"},{code:"bn",label:"Bangla"},{code:"es",label:"Spanish"},{code:"fr",label:"French"},{code:"de",label:"Deutsch (German)"},{code:"ar",label:"Arabic"},{code:"ja",label:"Japanese"},{code:"ko",label:"Korean"}];
const CULTURE_EXCHANGE_LANG_KEY = "worknest_culture_exchange_language";
const CULTURE_READ_LANG_KEY = "culture_read_lang";
const cultureTranslationState = new Map();
const cultureTranslationTimers = new Map();
const cultureTranslationCache = new Map();
const cultureTranslationInflight = new Map();
const cultureTranslationPending = new Set();
const cultureViewOriginal = new Set();
const TRANSLATION_CONCURRENCY_LIMIT = 6;
const translationRequestQueue = [];
let activeTranslationRequests = 0;
const LOCAL_TRANSLATION_PREFIX = "culture_trans:";
let cultureExchangeLanguage = null;
let cultureReadLanguage = null;

function translationStorageKey(channelId, messageId, targetLang) {
  return `${LOCAL_TRANSLATION_PREFIX}${channelId}:${messageId}|${targetLang}`;
}

function readLocalTranslation(channelId, messageId, targetLang) {
  try {
    const json = localStorage.getItem(
      translationStorageKey(channelId, messageId, targetLang)
    );
    if (!json) return null;
    const parsed = JSON.parse(json);
    if (typeof parsed?.text === "string") return parsed.text;
  } catch (_err) {
    /* ignore */
  }
  return null;
}

function writeLocalTranslation(channelId, messageId, targetLang, text) {
  try {
    const payload = { text, storedAt: Date.now() };
    localStorage.setItem(
      translationStorageKey(channelId, messageId, targetLang),
      JSON.stringify(payload)
    );
  } catch (_err) {
    /* ignore */
  }
}

function enqueueTranslationRunner(runner) {
  translationRequestQueue.push(runner);
  drainTranslationQueue();
}

function drainTranslationQueue() {
  while (activeTranslationRequests < TRANSLATION_CONCURRENCY_LIMIT) {
    const nextRunner = translationRequestQueue.shift();
    if (!nextRunner) return;

    activeTranslationRequests++;
    nextRunner()
      .catch((err) => {
        console.error("Translation queue error", err);
      })
      .finally(() => {
        activeTranslationRequests--;
        setTimeout(drainTranslationQueue, 0);
      });
  }
}

function isDmChannel(channelId) {
  return typeof channelId === "string" && channelId.startsWith("dm:");
}

function dmIdFromChannel(channelId) {
  if (!isDmChannel(channelId)) return null;
  return channelId.slice(3);
}

// helper to generate initials
function generateInitials(name) {
  if (!name) return "";
  const parts = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0][0] || "";
  const second = parts[1] ? parts[1][0] : parts[0].slice(1, 2);
  return (first + (second || "")).toUpperCase();
}

function getDisplayName() {
  return (
    (sessionUser && (sessionUser.name || sessionUser.username || sessionUser.email)) ||
    "You"
  );
}

function getCurrentUserId() {
  if (!sessionUser) return "";
  return (
    sessionUser.userId ||
    sessionUser.id ||
    sessionUser.email ||
    sessionUser.username ||
    sessionUser.name ||
    ""
  );
}

function updateTypingIndicatorUser() {
  renderTypingUsers();
}

function syncChannelSearchForChannel(channelId) {
  const key = channelId ? String(channelId) : "";
  const term = key && Object.prototype.hasOwnProperty.call(channelSearchTerms, key)
    ? channelSearchTerms[key]
    : "";
  channelSearchTerm = term || "";
  if (channelSearchInput) channelSearchInput.value = channelSearchTerm;
}

function updateChannelSearchTerm(channelId, term) {
  if (!channelId) return;
  const key = String(channelId);
  channelSearchTerms[key] = term || "";
  channelSearchTerm = channelSearchTerms[key];
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST", body: {} });
  } catch (_err) {
    // ignore
  }
  try {
    localStorage.removeItem("currentWorkspaceId");
  } catch (_err) {
    // ignore
  }
  location.reload();
}


function buildApiHeaders(options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  const uid = typeof getCurrentUserId === "function"
    ? String(getCurrentUserId() || "").trim()
    : "";
  if (uid) headers["x-user-id"] = uid;

  if (typeof sessionUser === "object" && sessionUser) {
    if (sessionUser.role) headers["x-user-role"] = String(sessionUser.role);
    if (sessionUser.workspaceId) headers["x-workspace-id"] = String(sessionUser.workspaceId);
  }

  return headers;
}

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

async function apiFetch(url, opts = {}) {
  const method = (opts.method || "GET").toUpperCase();
  const needsCsrf = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

  const buildHeaders = () => {
    const headers = buildApiHeaders(opts);
    if (ACCESS_TOKEN) {
      headers["Authorization"] = `Bearer ${ACCESS_TOKEN}`;
    }
    if (needsCsrf) {
      headers["x-csrf-token"] = getCsrfToken();
    }
    const hasContentType = Object.keys(headers).some(
      (key) => key.toLowerCase() === "content-type"
    );
    // Don’t force JSON content-type for GET requests with no body (avoids unnecessary preflight).
    if (!hasContentType && opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    return headers;
  };

  const makeRequest = () =>
    fetch(API_BASE + url, {
      ...opts,
      method,
      headers: buildHeaders(),
      credentials: "include",
      cache: "no-store"
    });

  let res = await makeRequest();

  if (res.status === 401) {
    const refresh = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": getCsrfToken()
      }
    });
    if (refresh.ok) {
      const payload = await refresh.json().catch(() => null);
      if (payload?.accessToken) {
        setAccessToken(payload.accessToken);
      }
      res = await makeRequest();
    }
  }

  return res;
}

async function fetchJSON(path, options = {}) {
  const res = await apiFetch(path, options);

  if (res.status === 304) return [];
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = text || res.statusText;
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
        if (payload?.error) message = payload.error;
      } catch (_err) {
        // ignore
      }
    }
    const err = new Error(message || "Request failed");
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return res.json();
}

function scheduleReminder(ev) {
  if (!ev || !ev.remindMin) return;
  const time = String(ev.startTime || "").trim();
  if (!time) return;

  const [hour, minute] = time.split(":").map((v) => Number(v));
  if (Number.isNaN(hour) || Number.isNaN(minute)) return;

  const start = new Date(`${ev.date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
  const remindAt = start.getTime() - Number(ev.remindMin) * 60 * 1000;
  const delay = remindAt - Date.now();
  if (delay <= 0) return;

  setTimeout(() => {
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("School planner reminder", {
          body: `${ev.title || "Event"} at ${time}`
        });
      }
    } catch (err) {
      console.error("Reminder notification failed", err);
    }
  }, delay);
}

async function api(url, opts = {}) {
  const res = await apiFetch(url, {
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function normalizeErrorText(err) {
  if (!err) return "Something went wrong.";
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    if (err.error) return err.error;
    if (err.message) return err.message;
  }
  return "Something went wrong.";
}

function passwordStrength(p) {
  const s = String(p || "");
  let score = 0;
  if (s.length >= 8) score++;
  if (/[a-z]/.test(s)) score++;
  if (/[A-Z]/.test(s)) score++;
  if (/[0-9]/.test(s)) score++;
  if (/[^A-Za-z0-9]/.test(s)) score++;

  let label = "Weak";
  let percent = 20;
  let color = "#dc2626";

  if (score === 3) {
    label = "Medium";
    percent = 60;
    color = "#f59e0b";
  }
  if (score >= 4) {
    label = "Strong";
    percent = 100;
    color = "#16a34a";
  }

  return { label, percent, color };
}

function showMustChangePasswordBanner() {
  const banner = document.getElementById("mustChangePwdBanner");
  const btn = document.getElementById("mustChangePwdBtn");

  if (!banner) return;

  banner.style.display = "flex";

  if (btn) {
    btn.onclick = () => {
      showForcePasswordModal();
    };
  }
}

function hideMustChangePasswordBanner() {
  const banner = document.getElementById("mustChangePwdBanner");
  if (banner) banner.style.display = "none";
}


function showForcePasswordModal(onSuccess) {
  const old = document.getElementById("forcePwdOverlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = "forcePwdOverlay";
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(15,23,42,.55);
    display:flex; align-items:center; justify-content:center;
    z-index:99999; padding:16px;
  `;

  const card = document.createElement("div");
  card.style.cssText = `
    width:min(520px,100%); background:#fff; border-radius:16px;
    border:1px solid rgba(15,23,42,.18);
    box-shadow:0 40px 120px rgba(15,23,42,.45);
    overflow:hidden;
  `;

  card.innerHTML = `
    <div style="padding:14px 16px; border-bottom:1px solid #e2e8f0;">
      <div style="font-weight:1000; font-size:16px;">Create a new password</div>
      <div style="color:#64748b; margin-top:4px; font-size:13px;">
        For security, you must change the temporary password before continuing.
      </div>
    </div>

    <div style="padding:16px; display:grid; gap:12px;">
      <div>
        <div style="font-size:12px;color:#64748b;font-weight:800;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
          New password
          <span id="pwdPolicyIcon"
            style="
              width:18px;height:18px;
              border-radius:50%;
              background:#e2e8f0;
              color:#0f172a;
              font-size:12px;
              display:flex;
              align-items:center;
              justify-content:center;
              cursor:pointer;
              font-weight:900;
            ">
            i
          </span>
        </div>
        <div style="display:flex; gap:8px;">
          <input id="fp_pwd1" type="password" style="flex:1;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;"
            placeholder="New password" />
          <button id="fp_eye1" type="button"
            style="border:1px solid #e2e8f0;background:#fff;border-radius:12px;padding:10px 12px;cursor:pointer;font-weight:900;">
            👁
          </button>
        </div>
        <div style="margin-top:8px;">
          <div style="height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden;">
            <div id="fp_strength_bar"
              style="height:100%;width:0%;transition:all .3s ease;border-radius:999px;">
            </div>
          </div>
          <div id="fp_strength_label"
            style="margin-top:6px;font-size:12px;font-weight:900;">
            —
          </div>
        </div>
      </div>

      <div>
        <div style="font-size:12px;color:#64748b;font-weight:800;margin-bottom:6px;">Confirm password</div>
        <div style="display:flex; gap:8px;">
          <input id="fp_pwd2" type="password" style="flex:1;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;"
            placeholder="Confirm password" />
          <button id="fp_eye2" type="button"
            style="border:1px solid #e2e8f0;background:#fff;border-radius:12px;padding:10px 12px;cursor:pointer;font-weight:900;">
            👁
          </button>
        </div>
        <div id="fp_match" style="margin-top:6px;font-size:12px;font-weight:900;color:#64748b;">
          —
        </div>
      </div>

      <div id="fp_err" style="display:none;background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;border-radius:12px;padding:10px;font-weight:900;"></div>

      <button id="fp_save"
        style="background:#2563eb;color:#fff;border:0;border-radius:12px;padding:12px 14px;font-weight:1000;cursor:pointer;">
        Save password
      </button>

      <div style="font-size:12px;color:#64748b;">
        Tips: use 8+ characters, uppercase, lowercase, number, and a symbol.
      </div>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  let policyTooltip = null;
  const policyIcon = card.querySelector("#pwdPolicyIcon");
  if (policyIcon) {
    const tooltip = document.createElement("div");
    tooltip.style.cssText = `
      position:absolute;
      background:#0f172a;
      color:#fff;
      padding:10px 12px;
      border-radius:10px;
      font-size:12px;
      line-height:1.4;
      width:240px;
      display:none;
      z-index:100000;
      box-shadow:0 10px 30px rgba(15,23,42,0.2);
    `;
    tooltip.innerHTML = `
      <strong>Password policy:</strong><br>
      • Minimum 8 characters<br>
      • At least one uppercase letter<br>
      • At least one lowercase letter<br>
      • At least one number<br>
      • Special character recommended
    `;
    document.body.appendChild(tooltip);

    policyIcon.addEventListener("mouseenter", () => {
      tooltip.style.display = "block";
      const rect = policyIcon.getBoundingClientRect();
      tooltip.style.top = rect.bottom + 8 + "px";
      tooltip.style.left = `${rect.left}px`;
    });
    policyIcon.addEventListener("mouseleave", () => {
      tooltip.style.display = "none";
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        tooltip.remove();
      }
    });
    policyTooltip = tooltip;
  }

  const pwd1 = card.querySelector("#fp_pwd1");
  const pwd2 = card.querySelector("#fp_pwd2");
  const strengthBar = card.querySelector("#fp_strength_bar");
  const strengthEl = card.querySelector("#fp_strength_label");
  const matchEl = card.querySelector("#fp_match");
  const errEl = card.querySelector("#fp_err");

  const updateUI = () => {
    const p1 = pwd1.value || "";
    const p2 = pwd2.value || "";

  const s = passwordStrength(p1);
  const strengthBarEl = card.querySelector("#fp_strength_bar");
  const strengthLabelEl = card.querySelector("#fp_strength_label");
  if (strengthBarEl) {
    strengthBarEl.style.width = `${s.percent}%`;
    strengthBarEl.style.background = s.color;
  }
  if (strengthLabelEl) {
    strengthLabelEl.textContent = `Strength: ${s.label}`;
    strengthLabelEl.style.color = s.color;
  }

    if (!p2) matchEl.textContent = "—";
    else matchEl.textContent = p1 === p2 ? "Passwords match ✅" : "Passwords do not match ❌";
  };

  pwd1.addEventListener("input", updateUI);
  pwd2.addEventListener("input", updateUI);

  card.querySelector("#fp_eye1").addEventListener("click", () => {
    pwd1.type = pwd1.type === "password" ? "text" : "password";
  });
  card.querySelector("#fp_eye2").addEventListener("click", () => {
    pwd2.type = pwd2.type === "password" ? "text" : "password";
  });

  card.querySelector("#fp_save").addEventListener("click", async () => {
    errEl.style.display = "none";
    errEl.textContent = "";

    const p1 = pwd1.value || "";
    const p2 = pwd2.value || "";

    if (p1.length < 8) {
      errEl.textContent = "Password must be at least 8 characters.";
      errEl.style.display = "block";
      return;
    }
    if (p1 !== p2) {
      errEl.textContent = "Passwords do not match.";
      errEl.style.display = "block";
      return;
    }

    try {
      await api("/api/auth/first-login/set-password", {
        method: "POST",
        body: { password: p1, confirmPassword: p2 }
      });

      overlay.remove();
      policyTooltip?.remove();
      hideMustChangePasswordBanner();
      showToast("Password successfully updated.");
      if (typeof onSuccess === "function") {
        await onSuccess();
      }
    } catch (e) {
      errEl.textContent = normalizeErrorText(e?.payload || e);
      errEl.style.display = "block";
    }
  });

  updateUI();
}


async function loadWorkspacesFromServer() {
  try {
    workspaces = await fetchJSON("/api/workspaces");

    const isSuper = isSuperAdmin();
    const sessionWorkspaceId = String(
      sessionUser?.workspaceId ||
      sessionUser?.workspace_id ||
      window.selectedWorkspaceId ||
      currentWorkspaceId ||
      ""
    ).trim();
    if (sessionUser && !isSuper && sessionWorkspaceId) {
      workspaces = workspaces.filter((w) => w.id === sessionWorkspaceId);
    }

    if (!workspaces.length) {
      currentWorkspaceId = "default";
      return;
    }

    const preferredWorkspaceId = String(
      sessionWorkspaceId ||
      window.selectedWorkspaceId ||
      currentWorkspaceId ||
      ""
    ).trim();
    const exists = workspaces.some((w) => w.id === preferredWorkspaceId);
    if (!exists) {
      currentWorkspaceId = workspaces[0].id;
      persistCurrentWorkspace();
      window.selectedWorkspaceId = currentWorkspaceId;
    } else {
      currentWorkspaceId = preferredWorkspaceId;
      window.selectedWorkspaceId = preferredWorkspaceId;
    }

    renderWorkspaces();
    updateSchoolLabel();
    updateTypingIndicatorUser();
  } catch (err) {
    console.error("Failed to load workspaces", err);
    showToast("Could not load workspaces");
  }
}



function findChannelById(id) {
  if (!id) return null;
  const needle = String(id);
  if (isSchoolSettingsChannel(needle)) {
    return getSchoolSettingsChannelMeta();
  }
  return (channels || []).find((c) => String(c.id) === needle) || null;
}


async function loadServerData() {
  try {
    // 1) load workspaces first
    await loadWorkspacesFromServer();

    // 2) then channels for the selected workspace
    await loadChannelsForWorkspace(currentWorkspaceId);
    loadCurrentChannelId();
    scrollState = loadScrollState();
    scrollAnchors = loadScrollAnchors();
    const lastView = loadLastView();
    if (!currentChannelId && channels.length) {
      currentChannelId = channels[0].id;
    }

    // 3) DMs (filtered by membership/creator)
    dms = await fetchJSON("/api/dms", {
      headers: { "x-user-id": getCurrentUserId() }
    });
    // 4) preload users directory for profile cards
    await loadUserDirectory();
    await checkPolicyAcceptance();

    // 5) pre-load messages for initial channel
    const targetChannel =
      (lastView && lastView.channelId && findChannelById(lastView.channelId)) ||
      findChannelById(currentChannelId) ||
      channels[0];
    if (targetChannel) {
      currentChannelId = targetChannel.id;
      if (!isSchoolSettingsChannel(currentChannelId)) {
        await ensureMessagesForChannelId(currentChannelId);
      }
    }

    await restoreLastView(lastView);
  } catch (err) {
    console.error("Failed to load data from server", err);
    showToast("Could not load data from server");
  }
}

async function restoreLastView(lastView = null) {
  isRestoringView = true;
  try {
    const view = lastView || loadLastView() || {};
    if (view.viewMode === "directory" && view.directoryRole && isSchoolAdmin()) {
      await showDirectoryList(view.directoryRole);
      didRestoreView = true;
      return;
    }
    const isDm = isDmChannel(view.channelId || "");
    const validChannel = !isDm && view.channelId ? findChannelById(view.channelId) : null;
    const channelId = validChannel ? validChannel.id : null;

    if (isDm && view.channelId) {
      const dmId = dmIdFromChannel(view.channelId);
      if (dmId) {
        await selectDM(dmId);
        didRestoreView = true;
      } else {
        return;
      }
    } else if (channelId) {
      await selectChannel(channelId);
      if (channelId === SCHOOL_SETTINGS_CHANNEL_ID) {
        try {
          await loadEmailSettings();
          await loadClassSettingsSchoolDetails();
        } catch (err) {
          console.error("Failed to load school email settings during restore", err);
        }
      }
      didRestoreView = true;
    } else {
      return;
    }

    // restore thread if possible
    const threadChannelId = view.threadChannelId ? String(view.threadChannelId) : channelId ? String(channelId) : null;
    if (view.threadMessageId && threadChannelId) {
      await ensureMessagesForChannelId(threadChannelId);
      const msgs = messagesByChannel[threadChannelId] || [];
      const exists = msgs.find((m) => String(m.id) === String(view.threadMessageId));
      if (exists) {
        openThread(threadChannelId, exists.id);
      } else {
        persistLastView({ channelId: threadChannelId, threadMessageId: null, threadChannelId: null });
      }
    }

    const viewKey = isDm && view.channelId ? view.channelId : channelId;
    restoreChatScrollWithRetry(viewKey);
  } finally {
    isRestoringView = false;
  }
}

const LIVE_MANAGER_ROLES = new Set(["teacher", "school_admin", "super_admin"]);

function canCurrentUserManageLive() {
  if (!sessionUser) return false;
  return LIVE_MANAGER_ROLES.has(normalizeRole(sessionUser.role || sessionUser.userRole));
}

function updateLiveCreateVisibility() {
  if (!liveCreateBtn) return;
  liveCreateBtn.hidden = !canCurrentUserManageLive();
}

/* ---------- Admin helpers ---------- */
function syncAdminStatus(user) {
  const role = normalizeRole(user?.role || user?.userRole);
  adminLoggedIn = ADMIN_ROLE_VALUES.has(role);
  adminLoggedInSuper = role === "super_admin" || user?.superAdmin === true;
}

function persistSessionUser(user) {
  sessionUser = user;
  if (sessionUser) {
    const normalizedWorkspaceId = String(
      sessionUser.workspaceId ||
      sessionUser.workspace_id ||
      window.selectedWorkspaceId ||
      currentWorkspaceId ||
      "default"
    ).trim();
    sessionUser.workspaceId = normalizedWorkspaceId;
    sessionUser.workspace_id = normalizedWorkspaceId;
    window.selectedWorkspaceId = normalizedWorkspaceId;
    currentWorkspaceId = normalizedWorkspaceId;
    sessionUser.nativeLanguage = normalizeCultureLanguageCode(sessionUser.nativeLanguage || "en");
  }
  syncAdminStatus(sessionUser);
  updateAdminButtonState();
  updateLiveCreateVisibility();
}

function normalizeCultureLanguageCode(code = "") {
  const raw = String(code || "").trim().toLowerCase();

  if (!raw) return "en";
  const MAP = {
    en: "en",
    eng: "en",
    english: "en",
    de: "de",
    deu: "de",
    ger: "de",
    german: "de",
    deutsch: "de",
    bn: "bn",
    ben: "bn",
    bangla: "bn",
    bengali: "bn",
    es: "es",
    spa: "es",
    spanish: "es",
    español: "es",
    fr: "fr",
    fra: "fr",
    fre: "fr",
    french: "fr",
    français: "fr",
    ar: "ar",
    ara: "ar",
    arabic: "ar",
    tr: "tr",
    tur: "tr",
    turkish: "tr",
    it: "it",
    ita: "it",
    italian: "it",
    pt: "pt",
    por: "pt",
    portuguese: "pt",
    ru: "ru",
    rus: "ru",
    russian: "ru",
    uk: "uk",
    ukr: "uk",
    ukrainian: "uk",
    hi: "hi",
    hin: "hi",
    hindi: "hi",
    zh: "zh",
    "zh-cn": "zh",
    "zh-hans": "zh",
    chinese: "zh",
    mandarin: "zh"
  };

  if (raw.includes("-")) {
    const base = raw.split("-")[0];
    if (MAP[base]) return MAP[base];
  }

  return MAP[raw] || raw;
}

function getCultureLanguageLabel(code) {
  const normalized = normalizeCultureLanguageCode(code || "en");
  const match = CULTURE_EXCHANGE_LANGUAGES.find((lang) => lang.code === normalized);
  return match ? match.label : (normalized ? normalized.toUpperCase() : "Unknown");
}

function populateCultureLanguageOptions() {
  if (!cultureLanguageSelect) return;
  if (cultureLanguageSelect.dataset.cultureOptions === "1") return;
  CULTURE_EXCHANGE_LANGUAGES.forEach((lang) => {
    const option = document.createElement("option");
    option.value = lang.code;
    option.textContent = lang.label;
    cultureLanguageSelect.appendChild(option);
  });
  cultureLanguageSelect.dataset.cultureOptions = "1";
}

function refreshCultureExchangeLanguagePreference() {
  populateCultureLanguageOptions();
  if (cultureLanguageSelect) {
    cultureLanguageSelect.value = getCultureExchangeLanguage();
  }
}

function getCultureExchangeLanguage() {
  return normalizeCultureLanguageCode(
    cultureExchangeLanguage || sessionUser?.nativeLanguage || sessionUser?.native_language || "en"
  );
}

function getCultureReadLanguage(channelId) {
  const uid = getCurrentUserId?.() || sessionUser?.id || "anon";
  const key =
    channelId && typeof channelId === "string"
      ? `culture_read_lang:${uid}:${channelId}`
      : null;

  if (key) {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        cultureReadLanguage = stored;
        return normalizeCultureLanguageCode(stored);
      }
    } catch (_err) {
      /* ignore */
    }
  }

  const fallback =
    normalizeCultureLanguageCode(sessionUser?.nativeLanguage || "en") || "en";
  cultureReadLanguage = fallback;
  return fallback;
}

async function loadCultureReadLanguageForChannel(channelId) {
  if (!channelId || !isCultureExchangeChannel(channelId)) return;
  const uid = getCurrentUserId?.() || sessionUser?.id || "anon";
  try {
    const res = await fetchJSON(`/api/channels/${channelId}/culture-pref`, {
      headers: { "x-user-id": uid }
    });
    const readLang = normalizeCultureLanguageCode(res?.readLang || "en") || "en";
    cultureReadLanguage = readLang;
    try {
      localStorage.setItem(`culture_read_lang:${uid}:${channelId}`, readLang);
    } catch (_err) {
      /* ignore */
    }
  } catch (_err) {
    // fallback to getter
  }
}

async function setCultureReadLanguage(channelId, langCode) {
  if (!channelId) return;

  const readLang = normalizeCultureLanguageCode(langCode || "en") || "en";
  console.log("[ReadLang] set ->", { channelId, langCode, resolved: readLang });

  cultureReadLanguage = readLang;

  const uid = getCurrentUserId?.() || sessionUser?.id || "anon";
  const storageKey = `culture_read_lang:${uid}:${channelId}`;
  try {
    localStorage.setItem(storageKey, readLang);
  } catch (_err) {
    /* ignore */
  }

  try {
    await fetchJSON(`/api/channels/${channelId}/culture-pref`, {
      method: "POST",
      headers: { "x-user-id": uid },
      body: JSON.stringify({ readLang })
    });
  } catch (err) {
    console.warn("Failed to save culture read language to server", err);
  }

  try {
    cultureTranslationState?.clear?.();
    cultureTranslationCache?.clear?.();
    cultureTranslationPending?.clear?.();
    cultureTranslationInflight?.clear?.();
  } catch (_err) {
    /* ignore */
  }

  updateHeaderLanguageIndicator(channelId);
  renderMessages(channelId, { restoreScroll: true });
  if (cultureLanguageSelect) {
    cultureLanguageSelect.value = readLang;
  }
}



function resetCultureTranslationState() {
  cultureTranslationState.clear();
  cultureTranslationCache.clear();
  cultureTranslationTimers.forEach((timer) => clearTimeout(timer));
  cultureTranslationTimers.clear();
}


async function loadUserDirectory() {
  if (userDirectoryLoaded) return userDirectoryCache;
  const role = normalizeRole(sessionUser?.role || sessionUser?.userRole || "");
  const canReadDirectory = role === "admin" || role === "school_admin" || role === "super_admin";
  if (!canReadDirectory) {
    userDirectoryCache = [];
    userDirectoryLoaded = true;
    return userDirectoryCache;
  }
  try {
    const workspaceId = getCurrentWorkspaceId();
    const users = await fetchJSON(`/api/users?workspaceId=${encodeURIComponent(workspaceId)}`);
    userDirectoryCache = Array.isArray(users) ? users : [];
    userDirectoryLoaded = true;
  } catch (err) {
    console.warn("Could not load user directory", err);
    userDirectoryCache = [];
  }
  return userDirectoryCache;
}

function isPrivacyRulesChannel(channelOrId) {
  if (!channelOrId) return false;
  const ch = typeof channelOrId === "string" ? getChannelById(channelOrId) : channelOrId;
  if (!ch) return false;
  if (typeof ch.id === "string" && ch.id.startsWith("dm:")) return false;
  const name = String(ch.name || "").trim().toLowerCase().replace(/\s+/g, " ");
  const category = String(ch.category || "").trim().toLowerCase();
  if (category !== "tools") return false;
  return ["privacy & rules", "privacy and rules", "privacy rules"].includes(name);
}

function isExamRegistrationChannel(channelOrId) {
  if (!channelOrId) return false;
  const ch = typeof channelOrId === "string" ? getChannelById(channelOrId) : channelOrId;
  if (!ch) return false;
  if (typeof ch.id === "string" && ch.id.startsWith("dm:")) return false;
  const category = String(ch.category || "").trim().toLowerCase();
  if (category !== "tools") return false;
  const name = String(ch.name || "").trim().toLowerCase().replace(/\s+/g, " ");
  return name === "exam registration";
}

function isScheduleChannel(channelOrId) {
  if (!channelOrId) return false;
  const ch = typeof channelOrId === "string" ? getChannelById(channelOrId) : channelOrId;
  if (!ch) return false;
  if (typeof ch.id === "string" && ch.id.startsWith("dm:")) return false;
  const category = String(ch.category || "").trim().toLowerCase();
  if (category !== "tools") return false;
  const name = String(ch.name || "").trim().toLowerCase().replace(/\s+/g, " ");
  return name === "schedule";
}

function isGrammarChannel(channelOrId) {
  if (!channelOrId) return false;
  const ch = typeof channelOrId === "string" ? getChannelById(channelOrId) : channelOrId;
  if (!ch) return false;
  if (typeof ch.id === "string" && ch.id.startsWith("dm:")) return false;
  const category = String(ch.category || "").trim().toLowerCase();
  if (category !== "tools") return false;
  const name = String(ch.name || "").trim().toLowerCase();
  return name.includes("grammar");
}

const wordmeaningTableData = [
  {
    word: "Familie",
    synonym: "Verwandtschaft",
    adjective: "familiär",
    example: "Meine Familie wohnt in einer kleinen Stadt."
  },
  {
    word: "Nachname",
    synonym: "Familienname",
    adjective: "—",
    example: "Bitte schreiben Sie Ihren Nachnamen deutlich."
  },
  {
    word: "Vorname",
    synonym: "Rufname",
    adjective: "—",
    example: "Ihr Vorname steht auf dem Ausweis."
  },
  {
    word: "Straße",
    synonym: "Weg",
    adjective: "städtisch",
    example: "Unsere Straße ist sehr ruhig am Abend."
  },
  {
    word: "Hausnummer",
    synonym: "Gebäudenummer",
    adjective: "—",
    example: "Die Hausnummer fehlt auf dem Briefkasten."
  },
  {
    word: "Nationalität",
    synonym: "Staatsangehörigkeit",
    adjective: "national",
    example: "Seine Nationalität ist deutsch."
  },
  {
    word: "Wohnort",
    synonym: "Heimatort",
    adjective: "örtlich",
    example: "Mein Wohnort liegt nahe am Meer."
  },
  {
    word: "Vorwahl",
    synonym: "Telefonvorwahl",
    adjective: "regional",
    example: "Vergessen Sie die Vorwahl nicht."
  },
  {
    word: "Postleitzahl",
    synonym: "PLZ",
    adjective: "postalisch",
    example: "Die Postleitzahl hilft bei der Zustellung."
  },
  {
    word: "Telefonnummer",
    synonym: "Rufnummer",
    adjective: "telefonisch",
    example: "Ich habe deine Telefonnummer gespeichert."
  },
  {
    word: "Handy",
    synonym: "Mobiltelefon",
    adjective: "mobil",
    example: "Mein Handy ist heute ausgeschaltet."
  },
  {
    word: "E-Mail-Adresse",
    synonym: "Mailadresse",
    adjective: "elektronisch",
    example: "Bitte geben Sie Ihre E-Mail-Adresse ein."
  },
  {
    word: "Universität",
    synonym: "Hochschule",
    adjective: "akademisch",
    example: "Die Universität bietet viele Kurse an."
  },
  {
    word: "Student",
    synonym: "Studierender",
    adjective: "studentisch",
    example: "Der Student bereitet sich auf die Prüfung vor."
  },
  {
    word: "Studiengang",
    synonym: "Fachrichtung",
    adjective: "spezialisiert",
    example: "Ihr Studiengang ist sehr interessant."
  },
  {
    word: "Professor",
    synonym: "Dozent",
    adjective: "professionell",
    example: "Der Professor erklärt die Grammatik klar."
  },
  {
    word: "Abschluss",
    synonym: "Diplom",
    adjective: "abgeschlossen",
    example: "Sie hat ihren Abschluss erfolgreich gemacht."
  },
  {
    word: "Architekt",
    synonym: "Baudesigner",
    adjective: "architektonisch",
    example: "Der Architekt plant ein modernes Haus."
  },
  {
    word: "Wirtschaft",
    synonym: "Ökonomie",
    adjective: "wirtschaftlich",
    example: "Die wirtschaftliche Lage verbessert sich."
  },
  {
    word: "Schreiben",
    synonym: "Texten",
    adjective: "schriftlich",
    example: "Schreiben ist wichtig für das Studium."
  },
  {
    word: "Praktikum",
    synonym: "Berufserfahrung",
    adjective: "praktisch",
    example: "Er macht ein Praktikum im Büro."
  },
  {
    word: "arbeiten",
    synonym: "tätig sein",
    adjective: "arbeitend",
    example: "Sie arbeitet heute länger als gewöhnlich."
  },
  {
    word: "wer",
    synonym: "welche Person",
    adjective: "—",
    example: "Wer kommt morgen zur Feier?"
  },
  {
    word: "wie",
    synonym: "auf welche Weise",
    adjective: "—",
    example: "Wie heißt dein Lehrer?"
  },
  {
    word: "wo",
    synonym: "an welchem Ort",
    adjective: "—",
    example: "Wo wohnst du jetzt?"
  },
  {
    word: "woher",
    synonym: "aus welchem Ort",
    adjective: "—",
    example: "Woher kommst du ursprünglich?"
  },
  {
    word: "was",
    synonym: "welche Sache",
    adjective: "—",
    example: "Was lernst du heute?"
  },
  {
    word: "auch",
    synonym: "ebenfalls",
    adjective: "zusätzlich",
    example: "Ich komme auch mit ins Kino."
  },
  {
    word: "noch",
    synonym: "weiterhin",
    adjective: "fortlaufend",
    example: "Er wartet noch auf den Bus."
  },
  {
    word: "nicht",
    synonym: "kein",
    adjective: "negativ",
    example: "Ich verstehe das nicht."
  },
  {
    word: "schon",
    synonym: "bereits",
    adjective: "vorherig",
    example: "Wir haben das schon besprochen."
  },
  {
    word: "dort",
    synonym: "da",
    adjective: "entfernt",
    example: "Sie wohnen dort seit zwei Jahren."
  },
  {
    word: "jetzt",
    synonym: "momentan",
    adjective: "aktuell",
    example: "Jetzt beginnt der Unterricht."
  },
  {
    word: "zusammen",
    synonym: "gemeinsam",
    adjective: "gemeinsam",
    example: "Wir lernen zusammen Deutsch."
  },
  {
    word: "hier",
    synonym: "an diesem Ort",
    adjective: "lokal",
    example: "Hier ist mein Platz."
  },
  {
    word: "Afrika",
    synonym: "Kontinent",
    adjective: "afrikanisch",
    example: "Afrika hat viele verschiedene Kulturen."
  },
  {
    word: "Amerika",
    synonym: "US-Region",
    adjective: "amerikanisch",
    example: "Amerika ist ein großes Land."
  },
  {
    word: "Asien",
    synonym: "Erdteil",
    adjective: "asiatisch",
    example: "Asien ist sehr vielfältig."
  },
  {
    word: "Australien",
    synonym: "Inselkontinent",
    adjective: "australisch",
    example: "Australien liegt auf der Südhalbkugel."
  },
  {
    word: "Europa",
    synonym: "EU-Region",
    adjective: "europäisch",
    example: "Europa besteht aus vielen Ländern."
  }
];

function isWordmeaningChannel(channelOrId) {
  if (!channelOrId) return false;
  const ch = typeof channelOrId === "string" ? getChannelById(channelOrId) : channelOrId;
  if (!ch) return false;
  if (typeof ch.id === "string" && ch.id.startsWith("dm:")) return false;
  const category = String(ch.category || "").trim().toLowerCase();
  if (category !== "tools") return false;
  const normalized = String(ch.name || "").trim().toLowerCase().replace(/\s+/g, " ");
  return normalized === "wordmeaning" || normalized === "word meaning";
}

function renderWordmeaningTable() {
  const rows = wordmeaningTableData
    .map(
      (entry) => `
      <tr>
        <td>${escapeHtml(entry.word)}</td>
        <td>${escapeHtml(entry.synonym)}</td>
        <td>${escapeHtml(entry.adjective)}</td>
        <td>${escapeHtml(entry.example)}</td>
      </tr>
    `
    )
    .join("");
  return `
    <div class="wordmeaning-table-wrapper">
      <table class="wordmeaning-table">
        <thead>
          <tr>
            <th scope="col">Word</th>
            <th scope="col">Sinoname</th>
            <th scope="col">Adjective</th>
            <th scope="col">Example</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

const badgeColors = {
  general: "#e2e8f0",
  exam: "#bbf7d0",
  class: "#bfdbfe",
  holiday: "#edd5fb",
  important: "#fde68a",
  emergency: "#fee2e2",
  event: "#d1fae5",
  homework: "#fed7aa",
  reminder: "#e0e7ff",
  meeting: "#c7d2fe"
};

const badgeTextColors = {
  general: "#0f172a",
  important: "#92400e",
  reminder: "#0f172a",
  meeting: "#312e81",
  holiday: "#4c1d95"
};

const badgeStatusAliases = {
  examination: "exam",
  exam: "exam",
  classupdate: "class",
  class: "class",
  newcourse: "class",
  courseend: "class",
  moctest: "exam",
  moc: "exam",
  general: "general",
  holiday: "holiday",
  important: "important",
  emergency: "emergency",
  event: "event",
  homework: "homework",
  reminder: "reminder",
  meeting: "meeting"
};

function normalizeBadgeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

function getBadgeStyleProps(statusLabel) {
  const normalized = normalizeBadgeStatus(statusLabel);
  const key = badgeStatusAliases[normalized] || "general";
  return {
    background: badgeColors[key] || badgeColors.general,
    textColor: badgeTextColors[key] || "#0f172a"
  };
}

const grammarContentState = {
  ready: false,
  data: null
};

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderWithSuffix(value) {
  if (typeof value === "string") {
    return `<span class=\"word\">${escapeHtml(value)}</span>`;
  }
  const base = value.base ?? "";
  const suffix = value.suffix ?? "";
  return `<span class=\"word\">${escapeHtml(base)}<span class=\"ending\">${escapeHtml(suffix)}</span></span>`;
}

function buildGrammarConjugation(conj) {
  if (!conj) return;
  const titleEl = document.getElementById("conjTitle");
  if (titleEl) titleEl.textContent = conj.title || "";
  const grid = document.getElementById("conjGrid");
  if (!grid) return;
  const verbs = Array.isArray(conj.verbs) ? conj.verbs : [];
  const pronouns = Array.isArray(conj.pronouns) ? conj.pronouns : [];
  const headerRow = document.createElement("div");
  headerRow.className = "conj-row conj-row--header";
  headerRow.innerHTML = `
    <div class=\"conj-cell conj-cell--pronoun conj-cell--header\"></div>
    ${verbs
      .map(
        (v) => `<div class=\"conj-cell conj-cell--header\">
          <div class=\"verb-head\">${escapeHtml(v.label)}</div>
          <div class=\"rule\"></div>
        </div>`
      )
      .join("")}
  `;
  grid.innerHTML = "";
  grid.appendChild(headerRow);
  pronouns.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "conj-row";
    row.innerHTML = `
      <div class=\"conj-cell conj-cell--pronoun\">
        <span class=\"pronoun\">${escapeHtml(p)}</span>
        <div class=\"rule\"></div>
      </div>
      ${verbs
        .map((v) => {
          const val = (v.forms || [])[i];
          return `<div class=\"conj-cell\">${renderWithSuffix(val)}<div class=\"rule\"></div></div>`;
        })
        .join("")}
    `;
    grid.appendChild(row);
  });
}

function buildGrammarMiniTable(table) {
  const headers = Array.isArray(table?.headers) ? table.headers : ["Position 1", "Position 2"];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  return `
    <div class=\"mini\">
      <div class=\"mini-head\">
        <div class=\"mini-h mini-h--pos1\">${escapeHtml(headers[0] ?? "")}</div>
        <div class=\"mini-h mini-h--pos2\">${escapeHtml(headers[1] ?? "")}</div>
        <div class=\"mini-h mini-h--rest\"></div>
      </div>
      <div class=\"mini-body\">
        ${rows
          .map(
            (r) => `
              <div class=\"mini-row\">
                <div class=\"mini-c mini-c--pos1\">
                  <span class=\"mini-text\">${escapeHtml(r[0] ?? "")}</span>
                  <div class=\"rule\"></div>
                </div>
                <div class=\"mini-c mini-c--pos2\">
                  <span class=\"mini-text\">${escapeHtml(r[1] ?? "")}</span>
                  <div class=\"rule\"></div>
                </div>
                <div class=\"mini-c mini-c--rest\">
                  <span class=\"mini-text\">${escapeHtml(r[2] ?? "")}</span>
                  <div class=\"rule\"></div>
                </div>
              </div>`
          )
          .join("")}
      </div>
    </div>
  `;
}

function buildGrammarWordOrder(wo) {
  if (!wo) return;
  const titleEl = document.getElementById("woTitle");
  if (titleEl) titleEl.textContent = wo.title || "";
  const layout = document.getElementById("woLayout");
  if (!layout) return;
  const leftTop = wo.blocks?.leftTop;
  const rightTop = wo.blocks?.rightTop;
  const leftBottom = wo.blocks?.leftBottom;
  const rightBottom = wo.blocks?.rightBottom;
  const top = document.createElement("div");
  top.className = "wo-row";
  top.innerHTML = `
    <div class=\"wo-col\">
      <div class=\"wo-subtitle\">${escapeHtml(leftTop?.label || "")}</div>
      ${buildGrammarMiniTable(leftTop?.table || {})}
    </div>
    <div class=\"wo-col\">
      <div class=\"wo-subtitle wo-subtitle--center\">${escapeHtml(rightTop?.label || "")}</div>
      ${buildGrammarMiniTable(rightTop?.table || {})}
    </div>
  `;
  const bottom = document.createElement("div");
  bottom.className = "wo-row wo-row--gap";
  bottom.innerHTML = `
    <div class=\"wo-col\">
      <div class=\"wo-subtitle\">${escapeHtml(leftBottom?.label || "")}</div>
      ${buildGrammarMiniTable(leftBottom?.table || {})}
    </div>
    <div class=\"wo-col\">
      <div class=\"wo-subtitle wo-subtitle--center\">${escapeHtml(rightBottom?.label || "")}</div>
      ${buildGrammarMiniTable(rightBottom?.table || {})}
    </div>
  `;
  layout.innerHTML = "";
  layout.appendChild(top);
  layout.appendChild(bottom);
}

function renderArticlePhrase(value) {
  if (typeof value === "string") {
    const parts = value.trim().split(/\s+/);
    const a = parts.shift() || "";
    const n = parts.join(" ");
    return `<span class="art">${escapeHtml(a)}</span> <span class="noun">${escapeHtml(n)}</span>`;
  }
  const article = value?.article ?? "";
  const noun = value?.noun ?? "";
  return `<span class="art">${escapeHtml(article)}</span> <span class="noun">${escapeHtml(noun)}</span>`;
}

function buildArticlesCard(art) {
  if (!art) return;
  const titleEl = document.getElementById("artTitle");
  if (titleEl) titleEl.textContent = art.title || "";
  const subEl = document.getElementById("artSub");
  if (subEl) subEl.textContent = art.subtitle || "";
  const root = document.getElementById("artTable");
  if (!root) return;
  root.innerHTML = "";
  const head = document.createElement("div");
  head.className = "art-head";
  const columns = Array.isArray(art.columns) ? art.columns : [];
  head.innerHTML = `
    <div class="art-hlabel"></div>
    ${columns
      .map((col) => {
        const label = typeof col === "string" ? col : col.label || "";
        return `
          <div class="art-col">
            <div class="art-top">${escapeHtml(label)}</div>
            <div class="art-underline"></div>
          </div>
        `;
      })
      .join("")}
  `;
  root.appendChild(head);
  const rows = Array.isArray(art.rows) ? art.rows : [];
  rows.forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "art-row";
    rowEl.innerHTML = `
      <div class="art-rlabel">${escapeHtml(row.label)}</div>
      ${Array.isArray(row.values)
        ? row.values
            .map(
              (val) => `
                <div class="art-cell">
                  <div class="art-text">${renderArticlePhrase(val)}</div>
                  <div class="art-underline"></div>
                </div>
              `
            )
            .join("")
        : ""}
    `;
    root.appendChild(rowEl);
  });
}

function renderPossValue(v) {
  if (typeof v === "string") return escapeHtml(v);
  if (v && (v.base !== undefined || v.suffix !== undefined)) {
    const base = v.base ?? "";
    const suffix = v.suffix ?? "";
    return `${escapeHtml(base)}<span class="ending">${escapeHtml(suffix)}</span>`;
  }
  const text = v?.text ?? "";
  const highlight = v?.highlight ?? "";
  if (!highlight) return escapeHtml(text);
  const safeText = String(text);
  const idx = safeText.indexOf(highlight);
  if (idx === -1) return escapeHtml(text);
  return (
    escapeHtml(safeText.slice(0, idx)) +
    `<span class="ending">${escapeHtml(highlight)}</span>` +
    escapeHtml(safeText.slice(idx + highlight.length))
  );
}

function buildPossessivesCard(pos) {
  if (!pos) return;
  const titleEl = document.getElementById("posTitle");
  if (titleEl) titleEl.textContent = pos.title || "";
  const subEl = document.getElementById("posSub");
  if (subEl) subEl.textContent = pos.subtitle || "";
  const root = document.getElementById("posTable");
  if (!root) return;
  root.innerHTML = "";
  const head = document.createElement("div");
  head.className = "pos-head";
  head.innerHTML = `
    <div class="pos-hlabel"></div>
    ${Array.isArray(pos.columns)
      ? pos.columns
          .map(
            (c) => `
              <div class="pos-col">
                <div class="pos-top">${escapeHtml(c.label || "")}</div>
                ${
                  c.example
                    ? `<div class="pos-ex">${escapeHtml(c.example)}</div>`
                    : ""
                }
                <div class="pos-underline"></div>
              </div>
            `
          )
          .join("")
      : ""}
  `;
  root.appendChild(head);
  (pos.rows || []).forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "pos-row";
    rowEl.innerHTML = `
      <div class="pos-rlabel">${escapeHtml(row.label)}</div>
      ${(row.values || [])
        .map(
          (v) => `
            <div class="pos-cell">
              <div class="pos-text">${renderPossValue(v)}</div>
              <div class="pos-underline"></div>
            </div>
          `
        )
        .join("")}
    `;
    root.appendChild(rowEl);
  });
}

function buildConnectorTable(t) {
  const cols = t.columns || [];
  const rows = t.rows || [];
  return `
    <div class="con-table">
      <div class="con-head">
        ${cols
          .map(
            (c) => `
          <div class="con-h">
            <div class="con-htext">${escapeHtml(c)}</div>
            <div class="con-line"></div>
          </div>
        `
          )
          .join("")}
      </div>

      <div class="con-body">
        ${rows
          .map(
            (r) => `
          <div class="con-row">
            ${cols
              .map((_, i) => {
                const cell = r[i] ?? "";
                return `
                  <div class="con-cell">
                    <div class="con-text">${escapeHtml(cell)}</div>
                    <div class="con-line"></div>
                  </div>
                `;
              })
              .join("")}
          </div>
        `
          )
          .join("")}
      </div>
    </div>
  `;
}

function buildConnectorsCard(con) {
  if (!con) return;
  const titleEl = document.getElementById("conTitle");
  if (titleEl) titleEl.textContent = con.title || "";
  const subEl = document.getElementById("conSub");
  if (subEl) subEl.textContent = con.subtitle || "";
  const root = document.getElementById("conWrap");
  if (!root) return;
  root.innerHTML = `
    <div class="con-grid">
      <div class="con-side">
        ${buildConnectorTable(con.left)}
      </div>
      <div class="con-side">
        ${buildConnectorTable(con.right)}
      </div>
    </div>
  `;
}


function renderAccentTextPart(part) {
  if (typeof part === "string") return escapeHtml(part);
  const text = part?.text ?? "";
  const accent = part?.accent ? " hs-accent" : "";
  return `<span class="hs-t${accent}">${escapeHtml(text)}</span>`;
}

function renderAccentTextLine(parts) {
  return (parts || []).map(renderAccentTextPart).join("");
}

function renderCellValue(v) {
  if (typeof v === "string") return `<span class="hs-t">${escapeHtml(v)}</span>`;
  const text = v?.text ?? "";
  const accent = v?.accent ? " hs-accent" : "";
  return `<span class="hs-t${accent}">${escapeHtml(text)}</span>`;
}

function buildHabenSeinPack(pack) {
  if (!pack) return;
  document.getElementById("hsTitle").textContent = pack.title || "";
  const t = pack.table || {};
  const rows = t.rows || [];
  const groups = t.groups || [];
  const root = document.getElementById("hsTable");
  if (!root) return;
  root.innerHTML = "";

  const h1 = document.createElement("div");
  h1.className = "hs-row hs-row--h1";
  h1.innerHTML = `
    <div class="hs-cell hs-cell--p"></div>
    <div class="hs-cell hs-cell--g" style="grid-column: span 2">
      <div class="hs-gh">${escapeHtml(groups[0]?.label || "")}</div>
      <div class="hs-line"></div>
    </div>
    <div class="hs-cell hs-cell--g" style="grid-column: span 2">
      <div class="hs-gh">${escapeHtml(groups[1]?.label || "")}</div>
      <div class="hs-line"></div>
    </div>
  `;
  root.appendChild(h1);

  const h2 = document.createElement("div");
  h2.className = "hs-row hs-row--h2";
  h2.innerHTML = `
    <div class="hs-cell hs-cell--p"></div>
    <div class="hs-cell hs-cell--h">
      <div class="hs-h">${escapeHtml(groups[0]?.cols?.[0] || "Präsens")}</div>
      <div class="hs-line"></div>
    </div>
    <div class="hs-cell hs-cell--h">
      <div class="hs-h">${escapeHtml(groups[0]?.cols?.[1] || "Präteritum")}</div>
      <div class="hs-line"></div>
    </div>
    <div class="hs-cell hs-cell--h">
      <div class="hs-h">${escapeHtml(groups[1]?.cols?.[0] || "Präsens")}</div>
      <div class="hs-line"></div>
    </div>
    <div class="hs-cell hs-cell--h">
      <div class="hs-h">${escapeHtml(groups[1]?.cols?.[1] || "Präteritum")}</div>
      <div class="hs-line"></div>
    </div>
  `;
  root.appendChild(h2);

  rows.forEach((r) => {
    const row = document.createElement("div");
    row.className = "hs-row";
    row.innerHTML = `
      <div class="hs-cell hs-cell--p">
        <div class="hs-pn">${escapeHtml(r.p || "")}</div>
        <div class="hs-line"></div>
      </div>
      <div class="hs-cell">
        <div class="hs-v">${renderCellValue(r?.haben?.[0])}</div>
        <div class="hs-line"></div>
      </div>
      <div class="hs-cell">
        <div class="hs-v">${renderCellValue(r?.haben?.[1])}</div>
        <div class="hs-line"></div>
      </div>
      <div class="hs-cell">
        <div class="hs-v">${renderCellValue(r?.sein?.[0])}</div>
        <div class="hs-line"></div>
      </div>
      <div class="hs-cell">
        <div class="hs-v">${renderCellValue(r?.sein?.[1])}</div>
        <div class="hs-line"></div>
      </div>
    `;
    root.appendChild(row);
  });

  const s = pack.subjectOrder || {};
  document.getElementById("hsSubjTitle").textContent = s.title || "";
  document.getElementById("hsSubjText1").textContent = s.text1 || "";
  document.getElementById("hsSubjText2").textContent = s.text2 || "";

  const ex = document.getElementById("hsExamples");
  if (ex) {
    ex.innerHTML = `
      <div class="hs-excol">
        ${(s.left || []).map((x) => `<div class="hs-exline">${renderAccentTextLine(x.parts || [])}</div>`).join("")}
      </div>
      <div class="hs-excol">
        ${(s.right || []).map((x) => `<div class="hs-exline">${renderAccentTextLine(x.parts || [])}</div>`).join("")}
      </div>
    `;
  }

  const a = pack.accPronouns || {};
  document.getElementById("hsAccTitle").textContent = a.title || "";
  const acc = document.getElementById("hsAcc");
  if (acc) {
    const cols = a.columns || [];
    const rows = a.rows || [];
    acc.innerHTML = `
      <div class="hs-acc-head">
        ${cols.map((c) => `<div class="hs-acc-h"><div class="hs-acc-ht">${escapeHtml(c)}</div><div class="hs-line"></div></div>`).join("")}
      </div>
      <div class="hs-acc-body">
        ${rows.map((row) => `<div class="hs-acc-row">${row.map((cell) => `<div class="hs-acc-c"><div class="hs-acc-t">${escapeHtml(cell)}</div><div class="hs-line"></div></div>`).join("")}</div>`).join("")}
      </div>
    `;
  }
}

async function ensureGrammarContentLoaded() {
  const shell = document.getElementById("grammarShell");
  if (!shell) return;
  if (shell.dataset.grammarReady === "1") return;
  shell.innerHTML = `
    <main class=\"page\">
      <section class=\"card\" id=\"section-conjugation\">
        <h1 class=\"title title--green\" id=\"conjTitle\"></h1>
        <div class=\"conj-grid\" id=\"conjGrid\"></div>
      </section>
      <section class=\"card\" id=\"section-wordorder\">
        <h1 class=\"title title--green\" id=\"woTitle\"></h1>
        <div class=\"wo-layout\" id=\"woLayout\"></div>
      </section>
      <section class=\"card gram-card\" id=\"section-articles\">
        <h1 class=\"title title--green\" id=\"artTitle\"></h1>
        <p class=\"subtitle\" id=\"artSub\"></p>
        <div class=\"art-table\" id=\"artTable\"></div>
      </section>
      <section class=\"card gram-card\" id=\"section-possessive\">
        <h1 class=\"title title--green\" id=\"posTitle\"></h1>
        <p class=\"subtitle\" id=\"posSub\"></p>
        <div class=\"pos-table\" id=\"posTable\"></div>
      </section>
      <section class=\"card gram-card\" id=\"section-connectors\">
        <h1 class=\"title title--green\" id=\"conTitle\"></h1>
        <p class=\"subtitle\" id=\"conSub\"></p>
        <div class=\"con-wrap\" id=\"conWrap\"></div>
      </section>
      <section class=\"card\" id=\"section-habe-sein-pack\">
        <h1 class=\"title title--green\" id=\"hsTitle\"></h1>
        <div class=\"hs-table\" id=\"hsTable\"></div>
        <div class=\"hs-subject\">
          <h2 class=\"subtitle\" id=\"hsSubjTitle\"></h2>
          <p id=\"hsSubjText1\"></p>
          <div class=\"hs-examples\" id=\"hsExamples\"></div>
          <p id=\"hsSubjText2\"></p>
        </div>
        <div class=\"hs-accusative\">
          <h2 class=\"subtitle\" id=\"hsAccTitle\"></h2>
          <div class=\"hs-acc\" id=\"hsAcc\"></div>
        </div>
      </section>
    </main>
  `;
  let data = grammarContentState.data;
  if (!data) {
    const res = await fetch("/Grammar/data.json", { cache: "no-cache" });
    if (!res.ok) {
      throw new Error("Failed to load grammar data");
    }
    data = await res.json();
    grammarContentState.data = data;
  }
  buildGrammarConjugation(data.conjugation);
  buildGrammarWordOrder(data.wordOrder);
  buildArticlesCard(data.articles);
  if (data.possessives) buildPossessivesCard(data.possessives);
  if (data.connectors) buildConnectorsCard(data.connectors);
  buildHabenSeinPack(data.habeSeinPack);
  shell.dataset.grammarReady = "1";
  grammarContentState.ready = true;
}

function isListeningPracticeChannel(channelOrId) {
  if (!channelOrId) return false;
  const ch = typeof channelOrId === "string" ? getChannelById(channelOrId) : channelOrId;
  if (!ch) return false;
  if (typeof ch.id === "string" && ch.id.startsWith("dm:")) return false;
  const category = String(ch.category || "").trim().toLowerCase();
  if (category !== "tools") return false;
  const name = String(ch.name || "").trim().toLowerCase().replace(/\s+/g, " ");
  return name === "listening practice";
}

function isPolicyAcceptanceRequired() {
  if (!sessionUser) return false;
  if (!sessionUser.workspaceId) return false;
  if (isSuperAdmin()) return false;
  return true;
}

async function checkPolicyAcceptance() {
  policyRequired = isPolicyAcceptanceRequired();
  if (!policyRequired) {
    policyAccepted = true;
    return true;
  }
  if (policyCheckInFlight) return policyAccepted;
  policyCheckInFlight = true;
  try {
    const workspaceId = sessionUser?.workspaceId || currentWorkspaceId;
    const res = await fetchJSON(
      `/api/policy/acceptance?workspaceId=${encodeURIComponent(workspaceId || "")}`,
      { headers: { "x-user-id": getCurrentUserId() } }
    );
    policyAccepted = !!res?.accepted;
  } catch (err) {
    console.warn("Could not verify policy acceptance", err);
    policyAccepted = false;
  } finally {
    policyCheckInFlight = false;
  }
  return policyAccepted;
}

async function openPrivacyRulesChannel() {
  if (policyRedirecting) return;
  policyRedirecting = true;
  try {
    await openStaticChannel({
      dataset: { channelName: "Privacy & Rules", channelCategory: "tools" }
    });
  } finally {
    policyRedirecting = false;
  }
}

function renderPolicyAcceptanceCard(container) {
  if (!container || policyAccepted) return;
  const existing = container.querySelector(".policy-accept-card");
  if (existing) existing.remove();

  const card = document.createElement("div");
  card.className = "policy-accept-card";
  card.innerHTML = `
    <div class="policy-accept-title">Please review and accept the rules</div>
    <div class="policy-accept-text">
      You must accept the Privacy &amp; Rules before using the platform.
    </div>
    <label class="policy-accept-check">
      <input type="checkbox" />
      <span>I have read carefully, understand, and accept all rules.</span>
    </label>
    <label class="policy-accept-check">
      <input type="checkbox" />
      <span>
        I will not discuss harmful content, hate, or violence; I will not share political or illegal
        content; I will respect German law and will not commit any crime using this platform.
      </span>
    </label>
    <button type="button" class="policy-accept-btn" disabled>Accept &amp; Continue</button>
  `;

  const [check1, check2] = Array.from(card.querySelectorAll("input[type='checkbox']"));
  const btn = card.querySelector(".policy-accept-btn");
  const update = () => {
    const ready = !!check1?.checked && !!check2?.checked;
    btn.disabled = !ready;
  };
  if (check1) check1.addEventListener("change", update);
  if (check2) check2.addEventListener("change", update);
  update();

  btn.addEventListener("click", async () => {
    if (btn.disabled) return;
    const workspaceId = sessionUser?.workspaceId || currentWorkspaceId;
    try {
      btn.disabled = true;
      await fetchJSON("/api/policy/accept", {
        method: "POST",
        headers: { "x-user-id": getCurrentUserId() },
        body: JSON.stringify({ workspaceId, version: POLICY_VERSION })
      });
      policyAccepted = true;
      showToast("Thank you for accepting the rules.");
      renderMessages(currentChannelId);
      updateComposerForChannel(currentChannelId);
    } catch (err) {
      console.error("Failed to accept policy", err);
      showToast("Could not save acceptance. Please try again.");
      btn.disabled = false;
    }
  });

  container.appendChild(card);
}

function loadCurrentChannelId() {
  try {
    const stored = localStorage.getItem(CURRENT_CHANNEL_STORAGE_KEY);
    if (stored) currentChannelId = stored;
  } catch (err) {
    console.warn("Could not load current channel", err);
  }
}

function persistCurrentChannel() {
  try {
    localStorage.setItem(CURRENT_CHANNEL_STORAGE_KEY, currentChannelId);
  } catch (err) {
    console.warn("Could not save current channel", err);
  }
}

function loadLastView() {
  try {
    const raw = localStorage.getItem(LAST_VIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed) return null;
    const view = {
      ...parsed,
      channelId: parsed.channelId ? String(parsed.channelId) : null,
      threadChannelId: parsed.threadChannelId ? String(parsed.threadChannelId) : null,
      threadMessageId: parsed.threadMessageId ? String(parsed.threadMessageId) : null
    };

    if (
      view.channelId &&
      !findChannelById(view.channelId) &&
      !isDmChannel(view.channelId)
    ) {
      localStorage.removeItem(LAST_VIEW_STORAGE_KEY);
      return null;
    }

    return view;
  } catch (err) {
    console.warn("Could not load last view", err);
    return null;
  }
}

function persistLastView(state = {}) {
  try {
    const channelId = state.channelId
      ? String(state.channelId)
      : currentChannelId
      ? String(currentChannelId)
      : null;
    const viewMode =
      state.viewMode ||
      (directoryViewRole
        ? "directory"
        : isDmChannel(channelId || "") ? "dm" : "channel");
    const directoryRole =
      viewMode === "directory"
        ? state.directoryRole || directoryViewRole || null
        : null;
    const payload = {
      v: 1,
      channelId,
      threadMessageId: state.threadMessageId ? String(state.threadMessageId) : null,
      threadChannelId: state.threadChannelId ? String(state.threadChannelId) : null,
      viewMode,
      directoryRole
    };
    localStorage.setItem(LAST_VIEW_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn("Could not save last view", err);
  }
}

function loadScrollState() {
  try {
    const raw = localStorage.getItem(SCROLL_STATE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn("Could not load scroll state", err);
    return {};
  }
}

function persistScrollState(map) {
  try {
    localStorage.setItem(SCROLL_STATE_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn("Could not save scroll state", err);
  }
}

function loadScrollAnchors() {
  try {
    const raw = localStorage.getItem(SCROLL_ANCHOR_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn("Could not load scroll anchors", err);
    return {};
  }
}

function persistScrollAnchors(map) {
  try {
    localStorage.setItem(SCROLL_ANCHOR_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn("Could not save scroll anchors", err);
  }
}

function loadSidebarScroll() {
  try {
    const raw = localStorage.getItem(SIDEBAR_SCROLL_KEY);
    const val = raw ? Number(raw) : 0;
    return Number.isFinite(val) ? val : 0;
  } catch (err) {
    console.warn("Could not load sidebar scroll", err);
    return 0;
  }
}

function persistSidebarScroll(value) {
  try {
    localStorage.setItem(SIDEBAR_SCROLL_KEY, String(value || 0));
  } catch (err) {
    console.warn("Could not save sidebar scroll", err);
  }
}

function updateAdminButtonState() {
  const btn = document.querySelector(".app-rail-btn-admin");
  const isAdmin = isAdminUser();
  const isSuper = isSuperAdmin();
  if (btn) {
    btn.hidden = false;
    btn.style.display = "grid";
    btn.disabled = false;
    btn.style.pointerEvents = "auto";
    btn.classList.toggle("rail-btn-disabled", !isAdmin);
  }

  if (addChannelBtn) {
    addChannelBtn.disabled = !isAdmin;
    addChannelBtn.style.pointerEvents = isAdmin ? "auto" : "none";
    addChannelBtn.title = isAdmin ? "Add channel" : "Admins only";
  }
  if (addConversationBtn) {
    addConversationBtn.disabled = !isAdmin;
    addConversationBtn.style.pointerEvents = isAdmin ? "auto" : "none";
    addConversationBtn.title = isAdmin ? "Add channel" : "Admins only";
  }
  if (addExamGroupBtn) {
    addExamGroupBtn.disabled = !isAdmin;
    addExamGroupBtn.style.pointerEvents = isAdmin ? "auto" : "none";
    addExamGroupBtn.title = isAdmin ? "Add channel" : "Admins only";
  }
  if (addAppBtn) {
    addAppBtn.disabled = !isAdmin;
    addAppBtn.style.pointerEvents = isAdmin ? "auto" : "none";
    addAppBtn.title = isAdmin ? "Add channel" : "Admins only";
  }
  if (addDmBtn) {
    addDmBtn.disabled = !isAdmin;
    addDmBtn.style.pointerEvents = isAdmin ? "auto" : "none";
    addDmBtn.title = isAdmin ? "Start DM" : "Admins only";
  }
  if (workspaceAddBtn) {
    const canCreateWorkspace = isSuperAdmin();
    workspaceAddBtn.disabled = !canCreateWorkspace;
    workspaceAddBtn.style.pointerEvents = canCreateWorkspace ? "auto" : "none";
    workspaceAddBtn.title = canCreateWorkspace ? "Add workspace" : "Super admins only";
  }
  if (adminToolsSection) {
    adminToolsSection.hidden = !isAdmin;
  }
  const analyticsBtn = document.querySelector(".app-rail-btn-analytics");
  if (analyticsBtn) {
    analyticsBtn.disabled = !isAdmin;
    analyticsBtn.style.pointerEvents = isAdmin ? "auto" : "none";
    analyticsBtn.classList.toggle("rail-btn-disabled", !isAdmin);
    analyticsBtn.title = isAdmin ? "Analytics" : "Admins only";
  }
  if (superAdminQuickBtn) {
    superAdminQuickBtn.hidden = !isSuper;
    superAdminQuickBtn.style.display = isSuper ? "" : "none";
    superAdminQuickBtn.disabled = !isSuper;
    superAdminQuickBtn.style.pointerEvents = isSuper ? "auto" : "none";
  }
  updateStaticChannelMoreVisibility();
  updatePrivacyRulesNavVisibility();
  scheduleRailScrollControlsUpdate();

  // update footer user info
  const displayName =
    (sessionUser && (sessionUser.name || sessionUser.username || sessionUser.email)) ||
    "You";
  const initials = generateInitials(displayName) || "YOU";
  if (footerUserName) footerUserName.textContent = displayName;
  const footerAvatarSrc = getUserAvatarSrc(sessionUser, DEFAULT_AVATAR_DATA_URL);
  const footerAvatarContainer = footerUserInitials ? footerUserInitials.parentElement : null;
  if (footerAvatarContainer) {
    footerAvatarContainer.dataset.userId =
      (sessionUser && (sessionUser.userId || sessionUser.id || sessionUser.email)) || "";
    footerAvatarContainer.dataset.active = sessionUser ? "true" : "false";
  }
  applyAvatarToNode(
    footerAvatarContainer,
    initials,
    footerAvatarSrc,
    displayName,
    sessionUser?.role || ""
  );
  if (footerUserStatus) footerUserStatus.textContent = sessionUser ? "Available" : "Offline";

  if (railProfileAvatar) {
    const src = sessionUser && sessionUser.avatarUrl ? sessionUser.avatarUrl : "";
    if (src) {
      railProfileAvatar.src = src;
      railProfileAvatar.hidden = false;
      railProfileAvatar.style.display = "block";
      if (railProfileIcon) railProfileIcon.style.display = "none";
    } else {
      railProfileAvatar.hidden = true;
      railProfileAvatar.removeAttribute("src");
      railProfileAvatar.style.display = "none";
      if (railProfileIcon) railProfileIcon.style.display = "inline-block";
    }
  }

  if (schoolLogoProfileBadge && schoolLogoProfileBadgeImg) {
    const badgeSrc = sessionUser && sessionUser.avatarUrl ? sessionUser.avatarUrl : "";
    if (badgeSrc) {
      schoolLogoProfileBadgeImg.src = badgeSrc;
      schoolLogoProfileBadgeImg.hidden = false;
      if (schoolLogoProfileBadgeIcon) schoolLogoProfileBadgeIcon.style.display = "none";
    } else {
      schoolLogoProfileBadgeImg.hidden = true;
      schoolLogoProfileBadgeImg.removeAttribute("src");
      if (schoolLogoProfileBadgeIcon) schoolLogoProfileBadgeIcon.style.display = "inline-flex";
    }
    schoolLogoProfileBadge.hidden = false;
  }

  refreshProfilePopover();
}


function hidePageLoader() {
  const loader = document.getElementById("page-loader");
  if (!loader) return;
  loader.hidden = true;
  loader.style.display = "none";
}

function showPageLoader() {
  const loader = document.getElementById("page-loader");
  if (!loader) return;
  loader.hidden = false;
  loader.style.display = "flex";
}

window.addEventListener("load", hidePageLoader);
window.addEventListener("DOMContentLoaded", hidePageLoader);


function isUserActive(userId) {
  const currentId =
    (sessionUser && (sessionUser.userId || sessionUser.id || sessionUser.email)) || null;
  if (!userId || !currentId) return false;
  return String(currentId) === String(userId);
}

function resolveAvatarUrl(author, initials) {
  const key = (author || "").trim().toLowerCase();
  const init = (initials || "").trim().toUpperCase();

  const maybeMatchUser = (u) => {
    if (!u) return null;
    const candidates = [
      u.name,
      u.username,
      u.email,
      `${u.firstName || ""} ${u.lastName || ""}`.trim(),
      u.userId
    ]
      .filter(Boolean)
      .map((v) => String(v).trim().toLowerCase());

    if (key && candidates.includes(key)) return u.avatarUrl || null;
    const uInit =
      u.initials || generateInitials(u.name || `${u.firstName || ""} ${u.lastName || ""}`) || "";
    if (init && uInit.toUpperCase() === init) return u.avatarUrl || null;
    return null;
  };

  const findAvatarInList = (list) => {
    if (!Array.isArray(list)) return null;
    for (const u of list) {
      const found = maybeMatchUser(u);
      if (found) return found;
    }
    return null;
  };

  // user directory cache first (authoritative)
  const dirHit = findAvatarInList(userDirectoryCache);
  if (dirHit) return dirHit;

  // session user
  const sessionHit = maybeMatchUser(sessionUser);
  if (sessionHit) return sessionHit;

  // employees list
  const employeeHit = findAvatarInList(employees);
  if (employeeHit) return employeeHit;

  // admin users list
  const adminHit = findAvatarInList(adminUsers);
  if (adminHit) return adminHit;

  // DM members cache (flatten)
  const dmCacheHit = findAvatarInList(
    Object.values(dmMembersCache || {}).reduce((acc, arr) => acc.concat(arr || []), [])
  );
  if (dmCacheHit) return dmCacheHit;

  return null;
}

function resolveUserRole(author, initials) {
  const key = (author || "").trim().toLowerCase();
  const init = (initials || "").trim().toUpperCase();

  const maybeMatchUser = (u) => {
    if (!u) return null;
    const candidates = [
      u.name,
      u.username,
      u.email,
      `${u.firstName || ""} ${u.lastName || ""}`.trim(),
      u.userId
    ]
      .filter(Boolean)
      .map((v) => String(v).trim().toLowerCase());

    const role = u.role ? String(u.role).toLowerCase() : "";
    if (key && candidates.includes(key)) return role || null;
    const uInit =
      u.initials || generateInitials(u.name || `${u.firstName || ""} ${u.lastName || ""}`) || "";
    if (init && uInit.toUpperCase() === init) return role || null;
    return null;
  };

  const findRoleInList = (list) => {
    if (!Array.isArray(list)) return null;
    for (const u of list) {
      const found = maybeMatchUser(u);
      if (found) return found;
    }
    return null;
  };

  const dirHit = findRoleInList(userDirectoryCache);
  if (dirHit) return dirHit;

  const sessionHit = maybeMatchUser(sessionUser);
  if (sessionHit) return sessionHit;

  const employeeHit = findRoleInList(employees);
  if (employeeHit) return employeeHit;

  const adminHit = findRoleInList(adminUsers);
  if (adminHit) return adminHit;

  const dmCacheHit = findRoleInList(
    Object.values(dmMembersCache || {}).reduce((acc, arr) => acc.concat(arr || []), [])
  );
  if (dmCacheHit) return dmCacheHit;

  return null;
}

function getMessageRoleDisplay(msg, isMaterialsChannel = false, resolvedRoleRaw = null) {
  const raw =
    resolvedRoleRaw !== null
      ? resolvedRoleRaw
      : (msg && (msg.role || resolveUserRole(msg.author, msg.initials))) || "";
  const normalized = normalizeRole(raw);
  if (isMaterialsChannel) {
    if (normalized === "school_admin" || normalized === "super_admin") {
      return "admin";
    }
    if (normalized === "teacher") {
      return "teacher";
    }
    return "student";
  }
  return normalized || raw || "";
}

// ===================== RICH TEXT COMPOSER =====================

function syncEditorToTextarea() {
  if (!rteEditor || !messageInput) return;
  // Store HTML in the hidden textarea so existing code can use it
  messageInput.value = rteEditor.innerHTML.trim();
}

function loadTextareaToEditor() {
  if (!rteEditor || !messageInput) return;
  rteEditor.innerHTML = messageInput.value || "";
}

async function ensureMessagesForChannelId(channelId) {
  if (!channelId) return;
  if (isAnnouncementChannel(channelId)) {
    if (announcementsByChannel[channelId]) return;
    try {
      const rows = await fetchJSON(`/api/channels/${encodeURIComponent(channelId)}/announcements`);
      const normalized = Array.isArray(rows) ? rows : [];
      normalized.forEach((announcement) => {
        if (announcement.readByUser) {
          userReadAnnouncements.add(String(announcement.id || ""));
        }
      });
      announcementsByChannel[channelId] = sortAnnouncementsByDate(normalized);
    } catch (err) {
      console.error("Failed to load announcements for channel", channelId, err);
      announcementsByChannel[channelId] = [];
    }
    return;
  }
  if (messagesByChannel[channelId]) return;
  if (isDmChannel(channelId)) {
    const dmId = dmIdFromChannel(channelId);
    if (!dmId) return;
    const msgs = await fetchJSON(`/api/dms/${dmId}/messages`, {
      headers: { "x-user-id": getCurrentUserId() }
    });
    messagesByChannel[channelId] = msgs;
  } else {
    const msgs = await fetchJSON(`/api/channels/${channelId}/messages`);
    messagesByChannel[channelId] = msgs;
  }
}

function updatePrivacyRulesNavVisibility() {
  const appPrivacyItem = document.querySelector(
    '#appsContainer .sidebar-item[data-channel-name="Privacy & Rules"]'
  );
  const adminPrivacyItem = document.getElementById("openPrivacyRules");
  const showAdmin = isAdminUser();
  if (appPrivacyItem) {
    appPrivacyItem.style.display = showAdmin ? "none" : "";
  }
  if (adminPrivacyItem) {
    adminPrivacyItem.style.display = showAdmin ? "" : "none";
  }
}

function summarizeText(t = "") {
  if (!t) return "";
  const clean = t.replace(/<[^>]+>/g, "").trim();
  if (clean.length <= 120) return clean;
  return clean.slice(0, 117) + "...";
}

function channelLabel(channelId) {
  if (isDmChannel(channelId)) {
    const dmId = dmIdFromChannel(channelId);
    const dm = dmId ? getDmById(dmId) : null;
    return dm ? dmDisplayName(dm) : "DM";
  }
  const ch = getChannelById(channelId);
  return ch ? `#${ch.name}` : channelId;
}

function resolveChannelName(channelId) {
  return channelLabel(channelId);
}

function refreshMessageBadge() {
  const total = Array.from(unreadState.values()).reduce(
    (sum, u) => sum + (Number(u.count) || 0),
    0
  );
  setMessageBadgeCount(total);
}

function hydrateUnreadStateFromMessages() {
  const allChannelIds = [
    ...(channels || []).map((c) => c.id),
    ...(dms || []).map((dm) => `dm:${dm.id}`)
  ].filter(Boolean);

  allChannelIds.forEach((cid) => {
    const key = String(cid);
    if (unreadState.has(key)) return;
    const msgs = messagesByChannel[key] || [];
    const lastIdx =
      typeof lastReadIndexByChannel[key] === "number" ? lastReadIndexByChannel[key] : -1;
    const unread = msgs.slice(lastIdx + 1);
    if (!unread.length || isChannelMuted(key)) return;
    const lastMsg = unread[unread.length - 1] || {};
    unreadState.set(key, {
      count: unread.length,
      mentionCount: 0,
      lastMsgId: lastMsg.id || null,
      lastText: stripHtmlToText(lastMsg.text || lastMsg.body || "").slice(0, 140),
      lastTime: lastMsg.time || lastMsg.timestamp || lastMsg.createdAt || "",
      lastTs: Number(lastMsg.timestamp || lastMsg.createdAt || Date.now())
    });
  });

  refreshMessageBadge();
}

function bumpUnread(channelId, msg, { mention = false } = {}) {
  const id = String(channelId || "");
  if (!id) return;
  const cur =
    unreadState.get(id) || {
      count: 0,
      mentionCount: 0,
      lastMsgId: null,
      lastText: "",
      lastTime: "",
      lastTs: 0
    };
  cur.count += 1;
  if (mention) cur.mentionCount += 1;
  cur.lastMsgId = msg?.id ?? cur.lastMsgId;
  cur.lastText = stripHtmlToText(msg?.text || msg?.body || cur.lastText || "").slice(0, 140);
  cur.lastTime = msg?.time || msg?.timestamp || msg?.createdAt || cur.lastTime || "";
  cur.lastTs = Number(msg?.timestamp || msg?.createdAt || Date.now());
  unreadState.set(id, cur);
  refreshMessageBadge();
}

function clearUnread(channelId) {
  if (!channelId) return;
  unreadState.delete(String(channelId));
  refreshMessageBadge();
}

function getSidebarItemEls(channelId) {
  const els = [];
  if (!channelId) return els;
  if (isDmChannel(channelId)) {
    const dmId = dmIdFromChannel(channelId);
    if (!dmId) return els;
    els.push(...document.querySelectorAll(`#dmsContainer [data-dm-id="${CSS.escape(String(dmId))}"]`));
    if (!els.length) {
      els.push(...document.querySelectorAll(`[data-dm-id="${CSS.escape(String(dmId))}"]`));
    }
    return els;
  }
  const selector = `[data-channel-id="${CSS.escape(String(channelId))}"]`;
  els.push(...document.querySelectorAll(`#channelsContainer ${selector}`));
  els.push(...document.querySelectorAll(`#announcementsContainer ${selector}`));
  els.push(...document.querySelectorAll(`#conversationClubContainer ${selector}`));
  els.push(...document.querySelectorAll(`#conversationClubChannels ${selector}`));
  els.push(...document.querySelectorAll(`#examGroupsChannels ${selector}`));
  els.push(...document.querySelectorAll(`#appsChannelsContainer ${selector}`));
  els.push(...document.querySelectorAll(`#starredList ${selector}`));
  if (!els.length) {
    els.push(...document.querySelectorAll(selector));
  }
  return els;
}

function markSidebarUnread(channelId, mentionCount = 0) {
  const els = getSidebarItemEls(channelId);
  if (!els.length) return;
  const state = unreadState.get(String(channelId));
  const count = state?.count || getUnreadCount(channelId) || 0;
  const mentions = mentionCount || state?.mentionCount || 0;
  els.forEach((el) => {
    el.classList.add("sidebar-item-unread");
    let pill = el.querySelector(".sidebar-item-unread-pill, .sidebar-mention-pill");
    if (!pill) {
      pill = document.createElement("span");
      pill.className = "sidebar-item-unread-pill";
      const meta = el.querySelector(".sidebar-item-meta");
      if (meta) {
        meta.prepend(pill);
      } else {
        el.appendChild(pill);
      }
    }
    pill.textContent = mentions > 0 ? `@${mentions}` : count > 99 ? "99+" : String(count || 1);
    pill.className = mentions > 0 ? "sidebar-mention-pill" : "sidebar-item-unread-pill";
  });
}

function clearSidebarUnread(channelId) {
  const els = getSidebarItemEls(channelId);
  if (!els.length) return;
  els.forEach((el) => {
    el.classList.remove("sidebar-item-unread");
    const pill = el.querySelector(".sidebar-item-unread-pill, .sidebar-mention-pill");
    if (pill) pill.remove();
  });
}

function renderAllUnreads() {
  if (!allUnreadsList) return;
  hydrateUnreadStateFromMessages();

  const items = Array.from(unreadState.entries())
    .map(([channelId, u]) => ({ channelId, ...u }))
    .filter((u) => !isChannelMuted(u.channelId) || (u.mentionCount || 0) > 0)
    .sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));

  if (!items.length) {
    allUnreadsList.innerHTML = `<div style="opacity:.6;font-weight:700;padding:10px;">No unread messages</div>`;
    return;
  }

  allUnreadsList.innerHTML = items
    .map((u) => {
      const chanName = resolveChannelName?.(u.channelId) || `#${u.channelId}`;
      const pill = u.mentionCount > 0
        ? `<span class="unread-pill">@${u.mentionCount}</span>`
        : `<span class="unread-pill">${u.count}</span>`;

      return `
      <div class="unread-card" data-channel="${escapeHtml(u.channelId)}" data-mid="${escapeHtml(u.lastMsgId || "")}">
        <div class="u-top">
          <div class="u-chan">${escapeHtml(chanName)} ${pill}</div>
          <div class="u-meta">${escapeHtml(u.lastTime || "")}</div>
        </div>
        <div class="u-text">${escapeHtml(u.lastText || "(no preview)")}</div>
      </div>
    `;
    })
    .join("");

  allUnreadsList.querySelectorAll(".unread-card").forEach((card) => {
    card.addEventListener("click", async () => {
      const channelId = card.getAttribute("data-channel");
      const mid = card.getAttribute("data-mid");
      if (channelId) {
        await switchToChannel(channelId);
      }
      closeAllUnreads();
      if (mid) setTimeout(() => scrollToMessageInChat?.(mid), 250);
    });
  });
}

async function switchToChannel(channelId) {
  if (!channelId) return;
  if (isDmChannel(channelId)) {
    const dmId = dmIdFromChannel(channelId);
    if (dmId) await selectDM(dmId);
  } else {
    await selectChannel(channelId);
  }
}

async function collectUnreadMessages() {
  const results = [];
  const allChannelIds = [
    ...(channels || []).map((c) => c.id),
    ...(dms || []).map((dm) => `dm:${dm.id}`)
  ].filter(Boolean);

  for (const cid of allChannelIds) {
    try {
      await ensureMessagesForChannelId(cid);
    } catch (err) {
      console.warn("Failed to load messages for", cid, err);
      continue;
    }
    const msgs = messagesByChannel[cid] || [];
    const lastIdx =
      typeof lastReadIndexByChannel[cid] === "number" ? lastReadIndexByChannel[cid] : -1;
    const unread = msgs.slice(lastIdx + 1);
    unread.forEach((msg) => {
      results.push({
        channelId: cid,
        message: msg
      });
    });
  }

  // sort newest first if timestamp exists
  results.sort((a, b) => {
    const ta = Number(a.message.timestamp || a.message.createdAt || 0);
    const tb = Number(b.message.timestamp || b.message.createdAt || 0);
    return tb - ta;
  });

  return results;
}

async function openAllUnreads() {
  if (allUnreadsView) {
    renderAllUnreads();
    allUnreadsView.hidden = false;
    const chatFeed = document.querySelector("#chatPanel .chat-panel");
    if (chatFeed) chatFeed.hidden = true;
    return;
  }

  if (!unreadsOverlay || !unreadsList) return;
  unreadsList.innerHTML = "<div class='muted' style='padding:8px 12px;'>Loading…</div>";
  unreadsOverlay.classList.remove("hidden");
  const items = await collectUnreadMessages();
  unreadsList.innerHTML = "";

  const channelUnreadCount = {};
  items.forEach((item) => {
    channelUnreadCount[item.channelId] = (channelUnreadCount[item.channelId] || 0) + 1;
  });

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.style.padding = "10px 12px";
    empty.textContent = "You’re all caught up.";
    unreadsList.appendChild(empty);
    setMessageBadgeCount(0);
    return;
  }

  setMessageBadgeCount(items.length);

  items.forEach((entry) => {
    const { channelId, message } = entry;
    const row = document.createElement("div");
    row.className = "unread-item";

    const avatar = document.createElement("div");
    avatar.className = "avatar avatar-sm";
    setAvatarPresence(
      avatar,
      message.userId || message.authorId || message.user_id || "",
      message.author
    );
    const unreadRole = message.role || resolveUserRole(message.author, message.initials);
    applyAvatarToNode(
      avatar,
      message.initials,
      message.avatarUrl,
      message.author,
      unreadRole
    );

    const body = document.createElement("div");
    const meta = document.createElement("div");
    meta.className = "employee-meta";
    meta.className = "unread-meta";

    const chLabel = document.createElement("span");
    chLabel.className = "unread-channel";
    chLabel.textContent = channelLabel(channelId);
    const author = document.createElement("span");
    author.className = "unread-author";
    author.textContent = message.author || "Unknown";
    const time = document.createElement("span");
    time.textContent = message.time || message.timestamp || "";

    meta.appendChild(chLabel);
    meta.appendChild(author);
    if (time.textContent) meta.appendChild(time);

    const text = document.createElement("div");
    text.className = "unread-text";
    text.textContent = summarizeText(message.text || "");

    body.appendChild(meta);
    body.appendChild(text);

    const countPill = document.createElement("span");
    countPill.className = "unread-count-pill";
    countPill.textContent = channelUnreadCount[channelId] || 1;

    row.appendChild(avatar);
    row.appendChild(body);
    row.appendChild(countPill);

    row.addEventListener("click", async () => {
      closeAllUnreads();
      if (isDmChannel(channelId)) {
        const dmId = dmIdFromChannel(channelId);
        await selectDM(dmId);
      } else {
        await selectChannel(channelId);
      }
      scrollToMessage(message.id);
    });

    unreadsList.appendChild(row);
  });
}

function closeAllUnreads() {
  if (allUnreadsView) {
    allUnreadsView.hidden = true;
    const chatFeed = document.querySelector("#chatPanel .chat-panel");
    if (chatFeed) chatFeed.hidden = false;
  }
  if (unreadsOverlay) unreadsOverlay.classList.add("hidden");
}

function onIncomingMessage(msg) {
  const chan =
    (msg && (msg.channelId || msg.channel_id)) ||
    (msg && msg.dmId ? `dm:${msg.dmId}` : "");
  const channelId = String(chan || "");
  if (!channelId) return;

  if (String(currentChannelId) !== channelId) {
    const mention = !!(msg && msg.mentionsMe);
    if (!isChannelMuted(channelId) || mention) {
      bumpUnread(channelId, msg, { mention });
      const state = unreadState.get(channelId);
      const mentionPill = mention ? state?.mentionCount || 1 : 0;
      markSidebarUnread(channelId, mentionPill);
    }
  }

  if (allUnreadsView && !allUnreadsView.hidden) renderAllUnreads();
}

function setActiveRailButton(btn) {
  document.querySelectorAll(".app-rail-btn").forEach((b) => {
    b.classList.remove("app-rail-btn-active");
  });
  if (btn) btn.classList.add("app-rail-btn-active");
}


function hideFilesPanel() {
  const p = document.getElementById("filesPanel");
  if (p) p.classList.add("hidden");
}

function openHomePanel() {
  hideFilesPanel();
  showPanel("chatPanel");
}

function openAiAssistant() {
  showPanel("aiPanel");

  if (headerChannelName) headerChannelName.textContent = "AI Assistant";
  if (headerChannelTopic) {
    headerChannelTopic.textContent = "Ask questions, summarize chats, or draft replies.";
  }
  if (headerChannelPrivacy) headerChannelPrivacy.textContent = "Assistant";
  const iconEl = document.querySelector(".channel-type-icon i");
  if (iconEl) iconEl.className = "fa-solid fa-robot";
  const defaultTab = aiTabs?.querySelector(".ai-tab.is-active");
  aiMode = defaultTab?.getAttribute("data-ai-mode") || "assistant";
  renderAiActions();
  updateAiContextBlock();
}

function showHomeView() {
  isHomeView = false;
  try {
    localStorage.setItem(LAST_ACTIVE_VIEW_KEY, "chatPanel");
  } catch (err) {
    /* ignore */
  }
  openHomePanel();
  // jump to the first channel by default when going Home
  const firstChannelId = channels && channels[0] && channels[0].id ? channels[0].id : null;
  const targetId = firstChannelId || currentChannelId;
  if (targetId) {
    selectChannel(targetId);
  }
}

function appendAiBubble(role, text) {
  if (!aiMessages) return;
  const row = document.createElement("div");
  row.className = `ai-row ai-row-${role}`;
  const bubble = document.createElement("div");
  bubble.className = `ai-bubble ai-bubble-${role}`;
  bubble.textContent = text;
  row.appendChild(bubble);
  aiMessages.appendChild(row);
  aiMessages.scrollTop = aiMessages.scrollHeight;
}

function sanitizeAiReplyText(value) {
  if (!value) return "";
  return value.replace(/^\s*\*\s+/gm, "• ").replace(/\n\s*\*\s+/gm, "\n• ");
}


function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTypewriterDone(state, maxMs = 8000) {
  const start = Date.now();
  while ((state.isTyping || (state.queue && state.queue.length)) && (Date.now() - start < maxMs)) {
    await sleep(20);
  }
}

async function typeIntoBubble({ bubble, text, state }) {
  if (!bubble || !text) return;
  // ✅ Remove "Thinking…" label once real text starts
  const thinkingEl = bubble.querySelector(".ai-thinking, .ai-typing, .thinking");
  if (thinkingEl) thinkingEl.remove();
  const thinkingEls = bubble.querySelectorAll(".ai-typing, .ai-thinking-line");
  if (thinkingEls.length && !state.textEl) {
    thinkingEls.forEach((el) => el.remove());
  }
  state.queue += text;

  if (state.isTyping) return; // will wait for completion near sendAiMessage
  state.isTyping = true;

  if (!state.textEl) {
    const meta = bubble.querySelector(".ai-meta");
    bubble.innerHTML = "";
    if (meta) bubble.appendChild(meta);

    const textEl = document.createElement("div");
    textEl.style.whiteSpace = "pre-wrap";
    bubble.appendChild(textEl);

    const caret = document.createElement("span");
    caret.className = "ai-caret";
    caret.textContent = "▍";
    bubble.appendChild(caret);

    state.textEl = textEl;
    state.caretEl = caret;
  }

  while (state.queue.length) {
    const slice = state.queue.slice(0, 6);
    state.queue = state.queue.slice(6);

    state.full += slice;
    const sanitized = sanitizeAiReplyText(state.full);
    state.textEl.textContent = sanitized;

    if (aiMessages) aiMessages.scrollTop = aiMessages.scrollHeight;

    await sleep(12);
  }

  state.isTyping = false;
}

function appendAiStreamingBubble() {
  const host = document.getElementById("aiMessages");
  if (!host) return null;

  const row = document.createElement("div");
  row.className = "ai-row ai-row-assistant";

  const bubble = document.createElement("div");
  bubble.className = "ai-bubble ai-bubble-assistant ai-bubble-thinking";

  bubble.innerHTML = `
    <div class="ai-typing" aria-label="AI is thinking">
      <span class="ai-dot"></span>
      <span class="ai-dot"></span>
      <span class="ai-dot"></span>
    </div>
  `;

  row.appendChild(bubble);
  host.appendChild(row);
  host.scrollTop = host.scrollHeight;

  return bubble;
}

// ---------- AI PANEL UX ----------
function getSchoolRole() {
  if (typeof isAdminUser === "function" && isAdminUser()) return "teacher";
  return "student";
}

function getAiExplicitRole() {
  const bucket = getUserRoleBucket(sessionUser);
  if (bucket) return bucket;
  if (sessionUser && sessionUser.role) return String(sessionUser.role).toLowerCase();
  if (sessionUser && sessionUser.userRole) return String(sessionUser.userRole).toLowerCase();
  if (isAdminUser()) return "admin";
  return "student";
}

function buildAiUserContext() {
  if (!sessionUser) return null;
  const role = getAiExplicitRole();
  return {
    id: String(sessionUser.userId || sessionUser.id || sessionUser.email || sessionUser.username || "anon"),
    displayName: sessionUser.name || sessionUser.username || sessionUser.email || "User",
    email: sessionUser.email || "",
    role,
    workspaceId:
      sessionUser.workspaceId ||
      currentWorkspaceId ||
      (sessionUser.workspace && sessionUser.workspace.id) ||
      "" ,
    workspaceName:
      sessionUser.workspace?.name ||
      sessionUser.workspaceName ||
      sessionUser.workspace?.title ||
      sessionUser.workspaceTitle ||
      "",
    status: sessionUser.status || sessionUser.presence || "available"
  };
}


const aiTemplates = {
  assistant: [
    { title: "Explain a topic", desc: "Step-by-step breakdown.", prompt: "Explain this topic step by step:\n" },
    { title: "Summarize notes", desc: "Short summary + key points.", prompt: "Summarize these notes and list key points:\n" },
    { title: "Make practice questions", desc: "Questions with answers.", prompt: "Create 10 practice questions with answers about:\n" }
  ],
  planner: {
    student: [
      { title: "What should I study today?", desc: "Use your calendar deadlines.", prompt: "Based on my upcoming deadlines, what should I study today? Suggest a plan.\n" },
      { title: "Study plan for this week", desc: "Detailed daily tasks.", prompt: "Create a 7-day study plan based on my schedule.\n" },
      { title: "Balance workload", desc: "Focus + rest.", prompt: "Help me balance homework and exams this week.\n" }
    ],
    teacher: [
      { title: "Plan my teaching week", desc: "Lessons + grading.", prompt: "Plan my upcoming teaching week with prep and grading slots.\n" },
      { title: "Assignment pacing", desc: "Avoid overload.", prompt: "Suggest a pacing plan so students avoid overloaded deadlines.\n" },
      { title: "Parent message draft", desc: "Professional tone.", prompt: "Draft a short parent message about upcoming assessments and expectations.\n" }
    ]
  },
  classroom: {
    teacher: [
      { title: "Lesson plan", desc: "45–60 min plan.", prompt: "Create a 45-minute lesson plan.\nSubject:\nGrade:\nTopic:\nObjectives:\nMaterials:\n" },
      { title: "Quiz generator", desc: "Mixed difficulty + answers.", prompt: "Generate a 10-question quiz with answers.\nTopic:\nGrade:\n" },
      { title: "Give feedback", desc: "Kind + actionable.", prompt: "Give feedback on student work with warmth and specificity.\n" }
    ],
    student: [
      { title: "Flashcards", desc: "Q/A from notes.", prompt: "Turn these notes into flashcards with Q/A:\n" },
      { title: "Exam-style questions", desc: "Practice with answers.", prompt: "Create exam-style questions with answers for:\n" },
      { title: "Explain mistakes", desc: "Correct reasoning.", prompt: "Explain why this answer is wrong and show the right steps:\n" }
    ]
  }
};

function renderAiActions() {
  if (!aiActionsContainer) return;
  const role = getSchoolRole();
  let actions = [];
  if (aiMode === "assistant") actions = aiTemplates.assistant;
  else if (aiMode === "planner") actions = aiTemplates.planner[role] || [];
  else if (aiMode === "classroom") actions = aiTemplates.classroom[role] || [];

  aiActionsContainer.innerHTML = actions
    .map((action) => `
      <button class="ai-action" type="button" data-ai-prompt="${escapeHtml(action.prompt)}">
        <h4>${escapeHtml(action.title)}</h4>
        <p>${escapeHtml(action.desc)}</p>
      </button>
    `)
    .join("");

  aiActionsContainer.querySelectorAll(".ai-action").forEach((btn) => {
    btn.addEventListener("click", () => {
      const prompt = btn.getAttribute("data-ai-prompt") || "";
      if (!aiInput) return;
      aiInput.value = prompt;
      aiInput.focus();
    });
  });
}

  async function sendAiMessage() {
  if (!aiInput) return;
  const text = (aiInput.value || "").trim();

  if (!text) {
    const fallback = aiTemplates[aiMode]?.[0]?.prompt;
    if (fallback) {
      aiInput.value = fallback;
      aiInput.focus();
    }
    return;
  }

  const userContext = buildAiUserContext();
  const payloadContext = userContext ? { user: userContext } : {};

  if (aiActiveController) {
    try {
      aiActiveController.abort();
    } catch (_e) {}
    aiActiveController = null;
  }

  appendAiBubble("user", text);
  aiInput.value = "";

  const sendBtn = document.getElementById("aiSendBtn");
  const stopBtn = document.getElementById("aiStopBtn");
  const prevSendHTML = sendBtn ? sendBtn.innerHTML : null;
  if (sendBtn) {
    sendBtn.disabled = true;
  }
  if (stopBtn) stopBtn.disabled = false;

  const useContext = !!aiContextbarToggle?.checked;
  if (useContext && aiContext !== "none") {
    const calendarEvents = (Array.isArray(calEventsCache) ? calEventsCache : []).slice(0, 60);
    const mappedCalendar = calendarEvents.map((e) => ({
      id: e.id,
      title: e.title || e.name || "",
      date: e.date || "",
      startTime: e.startTime || e.startsAt || "",
      endTime: e.endTime || "",
      location: e.location || "",
      notes: e.notes || "",
      category: e.category || e.type || ""
    }));

    if (aiContext === "calendar") {
      payloadContext.calendar = mappedCalendar;
      payloadContext.selectedDate = calSelected || null;
      payloadContext.viewMode = calViewMode || null;
    }

    if (aiContext === "chat") {
      const currentMessages = messagesByChannel[currentChannelId] || [];
      payloadContext.channelId = currentChannelId || null;
      payloadContext.dmId = currentDmId || null;
      payloadContext.recentMessages = currentMessages.slice(-30).map((m) => ({
        from: m.author || m.user || "unknown",
        text: m.text || m.body || ""
      }));
      payloadContext.calendar = mappedCalendar;
    }

    if (aiContext === "none") {
      payloadContext.calendar = mappedCalendar;
    }
  }

  const aiRole = getAiExplicitRole();
  if (aiRole === "admin") {
    const analyticsSnapshot = getAnalyticsContextSnapshot();
    if (analyticsSnapshot) payloadContext.analytics = analyticsSnapshot;
  }
  const finalContext = Object.keys(payloadContext).length ? payloadContext : null;
  const existingThinking = document.querySelector(".ai-bubble-assistant .ai-typing");
  if (existingThinking && aiActiveController) return;
  const bubble = appendAiStreamingBubble();
  const state = { queue: "", full: "", isTyping: false, textEl: null, caretEl: null };

  const controller = new AbortController();
  aiActiveController = controller;

  if (stopBtn && !stopBtn.dataset.bound) {
    stopBtn.dataset.bound = "1";
    stopBtn.addEventListener("click", () => {
      if (aiActiveController) {
        try {
          aiActiveController.abort();
        } catch (_e) {}
        aiActiveController = null;
      }
      if (stopBtn) stopBtn.disabled = true;
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = prevSendHTML;
      }
      state.queue = "";
      state.isTyping = false;
      if (state.caretEl) state.caretEl.remove();
      const stopMeta = bubble?.querySelector(".ai-meta");
      if (stopMeta) stopMeta.remove();
      if (bubble && !state.full.trim()) {
        bubble.textContent = "Stopped.";
      }
    });
  }

  try {
    hideAiServerError();
    const resp = await fetch("/api/ai/chat_stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": getCurrentUserId(),
        "x-user-role": userRoleHeader()
      },
      body: JSON.stringify({
        message: text,
        mode: aiMode,
        context: finalContext
      }),
      signal: controller.signal
    });

    if (!resp.ok || !resp.body) {
      showAiServerError(`Local AI responded with HTTP ${resp.status}.`);
      throw new Error(`Stream failed: HTTP ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let gotAnyChunk = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const cleaned = chunk.replace(/\u200B/g, "");
      if (!cleaned) continue;
      console.log("chunk len:", cleaned.length);
      gotAnyChunk = true;
      typeIntoBubble({ bubble, text: cleaned, state });
    }

    await waitForTypewriterDone(state, 8000);

    const finalThinkingEl = bubble?.querySelector(".ai-thinking, .ai-typing, .thinking");
    if (finalThinkingEl) finalThinkingEl.remove();
    const finalMeta = bubble?.querySelector(".ai-meta");
    if (finalMeta) finalMeta.remove();
    if (state.caretEl) state.caretEl.remove();
    if (bubble && !state.full.trim() && !gotAnyChunk) {
      bubble.textContent = "I couldn't generate a reply.";
    }
  } catch (err) {
    console.error("AI streaming error", err);
    if (state.caretEl) state.caretEl.remove();
    const finalMeta = bubble?.querySelector(".ai-meta");
    if (finalMeta) finalMeta.remove();
    if (String(err?.name) === "AbortError") {
      if (bubble && !state.full.trim()) {
        bubble.textContent = "Stopped.";
      }
    } else if (bubble) {
      bubble.textContent = "";
      showAiServerError(err?.message || "Unable to reach the AI service.");
    }
  } finally {
    if (aiActiveController === controller) aiActiveController = null;
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = prevSendHTML;
    }
    if (stopBtn) stopBtn.disabled = true;
  }
}

const aiQuickActions = {
  assistant: [
    {
      title: "Explain a concept like I’m 12",
      desc: "Get a simplified explanation.",
      prompt: "Explain a concept like I'm 12 years old."
    },
    {
      title: "Summarize this text",
      desc: "Turn notes into bite-sized takeaways.",
      prompt: "Summarize this text."
    },
    {
      title: "Turn notes into study questions",
      desc: "Generate quick practice prompts.",
      prompt: "Turn these notes into study questions."
    },
    {
      title: "Improve this explanation",
      desc: "Polish tone and clarity instantly.",
      prompt: "Improve this explanation."
    }
  ],
  planner: [
    {
      title: "What should I study today?",
      desc: "Build action items from upcoming classes.",
      prompt: "I need to know what to study today."
    },
    {
      title: "What deadlines are coming?",
      desc: "Get a quick rundown of homework/exams.",
      prompt: "List my upcoming deadlines."
    },
    {
      title: "Create a study plan for this week",
      desc: "Organize workload around events.",
      prompt: "Create a realistic study plan for this week."
    },
    {
      title: "Balance homework & exams",
      desc: "Find a calm study schedule.",
      prompt: "Balance homework and exams."
    }
  ],
  classroom: [
    {
      title: "Create a lesson plan",
      desc: "Plan a structured 45-minute lesson.",
      prompt: "Create a 45-minute lesson plan."
    },
    {
      title: "Generate quiz questions",
      desc: "Mix difficulty for mastery checks.",
      prompt: "Generate 10 quiz questions."
    },
    {
      title: "Write homework instructions",
      desc: "Clarity is key for students.",
      prompt: "Write clear homework instructions."
    },
    {
      title: "Give feedback on student work",
      desc: "Constructive remarks and praise.",
      prompt: "Give feedback on student work."
    }
  ]
};

function aiQuickPrompt(text) {
  if (!aiInput) return;
  aiInput.value = text;
  aiInput.focus();
}

function renderAiActions() {
  if (!aiActionsContainer) return;
  const actions = aiQuickActions[aiMode] || [];
  aiActionsContainer.innerHTML = actions
    .map(
      (action) => `
    <button type="button" class="ai-action-card" data-prompt="${escapeHtml(action.prompt)}">
      <span class="title">${escapeHtml(action.title)}</span>
      <span class="desc">${escapeHtml(action.desc)}</span>
    </button>`
    )
    .join("");
  aiActionsContainer
    .querySelectorAll(".ai-action-card")
    .forEach((btn) => {
      const prompt = btn.getAttribute("data-prompt");
      btn.addEventListener("click", () => aiQuickPrompt(prompt));
    });
}

function getAiSystemContext() {
  const role =
    (sessionUser && (sessionUser.role || sessionUser.userRole) || "")
      .toLowerCase()
      .replace(/super|admin/, "teacher") || "student";
  const channel = typeof getChannelById === "function"
    ? getChannelById(currentChannelId)
    : null;
  const upcoming = plannerState?.events
    ? plannerState.events
        .slice()
        .sort((a, b) => new Date(a.startsAt || a.date || 0) - new Date(b.startsAt || b.date || 0))
        .slice(0, 5)
        .map((ev) => `${ev.title} (${ev.startsAt || ev.date})`)
    : [];
  return `
You are an AI assistant for WorkNest.
User role: ${role}
Current channel: ${channel?.name || channel?.title || "N/A"}
Upcoming events: ${upcoming.join("; ") || "none"}
Active mode: ${aiMode}
`;
}

function updateAiContextBlock() {
  if (!aiContextBlock) return;
  aiContextBlock.textContent = getAiSystemContext();
}

function showPanel(panelId) {
  setAppFullScreenMode(panelId !== "chatPanel");
  if (panelId !== "adminPanel") {
    restoreUserProfileCardToModal();
  }
  if (panelId !== "emailPanel") {
    restoreSchoolEmailUiToChatHeader();
  }
  document.querySelectorAll(".main-panel").forEach((p) => {
    p.classList.add("hidden");
    p.setAttribute("aria-hidden", "true");
  });
  const panel = document.getElementById(panelId);
  if (panel) {
    panel.classList.remove("hidden");
    panel.setAttribute("aria-hidden", "false");
    try {
      localStorage.setItem(LAST_ACTIVE_VIEW_KEY, panelId);
    } catch (err) {
      /* ignore */
    }
    if (panelId === "calendarPanel") {
      document.dispatchEvent(new Event("calendarPanelOpened"));
    }
  }

  const chatHeader = document.getElementById("chatHeader");
  if (chatHeader) {
    chatHeader.style.display = panelId === "chatPanel" ? "" : "none";
  }
}

function getLastActiveView() {
  try {
    return localStorage.getItem(LAST_ACTIVE_VIEW_KEY);
  } catch (err) {
    return null;
  }
}

function restoreLastActivePanel(defaultPanel = "chatPanel") {
  const panelId = getLastActiveView();
  const target = panelId && document.getElementById(panelId) ? panelId : defaultPanel;
  showPanel(target);
}

function openNotificationsView() {
  showPanel("notificationsPanel");
  renderNotificationsPanel();
}
function openProfilePanel() {
  showPanel("profilePanel");
}

function openFilesPanel() {
  showPanel("filesPanel");
  filesScopeMode = "all";
  if (!filesScopeChannelId) {
    const firstChannelId = channels && channels[0] && channels[0].id ? channels[0].id : null;
    const target = firstChannelId || currentChannelId;
    filesScopeChannelId = target != null ? String(target) : null;
  }
  renderFilesPanel();
}
function openCalendarPanel() {
  showPanel("calendarPanel");
}
function openLivePanel() {
  showPanel("livePanel");
  if (livePanel) livePanel.scrollTop = 0;
  loadLiveSessions(liveScope);
  setLiveJoinedState(false);
  updateLaunchButtonLabel();
}
function openAnalyticsPanel() {
  showPanel("analyticsPanel");
  renderAnalyticsPanel();
}

async function openEmailPanel() {
  if (!canAccessSchoolMailbox()) {
    if (!sessionUser) {
      return;
    }
    showToast("Email is available for school admins and students only.", "info");
    return;
  }
  showPanel("emailPanel");
  closeAdminDock();
  setSuperAdminLanding(false);
  mountSchoolEmailUiToEmailPanel();
  updateSesMailboxPermissionsUI();
  setSesSettingsView(getDefaultSesSettingsView());
  schoolEmailSettingsPage?.classList.remove("hidden");
  schoolEmailSettingsPage?.setAttribute("aria-hidden", "false");
  if (canManageSchoolMailbox()) {
    try {
      await loadEmailSettings();
      await loadClassSettingsSchoolDetails();
    } catch (err) {
      console.error("Failed to load email settings", err);
      showToast("Could not load settings");
    }
  }
}

async function openAdminProfilePanel() {
  showPanel("adminPanel");
  closeAdminDock();
  setSuperAdminLanding(false);
  try {
    await openCurrentUserProfile();
  } catch (err) {
    console.error("Failed to load admin profile panel", err);
  }
  mountUserProfileCardToAdminPanel();
}

function closeModal(el) {
  if (!el) return;
  el.classList.add("hidden");
  el.setAttribute("aria-hidden", "true");
}

function currentSchoolNameFallback() {
  const label = document.getElementById("schoolNameLabel");
  return label && label.textContent ? label.textContent.trim() : "";
}

function currentSchoolLogoFallback() {
  const img = document.getElementById("schoolLogoImg");
  if (img && !img.hidden && img.src) {
    return img.src;
  }
  return "";
}

function previewEmailTemplate() {
  if (!sesPreviewBtn) return;
  const logoUrl = document.getElementById("sesLogoPreview")?.src || "";
  const schoolName = sesSchoolName?.value || "StudisNest School";
  const subjectPrefix = sesSubjectPrefix?.value || "";
  const subject = subjectPrefix ? `${subjectPrefix} Live class notification` : "Live class notification";
  const footer = sesFooter?.value || "";
  const signature = sesSignatureHtml?.value || `<p>Kind regards,<br>${schoolName}</p>`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${subject}</title>
      </head>
      <body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;line-height:1.5;color:#0f172a;padding:24px;">
        ${logoUrl ? `<img src="${logoUrl}" alt="School logo" style="width:80px;height:80px;object-fit:contain;border-radius:16px;margin-bottom:18px;" />` : ""}
        <h2 style="margin-bottom:4px;">${subject}</h2>
        <p style="margin-bottom:8px;">School: <strong>${schoolName}</strong></p>
        <p style="margin-bottom:8px;">Link: <a href="#">https://yourdomain.com/live-session</a></p>
        <p style="margin-bottom:8px;">When: Tomorrow, 4:00 PM</p>
        <div style="margin-top:16px;">${footer.replace(/\n/g, "<br>")}</div>
        <div style="margin-top:24px;">${signature}</div>
      </body>
    </html>
  `.trim();

  const previewWindow = window.open("", "_blank", "width=760,height=700,menubar=no");
  if (!previewWindow) {
    showToast("Allow pop-ups to preview the email");
    return;
  }
  previewWindow.document.open();
  previewWindow.document.write(html);
  previewWindow.document.close();
}

const SES_HISTORY_LIMIT = 35;
const SES_LAST_TEST_KEY = "worknest_ses_last_test_sent";
// Keep saved subject prefix (DB) separate from the test-email subject input.
let sesSavedSubjectPrefix = "";

async function loadEmailSettings() {
  const ws = await resolveProfileWorkspaceId();
  const s = await fetchJSON(`/api/workspaces/${encodeURIComponent(ws)}/email-settings`, {
    headers: { "x-user-id": getCurrentUserId() }
  });

  const isEmpty =
    !s.brand_school_name &&
    !s.reply_to_email &&
    !s.footer_text &&
    !s.subject_prefix &&
    !s.logo_url &&
    !s.signature_html;

  if (isEmpty) {
    const schoolName = currentSchoolNameFallback();
    s.brand_school_name = schoolName;
    s.reply_to_email = sessionUser?.email || "";
    s.subject_prefix = schoolName ? `[${schoolName}]` : "";
    s.footer_text = `Kind regards,\n${schoolName || "School Team"}`;
    s.logo_url = currentSchoolLogoFallback();
  }

  sesEnabled.checked = !!s.enabled;
  sesSchoolName.value = s.brand_school_name || "";
  sesReplyTo.value = s.reply_to_email || "";
  sesFooter.value = s.footer_text || "";
  // Save DB value, but DON'T force it into the test subject input
sesSavedSubjectPrefix = String(s.subject_prefix || "");

// Test email subject should start empty every time (even after refresh)
if (sesSubjectPrefix) {
  sesSubjectPrefix.value = "";
  sesSubjectPrefix.placeholder = sesSavedSubjectPrefix || "Subject";
}

  if (sesSignatureHtml) {
    sesSignatureHtml.value = s.signature_html || "";
  }

  sesLogoUrlValue = s.logo_url || "";
  if (sesLogoPreview) {
    if (sesLogoUrlValue) {
      sesLogoPreview.src = sesLogoUrlValue;
      sesLogoPreview.style.display = "block";
    } else {
      sesLogoPreview.style.display = "none";
    }
  }
  sesStatus.textContent = "";
  const workspaceId = getProfileWorkspaceId();
  if (workspaceId) {
    try {
      sesWorkspaceProfileCache = await fetchWorkspaceProfile(workspaceId);
    } catch (err) {
      console.error("Failed to load workspace profile for email settings side card", err);
      sesWorkspaceProfileCache = null;
    }
  } else {
    sesWorkspaceProfileCache = null;
  }
  sesUpdateSideCard();

  if (sesRegistrationDetails) {
    sesRegistrationDetails.value = (sesWorkspaceProfileCache?.registrationDetails || "");
  }

// --- Always start test UI empty on open/refresh ---
clearSesTestFields({ clearBody: true });
await updateSesBodyChrome().catch(() => {});
await loadSesEmailLogs().catch((err) => {
  console.warn("Failed to load email history", err);
});

}

function formatSesHistoryTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function stripSesHtml(value) {
  if (!value) return "";
  return String(value)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?[^>]+(>|$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatSesHistoryRecipient(log) {
  return log.toName || log.toEmail || "Unknown recipient";
}

function formatSenderRole(role) {
  const normalized = String(role || "admin").trim();
  if (!normalized) return "Admin";
  return normalized
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

function renderSesEmailHistory() {
  if (!sesHistoryList || !sesHistoryEmpty) return;
  sesHistoryList.innerHTML = "";
  if (!sesEmailLogs || !sesEmailLogs.length) {
    sesHistoryEmpty.classList.remove("hidden");
    return;
  }
  sesHistoryEmpty.classList.add("hidden");

  sesEmailLogs.forEach((log) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "ses-history-card";
    card.dataset.logId = log.id || "";
    if (log.id === sesActiveHistoryLogId) {
      card.classList.add("is-active");
    }
    const nameEl = document.createElement("div");
    nameEl.className = "ses-history-name";
    nameEl.textContent = formatSesHistoryRecipient(log);

    const metaEl = document.createElement("div");
    metaEl.className = "ses-history-meta";
    metaEl.textContent = formatSesHistoryTimestamp(log.createdAt);

    const subjectEl = document.createElement("div");
    subjectEl.className = "ses-history-subject";
    subjectEl.textContent = log.subject || "No subject";

    const header = document.createElement("div");
    header.className = "ses-history-card-header";
    header.appendChild(nameEl);
    const badge = document.createElement("span");
    badge.className = "ses-history-badge";
    badge.textContent = formatSenderRole(log.senderRole);
    header.appendChild(badge);
    card.appendChild(header);
    card.appendChild(metaEl);
    card.appendChild(subjectEl);

    const previewSection = document.createElement("div");
    previewSection.className = "ses-history-preview";
    previewSection.innerHTML = `
      <div class="ses-history-preview-inner">
        <div class="ses-history-preview-title">Preview</div>
        <div class="ses-history-preview-recipient"></div>
        <div class="ses-history-preview-subject"></div>
        <div class="ses-history-preview-body"></div>
      </div>
    `;
    card.appendChild(previewSection);

    card.addEventListener("click", (event) => {
      event.stopPropagation();
      if (sesActiveHistoryLogId === log.id) {
        clearSesHistorySelection();
        return;
      }
      loadSesEmailLogPreview(log.id);
    });
    sesHistoryList.appendChild(card);
  });
}

function formatInboxSnippet(value, length = 200) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (normalized.length <= length) return normalized;
  return `${normalized.slice(0, length).trim()}…`;
}

function isInboxMessageUnread(message) {
  if (!message) return false;
  if (message._wnReadOverride) return false;
  if (typeof message.is_read === "boolean") return !message.is_read;
  if (typeof message.read === "boolean") return !message.read;
  if (typeof message.isUnread === "boolean") return message.isUnread;
  if (typeof message.unread === "boolean") return message.unread;
  if (typeof message.is_unread === "boolean") return message.is_unread;
  if (typeof message.status === "string") return message.status.toLowerCase() !== "read";
  return false;
}

function renderSesInboxView() {
  if (!sesInboxPanel || !sesInboxPlaceholder || !sesInboxCount || !sesInboxList) return;
  const hasMessages = Array.isArray(sesInboxMessages) && sesInboxMessages.length > 0;
  sesInboxPlaceholder.classList.toggle("hidden", hasMessages);
  const detailVisible = Boolean(sesInboxDetailVisible && sesInboxActiveMessage);
  if (sesInboxDetail) {
    sesInboxDetail.classList.toggle("hidden", !detailVisible);
  }
  sesInboxList.classList.toggle("hidden", detailVisible || !hasMessages);
  const count = hasMessages ? sesInboxMessages.length : 0;
  sesInboxCount.textContent = String(count);
  if (sesInboxMarkAllBtn) {
    sesInboxMarkAllBtn.disabled = !hasMessages;
  }

  sesInboxList.innerHTML = "";
  if (!hasMessages) {
    return;
  }

  sesInboxMessages.forEach((message) => {
    const rawSender = message.sender || message.from || "Unknown sender";
    const senderName = getInboxDisplayName(rawSender);
    const sender = escapeHtml(senderName);
    const emailLine = escapeHtml(getInboxSenderEmail(message));
    const subject = escapeHtml(message.subject || "No Subject");
    const avatarLetter = escapeHtml((senderName.trim().charAt(0) || "I").toUpperCase());
    const receivedDate = formatSesHistoryTimestamp(message.received_at || message.receivedAt);
    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    const attachmentCount = attachments.length;
    const attachmentsTotalBytes =
      Number(message.totalAttachmentBytes || 0) || attachments.reduce((sum, att) => sum + (Number(att?.size) || 0), 0);
    const tooltipText = attachmentCount
      ? `${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'} • ${humanSize(attachmentsTotalBytes)}`
      : '';
    const chipsHtml = attachments
      .slice(0, 2)
      .map((att) => {
        const label = `${att.filename || 'Attachment'} • ${humanSize(att.size || 0)}`;
        const url = getInboxViewUrl(message, att) || getInboxDownloadUrl(message, att);
        if (!url) return '';
        return `<a class="att-chip" href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(
          label
        )}</a>`;
      })
      .filter(Boolean)
      .join('');
    const moreCount = Math.max(0, attachmentCount - 2);
    const moreHtml = moreCount
      ? `<span class="att-more" aria-label="${moreCount} more attachments">+${moreCount} more</span>`
      : '';
    const attachmentsContent = `${chipsHtml}${moreHtml}`;
    const attachmentsBlock = attachmentCount
      ? `<div class="row-attachments" ${tooltipText ? `title="${escapeHtml(tooltipText)}"` : ''}>${
          attachmentsContent || '<span class="att-more">Attachments</span>'
        }</div>`
      : '';
    const rowActionsHtml = `
      <div class="row-actions" aria-label="Inbox row actions">
        <button type="button" class="row-action-btn" data-action="mark" title="Mark read/unread">
          <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
        </button>
        <button type="button" class="row-action-btn" data-action="delete" title="Delete">
          <i class="fa-regular fa-trash-can" aria-hidden="true"></i>
        </button>
        <button type="button" class="row-action-btn" data-action="star" title="Star message">
          <i class="fa-regular fa-star" aria-hidden="true"></i>
        </button>
      </div>
    `;
    const row = document.createElement("div");
    const classes = ["wn-mail-row"];
    if (isInboxMessageUnread(message)) {
      classes.push("wn-unread");
    }
    row.className = classes.join(" ");
    row.dataset.id = message.id || message.messageId || message.message_id || "";

    row.innerHTML = `
      <div class="wn-mail-left">
        <div class="wn-avatar">${avatarLetter}</div>
        <div class="wn-mail-main">
          <div class="wn-mail-info">
            <span class="wn-from-col">${sender}</span>
            <span class="wn-subject-col">${subject}</span>
            ${emailLine ? `<span class="wn-email-col">${emailLine}</span>` : '<span class="wn-email-col"></span>'}
          </div>
          ${attachmentsBlock}
        </div>
      </div>
      ${rowActionsHtml}
      <div class="wn-mail-right">
        <span class="wn-date">${receivedDate}</span>
      </div>
    `;

    row.querySelectorAll(".row-action-btn").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        event.preventDefault();
        const action = button.dataset.action || "action";
        showToast(`${action.charAt(0).toUpperCase() + action.slice(1)} coming soon`, "info");
      });
    });
    row.addEventListener("click", () => showSesInboxDetail(message));
    sesInboxList.appendChild(row);
  });
}

function getInboxDisplayName(value) {
  if (!value) return "Unknown sender";
  if (typeof value === "string") {
    const split = value.split("<")[0].trim();
    return split || value;
  }
  if (typeof value === "object") {
    const candidate = value.name || value.displayName || value.email || "";
    if (candidate) {
      return getInboxDisplayName(String(candidate));
    }
  }
  return "Unknown sender";
}

function getInboxSenderEmail(message) {
  if (!message) return "";
  const candidates = [
    message.senderEmail,
    message.fromEmail,
    message.email,
    message.from,
    message.sender,
    message.replyTo
  ];
  for (const raw of candidates) {
    if (!raw || typeof raw !== "string") continue;
    const match = raw.match(/<([^>]+)>/);
    const candidate = match ? match[1] : raw;
    if (/@/.test(candidate)) {
      return candidate.trim();
    }
  }
  return "";
}

const INLINE_PREVIEW_MIMES_UI = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp"
]);

function normalizeMimeForAttachments(value = "") {
  return String(value || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

function isInlinePreviewAvailable(attachment) {
  if (!attachment) return false;
  const type = normalizeMimeForAttachments(attachment.contentType);
  return INLINE_PREVIEW_MIMES_UI.has(type);
}

function resolveInboxEmailId(message) {
  if (!message) return "";
  return String(message.id || message.emailId || message.message_id || message.messageId || "").trim();
}

function buildInboxAttachmentBaseUrl(message, attachment) {
  const emailId = resolveInboxEmailId(message);
  const attachmentId = String(attachment?.id || "").trim();
  if (!emailId || !attachmentId) return "";
  return `${API_BASE}/api/admin/inbox/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`;
}

function getInboxDownloadUrl(message, attachment) {
  return buildInboxAttachmentBaseUrl(message, attachment);
}

function getInboxViewUrl(message, attachment) {
  if (!isInlinePreviewAvailable(attachment)) return "";
  const base = buildInboxAttachmentBaseUrl(message, attachment);
  if (!base) return "";
  return `${base}/view`;
}

function renderSesInboxDetailAttachments(message) {
  if (!sesInboxDetailAttachments) return;
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  if (!attachments.length) {
    sesInboxDetailAttachments.classList.add("hidden");
    sesInboxDetailAttachments.innerHTML = "";
    return;
  }
  const attachmentsHtml = attachments
    .map((att) => {
      if (!att || !att.id) return "";
      const name = escapeHtml(String(att.filename || "Attachment"));
      const sizeLabel = humanSize(att.size || 0);
      const previewUrl = getInboxViewUrl(message, att);
      const downloadUrl = getInboxDownloadUrl(message, att);
      const previewButton = previewUrl
        ? `<a class="wn-detail-attachment-button" href="${previewUrl}" target="_blank" rel="noopener noreferrer">
            Preview
          </a>`
        : `<span class="wn-detail-attachment-button wn-detail-attachment-button--disabled">Preview</span>`;
      const downloadButton = downloadUrl
        ? `<a class="wn-detail-attachment-button" href="${downloadUrl}" target="_blank" rel="noopener noreferrer" download>
            Download
          </a>`
        : "";
      return `<div class="wn-detail-attachment-row">
        <div class="wn-detail-attachment-title">
          <span>${name}</span>
          <span class="wn-detail-attachment-size">${sizeLabel}</span>
        </div>
        <div class="wn-detail-attachment-actions">
          ${previewButton}
          ${downloadButton}
        </div>
      </div>`;
    })
    .filter(Boolean)
    .join("");
  if (!attachmentsHtml) {
    sesInboxDetailAttachments.classList.add("hidden");
    sesInboxDetailAttachments.innerHTML = "";
    return;
  }
  sesInboxDetailAttachments.classList.remove("hidden");
  sesInboxDetailAttachments.innerHTML = `
    <div class="wn-detail-attachments-title">
      <i class="fa-solid fa-paperclip" aria-hidden="true"></i>
      Attachments (${attachments.length})
    </div>
    <div class="wn-detail-attachments-list">
      ${attachmentsHtml}
    </div>
  `;
}

function replaceCidSources(html, message) {
  if (!html) return "";
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  if (!attachments.length) return html;
  return html.replace(/src\s*=\s*(['"])cid:([^'"]+)\1/gi, (match, quote, cid) => {
    const normalizedCid = String(cid || "").replace(/^<|>$/g, "").trim();
    if (!normalizedCid) return match;
    const attachment = attachments.find((att) => {
      const candidate = String(att.contentId || "").replace(/^<|>$/g, "").trim();
      return candidate && candidate === normalizedCid;
    });
    if (!attachment) return match;
    const previewUrl = getInboxViewUrl(message, attachment);
    if (!previewUrl) return match;
    return `src=${quote}${previewUrl}${quote}`;
  });
}

function populateSesInboxDetail(message) {
  if (!message || !sesInboxDetail) return;
  const senderName = getInboxDisplayName(message.sender || message.from || "Unknown sender");
  const avatarLetter = (senderName.trim().charAt(0) || "I").toUpperCase();
  const emailAddress = getInboxSenderEmail(message);
  const subject = message.subject || "No subject";
  const bodyText =
    message.text_body ||
    message.bodyText ||
    stripSesHtml(message.html_body || message.bodyHtml || message.snippet || "");
  const htmlSource = message.html_body || message.bodyHtml || "";
  let renderedBody = "";
  if (htmlSource) {
    renderedBody = sanitizeMessageHTML(replaceCidSources(htmlSource, message));
  } else if (bodyText) {
    renderedBody = escapeHtml(bodyText).replace(/\n/g, "<br>");
  }
  if (sesInboxDetailAvatar) sesInboxDetailAvatar.textContent = avatarLetter;
  if (sesInboxDetailName) sesInboxDetailName.textContent = senderName;
  if (sesInboxDetailEmail) sesInboxDetailEmail.textContent = emailAddress;
  if (sesInboxDetailSubject) sesInboxDetailSubject.textContent = subject;
  if (sesInboxDetail) {
    sesInboxDetail.dataset.emailId = String(message.id || "");
  }
  if (sesInboxDetailBody) {
    sesInboxDetailBody.innerHTML = renderedBody || "No message content captured.";
  }
  const timestamp = formatSesHistoryTimestamp(message.received_at || message.receivedAt || message.ts || message.date);
  if (sesInboxDetailDate) sesInboxDetailDate.textContent = timestamp;
  const senderRaw =
    message.from_name ||
    (typeof message.sender === "string"
      ? message.sender
      : message.sender?.name || message.sender?.displayName || message.sender?.email || message.from);
  const friendlyName = getInboxDisplayName(senderRaw || senderName);
  updateReplyGreeting(friendlyName);
  renderSesInboxDetailAttachments(message);
}

function showSesInboxDetail(message) {
  if (!message) return;
  sesInboxActiveMessage = message;
  sesInboxDetailVisible = true;
  populateSesInboxDetail(message);
  renderSesInboxView();
}

function closeSesInboxDetail() {
  sesInboxDetailVisible = false;
  sesInboxActiveMessage = null;
  renderSesInboxView();
}

function markAllSesInboxRead() {
  if (!Array.isArray(sesInboxMessages) || !sesInboxMessages.length) return;
  sesInboxMessages = sesInboxMessages.map((msg) => ({ ...msg, _wnReadOverride: true }));
  renderSesInboxView();
}

function clearSesHistorySelection() {
  if (!sesHistoryList) return;
  sesHistoryList
    .querySelectorAll(".ses-history-card.is-active")
    .forEach((card) => {
      card.classList.remove("is-active");
      const preview = card.querySelector(".ses-history-preview");
    });
  sesActiveHistoryLogId = null;
  hideSesEmailPreview();
  renderSesEmailHistory();
}

async function loadSesEmailLogs() {
  const ws = await resolveProfileWorkspaceId();
  if (!ws) return;
  const endpoint = `/api/workspaces/${encodeURIComponent(ws)}/email-logs?limit=${SES_HISTORY_LIMIT}`;
  try {
    const res = await fetchJSON(endpoint, { headers: { "x-user-id": getCurrentUserId() } });
    sesEmailLogs = Array.isArray(res?.logs) ? res.logs : [];
    if (sesActiveHistoryLogId && !sesEmailLogs.some((log) => log.id === sesActiveHistoryLogId)) {
      sesActiveHistoryLogId = null;
      hideSesEmailPreview();
    }
    renderSesEmailHistory();
    if (sesActiveHistoryLogId) {
      const activeLog = sesEmailLogs.find((log) => log.id === sesActiveHistoryLogId);
      if (activeLog) {
        populateSesHistoryCardPreview(activeLog);
      }
    }
  } catch (err) {
    console.error("Failed to refresh email history", err);
    throw err;
  }
}

async function loadSesEmailLogPreview(logId) {
  if (!logId) return;
  const ws = await resolveProfileWorkspaceId();
  if (!ws) return;
  const endpoint = `/api/workspaces/${encodeURIComponent(ws)}/email-logs/${encodeURIComponent(logId)}`;
  try {
    const payload = await fetchJSON(endpoint, { headers: { "x-user-id": getCurrentUserId() } });
    const log = payload?.log;
    if (!log) {
      throw new Error("Log payload missing");
    }
    sesActiveHistoryLogId = log.id;
    populateSesHistoryCardPreview(log);
  } catch (err) {
    console.error("Failed to load SES log preview", err);
    showToast("Could not load email preview");
  }
}

async function loadSesInboxMessages(options = {}) {
  if (options?.folder) {
    sesCurrentMailboxFolder = String(options.folder).trim().toLowerCase() === "trash" ? "trash" : "inbox";
  }
  if (window.refreshGmailishInbox) {
    return window.refreshGmailishInbox({
      folder: sesCurrentMailboxFolder,
      sync: !!options?.sync
    });
  }
  return;
}

function populateSesHistoryCardPreview(log) {
  if (!log || !sesHistoryList) return;
  const card = sesHistoryList.querySelector(`[data-log-id="${log.id}"]`);
  if (!card) return;
  sesHistoryList
    .querySelectorAll(".ses-history-card.is-active")
    .forEach((el) => {
      if (el !== card) {
        el.classList.remove("is-active");
        const otherPreview = el.querySelector(".ses-history-preview");
        if (otherPreview) otherPreview.classList.add("hidden");
      }
    });
  card.classList.add("is-active");
  const preview = card.querySelector(".ses-history-preview");
  if (!preview) return;
  const recipientEl = preview.querySelector(".ses-history-preview-recipient");
  const subjectEl = preview.querySelector(".ses-history-preview-subject");
  const bodyEl = preview.querySelector(".ses-history-preview-body");
  const recipient = formatSesHistoryRecipient(log);
  if (recipientEl) recipientEl.textContent = recipient ? `To: ${recipient}` : "";
  if (subjectEl) subjectEl.textContent = log.subject || "No subject";
  if (bodyEl) {
    const previewBody = log.bodyText || stripSesHtml(log.bodyHtml);
    bodyEl.textContent = previewBody || "No content captured.";
  }
}

function markTestEmailSent() {
  try {
    localStorage.setItem(SES_LAST_TEST_KEY, Date.now().toString());
  } catch (_err) {
    /* ignore */
  }
}


function updateClassSettingsSchoolDetails(data = {}) {
  if (!classSchoolDetails) return;
  const name = data.workspaceName || currentSchoolNameFallback() || "School details pending";
  const street = (data.street || "").trim();
  const house = (data.houseNumber || "").trim();
  const postal = (data.postalCode || "").trim();
  const city = (data.city || "").trim();
  const country = (data.country || "").trim() || (data.state || "").trim();

  if (classSchoolDetailName) {
    classSchoolDetailName.textContent = name;
  }
  if (classSchoolDetailAddress) {
    const addressLine = [street, house].filter(Boolean).join(" ").trim() || "Address not set";
    classSchoolDetailAddress.textContent = addressLine;
  }
  if (classSchoolDetailPostal) {
    const postalLine = [postal, city].filter(Boolean).join(" ").trim() || "Postal code unavailable";
    classSchoolDetailPostal.textContent = postalLine;
  }
  if (classSchoolDetailCountry) {
    classSchoolDetailCountry.textContent = country || "Country not set";
  }
}

async function loadClassSettingsSchoolDetails(force = false) {
  const workspaceId = getProfileWorkspaceId();
  if (!workspaceId) {
    updateClassSettingsSchoolDetails();
    return;
  }
  try {
    const profile = await fetchWorkspaceProfile(workspaceId, { force });
    updateClassSettingsSchoolDetails(profile || {});
  } catch (err) {
    console.error("Failed to load school profile details for class settings", err);
    updateClassSettingsSchoolDetails();
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadSchoolLogo(file) {
  const ws = await resolveProfileWorkspaceId();
  const dataUrl = await fileToDataUrl(file);

  const resp = await fetchJSON(`/api/workspaces/${encodeURIComponent(ws)}/logo`, {
    method: "POST",
    headers: { "x-user-id": getCurrentUserId() },
    body: JSON.stringify({ dataUrl })
  });

  sesLogoUrlValue = resp.logo_url || "";
  if (sesLogoPreview) {
    if (sesLogoUrlValue) {
      sesLogoPreview.src = sesLogoUrlValue;
      sesLogoPreview.style.display = "block";
    } else {
      sesLogoPreview.style.display = "none";
    }
  }
}

async function saveEmailSettings() {
  const ws = await resolveProfileWorkspaceId();
  if (!sesStatus) return;
  sesStatus.textContent = "Saving…";
  const manualBodyText = sesBodyText?.value || "";
  await fetchJSON(`/api/workspaces/${encodeURIComponent(ws)}/email-settings`, {
    method: "POST",
    headers: { "x-user-id": getCurrentUserId() },
    body: JSON.stringify({
      enabled: sesEnabled.checked ? 1 : 0,
      brand_school_name: sesSchoolName.value || "",
      reply_to_email: sesReplyTo.value || "",
      footer_text: sesFooter.value || "",
      subject_prefix: sesSubjectPrefix.value || "",
      manual_body_text: manualBodyText,
      logo_url: sesLogoUrlValue || "",
      signature_html: sesSignatureHtml?.value || ""
    })
  });
  sesStatus.textContent = "Saved ✅";
  setTimeout(() => {
    if (sesStatus) sesStatus.textContent = "";
  }, 1200);
}

async function sendTestEmail() {
  const ws = await resolveProfileWorkspaceId();
  if (!sesStatus) return;
  const to = (sesTestTo.value || "").trim();
  if (!to.includes("@")) {
    return showToast("Enter a valid test email");
  }

  const finalBody = buildFinalTestEmailBody();

  sesStatus.textContent = "Sending test email…";
  try {
    await fetchJSON(`/api/workspaces/${encodeURIComponent(ws)}/email-settings/test`, {
      method: "POST",
      headers: { "x-user-id": getCurrentUserId() },
      body: JSON.stringify({
        to,
        manual_body_text: finalBody,
        subject: (sesSubjectPrefix?.value || "").trim()
      })
    });
    sesStatus.textContent = "Test email sent ✅";
    clearSesTestFields({ clearBody: true });
    markTestEmailSent();
    sesActiveHistoryLogId = null;
    hideSesEmailPreview();
    await loadSesEmailLogs().catch((err) => {
      console.warn("Failed to refresh email history", err);
    });
  } catch (e) {
    sesStatus.textContent = `Test failed: ${String(e.message || e)}`;
  }
}

function isFilesPanelActive() {
  const p = document.getElementById("filesPanel");
  return !!(p && !p.classList.contains("hidden"));
}

function setFilesScope(channelId) {
  filesScopeChannelId = channelId || filesScopeChannelId;
  if (typeof filesScopeMode !== "undefined") filesScopeMode = "current";
  renderFilesPanel();
}

function fileKind(mime = "", name = "") {
  const m = (mime || "").toLowerCase();
  const n = (name || "").toLowerCase();

  if (m.startsWith("audio/") || (n.endsWith(".webm") && n.includes("audio"))) return "audio";
  if (m.startsWith("video/") || (n.endsWith(".webm") && n.includes("video"))) return "video";
  if (m.startsWith("image/") || n.match(/\.(png|jpg|jpeg|gif|webp|svg)$/)) return "image";
  return "file";
}

function stableIdFromString(value) {
  const str = String(value || "");
  let hash = 5381;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return `f_${(hash >>> 0).toString(16)}`;
}

function buildFileId(file) {
  const base = `${file?.url || ""}|${file?.channelId || ""}|${file?.messageId || ""}|0|${file?.name || ""}`;
  return stableIdFromString(base);
}

function formatRelativeTime(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  if (abs < 60000) return diff >= 0 ? "Just now" : "Soon";
  if (mins < 60) return diff >= 0 ? `${mins}m ago` : `In ${mins}m`;
  const hrs = Math.round(abs / 3600000);
  if (hrs < 24) return diff >= 0 ? `${hrs}h ago` : `In ${hrs}h`;
  const days = Math.round(abs / 86400000);
  return diff >= 0 ? `${days}d ago` : `In ${days}d`;
}

function getFileCategoryMeta(file) {
  const channelId = String(file.channelId || "");
  const isDm = isDmChannel(channelId);
  const channel = !isDm ? getChannelById(channelId) : null;
  const rawLabel = String(file.channelLabel || "").replace(/^#/, "").trim();
  const channelName = (channel?.name || rawLabel || "").trim();
  const channelCategory = normalizeChannelCategory(channel?.category || "");
  const lower = channelName.toLowerCase();
  const kind = fileKind(file.mime, file.name);
  const isHomework = channelCategory === "homework" || lower.includes("homework");
  const isExam = channelCategory === "exams" || lower.includes("exam") || lower.includes("test");
  const isMaterials =
    channelCategory === "tools" ||
    lower.includes("announcement") ||
    lower.includes("material") ||
    lower.includes("learning") ||
    lower.includes("speaking") ||
    lower.includes("listening");

  let category = "materials";
  if (isHomework) category = "homework";
  else if (isExam) category = "exams";
  else if (kind !== "file") category = "media";
  else if (isMaterials) category = "materials";

  let contextLabel = channelName || (isDm ? "Private chat" : "Channel");
  if (isHomework && channelName) {
    const base = channelName.replace(/homework/i, "").replace(/[-–]+$/g, "").trim();
    contextLabel = base ? `${base} -> Homework` : "Homework";
  }
  if (isDm) contextLabel = "Private chat";

  const badgeLabel =
    category === "homework"
      ? "Homework"
      : category === "exams"
      ? "Exam"
      : category === "media"
      ? "Media"
      : "Material";

  return {
    channel,
    channelName,
    channelCategory,
    kind,
    category,
    contextLabel,
    badgeLabel,
    badgeClass: `badge-${category}`
  };
}

function mapRegistryPurposeToCategory(value) {
  const purpose = String(value || "").trim().toLowerCase();
  if (purpose === "material") return "materials";
  if (purpose === "exam") return "exams";
  if (purpose === "homework") return "homework";
  if (purpose === "media") return "media";
  return "";
}

async function logFileEvent(eventType, file) {
  if (!file || !file.fileId || !eventType) return;
  const workspaceId =
    file.channel?.workspaceId || currentWorkspaceId || sessionUser?.workspaceId || "default";
  const rawPurpose = String(file.category || "").toLowerCase();
  const purpose =
    rawPurpose === "materials"
      ? "material"
      : rawPurpose === "exams"
      ? "exam"
      : rawPurpose || "";
  try {
    await fetchJSON("/api/file-events", {
      method: "POST",
      headers: { "x-user-id": getCurrentUserId() },
      body: JSON.stringify({
        fileId: file.fileId,
        eventType,
        workspaceId,
        purpose,
        channelId: file.channelId || "",
        messageId: file.messageId || "",
        fileName: file.name || "",
        mime: file.mime || "",
        fileUrl: file.url || ""
      })
    });
  } catch (err) {
    console.warn("Failed to log file event", err);
  }
}

function userRoleHeader() {
  const role = (sessionUser && (sessionUser.role || sessionUser.userRole)) || "";
  return String(role || "").trim().toLowerCase();
}

async function pinFile(fileId, pinned) {
  return fetchJSON(`/api/files/${encodeURIComponent(fileId)}/pin`, {
    method: "POST",
    headers: {
      "x-user-id": getCurrentUserId(),
      "x-user-role": userRoleHeader()
    },
    body: JSON.stringify({ pinned })
  });
}

function showAiServerError(message) {
  hideAiServerError();
  const card = document.createElement("div");
  card.id = "aiErrorCard";
  card.className = "ai-error-card";
  card.innerHTML = `
    <div class="ai-error-card-inner">
      <h3>AI Service Unavailable</h3>
      <p>${escapeHtml(message || "The local AI server could not be reached. Please check that Ollama is running and try again.")}</p>
      <div class="ai-error-actions">
        <button class="retry" type="button">Retry</button>
        <button class="close" type="button">Dismiss</button>
      </div>
    </div>
  `;
  document.body.appendChild(card);
  card.querySelector(".retry").addEventListener("click", () => {
    hideAiServerError();
    sendAiMessage();
  });
  card.querySelector(".close").addEventListener("click", hideAiServerError);
}

function hideAiServerError() {
  const existing = document.getElementById("aiErrorCard");
  if (existing) existing.remove();
}

async function deleteFile(fileId) {
  return fetchJSON(`/api/files/${encodeURIComponent(fileId)}/delete`, {
    method: "POST",
    headers: {
      "x-user-id": getCurrentUserId(),
      "x-user-role": userRoleHeader()
    },
    body: JSON.stringify({})
  });
}

async function replaceFile(fileId, fileRow, newUploadFileObj) {
  const rawPurpose = String(fileRow.category || "").toLowerCase();
  const purpose =
    rawPurpose === "materials"
      ? "material"
      : rawPurpose === "exams"
      ? "exam"
      : rawPurpose || "media";
  return fetchJSON(`/api/files/${encodeURIComponent(fileId)}/replace`, {
    method: "POST",
    headers: {
      "x-user-id": getCurrentUserId(),
      "x-user-role": userRoleHeader()
    },
    body: JSON.stringify({
      workspaceId: currentWorkspaceId || "default",
      channelId: fileRow.channelId,
      messageId: fileRow.messageId || "",
      purpose,
      newFile: newUploadFileObj
    })
  });
}

function pickOneFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
    input.click();
  });
}

async function uploadSingleFile(file) {
  if (!file) return null;
  const fd = new FormData();
  fd.append("files", file);
  try {
  const res = await fetch("/api/uploads", {
    method: "POST",
    body: fd,
    credentials: "include",
    headers: {
      "x-csrf-token": getCsrfToken()
    }
  });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.files?.[0] || null;
  } catch (err) {
    console.error("Upload failed", err);
    return null;
  }
}

function matchesQuery(f, q) {
  if (!q) return true;
  const hay = [
    f.name,
    f.author,
    f.channelLabel,
    f.channelId,
    f.time,
    f.url,
    f.messageText
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function attachmentsFromMessage(msg, channelId) {
  const list = [];
  if (!msg || !msg.text) return list;
  const wrap = document.createElement("div");
  wrap.innerHTML = msg.text;
  const cid = channelId != null ? String(channelId) : "";
  const baseTs =
    msg.timestamp ||
    msg.ts ||
    msg.createdAt ||
    msg.created_at ||
    msg.time ||
    0;
  const ts = Number(baseTs) || Date.parse(baseTs) || 0;
  const messageId = msg.id ? String(msg.id) : "";
  const messageText = summarizeText(msg.text || "");
  wrap.querySelectorAll(".att-card[data-att-url]").forEach((card) => {
    const url = card.getAttribute("data-att-url") || "";
    const mime = card.getAttribute("data-mime") || "";
    const name = card.querySelector(".att-name")?.textContent || "attachment";
    const author = msg.author || "Unknown";
    const time = msg.time || "";
    const sizeText = card.querySelector(".att-sub")?.textContent || "";
    const sizeMatch = sizeText.match(/([\d.]+)\s*(B|KB|MB|GB)/i);
    let sizeBytes = 0;
    if (sizeMatch) {
      const val = parseFloat(sizeMatch[1]);
      const unit = (sizeMatch[2] || "").toUpperCase();
      const mult = unit === "GB" ? 1024 ** 3 : unit === "MB" ? 1024 ** 2 : unit === "KB" ? 1024 : 1;
      sizeBytes = Math.round(val * mult);
    }
    list.push({
      url,
      mime,
      name,
      author,
      time,
      ts,
      sizeBytes,
      createdAt: msg.created_at || msg.createdAt || "",
      channelId: cid,
      channelLabel: channelLabel(cid),
      messageId,
      messageText
    });
  });
  return list;
}

function updateLearningMaterialsDocCount(channelId) {
  if (!headerDocCountBtn || !headerDocCountValue) return;
  const channel = channelId ? getChannelById(channelId) : null;
  const isMaterials =
    channel && String(channel.name || "").trim().toLowerCase() === "learning materials";
  headerDocCountBtn.classList.toggle("hidden", !isMaterials);
  if (!isMaterials) return;
  const docCount = messagesContainer
    ? messagesContainer.querySelectorAll(".pdf-card-modern").length
    : 0;
  headerDocCountValue.textContent = String(docCount);
}

async function collectAllAttachments() {
  const results = [];
  const ids = [
    ...(channels || []).map((c) => c.id),
    ...(dms || []).map((dm) => `dm:${dm.id}`)
  ].filter(Boolean);

  for (const id of ids) {
    try {
      await ensureMessagesForChannelId(id);
    } catch (_err) {
      continue;
    }
    const msgs = messagesByChannel[id] || [];
    msgs.forEach((m) => {
      results.push(...attachmentsFromMessage(m, id));
    });
  }

  return results;
}

async function renderFilesPanel() {
  if (!filesList) return;
  updateFilesExtraFilters();
  filesList.classList.toggle("files-grid-mode", filesCategoryFilter === "materials");
  if (filesSearchInput) {
    filesQuery = (filesSearchInput.value || "").trim().toLowerCase();
  }
  if (!isAdminUser() && (isStudentUser() || isTeacherUser()) && !currentUserClassesLoaded) {
    await loadCurrentUserClasses(currentWorkspaceId || "default");
  }

  const scopeId = filesScopeMode !== "all" ? (filesScopeChannelId || currentChannelId) : null;
  if (!filesScopeChannelId && scopeId) {
    filesScopeChannelId = String(scopeId);
  }
  // Header text: show current scope
  const scopeLabel = scopeId ? channelLabel(scopeId) : "";

  if (filesTitle) {
    const titles = {
      homework: "Homework Library",
      materials: "Learning Materials",
      media: "Media",
      exams: "Exam Files",
      all: "All Files"
    };
    filesTitle.textContent = titles[filesCategoryFilter] || "All Files";
  }
  if (filesSubtitle) filesSubtitle.textContent = scopeLabel;
  if (filesCategoryTabs && filesCategoryTabs.length) {
    filesCategoryTabs.forEach((btn) => {
      btn.classList.toggle(
        "is-active",
        (btn.getAttribute("data-files-category") || "all") === filesCategoryFilter
      );
    });
  }

  filesList.innerHTML = `<div class="muted" style="padding:10px;">Loading files…</div>`;

  const all = await collectAllAttachments();
  let files = all.map((f) => {
    const meta = getFileCategoryMeta(f);
    const timeLabel = f.time || (f.ts ? formatRelativeTime(f.ts) : "");
    const sizeLabel = f.sizeBytes ? humanSize(f.sizeBytes) : "";
    const descRaw = (f.messageText || "").trim();
    const desc =
      descRaw && descRaw.toLowerCase() !== String(f.name || "").toLowerCase()
        ? descRaw
        : "";
    const iconClass = fileIconByName(f.name || "", f.mime || "");
    const previewUrl = meta.kind === "image" ? f.url : "";
    const fileId = buildFileId({
      channelId: f.channelId,
      messageId: f.messageId,
      url: f.url,
      name: f.name
    });
    return {
      ...f,
      ...meta,
      timeLabel,
      sizeLabel,
      desc,
      iconClass,
      previewUrl,
      fileId
    };
  });

  const currentUserId = String(getCurrentUserId() || "");
  const classNameSet = new Set();
  if (!isAdminUser() && (isStudentUser() || isTeacherUser())) {
    currentUserClassIds.forEach((id) => {
      const ch = getChannelById(id);
      if (ch && ch.name) classNameSet.add(String(ch.name).toLowerCase());
    });
  }

  if (!isAdminUser() && (isStudentUser() || isTeacherUser())) {
    files = files.filter((f) => {
      if (isDmChannel(f.channelId)) return true;
      const ch = f.channel;
      if (!ch) return true;
      if ((ch.workspaceId || "default") !== (currentWorkspaceId || "default")) return false;
      const cat = f.channelCategory;
      if (cat === "classes") {
        return currentUserClassIds.has(String(ch.id));
      }
      if (cat === "homework") {
        if (currentUserClassIds.has(String(ch.id))) return true;
        const cname = String(ch.name || "").toLowerCase();
        for (const className of classNameSet) {
          if (className && cname.includes(className)) return true;
        }
        const members = channelMembersCache.get(String(ch.id));
        if (Array.isArray(members) && members.length) {
          return members.map(String).includes(currentUserId);
        }
        return false;
      }
      return true;
    });
  }

  // Merge registry state (pinned/deleted)
  const registryMap = new Map();
  try {
    const qs = new URLSearchParams();
    qs.set("workspaceId", currentWorkspaceId || "default");
    if (filesScopeMode !== "all" && scopeId) qs.set("channelId", scopeId);
    const reg = await fetchJSON(`/api/files/registry?${qs.toString()}`);
    (reg?.files || []).forEach((r) => {
      if (r && r.fileId) registryMap.set(String(r.fileId), r);
    });
  } catch (_err) {
    /* ignore registry failures */
  }

  if (registryMap.size) {
    files = files.map((f) => {
      const r = registryMap.get(String(f.fileId));
      if (!r) return f;
      const overrideCategory = mapRegistryPurposeToCategory(r.purpose);
      const category = overrideCategory || f.category;
      const badgeLabel =
        category === "homework"
          ? "Homework"
          : category === "exams"
          ? "Exam"
          : category === "media"
          ? "Media"
          : "Material";
      return {
        ...f,
        category,
        badgeLabel,
        badgeClass: `badge-${category}`,
        pinned: !!r.pinned,
        deleted: !!r.deleted,
        replacedFrom: r.replacedFrom || ""
      };
    });
  }

  files = files.filter((f) => !f.deleted);

  // 1) Scope filter
  if (filesScopeMode !== "all" && scopeId) {
    files = files.filter((f) => String(f.channelId) === String(scopeId));
  }

  // 2) Category filter
  if (filesCategoryFilter !== "all") {
    files = files.filter((f) => f.category === filesCategoryFilter);
  }

  // 3) Type filter (applies to All or Media view)
  if (filesTypeFilter !== "all" && (filesCategoryFilter === "all" || filesCategoryFilter === "media")) {
    files = files.filter((f) => f.kind === filesTypeFilter);
  }

  // 4) Quick range filter
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  let minTs = 0;
  if (filesRangeMode === "today") minTs = todayMs;
  if (filesRangeMode === "7d") minTs = now - 7 * 24 * 60 * 60 * 1000;
  if (filesRangeMode === "30d") minTs = now - 30 * 24 * 60 * 60 * 1000;
  if (minTs) {
    files = files.filter((f) => (f.ts || 0) >= minTs);
  }

  // 6) Search filter
  if (filesQuery) {
    files = files.filter((f) => matchesQuery(f, filesQuery));
  }

  // 7) Sorting (pinned always first)
  const sortFn =
    filesSortMode === "oldest"
      ? (a, b) => (a.ts || 0) - (b.ts || 0)
      : filesSortMode === "name"
      ? (a, b) => String(a.name || "").localeCompare(String(b.name || ""))
      : filesSortMode === "size"
      ? (a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0)
      : (a, b) => (b.ts || 0) - (a.ts || 0);
  files.sort((a, b) => {
    const pinDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    if (pinDiff) return pinDiff;
    return sortFn(a, b);
  });

  if (!files.length) {
    filesList.innerHTML = `
      <div class="files-empty">
        <div class="files-empty-icon"><i class="fa-regular fa-folder-open"></i></div>
        <div class="files-empty-title">No files yet</div>
        <div class="files-empty-subtitle">Uploads from your channels will appear here.</div>
      </div>
    `;
    return;
  }

  const canManage = isAdminUser() || isTeacherUser();
  filesCache = files.slice();

  if (filesCategoryFilter === "homework") {
    const groups = new Map();
    files.forEach((f) => {
      const key = f.messageId ? `${String(f.channelId || "")}:${String(f.messageId)}` : String(f.channelId || "");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    });

    filesList.innerHTML = Array.from(groups.entries())
      .map(([channelId, items]) => {
        const base = (items[0].contextLabel || "")
          .split("->")[0]
          .trim();
        const messageTitleRaw = (items[0].messageText || "").split("\n")[0].trim();
        const title = messageTitleRaw || items[0].channelName || (base ? `Homework - ${base}` : "Homework");
        const classLabel = base || "Class";
        const listHtml = items
          .map((f) => {
            const sizeLabel = f.sizeLabel ? escapeHtml(f.sizeLabel) : "";
            return `
              <div class="file-card-compact" data-file-id="${escapeHtml(
                f.fileId || ""
              )}" data-url="${escapeHtml(f.url || "")}" data-channel-id="${escapeHtml(
                f.channelId || ""
              )}" data-message-id="${escapeHtml(f.messageId || "")}">
                <span class="file-icon-emoji"><i class="${escapeHtml(f.iconClass)}"></i></span>
                <span class="file-name">${escapeHtml(f.name || "")}</span>
                <span class="file-size">${sizeLabel}</span>
                <button class="file-btn file-btn-ghost" type="button" data-action="open">Open</button>
                <button class="file-btn file-btn-ghost" type="button" data-action="jump">Go to chat</button>
              </div>
            `;
          })
          .join("");

        return `
          <section class="hw-card" data-channel-id="${escapeHtml(channelId.split(":")[0])}">
            <div class="hw-head">
              <div>
                <h3 class="hw-title">${escapeHtml(title)}</h3>
                <div class="hw-meta">
                  <span class="hw-pill">Due: Not set</span>
                  <span class="hw-pill">Class: ${escapeHtml(classLabel)}</span>
                  <span class="hw-pill hw-pill-open">Open</span>
                </div>
              </div>
              <button class="file-btn file-btn-primary" type="button" data-action="open-homework">Open homework</button>
            </div>
            <div class="hw-files">
              <div class="hw-files-title">Attachments</div>
              ${listHtml || `<div class="muted">No attachments yet.</div>`}
            </div>
          </section>
        `;
      })
      .join("");
    return;
  }

  filesList.innerHTML = files
    .map((f) => {
      const preview = f.previewUrl
        ? `<div class="file-preview"><img src="${escapeHtml(f.previewUrl)}" alt=""></div>`
        : "";
      const badge = `<span class="badge ${escapeHtml(f.badgeClass)}">${escapeHtml(
        f.badgeLabel
      )}</span>`;
      const pinnedBadge = f.pinned
        ? `<span class="badge badge-pinned">Pinned</span>`
        : "";
      const context = escapeHtml(f.contextLabel || "Channel");
      const author = escapeHtml(f.author || "Unknown");
      const timeLabel = escapeHtml(f.timeLabel || "");
      const sizeLabel = f.sizeLabel ? escapeHtml(f.sizeLabel) : "";
      const desc = f.desc ? `<div class="file-desc">${escapeHtml(f.desc)}</div>` : "";
      const adminActions = canManage
        ? `
          <div class="file-actions-admin">
            <button class="file-btn file-btn-ghost" type="button" data-action="pin">${f.pinned ? "Unpin" : "Pin"}</button>
            <button class="file-btn file-btn-ghost" type="button" data-action="replace">Replace</button>
            <button class="file-btn file-btn-danger" type="button" data-action="delete">Delete</button>
          </div>
        `
        : "";

      return `
        <article class="file-card file-card-v2" data-file-id="${escapeHtml(
          f.fileId || ""
        )}" data-kind="${escapeHtml(f.kind)}" data-channel-id="${escapeHtml(
          f.channelId || ""
        )}" data-message-id="${escapeHtml(f.messageId || "")}" data-url="${escapeHtml(
          f.url || ""
        )}">
          <div class="file-card-left">
            <div class="file-icon file-icon-${escapeHtml(f.kind)}" aria-hidden="true">
              <i class="${escapeHtml(f.iconClass)}"></i>
            </div>
          </div>
          <div class="file-card-main">
            <div class="file-top">
              <h3 class="file-title" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</h3>
              <div class="file-badges">${badge}${pinnedBadge}</div>
            </div>
            <div class="file-meta file-meta-row">
              <span class="file-meta-item"><i class="fa-solid fa-location-dot"></i> <b>${context}</b></span>
              <span class="file-meta-dot">•</span>
              <span class="file-meta-item"><i class="fa-solid fa-user"></i> ${author}</span>
              <span class="file-meta-dot">•</span>
              <span class="file-meta-item"><i class="fa-regular fa-clock"></i> ${timeLabel || "Just now"}</span>
              ${sizeLabel ? `<span class="file-meta-dot">•</span><span class="file-meta-item"><i class="fa-solid fa-file"></i> ${sizeLabel}</span>` : ""}
            </div>
            ${desc}
            <div class="file-actions file-actions-v2">
              <button class="file-btn file-btn-primary" type="button" data-action="open">Open</button>
              <button class="file-btn" type="button" data-action="download">Download</button>
              <button class="file-btn" type="button" data-action="jump">Go to chat</button>
              ${adminActions}
            </div>
          </div>
          <div class="file-card-right">
            ${preview}
          </div>
        </article>
      `;
    })
    .join("");
}

async function renderNotificationsPanel() {
  const panel = document.getElementById("notificationsPanel");
  if (!panel) return;

  const NOTIF_STORAGE_KEY = "worknest_notifs_v1";
  const NOTIF_READ_AT_KEY = "worknest_notifs_read_at";

  const getNotifReadAt = () => {
    try {
      const raw = localStorage.getItem(NOTIF_READ_AT_KEY);
      const val = raw ? Number(raw) : 0;
      return Number.isFinite(val) ? val : 0;
    } catch (_err) {
      return 0;
    }
  };

  const setNotifReadAt = (ts) => {
    try {
      localStorage.setItem(NOTIF_READ_AT_KEY, String(ts || Date.now()));
    } catch (_err) {
      /* ignore */
    }
  };

  const loadStoredNotifs = () => {
    try {
      const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_err) {
      return [];
    }
  };

  const formatRelative = (ts) => {
    if (!ts) return "Just now";
    const diff = Date.now() - ts;
    const abs = Math.abs(diff);
    const mins = Math.round(abs / 60000);
    if (abs < 60000) return diff >= 0 ? "Just now" : "Soon";
    if (mins < 60) return diff >= 0 ? `${mins}m ago` : `In ${mins}m`;
    const hrs = Math.round(abs / 3600000);
    if (hrs < 24) return diff >= 0 ? `${hrs}h ago` : `In ${hrs}h`;
    const days = Math.round(abs / 86400000);
    return diff >= 0 ? `${days}d ago` : `In ${days}d`;
  };

  const getNotifMeta = ({ title = "", context = "", type = "" }) => {
    const hay = `${title} ${context}`.toLowerCase();
    let kind = String(type || "").toLowerCase();
    if (!kind || kind === "calendar") {
      if (hay.includes("homework")) kind = "homework";
      else if (hay.includes("exam") || hay.includes("test")) kind = "exam";
      else if (hay.includes("announcement")) kind = "announcement";
      else if (hay.includes("mention") || hay.includes("@")) kind = "mention";
      else if (hay.includes("report") || hay.includes("alert")) kind = "alert";
      else if (hay.includes("message") || hay.includes("reply")) kind = "message";
      else if (String(type || "").toLowerCase() === "calendar") kind = "calendar";
      else kind = "system";
    }

    const meta = {
      homework: { icon: "fa-solid fa-book-open", label: "Homework", priority: "high" },
      exam: { icon: "fa-solid fa-clipboard-list", label: "Exam", priority: "high" },
      announcement: { icon: "fa-solid fa-bullhorn", label: "Announcement", priority: "medium" },
      mention: { icon: "fa-solid fa-at", label: "Mention", priority: "high" },
      message: { icon: "fa-solid fa-message", label: "Message", priority: "medium" },
      alert: { icon: "fa-solid fa-triangle-exclamation", label: "Alert", priority: "high" },
      calendar: { icon: "fa-solid fa-calendar-days", label: "Schedule", priority: "medium" },
      system: { icon: "fa-solid fa-gear", label: "System", priority: "low" }
    };
    return meta[kind] ? { ...meta[kind], kind } : { ...meta.system, kind: "system" };
  };

  try {
    if (typeof initCalendarIfNeeded === "function") initCalendarIfNeeded();
    const today = ymd(new Date());
    const to = addDays(today, 7);
    await fetchCalendarEvents(today, to);
  } catch (_err) {
    /* ignore */
  }

  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const in7 = now + 7 * 24 * 60 * 60 * 1000;

  const stored = loadStoredNotifs()
    .filter((n) => n && n.ts && n.ts >= weekAgo)
    .map((n) => {
      const channel = n.channelId ? getChannelById(n.channelId) : null;
      const context = channel ? channel.name : "System";
      const title = String(n.title || "Notification");
      const meta = getNotifMeta({ title, context });
      const author = n.author ? `by ${n.author}` : "";
      let body = title;
      if (title.toLowerCase().includes("pin")) {
        body = `Pinned message ${author}`.trim();
      }
      if (title.toLowerCase().includes("unpin")) {
        body = `Unpinned message ${author}`.trim();
      }
      return {
        id: n.id || `notif-${n.ts}`,
        title: meta.label,
        context,
        body,
        ts: n.ts,
        createdAt: n.ts,
        kind: meta.kind,
        priority: meta.priority,
        icon: meta.icon,
        channelId: n.channelId || "",
        messageId: n.messageId || "",
        actionLabel: "Open"
      };
    });

  const upcoming = (calEventsCache || [])
    .map((e) => {
      const t = e.startTime ? new Date(`${e.date}T${e.startTime}:00`).getTime() : 0;
      return { ...e, _t: t };
    })
    .filter((e) => e._t && e._t >= now && e._t <= in7 && !e.done)
    .sort((a, b) => a._t - b._t)
    .map((e) => {
      const meta = getNotifMeta({ title: e.title || "", context: "Schedule", type: "calendar" });
      const timeLabel = `${e.date || ""}${e.startTime ? " " + e.startTime : ""}`.trim();
      return {
        id: `cal-${e.id || e.date}-${e.startTime || ""}`,
        title: e.title || "Upcoming event",
        context: "Schedule",
        body: timeLabel || "Upcoming schedule reminder",
        ts: e._t,
        createdAt: null,
        kind: meta.kind,
        priority: meta.priority,
        icon: meta.icon,
        actionLabel: e.meetLink ? "Join" : "Open",
        link: e.meetLink || ""
      };
    });

  const notifications = [...upcoming, ...stored].sort((a, b) => b.ts - a.ts);
  const readAt = getNotifReadAt();
  const unreadCount = notifications.filter((n) => n.createdAt && n.createdAt > readAt).length;
  if (notificationBadge) {
    notificationBadge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    updateNotificationBadgeVisibility();
  }

  const listHtml = notifications.length
    ? notifications
        .map((n) => {
          const isUnread = n.createdAt && n.createdAt > readAt;
          const priorityLabel =
            n.priority === "high" ? "Action" : n.priority === "medium" ? "Update" : "Info";
          const openBtn = n.channelId || n.link
            ? `<button class="notif-open-btn" type="button" data-id="${escapeHtml(n.id)}">${escapeHtml(
                n.actionLabel || "Open"
              )}</button>`
            : "";
          return `
            <div class="notif-card ${isUnread ? "is-unread" : ""}" data-type="${escapeHtml(
              n.kind
            )}" data-id="${escapeHtml(n.id)}">
              <div class="notif-icon notif-${escapeHtml(n.kind)}">
                <i class="${escapeHtml(n.icon)}"></i>
              </div>
              <div class="notif-content">
                <div class="notif-top">
                  <div class="notif-title">${escapeHtml(n.title)}</div>
                  <span class="notif-pill is-${escapeHtml(n.priority)}">${escapeHtml(
                    priorityLabel
                  )}</span>
                </div>
                <div class="notif-context">${escapeHtml(n.context)}</div>
                <div class="notif-body">${escapeHtml(n.body)}</div>
                <div class="notif-footer">
                  <span class="notif-time">${escapeHtml(formatRelative(n.ts))}</span>
                  ${openBtn}
                </div>
              </div>
            </div>
          `;
        })
        .join("")
    : `
      <div class="notif-empty">
        <div class="notif-empty-icon"><i class="fa-regular fa-bell"></i></div>
        <div class="notif-empty-title">You are all caught up</div>
        <div class="notif-empty-subtitle">
          Homework, messages, and updates will appear here when needed.
        </div>
      </div>
    `;

  panel.innerHTML = `
    <div class="notifications-panel">
      <div class="notif-header">
        <div>
          <h1>Notifications</h1>
          <p class="notif-subtitle">Last 7 days · Your action center</p>
        </div>
        <button class="notif-mark-btn" type="button" id="notifMarkAll" ${
          notifications.length ? "" : "disabled"
        }>Mark all as read</button>
      </div>

      <div class="notif-toolbar">
        <div class="notif-filters" id="notifFilters">
          <button class="notif-filter is-active" type="button" data-filter="all">All</button>
          <button class="notif-filter" type="button" data-filter="mention">Mentions</button>
          <button class="notif-filter" type="button" data-filter="homework">Homework</button>
          <button class="notif-filter" type="button" data-filter="exam">Exams</button>
          <button class="notif-filter" type="button" data-filter="system">System</button>
        </div>
      </div>

      <div class="notif-list" id="notifList">
        ${listHtml}
      </div>
    </div>
  `;

  const markBtn = panel.querySelector("#notifMarkAll");
  if (markBtn) {
    markBtn.addEventListener("click", () => {
      setNotifReadAt(Date.now());
      renderNotificationsPanel();
    });
  }

  const filters = panel.querySelectorAll(".notif-filter");
  const listEl = panel.querySelector("#notifList");
  filters.forEach((btn) => {
    btn.addEventListener("click", () => {
      filters.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const filter = btn.getAttribute("data-filter") || "all";
      listEl?.querySelectorAll(".notif-card").forEach((card) => {
        const type = card.getAttribute("data-type") || "";
        const show = filter === "all" || type === filter;
        card.style.display = show ? "" : "none";
      });
    });
  });

  const byId = new Map(notifications.map((n) => [String(n.id), n]));
  panel.querySelectorAll(".notif-open-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id") || "";
      const notif = byId.get(id);
      if (!notif) return;
      if (notif.link) {
        window.open(notif.link, "_blank", "noopener");
        return;
      }
      if (notif.channelId) {
        showPanel("chatPanel");
        await selectChannel(notif.channelId);
        if (notif.messageId) {
          scrollToMessageInChat(notif.messageId);
        }
      }
    });
  });
}

async function renderAnalyticsPanel() {
  const panel = document.getElementById("analyticsPanel");
  if (!panel) return;

  panel.innerHTML = `<div class="analytics-wrap"><div class="muted">Loading school statistics…</div></div>`;

  try {
    const workspaceId = (sessionUser && sessionUser.workspaceId) || currentWorkspaceId || "default";
    const users = await fetchJSON(
      `/api/users?workspaceId=${encodeURIComponent(workspaceId)}`
    );
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
    const courseRows = Object.entries(courseCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(
        ([course, count]) => `<li><span>${escapeHtml(course)}</span><strong>${count}</strong></li>`
      )
      .join("");

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
      workspaceChannels.map((c) =>
        ensureMessagesForChannelId(c.id).catch(() => null)
      )
    );

    const messageCounts = new Map();
    const userById = new Map(
      list
        .map((u) => [String(u.id || u.userId || ""), u])
        .filter(([id]) => id)
    );
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
        const homeworkCount = hw ? messageCounts.get(hw.id) || 0 : 0;
        return {
          id: ch.id,
          name: ch.name,
          messages,
          homework: homeworkCount,
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

    const classRowsSorted = classRows
      .slice()
      .sort((a, b) => b.messages - a.messages);

    const maxMessages = Math.max(1, ...classRowsSorted.map((r) => r.messages || 0));
    const classTableRows = classRowsSorted
      .map((row) => {
        const ratio = Math.round((row.messages / maxMessages) * 100);
        const status =
          row.messages >= 8 ? "active" : row.messages >= 3 ? "low" : "risk";
        return `
          <div class="class-row">
            <div class="class-name">${escapeHtml(row.name)}</div>
            <div class="class-students">${row.students}</div>
            <div class="class-bar">
              <span style="width:${ratio}%"></span>
            </div>
            <div class="class-homework">${row.homework}</div>
            <div class="class-status status-${status}">${status}</div>
          </div>
        `;
      })
      .join("");

    const teacherRows = teachers
      .map((t) => {
        const key = t.name || t.email || t.username || "";
        const messages = authorCounts.get(key) || 0;
        const homeworkCount = homeworkPostsByTeacher.get(key) || 0;
        const last = authorLast.get(key) || "—";
        return `
          <div class="teacher-card">
            <div class="teacher-name">${escapeHtml(t.name || t.email || "Teacher")}</div>
            <div class="teacher-meta">Messages: ${messages} · Homework: ${homeworkCount}</div>
            <div class="teacher-last">Last active: ${escapeHtml(last)}</div>
          </div>
        `;
      })
      .join("");

    const anyTeacherActive = teachers.some((t) => {
      const key = t.name || t.email || t.username || "";
      return (authorCounts.get(key) || 0) > 0;
    });

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
    const donutStops = [
      Math.round((engagementCounts.high / totalEngagement) * 100),
      Math.round((engagementCounts.medium / totalEngagement) * 100)
    ];
    const donutStyle = `conic-gradient(#22c55e 0 ${donutStops[0]}%, #f59e0b ${donutStops[0]}% ${donutStops[0] + donutStops[1]}%, #ef4444 ${donutStops[0] + donutStops[1]}% 100%)`;

    const insights = [];
    if (inactiveStudents.length) {
      insights.push(`⚠️ ${inactiveStudents.length} students inactive`);
    }
    if (classRows.some((r) => r.messages < 2)) {
      insights.push("📉 Some classes show low message activity");
    }
    if (homeworkCreated === 0) {
      insights.push("📌 No homework channels created yet");
    }
    if (!insights.length) {
      insights.push("✅ Activity looks healthy this week");
    }

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
      insights,
      topCourses: Object.entries(courseCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([course, count]) => `${course}: ${count}`)
    });

    panel.innerHTML = `
      <div class="analytics-wrap">
        <div class="analytics-header">
          <div>
            <h2>School Analytics</h2>
            <p class="muted">Workspace: ${escapeHtml(getWorkspaceLabel(workspaceId))}</p>
          </div>
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
        </div>

        <div class="analytics-grid">
          <div class="stat-card">
            <div class="stat-label">Students</div>
            <div class="stat-value">${students.length}</div>
            <div class="stat-meta">Active: ${activeStudents.length} · Inactive: ${inactiveStudents.length}</div>
            <div class="stat-trend">No change this week</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Teachers</div>
            <div class="stat-value">${teachers.length}</div>
            <div class="stat-meta">Admins: ${admins.length}</div>
            <div class="stat-trend">Last active: ${anyTeacherActive ? "Recent" : "—"}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Groups</div>
            <div class="stat-value">${totalGroups}</div>
            <div class="stat-meta">Classes ${channelCounts.classes} · Clubs ${channelCounts.clubs} · Tests ${channelCounts.exams}</div>
            <div class="stat-trend">Most active: ${classRowsSorted[0]?.name ? escapeHtml(classRowsSorted[0].name) : "—"}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">School Tools</div>
            <div class="stat-value">${channelCounts.tools}</div>
            <div class="stat-meta">Homework ${channelCounts.homework}</div>
            <div class="stat-trend">Most used: ${escapeHtml(mostUsedTool)}</div>
          </div>
        </div>

        <div class="analytics-section">
          <div class="section-title">School Activity – Last 7 days</div>
          <div class="activity-chart">
            <div class="activity-legend">
              <span><i class="dot dot-blue"></i>Messages</span>
              <span><i class="dot dot-green"></i>Homework</span>
              <span><i class="dot dot-orange"></i>Exams</span>
            </div>
            <div class="activity-bars">
              ${Array.from({ length: 7 })
                .map((_, idx) => {
                  const base = Math.max(1, categoryCounts.messages);
                  const msgHeight = Math.max(6, Math.round((categoryCounts.messages / base) * 40));
                  const hwHeight = Math.max(4, Math.round((categoryCounts.homework / base) * 32));
                  const exHeight = Math.max(4, Math.round((categoryCounts.exams / base) * 28));
                  return `
                    <div class="activity-day">
                      <span class="bar bar-blue" style="height:${msgHeight}px"></span>
                      <span class="bar bar-green" style="height:${hwHeight}px"></span>
                      <span class="bar bar-orange" style="height:${exHeight}px"></span>
                    </div>
                  `;
                })
                .join("")}
            </div>
            <div class="activity-note">Based on loaded messages</div>
          </div>
        </div>

        <div class="analytics-section">
          <div class="section-title">Class Engagement Overview</div>
          <div class="class-table">
            <div class="class-head">
              <span>Class</span>
              <span>Students</span>
              <span>Messages</span>
              <span>Homework</span>
              <span>Status</span>
            </div>
            ${classTableRows || `<div class="muted">No classes yet.</div>`}
          </div>
        </div>

        <div class="analytics-section analytics-two">
          <div>
            <div class="section-title">Teacher Activity</div>
            <div class="teacher-list">
              ${teacherRows || `<div class="muted">No teachers yet.</div>`}
            </div>
          </div>
          <div>
            <div class="section-title">Homework Usage & Completion</div>
            <div class="stat-card">
              <div class="stat-label">Homework created</div>
              <div class="stat-value">${homeworkCreated}</div>
              <div class="stat-meta">Avg submissions per homework: ${avgSubmissions}</div>
              <div class="stat-trend">Completion rate: ${completionRate}%</div>
            </div>
            <div class="section-title">Student Engagement Levels</div>
            <div class="engagement-card">
              <div class="donut" style="background:${donutStyle};"></div>
              <div class="engagement-legend">
                <span><i class="dot dot-green"></i>High ${engagementCounts.high}</span>
                <span><i class="dot dot-orange"></i>Medium ${engagementCounts.medium}</span>
                <span><i class="dot dot-red"></i>Inactive ${engagementCounts.low}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="analytics-section">
          <div class="section-title">Admin Insights</div>
          <div class="insights-list">
            ${insights.map((i) => `<div class="insight-item">${escapeHtml(i)}</div>`).join("")}
          </div>
        </div>

        <div class="analytics-section">
          <div class="section-title">Course Enrollment</div>
          <ul class="course-list">
            ${courseRows || "<li><span>No courses</span><strong>0</strong></li>"}
          </ul>
        </div>
      </div>
    `;
  } catch (err) {
    console.error("Failed to load analytics", err);
    panel.innerHTML = `<div class="analytics-wrap"><div class="muted">Could not load analytics.</div></div>`;
  }
}

async function openCurrentUserProfile() {
  const name =
    (sessionUser && (sessionUser.name || sessionUser.username || sessionUser.email)) || "You";
  const avatarUrl = (sessionUser && sessionUser.avatarUrl) || "";
  await openUserProfile(name, avatarUrl, sessionUser || null);
}

function mountSchoolEmailUiToEmailPanel() {
  if (!schoolEmailSettingsPage || !emailPanelBody) return;
  if (schoolEmailHeaderActions && schoolEmailHeaderActions.parentElement !== emailPanelHeaderActions) {
    emailPanelHeaderActions.replaceChildren(schoolEmailHeaderActions);
  }
  if (schoolSettingsHeaderToggle && schoolSettingsHeaderToggle.parentElement !== emailPanelToggle) {
    emailPanelToggle.replaceChildren(schoolSettingsHeaderToggle);
  }
  if (schoolEmailSettingsPage.parentElement !== emailPanelBody) {
    emailPanelBody.replaceChildren(schoolEmailSettingsPage);
  }
  document.body.classList.remove("no-school-scroll");
  setSchoolEmailHeaderMode(false);
}

function restoreSchoolEmailUiToChatHeader() {
  if (schoolEmailHeaderActions && schoolEmailHeaderActions.parentElement !== schoolEmailHeaderActionsHome) {
    schoolEmailHeaderActionsHome?.appendChild(schoolEmailHeaderActions);
  }
  if (schoolSettingsHeaderToggle && schoolSettingsHeaderToggle.parentElement !== schoolSettingsHeaderToggleHome) {
    schoolSettingsHeaderToggleHome?.appendChild(schoolSettingsHeaderToggle);
  }
  if (schoolEmailSettingsPage && schoolEmailSettingsPage.parentElement !== schoolEmailSettingsPageHome) {
    schoolEmailSettingsPageHome?.appendChild(schoolEmailSettingsPage);
  }
  schoolEmailSettingsPage?.classList.add("hidden");
  schoolEmailSettingsPage?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("no-school-scroll");
  setSchoolEmailHeaderMode(false);
}

function mountUserProfileCardToAdminPanel() {
  if (!adminPanelContent || !userProfileInnerCard || !userProfileModal) return;
  if (userProfileInnerCard.parentElement !== adminPanelContent) {
    adminPanelContent.replaceChildren(userProfileInnerCard);
  }
  userProfileModal.classList.add("hidden");
}

function restoreUserProfileCardToModal() {
  if (!userProfileModal || !userProfileInnerCard) return;
  if (userProfileInnerCard.parentElement !== userProfileModal) {
    userProfileModal.appendChild(userProfileInnerCard);
  }
}

function toggleProfilePopover() {
  if (!profilePopover) return;
  const isHidden = profilePopover.hidden;
  document.querySelectorAll(".profile-popover").forEach((p) => {
    p.hidden = true;
  });
  if (isHidden) {
    refreshProfilePopover();
    profilePopover.hidden = false;
  } else {
    profilePopover.hidden = true;
  }
}

function refreshProfilePopover() {
  if (!profilePopover) return;
  const name =
    (sessionUser && (sessionUser.name || sessionUser.username || sessionUser.email)) || "User";
  const avatarUrl = getUserAvatarSrc(sessionUser, DEFAULT_AVATAR_DATA_URL);
  if (profilePopoverName) profilePopoverName.textContent = name;
  applyRoleLabel(profilePopoverRole, sessionUser?.role);
  if (profilePopoverPresence) profilePopoverPresence.textContent = sessionUser ? "Available" : "Offline";
  if (profilePopoverAvatar) {
    applyAvatarToNode(
      profilePopoverAvatar,
      generateInitials(name),
      avatarUrl,
      name,
      sessionUser?.role || ""
    );
  }
}

function initRailAndComposerListeners() {
  document.addEventListener("click", (e) => {
    if (!inputBar || !rteEditor) return;
    const target = e.target;
    const isInsideInput = inputBar.contains(target);
    const pickerEl = document.getElementById("emojiPicker");
    const isEmojiPicker = pickerEl && pickerEl.contains(target);
    if (!isInsideInput && !isEmojiPicker) {
      collapseComposerIfEmpty();
    }
  });

  window.addEventListener("DOMContentLoaded", () => {
    // ===== Theme (light/dark) =====
    (() => {
      const KEY = "worknest_theme";
      const root = document.documentElement;
      const btn = document.getElementById("themeToggle");

      const apply = (mode) => {
        const isDark = mode === "dark";
        if (isDark) root.setAttribute("data-theme", "dark");
        else root.removeAttribute("data-theme");

        if (btn) {
          const icon = btn.querySelector("i");
          if (icon) {
            icon.classList.remove("fa-moon", "fa-sun");
            icon.classList.add(isDark ? "fa-sun" : "fa-moon");
          }
          btn.title = isDark ? "Switch to light" : "Switch to dark";
        }
      };

      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") {
        apply(saved);
      } else {
        const prefersDark =
          window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
        apply(prefersDark ? "dark" : "light");
      }

      if (btn) {
        btn.addEventListener("click", () => {
          const isDark = root.getAttribute("data-theme") === "dark";
          const next = isDark ? "light" : "dark";
          localStorage.setItem(KEY, next);
          apply(next);
        });
      }
    })();

    const railButtons = document.querySelectorAll(".app-rail-btn[data-rail-id]");

    railButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.railId;
        openRailSection(id);

        document.querySelectorAll(".app-rail-btn").forEach((b) => b.classList.remove("app-rail-btn-active"));
        btn.classList.add("app-rail-btn-active");
      });
    });

    const savedRail = localStorage.getItem(LAST_RAIL_VIEW_KEY) || "messages";
    const selectRail =
      savedRail === "admin" && !isAdminUser() ? "messages" : savedRail;
    const initialBtn =
      document.querySelector(`.app-rail-btn[data-rail-id="${selectRail}"]`) || railButtons[0];
    if (initialBtn) {
      openRailSection(initialBtn.dataset.railId || "messages");
      document
        .querySelectorAll(".app-rail-btn")
        .forEach((b) => b.classList.remove("app-rail-btn-active"));
      initialBtn.classList.add("app-rail-btn-active");
    } else {
      openRailSection("messages");
    }
    attachLiveEvents();
  });
}

// ======================= FUNCTION HANDLER ========================
function openRailSection(id) {
  const targetId = id || "messages";
  const isChat = targetId === "messages";
  setChatColumnsVisibility(isChat);
  setAppFullScreenMode(!isChat);
  if (targetId !== "admin" && superAdminLanding) {
    setSuperAdminLanding(false);
  }
  const savedTargetId =
    targetId === "admin" && !isAdminUser() ? "messages" : targetId;
  if (LAST_RAIL_VIEW_KEY) {
    try {
      localStorage.setItem(LAST_RAIL_VIEW_KEY, savedTargetId);
    } catch (_err) {
      /* ignore */
    }
  }
  switch (targetId) {
    case "messages":
      closeAllUnreads();
      showPanel("chatPanel");
      break;
    case "notifications":
      openNotificationsView();
      break;
    case "profile":
      toggleProfilePopover();
      break;
    case "files":
      openFilesPanel();
      break;
    case "calendar":
      openCalendarPanel();
      break;
    case "email":
      void openEmailPanel();
      break;
    case "ai":
      openAiAssistant();
      break;
    case "admin":
      void openAdminProfilePanel();
      break;
    case "analytics":
      if (!isAdminUser()) return;
      openAnalyticsPanel();
      break;
    case "live":
      openLivePanel();
      break;
    case "home":
    default:
      // default: return to main view
      if (unreadsOverlay) unreadsOverlay.classList.add("hidden");
  }
}

function setChatColumnsVisibility(visible) {
  document.body.classList.toggle("chat-columns-visible", visible);
}

function setAppFullScreenMode(fullscreen) {
  document.body.classList.toggle("app-fullscreen-mode", fullscreen);
}

const LIVE_STATUS_LABELS = {
  scheduled: "Scheduled",
  live: "Live",
  ended: "Ended",
  canceled: "Canceled"
};

const LIVE_AUDIENCE_LABELS = {
  general: "General (all users)",
  teachers: "Teachers only"
};

function normalizeLiveAudience(audience) {
  const raw = String(audience || "").toLowerCase();
  return LIVE_AUDIENCE_LABELS[raw] ? raw : null;
}

function getAudiencePillClass(audience) {
  const normalized = normalizeLiveAudience(audience);
  return normalized ? `live-pill live-audience live-audience-${normalized}` : "";
}

function getAudienceLabel(audience) {
  const normalized = normalizeLiveAudience(audience);
  return normalized ? LIVE_AUDIENCE_LABELS[normalized] : null;
}

function setLiveScope(scope) {
  if (!scope) return;
  liveTabs.forEach((tab) => {
    const target = tab.dataset.liveScope || "";
    tab.classList.toggle("is-active", target === scope);
  });
  loadLiveSessions(scope);
}

function dedupeSessions(list = []) {
  const seen = new Set();
  const results = [];
  list.forEach((session) => {
    if (!session || !session.id) return;
    if (seen.has(session.id)) return;
    seen.add(session.id);
    results.push(session);
  });
  return results;
}

function filterLiveSessions() {
  return liveSessions
    .slice()
    .sort((a, b) => {
      const aKey = `${a.date} ${a.start_time}`;
      const bKey = `${b.date} ${b.start_time}`;
      return aKey.localeCompare(bKey);
    });
}

async function loadLiveSessions(scope = liveScope) {
  if (!livePanel) return;
  try {
    const res = await fetchJSON(`/api/live-sessions?scope=${encodeURIComponent(scope)}`);
    liveSessions = Array.isArray(res) ? dedupeSessions(res) : [];
    renderLiveSchedule();
    renderLiveRecents();
    if (liveRecentMeta) {
      liveRecentMeta.textContent = `${liveSessions.length} session${liveSessions.length === 1 ? "" : "s"}`;
    }
  } catch (err) {
    console.error("Failed to load live sessions", err);
    showToast("Could not load live sessions");
  }
}

function renderLiveSchedule() {
  if (!liveSessionsList) return;
  const list = filterLiveSessions(liveScope);
  if (!list.length) {
    liveSessionsList.innerHTML = `
      <div class="live-empty-state">
        <p>No sessions scheduled</p>

        <button id="launchLiveNowBtn" class="btn btn-primary live-launch-btn" type="button">
          <i class="fa-solid fa-bolt"></i>
          Launch Live Now
        </button>
      </div>
    `;
    const launchBtn = liveSessionsList.querySelector("#launchLiveNowBtn");
    if (launchBtn) {
      launchBtn.addEventListener("click", launchLiveNow);
      updateLaunchButtonLabel();
    }
    return;
  }
  liveSessionsList.innerHTML = "";
  list.forEach((session) => {
    const row = document.createElement("div");
    row.className = "live-row";
    const details = document.createElement("div");
    details.className = "live-row-content";
    const head = document.createElement("div");
    head.className = "live-row-head";
    const title = document.createElement("div");
    title.className = "live-row-title";
    title.textContent = session.title || "Live Class";
    const titleGroup = document.createElement("div");
    titleGroup.className = "live-row-title-group";
    titleGroup.appendChild(title);
    const audienceLabel = getAudienceLabel(session.audience);
    head.appendChild(titleGroup);
    const meta = document.createElement("div");
    meta.className = "live-row-detail";
    const dateText = session.date ? new Date(`${session.date}T${session.start_time || "00:00"}`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "";
    meta.innerHTML = `<span>${dateText}</span><span>${session.start_time || ""}${session.end_time ? ` - ${session.end_time}` : ""}</span>`;
    const linkInfo = document.createElement("div");
    linkInfo.className = "live-row-detail";
    linkInfo.innerHTML = `<span>${session.meeting_url ? "Link ready" : "Link missing"}</span>`;
    details.appendChild(head);
    details.appendChild(meta);
    details.appendChild(linkInfo);
    const channelInfo = document.createElement("div");
    channelInfo.className = "live-row-channel-info";
    const displayChannelName = session.channel_name || getChannelById(session.channel_id)?.name;
    if (displayChannelName) {
      const channelNameEl = document.createElement("span");
      channelNameEl.className = "live-row-channel-name";
      channelNameEl.textContent = displayChannelName;
      channelInfo.appendChild(channelNameEl);
    }
    if (audienceLabel) {
      const audienceValue = document.createElement("span");
      audienceValue.className = "live-row-channel-audience";
      audienceValue.textContent = audienceLabel;
      channelInfo.appendChild(audienceValue);
    }
    const statusText = LIVE_STATUS_LABELS[session.status] || session.status || "Scheduled";
    if (statusText) {
      const statusValue = document.createElement("span");
      statusValue.className = "live-row-channel-status";
      statusValue.textContent = statusText;
      channelInfo.appendChild(statusValue);
    }
    if (channelInfo.childElementCount) {
      row.appendChild(channelInfo);
    }
    const actions = document.createElement("div");
    actions.className = "live-row-actions live-row-actions-bottom";
    const joinBtn = document.createElement("button");
    joinBtn.type = "button";
    joinBtn.className = "live-btn primary live-btn-join";
    joinBtn.innerHTML = '<i class="fa-solid fa-video"></i>';
    joinBtn.addEventListener("click", () => joinLiveSession(session.id));
    actions.appendChild(joinBtn);
    let editWrapper = null;
    if (isAdminUser() || isTeacherUser()) {
      editWrapper = document.createElement("div");
      editWrapper.className = "live-row-edit";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "live-btn live-btn-edit";
      editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
      editBtn.addEventListener("click", () => openLiveSessionModal(session));
      const attendanceBtn = document.createElement("button");
      attendanceBtn.type = "button";
      attendanceBtn.className = "live-btn live-btn-attendance";
      attendanceBtn.innerHTML = '<i class="fa-solid fa-clipboard-list"></i>';
      attendanceBtn.addEventListener("click", () => openAttendanceModal(session));
      actions.appendChild(attendanceBtn);
      editWrapper.appendChild(editBtn);
    }
    row.appendChild(details);
    row.appendChild(actions);
    if (editWrapper) {
      row.appendChild(editWrapper);
    }
    liveSessionsList.appendChild(row);
  });
}

async function launchLiveNow() {
  try {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");

    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const start_time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    const end_time = `${pad(end.getHours())}:${pad(end.getMinutes())}`;

    const payload = {
      workspace_id: currentWorkspaceId || "default",
      audience: "general",

      title: "Instant Live Session",
      description: "Instant live class started by teacher",
      date,
      start_time,
      end_time,

      meeting_url: `https://meet.jit.si/studistalk-live-${Date.now()}`,
      meeting_pass: "",
      student_notes: "Instant live session",

      status: "scheduled",
      autopost_mode: "none"
    };

    const created = await fetchJSON("/api/live-sessions", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    await loadLiveSessions(liveScope);
    if (created?.id) await joinLiveSession(created.id);
  } catch (err) {
    console.error(err);
    showToast("Failed to start live session.");
  }
}

function updateLaunchButtonLabel() {
  const btn = document.getElementById("launchLiveNowBtn");
  if (!btn) return;
  const inChannel = currentChannelId && String(currentChannelId).trim();
  const label = inChannel ? "Launch Live in This Class" : "Launch Workspace Live";
  btn.innerHTML = `<i class="fa-solid fa-bolt"></i> ${label}`;
}

function renderLiveRecents() {
  if (!liveRecentList) return;
  const recents = liveSessions.slice(-3).reverse();
  liveRecentList.innerHTML = "";
  if (!recents.length) {
    liveRecentList.innerHTML = '<div class="muted">No recent sessions.</div>';
    return;
  }
  recents.forEach((session) => {
    const row = document.createElement("div");
    row.className = "live-row";
    const title = document.createElement("div");
    const audienceLabel = getAudienceLabel(session.audience);
    const audienceSpan = audienceLabel
      ? `<span class="${getAudiencePillClass(session.audience)}">${escapeHtml(audienceLabel)}</span>`
      : "";
    title.innerHTML = `
      <div class="live-row-title">${escapeHtml(session.title)}</div>
      <div class="live-row-sub">
        <span>${escapeHtml(getChannelById(session.channel_id)?.name || "Class")}</span>
        <span>${escapeHtml(session.date || "")}</span>
        ${audienceSpan}
      </div>
    `;
    const actions = document.createElement("div");
    actions.className = "live-row-actions";
    const joinBtn = document.createElement("button");
    joinBtn.type = "button";
    joinBtn.className = "live-btn ghost";
    joinBtn.textContent = "View";
    actions.appendChild(joinBtn);
    row.appendChild(title);
    row.appendChild(actions);
    liveRecentList.appendChild(row);
  });
}

function openLiveSessionModal(session = null) {
  if (!liveSessionModal) return;
  liveActiveSession = session;
  liveModalTitle.textContent = session ? "Edit live session" : "Create live session";
  liveSessionIdInput.value = session?.id || "";
  if (liveClassSelect) {
    const classValue = session?.channel_id || "";
    const audienceKey = session?.audience ? normalizeLiveAudience(session.audience) : null;
    liveClassSelect.value = classValue || (audienceKey ? `audience:${audienceKey}` : "");
  }
  liveTitleInput.value = session?.title || "";
  liveDateInput.value = session?.date || "";
  liveStartInput.value = session?.start_time || "";
  liveEndInput.value = session?.end_time || "";
  liveUrlInput.value = session?.meeting_url || "";
  livePassInput.value = session?.meeting_pass || "";
  liveAutopostSelect.value = session?.autopost_mode ?? "0";
  liveStudentNotesInput.value = session?.student_notes || "";
  if (liveNotifyEmail) {
    liveNotifyEmail.checked = Boolean(session?.notify_email);
  }
  if (liveModalDanger) {
    liveModalDanger.hidden = !session;
  }
  liveSessionModal.classList.remove("hidden");
}

function closeLiveSessionModal() {
  if (!liveSessionModal) return;
  liveSessionModal.classList.add("hidden");
  liveActiveSession = null;
}

async function saveLiveSession() {
  if (!liveSessionForm) return;
  const sessionId = liveSessionIdInput?.value;
  const rawSelection = liveClassSelect?.value || "";
  const isAudienceSelection = rawSelection.startsWith("audience:");
  let selectedChannelId = rawSelection;
  let selectedAudience = null;
  if (isAudienceSelection) {
    const audienceKey = rawSelection.split(":")[1];
    const normalizedAudience = normalizeLiveAudience(audienceKey);
    if (normalizedAudience) {
      selectedAudience = normalizedAudience;
      selectedChannelId = "";
    }
  }
  const payload = {
    channel_id: selectedChannelId || null,
    title: liveTitleInput?.value.trim(),
    date: liveDateInput?.value,
    start_time: liveStartInput?.value,
    end_time: liveEndInput?.value,
    meeting_url: liveUrlInput?.value.trim(),
    meeting_pass: livePassInput?.value.trim(),
    autopost_mode: liveAutopostSelect?.value || "none",
    notify_email: liveNotifyEmail?.checked ? 1 : 0,
    student_notes: liveStudentNotesInput?.value.trim(),
    audience: selectedAudience
  };
  if (!selectedAudience && !payload.channel_id) {
    showToast("Please choose a class or an audience.");
    return;
  }
  if (!payload.title || !payload.date || !payload.start_time || !payload.end_time || !payload.meeting_url) {
    showToast("Please fill in required fields.");
    return;
  }
  try {
    if (sessionId) {
      await fetchJSON(`/api/live-sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    } else {
      await fetchJSON("/api/live-sessions", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
    closeLiveSessionModal();
    loadLiveSessions(liveScope);
    showToast("Session saved.");
  } catch (err) {
    console.error("Failed to save session", err);
    showToast("Could not save session.");
  }
}

function showDeleteConfirm() {
  if (!liveDeleteConfirmModal || !liveActiveSession || !liveActiveSession.id) return;
  liveDeleteConfirmModal.classList.remove("hidden");
}

function hideDeleteConfirm() {
  if (!liveDeleteConfirmModal) return;
  liveDeleteConfirmModal.classList.add("hidden");
}

async function deleteLiveSession() {
  hideDeleteConfirm();
  if (!liveActiveSession || !liveActiveSession.id) return;
  try {
    await fetchJSON(`/api/live-sessions/${liveActiveSession.id}`, { method: "DELETE" });
    closeLiveSessionModal();
    loadLiveSessions(liveScope);
    showToast("Session deleted.");
  } catch (err) {
    console.error("Failed to delete session", err);
    showToast("Could not delete session.");
  }
}

async function openAttendanceModal(session) {
  if (!liveAttendanceModal || !session) return;
  liveActiveSession = session;
  liveAttendanceModal.classList.remove("hidden");
  liveAttendanceMeta.textContent = `Session: ${session.title} · ${session.date}`;
  try {
    const list = await fetchJSON(`/api/live-sessions/${session.id}/attendance`);
    renderAttendanceList(Array.isArray(list) ? list : []);
  } catch (err) {
    console.error("Failed to load attendance", err);
    showToast("Could not load attendance.");
  }
}

function renderAttendanceList(records) {
  if (!liveAttendanceList) return;
  liveAttendanceList.innerHTML = "";
  if (!records.length) {
    liveAttendanceList.innerHTML = '<div class="muted">No attendance records yet.</div>';
    return;
  }
  records.forEach((record) => {
    const row = document.createElement("div");
    row.className = "live-att-row";
    row.dataset.studentId = record.student_id || "";
    const details = document.createElement("div");
    details.innerHTML = `
      <div class="live-att-name">${escapeHtml(record.name || record.student_id || "Student")}</div>
      <div class="live-att-sub">${escapeHtml(record.status || "unmarked")}</div>
    `;
    const select = document.createElement("select");
    select.className = "live-att-select";
    ["present", "late", "absent", "unmarked"].forEach((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status.charAt(0).toUpperCase() + status.slice(1);
      if (record.status === status) option.selected = true;
      select.appendChild(option);
    });
    row.appendChild(details);
    row.appendChild(select);
    liveAttendanceList.appendChild(row);
  });
}

async function saveLiveAttendance() {
  if (!liveActiveSession) return;
  const payload = [];
  liveAttendanceList?.querySelectorAll(".live-att-row").forEach((row) => {
    const studentId = row.dataset.studentId;
    const select = row.querySelector("select");
    if (studentId && select) {
      payload.push({ studentId, status: select.value });
    }
  });
  if (!payload.length) {
    showToast("Nothing to save.");
    return;
  }
  try {
    await fetchJSON(`/api/live-sessions/${liveActiveSession.id}/attendance`, {
      method: "POST",
      body: JSON.stringify({ records: payload })
    });
    showToast("Attendance saved.");
    closeAttendanceModal();
  } catch (err) {
    console.error("Failed to save attendance", err);
    showToast("Could not save attendance.");
  }
}

function closeAttendanceModal() {
  if (!liveAttendanceModal) return;
  liveAttendanceModal.classList.add("hidden");
}

function populateLiveClassOptions() {
  if (!liveClassSelect) return;
  const classChannels = channels
    .filter((ch) => normalizeChannelCategory(ch.category) === "classes")
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const teacherChannels = channels
    .filter((ch) => normalizeChannelCategory(ch.category) === "teachers")
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const classOptions = classChannels
    .map((ch) => `<option value="${escapeHtml(ch.id)}">${escapeHtml(ch.name)}</option>`)
    .join("");
  const teacherOptions = teacherChannels
    .map((ch) => `<option value="${escapeHtml(ch.id)}">${escapeHtml(ch.name)}</option>`)
    .join("");
  liveClassSelect.innerHTML = `
    <option value="">Select a class</option>
    <option value="audience:general">General (all users)</option>
    <option value="audience:teachers">Teachers only</option>
    ${teacherOptions ? `<optgroup label="Teacher channels">${teacherOptions}</optgroup>` : ""}
    ${classOptions}
  `;
}

function isClassActive(meta = {}) {
  if (!meta) return true;
  const end = meta.end_date ? new Date(meta.end_date).getTime() : null;
  return !end || end >= Date.now();
}

async function refreshRegistrationClassOptions() {
  const wsId = getRegistrationWorkspaceId() || currentWorkspaceId || "default";
  if (!wsId) return;
  const classChannels = (channels || [])
    .filter((ch) => {
      const cat = normalizeChannelCategory(ch.category);
      const wsMatch = String(ch.workspaceId || "default") === wsId;
      return wsMatch && cat === "classes";
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  await Promise.all(classChannels.map((ch) => ensureClassMeta(ch.id)));
  const options = classChannels
    .map(
      (ch) =>
        (() => {
          const meta = classMetaCache.get(ch.id) || {};
          if (!isClassActive(meta)) return "";
          return `<option value="${escapeHtml(ch.id)}" data-level="${escapeHtml(ch.name || ch.id || "")}" data-start="${escapeHtml(meta.start_date || "")}" data-end="${escapeHtml(
            meta.end_date || ""
          )}">${escapeHtml(ch.name || ch.id || "Class")}</option>`;
        })()
    )
    .join("");
  const html = `<option value="">Select class</option>${options}`;
  registrationClassSelects.forEach((select) => {
    if (!select) return;
    select.innerHTML = html;
  });
}

async function handleRegistrationClassChange(select) {
  const fields = registrationSelectFields.get(select);
  if (!fields) return;
  const channelId = (select?.value || "").trim();
  if (!channelId) {
    if (fields.start) fields.start.value = "";
    if (fields.end) fields.end.value = "";
    return;
  }
  const meta = await ensureClassMeta(channelId);
  if (!meta) return;
  if (fields.start) fields.start.value = meta.start_date || "";
  if (fields.end) fields.end.value = meta.end_date || "";
}

async function assignUserToClass(userId, channelId, workspaceId) {
  if (!userId || !channelId || !workspaceId) return;
  await fetchJSON("/api/class-memberships", {
    method: "POST",
    headers: { "x-admin": "1" },
    body: JSON.stringify({ userId, channelId, workspaceId })
  });
}

function attachLiveEvents() {
  if (liveCreateBtn) {
    liveCreateBtn.addEventListener("click", () => openLiveSessionModal());
  }
  if (liveModalClose) liveModalClose.addEventListener("click", closeLiveSessionModal);
  if (liveModalCancel) liveModalCancel.addEventListener("click", closeLiveSessionModal);
  if (liveModalSave) liveModalSave.addEventListener("click", saveLiveSession);
  if (liveDeleteBtn) liveDeleteBtn.addEventListener("click", showDeleteConfirm);
  if (liveSessionModal) {
    liveSessionModal.addEventListener("click", (e) => {
      if (e.target === liveSessionModal) closeLiveSessionModal();
    });
  }
  if (liveAttendanceModal) {
    liveAttendanceModal.addEventListener("click", (e) => {
      if (e.target === liveAttendanceModal) closeAttendanceModal();
    });
  }
  if (liveAttendanceClose) liveAttendanceClose.addEventListener("click", closeAttendanceModal);
  if (liveAttendanceCancel) liveAttendanceCancel.addEventListener("click", closeAttendanceModal);
  if (liveAttendanceSave) liveAttendanceSave.addEventListener("click", saveLiveAttendance);
  if (liveDeleteConfirmOk) liveDeleteConfirmOk.addEventListener("click", deleteLiveSession);
  if (liveDeleteConfirmCancel) liveDeleteConfirmCancel.addEventListener("click", hideDeleteConfirm);
  if (liveDeleteConfirmClose) liveDeleteConfirmClose.addEventListener("click", hideDeleteConfirm);
  if (liveDeleteConfirmModal) {
    liveDeleteConfirmModal.addEventListener("click", (e) => {
      if (e.target === liveDeleteConfirmModal) hideDeleteConfirm();
    });
  }
  liveTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const scope = tab.dataset.liveScope;
      setLiveScope(scope);
    });
  });
  if (openClassSettingsBtn) {
    openClassSettingsBtn.addEventListener("click", async () => {
      collapseClassSettingsView();
      await openEmailPanel();
    });
  }
  if (openClassSettingsListBtn) {
  openClassSettingsListBtn.addEventListener("click", () => {
    hideAdminOverlays();
    collapseClassSettingsView();
  renderClassSettingsList(classSettingsSearch?.value || "").catch((err) => console.error(err));
    showClassSettingsPage();
  });
  }

  if (classSettingsSearch) {
    classSettingsSearch.addEventListener("input", (e) => {
    renderClassSettingsList(e.target.value).catch((err) => console.error(err));
    });
  }
  if (classSettingsList) {
    classSettingsList.addEventListener("click", async (event) => {
      const editBtn = event.target.closest(".class-settings-edit");
      if (editBtn) {
        const card = editBtn.closest(".class-settings-card");
        if (card) {
          await openClassSettingsEditor(card, editBtn.dataset.id || card.dataset.channelId);
        }
        return;
      }
      const actionBtn = event.target.closest(".class-settings-actions button[data-action]");
    if (!actionBtn) return;
    const action = actionBtn.dataset.action;
    const card = actionBtn.closest(".class-settings-card");
    if (!card) return;
    if (action === "cancel") {
      collapseClassSettingsDetails(card);
      return;
    }
    if (action === "delete") {
      openClassDeleteModal(card);
      return;
    }
    if (action === "save") {
      await saveClassSettingsDetails(card);
    }
  });
}

  [sesClose, sesCancel].forEach((btn) => {
    if (btn) btn.addEventListener("click", closeSchoolSettingsView);
  });
  if (sesSave) sesSave.addEventListener("click", saveEmailSettings);
  if (sesTestBtn) sesTestBtn.addEventListener("click", sendTestEmail);
  if (sesPreviewBtn) sesPreviewBtn.addEventListener("click", previewEmailTemplate);
  if (sesLogoUploadBtn && sesLogoInput) {
    sesLogoUploadBtn.addEventListener("click", () => sesLogoInput.click());
    sesLogoInput.addEventListener("change", async (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      try {
        sesStatus.textContent = "Uploading logo…";
        await uploadSchoolLogo(file);
        sesStatus.textContent = "Logo uploaded ✅";
        setTimeout(() => {
          if (sesStatus) sesStatus.textContent = "";
        }, 1200);
      } catch (err) {
         console.error(err);
         sesStatus.textContent = "Logo upload failed.";
      } finally {
        sesLogoInput.value = "";
      }
    });
  }
  if (classDeleteCancel) classDeleteCancel.addEventListener("click", closeClassDeleteModal);
  if (classDeleteConfirm) classDeleteConfirm.addEventListener("click", confirmClassDelete);
  if (classDeleteModal) {
    classDeleteModal.addEventListener("click", (event) => {
      if (event.target === classDeleteModal) {
        closeClassDeleteModal();
      }
    });
  }
  if (sesHistoryClearBtn) {
    sesHistoryClearBtn.addEventListener("click", () => {
      clearSesHistorySelection();
      clearSesTestFields({ clearBody: true });
    });
  }
  wireSesTabButtons();
  wireSesInboxActions();
  wireSesInboxDetailControls();
  updateSesMailboxPermissionsUI();
  setSesSettingsView(getDefaultSesSettingsView());
  [sesTestTo, sesSubjectPrefix, sesBodyText].forEach((input) => {
    if (!input) return;
    input.addEventListener("input", updateSesEmailPreview);
  });
}

function clearSesTestFields({ clearBody = true } = {}) {
  if (sesSubjectPrefix) sesSubjectPrefix.value = "";
  if (sesTestTo) sesTestTo.value = "";
  if (sesBodyText && clearBody) {
    sesBodyText.value = "";
  }
  setSesGreetingAndClosing();
  updateSesEmailPreview();
}

function isSchoolSettingsChannel(channelId) {
  return String(channelId || "").trim() === SCHOOL_SETTINGS_CHANNEL_ID;
}

function getSchoolSettingsChannelMeta() {
  return {
    id: SCHOOL_SETTINGS_CHANNEL_ID,
    name: "School Email Settings",
    category: "tools",
    topic: "Control campus email templates and notifications",
    workspaceId: currentWorkspaceId || "default"
  };
}

function setSchoolEmailHeaderMode(active) {
  const chatHeaderEl = document.getElementById("chatHeader");
  if (!chatHeaderEl) return;
  chatHeaderEl.classList.toggle("school-settings-header", Boolean(active));
}

function showSchoolSettingsCard() {
  if (!schoolEmailSettingsPage) return;
  schoolEmailSettingsPage.classList.remove("hidden");
  schoolEmailSettingsPage.setAttribute("aria-hidden", "false");
  if (messagesContainer) messagesContainer.classList.add("hidden");
  if (composer) composer.classList.add("hidden");
  if (typingIndicator) typingIndicator.classList.add("hidden");
  if (newMsgsBtn) newMsgsBtn.classList.add("hidden");
  if (releaseSchoolSettingsTrap) releaseSchoolSettingsTrap();
  releaseSchoolSettingsTrap = trapFocus(schoolEmailSettingsPage);
  document.body.classList.add("no-school-scroll");
  setSchoolEmailHeaderMode(true);
}

function showClassSettingsPage() {
  if (!classSettingsPage) return;
  classSettingsPreviousChannelId = currentChannelId;
  classSettingsPage.classList.remove("hidden");
  classSettingsPage.setAttribute("aria-hidden", "false");
  if (messagesContainer) messagesContainer.classList.add("hidden");
  if (composer) composer.classList.add("hidden");
  if (typingIndicator) typingIndicator.classList.add("hidden");
  if (newMsgsBtn) newMsgsBtn.classList.add("hidden");
  renderClassSettingsList().catch((err) => console.error(err));
  if (releaseClassSettingsTrap) releaseClassSettingsTrap();
  releaseClassSettingsTrap = trapFocus(classSettingsPage);
  document.body.classList.add("no-school-scroll");
  chatHeader?.classList.add("hidden");
}

function collapseClassSettingsView() {
  if (!classSettingsPage || classSettingsPage.classList.contains("hidden")) return;
  classSettingsPage.classList.add("hidden");
  classSettingsPage.setAttribute("aria-hidden", "true");
  if (messagesContainer) messagesContainer.classList.remove("hidden");
  if (composer) composer.classList.remove("hidden");
  if (typingIndicator) typingIndicator.classList.remove("hidden");
  if (newMsgsBtn) newMsgsBtn.classList.remove("hidden");
  if (releaseClassSettingsTrap) {
    releaseClassSettingsTrap();
    releaseClassSettingsTrap = null;
  }
  document.body.classList.remove("no-school-scroll");
  chatHeader?.classList.remove("hidden");
}

function hideClassSettingsPage() {
  if (!classSettingsPage) return;
  const target =
    classSettingsPreviousChannelId ||
    (channels && channels.length ? channels[0].id : null) ||
    currentChannelId;
  collapseClassSettingsView();
  classSettingsPreviousChannelId = null;
  if (target) {
    selectChannel(target);
  }
}

async function renderClassSettingsList(filter = "") {
  if (!classSettingsList) return;
  const query = String(filter || "").trim().toLowerCase();
  const classChannels = (channels || [])
    .filter((ch) => normalizeChannelCategory(ch.category) === "classes")
    .filter((ch) => {
      if (!query) return true;
      const haystack = `${ch.name || ""} ${ch.topic || ""} ${ch.id || ""}`.toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  if (!classChannels.length) {
    classSettingsList.innerHTML = `<div class="helper-text">No class channels yet.</div>`;
    return;
  }
  await Promise.all(classChannels.map((ch) => ensureClassMeta(ch.id)));
  classSettingsList.innerHTML = classChannels
    .map((ch) => {
      const meta = classMetaCache.get(ch.id) || {};
      const isDeactivated = meta.end_date && new Date(meta.end_date).getTime() < Date.now();
      const privacy = (meta.status || (ch.is_public === false ? "private" : "public")).toLowerCase();
      const capacityDisplay = meta.capacity > 0 ? String(meta.capacity) : "Unlimited";
      const teachers = String(meta.teacher_names || "").trim();
      const teacherLabel = teachers
        ? `<div class="class-card-teachers">
            <span>Teacher:</span>
            <span>${escapeHtml(teachers)}</span>
          </div>`
        : "";
      return `
        <div class="class-settings-card" data-channel-id="${escapeHtml(ch.id)}">
          <div class="class-card-header">
            <div>
              <div class="class-card-title">${escapeHtml(ch.name || ch.id)}</div>
              ${teacherLabel}
            </div>
            <div class="class-card-header-actions">
              <span class="class-tag ${privacy} visibility-badge${isDeactivated ? " deactivated" : ""}">
                ${isDeactivated ? "Deactivated" : privacy.charAt(0).toUpperCase() + privacy.slice(1)}
              </span>
              <button class="class-card-add-teacher" data-channel-id="${escapeHtml(ch.id)}" type="button" title="Add teacher">
                <i class="fa-solid fa-user-plus"></i>
              </button>
              <button class="icon-btn class-settings-edit" data-id="${escapeHtml(ch.id)}" type="button" title="Edit class">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
            </div>
          </div>
          <div class="class-card-actions">
            <button class="ses-btn ses-btn-primary class-settings-open" type="button">Open</button>
          </div>
          <div class="class-settings-details hidden" data-channel-id="${escapeHtml(ch.id)}">
            <div class="class-settings-row">
              <label>Class start date</label>
              <input type="date" data-field="start-date" />
            </div>
            <div class="class-settings-row">
              <label>Class end date</label>
              <input type="date" data-field="end-date" />
            </div>
            <div class="class-settings-row">
              <label>Visibility</label>
              <select data-field="status">
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
            <div class="class-settings-row">
              <label>Capacity</label>
              <input type="number" min="0" step="1" data-field="capacity" placeholder="0 for unlimited" />
            </div>
          <div class="class-capacity-status" data-field="capacity-status">
            <div class="capacity-bar">
              <div class="capacity-fill" data-field="capacity-fill"></div>
            </div>
            <span data-field="capacity-label">Open • 0 / Unlimited</span>
          </div>
          <div class="class-progress-row" data-field="progress-row">
            <label class="visually-hidden"></label>
            <div class="class-progress-status">
              <div class="progress-bar">
                <div class="progress-fill" data-field="progress-fill"></div>
              </div>
              <span data-field="progress-label">Progress: 0% (Week 0 of 0)</span>
            </div>
          </div>
          <div class="class-settings-actions">
            <button class="ses-btn ses-btn-ghost" type="button" data-action="cancel">Cancel</button>
            <button class="ses-btn ses-btn-danger" type="button" data-action="delete">Delete</button>
            <button class="ses-btn ses-btn-primary" type="button" data-action="save">Save</button>
          </div>
          </div>
        </div>
      `;
    })
    .join("");
  classSettingsList.querySelectorAll(".class-settings-open").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".class-settings-card");
      const channelId = card?.dataset?.channelId;
      if (channelId) {
        hideClassSettingsPage();
        selectChannel(channelId);
      }
    });
  });
  document.addEventListener("click", handleClassSettingsOutsideClick);
}

function handleClassSettingsOutsideClick(event) {
  if (classDeleteModal && !classDeleteModal.classList.contains("hidden")) return;
  const card = classSettingsActiveCard;
  if (!card) return;
  if (card.contains(event.target)) return;
  collapseClassSettingsDetails(card);
}

function openClassDeleteModal(card) {
  if (!card || !classDeleteModal) return;
  const channelId = card.dataset.channelId;
  classSettingsDeleteTarget = { card, channelId };
  classDeleteModal.classList.remove("hidden");
  document.body.classList.add("no-scroll");
}

function closeClassDeleteModal() {
  if (!classDeleteModal) return;
  classDeleteModal.classList.add("hidden");
  document.body.classList.remove("no-scroll");
  classSettingsDeleteTarget = null;
}

async function confirmClassDelete() {
  if (!classSettingsDeleteTarget) return;
  const { channelId, card } = classSettingsDeleteTarget;
  try {
    await fetchJSON(`/api/channels/${encodeURIComponent(channelId)}`, {
      method: "DELETE"
    });
    if (classSettingsList && card) {
      card.remove();
    }
    closeClassSettingsModalAfterDelete(card);
    renderClassSettingsList().catch((err) => console.error(err));
    showToast("Class deleted");
  } catch (err) {
    console.error("Class delete failed:", err);
    showToast("Could not delete class");
  } finally {
    closeClassDeleteModal();
  }
}

function closeClassSettingsModalAfterDelete(card) {
  if (!card) return;
  collapseClassSettingsDetails(card);
  if (classSettingsActiveCard === card) {
    classSettingsActiveCard = null;
  }
}
async function openClassSettingsEditor(card, channelId) {
  if (!card || !channelId) return;
  if (classSettingsActiveCard && classSettingsActiveCard !== card) {
    collapseClassSettingsDetails(classSettingsActiveCard);
  }
  if (classSettingsActiveCard === card) {
    collapseClassSettingsDetails(card);
    return;
  }
  classSettingsActiveCard = card;
  const detail = card.querySelector(".class-settings-details");
  if (!detail) return;
  detail.classList.remove("hidden");
  detail.dataset.channelId = channelId;
  const meta = await fetchClassSettingsMeta(channelId);
  if (!meta) {
    showToast("Could not load class details");
    return;
  }
  classMetaCache.set(channelId, meta);
  detail.querySelector('[data-field="start-date"]').value = meta.start_date || "";
  detail.querySelector('[data-field="end-date"]').value = meta.end_date || "";
  const capacityInput = detail.querySelector('[data-field="capacity"]');
  if (capacityInput) capacityInput.value = meta.capacity || "";
  const statusSelect = detail.querySelector('[data-field="status"]');
  if (statusSelect) statusSelect.value = meta.status || "private";
  setClassSettingsCounts(detail, meta);
  updateCardVisibilityBadge(card, meta.status);
}

async function fetchClassSettingsMeta(channelId) {
  try {
    return await fetchJSON(`/api/classes/${encodeURIComponent(channelId)}/meta`);
  } catch (e) {
    console.error("Class meta load failed:", e);
    return null;
  }
}

function resolveClassMetaChannelId(channelId) {
  if (!channelId) return "";
  if (isHomeworkNoteChannel(channelId)) {
    const noteChannel = getChannelById(channelId);
    return (
      noteChannel?.parentClassId ||
      homeworkParentByChannelId.get(String(channelId)) ||
      ""
    );
  }
  return String(channelId);
}

async function ensureClassMeta(channelId) {
  const resolvedChannelId = resolveClassMetaChannelId(channelId);
  if (!resolvedChannelId) return null;
  if (classMetaCache.has(resolvedChannelId)) return classMetaCache.get(resolvedChannelId);
  if (!sessionUser) {
    const empty = {};
    classMetaCache.set(resolvedChannelId, empty);
    return empty;
  }
  const meta = (await fetchClassSettingsMeta(resolvedChannelId)) || {};
  classMetaCache.set(resolvedChannelId, meta);
  return meta;
}

function collapseClassSettingsDetails(card) {
  if (!card) return;
  const detail = card.querySelector(".class-settings-details");
  if (detail) detail.classList.add("hidden");
  if (classSettingsActiveCard === card) {
    classSettingsActiveCard = null;
  }
}

async function saveClassSettingsDetails(card) {
  if (!card) return;
  const channelId = card.dataset.channelId;
  if (!channelId) return;
  const detail = card.querySelector(".class-settings-details");
  if (!detail) return;
  const startDate = detail.querySelector('[data-field="start-date"]')?.value || "";
  const endDate = detail.querySelector('[data-field="end-date"]')?.value || "";
  const status = detail.querySelector('[data-field="status"]')?.value || "private";
  const capacityValue = detail.querySelector('[data-field="capacity"]')?.value || "";
  const capacity = Number(capacityValue) || 0;
  try {
    await fetchJSON(`/api/classes/${encodeURIComponent(channelId)}/meta`, {
      method: "PUT",
      body: JSON.stringify({ start_date: startDate || null, end_date: endDate || null, status, capacity })
    });
    showToast("Class settings saved");
    const meta = await fetchClassSettingsMeta(channelId);
    if (meta) {
      classMetaCache.set(channelId, meta);
      setClassSettingsCounts(detail, meta);
      updateCardVisibilityBadge(card, meta.status);
    }
    collapseClassSettingsDetails(card);
  } catch (err) {
    console.error("Failed to save class settings:", err);
    showToast("Save failed");
  }
}

function setClassSettingsCounts(detail, meta) {
  if (!detail || !meta) return;
  const students = detail.querySelector('[data-field="students"]');
  if (students) students.textContent = String(meta.total_students ?? 0);
  const capacityBar = detail.querySelector('[data-field="capacity-fill"]');
  const capacityLabel = detail.querySelector('[data-field="capacity-label"]');
  const progressLabel = detail.querySelector('[data-field="progress-label"]');
  const cap = Number(meta.capacity ?? 0);
  const registered = Number(meta.total_students ?? 0);
  if (capacityLabel) {
    const label = cap > 0 ? `${registered} / ${cap}` : `${registered} / Unlimited`;
    capacityLabel.textContent = `${cap > 0 && registered >= cap ? "Full" : cap > 0 && registered / cap >= 0.95 ? "Almost full" : "Open"} • ${label}`;
  }
  if (capacityBar) {
    const ratio = cap > 0 ? Math.min(1, registered / cap) : Math.min(1, registered / Math.max(1, registered));
    capacityBar.style.width = `${cap > 0 ? ratio * 100 : registered > 0 ? 100 : 0}%`;
    let color = "linear-gradient(90deg, #22c55e, #059669)";
    if (cap > 0) {
      if (ratio >= 1) color = "linear-gradient(90deg, #dc2626, #b91c1c)";
      else if (ratio >= 0.95) color = "linear-gradient(90deg, #facc15, #f59e0b)";
    }
    capacityBar.style.background = color;
  }
  if (progressLabel) {
    const start = new Date(meta.start_date || "");
    const end = new Date(meta.end_date || "");
    const today = new Date();
    const progressFill = detail.querySelector('[data-field="progress-fill"]');
    if (progressFill && isFinite(start) && isFinite(end) && end >= start) {
      const totalDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
      const elapsedDays = Math.max(0, Math.min(totalDays, Math.round((today - start) / (1000 * 60 * 60 * 24)) + 1));
      const percent = Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));
      const week = Math.ceil(elapsedDays / 7);
      const totalWeeks = Math.ceil(totalDays / 7);
      progressLabel.textContent = `week ${week}/ ${totalWeeks}`;
      progressFill.style.width = `${percent}%`;
    } else {
      progressLabel.textContent = `Progress: 0% (Week 0 of 0)`;
    }
  }
}

function updateCardVisibilityBadge(card, status) {
  if (!card) return;
  const badge = card.querySelector(".visibility-badge");
  if (!badge) return;
  const normalized = String(status || "public").toLowerCase();
  badge.textContent = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  badge.classList.toggle("public", normalized === "public");
  badge.classList.toggle("private", normalized === "private");
}

function hideSchoolSettingsCard() {
  if (!schoolEmailSettingsPage) return;
  schoolEmailSettingsPage.classList.add("hidden");
  schoolEmailSettingsPage.setAttribute("aria-hidden", "true");
  if (messagesContainer) messagesContainer.classList.remove("hidden");
  if (composer) composer.classList.remove("hidden");
  if (typingIndicator) typingIndicator.classList.remove("hidden");
  if (newMsgsBtn) newMsgsBtn.classList.remove("hidden");
  if (releaseSchoolSettingsTrap) {
    releaseSchoolSettingsTrap();
    releaseSchoolSettingsTrap = null;
  }
  document.body.classList.remove("no-school-scroll");
  setSchoolEmailHeaderMode(false);
}

function hideAdminOverlays() {
  hideSchoolSettingsCard();
  collapseClassSettingsView();
}

function closeSchoolSettingsView() {
  const target =
    schoolSettingsPreviousChannelId ||
    (channels && channels.length ? channels[0].id : null) ||
    currentChannelId;
  schoolSettingsPreviousChannelId = null;
  hideSchoolSettingsCard();
  if (target && !isSchoolSettingsChannel(target)) {
    selectChannel(target);
  }
}

function setSesFormatView(active) {
  if (!sesFormatCard || !sesMainSettingsBody || !sesFormatBtn) return;
  sesFormatViewActive = Boolean(active);
  sesMainSettingsBody.classList.toggle("hidden", sesFormatViewActive);
  sesFormatCard.classList.toggle("hidden", !sesFormatViewActive);
  sesFormatBtn.textContent = sesFormatViewActive ? "Back to settings" : "Email format";
  sesFormatBtn.setAttribute("aria-pressed", sesFormatViewActive ? "true" : "false");
}

function toggleSesFormatView() {
  setSesFormatView(!sesFormatViewActive);
}

function canManageSchoolMailbox() {
  return isAdminUser();
}

function canAccessSchoolMailbox() {
  return canManageSchoolMailbox() || isStudentUser();
}

function getDefaultSesSettingsView() {
  return canManageSchoolMailbox() ? "sent" : "inbox";
}

function normalizeSesSettingsView(view) {
  const requested = String(view || "").trim().toLowerCase();
  if (canManageSchoolMailbox()) {
    if (["sent", "history", "format", "inbox", "trash"].includes(requested)) {
      return requested;
    }
    return "sent";
  }
  if (["inbox", "trash"].includes(requested)) {
    return requested;
  }
  return "inbox";
}

function updateSesMailboxPermissionsUI() {
  const allowManagement = canManageSchoolMailbox();
  const allowMailbox = canAccessSchoolMailbox();
  const sentBtn = document.getElementById("sesSentBtn");
  const historyBtn = document.getElementById("sesHistoryBtn");
  const formatBtn = document.getElementById("sesFormatBtn");
  const inboxBtn = document.getElementById("sesInboxBtn");
  const trashBtn = document.getElementById("sesTrashBtn");
  const headerActions = document.getElementById("schoolEmailHeaderActions");
  const replyBtn = document.getElementById("detailReplyBtn");
  const forwardBtn = document.getElementById("detailForwardBtn");
  const emojiBtn = document.getElementById("detailEmojiBtn");
  const replyPanel = document.getElementById("detailReplyPanel");
  const replyActions = document.getElementById("detailReplyActions");

  [sentBtn, historyBtn, formatBtn].forEach((btn) => {
    if (!btn) return;
    btn.classList.toggle("hidden", !allowManagement);
    btn.setAttribute("aria-hidden", allowManagement ? "false" : "true");
  });
  [inboxBtn, trashBtn].forEach((btn) => {
    if (!btn) return;
    btn.classList.toggle("hidden", !allowMailbox);
    btn.setAttribute("aria-hidden", allowMailbox ? "false" : "true");
  });
  if (headerActions) {
    headerActions.classList.toggle("hidden", !allowMailbox);
    headerActions.setAttribute("aria-hidden", allowMailbox ? "false" : "true");
  }
  if (replyBtn) replyBtn.hidden = !allowManagement;
  if (forwardBtn) forwardBtn.hidden = !allowManagement;
  if (emojiBtn) emojiBtn.hidden = !allowManagement;
  if (!allowManagement) {
    replyPanel?.classList.add("hidden");
    replyActions?.classList.add("hidden");
  }
  if (!allowManagement && !["inbox", "trash"].includes(normalizeSesSettingsView(sesCurrentMailboxFolder))) {
    sesCurrentMailboxFolder = "inbox";
  }
}

// --- SES tab routing (Sent / History / Email format) ---
function setSesSettingsView(view) {
  collapseClassSettingsView();
  // view: "sent" | "history" | "format" | "inbox" | "trash"
  view = normalizeSesSettingsView(view);
  const body = document.querySelector(".ses-body");
  const formCol = document.querySelector(".ses-form");
  const metaCol = document.querySelector(".ses-meta-column");

  const historyPanel = document.getElementById("sesEmailHistory");
  const formatCard = document.getElementById("sesFormatCard");
  const inboxPanel = document.getElementById("sesInboxPanel");

  const sentBtn = document.getElementById("sesSentBtn");
  const historyBtn = document.getElementById("sesHistoryBtn");
  const formatBtn = document.getElementById("sesFormatBtn");
  const inboxBtn = document.getElementById("sesInboxBtn");
  const trashBtn = document.getElementById("sesTrashBtn");

  if (!body || !formCol || !metaCol || !historyPanel || !formatCard) return;

  body.classList.remove("ses-view-sent", "ses-view-history", "ses-view-format");
  body.classList.remove("ses-view-inbox", "ses-view-trash");
  body.classList.remove("hidden");

  formCol.classList.add("hidden");
  metaCol.classList.add("hidden");
  historyPanel.classList.add("hidden");
  if (inboxPanel) {
    inboxPanel.classList.add("hidden");
  }
  formatCard.classList.add("hidden");

  if (view !== "format") {
    hideSesTplPopup();
  }

  const setActive = (btn, isActive) => {
    if (!btn) return;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  };
  setActive(sentBtn, view === "sent");
  setActive(historyBtn, view === "history");
  setActive(formatBtn, view === "format");
  setActive(inboxBtn, view === "inbox");
  setActive(trashBtn, view === "trash");

  updateSesMailboxPermissionsUI();

  if (view === "sent") {
    body.classList.add("ses-view-sent");
    formCol.classList.remove("hidden");
    metaCol.classList.add("hidden");
  } else if (view === "history") {
    body.classList.add("ses-view-history");
    metaCol.classList.remove("hidden");
    historyPanel.classList.remove("hidden");
  } else if (view === "format") {
    body.classList.add("ses-view-format");

    body.classList.remove("hidden");
    formatCard.classList.remove("hidden");
    wireSesTemplateEditorUIOnce();
    sesTplLoadList().catch(console.warn);
    hideSesTplPopup();
  } else if (view === "inbox") {
    body.classList.add("ses-view-inbox");
    metaCol.classList.remove("hidden");
    if (inboxPanel) {
      inboxPanel.classList.remove("hidden");
    }
    historyPanel.classList.add("hidden");
    sesCurrentMailboxFolder = "inbox";
    loadSesInboxMessages({ folder: "inbox", sync: false });
    renderSesInboxView();
  } else if (view === "trash") {
    body.classList.add("ses-view-trash");
    metaCol.classList.remove("hidden");
    if (inboxPanel) {
      inboxPanel.classList.remove("hidden");
    }
    historyPanel.classList.add("hidden");
    sesCurrentMailboxFolder = "trash";
    loadSesInboxMessages({ folder: "trash", sync: false });
    renderSesInboxView();
  }
}

function wireSesTabButtons() {
  const sentBtn = document.getElementById("sesSentBtn");
  const historyBtn = document.getElementById("sesHistoryBtn");
  const formatBtn = document.getElementById("sesFormatBtn");
  const formatBackBtn = document.getElementById("sesFormatBackBtn");
  const inboxBtn = document.getElementById("sesInboxBtn");
  const trashBtn = document.getElementById("sesTrashBtn");

  sentBtn?.addEventListener("click", () => setSesSettingsView("sent"));
  historyBtn?.addEventListener("click", async () => {
    setSesSettingsView("history");
    try {
      await loadSesEmailLogs();
    } catch (e) {
      console.warn("Failed to load email history", e);
    }
  });
  formatBtn?.addEventListener("click", () => setSesSettingsView("format"));
  formatBackBtn?.addEventListener("click", () => setSesSettingsView("sent"));
  inboxBtn?.addEventListener("click", () => setSesSettingsView("inbox"));
  trashBtn?.addEventListener("click", () => setSesSettingsView("trash"));
}

function wireSesInboxActions() {
  if (sesInboxRefreshBtn) {
    sesInboxRefreshBtn.addEventListener("click", () => {
      loadSesInboxMessages();
    });
  }
  if (sesInboxMarkAllBtn) {
    sesInboxMarkAllBtn.addEventListener("click", () => {
      markAllSesInboxRead();
    });
  }
}

function wireSesInboxDetailControls() {
  if (!sesInboxBackBtn) return;
  sesInboxBackBtn.addEventListener("click", () => {
    closeSesInboxDetail();
  });
}

let sesTplCache = [];
let sesTplSelectedKey = null;
let sesTplWired = false;
const getSesTplPopup = () => document.getElementById("sesTplPopup");
const getSesTplPopupCloseBtn = () => document.getElementById("sesTplPopupCloseBtn");
const getSesFormatCard = () => document.getElementById("sesFormatCard");

function showSesTplPopup() {
  const popup = getSesTplPopup();
  if (popup) {
    popup.classList.remove("hidden");
    const card = getSesFormatCard();
    card?.classList.add("ses-format-editing");
  }
}

function hideSesTplPopup() {
  const popup = getSesTplPopup();
  if (popup) {
    popup.classList.add("hidden");
    const card = getSesFormatCard();
    card?.classList.remove("ses-format-editing");
  }
}
function sesTplAutoResizeTextarea(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}
let sesTplPopup = null;

function sesTplTokenizeRequired(required) {
  if (!required || !required.length) return "Required tokens: none";
  return "Required tokens: " + required.map((t) => `{{${t}}}`).join(", ");
}

function sesTplRenderTokenChips(required) {
  const el = document.getElementById("sesTplTokens");
  if (!el) return;
  el.innerHTML = "";
  const all = new Set([
    ...(required || []),
    "school_name",
    "support_email",
    "login_url",
    "set_password_link",
    "reset_link",
    "otp_code",
    "session_link",
    "invoice_link",
    "receipt_link"
  ]);
  [...all]
    .sort()
    .forEach((t) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ses-template-token";
      chip.textContent = `{{${t}}}`;
      chip.addEventListener("click", () => {
        const ta = document.getElementById("sesTplBodyHtml");
        if (!ta) return;
        const insert = `{{${t}}}`;
        const start = ta.selectionStart || 0;
        const end = ta.selectionEnd || 0;
        const v = ta.value || "";
        ta.value = v.slice(0, start) + insert + v.slice(end);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + insert.length;
        sesTplUpdatePreview();
      });
      el.appendChild(chip);
    });
}

function sesTplUpdatePreview() {
  const subject = document.getElementById("sesTplSubject")?.value || "";
  const bodyHtml = document.getElementById("sesTplBodyHtml")?.value || "";
  const preview = document.getElementById("sesTplPreview");
  if (!preview) return;

  const vars = {
    school_name: "School Name",
    support_email: "support@school.com",
    student_name: "Student Name",
    teacher_name: "Teacher Name",
    user_name: "User Name",
    login_url: "https://example.com/login",
    set_password_link: "https://example.com/set-password?token=TEST",
    link_expiry_hours: "48",
    reset_link: "https://example.com/reset?token=TEST",
    reset_expiry_minutes: "30",
    otp_code: "123456",
    otp_expiry_minutes: "5",
    session_title: "Live Class",
    session_start: "2026-02-10 10:00",
    session_end: "2026-02-10 11:00",
    session_link: "https://example.com/live/TEST",
    invoice_number: "INV-1001",
    amount: "99.00",
    currency: "EUR",
    invoice_link: "https://example.com/invoice/INV-1001",
    receipt_link: "https://example.com/receipt/TEST",
    course_name: "Course Name",
    course_end_date: "2026-03-01",
    course_link: "https://example.com/courses/TEST",
    class_name: "Class Name",
    class_date: "2026-02-14",
    exam_name: "Exam Name",
    exam_date: "2026-03-10",
    exam_location: "Main Campus"
  };

  const render = (s) =>
    String(s || "").replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
      const val = Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : "";
      return val == null ? "" : String(val);
    });

  preview.innerHTML = `
    <div style="font-weight:800;margin-bottom:8px;">${escapeHtml(render(subject))}</div>
    <div>${render(bodyHtml)}</div>
  `;
}

async function sesTplLoadList() {
  const ws = await resolveProfileWorkspaceId();
  const data = await fetchJSON(`/api/workspaces/${encodeURIComponent(ws)}/email-templates`, {
    headers: { "x-user-id": getCurrentUserId() }
  });
  sesTplCache = data?.templates || [];
  sesTplRenderList();
}

function sesTplRenderList(filterText = "") {
  sesTplRenderCards(filterText);
}

function sesTplPreviewText(template = {}) {
  if (!template) return "";
  if (template.body_text) return template.body_text;
  if (template.body_html) return stripHtmlToText(template.body_html);
  return "";
}

function sesTplRenderCards(filterText = "") {
  const container = document.getElementById("sesTplCards");
  if (!container) return;
  container.innerHTML = "";
  const q = String(filterText || "").trim().toLowerCase();
  sesTplCache
    .filter((t) => !q || String(t.label || t.template_key).toLowerCase().includes(q))
    .forEach((t) => {
      const previewText = sesTplPreviewText(t).trim();
      const snippet =
        previewText.length > 220 ? `${previewText.slice(0, 220).trim()}…` : previewText;
      const card = document.createElement("div");
      card.className = "ses-template-card";
      card.innerHTML = `
        <div class="ses-template-card-row">
          <div class="ses-template-card-title">${escapeHtml(t.label || t.template_key)}</div>
          <span class="ses-template-badge">${t.enabled ? "Enabled" : "Disabled"}</span>
        </div>
        <div class="ses-template-card-subject">${escapeHtml(t.subject || "No subject")}</div>
        <div class="ses-template-card-thumbnail">${escapeHtml(snippet)}</div>
      `;
      card.addEventListener("click", () => sesTplSelect(t.template_key));
      container.appendChild(card);
    });
}

function sesTplSelect(templateKey) {
  const t = sesTplCache.find((x) => x.template_key === templateKey);
  if (!t) return;
  sesTplSelectedKey = templateKey;

  document.getElementById("sesTplLabel").textContent = t.label || t.template_key;
  document.getElementById("sesTplRequired").textContent = sesTplTokenizeRequired(t.required_tokens || []);
  document.getElementById("sesTplSubject").value = t.subject || "";
  document.getElementById("sesTplBodyHtml").value = t.body_html || "";
  sesTplAutoResizeTextarea(document.getElementById("sesTplBodyHtml"));

  sesTplRenderTokenChips(t.required_tokens || []);
  sesTplRenderList(document.getElementById("sesTplSearch")?.value || "");
  sesTplUpdatePreview();
  showSesTplPopup();
}

async function sesTplSaveSelected() {
  if (!sesTplSelectedKey) return;
  const ws = await resolveProfileWorkspaceId();
  const subject = document.getElementById("sesTplSubject")?.value || "";
  const body_html = document.getElementById("sesTplBodyHtml")?.value || "";
  const status = document.getElementById("sesTplStatus");
  try {
    status && (status.textContent = "Saving...");
    await fetchJSON(`/api/workspaces/${encodeURIComponent(ws)}/email-templates/${encodeURIComponent(sesTplSelectedKey)}`, {
      method: "PUT",
      headers: { "x-user-id": getCurrentUserId() },
      body: JSON.stringify({ subject, body_html, enabled: true })
    });
    status && (status.textContent = "Saved ✅");
    await sesTplLoadList();
    sesTplSelect(sesTplSelectedKey);
  } catch (e) {
    status && (status.textContent = `Save failed: ${e.message || e}`);
  }
}

async function sesTplResetSelected() {
  if (!sesTplSelectedKey) return;
  const ws = await resolveProfileWorkspaceId();
  const status = document.getElementById("sesTplStatus");
  try {
    status && (status.textContent = "Resetting...");
    await fetchJSON(`/api/workspaces/${encodeURIComponent(ws)}/email-templates/${encodeURIComponent(sesTplSelectedKey)}/reset`, {
      method: "POST",
      headers: { "x-user-id": getCurrentUserId() }
    });
    status && (status.textContent = "Reset ✅");
    await sesTplLoadList();
    sesTplSelect(sesTplSelectedKey);
  } catch (e) {
    status && (status.textContent = `Reset failed: ${e.message || e}`);
  }
}

async function sesTplSendTest() {
  if (!sesTplSelectedKey) return;
  const ws = await resolveProfileWorkspaceId();
  const to = document.getElementById("sesTplTestTo")?.value || "";
  const status = document.getElementById("sesTplStatus");
  try {
    status && (status.textContent = "Sending test...");
    await fetchJSON(`/api/workspaces/${encodeURIComponent(ws)}/email-templates/${encodeURIComponent(sesTplSelectedKey)}/test`, {
      method: "POST",
      headers: { "x-user-id": getCurrentUserId() },
      body: JSON.stringify({ to })
    });
    status && (status.textContent = "Test sent ✅");
  } catch (e) {
    status && (status.textContent = `Test failed: ${e.message || e}`);
  }
}

function wireSesTemplateEditorUIOnce() {
  if (sesTplWired) return;
  sesTplWired = true;
  document.getElementById("sesTplSearch")?.addEventListener("input", (e) => {
    sesTplRenderList(e.target.value);
  });
  document.getElementById("sesTplSubject")?.addEventListener("input", sesTplUpdatePreview);
  const body = document.getElementById("sesTplBodyHtml");
  if (body) {
    body.addEventListener("input", () => {
      sesTplUpdatePreview();
      sesTplAutoResizeTextarea(body);
    });
  }

  document.getElementById("sesTplSaveBtn")?.addEventListener("click", sesTplSaveSelected);
  document.getElementById("sesTplResetBtn")?.addEventListener("click", sesTplResetSelected);
  document.getElementById("sesTplTestBtn")?.addEventListener("click", sesTplSendTest);
  document.getElementById("sesTplPopupCloseBtn")?.addEventListener("click", () => {
    hideSesTplPopup();
  });
}

function getGreetingForCurrentTimeDE() {
  const hour = new Date().getHours();
  if (hour >= 18) return "Guten Abend";
  if (hour >= 11) return "Guten Tag";
  return "Guten Morgen";
}

function buildRecipientName(meta){
  if (!meta) return "";
  const gender = String(meta.gender || "").trim();
  const lastName = String(meta.lastName || meta.last_name || "").trim();
  const firstName = String(meta.firstName || meta.first_name || "").trim();
  const name = lastName || firstName || "";
  if (!name) return "";
  return gender ? `${gender} ${name}`:name;
}

async function resolveRecipientDisplayDetails(email){
  if (!email) return null;
  await loadUserDirectory();
  const candidateEmail = String(email).trim().toLowerCase();
  if (!candidateEmail) return null;
  const match = (userDirectoryCache || []).find((u) => {
    const normalized = String(u.email || u.user_email || u.username || "").trim().toLowerCase();
    return normalized && normalized === candidateEmail;
  });
  if (!match) return null;
  const firstName = match.first_name || match.firstName || "";
  const lastName = match.last_name || match.lastName || "";
  const displayName = match.name || match.displayName || `${firstName} ${lastName}`.trim();
  return {
    firstName,
    lastName,
    displayName,
    gender: match.gender || ""
  };
}

function setSesGreetingAndClosing({ greeting = "", closing = "" } = {}) {
  if (sesBodyGreetingPreview) {
    sesBodyGreetingPreview.textContent = greeting;
  }
  if (sesBodyClosingPreview) {
    sesBodyClosingPreview.textContent = closing;
  }
}

function getSesGreetingText() {
  const g = document.getElementById("sesBodyGreetingPreview");
  return (g?.textContent || "").trim();
}

function getSesClosingText() {
  const c = document.getElementById("sesBodyClosingPreview");
  return (c?.textContent || "").trim();
}

function buildFinalTestEmailBody() {
  const greeting = getSesGreetingText();
  const closing = getSesClosingText();
  const body = (sesBodyText?.value || "").trim();
  const middle = body ? body : "";
  const parts = [];

  if (greeting) parts.push(greeting);
  parts.push(middle);
  if (closing) parts.push(closing);

  return parts.join("\n\n").trim();
}

function hideSesEmailPreview() {
  if (!sesEmailPreviewPanel) return;
  sesEmailPreviewPanel.classList.add("hidden");
}

function updateSesEmailPreview() {
  if (!sesEmailPreviewPanel) return;
  if (sesActiveHistoryLogId) return;
  const to = (sesTestTo?.value || "").trim();
  if (!to) {
    hideSesEmailPreview();
    return;
  }
  const subject = (sesSubjectPrefix?.value || "").trim() || "School Email Settings";
  const bodyContent = buildFinalTestEmailBody() || "No message yet.";
  const signatureBlock = buildSesSignaturePreviewText();
  const body = signatureBlock ? `${bodyContent}\n\n${signatureBlock}` : bodyContent;
  if (sesPreviewRecipient) sesPreviewRecipient.textContent = `To: ${to}`;
  if (sesPreviewSubject) sesPreviewSubject.textContent = subject;
  if (sesPreviewBody) sesPreviewBody.textContent = body;
  if (sesPreviewTimestamp) sesPreviewTimestamp.textContent = `Draft • ${new Date().toLocaleString()}`;
  sesEmailPreviewPanel.classList.remove("hidden");
}

function extractPreviewTextLines(el) {
  if (!el) return [];
  return Array.from(el.childNodes)
    .map((child) => child.textContent?.trim())
    .filter(Boolean);
}

function buildSesSignaturePreviewText() {
  const lines = [
    ...extractPreviewTextLines(sesSignatureHours),
    ...extractPreviewTextLines(sesSignatureAddress),
    ...extractPreviewTextLines(sesSignaturePhone),
    ...extractPreviewTextLines(sesSignatureEmail),
    ...extractPreviewTextLines(sesSignatureRegistration)
  ];
  return lines.length ? lines.join("\n") : "";
}

async function updateSesBodyChrome() {
  const to = (sesTestTo?.value || "").trim();
  if (!to) {
    setSesGreetingAndClosing();
    return;
  }

  const recipientMeta = await resolveRecipientDisplayDetails(to).catch(() => null);
  const schoolName =
    (sesSchoolName?.value || "").trim() || currentSchoolNameFallback() || "Sprachschule";

  const namePart = buildRecipientName(recipientMeta);
  const greet = namePart
    ? `${getGreetingForCurrentTimeDE()} ${namePart},`
    : `${getGreetingForCurrentTimeDE()},`;
  const closing = `Mit freundlichen Grüßen\n${schoolName}`;

  setSesGreetingAndClosing({ greeting: greet, closing });
}


function collapseComposerIfEmpty() {
  if (!inputBar || !rteEditor || !messageInput) return;
  const html = (messageInput.value || "").replace(/<br\s*\/?>/gi, "").trim();
  const hasFocusInside =
    document.activeElement && inputBar.contains(document.activeElement);
  if (html.length === 0 && !hasFocusInside) {
    inputBar.classList.add("collapsed");
  }
}

function expandComposer() {
  if (!inputBar) return;
  inputBar.classList.remove("collapsed");
}

// ===================== RICH TEXT COMPOSER =====================

function initRichTextEditor() {
  if (!rteEditor) return;

  // start collapsed until focused or text exists
  collapseComposerIfEmpty();

  // toolbar buttons
  rteButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const command = btn.dataset.rteCommand;
      const value = btn.dataset.rteValue || null;

      rteEditor.focus();

      if (command === "createLink") {
        const url = prompt("Link URL");
        if (!url) return;
        document.execCommand("createLink", false, url);
      } else if (command === "formatBlock" && value) {
        document.execCommand("formatBlock", false, value);
      } else {
        document.execCommand(command, false, value);
      }

      syncEditorToTextarea();
    });
  });

  if (rteBlockSelect) {
    rteBlockSelect.addEventListener("change", () => {
      rteEditor.focus();
      const block = rteBlockSelect.value || "p";
      document.execCommand("formatBlock", false, block);
      syncEditorToTextarea();
    });
  }

  // typing, draft & send behaviour
  let draftTimeout = null;

  rteEditor.addEventListener("focus", () => {
    expandComposer();
  });

  rteEditor.addEventListener("input", () => {
    handleTyping();
    syncEditorToTextarea();
    updateSendButtonState();
    expandComposer();

    if (draftTimeout) clearTimeout(draftTimeout);
    draftTimeout = setTimeout(saveDraftForCurrentChannel, 500);
  });

  rteEditor.addEventListener("keydown", (e) => {
    // Enter sends, Shift+Enter = newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  rteEditor.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData)?.getData("text/plain") || "";
    document.execCommand("insertText", false, text);
  });

  rteEditor.addEventListener("blur", () => {
    if (typingStopTimer) clearTimeout(typingStopTimer);
    typingActive = false;
    sendTypingSignal(false);
    setTimeout(() => {
      collapseComposerIfEmpty();
    }, 80);
  });

  // start with any draft in the editor
  loadDraftForChannel(currentChannelId);
  updateSendButtonState();
}

window.addEventListener("load", initRichTextEditor);
async function updateMessageText(messageId, channelId, newText) {
  const authorName =
    (sessionUser && (sessionUser.name || sessionUser.username || sessionUser.email)) ||
    "You";
  const payload = {
    text: newText,
    author: authorName
  };
  const res = await fetchJSON(`/api/messages/${encodeURIComponent(messageId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });

  // update local caches
  Object.keys(messagesByChannel).forEach((cid) => {
    const msgs = messagesByChannel[cid] || [];
    const idx = msgs.findIndex((m) => m.id === messageId);
    if (idx !== -1) {
      msgs[idx].text = res.text;
    }
  });

  if (savedMessagesById[messageId]) {
    savedMessagesById[messageId].message.text = res.text;
    persistSavedMessages();
  }
  refreshMessagesView();
}

async function deleteMessage(messageId) {
  const authorName =
    (sessionUser && (sessionUser.name || sessionUser.username || sessionUser.email)) ||
    "You";
  await fetchJSON(`/api/messages/${encodeURIComponent(messageId)}`, {
    method: "DELETE",
    headers: { "x-user-id": getCurrentUserId() },
    body: JSON.stringify({ author: authorName })
  });

  Object.keys(messagesByChannel).forEach((cid) => {
    const msgs = messagesByChannel[cid] || [];
    const idx = msgs.findIndex((m) => m.id === messageId);
    if (idx !== -1) {
      msgs.splice(idx, 1);
    }
  });

  if (savedMessagesById[messageId]) {
    delete savedMessagesById[messageId];
    persistSavedMessages();
  }
  refreshMessagesView();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isCurrentUserAuthor(author) {
  if (!sessionUser) return false;
  const candidates = [
    sessionUser.name,
    sessionUser.username,
    sessionUser.email,
    sessionUser.userId,
    `${sessionUser.firstName || ""} ${sessionUser.lastName || ""}`.trim()
  ]
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());
  const target = (author || "").trim().toLowerCase();
  return !!target && candidates.includes(target);
}

function canModifyMessage(msg) {
  if (!msg) return false;
  if (!isCurrentUserAuthor(msg.author)) return false;
  const hasReplies = Array.isArray(msg.replies) && msg.replies.length > 0;
  const hasReactions =
    Array.isArray(msg.reactions) &&
    msg.reactions.some((r) => r && r.count && r.count > 0);
  return !hasReplies && !hasReactions;
}

function renderTypingUsers() {
  if (!typingIndicator || !typingAvatar || !typingText) return;
  const active = Array.from(typingUsers.values()).map((v) => v.name);
  if (!active.length) {
    typingIndicator.style.display = "none";
    return;
  }
  typingIndicator.style.display = "flex";
  const first = active[0];
  const initials = generateInitials(first) || "";
  typingAvatar.textContent = initials;
  if (active.length === 1) {
    typingText.textContent = `${first} is typing…`;
  } else if (active.length === 2) {
    typingText.textContent = `${active[0]} and ${active[1]} are typing…`;
  } else {
    typingText.textContent = `${active[0]} and ${active.length - 1} others are typing…`;
  }
}

function addTypingUser(userId, name, initials) {
  if (!userId) return;
  const key = String(userId);
  const entry = typingUsers.get(key) || {};
  if (entry.timeout) clearTimeout(entry.timeout);
  const timeout = setTimeout(() => {
    typingUsers.delete(key);
    renderTypingUsers();
  }, 4000);
  typingUsers.set(key, { name: name || initials || "Someone", initials: initials || "", timeout });
  renderTypingUsers();
}

function removeTypingUser(userId) {
  if (!userId) return;
  const key = String(userId);
  const entry = typingUsers.get(key);
  if (entry && entry.timeout) clearTimeout(entry.timeout);
  typingUsers.delete(key);
  renderTypingUsers();
}

function sendTypingSignal(isTyping) {
  if (!sessionUser || showSavedOnly) return;
  const channelId = currentChannelId;
  if (!channelId) return;
  const userId = sessionUser.userId || sessionUser.id || sessionUser.email || "anon";
  const name = getDisplayName();
  const initials = generateInitials(name) || "YOU";
  fetchJSON("/api/typing", {
    method: "POST",
    body: JSON.stringify({
      channelId,
      userId,
      name,
      initials,
      isTyping
    })
  }).catch(() => {
    // ignore typing errors
  });
}

function startInlineEdit(msg, bubble, channelId) {
  if (!bubble || !msg) return;
  if (bubble.querySelector(".inline-edit-wrap")) return;
  const textEl = bubble.querySelector(".message-text");
  if (!textEl) return;

  const wrap = document.createElement("div");
  wrap.className = "inline-edit-wrap";

  const textarea = document.createElement("textarea");
  textarea.className = "inline-edit-input";
  textarea.value = msg.text || "";
  wrap.appendChild(textarea);

  const actions = document.createElement("div");
  actions.className = "inline-edit-actions";
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "inline-edit-btn save";
  saveBtn.textContent = "Save";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "inline-edit-btn cancel";
  cancelBtn.textContent = "Cancel";
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  wrap.appendChild(actions);

  const cleanup = () => {
    wrap.remove();
    textEl.style.display = "";
  };

  cancelBtn.addEventListener("click", cleanup);

  saveBtn.addEventListener("click", async () => {
    const trimmed = textarea.value.trim();
    if (!trimmed) {
      showToast("Message cannot be empty");
      return;
    }
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    try {
      await updateMessageText(msg.id, channelId, trimmed);
      msg.text = trimmed;
      textEl.textContent = trimmed;
      cleanup();
    } catch (err) {
      console.error("Failed to edit message", err);
      showToast(err && err.message ? err.message : "Could not edit message");
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  });

  textEl.style.display = "none";
  textEl.insertAdjacentElement("afterend", wrap);
  textarea.focus();
}

async function uploadProfileAvatar(dataUrl) {
  const hasUserId = sessionUser && (sessionUser.userId || sessionUser.id);
  if (!hasUserId) {
    showToast("Login required to update profile picture");
    return;
  }
  const userId = sessionUser.userId || sessionUser.id;
  const payload = { avatarData: dataUrl };
  try {
    const res = await fetchJSON(`/api/users/${encodeURIComponent(userId)}/avatar`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    sessionUser.avatarUrl = res.avatarUrl;
    persistSessionUser(sessionUser);
    updateCachedAvatarForUser(sessionUser, res.avatarUrl);
    updateAdminButtonState();
    showToast("Profile picture updated");
    refreshMessagesView();
    renderDMs();
    renderChannelHeader(currentChannelId);
  } catch (err) {
    console.error("Failed to upload avatar", err);
    const msg = err && err.message ? err.message : "Could not update profile picture";
    showToast(msg);
  }
}

function resetAvatarModal() {
  avatarCropImage = null;
  avatarCropScale = 1.2;
  if (avatarZoom) avatarZoom.value = avatarCropScale;
  if (avatarPreview) {
    const ctx = avatarPreview.getContext("2d");
    ctx.clearRect(0, 0, avatarPreview.width, avatarPreview.height);
    ctx.fillStyle = "#0d1324";
    ctx.fillRect(0, 0, avatarPreview.width, avatarPreview.height);
  }
}

function openAvatarModal() {
  const hasUserId = sessionUser && (sessionUser.userId || sessionUser.id);
  if (!hasUserId) {
    showToast("Login to set your profile picture");
    return;
  }
  resetAvatarModal();
  loadCurrentAvatarIntoPreview();
  if (avatarModal) avatarModal.classList.remove("hidden");
}

function closeAvatarModal() {
  if (avatarModal) avatarModal.classList.add("hidden");
  resetAvatarModal();
  if (avatarUploadInput) avatarUploadInput.value = "";
  closeAvatarPickerOverlay();
}

function drawAvatarPreview() {
  if (!avatarPreview || !avatarCropImage) return;
  const canvas = avatarPreview;
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#0d1324";
  ctx.fillRect(0, 0, size, size);

  const scale = avatarCropScale || 1;
  const imgW = avatarCropImage.width;
  const imgH = avatarCropImage.height;
  const base = Math.min(imgW, imgH);
  const target = base / scale;
  const sx = (imgW - target) / 2;
  const sy = (imgH - target) / 2;

  ctx.drawImage(
    avatarCropImage,
    sx,
    sy,
    target,
    target,
    0,
    0,
    size,
    size
  );
}

function loadCurrentAvatarIntoPreview() {
  const currentUrl = (sessionUser && sessionUser.avatarUrl) || DEFAULT_AVATAR_DATA_URL;
  const displayName = getDisplayName();
  if (avatarCurrentThumb) {
    applyAvatarToNode(
      avatarCurrentThumb,
      generateInitials(displayName),
      currentUrl,
      displayName,
      sessionUser?.role || ""
    );
  }
  if (avatarUserName) avatarUserName.textContent = displayName || "User";
  if (avatarUserEmail) avatarUserEmail.textContent = sessionUser?.email || "";

  if (!currentUrl) return;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    avatarCropImage = img;
    drawAvatarPreview();
  };
  img.src = currentUrl;
}

function openAvatarPickerOverlay() {
  if (!avatarPickerOverlay) return;
  avatarPickerOverlay.classList.remove("hidden");
}

function closeAvatarPickerOverlay() {
  if (!avatarPickerOverlay) return;
  avatarPickerOverlay.classList.add("hidden");
}

async function handleAvatarFile(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    showToast("Avatar must be under 2MB");
    return;
  }
  const dataUrl = await readFileAsDataUrl(file);
  const img = new Image();
  img.onload = () => {
    avatarCropImage = img;
    drawAvatarPreview();
  };
  img.src = dataUrl;
}

function showLoginOverlay() {
  if (!loginOverlay) return;
  if (loginOverlay.parentElement !== document.body) {
    document.body.appendChild(loginOverlay);
  }
  loginOverlay.classList.remove("hidden");
  loginOverlay.style.display = "flex";
  if (loginTabs.length) setLoginTab("signin");
}

let activeLoginTab = "signin";

function setLoginTab(tab) {
  activeLoginTab = tab || "signin";
  loginTabs.forEach((btn) => {
    const isActive = btn.dataset.loginTab === activeLoginTab;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  loginPanels.forEach((panel) => {
    const isActive = panel.dataset.loginPanel === activeLoginTab;
    panel.classList.toggle("hidden", !isActive);
  });
  if (schoolRequestError) schoolRequestError.style.display = "none";
  if (schoolRequestSuccess) schoolRequestSuccess.style.display = "none";
  if (mainLoginError) mainLoginError.style.display = "none";
}

let adminActiveTab = "workspaces";

function setAdminTab(tab) {
  adminActiveTab = tab || adminActiveTab || "workspaces";
  if (!isSuperAdmin() && (adminActiveTab === "workspaces" || adminActiveTab === "school-requests" || adminActiveTab === "security")) {
    adminActiveTab = "users";
  }
  adminNavButtons.forEach((btn) => {
    const isActive = btn.dataset.adminTab === adminActiveTab;
    btn.classList.toggle("active", isActive);
  });
  adminPanels.forEach((panel) => {
    const isActive = panel.dataset.adminPanel === adminActiveTab;
    panel.classList.toggle("hidden", !isActive);
  });
  if (adminActiveTab === "school-requests") {
    loadAdminSchoolRequests();
  }
  if (adminActiveTab === "security") {
    loadAdminSecurityDashboard();
  }
}

function updateAdminNavVisibility() {
  const isSuper = isSuperAdmin();
  adminNavButtons.forEach((btn) => {
    const superOnly = btn.dataset.superAdmin === "true";
    if (superOnly) {
      btn.hidden = !isSuper;
      btn.style.display = isSuper ? "" : "none";
    }
  });
  if (adminOpenWorkspaceModal) {
    adminOpenWorkspaceModal.disabled = !isSuper;
    adminOpenWorkspaceModal.style.display = isSuper ? "" : "none";
  }
  if (!isSuper && (adminActiveTab === "workspaces" || adminActiveTab === "school-requests" || adminActiveTab === "security")) {
    setAdminTab("users");
  }
}

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function badge(sev) {
  const s = String(sev || "info").toLowerCase();
  const cls = s === "high" ? "badge badge-high" : s === "warn" ? "badge badge-warn" : "badge";
  return `<span class="${cls}">${escapeHtml(s)}</span>`;
}

async function loadAdminSecurityDashboard() {
  if (!isSuperAdmin()) return;

  try {
    const overview = await fetchJSON("/api/admin/security/overview");
    renderAdminSecurityKpis(overview?.kpis || {});
  } catch (e) {
    if (adminSecurityKpis)
      adminSecurityKpis.innerHTML = `<div class="helper-text" style="color:#ef4444;">${escapeHtml(
        e.message || "Failed to load security overview"
      )}</div>`;
  }

  await loadAdminSecurityEvents();
  await loadAdminSecurityTopAttacks();
  await loadAdminSecurityFailedIp();
  await loadAdminBlocklist();
  await loadAdminSecuritySessions();
}

function renderAdminSecurityKpis(kpis) {
  if (!adminSecurityKpis) return;

  const items = [
    { label: "Failed logins (24h)", value: kpis.failedLogins24h ?? 0, icon: "fa-triangle-exclamation" },
    { label: "Successful logins (24h)", value: kpis.successfulLogins24h ?? 0, icon: "fa-right-to-bracket" },
    { label: "Password changes (24h)", value: kpis.passwordChanges24h ?? 0, icon: "fa-key" },
    { label: "Users must change password", value: kpis.usersMustChangePassword ?? 0, icon: "fa-lock" },
    { label: "Invites created (7d)", value: kpis.invitesCreated7d ?? 0, icon: "fa-link" },
    { label: "Invites used (7d)", value: kpis.invitesUsed7d ?? 0, icon: "fa-user-check" }
  ];

  adminSecurityKpis.innerHTML = `
    <div class="admin-kpi-grid">
      ${items
        .map(
          (it) => `
        <div class="admin-kpi">
          <div class="admin-kpi-icon"><i class="fa-solid ${it.icon}"></i></div>
          <div class="admin-kpi-meta">
            <div class="admin-kpi-value">${escapeHtml(String(it.value))}</div>
            <div class="admin-kpi-label">${escapeHtml(it.label)}</div>
          </div>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

async function loadAdminSecurityEvents() {
  if (!adminSecurityEvents) return;

  const q = String(adminSecuritySearch?.value || "").trim();
  const type = String(adminSecurityType?.value || "").trim();

  adminSecurityEvents.innerHTML = `<div class="helper-text">Loading…</div>`;

  try {
    const url = `/api/admin/security/events?limit=50${
      q ? `&q=${encodeURIComponent(q)}` : ""
    }${type ? `&type=${encodeURIComponent(type)}` : ""}`;
    const data = await fetchJSON(url);
    const events = data?.events || [];

    if (!events.length) {
      adminSecurityEvents.innerHTML = `<div class="helper-text">No events found.</div>`;
      return;
    }

    adminSecurityEvents.innerHTML = `
      <div class="admin-table-head">
        <div>Time</div>
        <div>Type</div>
        <div>Severity</div>
        <div>Actor</div>
        <div>Target</div>
        <div>IP</div>
      </div>
      ${events
        .map(
          (e) => `
        <div class="admin-table-row">
          <div>${escapeHtml(fmtTime(e.created_at))}</div>
          <div style="font-weight:900;">${escapeHtml(e.type)}</div>
          <div>${badge(e.severity)}</div>
          <div>${escapeHtml(e.actorEmail || e.actor_user_id || "-")}</div>
          <div>${escapeHtml(e.targetEmail || e.target_user_id || "-")}</div>
          <div>${escapeHtml(e.ip || "-")}</div>
        </div>
      `
        )
        .join("")}
    `;
  } catch (e) {
    adminSecurityEvents.innerHTML = `<div class="helper-text" style="color:#ef4444;">${escapeHtml(
      e.message || "Failed to load events"
    )}</div>`;
  }
}

async function loadAdminSecurityTopAttacks() {
  if (!adminSecTopAttacks) return;
  const hours = secHoursTop ? secHoursTop.value : "24";
  adminSecTopAttacks.innerHTML = `<div class="helper-text">Loading…</div>`;

  try {
    const data = await fetchJSON(`/api/admin/security/top-attacks?hours=${encodeURIComponent(hours)}`);
    const rows = data?.rows || [];
    _lastTopAttacks = rows;
    if (!rows.length) {
      adminSecTopAttacks.innerHTML = `<div class="helper-text">No failed logins.</div>`;
      return;
    }
    adminSecTopAttacks.innerHTML = `
      <div class="admin-table-head">
        <div>Identifier</div>
        <div>Failed count</div>
        <div>Last seen</div>
      </div>
      ${rows
        .map(
          (r) => `
            <div class="admin-table-row">
              <div style="font-weight:900;">${escapeHtml(r.identifier || "-")}</div>
              <div>${escapeHtml(String(r.failedCount || 0))}</div>
              <div>${escapeHtml(new Date(Number(r.lastSeen)).toLocaleString())}</div>
            </div>
          `
        )
        .join("")}
    `;
  } catch (e) {
    adminSecTopAttacks.innerHTML = `<div class="helper-text" style="color:#ef4444;">${escapeHtml(
      e.message || "Failed to load top attacks"
    )}</div>`;
  }
}

async function loadAdminSecurityFailedIp() {
  if (!adminSecFailedIp) return;
  const hours = secHoursIp ? secHoursIp.value : "24";
  adminSecFailedIp.innerHTML = `<div class="helper-text">Loading…</div>`;

  try {
    const data = await fetchJSON(`/api/admin/security/failed-by-ip?hours=${encodeURIComponent(hours)}`);
    const rows = data?.rows || [];
    const blocked = data?.blocked || [];
    _lastFailedIp = rows;
    _lastBlocklist = blocked;
    adminSecFailedIpRows = rows;
    adminSecBlockedRows = blocked;

    if (!rows.length) {
      adminSecFailedIp.innerHTML = `<div class="helper-text">No failed IP activity.</div>`;
      adminSecBlocklist.innerHTML = `<div class="helper-text">No blocked IPs.</div>`;
      return;
    }

    adminSecFailedIp.innerHTML = `
      <div class="admin-table-head">
        <div>IP</div>
        <div>Failed count</div>
        <div>Last seen</div>
        <div>Action</div>
      </div>
      ${rows
        .map(
          (r) => `
            <div class="admin-table-row">
              <div style="font-weight:900;">${escapeHtml(r.ip || "-")}</div>
              <div>${escapeHtml(String(r.failedCount || 0))}</div>
              <div>${escapeHtml(new Date(Number(r.lastSeen)).toLocaleString())}</div>
              <div>
                ${r.blocked
                  ? `<button class="admin-secondary-btn" data-unblock-ip="${escapeHtml(r.ip || "")}">Unblock</button>`
                  : `<button class="admin-primary-btn" data-block-ip="${escapeHtml(r.ip || "")}">Block</button>`}
              </div>
            </div>
          `
        )
        .join("")}
    `;

    adminSecFailedIp.querySelectorAll("[data-block-ip]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ip = btn.getAttribute("data-block-ip");
        await api("/api/admin/security/ip-block", {
          method: "POST",
          body: { ip, reason: "High failed logins" }
        });
        await loadAdminSecurityFailedIp();
        await loadAdminBlocklist();
      });
    });

    adminSecFailedIp.querySelectorAll("[data-unblock-ip]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ip = btn.getAttribute("data-unblock-ip");
        await api("/api/admin/security/ip-unblock", { method: "POST", body: { ip } });
        await loadAdminSecurityFailedIp();
        await loadAdminBlocklist();
      });
    });
  } catch (e) {
    adminSecFailedIp.innerHTML = `<div class="helper-text" style="color:#ef4444;">${escapeHtml(
      e.message || "Failed to load failed IPs"
    )}</div>`;
  }
}

function renderAdminSecurityBlocklist() {
  if (!adminSecBlocklist) return;
  if (!_lastBlocklist.length) {
    adminSecBlocklist.innerHTML = `<div class="helper-text">No blocked IPs.</div>`;
    return;
  }
  adminSecBlocklist.innerHTML = `
    <div class="admin-table-head">
      <div>IP</div>
      <div>Reason</div>
      <div>Blocked at</div>
      <div>Action</div>
    </div>
    ${_lastBlocklist
      .map(
        (row) => `
          <div class="admin-table-row">
            <div>${escapeHtml(row.ip)}</div>
            <div>${escapeHtml(row.reason || '—')}</div>
            <div>${escapeHtml(fmtTime(row.created_at))}</div>
            <div>
              <button class="admin-primary-btn" type="button" data-unblock-ip="${escapeHtml(row.ip)}">Unblock</button>
            </div>
          </div>
        `
      )
      .join("")}
  `;
}

async function loadAdminBlocklist() {
  if (!adminSecBlocklist) return;
  const rows = _lastBlocklist || [];
  if (!rows.length) {
    adminSecBlocklist.innerHTML = `<div class="helper-text">No blocked IPs.</div>`;
    return;
  }
  adminSecBlocklist.innerHTML = `
    <div class="admin-table-head">
      <div>IP</div>
      <div>Reason</div>
      <div>Created</div>
      <div>Action</div>
    </div>
    ${rows
      .map(
        (r) => `
          <div class="admin-table-row">
            <div style="font-weight:900;">${escapeHtml(r.ip)}</div>
            <div>${escapeHtml(r.reason || '-')}</div>
            <div>${escapeHtml(new Date(Number(r.created_at)).toLocaleString())}</div>
            <div><button class="admin-secondary-btn" data-unblock="${escapeHtml(r.ip)}">Unblock</button></div>
          </div>
        `
      )
      .join("")}
  `;

  adminSecBlocklist.querySelectorAll("[data-unblock]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ip = btn.getAttribute("data-unblock");
      await fetchJSON("/api/admin/security/ip-unblock", { method: "POST", body: JSON.stringify({ ip }) });
      await loadAdminFailedByIp();
      await loadAdminBlocklist();
    });
  });
}


async function loadAdminSessions() {
  if (!adminSecSessions) return;
  const q = String(secSessionSearch?.value || "").trim();
  adminSecSessions.innerHTML = `<div class="helper-text">Loading…</div>`;

  const data = await fetchJSON(`/api/admin/security/sessions?limit=50${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  const rows = data?.rows || [];
  _lastSessions = rows;
  adminSecSessionRows = rows;

  if (!rows.length) {
    adminSecSessions.innerHTML = `<div class="helper-text">No sessions found.</div>`;
    return;
  }

  adminSecSessions.innerHTML = `
    <div class="admin-table-head">
      <div>Email</div>
      <div>Workspace</div>
      <div>IP</div>
      <div>Issued</div>
      <div>Status</div>
      <div>Action</div>
    </div>
    ${rows
      .map(
        (r) => `
          <div class="admin-table-row">
            <div style="font-weight:900;">${escapeHtml(r.email || r.user_id || "-")}</div>
            <div>${escapeHtml(r.workspaceId || "-")}</div>
            <div>${escapeHtml(r.ip || "-")}</div>
            <div>${escapeHtml(new Date(Number(r.created_at)).toLocaleString())}</div>
            <div>${r.revoked_at ? `<span class="badge badge-warn">revoked</span>` : `<span class="badge">active</span>`}</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="admin-secondary-btn" data-revoke-user="${escapeHtml(r.user_id)}">Revoke all user sessions</button>
              <button class="admin-secondary-btn" data-revoke-session="${escapeHtml(r.id)}" ${r.revoked_at ? "disabled" : ""}>Revoke</button>
            </div>
          </div>
        `
      )
      .join("")}
  `;

  adminSecSessions.querySelectorAll("[data-revoke-session]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-revoke-session");
      await fetchJSON(`/api/admin/security/sessions/${encodeURIComponent(id)}/revoke`, { method: "POST" });
      await loadAdminSessions();
    });
  });

  adminSecSessions.querySelectorAll("[data-revoke-user]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-revoke-user");
      await fetchJSON(`/api/admin/security/users/${encodeURIComponent(userId)}/revoke-all-sessions`, { method: "POST" });
      await loadAdminSessions();
    });
  });
}

function downloadCsv(filename, rows, columns) {
  const esc = (v) => {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replaceAll('"', '""')}"`;
    return s;
  };
  const lines = [];
  lines.push(columns.join(","));
  for (const r of rows) {
    lines.push(columns.map((c) => esc(r[c])).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportTopAttacks() {
  if (!_lastTopAttacks.length) {
    showToast("No records to export.");
    return;
  }
  const rows = _lastTopAttacks.map((r) => ({
    identifier: r.identifier || "",
    failedCount: String(r.failedCount || 0),
    lastSeen: fmtTime(r.lastSeen)
  }));
  downloadCsv("top-attacks.csv", rows, ["identifier", "failedCount", "lastSeen"]);
}

function exportFailedIps() {
  if (!adminSecFailedIpRows.length) {
    showToast("No failed IPs to export.");
    return;
  }
  const rows = adminSecFailedIpRows.map((r) => ({
    ip: r.ip || "",
    failedCount: String(r.failedCount || 0),
    lastSeen: fmtTime(r.lastSeen),
    status: r.blocked ? "blocked" : "open"
  }));
  downloadCsv("failed-ips.csv", rows, ["ip", "failedCount", "lastSeen", "status"]);
}

function exportSessions() {
  if (!adminSecSessionRows.length) {
    showToast("No sessions to export.");
    return;
  }
  const rows = adminSecSessionRows.map((r) => ({
    email: r.email || r.user_id || "",
    role: r.role || "",
    createdAt: fmtTime(r.created_at),
    ip: r.ip || "",
    revokedAt: r.revoked_at ? fmtTime(r.revoked_at) : ""
  }));
  downloadCsv("sessions.csv", rows, ["email", "role", "createdAt", "ip", "revokedAt"]);
}

async function blockIp(ip, reason) {
  if (!ip) return;
  await api("/api/admin/security/ip-block", { method: "POST", body: { ip, reason } });
  showToast(`Blocked ${ip}`);
  await loadAdminSecurityFailedIp();
  renderAdminSecurityBlocklist();
}

async function unblockIp(ip) {
  if (!ip) return;
  await api("/api/admin/security/ip-unblock", { method: "POST", body: { ip } });
  showToast(`Unblocked ${ip}`);
  await loadAdminSecurityFailedIp();
  renderAdminSecurityBlocklist();
}

async function revokeSession(sessionId) {
  if (!sessionId) return;
  await api(`/api/admin/security/sessions/${sessionId}/revoke`, { method: "POST", body: {} });
  showToast("Session revoked");
  await loadAdminSecuritySessions();
}

function openAdminModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove("hidden");
  modalEl.style.display = "flex";
}

function closeAdminModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.add("hidden");
  modalEl.style.display = "none";
}

function refreshAdminStats() {
  if (adminStatWorkspaces) adminStatWorkspaces.textContent = String(adminWorkspaces.length || 0);
  const userCount = (adminUsersAll && adminUsersAll.length) || adminUsers.length || 0;
  const channelCount = (adminChannelsAll && adminChannelsAll.length) || adminChannels.length || 0;
  if (adminStatUsers) adminStatUsers.textContent = String(userCount);
  if (adminStatChannels) adminStatChannels.textContent = String(channelCount);
}

async function loadAdminWorkspaces() {
  try {
    const isSuper = isSuperAdmin();
    adminWorkspaces = await fetchJSON("/api/workspaces");
    if (!isSuper && sessionUser && sessionUser.workspaceId) {
      adminWorkspaces = adminWorkspaces.filter((w) => w.id === sessionUser.workspaceId);
    }
    if (!adminWorkspaces.length) {
      adminWorkspaces = [{ id: "default", name: "Default Workspace" }];
    }
    if (!adminWorkspaces.some((w) => w.id === adminCurrentWorkspace)) {
      adminCurrentWorkspace = adminWorkspaces[0].id;
    }
    renderAdminWorkspaceSelects();
    renderAdminWorkspaces();
    await loadAdminUsers(isSuper ? "all" : adminCurrentWorkspace);
    await loadAdminChannels(isSuper ? "all" : adminCurrentWorkspace);
    refreshAdminStats();
    renderAdminAssignLists();
    await loadAdminChannelUsers(adminCurrentWorkspace);
  } catch (err) {
    console.error("Failed to load admin workspaces", err);
    showToast("Could not load workspaces");
  }
}

function renderAdminWorkspaceSelects() {
  const allowAll = isSuperAdmin();
  if (adminUserWorkspace) {
    adminUserWorkspace.innerHTML = "";
    adminWorkspaces.forEach((w) => {
      const opt = document.createElement("option");
      opt.value = w.id;
      opt.textContent = w.name;
      if (w.id === adminCurrentWorkspace) opt.selected = true;
      adminUserWorkspace.appendChild(opt);
    });
  }

  if (adminFilterWorkspace) {
    const prev = adminFilterWorkspace.value || (allowAll ? "all" : "");
    adminFilterWorkspace.innerHTML = "";
    if (allowAll) {
      const allOpt = document.createElement("option");
      allOpt.value = "all";
      allOpt.textContent = "All (all workspaces)";
      adminFilterWorkspace.appendChild(allOpt);
    }
    adminWorkspaces.forEach((w) => {
      const opt = document.createElement("option");
      opt.value = w.id;
      opt.textContent = w.name;
      adminFilterWorkspace.appendChild(opt);
    });
    adminFilterWorkspace.value = prev || adminWorkspaces[0]?.id || "all";
    if (!adminFilterWorkspace.value) {
      adminFilterWorkspace.value = allowAll ? "all" : adminWorkspaces[0]?.id || "default";
    }
    adminFilterWorkspace.disabled = !allowAll;
  }

  if (adminChannelFilterWorkspace) {
    const prev = adminChannelFilterWorkspace.value || (allowAll ? "all" : "");
    adminChannelFilterWorkspace.innerHTML = "";
    if (allowAll) {
      const allOpt = document.createElement("option");
      allOpt.value = "all";
      allOpt.textContent = "All workspaces";
      adminChannelFilterWorkspace.appendChild(allOpt);
    }
    adminWorkspaces.forEach((w) => {
      const opt = document.createElement("option");
      opt.value = w.id;
      opt.textContent = w.name;
      adminChannelFilterWorkspace.appendChild(opt);
    });
    adminChannelFilterWorkspace.value = prev || adminWorkspaces[0]?.id || "all";
    if (!adminChannelFilterWorkspace.value) {
      adminChannelFilterWorkspace.value = allowAll ? "all" : adminWorkspaces[0]?.id || "default";
    }
    adminChannelFilterWorkspace.disabled = !allowAll;
  }

  if (adminChannelWorkspace) {
    adminChannelWorkspace.innerHTML = "";
    if (allowAll) {
      const allOpt = document.createElement("option");
      allOpt.value = "all";
      allOpt.textContent = "All (everyone)";
      adminChannelWorkspace.appendChild(allOpt);
    }
    adminWorkspaces.forEach((w) => {
      const opt = document.createElement("option");
      opt.value = w.id;
      opt.textContent = w.name;
      adminChannelWorkspace.appendChild(opt);
    });
    // set selection
    const target =
      adminChannelWorkspaceId && (allowAll && adminChannelWorkspaceId === "all" || adminWorkspaces.some((w) => w.id === adminChannelWorkspaceId))
        ? adminChannelWorkspaceId
        : adminCurrentWorkspace;
    adminChannelWorkspace.value = target;
    adminChannelWorkspaceId = adminChannelWorkspace.value;
  }

}

function renderAdminWorkspaces() {
  if (!adminWorkspaceList) return;
  adminWorkspaceList.innerHTML = "";
  const term = (adminWorkspaceSearch?.value || "").toLowerCase();
  const sort = adminWorkspaceSort?.value || "name";
  let list = adminWorkspaces.filter((w) => {
    const blob = `${w.name} ${w.id}`.toLowerCase();
    return !term || blob.includes(term);
  });

  if (sort === "created") {
    list = list.slice().sort((a, b) => {
      const aTime = new Date(a.createdAt || a.created_at || 0).getTime();
      const bTime = new Date(b.createdAt || b.created_at || 0).getTime();
      return bTime - aTime;
    });
  } else {
    list = list.slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }

  const header = document.createElement("div");
  header.className = "admin-table-head";
  header.innerHTML = "<span>Name</span><span>ID</span><span>Members</span><span>Channels</span><span>Actions</span>";
  adminWorkspaceList.appendChild(header);

  const channelsSource = (adminChannelsAll && adminChannelsAll.length) ? adminChannelsAll : adminChannels;
  const canDelete = isSuperAdmin();

  list.forEach((w) => {
    const row = document.createElement("div");
    row.className = "admin-table-row";
    const memberCount = Number.isFinite(w.memberCount) ? w.memberCount : 0;
    const channelCount = channelsSource.filter((c) => (c.workspaceId || "default") === w.id).length;
    const actionsHtml = canDelete
      ? `<div class="admin-actions-inline">
          <button class="admin-secondary-btn" type="button">Edit</button>
          <button class="admin-secondary-btn" type="button">Delete</button>
        </div>`
      : `<div class="admin-actions-inline">
          <button class="admin-secondary-btn" type="button">Edit</button>
        </div>`;
    row.innerHTML = `
      <span>${escapeHtml(w.name)}</span>
      <span class="muted">${escapeHtml(w.id)}</span>
      <span>${memberCount}</span>
      <span>${channelCount}</span>
      <div>${actionsHtml}</div>
    `;
    const buttons = row.querySelectorAll("button");
    const editBtn = buttons[0];
    const deleteBtn = buttons[1];
    if (editBtn) editBtn.addEventListener("click", () => showToast("Edit workspace coming soon"));
    if (deleteBtn) deleteBtn.addEventListener("click", () => adminDeleteWorkspace(w));
    adminWorkspaceList.appendChild(row);
  });
}

async function adminDeleteWorkspace(workspace) {
  if (!workspace) return;
  if (!isSuperAdmin()) {
    showToast("Only super admins can delete workspaces");
    return;
  }
  const ok = await openConfirmModal({
    title: "Delete workspace?",
    message: `Delete "${workspace.name}"? This removes all data in this workspace.`,
    confirmText: "Delete",
    cancelText: "Cancel",
    danger: true
  });
  if (!ok) return;

  try {
    await fetchJSON(`/api/workspaces/${workspace.id}`, {
      method: "DELETE",
      headers: { "x-super-admin": "1" }
    });

    if (currentWorkspaceId === workspace.id) {
      currentWorkspaceId = null;
    }
    await loadWorkspacesFromServer();
    await loadChannelsForWorkspace(currentWorkspaceId);
    renderChannels();
    renderWorkspaces();
    renderCommandLists();
    await loadAdminWorkspaces();
    showToast("Workspace deleted");
  } catch (err) {
    console.error("Failed to delete workspace", err);
    let message = "Could not delete workspace";
    if (err && err.message) {
      const trimmed = String(err.message).trim();
      if (trimmed.startsWith("{")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && parsed.error) message = parsed.error;
        } catch (_err) {
          message = trimmed;
        }
      } else if (trimmed) {
        message = trimmed;
      }
    }
    showToast(message);
  }
}

async function loadAdminUsers(wsId) {
  const isSuper = isSuperAdmin();
  let target = wsId || adminCurrentWorkspace || "default";
  if (!isSuper || target === "all") {
    target = adminCurrentWorkspace || target;
  }
  if (target !== "all") {
    adminCurrentWorkspace = target;
  }
  try {
    adminUsers = await fetchJSON(`/api/users?workspaceId=${encodeURIComponent(target)}`);
    if (target === "all") {
      adminUsersAll = adminUsers;
    }
    refreshAdminStats();
    renderAdminUsers();
  } catch (err) {
    console.error("Failed to load users", err);
    showToast("Could not load users");
  }
}

async function loadAdminChannelUsers(wsId) {
  const isSuper = isSuperAdmin();
  let target = wsId || adminChannelWorkspaceId || adminCurrentWorkspace || "default";
  if (!isSuper || target === "all") {
    target = adminCurrentWorkspace || target;
  }
  adminChannelWorkspaceId = target;
  try {
    adminChannelUsers = await fetchJSON(`/api/users?workspaceId=${encodeURIComponent(target)}`);
    renderAdminChannelUsers();
  } catch (err) {
    console.error("Failed to load users for channel", err);
    showToast("Could not load users for channel");
  }
}

async function loadAdminChannels(wsId = "all") {
  try {
    const isSuper = isSuperAdmin();
    const target = isSuper ? wsId : adminCurrentWorkspace;
    const param = target && target !== "all" ? `?workspaceId=${encodeURIComponent(target)}` : "";
    const headers = isSuper ? { "x-super-admin": "1" } : {};
    adminChannels = await fetchJSON(`/api/channels${param}`, { headers });
    if (isSuper && (!wsId || wsId === "all")) {
      adminChannelsAll = adminChannels;
    }
    refreshAdminStats();
    renderAdminChannels();
  } catch (err) {
    console.error("Failed to load channels", err);
  }
}

function renderAdminUsers() {
  if (!adminUserList) return;
  adminUserList.innerHTML = "";
  const term = (adminUserSearch?.value || "").toLowerCase();
  const sort = adminUserSort?.value || "name";
  let list = adminUsers.filter((u) => {
    const name = `${u.name || ""} ${u.firstName || ""} ${u.lastName || ""} ${u.username || ""}`.toLowerCase();
    return !term || name.includes(term);
  });

  if (sort === "username") {
    list = list.slice().sort((a, b) => String(a.username || "").localeCompare(String(b.username || "")));
  } else {
    list = list.slice().sort((a, b) => {
      const aName = (a.name || `${a.firstName || ""} ${a.lastName || ""}`).trim();
      const bName = (b.name || `${b.firstName || ""} ${b.lastName || ""}`).trim();
      return aName.localeCompare(bName);
    });
  }

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No users yet.";
    adminUserList.appendChild(empty);
    return;
  }

  const header = document.createElement("div");
  header.className = "admin-table-head";
  header.innerHTML = "<span>Name</span><span>Status</span><span>Workspace</span><span>Email</span><span>Actions</span>";
  adminUserList.appendChild(header);

  list.forEach((u) => {
    const row = document.createElement("div");
    row.className = "admin-table-row";
    const displayName = (u.name || `${u.firstName || ""} ${u.lastName || ""}`).trim() || "User";
    const status = getRoleText(u.role, "Member");
    const wsName = (adminWorkspaces.find((w) => w.id === u.workspaceId)?.name) || u.workspaceId || "—";
    const email = u.email || "—";
    row.innerHTML = `
      <span>${escapeHtml(displayName)}</span>
      <span class="muted">${escapeHtml(status)}</span>
      <span>${escapeHtml(wsName)}</span>
      <span class="muted">${escapeHtml(email)}</span>
      <span>
        <button class="admin-secondary-btn" type="button">Edit</button>
      </span>
    `;
    const editBtn = row.querySelector("button");
    if (editBtn) {
      editBtn.addEventListener("click", () => showToast("Edit user coming soon"));
    }
    adminUserList.appendChild(row);
  });
}

function renderAdminChannelUsers() {
  if (!adminChannelUserList) return;
  adminChannelUserList.innerHTML = "";
  const term = (adminChannelUserSearch?.value || "").toLowerCase();
  const list = adminChannelUsers.filter((u) => {
    const full = `${u.firstName || ""} ${u.lastName || ""} ${u.username || ""}`.toLowerCase();
    return !term || full.includes(term);
  });

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No users found.";
    adminChannelUserList.appendChild(empty);
    return;
  }

  list.forEach((u) => {
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "8px";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = adminChannelSelectedMembers.has(u.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        adminChannelSelectedMembers.add(u.id);
      } else {
        adminChannelSelectedMembers.delete(u.id);
      }
    });

    const meta = document.createElement("div");
    const status = getRoleText(u.role, "Member");
    meta.innerHTML = `<strong>${u.firstName || ""} ${u.lastName || ""}</strong><div class="muted">${status}</div>`;

    label.appendChild(checkbox);
    label.appendChild(meta);
    row.appendChild(label);
    adminChannelUserList.appendChild(row);
  });
}

function renderAdminChannelUsers2() {
  if (!adminChannelUserList2) return;
  adminChannelUserList2.innerHTML = "";
  const term = (adminChannelUserSearch2?.value || "").toLowerCase();
  const list = adminChannelUsers2.filter((u) => {
    const full = `${u.firstName || ""} ${u.lastName || ""} ${u.username || ""}`.toLowerCase();
    return !term || full.includes(term);
  });

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No users found.";
    adminChannelUserList2.appendChild(empty);
    return;
  }

  list.forEach((u) => {
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "8px";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = adminChannelSelectedMembers2.has(u.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        adminChannelSelectedMembers2.add(u.id);
      } else {
        adminChannelSelectedMembers2.delete(u.id);
      }
      renderAdminSelectedPills2();
    });

    const meta = document.createElement("div");
    const status = getRoleText(u.role, "Member");
    meta.innerHTML = `<strong>${u.firstName || ""} ${u.lastName || ""}</strong><div class="muted">${status}</div>`;

    label.appendChild(checkbox);
    label.appendChild(meta);
    row.appendChild(label);
    adminChannelUserList2.appendChild(row);
  });

  renderAdminSelectedPills2();
}

function renderAdminSelectedPills2() {
  if (!adminChannelSelectedPills2) return;
  adminChannelSelectedPills2.innerHTML = "";
  const selected = adminChannelUsers2.filter((u) => adminChannelSelectedMembers2.has(u.id));
  if (!selected.length) {
    const muted = document.createElement("div");
    muted.className = "muted";
    muted.textContent = "No members selected.";
    adminChannelSelectedPills2.appendChild(muted);
    return;
  }

  selected.forEach((u) => {
    const pill = document.createElement("div");
    pill.className = "selected-pill";
    const status = getRoleText(u.role, "Member");
    pill.innerHTML = `<span>${u.firstName || ""} ${u.lastName || ""}</span><small>${status}</small>`;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.innerHTML = "&times;";
    removeBtn.addEventListener("click", () => {
      adminChannelSelectedMembers2.delete(u.id);
      renderAdminChannelUsers2();
    });
    pill.appendChild(removeBtn);
    adminChannelSelectedPills2.appendChild(pill);
  });
}

function renderAdminChannels() {
  if (!adminChannelList) return;
  adminChannelList.innerHTML = "";
  const term = (adminChannelSearch?.value || "").toLowerCase();
  const sort = adminChannelSort?.value || "name";
  let list = adminChannels.filter((c) => {
    const blob = `${c.name} ${c.workspaceId || ""}`.toLowerCase();
    return !term || blob.includes(term);
  });

  if (sort === "members") {
    list = list.slice().sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0));
  } else {
    list = list.slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No channels yet.";
    adminChannelList.appendChild(empty);
    return;
  }

  const header = document.createElement("div");
  header.className = "admin-table-head";
  header.innerHTML = "<span>Channel</span><span>Workspace</span><span>Members</span><span>Actions</span>";
  adminChannelList.appendChild(header);

  list.forEach((c) => {
    const row = document.createElement("div");
    row.className = "admin-table-row";
    const wsName = (adminWorkspaces.find((w) => w.id === c.workspaceId)?.name) || c.workspaceId || "default";
    row.innerHTML = `
      <span>#${escapeHtml(c.name)}</span>
      <span class="muted">${escapeHtml(wsName)}</span>
      <span>${c.memberCount || 0}</span>
      <span>
        <button class="admin-secondary-btn" type="button">Edit</button>
        <button class="admin-secondary-btn" type="button">Delete</button>
      </span>
    `;
    const [editBtn, deleteBtn] = row.querySelectorAll("button");
    if (editBtn) {
      editBtn.addEventListener("click", () => adminEditChannel(c));
    }
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => adminDeleteChannel(c));
    }
    adminChannelList.appendChild(row);
  });
}

async function loadAdminSchoolRequests() {
  if (!isSuperAdmin()) return;
  try {
    adminSchoolRequests = await fetchJSON("/api/admin/school-requests?status=PENDING", {
      headers: {
        "x-super-admin": "1",
        "x-super-admin-id": getCurrentUserId() || "super-admin"
      }
    });
    renderAdminSchoolRequests();
  } catch (err) {
    console.error("Failed to load school requests", err);
    showToast("Could not load school requests");
  }
}

function renderAdminSchoolRequests() {
  if (!adminSchoolRequestsList) return;
  adminSchoolRequestsList.innerHTML = "";
  if (!adminSchoolRequests.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No pending requests.";
    adminSchoolRequestsList.appendChild(empty);
    return;
  }

  const header = document.createElement("div");
  header.className = "admin-table-head";
  header.innerHTML = "<span>School</span><span>Actions</span>";
  adminSchoolRequestsList.appendChild(header);

  adminSchoolRequests.forEach((req) => {
    const row = document.createElement("div");
    row.className = "admin-table-row";

    const name = document.createElement("span");
    name.textContent = req.schoolName || "School";

    const actions = document.createElement("div");
    actions.className = "admin-actions-inline";

    const approveBtn = document.createElement("button");
    approveBtn.className = "admin-primary-btn";
    approveBtn.type = "button";
    approveBtn.textContent = "Approve";
    approveBtn.addEventListener("click", async () => {
      const ok = await openConfirmModal({
        title: "Approve school?",
        message: `Approve ${req.schoolName || "this school"}?`,
        confirmText: "Approve"
      });
      if (!ok) return;
      try {
        await fetchJSON(`/api/admin/school-requests/${req.id}/approve`, {
          method: "POST",
          headers: {
            "x-super-admin": "1",
            "x-super-admin-id": getCurrentUserId() || "super-admin"
          }
        });
        showToast("School approved.");
        adminSchoolRequests = adminSchoolRequests.filter((r) => r.id !== req.id);
        renderAdminSchoolRequests();
        await loadAdminWorkspaces();
      } catch (err) {
        console.error("Failed to approve school", err);
        showToast("Could not approve school");
      }
    });

    const rejectBtn = document.createElement("button");
    rejectBtn.className = "admin-secondary-btn";
    rejectBtn.type = "button";
    rejectBtn.textContent = "Reject";
    rejectBtn.addEventListener("click", async () => {
      const ok = await openConfirmModal({
        title: "Reject school?",
        message: `Reject ${req.schoolName || "this school"}?`,
        confirmText: "Reject",
        danger: true
      });
      if (!ok) return;
      try {
        await fetchJSON(`/api/admin/school-requests/${req.id}/reject`, {
          method: "POST",
          headers: {
            "x-super-admin": "1",
            "x-super-admin-id": getCurrentUserId() || "super-admin"
          },
          body: JSON.stringify({ reason: "" })
        });
        showToast("Request rejected.");
        adminSchoolRequests = adminSchoolRequests.filter((r) => r.id !== req.id);
        renderAdminSchoolRequests();
      } catch (err) {
        console.error("Failed to reject school", err);
        showToast("Could not reject request");
      }
    });

    actions.appendChild(approveBtn);
    actions.appendChild(rejectBtn);
    row.appendChild(name);
    row.appendChild(actions);
    adminSchoolRequestsList.appendChild(row);
  });
}

async function adminEditChannel(channel) {
  if (!channel) return;
  const currentName = String(channel.name || "").trim();
  const nextNameRaw = prompt(`Rename channel #${currentName}:`, currentName);
  if (nextNameRaw === null) return;
  const nextName = nextNameRaw.trim();
  if (!nextName) {
    showToast("Channel name cannot be empty");
    return;
  }

  const currentTopic = String(channel.topic || "");
  const nextTopicRaw = prompt(`Topic for #${nextName}:`, currentTopic);
  if (nextTopicRaw === null) return;
  const nextTopic = nextTopicRaw.trim();

  try {
    const updated = await fetchJSON(`/api/channels/${channel.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: nextName,
        topic: nextTopic
      })
    });

    const applyUpdate = (arr) => {
      if (!Array.isArray(arr)) return;
      const idx = arr.findIndex((c) => c.id === channel.id);
      if (idx !== -1) arr[idx] = { ...arr[idx], ...updated };
    };
    applyUpdate(channels);
    applyUpdate(adminChannels);
    applyUpdate(adminChannelsAll);

    renderAdminChannels();
    renderChannels();
    renderCommandLists();

    if (currentChannelId === channel.id) {
      renderChannelHeader(channel.id);
      setComposerPlaceholder(`Write a message in #${updated.name || nextName}`);
    }

    showToast("Channel updated");
  } catch (err) {
    console.error("Failed to update channel", err);
    showToast("Could not update channel");
  }
}

async function adminDeleteChannel(channel, { restoreOnCancel } = {}) {
  if (!channel) return;
  const ok = await openConfirmModal({
    title: "Delete channel?",
    message: `Delete #${channel.name}? This will remove all its messages.`,
    confirmText: "Delete",
    cancelText: "Cancel",
    danger: true
  });
  if (!ok) {
    if (typeof restoreOnCancel === "function") restoreOnCancel();
    return;
  }

  try {
    await fetchJSON(`/api/channels/${channel.id}`, { method: "DELETE" });

    const removeFrom = (arr) => {
      if (!Array.isArray(arr)) return;
      const idx = arr.findIndex((c) => c.id === channel.id);
      if (idx !== -1) arr.splice(idx, 1);
    };
    removeFrom(channels);
    removeFrom(adminChannels);
    removeFrom(adminChannelsAll);
    delete messagesByChannel[channel.id];

    if (currentChannelId === channel.id) {
      const fallback = channels[0] ? channels[0].id : null;
      if (fallback) {
        currentChannelId = fallback;
        if (!messagesByChannel[fallback]) {
          const msgs = await fetchJSON(`/api/channels/${fallback}/messages`);
          messagesByChannel[fallback] = msgs;
        }
        renderChannelHeader(fallback);
        renderMessages(fallback);
      } else if (messagesContainer) {
        currentChannelId = null;
        messagesContainer.innerHTML = "";
      }
    }

    renderAdminChannels();
    renderChannels();
    renderCommandLists();
    showToast("Channel deleted");
  } catch (err) {
    console.error("Failed to delete channel", err);
    showToast("Could not delete channel");
  }
}

function renderAdminAssignLists() {
  renderAssignUsers();
  renderAssignWorkspaces();
  renderAssignChannels();
}

function renderAssignUsers() {
  if (!adminAssignUserList) return;
  adminAssignUserList.innerHTML = "";
  const term = (adminAssignUserSearch?.value || "").toLowerCase();
  const source = (adminUsersAll && adminUsersAll.length) ? adminUsersAll : (adminUsers || []);
  const list = source.filter((u) => {
    const full = `${u.firstName || ""} ${u.lastName || ""} ${u.username || ""}`.toLowerCase();
    return !term || full.includes(term);
  });
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No users found.";
    adminAssignUserList.appendChild(empty);
    return;
  }
  list.forEach((u) => {
    const row = document.createElement("div");
    row.className = "row" + (adminAssignSelectedUserId === u.id ? " row-selected" : "");
    const status = getRoleText(u.role, "Member");
    row.textContent = `${u.firstName || ""} ${u.lastName || ""} • ${status}`.trim();
    row.addEventListener("click", () => {
      adminAssignSelectedUserId = u.id;
      // auto-select workspace to user's workspace
      adminAssignSelectedWorkspaceId = u.workspaceId || adminAssignSelectedWorkspaceId;
      renderAssignUsers();
      renderAssignWorkspaces();
      renderAssignChannels();
    });
    adminAssignUserList.appendChild(row);
  });
}

function renderAssignWorkspaces() {
  if (!adminAssignWorkspaceList) return;
  adminAssignWorkspaceList.innerHTML = "";
  const term = (adminAssignWorkspaceSearch?.value || "").toLowerCase();
  const list = (adminWorkspaces || []).filter((w) =>
    !term || `${w.name} ${w.id}`.toLowerCase().includes(term)
  );
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No workspaces found.";
    adminAssignWorkspaceList.appendChild(empty);
    return;
  }
  list.forEach((w) => {
    const row = document.createElement("div");
    row.className = "row" + (adminAssignSelectedWorkspaceId === w.id ? " row-selected" : "");
    row.textContent = `${w.name} (${w.id})`;
    row.addEventListener("click", () => {
      adminAssignSelectedWorkspaceId = w.id;
      // clear channel selection when workspace changes
      adminAssignSelectedChannelId = null;
      renderAssignWorkspaces();
      renderAssignChannels();
      renderAssignUsers();
    });
    adminAssignWorkspaceList.appendChild(row);
  });
}

function renderAssignChannels() {
  if (!adminAssignChannelList) return;
  adminAssignChannelList.innerHTML = "";
  const term = (adminAssignChannelSearch?.value || "").toLowerCase();
  const ws = adminAssignSelectedWorkspaceId;
  const source = (adminChannelsAll && adminChannelsAll.length) ? adminChannelsAll : (adminChannels || []);
  const list = source.filter((c) => {
    const matchesWs =
      !ws || c.workspaceId === ws || c.workspaceId === "all";
    const matchesTerm = !term || `${c.name} ${c.id}`.toLowerCase().includes(term);
    return matchesWs && matchesTerm;
  });
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No channels found.";
    adminAssignChannelList.appendChild(empty);
    return;
  }
  list.forEach((c) => {
    const row = document.createElement("div");
    row.className = "row" + (adminAssignSelectedChannelId === c.id ? " row-selected" : "");
    row.textContent = `#${c.name} (${c.workspaceId || "default"})`;
    row.addEventListener("click", () => {
      adminAssignSelectedChannelId = c.id;
      renderAssignChannels();
    });
    adminAssignChannelList.appendChild(row);
  });
}

async function handleAdminAssign() {
  if (!adminAssignSelectedUserId || !adminAssignSelectedWorkspaceId) {
    showToast("Select user and workspace");
    return;
  }
  try {
    await fetchJSON("/api/admin/assign", {
      method: "POST",
      headers: { "x-admin": "1" },
      body: JSON.stringify({
        userId: adminAssignSelectedUserId,
        workspaceId: adminAssignSelectedWorkspaceId,
        channelId: adminAssignSelectedChannelId || null
      })
    });
    showToast("Assignment saved");
  } catch (err) {
    console.error("Failed to assign", err);
    showToast("Could not assign user");
  }
}

async function adminCreateWorkspace() {
  if (!adminWsName) return;
  if (!isSuperAdmin()) {
    showToast("Only super admins can create workspaces");
    return;
  }
  const name = adminWsName.value.trim();
  if (!name) {
    showToast("Enter workspace name");
    return;
  }
  adminWsCreateBtn.disabled = true;
  try {
    const res = await fetchJSON("/api/workspaces", {
      method: "POST",
      headers: { "x-super-admin": "1" },
      body: JSON.stringify({ name })
    });
    const ws = res.workspace || res;
    adminWorkspaces.push(ws);
    adminCurrentWorkspace = ws.id;
    renderAdminWorkspaceSelects();
    renderAdminWorkspaces();
    adminWsName.value = "";
    closeAdminModal(adminWorkspaceModal);
    await loadAdminUsers("all");
    await loadAdminChannels();
    showToast("Workspace created");
  } catch (err) {
    console.error("Failed to create workspace", err);
    showToast("Could not create workspace");
  } finally {
    adminWsCreateBtn.disabled = false;
  }
}

async function adminCreateUser() {
  if (!adminUserFirst || !adminUserLast || !adminUserEmail || !adminUserPassword) return;
  const fn = adminUserFirst.value.trim();
  const ln = adminUserLast.value.trim();
  const wsId = (adminUserWorkspace && adminUserWorkspace.value) || adminCurrentWorkspace || "default";
  const email = adminUserEmail.value.trim();
  const pwd = adminUserPassword.value.trim();
  const avatarUrl = (adminUserAvatar?.value || "").trim();
  if (!fn || !ln || !email || !pwd) {
    showToast("Enter first/last name, email, and password");
    return;
  }
  const channelIds = Array.from(adminUserSelectedChannelIds);
  adminUserCreateBtn.disabled = true;
  try {
    const user = await fetchJSON("/api/users", {
      method: "POST",
      body: JSON.stringify({
        firstName: fn,
        lastName: ln,
        workspaceId: wsId,
        email,
        password: pwd,
        channelIds,
        avatarUrl
      })
    });
    if (wsId === adminCurrentWorkspace) {
      adminUsers.push(user);
      renderAdminUsers();
    }
    adminUserFirst.value = "";
    adminUserLast.value = "";
    adminUserEmail.value = "";
    adminUserPassword.value = "";
    if (adminUserAvatar) adminUserAvatar.value = "";
    adminUserSelectedChannelIds = new Set();
    renderAdminSelectedChannels();
    closeAdminModal(adminUserModal);
    const createdName =
      user.name ||
      `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
      user.email ||
      "User";
    showToast(`User ${createdName} created`);
  } catch (err) {
    console.error("Failed to create user", err);
    showToast("Could not create user");
  } finally {
    adminUserCreateBtn.disabled = false;
  }
}

async function adminCreateChannel() {
  if (!adminChannelName || !adminChannelWorkspace) return;
  const name = adminChannelName.value.trim();
  const topic = (adminChannelTopic?.value || "").trim();
  const wsId = adminChannelWorkspace.value || adminChannelWorkspaceId || "default";
  if (!name) {
    showToast("Enter channel name");
    return;
  }
  if (!isSuperAdmin() && wsId === "all") {
    showToast("Only super admins can create global channels");
    return;
  }

  const memberIds = Array.from(adminChannelSelectedMembers);
  adminChannelCreateBtn.disabled = true;
  try {
    const channel = await fetchJSON("/api/channels", {
      method: "POST",
      headers: { "x-admin": "1" },
      body: JSON.stringify({
        name,
        topic,
        workspaceId: wsId,
        memberIds
      })
    });

    // refresh current workspace channels if relevant
    if (wsId === currentWorkspaceId || wsId === "all") {
      await loadChannelsForWorkspace(currentWorkspaceId);
      renderChannels();
      renderCommandLists();
    }
    await loadAdminChannels(); // refresh list

    adminChannelName.value = "";
    if (adminChannelTopic) adminChannelTopic.value = "";
    adminChannelSelectedMembers = new Set();
    renderAdminChannelUsers();
    closeAdminModal(adminChannelModal);
    showToast(`Channel #${channel.name} created`);
  } catch (err) {
    console.error("Failed to create channel", err);
    showToast("Could not create channel");
  } finally {
    adminChannelCreateBtn.disabled = false;
  }
}

function revealAdminAppPanel() {
  if (!adminLoginView || !adminAppView) return;
  adminLoginView.classList.add("hidden");
  adminAppView.classList.remove("hidden");
  updateAdminNavVisibility();
  setAdminTab(adminActiveTab);
  loadAdminWorkspaces().then(() => {
    switchToAdminWorkspace();
  });
}

function openAdminOverlay() {
  if (!adminOverlay) return;
  if (adminOverlay.parentElement !== document.body) {
    document.body.appendChild(adminOverlay);
  }
  adminOverlay.classList.remove("hidden");
  adminOverlay.style.display = "flex";
  if (adminLoggedIn) {
    revealAdminAppPanel();
  } else {
    adminLoginView.classList.remove("hidden");
    adminAppView.classList.add("hidden");
  }
}

function closeAdminOverlay() {
  if (adminDockActive) {
    closeAdminDock();
    return;
  }
  if (!adminOverlay) return;
  adminOverlay.classList.add("hidden");
  adminOverlay.style.display = "none";
  if (adminModal) adminModal.classList.remove("admin-modal-full");
}

function openAdminDock() {
  if (!adminDock || !adminModal || !chatPanel) {
    openAdminOverlay();
    return;
  }
  adminDockActive = true;
  chatPanel.classList.add("admin-docked");
  adminDock.classList.remove("hidden");

  if (adminModal.parentElement !== adminDock) {
    adminDock.appendChild(adminModal);
  }
  if (adminOverlay) {
    adminOverlay.classList.add("hidden");
    adminOverlay.style.display = "none";
  }

  if (adminLoggedIn) {
    revealAdminAppPanel();
  } else {
    adminLoginView.classList.remove("hidden");
    adminAppView.classList.add("hidden");
  }

  if (adminModal) adminModal.classList.remove("admin-modal-full");
  if (releaseAdminTrap) releaseAdminTrap();
  releaseAdminTrap = trapFocus(adminDock);
  requestAnimationFrame(() => {
    const focusTarget = adminDock.querySelector("button, input, select, textarea");
    if (focusTarget && typeof focusTarget.focus === "function") {
      focusTarget.focus();
    }
  });
}

function closeAdminDock() {
  if (!adminDock || !chatPanel || !adminModal) return;
  adminDockActive = false;
  adminDock.classList.add("hidden");
  chatPanel.classList.remove("admin-docked");
  if (adminOverlay && adminModal.parentElement !== adminOverlay) {
    adminOverlay.appendChild(adminModal);
  }
  if (releaseAdminTrap) releaseAdminTrap();
  releaseAdminTrap = null;
}

function toggleAdminFullscreen() {
  if (!adminModal) return;
  adminModal.classList.toggle("admin-modal-full");
}


async function loadChannelsForWorkspace(workspaceId) {
  try {
    const isSuper = isSuperAdmin();
    const wsParam = isSuper
      ? ""
      : `?workspaceId=${encodeURIComponent(workspaceId || getCurrentWorkspaceId())}`;
    const headers = isSuper ? { "x-super-admin": "1" } : {};
    const fetchedChannels = await fetchJSON(`/api/channels${wsParam}`, { headers });
    channels = Array.isArray(fetchedChannels)
      ? fetchedChannels.map(normalizeChannelType)
      : [];
    await loadCurrentUserClasses(workspaceId);
    populateLiveClassOptions();
    refreshRegistrationClassOptions().catch((err) => console.error("Registration options failed", err));
  } catch (err) {
    console.error("Failed to load channels", err);
    showToast("Could not load channels");
  }
}

function switchToAdminWorkspace() {
  const targetWorkspace =
    adminCurrentWorkspace || adminWorkspaces[0]?.id || currentWorkspaceId || "default";
  if (!targetWorkspace) return;
  if (currentWorkspaceId !== targetWorkspace) {
    currentWorkspaceId = targetWorkspace;
    persistCurrentWorkspace();
    renderWorkspaces();
  }
  loadChannelsForWorkspace(targetWorkspace)
    .then(() => {
      renderChannels();
      renderCommandLists();
    })
    .catch((err) => {
      console.error("Failed to load admin workspace channels", err);
    });
}

function loadSavedMessages() {
  try {
    const raw = localStorage.getItem(SAVED_MESSAGES_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      savedMessagesById = parsed;
    }
  } catch (err) {
    console.warn("Could not load saved messages", err);
  }
}

function persistSavedMessages() {
  try {
    localStorage.setItem(SAVED_MESSAGES_STORAGE_KEY, JSON.stringify(savedMessagesById));
  } catch (err) {
    console.warn("Could not save messages", err);
  }
}

function setSuperAdminLanding(visible) {
  if (!superAdminLanding) return;
  if (visible) {
    superAdminLanding.classList.remove("hidden");
    document.body.classList.add("admin-landing-mode");
  } else {
    superAdminLanding.classList.add("hidden");
    document.body.classList.remove("admin-landing-mode");
  }
}

async function loadEmployeesForWorkspace(workspaceId) {
  if (!workspaceId) workspaceId = currentWorkspaceId || "default";
  try {
    const wsParam = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
    employees = await fetchJSON(`/api/users${wsParam}`);
    renderEmployees();
  } catch (err) {
    console.error("Failed to load employees", err);
    showToast("Could not load employees");
  }
}

function renderEmployees() {
  if (!employeesList) return;
  employeesList.innerHTML = "";

  if (!employees.length) {
    const empty = document.createElement("div");
    empty.className = "helper-text";
    empty.textContent = "No employees in this workspace yet.";
    employeesList.appendChild(empty);
    return;
  }

  employees.forEach((u) => {
    const row = document.createElement("div");
    row.className = "employee-row";

    const main = document.createElement("div");
    main.className = "employee-main";

    const avatar = document.createElement("div");
    avatar.className = "employee-avatar";
    const initials = (u.firstName?.[0] || "") + (u.lastName?.[0] || "");
    applyAvatarToNode(
      avatar,
      initials.toUpperCase(),
      u.avatarUrl || null,
      `${u.firstName || ""} ${u.lastName || ""}`.trim(),
      u.role || ""
    );

    const meta = document.createElement("div");
    const nameEl = document.createElement("div");
    nameEl.className = "employee-name";
    nameEl.textContent = `${u.firstName} ${u.lastName}`;

    const userEl = document.createElement("div");
    userEl.className = "employee-username";
    setStatusInText(userEl, u.role, "Member");

    meta.appendChild(nameEl);
    meta.appendChild(userEl);

    main.appendChild(avatar);
    main.appendChild(meta);

    row.appendChild(main);
    employeesList.appendChild(row);
  });
}

// ===================== DOM REFS =====================

// composer / input area
const addChannelBtn = document.querySelector(
  "#channelList .sidebar-section-header .icon-btn"
);
const addConversationBtn = document.querySelector(
  "#conversationClubSection .sidebar-section-header .icon-btn"
);
const addExamGroupBtn = document.querySelector(
  "#examGroupsSection .sidebar-section-header .icon-btn"
);
const addAppBtn = document.querySelector(
  "#appsSection .sidebar-section-header .icon-btn"
);
const addDmBtn = document.querySelector("#dmList .sidebar-section-header .icon-btn");
const workspaceList = document.getElementById("workspaceList");
const workspaceAddBtn = document.getElementById("workspaceAddBtn");
const schoolNameLabel = document.getElementById("schoolNameLabel");
const schoolLogoButton = document.getElementById("schoolLogoButton");
const schoolLogoInput = document.getElementById("schoolLogoInput");
const schoolLogoImg = document.getElementById("schoolLogoImg");
const schoolLogoFallback = document.getElementById("schoolLogoFallback");
const schoolLogoProfileBadge = document.getElementById("schoolLogoProfileBadge");
const schoolLogoProfileBadgeImg = document.getElementById("schoolLogoProfileBadgeImg");
const schoolLogoProfileBadgeIcon = document.getElementById("schoolLogoProfileBadgeIcon");
const schoolRailLogoImg = document.getElementById("schoolRailLogoImg");
const schoolRailLogoFallback = document.getElementById("schoolRailLogoFallback");
const densityButtons = document.querySelectorAll(".density-btn");

const threadAttachBtn = document.getElementById("threadAttachBtn");
const threadFileInput = document.getElementById("threadFileInput");
const openPinnedBtn = document.getElementById("openPinnedBtn");

const channelsContainer = document.getElementById("channelsContainer");
const conversationClubChannels = document.getElementById("conversationClubChannels");
const examGroupsChannels = document.getElementById("examGroupsChannels");
const appsChannelsContainer = document.getElementById("appsChannelsContainer");
const dmsContainer = document.getElementById("dmsContainer");
const sidebarScroll = document.querySelector(".sidebar-scroll");
const livePanel = document.getElementById("livePanel");
const liveCreateBtn = document.getElementById("liveCreateBtn");
const liveSessionsList = document.getElementById("liveSessionsList");
const liveRecentMeta = document.getElementById("liveRecentMeta");
const liveRecentList = document.getElementById("liveRecentList");
const liveTabs = document.querySelectorAll(".live-tab");
const liveSessionModal = document.getElementById("liveSessionModal");
const liveSessionForm = document.getElementById("liveSessionForm");
const liveSessionIdInput = document.getElementById("liveSessionId");
const liveClassSelect = document.getElementById("liveClassSelect");
const liveTitleInput = document.getElementById("liveTitleInput");
const liveDateInput = document.getElementById("liveDateInput");
const liveStartInput = document.getElementById("liveStartInput");
const liveEndInput = document.getElementById("liveEndInput");
const liveUrlInput = document.getElementById("liveUrlInput");
const livePassInput = document.getElementById("livePassInput");
const liveAutopostSelect = document.getElementById("liveAutopostSelect");
const liveStudentNotesInput = document.getElementById("liveStudentNotesInput");
const liveNotifyEmail = document.getElementById("liveNotifyEmail");
const liveModalDanger = document.getElementById("liveModalDanger");
const liveModalTitle = document.getElementById("liveModalTitle");
const liveModalClose = document.getElementById("liveModalClose");
const liveModalCancel = document.getElementById("liveModalCancel");
const liveModalSave = document.getElementById("liveModalSave");
const liveDeleteBtn = document.getElementById("liveDeleteBtn");
const liveDeleteConfirmModal = document.getElementById("liveDeleteConfirmModal");
const liveDeleteConfirmOk = document.getElementById("liveDeleteConfirmOk");
const liveDeleteConfirmCancel = document.getElementById("liveDeleteConfirmCancel");
const liveDeleteConfirmClose = document.getElementById("liveDeleteConfirmClose");
const liveAttendanceModal = document.getElementById("liveAttendanceModal");
const liveAttendanceMeta = document.getElementById("liveAttendanceMeta");
const liveAttendanceList = document.getElementById("liveAttendanceList");
const liveAttendanceClose = document.getElementById("liveAttendanceClose");
const liveAttendanceCancel = document.getElementById("liveAttendanceCancel");
const liveAttendanceSave = document.getElementById("liveAttendanceSave");
const SCHOOL_SETTINGS_CHANNEL_ID = "school-settings";
const schoolEmailSettingsPage = document.getElementById("schoolEmailSettingsPage");
const schoolEmailSettingsPageHome = schoolEmailSettingsPage?.parentElement || null;
const schoolEmailHeaderActions = document.getElementById("schoolEmailHeaderActions");
const schoolEmailHeaderActionsHome = schoolEmailHeaderActions?.parentElement || null;
const schoolSettingsHeaderToggle = document.getElementById("schoolSettingsHeaderToggle");
const schoolSettingsHeaderToggleHome = schoolSettingsHeaderToggle?.parentElement || null;
const emailPanelHeaderActions = document.getElementById("emailPanelHeaderActions");
const emailPanelToggle = document.getElementById("emailPanelToggle");
const emailPanelBody = document.getElementById("emailPanelBody");
const sesFormatBtn = document.getElementById("sesFormatBtn");
const sesFormatCard = document.getElementById("sesFormatCard");
const sesInboxBtn = document.getElementById("sesInboxBtn");
const sesTrashBtn = document.getElementById("sesTrashBtn");
const sesInboxPanel = document.getElementById("sesInboxPanel");
const sesInboxList = document.getElementById("sesInboxList");
const sesInboxPlaceholder = document.getElementById("sesInboxPlaceholder");
const sesInboxCount = document.getElementById("sesInboxCount");
const sesInboxDetail = document.getElementById("sesInboxDetail");
const sesInboxBackBtn = document.getElementById("sesInboxBackBtn");
const sesInboxDetailAvatar = document.getElementById("sesInboxDetailAvatar");
const sesInboxDetailName = document.getElementById("sesInboxDetailName");
const sesInboxDetailEmail = document.getElementById("sesInboxDetailEmail");
const sesInboxDetailDate = document.getElementById("sesInboxDetailDate");
const sesInboxDetailSubject = document.getElementById("sesInboxDetailSubject");
const sesInboxDetailAttachments = document.getElementById("sesInboxDetailAttachments");
const sesInboxDetailBody = document.getElementById("sesInboxDetailBody");
const sesInboxRefreshBtn = document.getElementById("sesInboxRefreshBtn");
const sesInboxMarkAllBtn = document.getElementById("sesInboxMarkAllBtn");
const sesFormatBackBtn = document.getElementById("sesFormatBackBtn");
const detailReplyGreeting = document.getElementById("detailReplyGreeting");
const sesMainSettingsBody = schoolEmailSettingsPage ? schoolEmailSettingsPage.querySelector(".ses-body") : null;
const sesClose = document.getElementById("sesClose");
const sesCancel = document.getElementById("sesCancel");
const sesSave = document.getElementById("sesSave");
const sesTestBtn = document.getElementById("sesTestBtn");
const sesStatus = document.getElementById("sesStatus");

const sesEnabled = document.getElementById("sesEnabled");
const sesSchoolName = document.getElementById("sesSchoolName");
const sesReplyTo = document.getElementById("sesReplyTo");
const sesFooter = document.getElementById("sesFooter");
const sesSubjectPrefix = document.getElementById("sesSubjectPrefix");
const sesSignatureHtml = document.getElementById("sesSignatureHtml");
const sesSignatureHours = document.getElementById("sesSignatureHours");
const sesSignatureAddress = document.getElementById("sesSignatureAddress");
const sesSignaturePhone = document.getElementById("sesSignaturePhone");
const sesSignatureEmail = document.getElementById("sesSignatureEmail");
const sesSignatureRegistration = document.getElementById("sesSignatureRegistration");
const sesSignaturePreview = document.getElementById("sesSignaturePreview");
const sesLogoPreview = document.getElementById("sesLogoPreview");
const sesLogoUploadBtn = document.getElementById("sesLogoUploadBtn");
const sesLogoInput = document.getElementById("sesLogoInput");
const sesTestTo = document.getElementById("sesTestTo");
const sesBodyText = document.getElementById("sesBodyText");
const sesBodyGreetingPreview = document.getElementById("sesBodyGreetingPreview");
const sesBodyClosingPreview = document.getElementById("sesBodyClosingPreview");
const sesEmailPreviewPanel = document.getElementById("sesEmailPreviewPanel");
const sesPreviewRecipient = document.getElementById("sesPreviewRecipient");
const sesPreviewSubject = document.getElementById("sesPreviewSubject");
const sesPreviewBody = document.getElementById("sesPreviewBody");
const sesPreviewTimestamp = document.getElementById("sesPreviewTimestamp");
const sesHistoryList = document.getElementById("sesHistoryList");
const sesHistoryEmpty = document.getElementById("sesHistoryEmpty");
const sesHistoryClearBtn = document.getElementById("sesHistoryClearBtn");
const classSchoolDetails = document.getElementById("classSchoolDetails");
const classSchoolDetailName = document.getElementById("classSchoolDetailName");
const classSchoolDetailAddress = document.getElementById("classSchoolDetailAddress");
const classSchoolDetailPostal = document.getElementById("classSchoolDetailPostal");
const classSchoolDetailCountry = document.getElementById("classSchoolDetailCountry");
const openClassSettingsBtn = document.getElementById("openClassSettings");
const classSettingsPage = document.getElementById("classSettingsPage");
const classSettingsList = document.getElementById("classSettingsList");
const classSettingsClose = document.getElementById("classSettingsClose");
const classSettingsSearch = document.getElementById("classSettingsSearch");
const openClassSettingsListBtn = document.getElementById("openClassSettingsList");
let sesLogoUrlValue = "";
let sesWorkspaceProfileCache = null;
let sesEmailLogs = [];
let sesInboxMessages = [];
let sesInboxDetailVisible = false;
let sesInboxActiveMessage = null;
let sesActiveHistoryLogId = null;
let sesFormatViewActive = false;
let sesCurrentMailboxFolder = "inbox";
const sesRegistrationDetails = document.getElementById("sesRegistrationDetails");
const sesPreviewBtn = document.getElementById("sesPreviewBtn");
let liveScope = "all";
let liveSessions = [];
let liveAttendanceData = [];
let liveActiveSession = null;
let schoolSettingsPreviousChannelId = null;
let releaseSchoolSettingsTrap = null;
let classSettingsPreviousChannelId = null;
let releaseClassSettingsTrap = null;
let classSettingsHeaderBackup = null;
let classSettingsActiveCard = null;
let classSettingsDeleteTarget = null;
const classDeleteModal = document.getElementById("classDeleteModal");
const classDeleteCancel = document.getElementById("classDeleteCancel");
const classDeleteConfirm = document.getElementById("classDeleteConfirm");
const classMetaCache = new Map();

const headerChannelName = document.getElementById("headerChannelName");
const headerChannelPrivacy = document.getElementById("headerChannelPrivacy");
const headerChannelLanguageBtn = document.getElementById("headerChannelLanguageBtn");
const headerChannelTopic = document.getElementById("headerChannelTopic");
const headerMemberCountStudents = document.getElementById("headerMemberCountStudents");
const headerMemberCountTeachers = document.getElementById("headerMemberCountTeachers");
const headerMemberCountAdmins = document.getElementById("headerMemberCountAdmins");
const headerDocCountBtn = document.getElementById("headerDocCountBtn");
const headerDocCountValue = document.getElementById("headerDocCountValue");
const channelRoleTabs = document.getElementById("channelRoleTabs");
const channelAddMemberBtn = document.getElementById("channelAddMemberBtn");
const headerStarBtn = document.getElementById("headerStarBtn");
const headerPinBtn = document.getElementById("headerPinBtn");
const headerMuteBtn = document.getElementById("headerMuteBtn");
const headerClearCultureBtn = document.getElementById("headerClearCultureBtn");
const clearCulturePopup = document.getElementById("clearCulturePopup");
const headerClearCultureConfirm = document.getElementById("headerClearCultureConfirm");
const headerClearCultureCancel = document.getElementById("headerClearCultureCancel");
const channelSearchInput = document.getElementById("channelSearchInput");
const channelSearchBtn = document.getElementById("channelSearchBtn");
const channelSearchResults = document.getElementById("channelSearchResults");
const chatHeader = document.getElementById("chatHeader");
const headerLineActions = document.getElementById("headerLineActions");
const privacyChannelHeader = document.getElementById("privacyChannelHeader");
const privacyHeaderControls = document.getElementById("privacyHeaderControls");
const privacyHeaderSchoolName = document.getElementById("privacyHeaderSchoolName");
const privacyHeaderUpdated = document.getElementById("privacyHeaderUpdated");
const privacyHeaderSubtitle = document.getElementById("privacyHeaderSubtitle");
const examRegistrationPanels = document.getElementById("examRegistrationPanels");
let headerLineActionsPlaceholder = null;

function getActiveWorkspaceName() {
  const workspace = workspaces.find((w) => w.id === currentWorkspaceId);
  return workspace?.name || workspaces[0]?.name || "School";
}

function moveHeaderActionsToPrivacy() {
  if (!headerLineActions || !privacyHeaderControls) return;
  if (headerLineActionsPlaceholder) return;
  headerLineActionsPlaceholder = document.createComment("header-line-actions-placeholder");
  headerLineActions.parentNode.insertBefore(headerLineActionsPlaceholder, headerLineActions);
  privacyHeaderControls.appendChild(headerLineActions);
  headerLineActions.classList.add("privacy-actions-docked");
}

function restoreHeaderActionsFromPrivacy() {
  if (!headerLineActions || !headerLineActionsPlaceholder) return;
  headerLineActionsPlaceholder.replaceWith(headerLineActions);
  headerLineActionsPlaceholder = null;
  headerLineActions.classList.remove("privacy-actions-docked");
}
const bannerChannelName = document.getElementById("bannerChannelName");
const dmAddMemberBtn = document.getElementById("dmAddMemberBtn");
const dmEditMemberBtn = document.getElementById("dmEditMemberBtn");
const channelLevelButtons = document.getElementById("channelLevelButtons");

const channelMembersModal = document.getElementById("channelMembersModal");
const channelMembersTitle = document.getElementById("channelMembersTitle");
const channelMembersList = document.getElementById("channelMembersList");
const channelMembersRoleTabs = document.getElementById("channelMembersRoleTabs");
const channelMembersClose = document.getElementById("channelMembersClose");
const channelAssignModal = document.getElementById("channelAssignModal");
const channelAssignTitle = document.getElementById("channelAssignTitle");
const channelAssignList = document.getElementById("channelAssignList");
const channelAssignClose = document.getElementById("channelAssignClose");
const channelAssignSearch = document.getElementById("channelAssignSearch");
const channelAssignSave = document.getElementById("channelAssignSave");

const messagesContainer = document.getElementById("messagesContainer");
const composer = document.getElementById("composer");
const messageInput = document.getElementById("messageInput");
let sendButton = document.getElementById("sendButtonMain");
// rich text editor DOM
const rteEditor = document.getElementById("rteEditor");
const rteBlockSelect = document.getElementById("rteBlockSelect");
const rteButtons = document.querySelectorAll("[data-rte-command]");
const attachFileBtn = document.getElementById("attachFileBtn");
const fileInput = document.getElementById("fileInput");
const audioBtn = document.getElementById("audioBtn");
const videoBtn = document.getElementById("videoBtn");
const recordingOverlay = document.getElementById("recordingOverlay");
const composerStatus = document.getElementById("composerStatus") || recordingOverlay;
const recLabel = document.getElementById("recLabel");
const recTimer = document.getElementById("recTimer");
const recPauseBtn = document.getElementById("recPauseBtn");
const recResumeBtn = document.getElementById("recResumeBtn");
const recStopBtn = document.getElementById("recStopBtn") || document.getElementById("recDoneBtn");
const recCancelBtn = document.getElementById("recCancelBtn");
const pendingAttachmentsEl = document.getElementById("pendingAttachments");
const recBars = document.querySelector(".rec-bars");
const recPreview = document.getElementById("recPreview");
const inputBar = document.querySelector(".input-bar");
const composerMain = document.querySelector(".composer-main");
const voiceOnlyComposer = document.getElementById("voiceOnlyComposer");
const cultureLanguagePicker = document.getElementById("cultureLanguagePicker");
const cultureLanguageSelect = document.getElementById("cultureLanguageSelect");
if (cultureLanguageSelect) {
  cultureLanguageSelect.addEventListener("change", (event) => {
    setCultureReadLanguage(currentChannelId, event.target.value);
  });
}

if (headerChannelLanguageBtn) {
  headerChannelLanguageBtn.addEventListener("click", () =>
    showCultureReadLanguageModal(getCultureReadLanguage(currentChannelId))
  );
}
if (headerClearCultureBtn) {
  headerClearCultureBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    showClearCulturePopup();
  });
}
if (headerClearCultureConfirm) {
  headerClearCultureConfirm.addEventListener("click", (event) => {
    event.stopPropagation();
    handleClearCultureChannel(pendingClearCultureChannelId || currentChannelId);
  });
}
if (headerClearCultureCancel) {
  headerClearCultureCancel.addEventListener("click", (event) => {
    event.stopPropagation();
    hideClearCulturePopup();
  });
}
document.addEventListener("click", (event) => {
  if (!clearCulturePopup || clearCulturePopup.classList.contains("hidden")) return;
  if (
    headerClearCultureBtn?.contains(event.target) ||
    clearCulturePopup.contains(event.target)
  ) {
    return;
  }
  const isPrivacyChannel = isPrivacyRulesChannel(currentChannelId);
  if (isPrivacyChannel) {
    if (privacyHeaderSchoolName) {
      privacyHeaderSchoolName.textContent = getActiveWorkspaceName();
    }
    if (privacyHeaderSubtitle) {
      const privacyChannel = findChannelById(currentChannelId);
      privacyHeaderSubtitle.textContent =
        privacyChannel?.topic || "School privacy and communication guidelines";
    }
  }
  hideClearCulturePopup();
});
document.addEventListener("click", (event) => {
  if (!sesHistoryList || sesHistoryList.contains(event.target)) return;
  if (sesActiveHistoryLogId) {
    clearSesHistorySelection();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideClearCulturePopup();
  }
});
const speakingClubRecordBtn = document.getElementById("speakingClubRecordBtn");
const voiceRecordStatus = document.getElementById("voiceRecordStatus");
const voiceOnlyThreadComposer = document.getElementById("voiceOnlyThreadComposer");
const threadVoiceRecordBtn = document.getElementById("threadVoiceRecordBtn");
const threadComposerBody = document.querySelector("#threadComposer .tcomposer");
const notificationBadge = document.getElementById("notificationBadge");
const messageBadge = document.getElementById("messageBadge");
const railIconsContainer = document.querySelector(".app-rail-icons");
const railScrollUpBtn = document.getElementById("railScrollUpBtn");
const railScrollDownBtn = document.getElementById("railScrollDownBtn");
const superAdminQuickBtn = document.getElementById("superAdminQuickBtn");
const allUnreadsView = document.getElementById("allUnreadsView");
const allUnreadsList = document.getElementById("allUnreadsList");
const closeAllUnreadsBtn = document.getElementById("closeAllUnreadsBtn");
const allUnreadsBtn = document.getElementById("allUnreadsBtn");
const railProfileAvatar = document.getElementById("railProfileAvatar");
const railProfileIcon = document.querySelector(".app-rail-btn-profile i");
const profilePopover = document.getElementById("profilePopover");
const profilePopoverAvatar = document.getElementById("profilePopoverAvatar");
const profilePopoverName = document.getElementById("profilePopoverName");
const profilePopoverPresence = document.getElementById("profilePopoverPresence");
const profilePopoverRole = document.getElementById("profilePopoverRole");
const profilePopoverChangeAvatar = document.getElementById("profilePopoverChangeAvatar");
const profilePopoverOpenProfile = document.getElementById("profilePopoverOpenProfile");
const profilePopoverLogout = document.getElementById("profilePopoverLogout");
const railLogoutBtn = document.getElementById("railLogoutBtn");
const filesList = document.getElementById("filesList");
const filesRefreshBtn = document.getElementById("filesRefreshBtn");
const filesTitle = document.getElementById("filesTitle");
const filesSubtitle = document.getElementById("filesSubtitle");
const filesTypeButtons = document.querySelectorAll(".files-type-btn");
const filesCategoryTabs = document.querySelectorAll("#filesCategoryTabs .files-tab");
const filesHeadLeft = document.querySelector("#filesPanel .files-head-left");
const filesSearchInput = document.getElementById("filesSearchInput");
const filesTypeRow = document.getElementById("filesTypeRow");
const filesRangeRow = document.getElementById("filesRangeRow");
const filesRangeButtons = document.querySelectorAll(".files-range-btn");
const filesExtraFilters = document.getElementById("filesExtraFilters");
const unreadsOverlay = document.getElementById("unreadsOverlay");
const unreadsList = document.getElementById("unreadsList");
const unreadsCloseBtn = document.getElementById("unreadsCloseBtn");
const messagesRailBtn = document.querySelector(".app-rail-btn-messages");
const homeRailBtn = document.querySelector(".app-rail-btn-home");
const aiRailBtn = document.querySelector(".app-rail-btn-ai");
const aiPanel = document.getElementById("aiPanel");
const aiMessages = document.getElementById("aiMessages");
const aiInput = document.getElementById("aiInput");
const aiSendBtn = document.getElementById("aiSendBtn");
const aiStopBtn = document.getElementById("aiStopBtn");
const aiTabs = document.getElementById("aiTabs");
const aiContextPills = document.getElementById("aiContextPills");
const aiActionsContainer = document.getElementById("aiActions");
const aiContextbarToggle = document.getElementById("aiUseContext");
const aiContextBlock = document.getElementById("aiContextBlock");
let aiMode = "assistant";
let aiContext = "calendar";
let aiActiveController = null;
const typingIndicator = document.getElementById("typingIndicator");
const newMsgsBtn = document.getElementById("newMsgsBtn");
const chatPanel = document.querySelector(".chat-panel");
  const chatLayout = document.querySelector(".chat-layout");
const threadPanel = document.getElementById("threadPanel");
const attLightbox = document.getElementById("attLightbox");
const attLightboxBackdrop = document.getElementById("attLightboxBackdrop");
const attLightboxClose = document.getElementById("attLightboxClose");
const attLightboxBody = document.getElementById("attLightboxBody");
const attLightboxOpen = document.getElementById("attLightboxOpen");
const attLightboxDownload = document.getElementById("attLightboxDownload");
const superAdminLanding = document.getElementById("superAdminLanding");
const superAdminLandingClose = document.querySelector(".super-admin-landing-close");

const toggleThreadColumnBtn = document.getElementById("toggleThreadColumnBtn");
const threadCollapseBtn = document.getElementById("threadCollapseBtn");
const THREAD_COLUMN_STORAGE_KEY = "worknestThreadColumnHidden";
let threadColumnHidden = false;
const toggleThreadColumnButtons = [toggleThreadColumnBtn, threadCollapseBtn].filter(Boolean);

const getSavedThreadColumnHidden = () => {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(THREAD_COLUMN_STORAGE_KEY) === "1";
  } catch (_err) {
    return false;
  }
};

const saveThreadColumnPreference = (hidden) => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(THREAD_COLUMN_STORAGE_KEY, hidden ? "1" : "0");
  } catch (_err) {
    /* ignore */
  }
};

const updateThreadColumnToggleUI = () => {
  const hidden = threadColumnHidden;
  toggleThreadColumnButtons.forEach((btn) => {
    btn.setAttribute("aria-pressed", hidden ? "true" : "false");
    btn.setAttribute("aria-label", hidden ? "Show right column" : "Hide right column");
    btn.setAttribute("title", hidden ? "Show right column" : "Hide right column");
    btn.classList.toggle("is-collapsed", hidden);
    const icon = btn.querySelector("i");
    if (icon) {
      icon.classList.toggle("fa-chevron-left", !hidden);
      icon.classList.toggle("fa-chevron-right", hidden);
    }
  });
};

const applyThreadColumnHiddenState = () => {
  if (chatLayout) {
    chatLayout.classList.toggle("thread-column-hidden", threadColumnHidden);
  }
  if (threadPanel) {
    threadPanel.setAttribute("aria-hidden", threadColumnHidden ? "true" : "false");
  }
  updateThreadColumnToggleUI();
};

threadColumnHidden = getSavedThreadColumnHidden();
applyThreadColumnHiddenState();
toggleThreadColumnButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    threadColumnHidden = !threadColumnHidden;
    applyThreadColumnHiddenState();
    saveThreadColumnPreference(threadColumnHidden);
  });
});
const closeThreadBtn = document.getElementById("closeThreadBtn");
const threadParentContainer = document.getElementById("threadParentContainer");
const threadRepliesContainer = document.getElementById("threadRepliesContainer");
const threadReplyCount = document.getElementById("threadReplyCount");
const threadParentChannel = document.getElementById("threadParentChannel");
const threadInput = document.getElementById("threadInput");
  const threadSendButton = document.getElementById("threadSendButtonMain");
  const threadPendingAttachments = document.getElementById("threadPendingAttachments");
  const adminDock = document.getElementById("adminDock");

// DM members modal
const dmMembersModal = document.getElementById("dmMembersModal");
const dmMembersTitle = document.getElementById("dmMembersTitle");
const dmMembersList = document.getElementById("dmMembersList");
const dmMembersClose = document.getElementById("dmMembersClose");
const dmMembersSave = document.getElementById("dmMembersSave");
const dmMembersSearch = document.getElementById("dmMembersSearch");
const dmCreateModal = document.getElementById("dmCreateModal");
const dmCreateClose = document.getElementById("dmCreateClose");
const dmCreateSearch = document.getElementById("dmCreateSearch");
const dmCreateList = document.getElementById("dmCreateList");
const dmCreateSave = document.getElementById("dmCreateSave");

// User profile modal
const userProfileModal = document.getElementById("userProfileModal");
const userProfileInnerCard = userProfileModal
  ? userProfileModal.querySelector(".user-profile-inner-card")
  : null;
const adminPanelContent = document.getElementById("adminPanelContent");
const userProfileAvatar = document.getElementById("userProfileAvatar");
const userProfileName = document.getElementById("userProfileName");
const userProfileUsername = document.getElementById("userProfileUsername");
const userProfileRole = document.getElementById("userProfileRole");
const userProfileAccountName = document.getElementById("userProfileAccountName");
const userProfileAccountEmail = document.getElementById("userProfileAccountEmail");
const userProfileSignatureEmail = document.getElementById("userProfileSignatureEmail");
const userProfileAccountRole = document.getElementById("userProfileAccountRole");
const userProfileAccountJoined = document.getElementById("userProfileAccountJoined");
const userProfileHeaderTime = document.getElementById("userProfileHeaderTime");
const userProfileSchoolName = document.getElementById("userProfileSchoolName");
const schoolProfileUsePlatformEmail = document.getElementById("schoolProfileUsePlatformEmail");
const schoolProfileEmailHelp = document.getElementById("schoolProfileEmailHelp");
const userProfileClose = document.getElementById("userProfileClose");
const userProfileSchoolSection = document.getElementById("userProfileSchoolSection");
const schoolProfileForm = document.getElementById("schoolProfileForm");
const schoolProfileWorkspaceName = document.getElementById("schoolProfileWorkspaceName");
const schoolProfileStreet = document.getElementById("schoolProfileStreet");
const schoolProfileHouseNumber = document.getElementById("schoolProfileHouseNumber");
const schoolProfilePostalCode = document.getElementById("schoolProfilePostalCode");
const schoolProfileCity = document.getElementById("schoolProfileCity");
const schoolProfileState = document.getElementById("schoolProfileState");
const schoolProfileCountry = document.getElementById("schoolProfileCountry");
const schoolProfilePhone = document.getElementById("schoolProfilePhone");
const schoolProfileOpeningHours = document.getElementById("schoolProfileOpeningHours");
const schoolProfileOpeningHoursEditor = document.getElementById("schoolProfileOpeningHoursEditor");
const schoolProfileWebsite = document.getElementById("schoolProfileWebsite");
const schoolProfileStatus = document.getElementById("schoolProfileFormStatus");
const schoolProfileSaveBtn = document.getElementById("schoolProfileSaveBtn");
const userProfileLogoutBtn = document.getElementById("userProfileLogoutBtn");

const navItems = document.querySelectorAll(".rail-btn");
const channelList = document.getElementById("channelList");
const dmList = document.getElementById("dmList");
const starredList = document.getElementById("starredList");

const commandBar = document.getElementById("commandBar");
const headerSearchResults = document.getElementById("headerSearchResults");
const commandOverlay = document.getElementById("commandOverlay");
const commandOverlayInput = document.getElementById("commandOverlayInput");
const commandInput = document.getElementById("commandInput");
const commandActionsList = document.getElementById("commandActionsList");
const commandChannelsList = document.getElementById("commandChannelsList");

// admin overlay
const adminOverlay = document.getElementById("adminOverlay");
const adminModal = document.getElementById("adminModal");
const adminCloseBtn = document.getElementById("adminCloseBtn");
const adminFullscreenBtn = document.getElementById("adminFullscreenBtn");
const adminLoginView = document.getElementById("adminLoginView");
const adminAppView = document.getElementById("adminAppView");
const adminEmailInput = document.getElementById("adminEmailInput");
const adminPasswordInput = document.getElementById("adminPasswordInput");
const adminLoginBtn = document.getElementById("adminLoginBtn");
const adminLoginError = document.getElementById("adminLoginError");
const adminWsName = document.getElementById("adminWsName");
const adminWsCreateBtn = document.getElementById("adminWsCreateBtn");
const adminUserFirst = document.getElementById("adminUserFirst");
const adminUserLast = document.getElementById("adminUserLast");
const adminUserEmail = document.getElementById("adminUserEmail");
const adminUserPassword = document.getElementById("adminUserPassword");
const adminUserAvatar = document.getElementById("adminUserAvatar");
const adminUserWorkspace = document.getElementById("adminUserWorkspace");
const adminUserCreateBtn = document.getElementById("adminUserCreateBtn");
const adminUserChannelSearch = document.getElementById("adminUserChannelSearch");
const adminUserChannelSearchBtn = document.getElementById("adminUserChannelSearchBtn");
const adminUserChannelList = document.getElementById("adminUserChannelList");
const adminUserSelectedChannels = document.getElementById("adminUserSelectedChannels");
const adminWorkspaceList = document.getElementById("adminWorkspaceList");
const adminFilterWorkspace = document.getElementById("adminFilterWorkspace");
const adminUserList = document.getElementById("adminUserList");
const adminChannelName = document.getElementById("adminChannelName");
const adminChannelTopic = document.getElementById("adminChannelTopic");
const adminChannelWorkspace = document.getElementById("adminChannelWorkspace");
const adminChannelUserSearch = document.getElementById("adminChannelUserSearch");
const adminChannelUserList = document.getElementById("adminChannelUserList");
const adminChannelCreateBtn = document.getElementById("adminChannelCreateBtn");
const adminChannelList = document.getElementById("adminChannelList");
const adminWorkspaceSearch = document.getElementById("adminWorkspaceSearch");
const adminWorkspaceSort = document.getElementById("adminWorkspaceSort");
const adminUserSearch = document.getElementById("adminUserSearch");
const adminUserSort = document.getElementById("adminUserSort");
const adminChannelSearch = document.getElementById("adminChannelSearch");
const adminChannelFilterWorkspace = document.getElementById("adminChannelFilterWorkspace");
const adminChannelSort = document.getElementById("adminChannelSort");
const adminSecurityKpis = document.getElementById("adminSecurityKpis");
const adminSecurityEvents = document.getElementById("adminSecurityEvents");
const adminSecuritySearch = document.getElementById("adminSecuritySearch");
const adminSecurityType = document.getElementById("adminSecurityType");
const adminSecurityRefresh = document.getElementById("adminSecurityRefresh");
const adminSecTopAttacks = document.getElementById("adminSecTopAttacks");
const adminSecFailedIp = document.getElementById("adminSecFailedIp");
const adminSecBlocklist = document.getElementById("adminSecBlocklist");
const adminSecSessions = document.getElementById("adminSecSessions");
const secHoursTop = document.getElementById("secHoursTop");
const secHoursIp = document.getElementById("secHoursIp");
const secBlockIpInput = document.getElementById("secBlockIpInput");
const secBlockReasonInput = document.getElementById("secBlockReasonInput");
const secBlockIpBtn = document.getElementById("secBlockIpBtn");
const secExportTop = document.getElementById("secExportTop");
const secExportIp = document.getElementById("secExportIp");
const secExportSessions = document.getElementById("secExportSessions");
const secSessionSearch = document.getElementById("secSessionSearch");
const secSessionsRefresh = document.getElementById("secSessionsRefresh");
let _lastTopAttacks = [];
let _lastFailedIp = [];
let _lastBlocklist = [];
let _lastSessions = [];
let adminSecTopRows = [];
let adminSecFailedIpRows = [];
let adminSecBlockedRows = [];
let adminSecSessionRows = [];
const adminOpenWorkspaceModal = document.getElementById("adminOpenWorkspaceModal");
const adminOpenUserModal = document.getElementById("adminOpenUserModal");
const adminOpenChannelModal = document.getElementById("adminOpenChannelModal");
const adminWorkspaceModal = document.getElementById("adminWorkspaceModal");
const adminUserModal = document.getElementById("adminUserModal");
const adminChannelModal = document.getElementById("adminChannelModal");
const adminWorkspaceModalClose = document.getElementById("adminWorkspaceModalClose");
const adminUserModalClose = document.getElementById("adminUserModalClose");
const adminChannelModalClose = document.getElementById("adminChannelModalClose");
const adminThemeToggle = document.getElementById("adminThemeToggle");
const adminNavButtons = document.querySelectorAll(".admin-nav-btn");
const adminPanels = document.querySelectorAll(".admin-section[data-admin-panel]");
const adminStatWorkspaces = document.getElementById("adminStatWorkspaces");
const adminStatUsers = document.getElementById("adminStatUsers");
const adminStatChannels = document.getElementById("adminStatChannels");
const adminSchoolRequestsList = document.getElementById("adminSchoolRequestsList");
const adminRefreshSchoolRequests = document.getElementById("adminRefreshSchoolRequests");
const adminToolsSection = document.getElementById("adminToolsSection");
const openStudentsList = document.getElementById("openStudentsList");
const openTeachersList = document.getElementById("openTeachersList");
const openPrivacyRules = document.getElementById("openPrivacyRules");
const openStudentRegistration = document.getElementById("openStudentRegistration");
const openTeacherRegistration = document.getElementById("openTeacherRegistration");
const settingsOpenBtn = document.getElementById("settingsOpenBtn");
const footerUserName = document.getElementById("footerUserName");
const footerUserInitials = document.getElementById("footerUserInitials");
const footerUserStatus = document.getElementById("footerUserStatus");
const avatarModal = document.getElementById("avatarModal");
const avatarModalClose = document.getElementById("avatarModalClose");
const avatarModalBackdrop = document.getElementById("avatarModalBackdrop");
const avatarUploadInput = document.getElementById("avatarUploadInput");
const avatarSaveBtn = document.getElementById("avatarSaveBtn");
const avatarCancelBtn = document.getElementById("avatarCancelBtn");
const avatarZoom = document.getElementById("avatarZoom");
const openAvatarPickerBtn = document.getElementById("openAvatarPickerBtn");
const avatarPickerOverlay = document.getElementById("avatarPickerOverlay");
const avatarPickerOverlayBackdrop = document.getElementById("avatarPickerOverlayBackdrop");
const avatarPickerCloseBtn = document.getElementById("avatarPickerCloseBtn");
const avatarPickerCancelBtn = document.getElementById("avatarPickerCancelBtn");
const avatarPickerGroups = document.getElementById("avatarPickerGroups");
const avatarPreview = document.getElementById("avatarPreview");
const avatarCurrentThumb = document.getElementById("avatarCurrentThumb");
const avatarUserName = document.getElementById("avatarUserName");
const avatarUserEmail = document.getElementById("avatarUserEmail");
const dicebearAvatarGroups = [
  {
    title: "Student-friendly",
    description: "Fun, friendly, modern",
    items: [
      { label: "Adventurer", url: "https://api.dicebear.com/7.x/adventurer/svg?seed=alex" },
      { label: "Adventurer Neutral", url: "https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=alex" },
      { label: "Fun Emoji", url: "https://api.dicebear.com/7.x/fun-emoji/svg?seed=alex" },
      { label: "Croodles", url: "https://api.dicebear.com/7.x/croodles/svg?seed=alex" },
      { label: "Croodles Neutral", url: "https://api.dicebear.com/7.x/croodles-neutral/svg?seed=alex" },
    ],
  },
  {
    title: "Teacher-friendly",
    description: "Professional + human silhouettes",
    items: [
      { label: "Personas", url: "https://api.dicebear.com/7.x/personas/svg?seed=teacher" },
      { label: "Notionists", url: "https://api.dicebear.com/7.x/notionists/svg?seed=teacher" },
      { label: "Notionists Neutral", url: "https://api.dicebear.com/7.x/notionists-neutral/svg?seed=teacher" },
      { label: "Big Smile", url: "https://api.dicebear.com/7.x/big-smile/svg?seed=teacher" },
    ],
  },
  {
    title: "Admin / Formal",
    description: "Clean, minimal, identity-safe",
    items: [
      { label: "Initials", url: "https://api.dicebear.com/7.x/initials/svg?seed=John%20Smith" },
      { label: "Identicon", url: "https://api.dicebear.com/7.x/identicon/svg?seed=admin" },
      { label: "Shapes", url: "https://api.dicebear.com/7.x/shapes/svg?seed=admin" },
    ],
  },
  {
    title: "Kids / Young",
    description: "Playful robot + pixel art",
    items: [
      { label: "Bottts", url: "https://api.dicebear.com/7.x/bottts/svg?seed=kid" },
      { label: "Bottts Neutral", url: "https://api.dicebear.com/7.x/bottts-neutral/svg?seed=kid" },
      { label: "Pixel Art", url: "https://api.dicebear.com/7.x/pixel-art/svg?seed=kid" },
      { label: "Pixel Art Neutral", url: "https://api.dicebear.com/7.x/pixel-art-neutral/svg?seed=kid" },
    ],
  },
  {
    title: "Creative extras",
    description: "Fun, abstract, minimal",
    items: [
      { label: "Lorelei", url: "https://api.dicebear.com/7.x/lorelei/svg?seed=user" },
      { label: "Lorelei Neutral", url: "https://api.dicebear.com/7.x/lorelei-neutral/svg?seed=user" },
      { label: "Micah", url: "https://api.dicebear.com/7.x/micah/svg?seed=user" },
      { label: "Thumbs", url: "https://api.dicebear.com/7.x/thumbs/svg?seed=user" },
    ],
  },
];
const adminAssignUserSearch = document.getElementById("adminAssignUserSearch");
const adminAssignUserSearchBtn = document.getElementById("adminAssignUserSearchBtn");
const adminAssignUserList = document.getElementById("adminAssignUserList");
const adminAssignWorkspaceSearch = document.getElementById("adminAssignWorkspaceSearch");
const adminAssignWorkspaceSearchBtn = document.getElementById("adminAssignWorkspaceSearchBtn");
const adminAssignWorkspaceList = document.getElementById("adminAssignWorkspaceList");
const adminAssignChannelSearch = document.getElementById("adminAssignChannelSearch");
const adminAssignChannelSearchBtn = document.getElementById("adminAssignChannelSearchBtn");
const adminAssignChannelList = document.getElementById("adminAssignChannelList");
const adminAssignBtn = document.getElementById("adminAssignBtn");
const confirmOverlay = document.getElementById("confirmOverlay");
const confirmCard = confirmOverlay?.querySelector(".confirm-card") || null;
const confirmTitle = document.getElementById("confirmTitle");
const confirmMessage = document.getElementById("confirmMessage");
const confirmCancelBtn = document.getElementById("confirmCancelBtn");
const confirmOkBtn = document.getElementById("confirmOkBtn");
const loginOverlay = document.getElementById("loginOverlay");
const loginTabs = document.querySelectorAll(".login-tab");
const loginPanels = document.querySelectorAll(".login-panel");
const mainLoginEmail = document.getElementById("mainLoginEmail");
const mainLoginPassword = document.getElementById("mainLoginPassword");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const forgotPasswordPanel = document.getElementById("forgotPasswordPanel");
const sendResetBtn = document.getElementById("sendResetBtn");
const cancelForgotBtn = document.getElementById("cancelForgotBtn");
const forgotEmail = document.getElementById("forgotEmail");
const forgotStatus = document.getElementById("forgotStatus");
const schoolNameInput = document.getElementById("schoolNameInput");
const schoolAdminEmailInput = document.getElementById("schoolAdminEmailInput");
const schoolAdminPasswordInput = document.getElementById("schoolAdminPasswordInput");
const schoolRequestBtn = document.getElementById("schoolRequestBtn");
const schoolRequestError = document.getElementById("schoolRequestError");
const schoolRequestSuccess = document.getElementById("schoolRequestSuccess");
const studentRegisterModal = document.getElementById("studentRegisterModal");
const studentRegisterClose = document.getElementById("studentRegisterClose");
const studentRegisterSubmit = document.getElementById("studentRegisterSubmit");
const studentSendLinkBtn = document.getElementById("studentSendLinkBtn");
const studentFirstName = document.getElementById("studentFirstName");
const studentLastName = document.getElementById("studentLastName");
const studentEmail = document.getElementById("studentEmail");
const studentPassword = document.getElementById("studentPassword");
const studentPasswordConfirm = document.getElementById("studentPasswordConfirm");
const studentCourseStart = document.getElementById("studentCourseStart");
const studentCourseEnd = document.getElementById("studentCourseEnd");
const studentCourseLevel = document.getElementById("studentCourseLevel");
const studentGender = document.getElementById("studentGender");
const studentDob = document.getElementById("studentDob");
const studentPhoneCountry = document.getElementById("studentPhoneCountry");
const studentPhoneNumber = document.getElementById("studentPhoneNumber");
const studentPhoneError = document.getElementById("studentPhoneError");
const studentNativeLanguage = document.getElementById("studentNativeLanguage");
const studentLearningGoal = document.getElementById("studentLearningGoal");
const studentEmergencyName = document.getElementById("studentEmergencyName");
const studentEmergencyPhone = document.getElementById("studentEmergencyPhone");
const studentEmergencyRelation = document.getElementById("studentEmergencyRelation");
const studentRegisterError = document.getElementById("studentRegisterError");
const studentEmailError = document.getElementById("studentEmailError");
const studentNameDobError = document.getElementById("studentNameDobError");
const studentAvailableDayInputs = document.querySelectorAll(
  "#studentRegisterModal .available-days-row input[type='checkbox']"
);
const teacherRegisterModal = document.getElementById("teacherRegisterModal");
const teacherRegisterClose = document.getElementById("teacherRegisterClose");
const teacherRegisterSubmit = document.getElementById("teacherRegisterSubmit");
const teacherSendLinkBtn = document.getElementById("teacherSendLinkBtn");
const teacherFirstName = document.getElementById("teacherFirstName");
const teacherLastName = document.getElementById("teacherLastName");
const teacherEmail = document.getElementById("teacherEmail");
const teacherPassword = document.getElementById("teacherPassword");
const teacherPasswordConfirm = document.getElementById("teacherPasswordConfirm");
const teacherCourseStart = document.getElementById("teacherCourseStart");
const teacherCourseEnd = document.getElementById("teacherCourseEnd");
const teacherCourseLevel = document.getElementById("teacherCourseLevel");
const teacherGender = document.getElementById("teacherGender");
const teacherDob = document.getElementById("teacherDob");
const teacherPhoneCountry = document.getElementById("teacherPhoneCountry");
const teacherPhoneNumber = document.getElementById("teacherPhoneNumber");
const teacherPhoneError = document.getElementById("teacherPhoneError");
const teacherLanguages = document.getElementById("teacherLanguages");
const teacherEmployment = document.getElementById("teacherEmployment");
const teacherLearningGoal = document.getElementById("teacherLearningGoal");
const teacherEmergencyName = document.getElementById("teacherEmergencyName");
const teacherEmergencyPhone = document.getElementById("teacherEmergencyPhone");
const teacherEmergencyRelation = document.getElementById("teacherEmergencyRelation");
const teacherAvailableDayInputs = document.querySelectorAll(
  "#teacherRegisterModal .available-days-row input[type='checkbox']"
);
const teacherRegisterError = document.getElementById("teacherRegisterError");
const teacherEmailError = document.getElementById("teacherEmailError");
const teacherNameDobError = document.getElementById("teacherNameDobError");
const registrationClassSelects = [teacherCourseLevel, studentCourseLevel];
const registrationSelectFields = new Map([
  [studentCourseLevel, { start: studentCourseStart, end: studentCourseEnd }],
  [teacherCourseLevel, { start: teacherCourseStart, end: teacherCourseEnd }]
]);
const studentEditModal = document.getElementById("studentEditModal");
const studentEditClose = document.getElementById("studentEditClose");
const studentEditSave = document.getElementById("studentEditSave");
const studentEditDelete = document.getElementById("studentEditDelete");
const studentEditFirstName = document.getElementById("studentEditFirstName");
const studentEditLastName = document.getElementById("studentEditLastName");
const studentEditEmail = document.getElementById("studentEditEmail");
const studentEditCourseStart = document.getElementById("studentEditCourseStart");
const studentEditCourseEnd = document.getElementById("studentEditCourseEnd");
const studentEditCourseLevel = document.getElementById("studentEditCourseLevel");
const studentEditError = document.getElementById("studentEditError");
const classAssignModal = document.getElementById("classAssignModal");
const classAssignCard = document.querySelector("#classAssignModal .class-assign-card");
const classAssignClose = document.getElementById("classAssignClose");
const classAssignSave = document.getElementById("classAssignSave");
const classAssignSelect = document.getElementById("classAssignSelect");
const classAssignTitle = document.getElementById("classAssignTitle");
const classAssignError = document.getElementById("classAssignError");
const mainLoginBtn = document.getElementById("mainLoginBtn");
const mainLoginError = document.getElementById("mainLoginError");
// settings / admin
const settingsOverlay = document.getElementById("settingsOverlay");
const settingsCloseBtn = document.getElementById("settingsCloseBtn");
const settingsLogoutBtn = document.getElementById("settingsLogoutBtn");
const addEmployeeForm = document.getElementById("addEmployeeForm");
const employeeFirstNameInput = document.getElementById("employeeFirstName");
const employeeLastNameInput = document.getElementById("employeeLastName");
const employeeEmailInput = document.getElementById("employeeEmail");
const employeePasswordInput = document.getElementById("employeePassword");
const employeeAvatarInput = document.getElementById("employeeAvatarUrl");
const employeesList = document.getElementById("employeesList");
const typingAvatar = typingIndicator ? typingIndicator.querySelector(".typing-avatar span") : null;
const typingText = typingIndicator ? typingIndicator.querySelector(".typing-text") : null;

// ===================== STATE =====================

let releaseThreadTrap = null;
let releaseAdminTrap = null;
let lastThreadTrigger = null;

let avatarCropImage = null;
let avatarCropScale = 1.2;
const DEFAULT_AVATAR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAxMDAgMTAwJz48cmVjdCBmaWxsPScjMGVhNWU5JyB3aWR0aD0nMTAwJyBoZWlnaHQ9JzEwMCcvPjx0ZXh0IHg9JzUwJyB5PSc2MicgZm9udC1zaXplPSc0OCcgZmlsbD0nI2ZmZmZmZicgdGV4dC1hbmNob3I9J21pZGRsZScgZm9udC1mYW1pbHk9J0FyaWFsJyBmb250LXdlaWdodD0nNzAwJz5VPC90ZXh0Pjwvc3ZnPg==";
const AVATAR_BY_ROLE = {
  student: "adventurer",
  teacher: "personas",
  admin: "initials",
  school_admin: "initials",
};

function getDicebearAvatarUrl(user = {}) {
  const role = String(user?.role || "").toLowerCase();
  const style = AVATAR_BY_ROLE[role] || "initials";
  const name = user?.name || user?.displayName || user?.email || "user";
  const seed = encodeURIComponent(name);
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`;
}
const typingUsers = new Map(); // userId -> { name, initials, timeout }
let typingStopTimer = null;
let classMembershipsByUser = new Map();
let classMembershipsWorkspaceId = null;
let currentUserClassIds = new Set();
let currentUserClassesLoaded = false;
let currentStudentEditUserId = null;
let currentStudentEditUser = null;

function getEditRoleLabel() {
  const role = String(currentStudentEditUser?.role || "").toLowerCase();
  return role === "teacher" ? "Teacher" : "Student";
}
let currentClassAssignUserId = null;
let currentClassAssignUser = null;
function setComposerPlaceholder(text) {
  const placeholder = text || "Write a message…";
  if (messageInput) messageInput.placeholder = placeholder;
  if (rteEditor) rteEditor.setAttribute("data-placeholder", placeholder);
}

function isSuperAdmin() {
  const role = normalizeRole(sessionUser?.role);
  return !!(
    (sessionUser && (role === "super_admin" || sessionUser.superAdmin)) ||
    adminLoggedInSuper
  );
}

function isSchoolAdmin() {
  return !!(sessionUser && normalizeRole(sessionUser.role) === "school_admin");
}

function isAdminUser() {
  return isSuperAdmin() || isSchoolAdmin() || adminLoggedIn;
}

function getRoleLabel(role) {
  const value = String(role || "").toLowerCase();
  if (value === "student") return { text: "Student", className: "role-student" };
  if (value === "teacher") return { text: "Teacher", className: "role-teacher" };
  if (value === "admin" || value === "super_admin" || value === "school_admin") {
    return { text: "Admin", className: "role-admin" };
  }
  return null;
}

function getUserRoleBucket(user) {
  const value = String(user?.role || "").toLowerCase();
  if (value === "student") return "student";
  if (value === "teacher") return "teacher";
  if (value === "admin" || value === "super_admin" || value === "school_admin") return "admin";
  return "";
}

function getUserIdValue(user) {
  return String(user?.id || user?.userId || user?.email || user?.username || "");
}

function getRoleText(role, fallback = "Member") {
  const info = getRoleLabel(role);
  return info ? info.text : fallback;
}

function applyRoleLabel(el, role) {
  if (!el) return;
  const info = getRoleLabel(role);
  el.classList.remove("role-student", "role-teacher", "role-admin");
  if (!info) {
    el.textContent = "";
    el.style.display = "none";
    return;
  }
  el.textContent = info.text;
  el.classList.add(info.className);
  el.style.display = "";
}

function setStatusInText(el, role, fallbackText = "") {
  if (!el) return;
  const info = getRoleLabel(role);
  el.classList.remove("role-student", "role-teacher", "role-admin");
  if (info) {
    el.textContent = info.text;
    el.classList.add(info.className);
  } else {
    el.textContent = fallbackText;
  }
}

function parseCourseDate(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCourseDate(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = parseCourseDate(trimmed);
  if (!parsed) return trimmed;
  return parsed.toISOString().slice(0, 10);
}

function formatCourseRange(startValue, endValue) {
  const startLabel = formatCourseDate(startValue);
  const endLabel = formatCourseDate(endValue);
  if (startLabel === "—" && endLabel === "—") return "Not set";
  return `${startLabel} to ${endLabel}`;
}

function isEnrollmentActive(startValue, endValue) {
  const now = Date.now();
  const start = parseCourseDate(startValue);
  const end = parseCourseDate(endValue);
  if (start && now < start.getTime()) return false;
  if (end && now > end.getTime()) return false;
  return true;
}

async function loadClassMemberships(workspaceId) {
  if (!workspaceId) return new Map();
  if (classMembershipsWorkspaceId === workspaceId && classMembershipsByUser.size) {
    return classMembershipsByUser;
  }
  const headers = { "x-admin": "1" };
  const rows = await fetchJSON(
    `/api/class-memberships?workspaceId=${encodeURIComponent(workspaceId)}`,
    { headers }
  );
  const map = new Map();
  (rows || []).forEach((row) => {
    if (!row || !row.userId) return;
    const key = String(row.userId);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      channelId: row.channelId,
      channelName: row.channelName
    });
  });
  map.forEach((arr) => arr.sort((a, b) => String(a.channelName || "").localeCompare(String(b.channelName || ""))));
  classMembershipsByUser = map;
  classMembershipsWorkspaceId = workspaceId;
  return map;
}

function getClassesForUser(userId) {
  if (!userId) return [];
  return classMembershipsByUser.get(String(userId)) || [];
}

async function loadCurrentUserClasses(workspaceId) {
  currentUserClassesLoaded = false;
  currentUserClassIds = new Set();
  if (!workspaceId) {
    currentUserClassesLoaded = true;
    return;
  }
  if (!isStudentUser() && !isTeacherUser()) {
    currentUserClassesLoaded = true;
    return;
  }
  const userId = getCurrentUserId();
  if (!userId) {
    currentUserClassesLoaded = true;
    return;
  }
  try {
    const wsParam = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
    const rows = await fetchJSON(`/api/user-class-memberships${wsParam}`, {
      headers: { "x-user-id": userId }
    });
    const list = Array.isArray(rows) ? rows : [];
    currentUserClassIds = new Set(list.map((row) => String(row.channelId)));
  } catch (err) {
    console.warn("Could not load current user classes", err);
  } finally {
    currentUserClassesLoaded = true;
  }
}

function openStudentEditModal(user) {
  if (!studentEditModal || !user) return;
  currentStudentEditUserId = user.id || user.userId || null;
  currentStudentEditUser = user;
  const roleLabel = getEditRoleLabel();
  const header = studentEditModal.querySelector("h3");
  if (header) header.textContent = `Edit ${roleLabel}`;
  if (studentEditDelete) studentEditDelete.textContent = `Delete ${roleLabel.toLowerCase()}`;
  if (studentEditError) studentEditError.style.display = "none";
  if (studentEditFirstName) studentEditFirstName.value = user.firstName || user.first_name || "";
  if (studentEditLastName) studentEditLastName.value = user.lastName || user.last_name || "";
  if (studentEditEmail) studentEditEmail.value = user.email || "";
  if (studentEditCourseStart) {
    const startVal = formatCourseDate(user.courseStart || user.course_start || "");
    studentEditCourseStart.value = startVal === "—" ? "" : startVal;
  }
  if (studentEditCourseEnd) {
    const endVal = formatCourseDate(user.courseEnd || user.course_end || "");
    studentEditCourseEnd.value = endVal === "—" ? "" : endVal;
  }
  if (studentEditCourseLevel) studentEditCourseLevel.value = user.courseLevel || user.course_level || "";
  studentEditModal.classList.remove("hidden");
  studentEditModal.style.display = "flex";
}

function closeStudentEditModal() {
  if (!studentEditModal) return;
  studentEditModal.classList.add("hidden");
  studentEditModal.style.display = "none";
  currentStudentEditUserId = null;
  currentStudentEditUser = null;
}

async function saveStudentEdits() {
  if (!currentStudentEditUserId) return;
  const roleLabel = getEditRoleLabel();
  const roleKey = roleLabel.toLowerCase();
  const payload = {
    firstName: (studentEditFirstName?.value || "").trim(),
    lastName: (studentEditLastName?.value || "").trim(),
    email: (studentEditEmail?.value || "").trim(),
    courseStart: (studentEditCourseStart?.value || "").trim() || null,
    courseEnd: (studentEditCourseEnd?.value || "").trim() || null,
    courseLevel: (studentEditCourseLevel?.value || "").trim() || null
  };
  if (!payload.firstName || !payload.lastName || !payload.email) {
    if (studentEditError) {
      studentEditError.textContent = "First name, last name, and email are required.";
      studentEditError.style.display = "block";
    }
    return;
  }
  if (payload.courseStart && payload.courseEnd) {
    const start = new Date(payload.courseStart);
    const end = new Date(payload.courseEnd);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start > end) {
      if (studentEditError) {
        studentEditError.textContent = "Course end must be after the start date.";
        studentEditError.style.display = "block";
      }
      return;
    }
  }
  if (studentEditError) studentEditError.style.display = "none";
  try {
    await fetchJSON(`/api/users/${encodeURIComponent(currentStudentEditUserId)}`, {
      method: "PATCH",
      headers: { "x-admin": "1" },
      body: JSON.stringify(payload)
    });
    closeStudentEditModal();
    classMembershipsWorkspaceId = null;
    await showDirectoryList(roleKey);
    showToast(`${roleLabel} updated`);
  } catch (err) {
    console.error("Failed to update student", err);
    if (studentEditError) {
      studentEditError.textContent = `Could not update ${roleKey}`;
      studentEditError.style.display = "block";
    }
  }
}

async function deleteStudentProfile() {
  if (!currentStudentEditUserId) return;
  const roleLabel = getEditRoleLabel();
  const roleKey = roleLabel.toLowerCase();
  const ok = await openConfirmModal({
    title: `Delete ${roleKey}?`,
    message: `Delete this ${roleKey} profile? Messages stay, but the account is removed.`,
    confirmText: "Delete",
    cancelText: "Cancel",
    danger: true,
    originEl: studentEditModal
  });
  if (!ok) return;
  try {
    await fetchJSON(`/api/users/${encodeURIComponent(currentStudentEditUserId)}`, {
      method: "DELETE",
      headers: { "x-admin": "1" }
    });
    closeStudentEditModal();
    classMembershipsWorkspaceId = null;
    await showDirectoryList(roleKey);
    showToast(`${roleLabel} deleted`);
  } catch (err) {
    console.error("Failed to delete student", err);
    if (studentEditModal) {
      studentEditModal.classList.remove("hidden");
      studentEditModal.style.display = "flex";
      studentEditModal.removeAttribute("aria-hidden");
    }
    showToast(`Could not delete ${roleKey}`);
  }
}

function positionClassAssignCard(anchor) {
  if (!classAssignCard || !anchor) return;
  const rect = anchor.getBoundingClientRect();

  classAssignCard.style.visibility = "hidden";
  classAssignCard.style.left = "0px";
  classAssignCard.style.top = "0px";
  const cardRect = classAssignCard.getBoundingClientRect();

  const margin = 12;
  let left = rect.right - cardRect.width;
  let top = rect.bottom + 8;
  if (left < margin) left = margin;
  if (left + cardRect.width > window.innerWidth - margin) {
    left = window.innerWidth - cardRect.width - margin;
  }
  if (top + cardRect.height > window.innerHeight - margin) {
    top = rect.top - cardRect.height - 8;
  }
  if (top < margin) top = margin;

  const originX = rect.right > window.innerWidth / 2 ? "right" : "left";
  const originY = top >= rect.bottom ? "top" : "bottom";

  classAssignCard.style.left = `${left}px`;
  classAssignCard.style.top = `${top}px`;
  classAssignCard.style.setProperty("--ca-origin", `${originX} ${originY}`);
  classAssignCard.style.visibility = "visible";
}

function openClassAssignModal(user, anchor) {
  if (!classAssignModal || !classAssignSelect || !user) return;
  currentClassAssignUserId = user.id || user.userId || null;
  currentClassAssignUser = user;
  if (classAssignError) classAssignError.style.display = "none";
  const fallbackLabel = getRoleText(user.role, "User");
  const name =
    user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || fallbackLabel;
  if (classAssignTitle) classAssignTitle.textContent = `Add ${name} to class`;

  const classChannels = (channels || []).filter((c) => {
    const wsMatch = (c.workspaceId || "default") === currentWorkspaceId;
    const cat = String(c.category || "").toLowerCase();
    return wsMatch && cat === "classes";
  });
  const assigned = new Set(getClassesForUser(currentClassAssignUserId).map((c) => c.channelId));
  classAssignSelect.innerHTML = "";
  if (!classChannels.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No classes available";
    classAssignSelect.appendChild(opt);
    if (classAssignSave) classAssignSave.disabled = true;
  } else {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a class";
    classAssignSelect.appendChild(placeholder);
    if (classAssignSave) classAssignSave.disabled = false;
    classChannels.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name || c.id;
      if (assigned.has(c.id)) {
        opt.disabled = true;
        opt.textContent = `${opt.textContent} (added)`;
      }
      classAssignSelect.appendChild(opt);
    });
  }

  classAssignModal.classList.remove("hidden");
  classAssignModal.classList.remove("is-closing");
  classAssignModal.classList.remove("is-open");
  classAssignModal.style.display = "flex";
  positionClassAssignCard(anchor || classAssignModal);
  requestAnimationFrame(() => {
    classAssignModal.classList.add("is-open");
  });
}

function closeClassAssignModal() {
  if (!classAssignModal) return;
  classAssignModal.classList.remove("is-open");
  classAssignModal.classList.add("is-closing");
  setTimeout(() => {
    classAssignModal.classList.add("hidden");
    classAssignModal.style.display = "none";
    classAssignModal.classList.remove("is-closing");
  }, 180);
  currentClassAssignUserId = null;
  currentClassAssignUser = null;
}

async function saveClassAssignment() {
  if (!currentClassAssignUserId || !classAssignSelect) return;
  const channelId = classAssignSelect.value;
  if (!channelId) {
    if (classAssignError) {
      classAssignError.textContent = "Select a class first.";
      classAssignError.style.display = "block";
    }
    return;
  }
  const workspaceId = currentWorkspaceId || "default";
  if (classAssignError) classAssignError.style.display = "none";
  try {
    const res = await fetchJSON("/api/class-memberships", {
      method: "POST",
      headers: { "x-admin": "1" },
      body: JSON.stringify({
        userId: currentClassAssignUserId,
        channelId,
        workspaceId
      })
    });
    const key = String(currentClassAssignUserId);
    if (!classMembershipsByUser.has(key)) classMembershipsByUser.set(key, []);
    const list = classMembershipsByUser.get(key);
    if (!list.some((c) => c.channelId === res.channelId)) {
      list.push({ channelId: res.channelId, channelName: res.channelName });
      list.sort((a, b) => String(a.channelName || "").localeCompare(String(b.channelName || "")));
    }
    const roleLabel = getRoleText(currentClassAssignUser?.role, "User");
    closeClassAssignModal();
    const roleKey = String(directoryViewRole || "student").toLowerCase();
    renderDirectoryRows(
      userDirectoryCache.filter((u) => String(u.role || "").toLowerCase() === roleKey),
      roleKey
    );
    showToast(`${roleLabel} added to class`);
  } catch (err) {
    console.error("Failed to assign class", err);
    if (classAssignError) {
      classAssignError.textContent = "Could not assign class.";
      classAssignError.style.display = "block";
    }
  }
}

async function showDirectoryList(role, options = {}) {
  setSchoolEmailHeaderMode(Boolean(options.keepEmailHeader));
  if (!isSchoolAdmin()) {
    showToast("Only school admins can view this list");
    return;
  }
  const wsId = getRegistrationWorkspaceId();
  if (!wsId) {
    showToast("No school workspace selected");
    return;
  }
  hideSchoolSettingsCard();
  showPanel("chatPanel");
  directoryViewRole = role;

  if (composer) composer.classList.add("hidden");
  if (typingIndicator) typingIndicator.classList.add("hidden");
  if (newMsgsBtn) newMsgsBtn.hidden = true;
  if (headerStarBtn) headerStarBtn.hidden = true;
  if (headerPinBtn) headerPinBtn.hidden = true;
  if (headerMuteBtn) headerMuteBtn.hidden = true;
  if (dmAddMemberBtn) dmAddMemberBtn.classList.add("hidden");
  if (dmEditMemberBtn) dmEditMemberBtn.classList.add("hidden");
  if (channelSearchInput) channelSearchInput.value = "";
  channelSearchTerm = "";

  const label = role === "teacher" ? "Teachers" : "Students";
  if (headerChannelName) headerChannelName.textContent = label;
  if (headerChannelTopic) headerChannelTopic.textContent = `Registered ${label.toLowerCase()}`;
  if (headerChannelPrivacy) {
    headerChannelPrivacy.textContent = "Directory";
    headerChannelPrivacy.classList.remove("is-public", "is-private");
  }
  if (channelRoleTabs) channelRoleTabs.classList.add("hidden");
  if (channelAddMemberBtn) channelAddMemberBtn.classList.add("hidden");
  persistLastView({
    channelId: currentChannelId || null,
    viewMode: "directory",
    directoryRole: role
  });

  try {
    await loadChannelsForWorkspace(wsId);
    const users = await fetchJSON(`/api/users?workspaceId=${encodeURIComponent(wsId)}`);
    userDirectoryCache = Array.isArray(users) ? users : [];
    userDirectoryLoaded = true;
    const list = userDirectoryCache.filter(
      (u) => String(u.role || "").toLowerCase() === role
    );
    if (role === "student" || role === "teacher") {
      await loadClassMemberships(wsId);
    }
    renderDirectoryRows(list, role);
  } catch (err) {
    console.error("Failed to load directory list", err);
    showToast("Could not load users");
  }
}

const DAY_SHORT_LABELS = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun"
};

function formatAvailableDaysList(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "—";
  const parts = normalized
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((item) => DAY_SHORT_LABELS[item] || item.charAt(0).toUpperCase() + item.slice(1));
  return parts.length ? parts.join(", ") : "—";
}

function appendDetailItem(container, label, value) {
  const item = document.createElement("div");
  item.className = "directory-detail-item";
  const labelEl = document.createElement("span");
  labelEl.className = "directory-detail-label";
  labelEl.textContent = label;
  const valueEl = document.createElement("strong");
  valueEl.className = "directory-detail-value";
  valueEl.textContent = value || "—";
  item.appendChild(labelEl);
  item.appendChild(valueEl);
  container.appendChild(item);
}

function renderDirectoryRows(list, role = "") {
  if (!messagesContainer) return;
  messagesContainer.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "employees-list";
  const listRole = String(role || "").toLowerCase();

  if (!Array.isArray(list) || !list.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No users found.";
    messagesContainer.appendChild(empty);
    return;
  }

  list.forEach((u) => {
    const row = document.createElement("div");
    row.className = "employee-row";
    let detailRow = null;
    const userRole = String(u.role || listRole || "").toLowerCase();
    const isStudentCard = userRole === "student";
    const isTeacherCard = userRole === "teacher";
    const isDirectoryCard = isStudentCard || isTeacherCard;
    const userId = u.id || u.userId || u.email || "";
    if (isDirectoryCard) {
      row.classList.add("employee-row-static", "student-card");
    } else {
      row.setAttribute("role", "button");
      row.tabIndex = 0;
    }

    const avatar = document.createElement("div");
    avatar.className = "employee-avatar";
    applyAvatarToNode(
      avatar,
      generateInitials(u.name || `${u.firstName || ""} ${u.lastName || ""}`),
      u.avatarUrl,
      u.name || "",
      userRole
    );

    if (isDirectoryCard) {
      const nameEl = document.createElement("div");
      nameEl.className = "employee-name";
      nameEl.textContent =
        (u.name || `${u.firstName || ""} ${u.lastName || ""}`).trim() || "User";

      const nameCol = document.createElement("div");
      nameCol.className = "student-name-col";
      nameCol.appendChild(nameEl);

      const emailCol = document.createElement("div");
      emailCol.className = "student-email-col";
      emailCol.textContent = u.email || "—";
      emailCol.title = u.email || "";

      const statusCol = document.createElement("div");
      statusCol.className = "student-status-col";
      const roleLabel = document.createElement("span");
      roleLabel.className = "employee-role";
      setStatusInText(roleLabel, userRole || "student", isTeacherCard ? "Teacher" : "Student");
      statusCol.appendChild(roleLabel);

      const active = isEnrollmentActive(u.courseStart, u.courseEnd);
      const activeBadge = document.createElement("span");
      activeBadge.className = `employee-active-badge ${active ? "is-active" : "is-inactive"}`;
      activeBadge.textContent = active ? "Active" : "Not active";

      const classesWrap = document.createElement("div");
      classesWrap.className = "student-card-classes";
      const courseLevel = (u.courseLevel || u.course_level || "").trim();
      const classList = getClassesForUser(userId);
      if (classList.length) {
        const seen = new Set();
        classList.forEach((c) => {
          const chipLabel = (c.channelName || c.channelId || "").trim();
          if (!chipLabel || seen.has(chipLabel)) return;
          seen.add(chipLabel);
          const chip = document.createElement("span");
          chip.className = "student-class-chip";
          chip.textContent = chipLabel;
          classesWrap.appendChild(chip);
        });
        if (!seen.size) {
          const empty = document.createElement("span");
          empty.className = "student-class-empty";
          empty.textContent = "No class";
          classesWrap.appendChild(empty);
        }
      } else {
        const empty = document.createElement("span");
        empty.className = "student-class-empty";
        empty.textContent = "No class";
        classesWrap.appendChild(empty);
      }
      if (isStudentCard && courseLevel) {
        const normalizedCourseLevel = courseLevel.toLowerCase();
        const hasCourseInList = classList.some((c) => {
          const channelLabel = (c.channelName || c.channelId || "").trim().toLowerCase();
          return channelLabel && channelLabel === normalizedCourseLevel;
        });
        if (!hasCourseInList) {
          const levelChip = document.createElement("span");
          levelChip.className = "student-class-chip student-class-level";
          levelChip.textContent = courseLevel;
          classesWrap.appendChild(levelChip);
        }
      }

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "student-edit-btn";
      editBtn.textContent = "Edit";
      editBtn.setAttribute("aria-label", `Edit ${isTeacherCard ? "teacher" : "student"}`);
      editBtn.dataset.userId = userId;
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openStudentEditModal({ ...u, id: userId });
      });

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "student-class-add-btn";
      addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
      addBtn.setAttribute("aria-label", "Add to class");
      addBtn.dataset.userId = userId;
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openClassAssignModal({ ...u, id: userId }, addBtn);
      });

      const dmBtn = document.createElement("button");
      dmBtn.type = "button";
      dmBtn.className = "student-dm-btn";
      dmBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
      dmBtn.setAttribute("aria-label", "Send direct message");
      dmBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        startDirectDmWithUser({ ...u, id: userId });
      });

      row.appendChild(avatar);
      row.appendChild(nameCol);
      row.appendChild(emailCol);
      row.appendChild(statusCol);
      row.appendChild(activeBadge);
      row.appendChild(classesWrap);
      row.appendChild(editBtn);
      row.appendChild(addBtn);
      row.appendChild(dmBtn);

      detailRow = document.createElement("div");
      detailRow.className = "directory-detail-row";
      const detailGrid = document.createElement("div");
      detailGrid.className = "directory-detail-grid";
      const dobValue = formatCourseDate(u.dateOfBirth);
      const phoneValue = [u.phoneCountry, u.phoneNumber].filter(Boolean).join(" ").trim();
      const courseStartValue = formatCourseDate(u.courseStart);
      const courseEndValue = formatCourseDate(u.courseEnd);
      const availableDaysText = formatAvailableDaysList(u.availableDays);
      const emergencyParts = [u.emergencyName, u.emergencyRelation, u.emergencyPhone].filter(Boolean);
      const emergencyValue = emergencyParts.length ? emergencyParts.join(" · ") : "—";
      appendDetailItem(detailGrid, "Salutation", (u.salutation || u.gender) || "—");
      appendDetailItem(detailGrid, "Date of birth", dobValue);
      appendDetailItem(detailGrid, "Phone", phoneValue);
      appendDetailItem(detailGrid, "Course start", courseStartValue);
      appendDetailItem(detailGrid, "Course end", courseEndValue);
      appendDetailItem(detailGrid, "Native language", u.nativeLanguage || "—");
      appendDetailItem(detailGrid, "Learning goal", u.learningGoal || "—");
      appendDetailItem(detailGrid, "Available days", availableDaysText);
      appendDetailItem(detailGrid, "Emergency contact", emergencyValue);
      appendDetailItem(detailGrid, "Course level", (u.courseLevel || "").trim() || "—");
      detailRow.appendChild(detailGrid);
      const toggleDetail = () => {
        const isOpen = detailRow.classList.toggle("is-open");
        row.classList.toggle("is-expanded", isOpen);
      };
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      row.addEventListener("click", toggleDetail);
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleDetail();
        }
      });
    } else {
      const meta = document.createElement("div");
      meta.className = "employee-meta";
      const nameEl = document.createElement("div");
      nameEl.className = "employee-name";
      nameEl.textContent =
        (u.name || `${u.firstName || ""} ${u.lastName || ""}`).trim() || "User";
      meta.appendChild(nameEl);

      const main = document.createElement("div");
      main.className = "employee-main";
      const sub = document.createElement("div");
      sub.className = "employee-username";
      setStatusInText(sub, userRole, "Member");
      meta.appendChild(sub);
      main.appendChild(avatar);
      main.appendChild(meta);
      row.appendChild(main);
      row.addEventListener("click", () => openUserProfile(nameEl.textContent, u.avatarUrl, u));
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          row.click();
        }
      });
    }
    if (isDirectoryCard) {
      const rowGroup = document.createElement("div");
      rowGroup.className = "directory-row-group";
      rowGroup.appendChild(row);
      if (detailRow) rowGroup.appendChild(detailRow);
      wrapper.appendChild(rowGroup);
    } else {
      wrapper.appendChild(row);
    }
  });

  messagesContainer.appendChild(wrapper);
}

function exitDirectoryView() {
  if (!directoryViewRole) return;
  directoryViewRole = null;
  if (composer) composer.classList.remove("hidden");
  if (typingIndicator) typingIndicator.classList.remove("hidden");
  if (newMsgsBtn) newMsgsBtn.hidden = true;
}

function updateComposerForChannel(channelId) {
  if (showSavedOnly) return;
  const isPrivacyChannel = isPrivacyRulesChannel(channelId);
  if (isPrivacyChannel) {
    if (composer) composer.classList.add("hidden");
    if (messageInput) messageInput.disabled = true;
    if (rteEditor) rteEditor.setAttribute("contenteditable", "false");
    if (sendButton) {
      sendButton.disabled = true;
      sendButton.style.opacity = "0.5";
    }
    const mainComposerEl =
      composerMain || document.querySelector("#composer .composer-main");
    if (mainComposerEl) {
      mainComposerEl.style.display = "none";
    }
    const voiceOnlyEl =
      voiceOnlyComposer || document.getElementById("voiceOnlyComposer");
    if (voiceOnlyEl) {
      voiceOnlyEl.classList.add("hidden");
      voiceOnlyEl.hidden = true;
      voiceOnlyEl.setAttribute("aria-hidden", "true");
      voiceOnlyEl.style.display = "none";
    }
    return;
  }
  if (directoryViewRole) {
    if (composer) composer.classList.add("hidden");
    if (messageInput) messageInput.disabled = true;
    if (rteEditor) rteEditor.setAttribute("contenteditable", "false");
    if (sendButton) sendButton.disabled = true;
    return;
  }

  const isAnnouncementsChannel = isAnnouncementChannel(channelId);
  const canCompose = !isAnnouncementsChannel && canPostInChannel(channelId);
  if (document.body) {
    document.body.classList.remove("speaking-club-mode");
  }
  if (composer) composer.classList.toggle("hidden", !canCompose);

  const isCultureChannel = isCultureExchangeChannel(channelId);
  if (cultureLanguagePicker) {
    cultureLanguagePicker.classList.toggle("hidden", !isCultureChannel);
    cultureLanguagePicker.setAttribute("aria-hidden", isCultureChannel ? "false" : "true");
  }
  if (cultureLanguageSelect) {
    cultureLanguageSelect.value = getCultureExchangeLanguage();
  }

  const mainComposerEl =
    composerMain || document.querySelector("#composer .composer-main");
  if (mainComposerEl) {
    mainComposerEl.style.display = canCompose ? "" : "none";
  }

  const voiceOnlyEl =
    voiceOnlyComposer || document.getElementById("voiceOnlyComposer");
  if (voiceOnlyEl) {
    voiceOnlyEl.classList.add("hidden");
    voiceOnlyEl.hidden = true;
    voiceOnlyEl.setAttribute("aria-hidden", "true");
    voiceOnlyEl.style.display = "none";
  }

  if (messageInput) messageInput.disabled = !canCompose;
  if (rteEditor) rteEditor.setAttribute("contenteditable", canCompose ? "true" : "false");

  if (attachFileBtn) attachFileBtn.disabled = !canCompose;
  if (videoBtn) videoBtn.disabled = !canCompose;
  if (emojiInputBtn) emojiInputBtn.disabled = !canCompose;

  if (threadInput) {
    threadInput.disabled = !canCompose;
    threadInput.placeholder = "Reply in thread…";
  }

  if (sendButton) {
    if (!canCompose) {
      sendButton.disabled = true;
      sendButton.style.opacity = "0.55";
    } else {
      updateSendButtonState();
    }
  }
}

function getUnreadCount(channelId) {
  const state = unreadState.get(String(channelId));
  if (state && state.count > 0) return state.count;
  const msgs = messagesByChannel[channelId] || [];
  const lastIdx =
    typeof lastReadIndexByChannel[channelId] === "number" ? lastReadIndexByChannel[channelId] : -1;
  const unread = msgs.length - (lastIdx + 1);
  return unread > 0 ? unread : 0;
}

function updateNotificationBadgeVisibility() {
  if (!notificationBadge) return;
  const txt = (notificationBadge.textContent || "").trim();
  const show = txt && txt !== "0";
  notificationBadge.style.display = show ? "inline-flex" : "none";
}

function updateMessageBadgeVisibility() {
  if (!messageBadge) return;
  const txt = (messageBadge.textContent || "").trim();
  const show = txt && txt !== "0";
  messageBadge.style.display = show ? "inline-flex" : "none";
}

// simple setter to adjust unread count externally
function setMessageBadgeCount(count) {
  if (!messageBadge) return;
  const val = Number(count) || 0;
  messageBadge.textContent = val > 99 ? "99+" : String(val);
  updateMessageBadgeVisibility();
}

// rail drag + reorder (persisted)
const RAIL_ORDER_KEY = "worknest_rail_order";
let railDragging = null;
let railScrollControlsRaf = 0;

function setRailScrollButtonHidden(btn, hidden) {
  if (!btn) return;
  btn.hidden = hidden;
  btn.classList.toggle("is-hidden", hidden);
  btn.setAttribute("aria-hidden", hidden ? "true" : "false");
  btn.tabIndex = hidden ? -1 : 0;
}

function updateRailScrollControls() {
  if (!railIconsContainer) return;
  const hasOverflow =
    railIconsContainer.scrollHeight - railIconsContainer.clientHeight > 4;
  if (!hasOverflow) {
    setRailScrollButtonHidden(railScrollUpBtn, true);
    setRailScrollButtonHidden(railScrollDownBtn, true);
    return;
  }
  const atTop = railIconsContainer.scrollTop <= 2;
  const atBottom =
    railIconsContainer.scrollTop + railIconsContainer.clientHeight >=
    railIconsContainer.scrollHeight - 2;
  setRailScrollButtonHidden(railScrollUpBtn, atTop);
  setRailScrollButtonHidden(railScrollDownBtn, atBottom);
}

function scheduleRailScrollControlsUpdate() {
  if (railScrollControlsRaf) cancelAnimationFrame(railScrollControlsRaf);
  railScrollControlsRaf = requestAnimationFrame(() => {
    railScrollControlsRaf = 0;
    updateRailScrollControls();
  });
}

function saveRailOrder() {
  if (!railIconsContainer) return;
  const order = Array.from(railIconsContainer.querySelectorAll(".app-rail-btn"))
    .map((btn) => btn.dataset.railId)
    .filter(Boolean);
  try {
    localStorage.setItem(RAIL_ORDER_KEY, JSON.stringify(order));
  } catch (_e) {
    /* ignore */
  }
}

function loadRailOrder() {
  if (!railIconsContainer) return;
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(RAIL_ORDER_KEY) || "[]");
  } catch (_e) {
    stored = null;
  }
  if (!Array.isArray(stored) || !stored.length) return;
  const map = {};
  railIconsContainer.querySelectorAll(".app-rail-btn").forEach((btn) => {
    const id = btn.dataset.railId;
    if (id) map[id] = btn;
  });
  stored.forEach((id) => {
    const btn = map[id];
    if (btn) railIconsContainer.appendChild(btn);
  });
  // append any new buttons not in stored order
  railIconsContainer.querySelectorAll(".app-rail-btn").forEach((btn) => {
    if (!stored.includes(btn.dataset.railId)) {
      railIconsContainer.appendChild(btn);
    }
  });
}

function getRailAfterElement(container, y) {
  const els = [...container.querySelectorAll(".app-rail-btn:not(.rail-btn-dragging)")];
  return els.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

function initRailDrag() {
  if (!railIconsContainer) return;
  loadRailOrder();
  const buttons = railIconsContainer.querySelectorAll(".app-rail-btn");
  buttons.forEach((btn) => {
    btn.draggable = true;
    btn.addEventListener("dragstart", (e) => {
      railDragging = btn;
      btn.classList.add("rail-btn-dragging");
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", btn.dataset.railId || "rail");
      } catch (_e) {}
    });
    btn.addEventListener("dragend", () => {
      if (railDragging) railDragging.classList.remove("rail-btn-dragging");
      railDragging = null;
      saveRailOrder();
      scheduleRailScrollControlsUpdate();
    });
  });

  railIconsContainer.addEventListener("dragover", (e) => {
    if (!railDragging) return;
    e.preventDefault();
    const afterEl = getRailAfterElement(railIconsContainer, e.clientY);
    if (!afterEl) {
      railIconsContainer.appendChild(railDragging);
    } else {
      railIconsContainer.insertBefore(railDragging, afterEl);
    }
    scheduleRailScrollControlsUpdate();
  });

  railIconsContainer.addEventListener("scroll", updateRailScrollControls, { passive: true });
  if (railScrollUpBtn) {
    railScrollUpBtn.addEventListener("click", () => {
      railIconsContainer.scrollBy({ top: -180, behavior: "smooth" });
    });
  }
  if (railScrollDownBtn) {
    railScrollDownBtn.addEventListener("click", () => {
      railIconsContainer.scrollBy({ top: 180, behavior: "smooth" });
    });
  }
  if (typeof ResizeObserver !== "undefined") {
    const railResizeObserver = new ResizeObserver(() => {
      scheduleRailScrollControlsUpdate();
    });
    railResizeObserver.observe(railIconsContainer);
  }
  if (typeof MutationObserver !== "undefined") {
    const railMutationObserver = new MutationObserver(() => {
      scheduleRailScrollControlsUpdate();
    });
    railMutationObserver.observe(railIconsContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "style", "class"],
    });
  }
  window.addEventListener("resize", scheduleRailScrollControlsUpdate);
  scheduleRailScrollControlsUpdate();
}

function isUserActive(userId) {
  const currentId =
    (sessionUser && (sessionUser.userId || sessionUser.id || sessionUser.email)) || null;
  if (!userId || !currentId) return false;
  return String(currentId) === String(userId);
}

function setAvatarPresence(container, userId, authorName = "") {
  if (!container) return;
  const currentId =
    (sessionUser && (sessionUser.userId || sessionUser.id || sessionUser.email)) || null;
  const norm = (s) => (s || "").trim().toLowerCase();
  const isSelf =
    (userId && currentId && String(userId) === String(currentId)) ||
    (!!authorName &&
      !!sessionUser &&
      norm(authorName) === norm(sessionUser.name || sessionUser.username || sessionUser.email));
  container.dataset.userId = userId || (isSelf ? currentId || "" : "");
  container.dataset.active = isSelf ? "true" : "false";
}
function getRoleAvatarIcon(role) {
  const value = String(role || "").toLowerCase();
  if (value === "student") {
    return { iconClass: "fa-solid fa-user-graduate", roleClass: "role-student" };
  }
  if (value === "teacher") {
    return { iconClass: "fa-solid fa-user-tie", roleClass: "role-teacher" };
  }
  if (value === "admin" || value === "super_admin" || value === "school_admin") {
    return { iconClass: "fa-solid fa-user-shield", roleClass: "role-admin" };
  }
  return null;
}

function getUserAvatarSrc(user, fallback = DEFAULT_AVATAR_DATA_URL) {
  const src = (user && user.avatarUrl) || "";
  if (src) return src;
  if (user) return getDicebearAvatarUrl(user);
  return fallback || "";
}

function applyAvatarToNode(container, initials, avatarSrc, alt = "Avatar", role = "") {
  if (!container) return;
  const isAvatar = container.classList.contains("avatar");
  const isEmployeeAvatar = container.classList.contains("employee-avatar");
  if (!isAvatar && !isEmployeeAvatar) return;

  let statusDot = null;
  if (isAvatar) {
    statusDot = container.querySelector(".status-dot");
    // ensure status indicator exists (top-right by default)
    if (!statusDot) {
      statusDot = document.createElement("span");
      statusDot.className = "status-dot status-top";
      container.appendChild(statusDot);
    }
    const uid = container.dataset.userId;
    const explicit = container.dataset.active;
    const hasExplicit = explicit !== undefined && explicit !== null && explicit !== "";
    const isExplicitActive = !["false", "0", "offline"].includes((explicit || "").toLowerCase());
    const isActiveFlag = hasExplicit ? isExplicitActive : isUserActive(uid);
    statusDot.classList.toggle("status-online", isActiveFlag);
    statusDot.classList.toggle("status-offline", !isActiveFlag);
  }

  const initialsEl = container.querySelector("span:not(.status-dot)") || container.querySelector("span");
  container.querySelectorAll(".avatar-role-icon").forEach((el) => el.remove());
  // remove existing img
  container.querySelectorAll("img").forEach((img) => img.remove());
  container.style.backgroundImage = "";
  container.style.backgroundSize = "";
  container.style.backgroundPosition = "";
  container.style.backgroundRepeat = "";
  if (!isAvatar && !initialsEl) {
    container.textContent = "";
  }

  if (avatarSrc) {
    const img = document.createElement("img");
    img.src = avatarSrc;
    img.alt = alt || initials || "Avatar";
    img.loading = "lazy";
    if (statusDot) {
      container.insertBefore(img, statusDot);
    } else {
      container.appendChild(img);
    }
    container.style.backgroundImage = `url(${avatarSrc})`;
    container.style.backgroundSize = "cover";
    container.style.backgroundPosition = "center";
    container.style.backgroundRepeat = "no-repeat";
    if (initialsEl) {
      initialsEl.textContent = "";
      initialsEl.style.display = "none";
    }
    return;
  }

  const resolvedRole =
    role ||
    container.dataset.role ||
    resolveUserRole(alt, initials) ||
    "";
  const iconInfo = getRoleAvatarIcon(resolvedRole);
  if (iconInfo) {
    const icon = document.createElement("i");
    icon.className = `avatar-role-icon ${iconInfo.iconClass} ${iconInfo.roleClass}`;
    if (statusDot) {
      container.insertBefore(icon, statusDot);
    } else {
      container.appendChild(icon);
    }
    if (initialsEl) {
      initialsEl.textContent = "";
      initialsEl.style.display = "none";
    }
    return;
  }

  if (initialsEl) {
    initialsEl.textContent = initials || "";
    initialsEl.style.display = "flex";
  } else if (!isAvatar) {
    container.textContent = initials || "";
  }
}

function slugifyNick(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 14);
}

function resolveNicknameForMessage(msg, channelId) {
  const chan = channelId || "default";
  if (!nicknamesByChannel[chan]) nicknamesByChannel[chan] = {};
  const cache = nicknamesByChannel[chan];
  const authorKey = (msg.username || msg.author || msg.id || "").trim().toLowerCase();
  if (authorKey && cache[authorKey]) return cache[authorKey];

  const taken = new Set(Object.values(cache));
  let base =
    (msg.username && msg.username.replace(/^@+/, "")) ||
    slugifyNick((msg.author || "").split(/\s+/).pop()) ||
    slugifyNick(msg.initials) ||
    "user";
  if (!base) base = "user";

  let nick = base;
  if (taken.has(nick)) {
    const first = (msg.author || "").trim()[0] || "";
    let attempt = base + (first ? first.toLowerCase() : "");
    let i = 1;
    while (taken.has(attempt)) {
      attempt = `${base}${first || ""}${i}`;
      i++;
    }
    nick = attempt;
  }
  if (authorKey) cache[authorKey] = nick;
  return nick;
}
const SESSION_USER_KEY = "worknest_session_user";

function buildReactionChips(reactions = [], onClick = null, size = 24) {
  const cleaned = (reactions || []).filter((r) => r && r.count > 0);
  const wrap = document.createElement("div");
  wrap.className = "reactions-inline-wrap";
  const max = 3;
  cleaned.slice(0, max).forEach((r) => {
    const span = document.createElement("span");
    span.className = "reaction-inline";
    span.innerHTML = `${buildEmojiImage(r.emoji, size)}`;
    if (r.count > 1) {
      const count = document.createElement("span");
      count.className = "reaction-count";
      count.textContent = String(r.count);
      span.appendChild(count);
    }
    if (r._justAdded) {
      span.dataset.justAdded = "true";
      r._justAdded = false;
    }
    if (onClick) {
      span.addEventListener("click", () => onClick(r.emoji));
    }
    wrap.appendChild(span);
  });
  const extra = cleaned.length - max;
  if (extra > 0) {
    const more = document.createElement("span");
    more.className = "reaction-inline reaction-inline-mini";
    more.textContent = `+${extra}`;
    wrap.appendChild(more);
  }
  return wrap;
}

function buildCommenterAvatars(msg) {
  if (!msg) return null;

  const uniques = [];
  const seen = new Set();

  const addUser = (user) => {
    if (!user) return;
    const normalized =
      typeof user === "string"
        ? { id: user, name: user }
        : user;
    const displayName =
      normalized.name ||
      normalized.username ||
      normalized.email ||
      normalized.id ||
      "";
    const key = (normalized.id || normalized.email || normalized.username || displayName).toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    uniques.push({
      id: normalized.id || key,
      name: displayName || "Commenter",
      initials: normalized.initials || generateInitials(displayName) || "??",
      avatarUrl:
        normalized.avatarUrl ||
        normalized.photoUrl ||
        normalized.image ||
        resolveAvatarUrl(normalized.name, normalized.initials)
    });
  };

  const baseCommenters = Array.isArray(msg.commenters) ? msg.commenters : [];
  baseCommenters.forEach(addUser);

  if (Array.isArray(msg.replies)) {
    msg.replies.forEach((reply) =>
      addUser({
        id: reply.author || reply.id,
        name: reply.author,
        initials: reply.initials,
        avatarUrl: reply.avatarUrl
      })
    );
  }

  if (!uniques.length) return null;
  const totalCount =
    msg.totalCommenters ||
    msg.commenterCount ||
    uniques.length;

  const container = document.createElement("div");
  container.className = "commenter-avatars";
  container.setAttribute("role", "list");
  container.tabIndex = 0;
  const readableNames = uniques.map((u) => u.name || u.id || u.initials).filter(Boolean).join(", ");
  if (readableNames) {
    container.title = readableNames;
    container.setAttribute("aria-label", `${uniques.length} commenter${uniques.length === 1 ? "" : "s"}: ${readableNames}`);
  }

  const createAvatar = (user, extraClass = "") => {
    const avatar = document.createElement("div");
    avatar.className = `commenter-avatar${extraClass ? ` ${extraClass}` : ""}`;
    avatar.setAttribute("role", "listitem");
    avatar.tabIndex = 0;
    const label = user.name || user.id || "Commenter";
    avatar.title = label;
    avatar.setAttribute("aria-label", label);

    if (user.avatarUrl) {
      const img = document.createElement("img");
      img.src = user.avatarUrl;
      img.alt = label;
      img.loading = "lazy";
      avatar.appendChild(img);
    } else {
      const span = document.createElement("span");
      span.textContent = user.initials || generateInitials(label) || "?";
      avatar.appendChild(span);
    }
    return avatar;
  };

  uniques.forEach((user) => {
    container.appendChild(createAvatar(user));
  });

  return container;
}

function refreshCommenterAvatars(messageId, channelId = currentChannelId) {
  if (!messagesContainer) return;
  if (!showSavedOnly && channelId && currentChannelId !== channelId) return;

  const row = messagesContainer.querySelector(`.message-row[data-message-id="${messageId}"]`);
  if (!row) return;
  const bubble = row.querySelector(".message-bubble");
  if (!bubble) return;
  const existing = bubble.querySelector(".commenter-avatars");
  if (existing) existing.remove();

  const sourceMessage =
    (messagesByChannel[channelId] || []).find((m) => m.id === messageId) ||
    (savedMessagesById[messageId] ? savedMessagesById[messageId].message : null);

  const avatars = buildCommenterAvatars(sourceMessage);
  if (avatars) {
    const target = bubble.querySelector(".message-footer") || bubble;
    target.appendChild(avatars);
  }
}

function applyMessageReactions(messageId, reactions, emojiJustClicked) {
  const mapped = (reactions || []).map((r) => ({
    emoji: r.emoji,
    count: r.count,
    _justAdded: emojiJustClicked ? r.emoji === emojiJustClicked : false
  }));

  Object.keys(messagesByChannel).forEach((cid) => {
    const msgs = messagesByChannel[cid] || [];
    const msg = msgs.find((m) => m.id === messageId);
    if (msg) msg.reactions = mapped;
  });

  if (currentThreadMessage && currentThreadMessage.id === messageId) {
    currentThreadMessage.reactions = mapped;
  }

  if (savedMessagesById[messageId]) {
    savedMessagesById[messageId].message.reactions = mapped.map((r) => ({
      emoji: r.emoji,
      count: r.count
    }));
    persistSavedMessages();
  }
}

function applyReplyReactions(replyId, reactions, emojiJustClicked) {
  const mapped = (reactions || []).map((r) => ({
    emoji: r.emoji,
    count: r.count,
    _justAdded: emojiJustClicked ? r.emoji === emojiJustClicked : false
  }));

  Object.keys(messagesByChannel).forEach((cid) => {
    const msgs = messagesByChannel[cid] || [];
    msgs.forEach((m) => {
      if (!Array.isArray(m.replies)) return;
      const rep = m.replies.find((rr) => rr.id === replyId);
      if (rep) rep.reactions = mapped;
    });
  });

  if (currentThreadMessage && Array.isArray(currentThreadMessage.replies)) {
    const rep = currentThreadMessage.replies.find((r) => r.id === replyId);
    if (rep) rep.reactions = mapped;
  }
}

function closeAllMessageMenus() {
  document
    .querySelectorAll(".message-options.open")
    .forEach((el) => el.classList.remove("open"));
}

function loadDeepLinkTarget() {
  try {
    const params = new URLSearchParams(window.location.search);
    const channelId = params.get("channel");
    const messageId = params.get("message");
    const workspaceId = params.get("workspace");
    if (channelId || messageId || workspaceId) {
      deepLinkTarget = { channelId, messageId, workspaceId };
    }
  } catch (err) {
    console.warn("Could not parse deeplink", err);
  }
}

function buildMessageLink(channelId, messageId) {
  const url = new URL(window.location.href);
  url.searchParams.set("channel", channelId);
  if (messageId) url.searchParams.set("message", messageId);
  const ch = getChannelById(channelId);
  const wsId = (ch && ch.workspace_id) || currentWorkspaceId;
  if (wsId) url.searchParams.set("workspace", wsId);
  return url.toString();
}

async function copyMessageLink(channelId, messageId) {
  const link = buildMessageLink(channelId, messageId);
  try {
    await navigator.clipboard.writeText(link);
    showToast("Link copied");
  } catch (err) {
    console.warn("Copy failed", err);
    showToast("Could not copy link");
  }
}

async function shareMessageLink(channelId, messageId) {
  const link = buildMessageLink(channelId, messageId);
  if (navigator.share) {
    try {
      await navigator.share({ title: "Message", url: link });
      return;
    } catch (err) {
      // fall through to copy
    }
  }
  copyMessageLink(channelId, messageId);
}

function scrollToMessage(messageId) {
  if (!messageId) return;
  const el = document.querySelector(`[data-message-id="${messageId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("highlight-message");
    setTimeout(() => el.classList.remove("highlight-message"), 1500);
  }
}

function scrollMessagesToBottom() {
  if (!messagesContainer) return;
  requestAnimationFrame(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    if (currentChannelId) {
      scrollState[currentChannelId] = messagesContainer.scrollTop;
      persistScrollState(scrollState);
    }
  });
}

function scrollThreadToBottom() {
  const scroller = getThreadScroller();
  if (!scroller) return;
  requestAnimationFrame(() => {
    scroller.scrollTop = scroller.scrollHeight;
    if (currentThreadMessage) {
      persistThreadScroll(currentThreadChannelId || currentChannelId, currentThreadMessage.id);
    }
  });
}

function applyDeepLinkSelection() {
  if (!deepLinkTarget) return;
  const { channelId, messageId } = deepLinkTarget;
  if (channelId && channels.some((c) => c.id === channelId)) {
    currentChannelId = channelId;
    selectChannel(channelId);
    if (messageId) {
      setTimeout(() => scrollToMessage(messageId), 400);
    }
  }
}

function updateCachedAvatarForUser(user, avatarUrl) {
  if (!user || !avatarUrl) return;
  const normalize = (val) => (val ? String(val).trim().toLowerCase() : "");
  const userKeys = new Set(
    [user.id, user.userId, user.email, user.username, user.name]
      .filter(Boolean)
      .map(normalize)
  );
  const applyAvatar = (u) => {
    if (!u) return false;
    const candidates = [
      u.id,
      u.userId,
      u.email,
      u.username,
      u.name,
      `${u.firstName || ""} ${u.lastName || ""}`.trim()
    ]
      .filter(Boolean)
      .map(normalize);
    const match = candidates.some((c) => userKeys.has(c));
    if (match) {
      u.avatarUrl = avatarUrl;
    }
    return match;
  };

  applyAvatar(sessionUser);
  (userDirectoryCache || []).forEach((u) => applyAvatar(u));
  (employees || []).forEach((u) => applyAvatar(u));
  (adminUsers || []).forEach((u) => applyAvatar(u));
  Object.values(dmMembersCache || {}).forEach((arr) => (arr || []).forEach((u) => applyAvatar(u)));
}

function resolveUserFromDirectory(name) {
  if (!name) return null;
  const key = String(name).trim().toLowerCase();
  if (!key) return null;
  return userDirectoryCache.find((u) => {
    const uname = (u.name || "").toLowerCase();
    const username = (u.username || "").toLowerCase();
    const email = (u.email || "").toLowerCase();
    return uname === key || username === key || email === key;
  });
}

function findUserByIdLike(id) {
  if (!id) return null;
  const key = String(id).trim().toLowerCase();
  if (!key) return null;
  return (userDirectoryCache || []).find((u) => {
    const ids = [
      u.id,
      u.userId,
      u.email,
      u.username,
      `${u.firstName || ""} ${u.lastName || ""}`.trim()
    ]
      .filter(Boolean)
      .map((v) => String(v).trim().toLowerCase());
    return ids.includes(key);
  });
}

async function fetchDmMembers(dmId) {
  if (!dmId) return [];
  if (dmMembersCache[dmId]) return dmMembersCache[dmId];
  try {
    const members = await fetchJSON(`/api/dms/${dmId}/members`, {
      headers: { "x-user-id": getCurrentUserId() }
    });
    dmMembersCache[dmId] = Array.isArray(members) ? members : [];
  } catch (err) {
    console.warn("Could not load DM members", err);
    dmMembersCache[dmId] = [];
  }
  return dmMembersCache[dmId];
}

async function fetchChannelMembers(channelId) {
  if (!channelId) return [];
  const key = String(channelId);
  if (channelMembersCache.has(key)) return channelMembersCache.get(key);
  try {
    const res = await fetchJSON(`/api/channels/${encodeURIComponent(channelId)}/members`);
    const members = Array.isArray(res?.members) ? res.members.map(String) : [];
    channelMembersCache.set(key, members);
  } catch (err) {
    console.warn("Could not load channel members", err);
    channelMembersCache.set(key, []);
  }
  return channelMembersCache.get(key) || [];
}

function setChannelRoleTabsVisible(visible) {
  if (!channelRoleTabs) return;
  channelRoleTabs.classList.toggle("hidden", !visible);
}

function updateChannelRoleCounts(members = []) {
  if (!headerMemberCountStudents || !headerMemberCountTeachers || !headerMemberCountAdmins) return;
  const memberSet = new Set((members || []).map(String));
  const counts = { student: 0, teacher: 0, admin: 0 };
  (userDirectoryCache || []).forEach((u) => {
    const uid = getUserIdValue(u);
    if (!uid || !memberSet.has(String(uid))) return;
    const bucket = getUserRoleBucket(u);
    if (bucket) counts[bucket] += 1;
  });
  headerMemberCountStudents.textContent = String(counts.student);
  headerMemberCountTeachers.textContent = String(counts.teacher);
  headerMemberCountAdmins.textContent = String(counts.admin);
}

async function refreshChannelMemberCount(channelId) {
  if (!channelId) return;
  if (String(channelId).startsWith("dm:")) return;
  try {
    await loadUserDirectory();
    const members = await fetchChannelMembers(channelId);
    updateChannelRoleCounts(members);
  } catch (err) {
    console.warn("Could not update channel member counts", err);
  }
}

function dmDisplayName(dm) {
  if (!dm) return "";
  const members = dmMembersCache[dm.id];
  const me = getCurrentUserId();
  if (Array.isArray(members) && members.length) {
    const others = members.filter((m) => m && (m.id || m.userId || m.email) !== me);
    if (others.length === 1) {
      const other = others[0];
      return (
        other.name ||
        other.username ||
        other.email ||
        generateInitials(other.name || other.username || other.email || dm.name)
      );
    }
    if (others.length > 1) {
      return others
        .map((m) => m.name || m.username || m.email)
        .filter(Boolean)
        .join(", ");
    }
  }
  return dm.name || "DM";
}

function dmDedupeKey(dm) {
  if (!dm) return "";
  const members = dmMembersCache[dm.id];
  const me = getCurrentUserId();
  if (Array.isArray(members) && members.length) {
    const others = members
      .map((m) => String(m?.id || m?.userId || m?.email || m?.username || m?.name || ""))
      .filter(Boolean)
      .filter((id) => !me || id !== me)
      .map((id) => id.toLowerCase());
    if (others.length === 1) return `person:${others[0]}`;
    if (others.length > 1) return `group:${others.sort().join("|")}`;
  }
  const display = (dmDisplayName(dm) || dm.name || "").trim().toLowerCase();
  if (display) return `name:${display}`;
  return `id:${String(dm.id || "")}`;
}

function getOtherDmMember(dm) {
  if (!dm) return null;
  const members = dmMembersCache[dm.id];
  const me = getCurrentUserId();
  if (Array.isArray(members) && members.length) {
    return members.find((m) => m && (m.id || m.userId || m.email) !== me) || null;
  }
  return null;
}

function generateDmNameFromIds(ids) {
  const names = ids
    .map((id) => {
      const u = findUserByIdLike(id);
      return (u && (u.name || u.username || u.email)) || id;
    })
    .filter(Boolean);
  if (!names.length) return "DM";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]}, ${names[1]}`;
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

async function openDmCreateModal() {
  if (!dmCreateModal) return;
  await loadUserDirectory();
  dmCreateSelection = new Set();
  if (dmCreateSearch) dmCreateSearch.value = "";
  renderDmCreateList("");
  dmCreateModal.classList.remove("hidden");
}

function closeDmCreateModal() {
  if (dmCreateModal) dmCreateModal.classList.add("hidden");
  dmCreateSelection = new Set();
}

function renderDmCreateList(term = "") {
  if (!dmCreateList) return;
  const filter = term.trim().toLowerCase();
  dmCreateList.innerHTML = "";
  const candidates = (userDirectoryCache || []).filter((u) => {
    if (!u) return false;
    const name = `${u.name || ""} ${u.username || ""} ${u.email || ""}`.toLowerCase();
    return !filter || name.includes(filter);
  });
  if (!candidates.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No users found.";
    dmCreateList.appendChild(empty);
    return;
  }
  candidates.forEach((u) => {
    const uid = u.id || u.userId || u.email || u.username;
    if (!uid) return;
    const row = document.createElement("label");
    row.className = "modal-list-item dm-create-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = dmCreateSelection.has(uid);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        dmCreateSelection.add(uid);
      } else {
        dmCreateSelection.delete(uid);
      }
      row.classList.toggle("is-selected", checkbox.checked);
    });

    const displayName =
      (u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "User");
    const avatar = document.createElement("div");
    avatar.className = "avatar avatar-sm";
    setAvatarPresence(
      avatar,
      u.id || u.userId || u.email || u.username || "",
      displayName
    );
    applyAvatarToNode(
      avatar,
      generateInitials(displayName),
      u.avatarUrl || u.photoUrl || u.image || null,
      displayName,
      u.role || ""
    );

    const meta = document.createElement("div");
    meta.style.display = "flex";
    meta.style.flexDirection = "column";
    const name = document.createElement("strong");
    name.textContent = displayName;
    const uname = document.createElement("span");
    uname.className = "dm-role-label";
    setStatusInText(uname, u.role, "Member");
    meta.appendChild(name);
    meta.appendChild(uname);

    row.appendChild(checkbox);
    row.appendChild(avatar);
    row.appendChild(meta);
    row.classList.toggle("is-selected", checkbox.checked);
    dmCreateList.appendChild(row);
  });
}

async function findExistingDmByMemberIds(ids = []) {
  const target = Array.from(new Set(ids.map((id) => String(id))));
  if (!target.length) return null;
  const me = getCurrentUserId();
  for (const dm of dms) {
    await fetchDmMembers(dm.id);
    const members = dmMembersCache[dm.id] || [];
    const others = members
      .map((m) => m && (m.id || m.userId || m.email))
      .filter((id) => id && String(id) !== String(me))
      .map((id) => String(id));
    if (others.length !== target.length) continue;
    const otherSet = new Set(others);
    if (target.every((id) => otherSet.has(id))) {
      return dm;
    }
  }
  return null;
}

async function saveDmCreate() {
  const ids = Array.from(dmCreateSelection);
  if (!ids.length) {
    showToast("Select at least one person");
    return;
  }
  const existing = await findExistingDmByMemberIds(ids);
  if (existing) {
    await selectDM(existing.id);
    closeDmCreateModal();
    showToast("Direct message already exists");
    return;
  }
  const dmName = generateDmNameFromIds(ids);
  const initials = generateInitials(dmName) || "DM";
  try {
    const dm = await fetchJSON("/api/dms", {
      method: "POST",
      headers: { "x-user-id": getCurrentUserId() },
      body: JSON.stringify({ name: dmName, initials })
    });
    if (!dms.some((d) => d.id === dm.id)) {
      dms.push(dm);
    }
    await fetchJSON(`/api/dms/${dm.id}/members`, {
      method: "POST",
      headers: { "x-user-id": getCurrentUserId() },
      body: JSON.stringify({ userIds: ids })
    });
    dmMembersCache[dm.id] = null;
    await fetchDmMembers(dm.id);
    renderDMs();
    await selectDM(dm.id);
    closeDmCreateModal();
    showToast("DM created");
  } catch (err) {
    console.error("Failed to create DM", err);
    showToast("Could not create DM");
  }
}

async function openDmMembersModal(dmId, mode = "add") {
  if (!dmMembersModal || !dmId) return;
  await loadUserDirectory();
  await fetchDmMembers(dmId);
  dmMemberSelection = new Set();
  dmMemberModalMode = mode;
  renderDmMembersList(dmId, "");
  if (dmMembersSearch) dmMembersSearch.value = "";
  dmMembersModal.classList.remove("hidden");
  dmMembersModal.dataset.dmId = dmId;
}

function closeDmMembersModal() {
  if (dmMembersModal) {
    dmMembersModal.classList.add("hidden");
    dmMembersModal.dataset.dmId = "";
  }
  dmMemberSelection = new Set();
}

function renderDmMembersList(dmId, term = "") {
  if (!dmMembersList) return;
  const members = dmMembersCache[dmId] || [];
  const existingIds = new Set(
    members
      .map((m) => m && (m.id || m.userId || m.email))
      .filter(Boolean)
      .map(String)
  );
  const filter = term.trim().toLowerCase();
  dmMembersList.innerHTML = "";

  const candidates = (userDirectoryCache || []).filter((u) => {
    if (!u) return false;
    const uid = u.id || u.userId || u.email;
    if (!uid) return false;
    const name = `${u.name || ""} ${u.username || ""} ${u.email || ""}`.toLowerCase();
    return !filter || name.includes(filter);
  });

  if (!candidates.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No users found.";
    dmMembersList.appendChild(empty);
    return;
  }

  candidates.forEach((u) => {
    const uid = u.id || u.userId || u.email;
    const row = document.createElement("label");
    row.className = "modal-list-item dm-member-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    const isExisting = existingIds.has(String(uid));
    checkbox.disabled = dmMemberModalMode === "add" && isExisting;
    if (dmMemberModalMode === "edit" && isExisting) {
      checkbox.checked = true;
      dmMemberSelection.add(uid);
    } else {
      checkbox.checked = dmMemberSelection.has(uid);
    }
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        dmMemberSelection.add(uid);
      } else {
        dmMemberSelection.delete(uid);
      }
      row.classList.toggle("is-selected", checkbox.checked);
    });

    const displayName =
      (u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "User");
    const avatar = document.createElement("div");
    avatar.className = "avatar avatar-sm";
    setAvatarPresence(
      avatar,
      u.id || u.userId || u.email || u.username || "",
      displayName
    );
    applyAvatarToNode(
      avatar,
      generateInitials(displayName),
      u.avatarUrl || u.photoUrl || u.image || null,
      displayName,
      u.role || ""
    );

    const meta = document.createElement("div");
    meta.style.display = "flex";
    meta.style.flexDirection = "column";
    const name = document.createElement("strong");
    name.textContent = displayName;
    const uname = document.createElement("span");
    uname.className = "dm-role-label";
    setStatusInText(uname, u.role, "Member");
    meta.appendChild(name);
    meta.appendChild(uname);

    row.appendChild(checkbox);
    row.appendChild(avatar);
    row.appendChild(meta);

    row.classList.toggle("is-selected", checkbox.checked);
    dmMembersList.appendChild(row);
  });
}

async function saveDmMembers() {
  const dmId = dmMembersModal ? dmMembersModal.dataset.dmId : "";
  if (!dmId) return closeDmMembersModal();
  const members = dmMembersCache[dmId] || [];
  const existingIds = new Set(
    members
      .map((m) => m && (m.id || m.userId || m.email))
      .filter(Boolean)
      .map(String)
  );
  const selected = new Set(dmMemberSelection);
  const toAdd = Array.from(selected).filter((id) => !existingIds.has(String(id)));
  const toRemove =
    dmMemberModalMode === "edit"
      ? Array.from(existingIds).filter((id) => !selected.has(String(id)))
      : [];
  if (!toAdd.length && !toRemove.length) {
    showToast("No changes");
    return;
  }
  try {
    if (toAdd.length) {
      await fetchJSON(`/api/dms/${dmId}/members`, {
        method: "POST",
        headers: { "x-user-id": getCurrentUserId() },
        body: JSON.stringify({ userIds: toAdd })
      });
    }
    if (toRemove.length) {
      await fetchJSON(`/api/dms/${dmId}/members`, {
        method: "DELETE",
        headers: { "x-user-id": getCurrentUserId() },
        body: JSON.stringify({ userIds: toRemove })
      });
    }
    dmMembersCache[dmId] = null;
    await fetchDmMembers(dmId);
    renderDMs();
    renderDmHeader(dmId);
    closeDmMembersModal();
    showToast("Members updated");
  } catch (err) {
    console.error("Failed to update DM members", err);
    showToast("Could not update members");
  }
}

function closeChannelMembersModal() {
  if (channelMembersModal) {
    channelMembersModal.classList.add("hidden");
    channelMembersModal.dataset.channelId = "";
    channelMembersModal.dataset.role = "";
  }
}

function closeChannelAssignModal() {
  if (channelAssignModal) {
    channelAssignModal.classList.add("hidden");
    channelAssignModal.dataset.channelId = "";
  }
  channelAssignSelection = new Set();
}

async function openChannelAssignModal() {
  if (!channelAssignModal) return;
  if (!currentChannelId || String(currentChannelId).startsWith("dm:")) return;
  if (!(isAdminUser() || isTeacherUser())) {
    showToast("Only teachers or admins can add members");
    return;
  }
  const ch = getChannelById(currentChannelId);
  if (!ch) return;
  await loadUserDirectory();
  await fetchChannelMembers(ch.id);
  if (channelAssignTitle) channelAssignTitle.textContent = `Add members to ${ch.name}`;
  channelAssignModal.dataset.channelId = ch.id;
  channelAssignSelection = new Set();
  if (channelAssignSearch) channelAssignSearch.value = "";
  renderChannelAssignList("");
  channelAssignModal.classList.remove("hidden");
}

function renderChannelAssignList(term = "") {
  if (!channelAssignList) return;
  const channelId = channelAssignModal?.dataset.channelId || currentChannelId;
  if (!channelId) return;
  const members = new Set(channelMembersCache.get(String(channelId)) || []);
  const filter = term.trim().toLowerCase();
  channelAssignList.innerHTML = "";

  const candidates = (userDirectoryCache || []).filter((u) => {
    const roleBucket = getUserRoleBucket(u);
    if (roleBucket !== "student" && roleBucket !== "teacher") return false;
    const status = String(u.status || "").toLowerCase();
    if (status && status !== "active") return false;
    const name = `${u.name || ""} ${u.username || ""} ${u.email || ""}`.toLowerCase();
    return !filter || name.includes(filter);
  });

  if (!candidates.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No users found.";
    channelAssignList.appendChild(empty);
    return;
  }

  candidates.forEach((u) => {
    const uid = getUserIdValue(u);
    if (!uid) return;
    const row = document.createElement("label");
    row.className = "modal-list-item dm-create-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    const isMember = members.has(String(uid));
    checkbox.checked = channelAssignSelection.has(uid);
    checkbox.disabled = isMember;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        channelAssignSelection.add(uid);
      } else {
        channelAssignSelection.delete(uid);
      }
      row.classList.toggle("is-selected", checkbox.checked);
    });

    const displayName =
      u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "User";
    const avatar = document.createElement("div");
    avatar.className = "avatar avatar-sm";
    setAvatarPresence(avatar, uid, displayName);
    applyAvatarToNode(
      avatar,
      generateInitials(displayName),
      u.avatarUrl || u.photoUrl || u.image || null,
      displayName,
      u.role || ""
    );

    const meta = document.createElement("div");
    meta.style.display = "flex";
    meta.style.flexDirection = "column";
    const nameEl = document.createElement("strong");
    nameEl.textContent = displayName;
    const roleEl = document.createElement("span");
    roleEl.className = "dm-role-label";
    setStatusInText(roleEl, u.role, "Member");
    meta.appendChild(nameEl);
    meta.appendChild(roleEl);

    row.appendChild(checkbox);
    row.appendChild(avatar);
    row.appendChild(meta);
    row.classList.toggle("is-selected", checkbox.checked);
    channelAssignList.appendChild(row);
  });
}

async function saveChannelAssignMembers() {
  const channelId = channelAssignModal?.dataset.channelId || currentChannelId;
  if (!channelId) return closeChannelAssignModal();
  const ids = Array.from(channelAssignSelection);
  if (!ids.length) {
    showToast("Select at least one user");
    return;
  }
  try {
    for (const userId of ids) {
      await updateChannelMembership(channelId, userId, true);
    }
    channelMembersCache.delete(String(channelId));
    const members = await fetchChannelMembers(channelId);
    updateChannelRoleCounts(members);
    closeChannelAssignModal();
    showToast("Members added");
  } catch (err) {
    console.error("Failed to add channel members", err);
    showToast("Could not add members");
  }
}

async function openChannelMembersModal(role) {
  if (!channelMembersModal || !role) return;
  if (!currentChannelId || String(currentChannelId).startsWith("dm:")) return;
  const ch = getChannelById(currentChannelId);
  if (!ch) return;
  await loadUserDirectory();
  await fetchChannelMembers(ch.id);
  const roleLabel =
    role === "student" ? "Students" : role === "teacher" ? "Teachers" : "Admins";
  if (channelMembersTitle) {
    channelMembersTitle.textContent = `${roleLabel} in ${ch.name}`;
  }
  channelMembersModal.dataset.channelId = ch.id;
  channelMembersModal.dataset.role = role;
  highlightChannelMembersRole(role);
  renderChannelMembersList(role);
  channelMembersModal.classList.remove("hidden");
}

function highlightChannelMembersRole(role) {
  const normalized = String(role || "").toLowerCase();
  if (channelRoleTabs) {
    channelRoleTabs.querySelectorAll(".member-pill").forEach((btn) => {
      const targetRole = String(btn.dataset.role || "").toLowerCase();
      btn.classList.toggle("is-active", targetRole === normalized);
    });
  }
  if (channelMembersRoleTabs) {
    channelMembersRoleTabs.querySelectorAll(".modal-role-btn").forEach((btn) => {
      const targetRole = String(btn.dataset.role || "").toLowerCase();
      btn.classList.toggle("is-active", targetRole === normalized);
    });
  }
}

async function updateChannelMembership(channelId, userId, shouldAdd) {
  if (!channelId || !userId) return;
  await fetchJSON(`/api/channels/${encodeURIComponent(channelId)}/members`, {
    method: shouldAdd ? "POST" : "DELETE",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": getCurrentUserId()
    },
    body: JSON.stringify({ userId })
  });
}

async function ensureAllSchoolAdminsInSchoolTask() {
  if (!isAdminUser() && !isTeacherUser()) return;
  const schoolTaskChannel = getChannelById("school-task");
  if (!schoolTaskChannel) return;
  await loadUserDirectory();
  const admins = (userDirectoryCache || []).filter(
    (u) => normalizeRole(u.role || u.userRole) === "school_admin"
  );
  const existingMembers = new Set(
    (await fetchChannelMembers(schoolTaskChannel.id)).map((id) => String(id))
  );
  for (const admin of admins) {
    const uid = getUserIdValue(admin);
    if (!uid) continue;
    if (!existingMembers.has(String(uid))) {
      await updateChannelMembership(schoolTaskChannel.id, uid, true);
      existingMembers.add(String(uid));
    }
  }
  channelMembersCache.delete(String(schoolTaskChannel.id));
}

function renderChannelMembersList(role) {
  if (!channelMembersList) return;
  const channelId = channelMembersModal?.dataset.channelId || currentChannelId;
  if (!channelId) return;
  const channel = getChannelById(channelId);
  const channelCategory = normalizeChannelCategory(channel?.category);
  const roleKey = String(role || channelMembersModal?.dataset.role || "").toLowerCase();
  const members = new Set(channelMembersCache.get(String(channelId)) || []);
  const canEdit =
    roleKey === "student" &&
    (isAdminUser() || isTeacherUser()) &&
    channelCategory !== "homework";

  channelMembersList.innerHTML = "";
  const candidates = (userDirectoryCache || []).filter(
    (u) => getUserRoleBucket(u) === roleKey
  );
  if (!candidates.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No users found.";
    channelMembersList.appendChild(empty);
    return;
  }

  candidates.forEach((u) => {
    const uid = getUserIdValue(u);
    if (!uid) return;
    const row = document.createElement("div");
    row.className = "channel-member-row";

    if (canEdit) {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "channel-member-check";
      checkbox.checked = members.has(String(uid));
      checkbox.addEventListener("change", async () => {
        const shouldAdd = checkbox.checked;
        checkbox.disabled = true;
        try {
          await updateChannelMembership(channelId, uid, shouldAdd);
          if (shouldAdd) {
            members.add(String(uid));
          } else {
            members.delete(String(uid));
          }
          channelMembersCache.set(String(channelId), Array.from(members));
          updateChannelRoleCounts(Array.from(members));
          row.classList.toggle("is-selected", shouldAdd);
        } catch (err) {
          console.error("Failed to update channel member", err);
          checkbox.checked = !shouldAdd;
          showToast("Could not update members");
        } finally {
          checkbox.disabled = false;
        }
      });
      row.appendChild(checkbox);
    }

    const displayName =
      u.name ||
      `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
      u.email ||
      "User";
    const avatar = document.createElement("div");
    avatar.className = "avatar avatar-sm";
    setAvatarPresence(avatar, uid, displayName);
    applyAvatarToNode(
      avatar,
      generateInitials(displayName),
      u.avatarUrl || u.photoUrl || u.image || null,
      displayName,
      u.role || ""
    );

    const meta = document.createElement("div");
    meta.className = "channel-member-meta";
    const nameEl = document.createElement("div");
    nameEl.className = "channel-member-name";
    nameEl.textContent = displayName;
    const roleEl = document.createElement("div");
    roleEl.className = "channel-member-role";
    setStatusInText(roleEl, u.role, "Member");
    meta.appendChild(nameEl);
    meta.appendChild(roleEl);

    row.appendChild(avatar);
    row.appendChild(meta);
    row.classList.toggle("is-selected", members.has(String(uid)));
    channelMembersList.appendChild(row);
  });
}

async function openUserProfile(name, avatarUrl = "", msg = null) {
  if (!userProfileModal) return;
  currentProfileTargetName = name || "";
  currentProfileTargetId = null;
  if (!userDirectoryLoaded) {
    await loadUserDirectory();
  }
  const user = resolveUserFromDirectory(name) || {};
  if (user && (user.id || user.userId || user.email)) {
    currentProfileTargetId = user.id || user.userId || user.email;
  }
  const displayName = user.name || name || "User";
  const email = user.email || "Not provided";
  const joined = user.createdAt || user.created_at || "Unknown";
  const localTime = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date());
  const role = user.role || (msg && msg.role) || "";
  const normalizedRole = normalizeRole(role);

  if (userProfileName) userProfileName.textContent = displayName;
  setStatusInText(userProfileUsername, role, getRoleText(role, "Member"));
  applyRoleLabel(userProfileRole, null);
  if (userProfileAccountName) userProfileAccountName.textContent = displayName;
  if (userProfileAccountEmail) userProfileAccountEmail.textContent = email;
  syncSchoolProfileEmailUi({ adminEmail: email, usePlatformContactEmail: false });
  if (userProfileAccountRole) userProfileAccountRole.textContent = getRoleText(role, "Member");
  if (userProfileAccountJoined) userProfileAccountJoined.textContent = joined;
  if (userProfileHeaderTime) userProfileHeaderTime.textContent = localTime;

  if (userProfileAvatar) {
    applyAvatarToNode(
      userProfileAvatar,
      generateInitials(displayName),
      avatarUrl || user.avatarUrl || user.photoUrl || user.image || null,
      displayName,
      role
    );
  }

  userProfileModal.classList.toggle(
    "is-school-admin-profile",
    canEditWorkspaceProfile() || normalizedRole === "school_admin"
  );
  userProfileModal.classList.remove("hidden");
  updateSchoolSectionVisibility();
  if (canEditWorkspaceProfile()) {
    refreshSchoolProfileForm();
  }
}

function canEditWorkspaceProfile() {
  if (!sessionUser) return false;
  const role = normalizeRole(sessionUser.role || sessionUser.userRole);
  return ["admin", "school_admin", "super_admin"].includes(role);
}

function updateSchoolSectionVisibility() {
  if (!userProfileSchoolSection) return;
  userProfileSchoolSection.style.display = canEditWorkspaceProfile() ? "flex" : "none";
}

function getProfileWorkspaceId() {
  return (
    sessionUser?.workspaceId ||
    sessionUser?.workspace_id ||
    window.selectedWorkspaceId ||
    window.currentWorkspaceId ||
    currentWorkspaceId ||
    "default"
  );
}

async function resolveProfileWorkspaceId() {
  const current = String(getProfileWorkspaceId() || "").trim();
  if (current && current !== "default") return current;

  try {
    const me = await fetchJSON("/api/auth/me");
    const authedUser = me?.user || null;
    if (authedUser) {
      persistSessionUser(authedUser);
    }
  } catch (err) {
    console.warn("Could not refresh authenticated workspace for email settings", err);
  }

  return String(getProfileWorkspaceId() || "default").trim() || "default";
}

async function fetchWorkspaceProfile(workspaceId, options = {}) {
  if (!workspaceId) return null;
  if (!options.force && workspaceProfileCache.has(workspaceId)) {
    return workspaceProfileCache.get(workspaceId);
  }
  const rawProfile = await fetchJSON(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/profile`
  );
  const profile = normalizeWorkspaceProfileRecord(rawProfile, workspaceId);
  workspaceProfileCache.set(workspaceId, profile);
  return profile;
}

function normalizeWorkspaceProfileRecord(profile = {}, workspaceId = "") {
  const fallbackWorkspaceName =
    String(profile.workspaceName || profile.name || getWorkspaceLabel(workspaceId)).trim() || "School";
  const openingHoursDetails = Array.isArray(profile.openingHoursDetails)
    ? profile.openingHoursDetails
    : Array.isArray(profile.openingHoursDetails?.days)
    ? profile.openingHoursDetails.days
    : [];
  return {
    workspaceName: fallbackWorkspaceName,
    adminEmail: String(profile.adminEmail || "").trim(),
    platformContactEmail: String(profile.platformContactEmail || "").trim(),
    street: String(profile.street || "").trim(),
    houseNumber: String(profile.houseNumber || "").trim(),
    postalCode: String(profile.postalCode || "").trim(),
    city: String(profile.city || "").trim(),
    state: String(profile.state || "").trim(),
    country: String(profile.country || "").trim(),
    phone: String(profile.phone || "").trim(),
    website: String(profile.website || "").trim(),
    openingHours: String(profile.openingHours || "").trim(),
    openingHoursDetails,
    registrationDetails: String(profile.registrationDetails || "").trim(),
    usePlatformContactEmail: !!profile.usePlatformContactEmail
  };
}

function showSchoolProfileStatus(message, isError = false) {
  if (!schoolProfileStatus) return;
  if (!message) {
    schoolProfileStatus.hidden = true;
    schoolProfileStatus.textContent = "";
    schoolProfileStatus.classList.remove("is-error");
    return;
  }
  schoolProfileStatus.hidden = false;
  schoolProfileStatus.textContent = message;
  schoolProfileStatus.classList.toggle("is-error", isError);
}

function getPlatformContactEmail(profile = {}) {
  return (
    String(profile.platformContactEmail || "").trim() ||
    "info@studiestalk.com"
  );
}

function getRegisteredSchoolContactEmail(profile = {}) {
  return (
    String(profile.adminEmail || "").trim() ||
    String(sessionUser?.email || "").trim()
  );
}

function shouldUsePlatformContactEmail(profile = {}) {
  return !!profile.usePlatformContactEmail;
}

function getEffectiveSchoolContactEmail(profile = {}) {
  return shouldUsePlatformContactEmail(profile)
    ? getPlatformContactEmail(profile)
    : getRegisteredSchoolContactEmail(profile);
}

function syncSchoolProfileEmailUi(profile = {}) {
  const effectiveEmail = getEffectiveSchoolContactEmail(profile) || "—";
  const registeredEmail = getRegisteredSchoolContactEmail(profile) || "—";
  const usePlatformEmail = shouldUsePlatformContactEmail(profile);

  if (schoolProfileUsePlatformEmail) {
    schoolProfileUsePlatformEmail.checked = usePlatformEmail;
  }
  if (userProfileSignatureEmail) {
    userProfileSignatureEmail.textContent = effectiveEmail;
  }
  if (schoolProfileEmailHelp) {
    schoolProfileEmailHelp.textContent = `Registered school email: ${registeredEmail}`;
  }
}


//OPPENING HOURS EDITOR START
function normalizeOpeningHoursDay(dayKey, data = {}) {
  const statusCandidate = String(data.status || "").toLowerCase();
  const status =
    OPENING_HOURS_STATUS_OPTIONS.some((opt) => opt.value === statusCandidate)
      ? statusCandidate
      : "open";
  return {
    day: dayKey,
    status,
    openTime: typeof data.openTime === "string" ? data.openTime : "",
    closeTime: typeof data.closeTime === "string" ? data.closeTime : "",
    breakStart: typeof data.breakStart === "string" ? data.breakStart : "",
    breakEnd: typeof data.breakEnd === "string" ? data.breakEnd : ""
  };
}

function createOpeningHoursDayRow(day, data = {}) {
  if (!schoolProfileOpeningHoursEditor) return null;

  const row = document.createElement("div");
  row.className = "opening-hours-day oh-day";
  row.dataset.dayKey = day.key;

  const sanitizedData = normalizeOpeningHoursDay(day.key, data);

  row.innerHTML = `
    <div class="oh-grid">
      <div class="oh-dayname">${escapeHtml(day.label)}</div>
      <div class="oh-times">
        <input type="time" class="opening-hours-time-input oh-time opening-hours-time-open" value="${sanitizedData.openTime}" />
        <span class="oh-sep">–</span>
        <input type="time" class="opening-hours-time-input oh-time opening-hours-time-close" value="${sanitizedData.closeTime}" />
      </div>
      <select class="opening-hours-status oh-status" aria-label="${escapeHtml(day.label)} status">
        ${OPENING_HOURS_STATUS_OPTIONS.map(
          (option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`
        ).join("")}
      </select>
    </div>
  `;

  const selectEl = row.querySelector(".opening-hours-status");
  const inputs = Array.from(row.querySelectorAll(".opening-hours-time-input"));

  function applyClosedState(isClosed) {
    row.classList.toggle("is-closed", isClosed);
    inputs.forEach((input) => {
      input.disabled = isClosed;
    });
  }

  if (selectEl) {
    selectEl.value = sanitizedData.status || "open";
    applyClosedState(selectEl.value === "closed");

    selectEl.addEventListener("change", () => {
      const isClosed = selectEl.value === "closed";
      applyClosedState(isClosed);

      if (!isClosed) {
        const openInput = row.querySelector(".opening-hours-time-open");
        const closeInput = row.querySelector(".opening-hours-time-close");
        if (openInput && !openInput.value) openInput.value = "09:00";
        if (closeInput && !closeInput.value) closeInput.value = "17:00";
      }
    });
  }

  return row;
}
 
function renderOpeningHoursEditor(dayData = []) {
  if (!schoolProfileOpeningHoursEditor) return;
  schoolProfileOpeningHoursEditor.innerHTML = "";
  OPENING_HOURS_DAYS.forEach((day) => {
    const saved = dayData.find((entry) => entry.day === day.key);
    const row = createOpeningHoursDayRow(day, saved);
    if (row) {
      schoolProfileOpeningHoursEditor.appendChild(row);
    }
  });
}

function collectOpeningHoursEditorData() {
  if (!schoolProfileOpeningHoursEditor) return [];
  return Array.from(
    schoolProfileOpeningHoursEditor.querySelectorAll(".opening-hours-day")
  ).map((row) => {
    const statusSelect = row.querySelector(".opening-hours-status");
    const openInput = row.querySelector(".opening-hours-time-open");
    const closeInput = row.querySelector(".opening-hours-time-close");
    const breakStartInput = row.querySelector(".opening-hours-time-break-start");
    const breakEndInput = row.querySelector(".opening-hours-time-break-end");
    const bs = breakStartInput?.value || "";
    const be = breakEndInput?.value || "";
    return {
      day: row.dataset.dayKey || "",
      status: statusSelect?.value || "open",
      openTime: openInput?.value || "",
      closeTime: closeInput?.value || "",
      breakStart: bs && be ? bs : "",
      breakEnd: bs && be ? be : ""
    };
  });
}

function buildOpeningHoursSummaryText(rows) {
  if (!Array.isArray(rows) || !rows.length) return "";
  return rows
    .map((entry) => {
      const dayMeta = OPENING_HOURS_DAYS.find((day) => day.key === entry.day);
      const label = dayMeta?.label || entry.day;
      const statusLabel =
        OPENING_HOURS_STATUS_LABELS[entry.status] ||
        OPENING_HOURS_STATUS_LABELS.open;
      if (entry.status === "closed") {
        return `${label}: Closed`;
      }
      const hasTimes = entry.openTime && entry.closeTime;
      let summary = `${label}: ${statusLabel}`;
      if (hasTimes) {
        summary += ` ${entry.openTime} - ${entry.closeTime}`;
      } else {
        summary += " (time not set)";
      }
      if (entry.breakStart && entry.breakEnd) {
        summary += ` · Break ${entry.breakStart} - ${entry.breakEnd}`;
      }
      return summary;
    })
    .join(" · ");
}
//OPPENING HOURS EDITOR END

function populateSchoolProfileForm(data = {}) {
  if (schoolProfileWorkspaceName) {
    schoolProfileWorkspaceName.value = data.workspaceName || "";
  }
  if (userProfileSchoolName) {
    userProfileSchoolName.textContent =
      data.workspaceName || "School name (workspace)";
  }
  if (schoolProfileStreet) {
    schoolProfileStreet.value = data.street || "";
  }
  if (schoolProfileHouseNumber) {
    schoolProfileHouseNumber.value = data.houseNumber || "";
  }
  if (schoolProfilePostalCode) {
    schoolProfilePostalCode.value = data.postalCode || "";
  }
  if (schoolProfileCity) {
    schoolProfileCity.value = data.city || "";
  }
  if (schoolProfileState) {
    schoolProfileState.value = data.state || "";
  }
  if (schoolProfileCountry) {
    schoolProfileCountry.value = data.country || "";
  }
  if (schoolProfilePhone) {
    schoolProfilePhone.value = data.phone || "";
  }
  if (schoolProfileOpeningHours) {
    schoolProfileOpeningHours.value = data.openingHours || "";
  }
  const detailDays = Array.isArray(data.openingHoursDetails)
    ? data.openingHoursDetails
    : Array.isArray(data.openingHoursDetails?.days)
    ? data.openingHoursDetails.days
    : [];
  renderOpeningHoursEditor(detailDays);
  if (schoolProfileWebsite) {
    schoolProfileWebsite.value = data.website || "";
  }
  syncSchoolProfileEmailUi(data);
  if (sesRegistrationDetails) {
    sesRegistrationDetails.value = data.registrationDetails || "";
  }
  showSchoolProfileStatus("", false);
}

async function refreshSchoolProfileForm({ force } = {}) {
  if (!canEditWorkspaceProfile()) return;
  const workspaceId = getProfileWorkspaceId();
  if (!workspaceId) return;
  showSchoolProfileStatus("Loading school profile…");
  try {
    const profile = await fetchWorkspaceProfile(workspaceId, { force });
    if (!profile) {
      showSchoolProfileStatus("No profile found", true);
      return;
    }
    sesWorkspaceProfileCache = profile;
    populateSchoolProfileForm(profile);
  } catch (err) {
    console.error("Failed to load workspace profile", err);
    showSchoolProfileStatus("Could not load school profile", true);
  }
}

async function handleSchoolProfileSave() {
  if (!canEditWorkspaceProfile()) return;
  const workspaceId = getProfileWorkspaceId();
  if (!workspaceId) {
    showSchoolProfileStatus("Workspace not available", true);
    return;
  }
  const openingHoursEntries = collectOpeningHoursEditorData();
  const summaryFromEditor = buildOpeningHoursSummaryText(openingHoursEntries);
  const fallbackSummary = (schoolProfileOpeningHours?.value || "").trim();
  const openingHoursSummary = summaryFromEditor || fallbackSummary;
  if (schoolProfileOpeningHours) {
    schoolProfileOpeningHours.value = openingHoursSummary;
  }
  const registrationDetails = (sesRegistrationDetails?.value || "").trim();
  const payload = {
    workspaceName: (schoolProfileWorkspaceName?.value || "").trim(),
    street: (schoolProfileStreet?.value || "").trim(),
    houseNumber: (schoolProfileHouseNumber?.value || "").trim(),
    postalCode: (schoolProfilePostalCode?.value || "").trim(),
    city: (schoolProfileCity?.value || "").trim(),
    state: (schoolProfileState?.value || "").trim(),
    country: (schoolProfileCountry?.value || "").trim(),
    phone: (schoolProfilePhone?.value || "").trim(),
    openingHours: openingHoursSummary,
    openingHoursDetails: {
      days: openingHoursEntries
    },
    website: (schoolProfileWebsite?.value || "").trim(),
    registrationDetails,
    usePlatformContactEmail: !!schoolProfileUsePlatformEmail?.checked
  };
  if (schoolProfileSaveBtn) schoolProfileSaveBtn.disabled = true;
  showSchoolProfileStatus("Saving school profile…");
  try {
    const updated = await fetchJSON(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/profile`,
      {
        method: "PATCH",
        body: JSON.stringify(payload)
      }
    );
    workspaceProfileCache.set(workspaceId, updated);
    sesWorkspaceProfileCache = updated;
    populateSchoolProfileForm(updated);
    if (typeof sesUpdateSideCard === "function") {
      sesUpdateSideCard();
    }
    showSchoolProfileStatus("Saved", false);
    setTimeout(() => showSchoolProfileStatus("", false), 2200);
    showToast("School profile saved");
    const ws = workspaces.find((w) => w.id === workspaceId);
    if (ws && typeof updated.workspaceName === "string") {
      ws.name = updated.workspaceName || ws.name;
      updateSchoolLabel();
      if (typeof renderWorkspaces === "function") {
        renderWorkspaces();
      }
    }
  } catch (err) {
    console.error("Failed to save workspace profile", err);
    const message = err?.message || "Could not save school profile";
    showSchoolProfileStatus(message, true);
    showToast(message);
  } finally {
    if (schoolProfileSaveBtn) schoolProfileSaveBtn.disabled = false;
  }
}

function closeUserProfile() {
  if (!userProfileModal) return;
  if (adminPanelContent && userProfileInnerCard?.parentElement === adminPanelContent) {
    restoreUserProfileCardToModal();
    showPanel("chatPanel");
  }
  userProfileModal.classList.add("hidden");
  userProfileModal.classList.remove("is-school-admin-profile");
}

async function startDirectDmWithUser(user) {
  if (!user) return;
  if (!userDirectoryLoaded) {
    await loadUserDirectory();
  }
  const userId = user.id || user.userId || user.email || "";
  if (!userId) {
    showToast("User not found");
    return;
  }
  if (String(userId) === String(getCurrentUserId())) {
    showToast("Select another user");
    return;
  }

  const existing = await findExistingDmByMemberIds([userId]);
  if (existing) {
    await selectDM(existing.id);
    return;
  }

  const displayName =
    user.name ||
    `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
    user.email ||
    "DM";
  const initials = generateInitials(displayName) || "DM";
  try {
    const dm = await fetchJSON("/api/dms", {
      method: "POST",
      headers: { "x-user-id": getCurrentUserId() },
      body: JSON.stringify({ name: displayName, initials })
    });
    if (!dms.some((d) => d.id === dm.id)) {
      dms.push(dm);
    }
    await fetchJSON(`/api/dms/${dm.id}/members`, {
      method: "POST",
      headers: { "x-user-id": getCurrentUserId() },
      body: JSON.stringify({ userIds: [userId] })
    });
    dmMembersCache[dm.id] = null;
    await fetchDmMembers(dm.id);
    renderDMs();
    await selectDM(dm.id);
  } catch (err) {
    console.error("Failed to start DM", err);
    showToast("Could not start DM");
  }
}


// ===================== TOAST / DRAFT HELPERS =====================

function positionToast() {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.style.left = "50%";
  toast.style.top = "50%";
  toast.style.bottom = "auto";
  toast.style.right = "auto";
  toast.style.transform = "translate(-50%, -50%)";
}

function showToast(message, type = "success") {
  if (!message) return;
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.style.position = "fixed";
    toast.style.top = "50%";
    toast.style.left = "50%";
    toast.style.zIndex = "9999";
    toast.style.opacity = "0";
    toast.style.transition = "opacity .2s ease";
    toast.style.padding = "14px 18px";
    toast.style.borderRadius = "14px";
    toast.style.fontWeight = "700";
    toast.style.textAlign = "center";
    toast.style.minWidth = "200px";
    toast.style.maxWidth = "420px";
    toast.style.pointerEvents = "none";
    toast.style.boxShadow = "0 20px 60px rgba(0,0,0,.25)";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.background = type === "success" ? "#16a34a" : "#dc2626";
  toast.style.color = "#fff";
  positionToast();
  toast.style.opacity = "1";
  setTimeout(() => {
    toast.style.opacity = "0";
  }, 1600);
}

window.addEventListener("error", (event) => {
  console.error("GLOBAL ERROR:", event.error || event.message, event);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("UNHANDLED PROMISE:", event.reason, event);
});

// keep editable div in sync with hidden textarea (messageInput)
function syncEditorToTextarea() {
  if (!rteEditor || !messageInput) return;
  messageInput.value = rteEditor.innerHTML.trim();
}

function loadTextareaToEditor() {
  if (!rteEditor || !messageInput) return;
  rteEditor.innerHTML = messageInput.value || "";
}

function saveDraftForCurrentChannel() {
  if (!messageInput) return;
  const key = DRAFT_KEY_PREFIX + currentChannelId;
  syncEditorToTextarea();
  const text = messageInput.value || "";
  try {
    if (text) {
      localStorage.setItem(key, text);
      showToast("Draft saved");
    } else {
      localStorage.removeItem(key);
      showToast("Draft cleared");
    }
  } catch (err) {
    console.warn("Could not save draft", err);
  }
}

function loadDraftForChannel(channelId) {
  if (!messageInput) return;
  const key = DRAFT_KEY_PREFIX + channelId;
  try {
    const text = localStorage.getItem(key) || "";
    messageInput.value = text;
    loadTextareaToEditor();
    if (text && text.trim().length > 0) {
      expandComposer();
    } else {
      collapseComposerIfEmpty();
    }
  } catch (err) {
    console.warn("Could not load draft", err);
    messageInput.value = "";
    loadTextareaToEditor();
    collapseComposerIfEmpty();
  }
}


// ===================== GENERAL HELPERS =====================

function getChannelById(id) {
  if (isSchoolSettingsChannel(id)) {
    return getSchoolSettingsChannelMeta();
  }
  if (isHomeworkNoteChannel(id)) {
    return homeworkNoteChannels.get(String(id));
  }
  return channels.find((c) => c.id === id) || null;
}

function isHomeworkNoteChannel(id) {
  if (!id) return false;
  return homeworkNoteChannels.has(String(id));
}

function createOrGetHomeworkNoteChannel(hwChannel, classChannel) {
  const noteId = `${hwChannel.id}:note`;
  if (homeworkNoteChannels.has(noteId)) {
    return homeworkNoteChannels.get(noteId);
  }
  const channel = {
    id: noteId,
    name: "Note",
    category: "notes",
    workspaceId: classChannel?.workspaceId || hwChannel?.workspaceId || currentWorkspaceId,
    topic: `Notes for ${classChannel?.name || hwChannel?.name || "Class"}`,
    is_homework_note: true,
    parentClassId: classChannel?.id || null,
    homeworkChannelId: hwChannel.id
  };
  if (classChannel?.id) {
    homeworkParentByChannelId.set(noteId, classChannel.id);
  }
  homeworkNoteChannels.set(noteId, channel);
  return channel;
}

function getChannelMeta(channelId) {
  if (!channelId) return null;
  const id = String(channelId);
  const ch = channels.find((c) => String(c.id) === id);
  if (ch) return ch;
  if (id.startsWith("dm:")) return null;
  return null;
}

function channelNameLower(channelId) {
  const ch = getChannelMeta(channelId);
  return String(ch?.name || "").trim().toLowerCase();
}

function channelCategoryLower(channelId) {
  const ch = getChannelMeta(channelId);
  return String(ch?.category || "").trim().toLowerCase();
}

function isVoiceOnlyClubChannel(channelId) {
  const name = channelNameLower(channelId);
  const cat = channelCategoryLower(channelId);
  return cat === "clubs" && name === "speaking club";
}

function normalizeChannelType(channel) {
  if (!channel || typeof channel !== "object") return channel;
  const normalized = { ...channel };

  let type = String(normalized.type || "").trim().toLowerCase();
  if (!type) {
    const id = String(normalized.id || "").trim().toLowerCase();
    const name = String(normalized.name || "").trim().toLowerCase();
    if (id.startsWith("speaking-club") || name === "speaking club") {
      type = "speaking_club";
    } else if (id.startsWith("conversation-club") || name === "conversation club") {
      type = "conversation_club";
    } else if (normalized.category) {
      type = String(normalized.category || "").trim().toLowerCase().replace(/\s+/g, "_");
    } else {
      type = "channel";
    }
  }
  normalized.type = type;
  return normalized;
}

function isSpeakingClubChannel(channelOrId) {
  if (!channelOrId) return false;
  const ch = typeof channelOrId === "string" ? getChannelById(channelOrId) : channelOrId;
  if (!ch) return false;
  if (typeof ch.id === "string" && ch.id.startsWith("dm:")) return false;
  const type = String(ch.type || "").trim().toLowerCase();
  if (type === "speaking_club") return true;
  const id = String(ch.id || "").trim().toLowerCase();
  const name = String(ch.name || "").trim().toLowerCase();
  return false;
}

function isAnnouncementChannel(channelOrId) {
  if (!channelOrId) return false;
  const ch = typeof channelOrId === "string" ? getChannelById(channelOrId) : channelOrId;
  if (!ch) return false;
  if (typeof ch.id === "string" && ch.id.startsWith("dm:")) return false;
  const category = String(ch.category || "").trim().toLowerCase();
  if (ch.isAnnouncement || ch.type === "announcement" || ch.category === "announcement") return true;
  const name = String(ch.name || "").trim().toLowerCase();
  const topic = String(ch.topic || "").trim().toLowerCase();
  const id = String(ch.id || "").trim().toLowerCase();
  const marker = "announc";
  const explicit = name.includes(marker) || id.includes(marker);
  if (explicit) return true;
  const hasExplicit = Array.isArray(channels)
    ? channels.some((c) => {
        const n = String(c.name || "").toLowerCase();
        const cid = String(c.id || "").toLowerCase();
        return n.includes(marker) || cid.includes(marker);
      })
    : false;
  if (hasExplicit) return false;
  return topic.includes(marker);
}

const TEACHER_ONLY_TOOL_CHANNELS = new Set([
  "announcements",
  "announcement",
  "learning materials",
  "speaking practice",
  "listening practice"
]);
const ADMIN_ONLY_TOOL_CHANNELS = new Set([
  "privacy & rules",
  "privacy and rules",
  "privacy rules"
]);

function isTeacherOnlyToolChannel(channelOrId) {
  if (!channelOrId) return false;
  const ch = typeof channelOrId === "string" ? getChannelById(channelOrId) : channelOrId;
  if (!ch) return false;
  if (typeof ch.id === "string" && ch.id.startsWith("dm:")) return false;
  const name = String(ch.name || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (TEACHER_ONLY_TOOL_CHANNELS.has(name)) return true;
  const category = String(ch.category || "").trim().toLowerCase();
  if (category !== "tools") return false;
  return TEACHER_ONLY_TOOL_CHANNELS.has(name);
}

function isAdminOnlyToolChannel(channelOrId) {
  if (!channelOrId) return false;
  const ch = typeof channelOrId === "string" ? getChannelById(channelOrId) : channelOrId;
  if (!ch) return false;
  if (typeof ch.id === "string" && ch.id.startsWith("dm:")) return false;
  const name = String(ch.name || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (ADMIN_ONLY_TOOL_CHANNELS.has(name)) return true;
  const category = String(ch.category || "").trim().toLowerCase();
  if (category !== "tools") return false;
  return ADMIN_ONLY_TOOL_CHANNELS.has(name);
}

function isExamChannel(channelOrId) {
  if (!channelOrId) return false;
  const ch = typeof channelOrId === "string" ? getChannelById(channelOrId) : channelOrId;
  if (!ch) return false;
  if (typeof ch.id === "string" && ch.id.startsWith("dm:")) return false;
  if (ch.isExam || ch.type === "exam" || ch.category === "exams") return true;
  const name = String(ch.name || "").trim().toLowerCase();
  const topic = String(ch.topic || "").trim().toLowerCase();
  return name.includes("exam") || topic.includes("exam");
}

function isHomeworkChannel(channelOrId) {
  if (!channelOrId) return false;
  const ch = typeof channelOrId === "string" ? getChannelById(channelOrId) : channelOrId;
  if (!ch) return false;
  if (typeof ch.id === "string" && ch.id.startsWith("dm:")) return false;
  const category = String(ch.category || "").trim().toLowerCase();
  if (category === "homework") return true;
  const topic = String(ch.topic || "").trim().toLowerCase();
  return topic.includes("homework_for:");
}

function getHomeworkChannelForClassId(classId) {
  if (!classId) return null;
  const marker = `homework_for:${classId}`;
  return (channels || []).find((c) => {
    const category = String(c.category || "").trim().toLowerCase();
    if (category !== "homework") return false;
    const topic = String(c.topic || "").trim().toLowerCase();
    return topic.includes(marker);
  }) || null;
}

// ===================== UNIVERSAL EMPTY STATE (Class / Homework) =====================

function getActiveRoleKey() {
  const role = normalizeRole(sessionUser?.role || sessionUser?.userRole);
  if (role === "teacher" || role === "school_admin" || role === "super_admin") {
    return "teacher";
  }
  return "student";
}

function isHomeworkChannelMeta(channel) {
  if (!channel) return false;
  const cat = String(channel.category || "").toLowerCase();
  if (cat === "homework") return true;

  const name = String(channel.name || "").toLowerCase();
  if (name.includes("homework")) return true;
  if (name.endsWith(" homework")) return true;
  return false;
}

function removeEmptyState(container) {
  if (!container) return;
  const existing = container.querySelector(".empty-state[data-empty]");
  if (existing) existing.remove();
}

function mountEmptyState(container, channel, kind) {
  if (!container) return;
  removeEmptyState(container);

  const tplId = kind === "homework" ? "tplEmptyHomework" : "tplEmptyClass";
  const tpl = document.getElementById(tplId);
  if (!tpl) return;

  const node = tpl.content.firstElementChild.cloneNode(true);
  const titleEl = node.querySelector(".empty-title");
  const subtitleEl = node.querySelector(".empty-subtitle");
  const cname = String(channel?.name || "").trim();

  if (kind === "homework") {
    if (titleEl) titleEl.textContent = `No homework posted yet for ${cname}`;
    if (subtitleEl) subtitleEl.textContent = "Assignments, files, and submissions will appear here.";
  } else {
    if (titleEl) titleEl.textContent = `Welcome to ${cname}`;
    if (subtitleEl) {
      subtitleEl.textContent =
        "Share updates, ask questions, and practice together in this class.";
    }
  }

  const roleKey = getActiveRoleKey();
  node.querySelectorAll(".empty-actions").forEach((row) => {
    const rowRole = row.getAttribute("data-role");
    row.classList.toggle("hidden", rowRole !== roleKey);
  });

  node.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");

    if (action === "focusComposer") {
      if (rteEditor) rteEditor.focus();
      else if (messageInput) messageInput.focus();
      return;
    }

    if (action === "sendIntro") {
      const intro = "Hi everyone 👋 I’m new here. Nice to meet you!";
      if (rteEditor) {
        rteEditor.focus();
        try {
          document.execCommand("insertText", false, intro);
        } catch (_e) {
          rteEditor.textContent += intro;
        }
        syncEditorToTextarea();
      } else if (messageInput) {
        messageInput.value = intro;
        messageInput.focus();
      }
      return;
    }

    if (action === "tips") {
      showToast("Tip: Use 📎 to attach files, and reply in threads for homework feedback.");
      return;
    }

    if (action === "createHomeworkHint") {
      showToast(
        "Homework format tip: Start with a title line, then \"Due: YYYY-MM-DD\", then \"Tasks: - ...\""
      );
    }
  });

  container.appendChild(node);
}

function renderUniversalEmptyState(channelId, messagesCount) {
  const container = document.getElementById("messagesContainer");
  if (!container) return;
  const key = String(channelId || "");
  if (!key || key.startsWith("dm:")) {
    removeEmptyState(container);
    return;
  }
  const channel = getChannelById ? getChannelById(channelId) : null;
  const category = normalizeChannelCategory(channel?.category);
  if (category !== "classes" && category !== "homework") {
    removeEmptyState(container);
    return;
  }

  if ((messagesCount || 0) > 0) {
    removeEmptyState(container);
    return;
  }

  const kind = isHomeworkChannelMeta(channel) ? "homework" : "class";
  mountEmptyState(container, channel, kind);
}

function getUserRoleKey() {
  return normalizeRole(sessionUser?.role || sessionUser?.userRole);
}

function isTeacherUser() {
  return getUserRoleKey() === "teacher";
}

function isStudentUser() {
  return getUserRoleKey() === "student";
}

function canPostInChannel(channelId) {
  if (isPolicyAcceptanceRequired() && !policyAccepted) return false;
  if (isAnnouncementChannel(channelId)) return isAdminUser();
  if (isAdminOnlyToolChannel(channelId)) return isAdminUser();
  if (isTeacherOnlyToolChannel(channelId)) return isAdminUser() || isTeacherUser();
  if (isRestrictedExamGroupChannel(channelId)) return isAdminUser() || isTeacherUser();
  if (isExamChannel(channelId)) return isAdminUser() || isTeacherUser();
  return true;
}

function normalizeChannelCategory(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (known.has(value)) return value;
  return "classes";
}

const SHARED_CHANNEL_TOPIC_DEFAULTS = {
  "announcements": "Important school updates",
  "learning materials": "Study guides and resources",
  "speaking practice": "Speaking drills and prompts",
  "listening practice": "Listening activities and audio",
  "wordmeaning": "Word meaning discussion and usage",
  "schedule": "Class schedule and timetable",
  "exam registration": "Exam registration details",
  "privacy & rules": "School privacy and communication guidelines",
  "b1 mock test": "Mock exam practice",
  "placement test": "Placement test preparation",
  "final exam – march": "Final exam preparation"
};

function resolveSharedChannelTopic(channel) {
  const rawTopic = String(channel?.topic || "").trim();
  const normalizedName = String(channel?.name || "").trim().toLowerCase();
  const sharedDefault = SHARED_CHANNEL_TOPIC_DEFAULTS[normalizedName] || "";
  if (!sharedDefault) return rawTopic;
  const isPlaceholder =
    !rawTopic || rawTopic === "Describe this channel’s purpose…" || rawTopic === "Describe this channel's purpose...";
  return isPlaceholder ? sharedDefault : rawTopic;
}

function getStaticChannelKey(name, category) {
  const cleanName = String(name || "").trim().toLowerCase();
  if (!cleanName) return "";
  return `${normalizeChannelCategory(category)}:${cleanName}`;
}

function getStaticChannelItems() {
  return Array.from(
    document.querySelectorAll(".sidebar-item[data-channel-name][data-channel-category]")
  );
}

function getStaticChannelKeySet() {
  const keys = new Set();
  getStaticChannelItems().forEach((item) => {
    const key = getStaticChannelKey(item.dataset.channelName, item.dataset.channelCategory);
    if (key) keys.add(key);
  });
  return keys;
}

let channelActionsMenu = null;
let channelActionsMenuBound = false;
let channelActionsAnchor = null;

function closeChannelActionsMenu() {
  if (!channelActionsMenu) return;
  channelActionsMenu.classList.remove("is-open");
  channelActionsMenu.setAttribute("aria-hidden", "true");
  channelActionsMenu.dataset.channelId = "";
  channelActionsAnchor = null;
}

const examCreationActions = [
  {
    action: "create-mock-test",
    groupKey: "mock-tests",
    label: "Create mock test",
    prompt: "Name for the new mock test?",
    defaultName: "Mock Test",
    match: (channel) => {
      if (!channel || !channel.name) return false;
      const name = String(channel.name || "").toLowerCase();
      return name.includes("mock test");
    }
  },
  {
    action: "create-placement-test",
    groupKey: "placement-test",
    label: "Create placement test",
    prompt: "Name for the placement test?",
    defaultName: "Placement Test",
    match: (channel) => {
      if (!channel || !channel.name) return false;
      const name = String(channel.name || "").toLowerCase();
      return name.includes("placement");
    }
  },
  {
    action: "create-final-exam",
    groupKey: "final-exams",
    label: "Create final exam",
    prompt: "Name for the new final exam?",
    defaultName: "Final Exam",
    match: (channel) => {
      if (!channel || !channel.name) return false;
      const name = String(channel.name || "").toLowerCase();
      return name.includes("final exam");
    }
  }
];

const examGroupStaticNames = {
  "mock-tests": "B1 Mock Test",
  "placement-test": "Placement Test",
  "final-exams": "Final Exam – March"
};
const examGroupStaticNodes = new Map();
const examGroupLastChild = new Map();
const examGroupIcons = {
  "mock-tests": "fa-clipboard-list",
  "placement-test": "fa-square-poll-horizontal",
  "final-exams": "fa-certificate"
};

function refreshExamGroupNodes() {
  examGroupStaticNodes.clear();
  Object.entries(examGroupStaticNames).forEach(([key, name]) => {
    const selector = `[data-channel-name="${name}"][data-channel-category="exams"]`;
    const node = document.querySelector(selector);
    if (node) {
      examGroupStaticNodes.set(key, node);
      updateExamRowIcon(node, key);
    }
  });
}

refreshExamGroupNodes();

function resetExamGroupSubRows() {
  document.querySelectorAll(".exam-sub-row").forEach((row) => row.remove());
  examGroupLastChild.clear();
}

function extractExamGroupKeyFromTopic(topic) {
  const value = String(topic || "").toLowerCase();
  const match = value.match(/exam_group:([\w-]+)/);
  return match ? match[1] : null;
}

function getExamGroupKeyForChannel(channel) {
  if (!channel) return null;
  const explicit = extractExamGroupKeyFromTopic(channel.topic);
  if (explicit && examGroupStaticNames[explicit]) return explicit;
  const name = String(channel.name || "").toLowerCase();
  if (name.includes("mock")) return "mock-tests";
  if (name.includes("placement")) return "placement-test";
  if (name.includes("final exam")) return "final-exams";
  return null;
}

function isRestrictedExamGroupChannel(channelOrId) {
  const ch = typeof channelOrId === "string" ? getChannelById(channelOrId) : channelOrId;
  if (!ch) return false;
  const key = getExamGroupKeyForChannel(ch);
  const readOnlyGroups = new Set(["placement-test", "mock-tests"]);
  return key ? readOnlyGroups.has(key) : false;
}

function insertExamRowIntoGroup(row, groupKey) {
  if (!row || !groupKey) return false;
  const parent = examGroupStaticNodes.get(groupKey);
  if (!parent) return false;
  row.classList.add("exam-sub-row");
  const last = examGroupLastChild.get(groupKey) || parent;
  last.insertAdjacentElement("afterend", row);
  examGroupLastChild.set(groupKey, row);
  return true;
}

function updateExamRowIcon(row, groupKey) {
  if (!row || !groupKey) return;
  const iconClass = examGroupIcons[groupKey];
  if (!iconClass) return;
  const icon = row.querySelector(".sidebar-item-icon");
  if (!icon) return;
  icon.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
}

function getExamCreationAction(channel) {
  if (!channel) return null;
  return examCreationActions.find((item) => item.match(channel)) || null;
}

async function createExamSubChannel(entry) {
  if (!entry) return;
  const baseName = entry.defaultName || "";
  const initial = baseName && baseName.trim() ? baseName.trim() : "Exam";
  const nameValue = window.prompt(entry.prompt || "Name for new exam?", initial);
  const name = (nameValue || "").trim();
  if (!name) return;

  const workspaceId = currentWorkspaceId || "default";
  try {
    const created = await fetchJSON("/api/channels", {
      method: "POST",
      headers: { "x-admin": "1" },
      body: JSON.stringify({
        name,
        workspaceId,
        category: "exams",
        ...(entry.groupKey ? { topic: `exam_group:${entry.groupKey}` } : {})
      })
    });
    await loadChannelsForWorkspace(workspaceId);
    renderChannels();
    renderCommandLists();
    if (created && created.id) {
      selectChannel(created.id);
    }
    showToast(`#${created.name} created`);
  } catch (err) {
    console.error("Failed to create exam channel", err);
    showToast("Could not create exam");
  }
}

function ensureChannelActionsMenu() {
  if (channelActionsMenu) return channelActionsMenu;
  const menu = document.createElement("div");
  menu.className = "channel-actions-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-hidden", "true");
  document.body.appendChild(menu);
  channelActionsMenu = menu;

  menu.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const channelId = menu.dataset.channelId;
    const anchor = channelActionsAnchor;
    closeChannelActionsMenu();
    if (!channelId) return;
    const ch = getChannelById(channelId);
    if (!ch) return;
    if (!isAdminUser()) {
      showToast("Admins only");
      return;
    }
    if (action === "edit") {
      adminEditChannel(ch);
    } else if (action === "delete") {
      const restoreOnCancel = () => {
        if (anchor && anchor.isConnected) {
          openChannelActionsMenu(ch, anchor);
        }
      };
      adminDeleteChannel(ch, { restoreOnCancel });
    } else if (
      action === "create-mock-test" ||
      action === "create-placement-test" ||
      action === "create-final-exam"
    ) {
      const entry = examCreationActions.find((item) => item.action === action);
      if (entry) {
        await createExamSubChannel(entry);
      }
    }
  });

  if (!channelActionsMenuBound) {
    channelActionsMenuBound = true;
    document.addEventListener("click", (e) => {
      if (!channelActionsMenu || !channelActionsMenu.classList.contains("is-open")) return;
      if (e.target.closest(".channel-actions-menu")) return;
      if (e.target.closest(".sidebar-row-more")) return;
      closeChannelActionsMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeChannelActionsMenu();
    });
    window.addEventListener("resize", closeChannelActionsMenu);
    if (sidebarScroll) {
      sidebarScroll.addEventListener("scroll", closeChannelActionsMenu);
    }
  }

  return menu;
}

function positionChannelActionsMenu(menu, anchor) {
  const rect = anchor.getBoundingClientRect();
  menu.style.left = "0px";
  menu.style.top = "0px";
  menu.style.visibility = "hidden";
  menu.classList.add("is-open");

  const menuRect = menu.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 8;
  const maxLeft = window.innerWidth - menuRect.width - 8;
  const maxTop = window.innerHeight - menuRect.height - 8;

  if (left > maxLeft) left = maxLeft;
  if (top > maxTop) top = rect.top - menuRect.height - 8;

  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
  menu.style.visibility = "visible";
}

function openChannelActionsMenu(channel, anchor) {
  if (!channel || !anchor) return;
  const menu = ensureChannelActionsMenu();
  const isAdmin = isAdminUser();
  if (menu.classList.contains("is-open") && menu.dataset.channelId === channel.id) {
    closeChannelActionsMenu();
    return;
  }
  channelActionsAnchor = anchor;
  menu.dataset.channelId = channel.id;
  const examAction = getExamCreationAction(channel);
  const examButton = examAction
    ? `<button class="channel-actions-btn" type="button" data-action="${examAction.action}" ${
        !isAdmin ? "disabled" : ""
      }>
      <span class="action-icon"><i class="fa-solid fa-plus"></i></span>
      <span>${examAction.label}</span>
    </button>`
    : "";
  menu.innerHTML = `
    ${examButton}
    <button class="channel-actions-btn" type="button" data-action="edit" ${!isAdmin ? "disabled" : ""}>
      <span class="action-icon"><i class="fa-regular fa-pen-to-square"></i></span>
      <span>Edit</span>
    </button>
    <button class="channel-actions-btn danger" type="button" data-action="delete" ${!isAdmin ? "disabled" : ""}>
      <span class="action-icon"><i class="fa-regular fa-trash-can"></i></span>
      <span>Delete</span>
    </button>
  `;
  menu.setAttribute("aria-hidden", "false");
  positionChannelActionsMenu(menu, anchor);
}

let confirmResolve = null;
let confirmOrigin = null;

function restoreConfirmOrigin() {
  if (!confirmOrigin || !confirmOrigin.el) return;
  const { el, display, visibility, ariaHidden } = confirmOrigin;
  if (el.isConnected) {
    if (display === "") {
      el.style.removeProperty("display");
    } else {
      el.style.display = display;
    }
    if (visibility === "") {
      el.style.removeProperty("visibility");
    } else {
      el.style.visibility = visibility;
    }
    if (ariaHidden === null) {
      el.removeAttribute("aria-hidden");
    } else {
      el.setAttribute("aria-hidden", ariaHidden);
    }
  }
  confirmOrigin = null;
}

function openConfirmModal({
  title = "Confirm",
  message = "Are you sure?",
  confirmText = "OK",
  cancelText = "Cancel",
  danger = false,
  originEl = null,
  restoreOnCancel = true,
  anchorEl = null
} = {}) {
  if (!confirmOverlay || !confirmTitle || !confirmMessage || !confirmCancelBtn || !confirmOkBtn) {
    return Promise.resolve(window.confirm(message || title));
  }
  if (confirmResolve) {
    confirmResolve(false);
    confirmResolve = null;
    if (confirmOrigin && confirmOrigin.restoreOnCancel) {
      restoreConfirmOrigin();
    }
    confirmOrigin = null;
  }

  if (originEl) {
    confirmOrigin = {
      el: originEl,
      display: originEl.style.display || "",
      visibility: originEl.style.visibility || "",
      ariaHidden: originEl.getAttribute("aria-hidden"),
      restoreOnCancel: restoreOnCancel !== false
    };
  } else {
    confirmOrigin = null;
  }

  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmCancelBtn.textContent = cancelText;
  confirmOkBtn.textContent = confirmText;
  confirmOkBtn.classList.toggle("danger", !!danger);
  resetConfirmCardPosition();
  const anchor = anchorEl || originEl;
  if (anchor) {
    positionConfirmCardNear(anchor);
  } else if (confirmCard) {
    confirmCard?.style.removeProperty("left");
    confirmCard?.style.removeProperty("top");
  }
  if (originEl) {
    originEl.style.display = "none";
    originEl.style.visibility = "hidden";
    originEl.setAttribute("aria-hidden", "true");
  }
  confirmOverlay.classList.remove("hidden");
  confirmOverlay.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => {
    confirmOkBtn.focus();
  });
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}

let confirmCardAnchored = false;

function resetConfirmCardPosition() {
  if (!confirmCard) return;
  confirmCard.classList.remove("confirm-card--anchored");
  confirmCard.style.left = "";
  confirmCard.style.top = "";
  confirmCard.style.transform = "";
}

function positionConfirmCardNear(anchor) {
  if (!confirmCard || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const cardWidth = confirmCard.offsetWidth || 320;
  const cardHeight = confirmCard.offsetHeight || 200;
  const padding = 12;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = rect.right + padding;
  let top = rect.top + rect.height / 2 - cardHeight / 2;

  top = Math.min(Math.max(padding, top), viewportHeight - cardHeight - padding);

  if (left + cardWidth + padding > viewportWidth) {
    left = rect.left - cardWidth - padding;
  }
  if (left < padding) {
    left = Math.min(
      Math.max(padding, rect.left + rect.width / 2 - cardWidth / 2),
      viewportWidth - cardWidth - padding
    );
  }

  confirmCard.style.left = `${left}px`;
  confirmCard.style.top = `${top}px`;
  confirmCard.style.transform = "";
  confirmCard.classList.add("confirm-card--anchored");
  confirmCardAnchored = true;
}

function closeConfirmModal(result) {
  if (confirmOverlay) {
    confirmOverlay.classList.add("hidden");
    confirmOverlay.setAttribute("aria-hidden", "true");
  }
  resetConfirmCardPosition();
  if (!result && confirmOrigin && confirmOrigin.restoreOnCancel) {
    restoreConfirmOrigin();
  } else {
    confirmOrigin = null;
  }
  if (confirmResolve) {
    confirmResolve(result);
    confirmResolve = null;
  }
}

function findChannelByName(name, category) {
  const targetName = String(name || "").trim().toLowerCase();
  if (!targetName) return null;
  const targetCategory = normalizeChannelCategory(category);
  const byCategory = channels.filter(
    (c) =>
      normalizeChannelCategory(c.category) === targetCategory &&
      String(c.name || "").trim().toLowerCase() === targetName
  );
  const preferredWs = currentWorkspaceId || "default";
  const inWorkspace = byCategory.find((c) => (c.workspaceId || "default") === preferredWs);
  if (inWorkspace) return inWorkspace;
  if (byCategory.length) return byCategory[0];

  const byName = channels.filter(
    (c) => String(c.name || "").trim().toLowerCase() === targetName
  );
  const inWorkspaceByName = byName.find((c) => (c.workspaceId || "default") === preferredWs);
  return inWorkspaceByName || byName[0] || null;
}

async function openStaticChannel(item) {
  const name = item?.dataset?.channelName || "";
  const category = item?.dataset?.channelCategory || "classes";
  if (!name) return;

  let ch = findChannelByName(name, category);
  if (!ch) {
    try {
      await loadChannelsForWorkspace(currentWorkspaceId);
      renderChannels();
      renderCommandLists();
      ch = findChannelByName(name, category);
    } catch (err) {
      console.warn("Failed to reload channels for static item", err);
    }
  }
  if (!ch && isAdminUser()) {
    try {
      const created = await fetchJSON("/api/channels", {
        method: "POST",
        headers: { "x-admin": "1" },
        body: JSON.stringify({
          name,
          workspaceId: currentWorkspaceId,
          category: normalizeChannelCategory(category)
        })
      });
      channels.push(normalizeChannelType(created));
      renderChannels();
      renderCommandLists();
      ch = created;
    } catch (err) {
      console.error("Failed to create channel", err);
    }
  }

  if (!ch) {
    showToast("Channel not available yet");
    return;
  }
  await selectChannel(ch.id);
}

function syncStaticChannelItems() {
  const items = getStaticChannelItems();
  items.forEach((item) => {
    const ch = findChannelByName(item.dataset.channelName, item.dataset.channelCategory);
    if (ch) {
      item.dataset.channelId = ch.id;
    } else {
      item.removeAttribute("data-channel-id");
    }
  });
}

function attachStaticChannelMoreButtons() {
  const items = document.querySelectorAll('.sidebar-item[data-static-channel="1"]');
  const allowedNames = new Set(
      [
        "Announcements",
        "Learning Materials",
        "Speaking Practice",
        "Listening Practice",
        "Wordmeaning",
        "School Task",
        "Teachers Task",
        "Schedule",
        "Exam Registration",
        "B1 Mock Test",
      "Placement Test",
      "Final Exam – March"
    ].map((name) => name.toLowerCase())
  );
  items.forEach((item) => {
    const category = normalizeChannelCategory(item.dataset.channelCategory || "");
    if (category !== "tools" && category !== "exams") return;
    const name = String(item.dataset.channelName || "").trim().toLowerCase();
    if (!allowedNames.has(name)) return;
    if (item.querySelector(".sidebar-row-more")) return;

    const btn = document.createElement("button");
    btn.className = "sidebar-row-more static-channel-more";
    btn.type = "button";
    btn.title = "More";
    btn.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>';
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!isAdminUser()) return;
      const ch = findChannelByName(item.dataset.channelName, item.dataset.channelCategory);
      if (!ch) {
        showToast("Channel not available yet");
        return;
      }
      openChannelActionsMenu(ch, btn);
    });

    item.appendChild(btn);
  });
}

function updateStaticChannelMoreVisibility() {
  const isAdmin = isAdminUser();
  document.querySelectorAll(".static-channel-more").forEach((btn) => {
    btn.classList.toggle("hidden", !isAdmin);
  });
}

let staticChannelClickBound = false;

function bindStaticChannelClicks() {
  if (staticChannelClickBound) return;
  const root = sidebarScroll || document;
  root.addEventListener("click", (e) => {
    const item = e.target.closest(
      ".sidebar-item[data-channel-name][data-channel-category]"
    );
    if (!item) return;
    if (e.target.closest(".sidebar-row-more") || e.target.closest("button")) return;
    openStaticChannel(item);
  });
  staticChannelClickBound = true;
}

function isMessageSaved(messageId) {
  return !!savedMessagesById[messageId];
}

function toggleSaveMessage(channelId, message) {
  if (!message || !channelId) return;
  if (isMessageSaved(message.id)) {
    delete savedMessagesById[message.id];
    showToast("Removed from saved");
  } else {
    const ch = getChannelById(channelId);
    // store a snapshot to display in saved view
    savedMessagesById[message.id] = {
      channelId,
      channelName: ch ? ch.name : channelId,
      message: JSON.parse(JSON.stringify(message))
    };
    showToast("Message saved");
  }
  persistSavedMessages();
  refreshMessagesView();
}

// ===================== RENDER HELPERS =====================

async function editChannelTopic(channelId) {
  const ch = getChannelById(channelId);
  if (!ch) return;

  const newTopic = prompt(`Topic for #${ch.name}:`, ch.topic || "");
  if (newTopic === null) return; // cancelled

  try {
    const updated = await fetchJSON(`/api/channels/${channelId}`, {
      method: "PATCH",
      body: JSON.stringify({ topic: newTopic })
    });

    // update local cache
    const idx = channels.findIndex((c) => c.id === channelId);
    if (idx !== -1) {
      channels[idx] = { ...channels[idx], ...updated };
    }

    // if we're currently viewing this channel, refresh header
    if (currentChannelId === channelId) {
      renderChannelHeader(channelId);
    }
    renderCommandLists();

    showToast("Channel topic updated");
  } catch (err) {
    console.error("Failed to update topic", err);
    showToast("Could not update topic");
  }
}

async function deleteChannel(channelId) {
  const ch = getChannelById(channelId);
  if (!ch) return;

  const ok = await openConfirmModal({
    title: "Delete channel?",
    message: `Delete #${ch.name}? This will remove all its messages.`,
    confirmText: "Delete",
    cancelText: "Cancel",
    danger: true
  });
  if (!ok) return;

  try {
    await fetchJSON(`/api/channels/${channelId}`, { method: "DELETE" });

    // remove from local arrays
    channels = channels.filter((c) => c.id !== channelId);
    delete messagesByChannel[channelId];

    // if we just deleted the active channel, jump to another one
    if (currentChannelId === channelId) {
      const fallback = channels[0] ? channels[0].id : null;

      if (fallback) {
        currentChannelId = fallback;
        if (!messagesByChannel[fallback]) {
          const msgs = await fetchJSON(`/api/channels/${fallback}/messages`);
          messagesByChannel[fallback] = msgs;
        }
        renderChannelHeader(fallback);
        renderMessages(fallback);
      } else {
        // no channels left; optional: clear UI
        currentChannelId = null;
        messagesContainer.innerHTML = "";
      }
    }

    renderChannels();
    renderCommandLists();
    showToast(`#${ch.name} deleted`);
  } catch (err) {
    console.error("Failed to delete channel", err);
    showToast("Could not delete channel");
  }
}


function buildChannelRow(ch) {
  const classMeta = classMetaCache.get(ch.id) || {};
  const isDeactivated = classMeta.end_date && new Date(classMeta.end_date).getTime() < Date.now();
  const div = document.createElement("div");
  div.className = "sidebar-item channel-row";
  div.dataset.channelId = ch.id;
  div.dataset.dragType = "channel";
  div.setAttribute("draggable", "true");
  div.setAttribute("role", "button");
  div.setAttribute("tabindex", "0");

  if (ch.id === currentChannelId) {
    div.classList.add("sidebar-item-active");
    div.setAttribute("aria-selected", "true");
  } else {
    div.setAttribute("aria-selected", "false");
  }

  const state = unreadState.get(String(ch.id));
  const mentionCount = state?.mentionCount || 0;
  const unreadCount =
    mentionCount > 0 ? mentionCount : isChannelMuted(ch.id) ? 0 : getUnreadCount(ch.id);
  if (unreadCount > 0) {
    div.classList.add("sidebar-item-unread");
  }

  const normalizedCategory = normalizeChannelCategory(ch.category);
  const isClubChannel = normalizedCategory === "clubs";
  const isClassChannel = normalizedCategory === "classes";
  const isExamChannelRow = normalizedCategory === "exams";
  const isToolChannelRow = normalizedCategory === "tools";
  const isTeacherChannel = normalizedCategory === "teachers";
  if (isClubChannel || isClassChannel || isExamChannelRow || isToolChannelRow) {
    div.classList.add("branch-row");
    if (isClassChannel) div.classList.add("class-row");
    if (isToolChannelRow) div.classList.add("branch-sub");
  }

  const icon = document.createElement("span");
  icon.className = "sidebar-item-icon";
  if (isAnnouncementChannel(ch)) {
    icon.innerHTML = '<i class="fa-solid fa-bullhorn"></i>';
  } else if (isClassChannel) {
    icon.innerHTML = '<i class="fa-solid fa-book-open"></i>';
  } else if (isTeacherChannel) {
    icon.innerHTML = '<i class="fa-solid fa-chalkboard-user"></i>';
  } else if (isExamChannelRow) {
    const groupKey = getExamGroupKeyForChannel(ch);
    const iconClass = groupKey ? examGroupIcons[groupKey] : null;
    if (iconClass) {
      icon.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
    } else {
      icon.innerHTML = '<i class="fa-solid fa-book-open"></i>';
    }
  } else {
    icon.textContent = "📕";
  }

  const label = document.createElement("span");
  label.className = "sidebar-item-label";
  label.textContent = ch.name;

  if (isDeactivated) {
    div.classList.add("sidebar-item-locked");
    const lockIcon = document.createElement("span");
    lockIcon.className = "sidebar-lock-icon";
    lockIcon.innerHTML = '<i class="fa-solid fa-lock"></i>';
    label.appendChild(lockIcon);
  }

  const meta = document.createElement("div");
  meta.className = "sidebar-item-meta";

  if (unreadCount > 0) {
    const pill = document.createElement("span");
    pill.className = mentionCount > 0 ? "sidebar-mention-pill" : "sidebar-item-unread-pill";
    pill.textContent = mentionCount > 0 ? `@${mentionCount}` : unreadCount;
    meta.appendChild(pill);
  }

  const pinned = isChannelPinned(ch.id);
  div.classList.toggle("is-pinned", pinned);
  const moreBtn = document.createElement("button");
  moreBtn.className = "sidebar-row-more";
  moreBtn.type = "button";
  moreBtn.title = "More";
  moreBtn.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>';
  moreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openChannelActionsMenu(ch, moreBtn);
  });
  meta.appendChild(moreBtn);
  let branchConnector = null;
  if (isClubChannel || isClassChannel || isExamChannelRow || isToolChannelRow) {
    branchConnector = document.createElement("span");
    branchConnector.className = "branch-connector";
  }
  if (branchConnector) {
    div.appendChild(branchConnector);
  }
  div.appendChild(icon);
  div.appendChild(label);
  div.appendChild(meta);
  div.appendChild(icon);
  div.appendChild(label);
  div.appendChild(meta);

  // left-click -> open channel
 div.addEventListener("click", async () => {
   // If Files panel is open, clicking a channel should FILTER files, not open chat
   if (isFilesPanelActive()) {
     setFilesScope(ch.id);
     return;
   }
  if (isDeactivated) {
    showToast("This class has been deactivated.");
    return;
  }

  if (isClassChannel) {
    setActiveHomeworkClass(ch.id);
  } else {
    clearActiveHomeworkClass();
  }
  if (isDeactivated) {
    showToast("This class has been deactivated");
    return;
  }

  await selectChannel(ch.id);
 });

  // RIGHT-CLICK -> quick actions (edit topic / delete)
  div.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const choice = prompt(
      `Channel: #${ch.name}\nType one of:\n- topic  → edit topic\n- delete → delete channel`,
      "topic"
    );
    if (!choice) return;
    const val = choice.toLowerCase().trim();
    if (val === "topic") {
      editChannelTopic(ch.id);
    } else if (val === "delete") {
      deleteChannel(ch.id);
    }
  });

  return div;
}

const homeworkParentByChannelId = new Map();

function buildHomeworkRow(hwChannel, classChannel) {
  const div = document.createElement("div");
  div.className = "sidebar-item channel-row homework-row";
  div.dataset.channelId = hwChannel.id;
  div.dataset.homeworkParent = classChannel?.id || "";
  if (classChannel?.id) {
    homeworkParentByChannelId.set(hwChannel.id, classChannel.id);
  }
  div.setAttribute("role", "button");
  div.setAttribute("tabindex", "0");

  if (hwChannel.id === currentChannelId) {
    div.classList.add("sidebar-item-active");
    div.setAttribute("aria-selected", "true");
  } else {
    div.setAttribute("aria-selected", "false");
  }

  const state = unreadState.get(String(hwChannel.id));
  const mentionCount = state?.mentionCount || 0;
  const unreadCount =
    mentionCount > 0 ? mentionCount : isChannelMuted(hwChannel.id) ? 0 : getUnreadCount(hwChannel.id);
  if (unreadCount > 0) {
    div.classList.add("sidebar-item-unread");
  }

  const connector = document.createElement("span");
  connector.className = "homework-connector";

  const icon = document.createElement("span");
  icon.className = "sidebar-item-icon homework-icon";
  icon.innerHTML = '<i class="fa-solid fa-clipboard-check"></i>';

  const label = document.createElement("span");
  label.className = "sidebar-item-label";
  label.textContent = "Homework";

  const meta = document.createElement("div");
  meta.className = "sidebar-item-meta";
  if (unreadCount > 0) {
    const pill = document.createElement("span");
    pill.className = mentionCount > 0 ? "sidebar-mention-pill" : "sidebar-item-unread-pill";
    pill.textContent = mentionCount > 0 ? `@${mentionCount}` : unreadCount;
    meta.appendChild(pill);
  }

  div.appendChild(connector);
  div.appendChild(icon);
  div.appendChild(label);
  div.appendChild(meta);

  div.addEventListener("click", async () => {
    if (isFilesPanelActive()) {
      setFilesScope(hwChannel.id);
      return;
    }
    await selectChannel(hwChannel.id);
  });

  return div;
}

function buildHomeworkNoteRow(hwChannel, classChannel) {
  const div = document.createElement("div");
  div.className = "sidebar-item channel-row homework-row homework-note-row";
  const noteChannel = createOrGetHomeworkNoteChannel(hwChannel, classChannel);
  div.dataset.channelId = noteChannel.id;
  div.dataset.dragType = "channel";
  div.dataset.homeworkParent = classChannel?.id || "";
  div.dataset.homeworkNoteFor = hwChannel.id;
  div.setAttribute("role", "button");
  div.setAttribute("tabindex", "0");

  const connector = document.createElement("span");
  connector.className = "homework-connector";
  const icon = document.createElement("span");
  icon.className = "sidebar-item-icon homework-icon";
  icon.innerHTML = '<i class="fa-solid fa-sticky-note"></i>';

  const label = document.createElement("span");
  label.className = "sidebar-item-label";
  label.textContent = "Note";

  div.appendChild(connector);
  div.appendChild(icon);
  div.appendChild(label);

  div.addEventListener("click", async () => {
    if (isFilesPanelActive()) {
      setFilesScope(noteChannel.id);
      return;
    }
    await selectChannel(noteChannel.id);
    document.querySelectorAll(".homework-note-row").forEach((row) => {
      row.classList.remove("sidebar-item-active");
    });
    div.classList.add("sidebar-item-active");
  });

  return div;
}

let activeHomeworkClassId = null;
let visibleHomeworkClassId = null;

function getHomeworkRowsForClass(classId) {
  if (!classId) return [];
  return Array.from(document.querySelectorAll(`[data-homework-parent="${classId}"]`));
}

function hideAllHomeworkRows() {
  document.querySelectorAll(".homework-row.homework-row-visible").forEach((row) => {
    row.classList.remove("homework-row-visible");
  });
  visibleHomeworkClassId = null;
}

function setVisibleHomeworkClass(classId) {
  hideAllHomeworkRows();
  if (!classId) {
    return;
  }
  const rows = getHomeworkRowsForClass(classId);
  if (!rows.length) {
    visibleHomeworkClassId = null;
    return;
  }
  rows.forEach((row) => row.classList.add("homework-row-visible"));
  visibleHomeworkClassId = classId;
}

function setActiveHomeworkClass(classId) {
  activeHomeworkClassId = classId;
  setVisibleHomeworkClass(classId);
}

function clearActiveHomeworkClass() {
  activeHomeworkClassId = null;
  setVisibleHomeworkClass(null);
}

function appendChannelRows(list, container) {
  if (!container) return;
  list.forEach((ch) => {
    const row = buildChannelRow(ch);
    container.appendChild(row);
    const isClassChannel = normalizeChannelCategory(ch.category) === "classes";
    const meta = classMetaCache.get(ch.id) || {};
    const isDeactivated = meta.end_date && new Date(meta.end_date).getTime() < Date.now();
    if (isClassChannel && !isDeactivated) {
      const homeworkChannel = getHomeworkChannelForClassId(ch.id);
      if (homeworkChannel) {
        container.appendChild(buildHomeworkRow(homeworkChannel, ch));
        container.appendChild(buildHomeworkNoteRow(homeworkChannel, ch));
      }
    }
  });
}

function appendExamChannelRows(list) {
  if (!Array.isArray(list)) return;
  list.forEach((ch) => {
    const row = buildChannelRow(ch);
    const groupKey = getExamGroupKeyForChannel(ch);
    const inserted = groupKey && insertExamRowIntoGroup(row, groupKey);
    if (!inserted && examGroupsChannels) {
      examGroupsChannels.appendChild(row);
    }
  });
}

function renderSidebarSectionEmpty(container, message) {
  if (!container) return;
  const empty = document.createElement("div");
  empty.className = "sidebar-section-empty";
  empty.textContent = message;
  container.appendChild(empty);
}

let inlineChannelFormState = null;

function getChannelFormContainer(category) {
  const normalized = normalizeChannelCategory(category);
  if (normalized === "classes") return channelsContainer;
  if (normalized === "clubs") return document.getElementById("conversationClubContainer");
  if (normalized === "exams") return document.getElementById("examGroupsContainer");
  if (normalized === "tools") return document.getElementById("appsContainer");
  return null;
}

function closeInlineChannelForm() {
  if (!inlineChannelFormState) return;
  const { el } = inlineChannelFormState;
  if (el && el.parentNode) {
    el.parentNode.removeChild(el);
  }
  inlineChannelFormState = null;
}

function openInlineChannelForm(category, container) {
  if (!container) return;
  if (
    inlineChannelFormState &&
    inlineChannelFormState.container === container &&
    inlineChannelFormState.category === category
  ) {
    inlineChannelFormState.input?.focus();
    return;
  }
  closeInlineChannelForm();

  const form = document.createElement("div");
  form.className = "inline-channel-form";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "inline-channel-input";
  input.placeholder = "Type a new name…";
  input.autocomplete = "off";

  const actions = document.createElement("div");
  actions.className = "inline-channel-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "inline-channel-btn inline-save";
  saveBtn.textContent = "Save";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "inline-channel-btn inline-cancel";
  cancelBtn.textContent = "Cancel";

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  form.appendChild(input);
  form.appendChild(actions);
  container.prepend(form);

  const save = async () => {
    const name = (input.value || "").trim();
    if (!name) {
      showToast("Channel name cannot be empty");
      input.focus();
      return;
    }
    try {
      const newChannel = await fetchJSON("/api/channels", {
        method: "POST",
        headers: { "x-admin": "1" },
        body: JSON.stringify({
          name,
          workspaceId: currentWorkspaceId,
          category
        })
      });
      await loadChannelsForWorkspace(currentWorkspaceId);
      messagesByChannel[newChannel.id] = [];
      closeInlineChannelForm();
      renderChannels();
      renderCommandLists();
      selectChannel(newChannel.id);
      showToast(`#${newChannel.name} created`);
    } catch (err) {
      console.error("Failed to create channel", err);
      showToast("Could not create channel");
    }
  };

  saveBtn.addEventListener("click", save);
  cancelBtn.addEventListener("click", closeInlineChannelForm);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeInlineChannelForm();
    }
  });

  inlineChannelFormState = { el: form, input, category, container };
  requestAnimationFrame(() => input.focus());
}

async function renderChannels() {
  if (!channelsContainer) return;
  resetExamGroupSubRows();
  channelsContainer.innerHTML = "";
  if (conversationClubChannels) conversationClubChannels.innerHTML = "";
  if (examGroupsChannels) examGroupsChannels.innerHTML = "";
  if (appsChannelsContainer) appsChannelsContainer.innerHTML = "";
  homeworkParentByChannelId.clear();

  const isAdmin = isAdminUser();
  const canSeeAnnouncements = isAdmin;
  const grouped = {
    classes: [],
    clubs: [],
    exams: [],
    tools: [],
    teachers: []
  };
  const staticKeys = getStaticChannelKeySet();

  channels.forEach((ch) => {
    const workspaceId = ch.workspaceId || "default";
    if (!isAdmin && workspaceId !== currentWorkspaceId) return;
    if (!canSeeAnnouncements && isAnnouncementChannel(ch)) return;
    const category = normalizeChannelCategory(ch.category);
    if (category === "homework") return;
    if (category === "tools" && String(ch.name || "").trim().toLowerCase() === "homework") {
      return;
    }
    const key = getStaticChannelKey(ch.name, category);
    if (staticKeys.has(key)) return;
    grouped[category].push(ch);
  });

  const shouldFilterClasses = !isAdmin && (isStudentUser() || isTeacherUser());
  const visibleClasses = shouldFilterClasses
    ? grouped.classes.filter((ch) => currentUserClassIds.has(String(ch.id)))
    : grouped.classes;
  await Promise.all(grouped.classes.map((ch) => ensureClassMeta(ch.id)));

  appendChannelRows(visibleClasses, channelsContainer);
  appendChannelRows(grouped.clubs, conversationClubChannels);
  appendExamChannelRows(grouped.exams);
  appendChannelRows(grouped.tools, appsChannelsContainer);
  if (teachersChannelsContainer) teachersChannelsContainer.innerHTML = "";
  appendChannelRows(grouped.teachers, teachersChannelsContainer);

  if (!visibleClasses.length) {
    renderSidebarSectionEmpty(
      channelsContainer,
      shouldFilterClasses
        ? "No class channels assigned yet."
        : "No class channels yet."
    );
  }
  if (conversationClubChannels && !grouped.clubs.length) {
    renderSidebarSectionEmpty(conversationClubChannels, "No club channels yet.");
  }
  if (examGroupsChannels && !grouped.exams.length) {
    renderSidebarSectionEmpty(examGroupsChannels, "No exam channels yet.");
  }
  if (teachersChannelsContainer && !grouped.teachers.length) {
    renderSidebarSectionEmpty(teachersChannelsContainer, "No teacher channels yet.");
  }

  const role = getUserRoleKey();
  const isTeacherLike = ["teacher", "school_admin", "super_admin"].includes(role);

  if (teachersSection) {
    teachersSection.hidden = !isTeacherLike;
    teachersSection.style.display = isTeacherLike ? "" : "none";
  }

  renderAnnouncements();
  renderStarred();
  syncStaticChannelItems();
  attachStaticChannelMoreButtons();
  updateStaticChannelMoreVisibility();
  bindStaticChannelClicks();
  setupSidebarKeyboardNav();
  updatePrivacyRulesNavVisibility();
  if (activeHomeworkClassId) {
    setVisibleHomeworkClass(activeHomeworkClassId);
  } else {
    hideAllHomeworkRows();
  }

  const classesSection = document.getElementById("channelList");
  if (classesSection) {
    classesSection.style.display = "";
  }
}

function renderStarred() {
  if (!starredList) return;
  starredList.innerHTML = "";

  const visible = [];
  const missing = [];
  starredChannels.forEach((id) => {
    const ch = getChannelById(id);
    if (!ch) {
      missing.push(id);
      return;
    }
    if ((ch.workspaceId || "default") === currentWorkspaceId) {
      visible.push(ch);
    }
  });
  if (missing.length) {
    starredChannels = starredChannels.filter((id) => !missing.includes(id));
    saveStarred();
  }

  const starredSection = document.getElementById("starredSection");
  if (starredSection) starredSection.hidden = visible.length === 0;

  if (!visible.length) {
    enableStarDragAndDrop();
    setupSidebarKeyboardNav();
    return;
  }

  visible.forEach((ch) => {
    const div = document.createElement("div");
    div.className = "sidebar-item channel-row";
    div.dataset.channelId = ch.id;
    div.dataset.dragType = "channel";
    div.setAttribute("draggable", "true");
    div.setAttribute("role", "button");
    div.setAttribute("tabindex", "0");

    if (ch.id === currentChannelId) {
      div.classList.add("sidebar-item-active");
      div.setAttribute("aria-selected", "true");
    } else {
      div.setAttribute("aria-selected", "false");
    }
    const state = unreadState.get(String(ch.id));
    const mentionCount = state?.mentionCount || 0;
    const unreadCount = mentionCount > 0 ? mentionCount : isChannelMuted(ch.id) ? 0 : getUnreadCount(ch.id);
    if (unreadCount > 0) {
      div.classList.add("sidebar-item-unread");
    }

    const icon = document.createElement("span");
    icon.className = "sidebar-item-icon";
    icon.textContent = "📕";

    const label = document.createElement("span");
    label.className = "sidebar-item-label";
    label.textContent = ch.name;

    const meta = document.createElement("div");
    meta.className = "sidebar-item-meta";

    if (unreadCount > 0) {
      const pill = document.createElement("span");
      pill.className = mentionCount > 0 ? "sidebar-mention-pill" : "sidebar-item-unread-pill";
      pill.textContent = mentionCount > 0 ? `@${mentionCount}` : unreadCount;
      meta.appendChild(pill);
    }

    const unstarBtn = document.createElement("button");
    unstarBtn.className = "icon-btn";
    unstarBtn.title = "Remove from starred";
    unstarBtn.innerHTML = '<i class="fa-regular fa-star"></i>';
    unstarBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      unstarChannel(ch.id);
      renderStarred();
    });
    meta.appendChild(unstarBtn);

    const moreBtn = document.createElement("button");
    moreBtn.className = "sidebar-row-more";
    moreBtn.type = "button";
    moreBtn.title = "More";
    moreBtn.innerHTML = '<i class="fa-solid fa-ellipsis"></i>';
    moreBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openChannelActionsMenu(ch, moreBtn);
    });
    meta.appendChild(moreBtn);

    div.appendChild(icon);
    div.appendChild(label);
    div.appendChild(meta);

    div.addEventListener("click", () => {
      selectChannel(ch.id);
    });

    starredList.appendChild(div);
  });

  enableStarDragAndDrop();
  setupSidebarKeyboardNav();
}

function enableStarDragAndDrop() {
  document.querySelectorAll(".sidebar-item[data-drag-type='channel']").forEach((row) => {
    if (row.dataset.dragBound === "1") return;
    row.addEventListener("dragstart", (e) => {
      dragPayload = { channelId: row.dataset.channelId };
      if (e && e.dataTransfer) {
        try {
          e.dataTransfer.setData("text/plain", row.dataset.channelId || "");
        } catch (_err) {
          /* ignore */
        }
      }
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      dragPayload = null;
      row.classList.remove("dragging");
    });
    row.dataset.dragBound = "1";
  });

  if (!starredList) return;
  if (!starredList.dataset.dropBound) {
    starredList.addEventListener("dragover", (e) => {
      e.preventDefault();
      starredList.classList.add("drop-hover");
    });
    starredList.addEventListener("dragleave", () => starredList.classList.remove("drop-hover"));
    starredList.addEventListener("drop", (e) => {
      e.preventDefault();
      starredList.classList.remove("drop-hover");
      const id = dragPayload?.channelId;
      if (!id) return;
      starChannel(id);
      renderStarred();
      renderChannels();
    });
    starredList.dataset.dropBound = "1";
  }
}


function renderDMs() {
  if (!dmsContainer) return;
  dmsContainer.innerHTML = "";
  const dmListSorted = (() => {
    const list = dms.slice();
    const isGroupDm = (dm) => {
      const members = dmMembersCache[dm.id];
      const count = Array.isArray(members) ? members.length : 0;
      if (count >= 3) return true;
      if (count > 0) return false;
      const name = String(dm.name || "");
      return name.includes(",") || name.includes("+");
    };
    const sortWithRecentFirst = (arr) => {
      if (!arr.length) return arr;
      let latestId = null;
      let latestTs = 0;
      arr.forEach((dm) => {
        const ts = getDmLastVisited(dm.id);
        if (ts > latestTs) {
          latestTs = ts;
          latestId = dm.id;
        }
      });
      return arr.slice().sort((a, b) => {
        const aLatest = latestId && a.id === latestId;
        const bLatest = latestId && b.id === latestId;
        if (aLatest !== bLatest) return aLatest ? -1 : 1;
        const aName = (dmDisplayName(a) || a.name || "").toLowerCase();
        const bName = (dmDisplayName(b) || b.name || "").toLowerCase();
        return aName.localeCompare(bName);
      });
    };
    const groups = list.filter((dm) => isGroupDm(dm));
    const singles = list.filter((dm) => !isGroupDm(dm));
    return [...sortWithRecentFirst(groups), ...sortWithRecentFirst(singles)];
  })();

  const seen = new Set();
  const dmListDeduped = dmListSorted.filter((dm) => {
    const key = dmDedupeKey(dm);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  dmListDeduped.forEach((dm) => {
    const key = `dm:${dm.id}`;
    const div = document.createElement("div");
    div.className = "sidebar-item";
    div.style.gap = "0";
    div.style.paddingLeft = "4px";
    div.setAttribute("role", "button");
    div.setAttribute("tabindex", "0");

    const otherMember = getOtherDmMember(dm);
    const display = dmDisplayName(dm);
    const avatarWrap = document.createElement("div");
    avatarWrap.className = "sidebar-item-icon";
    avatarWrap.style.width = "34px";
    avatarWrap.style.height = "34px";
    avatarWrap.style.marginRight = "6px";
    avatarWrap.style.borderRadius = "8px";
    avatarWrap.style.overflow = "hidden";
    avatarWrap.style.display = "flex";
    avatarWrap.style.alignItems = "center";
    avatarWrap.style.justifyContent = "center";
    avatarWrap.classList.add("avatar", "avatar-sm");
    const initials = generateInitials(display) || "DM";
    const avatarUrl =
      (otherMember && (otherMember.avatarUrl || otherMember.photoUrl || otherMember.image)) || null;
    setAvatarPresence(
      avatarWrap,
      (otherMember && (otherMember.id || otherMember.userId || otherMember.email)) || null,
      display
    );
    applyAvatarToNode(avatarWrap, initials, avatarUrl, display, otherMember?.role || "");

    const label = document.createElement("span");
    label.className = "sidebar-item-label";
    label.textContent = display;
    const unreadCount = getUnreadCount(key);
    if (unreadCount > 0) {
      div.classList.add("sidebar-item-unread");
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "icon-btn dm-delete-btn";
    deleteBtn.title = "Delete DM";
    deleteBtn.style.marginLeft = "auto";
    deleteBtn.innerHTML = '<i class="fa-regular fa-trash-can"></i>';
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteDm(dm.id, dm.name, deleteBtn);
    });

    div.dataset.dmId = dm.id;
    div.addEventListener("click", async () => {
      // If Files panel is open, clicking a DM should FILTER files, not open chat
      if (isFilesPanelActive()) {
        setFilesScope(`dm:${dm.id}`);
        return;
      }

      await selectDM(dm.id);
    });
    if (currentChannelId === `dm:${dm.id}`) {
      div.classList.add("sidebar-item-active");
      div.setAttribute("aria-selected", "true");
    } else {
      div.setAttribute("aria-selected", "false");
    }

    div.appendChild(avatarWrap);
    div.appendChild(label);
    div.appendChild(deleteBtn);
    dmsContainer.appendChild(div);

    if (!dmMembersCache[dm.id]) {
      fetchDmMembers(dm.id).then(() => renderDMs()).catch(() => {});
    }
  });
}

function getDmById(dmId) {
  return dms.find((d) => d.id === dmId) || null;
}

async function deleteDm(dmId, name = "", anchor = null) {
  const confirmed = await openConfirmModal({
    title: `Delete DM "${name || dmId}"?`,
    message: "This will remove its messages.",
    confirmText: "Delete",
    cancelText: "Cancel",
    danger: true,
    anchorEl: anchor || undefined
  });
  if (!confirmed) return;
  try {
    await fetchJSON(`/api/dms/${dmId}`, {
      method: "DELETE",
      headers: { "x-user-id": getCurrentUserId() }
    });
    dms = dms.filter((d) => d.id !== dmId);
    renderDMs();
    showToast("DM deleted");
  } catch (err) {
    console.error("Failed to delete DM", err);
    showToast("Could not delete DM");
  }
}

function getCurrentWorkspaceInfo() {
  if (!Array.isArray(workspaces) || !workspaces.length) return null;
  return workspaces.find((w) => w.id === currentWorkspaceId) || workspaces[0] || null;
}

function getWorkspaceLabel(workspaceId) {
  if (!workspaceId) return "School";
  const ws =
    (Array.isArray(workspaces) && workspaces.find((w) => w.id === workspaceId)) || null;
  return ws?.name || workspaceId;
}

function updateSchoolLabel() {
  if (!schoolNameLabel) return;
  const ws = getCurrentWorkspaceInfo();
  const name = ws && ws.name ? ws.name : "School";
  schoolNameLabel.textContent = name;

  const candidate =
    (ws && (ws.logoUrl || ws.logo_url || ws.logo || "")) ||
    (sessionUser && (sessionUser.avatarUrl || sessionUser.avatar_url || ""));
  const logoUrl = candidate ? String(candidate).trim() : "";
  const applyLogo = (imgEl, fallbackEl) => {
    if (!imgEl || !fallbackEl) return;
    if (logoUrl) {
      imgEl.src = logoUrl;
      imgEl.hidden = false;
      fallbackEl.hidden = true;
    } else {
      imgEl.hidden = true;
      fallbackEl.hidden = false;
    }
  };
  applyLogo(schoolLogoImg, schoolLogoFallback);
  applyLogo(schoolRailLogoImg, schoolRailLogoFallback);

  if (schoolLogoButton) {
    const canEdit = isSchoolAdmin() || isSuperAdmin();
    schoolLogoButton.classList.toggle("is-disabled", !canEdit);
    schoolLogoButton.setAttribute(
      "aria-label",
      canEdit ? "Upload school logo" : "School logo"
    );
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

async function handleSchoolLogoUpload(file) {
  if (!file) return;
  if (!isSchoolAdmin() && !isSuperAdmin()) {
    showToast("Only school admins can update the logo");
    return;
  }
  if (!file.type || !file.type.startsWith("image/")) {
    showToast("Please choose an image file");
    return;
  }
  if (file.size > 1_500_000) {
    showToast("Logo image is too large (max 1.5MB)");
    return;
  }

  const ws = getCurrentWorkspaceInfo();
  const workspaceId = ws && ws.id ? ws.id : null;
  if (!workspaceId) {
    showToast("No school workspace selected");
    return;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    const headers = { "x-user-id": getCurrentUserId() };
    if (isSuperAdmin()) headers["x-super-admin"] = "1";
    const res = await fetchJSON(`/api/workspaces/${encodeURIComponent(workspaceId)}/logo`, {
      method: "POST",
      headers,
      body: JSON.stringify({ logoData: dataUrl })
    });
    const wsIdx = workspaces.findIndex((w) => w.id === workspaceId);
    if (wsIdx !== -1) {
      const logoUrl = res.logoUrl || res.logo_url || dataUrl;
      workspaces[wsIdx].logoUrl = logoUrl;
    }
    updateSchoolLabel();
    showToast("School logo updated");
  } catch (err) {
    console.error("Failed to update school logo", err);
    showToast("Could not update school logo");
  }
}

function renderWorkspaces() {
  updateSchoolLabel();
  if (!workspaceList) return;
  workspaceList.innerHTML = "";
  workspaces.forEach((ws) => {
    const btn = document.createElement("div");
    btn.className = "workspace-logo" + (ws.id === currentWorkspaceId ? " active" : "");
    btn.title = ws.name || ws.initials;
    btn.textContent = ws.initials || "WS";
    btn.addEventListener("click", () => {
      handleWorkspaceSelect(ws.id);
    });
    workspaceList.appendChild(btn);
  });
}

function setupSidebarKeyboardNav() {
  const items = Array.from(document.querySelectorAll('.sidebar-item[role="button"]')).filter(
    (el) => el.offsetParent !== null
  );
  if (!items.length) return;

  let activeIndex = items.findIndex((el) => el.classList.contains("sidebar-item-active"));
  if (activeIndex < 0) activeIndex = 0;

  items.forEach((el, i) => {
    el.tabIndex = i === activeIndex ? 0 : -1;
    if (el.dataset.kbdBound === "1") return;
    el.dataset.kbdBound = "1";
    el.addEventListener("keydown", (e) => {
      const idx = items.indexOf(el);
      if (idx === -1) return;
      const focusAt = (nextIdx) => {
        const clamped = Math.max(0, Math.min(items.length - 1, nextIdx));
        items.forEach((n) => (n.tabIndex = -1));
        items[clamped].tabIndex = 0;
        items[clamped].focus();
      };
      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusAt(idx + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusAt(idx - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        focusAt(0);
      } else if (e.key === "End") {
        e.preventDefault();
        focusAt(items.length - 1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        el.click();
      }
    });
  });
}

async function handleAddWorkspace() {
  if (!isSuperAdmin()) {
    showToast("Only super admins can create workspaces");
    return;
  }

  const rawName = prompt("Workspace name:", "");
  if (rawName === null) return;
  const name = rawName.trim();
  if (!name) {
    showToast("Workspace name cannot be empty");
    return;
  }

  try {
    const result = await fetchJSON("/api/workspaces", {
      method: "POST",
      headers: { "x-super-admin": "1" },
      body: JSON.stringify({ name })
    });

    const { workspace, defaultChannel } = result;

    workspaces.push(workspace);
    currentWorkspaceId = workspace.id;
    persistCurrentWorkspace();

    if (defaultChannel) {
      channels.push(normalizeChannelType(defaultChannel));
    }

    renderWorkspaces();
    await loadChannelsForWorkspace(currentWorkspaceId);
    renderChannels();
    renderCommandLists();

    showToast(`Workspace "${workspace.name}" created`);
  } catch (err) {
    console.error("Failed to create workspace", err);
    showToast("Could not create workspace");
  }
}

async function handleWorkspaceSelect(wsId) {
  currentWorkspaceId = wsId || "default";
  persistCurrentWorkspace();
  await loadChannelsForWorkspace(currentWorkspaceId);
  renderWorkspaces();
  renderChannels();
  renderCommandLists();

  const visible = channels || [];
  if (!visible.length) {
    if (messagesContainer) messagesContainer.innerHTML = "";
    return;
  }

  if (!visible.some((c) => c.id === currentChannelId)) {
    currentChannelId = visible[0].id;
  }
  selectChannel(currentChannelId);
}


function renderChannelHeader(channelId) {
  const ch = getChannelById(channelId);
  if (!ch) return;
  const normalizedChannelName = String(ch.name || "").trim().toLowerCase();
  const chatHeaderEl = document.getElementById("chatHeader");
  if (chatHeaderEl) {
    chatHeaderEl.dataset.channelId = String(ch.id || channelId || "");
  }
  window.currentChannel = ch;
  hideChannelSearchResults();
  const isSchoolSettings = isSchoolSettingsChannel(channelId);
  const isPrivacy = isPrivacyRulesChannel(channelId);
  const isExamRegistration = isExamRegistrationChannel(channelId);
  const isSpeakingPracticeChannel = normalizedChannelName === "speaking practice";
  const channelLine2El = chatHeaderEl?.querySelector(".channel-line-2");
  if (channelLine2El) {
    channelLine2El.classList.toggle("hidden", isPrivacy || isSpeakingPracticeChannel);
  }
  if (privacyChannelHeader) {
    privacyChannelHeader.classList.toggle("visible", isPrivacy);
    privacyChannelHeader.classList.toggle("hidden", !isPrivacy);
  }
  if (chatHeaderEl) {
    chatHeaderEl.classList.toggle("exam-registration-active", isExamRegistration);
    chatHeaderEl.classList.toggle("speaking-practice-active", isSpeakingPracticeChannel);
  }
  const isSchedule = isScheduleChannel(channelId);
  const isGrammar = isGrammarChannel(channelId);
  const isListeningPractice = isListeningPracticeChannel(channelId);
  if (examRegistrationPanels) {
    examRegistrationPanels.classList.toggle("admin-visible", isExamRegistration && isAdminUser());
  }
  document.body?.classList.toggle("speaking-practice-active", isSpeakingPracticeChannel);
  document.documentElement?.classList.toggle("speaking-practice-active", isSpeakingPracticeChannel);
  document.body?.classList.toggle("grammar-shell-active", isGrammar);
  document.documentElement?.classList.toggle("grammar-shell-active", isGrammar);
  if (chatHeaderEl) {
    chatHeaderEl.classList.toggle("schedule-channel-active", isSchedule);
    chatHeaderEl.classList.toggle("grammar-channel-active", isGrammar);
    chatHeaderEl.classList.toggle("listening-practice-active", isListeningPractice);
    document.getElementById("grammarView")?.classList.toggle("full-card", isGrammar);
  }
  if (isGrammar) {
    ensureGrammarContentLoaded().catch((err) => {
      console.error("Failed to load embedded grammar content", err);
    });
  }
  if (isPrivacy) {
    moveHeaderActionsToPrivacy();
  } else {
    restoreHeaderActionsFromPrivacy();
  }
  if (chatHeaderEl) {
    chatHeaderEl.classList.toggle("school-settings-header", isSchoolSettings);
    chatHeaderEl.classList.toggle("privacy-channel-active", isPrivacy);
  }
  if (headerChannelName) {
    headerChannelName.textContent = isPrivacy ? "" : ch.name;
  }
  if (headerChannelTopic) {
    const rawTopic = isPrivacy ? "" : resolveSharedChannelTopic(ch);
    headerChannelTopic.textContent = rawTopic;
    headerChannelTopic.classList.toggle("hidden", !rawTopic);
  }
  const isSchoolTaskChannel = normalizedChannelName === "school task";
  const isTeacherTaskChannel = normalizedChannelName === "teachers task";
  const isAnnouncementsChannel = normalizedChannelName === "announcements";
  const isWordmeaning = isWordmeaningChannel(ch);
  const showRoleTabs =
    !isPrivacy && !isTeacherTaskChannel && !isWordmeaning && !isAnnouncementsChannel && !isSpeakingPracticeChannel;
  setChannelRoleTabsVisible(showRoleTabs);
  if (channelRoleTabs) {
    channelRoleTabs.classList.toggle("hidden", !showRoleTabs);
    channelRoleTabs
      .querySelectorAll('[data-role="student"]')
      .forEach((btn) => btn.classList.toggle("hidden", isSchoolTaskChannel));
  }
  if (chatHeaderEl) {
    chatHeaderEl.classList.toggle("school-task-header", isSchoolTaskChannel);
    chatHeaderEl.classList.toggle("teachers-task-header", isTeacherTaskChannel);
  }
  updateChannelRoleCounts([]);
  if (bannerChannelName) bannerChannelName.textContent = `#${ch.name}`;
  if (headerChannelPrivacy) {
    if (isPrivacy) {
      headerChannelPrivacy.textContent = "Workspace-wide";
      headerChannelPrivacy.classList.remove("is-private", "is-public");
      headerChannelPrivacy.classList.add("privacy-badge");
    } else {
      headerChannelPrivacy.classList.remove("privacy-badge");
      const category = normalizeChannelCategory(ch.category);
      let defaultStatus = category !== "classes" ? "public" : ch.is_public === false ? "private" : "public";
      applyChannelHeaderPrivacy(defaultStatus);
      if (category === "classes") {
        refreshChannelHeaderPrivacy(ch.id, defaultStatus);
      }
    }
  }
  if (channelAddMemberBtn) {
    const canManage = isAdminUser() || isTeacherUser();
    channelAddMemberBtn.classList.toggle("hidden", !canManage || isPrivacy);
  }
  document.body?.classList.toggle("wordmeaning-channel-active", isWordmeaning);
  document.documentElement?.classList.toggle("wordmeaning-channel-active", isWordmeaning);
  document.body?.classList.toggle("announcements-channel-active", isAnnouncementsChannel);
  document.documentElement?.classList.toggle("announcements-channel-active", isAnnouncementsChannel);
  const hideForAnnouncements = isAnnouncementsChannel;
  if (!isAnnouncementsChannel) {
    hideAnnouncementsPopup();
  }
  if (channelAttendanceBtn) {
    channelAttendanceBtn.classList.toggle(
      "hidden",
      isSchoolTaskChannel ||
        isTeacherTaskChannel ||
        isWordmeaning ||
        hideForAnnouncements ||
        isSpeakingPracticeChannel
    );
  }
  if (tasksBtn) {
    tasksBtn.classList.toggle(
      "hidden",
      isSchoolTaskChannel ||
        isTeacherTaskChannel ||
        isWordmeaning ||
        hideForAnnouncements ||
        isSpeakingPracticeChannel
    );
  }
  if (channelSearchInput) {
    channelSearchInput.closest(".channel-search")?.classList.toggle("hidden", isPrivacy);
  }
  if (dmAddMemberBtn) dmAddMemberBtn.classList.add("hidden");
  syncChannelSearchForChannel(channelId);
  if (headerStarBtn) {
    headerStarBtn.hidden = false;
    const starred = isStarred(ch.id);
    headerStarBtn.classList.toggle("is-active", starred);
    headerStarBtn.title = starred ? "Unstar channel" : "Star channel";
    headerStarBtn.setAttribute("aria-label", headerStarBtn.title);
    headerStarBtn.innerHTML = starred
      ? '<i class="fa-solid fa-star"></i>'
      : '<i class="fa-regular fa-star"></i>';
  }
  if (headerPinBtn) {
    headerPinBtn.hidden = false;
    const pinned = isChannelPinned(ch.id);
    headerPinBtn.classList.toggle("is-active", pinned);
    headerPinBtn.title = pinned ? "Unpin channel" : "Pin channel";
    headerPinBtn.setAttribute("aria-label", headerPinBtn.title);
  }
  if (headerMuteBtn) {
    headerMuteBtn.hidden = isPrivacy;
    if (!isPrivacy) {
      const muted = isChannelMuted(ch.id);
      headerMuteBtn.classList.toggle("is-active", muted);
      headerMuteBtn.title = muted ? "Unmute channel" : "Mute channel";
      headerMuteBtn.setAttribute("aria-label", headerMuteBtn.title);
      headerMuteBtn.innerHTML = muted
        ? '<i class="fa-solid fa-volume-xmark"></i>'
        : '<i class="fa-solid fa-volume-high"></i>';
    }
  }
  if (headerClearCultureBtn) {
    const showClearBtn =
      isAdminUser() && !isDmChannel(ch.id) && !isPrivacy && !isWordmeaning && !isSpeakingPracticeChannel;
    headerClearCultureBtn.classList.toggle("hidden", !showClearBtn);
  }
  const hideComposerControls = isWordmeaning || hideForAnnouncements || isSpeakingPracticeChannel;
  if (composer) {
    composer.classList.toggle("hidden", hideComposerControls);
  }
  if (composerMain) {
    composerMain.style.display = hideComposerControls ? "none" : "";
  }
  if (messageInput) {
    messageInput.disabled = hideComposerControls;
  }
  if (sendButton) {
    sendButton.disabled = hideComposerControls;
    sendButton.style.opacity = hideComposerControls ? "0.5" : "";
  }
  const iconWrapper = document.querySelector(".channel-type-icon");
  if (iconWrapper) {
    if (isSchoolSettings) {
      iconWrapper.innerHTML = '<i class="fa-solid fa-gear"></i>';
    } else {
      if (isGrammar) {
        iconWrapper.innerHTML = '<span class="emoji-icon" aria-hidden="true">📝</span>';
      } else {
        iconWrapper.innerHTML = "";
      }
    }
  }
  hideClearCulturePopup();
  updateHeaderLanguageIndicator(ch.id);
  const showLevelButtons = isRestrictedExamGroupChannel(ch);
  if (channelLevelButtons) {
    channelLevelButtons.classList.toggle("hidden", !showLevelButtons);
    channelLevelButtons.setAttribute("aria-hidden", showLevelButtons ? "false" : "true");
  }
  refreshChannelMemberCount(channelId);
  persistLastView({ channelId, threadMessageId: currentThreadMessage?.id || null, threadChannelId: currentThreadChannelId });
  updateLearningMaterialsDocCount(channelId);

  const fallbackStatus =
    normalizeChannelCategory(ch.category) === "classes"
      ? ch.is_public === false
        ? "private"
        : "public"
      : "public";
  refreshChannelHeaderPrivacy(ch.id, fallbackStatus);
  ensureAttendanceButtonInChannelHeader(ch);
}

function applyChannelHeaderPrivacy(status) {
  if (!headerChannelPrivacy) return;
  const normalized = String(status || "public").toLowerCase();
  const isPublic = normalized === "public";
  headerChannelPrivacy.textContent = isPublic ? "Public" : "Private";
  headerChannelPrivacy.classList.toggle("is-public", isPublic);
  headerChannelPrivacy.classList.toggle("is-private", !isPublic);
}

function refreshPrivacyHeaderMeta(channelId) {
  if (!isPrivacyRulesChannel(channelId)) return;
  if (privacyHeaderUpdated) {
    const meta = document.querySelector(".privacy-meta");
    if (meta) {
      privacyHeaderUpdated.textContent = meta.textContent || privacyHeaderUpdated.textContent;
    }
  }
  if (privacyHeaderSchoolName) {
    privacyHeaderSchoolName.textContent = getActiveWorkspaceName();
  }
}

async function refreshChannelHeaderPrivacy(channelId, fallbackStatus = "public") {
  if (!headerChannelPrivacy || !channelId) return;
  const metaChannelId = resolveClassMetaChannelId(channelId);
  const targetChannel = getChannelById(metaChannelId || channelId);
  if (normalizeChannelCategory(targetChannel?.category) !== "classes") {
    applyChannelHeaderPrivacy(fallbackStatus);
    return;
  }
  const meta = await ensureClassMeta(metaChannelId);
  if (meta && meta.status) {
    applyChannelHeaderPrivacy(meta.status);
  } else {
    applyChannelHeaderPrivacy(fallbackStatus);
  }
}

let attendanceState = {
  channelId: null,
  sessionId: null,
  date: null,
  records: [],
  locked: false
};

function isoDateOnlyLocal(date = new Date()) {
  const x = new Date(date);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getActiveChannelIdSafe() {
  if (typeof currentChannelId !== "undefined" && currentChannelId) return String(currentChannelId);
  if (typeof activeChannelId !== "undefined" && activeChannelId) return String(activeChannelId);
  if (typeof selectedChannelId !== "undefined" && selectedChannelId) return String(selectedChannelId);
  if (window.currentChannel?.id) return String(window.currentChannel.id);
  if (window.activeChannel?.id) return String(window.activeChannel.id);
  const header = document.getElementById("chatHeader");
  const domId = header?.dataset?.channelId || header?.getAttribute("data-channel-id");
  return domId ? String(domId) : null;
}

function showAttendanceModal(show) {
  const modal = document.getElementById("attendanceModal");
  if (!modal) return;
  modal.classList.toggle("hidden", !show);
  document.body.classList.toggle("modal-open", show);
}

function renderAttendanceCounts() {
  const el = document.getElementById("attendanceCounts");
  if (!el) return;
  const present = attendanceState.records.filter((r) => r.status === "present").length;
  const absent = attendanceState.records.length - present;
  el.textContent = `Present: ${present} • Absent: ${absent}`;
}

function renderAttendanceList() {
  const list = document.getElementById("attendanceList");
  if (!list) return;
  list.innerHTML = "";

  if (!attendanceState.records.length) {
    list.innerHTML = '<div class="muted">No students found.</div>';
    return;
  }

  attendanceState.records.forEach((record) => {
    const row = document.createElement("div");
    row.className = "att-row";

    const left = document.createElement("div");
    left.className = "att-student";
    left.innerHTML = `
      <div class="att-name">${escapeHtml(record.name || "Student")}</div>
    `;

    const switchLabel = document.createElement("label");
    switchLabel.className = "att-switch";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = record.status === "present";
    input.addEventListener("change", () => {
      record.status = input.checked ? "present" : "absent";
      row.classList.toggle("is-present", input.checked);
      renderAttendanceCounts();
    });
    const slider = document.createElement("span");
    slider.className = "att-switch-slider";
    switchLabel.appendChild(input);
    switchLabel.appendChild(slider);

    row.appendChild(left);
    row.appendChild(switchLabel);
    list.appendChild(row);
  });
}

async function loadAttendanceForChannel(channelId, requestedDate) {
  const status = document.getElementById("attendanceStatus");
  if (status) status.textContent = "Loading attendance...";
  const dateValue = requestedDate || isoDateOnlyLocal();
  try {
    const data = await fetchJSON(`/api/classes/${encodeURIComponent(channelId)}/attendance?date=${encodeURIComponent(dateValue)}`, {
      headers: { "x-user-id": getCurrentUserId() }
    });

    attendanceState = {
      channelId,
      sessionId: data.session_id || null,
      date: data.session_date || dateValue,
      records: (data.records || []).map((r) => ({
        student_user_id: r.student_user_id,
        name: r.name,
        email: r.email,
        status: r.status === "present" ? "present" : "absent"
      }))
    };

    const title = document.getElementById("attendanceTitle");
    if (title) title.textContent = "Attendance";
    const subtitle = document.getElementById("attendanceSubtitle");
    if (subtitle) subtitle.textContent = `${data.channel?.name || "Class"} • ${attendanceState.date}`;
    const checkbox = document.getElementById("attendanceSendEmails");
    if (checkbox && checkbox.checked === false) checkbox.checked = true;

    renderAttendanceList();
    renderAttendanceCounts();
    if (status) status.textContent = "";
    showAttendanceModal(true);
  } catch (error) {
    console.warn("Failed to load attendance", error);
    if (status) status.textContent = "Could not load attendance data.";
    const list = document.getElementById("attendanceList");
    if (list) list.innerHTML = "<div class=\"muted\">Unable to load students.</div>";
    showToast?.("Could not load attendance data.");
  }
}

async function openAttendanceForCurrentClass() {
  const channelId = getActiveChannelIdSafe();
  if (!channelId) {
    showToast?.("No class selected for attendance.");
    return;
  }
  await loadAttendanceForChannel(channelId);
}

async function saveAttendance() {
  if (!attendanceState.channelId) return;
  const status = document.getElementById("attendanceStatus");
  if (status) status.textContent = "Saving...";
  const payload = {
    date: attendanceState.date,
    send_absence_emails: !!document.getElementById("attendanceSendEmails")?.checked,
    records: attendanceState.records.map((r) => ({
      student_user_id: r.student_user_id,
      status: r.status
    }))
  };

  try {
    const data = await fetchJSON(`/api/classes/${encodeURIComponent(attendanceState.channelId)}/attendance/save`, {
      method: "POST",
      headers: {
        "x-user-id": getCurrentUserId(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (status) {
      const emailed = data?.absence_emails?.emailed ?? 0;
      const skipped = data?.absence_emails?.skipped ?? 0;
      status.textContent = `Saved ✅ (emails sent: ${emailed}, skipped: ${skipped})`;
    }
    setTimeout(() => showAttendanceModal(false), 600);
  } catch (error) {
    console.error("Failed to save attendance", error);
    if (status) status.textContent = `Save failed: ${error.message || error}`;
    showToast?.("Could not save attendance.");
  }
}

function wireAttendanceModal() {
  document.getElementById("attendanceCloseBtn")?.addEventListener("click", () => showAttendanceModal(false));
  document.getElementById("attendanceCancelBtn")?.addEventListener("click", () => showAttendanceModal(false));
  document.getElementById("attendanceSaveBtn")?.addEventListener("click", saveAttendance);
  document.getElementById("attendanceModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) {
      showAttendanceModal(false);
    }
  });
}

wireAttendanceModal();

function ensureAttendanceButtonInChannelHeader(ch) {
  const actions = document.querySelector("#chatHeader .header-actions");
  if (!actions) return;
  const normalizedCategory = normalizeChannelCategory(ch?.category);
  const isClass = normalizedCategory === "classes";
  const canManage = isAdminUser() || isTeacherUser();
  const existing = document.getElementById("attendanceHeaderBtn");
  const normalizedChannelName = String(ch?.name || "").trim().toLowerCase();
  const isSchoolTaskChannel = normalizedChannelName === "school task";
  const isTeacherTaskChannel = normalizedChannelName === "teachers task";
  if (isSchoolTaskChannel) {
    if (existing) existing.remove();
    return;
  }
  if (isTeacherTaskChannel) {
    if (existing) existing.remove();
    return;
  }
  if (!isClass || !canManage) {
    if (existing) existing.remove();
    return;
  }
  if (existing) return;
  const btn = document.createElement("button");
  btn.id = "attendanceHeaderBtn";
  btn.type = "button";
  btn.className = "ses-header-btn attendance-header-btn";
  btn.setAttribute("aria-pressed", "false");
  btn.innerHTML = `<i class="fa-solid fa-clipboard-check" aria-hidden="true"></i><span>Attendance</span>`;
  btn.addEventListener("click", openAttendanceForCurrentClass);
  actions.appendChild(btn);
}

function renderDmHeader(dmId) {
  const dm = getDmById(dmId);
  if (!dm) return;
  const label = dmDisplayName(dm) || "Direct Message";
  if (headerChannelName) headerChannelName.textContent = label;
  const memberNames =
    (dmMembersCache[dmId] || [])
      .map((m) => m && (m.name || m.username || m.email))
      .filter(Boolean)
      .join(" | ") || "Direct message";
  if (headerChannelTopic) headerChannelTopic.textContent = memberNames;
  setChannelRoleTabsVisible(false);
  if (bannerChannelName) bannerChannelName.textContent = label;
  if (headerChannelPrivacy) {
    headerChannelPrivacy.textContent = "Private";
    headerChannelPrivacy.classList.add("is-private");
    headerChannelPrivacy.classList.remove("is-public");
  }
  if (channelAddMemberBtn) channelAddMemberBtn.classList.add("hidden");
  if (dmAddMemberBtn) {
    dmAddMemberBtn.classList.toggle("hidden", false);
  }
  syncChannelSearchForChannel(`dm:${dmId}`);
  if (headerStarBtn) headerStarBtn.hidden = true;
  if (headerPinBtn) headerPinBtn.hidden = true;
  if (headerMuteBtn) headerMuteBtn.hidden = true;
  if (headerClearCultureBtn) headerClearCultureBtn.classList.add("hidden");
  persistLastView({ channelId: `dm:${dmId}`, threadMessageId: null, threadChannelId: null });
  hideClearCulturePopup();
}

function updateHeaderLanguageIndicator(channelId) {
  if (!headerChannelLanguageBtn) return;

  const isCulture = isCultureExchangeChannel(channelId);
  headerChannelLanguageBtn.classList.toggle("hidden", !isCulture);
  if (!isCulture) return;

  // ✅ always reflect the viewer's "Read in" language (per user)
  const readLang = getCultureReadLanguage(channelId);
  const label = getCultureLanguageLabel(readLang);

  headerChannelLanguageBtn.innerHTML = `<i class="fa-solid fa-language"></i>${label}`;
  headerChannelLanguageBtn.setAttribute("title", `Reading language: ${label}`);
}


function showCultureReadLanguageModal(currentLang) {
  openLanguageSelectorModal({
    title: "Read messages in",
    selected: currentLang,
    languages: CULTURE_EXCHANGE_LANGUAGES,
    onSelect: (langCode) => {
      setCultureReadLanguage(currentChannelId, langCode);
    }
  });
}

function showClearCulturePopup() {
  if (!headerClearCultureBtn || !clearCulturePopup) return;
  pendingClearCultureChannelId = currentChannelId;
  const rect = headerClearCultureBtn.getBoundingClientRect();
  clearCulturePopup.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;
  clearCulturePopup.style.top = `${rect.bottom + window.scrollY + 8}px`;
  clearCulturePopup.style.right = "auto";
  clearCulturePopup.style.bottom = "auto";
  clearCulturePopup.style.transform = "translate(-50%, 0)";
  clearCulturePopup.classList.remove("hidden");
}

function hideClearCulturePopup() {
  if (!clearCulturePopup) return;
  clearCulturePopup.classList.add("hidden");
  pendingClearCultureChannelId = null;
}

async function handleClearCultureChannel(channelId = currentChannelId) {
  hideClearCulturePopup();
  if (!channelId) return;
  const ch = getChannelById(channelId);
  if (!ch) return;
  if (!isAdminUser()) {
    showToast("Only admins can clear chat.");
    return;
  }

  try {
    await fetchJSON(`/api/channels/${channelId}/messages/clear`, {
      method: "DELETE"
    });
    messagesByChannel[channelId] = [];
    if (!showSavedOnly) {
      renderMessages(channelId);
    }
    showToast("Chat cleared.");
  } catch (err) {
    console.error("Failed to clear Culture Exchange chat", err);
    showToast("Could not clear chat");
  }
}

function openLanguageSelectorModal({
  title = "Select language",
  selected,
  languages = [],
  onSelect
} = {}) {
  if (!Array.isArray(languages) || !languages.length || typeof onSelect !== "function") return;

  const overlay = document.createElement("div");
  overlay.className = "language-selector-overlay";

  const dialog = document.createElement("div");
  dialog.className = "language-selector-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", title);

  const header = document.createElement("div");
  header.className = "language-selector-header";

  const titleEl = document.createElement("span");
  titleEl.className = "language-selector-title";
  titleEl.textContent = title;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "language-selector-close";
  closeBtn.textContent = "Close";

  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  const options = document.createElement("div");
  options.className = "language-selector-options";

  languages.forEach((lang) => {
    const code = String(lang?.code || "").trim().toLowerCase();
    if (!code) return;
    const option = document.createElement("button");
    option.type = "button";
    option.className = "language-selector-option";
    option.textContent = lang.label || code.toUpperCase();
    if (code === (selected || "").trim().toLowerCase()) {
      option.classList.add("is-selected");
    }
    option.addEventListener("click", () => {
      onSelect(code);
      closeModal();
    });
    options.appendChild(option);
  });

  function closeModal() {
    document.removeEventListener("keydown", handleKeyDown);
    if (overlay.isConnected) {
      overlay.remove();
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
    }
  }

  document.addEventListener("keydown", handleKeyDown);
  closeBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeModal();
    }
  });

  dialog.appendChild(header);
  dialog.appendChild(options);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add("language-selector-overlay-visible");
  });
}



function messageMatchesTerm(msg, channelId, normalizedTerm) {
  if (!normalizedTerm) return true;
  const author = String(msg.author || "").toLowerCase();
  const nick = (resolveNicknameForMessage(msg, channelId) || "").toLowerCase();
  const text = String(msg.text || msg.alt || "").toLowerCase();
  const haystack = `${author} ${nick} ${text}`;
  return haystack.includes(normalizedTerm);
}

function isCultureExchangeChannel(channelOrId) {
  if (!channelOrId) return false;
  const ch = typeof channelOrId === "string" ? getChannelById(channelOrId) : channelOrId;
  if (!ch) return false;
  const name = String(ch.name || "").trim().toLowerCase();
  const category = String(ch.category || "").trim().toLowerCase();
  const topic = String(ch.topic || "").trim().toLowerCase();
  if (name.includes("culture exchange") || name.includes("cultural exchange")) return true;
  if (category === "clubs" && name.includes("culture")) return true;
  if (topic.includes("culture exchange") || topic.includes("cultural exchange")) return true;
  return false;
}

function splitMessageTextAndAttachments(html = "") {
  const raw = String(html || "");
  const marker = '<div class="att-card';
  const index = raw.indexOf(marker);
  if (index === -1) {
    return { textOnlyHtml: raw, attachmentsHtml: "" };
  }
  return {
    textOnlyHtml: raw.slice(0, index),
    attachmentsHtml: raw.slice(index)
  };
}

function extractPlainTextFromHtml(html = "") {
  const tmp = document.createElement("div");
  tmp.innerHTML = String(html || "");

  // Remove dangerous/unwanted nodes
  tmp.querySelectorAll("script,style,noscript").forEach((n) => n.remove());

  // Turn <br> into newlines
  tmp.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));

  // Turn block tags into newlines (better paragraph handling)
  tmp.querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6").forEach((el) => {
    // add newline after each block if it has text
    if ((el.textContent || "").trim()) {
      el.appendChild(document.createTextNode("\n"));
    }
  });

  // Get plain text and normalize whitespace
  return (tmp.textContent || "")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


async function requestCultureTranslation({
  messageId,
  plainText,
  sourceLang,
  targetLang,
  channelId
}) {
  if (!messageId || !plainText) return null;
  const normalizedSource = normalizeCultureLanguageCode(sourceLang || "en");
  const normalizedTarget = normalizeCultureLanguageCode(targetLang || "en");
  if (!normalizedSource || !normalizedTarget || normalizedSource === normalizedTarget) return null;
  if (!channelId) return null;
  const translationKey = `${channelId}:${messageId}|${normalizedTarget}`;
  if (cultureTranslationCache.has(translationKey) || cultureTranslationPending.has(translationKey)) return null;
  cultureTranslationPending.add(translationKey);
  try {
    const res = await fetchJSON("/api/translate", {
      method: "POST",
      body: JSON.stringify({
        messageId,
        text: plainText,
        sourceLang: normalizedSource,
        targetLang: normalizedTarget
      })
    });
    const translated = String(res?.translatedText || "").trim();
    if (translated) {
      cultureTranslationCache.set(translationKey, translated);
      if (channelId && channelId === currentChannelId) {
        renderMessages(channelId, { restoreScroll: true });
      }
      return translated;
    }
    return null;
  } catch (err) {
    console.error("Translation fetch failed", err);
    return null;
  } finally {
    cultureTranslationPending.delete(translationKey);
  }
}


function renderMessages(channelId, options = {}) {
  if (!messagesContainer) return;
  if (directoryViewRole) return;
  if (isWordmeaningChannel(channelId)) {
    messagesContainer.innerHTML = renderWordmeaningTable();
    return;
  }
  const channelInfo = getChannelById(channelId);
  const normalizedChannelNameInitial = String(channelInfo?.name || "").trim().toLowerCase();
  if (isAnnouncementChannel(channelId)) {
    renderAnnouncementChannel(channelId, options);
    return;
  }
  showSavedOnly = false;
  const normalizedChannelName = normalizedChannelNameInitial;
  const isSchoolTaskChannel = normalizedChannelName === "school task";
  const isTeacherTaskChannel = normalizedChannelName === "teachers task";
  const isTaskStyleChannel = isSchoolTaskChannel || isTeacherTaskChannel;
  messagesContainer.classList.toggle("school-task-chat", isSchoolTaskChannel);
  messagesContainer.classList.toggle("teachers-task-chat", isTeacherTaskChannel);
  const isMaterialsChannel = normalizedChannelName === "learning materials";
  const canManageMaterialPdfs = isMaterialsChannel && (isAdminUser() || isTeacherUser());
  const { restoreScroll = true } = options;
  const prevScrollTop = messagesContainer.scrollTop;
  const savedScrollTop =
    channelId && typeof scrollState[channelId] === "number"
      ? scrollState[channelId]
      : null;

  const msgs = messagesByChannel[channelId] || [];
  const term = (channelSearchTerms[String(channelId)] || "").trim();
  const normalizedTerm = term.toLowerCase();
  const filtered = normalizedTerm
    ? msgs.filter((msg) => messageMatchesTerm(msg, channelId, normalizedTerm))
    : msgs;
  const isHomework = isHomeworkChannel(channelId);
  const considerContinuation = !isTaskStyleChannel;
  const meCandidates = [
    sessionUser?.name,
    sessionUser?.username,
    sessionUser?.email
  ]
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());
  const visibleMessages =
    isHomework && isStudentUser()
      ? filtered.filter((msg) => {
          const author = String(msg.author || "").trim().toLowerCase();
          return !!author && meCandidates.includes(author);
        })
      : filtered;
  messagesContainer.innerHTML = "";
  const normalizeAuthor = (a) => (a ? String(a).trim().toLowerCase() : "");
  let prevGroupAuthor = null;
  let prevDateKey = null;
  const continuationGroups = new Map();
  let currentContinuationRootId = null;
  let continuationGroupCounter = 0;
  let taskMessageCounter = 0;

  const setContinuationVisibility = (group, visible) => {
    if (!group) return;
    group.rows.forEach((row) => {
      row.classList.toggle("continuation-hidden", !visible);
      row.classList.toggle("continuation-visible", visible);
      if (visible) {
        row.removeAttribute("aria-hidden");
      } else {
        row.setAttribute("aria-hidden", "true");
      }
    });
  };

  const updateContinuationLabel = (group) => {
    if (!group) return;
    if (!group.toggleBtn) return;
    const count = group.rows.length;
    if (count === 0) {
      group.toggleBtn.classList.add("hidden");
      return;
    }
    group.toggleBtn.classList.remove("hidden");
    const verb = group.expanded ? "Hide" : "Show";
    const suffix = count === 1 ? " message" : " messages";
    group.toggleBtn.textContent = `${verb} ${count}${suffix}`;
    group.toggleBtn.setAttribute("aria-expanded", group.expanded ? "true" : "false");
  };

  const lastReadIndex =
    typeof lastReadIndexByChannel[channelId] === "number"
      ? lastReadIndexByChannel[channelId]
      : null;
  let newDividerInserted = false;
    const cultureChannelActive = isCultureExchangeChannel(channelId);
  console.log("[ReadLang] render ->", {
    channelId,
    culture: cultureChannelActive,
    viewer: cultureChannelActive ? getCultureReadLanguage(channelId) : null
  });


  visibleMessages.forEach((msg, index) => {
    const timestampRaw =
      msg.createdAt ||
      msg.created_at ||
      msg.timestamp ||
      msg.ts ||
      msg.time ||
      "";
    const parsedDate = parseChatDate(timestampRaw);
    const dayKey = parsedDate ? parsedDate.toDateString() : "";
    if (dayKey && dayKey !== prevDateKey) {
      const separator = document.createElement("div");
      separator.className = "date-separator";
      separator.textContent = formatRelativeDay(parsedDate);
      messagesContainer.appendChild(separator);
      prevDateKey = dayKey;
    }

    // Insert "New" divider before the first unread message
    if (
      !newDividerInserted &&
      lastReadIndex !== null &&
      index === lastReadIndex + 1
    ) {
      const divider = document.createElement("div");
      divider.className = "new-divider";
      divider.innerHTML = "<span>New</span>";
      messagesContainer.appendChild(divider);
      newDividerInserted = true;
    }

    const resolvedRoleRaw = msg.role || resolveUserRole(msg.author, msg.initials);
    const displayRole = getMessageRoleDisplay(msg, isMaterialsChannel, resolvedRoleRaw);
    const normalizedAuthorName = normalizeAuthor(msg.author);
    const isContinuationGroup =
      considerContinuation &&
      normalizedAuthorName &&
      prevGroupAuthor &&
      normalizedAuthorName === prevGroupAuthor;
    let group = null;
    if (considerContinuation) {
      if (!isContinuationGroup) {
        continuationGroupCounter += 1;
        currentContinuationRootId = `continuation-${continuationGroupCounter}`;
        group = {
          rows: [],
          expanded: true,
          toggleBtn: null
        };
        continuationGroups.set(currentContinuationRootId, group);
      } else if (currentContinuationRootId) {
        group = continuationGroups.get(currentContinuationRootId);
      }
    }
    const isPolicyDocument =
      typeof msg.text === "string" &&
      (msg.text.includes("policy-doc") || msg.text.includes("privacy-rules")) &&
      String(msg.author || "").toLowerCase() === "system";
    const shouldShowHeader = !isPolicyDocument && !isContinuationGroup;

    const text = document.createElement("div");
    text.className = "message-text";
    const rawTextHtml = msg.text || "";
    const { textOnlyHtml, attachmentsHtml } = splitMessageTextAndAttachments(rawTextHtml);
    const originalLang = normalizeCultureLanguageCode(
      msg.originalLanguage || msg.language || "en"
    ) || "en";
    const viewerCultureLang = cultureChannelActive
      ? getCultureReadLanguage(channelId)
      : null;

    const serverHasTranslation =
      typeof msg.displayText === "string" && msg.displayText.trim() !== "";
    const serverTranslationReady = String(msg.translationStatus || "").toLowerCase() === "ready";
    const serverDisplayText = serverHasTranslation && serverTranslationReady ? msg.displayText : null;
    const plainTextForTranslation = extractPlainTextFromHtml(textOnlyHtml).trim();

    const needsTranslation =
      cultureChannelActive &&
      viewerCultureLang &&
      originalLang &&
      viewerCultureLang !== originalLang;


    const messageKey = `${channelId}:${msg.id}`;
    let translationRow = null;
    let translationToggle = null;
    const translationKey = `${messageKey}|${viewerCultureLang}`;
    if (serverDisplayText && viewerCultureLang) {
      cultureTranslationCache.set(translationKey, serverDisplayText);
    }

    const applyCultureMessageText = (showOriginal) => {
    if (showOriginal || !needsTranslation) {
      text.innerHTML = `${sanitizeMessageHTML(textOnlyHtml)}${attachmentsHtml}`;
    } else {
      const cachedText = serverDisplayText || cultureTranslationCache.get(translationKey);
      console.log('[TranslateDisplay]', {
        messageKey,
        channelId,
        showOriginal,
        needsTranslation,
        translationReady: !!cachedText
      });
      if (cachedText) {
        text.innerHTML =
          `<div class="culture-translated-text">${plainToSafeHtml(cachedText)}</div>` +
          attachmentsHtml;
      } else {
        text.innerHTML =
          `<div class="culture-translated-text muted">Translating…</div>` +
          attachmentsHtml;
          requestCultureTranslation({
            channelId,
            msg,
            from: originalLang,
            to: viewerCultureLang,
            plainText: plainTextForTranslation
          });
        }
      }
      hydrateEmojiImages(text);
      upgradeAttachments(text);
      hydratePdfThumbs(text);
      hydratePdfStats(text);
      setupPdfCardDeleteControls(text, msg, channelId, isMaterialsChannel, canManageMaterialPdfs);
      annotateAudioCards(text, msg.id, channelId);
      setupAudioCardOptions(text);
      if (translationToggle) {
        const translationReady = translationKey && cultureTranslationCache.has(translationKey);
        translationToggle.innerHTML = !translationReady
          ? `<span class="translation-spinner" aria-hidden="true"></span><span class="translation-label">Translating…</span>`
          : showOriginal
          ? `<i class="fa-solid fa-language"></i><span>View translation</span>`
          : `<i class="fa-regular fa-eye"></i><span>View original</span>`;
        translationToggle.setAttribute("aria-pressed", showOriginal ? "true" : "false");
      }
    };

    let translationControls = null;
    if (needsTranslation) {
      translationToggle = document.createElement("button");
      translationToggle.type = "button";
      translationToggle.className = "message-translation-toggle";
      translationControls = document.createElement("div");
      translationControls.className = "message-translation-row message-translation-controls";
      translationControls.appendChild(translationToggle);

      if (!cultureTranslationState.has(messageKey)) {
        cultureTranslationState.set(messageKey, false); // false = show translation
      }

      translationToggle.addEventListener("click", () => {
        const showOriginal = !!cultureTranslationState.get(messageKey);
        const next = !showOriginal;
        cultureTranslationState.set(messageKey, next);
        applyCultureMessageText(next);
      });


      if (String(msg.translationStatus || "") === "failed") {
        const fail = document.createElement("span");
        fail.className = "message-translation-failed";
        fail.textContent = "Translation unavailable";
        translationControls.appendChild(fail);
      }

      applyCultureMessageText(cultureTranslationState.get(messageKey));
    } else {
      applyCultureMessageText(false);

    }
    const hasAudioCard = !!text.querySelector(".att-card.att-card-audio");
    if (isMaterialsChannel) {
      text.classList.add("message-text-grid");
    }

    const row = document.createElement("div");
    row.className = "message-row";
    const isMe =
      String(msg.userId || msg.user_id || "").toLowerCase() ===
      String(sessionUser?.id || "").toLowerCase();
    row.classList.add(isMe ? "from-me" : "from-others");
    if (hasAudioCard) row.classList.add("row-with-audio-card");
    row.dataset.messageId = msg.id;
    row.setAttribute("role", "article");
    row.setAttribute("tabindex", "0");
    row.setAttribute(
      "aria-label",
      `Message from ${msg.author || "Unknown"}${msg.time ? ` at ${msg.time}` : ""}`
    );
    row.addEventListener("keydown", (e) => {
      if (!messagesContainer) return;
      const rows = Array.from(messagesContainer.querySelectorAll(".message-row"));
      const idx = rows.indexOf(row);
      if (idx === -1) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = rows[idx + 1];
        if (next) next.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = rows[idx - 1];
        if (prev) prev.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        if (rows[0]) rows[0].focus();
      } else if (e.key === "End") {
        e.preventDefault();
        if (rows[rows.length - 1]) rows[rows.length - 1].focus();
      }
    });
    row.classList.toggle("message-row-continued", isContinuationGroup);

    // avatar column
    const avatarCol = document.createElement("div");
    avatarCol.className = "message-avatar";
    const avatar = document.createElement("div");
    avatar.className = "avatar avatar-md";
    const msgAvatar = msg.avatarUrl || resolveAvatarUrl(msg.author, msg.initials);
    setAvatarPresence(
      avatar,
      msg.userId || msg.authorId || msg.user_id || "",
      msg.author
    );
    const msgRole = displayRole || resolvedRoleRaw;
    applyAvatarToNode(avatar, msg.initials, msgAvatar, msg.author, msgRole);
    avatarCol.appendChild(avatar);

    // bubble
    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    let bubbleContentTarget = bubble;
    let schoolTaskAvatarWrap = null;
    if (isTaskStyleChannel) {
      const bubbleContent = document.createElement("div");
      bubbleContent.className = "school-task-bubble-content";
      schoolTaskAvatarWrap = document.createElement("div");
      schoolTaskAvatarWrap.className = "school-task-avatar-wrap";
      schoolTaskAvatarWrap.appendChild(avatar);
      bubble.appendChild(schoolTaskAvatarWrap);
      bubble.appendChild(bubbleContent);
      bubbleContentTarget = bubbleContent;
    }
    const avatarDisplayTarget =
      isTaskStyleChannel && schoolTaskAvatarWrap ? schoolTaskAvatarWrap : avatarCol;
    if (isPolicyDocument && avatarDisplayTarget) {
      avatarDisplayTarget.classList.add("message-avatar-hidden");
    }
    if (isContinuationGroup && avatarDisplayTarget) {
      avatarDisplayTarget.classList.add("message-avatar-hidden");
    }
    if (hasAudioCard) {
      bubble.classList.add("message-with-audio-card");
    }
    if (isContinuationGroup) bubble.classList.add("message-bubble-continued");
    if (msg.alt) bubble.classList.add("message-bubble-alt");

    const isAdminOrTeacher = isAdminUser() || isTeacherUser();


    const timestampParts = getMessageTimestampParts(msg);
    let header = null;
    let timeEl = null;
    if (!isPolicyDocument) {
      header = document.createElement("div");
      header.className = "message-header";
        const author = document.createElement("span");
        author.className = "message-author user-link";
        author.textContent = msg.author;
      author.style.cursor = "pointer";
      const tooltipParts = [msg.author];
      if (displayRole) tooltipParts.push(displayRole);
      author.setAttribute("title", tooltipParts.filter(Boolean).join(" • "));
      author.addEventListener("click", () => {
        openUserProfile(msg.author, msg.avatarUrl, msg);
      });
      header.appendChild(author);

      const roleBadge = document.createElement("span");
      roleBadge.className = "message-role-badge";
      applyRoleLabel(roleBadge, displayRole);
      if (roleBadge.textContent) {
        header.appendChild(roleBadge);
      }

      timeEl = document.createElement("span");
      timeEl.className = "message-time";
      timeEl.textContent = timestampParts.time || "";
      if (timeEl.textContent) {
        appendHeaderSegment(header, timeEl);
      }
      if (cultureChannelActive) {
        const badge = document.createElement("span");
        badge.className = "culture-badge";

        const originalPlain = extractPlainTextFromHtml(textOnlyHtml).trim();
        const hasTranslation =
          typeof msg.displayText === "string" &&
          msg.displayText.trim() &&
          originalPlain !== msg.displayText.trim();

        badge.innerHTML = hasTranslation
          ? `<i class="fa-solid fa-language"></i><span>Translated</span>`
          : `<i class="fa-solid fa-globe"></i><span>Culture</span>`;
        badge.title = `Original: ${getCultureLanguageLabel(originalLang)}`;
        appendHeaderSegment(header, badge);
      }
    }

  const stats = getThreadStats(channelId, msg.id);
  let replyPreview = null;
  if (stats) {
    replyPreview = document.createElement("div");
    replyPreview.className = "reply-preview";
    replyPreview.innerHTML = `
      <span>${stats.count} ${stats.count === 1 ? "reply" : "replies"}</span>
      <span class="muted">• last reply ${stats.lastDateLabel ? `${stats.lastDateLabel} ` : ""}${stats.lastTime || ""}</span>
    `;
    replyPreview.addEventListener("click", () => openThread(channelId, msg.id));
  }

    if (!isPolicyDocument) {
      const actions = document.createElement("div");
      actions.className = "message-actions";
      const canDeleteMessage = canModifyMessage(msg) || isAdminOrTeacher;

      const pinBtn = document.createElement("button");
      pinBtn.className = "message-action-btn";
      pinBtn.innerHTML = '<i class="fa-regular fa-bookmark"></i>';
      pinBtn.title = "Save message";
      pinBtn.setAttribute("aria-label", "Save message");
      if (isMessageSaved(msg.id)) {
        pinBtn.classList.add("message-action-btn-saved");
      }
      pinBtn.addEventListener("click", () => {
        toggleSaveMessage(channelId, msg);
        if (isMessageSaved(msg.id)) {
          pinBtn.classList.add("message-action-btn-saved");
        } else {
          pinBtn.classList.remove("message-action-btn-saved");
        }
      });

      const pinMsgBtn = document.createElement("button");
      pinMsgBtn.className = "message-action-btn";
      pinMsgBtn.innerHTML = '<i class="fa-solid fa-thumbtack"></i>';
      pinMsgBtn.title = "Pin message";
      pinMsgBtn.setAttribute("aria-label", "Pin message");

      pinMsgBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const inThreadMode = !!activeThreadParentId;
        const scope = inThreadMode ? "thread" : "channel";
        const tKey = inThreadMode ? makeThreadKey(channelId, activeThreadParentId) : "";

        const pinned = togglePinMessage({
          type: "message",
          scope,
          channelId: String(channelId),
          threadKey: tKey,
          messageId: String(msg.id),
          author: msg.author || "",
          time: msg.time || "",
          text: msg.text || "",
          ts: Date.now()
        });

        notifyPinned(
          pinned
            ? scope === "thread"
              ? "Pinned in chat"
              : "Pinned in channel"
            : scope === "thread"
            ? "Unpinned from chat"
            : "Unpinned from channel",
          msg
        );
        renderPinnedSidebar();
      });

      actions.appendChild(pinBtn);
      actions.appendChild(pinMsgBtn);
      if (isAdminOrTeacher) {
        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "message-action-btn";
        copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>';
        copyBtn.title = "Copy link";
        copyBtn.setAttribute("aria-label", "Copy link");
        copyBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          copyMessageLink(channelId, msg.id);
        });
        const shareBtn = document.createElement("button");
        shareBtn.type = "button";
        shareBtn.className = "message-action-btn";
        shareBtn.innerHTML = '<i class="fa-solid fa-share-nodes"></i>';
        shareBtn.title = "Share link";
        shareBtn.setAttribute("aria-label", "Share link");
        shareBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          shareMessageLink(channelId, msg.id);
        });
        actions.appendChild(copyBtn);
        actions.appendChild(shareBtn);
      }
      if (canModifyMessage(msg)) {
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "message-action-btn";
        editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
        editBtn.title = "Edit message";
        editBtn.setAttribute("aria-label", "Edit message");
        editBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          startInlineEdit(msg, bubble, channelId);
        });
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "message-action-btn";
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        deleteBtn.title = "Delete message";
        deleteBtn.setAttribute("aria-label", "Delete message");
        deleteBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const ok = confirm("Delete this message?");
          if (!ok) return;
          try {
            await deleteMessage(msg.id);
          } catch (err) {
            console.error("Failed to delete message", err);
            showToast(err && err.message ? err.message : "Could not delete message");
          }
        });
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
      } else if (canDeleteMessage) {
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "message-action-btn";
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        deleteBtn.title = "Delete message";
        deleteBtn.setAttribute("aria-label", "Delete message");
        deleteBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const ok = confirm("Delete this message?");
          if (!ok) return;
          try {
            await deleteMessage(msg.id);
          } catch (err) {
            console.error("Failed to delete message", err);
            showToast(err && err.message ? err.message : "Could not delete message");
          }
        });
        actions.appendChild(deleteBtn);
      }
      bubbleContentTarget.appendChild(actions);

      const reactionSize = isMaterialsChannel ? 36 : 24;
      const reactionsWrap = buildReactionChips(
        msg.reactions || [],
        (emoji) => addReactionToMessage(msg.id, emoji),
        reactionSize
      );
      const hasReactions = reactionsWrap && reactionsWrap.children.length > 0;
      const commenters = buildCommenterAvatars(msg);

      const reactBtn = document.createElement("button");
      reactBtn.className = "message-action-btn";
      reactBtn.classList.add("emoji-trigger");
      reactBtn.innerHTML = '<i class="fa-regular fa-face-laugh-beam"></i>';
      reactBtn.title = "Add reaction";
      reactBtn.setAttribute("aria-label", "Add reaction");
      reactBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openEmojiPicker("message-reaction", msg.id);
      });

      const replyBtn = document.createElement("button");
      replyBtn.className = "message-action-btn message-action-reply message-replay-btn";
      replyBtn.innerHTML = '<i class="far fa-comment"></i>';
      replyBtn.title = "Reply in thread";
      replyBtn.setAttribute("aria-label", "Reply in thread");
      replyBtn.addEventListener("click", () => {
        try {
          openThread(channelId, msg.id);
        } catch (err) {
          console.error("openThread crashed:", err);
          showToast("Could not open thread. Please try again.");
          closeThread();
        }
      });

      const footerActions = document.createElement("div");
      footerActions.className = "message-footer-actions";
      if (hasReactions) footerActions.appendChild(reactionsWrap);
      let emojiShortcutRow = null;
      if (isTaskStyleChannel) {
        emojiShortcutRow = document.createElement("div");
        emojiShortcutRow.className = "message-emoji-shortcuts";
        ["✅", "👍", "😂"].forEach((emoji) => {
          const chip = document.createElement("span");
          chip.className = "message-emoji-shortcut";
          chip.textContent = emoji;
          chip.setAttribute("role", "button");
          chip.setAttribute("tabindex", "0");
          chip.setAttribute("aria-label", `React with ${emoji}`);
          chip.addEventListener("click", (event) => {
            event.stopPropagation();
            if (!msg.id) return;
            addReactionToMessage(msg.id, emoji);
          });
          chip.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              chip.click();
            }
          });
          emojiShortcutRow.appendChild(chip);
        });
        footerActions.appendChild(emojiShortcutRow);
      }
      const reactActionPill = document.createElement("div");
      reactActionPill.className = "message-action-pill message-react-pill";
      reactActionPill.appendChild(reactBtn);
      const replyActionPill = document.createElement("div");
      replyActionPill.className = "message-action-pill message-reply-pill";
      replyActionPill.appendChild(replyBtn);
      footerActions.appendChild(reactActionPill);
      footerActions.appendChild(replyActionPill);

      const footer = document.createElement("div");
      footer.className = "message-footer";
      footer.appendChild(footerActions);
      if (commenters) footer.appendChild(commenters);

      if (translationControls && header) {
        header.appendChild(translationControls);
      }
      if (considerContinuation) {
        const continuationGroup = continuationGroups.get(currentContinuationRootId);
        if (continuationGroup && header) {
          if (!continuationGroup.toggleBtn) {
            const toggleBtn = document.createElement("button");
            toggleBtn.type = "button";
            toggleBtn.className = "continuation-toggle hidden";
            toggleBtn.setAttribute("aria-expanded", "false");
            toggleBtn.setAttribute(
              "aria-label",
              "Toggle visibility of additional messages from this user"
            );
            toggleBtn.addEventListener("click", (event) => {
              event.stopPropagation();
              continuationGroup.expanded = !continuationGroup.expanded;
              setContinuationVisibility(continuationGroup, continuationGroup.expanded);
              updateContinuationLabel(continuationGroup);
            });
            continuationGroup.toggleBtn = toggleBtn;
          }
          header.appendChild(continuationGroup.toggleBtn);
        }
      }
      if (shouldShowHeader && header) {
        bubbleContentTarget.appendChild(header);
      }
      if (!shouldShowHeader && translationControls) {
        bubbleContentTarget.appendChild(translationControls);
      }
      if (isContinuationGroup && timeEl?.textContent) {
        const timeInline = document.createElement("div");
        timeInline.className = "message-time-inline";
        timeInline.textContent = timestampParts.time;
        bubbleContentTarget.appendChild(timeInline);
      }
      if (replyPreview) bubbleContentTarget.appendChild(replyPreview);
      bubbleContentTarget.appendChild(text);
      if (translationRow) {
        bubbleContentTarget.appendChild(translationRow);
      }
      if (footer.children.length) {
        bubbleContentTarget.appendChild(footer);
      }
    } else {
      bubbleContentTarget.appendChild(text);
    }

    if (isContinuationGroup && group) {
      row.classList.add("continuation-hidden");
      row.setAttribute("aria-hidden", "true");
      row.dataset.continuationRootId = currentContinuationRootId;
      group.rows.push(row);
      setContinuationVisibility(group, group.expanded);
      updateContinuationLabel(group);
    }
    if (!isTaskStyleChannel) {
      row.appendChild(avatarCol);
    }
    row.appendChild(bubble);
    messagesContainer.appendChild(row);
    if (isTaskStyleChannel) {
      taskMessageCounter += 1;
      if (
        taskMessageCounter % 3 === 0 &&
        index < visibleMessages.length - 1
      ) {
        const divider = document.createElement("div");
        divider.className = "school-task-divider";
        divider.setAttribute("role", "separator");
        divider.setAttribute("aria-hidden", "true");
        messagesContainer.appendChild(divider);
      }
    }

    prevGroupAuthor = normalizedAuthorName;
  });

  renderUniversalEmptyState(channelId, msgs.length);

  if (isPolicyAcceptanceRequired() && !policyAccepted && isPrivacyRulesChannel(channelId)) {
    renderPolicyAcceptanceCard(messagesContainer);
  }

  if (restoreScroll) {
    if (isRestoringView && savedScrollTop !== null) {
      messagesContainer.scrollTop = savedScrollTop;
    } else if (typeof prevScrollTop === "number") {
      messagesContainer.scrollTop = prevScrollTop;
    } else if (savedScrollTop !== null) {
      messagesContainer.scrollTop = savedScrollTop;
    }
  }
  // keep current scroll position; do not force scroll to bottom
  try {
    const msgs = (messagesByChannel && messagesByChannel[channelId]) ? messagesByChannel[channelId] : [];
    seedPlannerFromHomeworkMessages(channelId, msgs);
  } catch (e) {
    console.error("planner seed failed", e);
  }
  try {
    if (isClassChannel(channelId)) {
      const scheduleText = loadScheduleTextForClass(channelId);
      if (scheduleText) seedPlannerFromClassSchedule(channelId, scheduleText, { weeks: 16 });
    }
  } catch (e) {
    console.error("planner schedule seed failed", e);
  }
  hydratePdfThumbs(messagesContainer);
  hydratePdfStats(messagesContainer);
  bindPdfMiniCardClicks(messagesContainer);
  updateLearningMaterialsDocCount(isMaterialsChannel ? channelId : null);
  hydrateEmojiImages(messagesContainer);

}

function renderSavedMessages() {
  if (!messagesContainer) return;
  messagesContainer.classList.remove("school-task-chat");
  messagesContainer.classList.remove("teachers-task-chat");
  messagesContainer.innerHTML = "";

  const savedList = Object.values(savedMessagesById);
  if (!savedList.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No saved messages yet.";
    messagesContainer.appendChild(empty);
    return;
  }

  savedList.forEach((entry) => {
    const { channelId, channelName, message } = entry;
    const row = document.createElement("div");
    row.className = "message-row";
    row.dataset.messageId = message.id;
    row.setAttribute("role", "article");
    row.setAttribute("tabindex", "0");
    row.setAttribute(
      "aria-label",
      `Message from ${message.author || "Unknown"}${message.time ? ` at ${message.time}` : ""}`
    );
    row.addEventListener("keydown", (e) => {
      if (!messagesContainer) return;
      const rows = Array.from(messagesContainer.querySelectorAll(".message-row"));
      const idx = rows.indexOf(row);
      if (idx === -1) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = rows[idx + 1];
        if (next) next.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = rows[idx - 1];
        if (prev) prev.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        if (rows[0]) rows[0].focus();
      } else if (e.key === "End") {
        e.preventDefault();
        if (rows[rows.length - 1]) rows[rows.length - 1].focus();
      }
    });

    const avatarCol = document.createElement("div");
    avatarCol.className = "message-avatar";
    const avatar = document.createElement("div");
    avatar.className = "avatar avatar-md";
    const savedAvatar = message.avatarUrl || resolveAvatarUrl(message.author, message.initials);
    setAvatarPresence(
      avatar,
      message.userId || message.authorId || message.user_id || "",
      message.author
    );
    const savedRole = message.role || resolveUserRole(message.author, message.initials);
    applyAvatarToNode(avatar, message.initials, savedAvatar, message.author, savedRole);
    avatarCol.appendChild(avatar);

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    if (message.alt) bubble.classList.add("message-bubble-alt");

    // options button (three dots) top-right
    const optionsWrap = document.createElement("div");
    optionsWrap.className = "message-options";
    const menu = document.createElement("div");
    menu.className = "message-options-menu";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "message-option-btn";
    copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>';
    copyBtn.title = "Copy link";
    copyBtn.setAttribute("aria-label", "Copy link");
    copyBtn.addEventListener("click", () => {
      copyMessageLink(channelId, message.id);
      closeAllMessageMenus();
    });

    const shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.className = "message-option-btn";
    shareBtn.innerHTML = '<i class="fa-solid fa-share-nodes"></i>';
    shareBtn.title = "Share";
    shareBtn.setAttribute("aria-label", "Share link");
    shareBtn.addEventListener("click", () => {
      shareMessageLink(channelId, message.id);
      closeAllMessageMenus();
    });
    menu.appendChild(copyBtn);
    menu.appendChild(shareBtn);

    const optBtn = document.createElement("button");
    optBtn.type = "button";
    optBtn.className = "message-option-btn";
    optBtn.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>';
    optBtn.title = "More options";
    optBtn.setAttribute("aria-label", "More options");
    optBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasOpen = optionsWrap.classList.contains("open");
      closeAllMessageMenus();
      if (!wasOpen) optionsWrap.classList.add("open");
    });
    optionsWrap.appendChild(menu);
    optionsWrap.appendChild(optBtn);
    bubble.appendChild(optionsWrap);

    const header = document.createElement("div");
    header.className = "message-header";

    const author = document.createElement("span");
    author.className = "message-author";
    author.textContent = message.author;

    const resolvedRoleRaw = message.role || resolveUserRole(message.author, message.initials);
    const savedDisplayRole = getMessageRoleDisplay(message, false, resolvedRoleRaw);
    const savedStatusEl = document.createElement("span");
    savedStatusEl.className = "message-nick";
    applyRoleLabel(savedStatusEl, savedDisplayRole || resolvedRoleRaw);

    const timestampParts = getMessageTimestampParts(message);
    const timeEl = document.createElement("span");
    timeEl.className = "message-time";
    timeEl.textContent = timestampParts.time || "";
    const dateEl = document.createElement("span");
    dateEl.className = "message-date";
    dateEl.textContent = timestampParts.dateLabel || "";

    const channelLabel = channelName ? `#${channelName}` : channelId ? `#${channelId}` : "";
    const showChannelLabel = !isSpeakingClubChannel(channelId);
    const channelEl = document.createElement("span");
    channelEl.className = "message-channel";
    channelEl.textContent = channelLabel;

    header.appendChild(author);
    if (savedStatusEl.textContent?.trim()) appendHeaderSegment(header, savedStatusEl);
    if (timeEl.textContent) appendHeaderSegment(header, timeEl);
    if (dateEl.textContent) appendHeaderSegment(header, dateEl);
    if (channelEl.textContent) appendHeaderSegment(header, channelEl);


    const text = document.createElement("div");
    text.className = "message-text";
    text.innerHTML = message.text;
    hydrateEmojiImages(text);
    annotateAudioCards(text, message.id, channelId);
    setupAudioCardOptions(text);
    const hasAudioCard = !!text.querySelector(".att-card.att-card-audio");
    if (hasAudioCard) {
      bubble.classList.add("message-with-audio-card");
      row.classList.add("row-with-audio-card");
    }

    const footer = document.createElement("div");
    footer.className = "message-footer";

    const reactionsWrap = buildReactionChips(message.reactions || []);
    const actions = document.createElement("div");
    actions.className = "message-actions";

    const unsaveBtn = document.createElement("button");
    unsaveBtn.className = "message-action-btn";
    unsaveBtn.innerHTML = '<i class="fa-regular fa-bookmark"></i>';
    unsaveBtn.title = "Remove from saved";
    unsaveBtn.setAttribute("aria-label", "Remove from saved");
    unsaveBtn.addEventListener("click", () => {
      toggleSaveMessage(channelId, message);
    });

    const reactBtn = document.createElement("button");
    reactBtn.className = "message-action-btn";
    reactBtn.classList.add("emoji-trigger");
    reactBtn.innerHTML = '<i class="fa-regular fa-face-smile"></i>';
    reactBtn.title = "Add reaction";
    reactBtn.setAttribute("aria-label", "Add reaction");
    reactBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openEmojiPicker("message-reaction", message.id);
      currentChannelId = channelId;
    });

    actions.appendChild(reactBtn);
    actions.appendChild(unsaveBtn);
    const footerRight = document.createElement("div");
    footerRight.className = "message-footer-right";
    footerRight.appendChild(actions);
    const commenters = buildCommenterAvatars(message);
    if (commenters) footerRight.appendChild(commenters);

    footer.appendChild(reactionsWrap);
    footer.appendChild(footerRight);

    bubble.appendChild(header);
    bubble.appendChild(text);
    bubble.appendChild(footer);

    row.appendChild(avatarCol);
    row.appendChild(bubble);
  messagesContainer.appendChild(row);
  });

  // keep current scroll position; do not force scroll to bottom
  upgradeAttachments(messagesContainer);
  hydratePdfThumbs(messagesContainer);
  hydratePdfStats(messagesContainer);
  enhanceAttachments(messagesContainer);
  setupAudioCardOptions(messagesContainer);
  restoreScrollForChannel(channelId);
  refreshPrivacyHeaderMeta(channelId);
}

// ===================== CHANNEL SELECTION =====================

async function selectChannel(channelId) {
  collapseClassSettingsView();
  if (
    !policyRedirecting &&
    isPolicyAcceptanceRequired() &&
    !policyAccepted &&
    !isPrivacyRulesChannel(channelId)
  ) {
    showToast("Please accept Privacy & Rules to continue.");
    await openPrivacyRulesChannel();
    return;
  }
  const previousChannelId = currentChannelId;
  const isSchoolSettings = isSchoolSettingsChannel(channelId);
  if (isSchoolSettings && previousChannelId && !isSchoolSettingsChannel(previousChannelId)) {
    schoolSettingsPreviousChannelId = previousChannelId;
  }
  if (!isSchoolSettings) {
    schoolSettingsPreviousChannelId = null;
    hideSchoolSettingsCard();
  }
  showSavedOnly = false;
  exitDirectoryView();
  closeChannelMembersModal();
  closeChannelAssignModal();
  currentDmId = null;
  currentChannelId = channelId;
  syncChannelSearchForChannel(channelId);
  persistCurrentChannel();
  persistLastView({ channelId, viewMode: isHomeworkNoteChannel(channelId) ? "note" : "channel" });
  renderPinnedSidebar();
  typingUsers.clear();
  renderTypingUsers();
  if (headerStarBtn) headerStarBtn.hidden = true;
  if (headerPinBtn) headerPinBtn.hidden = true;
  if (headerMuteBtn) headerMuteBtn.hidden = true;

  if (!isSchoolSettings && !isHomeworkNoteChannel(channelId)) {
    try {
      await ensureMessagesForChannelId(channelId);
    } catch (err) {
      console.error("Failed to load messages", err);
      showToast("Could not load messages");
      return;
    }
  } else if (!messagesByChannel[channelId]) {
    messagesByChannel[channelId] = [];
  }

  const cultureChannelActive = isCultureExchangeChannel(channelId);
  if (cultureChannelActive) {
    await loadCultureReadLanguageForChannel(channelId);
  } else {
    cultureExchangeLanguage = null;
  }
  const chatPanelMain = document.querySelector("#chatPanel .chat-panel");
  if (chatPanelMain) {
    chatPanelMain.classList.toggle("culture-exchange", cultureChannelActive);
  }
  renderChannelHeader(channelId);
  if (isSchoolSettings) {
    showSchoolSettingsCard();
  } else {
    if (isAnnouncementChannel(channelId)) {
      requestAnnouncementAutoScroll();
    }
    renderMessages(channelId);
    if (isRestoringView) {
      restoreChatScrollWithRetry(channelId);
    }

    const msgs = messagesByChannel[channelId] || [];
    lastReadIndexByChannel[channelId] = msgs.length - 1;
    clearUnread(channelId);
    clearSidebarUnread(channelId);
    if (allUnreadsView && !allUnreadsView.hidden) renderAllUnreads();
  }

  document
    .querySelectorAll("[data-channel-id]")
    .forEach((el) => {
      el.classList.remove("sidebar-item-active");
      el.setAttribute("aria-selected", "false");
    });
  document.querySelectorAll("[data-dm-id]").forEach((el) => {
    el.classList.remove("sidebar-item-active");
    el.setAttribute("aria-selected", "false");
  });
  const active = document.querySelector(`[data-channel-id="${channelId}"]`);
  if (active) {
    active.classList.add("sidebar-item-active");
    active.setAttribute("aria-selected", "true");
  }

  const ch = getChannelById(channelId);
  const normalizedChannelCategory = ch ? normalizeChannelCategory(ch.category) : null;
  const parentClassId = ch ? homeworkParentByChannelId.get(ch.id) || null : null;
  if (parentClassId) {
    setActiveHomeworkClass(parentClassId);
  } else if (normalizedChannelCategory === "classes") {
    setActiveHomeworkClass(ch.id);
  } else {
    clearActiveHomeworkClass();
  }
  if (ch && messageInput) {
    const placeholder = cultureChannelActive
      ? "Share your culture or reply to today’s topic"
      : `Write a message in #${ch.name}`;
    setComposerPlaceholder(placeholder);
  }
  if (!isSchoolSettings) {
    loadDraftForChannel(channelId);
    updateComposerForChannel(channelId);
  }

  updateTasksForCurrentView();
  updateLaunchButtonLabel();

  if (channelId === "school-task") {
    ensureAllSchoolAdminsInSchoolTask().catch((err) => {
      console.error("Failed to ensure admins in School Task", err);
    });
  }
}

async function selectDM(dmId) {
  if (
    !policyRedirecting &&
    isPolicyAcceptanceRequired() &&
    !policyAccepted
  ) {
    showToast("Please accept Privacy & Rules to continue.");
    await openPrivacyRulesChannel();
    return;
  }
  showSavedOnly = false;
  exitDirectoryView();
  currentDmId = dmId;
  markDmVisited(dmId);
  const key = `dm:${dmId}`;
  currentChannelId = key;
  syncChannelSearchForChannel(key);
  renderPinnedSidebar();
  typingUsers.clear();
  renderTypingUsers();
  const chatPanelMain = document.querySelector("#chatPanel .chat-panel");
  if (chatPanelMain) {
    chatPanelMain.classList.remove("culture-exchange");
  }

  if (!messagesByChannel[key]) {
    try {
      const msgs = await fetchJSON(`/api/dms/${dmId}/messages`, {
        headers: { "x-user-id": getCurrentUserId() }
      });
      messagesByChannel[key] = msgs;
    } catch (err) {
      console.error("Failed to load DM messages", err);
      showToast("Could not load messages");
      return;
    }
  }

  renderDmHeader(dmId);
  renderMessages(key);
  if (isRestoringView) {
    restoreChatScrollWithRetry(key);
  }
  const msgs = messagesByChannel[key] || [];
  lastReadIndexByChannel[key] = msgs.length - 1;
  clearUnread(key);
  clearSidebarUnread(key);
  if (allUnreadsView && !allUnreadsView.hidden) renderAllUnreads();

  await fetchDmMembers(dmId);
  renderDMs();
  renderDmHeader(dmId);

  persistLastView({ channelId: key, viewMode: "dm" });

  document
    .querySelectorAll("[data-channel-id]")
    .forEach((el) => {
      el.classList.remove("sidebar-item-active");
      el.setAttribute("aria-selected", "false");
    });
  document.querySelectorAll("[data-dm-id]").forEach((el) => {
    el.classList.remove("sidebar-item-active");
    el.setAttribute("aria-selected", "false");
  });
  const active = document.querySelector(`[data-dm-id="${dmId}"]`);
  if (active) {
    active.classList.add("sidebar-item-active");
    active.setAttribute("aria-selected", "true");
  }

  const dm = getDmById(dmId);
  if (dm && messageInput) {
    setComposerPlaceholder(`Write a message with ${dmDisplayName(dm) || "DM"}`);
  }
  updateComposerForChannel(key);
  clearActiveHomeworkClass();
  updateTasksForCurrentView();
}

function isTasksChannel(channelId) {
  return TASKS_CHANNEL_IDS.has(String(channelId || "").toLowerCase());
}

function fmtTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return String(iso);
  }
}

async function loadTasks(channelId) {
  const list = await fetchJSON(`/api/tasks?channelId=${encodeURIComponent(channelId)}`);
  tasksCacheByChannel[channelId] = Array.isArray(list) ? list : [];
  return tasksCacheByChannel[channelId];
}

async function createTask(channelId, payload) {
  const res = await fetchJSON(`/api/tasks`, {
    method: "POST",
    body: JSON.stringify({ channelId, ...payload })
  });
  if (res?.task) {
    await loadTasks(channelId);
    renderTasksDock(channelId);
  }
}

async function toggleTaskDone(taskId) {
  await fetchJSON(`/api/tasks/${encodeURIComponent(taskId)}/toggle`, { method: "POST" });
  await loadTasks(currentChannelId);
  renderTasksDock(currentChannelId);
}

async function addTaskComment(taskId, text) {
  await fetchJSON(`/api/tasks/${encodeURIComponent(taskId)}/comments`, {
    method: "POST",
    body: JSON.stringify({ text })
  });
  tasksCommentsCache[taskId] = null;
  renderTasksDock(currentChannelId);
}

async function loadTaskComments(taskId) {
  const rows = await fetchJSON(`/api/tasks/${encodeURIComponent(taskId)}/comments`);
  tasksCommentsCache[taskId] = Array.isArray(rows) ? rows : [];
  return tasksCommentsCache[taskId];
}

async function toggleTaskReaction(taskId, emoji) {
  const res = await fetchJSON(`/api/tasks/${encodeURIComponent(taskId)}/reactions`, {
    method: "POST",
    body: JSON.stringify({ emoji })
  });
  const ch = currentChannelId;
  const tasks = tasksCacheByChannel[ch] || [];
  const idx = tasks.findIndex((t) => t.id === taskId);
  if (idx >= 0) {
    tasks[idx].reactions = res?.reactions || [];
    tasks[idx].myReactions = res?.myReactions || [];
  }
  renderTasksDock(ch);
}

async function toggleTaskCommentReaction(commentId, emoji) {
  const res = await fetchJSON(`/api/task-comments/${encodeURIComponent(commentId)}/reactions`, {
    method: "POST",
    body: JSON.stringify({ emoji })
  });
  Object.keys(tasksCommentsCache).forEach((taskId) => {
    const list = tasksCommentsCache[taskId];
    if (!Array.isArray(list)) return;
    const i = list.findIndex((c) => c.id === commentId);
    if (i >= 0) {
      list[i].reactions = res?.reactions || [];
      list[i].myReactions = res?.myReactions || [];
    }
  });
  renderTasksDock(currentChannelId);
}

function ensureTasksDockMounted() {
  if (!tasksDock) tasksDock = document.getElementById("tasksDock");
  if (!tasksBtn) tasksBtn = document.getElementById("tasksBtn");
  if (tasksBtn && !tasksBtn._tasksBound) {
    tasksBtn._tasksBound = true;
    tasksBtn.addEventListener("click", async () => {
      tasksOpen = !tasksOpen;
      updateTasksForCurrentView(true);
    });
  }
}

function updateTasksForCurrentView(forceRender = false) {
  ensureTasksDockMounted();
  if (!tasksDock) return;
  const channelId = currentDmId ? null : currentChannelId;
  if (!channelId || !isTasksChannel(channelId)) {
    tasksDock.classList.add("hidden");
    tasksOpen = false;
    return;
  }
  if (!tasksOpen) {
    tasksDock.classList.add("hidden");
    return;
  }
  tasksDock.classList.remove("hidden");
  if (forceRender || !tasksCacheByChannel[channelId]) {
    loadTasks(channelId)
      .then(() => renderTasksDock(channelId))
      .catch((err) => console.error(err));
  } else {
    renderTasksDock(channelId);
  }
}

function priorityLabel(p) {
  const x = String(p || "normal");
  if (x === "urgent") return "Urgent";
  if (x === "high") return "High";
  if (x === "low") return "Low";
  return "Normal";
}

function renderReactionsRow(reactions = [], my = [], onPickEmoji, onClickEmoji) {
  const pills = (reactions || [])
    .map((r) => {
      const mine = (my || []).includes(r.emoji) ? " mine" : "";
      return `<button class="task-rx${mine}" data-emoji="${encodeURIComponent(r.emoji)}" type="button">${r.emoji} ${r.count}</button>`;
    })
    .join("");
  return `
    <div class="task-reactions">
      ${pills}
      <button class="task-icon" data-action="${onPickEmoji}" type="button" title="React">
        <i class="fa-regular fa-face-smile"></i>
      </button>
    </div>
  `;
}

function safeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function commentAvatarHtml(url) {
  if (!url) return "";
  return `<img src="${safeHtml(url)}" alt="">`;
}

async function renderTasksDock(channelId) {
  ensureTasksDockMounted();
  if (!tasksDock) return;
  const tasks = tasksCacheByChannel[channelId] || [];
  const openCount = tasks.filter((t) => String(t.status) !== "done").length;
  tasksDock.innerHTML = `
    <div class="tasks-head">
      <div class="tasks-title">
        <i class="fa-solid fa-list-check"></i>
        <span>Tasks</span>
        <small>${openCount} open</small>
      </div>
      <div class="tasks-toolbar">
        <button class="tasks-btn" id="tasksCloseBtn" type="button"><i class="fa-solid fa-xmark"></i></button>
        <button class="tasks-btn tasks-btn-primary" id="tasksNewBtn" type="button"><i class="fa-solid fa-plus"></i> New</button>
      </div>
    </div>
    <div class="tasks-body" id="tasksList"></div>
    <div class="task-input">
      <input id="tasksQuickInput" type="text" placeholder="Quick add: Title… (Enter)" />
      <button class="tasks-btn tasks-btn-primary" id="tasksQuickAddBtn" type="button">Add</button>
    </div>
  `;
  const closeBtn = tasksDock.querySelector("#tasksCloseBtn");
  if (closeBtn) closeBtn.onclick = () => {
    tasksOpen = false;
    updateTasksForCurrentView(true);
  };
  const newBtn = tasksDock.querySelector("#tasksNewBtn");
  if (newBtn) newBtn.onclick = () => openTaskCreateModal(channelId);
  const quick = tasksDock.querySelector("#tasksQuickInput");
  const quickBtn = tasksDock.querySelector("#tasksQuickAddBtn");
  const doQuickAdd = async () => {
    const title = String(quick?.value || "").trim();
    if (!title) return;
    quick.value = "";
    await createTask(channelId, { title, priority: "normal" });
  };
  if (quick) {
    quick.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doQuickAdd();
      }
    });
  }
  if (quickBtn) quickBtn.onclick = doQuickAdd;
  const listEl = tasksDock.querySelector("#tasksList");
  if (!listEl) return;
  listEl.innerHTML = tasks
    .map((t) => {
      const done = String(t.status) === "done";
      const checkCls = done ? "task-check done" : "task-check";
      const titleCls = done ? "task-title done" : "task-title";
      const due = t.due_at
        ? `<span class="task-pill"><i class="fa-regular fa-clock"></i>${safeHtml(fmtTime(t.due_at))}</span>`
        : "";
      const pr = `<span class="task-pill"><i class="fa-solid fa-flag"></i>${safeHtml(
          priorityLabel(t.priority)
        )}</span>`;
      const created = t.created_at
        ? `<span class="task-pill"><i class="fa-regular fa-calendar"></i>${safeHtml(fmtTime(t.created_at))}</span>`
        : "";
      const rxRow = renderReactionsRow(t.reactions || [], t.myReactions || [], "task-react", "task-rx");
      return `
      <div class="task-card" data-task-id="${safeHtml(t.id)}">
        <div class="task-top">
          <button class="${checkCls}" data-action="toggle-done" type="button" title="Toggle done">
            ${done ? '<i class="fa-solid fa-check"></i>' : ""}
          </button>
          <div class="task-main">
            <div class="${titleCls}">${safeHtml(t.title)}</div>
            <div class="task-meta">
              ${pr}
              ${due}
              ${created}
            </div>
          </div>
          <div class="task-actions">
            <button class="task-icon" data-action="toggle-comments" type="button" title="Comments">
              <i class="fa-regular fa-comment-dots"></i>
            </button>
          </div>
        </div>
        ${t.body ? `<div class="task-body">${safeHtml(t.body)}</div>` : ""}
        ${rxRow}
        <div class="task-comments hidden" data-comments>
          <div data-comments-list style="display:flex; flex-direction:column; gap:8px;"></div>
          <div style="display:flex; gap:8px; align-items:center;">
            <input data-comment-input type="text" placeholder="Write a comment…" style="flex:1; height:36px; border-radius:12px; border:1px solid rgba(15,23,42,0.12); padding:0 10px; font-weight:700;">
            <button class="tasks-btn tasks-btn-primary" data-comment-send type="button">Send</button>
          </div>
        </div>
      </div>
    `;
    })
    .join("");
  listEl.querySelectorAll(".task-card").forEach((card) => {
    const taskId = card.getAttribute("data-task-id");
    const toggleDoneBtn = card.querySelector('[data-action="toggle-done"]');
    if (toggleDoneBtn) toggleDoneBtn.onclick = () => toggleTaskDone(taskId);
    card.querySelectorAll(".task-rx").forEach((btn) => {
      btn.addEventListener("click", () => {
        const emoji = decodeURIComponent(btn.getAttribute("data-emoji") || "");
        if (emoji) toggleTaskReaction(taskId, emoji);
      });
    });
    const reactBtn = card.querySelector('[data-action="task-react"]');
    if (reactBtn) reactBtn.onclick = () => openEmojiPicker("task-reaction", taskId);
    const commentsWrap = card.querySelector("[data-comments]");
    const commentsBtn = card.querySelector('[data-action="toggle-comments"]');
    const commentsList = card.querySelector("[data-comments-list]");
    const cInput = card.querySelector("[data-comment-input]");
    const cSend = card.querySelector("[data-comment-send]");
    const openComments = async () => {
      commentsWrap.classList.remove("hidden");
      if (!Array.isArray(tasksCommentsCache[taskId])) {
        await loadTaskComments(taskId);
      }
      const comments = tasksCommentsCache[taskId] || [];
      commentsList.innerHTML = comments
        .map((c) => {
          const rx = (c.reactions || [])
            .map((r) => {
              const mine = (c.myReactions || []).includes(r.emoji) ? " mine" : "";
              return `<button class="task-rx${mine}" data-cemoji="${encodeURIComponent(r.emoji)}" type="button">${r.emoji} ${r.count}</button>`;
            })
            .join("");
          return `
          <div class="task-comment" data-comment-id="${safeHtml(c.id)}">
            <div class="task-avatar">${commentAvatarHtml(c.avatar_url)}</div>
            <div class="task-cbody">
              <div class="task-cmeta">
                <span>${safeHtml(c.author_name || "User")}</span>
                <span class="task-ctime">${safeHtml(fmtTime(c.created_at))}</span>
              </div>
              <div class="task-ctext">${safeHtml(c.text)}</div>
              <div class="task-comment-actions">
                ${rx}
                <button class="task-icon" data-action="c-react" type="button" title="React">
                  <i class="fa-regular fa-face-smile"></i>
                </button>
              </div>
            </div>
          </div>
        `;
        })
        .join("");
      commentsList.querySelectorAll("[data-comment-id]").forEach((row) => {
        const commentId = row.getAttribute("data-comment-id");
        row.querySelectorAll(".task-rx").forEach((btn) => {
          btn.addEventListener("click", () => {
            const emoji = decodeURIComponent(btn.getAttribute("data-cemoji") || "");
            if (emoji) toggleTaskCommentReaction(commentId, emoji);
          });
        });
        const cReact = row.querySelector('[data-action="c-react"]');
        if (cReact) cReact.onclick = () => openEmojiPicker("task-comment-reaction", commentId);
      });
    };
    const closeComments = () => commentsWrap.classList.add("hidden");
    if (commentsBtn) {
      commentsBtn.onclick = async () => {
        const isHidden = commentsWrap.classList.contains("hidden");
        if (isHidden) await openComments();
        else closeComments();
      };
    }
    if (cSend)
      cSend.onclick = async () => {
        const text = String(cInput?.value || "").trim();
        if (!text) return;
        cInput.value = "";
        await addTaskComment(taskId, text);
        await openComments();
      };
    if (cInput)
      cInput.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const text = String(cInput.value || "").trim();
          if (!text) return;
          cInput.value = "";
          await addTaskComment(taskId, text);
          await openComments();
        }
      });
  });
}

function openTaskCreateModal(channelId) {
  const title = prompt("Task title:");
  if (!title || !String(title).trim()) return;
  const body = prompt("Task description (optional):") || "";
  const due = prompt("Due date/time (optional, e.g. 2026-03-01 14:00):") || "";
  const pr = prompt("Priority: low | normal | high | urgent (default normal):") || "normal";
  let dueAt = null;
  if (due.trim()) {
    const guess = new Date(due);
    if (!isNaN(guess.getTime())) dueAt = guess.toISOString();
    else dueAt = due.trim();
  }
  createTask(channelId, {
    title: String(title).trim(),
    body: body.trim(),
    dueAt,
    priority: pr.trim().toLowerCase()
  });
}

// ===================== THREADS =====================

function updateThreadReplyCount() {
  if (!threadReplyCount) return;
  const count = (currentThreadMessage?.replies || []).length;
  threadReplyCount.textContent = `Replies: ${count}`;
}

function openThread(channelId, messageId) {
  try {
    const msgs = messagesByChannel[channelId] || [];
    const msg = msgs.find((m) => String(m.id) === String(messageId));
    if (!msg) {
      console.warn("openThread: message not found", { channelId, messageId });
      closeThread();
      persistLastView({ channelId: currentChannelId, threadMessageId: null, threadChannelId: null });
      showToast("Thread could not open (message not found).");
      return;
    }
    if (!threadPanel || !threadParentContainer) return;

    lastThreadTrigger = document.activeElement;
    currentThreadMessage = msg;
    currentThreadChannelId = channelId;
    if (document.body) document.body.classList.remove("voice-only-thread");
    if (voiceOnlyThreadComposer) {
      voiceOnlyThreadComposer.hidden = true;
      voiceOnlyThreadComposer.setAttribute("aria-hidden", "true");
      voiceOnlyThreadComposer.style.display = "none";
    }
    if (threadComposerBody) {
      threadComposerBody.style.display = "";
    }

    pinnedViewMode = "thread";
    pinnedThreadKey = makeThreadKey(channelId, msg.id);
    activeThreadParentId = msg.id;
    threadPendingUploads = [];
    renderThreadPendingAttachments();

    threadPanel.setAttribute("role", "dialog");
    threadPanel.setAttribute("aria-modal", "true");
    threadPanel.setAttribute("aria-label", "Thread");
    threadPanel.classList.add("thread-panel-open");
    if (chatLayout) chatLayout.classList.add("thread-open");
    if (chatLayout) chatLayout.style.gridTemplateColumns = "";

    persistLastView({ channelId, threadMessageId: msg.id, threadChannelId: channelId });

    threadParentContainer.innerHTML = "";
    const row = document.createElement("div");
    row.className = "thread-parent-msg";

    const avatarCol = document.createElement("div");
    avatarCol.className = "thread-parent-avatar";
    const avatar = document.createElement("div");
    avatar.className = "avatar avatar-sm";
    const msgAvatar = msg.avatarUrl || resolveAvatarUrl(msg.author, msg.initials);
    setAvatarPresence(avatar, msg.userId || msg.authorId || msg.user_id || "", msg.author);
    const threadRole = msg.role || resolveUserRole(msg.author, msg.initials);
    applyAvatarToNode(avatar, msg.initials, msgAvatar, msg.author, threadRole);
    avatarCol.appendChild(avatar);

    const bubble = document.createElement("div");
    bubble.className = "thread-parent-bubble";

    const header = document.createElement("div");
    header.className = "thread-parent-head";

    const nameEl = document.createElement("div");
    nameEl.className = "thread-parent-name";
    nameEl.textContent = msg.author;

    const nickEl = document.createElement("div");
    nickEl.className = "thread-parent-nick";
    applyRoleLabel(nickEl, msg.role || resolveUserRole(msg.author, msg.initials));

    header.appendChild(nameEl);
    header.appendChild(nickEl);

    const body = document.createElement("div");
    body.className = "thread-parent-body";
    body.innerHTML = sanitizeMessageHTML(msg.text || "");
    hydrateEmojiImages(body);
    upgradeAttachments(body);
    annotateAudioCards(body, msg.id, channelId);
    setupAudioCardOptions(body);
    hydratePdfThumbs(body);
    enhanceAttachments(body);

    bubble.appendChild(header);
    bubble.appendChild(body);

    row.appendChild(avatarCol);
    row.appendChild(bubble);
    threadParentContainer.appendChild(row);

    if (threadParentChannel) {
      if (isDmChannel(channelId)) {
        const dmId = dmIdFromChannel(channelId);
        const dm = dmId ? getDmById(dmId) : null;
        threadParentChannel.textContent = dm ? dmDisplayName(dm) : "Direct Message";
      } else {
        const ch = getChannelById(channelId);
        threadParentChannel.textContent = ch ? `#${ch.name}` : "";
      }
    }

    renderThreadReplies();
    updateThreadReplyCount();
    bindThreadScrollPersistence();
    renderPinnedSidebar();

    if (releaseThreadTrap) releaseThreadTrap();
    releaseThreadTrap = trapFocus(threadPanel);

    requestAnimationFrame(() => {
      const focusTarget = threadPanel.querySelector(
        "button, [href], input, [tabindex]:not([tabindex='-1'])"
      );
      if (focusTarget && typeof focusTarget.focus === "function") {
        focusTarget.focus();
      }
    });
  } catch (err) {
    console.error("openThread crashed:", err);
    closeThread();
    persistLastView({ channelId: currentChannelId, threadMessageId: null, threadChannelId: null });
    showToast("Thread crashed. Resetting…");
  }
}

async function handleAddChannel(category = "classes") {
  if (!isAdminUser()) {
    showToast("Only admins can create channels");
    return;
  }

  const normalizedCategory = normalizeChannelCategory(category);
  const targetContainer = getChannelFormContainer(normalizedCategory);
  if (!targetContainer) {
    showToast("Section not found");
    return;
  }
  const section = targetContainer.closest(".sidebar-section");
  if (section && section.dataset.collapsible === "true") {
    setSidebarSectionCollapsed(section.id, false);
  }
  openInlineChannelForm(normalizedCategory, targetContainer);
}


function renderThreadReplies() {
  if (!threadRepliesContainer || !currentThreadMessage) return;

  const threadChannelId = currentThreadChannelId || currentChannelId;
  const prevScroller = getThreadScroller();
  const prevScrollTop = prevScroller ? prevScroller.scrollTop : null;
  const threadKey = getThreadScrollKey(threadChannelId, currentThreadMessage.id);
  const savedScrollTop =
    threadKey && typeof scrollState[threadKey] === "number" ? scrollState[threadKey] : null;

  threadRepliesContainer.innerHTML = "";
  const replies = currentThreadMessage.replies || [];
  updateThreadReplyCount();

  replies.forEach((r) => {
    const row = document.createElement("div");
    row.className = "thread-reply-row";
    row.dataset.replyId = r.id;
    row.setAttribute("role", "article");
    row.setAttribute("tabindex", "0");
    row.setAttribute(
      "aria-label",
      `Thread reply from ${r.author || "Unknown"}${r.time ? ` at ${r.time}` : ""}`
    );

    const avatarCol = document.createElement("div");
    const avatar = document.createElement("div");
    avatar.className = "avatar avatar-sm";
    const replyAvatar = r.avatarUrl || resolveAvatarUrl(r.author, r.initials);
    setAvatarPresence(
      avatar,
      r.userId || r.authorId || r.user_id || "",
      r.author
    );
    const replyRole = r.role || resolveUserRole(r.author, r.initials);
    applyAvatarToNode(avatar, r.initials, replyAvatar, r.author, replyRole);
    avatarCol.appendChild(avatar);

    const bubble = document.createElement("div");
    bubble.className = "thread-reply-bubble";

    const header = document.createElement("div");
    header.className = "thread-reply-head";

    const author = document.createElement("strong");
    author.style.fontSize = "20px";
    author.textContent = r.author;

    const meta = document.createElement("span");
    meta.style.fontSize = "20px";
    meta.style.color = "#6b7280";
    meta.textContent = r.time;

    header.appendChild(author);
    header.appendChild(meta);

    const body = document.createElement("div");
    body.className = "thread-reply-body";
    body.style.fontSize = "20px";
    body.style.marginTop = "2px";
    body.innerHTML = sanitizeMessageHTML(r.text);
    hydrateEmojiImages(body);
    upgradeAttachments(body);
    annotateAudioCards(body, r.id, threadChannelId);
    setupAudioCardOptions(body);
    hydratePdfThumbs(body);

    const nick = document.createElement("div");
    nick.className = "thread-reply-nick";
    applyRoleLabel(nick, r.role || resolveUserRole(r.author, r.initials));

    const footer = document.createElement("div");
    footer.className = "thread-reply-footer";

    const reactionsWrap = buildReactionChips(
      r.reactions || [],
      (emoji) => addReactionToReply(r.id, emoji),
      22
    );

    const reactBtn = document.createElement("button");
    reactBtn.className = "message-action-btn";
    reactBtn.classList.add("emoji-trigger");
    reactBtn.innerHTML = '<i class="fa-regular fa-face-smile"></i>';
    reactBtn.title = "Add reaction";
    reactBtn.setAttribute("aria-label", "Add reaction");
    reactBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openEmojiPicker("reply-reaction", r.id);
    });

    const pinMsgBtn = document.createElement("button");
    pinMsgBtn.className = "message-action-btn";
    pinMsgBtn.innerHTML = '<i class="fa-solid fa-thumbtack"></i>';
    pinMsgBtn.title = "Pin message";
    pinMsgBtn.setAttribute("aria-label", "Pin message");
    pinMsgBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const threadKey = makeThreadKey(currentThreadChannelId || currentChannelId, currentThreadMessage?.id);
      const pinned = togglePinMessage({
        type: "message",
        scope: "thread",
        channelId: String(currentThreadChannelId || currentChannelId),
        threadKey,
        messageId: String(r.id),
        author: r.author || "",
        time: r.time || "",
        text: r.text || "",
        ts: Date.now()
      });
      notifyPinned(pinned ? "Pinned in thread" : "Unpinned in thread", r);
      renderPinnedSidebar();
    });

    footer.appendChild(reactionsWrap);
    footer.appendChild(reactBtn);
    footer.appendChild(pinMsgBtn);

    bubble.appendChild(header);
    bubble.appendChild(nick);
    bubble.appendChild(body);
    bubble.appendChild(footer);

    row.appendChild(avatarCol);
  row.appendChild(bubble);
    threadRepliesContainer.appendChild(row);
  });

  if (prevScroller) {
    if (isRestoringView && savedScrollTop !== null) {
      prevScroller.scrollTop = savedScrollTop;
    } else if (typeof prevScrollTop === "number") {
      prevScroller.scrollTop = prevScrollTop;
    } else if (savedScrollTop !== null) {
      prevScroller.scrollTop = savedScrollTop;
    }
  }
  // keep current scroll position; do not force scroll to bottom
  hydrateEmojiImages(threadRepliesContainer);
  upgradeAttachments(threadRepliesContainer);
  hydratePdfThumbs(threadRepliesContainer);
  enhanceAttachments(threadRepliesContainer);
  setupAudioCardOptions(threadRepliesContainer);
}

function closeThread() {
  if (!threadPanel) return;
  threadPanel.classList.remove("thread-panel-open");
  if (chatLayout) {
    chatLayout.classList.remove("thread-open");
    chatLayout.style.gridTemplateColumns = "";
  }
  currentThreadMessage = null;
  currentThreadChannelId = null;
  pinnedViewMode = "channel";
  pinnedThreadKey = "";
  activeThreadParentId = null;
  persistLastView({ channelId: currentChannelId, threadMessageId: null, threadChannelId: null });
  if (threadReplyCount) threadReplyCount.textContent = "Replies: 0";
  renderPinnedSidebar();
  if (releaseThreadTrap) releaseThreadTrap();
  releaseThreadTrap = null;
  if (document.body) document.body.classList.remove("voice-only-thread");
  if (lastThreadTrigger && typeof lastThreadTrigger.focus === "function") {
    lastThreadTrigger.focus();
  }
  lastThreadTrigger = null;

  if (threadComposerBody) {
    threadComposerBody.style.display = "";
  }
  if (voiceOnlyThreadComposer) {
    voiceOnlyThreadComposer.hidden = true;
    voiceOnlyThreadComposer.setAttribute("aria-hidden", "true");
    voiceOnlyThreadComposer.style.display = "none";
    voiceOnlyThreadComposer.classList.remove("hidden");
  }
}

function refreshMessagesView() {
  if (showSavedOnly) {
    renderSavedMessages();
  } else {
    renderMessages(currentChannelId);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function plainToSafeHtml(s = "") {
  const safe = escapeHtml(String(s || ""));
  return safe.replace(/\n/g, "<br>");
}

function sanitizeMessageHTML(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = String(html || "");

  // remove dangerous nodes
  tpl.content.querySelectorAll("script, style, iframe, object, embed").forEach((n) => n.remove());

  // remove dangerous attributes
  tpl.content.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = (attr.value || "").toLowerCase();

      // strip inline JS handlers
      if (name.startsWith("on")) el.removeAttribute(attr.name);

      // strip javascript: links
      if ((name === "href" || name === "src") && value.startsWith("javascript:")) {
        el.removeAttribute(attr.name);
      }
    });

    if (el.hasAttribute("style")) {
      const allowed = new Set([
        "font-weight",
        "font-style",
        "text-decoration",
        "text-decoration-line",
        "text-decoration-style",
        "text-decoration-color"
      ]);

      const cleaned = String(el.getAttribute("style") || "")
        .split(";")
        .map((rule) => rule.trim())
        .filter(Boolean)
        .map((rule) => {
          const parts = rule.split(":");
          if (parts.length < 2) return "";
          const prop = parts.shift().trim().toLowerCase();
          const value = parts.join(":").trim();
          const lowerValue = value.toLowerCase();
          if (!allowed.has(prop)) return "";
          if (lowerValue.includes("url(") || lowerValue.includes("expression")) return "";
          if (lowerValue.includes("javascript:")) return "";
          return `${prop}: ${value}`;
        })
        .filter(Boolean)
        .join("; ");

      if (cleaned) {
        el.setAttribute("style", cleaned);
      } else {
        el.removeAttribute("style");
      }
    }
  });

  return tpl.innerHTML;
}

function spawnFloatingEmoji(emoji, messageId) {
  const row = document.querySelector(
    `.message-row[data-message-id="${messageId}"]`
  );
  if (!row) return;

  const span = document.createElement("div");
  span.className = "floating-emoji";
  span.innerHTML = buildEmojiImage(emoji, 34);

  row.appendChild(span);

  setTimeout(() => {
    if (span.parentNode) span.parentNode.removeChild(span);
  }, 950);
}

function spawnFloatingEmojiForReply(emoji, replyId) {
  const row = document.querySelector(
    `.thread-reply-row[data-reply-id="${replyId}"]`
  );
  if (!row) return;

  const span = document.createElement("div");
  span.className = "floating-emoji";
  span.innerHTML = buildEmojiImage(emoji, 30);

  row.appendChild(span);

  setTimeout(() => {
    if (span.parentNode) span.parentNode.removeChild(span);
  }, 950);
}

async function addReactionToMessage(messageId, emoji) {
  try {
    const isDm = isDmChannel(currentChannelId || currentThreadChannelId || "");
    const dmId = isDm ? dmIdFromChannel(currentChannelId || currentThreadChannelId || "") : null;
    const endpoint = isDm
      ? `/api/dms/${dmId}/messages/${messageId}/reactions`
      : `/api/messages/${messageId}/reactions`;

    const result = await fetchJSON(endpoint, {
      method: "POST",
      body: JSON.stringify({
        emoji,
        userId: (sessionUser && sessionUser.userId) || (sessionUser && sessionUser.email) || "anon"
      })
    });

    const serverReactions = result.reactions || [];
    applyMessageReactions(messageId, serverReactions, emoji);

    refreshMessagesView();
    if (serverReactions.some((r) => r.emoji === emoji && r.count > 0)) {
      spawnFloatingEmoji(emoji, messageId);
    }
  } catch (err) {
    console.error("Failed to add reaction", err);
    showToast("Could not add reaction");
  }
}

async function addReactionToReply(replyId, emoji) {
  try {
    const isDmThread = isDmChannel(currentThreadChannelId || "");
    const endpoint = isDmThread
      ? `/api/dm-replies/${replyId}/reactions`
      : `/api/replies/${replyId}/reactions`;

    const result = await fetchJSON(endpoint, {
      method: "POST",
      body: JSON.stringify({
        emoji,
        userId: (sessionUser && sessionUser.userId) || (sessionUser && sessionUser.email) || "anon"
      })
    });

    const serverReactions = result.reactions || [];
    applyReplyReactions(replyId, serverReactions, emoji);

    if (currentThreadMessage) {
      renderThreadReplies();
    }
    if (serverReactions.some((r) => r.emoji === emoji && r.count > 0)) {
      spawnFloatingEmojiForReply(emoji, replyId);
    }
  } catch (err) {
    console.error("Failed to add reply reaction", err);
    showToast("Could not add reaction");
  }
}

function renderPendingAttachments() {
  if (!pendingAttachmentsEl) return;

  if (!pendingUploads.length) {
    pendingAttachmentsEl.hidden = true;
    pendingAttachmentsEl.innerHTML = "";
    updateSendButtonState();
    return;
  }

  const iconForMime = (m) => {
    if (!m) return "fa-file";
    if (m.startsWith("audio/")) return "fa-microphone";
    if (m.startsWith("video/")) return "fa-video";
    if (m.startsWith("image/")) return "fa-image";
    return "fa-paperclip";
  };

  pendingAttachmentsEl.hidden = false;
  pendingAttachmentsEl.innerHTML = pendingUploads
    .map((f, idx) => {
      const name = escapeHtml(f.originalName || f.label || "attachment");
      const icon = iconForMime(f.mimeType);
      const statusText =
        f.status === "ready"
          ? "Ready to send"
          : f.status === "queued"
          ? "Queued (offline)"
          : f.status === "failed"
          ? "Upload failed"
          : `Uploading… ${Math.round(f.progress || 0)}%`;
      const progressHtml =
        f.status === "uploading"
          ? `<span class="bar" aria-label="Upload progress"><i style="width:${Math.round(
              f.progress || 0
            )}%"></i></span>`
          : "";

      return `
        <div class="attach-chip attachment-chip" data-id="${f.id || idx}" data-idx="${idx}">
          <i class="fa-solid ${icon}"></i>
          <span class="chip-name">${name}</span>
          <span class="chip-meta">${statusText}</span>
          ${progressHtml}
          <button type="button" class="chip-x" aria-label="Remove attachment" title="Remove">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      `;
    })
    .join("");

  pendingAttachmentsEl.querySelectorAll(".attach-chip .chip-x").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const chip = e.currentTarget.closest(".attach-chip");
      const id = chip?.dataset?.id;
      let idx = -1;
      if (id) {
        idx = pendingUploads.findIndex((p) => String(p.id) === String(id));
      } else if (chip?.dataset?.idx) {
        idx = Number(chip.dataset.idx);
      }
      if (idx >= 0 && idx < pendingUploads.length) {
        pendingUploads.splice(idx, 1);
      }
      renderPendingAttachments();
    });
  });

  updateSendButtonState();
}

function renderThreadPendingAttachments() {
  if (!threadPendingAttachments) return;

  if (!threadPendingUploads.length) {
    threadPendingAttachments.hidden = true;
    threadPendingAttachments.innerHTML = "";
    return;
  }

  threadPendingAttachments.hidden = false;
  threadPendingAttachments.innerHTML = threadPendingUploads
    .map((f, idx) => {
      const name = escapeHtml(f.originalName || f.label || "attachment");
      const icon = iconForMime(f.mimeType || "", name);
      const statusText =
        f.status === "ready"
          ? "Ready to send"
          : f.status === "failed"
          ? "Upload failed"
          : `Uploading… ${Math.round(f.progress || 0)}%`;
      const progressHtml =
        f.status === "uploading"
          ? `<span class="bar" aria-label="Upload progress"><i style="width:${Math.round(
              f.progress || 0
            )}%"></i></span>`
          : "";

      return `
        <div class="attach-chip attachment-chip" data-id="${f.id || idx}" data-idx="${idx}">
          <i class="fa-solid ${icon}"></i>
          <span class="chip-name">${name}</span>
          <span class="chip-meta">${statusText}</span>
          ${progressHtml}
          <button type="button" class="chip-x" aria-label="Remove attachment" title="Remove">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      `;
    })
    .join("");

  threadPendingAttachments.querySelectorAll(".attach-chip .chip-x").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const chip = e.currentTarget.closest(".attach-chip");
      const id = chip?.dataset?.id;
      let idx = -1;
      if (id) {
        idx = threadPendingUploads.findIndex((p) => String(p.id) === String(id));
      } else if (chip?.dataset?.idx) {
        idx = Number(chip.dataset.idx);
      }
      if (idx >= 0 && idx < threadPendingUploads.length) {
        threadPendingUploads.splice(idx, 1);
      }
      renderThreadPendingAttachments();
    });
  });
}

function fmtTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function startRecTimer() {
  stopRecTimer();
  recTimerInt = setInterval(() => {
    const now = Date.now();
    const elapsed = (now - recStartTs) + recPausedMs;
    if (recTimer) recTimer.textContent = fmtTime(elapsed);
  }, 250);
}

function stopRecTimer() {
  if (recTimerInt) clearInterval(recTimerInt);
  recTimerInt = null;
}

function hideRecordingUI() {
  if (!recordingOverlay) return;
  recordingOverlay.hidden = true;
  stopRecTimer();
  if (recPreview) {
    recPreview.hidden = true;
    try {
      recPreview.srcObject = null;
    } catch (err) {
      // ignore
    }
  }
}

function resetRecordingUI() {
  hideRecordingUI();
  if (recLabel) recLabel.textContent = "Recording…";
  if (recTimer) recTimer.textContent = "00:00";
  if (recPauseBtn) recPauseBtn.textContent = "Pause";
}

function hideVoiceRecordStatus() {
  if (!voiceRecordStatus) return;
  voiceRecordStatus.classList.remove("is-visible");
  voiceRecordStatus.textContent = "";
  if (voiceRecordStatusTimer) {
    clearTimeout(voiceRecordStatusTimer);
    voiceRecordStatusTimer = null;
  }
}

function showVoiceRecordStatus(message, duration = 1800) {
  if (!voiceRecordStatus) return;
  voiceRecordStatus.textContent = message;
  voiceRecordStatus.classList.add("is-visible");
  if (voiceRecordStatusTimer) clearTimeout(voiceRecordStatusTimer);
  voiceRecordStatusTimer = setTimeout(() => {
    voiceRecordStatus.classList.remove("is-visible");
    voiceRecordStatus.textContent = "";
    voiceRecordStatusTimer = null;
  }, duration);
}

function iconForMime(mime = "", name = "") {
  const n = (name || "").toLowerCase();
  const m = (mime || "").toLowerCase();

  if (m.startsWith("image/")) return "fa-regular fa-image";
  if (m.startsWith("video/")) return "fa-solid fa-video";
  if (m.startsWith("audio/")) return "fa-solid fa-microphone";
  if (m.includes("pdf") || n.endsWith(".pdf")) return "fa-regular fa-file-pdf";
  if (m.includes("zip") || n.endsWith(".zip") || n.endsWith(".rar")) return "fa-regular fa-file-zipper";
  if (m.includes("msword") || n.endsWith(".doc") || n.endsWith(".docx")) return "fa-regular fa-file-word";
  if (m.includes("spreadsheet") || n.endsWith(".xls") || n.endsWith(".xlsx"))
    return "fa-regular fa-file-excel";
  if (m.includes("presentation") || n.endsWith(".ppt") || n.endsWith(".pptx"))
    return "fa-regular fa-file-powerpoint";
  return "fa-regular fa-file-lines";
}

function humanSize(bytes = 0) {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

function fileIconByName(name = "", mime = "") {
  const n = name.toLowerCase();
  const m = mime.toLowerCase();
  if (m.startsWith("audio/") || (n.endsWith(".webm") && n.includes("audio"))) return "fa-solid fa-microphone";
  if (m.startsWith("video/") || (n.endsWith(".webm") && n.includes("video"))) return "fa-solid fa-video";
  if (m.startsWith("image/") || n.match(/\.(png|jpg|jpeg|gif|webp|svg)$/)) return "fa-regular fa-image";
  if (m.includes("pdf") || n.endsWith(".pdf")) return "fa-regular fa-file-pdf";
  if (n.match(/\.(zip|rar|7z)$/)) return "fa-regular fa-file-zipper";
  if (n.match(/\.(doc|docx)$/)) return "fa-regular fa-file-word";
  if (n.match(/\.(xls|xlsx|csv)$/)) return "fa-regular fa-file-excel";
  if (n.match(/\.(ppt|pptx)$/)) return "fa-regular fa-file-powerpoint";
  return "fa-regular fa-file-lines";
}

function getFilenameFromUrl(url = "") {
  try {
    const u = new URL(url, window.location.origin);
    return decodeURIComponent(u.pathname.split("/").pop() || "file");
  } catch {
    return (url.split("/").pop() || "file").split("?")[0];
  }
}

function formatDuration(seconds = 0) {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const pdfDocCache = new Map();
const audioWaveformCache = new Map(); // url -> Promise<waveform>
const UploadQueueDB = {
  db: null,
  async open() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("worknest_upload_queue", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore("queue", { keyPath: "id" });
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve(this.db);
      };
      req.onerror = () => reject(req.error);
    });
  },
  async put(item) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("queue", "readwrite");
      tx.objectStore("queue").put(item);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  },
  async getAll() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("queue", "readonly");
      const req = tx.objectStore("queue").getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },
  async del(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("queue", "readwrite");
      tx.objectStore("queue").delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
};

async function fetchPdfDocument(url) {
  if (!url) return null;
  let job = pdfDocCache.get(url);
  if (!job) {
    job = pdfjsLib
      .getDocument({
        url,
        withCredentials: true,
        // include user ID header so uploads that require auth still load
        httpHeaders: {
          "x-user-id": getCurrentUserId() || "",
          ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {})
        }
      })
      .promise;
    pdfDocCache.set(url, job);
  }
  try {
    return await job;
  } catch (err) {
    pdfDocCache.delete(url);
    throw err;
  }
}

async function renderPdfThumbToImg(pdfUrl, img) {
  if (!window.pdfjsLib || !img || !pdfUrl) return;

  const pdf = await fetchPdfDocument(pdfUrl);
  if (!pdf) return;
  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const availableWidth = Math.max(img.clientWidth || 360, 240);
  const dpr = Math.min(window.devicePixelRatio || 1.5, 2);
  const targetWidth = Math.ceil(availableWidth * dpr);
  const scale = targetWidth / baseViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  try {
    img.src = canvas.toDataURL("image/png");
  } catch (err) {
    console.error("Failed to set PDF thumbnail data URL", err);
    attachPdfIframeFallback(img.closest(".pdf-card-modern"), pdfUrl);
  }
}

function attachPdfIframeFallback(card, url) {
  if (!card || !url) return;
  const preview = card.querySelector(".pdf-preview");
  if (!preview) return;
  const exists = card.querySelector(".pdf-preview-embed");
  const iframeSrc = `${url}#page=1&view=FitH`;
  if (exists) {
    exists.src = iframeSrc;
    exists.style.opacity = "1";
    return;
  }
  const iframe = document.createElement("iframe");
  iframe.className = "pdf-preview-embed";
  iframe.src = iframeSrc;
  iframe.setAttribute("title", "PDF preview");
  iframe.setAttribute("loading", "lazy");
  iframe.addEventListener("load", () => {
    iframe.style.opacity = "1";
  });
  preview.appendChild(iframe);
  const img = card.querySelector(".pdf-preview-img");
  if (img) {
    img.style.opacity = "0";
    img.style.display = "none";
  }
}

function hydratePdfThumbs(container) {
  if (!container) return;
  if (!window.pdfjsLib) {
    setTimeout(() => hydratePdfThumbs(container), 250);
    return;
  }

  container.querySelectorAll(".pdf-card-modern").forEach(async (card) => {
    const url = card.getAttribute("data-file-url") || card.getAttribute("data-pdf-url");
    const img = card.querySelector(".pdf-preview-img");
    if (!url || !img || img.dataset.done) return;

    img.dataset.done = "1";
    if (!window.pdfjsLib) {
      attachPdfIframeFallback(card, url);
      return;
    }
    try {
      await renderPdfThumbToImg(url, img);
      img.style.opacity = "1";
      const fallback = card.querySelector(".pdf-thumb-fallback");
      if (fallback) {
        fallback.style.display = "none";
      }
    } catch (err) {
      console.warn("PDF thumb failed:", err);
      const errEl = card.querySelector(".pdf-error");
      if (!errEl) {
        const overlay = document.createElement("div");
        overlay.className = "pdf-error";
        overlay.textContent = "Preview unavailable";
        card.appendChild(overlay);
      } else {
        errEl.textContent = "Preview unavailable";
      }
      attachPdfIframeFallback(card, url);
    }
  });
}

async function hydratePdfStats(container) {
  if (!container) return;
  const cards = Array.from(container.querySelectorAll(".pdf-card-modern[data-file-url]"));
  if (!cards.length) return;

  const uniqueUrls = Array.from(
    new Set(cards.map((card) => String(card.dataset.fileUrl || "").trim()).filter(Boolean))
  );
  if (!uniqueUrls.length) return;

  const params = new URLSearchParams();
  uniqueUrls.forEach((url) => params.append("url", url));

  try {
    const data = await fetchJSON(`/api/file-stats?${params.toString()}`, {
      headers: { "x-user-id": getCurrentUserId() }
    });

    const statsMap = (data && data.stats) || {};
    cards.forEach((card) => {
      const url = String(card.dataset.fileUrl || "").trim();
      const stats = statsMap[url] || { views: 0, downloads: 0 };
      updateCardStats(card, stats);
    });
  } catch (err) {
    console.warn("Failed to load PDF stats", err);
  }
}

function updateCardStats(card, stats = {}) {
  if (!card) return;
  const views = Number.isFinite(Number(stats.views)) ? Number(stats.views) : 0;
  const downloads = Number.isFinite(Number(stats.downloads)) ? Number(stats.downloads) : 0;
  const viewsEl = card.querySelector(".pdf-stat-views .pdf-stat-value");
  const downloadsEl = card.querySelector(".pdf-stat-downloads .pdf-stat-value");
  if (viewsEl) viewsEl.textContent = String(views);
  if (downloadsEl) downloadsEl.textContent = String(downloads);
}

async function recordPdfStat(url, type, card) {
  if (!url || (type !== "view" && type !== "download")) return;
  try {
    const payload = {
      fileUrl: url,
      type,
      fileName: card?.dataset.fileName || "",
      size: Number(card?.dataset.fileSize || 0)
    };
    const stats = await fetchJSON("/api/file-stats/increment", {
      method: "POST",
      headers: {
        "x-user-id": getCurrentUserId()
      },
      body: JSON.stringify(payload)
    });
    updateCardStats(card, stats);
  } catch (err) {
    console.warn("Failed to record PDF stat", err);
  }
}

function setupPdfCardDeleteControls(textEl, msg, channelId, isMaterialsChannel, canManage) {
  if (!textEl || !msg || !channelId || !isMaterialsChannel || !canManage) return;

  textEl.querySelectorAll(".pdf-card-modern").forEach((card) => {
    card.dataset.messageId = msg.id;
    card.dataset.channelId = channelId;
    const existing = card.querySelector(".pdf-card-ellipsis");
    if (existing) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pdf-card-ellipsis";
    btn.title = "Attachment actions";
    btn.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>';

    btn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      showPdfDeletePrompt(btn, () => deleteSinglePdfCard(card, channelId));
    });

    card.appendChild(btn);
  });
}

let activePdfDeletePrompt = null;

function closePdfDeletePrompt() {
  if (!activePdfDeletePrompt) return;
  const { el, handlers } = activePdfDeletePrompt;
  if (handlers) {
    document.removeEventListener("mousedown", handlers.click);
    document.removeEventListener("keydown", handlers.key);
  }
  el.remove();
  activePdfDeletePrompt = null;
}

function showPdfDeletePrompt(anchor, onConfirm) {
  if (!anchor) return;
  closePdfDeletePrompt();

  const prompt = document.createElement("div");
  prompt.className = "pdf-delete-prompt";
  prompt.innerHTML = `
    <div class="pdf-delete-prompt-text">Delete this PDF attachment?</div>
    <div class="pdf-delete-prompt-actions">
      <button type="button" class="pdf-delete-prompt-btn pdf-delete-cancel">Cancel</button>
      <button type="button" class="pdf-delete-prompt-btn pdf-delete-confirm">Delete</button>
    </div>
  `;

  document.body.appendChild(prompt);

  const rect = anchor.getBoundingClientRect();
  const promptRect = prompt.getBoundingClientRect();

  const viewportWidth = document.documentElement.clientWidth;
  const padding = 8;
  let left = rect.left + window.scrollX;
  if (left + promptRect.width + padding > viewportWidth) {
    left = Math.max(padding, viewportWidth - promptRect.width - padding);
  }
  const top = rect.bottom + window.scrollY + 6;

  prompt.style.top = `${top}px`;
  prompt.style.left = `${left}px`;

  const cancelBtn = prompt.querySelector(".pdf-delete-cancel");
  const confirmBtn = prompt.querySelector(".pdf-delete-confirm");

  const closeHandler = () => closePdfDeletePrompt();
  const confirmHandler = () => {
    closePdfDeletePrompt();
    if (typeof onConfirm === "function") {
      onConfirm();
    }
  };

  if (cancelBtn) {
    cancelBtn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      closeHandler();
    });
  }
  if (confirmBtn) {
    confirmBtn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      confirmHandler();
    });
  }

  const docClickHandler = (evt) => {
    if (!prompt.contains(evt.target) && evt.target !== anchor) {
      closeHandler();
    }
  };
  const keyHandler = (evt) => {
    if (evt.key === "Escape") {
      closeHandler();
    }
  };

  document.addEventListener("mousedown", docClickHandler);
  document.addEventListener("keydown", keyHandler);

  activePdfDeletePrompt = {
    el: prompt,
    handlers: {
      click: docClickHandler,
      key: keyHandler
    }
  };
}

async function deleteSinglePdfCard(card, channelId) {
  if (!card || !channelId) return;
  const messageId = card.dataset.messageId;
  if (!messageId) return;
  const channelMsgs = messagesByChannel[channelId] || [];
  const msg = channelMsgs.find((m) => String(m.id) === String(messageId));
  if (!msg || typeof msg.text !== "string") return;

  const parser = new DOMParser();
  const doc = parser.parseFromString(msg.text, "text/html");
  const candidates = Array.from(doc.body.querySelectorAll(".pdf-card-modern"));
  const targetUrl = (card.getAttribute("data-file-url") || "").trim();
  let removed = false;

  for (const candidate of candidates) {
    const candidateUrl = (candidate.getAttribute("data-file-url") || "").trim();
    if (!removed && targetUrl && candidateUrl === targetUrl) {
      candidate.remove();
      removed = true;
    }
  }

  if (!removed) {
    showToast("Failed to remove attachment.");
    return;
  }

  const newText = doc.body.innerHTML.trim();

  try {
    await fetchJSON(`/api/messages/${encodeURIComponent(messageId)}`, {
      method: "PATCH",
      headers: { "x-user-id": getCurrentUserId() },
      body: JSON.stringify({ text: newText })
    });
    msg.text = newText;
    renderMessages(channelId);
  } catch (err) {
    console.error("Failed to remove PDF attachment", err);
    showToast(err && err.message ? err.message : "Could not remove attachment.");
  }
}

function bindPdfMiniCardClicks(root = document) {
  if (!root) return;

  root.querySelectorAll(".pdf-card-modern[data-file-url]").forEach((card) => {
    if (card.dataset.clickBound === "1") return;
    card.dataset.clickBound = "1";

    const preview = card.querySelector(".pdf-preview, .pdf-mini-thumb");
    const downloadBtn = card.querySelector('.pdf-mini-btn-download');
    const openBtn = card.querySelector('.pdf-mini-btn-open');
    const targetUrl = card.getAttribute("data-file-url") || "#";

    const openPdf = () => {
      if (!targetUrl || targetUrl === '#') return;
      window.open(targetUrl, "_blank", "noopener");
      recordPdfStat(targetUrl, "view", card);
    };

    if (preview) {
      preview.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        openPdf();
      });
    }

    if (openBtn) {
      openBtn.addEventListener("click", (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        openPdf();
      });
    }

    if (downloadBtn) {
      downloadBtn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        recordPdfStat(targetUrl, "download", card);
      });
    }
  });
}

function getThreadStats(channelId, messageId) {
  const msgs = messagesByChannel[channelId] || [];
  const m = msgs.find((mm) => String(mm.id) === String(messageId));
  const replies = (m && Array.isArray(m.replies) && m.replies.length) ? m.replies : null;
  if (!replies) return null;
  const last = replies[replies.length - 1];
  const lastTsRaw =
    last?.createdAt ||
    last?.created_at ||
    last?.timestamp ||
    last?.ts ||
    "";
  const lastDate = parseChatDate(lastTsRaw);
  const lastDateLabel = lastDate ? formatRelativeDay(lastDate) : "";
  const lastTime =
    (last && last.time) ||
    (lastDate
      ? lastDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "");

  return { count: replies.length, lastTime, lastDateLabel };
}

function parseChatDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const str = String(value).trim();
  const parsed = Date.parse(str);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  const match = str.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/);
  if (match) {
    const d = new Date(`${match[1]}T${match[2]}`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function getMessageTimestampParts(msg = {}) {
  const time = String(msg.time || "").trim();
  const raw =
    msg.createdAt ||
    msg.created_at ||
    msg.timestamp ||
    msg.ts ||
    msg.time ||
    "";
  const parsed = parseChatDate(raw);
  const dateLabel =
    parsed &&
    parsed.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  return { time, dateLabel };
}

function appendHeaderSegment(header, element) {
  if (!header || !element) return;
  const dot = document.createElement("span");
  dot.className = "message-header-dot";
  dot.setAttribute("aria-hidden", "true");
  dot.textContent = "·";
  header.appendChild(dot);
  header.appendChild(element);
}


function formatRelativeDay(date) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTomorrow = new Date(startToday);
  startTomorrow.setDate(startToday.getDate() + 1);
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startToday.getDate() - 1);

  if (date >= startToday && date < startTomorrow) return "Today";
  if (date >= startYesterday && date < startToday) return "Yesterday";

  const opts =
    date.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };
  return date.toLocaleDateString([], opts);
}


function uploadFilesWithProgress(files, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    files.forEach((f) => form.append("files", f));

    xhr.open("POST", "/api/uploads");
    xhr.withCredentials = true;
    const csrf = getCsrfToken();
    if (csrf) {
      xhr.setRequestHeader("x-csrf-token", csrf);
    }

    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const pct = Math.round((evt.loaded / evt.total) * 100);
      if (onProgress) onProgress(pct);
    };

    xhr.onload = () => {
      try {
        if (xhr.status < 200 || xhr.status >= 300) throw new Error("Upload failed");
        resolve(JSON.parse(xhr.responseText));
      } catch (e) {
        reject(e);
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(form);
  });
}

function getAudioContext() {
  if (!window.AudioContext && !window.webkitAudioContext) return null;
  if (!getAudioContext.ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    getAudioContext.ctx = new Ctx();
  }
  return getAudioContext.ctx;
}

async function enhanceAudioWaveform(wrap, audioEl) {
  if (!wrap || !audioEl) return;
  if (wrap.dataset.waveReady === "1") return;
  wrap.dataset.waveReady = "1";

  const card = wrap.closest(".att-card");
  const actionBtn = card?.querySelector(".att-btn.att-play");
  if (!card || !actionBtn) return;
  const canvas = wrap.querySelector(".att-wave");
  let ctx = null;
  let canvasEl = null;
  let dpr = 1;

  if (canvas) {
    canvasEl = canvas;
    ctx = canvas.getContext("2d");
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const rect = canvasEl.getBoundingClientRect();
      canvasEl.width = Math.floor(rect.width * dpr);
      canvasEl.height = Math.floor(rect.height * dpr);
    };
    resize();
  }

  let peaks = null;
  let decodedDuration = null;
  try {
    const url = wrap.dataset.audioUrl || audioEl.src;
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const resp = await fetch(url);
    const buf = await resp.arrayBuffer();
    const decoded = await ac.decodeAudioData(buf);
    decodedDuration = decoded.duration;
    if (canvasEl && ctx) {
      peaks = getPeaks(decoded, 80);
    }
    ac.close?.();
  } catch {
    peaks = null;
    decodedDuration = null;
  }

  const draw = (progress = 0) => {
    if (!ctx || !canvasEl) return;
    const w = canvasEl.width;
    const h = canvasEl.height;
    const mid = h / 2;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,.10)";
    roundRect(ctx, 0, 0, w, h, 12 * dpr);
    ctx.fill();

    if (!peaks) return;

    const bars = peaks.length;
    const barW = w / bars;
    for (let i = 0; i < bars; i++) {
      const amp = peaks[i];
      const barH = Math.max(2 * dpr, amp * (h * 0.42));
      const x = i * barW + barW * 0.22;
      const bw = Math.max(2 * dpr, barW * 0.56);
      const y = mid - barH;
      const played = i / bars <= progress;
      ctx.fillStyle = played ? "rgba(0,0,0,.55)" : "rgba(0,0,0,.22)";
      ctx.fillRect(x, y, bw, barH * 2);
    }
  };

  draw(0);

  const getRecordedDuration = () => {
    const total = decodedDuration;
    return Number.isFinite(total) && total > 0 ? total : audioEl.duration;
  };

  const setIconState = (state) => {
    const isPlaying = state === "pause";
    setAttachmentPlayButtonState(actionBtn, isPlaying);
    card.classList.toggle("att-card-playing", isPlaying);
  };
  audioEl.addEventListener("play", () => setIconState("pause"));
  audioEl.addEventListener("pause", () => setIconState("play"));

  const tick = () => {
    const d = audioEl.duration;
    const t = audioEl.currentTime || 0;
    const total = getRecordedDuration();
    draw(Number.isFinite(total) && total > 0 ? t / total : 0);
    if (!audioEl.paused) requestAnimationFrame(tick);
  };

  audioEl.addEventListener("timeupdate", () => {
    if (audioEl.paused) tick();
  });

  audioEl.addEventListener("play", () => requestAnimationFrame(tick));
  const handleMetadata = () => {
    const total = getRecordedDuration();
    if (!Number.isFinite(total)) return;
    draw(0);
  };

  audioEl.addEventListener("loadedmetadata", handleMetadata);
  audioEl.addEventListener("durationchange", handleMetadata);
  audioEl.load();
  if (audioEl.readyState >= 1) {
    handleMetadata();
  }

  if (canvasEl) {
    canvasEl.addEventListener("click", (e) => {
      const rect = canvasEl.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      if (Number.isFinite(audioEl.duration)) {
        audioEl.currentTime = audioEl.duration * x;
        tick();
      }
    });
  }
}

document.addEventListener("click", (evt) => {
  const playBtn = evt.target.closest(".att-btn.att-play");
  if (!playBtn) return;
  const card = playBtn.closest(".att-card");
  const audioEl = card?.querySelector("audio.att-media") || card?.querySelector("audio");
  if (!audioEl) return;
  evt.preventDefault();
  evt.stopPropagation();
  if (audioEl.paused) {
    audioEl.play().catch(() => {});
    setAttachmentPlayButtonState(playBtn, true);
  } else {
    audioEl.pause();
    setAttachmentPlayButtonState(playBtn, false);
  }
});

document.addEventListener("click", (evt) => {
  if (evt.target.closest(".att-options")) return;
  closeAllAttachmentOptions();
});

document.addEventListener("click", (evt) => {
  const threadBtn = evt.target.closest(".att-btn.att-thread");
  if (!threadBtn) return;
  evt.preventDefault();
  evt.stopPropagation();
  const card = threadBtn.closest(".att-card");
  const messageId = card?.dataset.messageId;
  const channelId = card?.dataset.channelId || currentChannelId;
  if (!messageId || !channelId) return;
  openThread(channelId, messageId);
});

function setAttachmentPlayButtonState(button, isPlaying) {
  if (!button) return;
  const icon = button.querySelector("i");
  if (icon) {
    icon.className = isPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
  }
  button.setAttribute("aria-label", isPlaying ? "Pause audio" : "Play audio");
  button.classList.toggle("is-playing", isPlaying);
}

function getPeaks(audioBuffer, bars = 80) {
  const ch = audioBuffer.getChannelData(0);
  const block = Math.floor(ch.length / bars);
  const peaks = [];
  for (let i = 0; i < bars; i++) {
    let max = 0;
    const start = i * block;
    const end = start + block;
    for (let j = start; j < end; j++) {
      const v = Math.abs(ch[j] || 0);
      if (v > max) max = v;
    }
    peaks.push(max);
  }
  const m = Math.max(...peaks, 0.001);
  return peaks.map((p) => p / m);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ===================== PINNED ITEMS (messages + attachments, channel/thread scoped) =====================
const PIN_KEY = "worknest_pins_v3";
const PIN_UI_STATE_KEY = "worknest_pinned_ui_state_v1";
const PINNED_CHANNELS_KEY = "worknest_pinned_channels_v1";
let pinnedViewMode = "channel"; // "channel" | "thread"
let pinnedThreadKey = "";
let activeThreadParentId = null;

function loadPins() {
  try {
    return JSON.parse(localStorage.getItem(PIN_KEY) || "[]");
  } catch {
    return [];
  }
}
function savePins(list) {
  localStorage.setItem(PIN_KEY, JSON.stringify(list));
}
function makeThreadKey(channelId, parentMessageId) {
  return `${channelId}:${parentMessageId}`;
}

function getActiveChannelId() {
  return currentChannelId || "unknown";
}

// ----- Pinned channels (sidebar pin) -----
function loadPinnedChannels() {
  try {
    return JSON.parse(localStorage.getItem(PINNED_CHANNELS_KEY) || "[]");
  } catch {
    return [];
  }
}

function savePinnedChannels(list) {
  localStorage.setItem(PINNED_CHANNELS_KEY, JSON.stringify(list));
}

function isChannelPinned(channelId) {
  return loadPinnedChannels().includes(String(channelId));
}

function togglePinnedChannel(channelId) {
  const id = String(channelId);
  const list = loadPinnedChannels();
  const idx = list.indexOf(id);
  if (idx >= 0) list.splice(idx, 1);
  else list.unshift(id);
  savePinnedChannels(list);
  return idx < 0;
}

function isPinned(url, channelId = getActiveChannelId()) {
  return loadPins().some((p) => p.type === "attachment" && p.url === url && p.channelId === channelId);
}

function togglePinnedAttachment(att) {
  const list = loadPins();
  const idx = list.findIndex(
    (p) => p.type === "attachment" && p.url === att.url && p.channelId === att.channelId && p.scope === (att.scope || "channel")
  );
  const entry = {
    type: "attachment",
    scope: att.scope || (pinnedViewMode === "thread" ? "thread" : "channel"),
    threadKey: att.threadKey || (pinnedViewMode === "thread" ? pinnedThreadKey : ""),
    ...att
  };
  if (idx >= 0) list.splice(idx, 1);
  else list.unshift(entry);
  savePins(list);
}

function listPinsForContext({ channelId = getActiveChannelId(), scope = "channel", threadKey = "" }) {
  return loadPins().filter(
    (p) =>
      String(p.channelId) === String(channelId) &&
      p.scope === scope &&
      (scope !== "thread" || p.threadKey === threadKey)
  );
}


function togglePinMessage(pin) {
  const list = loadPins();
  const idx = list.findIndex(
    (p) =>
      p.type === "message" &&
      p.messageId === String(pin.messageId) &&
      p.channelId === String(pin.channelId) &&
      p.scope === pin.scope &&
      (pin.scope !== "thread" || p.threadKey === pin.threadKey)
  );
  const entry = { ...pin, type: "message" };
  if (idx >= 0) list.splice(idx, 1);
  else list.unshift(entry);
  savePins(list);
  return idx < 0;
}

// Drawer elements
const pinnedDrawer = document.getElementById("pinnedDrawer");
const pinnedBackdrop = document.getElementById("pinnedBackdrop");
const closePinnedBtn = document.getElementById("closePinnedBtn");
const pinnedList = document.getElementById("pinnedList");
const pinnedCount = document.getElementById("pinnedCount");
const pinnedSidebarCount = document.getElementById("pinnedSidebarCount");
const pinnedToggleBtn = document.getElementById("pinnedToggleBtn");
const pinnedSidebarList = document.getElementById("pinnedSidebarList");

const PINNED_COLLAPSE_KEY = "worknest_pinned_sidebar_collapsed_v2";
const SIDEBAR_SECTION_COLLAPSE_KEY = "worknest_sidebar_section_collapsed_v1";
let sidebarSectionCollapseState = {};

function setPinnedCollapsed(collapsed) {
  const section = document.getElementById("pinnedSidebarSection");
  if (!section) return;
  section.classList.toggle("is-collapsed", !!collapsed);
  localStorage.setItem(PINNED_COLLAPSE_KEY, collapsed ? "1" : "0");
}

function initPinnedCollapse() {
  const btn = document.getElementById("pinnedToggleBtn");
  if (!btn) return;

  const saved = localStorage.getItem(PINNED_COLLAPSE_KEY) === "1";
  setPinnedCollapsed(saved);

  btn.addEventListener("click", () => {
    const section = document.getElementById("pinnedSidebarSection");
    const nowCollapsed = !section?.classList.contains("is-collapsed");
    setPinnedCollapsed(nowCollapsed);
  });
}

function loadSidebarSectionCollapseState() {
  try {
    const raw = localStorage.getItem(SIDEBAR_SECTION_COLLAPSE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn("Could not load sidebar collapse state", err);
    return {};
  }
}

function saveSidebarSectionCollapseState(state) {
  try {
    localStorage.setItem(SIDEBAR_SECTION_COLLAPSE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("Could not save sidebar collapse state", err);
  }
}

function setSidebarSectionCollapsed(sectionId, collapsed) {
  if (!sectionId) return;
  const section = document.getElementById(sectionId);
  if (!section) return;
  section.classList.toggle("is-collapsed", !!collapsed);
  const header = section.querySelector(".sidebar-section-header");
  if (header) header.setAttribute("aria-expanded", collapsed ? "false" : "true");
  sidebarSectionCollapseState[sectionId] = !!collapsed;
  saveSidebarSectionCollapseState(sidebarSectionCollapseState);
  setupSidebarKeyboardNav();
}

function initSidebarSectionCollapsibles() {
  sidebarSectionCollapseState = loadSidebarSectionCollapseState();
  document.querySelectorAll(".sidebar-section[data-collapsible='true']").forEach((section) => {
    const header = section.querySelector(".sidebar-section-header");
    const sectionId = section.id;
    if (!header || !sectionId) return;

    const list = section.querySelector(".sidebar-items");
    if (list?.id) header.setAttribute("aria-controls", list.id);
    header.setAttribute("role", "button");
    header.setAttribute("tabindex", "0");

    if (sidebarSectionCollapseState[sectionId]) {
      section.classList.add("is-collapsed");
    }
    header.setAttribute("aria-expanded", section.classList.contains("is-collapsed") ? "false" : "true");

    if (header.dataset.collapseBound === "1") return;

    const toggle = () => {
      const nextCollapsed = !section.classList.contains("is-collapsed");
      setSidebarSectionCollapsed(sectionId, nextCollapsed);
    };

    header.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      toggle();
    });

    header.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (e.target.closest("button")) return;
      e.preventDefault();
      toggle();
    });

    header.dataset.collapseBound = "1";
  });
}

function openPinnedDrawer() {
  if (!pinnedDrawer) return;
  pinnedDrawer.hidden = false;
  if (openPinnedBtn) openPinnedBtn.classList.add("is-active");
  renderPinnedDrawer();
  renderPinnedSidebar();
}

function closePinnedDrawer() {
  if (!pinnedDrawer) return;
  pinnedDrawer.hidden = true;
  if (openPinnedBtn) openPinnedBtn.classList.remove("is-active");
}

pinnedBackdrop?.addEventListener("click", closePinnedDrawer);
closePinnedBtn?.addEventListener("click", closePinnedDrawer);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && pinnedDrawer && !pinnedDrawer.hidden) closePinnedDrawer();
});

function iconForPinned(name = "", mime = "") {
  const n = name.toLowerCase();
  const m = (mime || "").toLowerCase();
  if (m.startsWith("audio/") || (n.includes("audio") && n.endsWith(".webm"))) return "fa-solid fa-microphone";
  if (m.startsWith("video/") || (n.includes("video") && n.endsWith(".webm"))) return "fa-solid fa-video";
  if (m.startsWith("image/") || n.match(/\.(png|jpg|jpeg|gif|webp)$/)) return "fa-regular fa-image";
  if (m.includes("pdf") || n.endsWith(".pdf")) return "fa-regular fa-file-pdf";
  return "fa-regular fa-file-lines";
}

function renderPinnedDrawer() {
  if (!pinnedList) return;

  const channelId = getActiveChannelId();
  const scope = pinnedViewMode;
  const threadKey = pinnedViewMode === "thread" ? pinnedThreadKey : "";
  const items = listPinsForContext({ channelId, scope, threadKey }).filter((p) => p.type === "attachment");

  if (pinnedCount) pinnedCount.textContent = String(items.length);

  if (!items.length) {
    pinnedList.innerHTML = `<div style="opacity:.65;padding:10px;">No pinned attachments in this channel.</div>`;
    return;
  }

  pinnedList.innerHTML = items
    .map((p) => {
      const icon = iconForPinned(p.name || "", p.mimeType || "");
      const sub = p.kind ? p.kind : p.mimeType || "attachment";
      return `
        <div class="pinned-item" data-url="${p.url}">
          <div class="pinned-item-top">
            <div class="pinned-ic"><i class="${icon}"></i></div>
            <div class="pinned-meta">
              <div class="pinned-name" title="${escapeHtml(p.name || "")}">${escapeHtml(p.name || "attachment")}</div>
              <div class="pinned-sub">${escapeHtml(sub)}</div>
            </div>
            <div class="pinned-actions">
              <a class="pinned-btn" href="${p.url}" target="_blank" rel="noopener noreferrer" title="Open">
                <i class="fa-solid fa-arrow-up-right-from-square"></i>
              </a>
              <a class="pinned-btn" href="${p.url}" download title="Download">
                <i class="fa-solid fa-download"></i>
              </a>
              <button class="pinned-btn pinned-unpin" type="button" title="Unpin">
                <i class="fa-solid fa-thumbtack"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  pinnedList.querySelectorAll(".pinned-unpin").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const item = e.currentTarget.closest(".pinned-item");
      const url = item?.getAttribute("data-url");
      if (!url) return;
      togglePinnedAttachment({ url, channelId, scope, threadKey });
      renderPinnedDrawer();
      refreshPinnedMarkersInDOM();
      renderPinnedSidebar();
    });
  });
}

function refreshPinnedMarkersInDOM(root = document) {
  const channelId = getActiveChannelId();
  root.querySelectorAll(".att-card[data-att-url]").forEach((card) => {
    const url = card.getAttribute("data-att-url");
    if (!url) return;
    card.classList.toggle("pinned", isPinned(url, channelId));
  });
}

function stripHtmlToText(html) {
  const div = document.createElement("div");
  div.innerHTML = String(html || "");
  return (div.textContent || "").trim();
}

function scrollToMessageInChat(messageId) {
  const el = document.querySelector(
    `.message-row[data-message-id="${CSS.escape(String(messageId))}"]`
  );
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("flash-highlight");
    setTimeout(() => el.classList.remove("flash-highlight"), 1200);
  } else {
    showToast("Message not found in current view");
  }
}

function jumpToPinnedMessage(messageId) {
  const el = document.querySelector(
    `.message-row[data-message-id="${CSS.escape(String(messageId))}"]`
  );
  if (!el) {
    showToast("Message not found in current view");
    return;
  }
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("pinned-jump-highlight");
  setTimeout(() => el.classList.remove("pinned-jump-highlight"), 4200);
}

// ===== Composer recording UI (toolbar/status) =====

let recTickTimer = null;
let recStartedAt = 0;
let recPausedAt = 0;
let recPausedTotal = 0;
let recMode = null; // "audio" | "video"
let recOnStop = null;
let recOnCancel = null;
let recOnPause = null;
let recOnResume = null;

function msToTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function startComposerRecordingUI(mode, { onStop, onCancel, onPause, onResume } = {}) {
  recMode = mode;
  recOnStop = onStop || null;
  recOnCancel = onCancel || null;
  recOnPause = onPause || null;
  recOnResume = onResume || null;

  recStartedAt = Date.now();
  recPausedAt = 0;
  recPausedTotal = 0;

  if (recLabel) recLabel.textContent = mode === "video" ? "Recording video" : "Recording audio";
  if (recTimer) recTimer.textContent = "0:00";
  if (composerStatus) composerStatus.hidden = false;

  if (recPauseBtn) recPauseBtn.hidden = false;
  if (recResumeBtn) recResumeBtn.hidden = true;

  clearInterval(recTickTimer);
  recTickTimer = setInterval(() => {
    const now = Date.now();
    const elapsed = Math.max(0, now - recStartedAt - recPausedTotal);
    if (recTimer) recTimer.textContent = msToTime(elapsed);
  }, 150);

  if (recPauseBtn) recPauseBtn.onclick = handlePauseClick;
  if (recResumeBtn) recResumeBtn.onclick = handleResumeClick;
  if (recStopBtn) recStopBtn.onclick = handleStopClick;
  if (recCancelBtn) recCancelBtn.onclick = handleCancelClick;
}

function handlePauseClick() {
  if (recPausedAt) return;
  recPausedAt = Date.now();
  if (recPauseBtn) recPauseBtn.hidden = true;
  if (recResumeBtn) recResumeBtn.hidden = false;
  recOnPause?.();
}

function handleResumeClick() {
  if (!recPausedAt) return;
  recPausedTotal += Date.now() - recPausedAt;
  recPausedAt = 0;
  if (recPauseBtn) recPauseBtn.hidden = false;
  if (recResumeBtn) recResumeBtn.hidden = true;
  recOnResume?.();
}

function handleStopClick() {
  const cb = recOnStop;
  stopComposerRecordingUI();
  cb?.();
}

function handleCancelClick() {
  const cb = recOnCancel;
  stopComposerRecordingUI();
  cb?.();
}

function stopComposerRecordingUI() {
  clearInterval(recTickTimer);
  recTickTimer = null;
  if (composerStatus) composerStatus.hidden = true;
  if (recordingOverlay) recordingOverlay.classList.remove("is-paused");

  recMode = null;
  recOnStop = recOnCancel = recOnPause = recOnResume = null;
  recPausedAt = 0;
  recPausedTotal = 0;
}

function updateSendButtonState() {
  if (!sendButton || !messageInput) return;
  if (showSavedOnly || !canPostInChannel(currentChannelId)) {
    sendButton.disabled = true;
    sendButton.style.opacity = "0.55";
    sendButton.classList.remove("is-ready");
    return;
  }
  syncEditorToTextarea();
  const html = (messageInput.value || "").replace(/<br\s*\/?>/gi, "").trim();
  const hasText = html.length > 0;
  const hasReadyFiles = pendingUploads?.some((u) => u.status === "ready") || false;
  const isUploading = pendingUploads?.some((u) => u.status === "uploading") || false;

  const isReady = (hasText || hasReadyFiles) && !isUploading;
  sendButton.disabled = !isReady;
  sendButton.style.opacity = isReady ? "1" : "0.55";
  sendButton.classList.toggle("is-ready", isReady);
}

function notifyPinned(title, msg) {
  showToast(title);
  const key = "worknest_notifs_v1";
  try {
    const list = JSON.parse(localStorage.getItem(key) || "[]");
    list.unshift({
      id: (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      title,
      ts: Date.now(),
      channelId: String(currentChannelId || ""),
      messageId: msg?.id ? String(msg.id) : "",
      author: msg?.author || ""
    });
    localStorage.setItem(key, JSON.stringify(list.slice(0, 30)));
  } catch (err) {
    console.warn("Could not persist pin notification", err);
  }
}

// ===== Pinned sidebar UI =====
function renderPinnedSidebar() {
  const channelId = String(currentChannelId || "");
  const pins = listPinsForContext({ channelId, scope: "channel", threadKey: "" }).filter(
    (p) => p.type === "message"
  );
  const hasPins = pins.length > 0;
  const section = document.getElementById("pinnedSidebarSection");
  if (section) section.hidden = !hasPins;

  if (pinnedSidebarCount) {
    pinnedSidebarCount.textContent = hasPins ? String(pins.length) : "";
    pinnedSidebarCount.hidden = !hasPins;
  }

  const listEl = document.getElementById("pinnedSidebarList");
  if (!listEl) return;

  if (!hasPins) {
    listEl.innerHTML = "";
    return;
  }

  listEl.innerHTML = pins
    .slice(0, 20)
    .map((p) => {
      const previewText = stripHtmlToText(p.text || "").slice(0, 90);
      return `
        <div class="sidebar-pinned-item" data-mid="${escapeHtml(p.messageId)}">
          <div class="sidebar-pinned-ic"><i class="fa-solid fa-message"></i></div>
          <div class="sidebar-pinned-meta">
            <div class="sidebar-pinned-name">${escapeHtml(p.author || "Message")}</div>
            <div class="sidebar-pinned-sub">${escapeHtml(previewText || "(no text)")}</div>
          </div>
          <div class="sidebar-pinned-actions">
            <button class="sidebar-pinned-btn pin-jump" type="button" title="Jump">
              <i class="fa-solid fa-arrow-right"></i>
            </button>
            <button class="sidebar-pinned-btn pin-unpin" type="button" title="Unpin">
              <i class="fa-solid fa-thumbtack"></i>
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  listEl.querySelectorAll(".sidebar-pinned-item").forEach((row) => {
    const mid = row.getAttribute("data-mid");
    if (!mid) return;

    const jump = () => jumpToPinnedMessage(mid);

    row.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      jump();
    });

    row.querySelector(".pin-jump")?.addEventListener("click", (e) => {
      e.stopPropagation();
      jump();
    });

    row.querySelector(".pin-unpin")?.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePinMessage({
        type: "message",
        scope: "channel",
        channelId,
        threadKey: "",
        messageId: mid
      });
      renderPinnedSidebar();
      refreshPinnedMarkersInDOM?.();
      notifyPinned("Unpinned", { id: mid });
    });
  });
}
async function processUploadQueue() {
  if (!navigator.onLine) return;
  const items = await UploadQueueDB.getAll();
  if (!items.length) return;

  for (const item of items) {
    pendingUploads = pendingUploads.map((x) =>
      x.id === item.id ? { ...x, status: "uploading", progress: 0 } : x
    );
    renderPendingAttachments();

    try {
      const data = await uploadFilesWithProgress([item.file], (pct) => {
        pendingUploads = pendingUploads.map((x) =>
          x.id === item.id ? { ...x, progress: pct } : x
        );
        renderPendingAttachments();
      });

      const u = (data.files || [])[0];
      pendingUploads = pendingUploads.map((x) => {
        if (x.id !== item.id) return x;
        return {
          ...x,
          status: "ready",
          progress: 100,
          url: u.url,
          originalName: u.originalName,
          size: u.size,
          mimeType: u.mimeType,
          label: u.originalName || x.label
        };
      });
      renderPendingAttachments();

      await UploadQueueDB.del(item.id);
    } catch (e) {
      console.error("Retry upload failed", e);
      pendingUploads = pendingUploads.map((x) =>
        x.id === item.id ? { ...x, status: "queued" } : x
      );
      renderPendingAttachments();
      break;
    }
  }
}

window.addEventListener("online", () => {
  showToast("Back online. Retrying uploads…");
  processUploadQueue();
});

function buildPdfGmailMarkup({ name, url, sizeLabel = "", sizeBytes = 0 }) {
  const safeUrl = escapeHtml(url || "#");
  const safeName = escapeHtml(name || "file");
  const trimmedSize = (sizeLabel || "").trim();
  const metaText = trimmedSize ? escapeHtml(trimmedSize) : "PDF";
  const numericSize = Number.isFinite(Number(sizeBytes)) ? Number(sizeBytes) : 0;

  return `
    <div class="pdf-card-modern pdf-mini" data-file-url="${safeUrl}" data-file-name="${safeName}" data-file-size="${numericSize}">
      <div class="pdf-preview pdf-mini-thumb" role="button" tabindex="0" aria-label="Open PDF">
        <div class="pdf-thumb-fallback">PDF</div>
        <img class="pdf-preview-img" alt="PDF preview" />
        <div class="pdf-mini-top">
          <span class="pdf-mini-btn pdf-mini-btn-open" data-action="open">
            <i class="fa-solid fa-arrow-up-right-from-square"></i>
          </span>
          <a class="pdf-mini-btn pdf-mini-btn-download" data-action="download" href="${safeUrl}" download>
            <i class="fa-solid fa-download"></i>
          </a>
        </div>
      </div>
      <div class="pdf-mini-bottom">
        <div class="pdf-mini-info">
          <div class="pdf-mini-name">
            <i class="fa-solid fa-file-pdf pdf-mini-name-icon" aria-hidden="true"></i>
            ${safeName}
          </div>
        </div>
        <div class="pdf-mini-meta-stats">
          <span class="pdf-mini-meta">${metaText}</span>
          <div class="pdf-mini-stats">
            <span class="pdf-stat pdf-stat-views" title="Views">
              <i class="fa-solid fa-eye"></i>
              <span class="pdf-stat-value">0</span>
            </span>
            <span class="pdf-stat pdf-stat-downloads" title="Downloads">
              <i class="fa-solid fa-download"></i>
              <span class="pdf-stat-value">0</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildAudioOptionsMenu() {
  return `
    <div class="att-options">
      <button type="button" class="att-btn att-options-toggle" aria-label="Attachment options" title="Attachment options">
        <i class="fa-solid fa-ellipsis-vertical"></i>
      </button>
      <div class="att-options-menu" role="menu">
        <button type="button" class="att-options-item" data-action="copy" title="Copy link" aria-label="Copy link">
          <i class="fa-regular fa-copy"></i>
        </button>
        <button type="button" class="att-options-item" data-action="share" title="Share" aria-label="Share">
          <i class="fa-solid fa-share-nodes"></i>
        </button>
        <button type="button" class="att-options-item" data-action="edit" title="Edit message" aria-label="Edit message">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button type="button" class="att-options-item" data-action="delete" title="Delete message" aria-label="Delete message">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

function buildAttachmentCard(file) {
  const name = file.originalName || "file";
  const url = file.url || "#";
  const mime = file.mimeType || "";
  const size = file.size ? humanSize(file.size) : "";
  const safeUrl = escapeHtml(url);

  const normalizedMime = (mime || "").toLowerCase();
  const normalizedName = (name || "").toLowerCase();
  const isPdf = normalizedMime.includes("pdf") || normalizedName.endsWith(".pdf");

  if (isPdf) {
    return buildPdfGmailMarkup({ name, url, sizeLabel: size, sizeBytes: file.size });
  }

  const icon = iconForMime(mime, name);
  const isAudio = mime.startsWith("audio/");
  const metaLabel = `${escapeHtml(mime)}${size ? " • " + escapeHtml(size) : ""}`;
  const metaContent = isAudio
    ? ""
    : `<div class="att-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
       <div class="att-sub">${metaLabel}</div>`;
  const iconHtml = isAudio
    ? ""
    : `<div class="att-ic">
        <i class="${icon}"></i>
      </div>`;
  const cardClasses = `att-card${isAudio ? " att-card-audio" : ""}`;
  const downloadAction = `<a class="att-btn att-download" href="${safeUrl}" download title="Download">
            <i class="fa-solid fa-download"></i>
          </a>`;
  const openAction = `<a class="att-btn" href="${safeUrl}" target="_blank" rel="noopener noreferrer" title="Open">
            <i class="fa-solid fa-arrow-up-right-from-square"></i>
          </a>`;
  const playAction = `<button type="button" class="att-btn att-play" aria-label="Play audio" title="Play audio">
                <i class="fa-solid fa-play"></i>
              </button>`;
  const optionsHtml = isAudio ? buildAudioOptionsMenu() : "";

  if (isAudio) {
    const barsHtml = new Array(6).fill("<span></span>").join("");
    return `
      <div class="${cardClasses}" data-mime="${escapeHtml(mime)}" data-att-url="${safeUrl}">
        <div class="att-card-audio-row">
          <button type="button" class="att-btn att-play att-play-inline" aria-label="Play audio">
            <i class="fa-solid fa-play"></i>
          </button>
          <div class="att-card-audio-info">
            <div class="att-audio-ui" data-audio-url="${safeUrl}">
              <div class="att-audio-bars" aria-hidden="true">
                ${barsHtml}
              </div>
            </div>
          </div>
          <div class="att-card-audio-actions">
            <button type="button" class="att-btn att-thread" title="Open thread">
              <i class="fa-solid fa-comment"></i>
            </button>
            ${downloadAction}
            ${optionsHtml}
          </div>
        </div>
        <audio class="att-media att-audio-hidden" preload="metadata" src="${safeUrl}"></audio>
      </div>
    `;
  }

  let preview = "";
  if (mime.startsWith("video/")) {
    preview = `<video class="att-media att-video" controls preload="metadata" src="${safeUrl}"></video>`;
  }

  return `
    <div class="${cardClasses}" data-mime="${escapeHtml(mime)}" data-att-url="${safeUrl}">
      <div class="att-top">
        ${iconHtml}
        <div class="att-meta">
          ${metaContent}
        </div>
        <div class="att-actions">
          <div class="att-actions-left">${isAudio ? playAction : openAction}</div>
          <div class="att-actions-right">
            ${downloadAction}
            ${optionsHtml}
          </div>
        </div>
      </div>
      ${preview ? `<div class="att-preview">${preview}</div>` : ""}
    </div>
  `;
}

function enhanceAttachments(root = document) {
  if (!root) return;
  root.querySelectorAll(".att-video").forEach((v) => {
    v.setAttribute("playsinline", "true");
  });
  root.querySelectorAll(".att-audio-ui").forEach((wrap) => {
    const audioEl = wrap.parentElement?.querySelector("audio.att-media");
    if (!audioEl) return;
    enhanceAudioWaveform(wrap, audioEl).catch(() => {
      if (wrap.dataset.waveReady === "1") return;
      wrap.dataset.waveReady = "1";
      audioEl.classList.remove("att-audio-hidden");
      audioEl.controls = true;
    });
  });
}

function openAttachmentLightbox({ type, url }) {
  if (!attLightbox || !attLightboxBody) return;

  attLightboxBody.innerHTML = "";
  attLightbox.hidden = false;

  if (attLightboxOpen) attLightboxOpen.href = url || "#";
  if (attLightboxDownload) attLightboxDownload.href = url || "#";

  if (type === "image") {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    attLightboxBody.appendChild(img);
  } else if (type === "video") {
    const v = document.createElement("video");
    v.src = url;
    v.controls = true;
    v.preload = "metadata";
    v.playsInline = true;
    attLightboxBody.appendChild(v);
  } else if (type === "pdf") {
    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.setAttribute("title", "PDF preview");
    attLightboxBody.appendChild(iframe);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
    closeAttachmentLightbox();
  }
}

function closeAttachmentLightbox() {
  if (!attLightbox) return;
  attLightbox.hidden = true;
  if (attLightboxBody) attLightboxBody.innerHTML = "";
}

function upgradeAttachments(root) {
  if (!root) return;

  const legacy = root.querySelectorAll(".attachment:not([data-upgraded='1'])");
  legacy.forEach((att) => {
    att.setAttribute("data-upgraded", "1");

    const titleEl = att.querySelector(".attachment-title");
    const audio = att.querySelector("audio");
    const video = att.querySelector("video");
    const link = att.querySelector("a[href]");
    const href = link ? (link.getAttribute("href") || "") : "";
    const isImage = !!link && /\.(png|jpg|jpeg|gif|webp)$/i.test(href);
    const isPdf = !!link && /\.pdf$/i.test(href);

    let url = "";
    let name = "";

    if (audio) url = audio.getAttribute("src") || "";
    if (video) url = video.getAttribute("src") || "";
    if (link) url = link.getAttribute("href") || url;

    name =
      (titleEl && titleEl.textContent && titleEl.textContent.trim()) ||
      (link && link.textContent && link.textContent.trim()) ||
      getFilenameFromUrl(url);

    const icon = fileIconByName(name, "");
    const mimeGuess =
      (audio && audio.getAttribute("type")) ||
      (video && video.getAttribute("type")) ||
      "";
    const safeUrl = escapeHtml(url);

    const card = document.createElement("div");
    card.className = "att-card";
    if (url) card.setAttribute("data-att-url", url);
    const openAction =
      audio
        ? `<button type="button" class="att-btn att-play" aria-label="Play audio" title="Play audio"><i class="fa-solid fa-play"></i></button>`
        : url
          ? `<a class="att-btn" href="${safeUrl}" target="_blank" rel="noopener noreferrer" title="Open"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>`
          : "";
    const pinAction =
      url
        ? `<button type="button" class="att-btn att-pin" title="Pin"><i class="fa-solid fa-thumbtack"></i></button>`
        : "";
    const downloadAction =
      url
        ? `<a class="att-btn" href="${safeUrl}" download title="Download"><i class="fa-solid fa-download"></i></a>`
        : "";
    const generalMarkup = `
      <div class="att-top">
        <div class="att-ic"><i class="${icon}"></i></div>
        <div class="att-meta">
          <div class="att-name" title=""></div>
          <div class="att-sub"></div>
        </div>
        <div class="att-actions">
          ${openAction}
          ${pinAction}
          ${downloadAction}
        </div>
      </div>
      <div class="att-preview" hidden></div>
    `;
    const barsHtml = "<div class=\"att-audio-bars\" aria-hidden=\"true\">" +
      "<span></span>".repeat(6) +
      "</div>";
    const audioMarkup = `
      <div class="att-card-audio-row">
        <button type="button" class="att-btn att-play att-play-inline" aria-label="Play audio">
          <i class="fa-solid fa-play"></i>
        </button>
        <div class="att-card-audio-info">
          <div class="att-audio-ui" data-audio-url="${safeUrl}">
            ${barsHtml}
          </div>
        </div>
      <div class="att-card-audio-meta">
        <div class="att-card-audio-actions">
          <button type="button" class="att-btn att-thread" title="Open thread">
            <i class="fa-solid fa-comment"></i>
          </button>
          ${downloadAction}
          ${buildAudioOptionsMenu()}
        </div>
      </div>
      </div>
      <audio class="att-media att-audio-hidden" preload="metadata" src="${safeUrl}"></audio>
    `;
    card.innerHTML = audio ? audioMarkup : generalMarkup;
    card.classList.toggle("att-card-audio", audio);

    if (!audio) {
      const nameEl = card.querySelector(".att-name");
      if (nameEl) {
        nameEl.textContent = name;
        nameEl.setAttribute("title", name);
      }

      const sub = card.querySelector(".att-sub");
      if (sub) {
        if (video) sub.textContent = "Video message";
        else if (isPdf) sub.textContent = "PDF document";
        else sub.textContent = "File attachment";
      }

      const preview = card.querySelector(".att-preview");

      const makePreviewClickable = (handler) => {
        if (!preview) return;
        preview.style.cursor = "pointer";
        preview.addEventListener("click", handler);
      };

      if (isImage && link) {
        const imgUrl = link.getAttribute("href");
        const img = document.createElement("img");
        img.src = imgUrl;
        img.className = "att-media att-image";
        img.loading = "lazy";

        if (preview) {
          preview.hidden = false;
          preview.appendChild(img);
        }
        if (sub) sub.textContent = "Image";

        makePreviewClickable(() => openAttachmentLightbox({ url: imgUrl, type: "image" }));
      } else if (video) {
        video.classList.add("att-media", "att-video-thumb");
        video.setAttribute("preload", "metadata");
        video.setAttribute("playsinline", "true");
        video.muted = true;
        video.controls = true;

        const vUrl = video.getAttribute("src") || url;

        if (preview) {
          preview.hidden = false;
          preview.appendChild(video);

          const overlay = document.createElement("div");
          overlay.className = "att-overlay";
          overlay.innerHTML = `<div class="att-play"><i class="fa-solid fa-play"></i></div>`;
          preview.appendChild(overlay);
        }

        makePreviewClickable(() => openAttachmentLightbox({ url: vUrl, type: "video" }));

        video.addEventListener("loadedmetadata", () => {
          const d = video.duration;
          if (Number.isFinite(d) && sub) {
            sub.textContent = `Video • ${formatDuration(d)}`;
          }
        });
      } else if (isPdf && link) {
        const pdfUrl = link.getAttribute("href") || "";
        const sizeText = (sub && sub.textContent && sub.textContent.trim()) || "";
        const sizeLabel = sizeText.replace(/pdf\s*•\s*/i, "").trim() || sizeText;

        card.className = "att-pdf-card";
        card.style.display = "inline-block";
        card.style.width = "auto";
        card.style.padding = "0";
        card.style.border = "0";
        card.style.background = "transparent";
        card.style.boxShadow = "none";

        if (pdfUrl) {
          card.setAttribute("data-att-url", pdfUrl);
          card.setAttribute("data-mime", mimeGuess || "application/pdf");
        }

        card.innerHTML = buildPdfGmailMarkup({
          name,
          url: pdfUrl,
          sizeLabel
        });
      }
    } else {
      const wrap = card.querySelector(".att-audio-ui");
      const audioEl = card.querySelector("audio.att-media");
      if (audioEl) {
        audioEl.classList.add("att-audio-hidden");
        audioEl.setAttribute("preload", "metadata");
      }
      if (wrap) {
        wrap.dataset.audioUrl = safeUrl;
      }
      if (wrap && audioEl) {
        enhanceAudioWaveform(wrap, audioEl).catch(() => {
          audioEl.classList.remove("att-audio-hidden");
          audioEl.controls = true;
          if (wrap.parentElement) wrap.remove();
        });
      }
    }

    if (url) {
      const pinBtn = card.querySelector(".att-pin");
      if (pinBtn) {
        const refresh = () => {
          const pinned = isPinned(url, getActiveChannelId());
          card.classList.toggle("pinned", pinned);
          pinBtn.style.opacity = pinned ? "1" : "0.75";
        };
        refresh();
        pinBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          togglePinnedAttachment({
            url,
            name,
            channelId: getActiveChannelId(),
            mimeType: mimeGuess,
            kind: audio ? "Audio" : video ? "Video" : isPdf ? "PDF" : isImage ? "Image" : "File",
            ts: Date.now()
          });
          refresh();
          showToast(isPinned(url, getActiveChannelId()) ? "Pinned" : "Unpinned");
          renderPinnedDrawer();
          renderPinnedSidebar();
        });
      }
    }

  att.replaceWith(card);
  });

  hydratePdfThumbs(root);
  bindPdfMiniCardClicks(root);
  refreshPinnedMarkersInDOM(root);

  setupAudioCardOptions(root);
}

function annotateAudioCards(root, messageId, channelId) {
  if (!root) return;
  root.querySelectorAll(".att-card.att-card-audio").forEach((card) => {
    if (messageId !== undefined && messageId !== null) {
      card.dataset.messageId = String(messageId);
    }
    if (channelId !== undefined && channelId !== null) {
      card.dataset.channelId = String(channelId);
    }
  });
}

function getMessageForAudioCard(card) {
  if (!card) return null;
  const messageId = card.dataset.messageId;
  const channelId = card.dataset.channelId || currentChannelId;
  if (!messageId || !channelId) return null;
  const list = messagesByChannel[channelId] || [];
  return list.find((msg) => String(msg.id) === String(messageId)) || null;
}

function updateAudioCardOptionsVisibility(card) {
  if (!card) return;
  const menu = card.querySelector(".att-options-menu");
  if (!menu) return;
  const msg = getMessageForAudioCard(card);
  const isAdminOrTeacher = isAdminUser() || isTeacherUser();
  const canEdit = canModifyMessage(msg);
  const canDelete = !!msg && (canEdit || isAdminOrTeacher);
  const copyBtn = menu.querySelector('[data-action="copy"]');
  const shareBtn = menu.querySelector('[data-action="share"]');
  const editBtn = menu.querySelector('[data-action="edit"]');
  const deleteBtn = menu.querySelector('[data-action="delete"]');
  if (copyBtn) copyBtn.hidden = !isAdminOrTeacher;
  if (shareBtn) shareBtn.hidden = !isAdminOrTeacher;
  if (editBtn) editBtn.hidden = !canEdit;
  if (deleteBtn) deleteBtn.hidden = !canDelete;
}

function closeAllAttachmentOptions() {
  document.querySelectorAll(".att-options.open").forEach((el) => el.classList.remove("open"));
}

async function handleAudioCardMenuAction(card, action) {
  if (!card || !action) return;
  const messageId = card.dataset.messageId;
  const channelId = card.dataset.channelId || currentChannelId;
  if (!messageId || !channelId) return;
  const msg = getMessageForAudioCard(card);
  if (!msg) return;
  if (action === "copy") {
    copyMessageLink(channelId, messageId);
  } else if (action === "share") {
    shareMessageLink(channelId, messageId);
  } else if (action === "edit") {
    if (canModifyMessage(msg)) {
      const bubble =
        card.closest(".message-bubble") ||
        card.closest(".thread-parent-bubble") ||
        card.closest(".thread-reply-bubble");
      if (bubble) {
        startInlineEdit(msg, bubble, channelId);
      }
    }
  } else if (action === "delete") {
    const ok = confirm("Delete this message?");
    if (!ok) return;
    try {
      await deleteMessage(msg.id);
    } catch (err) {
      console.error("Failed to delete message", err);
      showToast(err && err.message ? err.message : "Could not delete message");
    }
  }
  closeAllAttachmentOptions();
  closeAllMessageMenus();
}

function setupAudioCardOptions(root = document) {
  if (!root) return;
  root.querySelectorAll(".att-card.att-card-audio").forEach((card) => {
    if (!card) return;
    if (card.dataset.attOptionsBound === "1") {
      updateAudioCardOptionsVisibility(card);
      return;
    }
    const options = card.querySelector(".att-options");
    if (!options) return;
    const toggle = options.querySelector(".att-options-toggle");
    const menuButtons = options.querySelectorAll(".att-options-item");
    const handleToggle = (evt) => {
      evt.stopPropagation();
      const wasOpen = options.classList.contains("open");
      closeAllAttachmentOptions();
      if (!wasOpen) {
        closeAllMessageMenus();
        options.classList.add("open");
      }
    };
    if (toggle) {
      toggle.addEventListener("click", handleToggle);
    }
    menuButtons.forEach((btn) => {
      btn.addEventListener("click", async (evt) => {
        evt.stopPropagation();
        evt.preventDefault();
        const action = btn.dataset.action;
        await handleAudioCardMenuAction(card, action);
      });
    });
    card.dataset.attOptionsBound = "1";
    updateAudioCardOptionsVisibility(card);
  });
}

// ===================== MESSAGE SENDING =====================

async function sendMessage() {
  if (showSavedOnly) return;
  if (!messageInput) return;
  if (isPolicyAcceptanceRequired() && !policyAccepted) {
    showToast("Please accept Privacy & Rules to continue.");
    await openPrivacyRulesChannel();
    return;
  }
  if (!canPostInChannel(currentChannelId)) {
    showToast("You do not have permission to post in this channel.");
    return;
  }
  if (pendingUploads.some((u) => u.status === "uploading")) {
    showToast("Please wait for uploads to finish.");
    return;
  }
  // get latest HTML from the editor
  syncEditorToTextarea();
  const rawText =
    (messageInput.value || "").trim() || (rteEditor?.innerHTML || "").trim();
  const baseText = sanitizeMessageHTML(rawText).trim();
  const readyAttachments = pendingUploads.filter((f) => !f.status || f.status === "ready");
  const voiceOnly = isVoiceOnlyClubChannel(currentChannelId);
  const speakingClubAttachments = readyAttachments.filter((f) =>
    String(f.mimeType || "").toLowerCase().startsWith("audio/")
  );

  if (voiceOnly && baseText) {
    showToast("Text messages are disabled in Speaking Club");
    return;
  }

  if (voiceOnly && !speakingClubAttachments.length) {
    showToast("Record a voice message before sending.");
    return;
  }

  if (voiceOnly && speakingClubAttachments.length !== readyAttachments.length) {
    showToast("Speaking Club only accepts voice recordings.");
    return;
  }

  const attachmentsToSend = voiceOnly ? speakingClubAttachments : readyAttachments;
  const attachmentHtml = attachmentsToSend.map((f) => buildAttachmentCard(f)).join("");
  const text = sanitizeMessageHTML(`${baseText}${attachmentHtml}`).trim();
  const attachments = attachmentsToSend.map((f) => ({
    url: f.url,
    originalName: f.originalName,
    mimeType: f.mimeType,
    size: f.size
  }));

  if (!text && !attachments.length) return;

  const authorName =
    (sessionUser && (sessionUser.name || sessionUser.username || sessionUser.email)) ||
    "You";
  const initials = generateInitials(authorName) || "YOU";
  const avatarUrl = sessionUser ? sessionUser.avatarUrl || null : null;

  const dmId = dmIdFromChannel(currentChannelId);
  const isDm = !!dmId;
  const isCultureChannel = isCultureExchangeChannel(currentChannelId);

  try {
    const payload = {
      author: authorName,
      initials,
      text,
      avatarUrl,
      attachments
    };
    if (!isDm) {
      payload.language = isCultureChannel ? "auto" : (sessionUser?.nativeLanguage || "en");
    }
    const msg = await fetchJSON(
      isDm ? `/api/dms/${dmId}/messages` : `/api/channels/${currentChannelId}/messages`,
      {
        method: "POST",
        headers: isDm ? { "x-user-id": getCurrentUserId() } : undefined,
        body: JSON.stringify(payload)
      }
    );

    msg.avatarUrl = avatarUrl;
    if (!messagesByChannel[currentChannelId]) {
      messagesByChannel[currentChannelId] = [];
    }
    const arr = messagesByChannel[currentChannelId];
    const msgIdStr = String(msg.id);
    if (!arr.some((m) => String(m.id) === msgIdStr)) {
      arr.push(msg);
    }

    messageInput.value = "";
    if (rteEditor) rteEditor.innerHTML = "";
    pendingUploads = [];
    renderPendingAttachments();
    renderPinnedDrawer();
    updateSendButtonState();
    saveDraftForCurrentChannel();
    collapseComposerIfEmpty();
    renderMessages(currentChannelId);
    scrollMessagesToBottom();
    typingActive = false;
    sendTypingSignal(false);


  } catch (err) {
    console.error("Failed to send message", err);
    showToast("Could not send message");
  }
}

async function sendThreadReply() {
  if (isSendingThread) return;
  if (!currentThreadMessage || !threadInput) return;

  if (isPolicyAcceptanceRequired() && !policyAccepted) {
    showToast("Please accept Privacy & Rules to continue.");
    await openPrivacyRulesChannel();
    return;
  }

  const channelId = currentThreadChannelId || currentChannelId;

  if (isAdminOnlyToolChannel(channelId) && !isAdminUser()) {
    showToast("Only admins can post in this channel.");
    return;
  }

  if (threadPendingUploads.some((u) => u.status === "uploading")) {
    showToast("Please wait for uploads to finish.");
    return;
  }

  const rawText = threadInput.value.trim();
  const baseText = sanitizeMessageHTML(rawText).trim();

  const readyAttachments = threadPendingUploads.filter((u) => u.status === "ready" && u.url);

  const isSpeakingClubThread = isSpeakingClubChannel(channelId);
  const speakingClubAttachments = readyAttachments.filter((f) =>
    String(f.mimeType || "").toLowerCase().startsWith("audio/")
  );

  if (isSpeakingClubThread && baseText) {
    showToast("Text replies are disabled in Speaking Club threads.");
    return;
  }
  if (isSpeakingClubThread && !speakingClubAttachments.length) {
    showToast("Record a voice reply before sending.");
    return;
  }
  if (isSpeakingClubThread && speakingClubAttachments.length !== readyAttachments.length) {
    showToast("Speaking Club threads only accept voice replies.");
    return;
  }

  const attachmentsToSend = isSpeakingClubThread ? speakingClubAttachments : readyAttachments;

  const attachmentHtml = attachmentsToSend.map((f) => buildAttachmentCard(f)).join("");
  const text = sanitizeMessageHTML(`${baseText}${attachmentHtml}`).trim();

  if (!text && !attachmentsToSend.length) return;
  if (!text && !isSpeakingClubThread) return;

  const attachments = attachmentsToSend.map((f) => ({
    url: f.url,
    originalName: f.originalName,
    mimeType: f.mimeType,
    size: f.size
  }));

  const authorName =
    (sessionUser && (sessionUser.name || sessionUser.username || sessionUser.email)) ||
    "You";
  const initials = generateInitials(authorName) || "YOU";
  const avatarUrl = sessionUser ? sessionUser.avatarUrl || null : null;

  isSendingThread = true;
  if (threadSendButton) threadSendButton.disabled = true;
  const dmId = isDmChannel(channelId) ? dmIdFromChannel(channelId) : null;

  try {
    const reply = await fetchJSON(
      dmId
        ? `/api/dms/${dmId}/messages/${currentThreadMessage.id}/replies`
        : `/api/channels/${channelId}/messages/${currentThreadMessage.id}/replies`,
      {
        method: "POST",
        headers: dmId ? { "x-user-id": getCurrentUserId() } : undefined,
        body: JSON.stringify({
          author: authorName,
          initials,
          text,
          avatarUrl,
          attachments
        })
      }
    );

    reply.avatarUrl = avatarUrl;
    if (!currentThreadMessage.replies) currentThreadMessage.replies = [];
    const repliesRef = currentThreadMessage.replies;
    if (!repliesRef.some((r) => String(r.id) === String(reply.id))) {
      repliesRef.push(reply);
    }

    const channelMessages = messagesByChannel[channelId] || [];
    const idx = channelMessages.findIndex((m) => m.id === currentThreadMessage.id);
    if (idx !== -1) {
      const msgRef = channelMessages[idx];
      if (!msgRef.replies) msgRef.replies = [];
      if (!msgRef.replies.some((r) => String(r.id) === String(reply.id))) {
        msgRef.replies.push(reply);
      }
    }

    threadInput.value = "";
    threadPendingUploads = [];
    renderThreadPendingAttachments();
    renderThreadReplies();
    scrollThreadToBottom();
    if (!showSavedOnly && currentChannelId === channelId) {
      refreshCommenterAvatars(currentThreadMessage.id, channelId);
    }
    typingActive = false;
    sendTypingSignal(false);
  } catch (err) {
    console.error("Failed to send thread reply", err);
    showToast("Could not send reply");
  } finally {
    isSendingThread = false;
    if (threadSendButton) threadSendButton.disabled = false;
  }
}

// ===================== TYPING INDICATOR =====================

let typingActive = false;

function handleTyping() {
  if (showSavedOnly) return;
  if (!canPostInChannel(currentChannelId)) return;
  if (!messageInput) return;
  if (!typingActive) {
    typingActive = true;
    sendTypingSignal(true);
  }
  if (typingStopTimer) clearTimeout(typingStopTimer);
  typingStopTimer = setTimeout(() => {
    typingActive = false;
    sendTypingSignal(false);
  }, 2000);
}

// ===================== SIDEBAR NAV =====================

navItems.forEach((btn) => {
  btn.addEventListener("click", () => {
    navItems.forEach((b) => b.classList.remove("rail-btn-active"));
    btn.classList.add("rail-btn-active");

    const view = btn.dataset.view;
    if (!channelList || !dmList) return;

    if (view === "saved") {
      showSavedOnly = true;
      channelList.classList.add("hidden");
      dmList.classList.add("hidden");
      if (messageInput) {
        messageInput.disabled = true;
        messageInput.placeholder = "Saved messages (read-only)";
      }
      if (sendButton) sendButton.disabled = true;
      renderSavedMessages();
      return;
    }

    if (view === "dms") {
      showSavedOnly = false;
      channelList.classList.add("hidden");
      dmList.classList.remove("hidden");
      if (messageInput) {
        messageInput.disabled = false;
        messageInput.placeholder = "Write a message…";
      }
      if (sendButton) sendButton.disabled = false;
      updateComposerForChannel(currentChannelId);
      return;
    }

    if (view === "settings") {
      showSavedOnly = false;
      channelList.classList.remove("hidden");
      dmList.classList.add("hidden");
      if (messageInput) {
        messageInput.disabled = false;
        messageInput.placeholder = "Write a message…";
      }
      if (sendButton) sendButton.disabled = false;
      updateComposerForChannel(currentChannelId);
      openSettingsOverlay();
      return;
    }

    if (view === "admin") {
      if (!isAdminUser()) return;
      openAdminDock();
      return;
    }

    // default: channels
    showSavedOnly = false;
    channelList.classList.remove("hidden");
    dmList.classList.add("hidden");
      if (messageInput) {
        messageInput.disabled = false;
        const ch = getChannelById(currentChannelId);
        messageInput.placeholder = ch ? `Write a message in #${ch.name}` : "Write a message…";
      }
    if (sendButton) sendButton.disabled = false;
    updateComposerForChannel(currentChannelId);

    // refresh normal view
    refreshMessagesView();
  });
});


// ===================== COMMAND OVERLAY =====================

function openCommandOverlay() {
  if (!commandOverlay || !commandOverlayInput) return;
  commandOverlay.classList.remove("hidden");
  commandOverlayInput.value = "";
  commandOverlayInput.focus();
}

function closeCommandOverlay() {
  if (!commandOverlay) return;
  commandOverlay.classList.add("hidden");
}

function openSettingsOverlay() {
  if (!settingsOverlay) return;
  settingsOverlay.classList.remove("hidden");
  loadEmployeesForWorkspace(currentWorkspaceId);
}

function closeSettingsOverlay() {
  if (!settingsOverlay) return;
  settingsOverlay.classList.add("hidden");
}

function renderCommandLists() {
  if (!commandActionsList || !commandChannelsList) return;

  // ----- Quick actions -----
  commandActionsList.innerHTML = "";
  const actions = [
    {
      icon: "fa-solid fa-gear",
      label: "Open workspace settings",
      hint: "S"
    },
    {
      icon: "fa-solid fa-user-shield",
      label: "Open admin panel",
      hint: "A"
    },
    {
      icon: "fa-solid fa-headset",
      label: "Start a voice room in #general",
      hint: "Shift + V"
    },
    {
      icon: "fa-regular fa-bell",
      label: "View Inbox",
      hint: "I"
    }
  ];

  actions.forEach((a) => {
    const div = document.createElement("div");
    div.className = "command-item";
    div.innerHTML = `
      <div class="command-item-icon"><i class="${a.icon}"></i></div>
      <div class="command-item-label">
        <span>${a.label}</span>
        <small>${a.hint}</small>
      </div>
    `;
    commandActionsList.appendChild(div);
  });

  // ----- Channels -----
  commandChannelsList.innerHTML = "";
  const visibleChannels = channels.filter(
    (c) => (c.workspaceId || "default") === currentWorkspaceId
  );
  visibleChannels.forEach((ch) => {
    const div = document.createElement("div");
    div.className = "command-item";
    div.innerHTML = `
      <div class="command-item-icon"><i class="fa-solid fa-hashtag"></i></div>
      <div class="command-item-label">
        <span>#${ch.name}</span>
        <small>${ch.topic || ""}</small>
      </div>
    `;
    div.addEventListener("click", () => {
      selectChannel(ch.id);
      closeCommandOverlay();
    });
    commandChannelsList.appendChild(div);
  });
}

// Global keyboard shortcuts for overlays
document.addEventListener("keydown", (e) => {
  const key = typeof e.key === "string" ? e.key.toLowerCase() : "";
  if (!key) return;

  // Ctrl/Cmd + K → command palette
  if ((e.ctrlKey || e.metaKey) && key === "k") {
    e.preventDefault();
    if (!commandOverlay) return;
    if (commandOverlay.classList.contains("hidden")) {
      openCommandOverlay();
    } else {
      closeCommandOverlay();
    }
    return;
  }

  // Escape → close overlays
  if (key === "escape") {
    closeCommandOverlay();
    closeThread();
    closeSettingsOverlay();
    closeAdminOverlay();
  }
});

// click on backdrop to close command overlay
if (commandOverlay) {
  commandOverlay.addEventListener("click", (e) => {
    if (e.target === commandOverlay) {
      closeCommandOverlay();
    }
  });
}

// Search pill expand + submit
function handleCommandSearchSubmit(query) {
  const q = (query || "").trim();
  if (!q) return;
  if (commandOverlay && commandOverlayInput) {
    openCommandOverlay();
    commandOverlayInput.value = q;
  }
}

function collapseCommandBarIfEmpty() {
  if (!commandBar || !commandInput) return;
  if (commandInput.value.trim()) return;
  commandBar.classList.remove("expanded");
  hideHeaderSearchResults();
}

if (commandBar) {
  commandBar.addEventListener("click", () => {
    if (commandBar.classList.contains("expanded") && commandInput === document.activeElement) {
      return;
    }
    commandBar.classList.add("expanded");
    if (commandInput) {
      commandInput.focus();
      renderHeaderSearchResults(commandInput.value);
    }
  });
}

if (commandInput) {
  commandInput.addEventListener("input", () => {
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      renderHeaderSearchResults(commandInput.value);
    }, 180);
  });
  commandInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCommandSearchSubmit(commandInput.value);
    } else if (e.key === "Escape") {
      commandInput.value = "";
      collapseCommandBarIfEmpty();
    }
  });
  commandInput.addEventListener("blur", () => {
    setTimeout(collapseCommandBarIfEmpty, 50);
  });
}

// Close search dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (!commandBar || !headerSearchResults) return;
  if (
    commandBar.contains(e.target) ||
    headerSearchResults.contains(e.target)
  ) {
    return;
  }
  hideHeaderSearchResults();
  collapseCommandBarIfEmpty();
});

function getRecentMessagesForSearch(limit = 8) {
  const all = [];
  Object.keys(messagesByChannel || {}).forEach((cid) => {
    const list = messagesByChannel[cid] || [];
    list.forEach((m, idx) => {
      const order = idx + (list.length ? list.length : 0);
      all.push({ msg: m, channelId: cid, order });
    });
  });
  // Prefer createdAt desc if available, otherwise by natural order (last items last in array)
  all.sort((a, b) => {
    const aTime = a.msg.createdAt ? new Date(a.msg.createdAt).getTime() : a.order;
    const bTime = b.msg.createdAt ? new Date(b.msg.createdAt).getTime() : b.order;
    return bTime - aTime;
  });
  return all.slice(0, limit);
}

async function fetchSearchResultsFromServer(query) {
  if (!query) return [];
  const id = ++lastSearchRequest;
  const ws =
    currentWorkspaceId && currentWorkspaceId !== "all" ? currentWorkspaceId : "";
  const url =
    `/api/search?q=${encodeURIComponent(query)}` +
    (ws ? `&workspaceId=${encodeURIComponent(ws)}` : "");
  try {
    const results = await fetchJSON(
      url,
      {
        headers: { "x-user-id": getCurrentUserId() }
      }
    );
    // ignore out-of-order responses
    if (id !== lastSearchRequest) return [];
    return Array.isArray(results) ? results : [];
  } catch (err) {
    console.warn("Search failed", err);
    return [];
  }
}

async function renderHeaderSearchResults(query) {
  if (!headerSearchResults) return;
  const q = (query || "").trim().toLowerCase();
  headerSearchResults.innerHTML = "";
  headerSearchResults.classList.add("visible");

  // Show suggestions when empty query
  if (!q) {
    const label = document.createElement("div");
    label.className = "header-search-label";
    label.textContent = "Recent";
    headerSearchResults.appendChild(label);

    const recent = getRecentMessagesForSearch(8);
    if (!recent.length) {
      const empty = document.createElement("div");
      empty.className = "header-search-empty";
      empty.textContent = "No messages yet";
      headerSearchResults.appendChild(empty);
    } else {
      recent.forEach(({ msg, channelId }) => {
        headerSearchResults.appendChild(buildSearchItem(msg, channelId));
      });
    }
    return;
  }

  const matches = await fetchSearchResultsFromServer(q);

  headerSearchResults.innerHTML = "";
  if (!matches || !matches.length) {
    const empty = document.createElement("div");
    empty.className = "header-search-empty";
    empty.textContent = "No matches found";
    headerSearchResults.appendChild(empty);
  } else {
    matches.slice(0, 15).forEach((m) => {
      headerSearchResults.appendChild(buildSearchItem(m, m.channelId));
    });
  }
  headerSearchResults.classList.add("visible");
}

function buildSearchItem(msg, channelId) {
  const item = document.createElement("div");
  item.className = "header-search-item";
  item.dataset.messageId = msg.id;
  item.dataset.channelId = channelId;

  const avatar = document.createElement("div");
  avatar.className = "avatar avatar-xs";
  const avatarUrl = msg.avatarUrl || resolveAvatarUrl(msg.author, msg.initials);
  setAvatarPresence(
    avatar,
    msg.userId || msg.authorId || msg.user_id || "",
    msg.author
  );
  const searchRole = msg.role || resolveUserRole(msg.author, msg.initials);
  applyAvatarToNode(avatar, msg.initials, avatarUrl, msg.author, searchRole);

  const body = document.createElement("div");
  const meta = document.createElement("div");
  meta.className = "header-search-meta";
  const isDm = isDmChannel(channelId);
  const ch = isDm ? null : getChannelById(channelId);
  const channelLabel = isDm
    ? `· DM`
    : (msg.channelName && `· #${msg.channelName}`) || (ch ? `· #${ch.name}` : "");
  meta.textContent = `${msg.author || "Unknown"} ${channelLabel}`;

  const text = document.createElement("div");
  text.className = "header-search-text";
  text.textContent = msg.text || "";

  body.appendChild(meta);
  body.appendChild(text);

  item.appendChild(avatar);
  item.appendChild(body);

  item.addEventListener("click", async () => {
    hideHeaderSearchResults();
    if (isDm) {
      const dmId = dmIdFromChannel(channelId);
      if (dmId && `dm:${dmId}` !== currentChannelId) {
        await selectDM(dmId);
      }
    } else {
      if (channelId !== currentChannelId) {
        await selectChannel(channelId);
      }
    }
    scrollToMessage(msg.id);
  });

  return item;
}

function hideHeaderSearchResults() {
  if (!headerSearchResults) return;
  headerSearchResults.classList.remove("visible");
}

function scrollToMessage(messageId) {
  if (!messageId || !messagesContainer) return;
  const row = messagesContainer.querySelector(
    `.message-row[data-message-id="${messageId}"]`
  );
  if (row) {
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("pulse");
    setTimeout(() => row.classList.remove("pulse"), 600);
  } else {
    showToast("Message not found in this view");
  }
}

// scroll state persistence per channel
function restoreScrollForChannel(channelId) {
  if (!messagesContainer || !channelId) return;
  if (scrollState && typeof scrollState[channelId] === "number") {
    messagesContainer.scrollTop = scrollState[channelId];
  }
}

function restoreChatScrollWithRetry(channelId) {
  if (!messagesContainer || !channelId) return;
  const apply = () => {
    if (!restoreChatScrollFromAnchor(channelId)) {
      const target =
        scrollState && typeof scrollState[channelId] === "number"
          ? scrollState[channelId]
          : null;
      if (target === null) return;
      messagesContainer.scrollTop = target;
    }
  };
  requestAnimationFrame(() => {
    apply();
    setTimeout(apply, 120);
  });
}

function updateChatScrollAnchor(channelId) {
  if (!messagesContainer || !channelId) return;
  const rows = messagesContainer.querySelectorAll(".message-row");
  if (!rows.length) return;
  const containerRect = messagesContainer.getBoundingClientRect();
  let anchorRow = null;
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    if (rect.bottom > containerRect.top + 1) {
      anchorRow = row;
      break;
    }
  }
  if (!anchorRow) return;
  const rect = anchorRow.getBoundingClientRect();
  const offset = rect.top - containerRect.top;
  const id = anchorRow.dataset.messageId;
  if (!id) return;
  scrollAnchors[channelId] = { id, offset };
  persistScrollAnchors(scrollAnchors);
}

function restoreChatScrollFromAnchor(channelId) {
  if (!messagesContainer || !channelId) return false;
  const anchor = scrollAnchors[channelId];
  if (!anchor || !anchor.id) return false;
  const row = messagesContainer.querySelector(
    `.message-row[data-message-id="${CSS.escape(String(anchor.id))}"]`
  );
  if (!row) return false;
  const targetTop = Math.max(0, row.offsetTop - (anchor.offset || 0));
  messagesContainer.scrollTop = targetTop;
  return true;
}

function persistCurrentViewState() {
  if (messagesContainer && currentChannelId) {
    scrollState[currentChannelId] = messagesContainer.scrollTop;
    updateChatScrollAnchor(currentChannelId);
  }
  if (currentThreadMessage) {
    persistThreadScroll(currentThreadChannelId || currentChannelId, currentThreadMessage.id);
  }
  if (sidebarScroll) {
    persistSidebarScroll(sidebarScroll.scrollTop);
  }
  persistScrollState(scrollState);
  persistLastView({
    channelId: currentChannelId || null,
    threadMessageId: currentThreadMessage ? currentThreadMessage.id : null,
    threadChannelId: currentThreadChannelId || null,
    viewMode: directoryViewRole ? "directory" : undefined,
    directoryRole: directoryViewRole || null
  });
}

function getThreadScrollKey(channelId, messageId) {
  if (!channelId || !messageId) return null;
  return `thread:${makeThreadKey(channelId, messageId)}`;
}

function getThreadScroller() {
  if (!threadRepliesContainer || !threadPanel) {
    return threadPanel || threadRepliesContainer;
  }
  if (threadRepliesContainer.scrollHeight > threadRepliesContainer.clientHeight + 2) {
    return threadRepliesContainer;
  }
  return threadPanel;
}


function persistThreadScroll(channelId, messageId) {
  const key = getThreadScrollKey(channelId, messageId);
  const scroller = getThreadScroller();
  if (!key || !scroller) return;
  scrollState[key] = scroller.scrollTop;
  persistScrollState(scrollState);
}

function bindThreadScrollPersistence() {
  const scroller = getThreadScroller();
  if (!scroller || scroller.dataset.scrollBound === "1") return;
  scroller.dataset.scrollBound = "1";
  scroller.addEventListener(
    "scroll",
    () => {
      if (!currentThreadMessage) return;
      persistThreadScroll(currentThreadChannelId || currentChannelId, currentThreadMessage.id);
    },
    { passive: true }
  );
}


// ===================== EMOJI PICKER =====================

function trapFocus(modalEl) {
  const focusables = modalEl.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const list = Array.from(focusables).filter(
    (el) => !el.disabled && el.offsetParent !== null
  );
  if (!list.length) return () => {};

  const first = list[0];
  const last = list[list.length - 1];

  function onKeydown(e) {
    if (e.key !== "Tab") return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  modalEl.addEventListener("keydown", onKeydown);
  return () => modalEl.removeEventListener("keydown", onKeydown);
}

if (settingsOverlay) {
  settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) {
      closeSettingsOverlay();
    }
  });
}

if (settingsCloseBtn) {
  settingsCloseBtn.addEventListener("click", () => {
    closeSettingsOverlay();
  });
}

if (openPinnedBtn) {
  openPinnedBtn.addEventListener("click", () => {
    if (pinnedDrawer && !pinnedDrawer.hidden) {
      closePinnedDrawer();
    } else {
      openPinnedDrawer();
    }
  });
}

if (attLightboxClose) attLightboxClose.addEventListener("click", closeAttachmentLightbox);
if (attLightboxBackdrop) attLightboxBackdrop.addEventListener("click", closeAttachmentLightbox);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && attLightbox && !attLightbox.hidden) {
    closeAttachmentLightbox();
  }
});
if (settingsLogoutBtn) {
  settingsLogoutBtn.addEventListener("click", logout);
}
if (settingsOpenBtn) {
  settingsOpenBtn.addEventListener("click", () => {
    openAvatarModal();
  });
}
if (avatarModalClose) {
  avatarModalClose.addEventListener("click", closeAvatarModal);
}
if (avatarModalBackdrop) {
  avatarModalBackdrop.addEventListener("click", closeAvatarModal);
}
if (avatarCancelBtn) {
  avatarCancelBtn.addEventListener("click", closeAvatarModal);
}
if (avatarUploadInput) {
  avatarUploadInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (file) await handleAvatarFile(file);
  });
}
let avatarPresetButtons = [];

function renderAvatarPickerGroups() {
  if (!avatarPickerGroups || !dicebearAvatarGroups.length) return;
  avatarPickerGroups.innerHTML = dicebearAvatarGroups
    .map(
      (group) => `
        <div class="avatar-picker-group">
          <div class="avatar-picker-group-header">
            <strong>${group.title}</strong>
            ${group.description ? `<span>${group.description}</span>` : ""}
          </div>
          <div class="avatar-picker-group-grid">
            ${group.items
              .map(
                (item) => `
                  <button
                    type="button"
                    class="avatar-preset"
                    data-avatar="${item.url}"
                    data-label="${item.label}"
                    aria-label="${item.label} avatar"
                  >
                    <span>${item.label}</span>
                  </button>
                `
              )
              .join("")}
          </div>
        </div>
      `
    )
    .join("");
}

function initAvatarPresetButtons() {
  avatarPresetButtons = Array.from(
    document.querySelectorAll(".avatar-preset[data-avatar]")
  );
  avatarPresetButtons.forEach((btn) => {
    btn.style.backgroundImage = `url('${btn.dataset.avatar}')`;
    btn.addEventListener("click", () => {
      avatarPresetButtons.forEach((item) => item.classList.remove("active"));
      btn.classList.add("active");
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        avatarCropImage = img;
        drawAvatarPreview();
      };
      img.src = btn.dataset.avatar;
    });
  });
}

renderAvatarPickerGroups();
initAvatarPresetButtons();
if (avatarZoom) {
  avatarZoom.addEventListener("input", (e) => {
    avatarCropScale = parseFloat(e.target.value) || 1;
    drawAvatarPreview();
  });
}
if (openAvatarPickerBtn) {
  openAvatarPickerBtn.addEventListener("click", () => {
    if (avatarPickerOverlay && !avatarPickerOverlay.classList.contains("hidden")) {
      closeAvatarPickerOverlay();
    } else {
      openAvatarPickerOverlay();
    }
  });
}
if (avatarPickerOverlayBackdrop) {
  avatarPickerOverlayBackdrop.addEventListener("click", () => {
    closeAvatarPickerOverlay();
  });
}
if (avatarPickerCloseBtn) {
  avatarPickerCloseBtn.addEventListener("click", () => {
    closeAvatarPickerOverlay();
  });
}
if (avatarPickerCancelBtn) {
  avatarPickerCancelBtn.addEventListener("click", () => {
    closeAvatarPickerOverlay();
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && avatarPickerOverlay && !avatarPickerOverlay.classList.contains("hidden")) {
    closeAvatarPickerOverlay();
  }
});
if (avatarSaveBtn) {
  avatarSaveBtn.addEventListener("click", async () => {
    if (!avatarCropImage || !avatarPreview) {
      showToast("Choose an image first");
      return;
    }
    const dataUrl = avatarPreview.toDataURL("image/png");
    await uploadProfileAvatar(dataUrl);
    closeAvatarModal();
  });
}
if (adminOverlay) {
  adminOverlay.addEventListener("click", (e) => {
    if (e.target === adminOverlay) {
      closeAdminOverlay();
    }
  });
}
if (confirmOverlay) {
  confirmOverlay.addEventListener("click", (e) => {
    if (e.target === confirmOverlay) {
      closeConfirmModal(false);
    }
  });
}
if (confirmCancelBtn) {
  confirmCancelBtn.addEventListener("click", () => closeConfirmModal(false));
}
if (confirmOkBtn) {
  confirmOkBtn.addEventListener("click", () => closeConfirmModal(true));
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (confirmOverlay && !confirmOverlay.classList.contains("hidden")) {
    closeConfirmModal(false);
  }
});
if (adminCloseBtn) {
  adminCloseBtn.addEventListener("click", () => closeAdminOverlay());
}
if (adminFullscreenBtn) {
  adminFullscreenBtn.addEventListener("click", () => toggleAdminFullscreen());
}
if (superAdminQuickBtn) {
  superAdminQuickBtn.addEventListener("click", () => {
    if (!isSuperAdmin()) {
      showToast("Super admin access is required");
      return;
    }
    openAdminDock();
  });
}
if (adminLoginBtn) {
  adminLoginBtn.addEventListener("click", () => {
    const email = (adminEmailInput?.value || "").trim();
    const password = (adminPasswordInput?.value || "").trim();
    if (!email || !password) {
      if (adminLoginError) {
        adminLoginError.textContent = "Email and password are required";
        adminLoginError.style.display = "block";
      }
      return;
    }
    if (mainLoginEmail) mainLoginEmail.value = email;
    if (mainLoginPassword) mainLoginPassword.value = password;
    handleMainLogin();
  });
}
if (superAdminLanding) {
  superAdminLanding.addEventListener("click", (event) => {
    if (event.target === superAdminLanding) {
      setSuperAdminLanding(false);
    }
  });
}
if (superAdminLandingClose) {
  superAdminLandingClose.addEventListener("click", () => setSuperAdminLanding(false));
}
if (adminWsCreateBtn) {
  adminWsCreateBtn.addEventListener("click", adminCreateWorkspace);
}
if (adminUserCreateBtn) {
  adminUserCreateBtn.addEventListener("click", adminCreateUser);
}
if (adminChannelWorkspace) {
  adminChannelWorkspace.addEventListener("change", (e) => {
    adminChannelWorkspaceId = e.target.value;
    adminChannelSelectedMembers = new Set();
    loadAdminChannelUsers(adminChannelWorkspaceId);
    loadAdminChannels(adminChannelWorkspaceId === "all" ? "all" : adminChannelWorkspaceId);
  });
}
if (adminChannelUserSearch) {
  adminChannelUserSearch.addEventListener("input", () => {
    renderAdminChannelUsers();
  });
}
if (adminChannelCreateBtn) {
  adminChannelCreateBtn.addEventListener("click", adminCreateChannel);
}
if (adminAssignUserSearch) {
  adminAssignUserSearch.addEventListener("input", renderAssignUsers);
}
if (adminAssignUserSearchBtn) {
  adminAssignUserSearchBtn.addEventListener("click", renderAssignUsers);
}
if (adminAssignWorkspaceSearch) {
  adminAssignWorkspaceSearch.addEventListener("input", renderAssignWorkspaces);
}
if (adminAssignWorkspaceSearchBtn) {
  adminAssignWorkspaceSearchBtn.addEventListener("click", renderAssignWorkspaces);
}
if (adminAssignChannelSearch) {
  adminAssignChannelSearch.addEventListener("input", renderAssignChannels);
}
if (adminAssignChannelSearchBtn) {
  adminAssignChannelSearchBtn.addEventListener("click", renderAssignChannels);
}
if (adminAssignBtn) {
  adminAssignBtn.addEventListener("click", handleAdminAssign);
}
if (adminNavButtons.length) {
  adminNavButtons.forEach((btn) => {
    btn.addEventListener("click", () => setAdminTab(btn.dataset.adminTab));
  });
}
if (adminRefreshSchoolRequests) {
  adminRefreshSchoolRequests.addEventListener("click", () => loadAdminSchoolRequests());
}
if (adminSecurityRefresh) {
  adminSecurityRefresh.addEventListener("click", loadAdminSecurityDashboard);
}
if (secHoursTop) {
  secHoursTop.addEventListener("change", loadAdminSecurityTopAttacks);
}
if (secHoursIp) {
  secHoursIp.addEventListener("change", () => loadAdminSecurityFailedIp());
}
if (secExportTop) {
  secExportTop.addEventListener("click", () => {
    downloadCsv(
      `top_attacks_${Date.now()}.csv`,
      _lastTopAttacks.map((r) => ({
        identifier: r.identifier || "",
        failedCount: String(r.failedCount || 0),
        lastSeen: fmtTime(r.lastSeen)
      })),
      ["identifier", "failedCount", "lastSeen"]
    );
  });
}
if (secExportIp) {
  secExportIp.addEventListener("click", () => {
    downloadCsv(
      `failed_by_ip_${Date.now()}.csv`,
      _lastFailedIp.map((r) => ({
        ip: r.ip || "",
        failedCount: String(r.failedCount || 0),
        lastSeen: fmtTime(r.lastSeen),
        blocked: r.blocked ? "blocked" : "open"
      })),
      ["ip", "failedCount", "lastSeen", "blocked"]
    );
  });
}
if (secExportSessions) {
  secExportSessions.addEventListener("click", () => {
    downloadCsv(
      `sessions_${Date.now()}.csv`,
      _lastSessions.map((r) => ({
        id: r.id || "",
        email: r.email || r.user_id || "",
        workspaceId: r.workspaceId || "",
        ip: r.ip || "",
        created_at: fmtTime(r.created_at),
        expires_at: fmtTime(r.expires_at),
        revoked_at: r.revoked_at ? fmtTime(r.revoked_at) : "",
        user_agent: r.user_agent || ""
      })),
      ["id", "email", "workspaceId", "ip", "created_at", "expires_at", "revoked_at", "user_agent"]
    );
  });
}
if (secBlockIpBtn) {
  secBlockIpBtn.addEventListener("click", () => {
    const ip = (secBlockIpInput?.value || "").trim();
    if (!ip) {
      showToast("IP is required");
      return;
    }
    blockIp(ip, secBlockReasonInput?.value || "");
  });
}
if (secSessionSearch) {
  secSessionSearch.addEventListener("input", () => {
    clearTimeout(window.__secSessT);
    window.__secSessT = setTimeout(loadAdminSessions, 250);
  });
}
if (secSessionsRefresh) {
  secSessionsRefresh.addEventListener("click", () => loadAdminSessions());
}
if (adminSecFailedIp) {
  adminSecFailedIp.addEventListener("click", (event) => {
    const target = event.target.closest("[data-block-ip]");
    if (!target) return;
    const ip = target.dataset.blockIp;
    if (!ip) return;
    blockIp(ip, "Blocked via security dashboard");
  });
}
if (adminSecBlocklist) {
  adminSecBlocklist.addEventListener("click", (event) => {
    const target = event.target.closest("[data-unblock]");
    if (!target) return;
    const ip = target.dataset.unblock;
    if (!ip) return;
    unblockIp(ip);
  });
}
if (adminSecSessions) {
  adminSecSessions.addEventListener("click", (event) => {
    const target = event.target.closest("[data-revoke-session]");
    if (!target) return;
    const sessionId = target.dataset.revokeSession;
    if (!sessionId) return;
    revokeSession(sessionId);
  });
}
if (secSessionSearch) {
  secSessionSearch.addEventListener("input", () => loadAdminSecuritySessions());
}
if (secSessionsRefresh) {
  secSessionsRefresh.addEventListener("click", () => loadAdminSecuritySessions());
}
if (adminWorkspaceSearch) {
  adminWorkspaceSearch.addEventListener("input", renderAdminWorkspaces);
}
if (adminWorkspaceSort) {
  adminWorkspaceSort.addEventListener("change", renderAdminWorkspaces);
}
if (adminUserSearch) {
  adminUserSearch.addEventListener("input", renderAdminUsers);
}
if (adminUserSort) {
  adminUserSort.addEventListener("change", renderAdminUsers);
}
if (adminChannelSearch) {
  adminChannelSearch.addEventListener("input", renderAdminChannels);
}
if (adminChannelSort) {
  adminChannelSort.addEventListener("change", renderAdminChannels);
}
if (adminSecuritySearch) {
  adminSecuritySearch.addEventListener("input", loadAdminSecurityEvents);
}
if (adminSecurityType) {
  adminSecurityType.addEventListener("change", loadAdminSecurityEvents);
}
if (loginTabs.length) {
  loginTabs.forEach((btn) => {
    btn.addEventListener("click", () => setLoginTab(btn.dataset.loginTab));
  });
}
if (schoolRequestBtn) {
  schoolRequestBtn.addEventListener("click", handleSchoolRequest);
}
if (schoolLogoButton) {
  schoolLogoButton.addEventListener("click", (event) => {
    if (schoolLogoProfileBadge && schoolLogoProfileBadge.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
      toggleProfilePopover();
      return;
    }
    if (!isSchoolAdmin() && !isSuperAdmin()) {
      showToast("Only school admins can update the logo");
      return;
    }
    if (schoolLogoInput) schoolLogoInput.click();
  });
}
if (schoolLogoProfileBadge) {
  schoolLogoProfileBadge.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleProfilePopover();
    }
  });
}
if (schoolLogoInput) {
  schoolLogoInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    if (file) handleSchoolLogoUpload(file);
    e.target.value = "";
  });
}
if (openStudentsList) {
  openStudentsList.addEventListener("click", () => {
    hideAdminOverlays();
    showDirectoryList("student", { keepEmailHeader: true });
  });
}
if (openTeachersList) {
  openTeachersList.addEventListener("click", () => {
    hideAdminOverlays();
    showDirectoryList("teacher", { keepEmailHeader: true });
  });
}
if (openPrivacyRules) {
  openPrivacyRules.addEventListener("click", () => {
    hideAdminOverlays();
    if (openPrivacyRules.dataset.channelName) {
      openStaticChannel(openPrivacyRules);
    } else {
      openStaticChannel({
        dataset: { channelName: "Privacy & Rules", channelCategory: "tools" }
      });
    }
  });
}
if (openStudentRegistration) {
  openStudentRegistration.addEventListener("click", () =>
    openRegistrationModal(studentRegisterModal, studentRegisterError, "student")
  );
}
if (openTeacherRegistration) {
  openTeacherRegistration.addEventListener("click", () =>
    openRegistrationModal(teacherRegisterModal, teacherRegisterError, "teacher")
  );
}
if (studentRegisterSubmit) {
  studentRegisterSubmit.addEventListener("click", () =>
    submitRegistration({
      role: "student",
      firstNameEl: studentFirstName,
      lastNameEl: studentLastName,
      emailEl: studentEmail,
      passwordEl: studentPassword,
      confirmPasswordEl: studentPasswordConfirm,
      courseStartEl: studentCourseStart,
      courseEndEl: studentCourseEnd,
      courseLevelEl: studentCourseLevel,
      genderEl: studentGender,
      dateOfBirthEl: studentDob,
      phoneCountryEl: studentPhoneCountry,
      phoneNumberEl: studentPhoneNumber,
      nativeLanguageEl: studentNativeLanguage,
      learningGoalEl: studentLearningGoal,
      availableDaysInputs: studentAvailableDayInputs,
      emergencyNameEl: studentEmergencyName,
      emergencyPhoneEl: studentEmergencyPhone,
      emergencyRelationEl: studentEmergencyRelation,
      errorEl: studentRegisterError,
      modalEl: studentRegisterModal
    })
  );
}
if (studentSendLinkBtn) {
  studentSendLinkBtn.addEventListener("click", async () => {
    if (
      !validateRegistrationFields({
        role: "student",
        refs: {
          firstNameEl: studentFirstName,
          lastNameEl: studentLastName,
          dateOfBirthEl: studentDob,
          emailEl: studentEmail,
          courseLevelEl: studentCourseLevel
        },
        includePassword: false,
        errorEl: studentRegisterError
      })
    )
      return;

    const selectedCourseOption = studentCourseLevel?.selectedOptions?.[0];
    const courseLevel = selectedCourseOption?.dataset?.level
      ? selectedCourseOption.dataset.level.trim()
      : "";
    const channelId = (selectedCourseOption?.value || "").trim();

    const workspaceId = getRegistrationWorkspaceId();
    if (!workspaceId) {
      showToast("No school workspace selected");
      return;
    }

    setFieldInlineError(studentEmailError, "");
    setFieldInlineError(studentNameDobError, "");
    setFieldInlineError(studentPhoneError, "");
    if (studentEmail) studentEmail.classList.remove("input-error");
      try {
        studentSendLinkBtn.disabled = true;

        const payload = await fetchJSON("/api/register/send-link", {
        method: "POST",
        headers: { "x-admin": "1" },
        body: JSON.stringify({
          role: "student",
          workspaceId,
          email: studentEmail.value.trim(),
          firstName: studentFirstName.value.trim(),
          lastName: studentLastName.value.trim(),
          salutation: studentGender?.value || "",
          dateOfBirth: studentDob?.value || "",
          courseStart: studentCourseStart?.value || "",
          courseEnd: studentCourseEnd?.value || "",
          channelId: channelId || null,
          courseLevel: courseLevel || null,
          phoneCountry: studentPhoneCountry?.value || "",
          phoneNumber: studentPhoneNumber?.value.trim() || "",
          nativeLanguage: studentNativeLanguage?.value || "",
          learningGoal: studentLearningGoal?.value || "",
          availableDays: Array.from(studentAvailableDayInputs || [])
            .filter((input) => input?.checked)
            .map((input) => input?.value || ""),
          emergencyName: studentEmergencyName?.value.trim() || "",
          emergencyPhone: studentEmergencyPhone?.value.trim() || "",
          emergencyRelation: studentEmergencyRelation?.value || ""
        })
      });

        showToast("Registration link sent");
        console.log("Registration link:", payload.link);
        clearRegistrationFields("student");
      } catch (err) {
      console.error(err);
      const message = err?.message || "Could not send registration link.";
      const inlineMessage = `error:${message}`;
      const field = err?.payload?.field;
      if (field === "email") {
        setFieldInlineError(studentEmailError, inlineMessage);
        if (studentEmail) studentEmail.classList.add("input-error");
        setFieldInlineError(studentNameDobError, "");
        toggleInputErrorState([studentFirstName, studentLastName, studentDob], false);
        setFieldInlineError(studentPhoneError, "");
      } else if (field === "nameDob") {
        setFieldInlineError(studentNameDobError, inlineMessage);
        toggleInputErrorState([studentFirstName, studentLastName, studentDob], true);
        setFieldInlineError(studentEmailError, "");
        if (studentEmail) studentEmail.classList.remove("input-error");
        setFieldInlineError(studentPhoneError, "");
      } else if (field === "phone") {
        setFieldInlineError(studentPhoneError, inlineMessage);
        setFieldInlineError(studentEmailError, "");
        setFieldInlineError(studentNameDobError, "");
        toggleInputErrorState([studentFirstName, studentLastName, studentDob], false);
      } else {
        setFieldInlineError(studentEmailError, "");
        setFieldInlineError(studentNameDobError, "");
        toggleInputErrorState([studentFirstName, studentLastName, studentDob], false);
        setFieldInlineError(studentPhoneError, "");
      }
      showToast(message);
      if (studentRegisterError) {
        studentRegisterError.textContent = message;
        studentRegisterError.style.display = "block";
      }
    } finally {
      studentSendLinkBtn.disabled = false;
    }
  });
}
if (teacherRegisterSubmit) {
  teacherRegisterSubmit.addEventListener("click", () =>
    submitRegistration({
      role: "teacher",
      firstNameEl: teacherFirstName,
      lastNameEl: teacherLastName,
      emailEl: teacherEmail,
      passwordEl: teacherPassword,
      confirmPasswordEl: teacherPasswordConfirm,
      courseStartEl: teacherCourseStart,
      courseEndEl: teacherCourseEnd,
      courseLevelEl: teacherCourseLevel,
      genderEl: teacherGender,
      dateOfBirthEl: teacherDob,
      phoneCountryEl: teacherPhoneCountry,
      phoneNumberEl: teacherPhoneNumber,
      nativeLanguageEl: teacherLanguages,
      learningGoalEl: teacherLearningGoal,
      employmentEl: teacherEmployment,
      languagesEl: teacherLanguages,
      availableDaysInputs: teacherAvailableDayInputs,
      emergencyNameEl: teacherEmergencyName,
      emergencyPhoneEl: teacherEmergencyPhone,
      emergencyRelationEl: teacherEmergencyRelation,
      errorEl: teacherRegisterError,
      modalEl: teacherRegisterModal
    })
  );
}
if (teacherSendLinkBtn) {
  teacherSendLinkBtn.addEventListener("click", async () => {
    if (
      !validateRegistrationFields({
        role: "teacher",
        refs: {
          firstNameEl: teacherFirstName,
          lastNameEl: teacherLastName,
          dateOfBirthEl: teacherDob,
          emailEl: teacherEmail,
          courseLevelEl: teacherCourseLevel,
          employmentEl: teacherEmployment
        },
        includePassword: false,
        errorEl: teacherRegisterError
      })
    )
      return;

    const selectedCourseOption = teacherCourseLevel?.selectedOptions?.[0];
    const courseLevel = selectedCourseOption?.dataset?.level
      ? selectedCourseOption.dataset.level.trim()
      : "";
    const channelId = (selectedCourseOption?.value || "").trim();

    const workspaceId = getRegistrationWorkspaceId();
    if (!workspaceId) {
      showToast("No school workspace selected");
      return;
    }

    setFieldInlineError(teacherEmailError, "");
    setFieldInlineError(teacherNameDobError, "");
    if (teacherEmail) teacherEmail.classList.remove("input-error");
    try {
      teacherSendLinkBtn.disabled = true;

      const payload = await fetchJSON("/api/register/send-link", {
        method: "POST",
        headers: { "x-admin": "1" },
        body: JSON.stringify({
          role: "teacher",
          workspaceId,
          email: teacherEmail.value.trim(),
          firstName: teacherFirstName.value.trim(),
          lastName: teacherLastName.value.trim(),
          salutation: teacherGender?.value || "",
          dateOfBirth: teacherDob?.value || "",
          courseStart: teacherCourseStart?.value || "",
          courseEnd: teacherCourseEnd?.value || "",
          channelId: channelId || null,
          courseLevel: courseLevel || null,
          phoneCountry: teacherPhoneCountry?.value || "",
          phoneNumber: teacherPhoneNumber?.value.trim() || "",
          nativeLanguage: teacherLanguages?.value || "",
          learningGoal: teacherLearningGoal?.value || "",
          availableDays: Array.from(teacherAvailableDayInputs || [])
            .filter((input) => input?.checked)
            .map((input) => input?.value || ""),
          emergencyName: teacherEmergencyName?.value.trim() || "",
          emergencyPhone: teacherEmergencyPhone?.value.trim() || "",
          emergencyRelation: teacherEmergencyRelation?.value || ""
        })
      });

      showToast("Registration link sent");
        console.log("Registration link:", payload.link);
        clearRegistrationFields("teacher");
      } catch (err) {
      console.error(err);
      const message = err?.message || "Could not send registration link.";
      const inlineMessage = `error:${message}`;
      const field = err?.payload?.field;
      if (field === "email") {
        setFieldInlineError(teacherEmailError, inlineMessage);
        if (teacherEmail) teacherEmail.classList.add("input-error");
        setFieldInlineError(teacherNameDobError, "");
        toggleInputErrorState([teacherFirstName, teacherLastName, teacherDob], false);
      } else if (field === "nameDob") {
        setFieldInlineError(teacherNameDobError, inlineMessage);
        toggleInputErrorState([teacherFirstName, teacherLastName, teacherDob], true);
        setFieldInlineError(teacherEmailError, "");
        if (teacherEmail) teacherEmail.classList.remove("input-error");
      } else {
        setFieldInlineError(teacherEmailError, "");
        setFieldInlineError(teacherNameDobError, "");
        toggleInputErrorState([teacherFirstName, teacherLastName, teacherDob], false);
      }
      showToast(message);
      if (teacherRegisterError) {
        teacherRegisterError.textContent = message;
        teacherRegisterError.style.display = "block";
      }
    } finally {
      teacherSendLinkBtn.disabled = false;
    }
  });
}
if (studentRegisterClose) {
  studentRegisterClose.addEventListener("click", () =>
    closeRegistrationModal(studentRegisterModal, studentRegisterError)
  );
}
if (teacherRegisterClose) {
  teacherRegisterClose.addEventListener("click", () =>
    closeRegistrationModal(teacherRegisterModal, teacherRegisterError)
  );
}
if (studentRegisterModal) {
  studentRegisterModal.addEventListener("click", (e) => {
    if (e.target === studentRegisterModal) {
      closeRegistrationModal(studentRegisterModal, studentRegisterError);
    }
  });
}
if (teacherRegisterModal) {
  teacherRegisterModal.addEventListener("click", (e) => {
    if (e.target === teacherRegisterModal) {
      closeRegistrationModal(teacherRegisterModal, teacherRegisterError);
    }
  });
}
registrationClassSelects.forEach((select) => {
  if (!select) return;
  select.addEventListener("change", () => handleRegistrationClassChange(select));
});
if (studentEditClose) {
  studentEditClose.addEventListener("click", closeStudentEditModal);
}
if (studentEditSave) {
  studentEditSave.addEventListener("click", saveStudentEdits);
}
if (studentEditDelete) {
  studentEditDelete.addEventListener("click", deleteStudentProfile);
}
if (studentEditModal) {
  studentEditModal.addEventListener("click", (e) => {
    if (e.target === studentEditModal) closeStudentEditModal();
  });
}
if (classAssignClose) {
  classAssignClose.addEventListener("click", closeClassAssignModal);
}
if (classAssignSave) {
  classAssignSave.addEventListener("click", saveClassAssignment);
}
if (classAssignModal) {
  classAssignModal.addEventListener("click", (e) => {
    if (e.target === classAssignModal) closeClassAssignModal();
  });
}
if (adminChannelFilterWorkspace) {
  adminChannelFilterWorkspace.addEventListener("change", (e) => {
    loadAdminChannels(e.target.value || "all");
  });
}
if (adminOpenWorkspaceModal) {
  adminOpenWorkspaceModal.addEventListener("click", () => openAdminModal(adminWorkspaceModal));
}
if (adminOpenUserModal) {
  adminOpenUserModal.addEventListener("click", () => openAdminModal(adminUserModal));
}
if (adminOpenChannelModal) {
  adminOpenChannelModal.addEventListener("click", () => openAdminModal(adminChannelModal));
}
if (adminWorkspaceModalClose) {
  adminWorkspaceModalClose.addEventListener("click", () => closeAdminModal(adminWorkspaceModal));
}
if (adminUserModalClose) {
  adminUserModalClose.addEventListener("click", () => closeAdminModal(adminUserModal));
}
if (adminChannelModalClose) {
  adminChannelModalClose.addEventListener("click", () => closeAdminModal(adminChannelModal));
}
if (adminWorkspaceModal) {
  adminWorkspaceModal.addEventListener("click", (e) => {
    if (e.target === adminWorkspaceModal) closeAdminModal(adminWorkspaceModal);
  });
}
if (adminUserModal) {
  adminUserModal.addEventListener("click", (e) => {
    if (e.target === adminUserModal) closeAdminModal(adminUserModal);
  });
}
if (adminChannelModal) {
  adminChannelModal.addEventListener("click", (e) => {
    if (e.target === adminChannelModal) closeAdminModal(adminChannelModal);
  });
}

initRailAndComposerListeners();
if (adminThemeToggle) {
  adminThemeToggle.addEventListener("click", () => {
    if (themeToggle) themeToggle.click();
  });
}
if (adminFilterWorkspace) {
  adminFilterWorkspace.addEventListener("change", (e) => {
    loadAdminUsers(e.target.value);
  });
}
if (mainLoginBtn) {
  mainLoginBtn.addEventListener("click", handleMainLogin);
}
if (forgotPasswordBtn) {
  forgotPasswordBtn.addEventListener("click", () => {
    if (mainLoginBtn) mainLoginBtn.style.display = "none";
    if (forgotPasswordBtn) forgotPasswordBtn.style.display = "none";
    if (forgotPasswordPanel) forgotPasswordPanel.style.display = "block";
    if (forgotEmail) forgotEmail.focus();
  });
}
if (cancelForgotBtn) {
  cancelForgotBtn.addEventListener("click", () => {
    if (mainLoginBtn) mainLoginBtn.style.display = "";
    if (forgotPasswordBtn) forgotPasswordBtn.style.display = "";
    if (forgotPasswordPanel) forgotPasswordPanel.style.display = "none";
    if (forgotStatus) forgotStatus.textContent = "";
  });
}
if (sendResetBtn) {
  sendResetBtn.addEventListener("click", async () => {
    const email = (forgotEmail?.value || "").trim();
    if (!email) {
      if (forgotStatus) forgotStatus.textContent = "Please enter your email.";
      return;
    }
    sendResetBtn.disabled = true;
    if (forgotStatus) forgotStatus.textContent = "Sending reset email...";
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Could not send reset email");
      if (forgotStatus) {
        forgotStatus.textContent = "Reset email sent. Please check your inbox.";
      }
      setTimeout(() => {
        if (mainLoginBtn) mainLoginBtn.style.display = "";
        if (forgotPasswordBtn) forgotPasswordBtn.style.display = "";
        if (forgotPasswordPanel) forgotPasswordPanel.style.display = "none";
        if (forgotStatus) forgotStatus.textContent = "";
      }, 1200);
    } catch (err) {
      if (forgotStatus) {
        forgotStatus.textContent = err?.message || "Could not send reset email";
      }
    } finally {
      sendResetBtn.disabled = false;
    }
  });
}
if (mainLoginEmail) {
  mainLoginEmail.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleMainLogin();
    }
  });
}
if (mainLoginPassword) {
  mainLoginPassword.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleMainLogin();
    }
  });
}
if (schoolAdminPasswordInput) {
  schoolAdminPasswordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSchoolRequest();
    }
  });
}
if (studentPassword) {
  studentPassword.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (studentRegisterSubmit) studentRegisterSubmit.click();
    }
  });
}
if (teacherPassword) {
  teacherPassword.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (teacherRegisterSubmit) teacherRegisterSubmit.click();
    }
  });
}
// ensure login shows on first load if no session
if (!sessionUser && loginOverlay) {
  if (loginOverlay.parentElement !== document.body) {
    document.body.appendChild(loginOverlay);
  }
  loginOverlay.classList.remove("hidden");
  loginOverlay.style.display = "flex";
  if (mainLoginError) mainLoginError.style.display = "none";
  if (loginTabs.length) setLoginTab("signin");
}

// show gate immediately on load
if (loginOverlay && !sessionUser) {
  loginOverlay.classList.remove("hidden");
  loginOverlay.style.display = "flex";
  if (loginTabs.length) setLoginTab("signin");
}

// set initial badge visibility
updateNotificationBadgeVisibility();
updateMessageBadgeVisibility();
initRailDrag();

// ===================== EVENTS WIRING =====================

function ensureSendButtonBinding() {
  sendButton = document.getElementById("sendButtonMain");
  if (!sendButton) return;
  if (sendButton.dataset.sendBound === "1") return;
  sendButton.dataset.sendBound = "1";
  sendButton.addEventListener("click", sendMessage);
}

ensureSendButtonBinding();

if (threadSendButton) {
  threadSendButton.addEventListener("click", sendThreadReply);
}
if (threadInput) {
  threadInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendThreadReply();
    }
  });
}

if (closeThreadBtn) {
  closeThreadBtn.addEventListener("click", closeThread);
}
if (threadPanel && !threadPanel.dataset.a11yBound) {
  threadPanel.dataset.a11yBound = "1";
  threadPanel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeThread();
    }
  });
}
if (adminDock && !adminDock.dataset.a11yBound) {
  adminDock.dataset.a11yBound = "1";
  adminDock.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeAdminDock();
    }
  });
}

if (allUnreadsBtn) {
  allUnreadsBtn.addEventListener("click", openAllUnreads);
}
if (closeAllUnreadsBtn) {
  closeAllUnreadsBtn.addEventListener("click", closeAllUnreads);
}

if (messagesRailBtn) {
  messagesRailBtn.addEventListener("click", () => {
    openAllUnreads();
  });
}

// persist scroll position per channel
if (messagesContainer) {
  messagesContainer.addEventListener("scroll", () => {
    if (isRestoringView) return;
    if (!currentChannelId) return;
    scrollState[currentChannelId] = messagesContainer.scrollTop;
    persistScrollState(scrollState);
    if (!chatScrollRaf) {
      chatScrollRaf = requestAnimationFrame(() => {
        chatScrollRaf = 0;
        updateChatScrollAnchor(currentChannelId);
      });
    }
  });
}

if (sidebarScroll) {
  sidebarScroll.addEventListener(
    "scroll",
    () => {
      if (isRestoringView) return;
      persistSidebarScroll(sidebarScroll.scrollTop);
    },
    { passive: true }
  );
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", persistCurrentViewState);
  window.addEventListener("pagehide", persistCurrentViewState);
}

// AI assistant input
if (aiSendBtn) {
  aiSendBtn.addEventListener("click", sendAiMessage);
}
if (aiInput) {
  aiInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendAiMessage();
    }
  });

  if (!aiInput.dataset.autogrow) {
    aiInput.dataset.autogrow = "1";
    const grow = () => {
      aiInput.style.height = "auto";
      aiInput.style.height = Math.min(aiInput.scrollHeight, 180) + "px";
    };
    aiInput.addEventListener("input", grow);
    grow();
  }
}

// Rail buttons
if (homeRailBtn) {
  homeRailBtn.addEventListener("click", () => {
    showHomeView();
    setActiveRailButton(homeRailBtn);
  });
}

if (aiRailBtn) {
  aiRailBtn.addEventListener("click", () => {
    openAiAssistant();
    setActiveRailButton(aiRailBtn);
  });
}

if (unreadsCloseBtn && unreadsOverlay) {
  unreadsCloseBtn.addEventListener("click", closeAllUnreads);
  unreadsOverlay.addEventListener("click", (e) => {
    if (e.target === unreadsOverlay) closeAllUnreads();
  });
}

if (profilePopoverChangeAvatar) {
  profilePopoverChangeAvatar.addEventListener("click", () => {
    toggleProfilePopover();
    openAvatarModal();
  });
}
if (profilePopoverOpenProfile) {
  profilePopoverOpenProfile.addEventListener("click", async (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (profilePopover) profilePopover.hidden = true;
    try {
      await openCurrentUserProfile();
    } catch (err) {
      console.error("Failed to open user profile", err);
    }
  });
}
if (profilePopoverLogout) {
  profilePopoverLogout.addEventListener("click", () => {
    toggleProfilePopover();
    logout();
  });
}
if (railLogoutBtn) {
  railLogoutBtn.addEventListener("click", logout);
}
if (userProfileLogoutBtn) {
  userProfileLogoutBtn.addEventListener("click", () => {
    closeUserProfile();
    logout();
  });
}
if (filesRefreshBtn) {
  filesRefreshBtn.addEventListener("click", renderFilesPanel);
}
if (filesTypeButtons && filesTypeButtons.length) {
  filesTypeButtons.forEach((btn) => {
    if ((btn.dataset.filesType || "all") === filesTypeFilter) {
      btn.classList.add("is-active");
    }
    btn.addEventListener("click", () => {
      filesTypeButtons.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      filesTypeFilter = btn.dataset.filesType || "all";
      updateFilesExtraFilters();
      renderFilesPanel();
    });
  });
}
if (filesCategoryTabs && filesCategoryTabs.length) {
  filesCategoryTabs.forEach((btn) => {
    if ((btn.getAttribute("data-files-category") || "all") === filesCategoryFilter) {
      btn.classList.add("is-active");
    }
    btn.addEventListener("click", () => {
      filesCategoryTabs.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      filesCategoryFilter = btn.getAttribute("data-files-category") || "all";
      updateFilesExtraFilters();
      renderFilesPanel();
    });
  });
}

if (filesSearchInput) {
  filesQuery = (filesSearchInput.value || "").trim().toLowerCase();
  filesSearchInput.addEventListener("input", () => {
    filesQuery = (filesSearchInput.value || "").trim().toLowerCase();
    renderFilesPanel();
  });
}

if (filesRangeButtons && filesRangeButtons.length) {
  filesRangeButtons.forEach((btn) => {
    if ((btn.dataset.range || "all") === filesRangeMode) {
      btn.classList.add("is-active");
    }
    btn.addEventListener("click", () => {
      filesRangeButtons.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      filesRangeMode = btn.dataset.range || "all";
      renderFilesPanel();
    });
  });
}

function updateFilesTypeButtonsState() {
  if (!filesTypeButtons.length) return;
  filesTypeButtons.forEach((btn) => {
    btn.classList.toggle(
      "is-active",
      (btn.dataset.filesType || "all") === filesTypeFilter
    );
  });
}

function updateFilesRangeButtonsState() {
  if (!filesRangeButtons.length) return;
  filesRangeButtons.forEach((btn) => {
    btn.classList.toggle(
      "is-active",
      (btn.dataset.range || "all") === filesRangeMode
    );
  });
}

function updateFilesExtraFilters() {
  if (!filesExtraFilters) return;
  const showTypeRow = filesCategoryFilter !== "all";
  filesExtraFilters.classList.toggle("hidden", !showTypeRow);
  if (filesTypeRow) {
    filesTypeRow.classList.toggle("hidden", !showTypeRow);
  }
  const showRangeRow = showTypeRow && filesTypeFilter !== "all";
  if (filesRangeRow) {
    filesRangeRow.classList.toggle("hidden", !showRangeRow);
  }
  updateFilesTypeButtonsState();
  updateFilesRangeButtonsState();
}

if (filesList) {
  filesList.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const card = btn.closest(".file-card, .file-card-compact, .hw-card");
    if (!card) return;
    const url = card.getAttribute("data-url") || "";
    const channelId =
      card.getAttribute("data-channel-id") ||
      card.closest(".hw-card")?.getAttribute("data-channel-id") ||
      "";
    const messageId = card.getAttribute("data-message-id") || "";
    const fileId = card.getAttribute("data-file-id") || "";
    const canManage = isAdminUser() || isTeacherUser();
    const fileRef =
      filesCache.find((f) => f.fileId === fileId) ||
      filesCache.find(
        (f) =>
          f.url === url &&
          String(f.channelId || "") === String(channelId) &&
          String(f.messageId || "") === String(messageId)
      ) ||
      {
        fileId,
        url,
        channelId,
        messageId
      };

    if (action === "open-homework") {
      if (!channelId) return;
      showPanel("chatPanel");
      await selectChannel(channelId);
      return;
    }
    if (action === "open") {
      if (url) window.open(url, "_blank", "noopener");
      logFileEvent("view", fileRef);
      return;
    }
    if (action === "download") {
      if (!url) return;
      const a = document.createElement("a");
      a.href = url;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
      logFileEvent("download", fileRef);
      return;
    }
    if (action === "jump") {
      if (!channelId) return;
      showPanel("chatPanel");
      await selectChannel(channelId);
      if (messageId) {
        scrollToMessageInChat(messageId);
      }
      logFileEvent("open_in_chat", fileRef);
      return;
    }
    if (action === "pin") {
      if (!canManage || !fileRef.fileId) return;
      await pinFile(fileRef.fileId, !fileRef.pinned);
      await renderFilesPanel();
      return;
    }
    if (action === "replace") {
      if (!canManage || !fileRef.fileId) return;
      const picked = await pickOneFile();
      if (!picked) return;
      const uploaded = await uploadSingleFile(picked);
      if (!uploaded) {
        showToast("Upload failed");
        return;
      }
      await replaceFile(fileRef.fileId, fileRef, uploaded);
      await renderFilesPanel();
      return;
    }
    if (action === "delete") {
      if (!canManage || !fileRef.fileId) return;
      const ok = await openConfirmModal({
        title: "Delete file?",
        message: "Remove this file from the Files library? The chat message stays.",
        confirmText: "Delete",
        cancelText: "Cancel",
        danger: true
      });
      if (!ok) return;
      await deleteFile(fileRef.fileId);
      await renderFilesPanel();
    }
  });
}

document.addEventListener("click", (e) => {
  if (!profilePopover || profilePopover.hidden) return;
  const btn = document.querySelector(".app-rail-btn-profile");
  if (btn && (btn === e.target || btn.contains(e.target))) return;
  if (schoolLogoProfileBadge && (schoolLogoProfileBadge === e.target || schoolLogoProfileBadge.contains(e.target))) return;
  if (!profilePopover.contains(e.target)) {
    profilePopover.hidden = true;
  }
});

// media + file buttons
if (attachFileBtn && fileInput) {
  attachFileBtn.addEventListener("click", () => {
    fileInput.click();
  });
  fileInput.addEventListener("change", async () => {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;

    const ids = files.map(() =>
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
    );

    pendingUploads = pendingUploads.concat(
      files.map((f, i) => ({
        id: ids[i],
        status: "uploading",
        kind: "file",
        label: f.name,
        size: f.size,
        mimeType: f.type,
        progress: 0
      }))
    );
    renderPendingAttachments();

    if (!navigator.onLine) {
      try {
        for (let i = 0; i < files.length; i++) {
          await UploadQueueDB.put({
            id: ids[i],
            file: files[i],
            name: files[i].name,
            type: files[i].type,
            size: files[i].size,
            createdAt: Date.now()
          });
        }
        pendingUploads = pendingUploads.map((x) =>
          ids.includes(x.id) ? { ...x, status: "queued", progress: 0 } : x
        );
        renderPendingAttachments();
        showToast("Offline: uploads queued. Will retry when online.");
        fileInput.value = "";
        return;
      } catch (err) {
        console.error("Could not queue uploads", err);
      }
    }

    (async () => {
      showToast("Uploading file(s)...");
      try {
        const data = await uploadFilesWithProgress(files, (pct) => {
          pendingUploads = pendingUploads.map((x) =>
            ids.includes(x.id) ? { ...x, progress: pct } : x
          );
          renderPendingAttachments();
        });

        const uploaded = data.files || [];
        let idx = 0;
        pendingUploads = pendingUploads.map((x) => {
          if (!ids.includes(x.id)) return x;
          const u = uploaded[idx++];
          if (!u) return x;
          return {
            ...x,
            status: "ready",
            progress: 100,
            url: u.url,
            originalName: u.originalName,
            size: u.size,
            mimeType: u.mimeType
          };
        });
        renderPendingAttachments();
        showToast("Uploads finished");
      } catch (err) {
        console.error(err);
        pendingUploads = pendingUploads.filter((x) => !ids.includes(x.id));
        renderPendingAttachments();
        showToast("Could not upload files");
      } finally {
        fileInput.value = "";
      }
    })();
  });
}

if (threadAttachBtn && threadFileInput) {
  threadAttachBtn.addEventListener("click", () => {
    threadFileInput.click();
  });
  threadFileInput.addEventListener("change", async () => {
    const files = Array.from(threadFileInput.files || []);
    if (!files.length) return;

    const ids = files.map(() =>
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
    );

    threadPendingUploads = threadPendingUploads.concat(
      files.map((f, i) => ({
        id: ids[i],
        status: "uploading",
        kind: "file",
        label: f.name,
        size: f.size,
        mimeType: f.type,
        progress: 0
      }))
    );
    renderThreadPendingAttachments();

    if (!navigator.onLine) {
      showToast("Offline: thread uploads need an internet connection.");
      threadPendingUploads = threadPendingUploads.filter((x) => !ids.includes(x.id));
      renderThreadPendingAttachments();
      threadFileInput.value = "";
      return;
    }

    (async () => {
      showToast("Uploading file(s)...");
      try {
        const data = await uploadFilesWithProgress(files, (pct) => {
          threadPendingUploads = threadPendingUploads.map((x) =>
            ids.includes(x.id) ? { ...x, progress: pct } : x
          );
          renderThreadPendingAttachments();
        });

        const uploaded = data.files || [];
        let idx = 0;
        threadPendingUploads = threadPendingUploads.map((x) => {
          if (!ids.includes(x.id)) return x;
          const u = uploaded[idx++];
          if (!u) return x;
          return {
            ...x,
            status: "ready",
            progress: 100,
            url: u.url,
            originalName: u.originalName,
            size: u.size,
            mimeType: u.mimeType
          };
        });
        renderThreadPendingAttachments();
        showToast("Thread uploads finished");
      } catch (err) {
        console.error(err);
        threadPendingUploads = threadPendingUploads.filter((x) => !ids.includes(x.id));
        renderThreadPendingAttachments();
        showToast("Could not upload files");
      } finally {
        threadFileInput.value = "";
      }
    })();
  });
}

async function beginRecording(kind, opts = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Recording not supported in this browser.");
    return;
  }

  // Stop any existing recording
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    return;
  }

  const target = opts.target === "thread" ? "thread" : "main";
  recordingTarget = target;

  recordingKind = kind;
  recordedChunks = [];
  recStartTs = Date.now();
  recPausedMs = 0;

  const constraints = kind === "audio"
    ? { audio: true }
    : { audio: true, video: true };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    mediaRecorder = new MediaRecorder(stream);
    recStream = stream;
    if (recPreview && kind === "video") {
      recPreview.srcObject = stream;
      recPreview.hidden = false;
      recPreview.play().catch(() => {});
    }

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      stopComposerRecordingUI();
      // always stop tracks
      stream.getTracks().forEach((t) => t.stop());
      if (recStream === stream) recStream = null;
      if (recPreview) {
        recPreview.hidden = true;
        try {
          recPreview.srcObject = null;
        } catch (err) {
          // ignore
        }
      }
    };

    mediaRecorder.start();
    startComposerRecordingUI(kind, {
      onPause: () => mediaRecorder.pause(),
      onResume: () => mediaRecorder.resume(),
      onStop: () => {
        doneRecordingAndUpload();
      },
      onCancel: () => {
        try {
          if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
        } catch {}
        recordedChunks = [];
        recordingKind = null;
        stopComposerRecordingUI();
      }
    });
    showToast(kind === "audio" ? "Recording audio…" : "Recording video…");
  } catch (err) {
    console.error(err);
    showToast("Could not start recording.");
    stopComposerRecordingUI();
  }
}

async function doneRecordingAndUpload() {
  if (!mediaRecorder) return;

  const recorder = mediaRecorder;
  const kind = recordingKind;

  // Stop recorder and wait for data to flush
  if (recorder.state !== "inactive") {
    await new Promise((resolve) => {
      recorder.addEventListener("stop", resolve, { once: true });
      try {
        recorder.stop();
      } catch (err) {
        resolve();
      }
    });
  }

  stopComposerRecordingUI();

  // Build blob
  const mime = kind === "audio" ? "audio/webm" : "video/webm";
  const blob = new Blob(recordedChunks, { type: mime });
  recordedChunks = [];
  mediaRecorder = null;
  recordingKind = null;

  if (!blob.size) {
    recordingTarget = "main";
    showToast("Recording was empty. Nothing to upload.");
    return;
  }

  const file = new File([blob], `${kind}-message-${Date.now()}.webm`, { type: mime });
  const placeholder = {
    id: `${Date.now()}-${Math.random()}`,
    originalName: file.name,
    mimeType: mime,
    size: file.size,
    status: "uploading",
    progress: 0
  };

  const isThreadTarget = recordingTarget === "thread";
  const uploadsTarget = isThreadTarget ? threadPendingUploads : pendingUploads;
  const renderUploads = isThreadTarget ? renderThreadPendingAttachments : renderPendingAttachments;

  uploadsTarget.push(placeholder);
  renderUploads();

  const voiceOnly = isSpeakingClubChannel(
    isThreadTarget ? currentThreadChannelId : currentChannelId
  );

  try {
    showToast(`Uploading ${kind}…`);
    const data = await uploadFilesWithProgress([file], (pct) => {
      placeholder.progress = pct;
      renderUploads();
    });
    const uploaded =
      (data.files || []).map((f) => ({
        ...f,
        status: "ready",
        progress: 100
      }));

    const idx = uploadsTarget.findIndex((p) => p.id === placeholder.id);
    if (idx !== -1) {
      uploadsTarget.splice(idx, 1, ...uploaded);
    } else {
      uploadsTarget.push(...uploaded);
    }
    renderUploads();

    if (voiceOnly && kind === "audio") {
      if (isThreadTarget) {
        try {
          await sendThreadReply();
          showToast("Voice reply sent.");
        } catch (err) {
          console.error("Auto-send thread reply failed", err);
          showToast("Audio ready to send (thread).");
        }
      } else {
        try {
          await sendMessage();
          showToast("Voice message sent.");
        } catch (err) {
          console.error("Auto-send message failed", err);
          showToast("Audio ready to send.");
        }
      }
    } else {
      showToast(`${kind === "audio" ? "Audio" : "Video"} ready to send.`);
    }
  } catch (err) {
    console.error(err);
    const idx = uploadsTarget.findIndex((p) => p.id === placeholder.id);
    if (idx !== -1) uploadsTarget.splice(idx, 1);
    renderUploads();
    showToast(`Could not upload ${kind}.`);
  } finally {
    recordingTarget = "main";
  }
}

function cancelRecording() {
  try {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  } catch {}
  mediaRecorder = null;
  recordedChunks = [];
  recordingKind = null;
  if (recStream) {
    recStream.getTracks().forEach((t) => t.stop());
    recStream = null;
  }
  stopComposerRecordingUI();
  recordingTarget = "main";
  showToast("Recording canceled.");
  showVoiceRecordStatus("Recording canceled");
}

if (audioBtn) {
  audioBtn.addEventListener("click", () => {
    if (mediaRecorder) return; // recording UI has its own controls
    beginRecording("audio");
  });
}
if (videoBtn) {
  videoBtn.addEventListener("click", () => {
    if (mediaRecorder) return;
    beginRecording("video");
  });
}
if (speakingClubRecordBtn) {
  const start = (e) => {
    e.preventDefault();
    if (mediaRecorder) return;
    recordingTarget = "main";
    beginRecording("audio", { target: "main" });
    hideVoiceRecordStatus();
  };
  const stop = (e) => {
    e.preventDefault();
    if (!mediaRecorder) return;
    doneRecordingAndUpload();
  };
  const cancel = () => {
    if (mediaRecorder) cancelRecording();
  };
  speakingClubRecordBtn.addEventListener("mousedown", start);
  speakingClubRecordBtn.addEventListener("touchstart", start, { passive: false });
  speakingClubRecordBtn.addEventListener("mouseup", stop);
  speakingClubRecordBtn.addEventListener("mouseleave", cancel);
  speakingClubRecordBtn.addEventListener("touchend", stop);
  speakingClubRecordBtn.addEventListener("touchcancel", cancel);
}
if (threadVoiceRecordBtn) {
  const start = (e) => {
    e.preventDefault();
    if (mediaRecorder) return;
    recordingTarget = "thread";
    beginRecording("audio", { target: "thread" });
  };
  const stop = (e) => {
    e.preventDefault();
    if (!mediaRecorder) return;
    doneRecordingAndUpload();
  };
  const cancel = () => {
    if (mediaRecorder) cancelRecording();
  };
  threadVoiceRecordBtn.addEventListener("mousedown", start);
  threadVoiceRecordBtn.addEventListener("touchstart", start, { passive: false });
  threadVoiceRecordBtn.addEventListener("mouseup", stop);
  threadVoiceRecordBtn.addEventListener("mouseleave", cancel);
  threadVoiceRecordBtn.addEventListener("touchend", stop);
  threadVoiceRecordBtn.addEventListener("touchcancel", cancel);
}

if (addChannelBtn) {
  addChannelBtn.addEventListener("click", () => handleAddChannel("classes"));
}
if (addConversationBtn) {
  addConversationBtn.addEventListener("click", () => handleAddChannel("clubs"));
}
if (addExamGroupBtn) {
  addExamGroupBtn.addEventListener("click", () => handleAddChannel("exams"));
}
if (addAppBtn) {
  addAppBtn.addEventListener("click", () => handleAddChannel("tools"));
}
if (addDmBtn) {
  addDmBtn.addEventListener("click", openDmCreateModal);
}
if (workspaceAddBtn) {
  workspaceAddBtn.addEventListener("click", handleAddWorkspace);
}
if (addEmployeeForm) {
  addEmployeeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const firstName = (employeeFirstNameInput?.value || "").trim();
    const lastName = (employeeLastNameInput?.value || "").trim();
    const email = (employeeEmailInput?.value || "").trim();
    const password = (employeePasswordInput?.value || "").trim();
    const avatarUrl = (employeeAvatarInput?.value || "").trim();

    if (!firstName || !lastName || !email || !password) {
      showToast("First name, last name, email, and password are required");
      return;
    }

    if (password.length < 4) {
      showToast("Password must be at least 4 characters");
      return;
    }

    try {
      const user = await fetchJSON("/api/users", {
        method: "POST",
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          password,
          workspaceId: currentWorkspaceId || "default",
          avatarUrl
        })
      });

      employees.push(user);
      renderEmployees();
      addEmployeeForm.reset();
      const createdName =
        user.name ||
        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
        user.email ||
        "User";
      showToast(`Employee ${createdName} created`);
    } catch (err) {
      console.error("Failed to create employee", err);
      showToast("Could not create employee");
    }
  });
}

// ===================== DENSITY TOGGLE =====================

function applyDensity(mode) {
  if (!document.body) return;
  if (mode === "compact") {
    document.body.classList.add("density-compact");
  } else {
    document.body.classList.remove("density-compact");
  }
}

function saveDensity(mode) {
  try {
    localStorage.setItem(DENSITY_STORAGE_KEY, mode);
  } catch (err) {
    console.warn("Could not save density mode", err);
  }
}

function isStrongPasswordRule(password) {
  const value = String(password || "");
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  return regex.test(value);
}

async function handleSchoolRequest() {
  if (!schoolNameInput || !schoolAdminEmailInput || !schoolAdminPasswordInput) return;
  const schoolName = schoolNameInput.value.trim();
  const adminEmail = schoolAdminEmailInput.value.trim();
  const password = schoolAdminPasswordInput.value.trim();
  if (!schoolName || !adminEmail || !password) {
    if (schoolRequestError) {
      schoolRequestError.textContent = "School name, admin email, and password are required.";
      schoolRequestError.style.display = "block";
    }
    return;
  }
  if (!isStrongPasswordRule(password)) {
    if (schoolRequestError) {
      schoolRequestError.textContent =
        "Password must be at least 8 characters with 1 uppercase, 1 lowercase, 1 digit, and 1 symbol.";
      schoolRequestError.style.display = "block";
    }
    return;
  }
  if (schoolRequestError) schoolRequestError.style.display = "none";
  if (schoolRequestSuccess) schoolRequestSuccess.style.display = "none";

  try {
    if (schoolRequestBtn) schoolRequestBtn.disabled = true;
    await fetchJSON("/api/schools/request", {
      method: "POST",
      body: JSON.stringify({ schoolName, adminEmail, password })
    });
    schoolNameInput.value = "";
    schoolAdminEmailInput.value = "";
    schoolAdminPasswordInput.value = "";
    if (schoolRequestSuccess) {
      schoolRequestSuccess.style.display = "block";
    }
  } catch (err) {
    let message = "Could not submit request.";
    if (err && err.message) {
      const trimmed = String(err.message).trim();
      if (trimmed.startsWith("{")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && parsed.error) message = parsed.error;
        } catch (_err) {
          message = trimmed;
        }
      } else {
        message = trimmed;
      }
    }
    if (schoolRequestError) {
      schoolRequestError.textContent = message;
      schoolRequestError.style.display = "block";
    }
  } finally {
    if (schoolRequestBtn) schoolRequestBtn.disabled = false;
  }
}

function getRegistrationWorkspaceId() {
  if (sessionUser && sessionUser.workspaceId) return sessionUser.workspaceId;
  return currentWorkspaceId || null;
}

function openRegistrationModal(modalEl, errorEl) {
  if (!modalEl) return;
  if (!isSchoolAdmin()) {
    showToast("Only school admins can register users");
    return;
  }
  const wsId = getRegistrationWorkspaceId();
  if (!wsId) {
    showToast("No school workspace selected");
    return;
  }
  hideSchoolSettingsCard();
  showPanel("chatPanel");
  refreshRegistrationClassOptions().catch((err) => console.error("Registration options failed", err));
  if (errorEl) errorEl.style.display = "none";
  clearRegistrationInlineErrors();
  modalEl.classList.remove("hidden");
  modalEl.style.display = "flex";
}

function closeRegistrationModal(modalEl, errorEl) {
  if (!modalEl) return;
  modalEl.classList.add("hidden");
  modalEl.style.display = "none";
  if (errorEl) errorEl.style.display = "none";
  clearRegistrationInlineErrors();
}

function setFieldInlineError(el, message) {
  if (!el) return;
  const normalized = String(message || "").trim();
  const trimmed = normalized.replace(/^["']+|["']+$/g, "").trim();
  if (!trimmed) {
    el.textContent = "";
    el.style.display = "none";
    return;
  }
  el.textContent = trimmed;
  el.style.display = "block";
}

function toggleInputErrorState(elements = [], enable = true) {
  const list = Array.isArray(elements) ? elements : [elements];
  list.forEach((el) => {
    if (!el) return;
    if (enable) {
      el.classList.add("input-error");
    } else {
      el.classList.remove("input-error");
    }
  });
}

function clearRegistrationInlineErrors() {
  setFieldInlineError(studentEmailError, "");
  setFieldInlineError(teacherEmailError, "");
  setFieldInlineError(studentNameDobError, "");
  setFieldInlineError(teacherNameDobError, "");
  toggleInputErrorState([studentFirstName, studentLastName, studentDob], false);
  toggleInputErrorState([teacherFirstName, teacherLastName, teacherDob], false);
}

function clearRegistrationFields(role) {
  const isStudent = role === "student";
  const textFields = isStudent
    ? [studentFirstName, studentLastName, studentEmail, studentPhoneNumber, studentEmergencyName, studentEmergencyPhone]
    : [teacherFirstName, teacherLastName, teacherEmail, teacherPhoneNumber, teacherEmergencyName, teacherEmergencyPhone];
  textFields.forEach((field) => {
    if (field) field.value = "";
  });
  const dateFields = isStudent
    ? [studentDob, studentCourseStart, studentCourseEnd]
    : [teacherDob, teacherCourseStart, teacherCourseEnd];
  dateFields.forEach((field) => {
    if (field) field.value = "";
  });
  const selectFields = isStudent
    ? [studentGender, studentCourseLevel, studentPhoneCountry, studentNativeLanguage, studentLearningGoal, studentEmergencyRelation]
    : [teacherGender, teacherCourseLevel, teacherPhoneCountry, teacherLanguages, teacherLanguages, teacherLearningGoal, teacherEmergencyRelation];
  selectFields.forEach((field) => {
    if (field) field.selectedIndex = 0;
  });
  const availableInputs = isStudent ? studentAvailableDayInputs : teacherAvailableDayInputs;
  Array.from(availableInputs || []).forEach((input) => {
    if (input) input.checked = false;
  });
  if (isStudent && studentRegisterModal) {
    const pwd = studentRegisterModal.querySelector("input[type='password']");
    if (pwd) pwd.value = "";
  } else if (teacherRegisterModal) {
    const pwd = teacherRegisterModal.querySelector("input[type='password']");
    if (pwd) pwd.value = "";
  }
  clearRegistrationInlineErrors();
}

async function submitRegistration({
  role,
  firstNameEl,
  lastNameEl,
  emailEl,
  passwordEl,
  confirmPasswordEl,
  courseStartEl,
  courseEndEl,
  courseLevelEl,
  genderEl,
  errorEl,
  modalEl,
  dateOfBirthEl,
  phoneCountryEl,
  phoneNumberEl,
  languagesEl,
  nativeLanguageEl,
  learningGoalEl,
  employmentEl,
  availableDaysInputs = [],
  emergencyNameEl,
  emergencyPhoneEl,
  emergencyRelationEl
}) {
  if (!isSchoolAdmin()) {
    showToast("Only school admins can register users");
    return;
  }
  const firstName = (firstNameEl?.value || "").trim();
  const lastName = (lastNameEl?.value || "").trim();
  const email = (emailEl?.value || "").trim();
  const password = (passwordEl?.value || "").trim();
  const confirmPassword = (confirmPasswordEl?.value || "").trim();
  const courseStart = (courseStartEl?.value || "").trim();
  const courseEnd = (courseEndEl?.value || "").trim();
  const selectedCourseOption = courseLevelEl?.selectedOptions?.[0];
  const courseLevel = selectedCourseOption?.dataset?.level
    ? selectedCourseOption.dataset.level.trim()
    : "";
  const selectedClassId = (selectedCourseOption?.value || "").trim();
  const gender = (genderEl?.value || "").trim();
  const dateOfBirth = (dateOfBirthEl?.value || "").trim();
  const phoneCountry = (phoneCountryEl?.value || "").trim();
  const phoneNumber = (phoneNumberEl?.value || "").trim();
  const teachingLanguages = (languagesEl?.value || "").trim();
  const nativeLanguage = (nativeLanguageEl?.value || "").trim();
  const learningGoal = (learningGoalEl?.value || "").trim();
  const employmentType = (employmentEl?.value || "").trim();
  const availableDayNodes = Array.from(availableDaysInputs || []);
  const availableDays = availableDayNodes
    .filter((input) => input && input.checked)
    .map((input) => String(input.value || "").trim())
    .filter(Boolean);
  const emergencyName = (emergencyNameEl?.value || "").trim();
  const emergencyPhone = (emergencyPhoneEl?.value || "").trim();
  const emergencyRelation = (emergencyRelationEl?.value || "").trim();
  const refs = {
    genderEl,
    firstNameEl,
    lastNameEl,
    dateOfBirthEl,
    emailEl,
    courseLevelEl,
    passwordEl,
    employmentEl
  };
  if (!validateRegistrationFields({ refs, includePassword: true, errorEl, role })) {
    return;
  }
  if (confirmPasswordEl && password !== confirmPassword) {
    if (errorEl) {
      errorEl.textContent = "Passwords do not match.";
      errorEl.style.display = "block";
    }
    return;
  }
  if (!isStrongPasswordRule(password)) {
    if (errorEl) {
      errorEl.textContent =
        "Password must be at least 8 characters with 1 uppercase, 1 lowercase, 1 digit, and 1 symbol.";
      errorEl.style.display = "block";
    }
    return;
  }
  if (courseStart && courseEnd) {
    const start = new Date(courseStart);
    const end = new Date(courseEnd);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start > end) {
      if (errorEl) {
        errorEl.textContent = "Course end must be after the start date.";
        errorEl.style.display = "block";
      }
      return;
    }
  }

  const workspaceId = getRegistrationWorkspaceId();
  if (!workspaceId) {
    if (errorEl) {
      errorEl.textContent = "School workspace not found.";
      errorEl.style.display = "block";
    }
    return;
  }

  if (errorEl) errorEl.style.display = "none";
  try {
    const createdUser = await fetchJSON("/api/users", {
      method: "POST",
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        password,
        workspaceId,
        role,
        courseStart: courseStart || null,
        courseEnd: courseEnd || null,
        courseLevel: courseLevel || null,
        dateOfBirth: dateOfBirth || null,
        phoneCountry: phoneCountry || null,
        phoneNumber: phoneNumber || null,
        teachingLanguages: teachingLanguages || null,
        nativeLanguage: nativeLanguage || null,
        learningGoal: learningGoal || null,
        employmentType: employmentType || null,
        availableDays: availableDays.length ? availableDays.join(",") : null,
        emergencyName: emergencyName || null,
        emergencyPhone: emergencyPhone || null,
        emergencyRelation: emergencyRelation || null,
        gender: gender || null
      })
    });
    if (selectedClassId) {
      try {
        await assignUserToClass(createdUser.id, selectedClassId, workspaceId);
      } catch (err) {
        console.error("Could not assign user to class", err);
        showToast("User created but class assignment failed.");
      }
    }
    if (firstNameEl) firstNameEl.value = "";
    if (lastNameEl) lastNameEl.value = "";
    if (emailEl) emailEl.value = "";
    if (passwordEl) passwordEl.value = "";
    if (confirmPasswordEl) confirmPasswordEl.value = "";
    if (courseStartEl) courseStartEl.value = "";
    if (courseEndEl) courseEndEl.value = "";
    if (courseLevelEl) courseLevelEl.value = "";
    if (genderEl) genderEl.value = "";
    if (dateOfBirthEl) dateOfBirthEl.value = "";
    if (phoneCountryEl) phoneCountryEl.selectedIndex = 0;
    if (phoneNumberEl) phoneNumberEl.value = "";
    if (languagesEl) languagesEl.selectedIndex = 0;
    if (nativeLanguageEl) nativeLanguageEl.selectedIndex = 0;
    if (learningGoalEl) learningGoalEl.selectedIndex = 0;
    if (employmentEl) employmentEl.selectedIndex = 0;
    if (availableDayNodes.length) {
      availableDayNodes.forEach((input) => {
        if (input) input.checked = false;
      });
    }
    if (emergencyNameEl) emergencyNameEl.value = "";
    if (emergencyPhoneEl) emergencyPhoneEl.value = "";
    if (emergencyRelationEl) emergencyRelationEl.selectedIndex = 0;
    closeRegistrationModal(modalEl, errorEl);
    userDirectoryLoaded = false;
    showToast(`${role === "teacher" ? "Teacher" : "Student"} registered`);
  } catch (err) {
    console.error("Registration failed", err);
    let message = "Could not register user";
    if (err && err.message) {
      const trimmed = String(err.message).trim();
      if (trimmed.startsWith("{")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && parsed.error) message = parsed.error;
        } catch (_err) {
          message = trimmed;
        }
      } else if (trimmed) {
        message = trimmed;
      }
    }
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = "block";
    } else {
      showToast(message);
    }
  }
}

function validateRegistrationFields({ refs, includePassword = true, errorEl, role }) {
  if (!refs) return false;
  const requiredPairs = [];
  if (refs.genderEl) requiredPairs.push([refs.genderEl, "Salutation"]);
  if (refs.firstNameEl) requiredPairs.push([refs.firstNameEl, "First name"]);
  if (refs.lastNameEl) requiredPairs.push([refs.lastNameEl, "Last name"]);
  if (refs.dateOfBirthEl) requiredPairs.push([refs.dateOfBirthEl, "Date of birth"]);
  if (refs.emailEl) requiredPairs.push([refs.emailEl, "Email"]);
  if (refs.courseLevelEl) requiredPairs.push([refs.courseLevelEl, "Course level"]);
  if (includePassword && refs.passwordEl) requiredPairs.push([refs.passwordEl, "Password"]);
  if (role === "teacher" && refs.employmentEl) requiredPairs.push([refs.employmentEl, "Employment type"]);
  const missing = [];
  requiredPairs.forEach(([el]) => {
    if (el) el.classList.remove("input-error");
  });
  for (const [el, label] of requiredPairs) {
    const value = (el?.value || "").trim();
    if (!value) {
      missing.push(label);
      if (el) el.classList.add("input-error");
    }
  }
  if (missing.length && errorEl) {
    errorEl.textContent = `Please fill out the following fields: ${missing.join(", ")}.`;
    errorEl.style.display = "block";
    return false;
  }
  return true;
}

async function completeLoginFlow(user) {
  const normalizedRole = normalizeRole(user.role);
  adminLoggedIn = ADMIN_ROLE_VALUES.has(normalizedRole);
  adminLoggedInSuper = normalizedRole === "super_admin" || user.superAdmin === true;
  updateAdminButtonState();
  const authenticatedWorkspaceId = String(
    user.workspaceId ||
    user.workspace_id ||
    window.selectedWorkspaceId ||
    currentWorkspaceId ||
    "default"
  ).trim();

  if (adminLoggedInSuper) {
    if (adminOverlay) {
      const btn = document.querySelector('.rail-btn[data-view="admin"]');
      if (btn) {
        btn.disabled = false;
        btn.style.pointerEvents = "auto";
        btn.classList.remove("rail-btn-disabled");
      }
    }
    if (deepLinkTarget && deepLinkTarget.workspaceId) {
      currentWorkspaceId = deepLinkTarget.workspaceId;
    } else {
      let storedWorkspace = null;
      try {
        storedWorkspace = localStorage.getItem(CURRENT_WORKSPACE_STORAGE_KEY);
      } catch (_err) {
        storedWorkspace = null;
      }
      currentWorkspaceId = storedWorkspace || authenticatedWorkspaceId || workspaces[0]?.id || "default";
    }
    await loadWorkspace(currentWorkspaceId);
    setSuperAdminLanding(true);
    openAdminDock();
    showToast("Logged in");
    return;
  }

  currentWorkspaceId = authenticatedWorkspaceId || "default";
  await loadWorkspace(currentWorkspaceId);

  try {
    localStorage.removeItem(CURRENT_CHANNEL_STORAGE_KEY);
  } catch (err) {
    console.warn("Could not persist workspace selection", err);
  }
  updateAdminButtonState();

  await bootstrapAfterAuth(user, { showToastOnLogin: true });
}

async function handleMainLogin() {
  if (!mainLoginEmail || !mainLoginPassword) return;
  const email = mainLoginEmail.value.trim();
  const password = mainLoginPassword.value.trim();
  if (!email || !password) {
    if (mainLoginError) {
      mainLoginError.textContent = "Email and password are required";
      mainLoginError.style.display = "block";
    }
    return;
  }
  if (mainLoginError) {
    mainLoginError.style.display = "none";
  }

  try {
    mainLoginBtn.disabled = true;
    const result = await fetchJSON("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    setAccessToken(result.accessToken);
    const user = result.user;
    if (user.mustChangePassword) {
      showMustChangePasswordBanner();
      showForcePasswordModal(async () => {
        await completeLoginFlow(user);
      });
      return;
    }
    await completeLoginFlow(user);
  } catch (err) {
    console.error("Login failed", err);
    if (mainLoginError) {
      const raw = err?.payload || err;
      const message = normalizeErrorText(raw);
      const normalized = String(message || "").trim();
      if (/pending/i.test(normalized)) {
        mainLoginError.textContent =
          "Your account is pending approval. Please wait or contact your school admin.";
      } else if (/rejected/i.test(normalized)) {
        mainLoginError.textContent =
          "Your registration was rejected. Please contact support or submit a new request.";
      } else if (/inactive|disabled|blocked/i.test(normalized)) {
        mainLoginError.textContent = "Your account is inactive. Please contact your school admin.";
      } else if (err?.status === 401) {
        mainLoginError.textContent = "Incorrect email or password. You can reset your password if needed.";
      } else {
        mainLoginError.textContent = normalized || "Invalid credentials";
      }
      mainLoginError.style.display = "block";
    }
  } finally {
    if (mainLoginBtn) mainLoginBtn.disabled = false;
  }
}

function persistCurrentWorkspace() {
  if (!isSuperAdmin()) return;
  try {
    localStorage.setItem(CURRENT_WORKSPACE_STORAGE_KEY, currentWorkspaceId);
  } catch (err) {
    console.warn("Could not save current workspace", err);
  }
}

async function loadWorkspace(workspaceId) {
  const candidate = String(workspaceId || "").trim();
  currentWorkspaceId = candidate || "default";
  if (typeof window !== "undefined") {
    window.currentWorkspaceId = currentWorkspaceId;
    window.selectedWorkspaceId = currentWorkspaceId;
  }
  persistCurrentWorkspace();
  if (typeof window !== "undefined") {
    window.__calendarWorkspaceReady = currentWorkspaceId || "";
    window.dispatchEvent(
      new CustomEvent("worknestWorkspaceReady", {
        detail: { workspaceId: currentWorkspaceId }
      })
    );
  }
}

async function tryAutoAuth() {
  try {
    const refresh = await fetchJSON("/api/auth/refresh", { method: "POST" });
    setAccessToken(refresh.accessToken);

    const me = await fetchJSON("/api/auth/me");
    await bootstrapAfterAuth(me.user);
    return true;
  } catch (err) {
    persistSessionUser(null);
    showLoginOverlay();
    return false;
  }
}

async function restoreSession() {
  return tryAutoAuth();
}

function loadDensity() {
  try {
    const mode = localStorage.getItem(DENSITY_STORAGE_KEY);
    if (mode) {
      applyDensity(mode);
      densityButtons.forEach((b) =>
        b.classList.toggle("density-btn-active", b.dataset.density === mode)
      );
    }
  } catch (err) {
    console.warn("Could not load density mode", err);
  }
}


function setupDensityToggle() {
  if (!densityButtons || !densityButtons.length) return;

  densityButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.density === "compact" ? "compact" : "comfy";

      applyDensity(mode);
      saveDensity(mode);

      densityButtons.forEach((b) =>
        b.classList.remove("density-btn-active")
      );
      btn.classList.add("density-btn-active");
    });
  });
}


// ===================== REALTIME (SSE) =====================

function setupRealtimeEvents() {
  if (!window.EventSource) {
    console.warn("EventSource not supported in this browser");
    return;
  }

  if (eventSource) {
    try {
      eventSource.close();
    } catch (err) {
      // ignore
    }
    eventSource = null;
  }

  const url = API_BASE + "/api/events";
  const es = new EventSource(url);
  eventSource = es;

  es.addEventListener("open", () => {
    console.log("Realtime connected");
  });

  es.addEventListener("error", () => {
    console.warn("Realtime connection lost, retrying…");
    try {
      es.close();
    } catch (err) {
      // ignore
    }
    eventSource = null;
    // simple retry
    setTimeout(setupRealtimeEvents, 3000);
  });

  // New channel message from ANY user
  es.addEventListener("channel_message_created", (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (err) {
      return;
    }
    const { channelId, message } = data || {};
    if (!channelId || !message) return;

    if (!messagesByChannel[channelId]) {
      messagesByChannel[channelId] = [];
    }
    const arr = messagesByChannel[channelId];

    // avoid duplicates if this client already has it
    const incomingId = String(message.id);
    if (arr.some((m) => String(m.id) === incomingId)) return;

    const enriched = { ...message, channelId };
    arr.push(enriched);

    if (!showSavedOnly && currentChannelId === channelId) {
      disableAnnouncementAutoscroll = true;
      renderMessages(channelId);
    }
    onIncomingMessage(enriched);
  });

  es.addEventListener("channel_announcement_created", (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (err) {
      return;
    }
    const { channelId, announcement } = data || {};
    if (!channelId || !announcement) return;
    const current = announcementsByChannel[channelId] || [];
    const existing = current.find((item) => String(item.id) === String(announcement.id));
    const merged = existing ? { ...existing, ...announcement } : announcement;
    pushAnnouncement(channelId, merged);
    if (!showSavedOnly && currentChannelId === channelId) {
      requestAnnouncementAutoScroll();
      renderMessages(channelId);
    }
  });

  es.addEventListener("channel_announcement_updated", (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (err) {
      return;
    }
    const { channelId, announcement } = data || {};
    if (!channelId || !announcement) return;
    const current = announcementsByChannel[channelId] || [];
    const existing = current.find((item) => String(item.id) === String(announcement.id));
    if (!existing) return;
    const updated = { ...existing, ...announcement };
    pushAnnouncement(channelId, updated);
    if (!showSavedOnly && currentChannelId === channelId) {
      disableAnnouncementAutoscroll = true;
      renderMessages(channelId);
    }
  });

  es.addEventListener("channel_announcement_deleted", (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (err) {
      return;
    }
    const { channelId, announcementId } = data || {};
    if (!channelId || !announcementId) return;
    disableAnnouncementAutoscroll = true;
    removeAnnouncementFromStore(channelId, announcementId);
  });

  es.addEventListener("channel_messages_cleared", (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (err) {
      return;
    }
    const { channelId, userId } = data || {};
    if (!channelId) return;
    messagesByChannel[channelId] = [];
    if (!showSavedOnly && currentChannelId === channelId) {
      renderMessages(channelId);
      const initiatorId = String(userId || "");
      const currentUserId = String(sessionUser?.id || sessionUser?.userId || "");
      if (initiatorId && currentUserId === initiatorId) return;
      showToast("Culture Exchange chat cleared by admin.");
    }
  });

  // New thread reply from ANY user
  es.addEventListener("thread_reply_created", (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (err) {
      return;
    }
    const { channelId, messageId, reply } = data || {};
    if (!messageId || !reply) return;

    const msgs = messagesByChannel[channelId] || [];
    const msg = msgs.find((m) => m.id === messageId);
    if (msg) {
      if (!msg.replies) msg.replies = [];
      if (!msg.replies.some((r) => String(r.id) === String(reply.id))) {
        msg.replies.push(reply);
      }
    }

    if (currentThreadMessage && currentThreadMessage.id === messageId) {
      if (!currentThreadMessage.replies) currentThreadMessage.replies = [];
      if (!currentThreadMessage.replies.some((r) => String(r.id) === String(reply.id))) {
        currentThreadMessage.replies.push(reply);
        renderThreadReplies();
      }
    }

    if (!showSavedOnly && currentChannelId === channelId) {
      refreshCommenterAvatars(messageId, channelId);
    }
  });

  es.addEventListener("dm_message_reactions_updated", (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (err) {
      return;
    }
    const { dmId, messageId, reactions } = data || {};
    if (!dmId || !messageId) return;
    applyMessageReactions(messageId, reactions);
    if (!showSavedOnly && currentChannelId === `dm:${dmId}`) {
      refreshMessagesView();
    }
  });

  es.addEventListener("dm_message_created", (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (err) {
      return;
    }
    const { dmId, message } = data || {};
    if (!dmId || !message) return;
    const channelId = `dm:${dmId}`;
    if (!messagesByChannel[channelId]) messagesByChannel[channelId] = [];
    const arr = messagesByChannel[channelId];
    const incomingId = String(message.id);
    if (arr.some((m) => String(m.id) === incomingId)) return;
    const enriched = { ...message, channelId };
    arr.push(enriched);
    if (!showSavedOnly && currentChannelId === channelId) {
      renderMessages(channelId);
    }
    onIncomingMessage(enriched);
  });

  es.addEventListener("dm_reply_created", (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (err) {
      return;
    }
    const { dmId, messageId, reply } = data || {};
    if (!dmId || !messageId || !reply) return;
    const channelId = `dm:${dmId}`;

    const msgs = messagesByChannel[channelId] || [];
    const msg = msgs.find((m) => m.id === messageId);
    if (msg) {
      if (!msg.replies) msg.replies = [];
      if (!msg.replies.some((r) => String(r.id) === String(reply.id))) {
        msg.replies.push(reply);
      }
    }

    if (currentThreadMessage && currentThreadMessage.id === messageId) {
      if (!currentThreadMessage.replies) currentThreadMessage.replies = [];
      if (!currentThreadMessage.replies.some((r) => String(r.id) === String(reply.id))) {
        currentThreadMessage.replies.push(reply);
        renderThreadReplies();
      }
    }

    if (!showSavedOnly && currentChannelId === channelId) {
      refreshCommenterAvatars(messageId, channelId);
    }
  });

  es.addEventListener("message_updated", (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (err) {
      return;
    }
    const { channelId, message } = data || {};
    if (!message || !message.id) return;
    Object.keys(messagesByChannel).forEach((cid) => {
      const msgs = messagesByChannel[cid] || [];
      const m = msgs.find((mm) => mm.id === message.id);
      if (m) {
        m.text = message.text;
      }
    });
    if (savedMessagesById[message.id]) {
      savedMessagesById[message.id].message.text = message.text;
      persistSavedMessages();
    }
    refreshMessagesView();
  });

  es.addEventListener("message_deleted", (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (err) {
      return;
    }
    const { messageId } = data || {};
    if (!messageId) return;

    Object.keys(messagesByChannel).forEach((cid) => {
      const msgs = messagesByChannel[cid] || [];
      const idx = msgs.findIndex((m) => m.id === messageId);
      if (idx !== -1) msgs.splice(idx, 1);
    });

    if (savedMessagesById[messageId]) {
      delete savedMessagesById[messageId];
      persistSavedMessages();
    }

    refreshMessagesView();
  });

  es.addEventListener("user_typing", (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (err) {
      return;
    }
    const { channelId, userId, name, initials, isTyping } = data || {};
    const selfId =
      (sessionUser && (sessionUser.userId || sessionUser.id || sessionUser.email)) || null;
    if (!channelId || channelId !== currentChannelId) return;
    if (selfId && userId && String(userId) === String(selfId)) return;

    if (isTyping) {
      addTypingUser(userId, name, initials);
    } else {
      removeTypingUser(userId);
    }
  });

  // Reaction changes for messages
  es.addEventListener("message_reactions_updated", (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (err) {
      return;
    }
    const { messageId, reactions } = data || {};
    if (!messageId || !Array.isArray(reactions)) return;

    Object.keys(messagesByChannel).forEach((cid) => {
      const msgs = messagesByChannel[cid] || [];
      const msg = msgs.find((m) => m.id === messageId);
      if (msg) {
        msg.reactions = reactions.map((r) => ({
          emoji: r.emoji,
          count: r.count
        }));
      }
    });

    if (savedMessagesById[messageId]) {
      savedMessagesById[messageId].message.reactions = reactions.map((r) => ({
        emoji: r.emoji,
        count: r.count
      }));
      persistSavedMessages();
    }

    refreshMessagesView();
  });

  // Reaction changes for replies
  es.addEventListener("reply_reactions_updated", (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (err) {
      return;
    }
    const { replyId, reactions } = data || {};
    if (!replyId || !Array.isArray(reactions)) return;

    Object.keys(messagesByChannel).forEach((cid) => {
      const msgs = messagesByChannel[cid] || [];
      msgs.forEach((m) => {
        if (!Array.isArray(m.replies)) return;
        const rep = m.replies.find((r) => r.id === replyId);
        if (rep) {
          rep.reactions = reactions.map((r) => ({
            emoji: r.emoji,
            count: r.count
          }));
        }
      });
    });

    if (currentThreadMessage) {
      renderThreadReplies();
    }
  });

  es.addEventListener("calendar_event_created", (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (_err) {
      return;
    }
    if (data?.event) {
      const evObj = normalizeCalendarEvent(data.event);
      calEventsCache.push(evObj);
      scheduleReminder(evObj);
      renderCalendar();
    }
  });

  es.addEventListener("calendar_event_updated", (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (_err) {
      return;
    }
    if (data?.event) {
      const normalized = normalizeCalendarEvent(data.event);
      const i = calEventsCache.findIndex((x) => x.id === normalized.id);
      if (i >= 0) calEventsCache[i] = normalized;
      else calEventsCache.push(normalized);
      scheduleReminder(normalized);
      renderCalendar();
    }
  });

  es.addEventListener("calendar_event_deleted", (ev) => {
    let data;
    try {
      data = JSON.parse(ev.data);
    } catch (_err) {
      return;
    }
    if (data?.id) {
      calEventsCache = calEventsCache.filter((x) => x.id !== data.id);
      renderCalendar();
    }
  });
}

// ===================== INIT =====================
async function init() {
  loadDeepLinkTarget();
  refreshCultureExchangeLanguagePreference();
  updateAdminButtonState();
  loadDensity();
  loadSavedMessages();
  initPinnedCollapse();
  initSidebarSectionCollapsibles();
  renderPendingAttachments();
  processUploadQueue();
  const hasSession = await tryAutoAuth();
  if (!hasSession) {
    updateAdminButtonState();
    return;
  }
  updateAdminButtonState();
  await loadServerData();
  renderChannels();
  renderDMs();
  renderWorkspaces();
  renderCommandLists();
  let savedRailView = "messages";
  try {
    savedRailView = localStorage.getItem(LAST_RAIL_VIEW_KEY) || "messages";
  } catch (_err) {
    savedRailView = "messages";
  }
  if (isPolicyAcceptanceRequired() && !policyAccepted) {
    await openPrivacyRulesChannel();
  }
  if (sidebarScroll) {
    const savedSidebarTop = loadSidebarScroll();
    sidebarScroll.scrollTop = savedSidebarTop;
  }
  setupRealtimeEvents();
  if (typeof initCalendarIfNeeded === "function") {
    initCalendarIfNeeded();
  }
  if (typingIndicator) typingIndicator.style.opacity = "0.3";
  if (recordingOverlay) recordingOverlay.hidden = true;
  if (channels.length) {
    if (!channels.some((c) => c.id === currentChannelId) && !isSchoolSettingsChannel(currentChannelId)) {
      currentChannelId = channels[0].id;
    }
    if (deepLinkTarget) {
      applyDeepLinkSelection();
    } else if (!didRestoreView) {
      selectChannel(currentChannelId);
    }
  } else if (messagesContainer) {
    messagesContainer.innerHTML = "";
  }
  renderPinnedSidebar();
  setupDensityToggle();
  refreshMessageBadge();
  if (savedRailView === "email") {
    await openEmailPanel();
  }
}
init();

if (!messageMenuCloseHandlerBound && typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".message-options")) {
      closeAllMessageMenus();
    }
  });
  messageMenuCloseHandlerBound = true;
}

// User profile modal listeners
if (userProfileClose) {
  userProfileClose.addEventListener("click", closeUserProfile);
}
if (userProfileModal) {
  userProfileModal.addEventListener("click", (e) => {
    if (e.target === userProfileModal) {
      closeUserProfile();
    }
  });
}

if (dmAddMemberBtn) {
  dmAddMemberBtn.addEventListener("click", () => {
    if (currentDmId) {
      openDmMembersModal(currentDmId, "add");
    }
  });
}
if (dmEditMemberBtn) {
  dmEditMemberBtn.addEventListener("click", () => {
    if (currentDmId) {
      openDmMembersModal(currentDmId, "edit");
    }
  });
}

if (dmMembersClose) {
  dmMembersClose.addEventListener("click", closeDmMembersModal);
}

if (dmMembersModal) {
  dmMembersModal.addEventListener("click", (e) => {
    if (e.target === dmMembersModal) closeDmMembersModal();
  });
}

if (dmMembersSave) {
  dmMembersSave.addEventListener("click", saveDmMembers);
}

if (dmMembersSearch) {
  dmMembersSearch.addEventListener("input", (e) => {
    const dmId = dmMembersModal ? dmMembersModal.dataset.dmId : "";
    if (!dmId) return;
    renderDmMembersList(dmId, e.target.value || "");
  });
}

if (dmCreateClose) {
  dmCreateClose.addEventListener("click", closeDmCreateModal);
}

if (dmCreateModal) {
  dmCreateModal.addEventListener("click", (e) => {
    if (e.target === dmCreateModal) closeDmCreateModal();
  });
}

if (dmCreateSearch) {
  dmCreateSearch.addEventListener("input", (e) => {
    renderDmCreateList(e.target.value || "");
  });
}

if (dmCreateSave) {
  dmCreateSave.addEventListener("click", saveDmCreate);
}

  if (channelRoleTabs) {
    channelRoleTabs.addEventListener("click", (e) => {
      const target = e.target.closest(".member-pill");
      if (!target) return;
      const role = target.dataset.role;
      if (!role) return;
      openChannelMembersModal(role);
    });
  }
  if (channelMembersRoleTabs) {
    channelMembersRoleTabs.addEventListener("click", (e) => {
      const target = e.target.closest(".modal-role-btn");
      if (!target) return;
      const role = target.dataset.role;
      if (!role) return;
      openChannelMembersModal(role);
    });
  }

if (channelAddMemberBtn) {
  channelAddMemberBtn.addEventListener("click", () => {
    openChannelAssignModal();
  });
}

if (channelAssignClose) {
  channelAssignClose.addEventListener("click", closeChannelAssignModal);
}

if (channelAssignModal) {
  channelAssignModal.addEventListener("click", (e) => {
    if (e.target === channelAssignModal) closeChannelAssignModal();
  });
}

if (channelAssignSearch) {
  channelAssignSearch.addEventListener("input", (e) => {
    renderChannelAssignList(e.target.value || "");
  });
}

if (channelAssignSave) {
  channelAssignSave.addEventListener("click", saveChannelAssignMembers);
}

if (channelMembersClose) {
  channelMembersClose.addEventListener("click", closeChannelMembersModal);
}

if (channelMembersModal) {
  channelMembersModal.addEventListener("click", (e) => {
    if (e.target === channelMembersModal) closeChannelMembersModal();
  });
}

if (schoolProfileSaveBtn) {
  schoolProfileSaveBtn.addEventListener("click", handleSchoolProfileSave);
}

renderOpeningHoursEditor();

if (headerStarBtn) {
  headerStarBtn.addEventListener("click", () => {
    const ch = getChannelById(currentChannelId);
    if (!ch) return;
    if (isStarred(ch.id)) unstarChannel(ch.id);
    else starChannel(ch.id);
    renderStarred();
    renderChannels();
    renderChannelHeader(ch.id);
  });
}

if (headerPinBtn) {
  headerPinBtn.addEventListener("click", () => {
    const ch = getChannelById(currentChannelId);
    if (!ch) return;
    togglePinnedChannel(ch.id);
    renderPinnedSidebar();
    renderChannelHeader(ch.id);
  });
}

if (headerMuteBtn) {
  headerMuteBtn.addEventListener("click", () => {
    const ch = getChannelById(currentChannelId);
    if (!ch) return;
    toggleMute(ch.id);
    renderChannels();
    renderStarred();
    renderChannelHeader(ch.id);
  });
}

if (channelSearchInput) {
  channelSearchInput.addEventListener("input", () => {
    if (directoryViewRole) return;
    const term = channelSearchInput.value || "";
    updateChannelSearchTerm(currentChannelId, term);
    renderMessages(currentChannelId);
    if (!term.trim()) {
      hideChannelSearchResults();
    }
  });
  channelSearchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      runChannelSearchQuery();
    }
  });
}
if (channelSearchBtn) {
  channelSearchBtn.addEventListener("click", runChannelSearchQuery);
}

if (privacyChannelHeader) {
  let moreMenuOpen = false;
  document.addEventListener("click", (event) => {
    const btn = event.target.closest(".privacy-quick-btn");
    const moreBtn = event.target.closest(".privacy-more-btn");
    const moreMenu = document.getElementById("privacyMoreMenu");
    if (moreBtn && moreMenu) {
      moreMenuOpen = !moreMenuOpen;
      moreMenu.classList.toggle("hidden", !moreMenuOpen);
      return;
    }
    if (moreMenu && !moreBtn && !event.target.closest(".privacy-more-menu")) {
      moreMenuOpen = false;
      moreMenu.classList.add("hidden");
    }
    if (!btn) return;
    const action = btn.dataset.privacyAction;
    if (!action) return;
    const card = document.querySelector(".privacy-rules");
    if (!card) return;
    if (action === "jump") {
      card.scrollIntoView({ behavior: "smooth" });
    } else if (action === "download") {
      showToast("Download PDF will be available soon.");
    } else if (action === "report") {
      showToast("Report privacy issues to your school admin.");
    }
  });
}

const CHANNEL_SEARCH_RESULT_LIMIT = 6;

function runChannelSearchQuery() {
  if (directoryViewRole || !channelSearchInput || !currentChannelId) return;
  const query = channelSearchInput.value || "";
  updateChannelSearchTerm(currentChannelId, query);
  renderMessages(currentChannelId);
  if (query.trim()) {
    renderChannelSearchResultsPreview(currentChannelId, query);
  } else {
    hideChannelSearchResults();
  }
}

function renderChannelSearchResultsPreview(channelId, query) {
  if (!channelSearchResults || !channelId) return;
  const trimmed = (query || "").trim();
  const normalized = trimmed.toLowerCase();
  if (!trimmed) {
    hideChannelSearchResults();
    return;
  }
  const matches = (messagesByChannel[channelId] || [])
    .filter((msg) => messageMatchesTerm(msg, channelId, normalized))
    .slice(0, CHANNEL_SEARCH_RESULT_LIMIT);
  channelSearchResults.innerHTML = "";
  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "channel-search-empty muted";
    empty.textContent = "No matches in this channel yet.";
    channelSearchResults.appendChild(empty);
  } else {
    matches.forEach((msg) => {
      channelSearchResults.appendChild(buildChannelSearchResult(msg, channelId, trimmed));
    });
  }
  channelSearchResults.classList.remove("hidden");
}

function buildChannelSearchResult(msg, channelId, displayTerm) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "channel-search-result";
  const authorLabel = escapeHtml(msg.author || "Unknown");
  const timeLabel = escapeHtml(msg.time || "");
  const snippet = highlightChannelSearchSnippet(msg.text || msg.alt || "(no text)", displayTerm, 120);
  item.innerHTML = `
    <div class="channel-search-result-meta">
      <span>${authorLabel}</span>
      <span>${timeLabel}</span>
    </div>
    <div class="channel-search-result-snippet">
      ${snippet}
    </div>
  `;
  item.addEventListener("click", () => {
    updateChannelSearchTerm(channelId, displayTerm);
    renderMessages(channelId);
    hideChannelSearchResults();
    focusMessageRow(msg.id);
  });
  return item;
}

function highlightChannelSearchSnippet(text, term, limit = 120) {
  const clean = String(text || "").trim();
  const snippet = clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
  if (!term) return escapeHtml(snippet);
  const regex = new RegExp(escapeRegex(term), "gi");
  return escapeHtml(snippet).replace(regex, (match) => `<mark>${match}</mark>`);
}

function escapeRegex(value) {
  return String(value || "").replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function hideChannelSearchResults() {
  if (!channelSearchResults) return;
  channelSearchResults.classList.add("hidden");
  channelSearchResults.innerHTML = "";
}

function focusMessageRow(messageId) {
  if (!messagesContainer || !messageId) return;
  const selector = safeCssIdentifier(messageId);
  const row = messagesContainer.querySelector(`[data-message-id="${selector}"]`);
  if (!row) return;
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.classList.add("search-highlight");
  setTimeout(() => row.classList.remove("search-highlight"), 2000);
}

function safeCssIdentifier(value) {
  if (typeof CSS !== "undefined" && CSS.escape) {
    return CSS.escape(value);
  }
  return String(value || "").replace(/["\\]/g, "\\$&");
}

document.addEventListener("click", (event) => {
  if (!channelSearchResults || channelSearchResults.classList.contains("hidden")) return;
  const target = event.target;
  if (
    channelSearchResults.contains(target) ||
    channelSearchInput?.contains(target) ||
    channelSearchBtn?.contains(target)
  ) {
    return;
  }
  hideChannelSearchResults();
});
async function moveCalendarEvent(id, newDate) {
  await fetchJSON(`/api/calendar/events/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": getCurrentUserId()
    },
    body: JSON.stringify({ date: newDate })
  });

  await renderCalendar();
}

// ===================== EMOJI SYSTEM (FULL REBUILD) =====================

const RECENT_EMOJI_LIMIT = 24;
const RECENT_EMOJI_STORAGE_KEY = "worknest_recent_emoji";

const EMOJI_DATASET_URL = "https://cdn.jsdelivr.net/npm/emoji-datasource@15.1.2/emoji.json";

const EMOJI_CATEGORIES_FALLBACK = {
  smileys: ("😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤨 😐 😑 😶 🙄 😏 😣 😥 😮 🤐 😯 😪 😫 🥱 😴 🥲 🤡 🤠 😺 😸 😹 😻 😼 😽 🙀 😿 😾 🤖 💩").split(" "),
  people: ("👶 👧 🧒 👦 👩 🧑 👨 👩‍💻 👨‍💻 👨‍🍳 👩‍🍳 👨‍🏫 👩‍🏫 👨‍🔧 👩‍🔧 👨‍💼 👩‍💼 🙋 🙋‍♂️ 🙋‍♀️ 🤷 🤷‍♂️ 🤷‍♀️ 🤦 🤦‍♂️ 🤦‍♀️ 🙌 👏 🤝 👍 👎 ✌️ 🤟 🤘 🤙 ✋ 🤚 🤞").split(" "),
  animals: ("🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🦋 🐌 🐞 🐜 🦂 🐢 🐍 🦎 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳").split(" "),
  food: ("🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥝 🍅 🥑 🧄 🧅 🥔 🥕 🌽 🌶️ 🥒 🥬 🥦 🥐 🥯 🍞 🥖 🧀 🥚 🍳 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🥙 🧆 🍝").split(" "),
  activities: ("⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥅 🥊 🥋 🎽 🛹 ⛸️ 🛼 🏂 ⛷️ 🧗 🧘 🚴 🚵 🏇 🏆 🏅 🎖️ 🎟️ 🎫 🎮 🕹️ 🎲 ♟️ 🎯 🎳 🎰 🎤 🎧 🎼 🎹 🎷 🎺 🎸 🥁").split(" "),
  travel: ("🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🚚 🚛 🚜 🛵 🏍️ 🚲 🚂 🚆 🚇 🚊 🚝 ✈️ 🛫 🛬 🚁 ⛵ 🚤 🛥️ 🚢 🏖️ 🏝️ 🏜️ 🏔️ ⛰️ 🌋 🗻 🏕️ 🏙️ 🌃 🌆 🌉 🗽 🗼 🏰 🏯 ⛩️").split(" "),
  objects: ("⌚ 📱 💻 🖥️ 🖨️ ⌨️ 🖱️ 💾 📷 📸 🎥 📺 📻 🕰️ ⏰ ⏱️ ⏲️ 🧯 💡 🔦 🕯️ 📡 💸 💰 💳 🧾 📦 📝 📌 📎 🖊️ ✒️ 🖌️ 🖍️ 📁 📂 🗂️ 🗃️ 🗄️ 🗑️").split(" "),
  symbols: ("🚨 ❤️ 🧡 💛 💚 💙 💜 🤎 🖤 🤍 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ✅ ☑️ ✔️ ❌ ❗ ❓ ‼️ ⁉️ 🔺 🔻 ⬆️ ⬇️ ⬅️ ➡️ 🔄 🔁 ⭐ 🌟 ✨ 💫 🔥 ⚡ 🌀 🎵 🎶").split(" "),
  flags: ("🏳️ 🏴 🏁 🚩 🏳️‍🌈 🏴‍☠️ 🇺🇸 🇬🇧 🇨🇦 🇧🇩 🇮🇳 🇯🇵 🇩🇪 🇫🇷 🇧🇷 🇦🇺 🇪🇸 🇮🇹").split(" ")
};

const EMOJI_ALIASES = {
  rotating_light: "🚨",
  "rotating light": "🚨",
  "rotating-light": "🚨",
  rotatinglight: "🚨",
  siren: "🚨",
  alarm: "🚨",
  emergency: "🚨",
  police: "🚨"
};

const EMOJI_GIF_OVERRIDES = {
  "🚨": "assets/2668_Siren.gif",
  "🚑": "https://fonts.gstatic.com/s/e/notoemoji/latest/1f691/512.gif",
  "✅": "assets/Tikmark.gif",
  "✔️": "assets/Tikmark.gif"
};

let EMOJI_META = [];
let EMOJI_BY_CAT = {};
let emojiSearchIndexReady = false;

const emojiPicker = document.getElementById("emojiPicker");
const emojiPickerGrid = document.getElementById("emojiPickerGrid");
const emojiSearch = document.getElementById("emojiSearch");
const emojiCloseBtn = document.getElementById("emojiCloseBtn");
const emojiInputBtn = document.getElementById("emojiInputBtn");
const threadEmojiBtn = document.getElementById("threadEmojiBtn");
const emojiTabs = document.querySelectorAll(".emoji-tab");

let emojiMode = null;
let emojiTargetMessageId = null;
let emojiTargetReplyId = null;
let currentEmojiCategory = "smileys";
let lastEmojiTrigger = null;
let recentEmojis = [];

function loadRecentEmojis() {
  try {
    const raw = localStorage.getItem(RECENT_EMOJI_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) recentEmojis = parsed;
  } catch (e) {}
}

function saveRecentEmojis() {
  try {
    localStorage.setItem(RECENT_EMOJI_STORAGE_KEY, JSON.stringify(recentEmojis));
  } catch (e) {}
}

function rememberRecent(emoji) {
  recentEmojis = [emoji, ...recentEmojis.filter((x) => x !== emoji)];
  if (recentEmojis.length > RECENT_EMOJI_LIMIT) recentEmojis.length = RECENT_EMOJI_LIMIT;
  saveRecentEmojis();
}

function emojiToCodePointString(emoji) {
  const cps = [];
  for (const ch of emoji) cps.push(ch.codePointAt(0).toString(16));
  return cps.join("_").toLowerCase();
}

function emojiToGifSrc(emoji) {
  if (EMOJI_GIF_OVERRIDES[emoji]) return EMOJI_GIF_OVERRIDES[emoji];
  const code = emojiToCodePointString(emoji);
  return `https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.gif`;
}

function emojiToTwemojiPngSrc(emoji) {
  const cps = [];
  for (const ch of emoji) cps.push(ch.codePointAt(0).toString(16));
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${cps.join("-")}.png`;
}

function buildEmojiImage(emoji, size = 32) {
  const gif = emojiToGifSrc(emoji);
  return `
    <img class="emoji-anim emoji-loading"
         data-emoji="${emoji}"
         data-gif="${gif}"
         alt="${emoji}"
         width="${size}" height="${size}"
         loading="lazy"
         decoding="async">
  `;
}

function buildEmojiPickerImage(emoji) {
  const gif = emojiToGifSrc(emoji);
  return `
    <span class="emoji-wrap" data-emoji="${emoji}">
      <span class="emoji-fallback" aria-hidden="true">${emoji}</span>
      <img class="emoji-anim emoji-loading" data-emoji="${emoji}" data-gif="${gif}" alt="${emoji}" loading="lazy" decoding="async">
    </span>
  `;
}

function hydrateEmojiImages(root = document) {
  if (!root) return;
  const imgs = root.querySelectorAll("img.emoji-anim");
  imgs.forEach((img) => {
    if (img.dataset.hydrated === "1") return;
    img.dataset.hydrated = "1";

    const emoji = img.dataset.emoji || img.alt || "🙂";
    const gif = img.dataset.gif || emojiToGifSrc(emoji);
    const wrap = img.closest(".emoji-wrap");

    const markReady = () => {
      img.classList.remove("emoji-loading");
      if (wrap) wrap.classList.add("emoji-ready");
    };

    img.addEventListener("load", markReady, { once: true });
    img.addEventListener("error", () => {
      if (EMOJI_GIF_OVERRIDES[emoji]) {
        img.classList.remove("emoji-loading");
        return;
      }
      const tw = emojiToTwemojiPngSrc(emoji);
      img.src = tw;
      img.addEventListener("load", markReady, { once: true });
      img.addEventListener("error", () => {
        img.style.display = "none";
        img.classList.remove("emoji-loading");
      }, { once: true });
    }, { once: true });

    img.src = gif;
  });
}

function mapCategoryToTabKey(cat) {
  const s = String(cat || "").toLowerCase();
  if (s.includes("smileys") || s.includes("emotion")) return "smileys";
  if (s.includes("people") || s.includes("body")) return "people";
  if (s.includes("animals") || s.includes("nature")) return "animals";
  if (s.includes("food") || s.includes("drink")) return "food";
  if (s.includes("activities")) return "activities";
  if (s.includes("travel") || s.includes("places")) return "travel";
  if (s.includes("objects")) return "objects";
  if (s.includes("symbols")) return "symbols";
  if (s.includes("flags")) return "flags";
  return "symbols";
}

function unifiedToEmoji(unified) {
  try {
    const cps = unified.split("-").map((h) => parseInt(h, 16));
    return String.fromCodePoint(...cps);
  } catch {
    return "";
  }
}

async function loadFullEmojiDataset() {
  try {
    const res = await fetch(EMOJI_DATASET_URL, { cache: "force-cache" });
    if (!res.ok) throw new Error("emoji dataset fetch failed");
    const data = await res.json();

    const byCat = {
      smileys: [],
      people: [],
      animals: [],
      food: [],
      activities: [],
      travel: [],
      objects: [],
      symbols: [],
      flags: []
    };

    const meta = [];
    for (const item of data) {
      if (!item || !item.unified) continue;
      const emoji = unifiedToEmoji(item.unified);
      if (!emoji) continue;

      const catKey = mapCategoryToTabKey(item.category);
      const keywords = [
        item.short_name,
        ...(item.short_names || []),
        item.name
      ].filter(Boolean).join(" ").toLowerCase();

      byCat[catKey].push(emoji);
      meta.push({ emoji, catKey, keywords });
    }

    for (const k of Object.keys(byCat)) byCat[k] = Array.from(new Set(byCat[k]));

    EMOJI_BY_CAT = byCat;
    EMOJI_META = meta;
    emojiSearchIndexReady = true;
    return true;
  } catch (e) {
    console.warn("Full emoji dataset not available, using fallback list.", e);
    emojiSearchIndexReady = false;
    return false;
  }
}

function buildEmojiPicker(category = "smileys") {
  currentEmojiCategory = category;
  if (!emojiPickerGrid) return;

  emojiTabs.forEach((t) => {
    if (t.dataset.cat === category) t.classList.add("emoji-tab-active");
    else t.classList.remove("emoji-tab-active");
  });

  emojiPickerGrid.innerHTML = "";

  if (recentEmojis.length) {
    const label = document.createElement("div");
    label.className = "emoji-section-label";
    label.textContent = "Recently used";
    emojiPickerGrid.appendChild(label);

    const row = document.createElement("div");
    row.className = "emoji-row";
    recentEmojis.slice(0, RECENT_EMOJI_LIMIT).forEach((emoji) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "emoji-btn emoji-btn-recent";
      btn.dataset.emoji = emoji;
      btn.innerHTML = buildEmojiPickerImage(emoji);
      btn.addEventListener("click", () => handleEmojiSelect(emoji));
      row.appendChild(btn);
    });
    emojiPickerGrid.appendChild(row);

    const divider = document.createElement("div");
    divider.className = "emoji-section-divider";
    emojiPickerGrid.appendChild(divider);
  }

  const rawQuery = (emojiSearch?.value || "").trim().toLowerCase();
  const q = rawQuery.replace(/^:+|:+$/g, "");
  const qUnderscore = q.replace(/\s+/g, "_");
  const qNoSpace = q.replace(/\s+/g, "");
  const aliasEmoji = q ? EMOJI_ALIASES[q] : null;

  let emojis = [];
  if (emojiSearchIndexReady && EMOJI_BY_CAT[category]) emojis = EMOJI_BY_CAT[category];
  else emojis = EMOJI_CATEGORIES_FALLBACK[category] || [];

  if (aliasEmoji) {
    emojis = [aliasEmoji];
  } else if (q) {
    if (emojiSearchIndexReady) {
      const seen = new Set();
      emojis = EMOJI_META
        .filter((m) =>
          m.keywords.includes(q) ||
          (qUnderscore && m.keywords.includes(qUnderscore)) ||
          (qNoSpace && m.keywords.includes(qNoSpace))
        )
        .map((m) => m.emoji)
        .filter((e) => (seen.has(e) ? false : (seen.add(e), true)));
    } else {
      emojis = emojis.filter((e) => String(e).includes(q));
    }
  }

  const frag = document.createDocumentFragment();
  emojis.forEach((emoji) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emoji-btn";
    btn.dataset.emoji = emoji;
    btn.innerHTML = buildEmojiPickerImage(emoji);
    btn.addEventListener("click", () => handleEmojiSelect(emoji));
    frag.appendChild(btn);
  });

  emojiPickerGrid.appendChild(frag);
  hydrateEmojiImages(emojiPickerGrid);
}

function openEmojiPicker(mode, targetId = null) {
  if (!emojiPicker) return;
  emojiMode = mode;
  lastEmojiTrigger = document.activeElement;

  emojiTargetMessageId = null;
  emojiTargetReplyId = null;
  emojiTargetTaskId = null;
  emojiTargetTaskCommentId = null;
  if (mode === "message-reaction") emojiTargetMessageId = targetId;
  if (mode === "reply-reaction") emojiTargetReplyId = targetId;
  if (mode === "task-reaction") emojiTargetTaskId = targetId;
  if (mode === "task-comment-reaction") emojiTargetTaskCommentId = targetId;

  emojiPicker.classList.remove("hidden");
  emojiPicker.style.display = "flex";
  buildEmojiPicker(currentEmojiCategory || "smileys");

  requestAnimationFrame(() => {
    const first = emojiPicker.querySelector(".emoji-btn");
    if (first) first.focus();
  });
}

function closeEmojiPicker() {
  if (!emojiPicker) return;
  const mode = emojiMode;

  emojiMode = null;
  emojiTargetMessageId = null;
  emojiTargetReplyId = null;
  emojiTargetTaskId = null;
  emojiTargetTaskCommentId = null;

  emojiPicker.classList.add("hidden");
  emojiPicker.style.display = "none";

  const fallback =
    (lastEmojiTrigger && lastEmojiTrigger.isConnected && lastEmojiTrigger) ||
    (mode === "input" ? emojiInputBtn : mode === "thread-input" ? threadEmojiBtn : null);

  if (fallback && typeof fallback.focus === "function") {
    try { fallback.focus({ preventScroll: true }); } catch { fallback.focus(); }
  }
  lastEmojiTrigger = null;
}

async function handleEmojiSelect(emoji) {
  rememberRecent(emoji);

  if (emojiMode === "input") {
    if (typeof rteEditor !== "undefined" && rteEditor) {
      rteEditor.focus();
      const html = buildEmojiImage(emoji, 24);
      try {
        document.execCommand("insertHTML", false, html);
      } catch (e) {
        rteEditor.innerHTML += html;
      }
      hydrateEmojiImages(rteEditor);
      if (typeof syncEditorToTextarea === "function") syncEditorToTextarea();
    } else if (typeof messageInput !== "undefined" && messageInput) {
      messageInput.value += emoji;
      messageInput.focus();
    }
  }

  if (emojiMode === "thread-input") {
    if (typeof threadInput !== "undefined" && threadInput) {
      threadInput.value += emoji;
      threadInput.focus();
    }
  }

  if (emojiMode === "message-reaction" && emojiTargetMessageId) {
    if (typeof addReactionToMessage === "function") addReactionToMessage(emojiTargetMessageId, emoji);
  }
  if (emojiMode === "reply-reaction" && emojiTargetReplyId) {
    if (typeof addReactionToReply === "function") addReactionToReply(emojiTargetReplyId, emoji);
  }
  if (emojiMode === "task-reaction" && emojiTargetTaskId) {
    if (typeof toggleTaskReaction === "function") await toggleTaskReaction(emojiTargetTaskId, emoji);
  }
  if (emojiMode === "task-comment-reaction" && emojiTargetTaskCommentId) {
    if (typeof toggleTaskCommentReaction === "function") await toggleTaskCommentReaction(emojiTargetTaskCommentId, emoji);
  }

  closeEmojiPicker();
}

if (emojiInputBtn) {
  emojiInputBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!emojiPicker) return;
    if (emojiPicker.classList.contains("hidden") || emojiPicker.style.display === "none") {
      openEmojiPicker("input");
    } else {
      closeEmojiPicker();
    }
  });
}

if (threadEmojiBtn) {
  threadEmojiBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!emojiPicker) return;
    if (emojiPicker.classList.contains("hidden") || emojiPicker.style.display === "none") {
      openEmojiPicker("thread-input");
    } else {
      closeEmojiPicker();
    }
  });
}

emojiTabs.forEach((tab) => {
  tab.addEventListener("click", (e) => {
    e.stopPropagation();
    const cat = tab.dataset.cat;
    if (!cat) return;
    buildEmojiPicker(cat);
  });
});

if (emojiSearch) {
  let t = 0;
  emojiSearch.addEventListener("input", () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => buildEmojiPicker(currentEmojiCategory || "smileys"), 120);
  });
}

if (emojiCloseBtn) {
  emojiCloseBtn.addEventListener("click", () => closeEmojiPicker());
}

document.addEventListener("click", (e) => {
  if (!emojiPicker || emojiPicker.classList.contains("hidden")) return;
  const inside = emojiPicker.contains(e.target);
  const onMain = emojiInputBtn && (e.target === emojiInputBtn || emojiInputBtn.contains(e.target));
  const onThread = threadEmojiBtn && (e.target === threadEmojiBtn || threadEmojiBtn.contains(e.target));
  const onReaction = e.target.closest && e.target.closest(".emoji-trigger");
  if (!inside && !onMain && !onThread && !onReaction) closeEmojiPicker();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeEmojiPicker();
});


// ===================== SCHOOL PLANNER (JS) =====================

const PLANNER_STORAGE_KEY = "worknest_planner_events_v1";

let plannerState = {
  view: "week",          // week | agenda | month
  filter: "all",         // all | my | class | homework | exam | club | school
  search: "",
  cursorDate: new Date(), // controls month label + nav
  events: []
};

function plannerGetRole() {
  const raw = (sessionUser && (sessionUser.role || sessionUser.userRole)) || "";
  const normalized = normalizeRole(raw);
  if (normalized === "super_admin" || normalized === "school_admin") {
    return normalized;
  }
  if (normalized === "teacher") {
    return "teacher";
  }
  return "student";
}

function plannerGetUserId() {
  return (sessionUser && (sessionUser.userId || sessionUser.email || sessionUser.username)) || "anon";
}

function plannerGetWorkspaceId() {
  return (window.currentWorkspaceId || (sessionUser && sessionUser.workspaceId)) || "default";
}

function plannerSave() {
  try {
    localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(plannerState.events));
  } catch (e) {}
}

function plannerLoad() {
  try {
    const raw = localStorage.getItem(PLANNER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    plannerState.events = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    plannerState.events = [];
  }
}

function plannerIso(d) {
  // local time ISO-like
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

function plannerParseDate(s) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function plannerStartOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function plannerEndOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function plannerDaysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function plannerFormatDayLabel(d) {
  return d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });
}

function plannerFormatMonthLabel(d) {
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function plannerHumanTime(d) {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function plannerTypeMeta(type) {
  // dot colors are controlled by CSS via inline background
  switch (type) {
    case "homework": return { dot: "rgba(245,158,11,.95)", icon: "📝", label: "Homework" };
    case "exam":     return { dot: "rgba(239,68,68,.95)", icon: "🧪", label: "Exam" };
    case "club":     return { dot: "rgba(34,197,94,.95)", icon: "🎤", label: "Club" };
    case "school":   return { dot: "rgba(148,163,184,.95)", icon: "🏫", label: "School" };
    case "reminder": return { dot: "rgba(99,102,241,.95)", icon: "⏰", label: "Reminder" };
    default:         return { dot: "rgba(56,189,248,.95)", icon: "📘", label: "Class" };
  }
}

function plannerOwnsEvent(evt) {
  const me = plannerGetUserId();
  if (!evt) return false;
  if (evt.createdBy && evt.createdBy === me) return true;
  if (Array.isArray(evt.attendees) && evt.attendees.includes(me)) return true;
  return false;
}

function plannerCanSee(evt) {
  const role = plannerGetRole();
  const me = plannerGetUserId();

  if (evt.workspaceId && evt.workspaceId !== plannerGetWorkspaceId()) return false;

  if (evt.visibility === "private") {
    return evt.createdBy === me;
  }

  if (evt.visibility === "school") {
    if (role === "school_admin" || role === "super_admin" || role === "teacher") return true;
    return evt.targetRole === "all" || evt.targetRole === "students";
  }

  return true;
}

function plannerPassesFilter(evt) {
  const f = plannerState.filter;
  const role = plannerGetRole();

  if (f === "all") return true;
  if (f === "my") {
    if (plannerOwnsEvent(evt)) return true;
    return !!evt.channelId;
  }
  if (f === "school") return (role !== "student") && evt.visibility === "school";
  return evt.type === f;
}

function plannerPassesSearch(evt) {
  const q = (plannerState.search || "").trim().toLowerCase();
  if (!q) return true;
  const hay = [
    evt.title,
    evt.type,
    evt.location,
    evt.channelName,
    evt.tags ? evt.tags.join(" ") : "",
  ].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q);
}

function plannerInRange(evt, start, end) {
  const s = plannerParseDate(evt.startsAt);
  if (!s) return false;
  return s >= start && s <= end;
}

function plannerOpenEvent(evt) {
  if (evt.channelId && typeof openChannel === "function") {
    openChannel(evt.channelId);
  }

  if (evt.threadMessageId && typeof openThread === "function") {
    try { openThread(evt.channelId, evt.threadMessageId); } catch (_e) {
      try { openThread(evt.threadMessageId); } catch (__e) {}
    }
  }
}

function plannerRowHTML(evt) {
  const meta = plannerTypeMeta(evt.type);
  const start = plannerParseDate(evt.startsAt);
  const end = plannerParseDate(evt.endsAt);
  const time = start ? plannerHumanTime(start) : "";
  const timeEnd = end ? plannerHumanTime(end) : "";
  const when = timeEnd ? `${time}–${timeEnd}` : time;

  const subtitleBits = [];
  if (when) subtitleBits.push(when);
  if (evt.location) subtitleBits.push(evt.location);
  if (evt.channelName) subtitleBits.push(evt.channelName);

  return `
    <div class="ps-row" data-evt="${evt.id}">
      <div class="ps-dot" style="background:${meta.dot}"></div>
      <div>
        <div class="ps-row-title">${meta.icon} ${escapeHtml(evt.title || meta.label)}</div>
        <div class="ps-row-sub">${escapeHtml(subtitleBits.join(" • "))}</div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function expandRecurringEvents(events, rangeStart, rangeEnd) {
  const out = [];
  for (const e of events) {
    if (!e.recurrence || e.recurrence.freq !== "weekly") {
      out.push(e);
      continue;
    }

    const r = e.recurrence;
    const startBase = plannerStartOfDay(rangeStart);
    const endBase = plannerEndOfDay(rangeEnd);
    let cursor = nextDateForDow(r.dow, startBase);
    cursor.setHours(r.startHH, r.startMM, 0, 0);
    if (cursor < rangeStart) {
      cursor.setDate(cursor.getDate() + 7);
    }

    let count = 0;
    const limit = (r.weeks || 12) * 2;
    while (cursor <= endBase && count < limit) {
      const endAt = new Date(cursor);
      endAt.setHours(r.endHH, r.endMM, 0, 0);

      out.push({
        ...e,
        id: `${e.id}__${cursor.toISOString().slice(0, 10)}`,
        startsAt: plannerIso(cursor),
        endsAt: plannerIso(endAt),
        isOccurrence: true,
        parentId: e.id
      });

      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() + 7);
      count++;
    }
  }
  return out;
}

function plannerGetVisibleEvents() {
  const base = (plannerState.events || [])
    .filter(plannerCanSee)
    .filter(plannerPassesFilter)
    .filter(plannerPassesSearch);

  const start = plannerStartOfDay(new Date());
  const end = plannerEndOfDay(plannerDaysFromNow(30));
  return expandRecurringEvents(base, start, end);
}

function plannerRenderSidePanels() {
  const todayEl = document.getElementById("plannerTodayList");
  const upcomingEl = document.getElementById("plannerUpcomingList");
  const deadlineEl = document.getElementById("plannerDeadlineList");
  const todayLabel = document.getElementById("plannerTodayLabel");
  const monthLabel = document.getElementById("plannerMonthLabel");

  if (todayLabel) todayLabel.textContent = plannerFormatDayLabel(new Date());
  if (monthLabel) monthLabel.textContent = plannerFormatMonthLabel(plannerState.cursorDate);

  const visible = plannerGetVisibleEvents();

  const now = new Date();
  const todayStart = plannerStartOfDay(now);
  const todayEnd = plannerEndOfDay(now);
  const weekEnd = plannerEndOfDay(plannerDaysFromNow(7));

  const todayEvents = visible
    .filter(e => plannerInRange(e, todayStart, todayEnd))
    .sort((a,b) => new Date(a.startsAt) - new Date(b.startsAt));

  const upcomingEvents = visible
    .filter(e => plannerInRange(e, todayStart, weekEnd))
    .sort((a,b) => new Date(a.startsAt) - new Date(b.startsAt))
    .slice(0, 12);

  const deadlineEvents = visible
    .filter(e => e.type === "homework" || e.type === "exam")
    .filter(e => plannerInRange(e, todayStart, plannerEndOfDay(plannerDaysFromNow(30))))
    .sort((a,b) => new Date(a.startsAt) - new Date(b.startsAt))
    .slice(0, 12);

  if (todayEl) todayEl.innerHTML =
    todayEvents.length ? todayEvents.map(plannerRowHTML).join("") :
    `<div class="ps-row" style="cursor:default;opacity:.75"><div style="padding-left:4px">🎉 Nothing scheduled today</div></div>`;

  if (upcomingEl) upcomingEl.innerHTML =
    upcomingEvents.length ? upcomingEvents.map(plannerRowHTML).join("") :
    `<div class="ps-row" style="cursor:default;opacity:.75"><div style="padding-left:4px">No upcoming events</div></div>`;

  if (deadlineEl) deadlineEl.innerHTML =
    deadlineEvents.length ? deadlineEvents.map(plannerRowHTML).join("") :
    `<div class="ps-row" style="cursor:default;opacity:.75"><div style="padding-left:4px">No deadlines in the next 30 days</div></div>`;

  [todayEl, upcomingEl, deadlineEl].forEach((root) => {
    if (!root) return;
    root.querySelectorAll(".ps-row[data-evt]").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-evt");
        const evt = plannerState.events.find(e => e.id === id);
        if (evt) plannerOpenEvent(evt);
      });
    });
  });
}

function plannerRenderRoleUI() {
  const role = plannerGetRole();
  const addBtn = document.getElementById("plannerAddBtn");
  const quick = document.getElementById("plannerQuickActions");
  const schoolChip = document.querySelector(".chip-admin");

  if (schoolChip)
    schoolChip.style.display =
      role === "teacher" || role === "school_admin" || role === "super_admin"
        ? "inline-flex"
        : "none";

  if (addBtn) addBtn.title = role === "student" ? "Add personal reminder" : "Add event";

  if (quick) {
    const btns = quick.querySelectorAll("button[data-action]");
    btns.forEach((b) => b.classList.remove("hidden"));

    if (role === "student") {
      quick.querySelector('[data-action="createHomework"]')?.classList.add("hidden");
      quick.querySelector('[data-action="scheduleExam"]')?.classList.add("hidden");
      quick.querySelector('[data-action="addSpeaking"]')?.classList.add("hidden");
    }
  }
}

function plannerOpenAddModal(prefill = {}) {
  const role = plannerGetRole();
  const isStudent = role === "student";

  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,.45)";
  overlay.style.zIndex = "9999";
  overlay.style.display = "grid";
  overlay.style.placeItems = "center";

  const card = document.createElement("div");
  card.style.width = "520px";
  card.style.maxWidth = "92vw";
  card.style.borderRadius = "16px";
  card.style.border = "1px solid rgba(148,163,184,.18)";
  card.style.background = "rgba(15,23,42,.96)";
  card.style.boxShadow = "0 28px 70px rgba(0,0,0,.55)";
  card.style.padding = "14px";

  const now = new Date();
  const start = prefill.startsAt || plannerIso(now);
  const end = prefill.endsAt || plannerIso(new Date(now.getTime() + 60 * 60 * 1000));

  const typeOptions = isStudent
    ? `<option value="reminder">Reminder</option>`
    : `
      <option value="class">Class</option>
      <option value="homework">Homework</option>
      <option value="exam">Exam</option>
      <option value="club">Club</option>
      <option value="school">School event</option>
      <option value="reminder">Personal reminder</option>
    `;

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <div style="font-weight:900;font-size:15px;">${isStudent ? "Add reminder" : "Add event"}</div>
      <button id="plannerModalClose" style="border:none;background:transparent;color:rgba(226,232,240,.85);font-size:20px;cursor:pointer;">×</button>
    </div>

    <div style="display:grid;gap:10px;">
      <label style="display:grid;gap:6px;">
        <span style="font-size:12px;opacity:.75;font-weight:800;">Title</span>
        <input id="plannerEvtTitle" value="${escapeHtml(prefill.title || "")}" placeholder="e.g. A1 Morning / Homework Week 3"
          style="height:38px;border-radius:12px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.55);color:#e2e8f0;padding:0 10px;">
      </label>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <label style="display:grid;gap:6px;">
          <span style="font-size:12px;opacity:.75;font-weight:800;">Type</span>
          <select id="plannerEvtType"
            style="height:38px;border-radius:12px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.55);color:#e2e8f0;padding:0 10px;">
            ${typeOptions}
          </select>
        </label>

        <label style="display:grid;gap:6px;">
          <span style="font-size:12px;opacity:.75;font-weight:800;">Location (optional)</span>
          <input id="plannerEvtLocation" value="${escapeHtml(prefill.location || "")}" placeholder="Room 2 / Online"
            style="height:38px;border-radius:12px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.55);color:#e2e8f0;padding:0 10px;">
        </label>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <label style="display:grid;gap:6px;">
          <span style="font-size:12px;opacity:.75;font-weight:800;">Start</span>
          <input id="plannerEvtStart" type="datetime-local"
            value="${start.slice(0,16)}"
            style="height:38px;border-radius:12px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.55);color:#e2e8f0;padding:0 10px;">
        </label>

        <label style="display:grid;gap:6px;">
          <span style="font-size:12px;opacity:.75;font-weight:800;">End</span>
          <input id="plannerEvtEnd" type="datetime-local"
            value="${end.slice(0,16)}"
            style="height:38px;border-radius:12px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.55);color:#e2e8f0;padding:0 10px;">
        </label>
      </div>

      <label style="display:grid;gap:6px;">
        <span style="font-size:12px;opacity:.75;font-weight:800;">Link to channel (optional)</span>
        <input id="plannerEvtChannel" value="${escapeHtml(prefill.channelId || "")}" placeholder="channel id (e.g. a1-morning)"
          style="height:38px;border-radius:12px;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.55);color:#e2e8f0;padding:0 10px;">
        <span style="font-size:11px;opacity:.65;">If set, clicking the event will open the channel.</span>
      </label>

      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:6px;">
        <button id="plannerModalCancel"
          style="height:38px;padding:0 12px;border-radius:12px;border:1px solid rgba(148,163,184,.18);background:transparent;color:#e2e8f0;font-weight:900;cursor:pointer;">
          Cancel
        </button>
        <button id="plannerModalSave"
          style="height:38px;padding:0 12px;border-radius:12px;border:none;background:linear-gradient(135deg,#2563eb 0%,#60a5fa 100%);color:white;font-weight:900;cursor:pointer;">
          Save
        </button>
      </div>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  card.querySelector("#plannerModalClose").addEventListener("click", close);
  card.querySelector("#plannerModalCancel").addEventListener("click", close);

  const typeSelect = card.querySelector("#plannerEvtType");
  if (prefill.type) typeSelect.value = prefill.type;

  card.querySelector("#plannerModalSave").addEventListener("click", () => {
    const title = card.querySelector("#plannerEvtTitle").value.trim();
    if (!title) return;

    const type = card.querySelector("#plannerEvtType").value;
    const startsAt = card.querySelector("#plannerEvtStart").value;
    const endsAt = card.querySelector("#plannerEvtEnd").value;
    const location = card.querySelector("#plannerEvtLocation").value.trim();
    const channelId = card.querySelector("#plannerEvtChannel").value.trim();

    const evt = {
      id: "evt_" + Math.random().toString(16).slice(2) + Date.now().toString(16),
      workspaceId: plannerGetWorkspaceId(),
      type,
      title,
      startsAt: startsAt ? (startsAt + ":00") : plannerIso(new Date()),
      endsAt: endsAt ? (endsAt + ":00") : plannerIso(new Date()),
      channelId: channelId || "",
      channelName: "",
      threadMessageId: "",
      createdBy: plannerGetUserId(),
      visibility: (type === "school" ? "school" : (type === "reminder" ? "private" : "class")),
      targetRole: "all",
      location,
      tags: [],
      status: "open"
    };

    if (isStudent) {
      evt.type = "reminder";
      evt.visibility = "private";
    }

    plannerState.events.unshift(evt);
    plannerSave();
    plannerRenderSidePanels();
    close();
  });
}

function plannerBindUI() {
  const search = document.getElementById("plannerSearch");
  const addBtn = document.getElementById("plannerAddBtn");
  const chips = document.getElementById("plannerChips");
  const todayBtn = document.getElementById("plannerTodayBtn");
  const prevBtn = document.getElementById("plannerPrevBtn");
  const nextBtn = document.getElementById("plannerNextBtn");
  const viewBtns = document.querySelectorAll('.planner-view .pbtn');

  if (search) {
    search.addEventListener("input", () => {
      plannerState.search = search.value || "";
      plannerRenderSidePanels();
    });
  }

  if (chips) {
    chips.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-filter]");
      if (!b) return;
      plannerState.filter = b.getAttribute("data-filter") || "all";
      chips.querySelectorAll(".chip").forEach(x => x.classList.remove("chip-active"));
      b.classList.add("chip-active");
      plannerRenderSidePanels();
    });
  }

  if (addBtn) addBtn.addEventListener("click", () => plannerOpenAddModal());

  if (todayBtn) todayBtn.addEventListener("click", () => {
    plannerState.cursorDate = new Date();
    plannerRenderSidePanels();
  });

  if (prevBtn) prevBtn.addEventListener("click", () => {
    const d = new Date(plannerState.cursorDate);
    d.setMonth(d.getMonth() - 1);
    plannerState.cursorDate = d;
    plannerRenderSidePanels();
  });

  if (nextBtn) nextBtn.addEventListener("click", () => {
    const d = new Date(plannerState.cursorDate);
    d.setMonth(d.getMonth() + 1);
    plannerState.cursorDate = d;
    plannerRenderSidePanels();
  });

  viewBtns.forEach((b) => {
    b.addEventListener("click", () => {
      viewBtns.forEach(x => x.classList.remove("pbtn-active"));
      b.classList.add("pbtn-active");
      plannerState.view = b.getAttribute("data-view") || "week";
    });
  });

  const quick = document.getElementById("plannerQuickActions");
  if (quick) {
    quick.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-action]");
      if (!b) return;
      const a = b.getAttribute("data-action");

      if (a === "addReminder") {
        plannerOpenAddModal({ type: "reminder", title: "Study reminder" });
      } else if (a === "createHomework") {
        plannerOpenAddModal({ type: "homework", title: "Homework – " });
      } else if (a === "scheduleExam") {
        plannerOpenAddModal({ type: "exam", title: "Exam – " });
      }
    });
  }
}

// ===================== PLANNER: Homework Due Date Seeding =====================

function parseDueFromText(text) {
  const raw = String(text || "");
  if (!raw) return null;
  const plain = raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const m =
    plain.match(/(?:\bDue\b|\bDeadline\b)\s*:\s*([^\n\r•]+?)(?:\s{2,}|$)/i) ||
    plain.match(/(?:\bDue\b|\bDeadline\b)\s*-\s*([^\n\r•]+?)(?:\s{2,}|$)/i);
  if (!m) return null;
  const val = String(m[1] || "").trim();
  const dm = val.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (dm) {
    const dd = Number(dm[1]);
    const mm = Number(dm[2]);
    const yyyy = Number(dm[3]);
    const hh = dm[4] ? Number(dm[4]) : 23;
    const mi = dm[5] ? Number(dm[5]) : 59;
    const d = new Date(yyyy, mm - 1, dd, hh, mi, 0, 0);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const ym = val.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (ym) {
    const yyyy = Number(ym[1]);
    const mm = Number(ym[2]);
    const dd = Number(ym[3]);
    const hh = ym[4] ? Number(ym[4]) : 23;
    const mi = ym[5] ? Number(ym[5]) : 59;
    const d = new Date(yyyy, mm - 1, dd, hh, mi, 0, 0);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const fallback = new Date(val);
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return null;
}

function plannerEventIdForHomework(channelId, messageId) {
  return `hw_${String(channelId || "").replace(/[^a-z0-9_-]/gi,"")}_${String(messageId || "").replace(/[^a-z0-9_-]/gi,"")}`;
}

function isHomeworkChannelByNameOrMeta(channelId) {
  const ch = (typeof getChannelById === "function") ? getChannelById(channelId) : null;
  const nm = String(ch?.name || ch?.title || "").toLowerCase();
  const cat = String(ch?.category || "").toLowerCase();
  return cat === "homework" || nm.includes("homework");
}

function seedPlannerFromHomeworkMessages(channelId, messages = []) {
  if (!document.querySelector(".planner")) return;
  if (!isHomeworkChannelByNameOrMeta(channelId)) return;
  if (!Array.isArray(messages) || !messages.length) return;
  if (!plannerState || !Array.isArray(plannerState.events)) return;

  const workspaceId = plannerGetWorkspaceId();
  const now = new Date();
  let changed = false;

  for (const msg of messages) {
    if (!msg || !msg.id) continue;
    const dueDate = parseDueFromText(msg.text || msg.body || "");
    if (!dueDate) continue;
    if (dueDate.getTime() < now.getTime() - 180 * 24 * 3600 * 1000) continue;

    const evtId = plannerEventIdForHomework(channelId, msg.id);
    const titleLine = String(msg.text || "")
      .replace(/<[^>]*>/g, "\n")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)[0] || "Homework";
    const ch = (typeof getChannelById === "function") ? getChannelById(channelId) : null;
    const channelName = ch?.name || ch?.title || "Homework";

    const newEvt = {
      id: evtId,
      workspaceId,
      type: "homework",
      title: `Homework – ${titleLine.slice(0, 60)}`,
      startsAt: plannerIso(dueDate),
      endsAt: plannerIso(new Date(dueDate.getTime() + 30 * 60 * 1000)),
      channelId: channelId,
      channelName: channelName,
      threadMessageId: msg.id,
      createdBy: msg.userId || msg.authorId || msg.user || "teacher",
      visibility: "class",
      targetRole: "students",
      location: "",
      tags: [],
      status: "open"
    };

    const idx = plannerState.events.findIndex((e) => e.id === evtId);
    if (idx >= 0) {
      const old = plannerState.events[idx];
      if (old.startsAt !== newEvt.startsAt || old.title !== newEvt.title) {
        plannerState.events[idx] = { ...old, ...newEvt };
        changed = true;
      }
    } else {
      plannerState.events.unshift(newEvt);
      changed = true;
    }
  }

  if (changed) {
    plannerSave();
    plannerRenderSidePanels();
  }
}

// ===================== PLANNER: Class Schedule Seeding =====================

function normalizeWeekdayToken(tok) {
  const t = String(tok || "").trim().toLowerCase();

  if (["mon","monday"].includes(t)) return 1;
  if (["tue","tues","tuesday"].includes(t)) return 2;
  if (["wed","wednesday"].includes(t)) return 3;
  if (["thu","thur","thurs","thursday"].includes(t)) return 4;
  if (["fri","friday"].includes(t)) return 5;
  if (["sat","saturday"].includes(t)) return 6;
  if (["sun","sunday"].includes(t)) return 0;

  if (["mo","montag"].includes(t)) return 1;
  if (["di","dienstag"].includes(t)) return 2;
  if (["mi","mittwoch"].includes(t)) return 3;
  if (["do","donnerstag"].includes(t)) return 4;
  if (["fr","freitag"].includes(t)) return 5;
  if (["sa","samstag"].includes(t)) return 6;
  if (["so","sonntag"].includes(t)) return 0;

  return null;
}

function parseRoomFromText(text) {
  const raw = String(text || "");
  const plain = raw.replace(/<[^>]*>/g, "\n");
  const m =
    plain.match(/(?:\bRoom\b|\bRaum\b)\s*:\s*([^\n\r]+)/i) ||
    plain.match(/(?:\bRoom\b|\bRaum\b)\s*-\s*([^\n\r]+)/i);
  return m ? String(m[1] || "").trim() : "";
}

function parseScheduleLines(text) {
  const raw = String(text || "");
  if (!raw) return [];

  const plain = raw.replace(/<[^>]*>/g, "\n");
  const lines = plain.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const hasSchedule = lines.some((l) => /^schedule\s*:/i.test(l) || /^stundenplan\s*:/i.test(l));
  if (!hasSchedule) return [];

  const out = [];
  for (const line of lines) {
    const m = line.match(/^([A-Za-z]{2,9})\s+(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/);
    if (!m) continue;
    const dow = normalizeWeekdayToken(m[1]);
    if (dow === null) continue;
    out.push({
      dow,
      startHH: Number(m[2]),
      startMM: Number(m[3]),
      endHH: Number(m[4]),
      endMM: Number(m[5])
    });
  }

  return out;
}

function nextDateForDow(dow, baseDate = new Date()) {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diff = (dow - day + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function plannerEventIdForClassSession(channelId, dow, startHH, startMM) {
  return `class_${String(channelId || "").replace(/[^a-z0-9_-]/gi,"")}_${dow}_${startHH}_${startMM}`;
}

function isClassChannel(channelId) {
  const ch = (typeof getChannelById === "function") ? getChannelById(channelId) : null;
  const cat = String(ch?.category || "").toLowerCase();
  const nm = String(ch?.name || "").toLowerCase();
  if (nm.includes("homework")) return false;
  if (nm.includes("exam") || nm.includes("test")) return false;
  if (cat === "class" || cat === "classes") return true;
  if (nm.match(/\b(a1|a2|b1|b2|c1|c2)\b/)) return true;
  return false;
}

function seedPlannerFromClassSchedule(channelId, scheduleText, options = {}) {
  if (!document.querySelector(".planner")) return;
  if (!isClassChannel(channelId)) return;
  const lines = parseScheduleLines(scheduleText);
  if (!lines.length) return;

  const weeks = Math.max(1, Math.min(52, Number(options.weeks || 12)));
  const workspaceId = plannerGetWorkspaceId();
  const ch = (typeof getChannelById === "function") ? getChannelById(channelId) : null;
  const channelName = ch?.name || ch?.title || "Class";
  const room = parseRoomFromText(scheduleText) || options.room || "";

  let changed = false;

  for (const s of lines) {
    const evtId = plannerEventIdForClassSession(channelId, s.dow, s.startHH, s.startMM);
    const template = {
      id: evtId,
      workspaceId,
      type: "class",
      title: channelName,
      startsAt: "",
      endsAt: "",
      channelId,
      channelName,
      threadMessageId: "",
      createdBy: plannerGetUserId(),
      visibility: "class",
      targetRole: "students",
      location: room,
      tags: [],
      status: "open",
      recurrence: {
        freq: "weekly",
        dow: s.dow,
        startHH: s.startHH,
        startMM: s.startMM,
        endHH: s.endHH,
        endMM: s.endMM,
        weeks
      }
    };

    const next = nextDateForDow(s.dow, new Date());
    next.setHours(s.startHH, s.startMM, 0, 0);
    const end = new Date(next);
    end.setHours(s.endHH, s.endMM, 0, 0);
    template.startsAt = plannerIso(next);
    template.endsAt = plannerIso(end);

    const idx = plannerState.events.findIndex((e) => e.id === evtId);
    if (idx >= 0) {
      const old = plannerState.events[idx];
      const keyOld = JSON.stringify(old.recurrence || {});
      const keyNew = JSON.stringify(template.recurrence || {});
      if (old.title !== template.title || old.location !== template.location || keyOld !== keyNew) {
        plannerState.events[idx] = { ...old, ...template };
        changed = true;
      }
    } else {
      plannerState.events.unshift(template);
      changed = true;
    }
  }

  if (changed) {
    plannerSave();
    plannerRenderSidePanels();
  }
}

function loadScheduleTextForClass(channelId) {
  try {
    return localStorage.getItem(`worknest_class_schedule_${channelId}`) || "";
  } catch {
    return "";
  }
}

function plannerInitIfPresent() {
  const root = document.querySelector(".planner");
  if (!root) return;

  plannerLoad();
  plannerRenderRoleUI();
  plannerBindUI();
  plannerRenderSidePanels();
}
plannerInitIfPresent();

function escapeHtmlText(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function requestCultureTranslation({ channelId, msg, from, to, plainText }) {
  const key = `${channelId}:${msg.id}|${to}`;
  if (!plainText) return null;

  if (cultureTranslationCache.has(key)) return cultureTranslationCache.get(key);
  if (cultureTranslationInflight.has(key)) return cultureTranslationInflight.get(key);

  const stored = readLocalTranslation(channelId, msg.id, to);
  if (stored) {
    cultureTranslationCache.set(key, stored);
    return stored;
  }

  let resolveFn;
  let rejectFn;
  const promise = new Promise((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  cultureTranslationInflight.set(key, promise);

  const runner = async () => {
    try {
      const resp = await fetchJSON("/api/translate", {
        method: "POST",
        headers: { "x-user-id": getCurrentUserId() },
        body: JSON.stringify({
          messageId: msg.id,
          text: plainText,
          sourceLang: from,
          targetLang: to
        })
      });

      if (resp?.status === "ready" && resp.translatedText) {
        cultureTranslationCache.set(key, resp.translatedText);
        writeLocalTranslation(channelId, msg.id, to, resp.translatedText);
        resolveFn(resp.translatedText);
        if (currentChannelId === channelId) {
          renderMessages(channelId, { restoreScroll: true });
        }
        return resp.translatedText;
      }
      resolveFn(null);
      return null;
    } catch (error) {
      console.error("Translation failed", error);
      rejectFn(error);
      return null;
    } finally {
      cultureTranslationInflight.delete(key);
    }
  };

  enqueueTranslationRunner(runner);
  return promise;
}

function plainToSafeHtml(s = "") {
  return escapeHtmlText(String(s || "")).replace(/\n/g, "<br>");
}


/* =========================================================
   SES – School Email Settings side card auto update
   ========================================================= */

function sesUpdateSideCard() {
  const nameInput = document.getElementById("sesSchoolName");
  const sideName = document.getElementById("sesSideSchoolName");

  if (sideName) {
    sideName.textContent = nameInput?.value?.trim() || "—";
  }

// Set registration details from the textarea (live edit) or cached profile
  const profile = sesWorkspaceProfileCache || {};
  const inlineRegistrationInput = (sesRegistrationDetails?.value || "").trim();
  const registrationDetails = inlineRegistrationInput || (profile.registrationDetails || "");
  const readField = (id, fallback = "") =>
    document.getElementById(id)?.value?.trim() || fallback || "";
  const street = readField("schoolProfileStreet", profile.street);
  const house = readField("schoolProfileHouseNumber", profile.houseNumber);
  const zip = readField("schoolProfilePostalCode", profile.postalCode);
  const city = readField("schoolProfileCity", profile.city);
  const country = readField(
    "schoolProfileCountry",
    profile.country || profile.state || ""
  );
  const phone = readField("schoolProfilePhone", profile.phone);
  const adminEmail = getEffectiveSchoolContactEmail({
    ...profile,
    usePlatformContactEmail: !!schoolProfileUsePlatformEmail?.checked
  });

  const addressLines = [];
  const line1 = [street, house].filter(Boolean).join(" ");
  const line2 = [zip, city].filter(Boolean).join(" ");

  if (line1) addressLines.push(line1);
  if (line2) addressLines.push(line2);
  if (country) addressLines.push(country);
  const sideLines = [...addressLines];
  if (phone) sideLines.push(`Phone: ${phone}`);
  if (adminEmail) sideLines.push(`Admin email: ${adminEmail}`);

  const sideAddress = document.getElementById("sesSideAddress");
  if (sideAddress) {
    sideAddress.innerHTML = sideLines.length
      ? sideLines.map((l) => `<div>${escapeHtmlText(l)}</div>`).join("")
      : "";
  }
  updateSesSignaturePreview({
    profile,
    addressLines,
    phone,
    adminEmail,
    registrationDetails
  });
  updateSesBodyChrome().catch(() => {});
}

function buildSignatureOpeningHoursLines(profile = {}) {
  const detailDays = Array.isArray(profile.openingHoursDetails?.days)
    ? profile.openingHoursDetails.days
    : [];
  const formatEntry = (day, entry) => {
    if (!entry) {
      return { label: day.label, detail: "Hours not set" };
    }
    if (entry.status === "closed") {
      return { label: day.label, detail: "Closed" };
    }
    const statusLabel =
      OPENING_HOURS_STATUS_LABELS[entry.status] ||
      OPENING_HOURS_STATUS_LABELS.open;
    const hasTimes = entry.openTime && entry.closeTime;
    const detail = hasTimes
      ? `${entry.openTime} - ${entry.closeTime}`
      : statusLabel;
    const breakText =
      entry.breakStart && entry.breakEnd
        ? ` · Break ${entry.breakStart} - ${entry.breakEnd}`
        : "";
    return { label: day.label, detail: `${detail}${breakText}` };
  };

  const entries = detailDays.length
    ? (() => {
        const map = new Map(
          detailDays.map((entry) => [
            String(entry.day || "").toLowerCase(),
            entry || {}
          ])
        );
        return OPENING_HOURS_DAYS.map((day) => formatEntry(day, map.get(day.key)));
      })()
    : [];

  if (!entries.length) {
    const fallback = String(profile.openingHours || "").trim();
    return fallback ? [{ label: "", detail: fallback }] : [];
  }

  const groups = [];
  let current = null;
  entries.forEach((entry) => {
    if (!current) {
      current = { start: entry.label, end: entry.label, detail: entry.detail };
      return;
    }
    if (current.detail === entry.detail) {
      current.end = entry.label;
    } else {
      groups.push(current);
      current = { start: entry.label, end: entry.label, detail: entry.detail };
    }
  });
  if (current) groups.push(current);

  return groups.map((group) => {
    const label =
      group.start === group.end ? group.start : `${group.start} - ${group.end}`;
    return { label, detail: group.detail };
  });
}

function refreshReplySignature() {
  const target = document.getElementById("detailReplySignature");
  if (!target) return;
  const previewHtml = (sesSignaturePreview?.innerHTML || "").trim();
  const schoolName = (sesSchoolName?.value || "").trim();
  const builder = [];
  builder.push('<div><strong>Mit Freundlichen Grüßen</strong></div>');
  if (schoolName) {
    builder.push(`<div class="signature-school">${escapeHtmlText(schoolName)}</div>`);
  }
  if (previewHtml) {
    builder.push('<div class="signature-lines">');
    builder.push(previewHtml);
    builder.push("</div>");
  }
  target.innerHTML = builder.join("");
}

function updateReplyGreeting(name) {
  if (!detailReplyGreeting) return;
  const trimmed = String(name || "").trim();
  detailReplyGreeting.textContent = trimmed
    ? `Sehr geehrte/r ${trimmed}`
    : "Sehr geehrte/r";
}

function updateSesSignaturePreview({
  profile = {},
  addressLines = [],
  phone = "",
  adminEmail = "",
  registrationDetails = ""
}) {
  if (sesSignatureHours) {
    const hoursLines = buildSignatureOpeningHoursLines(profile);
    sesSignatureHours.innerHTML = hoursLines.length
      ? hoursLines
          .map((line) => {
            const label = line.label ? `<strong>${escapeHtmlText(line.label)}:</strong>` : "";
            const detail = escapeHtmlText(line.detail || "");
            return `<div>${label} ${detail}</div>`;
          })
          .join("")
      : "";
  }
  if (sesSignatureAddress) {
    const singleAddress = addressLines.filter(Boolean).join(", ");
    sesSignatureAddress.innerHTML = singleAddress
      ? `<div>${escapeHtmlText(singleAddress)}</div>`
      : "";
  }
  if (sesSignaturePhone) {
    sesSignaturePhone.textContent = phone ? `Phone: ${phone}` : "";
  }
  if (sesSignatureEmail) {
    sesSignatureEmail.textContent = adminEmail ? `Email: ${adminEmail}` : "";
  }
  const registrationText =
    (registrationDetails || profile.registrationDetails || "").trim();
  if (sesSignatureRegistration) {
    sesSignatureRegistration.textContent = registrationText;
  }
  refreshReplySignature();
}

/* Attach listeners safely AFTER page load */
document.addEventListener("DOMContentLoaded", () => {
  restoreLastActivePanel();
  [
    "sesSchoolName",
    "schoolProfileStreet",
    "schoolProfileHouseNumber",
    "schoolProfilePostalCode",
    "schoolProfileCity",
    "schoolProfileCountry",
    "schoolProfilePhone",
    "sesRegistrationDetails"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", sesUpdateSideCard);
  });
  if (schoolProfileUsePlatformEmail) {
    schoolProfileUsePlatformEmail.addEventListener("change", () => {
      const profile = {
        ...(sesWorkspaceProfileCache || {}),
        usePlatformContactEmail: !!schoolProfileUsePlatformEmail.checked
      };
      syncSchoolProfileEmailUi(profile);
      sesUpdateSideCard();
    });
  }
  sesUpdateSideCard();
  updateSesBodyChrome().catch(() => {});

  if (sesTestTo) {
    sesTestTo.addEventListener("input", () => {
      updateSesBodyChrome().catch(() => {});
    });
  }
  updateSesBodyChrome().catch(() => {});
  const liveMeetLeaveBtn = document.getElementById("liveMeetLeaveBtn");
  if (liveMeetLeaveBtn) {
    liveMeetLeaveBtn.addEventListener("click", leaveLiveMeetingEmbed);
  }
});

// =========================
// TASK CHANNEL (Aufgaben) UI
// =========================
(function initTaskChannelsUI() {
  const tasksDock = document.getElementById("tasksDock");
  if (!tasksDock) return;

  const chatPanel = document.querySelector(".chat-panel");
  const headerTitle = document.getElementById("headerChannelTitle") || document.querySelector(".channel-title");

  function getChannelByIdLocal(id) {
    if (typeof getChannelById === "function") return getChannelById(id);
    if (Array.isArray(window.channels)) return window.channels.find((c) => String(c.id) === String(id));
    if (Array.isArray(window.allChannels)) return window.allChannels.find((c) => String(c.id) === String(id));
    return null;
  }

  function isTaskChannel(ch) {
    if (!ch) return false;
    const name = String(ch.name || "").toLowerCase();
    const cat = String(ch.category || "").toLowerCase();
    const allowedCategories = new Set(["tools", "classes", "teachers", "tasks"]);
    return allowedCategories.has(cat) && (name.includes("task") || name.includes("aufgaben"));
  }

  function fmtDateTime(ms) {
    if (!ms) return "";
    try {
      return new Date(ms).toLocaleString();
    } catch {
      return String(ms);
    }
  }

  async function fetchJSON(url, opts) {
    if (typeof window.fetchJSON === "function") return window.fetchJSON(url, opts);
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Request failed");
    return data;
  }

  function getUserIdHeader() {
    if (typeof getCurrentUserId === "function") return getCurrentUserId();
    return localStorage.getItem("userId") || localStorage.getItem("currentUserId") || "";
  }

  const state = {
    channelId: null,
    filter: "all",
    selectedTaskId: null,
    tasks: [],
    commentsByTask: new Map()
  };

  function renderShell() {
    tasksDock.innerHTML = `
      <div class="tasks-shell">
        <div class="tasks-topbar">
          <div class="tasks-topbar-left">
            <div class="tasks-title">Tasks / Aufgaben</div>
            <div class="tasks-filters">
              <button class="tasks-pill" data-filter="all">All</button>
              <button class="tasks-pill" data-filter="open">Open</button>
              <button class="tasks-pill" data-filter="doing">Doing</button>
              <button class="tasks-pill" data-filter="done">Done</button>
            </div>
          </div>
          <div class="tasks-actions">
            <button class="tasks-btn" id="tasksRefreshBtn">Refresh</button>
            <button class="tasks-btn primary" id="tasksNewBtn">+ New task</button>
          </div>
        </div>
        <div class="tasks-grid">
          <div class="tasks-list">
            <div class="tasks-list-inner" id="tasksList"></div>
          </div>
          <div class="tasks-detail">
            <div class="tasks-detail-inner" id="taskDetail">
              <div class="detail-title">Select a task</div>
              <div style="color: var(--text-soft); font-size:13px; line-height:1.5;">
                Create tasks for teachers/admin, mark as done, comment, react with emoji, and track time/date.
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    tasksDock.querySelectorAll(".tasks-pill").forEach((b) => {
      b.addEventListener("click", () => {
        state.filter = b.dataset.filter || "all";
        updateFilterUI();
        loadTasks().catch(console.error);
      });
    });

    tasksDock.querySelector("#tasksRefreshBtn").addEventListener("click", () => {
      loadTasks().catch(console.error);
    });

    tasksDock.querySelector("#tasksNewBtn").addEventListener("click", () => {
      showCreateTaskInline();
    });

    updateFilterUI();
  }

  function updateFilterUI() {
    tasksDock.querySelectorAll(".tasks-pill").forEach((b) => {
      b.classList.toggle("active", (b.dataset.filter || "all") === state.filter);
    });
  }

  async function loadTasks() {
    if (!state.channelId) return;
    const params = new URLSearchParams();
    params.set("channelId", state.channelId);
    if (state.filter !== "all") params.set("status", state.filter);
    const data = await fetchJSON(`/api/tasks?${params.toString()}`, {
      headers: { "x-user-id": getUserIdHeader() }
    });
    state.tasks = data.tasks || [];
    if (state.selectedTaskId && !state.tasks.find((t) => t.id === state.selectedTaskId)) {
      state.selectedTaskId = null;
    }
    renderTaskList();
    renderTaskDetail();
  }

  function escapeHtmlText(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderTaskList() {
    const list = tasksDock.querySelector("#tasksList");
    if (!list) return;

    if (!state.tasks.length) {
      list.innerHTML = `
        <div style="padding:12px;color:var(--text-soft);font-size:13px;">
          No tasks yet. Click <b>+ New task</b>.
        </div>
      `;
      return;
    }

    list.innerHTML = state.tasks
      .map((t) => {
        const active = t.id === state.selectedTaskId ? "active" : "";
        const due = t.dueAt ? `Due: ${fmtDateTime(t.dueAt)}` : "";
        const updated = `Updated: ${fmtDateTime(t.updatedAt)}`;
        const desc = (t.description || "").trim();
        const reactions = t.reactions || {};
        const my = new Set(t.myReactions || []);
        const chips = Object.keys(reactions).length
          ? Object.entries(reactions)
              .map(([emoji, count]) => {
                const on = my.has(emoji) ? "on" : "";
                return `<span class="react-chip ${on}" data-react-target="task" data-task-id="${t.id}" data-emoji="${escapeHtmlText(emoji)}">${escapeHtmlText(emoji)} ${count}</span>`;
              })
              .join("")
          : "";

        return `
          <div class="task-card ${active}" data-task-id="${t.id}">
            <div class="task-head">
              <div class="task-name">${escapeHtmlText(t.title)}</div>
              <span class="task-badge ${escapeHtmlText(t.status)}">${escapeHtmlText(t.status)}</span>
            </div>
            <div class="task-meta">
              ${due ? `<span>${escapeHtmlText(due)}</span>` : ""}
              <span>•</span>
              <span>${escapeHtmlText(updated)}</span>
            </div>
            ${desc ? `<div class="task-desc">${escapeHtmlText(desc.slice(0, 140))}${desc.length > 140 ? "…" : ""}</div>` : ""}
            <div class="task-reactions">
              <span class="react-chip" data-react-target="task" data-task-id="${t.id}" data-emoji="👍">👍</span>
              <span class="react-chip" data-react-target="task" data-task-id="${t.id}" data-emoji="✅">✅</span>
              <span class="react-chip" data-react-target="task" data-task-id="${t.id}" data-emoji="🔥">🔥</span>
              <span class="react-chip" data-react-target="task" data-task-id="${t.id}" data-emoji="❓">❓</span>
              ${chips}
            </div>
          </div>
        `;
      })
      .join("");

    list.querySelectorAll(".task-card").forEach((card) => {
      card.addEventListener("click", () => {
        const id = card.dataset.taskId;
        if (!id) return;
        state.selectedTaskId = id;
        renderTaskList();
        renderTaskDetail();
        loadComments(id).catch(console.error);
      });
    });

    list.querySelectorAll(".react-chip").forEach((chip) => {
      chip.addEventListener("click", async (e) => {
        e.stopPropagation();
        const taskId = chip.dataset.taskId;
        const emoji = chip.dataset.emoji;
        if (!taskId || !emoji) return;
        await toggleReaction("task", taskId, emoji);
        await loadTasks();
      });
    });
  }

  async function loadComments(taskId) {
    if (!taskId) return;
    const data = await fetchJSON(`/api/tasks/${taskId}/comments`, {
      headers: { "x-user-id": getUserIdHeader() }
    });
    state.commentsByTask.set(taskId, data.comments || []);
    if (state.selectedTaskId === taskId) renderTaskDetail();
  }

  function renderTaskDetail() {
    const root = tasksDock.querySelector("#taskDetail");
    if (!root) return;

    const task = state.tasks.find((t) => t.id === state.selectedTaskId);
    if (!task) {
      root.innerHTML = `
        <div class="detail-title">Select a task</div>
        <div style="color: var(--text-soft); font-size:13px; line-height:1.5;">
          Use tasks for teacher/admin work: create, mark done, comment, react with emoji, and track time/date.
        </div>
      `;
      return;
    }

    const comments = state.commentsByTask.get(task.id) || [];

    root.innerHTML = `
      <div class="detail-title">${escapeHtmlText(task.title)}</div>
      <div class="detail-controls">
        <button class="tasks-btn" id="markOpenBtn">Open</button>
        <button class="tasks-btn" id="markDoingBtn">Doing</button>
        <button class="tasks-btn primary" id="markDoneBtn">Done ✅</button>
      </div>
      <div class="detail-row">
        <div class="detail-label">Description</div>
        <textarea class="detail-textarea" id="taskDescInput" placeholder="Write details...">${escapeHtmlText(task.description || "")}</textarea>
      </div>
      <div class="detail-row">
        <div class="detail-label">Due date</div>
        <input class="detail-input" id="taskDueInput" type="datetime-local" />
        <div style="font-size:12px;color:var(--text-soft)">Created: ${escapeHtmlText(fmtDateTime(task.createdAt))} • Updated: ${escapeHtmlText(fmtDateTime(task.updatedAt))}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Reactions</div>
        <div class="task-reactions" id="detailReacts">
          ${["👍","✅","🔥","🎉","❓","👀"]
            .map((emo) => `<span class="react-chip" data-react-target="task" data-task-id="${task.id}" data-emoji="${emo}">${emo}</span>`)
            .join("")}
        </div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Comments</div>
        <div class="comments" id="commentsList">
          ${comments.length ? comments.map(renderComment).join("") : `<div style="color:var(--text-soft);font-size:13px;">No comments yet.</div>`}
        </div>
        <div class="comment-compose">
          <textarea id="commentBody" placeholder="Write a comment..."></textarea>
          <button class="tasks-btn primary" id="sendCommentBtn">Send</button>
        </div>
      </div>
    `;

    const dueInput = root.querySelector("#taskDueInput");
    if (dueInput) {
      if (task.dueAt) {
        const d = new Date(task.dueAt);
        const pad = (n) => String(n).padStart(2, "0");
        const v = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        dueInput.value = v;
      }
    }

    root.querySelector("#markOpenBtn").addEventListener("click", () => patchTask(task.id, { status: "open" }));
    root.querySelector("#markDoingBtn").addEventListener("click", () => patchTask(task.id, { status: "doing" }));
    root.querySelector("#markDoneBtn").addEventListener("click", () => patchTask(task.id, { status: "done" }));

    const descEl = root.querySelector("#taskDescInput");
    let descTimer = null;
    descEl.addEventListener("input", () => {
      clearTimeout(descTimer);
      descTimer = setTimeout(() => {
        patchTask(task.id, { description: descEl.value });
      }, 500);
    });

    dueInput?.addEventListener("change", () => {
      const v = dueInput.value;
      const ms = v ? new Date(v).getTime() : null;
      patchTask(task.id, { dueAt: ms });
    });

    root.querySelectorAll(".react-chip").forEach((chip) => {
      chip.addEventListener("click", async () => {
        const emoji = chip.dataset.emoji;
        await toggleReaction("task", task.id, emoji);
        await loadTasks();
        await loadComments(task.id);
      });
    });

    root.querySelector("#sendCommentBtn").addEventListener("click", async () => {
      const ta = root.querySelector("#commentBody");
      const body = (ta.value || "").trim();
      if (!body) return;
      await fetchJSON(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": getUserIdHeader()
        },
        body: JSON.stringify({ body })
      });
      ta.value = "";
      await loadComments(task.id);
      await loadTasks();
    });

    root.querySelectorAll("[data-react-target='comment']").forEach((chip) => {
      chip.addEventListener("click", async () => {
        const cid = chip.dataset.commentId;
        const emo = chip.dataset.emoji;
        await toggleReaction("comment", cid, emo);
        await loadComments(task.id);
      });
    });
  }

  function renderComment(c) {
    const reacts = c.reactions || {};
    const my = new Set(c.myReactions || []);
    const chips = Object.keys(reacts).length
      ? Object.entries(reacts)
          .map(([emoji, count]) => {
            const on = my.has(emoji) ? "on" : "";
            return `<span class="react-chip ${on}" data-react-target="comment" data-comment-id="${c.id}" data-emoji="${escapeHtmlText(emoji)}">${escapeHtmlText(emoji)} ${count}</span>`;
          })
          .join("")
      : "";

    return `
      <div class="comment">
        <div class="comment-top">
          <div>User: ${escapeHtmlText(c.user_id || "")}</div>
          <div>${escapeHtmlText(fmtDateTime(c.created_at))}</div>
        </div>
        <div class="comment-body">${escapeHtmlText(c.body || "")}</div>
        <div class="task-reactions">
          <span class="react-chip" data-react-target="comment" data-comment-id="${c.id}" data-emoji="👍">👍</span>
          <span class="react-chip" data-react-target="comment" data-comment-id="${c.id}" data-emoji="✅">✅</span>
          <span class="react-chip" data-react-target="comment" data-comment-id="${c.id}" data-emoji="😂">😂</span>
          <span class="react-chip" data-react-target="comment" data-comment-id="${c.id}" data-emoji="🔥">🔥</span>
          ${chips}
        </div>
      </div>
    `;
  }

  async function toggleReaction(targetType, targetId, emoji) {
    await fetchJSON(`/api/task-reactions/toggle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": getUserIdHeader()
      },
      body: JSON.stringify({ targetType, targetId, emoji })
    });
  }

  async function patchTask(taskId, patch) {
    await fetchJSON(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": getUserIdHeader()
      },
      body: JSON.stringify(patch)
    });
    await loadTasks();
    await loadComments(taskId);
  }

  function showCreateTaskInline() {
    const detail = tasksDock.querySelector("#taskDetail");
    if (!detail) return;

    detail.innerHTML = `
      <div class="detail-title">New task</div>
      <div class="detail-row">
        <div class="detail-label">Title</div>
        <input class="detail-input" id="newTaskTitle" placeholder="e.g. Prepare weekly report" />
      </div>
      <div class="detail-row">
        <div class="detail-label">Description</div>
        <textarea class="detail-textarea" id="newTaskDesc" placeholder="Write details..."></textarea>
      </div>
      <div class="detail-row">
        <div class="detail-label">Due date</div>
        <input class="detail-input" id="newTaskDue" type="datetime-local" />
      </div>
      <div class="detail-controls">
        <button class="tasks-btn" id="cancelNewTaskBtn">Cancel</button>
        <button class="tasks-btn primary" id="createNewTaskBtn">Create</button>
      </div>
    `;

    detail.querySelector("#cancelNewTaskBtn").addEventListener("click", () => {
      renderTaskDetail();
    });

    detail.querySelector("#createNewTaskBtn").addEventListener("click", async () => {
      const title = (detail.querySelector("#newTaskTitle").value || "").trim();
      const description = (detail.querySelector("#newTaskDesc").value || "").trim();
      const dueRaw = detail.querySelector("#newTaskDue").value;
      const dueAt = dueRaw ? new Date(dueRaw).getTime() : null;
      if (!title) return;

      const data = await fetchJSON(`/api/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": getUserIdHeader()
        },
        body: JSON.stringify({
          channelId: state.channelId,
          title,
          description,
          dueAt
        })
      });

      state.selectedTaskId = data?.task?.id || null;
      await loadTasks();
      if (state.selectedTaskId) await loadComments(state.selectedTaskId);
    });
  }

  // ===== Gmail-ish Inbox (vanilla) =====
  (function initGmailishInbox() {
    const listEl = document.getElementById("inboxList");
    const countEl = document.getElementById("mbxCount");
    const titleEl = document.querySelector("#wnMailbox .mbx-name");
    const iconEl = document.querySelector("#wnMailbox .mbx-icon");
    const refreshBtn = document.getElementById("btnRefresh");
    const markAllBtn = document.getElementById("btnMarkAllRead");
    const searchEl = document.getElementById("mbxSearch");
    const selectAllEl = document.getElementById("selectAll");
    const selectHeaderEl = document.querySelector(".mbx-header-select");
    const bulkEl = document.getElementById("bulkActions");
    const bulkDeleteBtn = bulkEl?.querySelector('[data-action="delete"], .btn-danger');
    const trashActionsEl = document.getElementById("trashActions");
    const trashRestoreBtn = document.getElementById("btnTrashRestore");
    const trashDeleteForeverBtn = document.getElementById("btnTrashDeleteForever");
    const trashEmptyBtn = document.getElementById("btnEmptyTrash");
    const trashCancelBtn = document.getElementById("btnTrashCancel");

    const detailPanel = document.getElementById("inboxDetailPanel");
    const detailCloseBtn = document.getElementById("detailCloseBtn");
    const detailEmpty = document.getElementById("detailEmpty");
    const detailView = document.getElementById("detailView");
    const inboxListEl = document.getElementById("inboxList");
    const mailboxEl = document.getElementById("wnMailbox");
    const dSubject = document.getElementById("dSubject");
    const dFrom = document.getElementById("dFrom");
    const dDate = document.getElementById("dDate");
    const dBody = document.getElementById("dBody");
    const dAttach = document.getElementById("dAttach");
    const dAttachGrid = document.getElementById("dAttachGrid");
    const dAttachCount = document.getElementById("dAttachCount");
    const dAttachScan = document.getElementById("dAttachScan");
    const dAttachDrive = document.getElementById("dAttachDrive");
    const detailActionsPanel = document.getElementById("detailActionsPanel");
    const detailReplyBtn = document.getElementById("detailReplyBtn");
    const detailForwardBtn = document.getElementById("detailForwardBtn");
    const detailEmojiBtn = document.getElementById("detailEmojiBtn");
    const detailReplyPanel = document.getElementById("detailReplyPanel");
    const detailReplyTextarea = document.getElementById("detailReplyTextarea");
    const detailReplySendBtn = document.getElementById("detailReplySendBtn");
    const detailReplyCancelBtn = document.getElementById("detailReplyCancelBtn");
    const detailReplyHideBtn = document.getElementById("detailReplyHideBtn");
    const detailReplyActions = document.getElementById("detailReplyActions");
    const detailReplies = document.getElementById("detailReplies");

    function formatReplyTimestamp(value) {
      const date = value ? new Date(value) : new Date();
      if (Number.isNaN(date.getTime())) return "";
      return date.toLocaleString();
    }

    function renderDetailReplies(mail) {
      if (!detailReplies) return;
      const entries = Array.isArray(mail?.replies) ? mail.replies : [];
      if (!entries.length) {
        detailReplies.classList.add("hidden");
        detailReplies.innerHTML = "";
        return;
      }
      detailReplies.classList.remove("hidden");
      detailReplies.innerHTML = entries
        .map((entry) => {
          return `
            <div class="detail-reply-thread">
              <div class="detail-reply-thread-header">
                Reply sent ${formatReplyTimestamp(entry.created_at)}
              </div>
              <div class="detail-reply-thread-body">${escapeHtml(entry.body || "").replace(/\n/g, "<br>")}</div>
            </div>
          `;
        })
        .join("");
    }
    if (dAttachScan) {
      dAttachScan.textContent = "Scanned by Gmail";
    }
    if (dAttachDrive) {
      dAttachDrive.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        showToast("Add to Drive is coming soon", "info");
      });
    }
    if (detailForwardBtn) {
      detailForwardBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        showToast("Forward will be added soon", "info");
      });
    }
    if (detailEmojiBtn) {
      detailEmojiBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        showToast("Emoji reactions coming soon", "info");
      });
    }
    const showReplyComposer = () => {
      detailReplyPanel?.classList.remove("hidden");
      detailReplyActions?.classList.remove("hidden");
      refreshReplySignature();
      detailReplyTextarea?.focus();
      detailReplyTextarea?.setAttribute("aria-expanded", "true");
      detailReplyTextarea?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const hideReplyComposer = () => {
      detailReplyPanel?.classList.add("hidden");
      detailReplyActions?.classList.add("hidden");
      detailReplyTextarea?.setAttribute("aria-expanded", "false");
    };
    detailReplyBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showReplyComposer();
    });
    detailReplyCancelBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      hideReplyComposer();
    });
    detailReplyHideBtn?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      hideReplyComposer();
    });
    detailReplySendBtn?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const activeEmailId = sesInboxDetail?.dataset?.emailId || (sesInboxActiveMessage ? String(sesInboxActiveMessage.id || "") : "");
      if (!activeEmailId) {
        showToast("Select an email to reply", "error");
        return;
      }
      const replyText = detailReplyTextarea?.value.trim() || "";
      if (!replyText) {
        showToast("Write something before sending", "info");
        detailReplyTextarea?.focus();
        return;
      }
      detailReplySendBtn.disabled = true;
      try {
        const targetMessageId = sesInboxActiveMessage && String(sesInboxActiveMessage.id) === activeEmailId
          ? sesInboxActiveMessage.id
          : activeEmailId;
        const csrfToken = getCsrfToken();
        const greetingText = detailReplyGreeting?.textContent?.trim() || "";
        const signatureText =
          detailReplySignature?.innerText?.trim() ||
          detailReplySignature?.textContent?.trim() ||
          "";
        const messageParts = [];
        if (greetingText) messageParts.push(greetingText);
        if (replyText) messageParts.push(replyText);
        if (signatureText) messageParts.push(signatureText);
        const finalReplyBody = messageParts.join("\n\n");
        const response = await fetch(`/api/admin/inbox/${targetMessageId}/reply`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken
          },
          credentials: "include",
          body: JSON.stringify({ text: finalReplyBody })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Reply failed");
        showToast("Reply sent", "success");
        detailReplyTextarea.value = "";
        hideReplyComposer();
        const newReplyEntry = {
          body: finalReplyBody,
          created_at: new Date().toISOString()
        };
        if (sesInboxActiveMessage) {
          const existing = Array.isArray(sesInboxActiveMessage.replies)
            ? [...sesInboxActiveMessage.replies, newReplyEntry]
            : [newReplyEntry];
          sesInboxActiveMessage.replies = existing;
        }
        renderDetailReplies(sesInboxActiveMessage);
      } catch (error) {
        console.error("Reply failed", error);
        showToast(`Reply failed: ${error.message || "unknown error"}`, "error");
      } finally {
        detailReplySendBtn.disabled = false;
      }
    });

    if (!listEl) return; // inbox not present on this page

    let inbox = [];
    let filtered = [];
    let activeId = null;
    let currentFolder = "inbox";
    let currentTrashAction = null;
    const selected = new Set();
    let mailboxBootstrapped = false;
    let mailboxRequestSeq = 0;
    let mailboxDataSignature = "";
    let mailboxPollTimer = null;
    let mailboxPollInFlight = false;

    function canCurrentUserAccessMailbox() {
      const role = normalizeRole(sessionUser?.role || sessionUser?.userRole || "");
      return !!(
        sessionUser &&
        (role === "student" || role === "admin" || role === "school_admin" || role === "super_admin")
      );
    }

    function isTrashSelectionMode() {
      return currentFolder === "trash" && !!currentTrashAction;
    }

    function syncMailboxHeading() {
      if (titleEl) titleEl.textContent = currentFolder === "trash" ? "Trash" : "Inbox";
      if (iconEl) iconEl.textContent = currentFolder === "trash" ? "🗑️" : "📥";
    }

    function updateMailboxModeUI() {
      const inTrash = currentFolder === "trash";
      const selectingTrash = isTrashSelectionMode();
      if (markAllBtn) {
        markAllBtn.hidden = inTrash;
      }
      if (trashActionsEl) {
        trashActionsEl.hidden = !inTrash;
      }
      if (selectHeaderEl) {
        selectHeaderEl.hidden = inTrash && !selectingTrash;
      }
      if (selectAllEl && (inTrash && !selectingTrash)) {
        selectAllEl.checked = false;
      }
      if (trashRestoreBtn) {
        trashRestoreBtn.textContent = currentTrashAction === "restore" ? "Confirm put back" : "Put back";
      }
      if (trashDeleteForeverBtn) {
        trashDeleteForeverBtn.textContent =
          currentTrashAction === "deleteForever" ? "Confirm delete forever" : "Delete forever";
      }
      if (trashCancelBtn) {
        trashCancelBtn.hidden = !selectingTrash;
      }
      if (bulkEl) {
        bulkEl.hidden = inTrash || selected.size === 0;
      }
    }

    function resetTrashSelectionMode() {
      currentTrashAction = null;
      selected.clear();
      if (selectAllEl) selectAllEl.checked = false;
      updateMailboxModeUI();
    }

    function resetMailboxState() {
      inbox = [];
      filtered = [];
      activeId = null;
      currentTrashAction = null;
      selected.clear();
      if (selectAllEl) selectAllEl.checked = false;
      renderDetail(null);
      exitDetailView();
      renderList();
      updateBulkUI();
    }

    function fmtDate(ts) {
      try {
        const d = new Date(ts);
        const now = new Date();
        const sameDay = d.toDateString() === now.toDateString();
        return sameDay
          ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : d.toLocaleDateString([], { year: "numeric", month: "2-digit", day: "2-digit" });
      } catch {
        return "";
      }
    }

    function parseSender(sender) {
      const s = (sender || "").trim();
      const m = s.match(/^(.*?)\s*<([^>]+)>$/);
      if (m) return { name: m[1].trim(), email: m[2].trim() };
      if (s.includes("@")) return { name: "", email: s };
      return { name: s, email: "" };
    }

    function isReadFlag(v) {
      return Number(v) === 1;
    }

    function buildPreview(mail) {
      if (mail.preview) return mail.preview;
      if (mail.text_body) return mail.text_body.replace(/\s+/g, " ").trim().slice(0, 140);
      if (mail.html_body)
        return mail.html_body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
      return "";
    }

    function initials(nameOrEmail) {
      const s = (nameOrEmail || "").trim();
      if (!s) return "?";
      const parts = s.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
      return s.slice(0, 1).toUpperCase();
    }

    function safeText(s) {
      return (s ?? "").toString();
    }

    function bytesToSize(n) {
      if (!Number.isFinite(n)) return "";
      const units = ["B", "KB", "MB", "GB"];
      let i = 0, v = n;
      while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
      return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
    }

    function attachmentChipLabel(att) {
      const name = att.filename || att.name || "attachment";
      const ext = (name.split(".").pop() || "").toUpperCase();
      const size = att.size ? bytesToSize(att.size) : "";
      if (ext && ext !== name.toUpperCase()) return `${ext}${size ? " • " + size : ""}`;
      return `${name}${size ? " • " + size : ""}`;
    }

    function buildRow(mail) {
      const isUnread = !mail.is_read;
      const isActive = mail.id === activeId;
      const fromLabel = mail.from_name || mail.from_email || "(unknown)";
      const subj = mail.subject || "(no subject)";
      const snip = mail.preview || "";
      const date = fmtDate(mail.received_at);

      const row = document.createElement("div");
      row.className = `mbx-row ${isUnread ? "is-unread" : ""} ${isActive ? "is-active" : ""}`;
      row.dataset.id = mail.id;

    const chk = document.createElement("div");
    chk.className = "row-check";
    if (currentFolder === "trash" && !isTrashSelectionMode()) {
      chk.style.visibility = "hidden";
    }
    chk.innerHTML = `<input type="checkbox" ${selected.has(mail.id) ? "checked" : ""} aria-label="Select email">`;
    chk.querySelector("input").addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.target.checked) selected.add(mail.id);
      else selected.delete(mail.id);
        updateBulkUI();
      });

    const from = document.createElement("div");
    from.className = "from";
    from.textContent = safeText(fromLabel);

      const subject = document.createElement("div");
      subject.className = "subject";
      subject.textContent = safeText(subj);

      const snippet = document.createElement("div");
      snippet.className = "snip";
      snippet.textContent = safeText(snip);

      const dateEl = document.createElement("div");
      dateEl.className = "date";
      dateEl.textContent = date;

    row.appendChild(chk);
    const starBtn = document.createElement("button");
    starBtn.className = "row-star-btn";
    starBtn.type = "button";
    starBtn.setAttribute("aria-pressed", "false");
    starBtn.title = "Star this message";
    starBtn.innerHTML = `<i class="fa-regular fa-star" aria-hidden="true"></i>`;
    starBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const isStarred = starBtn.classList.toggle("is-starred");
      starBtn.setAttribute("aria-pressed", String(isStarred));
      const icon = starBtn.querySelector("i");
      if (icon) {
        icon.className = isStarred ? "fa-solid fa-star" : "fa-regular fa-star";
      }
    });
    row.appendChild(starBtn);
    row.appendChild(from);
      row.appendChild(subject);
      row.appendChild(snippet);
      row.appendChild(dateEl);

      const atts = Array.isArray(mail.attachments) ? mail.attachments : [];
      if (mail.hasAttachments && atts.length) {
        const chips = document.createElement("div");
        chips.className = "chips";

        const show = atts.slice(0, 2);
        show.forEach((att) => {
          const a = document.createElement("a");
          a.className = "chip";
          a.href = `/api/admin/inbox/${mail.id}/attachments/${att.id}`;
          const isPdfChip = /^application\/pdf$/i.test(att.contentType || att.mime || "");
          a.innerHTML = `
            ${isPdfChip ? '<i class="fa-solid fa-file-pdf att-icon-pdf" aria-hidden="true"></i> ' : ""}
            ${attachmentChipLabel(att)}
          `.trim();
          a.addEventListener("click", (e) => e.stopPropagation());
          chips.appendChild(a);
        });

        if (atts.length > 2) {
          const more = document.createElement("span");
          more.className = "snip";
          more.textContent = `+${atts.length - 2} more`;
          chips.appendChild(more);
        }

        row.appendChild(chips);
      }

      row.addEventListener("click", () => openMail(mail.id));
      return row;
    }

    function renderList() {
      listEl.innerHTML = "";
      countEl.textContent = String(filtered.length);
      updateMailboxModeUI();

      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.className = "mbx-empty-state";
        empty.textContent = "No messages";
        listEl.appendChild(empty);
        return;
      }

      const frag = document.createDocumentFragment();
      filtered.forEach((m) => frag.appendChild(buildRow(m)));
      listEl.appendChild(frag);
    }

    function enterDetailView() {
      if (detailPanel) detailPanel.classList.remove("hidden");
      if (inboxListEl) inboxListEl.classList.add("hidden");
      if (mailboxEl) mailboxEl.classList.add("detail-open");
    }

    function exitDetailView() {
      if (detailPanel) detailPanel.classList.add("hidden");
      if (inboxListEl) inboxListEl.classList.remove("hidden");
      if (mailboxEl) mailboxEl.classList.remove("detail-open");
    }

    function renderDetail(mail) {
      if (!mail) {
        detailEmpty.hidden = false;
        detailView.hidden = true;
        sesInboxActiveMessage = null;
        updateReplyGreeting("");
        renderDetailReplies(null);
        return;
      }

      detailEmpty.hidden = true;
      detailView.hidden = false;

      dSubject.textContent = mail.subject || "(no subject)";
      dFrom.textContent = `${mail.from_name || ""} <${mail.from_email || ""}>`;
      dDate.textContent = new Date(mail.received_at).toLocaleString();

      sesInboxActiveMessage = mail;
      updateReplyGreeting(mail.from_name || mail.from_email || mail.sender || "");

      const bodyHtml = mail.html_body || "";
      if (bodyHtml) {
        dBody.innerHTML = bodyHtml; // only safe if your backend ensures HTML is sanitized
      } else {
        dBody.textContent = mail.text_body || mail.preview || "";
      }

      const atts = Array.isArray(mail.attachments) ? mail.attachments : [];
      const attachmentCount = atts.length;
      if (mail.hasAttachments && attachmentCount) {
        dAttach.hidden = false;
        dAttachGrid.innerHTML = "";
        if (dAttachCount) {
          dAttachCount.textContent =
            attachmentCount === 1 ? "One attachment" : `${attachmentCount} attachments`;
        }
        if (detailActionsPanel) {
          detailActionsPanel.classList.remove("hidden");
        }

        for (const att of atts) {
          const name = att.filename || att.name || "attachment";
          const mime = att.contentType || att.mime || "file";
          const size = att.size ? att.size : 0;
          const sizeLabel = att.size ? bytesToSize(att.size) : "";
          const viewable = /^(application\/pdf|image\/png|image\/jpe?g|image\/webp)$/i.test(mime);
          const isPdf = /^application\/pdf$/i.test(mime);
          const viewHref = `/api/admin/inbox/${mail.id}/attachments/${att.id}/view`;
          const dlHref = `/api/admin/inbox/${mail.id}/attachments/${att.id}`;
          let container;

          if (isPdf) {
            const temp = document.createElement("div");
            temp.innerHTML = buildPdfGmailMarkup({
              name,
              url: viewHref,
              sizeLabel,
              sizeBytes: size
            }).trim();
            container = temp.firstElementChild;
          } else {
            container = document.createElement("div");
            container.className = "att-preview-card";
            container.innerHTML = `
              <div class="att-preview-media">
                <i class="fa-solid fa-${mime.includes("image") ? "image" : "file"} att-placeholder-icon" aria-hidden="true"></i>
                <div class="att-preview-overlay">
                  ${viewable ? `<a href="${viewHref}" target="_blank" rel="noopener" title="Preview"><i class="fa-solid fa-eye"></i></a>` : ""}
                  <a href="${dlHref}" target="_blank" rel="noopener" title="Download"><i class="fa-solid fa-download"></i></a>
                </div>
              </div>
              <div class="att-preview-meta">
                <div class="att-file-name" title="${name.replace(/"/g, "&quot;")}">${name}</div>
                <div class="att-file-size">${mime}${sizeLabel ? " • " + sizeLabel : ""}</div>
              </div>
            `;
          }

          container.querySelectorAll("a").forEach((anchor) =>
            anchor.addEventListener("click", (event) => event.stopPropagation())
          );

          dAttachGrid.appendChild(container);
          if (isPdf) {
            attachPdfIframeFallback(container, viewHref);
            hydratePdfThumbs(container);
          }
        }
      } else {
        dAttach.hidden = true;
        dAttachGrid.innerHTML = "";
        if (dAttachCount) {
          dAttachCount.textContent = "";
        }
        if (detailActionsPanel) {
          detailActionsPanel.classList.add("hidden");
        }
      }
      renderDetailReplies(mail);
    }

    function openMail(id) {
      activeId = id;

      const m = inbox.find((x) => x.id === id);
      if (m) m.is_read = true;

      enterDetailView();
      renderList();
      renderDetail(m);
    }

    function applySearch() {
      const q = (searchEl.value || "").trim().toLowerCase();
      if (!q) filtered = [...inbox];
      else {
        filtered = inbox.filter((m) => {
          return (
            (m.from_name || "").toLowerCase().includes(q) ||
            (m.from_email || "").toLowerCase().includes(q) ||
            (m.subject || "").toLowerCase().includes(q) ||
            (m.preview || "").toLowerCase().includes(q)
          );
        });
      }
      renderList();
    }

    function updateBulkUI() {
      const has = selected.size > 0;
      if (bulkEl) {
        bulkEl.hidden = currentFolder === "trash" || !has;
      }
      if (selectAllEl) {
        selectAllEl.checked = has && selected.size === filtered.length;
      }
      updateMailboxModeUI();
    }

    function buildMailboxDataSignature(rows) {
      return JSON.stringify(
        (Array.isArray(rows) ? rows : []).map((row) => [
          String(row?.id || ""),
          String(row?.folder || ""),
          String(row?.received_at || ""),
          String(row?.subject || ""),
          Number(row?.is_read || 0),
          Number(row?.attachmentsCount || 0)
        ])
      );
    }

    function isMailboxPanelVisible() {
      return Boolean(
        sesInboxPanel &&
        !sesInboxPanel.classList.contains("hidden") &&
        currentFolder &&
        ["inbox", "trash"].includes(currentFolder)
      );
    }

    function syncInboxInBackground(folder = currentFolder) {
      const normalizedFolder = String(folder || "").trim().toLowerCase() === "trash" ? "trash" : "inbox";
      if (!canManageSchoolMailbox() || normalizedFolder !== "inbox") return;
      loadInbox({ sync: true, folder: normalizedFolder }).catch((error) => {
        console.error("Inbox background sync failed", error);
      });
    }

    function scheduleMailboxAutoRefresh(delayMs = 5000) {
      if (mailboxPollTimer) {
        clearTimeout(mailboxPollTimer);
      }
      mailboxPollTimer = setTimeout(async () => {
        if (mailboxPollInFlight) {
          scheduleMailboxAutoRefresh(delayMs);
          return;
        }
        if (document.hidden || !isMailboxPanelVisible()) {
          scheduleMailboxAutoRefresh(delayMs);
          return;
        }
        mailboxPollInFlight = true;
        try {
          await loadInbox({ sync: false, folder: currentFolder });
          syncInboxInBackground(currentFolder);
        } catch (error) {
          console.error("Mailbox auto-refresh failed", error);
        } finally {
          mailboxPollInFlight = false;
          scheduleMailboxAutoRefresh(delayMs);
        }
      }, delayMs);
    }

    async function bootstrapMailbox(force = false) {
      if (!canCurrentUserAccessMailbox()) {
        mailboxBootstrapped = false;
        resetMailboxState();
        return;
      }
      if (mailboxBootstrapped && !force) return;
      mailboxBootstrapped = true;
      await loadInbox({ sync: false, folder: currentFolder });
      syncInboxInBackground(currentFolder);
    }

    async function loadInbox({ sync = false, folder } = {}) {
      const previousFolder = currentFolder;
      if (folder) {
        currentFolder = String(folder).trim().toLowerCase() === "trash" ? "trash" : "inbox";
      }
      const folderChanged = previousFolder !== currentFolder;
      if (!canCurrentUserAccessMailbox()) {
        mailboxBootstrapped = false;
        resetMailboxState();
        return;
      }
      if (folderChanged) {
        activeId = null;
        renderDetail(null);
        exitDetailView();
      }
      if (currentFolder !== "trash") {
        currentTrashAction = null;
      }
      syncMailboxHeading();
      updateMailboxModeUI();
      const params = new URLSearchParams();
      params.set("folder", currentFolder);
      if (sync) params.set("sync", "1");
      const url = `/api/admin/inbox?${params.toString()}`;
      const requestSeq = ++mailboxRequestSeq;
      const requestFolder = currentFolder;
      const res = await fetch(url, { credentials: "include" });
      if (requestSeq !== mailboxRequestSeq || requestFolder !== currentFolder) {
        return;
      }
      if (res.status === 401 || res.status === 403) {
        mailboxBootstrapped = false;
        resetMailboxState();
        return;
      }
      if (!res.ok) {
        throw new Error(`Inbox request failed (${res.status})`);
      }
      const data = await res.json();
      if (requestSeq !== mailboxRequestSeq || requestFolder !== currentFolder) {
        return;
      }

      const raw = Array.isArray(data) ? data : (Array.isArray(data?.rows) ? data.rows : []);
      const nextSignature = buildMailboxDataSignature(raw);
      if (!folderChanged && nextSignature === mailboxDataSignature) {
        return;
      }
      mailboxDataSignature = nextSignature;
      inbox = raw.map((m) => {
        const { name, email } = parseSender(m.sender);
        return {
          ...m,
          from_name: name || email || "(unknown)",
          from_email: email || "",
          subject: m.subject || "(no subject)",
          preview: buildPreview(m),
          received_at: m.received_at,
          is_read: isReadFlag(m.is_read),
          hasAttachments: !!m.hasAttachments,
          attachments: Array.isArray(m.attachments) ? m.attachments : [],
          replies: Array.isArray(m.replies) ? m.replies : []
        };
      });
      filtered = [...inbox];
      selected.clear();
      if (selectAllEl) selectAllEl.checked = false;

      if (activeId && !inbox.some((m) => m.id === activeId)) {
        activeId = null;
        renderDetail(null);
        exitDetailView();
      } else if (activeId) {
        renderDetail(inbox.find((m) => m.id === activeId));
        enterDetailView();
      }

      applySearch();
      updateBulkUI();
    }

    async function deleteSelectedInboxMessages() {
      const ids = Array.from(selected).map((value) => Number.parseInt(String(value), 10)).filter(Number.isFinite);
      if (!ids.length) {
        showToast("Select at least one email", "info");
        return;
      }

      const ok = await openConfirmModal({
        title: currentFolder === "trash" ? "Move to trash again?" : "Move selected emails to trash?",
        message:
          currentFolder === "trash"
            ? `These ${ids.length} email${ids.length === 1 ? "" : "s"} are already in trash.`
            : `Move ${ids.length} selected email${ids.length === 1 ? "" : "s"} to trash?`,
        confirmText: currentFolder === "trash" ? "OK" : "Move to trash",
        danger: true
      });
      if (!ok) return;
      if (currentFolder === "trash") return;

      const response = await fetch("/api/admin/inbox/bulk-delete", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken()
        },
        body: JSON.stringify({ ids })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Delete failed");
      }

      const selectedIds = new Set(ids.map(String));
      inbox = inbox.filter((mail) => !selectedIds.has(String(mail.id)));
      filtered = filtered.filter((mail) => !selectedIds.has(String(mail.id)));
      selected.clear();
      if (activeId && selectedIds.has(String(activeId))) {
        activeId = null;
        renderDetail(null);
        exitDetailView();
      }
      applySearch();
      updateBulkUI();
      showToast(`${data.deleted || ids.length} email${(data.deleted || ids.length) === 1 ? "" : "s"} moved to trash`, "success");
    }

    async function restoreSelectedTrashMessages() {
      const ids = Array.from(selected).map((value) => Number.parseInt(String(value), 10)).filter(Number.isFinite);
      if (!ids.length) {
        showToast("Select at least one trash email", "info");
        return;
      }
      const response = await fetch("/api/admin/inbox/bulk-restore", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken()
        },
        body: JSON.stringify({ ids })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Restore failed");
      }
      const selectedIds = new Set(ids.map(String));
      inbox = inbox.filter((mail) => !selectedIds.has(String(mail.id)));
      filtered = filtered.filter((mail) => !selectedIds.has(String(mail.id)));
      if (activeId && selectedIds.has(String(activeId))) {
        activeId = null;
        renderDetail(null);
        exitDetailView();
      }
      resetTrashSelectionMode();
      applySearch();
      showToast(`${data.restored || ids.length} email${(data.restored || ids.length) === 1 ? "" : "s"} put back`, "success");
    }

    async function deleteTrashForever() {
      const ids = Array.from(selected).map((value) => Number.parseInt(String(value), 10)).filter(Number.isFinite);
      if (!ids.length) {
        showToast("Select at least one trash email", "info");
        return;
      }
      const ok = await openConfirmModal({
        title: "Delete forever?",
        message: `Permanently delete ${ids.length} trash email${ids.length === 1 ? "" : "s"}?`,
        confirmText: "Delete forever",
        danger: true
      });
      if (!ok) return;
      const response = await fetch("/api/admin/inbox/bulk-delete-forever", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken()
        },
        body: JSON.stringify({ ids })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Permanent delete failed");
      }
      const selectedIds = new Set(ids.map(String));
      inbox = inbox.filter((mail) => !selectedIds.has(String(mail.id)));
      filtered = filtered.filter((mail) => !selectedIds.has(String(mail.id)));
      if (activeId && selectedIds.has(String(activeId))) {
        activeId = null;
        renderDetail(null);
        exitDetailView();
      }
      resetTrashSelectionMode();
      applySearch();
      showToast(`${data.deleted || ids.length} email${(data.deleted || ids.length) === 1 ? "" : "s"} deleted forever`, "success");
    }

    async function emptyTrash() {
      const ok = await openConfirmModal({
        title: "Clean Trash?",
        message: "Delete all emails in Trash forever?",
        confirmText: "Clean Trash",
        danger: true
      });
      if (!ok) return;
      const response = await fetch("/api/admin/inbox/empty-trash", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken()
        },
        body: JSON.stringify({})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Clean trash failed");
      }
      inbox = [];
      filtered = [];
      activeId = null;
      renderDetail(null);
      exitDetailView();
      resetTrashSelectionMode();
      renderList();
      showToast(`${data.deleted || 0} email${(data.deleted || 0) === 1 ? "" : "s"} deleted forever`, "success");
    }

    refreshBtn?.addEventListener("click", () => {
      loadInbox({ sync: false, folder: currentFolder }).catch((error) => {
        console.error("Inbox refresh failed", error);
      });
      syncInboxInBackground(currentFolder);
    });
    searchEl?.addEventListener("input", () => applySearch());
    bulkDeleteBtn?.addEventListener("click", async () => {
      try {
        await deleteSelectedInboxMessages();
      } catch (error) {
        console.error("Inbox delete failed", error);
        showToast(error.message || "Delete failed", "error");
      }
    });
    trashRestoreBtn?.addEventListener("click", async () => {
      try {
        if (currentFolder !== "trash") return;
        if (currentTrashAction !== "restore") {
          currentTrashAction = "restore";
          selected.clear();
          renderList();
          showToast("Select trash emails to put back", "info");
          return;
        }
        await restoreSelectedTrashMessages();
      } catch (error) {
        console.error("Trash restore failed", error);
        showToast(error.message || "Restore failed", "error");
      }
    });
    trashDeleteForeverBtn?.addEventListener("click", async () => {
      try {
        if (currentFolder !== "trash") return;
        if (currentTrashAction !== "deleteForever") {
          currentTrashAction = "deleteForever";
          selected.clear();
          renderList();
          showToast("Select trash emails to delete forever", "info");
          return;
        }
        await deleteTrashForever();
      } catch (error) {
        console.error("Trash permanent delete failed", error);
        showToast(error.message || "Delete forever failed", "error");
      }
    });
    trashEmptyBtn?.addEventListener("click", async () => {
      try {
        if (currentFolder !== "trash") return;
        await emptyTrash();
      } catch (error) {
        console.error("Trash empty failed", error);
        showToast(error.message || "Clean trash failed", "error");
      }
    });
    trashCancelBtn?.addEventListener("click", () => {
      resetTrashSelectionMode();
      renderList();
    });

    selectAllEl?.addEventListener("change", (e) => {
      selected.clear();
      if (e.target.checked) filtered.forEach((m) => selected.add(m.id));
      updateBulkUI();
      renderList();
    });

    markAllBtn?.addEventListener("click", async () => {
      inbox.forEach((m) => (m.is_read = true));
      renderList();
      if (activeId) renderDetail(inbox.find((m) => m.id === activeId));
    });

    syncMailboxHeading();
    bootstrapMailbox().catch((e) => {
      console.error("Inbox load failed", e);
    });
    window.addEventListener("worknestWorkspaceReady", () => {
      bootstrapMailbox(true).catch((e) => {
        console.error("Inbox load failed", e);
      });
    });
    scheduleMailboxAutoRefresh();

    detailCloseBtn?.addEventListener("click", () => {
      detailEmpty.hidden = false;
      detailView.hidden = true;
      exitDetailView();
      activeId = null;
      sesInboxActiveMessage = null;
      updateReplyGreeting("");
    });

    window.refreshGmailishInbox = (options) => loadInbox(options || {});
  })();

  let lastChannelId = null;
  setInterval(() => {
    if (!window.currentChannelId || window.currentChannelId === lastChannelId) return;
    lastChannelId = window.currentChannelId;

    const ch = getChannelByIdLocal(window.currentChannelId || lastChannelId);
    const on = isTaskChannel(ch);

    if (on) {
      state.channelId = String(window.currentChannelId);
      state.selectedTaskId = null;
      if (chatPanel) chatPanel.classList.add("tasks-docked");
      tasksDock.classList.remove("hidden");

      renderShell();
      loadTasks().catch(console.error);
    } else {
      state.channelId = null;
      state.selectedTaskId = null;
      if (chatPanel) chatPanel.classList.remove("tasks-docked");
      tasksDock.classList.add("hidden");
      tasksDock.innerHTML = "";
    }

    if (headerTitle && on && ch?.name) {
      // headerTitle.textContent = `${ch.name} • Tasks`;
    }
  }, 300);
})();
