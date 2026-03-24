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
  const LEGACY_SPEAKING_TOPIC_ALIASES = {
    free: "smalltalk",
    job: "interview",
    feedbackpanel: "feedback",
    culture: "culture",
    crosscultural: "culture",
    mentorship: "coach",
    coach: "coach",
    briefing: "briefing",
    englishnews: "briefing",
    event: "booking",
    ceointerview: "interview",
    business: "presentation",
    reviewer: "debate",
    salespitch: "sales",
    news: "briefing"
  };
  const LEGACY_SPEAKING_TOPICS = [
    {
      id: "smalltalk",
      title: "Small Talk starten",
      subtitle: "Locker kennenlernen & Eis brechen",
      icon: "fa-solid fa-handshake",
      category: "everyday",
      levels: ["A1", "A2"],
      skills: ["introducing", "small_talk", "follow_up_questions"],
      objective: "Eine lockere erste Unterhaltung beginnen und am Laufen halten.",
      aiContext: "friendly first meeting, short natural questions, introductions, hobbies, gentle corrections",
      theme: "violet"
    },
    {
      id: "restaurant",
      title: "Essen bestellen",
      subtitle: "Bestellen, nachfragen & höflich reagieren",
      icon: "fa-solid fa-utensils",
      category: "everyday",
      levels: ["A1", "A2"],
      skills: ["ordering", "politeness", "clarifying"],
      objective: "Sicher Essen und Getränke bestellen und auf Rückfragen reagieren.",
      aiContext: "restaurant roleplay, waiter and customer, polite requests, menu vocabulary, short turns",
      theme: "orange"
    },
    {
      id: "interview",
      title: "Vorstellungsgespraech",
      subtitle: "Antworten strukturiert & selbstsicher geben",
      icon: "fa-solid fa-user-tie",
      category: "work",
      levels: ["B1", "B2"],
      skills: ["self_presentation", "professional_answers", "confidence"],
      objective: "Berufliche Fragen klar, strukturiert und glaubwürdig beantworten.",
      aiContext: "job interview coach, experience, strengths, motivation, follow-up questions, concise feedback",
      theme: "sky"
    },
    {
      id: "travel",
      title: "Hotel Check-in",
      subtitle: "Einchecken, fragen & Probleme loesen",
      icon: "fa-solid fa-plane-departure",
      category: "practical",
      levels: ["A2", "B1"],
      skills: ["travel_language", "requesting_help", "clarifying"],
      objective: "Reisesituationen am Hotel sicher und höflich lösen.",
      aiContext: "hotel front desk roleplay, reservations, room questions, practical travel conversation",
      theme: "lime"
    },
    {
      id: "exam",
      title: "TestDaF Sprechen",
      subtitle: "Pruefungsnah antworten & Zeit gut nutzen",
      icon: "fa-solid fa-graduation-cap",
      category: "academic",
      levels: ["B2", "C1"],
      skills: ["exam_fluency", "structuring", "timed_speaking"],
      objective: "Prüfungsnahe Antworten mit klarer Struktur und passendem Tempo geben.",
      aiContext: "exam simulator, time pressure, structured answers, academic tone, light correction after response",
      theme: "pink"
    },
    {
      id: "support",
      title: "Kundenservice Gespraech",
      subtitle: "Probleme erklaeren & Loesungen finden",
      icon: "fa-solid fa-headset",
      category: "work",
      levels: ["A2", "B1"],
      skills: ["problem_description", "clarification", "service_language"],
      objective: "Ein Problem ruhig beschreiben und gemeinsam eine Lösung finden.",
      aiContext: "service call roleplay, issue explanation, troubleshooting, polite support language",
      theme: "teal"
    },
    {
      id: "project",
      title: "Projekt-Update geben",
      subtitle: "Fortschritt, Risiken & naechste Schritte",
      icon: "fa-solid fa-list-check",
      category: "work",
      levels: ["B1", "B2"],
      skills: ["status_reporting", "summarizing", "planning"],
      objective: "Fortschritt klar zusammenfassen und nächste Schritte benennen.",
      aiContext: "team update, deadlines, blockers, concise project language, one question at a time",
      theme: "indigo"
    },
    {
      id: "networking",
      title: "Kontakte knuepfen",
      subtitle: "Sich vorstellen & professionell vernetzen",
      icon: "fa-solid fa-user-group",
      category: "social",
      levels: ["A2", "B1"],
      skills: ["introducing", "networking", "small_talk"],
      objective: "Sich natürlich vorstellen und ein Gespräch professionell weiterführen.",
      aiContext: "networking event, introductions, interests, work background, friendly but professional tone",
      theme: "rose"
    },
    {
      id: "presentation",
      title: "Praesentation halten",
      subtitle: "Ideen klar vorstellen & erklaeren",
      icon: "fa-solid fa-person-chalkboard",
      category: "work",
      levels: ["B1", "B2"],
      skills: ["presenting", "explaining", "signposting"],
      objective: "Eine Idee oder ein Thema strukturiert und verständlich präsentieren.",
      aiContext: "presentation audience, signposting, transitions, explaining visuals, confident speaking",
      theme: "amber"
    },
    {
      id: "feedback",
      title: "Feedback geben & annehmen",
      subtitle: "Verbessern, reagieren & gemeinsam loesen",
      icon: "fa-solid fa-comment-dots",
      category: "social",
      levels: ["B1", "B2"],
      skills: ["feedback", "responding", "polite_disagreement"],
      objective: "Konstruktives Feedback geben und offen darauf reagieren.",
      aiContext: "feedback conversation, praise plus improvement, tactful wording, calm responses",
      theme: "violet"
    },
    {
      id: "story",
      title: "Eine Geschichte erzaehlen",
      subtitle: "Erlebnisse lebendig und spannend schildern",
      icon: "fa-solid fa-book-open",
      category: "everyday",
      levels: ["A2", "B1"],
      skills: ["narration", "past_tense", "detail"],
      objective: "Ein Erlebnis lebendig erzählen und wichtige Details einbauen.",
      aiContext: "storytelling partner, ask for details, sequence events, encourage vivid language",
      theme: "red"
    },
    {
      id: "negotiation",
      title: "Verhandeln",
      subtitle: "Optionen abwaegen & Kompromisse finden",
      icon: "fa-solid fa-handshake-angle",
      category: "work",
      levels: ["B1", "B2"],
      skills: ["persuasion", "compromise", "clarifying_terms"],
      objective: "Preise, Termine oder Optionen flexibel verhandeln.",
      aiContext: "negotiation roleplay, options, trade-offs, persuasive but polite language",
      theme: "yellow"
    },
    {
      id: "medical",
      title: "Beim Arzt sprechen",
      subtitle: "Symptome erklaeren & Rueckfragen verstehen",
      icon: "fa-solid fa-stethoscope",
      category: "practical",
      levels: ["A2", "B1"],
      skills: ["symptoms", "medical_vocabulary", "clarification"],
      objective: "Symptome verständlich erklären und Nachfragen beantworten.",
      aiContext: "doctor appointment roleplay, symptoms, duration, advice, patient-friendly questions",
      theme: "cyan"
    },
    {
      id: "coldcall",
      title: "Telefonischer Erstkontakt",
      subtitle: "Anrufen, vorstellen & Anliegen nennen",
      icon: "fa-solid fa-phone-volume",
      category: "work",
      levels: ["A2", "B1"],
      skills: ["phone_language", "introducing", "purpose"],
      objective: "Ein Gespräch telefonisch klar eröffnen und zum Punkt kommen.",
      aiContext: "phone call opener, formal greetings, purpose of call, polite clarification",
      theme: "blue"
    },
    {
      id: "review",
      title: "Deutsch verbessern",
      subtitle: "Fehler erkennen & bessere Formulierungen finden",
      icon: "fa-solid fa-pen-to-square",
      category: "learning",
      levels: ["A2", "B2"],
      skills: ["self_correction", "rephrasing", "accuracy"],
      objective: "Eigene Sätze verbessern und natürlichere Formulierungen üben.",
      aiContext: "language coach, rephrase learner sentences, explain corrections simply, encourage retries",
      theme: "emerald"
    },
    {
      id: "academic",
      title: "Uni-Diskussion",
      subtitle: "Standpunkte klar darstellen & begruenden",
      icon: "fa-solid fa-building-columns",
      category: "academic",
      levels: ["B2", "C1"],
      skills: ["argumentation", "opinion", "academic_language"],
      objective: "Ein Thema an der Uni diskutieren und mit Gründen untermauern.",
      aiContext: "academic seminar partner, discuss arguments, examples, contrast, formal tone",
      theme: "indigo"
    },
    {
      id: "tour",
      title: "Stadt erklaeren",
      subtitle: "Orte beschreiben & Tipps geben",
      icon: "fa-solid fa-map-location-dot",
      category: "everyday",
      levels: ["A2", "B1"],
      skills: ["describing_places", "recommending", "giving_directions"],
      objective: "Eine Stadt oder Gegend anschaulich beschreiben und empfehlen.",
      aiContext: "city guide roleplay, landmarks, directions, recommendations, practical follow-up questions",
      theme: "lime"
    },
    {
      id: "emergency",
      title: "Notfall melden",
      subtitle: "Schnell, klar & ruhig Hilfe holen",
      icon: "fa-solid fa-triangle-exclamation",
      category: "practical",
      levels: ["A2", "B1"],
      skills: ["urgency", "describing_situation", "clear_speech"],
      objective: "In einer Notlage klar erklären, was passiert ist und was gebraucht wird.",
      aiContext: "emergency call roleplay, short urgent questions, location, people involved, immediate needs",
      theme: "red"
    },
    {
      id: "booking",
      title: "Termin vereinbaren",
      subtitle: "Planen, bestaetigen & umplanen",
      icon: "fa-solid fa-calendar-check",
      category: "practical",
      levels: ["A1", "A2"],
      skills: ["scheduling", "confirming", "rescheduling"],
      objective: "Einen Termin sicher planen, bestätigen oder verschieben.",
      aiContext: "appointment scheduling, time slots, confirmations, polite date and time language",
      theme: "blue"
    },
    {
      id: "debate",
      title: "Diskutieren",
      subtitle: "Meinung begruenden & widersprechen",
      icon: "fa-solid fa-scale-balanced",
      category: "social",
      levels: ["B1", "B2"],
      skills: ["opinion", "agreement", "disagreement"],
      objective: "Eine Meinung klar vertreten und auf Gegenargumente reagieren.",
      aiContext: "structured discussion, reasons, counterarguments, respectful disagreement, concise follow-up",
      theme: "indigo"
    },
    {
      id: "briefing",
      title: "Nachrichten zusammenfassen",
      subtitle: "Wichtiges kurz erklaeren & einordnen",
      icon: "fa-solid fa-newspaper",
      category: "media",
      levels: ["B1", "B2"],
      skills: ["summarizing", "reporting", "main_points"],
      objective: "Ereignisse oder Tagesrückblicke knapp und verständlich zusammenfassen.",
      aiContext: "news briefing, summarize key points, explain relevance, short follow-up questions",
      theme: "amber"
    },
    {
      id: "culture",
      title: "Kultur vergleichen",
      subtitle: "Traditionen erklaeren & Unterschiede besprechen",
      icon: "fa-solid fa-earth-europe",
      category: "social",
      levels: ["B1", "B2"],
      skills: ["comparison", "explaining_customs", "reflection"],
      objective: "Kulturelle Unterschiede respektvoll vergleichen und erklären.",
      aiContext: "cross-cultural discussion, traditions, differences, similarities, respectful tone",
      theme: "green"
    },
    {
      id: "recipe",
      title: "Ein Rezept erklaeren",
      subtitle: "Schritte, Reihenfolge & Mengen nennen",
      icon: "fa-solid fa-list-ol",
      category: "everyday",
      levels: ["A2", "B1"],
      skills: ["sequencing", "instructions", "quantities"],
      objective: "Ein Rezept oder einen Ablauf Schritt für Schritt erklären.",
      aiContext: "recipe explanation, sequence words, quantities, kitchen actions, clarity over complexity",
      theme: "pink"
    },
    {
      id: "podcast",
      title: "Podcast starten",
      subtitle: "Begruessen, Thema setzen & weiterfuehren",
      icon: "fa-solid fa-podcast",
      category: "media",
      levels: ["B1", "B2"],
      skills: ["hosting", "introducing_topics", "flow"],
      objective: "Ein Gespräch wie in einem Podcast eröffnen und moderieren.",
      aiContext: "podcast host style, opening lines, transitions, inviting the other speaker in",
      theme: "orange"
    },
    {
      id: "onboarding",
      title: "Neue Kunden begruessen",
      subtitle: "Ablauf erklaeren & Sicherheit geben",
      icon: "fa-solid fa-handshake-simple",
      category: "work",
      levels: ["A2", "B1"],
      skills: ["welcoming", "explaining_process", "reassurance"],
      objective: "Neue Kunden freundlich begrüßen und den Ablauf klar erklären.",
      aiContext: "customer onboarding, welcoming tone, explain next steps, answer basic questions",
      theme: "yellow"
    },
    {
      id: "sales",
      title: "Etwas verkaufen",
      subtitle: "Vorteile erklaeren & Interesse wecken",
      icon: "fa-solid fa-store",
      category: "work",
      levels: ["B1", "B2"],
      skills: ["persuasion", "benefits", "objection_handling"],
      objective: "Ein Angebot verständlich vorstellen und auf Einwände reagieren.",
      aiContext: "sales conversation, explain benefits, ask needs questions, handle objections politely",
      theme: "rose"
    },
    {
      id: "coach",
      title: "Coachen & motivieren",
      subtitle: "Tipps geben & zum Weitermachen ermutigen",
      icon: "fa-solid fa-person-chalkboard",
      category: "social",
      levels: ["B1", "B2"],
      skills: ["advice", "motivation", "goal_setting"],
      objective: "Jemanden motivieren, beraten und nächste Schritte formulieren.",
      aiContext: "coach conversation, encouragement, goals, actionable advice, supportive tone",
      theme: "violet"
    },
    {
      id: "techsupport",
      title: "Technikproblem loesen",
      subtitle: "Fehler beschreiben & Schritte durchgehen",
      icon: "fa-solid fa-laptop-code",
      category: "practical",
      levels: ["A2", "B1"],
      skills: ["problem_description", "step_by_step", "clarifying"],
      objective: "Ein technisches Problem erklären und Lösungsschritte besprechen.",
      aiContext: "tech support roleplay, issue details, troubleshooting steps, confirmation after each step",
      theme: "teal"
    },
    {
      id: "creative",
      title: "Ideen sammeln",
      subtitle: "Vorschlaege machen & gemeinsam waehlen",
      icon: "fa-solid fa-lightbulb",
      category: "creative",
      levels: ["A2", "B1"],
      skills: ["brainstorming", "suggesting", "choosing"],
      objective: "Mehrere Ideen entwickeln und zusammen eine auswählen.",
      aiContext: "brainstorming partner, offer options, ask preferences, encourage variety and selection",
      theme: "orange"
    },
    {
      id: "finance",
      title: "Finanzen besprechen",
      subtitle: "Kosten, Budget & Prioritaeten erklaeren",
      icon: "fa-solid fa-wallet",
      category: "work",
      levels: ["B1", "B2"],
      skills: ["budgeting", "numbers", "priorities"],
      objective: "Ausgaben, Einnahmen und Prioritäten nachvollziehbar besprechen.",
      aiContext: "finance discussion, budget limits, costs, trade-offs, clear numeric language",
      theme: "green"
    },
    {
      id: "policy",
      title: "Regeln erklaeren",
      subtitle: "Richtlinien kurz & klar zusammenfassen",
      icon: "fa-solid fa-gavel",
      category: "work",
      levels: ["B1", "B2"],
      skills: ["explaining_rules", "formal_language", "clarity"],
      objective: "Regeln oder Richtlinien klar und verständlich erklären.",
      aiContext: "policy explanation, formal but simple wording, explain reasons and examples",
      theme: "indigo"
    },
    {
      id: "wellness",
      title: "Ueber Gefuehle sprechen",
      subtitle: "Befinden beschreiben & empathisch nachfragen",
      icon: "fa-solid fa-heart-pulse",
      category: "everyday",
      levels: ["A2", "B1"],
      skills: ["feelings", "empathy", "follow_up_questions"],
      objective: "Gefühle ausdrücken und empathisch auf andere reagieren.",
      aiContext: "well-being conversation, feelings, empathy, support, calm patient replies",
      theme: "green"
    },
    {
      id: "holiday",
      title: "Urlaub planen",
      subtitle: "Optionen vergleichen & Entscheidungen treffen",
      icon: "fa-solid fa-suitcase-rolling",
      category: "everyday",
      levels: ["A2", "B1"],
      skills: ["planning", "preferences", "comparing_options"],
      objective: "Eine Reise planen und zwischen Möglichkeiten entscheiden.",
      aiContext: "travel planning, destinations, budget, dates, compare options and choose",
      theme: "amber"
    },
    {
      id: "charity",
      title: "Spendenaktion erklaeren",
      subtitle: "Ziel beschreiben & um Hilfe bitten",
      icon: "fa-solid fa-hands-holding-heart",
      category: "social",
      levels: ["B1", "B2"],
      skills: ["persuasion", "purpose", "call_to_action"],
      objective: "Ein soziales Anliegen erklären und um Unterstützung bitten.",
      aiContext: "charity pitch, explain cause, impact, appeal for support, sincere tone",
      theme: "teal"
    },
    {
      id: "bookclub",
      title: "Buchclub Gespraech",
      subtitle: "Inhalte zusammenfassen & Meinung teilen",
      icon: "fa-solid fa-book",
      category: "academic",
      levels: ["B1", "B2"],
      skills: ["summarizing", "opinion", "discussion"],
      objective: "Ein Kapitel oder Buch zusammenfassen und darüber diskutieren.",
      aiContext: "book club discussion, summarize chapter, favorite parts, interpretation questions",
      theme: "violet"
    },
    {
      id: "collaboration",
      title: "Team-Abstimmung",
      subtitle: "Aufgaben klaeren & naechste Schritte planen",
      icon: "fa-solid fa-people-arrows",
      category: "work",
      levels: ["B1", "B2"],
      skills: ["coordination", "planning", "task_assignment"],
      objective: "Im Team Aufgaben verteilen und den nächsten Plan abstimmen.",
      aiContext: "team coordination, responsibilities, deadlines, next steps, concise collaboration language",
      theme: "blue"
    },
    {
      id: "inspection",
      title: "Besichtigung",
      subtitle: "Zustand beschreiben & gezielt nachfragen",
      icon: "fa-solid fa-magnifying-glass",
      category: "practical",
      levels: ["A2", "B1"],
      skills: ["observing", "asking_questions", "describing_condition"],
      objective: "Bei einer Besichtigung Beobachtungen formulieren und Fragen stellen.",
      aiContext: "inspection walk-through, condition, details, follow-up questions, practical vocabulary",
      theme: "green"
    },
    {
      id: "science",
      title: "Ergebnisse erklaeren",
      subtitle: "Daten einordnen & Schluessen ziehen",
      icon: "fa-solid fa-flask",
      category: "academic",
      levels: ["B2", "C1"],
      skills: ["explaining_results", "evidence", "conclusions"],
      objective: "Ergebnisse klar erklären und daraus Schlüsse ableiten.",
      aiContext: "science explanation, findings, evidence, interpretation, clear structured phrasing",
      theme: "sky"
    },
    {
      id: "media",
      title: "Interview mit Medien",
      subtitle: "Kurz, ruhig & praezise antworten",
      icon: "fa-solid fa-microphone-lines",
      category: "media",
      levels: ["B2", "C1"],
      skills: ["interviewing", "concise_answers", "public_speaking"],
      objective: "Medienfragen kurz, professionell und kontrolliert beantworten.",
      aiContext: "media interview roleplay, concise answers, stay calm, bridge back to key message",
      theme: "amber"
    }
  ];
  const SHARED_SCENARIO_CONFIG = globalThis.AI_SPEAKING_SCENARIO_CONFIG || {};
  const SPEAKING_TOPIC_ALIASES = SHARED_SCENARIO_CONFIG.aliases || LEGACY_SPEAKING_TOPIC_ALIASES;
  const SPEAKING_TOPICS = Array.isArray(SHARED_SCENARIO_CONFIG.topics) && SHARED_SCENARIO_CONFIG.topics.length
    ? SHARED_SCENARIO_CONFIG.topics
    : LEGACY_SPEAKING_TOPICS;
  const SPEAKING_TOPIC_MAP = new Map(SPEAKING_TOPICS.map((topic) => [topic.id, topic]));
  const DEFAULT_TOPIC_ID = SPEAKING_TOPICS[0]?.id || "smalltalk";

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
  let debugStreamRows = new Map();
  let aiAudioUnlockWired = false;

  function formatEUR(value) {
    const v = Number(value || 0);
    return `€${v.toFixed(2)}`;
  }

  function logRealtimeDebug(message, detail = null) {
    if (detail === null || detail === undefined) {
      console.debug("[AI Realtime]", message);
      return;
    }
    console.debug("[AI Realtime]", message, detail);
  }

  function normalizeScenarioId(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return DEFAULT_TOPIC_ID;
    const normalized = SPEAKING_TOPIC_ALIASES[raw] || raw;
    return SPEAKING_TOPIC_MAP.has(normalized) ? normalized : DEFAULT_TOPIC_ID;
  }

  function getScenarioConfig(value) {
    return SPEAKING_TOPIC_MAP.get(normalizeScenarioId(value)) || SPEAKING_TOPIC_MAP.get(DEFAULT_TOPIC_ID) || null;
  }

  function renderTopicSelectOptions() {
    const select = $("aiScenario");
    if (!select) return;
    select.innerHTML = SPEAKING_TOPICS
      .map((topic) => {
        const levels = Array.isArray(topic.levels) ? topic.levels.join(",") : "";
        return `<option value="${escapeHtml(topic.id)}" data-category="${escapeHtml(topic.category)}" data-levels="${escapeHtml(levels)}">${escapeHtml(topic.title)}</option>`;
      })
      .join("");
  }

  function renderTopicCards() {
    const container = $("aiScenarioCards");
    if (!container) return;
    container.innerHTML = SPEAKING_TOPICS
      .map((topic) => {
        const levels = Array.isArray(topic.levels) ? topic.levels.join(" • ") : "";
        return `
          <button
            type="button"
            class="scenario-option"
            data-scenario="${escapeHtml(topic.id)}"
            data-theme="${escapeHtml(topic.theme || "blue")}"
            data-category="${escapeHtml(topic.category)}"
            data-levels="${escapeHtml(levels)}"
            aria-pressed="false"
            title="${escapeHtml(topic.objective)}"
          >
            <span class="scenario-option-icon"><i class="${escapeHtml(topic.icon)}"></i></span>
            <span class="scenario-option-label">${escapeHtml(topic.title)}</span>
            <span class="scenario-option-subtitle">${escapeHtml(topic.subtitle)}</span>
            <span class="scenario-option-rolehint" aria-hidden="true">
              <span class="scenario-option-rolepair">
                <span class="scenario-option-rolelabel">Du:</span>
                <span>${escapeHtml(topic.userRole || "Lernender")}</span>
              </span>
              <span class="scenario-option-rolepair">
                <span class="scenario-option-rolelabel">AI:</span>
                <span>${escapeHtml(topic.aiRole || "Gespraechspartner")}</span>
              </span>
            </span>
          </button>
        `;
      })
      .join("");
  }

  function renderTopics() {
    renderTopicSelectOptions();
    renderTopicCards();
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
    const sessionStatus = $("aiSessionStatusChip");
    if (sessionStatus) sessionStatus.textContent = text || "Idle";
  }

  function updateSpeakingSessionPanel(value) {
    const scenario = getScenarioConfig(value);
    if (!scenario) return;
    const title = $("aiSessionTitle");
    const subtitle = $("aiSessionSubtitle");
    const userRole = $("aiSessionUserRole");
    const aiRole = $("aiSessionAiRole");
    if (title) title.textContent = scenario.title || "Speaking Practice";
    if (subtitle) subtitle.textContent = scenario.subtitle || "Focused speaking workspace";
    if (userRole) userRole.textContent = `Du: ${scenario.userRole || "Lernender"}`;
    if (aiRole) aiRole.textContent = `AI: ${scenario.aiRole || "Gespraechspartner"}`;
  }

  function setSpeakingSessionActive(show) {
    const root = $(ROOT_ID);
    if (!root) return;
    root.classList.toggle("ai-speaking-active", Boolean(show));
    document.body.classList.toggle("ai-speaking-active", Boolean(show));
    setActionCardVisible(Boolean(show));
    if (show) {
      const scenarioSelect = $("aiScenario");
      updateSpeakingSessionPanel(scenarioSelect?.value || DEFAULT_TOPIC_ID);
      setTranscriptVisibility(true);
    } else {
      setTranscriptVisibility(false);
      setStatus("Idle");
    }
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
    const normalized = normalizeScenarioId(value);
    const select = $("aiScenario");
    if (select && select.value !== normalized) {
      select.value = normalized;
    }
    updateSpeakingSessionPanel(normalized);
    const options = document.querySelectorAll(".scenario-option");
    options.forEach((option) => {
      const isActive = option.dataset.scenario === normalized;
      option.classList.toggle("is-selected", isActive);
      option.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function initScenarioOptions() {
    renderTopics();
    scenarioOptionsWired = false;
    const options = document.querySelectorAll(".scenario-option");
    if (!options.length) return;
    options.forEach((option) => {
      option.addEventListener("click", () => {
        setScenarioValue(option.dataset.scenario);
        showModeOverlay();
      });
    });
    scenarioOptionsWired = true;
    const select = $("aiScenario");
    setScenarioValue(select?.value || DEFAULT_TOPIC_ID);
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

  function scrollTranscriptToBottom() {
    const box = $("aiTranscript");
    if (!box || box.hidden) return;
    requestAnimationFrame(() => {
      box.scrollTop = box.scrollHeight;
    });
  }

  function normalizeCapturedSpeech(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[.,!?;:()[\]{}"'`´’“”]+/g, " ")
      .replace(/\s+/g, " ");
  }

  function isMeaningfulSpeech(value) {
    const normalized = normalizeCapturedSpeech(value);
    if (!normalized) return false;
    const fillerSet = new Set(["uh", "umm", "um", "ah", "eh", "hmm", "hm", "mmm", "mm", "uhh", "ahh", "..."]);
    if (fillerSet.has(normalized)) return false;
    if (normalized.length < 3) return false;
    const tokens = normalized.split(" ").filter(Boolean);
    const meaningfulTokens = tokens.filter((token) => !fillerSet.has(token) && /[a-zA-ZäöüÄÖÜß]/.test(token));
    if (!meaningfulTokens.length) return false;
    return meaningfulTokens.join(" ").length >= 4;
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
    scrollTranscriptToBottom();
  }

  function upsertTranscriptStream(streamKey, who, text, { replace = false } = {}) {
    const box = $("aiTranscript");
    if (!box) return;
    const safeKey = String(streamKey || who || "stream");
    let row = debugStreamRows.get(safeKey);
    if (!row || !box.contains(row)) {
      row = document.createElement("div");
      row.style.margin = "8px 0";
      row.dataset.streamKey = safeKey;
      row.innerHTML = `<strong>${escapeHtml(who)}:</strong> <span class="ai-stream-text"></span>`;
      box.appendChild(row);
      debugStreamRows.set(safeKey, row);
    }
    const span = row.querySelector(".ai-stream-text");
    if (!span) return;
    if (replace) span.textContent = String(text || "");
    else span.textContent += String(text || "");
    scrollTranscriptToBottom();
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

  function setAudioUnlockVisible(visible) {
    const btn = $("aiAudioUnlockBtn");
    if (!btn) return;
    btn.hidden = !visible;
  }

  function wireAudioUnlock() {
    const btn = $("aiAudioUnlockBtn");
    if (!btn || aiAudioUnlockWired) return;
    aiAudioUnlockWired = true;
    btn.addEventListener("click", async () => {
      if (!realtimeConnection?.resumeAudioPlayback) return;
      try {
        await realtimeConnection.resumeAudioPlayback();
        setAudioUnlockVisible(false);
      } catch (err) {
        console.warn("[AI Realtime] manual audio resume failed", err);
      }
    });
  }

  function emitRealtimeEvent(conn, payload, label = payload?.type || "event") {
    const safePayload = payload && typeof payload === "object"
      ? JSON.parse(JSON.stringify(payload))
      : payload;
    logRealtimeDebug(`sending ${label}`, safePayload);
    return conn?.sendEvent?.(payload);
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
    scrollTranscriptToBottom();
  }

  function resetAIDelta() {
    aiDeltaEl = null;
  }

  async function startConversation({ scenario, mode }) {
    const normalizedScenario = normalizeScenarioId(scenario);
    const r = await fetch(CONV_START_ENDPOINT, {
      method: "POST",
      headers: jsonHeaders(),
      credentials: "include",
      body: JSON.stringify({ scenario: normalizedScenario, mode })
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

  function applyVADConfig(conn, voice = "alloy") {
    emitRealtimeEvent(conn, {
      type: "session.update",
      session: {
        type: "realtime",
        output_modalities: ["audio"],
        audio: {
          input: {
            transcription: {
              model: "gpt-4o-mini-transcribe"
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 650,
              create_response: true,
              interrupt_response: true
            }
          },
          output: {
            voice: voice || "alloy"
          }
        }
      }
    }, "session.update (vad)");
  }

  function applyPTTConfig(conn, voice = "alloy") {
    emitRealtimeEvent(conn, {
      type: "session.update",
      session: {
        type: "realtime",
        output_modalities: ["audio"],
        audio: {
          input: {
            transcription: {
              model: "gpt-4o-mini-transcribe"
            },
            turn_detection: null
          },
          output: {
            voice: voice || "alloy"
          }
        }
      }
    }, "session.update (ptt)");
  }

  function wirePushToTalk(startBtn, conn) {
    if (!conn?.localTrack) return;
    conn.localTrack.enabled = false;
    startBtn.textContent = "Hold to talk";
    let latestCommittedTranscript = "";

    const suppressClickWhileLive = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const onDown = () => {
      if (!conn) return;
      logRealtimeDebug("mic start");
      emitRealtimeEvent(conn, { type: "input_audio_buffer.clear" }, "input_audio_buffer.clear");
      resetAIDelta();
      conn.localTrack.enabled = true;
      setStatus("Listening (hold)…");
      startBtn.textContent = "Release to send";
    };

    const onUp = () => {
      if (!conn) return;
      logRealtimeDebug("mic stop");
      setStatus("Thinking…");
      startBtn.textContent = "Hold to talk";
      logRealtimeDebug("input committed");
      emitRealtimeEvent(conn, { type: "input_audio_buffer.commit" }, "input_audio_buffer.commit");
      conn.localTrack.enabled = false;
      setTimeout(() => {
        if (!isMeaningfulSpeech(latestCommittedTranscript)) {
          logRealtimeDebug("response skipped because no meaningful speech was detected", latestCommittedTranscript);
          setStatus("Ready (push-to-talk)");
          return;
        }
        logRealtimeDebug("response requested");
        emitRealtimeEvent(conn, {
          type: "response.create",
          response: {
            output_modalities: ["audio"]
          }
        }, "response.create");
      }, 180);
    };

    const onLeave = (event) => {
      if (event.buttons) onUp();
    };

    startBtn.addEventListener("pointerdown", onDown);
    startBtn.addEventListener("pointerup", onUp);
    startBtn.addEventListener("pointercancel", onUp);
    startBtn.addEventListener("pointerleave", onLeave);
    startBtn.addEventListener("click", suppressClickWhileLive, true);

    pttListeners.push({ el: startBtn, type: "pointerdown", handler: onDown });
    pttListeners.push({ el: startBtn, type: "pointerup", handler: onUp });
    pttListeners.push({ el: startBtn, type: "pointercancel", handler: onUp });
    pttListeners.push({ el: startBtn, type: "pointerleave", handler: onLeave });
    pttListeners.push({ el: startBtn, type: "click", handler: suppressClickWhileLive, options: true });
    conn.__setLatestCommittedTranscript = (text) => {
      latestCommittedTranscript = String(text || "");
    };
  }

  function unwindPushToTalk() {
    for (const { el, type, handler, options } of pttListeners) {
      el.removeEventListener(type, handler, options);
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
    logRealtimeDebug(`event:${evt.type}`, evt);

    if (evt.type === "input_audio_buffer.speech_started") setStatus("Speaking…");
    if (evt.type === "input_audio_buffer.speech_stopped") setStatus("Thinking…");
    if (evt.type === "input_audio_buffer.committed") {
      logRealtimeDebug("input audio appended and committed", evt);
    }
    if (evt.type === "session.updated") {
      logRealtimeDebug("session updated", evt.session || evt);
    }
    if (evt.type === "response.created") {
      logRealtimeDebug("response created", evt.response || evt);
    }
    if (evt.type === "error") {
      console.error("[AI Realtime] server event error", evt.error || evt);
      return;
    }

    if (evt.type === "conversation.item.input_audio_transcription.delta" && evt.delta) {
      logRealtimeDebug("transcript received (user delta)", evt.delta);
      upsertTranscriptStream(`user:${evt.item_id || "live"}`, "You", evt.delta);
    }

    if (evt.type === "conversation.item.input_audio_transcription.completed" && evt.transcript) {
      logRealtimeDebug("transcript received (user final)", evt.transcript);
      upsertTranscriptStream(`user:${evt.item_id || "live"}`, "You", evt.transcript, { replace: true });
      realtimeConnection?.__setLatestCommittedTranscript?.(evt.transcript);
      if (isMeaningfulSpeech(evt.transcript)) {
        bufferMessage("user", evt.transcript);
      } else {
        logRealtimeDebug("ignored filler/noise transcript", evt.transcript);
      }
    }

    if (evt.type === "response.output_audio_transcript.delta" && evt.delta) {
      logRealtimeDebug("assistant response received (audio transcript delta)", evt.delta);
      const t = String(evt.delta || "");
      if (t) appendAIDelta(t);
    }

    if (evt.type === "response.output_audio_transcript.done" && evt.transcript) {
      logRealtimeDebug("assistant response received (audio transcript final)", evt.transcript);
      upsertTranscriptStream(`assistant:${evt.item_id || "live"}`, "AI", evt.transcript, { replace: true });
      bufferMessage("assistant", evt.transcript);
      resetAIDelta();
      flushTranscriptToServer().catch(() => {});
      scrollTranscriptToBottom();
    }

    if (evt.type === "response.output_text.delta" && evt.delta) {
      logRealtimeDebug("assistant response received (text delta)", evt.delta);
      appendAIDelta(evt.delta);
    }

    if (evt.type === "response.output_text.done" && evt.text) {
      logRealtimeDebug("assistant response received (text final)", evt.text);
      upsertTranscriptStream(`assistant:${evt.item_id || "text"}`, "AI", evt.text, { replace: true });
      bufferMessage("assistant", evt.text);
      resetAIDelta();
      flushTranscriptToServer().catch(() => {});
      scrollTranscriptToBottom();
    }

    if (evt.type === "response.output_audio.delta") {
      logRealtimeDebug("assistant audio chunk received", evt);
    }

    if (evt.type === "response.done") {
      setStatus("Listening");
      if (aiDeltaEl?.textContent) {
        bufferMessage("assistant", aiDeltaEl.textContent);
        resetAIDelta();
      }
      flushTranscriptToServer().catch(() => {});
      scrollTranscriptToBottom();
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
    audioEl.style.display = "none";
    document.body.appendChild(audioEl);
    let resolveReady;
    let rejectReady;
    const readyPromise = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    pc.ontrack = (event) => {
      logRealtimeDebug("audio track received", {
        streams: event.streams?.length || 0,
        trackKind: event.track?.kind || null,
        trackId: event.track?.id || null
      });
      audioEl.srcObject = event.streams[0];
      audioEl.play().then(() => {
        logRealtimeDebug("audio playback started");
        setAudioUnlockVisible(false);
      }).catch((err) => {
        console.warn("[AI Realtime] audio playback blocked", err);
        setAudioUnlockVisible(true);
      });
    };

    const dc = pc.createDataChannel("oai-events");
    dc.onmessage = (e) => {
      try {
        onEvent?.(JSON.parse(e.data));
      } catch (err) {
        // ignore parse failures
      }
    };
    dc.onopen = () => {
      logRealtimeDebug("data channel open");
      onStatus?.("Connected");
      resolveReady?.();
    };
    dc.onclose = () => {
      logRealtimeDebug("data channel closed");
      onStatus?.("Disconnected");
    };
    dc.onerror = (err) => {
      console.error("[AI Realtime] data channel error", err);
      rejectReady?.(err);
    };

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
      if (dc.readyState !== "open") {
        logRealtimeDebug("sendEvent skipped, data channel not open yet", payload?.type || payload);
        return false;
      }
      dc.send(JSON.stringify(payload));
      return true;
    }

    function stop() {
      try { dc.close(); } catch {}
      try { localTrack.stop(); } catch {}
      try { pc.close(); } catch {}
      try { stream.getTracks().forEach((t) => t.stop()); } catch {}
      try { audioEl.remove(); } catch {}
      setAudioUnlockVisible(false);
    }

    async function resumeAudioPlayback() {
      if (!audioEl.srcObject) return;
      await audioEl.play();
      logRealtimeDebug("audio playback started");
    }

    return { pc, dc, localTrack, sendEvent, stop, waitForReady: () => readyPromise, resumeAudioPlayback };
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
    setAudioUnlockVisible(false);
    setSpeakingSessionActive(false);
  }

  async function handleStart() {
    const startBtn = $("aiStartBtn");
    const stopBtn = $("aiStopBtn");
    if (!startBtn || !stopBtn) return;
    if (realtimeConnection) {
      logRealtimeDebug("handleStart ignored because a session is already active");
      return;
    }
    if (isBlocked()) {
      showBlockedUI("Budget exhausted. Ask your admin to top it up.");
      return;
    }

    startBtn.disabled = true;
    setStatus("Checking budget…");
    setActiveControlsVisible(true);

    try {
      const scenarioSelect = $("aiScenario");
      const scenarioValue = normalizeScenarioId(scenarioSelect?.value || DEFAULT_TOPIC_ID);
      const scenarioConfig = getScenarioConfig(scenarioValue);
      const scenarioVoice = scenarioConfig?.voice || "alloy";
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
      if (!response.ok) {
        throw new Error(data?.error || `Realtime session request failed (${response.status})`);
      }
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
      await realtimeConnection.waitForReady();
      stopBtn.disabled = false;
      appendTranscript("System", `Connected with scenario ${scenarioValue}`);
      resetAIDelta();
      setSpeakingSessionActive(true);
      if (selectedMode === "ptt") {
        applyPTTConfig(realtimeConnection, data.voice || scenarioVoice);
        wirePushToTalk(startBtn, realtimeConnection);
        startBtn.disabled = false;
        setStatus("Ready (push-to-talk)");
      } else {
        applyVADConfig(realtimeConnection, data.voice || scenarioVoice);
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
      setSpeakingSessionActive(false);
    });
    setActiveControlsVisible(false);
    setSpeakingSessionActive(false);
    setAudioUnlockVisible(false);
    wireAudioUnlock();
    const closeBtn = $("aiSessionCloseBtn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        const stop = $("aiStopBtn");
        if (stop && !stop.disabled) {
          stop.click();
          return;
        }
        resetOverlays();
        setSpeakingSessionActive(false);
      });
    }
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
