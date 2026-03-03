"use strict";

let announcementsByChannel = {};
const userReadAnnouncements = new Set();
let disableAnnouncementAutoscroll = false;
let announcementAutoScrollRequest = true;

const $ = (id) => document.getElementById(id);
const announcementsContainer = $("announcementsContainer");
const messagesContainerSafe =
  window.messagesContainer || document.getElementById("messagesContainer");
const announcementsPlusBtn = $("announcementsPlusBtn");
const announcementsPopup = $("announcementsPopup");
const announcementsPopupClose = $("announcementsPopupClose");
const saveAnnouncementBtn = $("saveAnnouncement");
const announcementTitleSelect = $("announcementTitle");
const announcementCategorySelect = $("announcementCategory");
const announcementPrioritySelect = $("announcementPriority");
const announcementContentTextarea = $("announcementContent");

const PRIORITIES = new Set(["low", "normal", "high", "critical"]);
const normalizeAnnouncementPriority = (v) => {
  const n = String(v || "normal").trim().toLowerCase();
  return PRIORITIES.has(n) ? n : "normal";
};

const formatAnnouncementDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
};

const formatAnnouncementBodyHtml = (content) => {
  const raw = String(content || "").trim();
  if (!raw) return `<div class="announcement-body"><p>No additional details provided.</p></div>`;
  const parts = raw.split(/\n{2,}/).map((c) => c.trim()).filter(Boolean);
  const html = (parts.length ? parts : [raw]).map((s) => `<p>${escapeHtml(s)}</p>`).join("");
  return `<div class="announcement-body">${html}</div>`;
};

const sortAnnouncementsByDate = (list) => {
  if (!Array.isArray(list)) return [];
  return [...list].sort((a, b) => {
    const aTime = Date.parse(a.createdAt || a.created_at || "");
    const bTime = Date.parse(b.createdAt || b.created_at || "");
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
    if (Number.isNaN(aTime)) return -1;
    if (Number.isNaN(bTime)) return 1;
    return aTime - bTime;
  });
};

function pushAnnouncement(channelId, announcement) {
  if (!channelId || !announcement?.id) return;
  const id = String(announcement.id);
  const current = announcementsByChannel[channelId] || [];
  const existing = current.find((x) => String(x.id) === id);
  const next = current.filter((x) => String(x.id) !== id);

  const merged = { ...(existing || {}), ...announcement };
  if (existing?.readByUser || merged.readByUser) {
    merged.readByUser = true;
    userReadAnnouncements.add(id);
  }

  next.push(merged);
  announcementsByChannel[channelId] = sortAnnouncementsByDate(next);
}

function removeAnnouncementFromStore(channelId, announcementId) {
  if (!channelId || !announcementId) return false;
  const id = String(announcementId);
  const current = announcementsByChannel[channelId] || [];
  const next = current.filter((x) => String(x.id) !== id);
  if (next.length === current.length) return false;

  announcementsByChannel[channelId] = next;
  userReadAnnouncements.delete(id);
  clearFreshBorderTracking(channelId, id);

  if (currentChannelId === channelId) {
    disableAnnouncementAutoscroll = true;
    renderMessages(channelId);
  }
  return true;
}

