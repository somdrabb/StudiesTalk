// School mail shell/sidebar helpers.
// Loaded before app.js so app-level mail code can call these functions.

function getSchoolMailLabel() {
  return currentSchoolNameFallback() || sessionUser?.workspaceName || "School Email";
}

function updateMailSidebarCounts(counts = {}) {
  const root = document.getElementById("schoolMailShell");
  if (!root) return;
  const fallbackCount = (name) => {
    try {
      const value = globalThis[name];
      return Array.isArray(value) ? value.length : 0;
    } catch {
      return 0;
    }
  };
  const setCount = (key, value) => {
    const el = root.querySelector(`[data-mail-count="${key}"]`);
    if (!el) return;
    const count = Number(value || 0);
    el.textContent = String(count);
    el.hidden = count <= 0;
  };
  setCount("inbox", counts.inbox ?? fallbackCount("sesInboxMessages"));
  setCount("unread", counts.unread ?? 0);
  setCount("trash", counts.trash ?? 0);
  setCount("sent", counts.sent ?? fallbackCount("sesEmailLogs"));
  setCount("templates", counts.templates ?? fallbackCount("sesTplCache"));
  setCount("drafts", counts.drafts ?? 0);
  setCount("announcements", counts.announcements ?? 0);
  setCount("students", counts.students ?? 0);
  setCount("teachers", counts.teachers ?? 0);
  setCount("system", counts.system ?? 0);
  setCount("spam", counts.spam ?? 0);
  setCount("important", counts.important ?? 0);
}

let schoolMailActiveShortcut = "";

function setMailSidebarActive(view, shortcut = schoolMailActiveShortcut) {
  const normalized = normalizeSesSettingsView(view);
  schoolMailActiveShortcut = shortcut || "";
  document.querySelectorAll("[data-mail-view]").forEach((button) => {
    const buttonShortcut = button.dataset.mailFilterShortcut || button.dataset.mailSettingsShortcut || "";
    const active = button.dataset.mailView === normalized && (
      schoolMailActiveShortcut
        ? buttonShortcut === schoolMailActiveShortcut
        : !buttonShortcut
    );
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    if (active) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
}

function ensureSchoolMailShell() {
  bindSchoolEmailDomRefs();
  if (!schoolEmailSettingsPage || !sesMainSettingsBody) return;
  if (document.getElementById("schoolMailShell")) return;

  const shell = document.createElement("div");
  shell.className = "mail-shell";
  shell.id = "schoolMailShell";

  const sidebar = document.createElement("aside");
  sidebar.className = "mail-sidebar";
  sidebar.setAttribute("aria-label", "School email folders");
  sidebar.innerHTML = `
    <div class="mail-sidebar-brand">
      <span class="mail-sidebar-logo"><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i></span>
      <span>
        <strong>${escapeHtml(getSchoolMailLabel())}</strong>
        <small>School Mail</small>
      </span>
    </div>
    <button type="button" class="mail-compose-btn" data-mail-view="sent">
      <i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
      <span>Compose</span>
    </button>
    <div class="mail-sidebar-section">Mail</div>
    <nav class="mail-folder-list" aria-label="Mailbox views">
      <button type="button" class="mail-folder-item" data-mail-view="inbox">
        <span><i class="fa-solid fa-inbox" aria-hidden="true"></i> Inbox</span>
        <b data-mail-count="inbox" hidden>0</b>
      </button>
      <button type="button" class="mail-folder-item" data-mail-view="inbox" data-mail-filter-shortcut="starred">
        <span><i class="fa-regular fa-star" aria-hidden="true"></i> Starred</span>
      </button>
      <button type="button" class="mail-folder-item" data-mail-view="important">
        <span><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> Important</span>
        <b data-mail-count="important" hidden>0</b>
      </button>
      <button type="button" class="mail-folder-item" data-mail-view="history">
        <span><i class="fa-regular fa-paper-plane" aria-hidden="true"></i> Sent</span>
        <b data-mail-count="sent" hidden>0</b>
      </button>
      <button type="button" class="mail-folder-item" data-mail-view="drafts">
        <span><i class="fa-regular fa-file-lines" aria-hidden="true"></i> Drafts</span>
        <b data-mail-count="drafts" hidden>0</b>
      </button>
      <button type="button" class="mail-folder-item" data-mail-view="format">
        <span><i class="fa-solid fa-layer-group" aria-hidden="true"></i> Templates</span>
        <b data-mail-count="templates" hidden>0</b>
      </button>
    </nav>
    <div class="mail-sidebar-section">School</div>
    <nav class="mail-folder-list" aria-label="School mail filters">
      <button type="button" class="mail-folder-item" data-mail-view="inbox" data-mail-filter-shortcut="announcements">
        <span><i class="fa-solid fa-bullhorn" aria-hidden="true"></i> Announcements</span>
        <b data-mail-count="announcements" hidden>0</b>
      </button>
      <button type="button" class="mail-folder-item" data-mail-view="inbox" data-mail-filter-shortcut="students">
        <span><i class="fa-solid fa-user-graduate" aria-hidden="true"></i> Students</span>
        <b data-mail-count="students" hidden>0</b>
      </button>
      <button type="button" class="mail-folder-item" data-mail-view="inbox" data-mail-filter-shortcut="teachers">
        <span><i class="fa-solid fa-chalkboard-user" aria-hidden="true"></i> Teachers</span>
        <b data-mail-count="teachers" hidden>0</b>
      </button>
      <button type="button" class="mail-folder-item" data-mail-view="inbox" data-mail-filter-shortcut="system">
        <span><i class="fa-solid fa-envelope-circle-check" aria-hidden="true"></i> System Emails</span>
        <b data-mail-count="system" hidden>0</b>
      </button>
    </nav>
    <div class="mail-sidebar-section">Cleanup</div>
    <nav class="mail-folder-list" aria-label="Mailbox cleanup">
      <button type="button" class="mail-folder-item" data-mail-view="spam">
        <span><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Spam</span>
        <b data-mail-count="spam" hidden>0</b>
      </button>
      <button type="button" class="mail-folder-item" data-mail-view="trash">
        <span><i class="fa-regular fa-trash-can" aria-hidden="true"></i> Trash</span>
        <b data-mail-count="trash" hidden>0</b>
      </button>
    </nav>
    <div class="mail-sidebar-section">Settings</div>
    <nav class="mail-folder-list" aria-label="Email settings">
    <button type="button" class="mail-folder-item" data-mail-view="settings">
      <span><i class="fa-solid fa-gear" aria-hidden="true"></i> Email Settings</span>
    </button>
    </nav>
  `;

  const main = document.createElement("div");
  main.className = "mail-main";
  schoolEmailSettingsPage.insertBefore(shell, sesMainSettingsBody);
  shell.appendChild(sidebar);
  shell.appendChild(main);
  main.appendChild(sesMainSettingsBody);

  const form = sesMainSettingsBody.querySelector(".ses-form");
  if (form && !form.querySelector(".mail-compose-heading")) {
    const heading = document.createElement("div");
    heading.className = "mail-compose-heading";
    heading.innerHTML = `
      <div>
        <strong data-mail-compose-title>Compose message</strong>
        <span data-mail-compose-subtitle>Send a school email with your saved signature.</span>
      </div>
      <button type="button" class="mail-compose-close" data-mail-compose-close aria-label="Close compose">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
    `;
    form.prepend(heading);
  }

  shell.querySelectorAll("[data-mail-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const shortcut = button.dataset.mailFilterShortcut || button.dataset.mailSettingsShortcut || "";
      const view = button.dataset.mailView;
      schoolMailActiveShortcut = shortcut;
      setSesSettingsView(view);
      if (button.dataset.mailFilterShortcut) {
        window.setSchoolMailFilter?.(button.dataset.mailFilterShortcut);
      } else if (["inbox", "trash", "spam", "important", "drafts"].includes(view)) {
        window.setSchoolMailFilter?.("all");
      }
      setMailSidebarActive(view, shortcut);
    });
  });
  shell.querySelector("[data-mail-compose-close]")?.addEventListener("click", () => setSesSettingsView("inbox"));
  updateMailSidebarCounts();
}

const SCHOOL_SETTINGS_CHANNEL_ID = "school-settings";
let emailPartialLoadPromise = null;
let schoolEmailControlsWired = false;
let schoolEmailProfileBindingsWired = false;
let pendingSesRegistrationDetails = "";
let schoolEmailSettingsPage = null;
let schoolEmailSettingsPageHome = null;
let schoolEmailHeaderActions = null;
let schoolEmailHeaderActionsHome = null;
let schoolSettingsHeaderToggle = null;
let schoolSettingsHeaderToggleHome = null;
let emailPanelHeaderActions = null;
let emailPanelToggle = null;
let emailPanelBody = null;
let sesFormatBtn = null;
let sesFormatCard = null;
let sesInboxBtn = null;
let sesContactFormBtn = null;
let sesTrashBtn = null;
let sesInboxPanel = null;
let sesContactFormPanel = null;
let sesContactSubject = null;
let sesContactMessage = null;
let sesContactWordCount = null;
let sesContactSendBtn = null;
let sesContactStatus = null;
let sesInboxList = null;
let sesInboxPlaceholder = null;
let sesInboxCount = null;
let sesInboxDetail = null;
let sesInboxBackBtn = null;
let sesInboxDetailAvatar = null;
let sesInboxDetailName = null;
let sesInboxDetailEmail = null;
let sesInboxDetailDate = null;
let sesInboxDetailSubject = null;
let sesInboxDetailAttachments = null;
let sesInboxDetailBody = null;
let sesInboxRefreshBtn = null;
let sesInboxMarkAllBtn = null;
let sesFormatBackBtn = null;
let detailReplyGreeting = null;
let sesMainSettingsBody = null;
let sesClose = null;
let sesCancel = null;
let sesSave = null;
let sesTestBtn = null;
let sesStatus = null;
let sesEnabled = null;
let sesSchoolName = null;
let sesReplyTo = null;
let sesFooter = null;
let sesSubjectPrefix = null;
let sesSignatureHtml = null;
let sesSignatureHours = null;
let sesSignatureAddress = null;
let sesSignaturePhone = null;
let sesSignatureEmail = null;
let sesSignatureRegistration = null;
let sesSignaturePreview = null;
let sesLogoPreview = null;
let sesLogoUploadBtn = null;
let sesLogoInput = null;
let sesTestTo = null;
let sesBodyText = null;
let sesBodyGreetingPreview = null;
let sesBodyClosingPreview = null;
let sesEmailPreviewPanel = null;
let sesPreviewRecipient = null;
let sesPreviewSubject = null;
let sesPreviewBody = null;
let sesPreviewTimestamp = null;
let sesHistoryList = null;
let sesHistoryEmpty = null;
let sesHistoryClearBtn = null;
let sesLogoUrlValue = "";
let sesWorkspaceProfileCache = null;
let sesEmailLogs = [];
let sesInboxMessages = [];
let sesInboxDetailVisible = false;
let sesInboxActiveMessage = null;
let sesActiveHistoryLogId = null;
let sesHistorySearchTerm = "";
let sesHistoryFilter = "all";
const sesHistorySelectedIds = new Set();
let sesFormatViewActive = false;
let sesCurrentMailboxFolder = "inbox";
let sesSettingsPolishState = null;
let sesRegistrationDetails = null;
let sesPreviewBtn = null;

function bindSchoolEmailDomRefs() {
  schoolEmailSettingsPage = document.getElementById("schoolEmailSettingsPage");
  if (schoolEmailSettingsPage && !schoolEmailSettingsPageHome) schoolEmailSettingsPageHome = schoolEmailSettingsPage.parentElement;
  schoolEmailHeaderActions = document.getElementById("schoolEmailHeaderActions");
  if (schoolEmailHeaderActions && !schoolEmailHeaderActionsHome) schoolEmailHeaderActionsHome = schoolEmailHeaderActions.parentElement;
  schoolSettingsHeaderToggle = document.getElementById("schoolSettingsHeaderToggle");
  if (schoolSettingsHeaderToggle && !schoolSettingsHeaderToggleHome) schoolSettingsHeaderToggleHome = schoolSettingsHeaderToggle.parentElement;
  emailPanelHeaderActions = document.getElementById("emailPanelHeaderActions");
  emailPanelToggle = document.getElementById("emailPanelToggle");
  emailPanelBody = document.getElementById("emailPanelBody");
  sesFormatBtn = document.getElementById("sesFormatBtn");
  sesFormatCard = document.getElementById("sesFormatCard");
  sesInboxBtn = document.getElementById("sesInboxBtn");
  sesContactFormBtn = document.getElementById("sesContactFormBtn");
  sesTrashBtn = document.getElementById("sesTrashBtn");
  sesInboxPanel = document.getElementById("sesInboxPanel");
  sesContactFormPanel = document.getElementById("sesContactFormPanel");
  sesContactSubject = document.getElementById("sesContactSubject");
  sesContactMessage = document.getElementById("sesContactMessage");
  sesContactWordCount = document.getElementById("sesContactWordCount");
  sesContactSendBtn = document.getElementById("sesContactSendBtn");
  sesContactStatus = document.getElementById("sesContactStatus");
  sesInboxList = document.getElementById("sesInboxList");
  sesInboxPlaceholder = document.getElementById("sesInboxPlaceholder");
  sesInboxCount = document.getElementById("sesInboxCount");
  sesInboxDetail = document.getElementById("sesInboxDetail");
  sesInboxBackBtn = document.getElementById("sesInboxBackBtn");
  sesInboxDetailAvatar = document.getElementById("sesInboxDetailAvatar");
  sesInboxDetailName = document.getElementById("sesInboxDetailName");
  sesInboxDetailEmail = document.getElementById("sesInboxDetailEmail");
  sesInboxDetailDate = document.getElementById("sesInboxDetailDate");
  sesInboxDetailSubject = document.getElementById("sesInboxDetailSubject");
  sesInboxDetailAttachments = document.getElementById("sesInboxDetailAttachments");
  sesInboxDetailBody = document.getElementById("sesInboxDetailBody");
  sesInboxRefreshBtn = document.getElementById("sesInboxRefreshBtn");
  sesInboxMarkAllBtn = document.getElementById("sesInboxMarkAllBtn");
  sesFormatBackBtn = document.getElementById("sesFormatBackBtn");
  detailReplyGreeting = document.getElementById("detailReplyGreeting");
  sesMainSettingsBody = schoolEmailSettingsPage ? schoolEmailSettingsPage.querySelector(".ses-body") : null;
  sesClose = document.getElementById("sesClose");
  sesCancel = document.getElementById("sesCancel");
  sesSave = document.getElementById("sesSave");
  sesTestBtn = document.getElementById("sesTestBtn");
  sesStatus = document.getElementById("sesStatus");
  sesEnabled = document.getElementById("sesEnabled");
  sesSchoolName = document.getElementById("sesSchoolName");
  sesReplyTo = document.getElementById("sesReplyTo");
  sesFooter = document.getElementById("sesFooter");
  sesSubjectPrefix = document.getElementById("sesSubjectPrefix");
  sesSignatureHtml = document.getElementById("sesSignatureHtml");
  sesSignatureHours = document.getElementById("sesSignatureHours");
  sesSignatureAddress = document.getElementById("sesSignatureAddress");
  sesSignaturePhone = document.getElementById("sesSignaturePhone");
  sesSignatureEmail = document.getElementById("sesSignatureEmail");
  sesSignatureRegistration = document.getElementById("sesSignatureRegistration");
  sesSignaturePreview = document.getElementById("sesSignaturePreview");
  sesLogoPreview = document.getElementById("sesLogoPreview");
  sesLogoUploadBtn = document.getElementById("sesLogoUploadBtn");
  sesLogoInput = document.getElementById("sesLogoInput");
  sesTestTo = document.getElementById("sesTestTo");
  sesBodyText = document.getElementById("sesBodyText");
  sesBodyGreetingPreview = document.getElementById("sesBodyGreetingPreview");
  sesBodyClosingPreview = document.getElementById("sesBodyClosingPreview");
  sesEmailPreviewPanel = document.getElementById("sesEmailPreviewPanel");
  sesPreviewRecipient = document.getElementById("sesPreviewRecipient");
  sesPreviewSubject = document.getElementById("sesPreviewSubject");
  sesPreviewBody = document.getElementById("sesPreviewBody");
  sesPreviewTimestamp = document.getElementById("sesPreviewTimestamp");
  sesHistoryList = document.getElementById("sesHistoryList");
  sesHistoryEmpty = document.getElementById("sesHistoryEmpty");
  sesHistoryClearBtn = document.getElementById("sesHistoryClearBtn");
  sesRegistrationDetails = document.getElementById("sesRegistrationDetails");
  sesPreviewBtn = document.getElementById("sesPreviewBtn");
  if (sesRegistrationDetails && pendingSesRegistrationDetails && !sesRegistrationDetails.value) {
    sesRegistrationDetails.value = pendingSesRegistrationDetails;
  }
  return !!schoolEmailSettingsPage;
}

