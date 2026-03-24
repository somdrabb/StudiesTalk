(function () {
  window.__liveSessionActive = true;
  window.__disableHumanDuringLive = true;
  document.body.classList.add("live-session-active");

  const statusEl = document.getElementById("presenterStatus");
  const titleEl = document.getElementById("presenterTitle");
  const metaEl = document.getElementById("presenterMeta");
  const canvas = document.getElementById("presenterCanvas");
  const emptyEl = document.getElementById("presenterEmpty");

  let slidesPdf = null;
  let slidesPdfUrl = null;
  let slidesPage = 1;
  let slidesPageCount = 1;
  let slideStream = null;

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  async function refreshAuth() {
    await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": getCsrfToken()
      }
    }).catch(() => null);
  }

  async function apiFetch(path) {
    let res = await fetch(path, {
      credentials: "include",
      cache: "no-store"
    });
    if (res.status === 401) {
      await refreshAuth();
      res = await fetch(path, {
        credentials: "include",
        cache: "no-store"
      });
    }
    return res;
  }

  async function fetchJSON(path) {
    const res = await apiFetch(path);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text || res.statusText || "Request failed");
    }
    return res.json();
  }

  function parsePresenterRoute() {
    const match = window.location.pathname.match(/^\/channels\/([^/]+)\/live\/([^/]+)\/presenter\/?$/);
    if (!match) return null;
    return {
      channelId: decodeURIComponent(match[1]),
      sessionId: decodeURIComponent(match[2])
    };
  }

  function updateEmptyState(show) {
    if (emptyEl) emptyEl.style.display = show ? "" : "none";
  }

  async function loadPdf(url) {
    if (!url || !window.pdfjsLib || !canvas) return;
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js";
    slidesPdf = await window.pdfjsLib.getDocument(url).promise;
    slidesPdfUrl = url;
    slidesPageCount = slidesPdf.numPages || 1;
    updateEmptyState(false);
  }

  async function renderPdfPage(pageNum) {
    if (!slidesPdf || !canvas) return;
    const safe = Math.max(1, Math.min(pageNum, slidesPageCount));
    slidesPage = safe;

    const page = await slidesPdf.getPage(safe);
    const wrapWidth = canvas.parentElement?.clientWidth || window.innerWidth || 1280;
    const wrapHeight = canvas.parentElement?.clientHeight || window.innerHeight || 720;
    const viewportBase = page.getViewport({ scale: 1 });
    const scale = Math.max(0.5, Math.min(3, Math.min(
      (wrapWidth - 24) / viewportBase.width,
      (wrapHeight - 24) / viewportBase.height
    )));
    const viewport = page.getViewport({ scale });

    const ctx = canvas.getContext("2d");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
  }

  async function applySlideState(state) {
    const deckUrl = state?.deck_url || null;
    const page = Number(state?.page || 1);
    const pageCount = Number(state?.page_count || 1);

    slidesPageCount = pageCount || 1;
    if (!deckUrl) {
      slidesPdf = null;
      slidesPdfUrl = null;
      slidesPage = 1;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      updateEmptyState(true);
      setStatus("Waiting for slides");
      return;
    }

    if (deckUrl !== slidesPdfUrl) {
      setStatus("Loading slides");
      await loadPdf(deckUrl);
    }

    await renderPdfPage(page);
    setStatus(`Presenting ${slidesPage} / ${slidesPageCount}`);
  }

  async function loadSessionMeta(sessionId) {
    const sessions = await fetchJSON("/api/live-sessions?scope=all");
    return Array.isArray(sessions) ? sessions.find((session) => String(session.id) === String(sessionId)) || null : null;
  }

  function startSlideStream(sessionId) {
    if (slideStream) {
      slideStream.close();
      slideStream = null;
    }
    slideStream = new EventSource(`/api/live-sessions/${encodeURIComponent(sessionId)}/slides/stream`, { withCredentials: true });

    slideStream.addEventListener("slide", async (event) => {
      try {
        await applySlideState(JSON.parse(event.data));
      } catch (err) {
        console.error("Presenter slide parse error", err);
      }
    });

    slideStream.addEventListener("session", (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === "ended") {
          setStatus("Session ended");
        }
      } catch (_err) {}
    });

    slideStream.onerror = async () => {
      slideStream?.close();
      slideStream = null;
      setStatus("Reconnecting");
      await refreshAuth();
      window.setTimeout(() => startSlideStream(sessionId), 2500);
    };
  }

  async function boot() {
    const route = parsePresenterRoute();
    if (!route?.sessionId) {
      setStatus("Invalid presenter link");
      return;
    }

    setStatus("Preparing presenter");
    await refreshAuth();

    try {
      const session = await loadSessionMeta(route.sessionId);
      if (titleEl) titleEl.textContent = session?.title || "Live session";
      if (metaEl) {
        metaEl.textContent = session?.channel_name
          ? `${session.channel_name} • Share this tab in Jitsi for lower-latency presentation.`
          : "Share this tab in Jitsi for lower-latency presentation.";
      }
    } catch (err) {
      console.error("Presenter session load failed", err);
    }

    try {
      const state = await fetchJSON(`/api/live-sessions/${encodeURIComponent(route.sessionId)}/slides/state`);
      await applySlideState(state);
      startSlideStream(route.sessionId);
    } catch (err) {
      console.error("Presenter slide load failed", err);
      setStatus("Could not load presenter");
      updateEmptyState(true);
    }
  }

  window.addEventListener("beforeunload", () => {
    slideStream?.close();
  });

  window.addEventListener("resize", () => {
    if (slidesPdf) {
      renderPdfPage(slidesPage).catch(() => {});
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    boot().catch((err) => {
      console.error("Presenter boot failed", err);
      setStatus("Presenter unavailable");
    });
  });
})();
