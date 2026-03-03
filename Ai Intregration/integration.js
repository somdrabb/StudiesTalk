"use strict";

// ---- Live session end guard ----
let liveJitsiApi = null;
let liveEndSent = false;

function resetLiveEndGuard() {
  liveEndSent = false;
}

function isTeacherUser() {
  if (typeof isAdminUser === "function") return isAdminUser();
  const role = String(sessionUser?.role || sessionUser?.user_role || "").toLowerCase();
  if (role === "admin" || role === "super_admin" || role === "school_admin") return true;
  return role === "teacher" || role === "owner";
}

function isMembersOnlyFailure(payload) {
  const name = String(payload?.name || payload?.error || "").toLowerCase();
  const msg = String(payload?.message || payload?.error?.message || "").toLowerCase();
  return (
    name.includes("membersonly") ||
    msg.includes("membersonly") ||
    msg.includes("members only") ||
    msg.includes("moderators have yet arrived") ||
    msg.includes("please log-in") ||
    msg.includes("please log in")
  );
}

async function endLiveSessionIfTeacher(sessionId, reason = "") {
  if (!sessionId) return;
  if (liveEndSent) return;
  if (!isTeacherUser()) return;
  if (reason === "membersOnly") return;

  try {
    liveEndSent = true;
    await fetchJSON(`/api/live-sessions/${encodeURIComponent(sessionId)}/end`, {
      method: "POST"
    });
  } catch (err) {
    liveEndSent = false;
    console.error("Failed to end live session", err);
  }
}

function wireJitsiSessionEvents(api, sessionId) {
  if (!api || !sessionId) return;

  api.addEventListener("conferenceFailed", (payload) => {
    console.warn("Jitsi conferenceFailed:", payload);
    if (isMembersOnlyFailure(payload)) {
      if (typeof showToast === "function") {
        showToast(
          "This room requires a moderator login on meet.jit.si. Use self-hosted Jitsi or JWT to avoid this roadblock."
        );
      }
      return;
    }
    if (isTeacherUser() && typeof showToast === "function") {
      showToast("Conference failed. Please try again.");
    }
  });

  api.addEventListener("videoConferenceLeft", () => {
    console.log("Jitsi videoConferenceLeft");
    endLiveSessionIfTeacher(sessionId, "left");
  });

  api.addEventListener("readyToClose", () => {
    console.log("Jitsi readyToClose");
    endLiveSessionIfTeacher(sessionId, "close");
  });
}

function loadJitsiExternalApi(domain) {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) return resolve(window.JitsiMeetExternalAPI);

    const src = `https://${domain}/external_api.js`;
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.JitsiMeetExternalAPI));
      existing.addEventListener("error", () => reject(new Error("Failed to load Jitsi API")));
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve(window.JitsiMeetExternalAPI);
    script.onerror = () => reject(new Error("Failed to load Jitsi API"));
    document.body.appendChild(script);
  });
}

function parseJitsiRoomFromUrl(url) {
  try {
    const u = new URL(url);
    const room = u.pathname.replace(/^\/+/, "").split("/")[0];
    return room || null;
  } catch (_e) {
    return null;
  }
}

async function openLiveMeetingEmbed(meetingUrl) {
  const container = document.getElementById("liveMeetContainer");
  if (!container) return;

  resetLiveEndGuard();
  resetRecordingButtons();

  const domain = window.__JITSI_DOMAIN__ || "meet.jit.si";
  const roomName = parseJitsiRoomFromUrl(meetingUrl);

  if (!roomName) {
    container.innerHTML = `<div class="muted" style="padding:14px;">Invalid meeting URL.</div>`;
    return;
  }

  await loadJitsiExternalApi(domain);

  if (liveJitsiApi) {
    try {
      liveJitsiApi.dispose();
    } catch (_e) {}
    liveJitsiApi = null;
  }

  container.innerHTML = "";

  liveJitsiApi = new window.JitsiMeetExternalAPI(domain, {
    roomName,
    parentNode: container,
    width: "100%",
    height: "100%",
    userInfo: {
      displayName: sessionUser?.name || sessionUser?.displayName || "Student"
    },
    configOverwrite: {
      disableInviteFunctions: true,
      enableWelcomePage: false
    }
  });

  wireJitsiSessionEvents(liveJitsiApi, activeLiveSessionId);
}

