"use strict";

(function placementTestChannelBootstrap() {
  const ROOT_CLASS = "placement-test-channel-active";
  const HEADER_SELECTOR = "#chatHeader";

  function isPlacementTestActive() {
    const header = document.querySelector(HEADER_SELECTOR);
    if (!header) return false;
    return header.classList.contains("placement-test-header");
  }

  function applyPlacementTestState() {
    const active = isPlacementTestActive();
    document.body?.classList.toggle(ROOT_CLASS, active);
    document.documentElement?.classList.toggle(ROOT_CLASS, active);
    window.dispatchEvent(
      new CustomEvent("placement-test:state-change", {
        detail: { active }
      })
    );
    return active;
  }

  function observePlacementTestState() {
    const header = document.querySelector(HEADER_SELECTOR);
    if (!header) return;
    const observer = new MutationObserver(() => {
      applyPlacementTestState();
    });
    observer.observe(header, {
      attributes: true,
      attributeFilter: ["class", "data-channel-id"]
    });
  }

  window.PlacementTestChannel = {
    applyState: applyPlacementTestState,
    isActive: isPlacementTestActive
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      applyPlacementTestState();
      observePlacementTestState();
    }, { once: true });
  } else {
    applyPlacementTestState();
    observePlacementTestState();
  }
})();
