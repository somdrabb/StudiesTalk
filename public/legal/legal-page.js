"use strict";

(function initLegalPage() {
  function getDocumentType() {
    return document.body?.dataset?.legalDocument || "privacy";
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

  async function load() {
    const documentType = getDocumentType();
    const locale = getLocale();
    const legalUrl = locale
      ? `/api/public/legal/${encodeURIComponent(documentType)}?locale=${encodeURIComponent(locale)}`
      : `/api/public/legal/${encodeURIComponent(documentType)}`;
    const [settingsPayload, documentPayload] = await Promise.all([
      fetchJson("/api/public/legal-settings"),
      fetchJson(legalUrl)
    ]);

    const settings = settingsPayload.settings || {};
    const legalDoc = documentPayload.document || {};
    const effectiveLocale = legalDoc.locale || settings.locale_default || locale || "en";

    setText("legalPageTitle", legalDoc.title || document.body?.dataset?.legalFallbackTitle || "Legal document");
    setText("legalPageVersion", legalDoc.version || "—");
    setText("legalPagePublishedAt", legalDoc.publishedAt || settings.published_at || "—");
    setText("legalPageCompanyName", settings.company_name || "");
    setText("legalPageOperatorName", settings.operator_name || "");
    setText("legalPageEmail", settings.legal_email || "");
    setText("legalPagePhone", settings.phone || "");
    setText("legalPageVatId", settings.vat_id || "");
    setText("legalPageSupportEmail", settings.support_email || settings.legal_email || "");
    setBadge(legalDoc.publishedAt ? "Published" : "Draft");
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
    renderParagraphs("legalDocumentBody", legalDoc.body || "");
    updateLinks(effectiveLocale);
  }

  async function boot() {
    try {
      await load();
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