function leaveLiveMeetingEmbed() {
  if (liveJitsiApi) {
    try {
      liveJitsiApi.executeCommand("hangup");
      liveJitsiApi.dispose();
    } catch (_e) {}
    liveJitsiApi = null;
  }
  if (stopSlidesSse) {
    stopSlidesSse();
    stopSlidesSse = null;
  }
  activeLiveSessionId = null;
  const container = document.getElementById("liveMeetContainer");
  if (container) {
    container.innerHTML = `<div class="muted" style="padding:14px;">Join a session to start video.</div>`;
  }
  setLiveJoinedState(false);
  resetRecordingButtons();
}

async function joinLiveSession(sessionId) {
  try {
    const session = liveSessions?.find((s) => String(s.id) === String(sessionId));
    if (!session?.meeting_url) {
      showToast("This session has no meeting link.");
      return;
    }

    activeLiveSessionId = String(sessionId);
    setSlidesControlsVisibility();
    liveEndSent = false;

    await fetchJSON(`/api/live-sessions/${sessionId}/join`, { method: "POST" });
    await openLiveMeetingEmbed(session.meeting_url);

    await loadInitialSlideState(sessionId);
    startSlidesSse(sessionId);
    setLiveJoinedState(true);

    showToast("Joined session.");
  } catch (err) {
    console.error("Failed to join session", err);
    showToast("Could not join session.");
  }
}

// ---------- Slides (PDF.js) ----------
let slidesPdf = null;
let slidesPdfUrl = null;
let slidesPage = 1;
let slidesPageCount = 1;
let stopSlidesSse = null;
let activeLiveSessionId = null;

const slidesCanvas = document.getElementById("slidesCanvas");
const slidesEmpty = document.getElementById("slidesEmpty");
const slidePagePill = document.getElementById("slidePagePill");
const slidePrevBtn = document.getElementById("slidePrevBtn");
const slideNextBtn = document.getElementById("slideNextBtn");
const liveRecStartBtn = document.getElementById("liveRecStartBtn");
const liveRecStopBtn = document.getElementById("liveRecStopBtn");

function setSlidesControlsVisibility() {
  const canControl = isAdminUser?.() || isTeacherUser?.();
  if (slidePrevBtn) slidePrevBtn.hidden = !canControl;
  if (slideNextBtn) slideNextBtn.hidden = !canControl;
}

function setLiveJoinedState(joined) {
  const slidesEl = document.querySelector(".live-slides");
  const rightCol = document.querySelector(".live-right");
  if (slidesEl) slidesEl.style.display = joined ? "" : "none";
  if (rightCol) {
    rightCol.style.gridTemplateRows = joined ? "1fr 0.72fr" : "1fr";
  }
}

function canUseRecording() {
  const domain = window.__JITSI_DOMAIN__ || "";
  return domain.includes("studistalk.de");
}

function resetRecordingButtons() {
  if (liveRecStartBtn) liveRecStartBtn.hidden = !canUseRecording();
  if (liveRecStopBtn) liveRecStopBtn.hidden = true;
}

function updateSlidePill() {
  if (!slidePagePill) return;
  slidePagePill.textContent = `${slidesPage} / ${slidesPageCount}`;
}

async function loadPdf(url) {
  if (!url || !window.pdfjsLib || !slidesCanvas) return;
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js";

  slidesPdf = await window.pdfjsLib.getDocument(url).promise;
  slidesPdfUrl = url;
  slidesPageCount = slidesPdf.numPages || 1;
  if (slidesEmpty) slidesEmpty.style.display = "none";
  updateSlidePill();
}

