"use strict";

(function initLegalPage() {
  function getDocumentType() {
    return document.body?.dataset?.legalDocument || "privacy";
  }

  function getPageMode() {
    return document.body?.dataset?.legalPageMode || "document";
  }

  function getLocale() {
    try {
      const params = new URLSearchParams(window.location.search);
      return (params.get("locale") || "").trim() || "";
    } catch (_err) {
      return "";
    }
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (!node) return;
    node.textContent = value || "";
  }

  function setBadge(value) {
    const node = document.getElementById("legalPageStatus");
    if (!node) return;
    node.textContent = value || "Draft";
    node.classList.toggle("is-active", /published/i.test(String(value || "")));
  }

  function renderLines(containerId, lines) {
    const node = document.getElementById(containerId);
    if (!node) return;
    node.innerHTML = "";
    lines.filter(Boolean).forEach((line) => {
      const item = document.createElement("div");
      item.textContent = line;
      node.appendChild(item);
    });
  }

  function renderList(containerId, items) {
    const node = document.getElementById(containerId);
    if (!node) return;
    node.innerHTML = "";
    items.filter((item) => item && item.value).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = `${item.label}: ${item.value}`;
      node.appendChild(li);
    });
  }

  function renderParagraphs(containerId, text) {
    const node = document.getElementById(containerId);
    if (!node) return;
    node.innerHTML = "";
    const raw = String(text || "").trim();
    if (!raw) return;
    raw
      .split(/\n\s*\n/g)
      .map((block) => block.trim())
      .filter(Boolean)
      .forEach((block) => {
        const p = document.createElement("p");
        p.textContent = block.replace(/\n+/g, " ");
        node.appendChild(p);
      });
  }

  function renderSections(containerId, sections) {
    const node = document.getElementById(containerId);
    if (!node) return;
    node.innerHTML = "";
    sections.forEach((section) => {
      if (!section || !section.title) return;
      const wrap = document.createElement("section");
      wrap.className = "legal-runtime-copy";
      const title = document.createElement("h3");
      title.textContent = section.title;
      wrap.appendChild(title);
      String(section.body || "")
        .split(/\n\s*\n/g)
        .map((block) => block.trim())
        .filter(Boolean)
        .forEach((block) => {
          const p = document.createElement("p");
          p.textContent = block.replace(/\n+/g, " ");
          wrap.appendChild(p);
        });
      node.appendChild(wrap);
    });
  }

  function retentionLine(label, value, suffix) {
    if (value === null || value === undefined || value === "") return "";
    return `${label}: ${value} ${suffix}`.trim();
  }

  function buildTrustSections(settings) {
    const providers = settings.providers || {};
    const retention = settings.retention || {};
    const providerLabels = [
      ["hosting", "Hosting"],
      ["video", "Video"],
      ["ai", "AI"],
      ["email", "Email"],
      ["sms", "SMS"],
      ["storage", "Object storage"],
      ["analytics", "Analytics"]
    ]
      .filter(([key]) => providers[key])
      .map(([key, label]) => `${label}: ${providers[key]}`);
    const retentionLines = [
      retentionLine("Recordings", retention.recording_retention_days, "days"),
      retentionLine("Security logs", retention.security_log_retention_days, "days"),
      retentionLine("Backups", retention.backup_retention_days, "days"),
      retentionLine("Learning data", retention.learning_data_retention_months, "months")
    ].filter(Boolean);

    return [
      {
        title: "Platform security model",
        body:
          "StudiesTalk is designed as a multi-tenant SaaS platform for schools. Tenant isolation, role-based access, session controls, password hashing, HTTPS transport protection, audit logging, and operational backups are used to reduce the risk of unauthorized access or cross-tenant leakage.\n\nThis page is a security overview for customers and prospects. It is not a certification claim, guarantee, or substitute for contractual security commitments."
      },
      {
        title: "Operational controls",
        body:
          "Authentication and authorization are enforced through account roles and scoped workspace access. Administrative and user actions can be recorded in audit/security logs, and recordings require explicit session controls and consent handling before capture.\n\nAttendance, homework, messages, uploaded files, and live-class features are handled inside the product workflow and should be configured by each school according to its own lawful basis and retention policy. File storage controls may include encrypted storage modes and deduplication-oriented handling depending on the configured storage adapter."
      },
      {
        title: "Storage, processors, and retention",
        body:
          `${providerLabels.length ? `Configured processors: ${providerLabels.join("; ")}.` : "Processor placeholders should be completed in the Legal / Compliance admin panel before launch."}\n\n${retentionLines.length ? `Configured retention windows: ${retentionLines.join("; ")}.` : "Retention windows should be completed in the Legal / Compliance admin panel before launch."}`
      },
      {
        title: "Security contact and launch readiness",
        body:
          `Security / privacy contact: ${settings.support_email || settings.privacy_email || settings.legal_email || "[security contact email required before launch]"}. Rotate secrets, confirm backup handling, verify processor contracts, and complete legal review before commercial launch.\n\nThese templates are operational/legal-product templates and must be reviewed by a qualified legal professional before commercial launch.`
      }
    ];
  }

  function updateLinks(locale) {
    if (!locale) return;
    document.querySelectorAll("[data-legal-link]").forEach((node) => {
      const href = node.getAttribute("href");
      if (!href) return;
      node.setAttribute("href", `${href}?locale=${encodeURIComponent(locale)}`);
    });
  }

  async function fetchJson(url) {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`);
    }
    return res.json();
  }

  async function load(settingsPayload) {
    const documentType = getDocumentType();
    const pageMode = getPageMode();
    const locale = getLocale();
    const settings = settingsPayload.settings || {};
    let legalDoc = {};
    let effectiveLocale = settings.locale_default || locale || "en";

    if (pageMode === "document") {
      const legalUrl = locale
        ? `/api/public/legal/${encodeURIComponent(documentType)}?locale=${encodeURIComponent(locale)}`
        : `/api/public/legal/${encodeURIComponent(documentType)}`;
      const documentPayload = await fetchJson(legalUrl);
      legalDoc = documentPayload.document || {};
      effectiveLocale = legalDoc.locale || effectiveLocale;
    }

    setText("legalPageTitle", legalDoc.title || document.body?.dataset?.legalFallbackTitle || "Legal document");
    setText("legalPageVersion", legalDoc.version || (pageMode === "trust" ? "Overview" : "—"));
    setText("legalPagePublishedAt", legalDoc.publishedAt || settings.published_at || "—");
    setText("legalPageCompanyName", settings.company_name || "");
    setText("legalPageOperatorName", settings.operator_name || "");
    setText("legalPageEmail", settings.legal_email || "");
    setText("legalPagePhone", settings.phone || "");
    setText("legalPageVatId", settings.vat_id || "");
    setText("legalPageSupportEmail", settings.support_email || settings.legal_email || "");
    setBadge(pageMode === "trust" ? (settings.published_at ? "Published" : "Draft") : (legalDoc.publishedAt ? "Published" : "Draft"));
    renderLines("legalPageAddress", [settings.legal_address || ""]);
    renderList("legalPageProviders", [
      { label: "Hosting", value: settings.providers?.hosting || "" },
      { label: "Video", value: settings.providers?.video || "" },
      { label: "AI", value: settings.providers?.ai || "" },
      { label: "Email", value: settings.providers?.email || "" },
      { label: "SMS", value: settings.providers?.sms || "" },
      { label: "Storage", value: settings.providers?.storage || "" },
      { label: "Analytics", value: settings.providers?.analytics || "" }
    ]);
    renderList("legalPageRetention", [
      { label: "Recordings", value: settings.retention?.recording_retention_days ? `${settings.retention.recording_retention_days} days` : "" },
      { label: "Security logs", value: settings.retention?.security_log_retention_days ? `${settings.retention.security_log_retention_days} days` : "" },
      { label: "Backups", value: settings.retention?.backup_retention_days ? `${settings.retention.backup_retention_days} days` : "" },
      { label: "Learning data", value: settings.retention?.learning_data_retention_months ? `${settings.retention.learning_data_retention_months} months` : "" }
    ]);
    if (pageMode === "trust") {
      renderSections("legalDocumentBody", buildTrustSections(settings));
    } else {
      renderParagraphs("legalDocumentBody", legalDoc.body || "");
    }
    updateLinks(effectiveLocale);
  }

  async function boot() {
    try {
      var settingsPayload = await fetchJson("/api/public/legal-settings");
      const settingsPayload = await fetchJson("/api/public/legal-settings");
      await load(settingsPayload);
    } catch (err) {
      console.error("Failed to load legal document", err);
      setText("legalPageTitle", "Legal document unavailable");
      renderParagraphs(
        "legalDocumentBody",
        "The published legal document could not be loaded. Please try again later."
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