async function ensureEmailHtmlLoaded() {
  if (bindSchoolEmailDomRefs()) return true;
  const panel = document.getElementById("emailPanel");
  if (!panel) return false;
  if (!emailPartialLoadPromise) {
    emailPartialLoadPromise = (async () => {
      const partialUrl = panel.getAttribute("data-email-partial") || "email/email.html";
      const res = await fetch(partialUrl, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Could not load " + partialUrl + " (" + res.status + ")");
      panel.innerHTML = await res.text();
      panel.dataset.emailPartialLoaded = "1";
      bindSchoolEmailDomRefs();
      wireSchoolEmailSettingsControls();
      wireSchoolEmailProfilePreviewBindings();
      return true;
    })().catch((err) => {
      emailPartialLoadPromise = null;
      panel.innerHTML = '<div class="email-panel-load-error" role="alert">Could not load School Email. Please refresh and try again.</div>';
      console.error("Failed to load email partial", err);
      return false;
    });
  }
  return emailPartialLoadPromise;
}

bindSchoolEmailDomRefs();

function clearSchoolEmailHeaderMounts() {
  bindSchoolEmailDomRefs();
  restoreSchoolEmailUiToChatHeader();
  setEmailHeaderChromeVisible(false);
}

function setSchoolEmailRegistrationDetails(value = "") {
  pendingSesRegistrationDetails = value || "";
  bindSchoolEmailDomRefs();
  if (sesRegistrationDetails) {
    sesRegistrationDetails.value = value || "";
  }
}

function getSchoolEmailRegistrationDetails() {
  bindSchoolEmailDomRefs();
  return (sesRegistrationDetails?.value || "").trim();
}

function setSchoolEmailWorkspaceProfileCache(profile = null) {
  sesWorkspaceProfileCache = profile;
}

async function loadSchoolEmailSettingsForRestore() {
  await ensureEmailHtmlLoaded();
  await loadEmailSettings();
  if (typeof loadClassSettingsSchoolDetails === "function") {
    await loadClassSettingsSchoolDetails();
  }
}

function refreshSchoolEmailSideCard() {
  if (typeof sesUpdateSideCard === "function") {
    sesUpdateSideCard();
  }
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

function buildSignatureOfficeHoursText(profile = {}) {
  const detailDays = Array.isArray(profile.openingHoursDetails?.days)
    ? profile.openingHoursDetails.days
    : [];
  if (!detailDays.length) return String(profile.openingHours || "").trim();
  const map = new Map(
    detailDays.map((entry) => [String(entry.day || "").toLowerCase(), entry || {}])
  );
  return OPENING_HOURS_DAYS.map((day) => {
    const entry = map.get(day.key);
    if (!entry) return `${day.label} Hours not set`;
    if (entry.status === "closed") return `${day.label} CLOSED`;
    if (entry.openTime && entry.closeTime) return `${day.label} ${entry.openTime} - ${entry.closeTime}`;
    return `${day.label} ${OPENING_HOURS_STATUS_LABELS[entry.status] || OPENING_HOURS_STATUS_LABELS.open}`;
  }).join(", ");
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
  const defaultSignature = String(sesFooter?.value || "").trim();
  const officeHours = buildSignatureOfficeHoursText(profile);
  const singleAddress = addressLines.filter(Boolean).join(", ");
  const registrationText = (registrationDetails || profile.registrationDetails || "").trim();
  if (sesSignaturePreview) {
    const rows = [];
    if (officeHours) rows.push(`<div><strong>Office hours:</strong> ${escapeHtmlText(officeHours)}</div>`);
    if (singleAddress) rows.push(`<div><strong>Address:</strong> ${escapeHtmlText(singleAddress)}</div>`);
    if (phone) rows.push(`<div><strong>Phone:</strong> ${escapeHtmlText(phone)}</div>`);
    if (adminEmail) rows.push(`<div><strong>Email:</strong> ${escapeHtmlText(adminEmail)}</div>`);
    if (registrationText) {
      rows.push(`<div class="ses-signature-registration-block">${escapeHtmlText(registrationText)}</div>`);
    } else if (!rows.length && defaultSignature) {
      rows.push(`<div>${escapeHtmlText(defaultSignature)}</div>`);
    }
    sesSignaturePreview.innerHTML = `<div class="ses-signature-email-render">${rows.join("")}</div>`;
    refreshReplySignature();
    return;
  }
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
  if (sesSignatureRegistration) {
    sesSignatureRegistration.textContent = registrationText;
  }
  refreshReplySignature();
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

function canUseStudentContactForm() {
  return isStudentUser();
}

function getDefaultSesSettingsView() {
  return canManageSchoolMailbox() ? "inbox" : "inbox";
}

function normalizeSesSettingsView(view) {
  const requested = String(view || "").trim().toLowerCase();
  if (requested === "signature") return "settings";
  if (canManageSchoolMailbox()) {
    if (["sent", "history", "format", "inbox", "trash", "spam", "important", "drafts", "settings"].includes(requested)) {
      if (requested !== "inbox") schoolMailActiveShortcut = "";
      return requested;
    }
    schoolMailActiveShortcut = "";
    return "inbox";
  }
  if (["inbox", "trash", "spam", "important", "drafts", "contact"].includes(requested)) {
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
  const contactBtn = document.getElementById("sesContactFormBtn");
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
  if (contactBtn) {
    const allowContactForm = canUseStudentContactForm();
    contactBtn.classList.toggle("hidden", !allowContactForm);
    contactBtn.setAttribute("aria-hidden", allowContactForm ? "false" : "true");
  }
  if (headerActions) {
    headerActions.classList.toggle("hidden", !allowMailbox);
    headerActions.setAttribute("aria-hidden", allowMailbox ? "false" : "true");
  }
  document.querySelectorAll("[data-mail-view='sent'], [data-mail-view='history'], [data-mail-view='format'], [data-mail-view='settings']").forEach((btn) => {
    btn.classList.toggle("hidden", !allowManagement);
    btn.setAttribute("aria-hidden", allowManagement ? "false" : "true");
  });
  document.querySelectorAll("[data-mail-view='signature']").forEach((btn) => {
    btn.classList.add("hidden");
    btn.setAttribute("aria-hidden", "true");
  });
  document.querySelectorAll("[data-mail-view='inbox'], [data-mail-view='trash'], [data-mail-view='spam'], [data-mail-view='important'], [data-mail-view='drafts']").forEach((btn) => {
    btn.classList.toggle("hidden", !allowMailbox);
    btn.setAttribute("aria-hidden", allowMailbox ? "false" : "true");
  });
  if (replyBtn) replyBtn.hidden = !allowManagement;
  if (forwardBtn) forwardBtn.hidden = !allowManagement;
  if (emojiBtn) emojiBtn.hidden = !allowManagement;
  if (!allowManagement) {
    replyPanel?.classList.add("hidden");
    replyActions?.classList.add("hidden");
  }
  if (
    !allowManagement &&
    !["inbox", "trash", "spam", "important", "contact"].includes(normalizeSesSettingsView(sesCurrentMailboxFolder))
  ) {
    sesCurrentMailboxFolder = "inbox";
  }
}

function createSesSettingsPlaceholder(node, key) {
  if (!node || !node.parentNode) return null;
  const placeholder = document.createComment(`ses-settings-${key}`);
  node.parentNode.insertBefore(placeholder, node);
  return placeholder;
}

function createSesSettingsToggle(label, { supported = false, input = null } = {}) {
  const row = document.createElement("label");
  row.className = `ses-settings-toggle mail-toggle-row${supported ? "" : " is-disabled"}`;
  const control = input || document.createElement("input");
  control.type = "checkbox";
  if (!supported) {
    control.disabled = true;
    row.title = "This setting is not connected to the current email-settings endpoint.";
  }
  const slider = document.createElement("span");
  slider.className = "ses-settings-toggle-slider";
  const text = document.createElement("span");
  text.className = "ses-settings-toggle-text";
  text.textContent = label;
  row.append(control, slider, text);
  return row;
}

function makeSesSettingsSection(title, description = "") {
  const section = document.createElement("section");
  section.className = "ses-settings-section mail-settings-card";
  const heading = document.createElement("div");
  heading.className = "ses-settings-section-heading";
  heading.innerHTML = `
    <h3>${escapeHtmlText(title)}</h3>
    ${description ? `<p>${escapeHtmlText(description)}</p>` : ""}
  `;
  const body = document.createElement("div");
  body.className = "ses-settings-section-body";
  section.append(heading, body);
  return { section, body };
}

function updateSesSettingsSignaturePreview() {
  const target = document.getElementById("sesSettingsSignaturePreviewBody");
  if (!target) return;
  const enabled = getSesSettingsPolishInput("sesSignatureEnabled");
  if (enabled && !enabled.checked) {
    target.textContent = "Signature preview is disabled.";
    return;
  }
  const value = (sesFooter?.value || "").trim();
  target.innerHTML = value
    ? `<div class="ses-signature-email-render">${escapeHtmlText(value)}</div>`
    : "No default signature configured.";
}

function ensureSesSettingsPolishUI() {
  const form = document.querySelector(".ses-form");
  if (!form || sesSettingsPolishState) return sesSettingsPolishState;

  const schoolNameField = sesSchoolName?.closest(".ses-field") || null;
  const replyToField = sesReplyTo?.closest(".ses-field") || null;
  const sendToField = sesTestTo?.closest(".ses-field") || null;
  const signatureField = sesFooter?.closest(".ses-field") || null;
  const actions = form.querySelector(":scope > .ses-form-actions") || null;
  const testRow = form.querySelector(":scope > .ses-testRow") || null;
  const status = sesStatus || null;
  const enabledLabel = sesEnabled?.closest("label") || null;

  const nodes = {
    schoolNameField,
    replyToField,
    sendToField,
    signatureField,
    actions,
    testRow,
    status,
    enabledLabel
  };
  const placeholders = Object.fromEntries(
    Object.entries(nodes).map(([key, node]) => [key, createSesSettingsPlaceholder(node, key)])
  );

  const panel = document.createElement("div");
  panel.className = "ses-settings-polish mail-settings-page";
  panel.hidden = true;
  panel.innerHTML = `
    <header class="ses-settings-page-title">
      <h2>Email settings</h2>
      <p>Configure sender details, notification behavior, and default signature.</p>
    </header>
  `;

  const sender = makeSesSettingsSection("Sender identity", "These details appear on outgoing school emails.");
  const notification = makeSesSettingsSection("Notification settings", "Control which automated school emails are sent.");
  const signature = makeSesSettingsSection("Default signature", "This signature is appended to outgoing school emails.");
  const templates = makeSesSettingsSection("Template shortcuts", "Manage reusable school emails and send a quick test.");

  const senderGrid = document.createElement("div");
  senderGrid.className = "ses-settings-grid mail-settings-grid";
  if (schoolNameField) {
    schoolNameField.hidden = false;
    const label = schoolNameField.querySelector("label");
    if (label) label.textContent = "Sender name / From name";
    senderGrid.appendChild(schoolNameField);
  }
  if (replyToField) {
    replyToField.hidden = false;
    const label = replyToField.querySelector("label");
    if (label) label.textContent = "Reply-to email";
    senderGrid.appendChild(replyToField);
  }
  const supportField = document.createElement("div");
  supportField.className = "ses-field mail-settings-field";
  supportField.innerHTML = `
    <label for="sesSupportEmailDisplay">Support email</label>
    <input id="sesSupportEmailDisplay" type="email" autocomplete="email" />
  `;
  senderGrid.appendChild(supportField);
  sender.body.appendChild(senderGrid);

  const toggles = document.createElement("div");
  toggles.className = "ses-settings-toggle-list";
  const polishInputs = {
    sesSupportEmailDisplay: supportField.querySelector("#sesSupportEmailDisplay")
  };
  if (enabledLabel && sesEnabled) {
    enabledLabel.className = "";
    toggles.appendChild(createSesSettingsToggle("Live session email notifications", { supported: true, input: sesEnabled }));
  }
  [
    ["sesRegistrationEmailsEnabled", "Registration emails"],
    ["sesPasswordResetEmailsEnabled", "Password reset emails"],
    ["sesInvoicePaymentEmailsEnabled", "Invoice/payment emails"],
    ["sesExamCourseReminderEmailsEnabled", "Exam/course reminders"]
  ].forEach(([id, label]) => {
    const input = document.createElement("input");
    input.id = id;
    input.type = "checkbox";
    input.checked = true;
    polishInputs[id] = input;
    toggles.appendChild(createSesSettingsToggle(label, { supported: true, input }));
  });
  notification.body.appendChild(toggles);

  const signatureEnabledInput = document.createElement("input");
  signatureEnabledInput.id = "sesSignatureEnabled";
  signatureEnabledInput.type = "checkbox";
  signatureEnabledInput.checked = true;
  polishInputs.sesSignatureEnabled = signatureEnabledInput;
  signature.body.appendChild(
    createSesSettingsToggle("Add signature to outgoing emails", { supported: true, input: signatureEnabledInput })
  );
  const builder = document.createElement("div");
  builder.className = "ses-settings-signature-builder";
  builder.innerHTML = `
    <div class="ses-settings-builder-grid">
      <label class="ses-field"><span>School name</span><input id="sesSignatureBuilderSchool" type="text" autocomplete="organization" /></label>
      <label class="ses-field"><span>Address</span><input id="sesSignatureBuilderAddress" type="text" autocomplete="street-address" /></label>
      <label class="ses-field"><span>Phone</span><input id="sesSignatureBuilderPhone" type="tel" autocomplete="tel" /></label>
      <label class="ses-field"><span>Email</span><input id="sesSignatureBuilderEmail" type="email" autocomplete="email" /></label>
      <label class="ses-field ses-settings-builder-wide"><span>Opening hours</span><input id="sesSignatureBuilderHours" type="text" /></label>
      <label class="ses-field ses-settings-builder-wide"><span>Legal footer</span><input id="sesSignatureBuilderLegal" type="text" /></label>
    </div>
    <button class="ses-btn ses-btn-secondary ses-settings-generate-signature" id="sesGenerateSignatureBtn" type="button">Generate signature</button>
  `;
  [
    "sesSignatureBuilderSchool",
    "sesSignatureBuilderAddress",
    "sesSignatureBuilderPhone",
    "sesSignatureBuilderEmail",
    "sesSignatureBuilderHours",
    "sesSignatureBuilderLegal"
  ].forEach((id) => {
    polishInputs[id] = builder.querySelector(`#${id}`);
  });
  signature.body.appendChild(builder);

  if (signatureField) {
    signatureField.hidden = false;
    signatureField.classList.add("ses-settings-signature-field", "mail-settings-field");
    const label = signatureField.querySelector("label");
    if (label) label.textContent = "Default signature";
    if (sesFooter) {
      sesFooter.hidden = false;
      sesFooter.classList.add("mail-signature-editor");
      sesFooter.rows = 6;
      sesFooter.placeholder = "Add school address, opening hours, phone number, and legal footer...";
    }
    let helper = signatureField.querySelector(".ses-settings-signature-help");
    if (!helper) {
      helper = document.createElement("p");
      helper.className = "ses-settings-signature-help";
      helper.textContent = "This signature is appended to outgoing school emails.";
      signatureField.insertBefore(helper, sesFooter || null);
    }
    signature.body.appendChild(signatureField);
  }
  const previewCard = document.createElement("div");
  previewCard.className = "ses-settings-signature-preview-card mail-signature-preview";
  previewCard.innerHTML = `
    <div class="ses-settings-preview-title">Signature preview</div>
    <div class="ses-settings-signature-preview-body" id="sesSettingsSignaturePreviewBody"></div>
  `;
  signature.body.appendChild(previewCard);

  const templateCard = document.createElement("div");
  templateCard.className = "ses-settings-template-card";
  templateCard.innerHTML = `
    <div>
      <strong>Email templates</strong>
      <p>Edit registration, password, invoice, course, and exam email templates.</p>
    </div>
    <button class="ses-btn ses-btn-secondary" id="sesSettingsManageTemplatesBtn" type="button">Manage templates</button>
  `;
  templates.body.appendChild(templateCard);
  if (sendToField) {
    const label = sendToField.querySelector("label");
    if (label) label.textContent = "Send test email to";
    sendToField.classList.add("ses-settings-test-recipient");
    templates.body.appendChild(sendToField);
  }
  if (testRow) {
    testRow.classList.add("ses-settings-test-actions");
    templates.body.appendChild(testRow);
  }

  const footer = document.createElement("div");
  footer.className = "ses-settings-footer mail-settings-actions";
  if (actions) footer.appendChild(actions);
  if (status) footer.appendChild(status);

  panel.append(sender.section, notification.section, signature.section, templates.section, footer);
  form.insertBefore(panel, form.firstChild);

  panel.querySelector("#sesSettingsManageTemplatesBtn")?.addEventListener("click", () => {
    setSesSettingsView("format");
  });
  panel.querySelector("#sesGenerateSignatureBtn")?.addEventListener("click", generateSesSettingsSignature);
  signatureEnabledInput.addEventListener("change", updateSesSettingsSignaturePreview);
  sesFooter?.addEventListener("input", updateSesSettingsSignaturePreview);

  sesSettingsPolishState = { panel, placeholders, nodes, inputs: polishInputs };
  return sesSettingsPolishState;
}

function moveSesSettingsNodeBack(node, placeholder) {
  if (!node || !placeholder?.parentNode) return;
  placeholder.parentNode.insertBefore(node, placeholder.nextSibling);
}

function syncSesSettingsPolishMode(active) {
  const state = ensureSesSettingsPolishUI();
  if (!state) return;
  const { panel, placeholders, nodes } = state;
  panel.hidden = !active;
  document.querySelector(".ses-form")?.classList.toggle("ses-form-settings-polished", !!active);

  const supportInput = getSesSettingsPolishInput("sesSupportEmailDisplay");

  if (active) {
    if (nodes.enabledLabel) nodes.enabledLabel.hidden = true;
    if (nodes.schoolNameField) nodes.schoolNameField.hidden = false;
    if (nodes.replyToField) nodes.replyToField.hidden = false;
    if (nodes.signatureField) nodes.signatureField.hidden = false;
    if (sesFooter) sesFooter.hidden = false;
    if (sesTestBtn) {
      sesTestBtn.innerHTML = `<i class="fa-solid fa-paper-plane" aria-hidden="true"></i><span>Send test email</span>`;
    }
    if (sesSave) sesSave.textContent = "Save changes";
    if (sesCancel) sesCancel.textContent = "Cancel";
    if (sesDraftDeleteBtn) sesDraftDeleteBtn.hidden = true;
    if (nodes.actions) panel.querySelector(".ses-settings-footer")?.prepend(nodes.actions);
    if (nodes.status) panel.querySelector(".ses-settings-footer")?.appendChild(nodes.status);
    if (supportInput && !supportInput.value) {
      supportInput.value = (sesLoadedEmailSettingsSnapshot?.support_email || sesReplyTo?.value || sessionUser?.email || "").trim();
    }
    updateSesSettingsSignaturePreview();
    return;
  }

  Object.entries(nodes).forEach(([key, node]) => moveSesSettingsNodeBack(node, placeholders[key]));
  if (nodes.enabledLabel) nodes.enabledLabel.hidden = false;
  if (nodes.enabledLabel && sesEnabled && !nodes.enabledLabel.contains(sesEnabled)) {
    nodes.enabledLabel.insertBefore(sesEnabled, nodes.enabledLabel.firstChild);
  }
  if (sesFooter) sesFooter.hidden = true;
  if (nodes.schoolNameField) nodes.schoolNameField.hidden = true;
  if (nodes.replyToField) nodes.replyToField.hidden = true;
  if (sesTestBtn) {
    sesTestBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i><span>Send</span>`;
  }
  if (sesSave) sesSave.textContent = "Save draft";
  if (sesCancel) sesCancel.textContent = "Cancel";
  if (sesDraftDeleteBtn) sesDraftDeleteBtn.hidden = !sesCurrentDraftId;
}

// --- SES tab routing (Sent / History / Email format) ---
function setSesSettingsView(view, options = {}) {
  collapseClassSettingsView();
  // view: "sent" | "history" | "format" | "inbox" | "trash" | "spam" | "important" | "drafts" | "contact" | "settings"
  view = normalizeSesSettingsView(view);
  const body = document.querySelector(".ses-body");
  const formCol = document.querySelector(".ses-form");
  const metaCol = document.querySelector(".ses-meta-column");

  const historyPanel = document.getElementById("sesEmailHistory");
  const formatCard = document.getElementById("sesFormatCard");
  const inboxPanel = document.getElementById("sesInboxPanel");
  const contactPanel = document.getElementById("sesContactFormPanel");

  const sentBtn = document.getElementById("sesSentBtn");
  const historyBtn = document.getElementById("sesHistoryBtn");
  const formatBtn = document.getElementById("sesFormatBtn");
  const inboxBtn = document.getElementById("sesInboxBtn");
  const contactBtn = document.getElementById("sesContactFormBtn");
  const trashBtn = document.getElementById("sesTrashBtn");

  if (!body || !formCol || !metaCol || !historyPanel || !formatCard) return;

  body.classList.remove("ses-view-sent", "ses-view-history", "ses-view-format", "ses-view-settings", "ses-view-signature");
  body.classList.remove("ses-view-inbox", "ses-view-trash", "ses-view-spam", "ses-view-important", "ses-view-drafts", "ses-view-contact");
  body.classList.remove("hidden");

  formCol.classList.add("hidden");
  metaCol.classList.add("hidden");
  historyPanel.classList.add("hidden");
  if (inboxPanel) {
    inboxPanel.classList.add("hidden");
  }
  if (contactPanel) {
    contactPanel.classList.add("hidden");
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
  setActive(contactBtn, view === "contact");
  setActive(trashBtn, view === "trash");
  setMailSidebarActive(view);

  updateSesMailboxPermissionsUI();
  syncSesSettingsPolishMode(view === "settings");

  if (view === "sent" || view === "settings") {
    body.classList.add(view === "settings" ? "ses-view-settings" : "ses-view-sent");
    if (view === "sent" && !sesCurrentDraftId) {
      resetSesDraftState();
    }
    if (view === "settings") {
      loadEmailSettings().catch((err) => {
        console.warn("Failed to refresh email settings", err);
        if (sesStatus) sesStatus.textContent = "Could not load email settings";
      });
    }
    formCol.classList.remove("hidden");
    metaCol.classList.add("hidden");
    const composeTitle = formCol.querySelector("[data-mail-compose-title]");
    const composeSubtitle = formCol.querySelector("[data-mail-compose-subtitle]");
    if (composeTitle) {
      composeTitle.textContent = view === "settings" ? "Email settings" : "Compose message";
    }
    if (composeSubtitle) {
      composeSubtitle.textContent =
        view === "settings"
          ? "Notification status and sender defaults."
          : "Send a school email with your saved signature.";
    }
    const recipientLabel = formCol.querySelector('label[for="sesTestTo"]');
    if (recipientLabel) {
      recipientLabel.textContent = view === "settings" ? "Send test email to" : "To";
    }
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
      if (options.loadMailbox !== false) {
        loadSesInboxMessages({
          folder: "inbox",
          sync: false,
          showList: true,
          filter: options.filter || "all"
        });
      }
  } else if (view === "trash" || view === "spam" || view === "important" || view === "drafts") {
    body.classList.add(view === "spam" ? "ses-view-spam" : view === "important" ? "ses-view-important" : view === "drafts" ? "ses-view-drafts" : "ses-view-trash");
    metaCol.classList.remove("hidden");
    if (inboxPanel) {
      inboxPanel.classList.remove("hidden");
    }
    historyPanel.classList.add("hidden");
    sesCurrentMailboxFolder = view;
    if (options.loadMailbox !== false) {
      loadSesInboxMessages({
        folder: view,
        sync: false,
        showList: true,
        filter: options.filter || "all"
      });
    }
  } else if (view === "contact") {
    body.classList.add("ses-view-contact");
    metaCol.classList.remove("hidden");
    if (contactPanel) {
      contactPanel.classList.remove("hidden");
    }
    historyPanel.classList.add("hidden");
    sesCurrentMailboxFolder = "contact";
    updateSesContactWordCount();
  }
  updateMailSidebarCounts();
}

function wireSesTabButtons() {
  const sentBtn = document.getElementById("sesSentBtn");
  const historyBtn = document.getElementById("sesHistoryBtn");
  const formatBtn = document.getElementById("sesFormatBtn");
  const formatBackBtn = document.getElementById("sesFormatBackBtn");
  const inboxBtn = document.getElementById("sesInboxBtn");
  const contactBtn = document.getElementById("sesContactFormBtn");
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
  contactBtn?.addEventListener("click", () => setSesSettingsView("contact"));
  trashBtn?.addEventListener("click", () => setSesSettingsView("trash"));
}

function getSesContactWordCount() {
  const text = (sesContactMessage?.value || "").trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function updateSesContactWordCount() {
  if (!sesContactWordCount) return;
  sesContactWordCount.textContent = `${getSesContactWordCount()} / 500 words`;
}

function clearSesContactForm({ keepStatus = false } = {}) {
  if (sesContactSubject) sesContactSubject.value = "";
  if (sesContactMessage) sesContactMessage.value = "";
  updateSesContactWordCount();
  if (!keepStatus && sesContactStatus) sesContactStatus.textContent = "";
}

function wireSesContactForm() {
  sesContactMessage?.addEventListener("input", () => {
    updateSesContactWordCount();
  });

  sesContactSendBtn?.addEventListener("click", async () => {
    if (!canUseStudentContactForm()) {
      showToast("Only students can use the contact form.", "info");
      return;
    }
    const subject = (sesContactSubject?.value || "").trim();
    const message = (sesContactMessage?.value || "").trim();
    const wordCount = getSesContactWordCount();

    if (!subject) {
      showToast("Enter a subject.", "info");
      sesContactSubject?.focus();
      return;
    }
    if (!message) {
      showToast("Write your message before sending.", "info");
      sesContactMessage?.focus();
      return;
    }
    if (wordCount > 500) {
      showToast("Keep the message within 500 words.", "info");
      sesContactMessage?.focus();
      return;
    }

    if (sesContactStatus) sesContactStatus.textContent = "Sending...";
    if (sesContactSendBtn) sesContactSendBtn.disabled = true;

    try {
      const response = await apiFetch("/api/admin/inbox/contact-form", {
        method: "POST",
        body: JSON.stringify({ subject, message })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Could not send contact form");
      }
      if (sesContactStatus) sesContactStatus.textContent = "Message sent to school admin.";
      clearSesContactForm({ keepStatus: true });
      showToast("Contact form sent", "success");
    } catch (error) {
      console.error("Contact form send failed", error);
      if (sesContactStatus) sesContactStatus.textContent = error.message || "Could not send contact form.";
      showToast(error.message || "Could not send contact form", "error");
    } finally {
      if (sesContactSendBtn) sesContactSendBtn.disabled = false;
    }
  });
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
let sesTplCategoryFilter = "all";
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
    headers: {}
  });
  sesTplCache = data?.templates || [];
  updateMailSidebarCounts({ templates: sesTplCache.length });
  sesTplRenderList();
}

function sesTplRenderList(filterText = "") {
  sesTplRenderCards(filterText);
}

function getSesTemplateCategory(template = {}) {
  const raw = `${template.template_key || ""} ${template.label || ""} ${template.subject || ""}`.toLowerCase();
  if (/registr|invite|welcome|enroll/.test(raw)) return "registration";
  if (/password|reset|otp|login/.test(raw)) return "password";
  if (/live|session|class/.test(raw)) return "live";
  if (/invoice|payment|receipt|billing/.test(raw)) return "invoice";
  if (/course|lesson|material/.test(raw)) return "course";
  if (/exam|test/.test(raw)) return "exam";
  if (/attendance|absence|certificate/.test(raw)) return "attendance";
  return "course";
}

function ensureSesTemplateFilters() {
  const host = document.querySelector(".ses-template-sidebar-top");
  if (!host || host.querySelector(".mail-template-filter-row")) return;
  const row = document.createElement("div");
  row.className = "mail-template-filter-row";
  const categories = [
    ["all", "All"],
    ["registration", "Registration"],
    ["password", "Password"],
    ["live", "Live session"],
    ["invoice", "Invoice/payment"],
    ["course", "Course"],
    ["exam", "Exam"],
    ["attendance", "Attendance"]
  ];
  row.innerHTML = categories
    .map(([key, label]) => `<button type="button" class="mail-template-filter ${key === "all" ? "is-active" : ""}" data-template-category="${key}">${label}</button>`)
    .join("");
  host.appendChild(row);
  row.querySelectorAll("[data-template-category]").forEach((button) => {
    button.addEventListener("click", () => {
      sesTplCategoryFilter = button.dataset.templateCategory || "all";
      row.querySelectorAll("[data-template-category]").forEach((btn) => {
        const active = btn === button;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });
      sesTplRenderCards(document.getElementById("sesTplSearch")?.value || "");
    });
  });
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
  ensureSesTemplateFilters();
  sesTplCache
    .filter((t) => {
      const category = getSesTemplateCategory(t);
      const categoryMatch = sesTplCategoryFilter === "all" || category === sesTplCategoryFilter;
      const text = `${t.label || ""} ${t.template_key || ""} ${t.subject || ""} ${sesTplPreviewText(t)}`.toLowerCase();
      return categoryMatch && (!q || text.includes(q));
    })
    .forEach((t) => {
      const previewText = sesTplPreviewText(t).trim();
      const snippet =
        previewText.length > 220 ? `${previewText.slice(0, 220).trim()}…` : previewText;
      const category = getSesTemplateCategory(t);
      const card = document.createElement("div");
      card.className = "ses-template-card";
      card.innerHTML = `
        <div class="ses-template-card-row">
          <div class="ses-template-card-title">${escapeHtml(t.label || t.template_key)}</div>
          <span class="ses-template-badge">${t.enabled ? "Enabled" : "Disabled"}</span>
        </div>
        <div class="mail-template-category">${escapeHtml(category.replace(/^\w/, (c) => c.toUpperCase()).replace("invoice", "Invoice/payment"))}</div>
        <div class="ses-template-card-subject">${escapeHtml(t.subject || "No subject")}</div>
        <div class="ses-template-card-thumbnail">${escapeHtml(snippet)}</div>
        <div class="mail-template-actions">
          <button type="button" data-template-edit="${escapeHtml(t.template_key)}">Edit</button>
          <button type="button" data-template-preview="${escapeHtml(t.template_key)}">Test / preview</button>
        </div>
      `;
      card.addEventListener("click", () => sesTplSelect(t.template_key));
      card.querySelector("[data-template-edit]")?.addEventListener("click", (event) => {
        event.stopPropagation();
        sesTplSelect(t.template_key);
      });
      card.querySelector("[data-template-preview]")?.addEventListener("click", (event) => {
        event.stopPropagation();
        sesTplSelect(t.template_key);
        document.getElementById("sesTplTestTo")?.focus();
      });
      container.appendChild(card);
    });
  if (!container.children.length) {
    renderUiState(container, { message: "No templates match this filter." });
  }
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
      headers: {},
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
      headers: {}
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
      headers: {},
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
  ensureSesTemplateFilters();
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
  syncRichEditorToTextarea();
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
  sesEmailPreviewPanel.classList.remove("ses-sent-detail-preview");
  const titleText = sesEmailPreviewPanel.querySelector(".ses-preview-title > span:not(.ses-preview-timestamp)");
  if (titleText) titleText.textContent = "Email preview";
  const backBtn = document.getElementById("sesHistoryBackBtn");
  if (backBtn) backBtn.remove();
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
  if (sesPreviewRecipient) {
    const recipientLines = [`To: ${to}`];
    const cc = getSesExtraRecipientValue("cc");
    const bcc = getSesExtraRecipientValue("bcc");
    if (cc) recipientLines.push(`Cc: ${cc}`);
    if (bcc) recipientLines.push(`Bcc: ${bcc}`);
    sesPreviewRecipient.textContent = recipientLines.join(" · ");
  }
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

function setEmailHeaderChromeVisible(visible) {
  bindSchoolEmailDomRefs();
  const nextVisible = Boolean(visible);
  if (schoolEmailHeaderActions) {
    schoolEmailHeaderActions.classList.toggle("hidden", !nextVisible);
    schoolEmailHeaderActions.setAttribute("aria-hidden", nextVisible ? "false" : "true");
  }
  if (schoolSettingsHeaderToggle) {
    schoolSettingsHeaderToggle.classList.toggle("hidden", !nextVisible);
    schoolSettingsHeaderToggle.setAttribute("aria-hidden", nextVisible ? "false" : "true");
  }
}

async function openEmailPanel() {
  if (!canAccessSchoolMailbox()) {
    if (!sessionUser) {
      return;
    }
    showToast("Email is available for school admins and students only.", "info");
    return;
  }
  const loaded = await ensureEmailHtmlLoaded();
  if (!loaded) {
    showToast("Could not load School Email. Please refresh and try again.");
    return;
  }
  const token = showPanel("emailPanel");
  closeAdminDock();
  setSuperAdminLanding(false);
  mountSchoolEmailUiToEmailPanel();
  updateSesMailboxPermissionsUI();
  schoolEmailSettingsPage?.classList.remove("hidden");
  schoolEmailSettingsPage?.setAttribute("aria-hidden", "false");
  const defaultMailView = getDefaultSesSettingsView();
  if (["inbox", "trash", "spam", "important", "drafts"].includes(defaultMailView) && typeof window.openSchoolMailView === "function") {
    await window.openSchoolMailView({ view: defaultMailView, filter: "all", sync: false });
  } else {
    setSesSettingsView(defaultMailView);
  }
  if (canManageSchoolMailbox()) {
    try {
      await loadEmailSettings();
      if (!isNavigationTokenCurrent(token, "emailPanel")) return;
      await loadClassSettingsSchoolDetails();
      if (!isNavigationTokenCurrent(token, "emailPanel")) return;
    } catch (err) {
      console.error("Failed to load email settings", err);
      if (!isNavigationTokenCurrent(token, "emailPanel")) return;
      showToast("Could not load settings");
    }
  }
}

function mountSchoolEmailUiToEmailPanel() {
  bindSchoolEmailDomRefs();
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
  ensureSchoolMailShell();
  ensureComposeRecipientChips();
  ensureComposeRichEditor();
  document.body.classList.remove("no-school-scroll");
  setSchoolEmailHeaderMode(false);
  setEmailHeaderChromeVisible(true);
}

function restoreSchoolEmailUiToChatHeader() {
  bindSchoolEmailDomRefs();
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
  if (!schoolEmailSettingsPage) {
    void ensureEmailHtmlLoaded().then((loaded) => {
      if (loaded) showSchoolSettingsCard();
    });
    return;
  }
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
  setEmailHeaderChromeVisible(true);
}

function hideSchoolSettingsCard() {
  bindSchoolEmailDomRefs();
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

document.addEventListener("click", (event) => {
  if (!sesHistoryList || sesHistoryList.contains(event.target)) return;
  if (sesEmailPreviewPanel?.contains(event.target)) return;
  if (sesActiveHistoryLogId) {
    clearSesHistorySelection();
  }
});

function wireSchoolEmailProfilePreviewBindings() {
  bindSchoolEmailDomRefs();
  if (!schoolEmailSettingsPage || schoolEmailProfileBindingsWired) return;
  schoolEmailProfileBindingsWired = true;
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
}

function wireSchoolEmailSettingsControls() {
  bindSchoolEmailDomRefs();
  if (!schoolEmailSettingsPage || schoolEmailControlsWired) return;
  schoolEmailControlsWired = true;
  if (sesClose) sesClose.addEventListener("click", closeSchoolSettingsView);
  ensureSesDraftControls();
  if (sesCancel) sesCancel.addEventListener("click", cancelEmailCompose);
  if (sesSave) {
    sesSave.addEventListener("click", () => {
      const isSettingsMode = !!document.querySelector(".ses-body")?.classList.contains("ses-view-settings");
      if (isSettingsMode) return saveEmailSettings();
      return saveCurrentEmailDraft();
    });
  }
  if (sesTestBtn) sesTestBtn.addEventListener("click", sendCurrentComposeEmail);
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
  if (sesHistoryClearBtn) {
    sesHistoryClearBtn.addEventListener("click", () => {
      clearSesHistorySelection();
      clearSesTestFields({ clearBody: true });
      setSesSettingsView("sent");
    });
  }
  wireSesTabButtons();
  wireSesContactForm();
  wireSesInboxActions();
  wireSesInboxDetailControls();
  updateSesMailboxPermissionsUI();
  setSesSettingsView(getDefaultSesSettingsView());
  [sesTestTo, sesSubjectPrefix, sesBodyText, getSesExtraRecipientInput("cc"), getSesExtraRecipientInput("bcc")].forEach((input) => {
    if (!input) return;
    input.addEventListener("input", () => {
      updateSesEmailPreview();
      scheduleSesDraftAutosave();
    });
  });
}

function clearSesTestFields({ clearBody = true } = {}) {
  if (sesSubjectPrefix) sesSubjectPrefix.value = "";
  if (sesTestTo) sesTestTo.value = "";
  renderComposeRecipientChips("to");
  setComposeAttachments([]);
  resetSesExtraRecipients();
  if (sesBodyText && clearBody) {
    sesBodyText.value = "";
    setRichEditorContent("");
  }
  setSesGreetingAndClosing();
  updateSesEmailPreview();
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
let sesLoadedEmailSettingsSnapshot = null;
let sesCurrentDraftId = "";
let sesDraftAutosaveTimer = null;
let sesDraftAutosaveInFlight = false;
let sesDraftStatusTimer = null;
let sesDraftDeleteBtn = null;
let sesComposeAttachments = [];

function getSesSettingsPolishInput(id) {
  return sesSettingsPolishState?.inputs?.[id] || document.getElementById(id) || null;
}

function isValidOptionalEmail(value) {
  const normalized = String(value || "").trim();
  return !normalized || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function applyEmailSettingsToForm(s = {}) {
  sesEnabled.checked = !!(s.live_session_notifications_enabled ?? s.enabled);
  sesSchoolName.value = s.from_name || s.brand_school_name || s.senderName || "";
  sesReplyTo.value = s.reply_to_email || "";
  const supportInput = getSesSettingsPolishInput("sesSupportEmailDisplay");
  if (supportInput) supportInput.value = s.support_email || "";
  sesFooter.value = s.signature || s.defaultSignature || s.footer_text || "";
  const signatureEnabled = getSesSettingsPolishInput("sesSignatureEnabled");
  if (signatureEnabled) signatureEnabled.checked = true;
  const builderSchool = getSesSettingsPolishInput("sesSignatureBuilderSchool");
  const builderEmail = getSesSettingsPolishInput("sesSignatureBuilderEmail");
  if (builderSchool && !builderSchool.value) builderSchool.value = s.from_name || s.brand_school_name || "";
  if (builderEmail && !builderEmail.value) builderEmail.value = s.support_email || s.reply_to_email || "";
  sesSavedSubjectPrefix = String(s.subject_prefix || "");

  if (sesSubjectPrefix) {
    sesSubjectPrefix.value = "";
    sesSubjectPrefix.placeholder = sesSavedSubjectPrefix || "Antrag";
  }

  if (sesSignatureHtml) {
    sesSignatureHtml.value = s.signature_html || "";
  }

  const toggleMap = {
    sesRegistrationEmailsEnabled: s.registration_emails_enabled ?? s.sendRegistrationEmails,
    sesPasswordResetEmailsEnabled: s.password_reset_emails_enabled ?? s.sendPasswordResetEmails,
    sesInvoicePaymentEmailsEnabled: s.invoice_payment_emails_enabled ?? s.sendInvoicePaymentEmails,
    sesExamCourseReminderEmailsEnabled: s.exam_course_reminder_emails_enabled ?? s.sendExamCourseReminderEmails
  };
  Object.entries(toggleMap).forEach(([id, value]) => {
    const input = getSesSettingsPolishInput(id);
    if (input) input.checked = value === undefined || value === null ? true : !!value;
  });

  sesLogoUrlValue = s.logo_url || "";
  if (sesLogoPreview) {
    if (sesLogoUrlValue) {
      sesLogoPreview.src = sesLogoUrlValue;
      sesLogoPreview.style.display = "block";
    } else {
      sesLogoPreview.style.display = "none";
    }
  }
  updateSesSettingsSignaturePreview();
}

function restoreLoadedEmailSettings() {
  if (!sesLoadedEmailSettingsSnapshot) return;
  applyEmailSettingsToForm({ ...sesLoadedEmailSettingsSnapshot });
  if (sesStatus) {
    sesStatus.textContent = "Changes discarded";
    setTimeout(() => {
      if (sesStatus?.textContent === "Changes discarded") sesStatus.textContent = "";
    }, 1200);
  }
}

function generateSesSettingsSignature() {
  const getValue = (id) => String(getSesSettingsPolishInput(id)?.value || "").trim();
  const lines = [
    getValue("sesSignatureBuilderSchool"),
    getValue("sesSignatureBuilderAddress"),
    getValue("sesSignatureBuilderPhone") ? `Phone: ${getValue("sesSignatureBuilderPhone")}` : "",
    getValue("sesSignatureBuilderEmail") ? `Email: ${getValue("sesSignatureBuilderEmail")}` : "",
    getValue("sesSignatureBuilderHours") ? `Opening hours: ${getValue("sesSignatureBuilderHours")}` : "",
    getValue("sesSignatureBuilderLegal")
  ].filter(Boolean);
  if (!lines.length) {
    showToast("Add signature details first");
    return;
  }
  if (sesFooter) {
    sesFooter.value = lines.join("\n");
    updateSesSettingsSignaturePreview();
    sesFooter.focus();
  }
}

async function loadEmailSettings() {
  await resolveProfileWorkspaceId();
  const s = await fetchJSON("/api/workspace/email-settings", {
    headers: {}
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

  sesLoadedEmailSettingsSnapshot = { ...s };
  applyEmailSettingsToForm(s);
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
  updateSesSettingsSignaturePreview();

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
  const display = String(log.toName || "").trim();
  const email = String(log.toEmail || log.to_email || "").trim();
  const source = display || email;
  if (!source) return "Unknown recipient";

  const angleMatch = source.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/);
  if (angleMatch) {
    const name = angleMatch[1].trim();
    const address = angleMatch[2].trim();
    return name || address || email || "Unknown recipient";
  }

  const embeddedEmail = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (embeddedEmail) {
    const withoutEmail = source
      .replace(embeddedEmail[0], "")
      .replace(/[<>()"]/g, "")
      .trim();
    return withoutEmail || embeddedEmail[0] || email || "Unknown recipient";
  }

  return source;
}

function formatSenderRole(role) {
  const normalized = String(role || "admin").trim();
  if (!normalized) return "Admin";
  return normalized
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

function getAnnouncementEmailSearchText(record = {}) {
  return [
    record.subject,
    record.body,
    record.bodyText,
    record.text_body,
    record.html_body,
    record.preview,
    record.type,
    record.category,
    record.template_type,
    record.templateType,
    record.template_category,
    record.templateCategory,
    record.template_key,
    record.templateKey,
    record.metadata,
    record.metadata_json,
    record.status
  ]
    .map((value) => String(value || "").replace(/<[^>]*>/g, " "))
    .join(" ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isAnnouncementEmailRecord(record = {}) {
  const text = getAnnouncementEmailSearchText(record);
  return [
    "announcement",
    "announcements",
    "notice",
    "class notice",
    "exam notice",
    "course notice",
    "school notice",
    "important notice",
    "bulletin",
    "school update",
    "campus update"
  ].some((term) => text.includes(term));
}

function countAnnouncementEmailRecords(records = []) {
  return (Array.isArray(records) ? records : []).filter(isAnnouncementEmailRecord).length;
}

function getSesHistoryLogText(log = {}) {
  return [
    formatSesHistoryRecipient(log),
    log.toEmail,
    log.to_email,
    log.cc,
    log.bcc,
    log.subject,
    log.bodyText,
    log.bodyHtml,
    log.senderRole,
    log.status
  ]
    .map((value) => String(value || "").replace(/<[^>]*>/g, " "))
    .join(" ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isSesHistoryImportant(log = {}) {
  return Boolean(log.isImportant || log.important || log.is_important || log.flagged || /important/i.test(String(log.subject || "")));
}

function isSesHistoryStarred(log = {}) {
  return Boolean(log.isStarred || log.starred || log.is_starred || log._starred);
}

function hasSesHistoryAttachments(log = {}) {
  return Boolean(
    (Array.isArray(log.attachments) && log.attachments.length) ||
    Number(log.attachmentCount || log.attachment_count || 0) > 0
  );
}

function getFilteredSesEmailLogs() {
  const logs = Array.isArray(sesEmailLogs) ? sesEmailLogs : [];
  const term = String(sesHistorySearchTerm || "").trim().toLowerCase();
  return logs.filter((log) => {
    if (sesHistoryFilter === "starred" && !isSesHistoryStarred(log)) return false;
    if (sesHistoryFilter === "important" && !isSesHistoryImportant(log)) return false;
    if (sesHistoryFilter === "attachments" && !hasSesHistoryAttachments(log)) return false;
    return !term || getSesHistoryLogText(log).includes(term);
  });
}

function updateSesHistorySelectAllState(visibleLogs = getFilteredSesEmailLogs()) {
  const checkbox = document.getElementById("sesHistorySelectAll");
  if (!checkbox) return;
  const visibleIds = visibleLogs.map((log) => String(log.id || "")).filter(Boolean);
  const selectedCount = visibleIds.filter((id) => sesHistorySelectedIds.has(id)).length;
  checkbox.checked = Boolean(visibleIds.length && selectedCount === visibleIds.length);
  checkbox.indeterminate = Boolean(selectedCount && selectedCount < visibleIds.length);
}

function ensureSesHistoryControls() {
  const historyPanel = document.getElementById("sesEmailHistory");
  if (!historyPanel || historyPanel.querySelector(".ses-history-controls")) return;
  const header = historyPanel.querySelector(".ses-history-header");
  const controls = document.createElement("div");
  controls.className = "ses-history-controls";
  controls.innerHTML = `
    <div class="ses-history-search-row">
      <label class="ses-history-search" for="sesHistorySearchInput">
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        <input id="sesHistorySearchInput" type="search" placeholder="Search sent mail">
      </label>
    </div>
    <div class="ses-history-filter-row" role="toolbar" aria-label="Sent mail filters">
      <label class="ses-history-select">
        <input id="sesHistorySelectAll" type="checkbox">
        <span>Select</span>
      </label>
      <button class="ses-history-filter is-active" type="button" data-ses-history-filter="all">All</button>
      <button class="ses-history-filter" type="button" data-ses-history-filter="starred">Starred</button>
      <button class="ses-history-filter" type="button" data-ses-history-filter="important">Important</button>
      <button class="ses-history-filter" type="button" data-ses-history-filter="attachments">
        <i class="fa-solid fa-paperclip" aria-hidden="true"></i>
        Attachments
      </button>
    </div>
  `;
  if (header?.nextSibling) {
    historyPanel.insertBefore(controls, header.nextSibling);
  } else {
    historyPanel.prepend(controls);
  }
  const filterRow = controls.querySelector(".ses-history-filter-row");
  if (filterRow && sesHistoryClearBtn) {
    sesHistoryClearBtn.classList.add("ses-history-compose-inline");
    sesHistoryClearBtn.innerHTML = `<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i><span>Compose New</span>`;
    filterRow.appendChild(sesHistoryClearBtn);
  }
  controls.querySelector("#sesHistorySearchInput")?.addEventListener("input", (event) => {
    sesHistorySearchTerm = event.target.value || "";
    renderSesEmailHistory();
  });
  controls.querySelector("#sesHistorySelectAll")?.addEventListener("change", (event) => {
    const visibleLogs = getFilteredSesEmailLogs();
    const checked = event.target.checked;
    visibleLogs.forEach((log) => {
      const id = String(log.id || "");
      if (!id) return;
      if (checked) sesHistorySelectedIds.add(id);
      else sesHistorySelectedIds.delete(id);
    });
    renderSesEmailHistory();
  });
  controls.querySelectorAll("[data-ses-history-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      sesHistoryFilter = button.dataset.sesHistoryFilter || "all";
      controls.querySelectorAll("[data-ses-history-filter]").forEach((btn) => {
        btn.classList.toggle("is-active", btn === button);
      });
      renderSesEmailHistory();
    });
  });
}

function renderSesEmailHistory() {
  if (!sesHistoryList || !sesHistoryEmpty) return;
  ensureSesHistoryControls();
  sesHistoryList.innerHTML = "";
  const visibleLogs = getFilteredSesEmailLogs();
  if (!sesEmailLogs || !sesEmailLogs.length) {
    sesHistoryEmpty.classList.remove("hidden");
    sesHistoryEmpty.textContent = "No sent emails yet.";
    updateSesHistorySelectAllState([]);
    return;
  }
  if (!visibleLogs.length) {
    sesHistoryEmpty.classList.remove("hidden");
    sesHistoryEmpty.textContent = "No sent emails match this view.";
    updateSesHistorySelectAllState([]);
    return;
  }
  sesHistoryEmpty.classList.add("hidden");

  visibleLogs.forEach((log) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "ses-history-card";
    card.dataset.logId = log.id || "";
    if (log.id === sesActiveHistoryLogId) {
      card.classList.add("is-active");
    }
    if (sesHistorySelectedIds.has(String(log.id || ""))) {
      card.classList.add("is-selected");
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

    const badge = document.createElement("span");
    badge.className = "ses-history-badge";
    badge.textContent = formatSenderRole(log.senderRole);
    card.appendChild(nameEl);
    card.appendChild(badge);
    card.appendChild(subjectEl);
    card.appendChild(metaEl);

    card.addEventListener("click", (event) => {
      event.stopPropagation();
      loadSesEmailLogPreview(log.id);
    });
    sesHistoryList.appendChild(card);
  });
  updateSesHistorySelectAllState(visibleLogs);
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
  document.getElementById("sesEmailHistory")?.classList.remove("is-detail-open");
  renderSesEmailHistory();
}

async function loadSesEmailLogs() {
  const ws = await resolveProfileWorkspaceId();
  if (!ws) return;
  const endpoint = `/api/workspaces/${encodeURIComponent(ws)}/email-logs?limit=${SES_HISTORY_LIMIT}`;
  try {
    const res = await fetchJSON(endpoint, { headers: {} });
    sesEmailLogs = Array.isArray(res?.logs) ? res.logs : [];
    updateMailSidebarCounts({
      sent: sesEmailLogs.length
    });
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
    const payload = await fetchJSON(endpoint, { headers: {} });
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
    const requested = String(options.folder).trim().toLowerCase();
    sesCurrentMailboxFolder = requested === "trash" ? "trash" : requested === "spam" ? "spam" : requested === "important" ? "important" : requested === "drafts" ? "drafts" : "inbox";
  }
  if (window.refreshGmailishInbox) {
    return window.refreshGmailishInbox({
      folder: sesCurrentMailboxFolder,
      sync: !!options?.sync,
      showList: !!options?.showList,
      filter: options?.filter
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
      }
    });
  card.classList.add("is-active");
  document.getElementById("sesEmailHistory")?.classList.add("is-detail-open");
  if (sesEmailPreviewPanel) {
    sesEmailPreviewPanel.classList.remove("hidden");
    sesEmailPreviewPanel.classList.add("ses-sent-detail-preview");
  }
  const title = sesEmailPreviewPanel?.querySelector(".ses-preview-title");
  title?.classList.add("ses-sent-preview-topbar");
  if (title && !title.querySelector("#sesHistoryBackBtn")) {
    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.id = "sesHistoryBackBtn";
    backBtn.className = "ses-history-back-btn";
    backBtn.innerHTML = `<i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span>Back to Sent</span>`;
    backBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearSesHistorySelection();
    });
    title.prepend(backBtn);
  }
  if (title && !title.querySelector(".ses-sent-preview-actions")) {
    const actions = document.createElement("div");
    actions.className = "ses-sent-preview-actions";
    const timestamp = title.querySelector(".ses-preview-timestamp");
    const composeBtn = document.createElement("button");
    composeBtn.type = "button";
    composeBtn.className = "ses-sent-preview-compose";
    composeBtn.innerHTML = `<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i><span>Compose New</span>`;
    composeBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (sesHistoryClearBtn) {
        sesHistoryClearBtn.click();
      } else {
        clearSesHistorySelection();
        clearSesTestFields({ clearBody: true });
      }
    });
    if (timestamp) actions.appendChild(timestamp);
    actions.appendChild(composeBtn);
    title.appendChild(actions);
  }
  const titleText = sesEmailPreviewPanel?.querySelector(".ses-preview-title > span:not(.ses-preview-timestamp)");
  if (titleText) titleText.textContent = "Sent message";
  const recipient = formatSesHistoryRecipient(log);
  if (sesPreviewRecipient) sesPreviewRecipient.textContent = recipient ? `To: ${recipient}` : "";
  if (sesPreviewSubject) sesPreviewSubject.textContent = log.subject || "No subject";
  if (sesPreviewTimestamp) sesPreviewTimestamp.textContent = formatSesHistoryTimestamp(log.createdAt);
  if (sesPreviewBody) {
    const previewBody = log.bodyText || stripSesHtml(log.bodyHtml);
    sesPreviewBody.textContent = previewBody || "No content captured.";
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
    headers: {},
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
  await resolveProfileWorkspaceId();
  if (!sesStatus) return;
  const supportInput = getSesSettingsPolishInput("sesSupportEmailDisplay");
  const replyToValue = (sesReplyTo?.value || "").trim();
  const supportValue = (supportInput?.value || "").trim();
  if (!isValidOptionalEmail(replyToValue)) {
    showToast("Enter a valid reply-to email");
    sesReplyTo?.focus();
    return;
  }
  if (!isValidOptionalEmail(supportValue)) {
    showToast("Enter a valid support email");
    supportInput?.focus();
    return;
  }
  sesStatus.textContent = "Saving…";
  const manualBodyText = sesBodyText?.value || "";
  const isSettingsMode = !!document.querySelector(".ses-body")?.classList.contains("ses-view-settings");
  const toggleFlag = (id, key) => {
    const input = getSesSettingsPolishInput(id);
    if (input) return input.checked ? 1 : 0;
    const fallback = sesLoadedEmailSettingsSnapshot?.[key];
    return fallback === undefined || fallback === null ? 1 : (fallback ? 1 : 0);
  };
  const payload = {
    enabled: sesEnabled.checked ? 1 : 0,
    live_session_notifications_enabled: sesEnabled.checked ? 1 : 0,
    registration_emails_enabled: toggleFlag("sesRegistrationEmailsEnabled", "registration_emails_enabled"),
    password_reset_emails_enabled: toggleFlag("sesPasswordResetEmailsEnabled", "password_reset_emails_enabled"),
    invoice_payment_emails_enabled: toggleFlag("sesInvoicePaymentEmailsEnabled", "invoice_payment_emails_enabled"),
    exam_course_reminder_emails_enabled: toggleFlag("sesExamCourseReminderEmailsEnabled", "exam_course_reminder_emails_enabled"),
    from_name: sesSchoolName.value || "",
    brand_school_name: sesSchoolName.value || "",
    reply_to_email: replyToValue,
    support_email: supportValue,
    signature: sesFooter.value || "",
    footer_text: sesFooter.value || "",
    subject_prefix: isSettingsMode ? sesSavedSubjectPrefix : (sesSubjectPrefix.value || ""),
    manual_body_text: isSettingsMode ? "" : manualBodyText,
    logo_url: sesLogoUrlValue || "",
    signature_html: sesSignatureHtml?.value || ""
  };
  const saved = await fetchJSON("/api/workspace/email-settings", {
    method: "PATCH",
    headers: {},
    body: JSON.stringify(payload)
  });
  if (saved?.settings) {
    sesLoadedEmailSettingsSnapshot = { ...saved.settings };
    applyEmailSettingsToForm(saved.settings);
  } else {
    sesLoadedEmailSettingsSnapshot = { ...payload };
  }
  sesStatus.textContent = "Saved ✅";
  showToast("Email settings saved");
  updateSesSettingsSignaturePreview();
  setTimeout(() => {
    if (sesStatus) sesStatus.textContent = "";
  }, 1200);
}

async function sendTestEmail() {
  const ws = await resolveProfileWorkspaceId();
  if (!sesStatus) return;
  const recipientsOk = ["to", "cc", "bcc"].every(commitComposeRecipientInput);
  if (!recipientsOk) return showToast("Fix invalid recipient email");
  const recipients = getComposeRecipients();
  const to = recipients.toEmail.join(", ");
  if (!recipients.toEmail.length) {
    return showToast("Enter a valid test email");
  }

  const finalBody = buildFinalTestEmailBody();

  sesStatus.textContent = "Sending test email…";
  try {
    const composePayload = getSesComposePayload();
    const testPayload = {
      to,
      toEmail: recipients.toEmail,
      manual_body_text: finalBody,
      bodyText: composePayload.bodyText,
      bodyHtml: composePayload.bodyHtml,
      subject: (sesSubjectPrefix?.value || "").trim(),
      attachmentIds: composePayload.attachmentIds
    };
    if (composePayload.cc) testPayload.cc = composePayload.cc;
    if (composePayload.bcc) testPayload.bcc = composePayload.bcc;
    await fetchJSON(`/api/workspaces/${encodeURIComponent(ws)}/email-settings/test`, {
      method: "POST",
      headers: {},
      body: JSON.stringify(testPayload)
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

function setSesDraftStatus(message = "") {
  if (!sesStatus) return;
  sesStatus.textContent = message;
  if (sesDraftStatusTimer) clearTimeout(sesDraftStatusTimer);
  if (message && !/saving|sending/i.test(message)) {
    sesDraftStatusTimer = setTimeout(() => {
      if (sesStatus?.textContent === message) sesStatus.textContent = "";
    }, 1600);
  }
}

function getSesExtraRecipientInput(type) {
  return document.getElementById(type === "bcc" ? "sesBccInput" : "sesCcInput");
}

function getSesExtraRecipientValue(type) {
  return (getSesExtraRecipientInput(type)?.value || "").trim();
}

const COMMON_EMAIL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "gmx.de",
  "gmx.com",
  "web.de",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "yahoo.com",
  "yahoo.de",
  "t-online.de",
  "protonmail.com"
];

const composeRecipientSuggestState = {
  activeField: "",
  rows: [],
  activeIndex: 0,
  timer: null
};

function parseEmailRecipients(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseEmailRecipients(entry));
  }
  const seen = new Set();
  return String(value || "")
    .split(/[,\n;]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => {
      const key = entry.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function getComposeRecipientStorage(field) {
  if (field === "to") return sesTestTo;
  return getSesExtraRecipientInput(field);
}

function getComposeRecipients() {
  return {
    toEmail: parseEmailRecipients(getComposeRecipientStorage("to")?.value || ""),
    cc: parseEmailRecipients(getComposeRecipientStorage("cc")?.value || ""),
    bcc: parseEmailRecipients(getComposeRecipientStorage("bcc")?.value || "")
  };
}

function setComposeRecipientStore(field, recipients = []) {
  const storage = getComposeRecipientStorage(field);
  if (!storage) return;
  storage.value = parseEmailRecipients(recipients).join(", ");
}

function getComposeRecipientInput(field) {
  return document.querySelector(`.compose-recipient-row[data-compose-recipient="${field}"] .compose-recipient-input`);
}

function getComposeRecipientError(field) {
  return document.querySelector(`[data-compose-recipient-error="${field}"]`);
}

function setComposeRecipientError(field, message = "") {
  const error = getComposeRecipientError(field);
  if (!error) return;
  error.textContent = message;
  error.hidden = !message;
}

function renderComposeRecipientChips(field) {
  const row = document.querySelector(`.compose-recipient-row[data-compose-recipient="${field}"]`);
  if (!row) return;
  const chips = row.querySelector(".compose-recipient-chips");
  const input = row.querySelector(".compose-recipient-input");
  if (!chips || !input) return;
  chips.querySelectorAll(".compose-recipient-chip").forEach((chip) => chip.remove());
  getComposeRecipients()[field === "to" ? "toEmail" : field].forEach((email) => {
    const chip = document.createElement("span");
    chip.className = "compose-recipient-chip";
    chip.dataset.email = email;
    chip.innerHTML = `
      <span>${escapeHtml(email)}</span>
      <button type="button" aria-label="Remove ${escapeHtml(email)}" data-remove-recipient="${field}" data-email="${escapeHtml(email)}">×</button>
    `;
    chips.insertBefore(chip, input);
  });
}

function addRecipientChip(field, email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  if (!isValidEmail(normalized)) {
    setComposeRecipientError(field, "Enter a valid email address.");
    return false;
  }
  const key = field === "to" ? "toEmail" : field;
  const recipients = getComposeRecipients()[key];
  if (recipients.some((item) => item.toLowerCase() === normalized)) {
    setComposeRecipientError(field, "");
    const input = getComposeRecipientInput(field);
    if (input) input.value = "";
    return true;
  }
  setComposeRecipientStore(field, [...recipients, normalized]);
  renderComposeRecipientChips(field);
  setComposeRecipientError(field, "");
  const input = getComposeRecipientInput(field);
  if (input) input.value = "";
  updateSesEmailPreview?.();
  scheduleSesDraftAutosave?.();
  return true;
}

function removeRecipientChip(field, email) {
  const key = field === "to" ? "toEmail" : field;
  const removeKey = String(email || "").trim().toLowerCase();
  setComposeRecipientStore(field, getComposeRecipients()[key].filter((item) => item.toLowerCase() !== removeKey));
  renderComposeRecipientChips(field);
  updateSesEmailPreview?.();
  scheduleSesDraftAutosave?.();
}

function commitComposeRecipientInput(field) {
  const input = getComposeRecipientInput(field);
  if (!input) return true;
  const value = input.value.trim();
  if (!value) return true;
  const parts = parseEmailRecipients(value);
  if (!parts.length) return true;
  let ok = true;
  parts.forEach((part) => {
    if (!addRecipientChip(field, part)) ok = false;
  });
  return ok;
}

function getDomainSuggestions(value = "") {
  const raw = String(value || "").trim().toLowerCase();
  const at = raw.indexOf("@");
  if (at <= 0) return [];
  const local = raw.slice(0, at);
  const domainPart = raw.slice(at + 1);
  if (!local || domainPart.includes(".")) return [];
  return COMMON_EMAIL_DOMAINS
    .filter((domain) => domain.startsWith(domainPart))
    .slice(0, 4)
    .map((domain) => ({
      type: "domain",
      email: `${local}@${domain}`,
      name: `Use ${local}@${domain}`,
      role: ""
    }));
}

function getComposeSuggestPopover() {
  let popover = document.querySelector(".compose-suggest-popover");
  if (!popover) {
    popover = document.createElement("div");
    popover.className = "compose-suggest-popover";
    popover.hidden = true;
    document.body.appendChild(popover);
  }
  return popover;
}

function closeComposeSuggestPopover() {
  const popover = document.querySelector(".compose-suggest-popover");
  if (popover) popover.hidden = true;
  composeRecipientSuggestState.rows = [];
  composeRecipientSuggestState.activeField = "";
}

function roleLabel(role = "") {
  const normalized = String(role || "").toLowerCase();
  if (normalized.includes("student")) return "Student";
  if (normalized.includes("teacher")) return "Teacher";
  if (normalized.includes("admin")) return "Admin";
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : "";
}

function renderComposeSuggestPopover(field, rows = []) {
  const input = getComposeRecipientInput(field);
  const popover = getComposeSuggestPopover();
  if (!input || !rows.length) {
    closeComposeSuggestPopover();
    return;
  }
  composeRecipientSuggestState.activeField = field;
  composeRecipientSuggestState.rows = rows;
  composeRecipientSuggestState.activeIndex = Math.min(composeRecipientSuggestState.activeIndex, rows.length - 1);
  const rect = input.closest(".compose-recipient-row")?.getBoundingClientRect() || input.getBoundingClientRect();
  popover.style.left = `${Math.round(rect.left + window.scrollX)}px`;
  popover.style.top = `${Math.round(rect.bottom + window.scrollY + 4)}px`;
  popover.style.width = `${Math.max(320, Math.round(rect.width))}px`;
  popover.innerHTML = rows.map((row, index) => {
    const active = index === composeRecipientSuggestState.activeIndex ? " is-active" : "";
    const name = row.type === "domain" ? row.name : (row.name || row.email);
    const initials = (name || row.email || "?").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
    return `
      <button type="button" class="compose-suggest-row${active}" data-suggest-index="${index}">
        <span class="compose-suggest-avatar">${escapeHtml(initials)}</span>
        <span class="compose-suggest-main">
          <span class="compose-suggest-name">${escapeHtml(name)}</span>
          <span class="compose-suggest-email">${escapeHtml(row.email || "")}</span>
        </span>
        ${row.role ? `<span class="compose-suggest-role">${escapeHtml(roleLabel(row.role))}</span>` : ""}
      </button>
    `;
  }).join("");
  popover.hidden = false;
}

async function loadComposeRecipientSuggestions(field) {
  const input = getComposeRecipientInput(field);
  if (!input) return;
  const q = input.value.trim();
  const domainRows = getDomainSuggestions(q);
  let userRows = [];
  if (q.length >= 2 && !q.includes("@")) {
    try {
      const data = await fetchJSON(`/api/admin/email/recipient-suggestions?q=${encodeURIComponent(q)}`, { headers: {} });
      userRows = Array.isArray(data?.rows) ? data.rows : [];
    } catch (error) {
      userRows = [];
    }
  }
  renderComposeSuggestPopover(field, [...domainRows, ...userRows].slice(0, 10));
}

function scheduleComposeRecipientSuggestions(field) {
  if (composeRecipientSuggestState.timer) clearTimeout(composeRecipientSuggestState.timer);
  composeRecipientSuggestState.timer = setTimeout(() => loadComposeRecipientSuggestions(field), 200);
}

function setSesExtraRecipientValue(type, value = "") {
  const input = getSesExtraRecipientInput(type);
  if (input) input.value = value;
  const normalizedValue = parseEmailRecipients(value).join(", ");
  if (input) input.value = normalizedValue;
  const field = document.querySelector(`[data-compose-recipient-field="${type}"]`);
  const toggle = document.querySelector(`[data-compose-recipient-toggle="${type}"]`);
  if (field) field.classList.toggle("hidden", !normalizedValue);
  if (toggle) toggle.hidden = Boolean(normalizedValue);
  renderComposeRecipientChips(type);
}

function resetSesExtraRecipients() {
  ["cc", "bcc"].forEach((type) => setSesExtraRecipientValue(type, ""));
}

function ensureComposeExtraRecipientFields() {
  const toField = sesTestTo?.closest(".ses-field");
  if (!toField) return;
  if (!toField.querySelector(".mail-compose-recipient-toggles")) {
    const toggles = document.createElement("span");
    toggles.className = "mail-compose-recipient-toggles";
    toggles.innerHTML = `
      <button type="button" data-compose-recipient-toggle="cc">Cc</button>
      <button type="button" data-compose-recipient-toggle="bcc">Bcc</button>
    `;
    toField.appendChild(toggles);
    toggles.querySelectorAll("[data-compose-recipient-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const type = button.dataset.composeRecipientToggle || "";
        const field = document.querySelector(`[data-compose-recipient-field="${type}"]`);
        if (field) field.classList.remove("hidden");
        button.hidden = true;
        getComposeRecipientInput(type)?.focus();
      });
    });
  }

  let insertAfter = toField;
  ["cc", "bcc"].forEach((type) => {
    const id = type === "cc" ? "sesCcInput" : "sesBccInput";
    const existing = document.getElementById(id)?.closest(".ses-field");
    if (existing) {
      insertAfter = existing;
      return;
    }
    const field = document.createElement("div");
    field.className = "ses-field compose-extra-recipient-field hidden";
    field.dataset.composeRecipientField = type;
    field.innerHTML = `
      <label for="${id}">${type === "cc" ? "Cc" : "Bcc"}</label>
      <input id="${id}" type="email" autocomplete="off" />
    `;
    insertAfter.parentElement?.insertBefore(field, insertAfter.nextSibling);
    insertAfter = field;
  });
}

function ensureComposeRecipientChipField(field) {
  const storage = getComposeRecipientStorage(field);
  if (!storage || storage.dataset.composeChipsReady === "1") return;
  const fieldEl = storage.closest(".ses-field");
  if (!fieldEl) return;
  const label = fieldEl.querySelector(`label[for="${storage.id}"]`);
  const labelText = field === "to" ? "To" : field === "cc" ? "Cc" : "Bcc";
  if (label) label.hidden = true;
  const existingHead = fieldEl.querySelector(".mail-compose-recipient-head");
  if (existingHead) existingHead.style.display = "none";
  storage.classList.add("compose-recipient-storage");
  storage.setAttribute("aria-hidden", "true");
  storage.tabIndex = -1;
  const row = document.createElement("div");
  row.className = "compose-recipient-row";
  row.dataset.composeRecipient = field;
  const toggles = field === "to" ? fieldEl.querySelector(".mail-compose-recipient-toggles") : null;
  row.innerHTML = `
    <span class="compose-recipient-label">${labelText}</span>
    <span class="compose-recipient-chips">
      <input type="text" class="compose-recipient-input" autocomplete="off" aria-label="${labelText} recipients" placeholder="${field === "to" ? "type more..." : ""}" />
    </span>
    <span class="compose-recipient-actions"></span>
  `;
  if (toggles) row.querySelector(".compose-recipient-actions")?.appendChild(toggles);
  const error = document.createElement("div");
  error.className = "compose-recipient-error";
  error.dataset.composeRecipientError = field;
  error.hidden = true;
  fieldEl.append(row, error);
  storage.dataset.composeChipsReady = "1";
  const input = row.querySelector(".compose-recipient-input");
  input?.addEventListener("input", () => {
    setComposeRecipientError(field, "");
    scheduleComposeRecipientSuggestions(field);
  });
  input?.addEventListener("paste", (event) => {
    const text = event.clipboardData?.getData("text") || "";
    if (!/[;,]/.test(text)) return;
    event.preventDefault();
    parseEmailRecipients(text).forEach((email) => addRecipientChip(field, email));
    closeComposeSuggestPopover();
  });
  input?.addEventListener("keydown", (event) => {
    const popoverOpen = !getComposeSuggestPopover().hidden && composeRecipientSuggestState.activeField === field;
    if (popoverOpen && ["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const count = composeRecipientSuggestState.rows.length;
      composeRecipientSuggestState.activeIndex = (composeRecipientSuggestState.activeIndex + delta + count) % count;
      renderComposeSuggestPopover(field, composeRecipientSuggestState.rows);
      return;
    }
    if (popoverOpen && event.key === "Enter") {
      event.preventDefault();
      const rowData = composeRecipientSuggestState.rows[composeRecipientSuggestState.activeIndex];
      if (rowData?.email) addRecipientChip(field, rowData.email);
      closeComposeSuggestPopover();
      return;
    }
    if (event.key === "Escape") {
      closeComposeSuggestPopover();
      return;
    }
    if (["Enter", ",", ";", "Tab"].includes(event.key)) {
      if (event.key !== "Tab" || input.value.trim()) event.preventDefault();
      commitComposeRecipientInput(field);
      closeComposeSuggestPopover();
    }
  });
  input?.addEventListener("blur", () => {
    setTimeout(() => {
      commitComposeRecipientInput(field);
      closeComposeSuggestPopover();
    }, 150);
  });
  row.addEventListener("click", () => input?.focus());
  renderComposeRecipientChips(field);
}

function ensureComposeRecipientChips() {
  ensureComposeExtraRecipientFields();
  ["to", "cc", "bcc"].forEach(ensureComposeRecipientChipField);
}

window.parseEmailRecipients = parseEmailRecipients;
window.isValidEmail = isValidEmail;
window.addRecipientChip = addRecipientChip;
window.removeRecipientChip = removeRecipientChip;
window.getComposeRecipients = getComposeRecipients;

let composeRichEditorSelection = null;

function getComposeRichEditor() {
  return document.querySelector(".compose-rich-body");
}

function isComposeRichEditorEmpty(editor = getComposeRichEditor()) {
  if (!editor) return true;
  return !String(editor.textContent || "").trim() && !editor.querySelector("img, ul, ol, li, a, b, strong, i, em, u");
}

function updateComposeRichPlaceholder() {
  const editor = getComposeRichEditor();
  if (!editor) return;
  editor.classList.toggle("is-empty", isComposeRichEditorEmpty(editor));
}

function normalizeComposeLinkHref(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return `mailto:${raw}`;
  return `https://${raw}`;
}

function sanitizeComposeHtml(html = "") {
  const template = document.createElement("template");
  template.innerHTML = String(html || "")
    .replace(/<\s*(script|style|iframe)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe)[^>]*\/?\s*>/gi, "");
  const allowed = new Set(["B", "STRONG", "I", "EM", "U", "P", "BR", "UL", "OL", "LI", "A"]);
  const unwrap = (node) => {
    while (node.firstChild) node.parentNode.insertBefore(node.firstChild, node);
    node.remove();
  };
  [...template.content.querySelectorAll("*")].forEach((node) => {
    if (!allowed.has(node.tagName)) {
      unwrap(node);
      return;
    }
    if (node.tagName === "A") {
      const href = normalizeComposeLinkHref(node.getAttribute("href") || node.textContent || "");
      [...node.attributes].forEach((attr) => node.removeAttribute(attr.name));
      if (!href || !/^(https?:|mailto:|tel:)/i.test(href)) {
        unwrap(node);
        return;
      }
      node.setAttribute("href", href);
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
      return;
    }
    [...node.attributes].forEach((attr) => node.removeAttribute(attr.name));
  });
  return template.innerHTML.trim();
}

function syncRichEditorToTextarea() {
  const editor = getComposeRichEditor();
  if (!editor || !sesBodyText) return;
  const cleanHtml = sanitizeComposeHtml(editor.innerHTML);
  if (editor.innerHTML !== cleanHtml) editor.innerHTML = cleanHtml;
  sesBodyText.value = String(editor.innerText || "").replace(/\n{3,}/g, "\n\n").trim();
  sesBodyText.dataset.bodyHtml = cleanHtml;
  updateComposeRichPlaceholder();
}

function getRichEditorContent() {
  const editor = getComposeRichEditor();
  if (!editor) return sanitizeComposeHtml(sesBodyText?.dataset.bodyHtml || "");
  return sanitizeComposeHtml(editor.innerHTML);
}

function setRichEditorContent(html = "") {
  const editor = getComposeRichEditor();
  if (!editor) {
    if (sesBodyText) {
      sesBodyText.value = stripSesHtml(html);
      sesBodyText.dataset.bodyHtml = sanitizeComposeHtml(html);
    }
    return;
  }
  const cleanHtml = sanitizeComposeHtml(html);
  editor.innerHTML = cleanHtml;
  syncRichEditorToTextarea();
}

function saveComposeRichSelection() {
  const editor = getComposeRichEditor();
  const selection = window.getSelection?.();
  if (!editor || !selection || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (editor.contains(range.commonAncestorContainer)) {
    composeRichEditorSelection = range.cloneRange();
  }
}

function restoreComposeRichSelection() {
  const editor = getComposeRichEditor();
  const selection = window.getSelection?.();
  if (!editor || !selection) return;
  editor.focus();
  if (composeRichEditorSelection) {
    selection.removeAllRanges();
    selection.addRange(composeRichEditorSelection);
  }
}

function updateComposeToolbarState() {
  const toolbar = document.querySelector(".mail-compose-text-toolbar");
  if (!toolbar) return;
  const activeMap = {
    bold: "bold",
    italic: "italic",
    underline: "underline",
    insertUnorderedList: "insertUnorderedList",
    insertOrderedList: "insertOrderedList"
  };
  Object.entries(activeMap).forEach(([key, command]) => {
    const button = toolbar.querySelector(`[data-compose-command="${key}"]`);
    if (!button) return;
    let active = false;
    try {
      active = document.queryCommandState(command);
    } catch (_error) {}
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function formatComposeSelectionFallback(command) {
  const editor = getComposeRichEditor();
  const selection = window.getSelection?.();
  if (!editor || !selection || !selection.rangeCount || selection.isCollapsed) return false;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return false;
  const tag = command === "bold" ? "strong" : command === "italic" ? "em" : command === "underline" ? "u" : "";
  if (!tag) return false;
  const wrapper = document.createElement(tag);
  try {
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);
    selection.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.selectNodeContents(wrapper);
    selection.addRange(nextRange);
    composeRichEditorSelection = nextRange.cloneRange();
    return true;
  } catch (_error) {
    return false;
  }
}

function execComposeCommand(command) {
  restoreComposeRichSelection();
  const beforeHtml = getComposeRichEditor()?.innerHTML || "";
  try {
    document.execCommand(command, false, null);
  } catch (_error) {}
  if (["bold", "italic", "underline"].includes(command) && (getComposeRichEditor()?.innerHTML || "") === beforeHtml) {
    formatComposeSelectionFallback(command);
  }
  syncRichEditorToTextarea();
  saveComposeRichSelection();
  updateComposeToolbarState();
  updateSesEmailPreview?.();
  scheduleSesDraftAutosave?.();
}

function insertComposeLink() {
  restoreComposeRichSelection();
  const href = normalizeComposeLinkHref(window.prompt("Enter link URL") || "");
  if (!href) return;
  const selection = window.getSelection?.();
  if (selection && selection.rangeCount && selection.toString().trim()) {
    document.execCommand("createLink", false, href);
  } else {
    document.execCommand("insertHTML", false, `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(href)}</a>`);
  }
  const editor = getComposeRichEditor();
  editor?.querySelectorAll("a").forEach((link) => {
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  });
  syncRichEditorToTextarea();
  saveComposeRichSelection();
  updateComposeToolbarState();
  updateSesEmailPreview?.();
  scheduleSesDraftAutosave?.();
}

function clearComposeFormatting() {
  restoreComposeRichSelection();
  try {
    document.execCommand("removeFormat", false, null);
    document.execCommand("unlink", false, null);
  } catch (_error) {}
  syncRichEditorToTextarea();
  saveComposeRichSelection();
  updateComposeToolbarState();
  updateSesEmailPreview?.();
  scheduleSesDraftAutosave?.();
}

function ensureComposeTextToolbar(bodyField) {
  if (!bodyField) return null;
  let toolbar = bodyField.querySelector(".mail-compose-text-toolbar");
  if (toolbar) {
    toolbar.classList.add("compose-toolbar");
    toolbar.querySelectorAll("button").forEach((button) => button.classList.add("compose-toolbar-btn"));
    return toolbar;
  }
  toolbar = document.createElement("div");
  toolbar.className = "mail-compose-text-toolbar compose-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Message formatting");
  toolbar.innerHTML = `
    <button type="button" class="compose-toolbar-btn" title="Bold" aria-label="Bold"><i class="fa-solid fa-bold" aria-hidden="true"></i></button>
    <button type="button" class="compose-toolbar-btn" title="Italic" aria-label="Italic"><i class="fa-solid fa-italic" aria-hidden="true"></i></button>
    <button type="button" class="compose-toolbar-btn" title="Underline" aria-label="Underline"><i class="fa-solid fa-underline" aria-hidden="true"></i></button>
    <button type="button" class="compose-toolbar-btn" title="Bullet list" aria-label="Bullet list"><i class="fa-solid fa-list-ul" aria-hidden="true"></i></button>
    <button type="button" class="compose-toolbar-btn" title="Numbered list" aria-label="Numbered list"><i class="fa-solid fa-list-ol" aria-hidden="true"></i></button>
    <button type="button" class="compose-toolbar-btn" title="Link" aria-label="Link"><i class="fa-solid fa-link" aria-hidden="true"></i></button>
    <button type="button" class="compose-toolbar-btn" title="Remove formatting" aria-label="Remove formatting"><i class="fa-solid fa-eraser" aria-hidden="true"></i></button>
  `;
  bodyField.insertBefore(toolbar, sesBodyText || bodyField.firstChild);
  return toolbar;
}

function ensureComposeEditorShell(bodyField) {
  if (!bodyField) return null;
  const toolbar = bodyField.querySelector(".mail-compose-text-toolbar");
  const editor = bodyField.querySelector(".compose-rich-body");
  if (!toolbar || !editor) return null;
  let shell = bodyField.querySelector(".compose-editor");
  if (!shell) {
    shell = document.createElement("div");
    shell.className = "compose-editor";
    bodyField.insertBefore(shell, toolbar);
  }
  if (toolbar.parentElement !== shell) shell.appendChild(toolbar);
  if (editor.parentElement !== shell) shell.appendChild(editor);
  return shell;
}

function ensureComposeEditorFooter(bodyField) {
  if (!bodyField) return null;
  let footer = bodyField.querySelector(".mail-compose-editor-footer");
  if (footer) return footer;

  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.hidden = true;
  input.className = "mail-compose-attach-input";
  input.addEventListener("change", () => {
    uploadComposeAttachmentFiles(input.files || []).finally(() => {
      input.value = "";
    });
  });

  const attach = document.createElement("button");
  attach.type = "button";
  attach.className = "mail-compose-attach";
  attach.title = "Attach file";
  attach.innerHTML = `<i class="fa-solid fa-paperclip" aria-hidden="true"></i><span>Attach file</span>`;
  attach.addEventListener("click", () => input.click());

  const save = document.createElement("button");
  save.type = "button";
  save.className = "mail-compose-footer-save";
  save.innerHTML = `<i class="fa-regular fa-floppy-disk" aria-hidden="true"></i><span>Save draft</span>`;
  save.addEventListener("click", () => sesSave?.click());

  const send = document.createElement("button");
  send.type = "button";
  send.className = "mail-compose-footer-send";
  send.innerHTML = `<i class="fa-solid fa-paper-plane" aria-hidden="true"></i><span>Send</span>`;
  send.addEventListener("click", () => sesTestBtn?.click());

  const actions = document.createElement("div");
  actions.className = "mail-compose-footer-actions";
  actions.append(save, send);

  footer = document.createElement("div");
  footer.className = "mail-compose-editor-footer";
  footer.append(input, attach, actions);
  bodyField.appendChild(footer);
  return footer;
}

function ensureComposeSignatureTools() {
  const signatureField = sesSignaturePreview?.closest(".ses-signature-field") || sesFooter?.closest(".ses-signature-field");
  if (!signatureField) return null;

  let tools = signatureField.querySelector(".mail-compose-signature-tools");
  if (tools) return tools;

  tools = document.createElement("div");
  tools.className = "mail-compose-signature-tools";
  tools.innerHTML = `
    <div class="mail-compose-signature-actions">
      <button type="button" class="mail-compose-signature-preview-toggle">Show preview</button>
      <button type="button" class="mail-compose-signature-settings">Edit in Email Settings</button>
    </div>
  `;

  signatureField.insertBefore(tools, sesSignaturePreview || sesFooter || signatureField.firstChild);

  const previewButton = tools.querySelector(".mail-compose-signature-preview-toggle");
  previewButton?.addEventListener("click", () => {
    const expanded = !signatureField.classList.contains("is-signature-expanded");
    signatureField.classList.toggle("is-signature-expanded", expanded);
    previewButton.textContent = expanded ? "Hide preview" : "Show preview";
    if (expanded) {
      updateSesEmailPreview?.();
    } else {
      hideSesEmailPreview?.();
    }
  });

  tools.querySelector(".mail-compose-signature-settings")?.addEventListener("click", () => {
    signatureField.classList.remove("is-signature-expanded");
    if (previewButton) previewButton.textContent = "Show preview";
    setSesSettingsView("settings");
  });

  return tools;
}

function ensureComposeRichEditor() {
  if (!sesBodyText) return;
  const bodyField = sesBodyText.closest(".ses-field");
  ensureComposeTextToolbar(bodyField);
  ensureComposeEditorFooter(bodyField);
  ensureComposeSignatureTools();
  if (sesBodyText.dataset.richEditorReady === "1") {
    ensureComposeEditorShell(bodyField);
    wireComposeToolbar();
    return;
  }
  if (!bodyField) return;
  const editor = document.createElement("div");
  editor.className = "compose-rich-body is-empty";
  editor.contentEditable = "true";
  editor.setAttribute("role", "textbox");
  editor.setAttribute("aria-multiline", "true");
  editor.setAttribute("aria-label", "Email body");
  editor.dataset.placeholder = "Write your message…";
  bodyField.insertBefore(editor, sesBodyText.nextSibling);
  ensureComposeEditorShell(bodyField);
  sesBodyText.classList.add("compose-body-storage");
  sesBodyText.setAttribute("aria-hidden", "true");
  sesBodyText.tabIndex = -1;
  sesBodyText.dataset.richEditorReady = "1";
  setRichEditorContent(sesBodyText.dataset.bodyHtml || escapeHtml(sesBodyText.value || "").replace(/\n/g, "<br>"));

  editor.addEventListener("input", () => {
    syncRichEditorToTextarea();
    updateComposeToolbarState();
    updateSesEmailPreview?.();
    scheduleSesDraftAutosave?.();
  });
  editor.addEventListener("keyup", () => {
    saveComposeRichSelection();
    updateComposeToolbarState();
  });
  editor.addEventListener("mouseup", () => {
    saveComposeRichSelection();
    updateComposeToolbarState();
  });
  editor.addEventListener("focus", updateComposeToolbarState);
  editor.addEventListener("blur", saveComposeRichSelection);
  editor.addEventListener("keydown", (event) => {
    const key = String(event.key || "").toLowerCase();
    if ((event.metaKey || event.ctrlKey) && ["b", "i", "u"].includes(key)) {
      event.preventDefault();
      execComposeCommand(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
    }
  });
  editor.addEventListener("paste", (event) => {
    event.preventDefault();
    const html = event.clipboardData?.getData("text/html") || "";
    const text = event.clipboardData?.getData("text/plain") || "";
    const insertHtml = html ? sanitizeComposeHtml(html) : escapeHtml(text).replace(/\n/g, "<br>");
    document.execCommand("insertHTML", false, insertHtml);
    syncRichEditorToTextarea();
    saveComposeRichSelection();
    updateComposeToolbarState();
    updateSesEmailPreview?.();
    scheduleSesDraftAutosave?.();
  });

  wireComposeToolbar();
  document.addEventListener("selectionchange", () => {
    const active = document.activeElement;
    if (active === editor || editor.contains(active)) {
      saveComposeRichSelection();
      updateComposeToolbarState();
    }
  });
}

function wireComposeToolbar() {
  const toolbar = document.querySelector(".mail-compose-text-toolbar");
  toolbar?.querySelectorAll("button").forEach((button) => {
    const title = String(button.getAttribute("title") || "").toLowerCase();
    const command = title.includes("bold") ? "bold"
      : title.includes("italic") ? "italic"
        : title.includes("underline") ? "underline"
          : title.includes("bullet") ? "insertUnorderedList"
            : title.includes("numbered") ? "insertOrderedList"
              : title.includes("link") ? "link"
                : title.includes("clear") ? "clearFormatting"
                  : "";
    if (!command || button.dataset.composeCommand) return;
    button.dataset.composeCommand = command;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (command === "link") insertComposeLink();
      else if (command === "clearFormatting") clearComposeFormatting();
      else execComposeCommand(command);
    });
  });
}

window.ensureComposeRichEditor = ensureComposeRichEditor;
window.syncRichEditorToTextarea = syncRichEditorToTextarea;
window.setRichEditorContent = setRichEditorContent;
window.getRichEditorContent = getRichEditorContent;
window.sanitizeComposeHtml = sanitizeComposeHtml;
window.updateComposeToolbarState = updateComposeToolbarState;
window.execComposeCommand = execComposeCommand;
window.insertComposeLink = insertComposeLink;

function formatComposeAttachmentSize(bytes = 0) {
  const size = Number(bytes || 0);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function createLocalComposeAttachmentId() {
  const random = window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `local_${random}`;
}

function isPersistedComposeAttachment(att = {}) {
  const id = String(att.id || att.attachmentId || "");
  return Boolean(id && !id.startsWith("local_") && att.uploaded !== false && att.uploadState !== "uploading");
}

function renderComposeAttachments() {
  const footer = document.querySelector(".mail-compose-editor-footer");
  if (!footer) return;
  let wrap = document.querySelector(".compose-attachments");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "compose-attachments";
    footer.parentElement?.insertBefore(wrap, footer);
  }
  wrap.hidden = !sesComposeAttachments.length;
  wrap.innerHTML = sesComposeAttachments.map((att) => {
    const state = String(att.uploadState || "").toLowerCase();
    const isUploading = state === "uploading";
    const id = String(att.id || att.attachmentId || "");
    return `
    <span class="compose-attachment-chip${isUploading ? " is-uploading" : ""}" data-attachment-id="${escapeHtml(id)}">
      <i class="fa-solid ${String(att.mimeType || "").startsWith("image/") ? "fa-image" : "fa-paperclip"} compose-attachment-icon" aria-hidden="true"></i>
      <span class="compose-attachment-name">${escapeHtml(att.name || att.originalName || att.filename || "attachment")}</span>
      <span class="compose-attachment-size">${escapeHtml(formatComposeAttachmentSize(att.size || att.sizeBytes))}</span>
      ${isUploading ? `<span class="compose-attachment-progress" aria-label="Uploading"></span>` : ""}
      <button type="button" class="compose-attachment-remove" data-compose-remove-attachment="${escapeHtml(id)}" aria-label="Remove attachment">×</button>
    </span>
  `;
  }).join("");
}

function setComposeAttachments(attachments = []) {
  sesComposeAttachments = (Array.isArray(attachments) ? attachments : []).slice(0, 10).map((att) => ({
    ...att,
    id: att.id || att.attachmentId,
    uploaded: att.uploaded !== false
  })).filter((att) => att.id);
  renderComposeAttachments();
}

function validateComposeAttachmentFile(file) {
  const ext = `.${String(file?.name || "").split(".").pop() || ""}`.toLowerCase();
  if ([".exe", ".bat", ".cmd", ".sh", ".js", ".msi"].includes(ext)) {
    return `Files of type ${ext} are not allowed.`;
  }
  if (Number(file?.size || 0) > 10 * 1024 * 1024) {
    return `${file.name} is larger than 10 MB.`;
  }
  if (sesComposeAttachments.length >= 10) {
    return "Maximum 10 attachments allowed.";
  }
  return "";
}

async function uploadComposeAttachmentFiles(files = []) {
  const selected = Array.from(files || []);
  if (!selected.length) return;
  for (const file of selected) {
    const error = validateComposeAttachmentFile(file);
    if (error) {
      showToast(error, "error");
      continue;
    }
    const localId = createLocalComposeAttachmentId();
    const pendingAttachment = {
      id: localId,
      name: file.name || "attachment",
      originalName: file.name || "attachment",
      mimeType: file.type || "application/octet-stream",
      size: Number(file.size || 0),
      sizeBytes: Number(file.size || 0),
      uploadState: "uploading",
      uploaded: false
    };
    sesComposeAttachments = [...sesComposeAttachments, pendingAttachment].slice(0, 10);
    renderComposeAttachments();

    const formData = new FormData();
    formData.append("files", file);
    try {
      const response = await fetch("/api/admin/email/attachments", {
        method: "POST",
        credentials: "include",
        headers: { "x-csrf-token": getCsrfToken() },
        body: formData
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Attachment upload failed");
      const uploaded = (Array.isArray(payload.attachments) ? payload.attachments : [])
        .map((att) => ({ ...att, id: att.id || att.attachmentId, uploaded: true }))
        .filter((att) => att.id);
      sesComposeAttachments = sesComposeAttachments
        .filter((att) => String(att.id || att.attachmentId) !== localId)
        .concat(uploaded)
        .slice(0, 10);
      renderComposeAttachments();
      scheduleSesDraftAutosave();
    } catch (error) {
      sesComposeAttachments = sesComposeAttachments.filter((att) => String(att.id || att.attachmentId) !== localId);
      renderComposeAttachments();
      showToast(error.message || "Attachment upload failed", "error");
    }
  }
}

window.handleSchoolMailAttachmentFiles = uploadComposeAttachmentFiles;

document.addEventListener("click", async (event) => {
  const recipientRemove = event.target.closest("[data-remove-recipient]");
  if (recipientRemove) {
    event.preventDefault();
    removeRecipientChip(recipientRemove.dataset.removeRecipient || "", recipientRemove.dataset.email || "");
    return;
  }
  const suggestRow = event.target.closest(".compose-suggest-row");
  if (suggestRow) {
    event.preventDefault();
    const index = Number(suggestRow.dataset.suggestIndex || 0);
    const field = composeRecipientSuggestState.activeField;
    const rowData = composeRecipientSuggestState.rows[index];
    if (field && rowData?.email) addRecipientChip(field, rowData.email);
    closeComposeSuggestPopover();
    getComposeRecipientInput(field)?.focus();
    return;
  }
  const removeBtn = event.target.closest("[data-compose-remove-attachment]");
  if (!removeBtn) return;
  const id = removeBtn.dataset.composeRemoveAttachment || "";
  if (!id) return;
  const removed = sesComposeAttachments.find((att) => String(att.id || att.attachmentId) === id);
  sesComposeAttachments = sesComposeAttachments.filter((att) => String(att.id || att.attachmentId) !== id);
  renderComposeAttachments();
  if (!isPersistedComposeAttachment(removed)) {
    scheduleSesDraftAutosave();
    return;
  }
  try {
    await fetch(`/api/admin/email/attachments/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "x-csrf-token": getCsrfToken() }
    });
  } catch (_error) {}
  scheduleSesDraftAutosave();
});

function getSesComposePayload() {
  ["to", "cc", "bcc"].forEach(commitComposeRecipientInput);
  syncRichEditorToTextarea();
  const recipients = getComposeRecipients();
  const bodyHtml = getRichEditorContent();
  const bodyText = (sesBodyText?.value || "").trim();
  return {
    toEmail: recipients.toEmail.join(", "),
    subject: (sesSubjectPrefix?.value || "").trim(),
    body: bodyText,
    bodyText,
    bodyHtml,
    signature: (sesFooter?.value || "").trim(),
    cc: recipients.cc.join(", "),
    bcc: recipients.bcc.join(", "),
    attachments: sesComposeAttachments,
    attachmentIds: sesComposeAttachments.filter(isPersistedComposeAttachment).map((att) => att.id || att.attachmentId).filter(Boolean)
  };
}

function hasSesDraftContent(payload = getSesComposePayload()) {
  return !!(
    String(payload.toEmail || "").trim() ||
    String(payload.subject || "").trim() ||
    String(payload.body || "").trim()
  );
}

function clearSesDraftAutosave() {
  if (sesDraftAutosaveTimer) {
    clearTimeout(sesDraftAutosaveTimer);
    sesDraftAutosaveTimer = null;
  }
}

function resetSesDraftState({ clearFields = false } = {}) {
  sesCurrentDraftId = "";
  clearSesDraftAutosave();
  if (sesDraftDeleteBtn) sesDraftDeleteBtn.hidden = true;
  const title = document.querySelector(".ses-form [data-mail-compose-title]");
  if (title && !document.querySelector(".ses-body")?.classList.contains("ses-view-settings")) {
    title.textContent = "Compose message";
  }
  if (clearFields) {
    if (sesTestTo) sesTestTo.value = "";
    if (sesSubjectPrefix) sesSubjectPrefix.value = "";
    if (sesBodyText) sesBodyText.value = "";
    setRichEditorContent("");
    setComposeAttachments([]);
    resetSesExtraRecipients();
    renderComposeRecipientChips("to");
    updateSesEmailPreview?.();
  }
}

function ensureSesDraftControls() {
  const actions = document.querySelector(".ses-form > .ses-form-actions");
  if (!actions || sesDraftDeleteBtn) return;
  sesDraftDeleteBtn = document.createElement("button");
  sesDraftDeleteBtn.className = "ses-btn ses-btn-ghost ses-draft-delete";
  sesDraftDeleteBtn.id = "sesDraftDeleteBtn";
  sesDraftDeleteBtn.type = "button";
  sesDraftDeleteBtn.textContent = "Delete draft";
  sesDraftDeleteBtn.hidden = true;
  actions.insertBefore(sesDraftDeleteBtn, sesSave || null);
  sesDraftDeleteBtn.addEventListener("click", deleteCurrentEmailDraft);
}

async function refreshSchoolMailDrafts() {
  const isDraftsView = !!document.querySelector(".ses-body")?.classList.contains("ses-view-drafts");
  if (isDraftsView && window.refreshGmailishInbox) {
    await window.refreshGmailishInbox({ folder: "drafts", sync: false }).catch(() => {});
    return;
  }
  try {
    const data = await fetchJSON("/api/admin/email/drafts", { headers: {} });
    updateMailSidebarCounts({ drafts: Array.isArray(data?.drafts) ? data.drafts.length : Number(data?.count || 0) });
  } catch (error) {
    console.warn("Failed to refresh draft count", error);
  }
}

async function saveCurrentEmailDraft({ silent = false } = {}) {
  const payload = getSesComposePayload();
  if (!hasSesDraftContent(payload)) {
    if (!silent) showToast("Draft is empty");
    return null;
  }
  if (sesDraftAutosaveInFlight) return null;
  sesDraftAutosaveInFlight = true;
  if (!silent) setSesDraftStatus("Saving draft...");
  else setSesDraftStatus("Saving...");
  try {
    const path = sesCurrentDraftId
      ? `/api/admin/email/drafts/${encodeURIComponent(sesCurrentDraftId)}`
      : "/api/admin/email/drafts";
    const saved = await fetchJSON(path, {
      method: sesCurrentDraftId ? "PATCH" : "POST",
      headers: {},
      body: JSON.stringify(payload)
    });
    const draft = saved?.draft;
    if (draft?.id) {
      sesCurrentDraftId = draft.id;
      if (sesDraftDeleteBtn) sesDraftDeleteBtn.hidden = false;
      updateMailSidebarCounts({ drafts: undefined });
    }
    setSesDraftStatus("Draft saved");
    await refreshSchoolMailDrafts();
    return draft || null;
  } catch (error) {
    console.error("Draft save failed", error);
    setSesDraftStatus("Not saved");
    if (!silent) showToast(error.message || "Could not save draft", "error");
    return null;
  } finally {
    sesDraftAutosaveInFlight = false;
  }
}

function scheduleSesDraftAutosave() {
  const body = document.querySelector(".ses-body");
  if (!body?.classList.contains("ses-view-sent")) return;
  clearSesDraftAutosave();
  const payload = getSesComposePayload();
  if (!hasSesDraftContent(payload)) return;
  setSesDraftStatus("Not saved");
  sesDraftAutosaveTimer = setTimeout(() => {
    saveCurrentEmailDraft({ silent: true }).catch((error) => console.warn("Draft autosave failed", error));
  }, 7000);
}

async function deleteCurrentEmailDraft() {
  if (!sesCurrentDraftId) {
    resetSesDraftState({ clearFields: true });
    setSesDraftStatus("Draft discarded");
    return;
  }
  const ok = await openConfirmModal({
    title: "Delete draft?",
    message: "This unfinished email will be removed from Drafts.",
    confirmText: "Delete draft",
    danger: true
  });
  if (!ok) return;
  try {
    await fetchJSON(`/api/admin/email/drafts/${encodeURIComponent(sesCurrentDraftId)}`, {
      method: "DELETE",
      headers: {}
    });
    resetSesDraftState({ clearFields: true });
    setSesDraftStatus("Draft deleted");
    await refreshSchoolMailDrafts();
    setSesSettingsView("drafts");
  } catch (error) {
    showToast(error.message || "Could not delete draft", "error");
  }
}

async function sendCurrentComposeEmail() {
  clearSesDraftAutosave();
  if (sesCurrentDraftId) {
    const payload = getSesComposePayload();
    if (!parseEmailRecipients(payload.toEmail).length) {
      showToast("Enter a valid recipient email");
      getComposeRecipientInput("to")?.focus();
      return;
    }
    setSesDraftStatus("Sending...");
    try {
      await fetchJSON(`/api/admin/email/drafts/${encodeURIComponent(sesCurrentDraftId)}/send`, {
        method: "POST",
        headers: {},
        body: JSON.stringify(payload)
      });
      resetSesDraftState({ clearFields: true });
      setSesDraftStatus("Sent");
      showToast("Draft sent", "success");
      await refreshSchoolMailDrafts();
      await loadSesEmailLogs().catch((err) => console.warn("Failed to refresh email history", err));
      setSesSettingsView("history");
    } catch (error) {
      setSesDraftStatus(`Send failed: ${String(error.message || error)}`);
    }
    return;
  }
  await sendTestEmail();
}

async function cancelEmailCompose() {
  const isSettingsMode = !!document.querySelector(".ses-body")?.classList.contains("ses-view-settings");
  if (isSettingsMode) {
    restoreLoadedEmailSettings();
    return;
  }
  const payload = getSesComposePayload();
  if (!hasSesDraftContent(payload)) {
    resetSesDraftState({ clearFields: true });
    setSesSettingsView("inbox");
    return;
  }
  const save = await openConfirmModal({
    title: "Save this email as draft?",
    message: "Save your unfinished email so you can continue editing it later.",
    confirmText: "Save draft",
    cancelText: "Continue editing"
  });
  if (save) {
    await saveCurrentEmailDraft();
    setSesSettingsView("drafts");
    return;
  }
  const discard = await openConfirmModal({
    title: "Discard this email?",
    message: "Discard the unsaved compose content and return to the mailbox.",
    confirmText: "Discard",
    cancelText: "Continue editing",
    danger: true
  });
  if (discard) {
    resetSesDraftState({ clearFields: true });
    setSesSettingsView("inbox");
  }
}

function openEmailDraftInCompose(draft = {}) {
  setSesSettingsView("sent");
  ensureComposeRecipientChips();
  ensureComposeRichEditor();
  sesCurrentDraftId = draft.id || draft.draftId || "";
  setComposeRecipientStore("to", draft.toEmail || draft.to_email || "");
  renderComposeRecipientChips("to");
  setSesExtraRecipientValue("cc", draft.cc || draft.ccEmail || draft.cc_email || "");
  setSesExtraRecipientValue("bcc", draft.bcc || draft.bccEmail || draft.bcc_email || "");
  setComposeAttachments(draft.attachments || []);
  if (sesSubjectPrefix) sesSubjectPrefix.value = draft.subject || "";
  if (sesBodyText) sesBodyText.value = draft.bodyText || draft.body || stripSesHtml(draft.bodyHtml || draft.body_html || "");
  setRichEditorContent(draft.bodyHtml || draft.body_html || escapeHtml(draft.body || draft.bodyText || "").replace(/\n/g, "<br>"));
  if (sesFooter && (draft.signature || "").trim()) sesFooter.value = draft.signature || "";
  if (sesDraftDeleteBtn) sesDraftDeleteBtn.hidden = !sesCurrentDraftId;
  const title = document.querySelector(".ses-form [data-mail-compose-title]");
  const subtitle = document.querySelector(".ses-form [data-mail-compose-subtitle]");
  if (title) title.textContent = "Edit draft";
  if (subtitle) subtitle.textContent = "Continue your unfinished school email.";
  updateSesEmailPreview?.();
  setSesDraftStatus("");
  getComposeRichEditor()?.focus();
}

window.openSchoolMailDraft = openEmailDraftInCompose;

// ===== Gmail-ish Inbox (vanilla) =====
function initGmailishInbox() {
    const emailPanelEl = document.getElementById("emailPanel");
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
    let bulkSpamBtn = document.getElementById("btnBulkSpam");
    if (bulkEl && !bulkSpamBtn) {
      bulkSpamBtn = document.createElement("button");
      bulkSpamBtn.className = "btn-ghost";
      bulkSpamBtn.id = "btnBulkSpam";
      bulkSpamBtn.type = "button";
      bulkSpamBtn.textContent = "Put in spam";
      bulkDeleteBtn?.insertAdjacentElement("beforebegin", bulkSpamBtn);
    }
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

    function ensureMailDetailLayout() {
      if (!detailPanel) return;
      detailPanel.classList.add("mail-detail-page");
      const header = detailPanel.querySelector(".detail-header");
      if (header) header.classList.add("mail-detail-topbar");
      if (detailCloseBtn) {
        detailCloseBtn.classList.add("mail-detail-back");
        const label = detailCloseBtn.querySelector("span");
        if (label) label.textContent = "Back to Inbox";
      }
      if (detailView) detailView.classList.add("mail-detail-content");
      const head = detailView?.querySelector(".detail-head");
      if (head) {
        head.classList.add("mail-detail-card");
        let titleRow = head.querySelector(".mail-detail-title-row");
        if (!titleRow && dSubject) {
          titleRow = document.createElement("div");
          titleRow.className = "mail-detail-title-row";
          head.insertBefore(titleRow, head.firstChild);
          titleRow.appendChild(dSubject);
        }
        if (!head.querySelector(".mail-detail-badges")) {
          const badges = document.createElement("div");
          badges.className = "mail-detail-badges";
          (titleRow || head).appendChild(badges);
        } else if (titleRow && !titleRow.querySelector(".mail-detail-badges")) {
          titleRow.appendChild(head.querySelector(".mail-detail-badges"));
        }
        const meta = head.querySelector(".detail-meta");
        if (meta && !meta.querySelector(".mail-detail-avatar")) {
          const avatar = document.createElement("div");
          avatar.className = "mail-detail-avatar";
          avatar.setAttribute("aria-hidden", "true");
          meta.insertBefore(avatar, meta.firstChild);
        }
      }
      dSubject?.classList.add("mail-detail-subject");
      dFrom?.classList.add("mail-detail-sender");
      dDate?.classList.add("mail-detail-date");
      dBody?.classList.add("mail-detail-body-card");
      dAttach?.classList.add("mail-detail-attachments");
      detailReplies?.classList.add("mail-detail-thread");
      detailReplyPanel?.classList.add("mail-detail-reply-composer");
      if (detailActionsPanel && header && detailActionsPanel.parentElement !== header) {
        detailActionsPanel.classList.add("mail-detail-actions");
        header.appendChild(detailActionsPanel);
      }
      if (detailEmojiBtn) detailEmojiBtn.hidden = true;
      if (detailView && !detailView.querySelector(".mail-detail-quick-actions")) {
        const quickActions = document.createElement("div");
        quickActions.className = "mail-detail-quick-actions";
        quickActions.innerHTML = `
          <button class="mail-detail-quick-btn" type="button" data-mail-detail-quick="reply">
            <i class="fa-solid fa-arrow-rotate-left" aria-hidden="true"></i>
            Reply
          </button>
          <button class="mail-detail-quick-btn" type="button" data-mail-detail-quick="forward">
            <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
            Forward
          </button>
        `;
        const replyWrapper = detailView.querySelector(".detail-reply-wrapper");
        detailView.insertBefore(quickActions, replyWrapper || detailReplies || null);
        quickActions.querySelector('[data-mail-detail-quick="reply"]')?.addEventListener("click", (event) => {
          event.preventDefault();
          detailReplyBtn?.click();
        });
        quickActions.querySelector('[data-mail-detail-quick="forward"]')?.addEventListener("click", (event) => {
          event.preventDefault();
          detailForwardBtn?.click();
        });
      }
    }

    function escapeAttr(value = "") {
      return escapeHtml(String(value || "")).replace(/"/g, "&quot;");
    }

    function renderMailDetailBadges(mail = {}) {
      const head = detailView?.querySelector(".detail-head");
      const badges = head?.querySelector(".mail-detail-badges");
      if (!badges) return;
      const items = [];
      const folderLabel = currentFolder
        ? currentFolder.charAt(0).toUpperCase() + currentFolder.slice(1)
        : "Inbox";
      items.push([folderLabel, "folder"]);
      items.push(mail.is_read ? ["Read", "read"] : ["Unread", "unread"]);
      if (isMailImportant(mail)) items.push(["Important", "important"]);
      if (mail._starred) items.push(["Starred", "starred"]);
      if (mail.hasAttachments && Array.isArray(mail.attachments) && mail.attachments.length) {
        items.push([`${mail.attachments.length} attachment${mail.attachments.length === 1 ? "" : "s"}`, "attachments"]);
      }
      badges.innerHTML = items
        .map(([label, type]) => `<span class="mail-detail-badge mail-detail-badge--${type}">${escapeHtml(label)}</span>`)
        .join("");
    }

    function renderReplyBody(entry = {}) {
      const raw = String(entry.body || entry.text || entry.bodyText || "");
      if (!raw.trim()) return '<div class="mail-detail-reply-empty">No reply body available.</div>';
      const chunks = raw.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
      const signature = chunks.length > 1 ? chunks.pop() : "";
      const body = chunks.length ? chunks.join("\n\n") : raw;
      const signatureHtml = escapeHtml(signature).replace(/\n/g, "<br>");
      const signatureIsLong = signature.length > 260 || signature.split(/\n/).length > 4;
      return `
        <div class="mail-detail-reply-body">${escapeHtml(body).replace(/\n/g, "<br>")}</div>
        ${signature ? signatureIsLong
          ? `<details class="mail-detail-signature mail-detail-signature--collapsed"><summary>Show full signature</summary><div>${signatureHtml}</div></details>`
          : `<div class="mail-detail-signature">${signatureHtml}</div>`
        : ""}
      `;
    }

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
        .map((entry, index) => {
          return `
            <details class="detail-reply-thread mail-detail-reply-card" ${index === entries.length - 1 ? "open" : ""}>
              <summary class="detail-reply-thread-header">
                <span>Reply sent</span>
                <time>${formatReplyTimestamp(entry.created_at || entry.createdAt)}</time>
              </summary>
              <div class="mail-detail-reply-meta">
                ${entry.from || entry.sender ? `<span>From ${escapeHtml(entry.from || entry.sender)}</span>` : ""}
                ${entry.to || entry.recipient ? `<span>To ${escapeHtml(entry.to || entry.recipient)}</span>` : ""}
              </div>
              ${renderReplyBody(entry)}
            </details>
          `;
        })
        .join("");
    }
    ensureMailDetailLayout();
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
    let detailDeleteBtn = null;
    let detailRestoreBtn = null;
    let detailImportantBtn = null;
    if (detailActionsPanel && !document.getElementById("detailDeleteBtn")) {
      detailImportantBtn = document.createElement("button");
      detailImportantBtn.type = "button";
      detailImportantBtn.id = "detailImportantBtn";
      detailImportantBtn.className = "detail-action-btn mail-important-btn";
      detailImportantBtn.innerHTML = `<img class="mail-important-icon" src="${SCHOOL_MAIL_IMPORTANT_ICON_SRC}" alt="" aria-hidden="true"> Important`;
      detailDeleteBtn = document.createElement("button");
      detailDeleteBtn.type = "button";
      detailDeleteBtn.id = "detailDeleteBtn";
      detailDeleteBtn.className = "detail-action-btn detail-action-btn--delete";
      detailDeleteBtn.innerHTML = `<i class="fa-regular fa-trash-can" aria-hidden="true"></i> Delete`;
      detailRestoreBtn = document.createElement("button");
      detailRestoreBtn.type = "button";
      detailRestoreBtn.id = "detailRestoreBtn";
      detailRestoreBtn.className = "detail-action-btn detail-action-btn--restore";
      detailRestoreBtn.innerHTML = `<i class="fa-solid fa-arrow-rotate-left" aria-hidden="true"></i> Restore`;
      detailActionsPanel.append(detailImportantBtn, detailDeleteBtn, detailRestoreBtn);
    } else {
      detailImportantBtn = document.getElementById("detailImportantBtn");
      detailDeleteBtn = document.getElementById("detailDeleteBtn");
      detailRestoreBtn = document.getElementById("detailRestoreBtn");
    }
    ensureMailDetailLayout();
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
    let currentFilter = "all";
    let announcementLogRows = [];
    let announcementLogsLoaded = false;
    let announcementLogsLoadPromise = null;
    const MAIL_STARRED_STORAGE_KEY = "worknest_school_mail_starred_v1";
    const starredMailIds = new Set();

    function isMailDetailOpen() {
      return Boolean(activeId && mailboxEl?.classList.contains("detail-open") && !detailView?.hidden);
    }

    function closeMailMoreMenu() {
      const menu = document.getElementById("mailMoreMenu");
      const trigger = document.getElementById("btnMailHeaderMore");
      menu?.classList.add("hidden");
      trigger?.setAttribute("aria-expanded", "false");
    }

    function updateMailMoreMenuState() {
      const printItem = document.querySelector('[data-mail-more-action="print"]');
      if (!printItem) return;
      const enabled = isMailDetailOpen();
      printItem.disabled = !enabled;
      printItem.setAttribute("aria-disabled", enabled ? "false" : "true");
    }

    function ensureMailMoreMenu() {
      const trigger = document.getElementById("btnMailHeaderMore");
      if (!trigger || document.getElementById("mailMoreMenu")) return;
      const menu = document.createElement("div");
      menu.id = "mailMoreMenu";
      menu.className = "mail-more-menu hidden";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", "More mail actions");
      menu.innerHTML = `
        <button class="mail-more-item" type="button" role="menuitem" data-mail-more-action="mark-read">
          <i class="fa-solid fa-envelope-open-text" aria-hidden="true"></i>
          <span>Mark all as read</span>
        </button>
        <button class="mail-more-item" type="button" role="menuitem" data-mail-more-action="refresh">
          <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
          <span>Refresh mailbox</span>
        </button>
        <div class="mail-more-divider" role="separator"></div>
        <button class="mail-more-item" type="button" role="menuitem" data-mail-more-action="print">
          <i class="fa-solid fa-print" aria-hidden="true"></i>
          <span>Print current email</span>
        </button>
        <button class="mail-more-item" type="button" role="menuitem" data-mail-more-action="download" data-disabled="true" aria-disabled="true">
          <i class="fa-solid fa-download" aria-hidden="true"></i>
          <span>Download email</span>
        </button>
        <button class="mail-more-item" type="button" role="menuitem" data-mail-more-action="archive" data-disabled="true" aria-disabled="true">
          <i class="fa-solid fa-box-archive" aria-hidden="true"></i>
          <span>Archive</span>
        </button>
      `;
      trigger.insertAdjacentElement("afterend", menu);
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        updateMailMoreMenuState();
        const isOpen = !menu.classList.contains("hidden");
        menu.classList.toggle("hidden", isOpen);
        trigger.setAttribute("aria-expanded", isOpen ? "false" : "true");
      });
      menu.addEventListener("click", (event) => {
        const item = event.target.closest("[data-mail-more-action]");
        if (!item) return;
        event.preventDefault();
        event.stopPropagation();
        const action = item.dataset.mailMoreAction;
        if (item.disabled || item.dataset.disabled === "true") {
          showToast("Coming soon", "info");
          return;
        }
        closeMailMoreMenu();
        if (action === "mark-read") {
          markAllBtn?.click();
          return;
        }
        if (action === "refresh") {
          refreshBtn?.click();
          return;
        }
        if (action === "print") {
          if (isMailDetailOpen()) window.print();
          else showToast("Open an email first", "info");
        }
      });
      document.addEventListener("click", (event) => {
        if (menu.contains(event.target) || trigger.contains(event.target)) return;
        closeMailMoreMenu();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMailMoreMenu();
      });
    }

    function isDebugMailEnabled() {
      try {
        return localStorage.getItem("debugMail") === "1" || Boolean(window.SCHOOL_MAIL_DEBUG);
      } catch (_error) {
        return Boolean(window.SCHOOL_MAIL_DEBUG);
      }
    }

    function debugMail(label, value) {
      if (!isDebugMailEnabled()) return;
      console.debug("[SchoolMail]", label, value);
    }

    function normalizeMailboxResponse(payload) {
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload?.emails)) return payload.emails;
      if (Array.isArray(payload?.messages)) return payload.messages;
      if (Array.isArray(payload?.items)) return payload.items;
      if (Array.isArray(payload?.inbox)) return payload.inbox;
      if (Array.isArray(payload?.rows)) return payload.rows;
      if (Array.isArray(payload?.drafts)) return payload.drafts;
      if (Array.isArray(payload?.data)) return payload.data;
      if (Array.isArray(payload?.data?.emails)) return payload.data.emails;
      if (Array.isArray(payload?.data?.messages)) return payload.data.messages;
      if (Array.isArray(payload?.data?.items)) return payload.data.items;
      if (Array.isArray(payload?.data?.inbox)) return payload.data.inbox;
      if (Array.isArray(payload?.data?.rows)) return payload.data.rows;
      if (Array.isArray(payload?.data?.drafts)) return payload.data.drafts;
      if (Array.isArray(payload?.result?.emails)) return payload.result.emails;
      if (Array.isArray(payload?.result?.messages)) return payload.result.messages;
      if (Array.isArray(payload?.result?.items)) return payload.result.items;
      if (Array.isArray(payload?.result?.inbox)) return payload.result.inbox;
      if (Array.isArray(payload?.result?.rows)) return payload.result.rows;
      if (Array.isArray(payload?.result?.drafts)) return payload.result.drafts;
      return [];
    }

    function loadStarredMailIds() {
      try {
        const parsed = JSON.parse(localStorage.getItem(MAIL_STARRED_STORAGE_KEY) || "[]");
        if (Array.isArray(parsed)) {
          parsed.map((id) => String(id || "").trim()).filter(Boolean).forEach((id) => starredMailIds.add(id));
        }
      } catch (_error) {
        starredMailIds.clear();
      }
    }

    function saveStarredMailIds() {
      try {
        localStorage.setItem(MAIL_STARRED_STORAGE_KEY, JSON.stringify(Array.from(starredMailIds)));
      } catch (_error) {
        /* ignore storage failures */
      }
    }

    loadStarredMailIds();

    if (refreshBtn && !refreshBtn.dataset.mailIconified) {
      refreshBtn.dataset.mailIconified = "1";
      refreshBtn.innerHTML = `<i class="fa-solid fa-rotate-right" aria-hidden="true"></i>`;
      refreshBtn.setAttribute("aria-label", "Refresh");
      refreshBtn.title = "Refresh";
      const moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "btn-ghost mail-header-icon-btn";
      moreBtn.id = "btnMailHeaderMore";
      moreBtn.innerHTML = `<i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>`;
      moreBtn.setAttribute("aria-label", "More mail actions");
      moreBtn.setAttribute("aria-haspopup", "menu");
      moreBtn.setAttribute("aria-expanded", "false");
      moreBtn.title = "More";
      refreshBtn.insertAdjacentElement("afterend", moreBtn);
    }
    ensureMailMoreMenu();
    const selected = new Set();
    let mailboxBootstrapped = false;
    let mailboxRequestSeq = 0;
    let mailboxDataSignature = "";
    let mailboxPollTimer = null;
    let mailboxPollInFlight = false;
    let mailboxFailureCount = 0;

    function isElementActuallyVisible(element) {
      if (!element) return false;
      if (element.classList.contains("hidden")) return false;
      if (element.getAttribute("aria-hidden") === "true") return false;
      return element.offsetParent !== null;
    }

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

    function isSpamSelectionMode() {
      return currentFolder === "spam" && !!currentTrashAction;
    }

    function syncMailboxHeading() {
      if (titleEl) titleEl.textContent = currentFolder === "trash" ? "Trash" : currentFolder === "spam" ? "Spam" : currentFolder === "important" ? "Important" : currentFolder === "drafts" ? "Drafts" : "Inbox";
      if (iconEl) iconEl.textContent = currentFolder === "trash" ? "🗑️" : currentFolder === "spam" ? "⚠️" : currentFolder === "important" ? "❗" : currentFolder === "drafts" ? "📝" : "📥";
    }

    function updateMailboxModeUI() {
      const inTrash = currentFolder === "trash";
      const inSpam = currentFolder === "spam";
      const inImportant = currentFolder === "important";
      const inDrafts = currentFolder === "drafts";
      const selectingSpecial = isTrashSelectionMode() || isSpamSelectionMode();
      if (mailboxEl) {
        mailboxEl.classList.toggle("is-folder-trash", inTrash);
        mailboxEl.classList.toggle("is-folder-spam", inSpam);
      }
      if (markAllBtn) {
        markAllBtn.hidden = inTrash || inSpam || inImportant || inDrafts;
      }
      if (trashActionsEl) {
        trashActionsEl.hidden = !(inTrash || inSpam);
      }
      if (selectHeaderEl) {
        selectHeaderEl.hidden = inDrafts || (inSpam && !selectingSpecial);
      }
      if (selectAllEl && (inSpam && !selectingSpecial)) {
        selectAllEl.checked = false;
      }
      const filterChips = document.querySelector("#wnMailbox .mail-filter-chips");
      if (filterChips) {
        filterChips.hidden = inTrash;
      }
      if (trashRestoreBtn) {
        trashRestoreBtn.textContent = inSpam
          ? (currentTrashAction === "restore" ? "Confirm not spam" : "Not spam")
          : (currentTrashAction === "restore" ? "Confirm put back" : "Put back");
      }
      if (trashDeleteForeverBtn) {
        trashDeleteForeverBtn.textContent =
          currentTrashAction === "deleteForever" ? "Confirm delete forever" : "Delete forever";
      }
      if (trashEmptyBtn) {
        trashEmptyBtn.textContent = inSpam ? "Empty spam" : "Clean Trash";
      }
      if (trashCancelBtn) {
        trashCancelBtn.hidden = !selectingSpecial;
      }
      if (bulkEl) {
        bulkEl.hidden = inTrash || inSpam || inImportant || inDrafts || selected.size === 0;
      }
      document.querySelectorAll("[data-mail-filter]").forEach((button) => {
        const active = button.dataset.mailFilter === currentFilter;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
      const announcementActions = document.querySelector("#wnMailbox .mail-announcement-actions");
      if (announcementActions) {
        announcementActions.hidden = !(currentFolder === "inbox" && currentFilter === "announcements");
      }
    }

    function ensureMailboxFilterChips() {
      const toolbar = document.querySelector("#wnMailbox .mbx-toolbar");
      if (!toolbar || toolbar.querySelector(".mail-filter-chips")) return;
      if (selectHeaderEl && selectHeaderEl.parentElement !== toolbar) {
        toolbar.prepend(selectHeaderEl);
        selectHeaderEl.classList.add("mail-toolbar-select");
      }
      const chips = document.createElement("div");
      chips.className = "mail-filter-chips";
      chips.innerHTML = `
        <button type="button" class="mail-filter-chip is-active" data-mail-filter="all">All</button>
        <button type="button" class="mail-filter-chip" data-mail-filter="unread">Unread</button>
        <button type="button" class="mail-filter-chip" data-mail-filter="starred">Starred</button>
        <button type="button" class="mail-filter-chip" data-mail-filter="important">Important</button>
        <button type="button" class="mail-filter-chip" data-mail-filter="attachments">
          <i class="fa-solid fa-paperclip" aria-hidden="true"></i>
          Attachments
        </button>
      `;
      if (selectHeaderEl && selectHeaderEl.parentElement === toolbar) {
        selectHeaderEl.insertAdjacentElement("afterend", chips);
      } else {
        toolbar.prepend(chips);
      }
      chips.querySelectorAll("[data-mail-filter]").forEach((button) => {
        button.addEventListener("click", () => {
          setMailboxFilter(button.dataset.mailFilter || "all");
        });
      });

      const announcementActions = document.createElement("div");
      announcementActions.className = "mail-announcement-actions";
      announcementActions.hidden = true;
      announcementActions.innerHTML = `
        <button type="button" class="btn-ghost" data-mail-announcement-action="create">
          <i class="fa-solid fa-bullhorn" aria-hidden="true"></i>
          Create announcement
        </button>
        <button type="button" class="btn-ghost" data-mail-announcement-action="compose">
          <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
          Compose announcement email
        </button>
      `;
      toolbar.appendChild(announcementActions);
      announcementActions
        .querySelector('[data-mail-announcement-action="create"]')
        ?.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openExistingAnnouncementComposer();
        });
      announcementActions
        .querySelector('[data-mail-announcement-action="compose"]')
        ?.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openAnnouncementEmailCompose();
        });
    }

    function findCurrentAnnouncementChannel() {
      const list = Array.isArray(channels) ? channels : [];
      return (
        list.find((channel) => typeof isAnnouncementChannel === "function" && isAnnouncementChannel(channel)) ||
        list.find((channel) => String(channel?.name || "").trim().toLowerCase() === "announcements") ||
        list.find((channel) => String(channel?.id || "").trim().toLowerCase().includes("announc")) ||
        null
      );
    }

    async function openExistingAnnouncementComposer() {
      const channel = findCurrentAnnouncementChannel();
      if (!channel?.id) {
        showToast("No announcement channel found.");
        return;
      }
      try {
        if (typeof selectChannel === "function") {
          await selectChannel(channel.id);
        } else {
          showPanel?.("chatPanel");
        }
        requestAnimationFrame(() => {
          const plus = document.getElementById("announcementsPlusBtn");
          if (plus) {
            plus.click();
            return;
          }
          const popup = document.getElementById("announcementsPopup");
          if (popup) popup.hidden = false;
        });
      } catch (error) {
        console.error("Failed to open announcement composer", error);
        showToast("No announcement channel found.");
      }
    }

    function openAnnouncementEmailCompose() {
      setSesSettingsView("sent");
      resetSesDraftState({ clearFields: true });
      if (sesSubjectPrefix) {
        sesSubjectPrefix.value = "Announcement: ";
        sesSubjectPrefix.focus();
        try {
          sesSubjectPrefix.setSelectionRange(sesSubjectPrefix.value.length, sesSubjectPrefix.value.length);
        } catch {}
      }
      if (sesBodyText) {
        sesBodyText.value = "";
        setRichEditorContent("");
      }
      updateSesEmailPreview?.();
    }

    function addAnnouncementEmptyStateActions() {
      if (!(currentFolder === "inbox" && currentFilter === "announcements")) return;
      if (!listEl || listEl.querySelector(".mail-announcement-empty-actions")) return;
      const actions = document.createElement("div");
      actions.className = "mail-announcement-empty-actions";
      actions.innerHTML = `
        <button type="button" class="btn-ghost" data-mail-announcement-action="create-empty">
          <i class="fa-solid fa-bullhorn" aria-hidden="true"></i>
          Create announcement
        </button>
        <button type="button" class="btn-ghost" data-mail-announcement-action="compose-empty">
          <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
          Compose announcement email
        </button>
      `;
      listEl.querySelector(".ui-state-copy")?.appendChild(actions);
      actions
        .querySelector('[data-mail-announcement-action="create-empty"]')
        ?.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openExistingAnnouncementComposer();
        });
      actions
        .querySelector('[data-mail-announcement-action="compose-empty"]')
        ?.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openAnnouncementEmailCompose();
        });
    }

    function normalizeMailboxFilterName(filter = "all") {
      return [
        "all",
        "unread",
        "starred",
        "important",
        "attachments",
        "announcements",
        "students",
        "teachers",
        "system",
        "spam"
      ].includes(filter) ? filter : "all";
    }

    function setMailboxFilter(filter = "all") {
      const previousFilter = currentFilter;
      currentFilter = normalizeMailboxFilterName(filter);
      if (previousFilter !== currentFilter) {
        activeId = null;
        renderDetail(null);
        exitDetailView();
      }
      updateMailboxModeUI();
      applySearch();
      if (currentFolder === "inbox" && currentFilter === "announcements") {
        ensureAnnouncementEmailLogRows()
          .then(() => {
            if (currentFolder === "inbox" && currentFilter === "announcements") {
              applySearch();
            }
          })
          .catch((error) => console.warn("Failed to load announcement email logs", error));
      }
    }

    function resetTrashSelectionMode() {
      currentTrashAction = null;
      selected.clear();
      if (selectAllEl) selectAllEl.checked = false;
      updateMailboxModeUI();
    }

    function normalizeMailboxFolderName(folder = currentFolder) {
      const normalized = String(folder || "").trim().toLowerCase();
      if (normalized === "trash") return "trash";
      if (normalized === "spam" || normalized === "junk") return "spam";
      if (normalized === "important") return "important";
      if (normalized === "drafts" || normalized === "draft") return "drafts";
      return "inbox";
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

    function formatMailboxRecipients(value) {
      return parseEmailRecipients(value).join(", ");
    }

    function getMailboxTextBlob(mail = {}) {
      return [
        mail.from_name,
        mail.from_email,
        mail.to_name,
        mail.to_email,
        mail.toEmail,
        mail.sender,
        mail.recipient,
        mail.subject,
        mail.preview,
        mail.body,
        mail.bodyText,
        mail.text_body,
        mail.html_body,
        mail.template_key,
        mail.templateKey,
        mail.template_type,
        mail.templateType,
        mail.template_category,
        mail.templateCategory,
        mail.category,
        mail.type,
        mail.status,
        mail.folder
      ]
        .map((value) => String(value || "").replace(/<[^>]*>/g, " "))
        .join(" ")
        .replace(/\s+/g, " ")
        .toLowerCase();
    }

    function getMailboxRoleBlob(mail = {}) {
      return [
        mail.sender_role,
        mail.senderRole,
        mail.from_role,
        mail.fromRole,
        mail.recipient_role,
        mail.recipientRole,
        mail.to_role,
        mail.toRole,
        mail.role
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
    }

    function hasMailboxTerms(mail, terms) {
      const blob = getMailboxTextBlob(mail);
      return terms.some((term) => blob.includes(term));
    }

    function isStudentMail(mail) {
      const roles = getMailboxRoleBlob(mail);
      return roles.includes("student") || hasMailboxTerms(mail, [
        "student",
        "learner",
        "homework",
        "submission",
        "attendance",
        "certificate",
        "grade",
        "progress"
      ]);
    }

    function isTeacherMail(mail) {
      const roles = getMailboxRoleBlob(mail);
      return roles.includes("teacher") || hasMailboxTerms(mail, [
        "teacher",
        "instructor",
        "class reminder",
        "teacher invite",
        "assignment review",
        "attendance report"
      ]);
    }

    function isAnnouncementMail(mail) {
      return isAnnouncementEmailRecord(mail) || hasMailboxTerms(mail, [
        "announcement",
        "announcements",
        "notice",
        "course notice",
        "exam notice",
        "class notice",
        "school notice",
        "schedule",
        "event",
        "holiday",
        "course enrollment",
        "exam schedule",
        "school update",
        "campus update",
        "bulletin"
      ]);
    }

    function isSystemMail(mail) {
      return hasMailboxTerms(mail, [
        "otp",
        "password reset",
        "verification",
        "registration",
        "invoice",
        "payment",
        "receipt",
        "live session",
        "no-reply",
        "noreply",
        "system",
        "automated"
      ]);
    }

    function isSpamMail(mail = {}) {
      const explicit = [
        mail.is_spam,
        mail.spam,
        mail.is_junk,
        mail.junk
      ].some((value) => value === true || Number(value) === 1 || String(value).toLowerCase() === "true");
      const status = String(mail.spam_status || mail.spamStatus || "").toLowerCase();
      return explicit || status === "spam" || status === "suspected" || hasMailboxTerms(mail, ["spam", "junk"]);
    }

    function isMailImportant(mail = {}) {
      return [mail.is_important, mail.isImportant, mail.important]
        .some((value) => value === true || Number(value) === 1 || String(value).toLowerCase() === "true");
    }

    function setMailImportantState(emailId, important) {
      const id = String(emailId || "");
      const apply = (mail) => {
        if (!mail || String(mail.id) !== id) return mail;
        mail.is_important = important ? 1 : 0;
        mail.isImportant = !!important;
        mail.important = !!important;
        mail.important_at = important ? (mail.important_at || new Date().toISOString()) : "";
        return mail;
      };
      inbox.forEach(apply);
      filtered.forEach(apply);
      if (sesInboxActiveMessage && String(sesInboxActiveMessage.id) === id) {
        apply(sesInboxActiveMessage);
      }
    }

    async function toggleMailImportant(mail) {
      if (!mail?.id) return;
      const nextImportant = !isMailImportant(mail);
      const response = await fetch(`/api/admin/inbox/${encodeURIComponent(mail.id)}/important`, {
        method: nextImportant ? "POST" : "DELETE",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken()
        },
        body: nextImportant ? JSON.stringify({}) : undefined
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Important update failed");
      setMailImportantState(mail.id, nextImportant);
      if (!nextImportant && currentFolder === "important") {
        inbox = inbox.filter((item) => String(item.id) !== String(mail.id));
        filtered = filtered.filter((item) => String(item.id) !== String(mail.id));
        if (activeId && String(activeId) === String(mail.id)) {
          activeId = null;
          renderDetail(null);
          exitDetailView();
        }
      }
      applySearch();
      updateBulkUI();
      showToast(nextImportant ? "Marked important" : "Unmarked important", "success");
    }

    function matchesMailboxFilter(mail) {
      if (currentFolder === "spam" && currentFilter === "all") return true;
      if (currentFolder === "important" && currentFilter === "all") return true;
      if (currentFolder === "drafts" && currentFilter === "all") return true;
      switch (currentFilter) {
        case "unread":
          return !mail.is_read;
        case "starred":
          return Boolean(mail._starred);
        case "important":
          return isMailImportant(mail);
        case "attachments":
          return Boolean(mail.hasAttachments);
        case "announcements":
          return isAnnouncementMail(mail);
        case "students":
          return isStudentMail(mail);
        case "teachers":
          return isTeacherMail(mail);
        case "system":
          return isSystemMail(mail);
        case "spam":
          return isSpamMail(mail);
        case "all":
        default:
          return !isSpamMail(mail);
      }
    }

    function getMailboxEmptyMessage() {
      if (currentFilter === "all") {
        if (currentFolder === "spam") return "No spam found.";
        if (currentFolder === "trash") return "Trash is empty.";
        if (currentFolder === "important") return "No important emails yet.";
        if (currentFolder === "drafts") return "No drafts yet.";
      }
      switch (currentFilter) {
        case "students":
          return "No student messages yet.";
        case "teachers":
          return "No teacher messages yet.";
        case "announcements":
          return "No announcement emails yet.\nCreate an announcement from the Announcements channel or send one by email.";
        case "system":
          return "No system emails yet.";
        case "spam":
          return "No spam found.";
        case "starred":
          return "No starred messages yet.";
        case "important":
          return currentFolder === "important"
            ? "No important emails yet."
            : "No important messages yet.";
        case "all":
          return "No messages in this folder yet.";
        case "unread":
          return "No unread messages.";
        case "attachments":
          return "No messages with attachments.";
        default:
          return "No messages in this folder yet.";
      }
    }

    function getMailboxFolderCounts(rows = []) {
      const source = Array.isArray(rows) ? rows : [];
      return {
        announcements: source.filter(isAnnouncementMail).length,
        students: source.filter(isStudentMail).length,
        teachers: source.filter(isTeacherMail).length,
        system: source.filter(isSystemMail).length,
        spam: source.filter(isSpamMail).length,
        important: source.filter(isMailImportant).length,
        starred: source.filter((mail) => Boolean(mail?._starred)).length
      };
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

    function mapAnnouncementLogToMailboxRow(log = {}) {
      const recipient = log.toName || log.toEmail || "recipient";
      return {
        ...log,
        id: `sent-log:${log.id}`,
        originalLogId: log.id,
        mailSource: "sent-log",
        from_name: `Sent to ${recipient}`,
        from_email: log.toEmail || "",
        to_name: log.toName || "",
        to_email: log.toEmail || "",
        subject: log.subject || "(no subject)",
        preview: log.status ? `Sent email log: ${log.status}` : "Sent email log",
        received_at: log.createdAt || log.created_at,
        is_read: true,
        hasAttachments: false,
        attachments: [],
        replies: [],
        category: log.category || log.type || "announcement"
      };
    }

    async function ensureAnnouncementEmailLogRows({ force = false } = {}) {
      if (announcementLogsLoaded && !force) return announcementLogRows;
      if (announcementLogsLoadPromise) return announcementLogsLoadPromise;
      announcementLogsLoadPromise = (async () => {
        if (!Array.isArray(sesEmailLogs) || !sesEmailLogs.length || force) {
          const ws = await resolveProfileWorkspaceId();
          if (ws) {
            const payload = await fetchJSON(`/api/workspaces/${encodeURIComponent(ws)}/email-logs?limit=100`, {
              headers: {}
            });
            sesEmailLogs = Array.isArray(payload?.logs) ? payload.logs : [];
            updateMailSidebarCounts({ sent: sesEmailLogs.length });
          }
        }
        announcementLogRows = (Array.isArray(sesEmailLogs) ? sesEmailLogs : [])
          .filter(isAnnouncementEmailRecord)
          .map(mapAnnouncementLogToMailboxRow);
        announcementLogsLoaded = true;
        return announcementLogRows;
      })().finally(() => {
        announcementLogsLoadPromise = null;
      });
      return announcementLogsLoadPromise;
    }

    function attachmentChipLabel(att) {
      const name = att.filename || att.name || "attachment";
      const ext = (name.split(".").pop() || "").toUpperCase();
      const size = att.size ? bytesToSize(att.size) : "";
      if (ext && ext !== name.toUpperCase()) return `${ext}${size ? " • " + size : ""}`;
      return `${name}${size ? " • " + size : ""}`;
    }

    function buildRow(mail) {
      const isDraft = currentFolder === "drafts" || String(mail.status || "").toLowerCase() === "draft";
      const isSentLog = mail.mailSource === "sent-log";
      const isUnread = !isDraft && !mail.is_read;
      const isActive = mail.id === activeId;
      const fromLabel = isDraft
        ? (mail.toEmail || mail.to_email || "(no recipient)")
        : (mail.from_name || mail.from_email || "(unknown)");
      const subj = mail.subject || "(no subject)";
      const snip = mail.preview || "";
      const date = fmtDate(isDraft ? (mail.updatedAt || mail.updated_at || mail.createdAt || mail.created_at) : mail.received_at);
      const hasAttachments = !isDraft && Boolean(mail.hasAttachments && Array.isArray(mail.attachments) && mail.attachments.length);
      const isImportant = !isDraft && isMailImportant(mail);
      const isStarred = !isDraft && Boolean(mail._starred);

      const row = document.createElement("div");
      row.className = `mbx-row ${isUnread ? "is-unread" : ""} ${isActive ? "is-active" : ""} ${isImportant ? "mail-row-important" : ""}`;
      row.dataset.id = mail.id;

    const chk = document.createElement("div");
    chk.className = "row-check";
    if (isDraft || isSentLog || (currentFolder === "spam" && !isSpamSelectionMode())) {
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

      const previewLine = document.createElement("div");
      previewLine.className = "mail-row-preview";
      previewLine.appendChild(subject);
      previewLine.appendChild(snippet);

      const dateEl = document.createElement("div");
      dateEl.className = "date";
      dateEl.textContent = date;

    row.appendChild(chk);
    const starBtn = document.createElement("button");
    starBtn.className = `row-star-btn ${isStarred ? "is-starred" : ""}`;
    starBtn.type = "button";
    starBtn.setAttribute("aria-pressed", String(isStarred));
    starBtn.title = isStarred ? "Unstar this message" : "Star this message";
    starBtn.innerHTML = `<i class="${isStarred ? "fa-solid" : "fa-regular"} fa-star" aria-hidden="true"></i>`;
    starBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const isStarred = starBtn.classList.toggle("is-starred");
      mail._starred = isStarred;
      if (isStarred) starredMailIds.add(String(mail.id));
      else starredMailIds.delete(String(mail.id));
      saveStarredMailIds();
      starBtn.setAttribute("aria-pressed", String(isStarred));
      starBtn.title = isStarred ? "Unstar this message" : "Star this message";
      const icon = starBtn.querySelector("i");
      if (icon) {
        icon.className = isStarred ? "fa-solid fa-star" : "fa-regular fa-star";
      }
      if (currentFilter === "starred") applySearch();
      else renderList();
    });
    if (!isDraft && !isSentLog) row.appendChild(starBtn);
    const importantBtn = document.createElement("button");
    importantBtn.className = `mail-important-btn ${isImportant ? "is-active" : ""}`;
    importantBtn.type = "button";
    importantBtn.setAttribute("aria-pressed", String(isImportant));
    importantBtn.title = isImportant ? "Unmark important" : "Important";
    importantBtn.innerHTML = `<img class="mail-important-icon" src="${SCHOOL_MAIL_IMPORTANT_ICON_SRC}" alt="" aria-hidden="true">`;
    importantBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        await toggleMailImportant(mail);
      } catch (error) {
        showToast(error.message || "Important update failed", "error");
      }
    });
    if (!isDraft && !isSentLog) row.appendChild(importantBtn);
    if (currentFolder === "spam") {
      const notSpamBtn = document.createElement("button");
      notSpamBtn.className = "row-star-btn";
      notSpamBtn.type = "button";
      notSpamBtn.title = "Not spam";
      notSpamBtn.setAttribute("aria-label", "Not spam");
      notSpamBtn.innerHTML = `<i class="fa-solid fa-shield-halved" aria-hidden="true"></i>`;
      notSpamBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        selected.clear();
        selected.add(mail.id);
        currentTrashAction = "restore";
        try {
          await restoreSelectedSpamMessages();
        } catch (error) {
          showToast(error.message || "Not spam failed", "error");
        }
      });
      const deleteForeverBtn = document.createElement("button");
      deleteForeverBtn.className = "row-star-btn";
      deleteForeverBtn.type = "button";
      deleteForeverBtn.title = "Delete forever";
      deleteForeverBtn.setAttribute("aria-label", "Delete forever");
      deleteForeverBtn.innerHTML = `<i class="fa-regular fa-trash-can" aria-hidden="true"></i>`;
      deleteForeverBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        selected.clear();
        selected.add(mail.id);
        currentTrashAction = "deleteForever";
        try {
          await deleteSpamForever();
        } catch (error) {
          showToast(error.message || "Delete forever failed", "error");
        }
      });
      row.append(notSpamBtn, deleteForeverBtn);
    }
    row.appendChild(from);
      row.appendChild(previewLine);
      row.appendChild(dateEl);
      const tagEl = document.createElement("span");
      tagEl.className = `mail-row-tag ${isUnread ? "is-unread" : ""}`;
      tagEl.textContent = hasAttachments ? "Attachment" : "";
      if (!tagEl.textContent) tagEl.hidden = true;
      row.appendChild(tagEl);
      if (isDraft && (mail.authorName || mail.authorEmail)) {
        tagEl.hidden = false;
        tagEl.textContent = mail.authorName || mail.authorEmail;
      }

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

      row.addEventListener("click", () => {
        if (isDraft) {
          window.openSchoolMailDraft?.(mail);
          return;
        }
        if (isSentLog) {
          openSentLogMail(mail);
          return;
        }
        openMail(mail.id);
      });
      return row;
    }

    function getVisibleMailboxListElement() {
      const candidates = Array.from(document.querySelectorAll(
        "#schoolMailShell .mail-main .mbx-list, #schoolMailShell #inboxList, .mail-main .mbx-list, #inboxList, .mbx-list"
      ));
      return candidates.find((candidate) => {
        if (!candidate || !candidate.isConnected) return false;
        if (candidate.closest("[hidden]")) return false;
        if (candidate.closest(".hidden") && !candidate.closest("#sesInboxPanel")) return false;
        return true;
      }) || listEl;
    }

    function ensureMailboxListVisible(targetListEl = getVisibleMailboxListElement()) {
      sesInboxPanel?.classList.remove("hidden");
      if (sesInboxPanel) sesInboxPanel.hidden = false;
      const body = document.getElementById("mbxBody");
      body?.classList.remove("hidden");
      if (body) body.hidden = false;
      const mailbox = mailboxEl || document.querySelector(".mailbox");
      if (!activeId) mailbox?.classList.remove("detail-open");
      targetListEl?.classList.remove("hidden");
      if (targetListEl) targetListEl.hidden = false;
      return targetListEl || listEl;
    }

    function logMailboxRenderDebug(rowsInput, filteredRows, targetListEl) {
      const listStyles = targetListEl ? getComputedStyle(targetListEl) : null;
      console.log("[MAIL DEBUG]", {
        rowsInputCount: rowsInput?.length,
        filteredCount: filteredRows?.length,
        listEl: targetListEl?.id || targetListEl?.className,
        listChildren: targetListEl?.children?.length,
        listHTML: targetListEl?.innerHTML?.slice(0, 300),
        mailboxClass: document.querySelector(".mailbox")?.className,
        listRect: targetListEl?.getBoundingClientRect?.(),
        listDisplay: listStyles?.display,
        listVisibility: listStyles?.visibility,
        listOpacity: listStyles?.opacity
      });
    }

    function renderList() {
      const targetListEl = ensureMailboxListVisible();
      if (!activeId && mailboxEl?.classList.contains("detail-open")) {
        exitDetailView();
      }
      if (targetListEl !== listEl) {
        listEl.innerHTML = "";
      }
      targetListEl.innerHTML = "";
      countEl.textContent = String(filtered.length);
      const mailboxCounts = getMailboxFolderCounts(inbox);
      const announcementEmailCount = mailboxCounts.announcements + countAnnouncementEmailRecords(sesEmailLogs);
      updateMailSidebarCounts({
      inbox: currentFolder === "inbox" ? inbox.length : undefined,
      trash: currentFolder === "trash" ? inbox.length : undefined,
      unread: inbox.filter((mail) => !mail.is_read).length,
        ...mailboxCounts,
        announcements: announcementEmailCount,
        spam: currentFolder === "spam" ? inbox.length : mailboxCounts.spam,
        important: currentFolder === "important" ? inbox.length : mailboxCounts.important,
        drafts: currentFolder === "drafts" ? inbox.length : undefined
      });
      updateMailboxModeUI();

      if (!filtered.length) {
        if (inbox.length && currentFilter === "all") {
          filtered = [...inbox];
          return renderList();
        }
        renderUiState(targetListEl, {
          message: getMailboxEmptyMessage()
        });
        addAnnouncementEmptyStateActions();
        logMailboxRenderDebug(inbox, filtered, targetListEl);
        debugMail("render target", {
          listElFound: !!targetListEl,
          rawCount: inbox.length,
          filteredCount: filtered.length,
          folder: currentFolder,
          filter: currentFilter,
          listHidden: targetListEl?.classList.contains("hidden"),
          mailboxDetailOpen: mailboxEl?.classList.contains("detail-open")
        });
        return;
      }

      const frag = document.createDocumentFragment();
      filtered.forEach((m) => {
        try {
          frag.appendChild(buildRow(m));
        } catch (error) {
          console.error("Failed to render mailbox row", { error, mail: m });
          frag.appendChild(buildFallbackMailboxRow(m));
        }
      });
      targetListEl.appendChild(frag);
      if (!targetListEl.children.length && filtered.length) {
        filtered.forEach((m) => targetListEl.appendChild(buildFallbackMailboxRow(m)));
      }
      logMailboxRenderDebug(inbox, filtered, targetListEl);
      debugMail("render target", {
        listElFound: !!targetListEl,
        rawCount: inbox.length,
        filteredCount: filtered.length,
        folder: currentFolder,
        filter: currentFilter,
        listHidden: targetListEl?.classList.contains("hidden"),
        mailboxDetailOpen: mailboxEl?.classList.contains("detail-open")
      });
      debugSchoolMailState({ event: "renderList" });
    }

    function buildFallbackMailboxRow(mail = {}) {
      const row = document.createElement("div");
      row.className = `mbx-row wn-mail-row ${mail.is_read ? "" : "is-unread"}`;
      row.dataset.id = mail.id || "";
      const from = mail.from_name || mail.from_email || mail.sender || mail.toEmail || mail.to_email || "(unknown)";
      const subject = mail.subject || "(no subject)";
      const preview = mail.preview || mail.text_body || mail.bodyText || mail.body || "";
      const date = fmtDate(mail.received_at || mail.updatedAt || mail.updated_at || mail.createdAt || mail.created_at);
      row.innerHTML = `
        <div class="row-check"></div>
        <button class="row-star-btn" type="button" aria-label="Star message"><i class="fa-regular fa-star" aria-hidden="true"></i></button>
        <button class="mail-important-btn" type="button" aria-label="Important"><img class="mail-important-icon" src="${SCHOOL_MAIL_IMPORTANT_ICON_SRC}" alt="" aria-hidden="true"></button>
        <div class="from"></div>
        <div class="mail-row-preview"><div class="subject"></div><div class="snip"></div></div>
        <div class="date"></div>
      `;
      row.querySelector(".from").textContent = safeText(from);
      row.querySelector(".subject").textContent = safeText(subject);
      row.querySelector(".snip").textContent = safeText(preview);
      row.querySelector(".date").textContent = date;
      row.addEventListener("click", () => {
        if (currentFolder === "drafts") {
          window.openSchoolMailDraft?.(mail);
          return;
        }
        openMail(mail.id);
      });
      return row;
    }

    function enterDetailView() {
      if (detailPanel) {
        detailPanel.classList.remove("hidden");
        detailPanel.classList.remove("no-selection");
        detailPanel.hidden = false;
      }
      if (inboxListEl) {
        inboxListEl.classList.add("hidden");
        inboxListEl.hidden = false;
      }
      if (mailboxEl) mailboxEl.classList.add("detail-open");
    }

    function exitDetailView() {
      if (detailPanel) {
        detailPanel.classList.add("hidden");
        detailPanel.classList.add("no-selection");
      }
      if (inboxListEl) {
        inboxListEl.classList.remove("hidden");
        inboxListEl.hidden = false;
      }
      const mailbox = mailboxEl || document.querySelector(".mailbox");
      mailbox?.classList.remove("detail-open");
    }

    function openMailboxListView() {
      activeId = null;
      sesInboxActiveMessage = null;
      renderDetail(null);
      exitDetailView();
      const mailbox = mailboxEl || document.querySelector(".mailbox");
      mailbox?.classList.remove("detail-open");
      inboxListEl?.classList.remove("hidden");
      if (inboxListEl) inboxListEl.hidden = false;
      listEl?.classList.remove("hidden");
      if (listEl) listEl.hidden = false;
      const body = document.getElementById("mbxBody");
      body?.classList.remove("hidden");
      if (body) body.hidden = false;
    }

    function renderDetail(mail) {
      if (!mail) {
        if (detailPanel) detailPanel.classList.add("no-selection");
        detailEmpty?.querySelector(".detail-empty-title") && (detailEmpty.querySelector(".detail-empty-title").textContent = "Select a message");
        detailEmpty?.querySelector(".detail-empty-sub") && (detailEmpty.querySelector(".detail-empty-sub").textContent = "Read, reply, restore, or manage selected email here.");
        detailEmpty.hidden = false;
        detailView.hidden = true;
        sesInboxActiveMessage = null;
        updateReplyGreeting("");
        renderDetailReplies(null);
        if (detailActionsPanel) {
          detailActionsPanel.classList.add("hidden");
        }
        if (detailImportantBtn) detailImportantBtn.hidden = true;
        if (detailDeleteBtn) detailDeleteBtn.hidden = true;
        if (detailRestoreBtn) detailRestoreBtn.hidden = true;
        return;
      }

      if (detailPanel) detailPanel.classList.remove("no-selection");
      detailEmpty.hidden = true;
      detailView.hidden = false;
      ensureMailDetailLayout();

      const isReadOnlySentLog = mail.mailSource === "sent-log";
      const subjectText = mail.subject || "(no subject)";
      const senderName = isReadOnlySentLog
        ? (mail.to_name || mail.toName || "Recipient")
        : (mail.from_name || mail.fromName || mail.sender || "Unknown sender");
      const senderEmail = isReadOnlySentLog
        ? (mail.toEmail || mail.to_email || mail.from_email || "")
        : (mail.from_email || mail.fromEmail || getInboxSenderEmail(mail) || "");
      const receivedDate = new Date(mail.received_at || mail.createdAt || mail.created_at);
      const receivedDateLabel = Number.isNaN(receivedDate.getTime()) ? "" : receivedDate.toLocaleString();
      const toEmail = formatMailboxRecipients(mail.toEmail || mail.to_email || mail.recipient || mail.recipientEmail || "");
      const ccEmail = formatMailboxRecipients(mail.cc || mail.ccEmail || mail.cc_email || "");
      const bccEmail = formatMailboxRecipients(mail.bcc || mail.bccEmail || mail.bcc_email || "");
      const canSeeBcc = isAdminUser() || String(mail.sent_by_user_id || mail.sentByUserId || mail.author_user_id || mail.authorUserId || "") === String(sessionUser?.id || "");
      const hasMetaDetails = Boolean(toEmail || ccEmail || (canSeeBcc && bccEmail) || receivedDateLabel);
      const metaDetailsHtml = hasMetaDetails ? `
        <details class="mail-detail-recipient-meta">
          <summary>details</summary>
          <div class="mail-detail-recipient-meta-grid">
            ${toEmail ? `<span>To:</span><strong>${escapeHtml(toEmail)}</strong>` : ""}
            ${ccEmail ? `<span>Cc:</span><strong>${escapeHtml(ccEmail)}</strong>` : ""}
            ${canSeeBcc && bccEmail ? `<span>Bcc:</span><strong>${escapeHtml(bccEmail)}</strong>` : ""}
            ${receivedDateLabel ? `<span>Date:</span><strong>${escapeHtml(receivedDateLabel)}</strong>` : ""}
          </div>
        </details>
      ` : "";
      dSubject.textContent = subjectText;
      dFrom.innerHTML = `
        <span class="mail-detail-sender-name">${escapeHtml(senderName)}</span>
        ${senderEmail ? `<span class="mail-detail-sender-email">&lt;${escapeHtml(senderEmail)}&gt;</span>` : ""}
        ${metaDetailsHtml}
      `;
      const senderAvatar = detailView?.querySelector(".mail-detail-avatar");
      if (senderAvatar) {
        senderAvatar.textContent = initials(senderName || senderEmail);
        senderAvatar.title = senderName || senderEmail || "Sender";
      }
      dDate.textContent = receivedDateLabel;
      renderMailDetailBadges(mail);

      sesInboxActiveMessage = mail;
      updateReplyGreeting(mail.from_name || mail.from_email || mail.sender || "");
      if (detailActionsPanel) {
        detailActionsPanel.classList.toggle("hidden", isReadOnlySentLog || !canManageSchoolMailbox());
      }
      detailView?.querySelector(".mail-detail-quick-actions")?.classList.toggle("hidden", isReadOnlySentLog);
      if (detailImportantBtn) {
        const important = isMailImportant(mail);
        detailImportantBtn.hidden = isReadOnlySentLog || !canManageSchoolMailbox();
        detailImportantBtn.classList.toggle("is-active", important);
        detailImportantBtn.setAttribute("aria-pressed", String(important));
        detailImportantBtn.innerHTML = important
          ? `<img class="mail-important-icon" src="${SCHOOL_MAIL_IMPORTANT_ICON_SRC}" alt="" aria-hidden="true"> Unmark important`
          : `<img class="mail-important-icon" src="${SCHOOL_MAIL_IMPORTANT_ICON_SRC}" alt="" aria-hidden="true"> Important`;
      }
      if (detailDeleteBtn) {
        detailDeleteBtn.hidden = isReadOnlySentLog || !canManageSchoolMailbox();
        detailDeleteBtn.innerHTML = currentFolder === "trash" || currentFolder === "spam"
          ? `<i class="fa-regular fa-trash-can" aria-hidden="true"></i> Delete forever`
          : `<i class="fa-regular fa-trash-can" aria-hidden="true"></i> Delete`;
      }
      if (detailRestoreBtn) {
        detailRestoreBtn.hidden = isReadOnlySentLog || !canManageSchoolMailbox() || !["trash", "spam"].includes(currentFolder);
        detailRestoreBtn.innerHTML = currentFolder === "spam"
          ? `<i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Not spam`
          : `<i class="fa-solid fa-arrow-rotate-left" aria-hidden="true"></i> Restore`;
      }

      const bodyHtml = mail.html_body || "";
      if (bodyHtml) {
        dBody.innerHTML = sanitizeMessageHTML(replaceCidSources(bodyHtml, mail)); // backend stores sanitized inbound HTML; keep frontend defensive too
      } else {
        const textBody = mail.text_body || mail.bodyText || mail.body || mail.preview || "";
        dBody.innerHTML = textBody
          ? escapeHtml(textBody).replace(/\n/g, "<br>")
          : '<div class="mail-detail-empty-body">No email body available.</div>';
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
                  ${viewable ? `<a href="${viewHref}" target="_blank" rel="noopener" title="View"><i class="fa-solid fa-eye"></i><span>View</span></a>` : ""}
                  <a href="${dlHref}" target="_blank" rel="noopener" title="Download"><i class="fa-solid fa-download"></i><span>Download</span></a>
                </div>
              </div>
              <div class="att-preview-meta">
                <div class="att-file-name" title="${escapeAttr(name)}">${escapeHtml(name)}</div>
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
      }
      renderDetailReplies(mail);
    }

    function openMail(id) {
      activeId = id;

      const m = inbox.find((x) => String(x.id) === String(id));
      if (m) m.is_read = true;

      enterDetailView();
      renderList();
      renderDetail(m);
    }

    async function openSentLogMail(mail) {
      if (!mail?.id) return;
      activeId = mail.id;
      enterDetailView();
      renderList();
      renderDetail({
        ...mail,
        preview: "Loading sent email..."
      });
      try {
        const ws = await resolveProfileWorkspaceId();
        const logId = mail.originalLogId || String(mail.id).replace(/^sent-log:/, "");
        if (!ws || !logId) return;
        const payload = await fetchJSON(
          `/api/workspaces/${encodeURIComponent(ws)}/email-logs/${encodeURIComponent(logId)}`,
          { headers: {} }
        );
        const log = payload?.log || {};
        const hydrated = {
          ...mail,
          ...log,
          id: mail.id,
          originalLogId: log.id || logId,
          mailSource: "sent-log",
          from_name: mail.from_name,
          from_email: mail.from_email,
          to_name: log.toName || mail.to_name || "",
          to_email: log.toEmail || mail.to_email || "",
          subject: log.subject || mail.subject,
          html_body: log.bodyHtml || "",
          text_body: log.bodyText || "",
          received_at: log.createdAt || mail.received_at
        };
        announcementLogRows = announcementLogRows.map((item) =>
          item.id === mail.id ? { ...item, ...hydrated } : item
        );
        renderDetail(hydrated);
      } catch (error) {
        console.error("Failed to open sent announcement email", error);
        showToast("Could not load sent email");
      }
    }

    function applySearch() {
      const q = (searchEl.value || "").trim().toLowerCase();
      const source = currentFolder === "inbox" && currentFilter === "announcements"
        ? [...inbox, ...announcementLogRows]
        : inbox;
      filtered = source.filter((m) => {
        const searchable = getMailboxTextBlob(m);
        const searchMatch = !q || (
          searchable.includes(q)
        );
        return searchMatch && matchesMailboxFilter(m);
      });
      if (!filtered.length && source.length && currentFilter === "all") {
        filtered = [...source];
      }
      renderList();
    }

    function renderMailboxList(rows = inbox) {
      inbox = Array.isArray(rows) ? rows : [];
      applySearch();
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
          String(row?.spam_status || ""),
          Number(row?.spam_score || 0),
          String(row?.received_at || ""),
          String(row?.subject || ""),
          Number(row?.is_read || 0),
          Number(row?.attachmentsCount || 0)
        ])
      );
    }

    function isMailboxPanelVisible() {
      return Boolean(
        isElementActuallyVisible(emailPanelEl) &&
        isElementActuallyVisible(sesInboxPanel) &&
        isElementActuallyVisible(mailboxEl) &&
        currentFolder &&
        ["inbox", "trash", "spam", "important", "drafts"].includes(currentFolder)
      );
    }

    function syncInboxInBackground(folder = currentFolder) {
      const normalizedFolder = normalizeMailboxFolderName(folder);
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
          mailboxFailureCount = 0;
        } catch (error) {
          console.error("Mailbox auto-refresh failed", error);
          mailboxFailureCount = Math.min(mailboxFailureCount + 1, 6);
        } finally {
          mailboxPollInFlight = false;
          const nextDelay = mailboxFailureCount
            ? Math.min(delayMs * Math.pow(2, mailboxFailureCount), 60000)
            : delayMs;
          scheduleMailboxAutoRefresh(nextDelay);
        }
      }, delayMs);
    }

    async function bootstrapMailbox(force = false) {
      if (!canCurrentUserAccessMailbox()) {
        mailboxBootstrapped = false;
        resetMailboxState();
        return;
      }
      if (!isMailboxPanelVisible() && !force) return;
      if (mailboxBootstrapped && !force) return;
      mailboxBootstrapped = true;
      await loadInbox({ sync: false, folder: currentFolder });
      syncInboxInBackground(currentFolder);
    }

    function debugSchoolMailState(extra = {}) {
      debugMail("state", {
        view: currentFolder,
        filter: currentFilter,
        sourceCount: inbox.length,
        renderCount: filtered.length,
        ...extra
      });
    }

    async function loadInbox({ sync = false, folder, showList = false, filter } = {}) {
      const previousFolder = currentFolder;
      const previousFilter = currentFilter;
      if (folder) {
        currentFolder = normalizeMailboxFolderName(folder);
      }
      const hasExplicitFilter = filter !== undefined && filter !== null;
      if (hasExplicitFilter) {
        currentFilter = normalizeMailboxFilterName(filter);
      }
      const folderChanged = previousFolder !== currentFolder;
      if (folderChanged && !hasExplicitFilter) {
        currentFilter = "all";
        if (searchEl) searchEl.value = "";
        schoolMailActiveShortcut = "";
      }
      if (hasExplicitFilter && currentFilter === "all" && searchEl) {
        searchEl.value = "";
      }
      if (!canCurrentUserAccessMailbox()) {
        mailboxBootstrapped = false;
        resetMailboxState();
        return;
      }
      const filterChanged = previousFilter !== currentFilter;
      if (folderChanged || filterChanged || showList) {
        openMailboxListView();
      }
      if (!["trash", "spam", "important", "drafts"].includes(currentFolder)) {
        currentTrashAction = null;
      }
      syncMailboxHeading();
      updateMailboxModeUI();
      const activeListEl = ensureMailboxListVisible();
      const params = new URLSearchParams();
      params.set("folder", currentFolder);
      if (sync) params.set("sync", "1");
      const url = currentFolder === "spam"
        ? "/api/admin/inbox/spam"
        : currentFolder === "important"
          ? "/api/admin/inbox/important"
          : currentFolder === "drafts"
          ? "/api/admin/email/drafts"
          : `/api/admin/inbox?${params.toString()}`;
      debugMail("endpoint", { url, folder: currentFolder, filter: currentFilter, sync });
      const requestSeq = ++mailboxRequestSeq;
      const requestFolder = currentFolder;
      if (!activeListEl.children.length) {
        renderUiState(activeListEl, {
          icon: "fa-spinner",
          message: "Loading emails..."
        });
      }
      let res;
      try {
        res = await apiFetch(url);
      } catch (error) {
        if (requestSeq === mailboxRequestSeq && requestFolder === currentFolder) {
          renderUiState(ensureMailboxListVisible(), {
            icon: "fa-triangle-exclamation",
            message: "Could not load emails from the database."
          });
        }
        throw error;
      }
      if (requestSeq !== mailboxRequestSeq || requestFolder !== currentFolder) {
        return;
      }
      if (res.status === 401 || res.status === 403) {
        mailboxBootstrapped = false;
        resetMailboxState();
        return;
      }
      if (!res.ok) {
        renderUiState(ensureMailboxListVisible(), {
          icon: "fa-triangle-exclamation",
          message: "Could not load emails from the database."
        });
        throw new Error(`Inbox request failed (${res.status})`);
      }
      const data = await res.json();
      if (requestSeq !== mailboxRequestSeq || requestFolder !== currentFolder) {
        return;
      }

      const raw = normalizeMailboxResponse(data);
      debugMail("payload", {
        keys: data && typeof data === "object" && !Array.isArray(data) ? Object.keys(data) : [],
        normalizedCount: raw.length,
        folder: currentFolder,
        filter: currentFilter
      });
      const counts = data?.counts || {};
      const nextSignature = buildMailboxDataSignature(raw);
      mailboxDataSignature = nextSignature;
      const rows = raw.map((m) => {
        if (currentFolder === "drafts") {
          return {
            ...m,
            from_name: formatMailboxRecipients(m.toEmail || m.to_email) || "(no recipient)",
            from_email: formatMailboxRecipients(m.toEmail || m.to_email),
            subject: m.subject || "(no subject)",
            preview: m.preview || String(m.body || m.bodyText || "").replace(/\s+/g, " ").trim().slice(0, 140),
            received_at: m.updatedAt || m.updated_at || m.createdAt || m.created_at,
            is_read: true,
            _starred: starredMailIds.has(String(m.id)),
            hasAttachments: Array.isArray(m.attachments) && m.attachments.length > 0,
            attachments: Array.isArray(m.attachments) ? m.attachments : [],
            replies: []
          };
        }
        const { name, email } = parseSender(m.sender);
        return {
          ...m,
          from_name: name || email || "(unknown)",
          from_email: email || "",
          subject: m.subject || "(no subject)",
          preview: buildPreview(m),
          received_at: m.received_at,
          is_read: isReadFlag(m.is_read),
          _starred: starredMailIds.has(String(m.id)),
          hasAttachments: !!m.hasAttachments,
          attachments: Array.isArray(m.attachments) ? m.attachments : [],
          replies: Array.isArray(m.replies) ? m.replies : []
        };
      });
      sesInboxMessages = rows;
      inbox = rows;
      updateMailSidebarCounts({
        inbox: counts.inbox ?? (currentFolder === "inbox" ? inbox.length : undefined),
        trash: counts.trash ?? (currentFolder === "trash" ? inbox.length : undefined),
        spam: counts.spam ?? (currentFolder === "spam" ? inbox.length : undefined),
        suspected: counts.suspected,
        important: counts.important ?? (currentFolder === "important" ? inbox.length : undefined),
        drafts: currentFolder === "drafts" ? (data?.count ?? inbox.length) : counts.drafts,
        unread: inbox.filter((mail) => !mail.is_read).length
      });
      if (currentFolder === "inbox" && currentFilter === "announcements") {
        await ensureAnnouncementEmailLogRows().catch((error) => {
          console.warn("Failed to load announcement email logs", error);
          return [];
        });
      }
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

      renderMailboxList(rows);
      updateBulkUI();
      debugSchoolMailState({ event: "loadInbox", sync, folder: currentFolder });
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

    async function markSelectedSpam() {
      const ids = Array.from(selected).map((value) => Number.parseInt(String(value), 10)).filter(Number.isFinite);
      if (!ids.length) {
        showToast("Select at least one email", "info");
        return;
      }
      const response = await fetch("/api/admin/inbox/bulk-spam", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken()
        },
        body: JSON.stringify({ ids })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Mark spam failed");
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
      showToast(`${data.marked || ids.length} email${(data.marked || ids.length) === 1 ? "" : "s"} moved to spam`, "success");
    }

    async function restoreSelectedSpamMessages() {
      const ids = Array.from(selected).map((value) => Number.parseInt(String(value), 10)).filter(Number.isFinite);
      if (!ids.length) {
        showToast("Select spam emails to restore", "info");
        return;
      }
      const response = await fetch("/api/admin/inbox/bulk-not-spam", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken()
        },
        body: JSON.stringify({ ids })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Not spam failed");
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
      showToast(`${data.restored || ids.length} email${(data.restored || ids.length) === 1 ? "" : "s"} restored to inbox`, "success");
    }

    async function deleteSpamForever() {
      const ids = Array.from(selected).map((value) => Number.parseInt(String(value), 10)).filter(Number.isFinite);
      if (!ids.length) {
        showToast("Select spam emails to delete forever", "info");
        return;
      }
      const ok = await openConfirmModal({
        title: "Delete spam forever?",
        message: `Permanently delete ${ids.length} spam email${ids.length === 1 ? "" : "s"}?`,
        confirmText: "Delete forever",
        danger: true
      });
      if (!ok) return;

      let deleted = 0;
      for (const id of ids) {
        const response = await fetch(`/api/admin/inbox/spam/${encodeURIComponent(id)}/permanent`, {
          method: "DELETE",
          credentials: "include",
          headers: { "x-csrf-token": getCsrfToken() }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Delete forever failed");
        deleted += Number(data.deleted || 1);
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
      showToast(`${deleted} spam email${deleted === 1 ? "" : "s"} deleted forever`, "success");
    }

    async function emptySpam() {
      const ok = await openConfirmModal({
        title: "Empty spam?",
        message: "Delete all emails in Spam forever?",
        confirmText: "Empty spam",
        danger: true
      });
      if (!ok) return;
      const response = await fetch("/api/admin/inbox/empty-spam", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken()
        },
        body: JSON.stringify({})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Empty spam failed");
      inbox = [];
      filtered = [];
      activeId = null;
      renderDetail(null);
      exitDetailView();
      resetTrashSelectionMode();
      renderList();
      showToast(`${data.deleted || 0} spam email${(data.deleted || 0) === 1 ? "" : "s"} deleted forever`, "success");
    }

    refreshBtn?.addEventListener("click", () => {
      loadInbox({ sync: false, folder: currentFolder }).catch((error) => {
        console.error("Inbox refresh failed", error);
      });
      syncInboxInBackground(currentFolder);
    });
    searchEl?.addEventListener("input", () => applySearch());
    ensureMailboxFilterChips();
    detailDeleteBtn?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!activeId) return;
      selected.clear();
      selected.add(activeId);
      try {
        if (currentFolder === "trash") {
          currentTrashAction = "deleteForever";
          await deleteTrashForever();
        } else if (currentFolder === "spam") {
          currentTrashAction = "deleteForever";
          await deleteSpamForever();
        } else {
          await deleteSelectedInboxMessages();
        }
      } catch (error) {
        console.error("Detail delete failed", error);
        showToast(error.message || "Delete failed", "error");
      }
    });
    detailRestoreBtn?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!activeId || !["trash", "spam"].includes(currentFolder)) return;
      selected.clear();
      selected.add(activeId);
      currentTrashAction = "restore";
      try {
        if (currentFolder === "spam") {
          await restoreSelectedSpamMessages();
        } else {
          await restoreSelectedTrashMessages();
        }
      } catch (error) {
        console.error("Detail restore failed", error);
        showToast(error.message || "Restore failed", "error");
      }
    });
    detailImportantBtn?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const target = activeId
        ? inbox.find((mail) => String(mail.id) === String(activeId)) || sesInboxActiveMessage
        : sesInboxActiveMessage;
      if (!target) return;
      try {
        await toggleMailImportant(target);
      } catch (error) {
        console.error("Important update failed", error);
        showToast(error.message || "Important update failed", "error");
      }
    });
    document.getElementById("btnBulkRead")?.addEventListener("click", () => {
      inbox.forEach((mail) => {
        if (selected.has(mail.id)) mail.is_read = true;
      });
      applySearch();
      updateBulkUI();
    });
    document.getElementById("btnBulkUnread")?.addEventListener("click", () => {
      inbox.forEach((mail) => {
        if (selected.has(mail.id)) mail.is_read = false;
      });
      applySearch();
      updateBulkUI();
    });
    bulkDeleteBtn?.addEventListener("click", async () => {
      try {
        await deleteSelectedInboxMessages();
      } catch (error) {
        console.error("Inbox delete failed", error);
        showToast(error.message || "Delete failed", "error");
      }
    });
    bulkSpamBtn?.addEventListener("click", async () => {
      try {
        await markSelectedSpam();
      } catch (error) {
        console.error("Mark spam failed", error);
        showToast(error.message || "Mark spam failed", "error");
      }
    });
    trashRestoreBtn?.addEventListener("click", async () => {
      try {
        if (!["trash", "spam"].includes(currentFolder)) return;
        if (currentTrashAction !== "restore") {
          currentTrashAction = "restore";
          selected.clear();
          renderList();
          showToast(currentFolder === "spam" ? "Select spam emails to mark as not spam" : "Select trash emails to put back", "info");
          return;
        }
        if (currentFolder === "spam") {
          await restoreSelectedSpamMessages();
        } else {
          await restoreSelectedTrashMessages();
        }
      } catch (error) {
        console.error("Restore failed", error);
        showToast(error.message || "Restore failed", "error");
      }
    });
    trashDeleteForeverBtn?.addEventListener("click", async () => {
      try {
        if (!["trash", "spam"].includes(currentFolder)) return;
        if (currentTrashAction !== "deleteForever") {
          currentTrashAction = "deleteForever";
          selected.clear();
          renderList();
          showToast(currentFolder === "spam" ? "Select spam emails to delete forever" : "Select trash emails to delete forever", "info");
          return;
        }
        if (currentFolder === "spam") {
          await deleteSpamForever();
        } else {
          await deleteTrashForever();
        }
      } catch (error) {
        console.error("Permanent delete failed", error);
        showToast(error.message || "Delete forever failed", "error");
      }
    });
    trashEmptyBtn?.addEventListener("click", async () => {
      try {
        if (!["trash", "spam"].includes(currentFolder)) return;
        if (currentFolder === "spam") {
          await emptySpam();
        } else {
          await emptyTrash();
        }
      } catch (error) {
        console.error("Mailbox empty failed", error);
        showToast(error.message || "Clean failed", "error");
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
    window.setSchoolMailFilter = (filter = "all") => {
      setMailboxFilter(filter);
    };
    window.openSchoolMailView = async ({ view = "inbox", filter = "all", sync = false } = {}) => {
      const normalizedView = normalizeSesSettingsView(view);
      const mailboxView = ["inbox", "trash", "spam", "important", "drafts"].includes(normalizedView)
        ? normalizedView
        : null;
      if (!mailboxView) {
        setSesSettingsView(normalizedView);
        return;
      }
      const normalizedFilter = mailboxView === "inbox" && !filter
        ? "all"
        : normalizeMailboxFilterName(filter || "all");
      setSesSettingsView(mailboxView, {
        loadMailbox: false,
        filter: normalizedFilter
      });
      currentFilter = normalizedFilter;
      if (searchEl && normalizedFilter === "all") {
        searchEl.value = "";
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await loadInbox({
        folder: mailboxView,
        sync,
        showList: true,
        filter: normalizedFilter
      });
      debugSchoolMailState({ event: "openSchoolMailView" });
    };
    window.addEventListener("worknestWorkspaceReady", () => {
      if (!isMailboxPanelVisible()) return;
      bootstrapMailbox(true).catch((e) => {
        console.error("Inbox load failed", e);
      });
    });
    document.addEventListener("worknest:panel-shown", (event) => {
      if (event?.detail?.panelId !== "emailPanel") return;
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
}

window.addEventListener("load", () => {
  if (typeof initGmailishInbox === "function") {
    initGmailishInbox();
  }
});
