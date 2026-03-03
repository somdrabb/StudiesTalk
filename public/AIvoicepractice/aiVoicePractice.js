/* AI Voice Practice — Real budget enforcement */
(function () {
  const CHANNEL_SELECTOR = '[data-channel-name="Speaking Practice"]';
  const ROOT_ID = "aiVoicePracticeRoot";
  const BUDGET_ENDPOINT = "/api/ai/budget";
  const REALTIME_SESSION_ENDPOINT = "/api/ai/realtime/session";
  const RUNTIME_START_ENDPOINT = "/api/ai/runtime/start";
  const RUNTIME_HEARTBEAT_ENDPOINT = "/api/ai/runtime/heartbeat";
  const RUNTIME_END_ENDPOINT = "/api/ai/runtime/end";
  const CONV_START_ENDPOINT = "/api/ai/conversation/start";
  const CONV_MSG_ENDPOINT = (id) => `/api/ai/conversation/${encodeURIComponent(id)}/messages`;
  const CONV_END_ENDPOINT = (id) => `/api/ai/conversation/${encodeURIComponent(id)}/end`;
  const $ = (id) => document.getElementById(id);

  let budgetSummary = { monthly_cap_eur: 0, used_eur: 0 };
  let buttonsWired = false;
  let runtimeId = null;
  let hbTimer = null;
  let realtimeConnection = null;
  let aiDeltaEl = null;
  let pttListeners = [];
  let conversationId = null;
  let transcriptBuffer = [];
  let flushTimer = null;
  let transcriptToggleWired = false;
  let scenarioOptionsWired = false;
  let modeOverlayWired = false;
  let startOverlayWired = false;

  function formatEUR(value) {
    const v = Number(value || 0);
    return `€${v.toFixed(2)}`;
  }

  function getWorkspaceId() {
    return (window.currentWorkspaceId || document.body.dataset.workspaceId || "").trim();
  }

  function getLeft() {
    const cap = Number(budgetSummary.monthly_cap_eur || 0);
    const used = Number(budgetSummary.used_eur || 0);
    return Math.max(0, cap - used);
  }

  function isBlocked() {
    const cap = Number(budgetSummary.monthly_cap_eur || 0);
    const used = Number(budgetSummary.used_eur || 0);
    return cap > 0 && used >= cap;
  }

  function updateBudgetUI() {
    const cap = Number(budgetSummary.monthly_cap_eur || 0);
    const used = Number(budgetSummary.used_eur || 0);
    const left = Math.max(0, cap - used);
    const hasUnlimitedBudget = cap <= 0;

    const capEl = $("aiCapValue");
    const usedEl = $("aiUsedValue");
    const chip = $("aiBudgetChip");
    const bar = $("aiBudgetBar");
    const note = $("aiBudgetNote");
    const startBtn = $("aiStartBtn");

    if (capEl) capEl.textContent = formatEUR(cap);
    if (usedEl) usedEl.textContent = formatEUR(used);
    if (chip) chip.textContent = `Budget left: ${hasUnlimitedBudget ? "Unlimited" : formatEUR(left)}`;

    const pct = hasUnlimitedBudget ? 0 : Math.min(100, Math.round((used / cap) * 100));
    if (bar) bar.style.width = `${pct}%`;

    const blocked = isBlocked();
    if (startBtn) startBtn.disabled = blocked;
    if (note) {
      if (blocked) {
        note.textContent = `Blocked: Your school’s AI budget of ${formatEUR(cap)} is used up. Ask your admin to increase the limit.`;
      } else if (hasUnlimitedBudget) {
        note.textContent = `Your school currently allows unlimited AI practice; use at your own pace.`;
      } else {
        note.textContent = `Your school sets a monthly AI budget of ${formatEUR(cap)}. If it reaches €0, practice is blocked until the admin updates it.`;
      }
    }
  }

  function setStatus(text) {
    const status = $("aiStatusChip");
    if (status) status.textContent = text || "Idle";
  }

  function setActiveControlsVisible(show) {
    const controls = $("aiActiveControls");
    if (!controls) return;
    controls.hidden = !Boolean(show);
  }

  function setActionCardVisible(show) {
    const card = $("aiActionCard");
    if (!card) return;
    card.hidden = !Boolean(show);
  }

  function setPrimaryActionsVisible(show) {
    const primaryActions = document.querySelector(".ai-voice-practice__actions--primary");
    if (!primaryActions) return;
    primaryActions.hidden = !Boolean(show);
  }

  function showModeOverlay() {
    const overlay = $("aiModeOverlay");
    if (!overlay) return;
    overlay.hidden = false;
    hideStartOverlay();
    setPrimaryActionsVisible(false);
  }

  function hideModeOverlay() {
    const overlay = $("aiModeOverlay");
    if (!overlay) return;
    overlay.hidden = true;
  }

  function showStartOverlay() {
    const overlay = $("aiStartOverlay");
    if (!overlay) return;
    overlay.hidden = false;
  }

  function hideStartOverlay() {
    const overlay = $("aiStartOverlay");
    if (!overlay) return;
    overlay.hidden = true;
    setPrimaryActionsVisible(true);
  }

  function resetOverlays() {
    hideModeOverlay();
    hideStartOverlay();
    setPrimaryActionsVisible(false);
    setActionCardVisible(false);
  }

  function setScenarioValue(value) {
    const normalized = String(value || "free");
    const select = $("aiScenario");
    if (select && select.value !== normalized) {
      select.value = normalized;
    }
    const options = document.querySelectorAll(".scenario-option");
    options.forEach((option) => {
      const isActive = option.dataset.scenario === normalized;
      option.classList.toggle("is-selected", isActive);
      option.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function initScenarioOptions() {
    if (scenarioOptionsWired) return;
    const options = document.querySelectorAll(".scenario-option");
    if (!options.length) return;
    options.forEach((option) => {
      option.addEventListener("click", () => {
        setScenarioValue(option.dataset.scenario);
        setActionCardVisible(true);
        showModeOverlay();
      });
    });
    scenarioOptionsWired = true;
    const select = $("aiScenario");
    setScenarioValue(select?.value || "free");
  }

  function setModeValue(value) {
    const normalized = String(value || "vad");
    const radio = document.querySelector(`input[name="aiMode"][value="${normalized}"]`);
    if (radio && !radio.checked) {
      radio.checked = true;
    }
    return normalized;
  }

  function initModeOverlay() {
    if (modeOverlayWired) return;
    const radios = document.querySelectorAll("#aiModeOverlay input[name=\"aiMode\"]");
    radios.forEach((radio) => {
      radio.addEventListener("change", () => {
        setModeValue(radio.value);
        hideModeOverlay();
        showStartOverlay();
      });
    });
    const minimizeBtn = $("aiModeMinimize");
    if (minimizeBtn) {
      minimizeBtn.addEventListener("click", () => {
        hideModeOverlay();
        setActionCardVisible(false);
      });
    }
    modeOverlayWired = true;
  }

  function initStartOverlay() {
    if (startOverlayWired) return;
    const startBtn = $("aiStartOverlayBtn");
    if (!startBtn) return;
    startBtn.addEventListener("click", () => {
      hideStartOverlay();
      const primaryStartBtn = $("aiStartBtn");
      if (primaryStartBtn) {
        primaryStartBtn.click();
      }
    });
    startOverlayWired = true;
  }

  function setTranscriptVisibility(visible) {
    const transcript = $("aiTranscript");
    const toggleBtn = $("aiTranscriptToggleBtn");
    if (!transcript || !toggleBtn) return;
    const show = Boolean(visible);
    transcript.hidden = !show;
    toggleBtn.setAttribute("aria-pressed", show ? "true" : "false");
    toggleBtn.setAttribute("aria-label", show ? "Hide transcript" : "Show transcript");
    toggleBtn.classList.toggle("is-active", show);
  }

  function initTranscriptToggle() {
    if (transcriptToggleWired) return;
    const toggleBtn = $("aiTranscriptToggleBtn");
    const transcript = $("aiTranscript");
    if (!toggleBtn || !transcript) return;
    toggleBtn.addEventListener("click", () => {
      const currentlyHidden = transcript.hidden;
      setTranscriptVisibility(currentlyHidden);
    });
    transcriptToggleWired = true;
    setTranscriptVisibility(false);
  }

  function appendTranscript(who, text) {
    const box = $("aiTranscript");
    if (!box) return;
    const row = document.createElement("div");
    row.style.margin = "8px 0";
    row.innerHTML = `<strong>${who}:</strong> ${escapeHtml(text)}`;
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getCookie(name) {
    const match = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${name}=`));
    if (!match) return null;
    return match.split('=').slice(1).join('=');
  }

  function getCsrfToken() {
    return getCookie('csrf_token');
  }

  function jsonHeaders() {
    const headers = { "Content-Type": "application/json" };
    const csrf = getCsrfToken();
    if (csrf) headers["x-csrf-token"] = csrf;
    return headers;
  }

  async function fetchBudget() {
    try {
    const response = await fetch(BUDGET_ENDPOINT, {
      credentials: "include"
    });
      if (!response.ok) throw new Error("Failed to load budget");
      const data = await response.json();
      budgetSummary = data || budgetSummary;
      updateBudgetUI();
      return data;
    } catch (err) {
      console.warn("Budget fetch failed", err);
      updateBudgetUI();
      return null;
    }
  }

  function showBlockedUI(message) {
    const note = $("aiBudgetNote");
    if (note) note.textContent = message || "Budget limit reached";
    setStatus("Blocked");
    const startBtn = $("aiStartBtn");
    if (startBtn) startBtn.disabled = true;
  }

  function getSelectedMode() {
    return document.querySelector('input[name="aiMode"]:checked')?.value || "vad";
  }

  function appendAIDelta(delta) {
    const box = $("aiTranscript");
    if (!box) return;
    if (!aiDeltaEl) {
      const row = document.createElement("div");
      row.style.margin = "8px 0";
      row.innerHTML = `<strong>AI:</strong> <span class="ai-delta"></span>`;
      box.appendChild(row);
      aiDeltaEl = row.querySelector(".ai-delta");
    }
    if (!aiDeltaEl) return;
    aiDeltaEl.textContent += String(delta || "");
    box.scrollTop = box.scrollHeight;
  }

  function resetAIDelta() {
    aiDeltaEl = null;
  }

  async function startConversation({ scenario, mode }) {
    const r = await fetch(CONV_START_ENDPOINT, {
      method: "POST",
      headers: jsonHeaders(),
      credentials: "include",
      body: JSON.stringify({ scenario, mode })
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok || !data?.conversation_id) {
      throw new Error(data?.error || "Failed to start conversation");
    }

    conversationId = data.conversation_id;
  }

  function bufferMessage(role, content) {
    const text = String(content || "").trim();
    if (!text || !conversationId) return;
    transcriptBuffer.push({ role, content: text });
    if (!flushTimer) {
      flushTimer = setTimeout(flushTranscriptToServer, 2500);
    }
  }

  async function flushTranscriptToServer() {
    if (!conversationId || transcriptBuffer.length === 0) return;
    const batch = transcriptBuffer.splice(0, transcriptBuffer.length);
    clearTimeout(flushTimer);
    flushTimer = null;
    await fetch(CONV_MSG_ENDPOINT(conversationId), {
      method: "POST",
      headers: jsonHeaders(),
      credentials: "include",
      body: JSON.stringify({ messages: batch })
    }).catch(() => {});
  }

  async function endConversation() {
    try { await flushTranscriptToServer(); } catch {}
    if (!conversationId) return;
    await fetch(CONV_END_ENDPOINT(conversationId), {
      method: "POST",
      headers: jsonHeaders(),
      credentials: "include"
    }).catch(() => {});
    conversationId = null;
  }

  function applyVADConfig(conn) {
    conn.sendEvent({
      type: "session.update",
      session: {
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 650,
          create_response: true,
          interrupt_response: true
        }
      }
    });
  }

  function applyPTTConfig(conn) {
    conn.sendEvent({
      type: "session.update",
      session: { turn_detection: null }
    });
  }

  function wirePushToTalk(startBtn, conn) {
    if (!conn?.localTrack) return;
    conn.localTrack.enabled = false;
    startBtn.textContent = "Hold to talk";

    const onDown = () => {
      if (!conn) return;
      conn.sendEvent({ type: "input_audio_buffer.clear" });
      conn.sendEvent({ type: "response.cancel" });
      conn.sendEvent({ type: "output_audio_buffer.clear" });
      resetAIDelta();
      conn.localTrack.enabled = true;
      setStatus("Listening (hold)…");
      startBtn.textContent = "Release to send";
    };

    const onUp = () => {
      if (!conn) return;
      conn.localTrack.enabled = false;
      setStatus("Thinking…");
      startBtn.textContent = "Hold to talk";
      conn.sendEvent({ type: "input_audio_buffer.commit" });
      conn.sendEvent({ type: "response.create" });
    };

    const onLeave = (event) => {
      if (event.buttons) onUp();
    };

    startBtn.addEventListener("pointerdown", onDown);
    startBtn.addEventListener("pointerup", onUp);
    startBtn.addEventListener("pointercancel", onUp);
    startBtn.addEventListener("pointerleave", onLeave);

    pttListeners.push({ el: startBtn, type: "pointerdown", handler: onDown });
    pttListeners.push({ el: startBtn, type: "pointerup", handler: onUp });
    pttListeners.push({ el: startBtn, type: "pointercancel", handler: onUp });
    pttListeners.push({ el: startBtn, type: "pointerleave", handler: onLeave });
  }

  function unwindPushToTalk() {
    for (const { el, type, handler } of pttListeners) {
      el.removeEventListener(type, handler);
    }
    pttListeners = [];
  }

  function appendTranscriptDelta(who, delta) {
    const box = $("aiTranscript");
    if (!box) return;
    let row = box.querySelector(`[data-stream="${who}"]`);
    if (!row) {
      row = document.createElement("div");
      row.dataset.stream = who;
      row.innerHTML = `<strong>${who}:</strong> <span class="delta"></span>`;
      box.appendChild(row);
    }
    const span = row.querySelector(".delta");
    if (!span) return;
    span.textContent += delta;
    box.scrollTop = box.scrollHeight;
  }

  function handleRealtimeEvent(evt) {
    if (!evt || typeof evt !== "object") return;

    if (evt.type === "input_audio_buffer.speech_started") setStatus("Speaking…");
    if (evt.type === "input_audio_buffer.speech_stopped") setStatus("Thinking…");

    if (evt.type?.includes("transcript") && evt.transcript) {
      bufferMessage("user", evt.transcript);
    }

    if (evt.type === "response.output_audio_transcript.delta") {
      const t = String(evt.delta || "");
      if (t) appendAIDelta(t);
    }

    if (evt.type === "response.done") {
      setStatus("Listening");
      if (aiDeltaEl?.textContent) {
        bufferMessage("assistant", aiDeltaEl.textContent);
        resetAIDelta();
      }
      flushTranscriptToServer().catch(() => {});
    }
  }

  async function startRuntime() {
    const resp = await fetch(RUNTIME_START_ENDPOINT, {
      method: "POST",
      headers: jsonHeaders(),
      credentials: "include",
      body: JSON.stringify({ conversation_id: conversationId })
    });
    if (!resp.ok) throw new Error("Failed to start runtime session");
    const data = await resp.json().catch(() => ({}));
    runtimeId = data.runtime_id;
    hbTimer = setInterval(() => {
      if (!runtimeId) return;
      fetch(RUNTIME_HEARTBEAT_ENDPOINT, {
        method: "POST",
        headers: jsonHeaders(),
        credentials: "include",
        body: JSON.stringify({ runtime_id: runtimeId })
      }).catch(() => {});
    }, 15000);
  }

  async function stopRuntime() {
    if (hbTimer) {
      clearInterval(hbTimer);
      hbTimer = null;
    }
    if (!runtimeId) return;
    await fetch(RUNTIME_END_ENDPOINT, {
      method: "POST",
      headers: jsonHeaders(),
      credentials: "include",
      body: JSON.stringify({ runtime_id: runtimeId })
    }).catch(() => {});
    runtimeId = null;
  }

  async function startOpenAIRealtimeWebRTC({ ephemeralKey, onEvent, onStatus }) {
    const pc = new RTCPeerConnection();
    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    audioEl.playsInline = true;

    pc.ontrack = (event) => {
      audioEl.srcObject = event.streams[0];
    };

    const dc = pc.createDataChannel("oai-events");
    dc.onmessage = (e) => {
      try {
        onEvent?.(JSON.parse(e.data));
      } catch (err) {
        // ignore parse failures
      }
    };
    dc.onopen = () => onStatus?.("Connected");
    dc.onclose = () => onStatus?.("Disconnected");

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    const localTrack = stream.getAudioTracks()[0];
    pc.addTrack(localTrack, stream);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        "Content-Type": "application/sdp"
      },
      body: offer.sdp
    });

    if (!sdpResponse.ok) {
      const txt = await sdpResponse.text();
      throw new Error(`Realtime SDP exchange failed: ${sdpResponse.status} ${txt}`);
    }

    const remoteSdp = await sdpResponse.text();
    await pc.setRemoteDescription({ type: "answer", sdp: remoteSdp });

    function sendEvent(payload) {
      if (dc.readyState === "open") {
        dc.send(JSON.stringify(payload));
      }
    }

    function stop() {
      try { dc.close(); } catch {}
      try { localTrack.stop(); } catch {}
      try { pc.close(); } catch {}
      try { stream.getTracks().forEach((t) => t.stop()); } catch {}
    }

    return { pc, dc, localTrack, sendEvent, stop };
  }

  async function teardownRealtime() {
    if (realtimeConnection?.stop) {
      realtimeConnection.stop();
    }
    realtimeConnection = null;
    await stopRuntime();
    unwindPushToTalk();
    resetAIDelta();
    const startBtn = $("aiStartBtn");
    if (startBtn) {
      startBtn.textContent = "Start speaking";
      startBtn.disabled = isBlocked();
    }
    setActiveControlsVisible(false);
    setTranscriptVisibility(false);
  }

  async function handleStart() {
    const startBtn = $("aiStartBtn");
    const stopBtn = $("aiStopBtn");
    if (!startBtn || !stopBtn) return;
    if (isBlocked()) {
      showBlockedUI("Budget exhausted. Ask your admin to top it up.");
      return;
    }

    startBtn.disabled = true;
    setStatus("Checking budget…");
    setActiveControlsVisible(true);

    try {
      const scenarioSelect = $("aiScenario");
      const scenarioValue = scenarioSelect?.value || "free";
      const selectedMode = getSelectedMode();
      await startConversation({ scenario: scenarioValue, mode: selectedMode });
      bufferMessage("system", `Session started: scenario=${scenarioValue}, mode=${selectedMode}`);
      const response = await fetch(REALTIME_SESSION_ENDPOINT, {
        method: "POST",
        headers: jsonHeaders(),
        credentials: "include",
        body: JSON.stringify({ scenario: scenarioValue })
      });
      const data = await response.json().catch(() => ({}));
      if (data.blocked) {
        await fetchBudget();
        showBlockedUI(data.reason || "Budget limit reached");
        return;
      }
      if (!data.client_secret?.value) {
        throw new Error("Missing ephemeral key");
      }
      await startRuntime();
      setStatus("Connecting…");
      realtimeConnection = await startOpenAIRealtimeWebRTC({
        ephemeralKey: data.client_secret.value,
        onEvent: handleRealtimeEvent,
        onStatus: setStatus
      });
      stopBtn.disabled = false;
      appendTranscript("System", `Connected with scenario ${mode}`);
      resetAIDelta();
      if (selectedMode === "ptt") {
        applyPTTConfig(realtimeConnection);
        wirePushToTalk(startBtn, realtimeConnection);
        startBtn.disabled = false;
        setStatus("Ready (push-to-talk)");
      } else {
        applyVADConfig(realtimeConnection);
        realtimeConnection.localTrack.enabled = true;
        startBtn.textContent = "Auto listening…";
        startBtn.disabled = true;
        setStatus("Listening…");
      }
      await fetchBudget();
    } catch (err) {
      console.error("Realtime session failed", err);
      await teardownRealtime();
      setStatus("Idle");
      const startBtn = $("aiStartBtn");
      if (startBtn) {
        startBtn.disabled = isBlocked();
        startBtn.textContent = "Start speaking";
      }
      const note = $("aiBudgetNote");
      if (note) note.textContent = "Failed to initialize AI session. Please try again.";
    }
  }

  function wireButtons() {
    const startBtn = $("aiStartBtn");
    const stopBtn = $("aiStopBtn");
    if (!startBtn || !stopBtn) return;
    if (buttonsWired) return;
    buttonsWired = true;

    startBtn.addEventListener("click", handleStart);
    stopBtn.addEventListener("click", () => {
      setStatus("Idle");
      stopBtn.disabled = true;
      startBtn.disabled = isBlocked();
      startBtn.textContent = "Start speaking";
      appendTranscript("System", "Stopped.");
      teardownRealtime()
        .then(() => endConversation().catch(() => {}))
        .then(fetchBudget)
        .catch(() => {});
      setActiveControlsVisible(false);
      setTranscriptVisibility(false);
    });
    setActiveControlsVisible(false);
    setTranscriptVisibility(false);
  }

  function showPracticePanel(show) {
    const root = $(ROOT_ID);
    if (!root) return;
    root.hidden = !show;
    if (show) {
      updateBudgetUI();
      wireButtons();
      setActiveControlsVisible(false);
      setTranscriptVisibility(false);
      fetchBudget();
    }
    if (!show) {
      resetOverlays();
    }
  }

  function watchChannelClicks() {
    document.body.addEventListener("click", (event) => {
      const row = event.target.closest(CHANNEL_SELECTOR);
      if (!row) return;
      showPracticePanel(true);
    });
    initTranscriptToggle();
    initScenarioOptions();
  }

  function hideOnOtherChannelClick() {
    document.body.addEventListener("click", (event) => {
      const clickedChannel = event.target.closest("[data-channel-name]");
      if (!clickedChannel) return;
      const name = clickedChannel.getAttribute("data-channel-name");
      if (name && name !== "Speaking Practice") showPracticePanel(false);
    });
  }

  function init() {
    watchChannelClicks();
    hideOnOtherChannelClick();
    updateBudgetUI();
    initModeOverlay();
    initStartOverlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
