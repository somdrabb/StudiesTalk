(function () {
  "use strict";

  const SIDEBAR_SCROLL_KEY = "worknest_sidebar_scroll_v1";
  const PINNED_COLLAPSE_KEY = "worknest_pinned_sidebar_collapsed_v2";
  const SIDEBAR_SECTION_COLLAPSE_KEY = "worknest_sidebar_section_collapsed_v1";
  const HIDDEN_SCHOOL_TOOLS_KEY = "worknest_hidden_default_school_tools_v1";

  let sidebarSectionCollapseState = {};

  function resolveSidebarPartialUrl() {
    const mount = document.getElementById("sidebarMount");
    const explicit = mount?.dataset.sidebarSrc;
    if (explicit) return explicit;
    const scriptSrc = document.currentScript?.getAttribute("src") || "";
    if (scriptSrc.includes("/")) {
      return scriptSrc.replace(/[^/]+$/, "sidebar.html");
    }
    return "sidebar/sidebar.html";
  }

  function mountSidebarHtml() {
    const mount = document.getElementById("sidebarMount");
    if (mount?.querySelector("aside.sidebar")) return true;
    if (!mount && document.querySelector("aside.sidebar")) return true;
    if (!mount) return false;

    const url = resolveSidebarPartialUrl();
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, false);
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText.trim()) {
        mount.innerHTML = xhr.responseText;
        return true;
      }
      console.error(`Could not load sidebar HTML from ${url}: ${xhr.status}`);
    } catch (err) {
      console.error("Could not load sidebar HTML", err);
    }
    return false;
  }

  mountSidebarHtml();

  function callAppFunction(name, ...args) {
    const fn = window[name];
    if (typeof fn === "function") {
      return fn(...args);
    }
    return undefined;
  }

  function getSidebarUserScope() {
    const currentUser = window.currentUser || {};
    const userId = String(
      callAppFunction("getCurrentUserId") ||
      currentUser.userId ||
      currentUser.id ||
      currentUser.email ||
      currentUser.username ||
      "anon"
    ).trim() || "anon";
    const workspaceId = String(
      callAppFunction("getCurrentWorkspaceId") ||
      window.currentWorkspaceId ||
      window.selectedWorkspaceId ||
      currentUser.workspaceId ||
      currentUser.workspace_id ||
      "default"
    ).trim() || "default";
    return `${workspaceId}::${userId}`;
  }

  function getHiddenSchoolToolsStorageKey() {
    return `${HIDDEN_SCHOOL_TOOLS_KEY}:${getSidebarUserScope()}`;
  }

  function loadHiddenSchoolTools() {
    try {
      const parsed = JSON.parse(localStorage.getItem(getHiddenSchoolToolsStorageKey()) || "[]");
      return new Set(Array.isArray(parsed) ? parsed.map((value) => String(value || "").toLowerCase()) : []);
    } catch (_err) {
      return new Set();
    }
  }

  function saveHiddenSchoolTools(hiddenTools) {
    try {
      localStorage.setItem(getHiddenSchoolToolsStorageKey(), JSON.stringify(Array.from(hiddenTools)));
    } catch (err) {
      console.warn("Could not save hidden school tools", err);
    }
  }

  function getDefaultSchoolToolRows() {
    return Array.from(
      document.querySelectorAll("#appsContainer .school-tool-item[data-sidebar-static-item='1'][data-channel-name]")
    );
  }

  function updateSchoolToolGroupTitles() {
    document.querySelectorAll("#appsContainer .sidebar-group-title").forEach((title) => {
      let sibling = title.nextElementSibling;
      let hasVisibleItem = false;
      while (sibling && !sibling.classList.contains("sidebar-group-title")) {
        if (sibling.classList.contains("school-tool-item") && !sibling.hidden) {
          hasVisibleItem = true;
          break;
        }
        sibling = sibling.nextElementSibling;
      }
      title.hidden = !hasVisibleItem;
    });
  }

  function hideScheduleSchoolTool() {
    document
      .querySelectorAll("#appsContainer .sidebar-item, #appsChannelsContainer .sidebar-item")
      .forEach((row) => {
        const name = String(
          row.dataset.channelName ||
          row.querySelector(".sidebar-item-label")?.textContent ||
          row.getAttribute("aria-label") ||
          ""
        ).trim().toLowerCase();
        if (name === "schedule") row.hidden = true;
      });
    updateSchoolToolGroupTitles();
  }

  function applyHiddenSchoolTools() {
    const hiddenTools = loadHiddenSchoolTools();
    getDefaultSchoolToolRows().forEach((row) => {
      const key = String(row.dataset.channelName || row.getAttribute("aria-label") || "").trim().toLowerCase();
      row.hidden = hiddenTools.has(key);
    });
    hideScheduleSchoolTool();
    updateSchoolToolGroupTitles();
  }

  function bindUserHiddenSchoolTools() {
    const hiddenTools = loadHiddenSchoolTools();
    getDefaultSchoolToolRows().forEach((row) => {
      const key = String(row.dataset.channelName || row.getAttribute("aria-label") || "").trim().toLowerCase();
      if (!key) return;
      row.hidden = hiddenTools.has(key);
      if (row.dataset.userHideToolBound === "1") return;
      row.dataset.userHideToolBound = "1";

      const meta = row.querySelector(".sidebar-item-meta") || row.appendChild(document.createElement("div"));
      meta.classList.add("sidebar-item-meta");

      const btn = document.createElement("button");
      btn.className = "sidebar-tool-hide-btn";
      btn.type = "button";
      btn.title = "Remove from my sidebar";
      btn.setAttribute("aria-label", `Remove ${row.dataset.channelName || "tool"} from my sidebar`);
      btn.innerHTML = '<i class="fa-solid fa-trash-can" aria-hidden="true"></i>';
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const label = row.dataset.channelName || row.getAttribute("aria-label") || "this tool";
        const confirmed = typeof window.confirm === "function"
          ? window.confirm(`Remove ${label} from your sidebar? This only affects your user interface.`)
          : true;
        if (!confirmed) return;
        const nextHiddenTools = loadHiddenSchoolTools();
        nextHiddenTools.add(key);
        saveHiddenSchoolTools(nextHiddenTools);
        row.hidden = true;
        updateSchoolToolGroupTitles();
      });
      meta.appendChild(btn);
    });
    hideScheduleSchoolTool();
    updateSchoolToolGroupTitles();
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
      el.addEventListener("keydown", (event) => {
        const idx = items.indexOf(el);
        if (idx === -1) return;
        const focusAt = (nextIdx) => {
          const clamped = Math.max(0, Math.min(items.length - 1, nextIdx));
          items.forEach((node) => {
            node.tabIndex = -1;
          });
          items[clamped].tabIndex = 0;
          items[clamped].focus();
        };

        if (event.key === "ArrowDown") {
          event.preventDefault();
          focusAt(idx + 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          focusAt(idx - 1);
        } else if (event.key === "Home") {
          event.preventDefault();
          focusAt(0);
        } else if (event.key === "End") {
          event.preventDefault();
          focusAt(items.length - 1);
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          el.click();
        }
      });
    });
  }

  function setPinnedCollapsed(collapsed) {
    const section = document.getElementById("pinnedSidebarSection");
    if (!section) return;
    section.classList.toggle("is-collapsed", !!collapsed);
    localStorage.setItem(PINNED_COLLAPSE_KEY, collapsed ? "1" : "0");
  }

  function initPinnedCollapse() {
    const btn = document.getElementById("pinnedToggleBtn");
    if (!btn || btn.dataset.sidebarPinnedBound === "1") return;
    btn.dataset.sidebarPinnedBound = "1";

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
      header.setAttribute(
        "aria-expanded",
        section.classList.contains("is-collapsed") ? "false" : "true"
      );

      if (header.dataset.collapseBound === "1") return;

      const toggle = () => {
        const nextCollapsed = !section.classList.contains("is-collapsed");
        setSidebarSectionCollapsed(sectionId, nextCollapsed);
      };

      header.addEventListener("click", (event) => {
        if (event.target.closest("button")) return;
        toggle();
      });

      header.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target.closest("button")) return;
        event.preventDefault();
        toggle();
      });

      header.dataset.collapseBound = "1";
    });
  }

  function bindSidebarPrimaryActions() {
    const bindings = [
      ["#allUnreadsBtn", () => callAppFunction("openAllUnreads")],
      ["#channelList .sidebar-section-header .icon-btn", () => callAppFunction("handleAddChannel", "classes")],
      ["#conversationClubSection .sidebar-section-header .icon-btn", () => callAppFunction("handleAddChannel", "clubs")],
      ["#examGroupsSection .sidebar-section-header .icon-btn", () => callAppFunction("handleAddChannel", "exams")],
      ["#appsSection .sidebar-section-header .icon-btn", () => callAppFunction("handleAddChannel", "tools")],
      ["#dmList .sidebar-section-header .icon-btn", () => callAppFunction("openDmCreateModal")]
    ];

    bindings.forEach(([selector, handler]) => {
      const btn = document.querySelector(selector);
      if (!btn || btn.dataset.sidebarActionBound === "1") return;
      btn.dataset.sidebarActionBound = "1";
      btn.addEventListener("click", handler);
    });
    bindUserHiddenSchoolTools();
  }

  function bindSidebarAdminActions() {
    const studentList = document.getElementById("openStudentsList");
    const teacherList = document.getElementById("openTeachersList");
    const classSettings = document.getElementById("openClassSettingsList");
    const privacyRules = document.getElementById("openPrivacyRules");
    const studentRegistration = document.getElementById("openStudentRegistration");
    const teacherRegistration = document.getElementById("openTeacherRegistration");

    if (studentList && studentList.dataset.sidebarAdminBound !== "1") {
      studentList.dataset.sidebarAdminBound = "1";
      studentList.addEventListener("click", () => {
        callAppFunction("hideAdminOverlays");
        callAppFunction("showDirectoryList", "student", { keepEmailHeader: true });
      });
    }

    if (teacherList && teacherList.dataset.sidebarAdminBound !== "1") {
      teacherList.dataset.sidebarAdminBound = "1";
      teacherList.addEventListener("click", () => {
        callAppFunction("hideAdminOverlays");
        callAppFunction("showDirectoryList", "teacher", { keepEmailHeader: true });
      });
    }

    if (classSettings && classSettings.dataset.sidebarAdminBound !== "1") {
      classSettings.dataset.sidebarAdminBound = "1";
      classSettings.addEventListener("click", () => {
        callAppFunction("openClassSettingsAdminPage");
      });
    }

    if (privacyRules && privacyRules.dataset.sidebarAdminBound !== "1") {
      privacyRules.dataset.sidebarAdminBound = "1";
      privacyRules.addEventListener("click", () => {
        callAppFunction("hideAdminOverlays");
        callAppFunction("openPrivacyRulesChannel");
      });
    }

    if (studentRegistration && studentRegistration.dataset.sidebarAdminBound !== "1") {
      studentRegistration.dataset.sidebarAdminBound = "1";
      studentRegistration.addEventListener("click", () => {
        callAppFunction(
          "openRegistrationModal",
          document.getElementById("studentRegisterModal"),
          document.getElementById("studentRegisterError"),
          "student"
        );
      });
    }

    if (teacherRegistration && teacherRegistration.dataset.sidebarAdminBound !== "1") {
      teacherRegistration.dataset.sidebarAdminBound = "1";
      teacherRegistration.addEventListener("click", () => {
        callAppFunction(
          "openRegistrationModal",
          document.getElementById("teacherRegisterModal"),
          document.getElementById("teacherRegisterError"),
          "teacher"
        );
      });
    }
  }

  function bindSidebarScrollPersistence() {
    const sidebarScroll = document.querySelector(".sidebar-scroll");
    if (!sidebarScroll || sidebarScroll.dataset.scrollPersistBound === "1") return;
    sidebarScroll.dataset.scrollPersistBound = "1";
    sidebarScroll.addEventListener(
      "scroll",
      () => {
        try {
          if (isRestoringView) return;
        } catch (_err) {
          /* ignore if the app state has not loaded yet */
        }
        persistSidebarScroll(sidebarScroll.scrollTop);
      },
      { passive: true }
    );
  }

  function initSidebarShell() {
    bindSidebarPrimaryActions();
    bindSidebarAdminActions();
    bindSidebarScrollPersistence();
    initPinnedCollapse();
    initSidebarSectionCollapsibles();
    setupSidebarKeyboardNav();
    bindUserHiddenSchoolTools();
  }

  window.loadSidebarScroll = loadSidebarScroll;
  window.persistSidebarScroll = persistSidebarScroll;
  window.setupSidebarKeyboardNav = setupSidebarKeyboardNav;
  window.setPinnedCollapsed = setPinnedCollapsed;
  window.initPinnedCollapse = initPinnedCollapse;
  window.loadSidebarSectionCollapseState = loadSidebarSectionCollapseState;
  window.saveSidebarSectionCollapseState = saveSidebarSectionCollapseState;
  window.setSidebarSectionCollapsed = setSidebarSectionCollapsed;
  window.initSidebarSectionCollapsibles = initSidebarSectionCollapsibles;
  window.bindSidebarPrimaryActions = bindSidebarPrimaryActions;
  window.bindSidebarAdminActions = bindSidebarAdminActions;
  window.bindSidebarScrollPersistence = bindSidebarScrollPersistence;
  window.applyHiddenSchoolTools = applyHiddenSchoolTools;
  window.bindUserHiddenSchoolTools = bindUserHiddenSchoolTools;
  window.hideScheduleSchoolTool = hideScheduleSchoolTool;
  window.initSidebarShell = initSidebarShell;
})();