function mixHexColors(base, blend, ratio = 0.5) {
  const toRgb = (hex) => {
    let c = String(hex || "").trim().replace(/^#/, "");
    if (c.length === 3) c = c.split("").map((ch) => ch + ch).join("");
    if (!/^[0-9a-fA-F]{6}$/.test(c)) return null;
    const n = parseInt(c, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };

  const a = toRgb(base);
  const b = toRgb(blend) || { r: 255, g: 255, b: 255 };
  if (!a) return blend;

  const lerp = (s, e) => Math.round(s + (e - s) * ratio);
  return (
    "#" +
    [lerp(a.r, b.r), lerp(a.g, b.g), lerp(a.b, b.b)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

const buildReadGradient = (color) =>
  `linear-gradient(135deg, ${mixHexColors(color, "#ffffff", 0.4)}, ${color})`;

function renderAnnouncementCardHtml(announcement) {
  if (!announcement) return "";

  const priorityClass = `priority-${normalizeAnnouncementPriority(announcement.priority)}`;
  const statusLabel = announcement.status || "General";
  const { background, textColor } = getBadgeStyleProps(statusLabel);
  const createdAt = formatAnnouncementDate(announcement.createdAt || announcement.created_at);
  const bodyHtml = formatAnnouncementBodyHtml(announcement.content);
  const readCount = Number(announcement.readCount ?? announcement.read_count ?? 0);
  const id = String(announcement.id || "");
  const hasUserRead = Boolean(announcement.readByUser) || userReadAnnouncements.has(id);

  const readBtnClass = hasUserRead ? " announcement-read-btn--filled" : "";
  const readBtnLabel = hasUserRead ? "Marked" : "Mark as Read";

  const deleteButtonHtml = isAdminUser()
    ? `<button class="announcement-delete-btn" type="button" aria-label="Delete announcement">
         <i class="fa-solid fa-trash" aria-hidden="true"></i>
       </button>`
    : "";

  return `
    <div class="announcement-card ${priorityClass}"
      data-announcement-id="${escapeHtml(id)}"
      style="--announcement-border-color:${background};--announcement-badge-bg:${background};
             --announcement-read-gradient:${buildReadGradient(background)};
             border:1px solid var(--announcement-border-color);
             border-left:10px solid var(--announcement-border-color);">
      <div class="announcement-panel">
        <div class="announcement-header">
          <div class="announcement-title">
            <span class="announcement-icon" aria-hidden="true"></span>
            ${escapeHtml(announcement.title || "Untitled announcement")}
          </div>
          <div class="announcement-badge"
            style="--announcement-badge-bg:${background};--announcement-badge-color:${textColor};">
            ${escapeHtml(statusLabel)}
          </div>
        </div>
        <div class="announcement-meta">
          <span>Posted by <strong>${escapeHtml(announcement.author || "School Administration")}</strong></span>
          ${createdAt ? `<span>•</span><span>${escapeHtml(createdAt)}</span>` : ""}
        </div>
      </div>
      ${bodyHtml}
      <div class="announcement-footer">
        <button class="announcement-read-btn${readBtnClass}" type="button">
          <i class="fa-solid fa-check" aria-hidden="true"></i>${readBtnLabel}
        </button>
      </div>
      <div class="announcement-read-actions">
        ${deleteButtonHtml}
        <div class="announcement-read-count" aria-label="Reads">${readCount >= 0 ? `+${readCount}` : "+0"}</div>
      </div>
    </div>`;
}

const renderAnnouncementCardExample = () =>
  renderAnnouncementCardHtml({
    id: "example",
    title: "Digital TestDaF – Exam Structure",
    status: "Examination",
    priority: "High",
    content:
      "The digital TestDaF is conducted online and consists of four parts: Reading, Listening, Writing, and Speaking. Listening and writing answers are typed on the computer, while speaking responses are recorded via headphones.",
    author: "School Administration",
    createdAt: "2026-02-22T12:00:00Z"
  });

const requestAnnouncementAutoScroll = () => (announcementAutoScrollRequest = true);

function renderAnnouncementChannel(channelId, options = {}) {
  const mc = messagesContainerSafe;
  if (!mc) return;

  const list = announcementsByChannel[channelId] || [];
  if (!list.length) {
    mc.innerHTML = `
      <div class="announcement-empty-state">
        <p>No announcements yet. Click the “+” button to publish one.</p>
        <button class="announcement-empty-cta" type="button">
          <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
          Notify your school admin to post the first announcement
        </button>
        ${renderAnnouncementCardExample()}
      </div>`;
    announcementAutoScrollRequest = false;
    return;
  }

    mc.innerHTML = `<div class="announcement-list">
    ${list.map(renderAnnouncementCardHtml).join("")}
  </div>`;

  requestAnimationFrame(() => {
    const shouldScroll =
      !disableAnnouncementAutoscroll &&
      Boolean(options.announcementAutoScroll ?? announcementAutoScrollRequest);
    if (shouldScroll) mc.scrollTop = mc.scrollHeight;
    disableAnnouncementAutoscroll = false;
    announcementAutoScrollRequest = false;
  });

  wireAnnouncementCardButtons(channelId);
}

function wireAnnouncementCardButtons(channelId) {
  const mc = messagesContainerSafe;
  if (!mc) return;

  mc.querySelectorAll(".announcement-card").forEach((card) => {
    const announcementId = card?.dataset?.announcementId;
    if (!announcementId) return;

    const readBtn = card.querySelector(".announcement-read-btn");
    if (readBtn && readBtn.dataset.announcementMarkBound !== "1") {
      readBtn.dataset.announcementMarkBound = "1";
      readBtn.addEventListener("click", (e) => {
        disableAnnouncementAutoscroll = true;
        markAnnouncementAsRead(channelId, announcementId, e.currentTarget);
      });
    }

    const deleteBtn = card.querySelector(".announcement-delete-btn");
    if (deleteBtn && deleteBtn.dataset.announcementDeleteBound !== "1") {
      deleteBtn.dataset.announcementDeleteBound = "1";
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        disableAnnouncementAutoscroll = true;
        handleAnnouncementDelete(channelId, announcementId, e.currentTarget);
      });
    }
  });
}

async function markAnnouncementAsRead(channelId, announcementId, button) {
  if (!channelId || !announcementId || !button) return;

  button.disabled = true;
  button.classList.add("announcement-read-btn--filled");

  try {
    const payload = await api(`/api/announcements/${encodeURIComponent(announcementId)}/read`, {
      method: "POST"
    });

    const current = announcementsByChannel[channelId] || [];
    const existing = current.find((x) => String(x.id) === String(announcementId));
    if (existing) {
      userReadAnnouncements.add(String(existing.id));
      pushAnnouncement(channelId, {
        ...existing,
        readCount: payload.readCount ?? Number(existing.readCount ?? existing.read_count ?? 0)
      });
      if (!showSavedOnly && currentChannelId === channelId) renderMessages(channelId);
    }
  } catch (err) {
    console.error("Failed to mark announcement as read", err);
    button.classList.remove("announcement-read-btn--filled");
    showToast(normalizeErrorText(err));
  } finally {
    button.disabled = false;
  }
}

async function handleAnnouncementDelete(channelId, announcementId, button) {
  if (!channelId || !announcementId || !button) return;

  const confirmInstance = showAnnouncementDeleteConfirm(() => {
    button.disabled = true;
    api(
      `/api/channels/${encodeURIComponent(channelId)}/announcements/${encodeURIComponent(announcementId)}`,
      { method: "DELETE" }
    )
      .then(() => removeAnnouncementFromStore(channelId, announcementId))
      .catch((err) => {
        console.error("Failed to delete announcement", err);
        showToast(normalizeErrorText(err));
      })
      .finally(() => (button.disabled = false));
  });

  confirmInstance.focusConfirm();
}

function showAnnouncementDeleteConfirm(onConfirm) {
  const overlay = document.createElement("div");
  overlay.className = "announcement-delete-confirm-overlay";

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => e.target === overlay && close());

  const card = document.createElement("div");
  card.className = "announcement-delete-confirm-card";
  card.innerHTML = `
    <div class="announcement-delete-confirm-header">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
      <h4>Delete announcement?</h4>
    </div>
    <p>This action removes this announcement for everyone. This cannot be undone.</p>
    <div class="announcement-delete-confirm-actions">
      <button type="button" class="btn-cancel">Cancel</button>
      <button type="button" class="btn-confirm">Delete</button>
    </div>`;

  const cancelBtn = card.querySelector(".btn-cancel");
  const confirmBtn = card.querySelector(".btn-confirm");
  cancelBtn?.addEventListener("click", close);
  confirmBtn?.addEventListener("click", () => (onConfirm?.(), close()));

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  return { focusConfirm: () => confirmBtn?.focus() };
}

function renderAnnouncements() {
  if (!announcementsContainer) return;
  announcementsContainer.innerHTML = "";

  const visible = channels.filter(
    (c) => (c.workspaceId || "default") === currentWorkspaceId && isAnnouncementChannel(c)
  );

  visible.forEach((ch) => {
    const row = document.createElement("div");
    row.className = "sidebar-item channel-row";
    row.dataset.channelId = ch.id;
    row.dataset.dragType = "channel";
    row.setAttribute("draggable", "true");
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");

    const active = ch.id === currentChannelId;
    row.classList.toggle("sidebar-item-active", active);
    row.setAttribute("aria-selected", active ? "true" : "false");

    const state = unreadState.get(String(ch.id));
    const mentionCount = state?.mentionCount || 0;
    const unreadCount = mentionCount > 0 ? mentionCount : isChannelMuted(ch.id) ? 0 : getUnreadCount(ch.id);
    row.classList.toggle("sidebar-item-unread", unreadCount > 0);

    row.innerHTML = `
      <span class="sidebar-item-icon"><i class="fa-solid fa-bullhorn"></i></span>
      <span class="sidebar-item-label"></span>
      <div class="sidebar-item-meta"></div>`;
    row.querySelector(".sidebar-item-label").textContent = ch.name;

    const meta = row.querySelector(".sidebar-item-meta");

    if (unreadCount > 0) {
      const pill = document.createElement("span");
      pill.className = mentionCount > 0 ? "sidebar-mention-pill" : "sidebar-item-unread-pill";
      pill.textContent = mentionCount > 0 ? `@${mentionCount}` : unreadCount;
      meta.appendChild(pill);
    }

    row.classList.toggle("is-pinned", isChannelPinned(ch.id));

    const moreBtn = document.createElement("button");
    moreBtn.className = "sidebar-row-more";
    moreBtn.type = "button";
    moreBtn.title = "More";
    moreBtn.innerHTML = '<i class="fa-solid fa-ellipsis"></i>';
    moreBtn.addEventListener("click", (e) => (e.stopPropagation(), openChannelActionsMenu(ch, moreBtn)));
    meta.appendChild(moreBtn);

    row.addEventListener("click", async () => {
      if (isFilesPanelActive()) return setFilesScope(ch.id);
      await selectChannel(ch.id);
    });

    row.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const choice = prompt(
        `Channel: #${ch.name}\nType one of:\n- topic  → edit topic\n- delete → delete channel`,
        "topic"
      );
      const val = (choice || "").toLowerCase().trim();
      if (val === "topic") editChannelTopic(ch.id);
      else if (val === "delete") deleteChannel(ch.id);
    });

    announcementsContainer.appendChild(row);
  });

  setupSidebarKeyboardNav();
}