async function renderPdfPage(pageNum) {
  if (!slidesPdf || !slidesCanvas) return;
  const safe = Math.max(1, Math.min(pageNum, slidesPageCount));
  slidesPage = safe;
  updateSlidePill();

  const page = await slidesPdf.getPage(safe);
  const containerWidth = slidesCanvas.parentElement?.clientWidth || 800;
  const vp1 = page.getViewport({ scale: 1 });
  const scale = Math.max(0.5, Math.min(2.5, (containerWidth - 24) / vp1.width));
  const viewport = page.getViewport({ scale });

  const ctx = slidesCanvas.getContext("2d");
  slidesCanvas.width = Math.floor(viewport.width);
  slidesCanvas.height = Math.floor(viewport.height);

  await page.render({ canvasContext: ctx, viewport }).promise;
}

async function applySlideState(state) {
  const deckUrl = state?.deck_url || null;
  const page = Number(state?.page || 1);
  const pageCount = Number(state?.page_count || 1);

  slidesPageCount = pageCount;

  if (!deckUrl) {
    slidesPdf = null;
    slidesPdfUrl = null;
    slidesPage = 1;
    updateSlidePill();
    if (slidesEmpty) slidesEmpty.style.display = "";
    if (slidesCanvas) slidesCanvas.width = slidesCanvas.height = 0;
    return;
  }

  if (deckUrl !== slidesPdfUrl) {
    await loadPdf(deckUrl);
  }

  await renderPdfPage(page);
}

function startSlidesSse(sessionId) {
  if (stopSlidesSse) stopSlidesSse();
  const es = new EventSource(`/api/live-sessions/${sessionId}/slides/stream`);

  const onSlide = async (ev) => {
    try {
      const state = JSON.parse(ev.data);
      await applySlideState(state);
    } catch (e) {
      console.error("slide SSE parse error", e);
    }
  };

  const onSession = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg?.type === "ended") {
        showToast("Class ended by teacher.");
        leaveLiveMeetingEmbed?.();
      }
    } catch (e) {
      // ignore
    }
  };

  es.addEventListener("slide", onSlide);
  es.addEventListener("session", onSession);

  stopSlidesSse = () => es.close();
  return stopSlidesSse;
}

async function loadInitialSlideState(sessionId) {
  const state = await fetchJSON(`/api/live-sessions/${sessionId}/slides/state`);
  await applySlideState(state);
}

async function setDeckUrl(sessionId) {
  const url = prompt(
    "Paste PDF URL (must be accessible by students):",
    slidesPdfUrl || ""
  );
  if (!url) return;

  await loadPdf(url);
  await fetchJSON(`/api/live-sessions/${sessionId}/slides/deck`, {
    method: "POST",
    body: JSON.stringify({ deck_url: url, page_count: slidesPageCount })
  });
}

async function setSlidePage(sessionId, nextPage) {
  await fetchJSON(`/api/live-sessions/${sessionId}/slides/page`, {
    method: "POST",
    body: JSON.stringify({ page: nextPage })
  });
}
setSlidesControlsVisibility();
slidePrevBtn?.addEventListener("click", () =>
  activeLiveSessionId && setSlidePage(activeLiveSessionId, slidesPage - 1)
);
slideNextBtn?.addEventListener("click", () =>
  activeLiveSessionId && setSlidePage(activeLiveSessionId, slidesPage + 1)
);

resetRecordingButtons();
liveRecStartBtn?.addEventListener("click", () => {
  if (!liveJitsiApi) return;
  if (!canUseRecording()) {
    showToast("Recording needs self-host + Jibri.");
    return;
  }
  liveJitsiApi.executeCommand("startRecording", { mode: "file" });
  liveRecStartBtn.hidden = true;
  liveRecStopBtn.hidden = false;
});

liveRecStopBtn?.addEventListener("click", () => {
  if (!liveJitsiApi) return;
  liveJitsiApi.executeCommand("stopRecording", "file");
  liveRecStartBtn.hidden = !canUseRecording();
  liveRecStopBtn.hidden = true;
});
