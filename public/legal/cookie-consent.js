"use strict";

(function initStudiesTalkCookieConsent() {
  const STORAGE_KEY = "studiestalk_cookie_consent_v1";
  const CONSENT_VERSION = "1.0";

  function defaultConsent() {
    return {
      version: CONSENT_VERSION,
      necessary: true,
      analytics: false,
      acceptedAt: "",
      updatedAt: ""
    };
  }

  function normalizeConsent(value) {
    const base = defaultConsent();
    if (!value || typeof value !== "object") return base;
    return {
      version: typeof value.version === "string" && value.version.trim() ? value.version.trim() : CONSENT_VERSION,
      necessary: true,
      analytics: !!value.analytics,
      acceptedAt: typeof value.acceptedAt === "string" ? value.acceptedAt : "",
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : ""
    };
  }

  function readConsent() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return normalizeConsent(JSON.parse(raw));
    } catch (_err) {
      return null;
    }
  }

  function dispatchConsent(consent) {
    window.dispatchEvent(new CustomEvent("studiestalk:cookie-consent-updated", {
      detail: consent
    }));
  }

  function writeConsent(next) {
    const now = new Date().toISOString();
    const existing = readConsent();
    const consent = normalizeConsent({
      ...next,
      acceptedAt: existing?.acceptedAt || now,
      updatedAt: now
    });
    if (!consent.acceptedAt) consent.acceptedAt = now;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    } catch (_err) {}
    dispatchConsent(consent);
    return consent;
  }

  function ensureManageLink() {
    [
      document.getElementById("appManageCookiesLink"),
      document.getElementById("loginManageCookiesLink"),
      document.getElementById("adminManageCookiesLink"),
      document.getElementById("adminManageCookiesFooterLink"),
      document.getElementById("cookieManageLink")
    ].filter(Boolean).forEach((link) => {
      if (link.dataset.cookieBound === "1") return;
      link.dataset.cookieBound = "1";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        window.StudiesTalkCookieConsent.open();
      });
    });

    if (document.getElementById("cookieManageLink")) return;
    const footer = document.querySelector(".legal-footnav") || document.querySelector(".login-overlay-footer");
    if (!footer) return;
    const link = document.createElement("a");
    link.id = "cookieManageLink";
    link.href = "#";
    link.className = "legal-nav-link";
    link.textContent = "Cookie settings";
    footer.appendChild(link);
    ensureManageLink();
  }

  function createButton(label, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
  }

  function createLink(label, href) {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    link.className = "cookie-consent-link";
    return link;
  }

  function injectStyles() {
    if (document.getElementById("cookieConsentStyles")) return;
    const style = document.createElement("style");
    style.id = "cookieConsentStyles";
    style.textContent = `
      .cookie-consent-banner,
      .cookie-consent-modal-card {
        font-family: "Inter", system-ui, sans-serif;
      }
      .cookie-consent-banner {
        position: fixed;
        left: 16px;
        right: 16px;
        bottom: 16px;
        z-index: 9999;
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 16px;
        padding: 16px 18px;
        border-radius: 18px;
        border: 1px solid rgba(203, 213, 225, 0.92);
        background: rgba(255, 255, 255, 0.97);
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
        backdrop-filter: blur(16px);
      }
      .cookie-consent-copy,
      .cookie-consent-modal-copy {
        display: grid;
        gap: 8px;
      }
      .cookie-consent-copy {
        max-width: 780px;
      }
      .cookie-consent-title,
      .cookie-consent-modal-title {
        margin: 0;
        font-size: 15px;
        font-weight: 800;
        color: #0f172a;
      }
      .cookie-consent-text,
      .cookie-consent-modal-text {
        margin: 0;
        font-size: 13px;
        line-height: 1.55;
        color: #475569;
      }
      .cookie-consent-links {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .cookie-consent-link {
        color: #2563eb;
        text-decoration: none;
        font-size: 13px;
        font-weight: 700;
      }
      .cookie-consent-link:hover {
        text-decoration: underline;
      }
      .cookie-consent-actions,
      .cookie-consent-modal-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .cookie-consent-actions {
        justify-content: flex-end;
      }
      .cookie-consent-btn {
        min-height: 40px;
        padding: 0 14px;
        border-radius: 999px;
        border: 1px solid rgba(203, 213, 225, 0.96);
        background: #ffffff;
        color: #0f172a;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
      }
      .cookie-consent-btn-primary {
        border-color: rgba(37, 99, 235, 0.24);
        background: linear-gradient(135deg, #2563eb, #1d4ed8);
        color: #ffffff;
      }
      .cookie-consent-modal {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(15, 23, 42, 0.52);
      }
      .cookie-consent-modal.is-open {
        display: flex;
      }
      .cookie-consent-modal-card {
        width: min(560px, 100%);
        display: grid;
        gap: 18px;
        padding: 22px;
        border-radius: 22px;
        border: 1px solid rgba(203, 213, 225, 0.92);
        background: rgba(255, 255, 255, 0.99);
        box-shadow: 0 28px 60px rgba(15, 23, 42, 0.18);
      }
      .cookie-consent-modal-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }
      .cookie-consent-close {
        width: 38px;
        height: 38px;
        border-radius: 12px;
        border: 1px solid rgba(203, 213, 225, 0.92);
        background: #ffffff;
        color: #0f172a;
        cursor: pointer;
      }
      .cookie-consent-option-list {
        display: grid;
        gap: 12px;
      }
      .cookie-consent-option {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 12px;
        padding: 14px;
        border-radius: 16px;
        border: 1px solid rgba(226, 232, 240, 0.96);
        background: rgba(248, 250, 252, 0.88);
      }
      .cookie-consent-option input {
        margin-top: 4px;
      }
      .cookie-consent-option strong {
        display: block;
        margin-bottom: 4px;
        font-size: 14px;
        color: #0f172a;
      }
      .cookie-consent-option span {
        display: block;
        font-size: 13px;
        line-height: 1.55;
        color: #475569;
      }
      html[data-theme="dark"] .cookie-consent-banner,
      html[data-theme="dark"] .cookie-consent-modal-card {
        border-color: rgba(71, 85, 105, 0.52);
        background: rgba(15, 23, 42, 0.95);
        box-shadow: 0 24px 50px rgba(2, 6, 23, 0.4);
      }
      html[data-theme="dark"] .cookie-consent-title,
      html[data-theme="dark"] .cookie-consent-modal-title {
        color: rgba(241, 245, 249, 0.96);
      }
      html[data-theme="dark"] .cookie-consent-text,
      html[data-theme="dark"] .cookie-consent-modal-text,
      html[data-theme="dark"] .cookie-consent-option span {
        color: rgba(203, 213, 225, 0.8);
      }
      html[data-theme="dark"] .cookie-consent-btn,
      html[data-theme="dark"] .cookie-consent-close,
      html[data-theme="dark"] .cookie-consent-option {
        border-color: rgba(71, 85, 105, 0.52);
        background: rgba(15, 23, 42, 0.78);
        color: rgba(241, 245, 249, 0.96);
      }
      html[data-theme="dark"] .cookie-consent-option strong {
        color: rgba(241, 245, 249, 0.96);
      }
      @media (max-width: 760px) {
        .cookie-consent-banner {
          flex-direction: column;
          align-items: stretch;
        }
        .cookie-consent-actions,
        .cookie-consent-modal-actions {
          justify-content: stretch;
        }
        .cookie-consent-btn {
          flex: 1 1 auto;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function removeBanner() {
    const existing = document.getElementById("cookieConsentBanner");
    if (existing) existing.remove();
  }

  function getModal() {
    return document.getElementById("cookieConsentModal");
  }

  function closeModal() {
    getModal()?.classList.remove("is-open");
  }

  function syncModalForm(consent) {
    const analytics = document.getElementById("cookieConsentAnalytics");
    if (analytics) analytics.checked = !!consent.analytics;
  }

  function applyConsent(next) {
    const consent = writeConsent(next);
    syncModalForm(consent);
    removeBanner();
    ensureManageLink();
    closeModal();
    return consent;
  }

  function createModal() {
    if (getModal()) return getModal();
    injectStyles();
    const modal = document.createElement("div");
    modal.id = "cookieConsentModal";
    modal.className = "cookie-consent-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Cookie settings");

    const card = document.createElement("div");
    card.className = "cookie-consent-modal-card";

    const head = document.createElement("div");
    head.className = "cookie-consent-modal-head";
    const copy = document.createElement("div");
    copy.className = "cookie-consent-modal-copy";
    const title = document.createElement("p");
    title.className = "cookie-consent-modal-title";
    title.textContent = "Cookie settings";
    const text = document.createElement("p");
    text.className = "cookie-consent-modal-text";
    text.textContent = "Necessary cookies remain enabled for login and security. Optional analytics cookies stay off unless you enable them.";
    copy.appendChild(title);
    copy.appendChild(text);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "cookie-consent-close";
    close.setAttribute("aria-label", "Close cookie settings");
    close.textContent = "×";
    close.addEventListener("click", closeModal);
    head.appendChild(copy);
    head.appendChild(close);

    const options = document.createElement("div");
    options.className = "cookie-consent-option-list";

    const necessary = document.createElement("label");
    necessary.className = "cookie-consent-option";
    necessary.innerHTML = '<input type="checkbox" checked disabled /><div><strong>Necessary cookies</strong><span>Required for authentication, session handling, and basic security controls.</span></div>';

    const analytics = document.createElement("label");
    analytics.className = "cookie-consent-option";
    const analyticsInput = document.createElement("input");
    analyticsInput.type = "checkbox";
    analyticsInput.id = "cookieConsentAnalytics";
    const analyticsText = document.createElement("div");
    const analyticsTitle = document.createElement("strong");
    analyticsTitle.textContent = "Analytics cookies";
    const analyticsBody = document.createElement("span");
    analyticsBody.textContent = "Optional analytics cookies stay disabled by default and should only be enabled where you have decided to use analytics tooling.";
    analyticsText.appendChild(analyticsTitle);
    analyticsText.appendChild(analyticsBody);
    analytics.appendChild(analyticsInput);
    analytics.appendChild(analyticsText);

    options.appendChild(necessary);
    options.appendChild(analytics);

    const actions = document.createElement("div");
    actions.className = "cookie-consent-modal-actions";
    actions.appendChild(createButton("Accept necessary", "cookie-consent-btn", () => applyConsent({ analytics: false })));
    actions.appendChild(createButton("Reject optional", "cookie-consent-btn", () => applyConsent({ analytics: false })));
    actions.appendChild(createButton("Save settings", "cookie-consent-btn", () => {
      applyConsent({ analytics: !!analyticsInput.checked });
    }));
    actions.appendChild(createButton("Accept all", "cookie-consent-btn cookie-consent-btn-primary", () => applyConsent({ analytics: true })));

    card.appendChild(head);
    card.appendChild(options);
    card.appendChild(actions);
    modal.appendChild(card);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });
    document.body.appendChild(modal);
    return modal;
  }

  function openModal() {
    const modal = createModal();
    syncModalForm(readConsent() || defaultConsent());
    modal.classList.add("is-open");
  }

  function renderBanner(force) {
    const existingConsent = readConsent();
    if (!force && existingConsent) {
      ensureManageLink();
      return;
    }
    removeBanner();
    injectStyles();

    const banner = document.createElement("section");
    banner.id = "cookieConsentBanner";
    banner.className = "cookie-consent-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-label", "Cookie preferences");

    const copy = document.createElement("div");
    copy.className = "cookie-consent-copy";
    const title = document.createElement("p");
    title.className = "cookie-consent-title";
    title.textContent = "Cookie notice";
    const text = document.createElement("p");
    text.className = "cookie-consent-text";
    text.textContent = "We use necessary cookies for login and security. Optional cookies are only used with consent.";
    const links = document.createElement("div");
    links.className = "cookie-consent-links";
    links.appendChild(createLink("Privacy", "/privacy"));
    const settingsLink = createLink("Cookie settings", "#");
    settingsLink.addEventListener("click", (event) => {
      event.preventDefault();
      openModal();
    });
    links.appendChild(settingsLink);
    copy.appendChild(title);
    copy.appendChild(text);
    copy.appendChild(links);

    const actions = document.createElement("div");
    actions.className = "cookie-consent-actions";
    actions.appendChild(createButton("Accept necessary", "cookie-consent-btn", () => applyConsent({ analytics: false })));
    actions.appendChild(createButton("Reject optional", "cookie-consent-btn", () => applyConsent({ analytics: false })));
    actions.appendChild(createButton("Manage settings", "cookie-consent-btn", openModal));
    actions.appendChild(createButton("Accept all", "cookie-consent-btn cookie-consent-btn-primary", () => applyConsent({ analytics: true })));

    banner.appendChild(copy);
    banner.appendChild(actions);
    document.body.appendChild(banner);
  }

  window.StudiesTalkCookieConsent = {
    open() {
      openModal();
    },
    read() {
      return readConsent() || defaultConsent();
    },
    canLoadAnalytics() {
      return !!(readConsent() || defaultConsent()).analytics;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      createModal();
      renderBanner(false);
      ensureManageLink();
    }, { once: true });
  } else {
    createModal();
    renderBanner(false);
    ensureManageLink();
  }
})();
