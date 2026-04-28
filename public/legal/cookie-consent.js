"use strict";

(function initStudiesTalkCookieConsent() {
  const STORAGE_KEY = "studiestalk_cookie_consent_v1";
  const CONSENT_VERSION = "v1";

  function defaultConsent() {
    return {
      necessary: true,
      analytics: false,
      acceptedAt: "",
      version: CONSENT_VERSION
    };
  }

  function readConsent() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return {
        necessary: true,
        analytics: !!parsed.analytics,
        acceptedAt: typeof parsed.acceptedAt === "string" ? parsed.acceptedAt : "",
        version: typeof parsed.version === "string" ? parsed.version : CONSENT_VERSION
      };
    } catch (_err) {
      return null;
    }
  }

  function writeConsent(consent) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    } catch (_err) {}
  }

  function ensureManageLink() {
    [
      document.getElementById("appManageCookiesLink"),
      document.getElementById("loginManageCookiesLink"),
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
    link.textContent = "Manage cookies";
    footer.appendChild(link);
    ensureManageLink();
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
        font-family: "Inter", system-ui, sans-serif;
      }
      .cookie-consent-copy { display: grid; gap: 8px; max-width: 780px; }
      .cookie-consent-title { margin: 0; font-size: 15px; font-weight: 800; color: #0f172a; }
      .cookie-consent-text { margin: 0; font-size: 13px; line-height: 1.55; color: #475569; }
      .cookie-consent-links { display: inline-flex; flex-wrap: wrap; gap: 10px; }
      .cookie-consent-link { color: #2563eb; text-decoration: none; font-size: 13px; font-weight: 700; }
      .cookie-consent-link:hover { text-decoration: underline; }
      .cookie-consent-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; }
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
      html[data-theme="dark"] .cookie-consent-banner {
        border-color: rgba(71, 85, 105, 0.52);
        background: rgba(15, 23, 42, 0.95);
        box-shadow: 0 24px 50px rgba(2, 6, 23, 0.4);
      }
      html[data-theme="dark"] .cookie-consent-title { color: rgba(241, 245, 249, 0.96); }
      html[data-theme="dark"] .cookie-consent-text { color: rgba(203, 213, 225, 0.8); }
      html[data-theme="dark"] .cookie-consent-btn {
        border-color: rgba(71, 85, 105, 0.52);
        background: rgba(15, 23, 42, 0.78);
        color: rgba(241, 245, 249, 0.96);
      }
      @media (max-width: 760px) {
        .cookie-consent-banner { flex-direction: column; align-items: stretch; }
        .cookie-consent-actions { justify-content: stretch; }
        .cookie-consent-btn { flex: 1 1 auto; }
      }
    `;
    document.head.appendChild(style);
  }

  function removeBanner() {
    const existing = document.getElementById("cookieConsentBanner");
    if (existing) existing.remove();
  }

  function acceptConsent(analytics) {
    const consent = {
      necessary: true,
      analytics: !!analytics,
      acceptedAt: new Date().toISOString(),
      version: CONSENT_VERSION
    };
    writeConsent(consent);
    removeBanner();
    ensureManageLink();
  }

  function renderBanner(force = false) {
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
    text.textContent = "We use necessary cookies for login and security. Optional analytics cookies are disabled by default and only used with consent.";
    const links = document.createElement("div");
    links.className = "cookie-consent-links";
    links.appendChild(createLink("Privacy", "/privacy"));
    links.appendChild(createLink("Manage cookies", "#"));
    links.lastChild.addEventListener("click", (event) => {
      event.preventDefault();
      window.StudiesTalkCookieConsent.open();
    });
    copy.appendChild(title);
    copy.appendChild(text);
    copy.appendChild(links);

    const actions = document.createElement("div");
    actions.className = "cookie-consent-actions";

    const necessaryBtn = document.createElement("button");
    necessaryBtn.type = "button";
    necessaryBtn.className = "cookie-consent-btn";
    necessaryBtn.textContent = "Accept necessary";
    necessaryBtn.addEventListener("click", () => acceptConsent(false));

    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "cookie-consent-btn cookie-consent-btn-primary";
    allBtn.textContent = "Accept all";
    allBtn.addEventListener("click", () => acceptConsent(true));

    actions.appendChild(necessaryBtn);
    actions.appendChild(allBtn);
    banner.appendChild(copy);
    banner.appendChild(actions);
    document.body.appendChild(banner);
  }

  window.StudiesTalkCookieConsent = {
    open() {
      renderBanner(true);
    },
    read() {
      return readConsent() || defaultConsent();
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        renderBanner(false);
        ensureManageLink();
      },
      { once: true }
    );
  } else {
    renderBanner(false);
    ensureManageLink();
  }
})();
