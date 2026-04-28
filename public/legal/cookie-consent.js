"use strict";

(function initLegalCookieConsent() {
  const STORAGE_KEY = "studiestalk_cookie_consent";
  const CHOICES = new Set(["necessary", "all"]);

  function readChoice() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return CHOICES.has(value) ? value : "";
    } catch (_err) {
      return "";
    }
  }

  function writeChoice(value) {
    if (!CHOICES.has(value)) return;
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (_err) {}
  }

  function removeBanner() {
    const existing = document.getElementById("cookieConsentBanner");
    if (existing) existing.remove();
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
      .cookie-consent-copy {
        display: grid;
        gap: 8px;
        max-width: 780px;
      }
      .cookie-consent-title {
        margin: 0;
        font-size: 15px;
        font-weight: 800;
        color: #0f172a;
      }
      .cookie-consent-text {
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
      .cookie-consent-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
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
      html[data-theme="dark"] .cookie-consent-banner {
        border-color: rgba(71, 85, 105, 0.52);
        background: rgba(15, 23, 42, 0.95);
        box-shadow: 0 24px 50px rgba(2, 6, 23, 0.4);
      }
      html[data-theme="dark"] .cookie-consent-title {
        color: rgba(241, 245, 249, 0.96);
      }
      html[data-theme="dark"] .cookie-consent-text {
        color: rgba(203, 213, 225, 0.8);
      }
      html[data-theme="dark"] .cookie-consent-btn {
        border-color: rgba(71, 85, 105, 0.52);
        background: rgba(15, 23, 42, 0.78);
        color: rgba(241, 245, 249, 0.96);
      }
      @media (max-width: 760px) {
        .cookie-consent-banner {
          flex-direction: column;
          align-items: stretch;
        }
        .cookie-consent-actions {
          justify-content: stretch;
        }
        .cookie-consent-btn {
          flex: 1 1 auto;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function renderBanner() {
    if (readChoice()) return;
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
    copy.innerHTML = `
      <p class="cookie-consent-title">Cookie notice</p>
      <p class="cookie-consent-text">We use necessary cookies for login and security. Optional cookies are only used with consent.</p>
    `;
    const links = document.createElement("div");
    links.className = "cookie-consent-links";
    links.appendChild(createLink("Privacy", "/privacy"));
    copy.appendChild(links);

    const actions = document.createElement("div");
    actions.className = "cookie-consent-actions";

    const necessaryBtn = document.createElement("button");
    necessaryBtn.type = "button";
    necessaryBtn.className = "cookie-consent-btn";
    necessaryBtn.textContent = "Accept necessary";
    necessaryBtn.addEventListener("click", () => {
      writeChoice("necessary");
      removeBanner();
    });

    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "cookie-consent-btn cookie-consent-btn-primary";
    allBtn.textContent = "Accept all";
    allBtn.addEventListener("click", () => {
      writeChoice("all");
      removeBanner();
    });

    actions.appendChild(necessaryBtn);
    actions.appendChild(allBtn);
    banner.appendChild(copy);
    banner.appendChild(actions);
    document.body.appendChild(banner);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderBanner, { once: true });
  } else {
    renderBanner();
  }
})();