/* Popup open/close */
announcementsPlusBtn?.addEventListener("click", () => (announcementsPopup.hidden = false));
announcementsPopupClose?.addEventListener("click", () => (announcementsPopup.hidden = true));
announcementsPopup?.addEventListener("click", (e) => e.target === announcementsPopup && (announcementsPopup.hidden = true));

/* Save announcement */
saveAnnouncementBtn?.addEventListener("click", async () => {
  const channelId = currentChannelId;
  const title = (announcementTitleSelect?.value || "").trim();
  const status = announcementCategorySelect?.value || "General";
  const priority = announcementPrioritySelect?.value || "Normal";
  const content = (announcementContentTextarea?.value || "").trim();

  const chObj = channels?.find((c) => String(c.id) === String(channelId));
  if (!channelId || !isAnnouncementChannel(chObj)) {
    return showToast("Announcements can only be posted inside the announcements channel");
  }
  if (!title) return showToast("Please select a title for the announcement");

  saveAnnouncementBtn.disabled = true;
  try {
    const payload = await api(`/api/channels/${encodeURIComponent(channelId)}/announcements`, {
      method: "POST",
      body: { title, status, priority, content }
    });
    pushAnnouncement(channelId, payload);
    requestAnnouncementAutoScroll();
    renderMessages(channelId);
    hideAnnouncementsPopup();
  } catch (err) {
    console.error("Failed to save announcement", err);
    showToast(normalizeErrorText(err));
  } finally {
    saveAnnouncementBtn.disabled = false;
  }
});

function hideAnnouncementsPopup() {
  if (announcementsPopup) announcementsPopup.hidden = true;
}
