const $ = (sel) => document.querySelector(sel);

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderWithSuffix(value) {
  if (typeof value === "string") return `<span class="word">${escapeHtml(value)}</span>`;
  const base = value.base ?? "";
  const suffix = value.suffix ?? "";
  return `<span class="word">${escapeHtml(base)}<span class="ending">${escapeHtml(suffix)}</span></span>`;
}

function buildConjugation(conj) {
  $("#conjTitle").textContent = conj.title;

  const grid = $("#conjGrid");
  grid.innerHTML = "";

  const headerRow = document.createElement("div");
  headerRow.className = "conj-row conj-row--header";
  headerRow.innerHTML = `
    <div class="conj-cell conj-cell--pronoun conj-cell--header"></div>
    ${conj.verbs
      .map(
        (v) => `
    <div class="conj-cell conj-cell--header">
      <div class="verb-head">${escapeHtml(v.label)}</div>
      <div class="rule"></div>
    </div>
  `
      )
      .join("")}
  `;
  grid.appendChild(headerRow);

  conj.pronouns.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "conj-row";
    row.innerHTML = `
      <div class="conj-cell conj-cell--pronoun">
        <span class="pronoun">${escapeHtml(p)}</span>
        <div class="rule"></div>
      </div>
      ${conj.verbs
        .map((v) => {
          const val = v.forms[i];
          return `
          <div class="conj-cell">
            ${renderWithSuffix(val)}
            <div class="rule"></div>
          </div>
        `;
        })
        .join("")}
    `;
    grid.appendChild(row);
  });
}

function buildMiniTable(table) {
  const headers = table.headers || ["Position 1", "Position 2"];
  const rows = table.rows || [];

  return `
    <div class="mini">
      <div class="mini-head">
        <div class="mini-h mini-h--pos1">${escapeHtml(headers[0])}</div>
        <div class="mini-h mini-h--pos2">${escapeHtml(headers[1])}</div>
        <div class="mini-h mini-h--rest"></div>
      </div>

      <div class="mini-body">
        ${rows
          .map((r) => `
        <div class="mini-row">
          <div class="mini-c mini-c--pos1">
            <span class="mini-text">${escapeHtml(r[0] ?? "")}</span>
            <div class="rule"></div>
          </div>
          <div class="mini-c mini-c--pos2">
            <span class="mini-text">${escapeHtml(r[1] ?? "")}</span>
            <div class="rule"></div>
          </div>
          <div class="mini-c mini-c--rest">
            <span class="mini-text">${escapeHtml(r[2] ?? "")}</span>
            <div class="rule"></div>
          </div>
        </div>
      `)
          .join("")}
      </div>
    </div>
  `;
}

function buildWordOrder(wo) {
  $("#woTitle").textContent = wo.title;

  const root = $("#woLayout");
  root.innerHTML = "";

  const top = document.createElement("div");
  top.className = "wo-row";

  top.innerHTML = `
    <div class="wo-col">
      <div class="wo-subtitle">${escapeHtml(wo.blocks.leftTop.label)}</div>
      ${buildMiniTable(wo.blocks.leftTop.table)}
    </div>

    <div class="wo-col">
      <div class="wo-subtitle wo-subtitle--center">${escapeHtml(wo.blocks.rightTop.label)}</div>
      ${buildMiniTable(wo.blocks.rightTop.table)}
    </div>
  `;

  const bottom = document.createElement("div");
  bottom.className = "wo-row wo-row--gap";

  bottom.innerHTML = `
    <div class="wo-col">
      <div class="wo-subtitle">${escapeHtml(wo.blocks.leftBottom.label)}</div>
      ${buildMiniTable(wo.blocks.leftBottom.table)}
    </div>

    <div class="wo-col">
      <div class="wo-subtitle wo-subtitle--center">${escapeHtml(wo.blocks.rightBottom.label)}</div>
      ${buildMiniTable(wo.blocks.rightBottom.table)}
    </div>
  `;

  root.appendChild(top);
  root.appendChild(bottom);
}


function renderAccentTextPart(part) {
  if (typeof part === "string") return escapeHtml(part);
  const text = part?.text ?? "";
  const accent = part?.accent ? " hs-accent" : "";
  return `<span class="hs-t${accent}">${escapeHtml(text)}</span>`;
}

function renderAccentTextLine(parts) {
  return (parts || []).map(renderAccentTextPart).join("");
}

function renderCellValue(v) {
  if (typeof v === "string") return `<span class="hs-t">${escapeHtml(v)}</span>`;
  const text = v?.text ?? "";
  const accent = v?.accent ? " hs-accent" : "";
  return `<span class="hs-t${accent}">${escapeHtml(text)}</span>`;
}

function buildHabenSeinPack(pack) {
  if (!pack) return;
  $("#hsTitle").textContent = pack.title || "";

  const t = pack.table || {};
  const rows = t.rows || [];
  const groups = t.groups || [];

  const root = $("#hsTable");
  if (!root) return;
  root.innerHTML = "";

  const h1 = document.createElement("div");
  h1.className = "hs-row hs-row--h1";
  h1.innerHTML = `
    <div class="hs-cell hs-cell--p"></div>
    <div class="hs-cell hs-cell--g" style="grid-column: span 2">
      <div class="hs-gh">${escapeHtml(groups[0]?.label || "")}</div>
      <div class="hs-line"></div>
    </div>
    <div class="hs-cell hs-cell--g" style="grid-column: span 2">
      <div class="hs-gh">${escapeHtml(groups[1]?.label || "")}</div>
      <div class="hs-line"></div>
    </div>
  `;
  root.appendChild(h1);

  const h2 = document.createElement("div");
  h2.className = "hs-row hs-row--h2";
  h2.innerHTML = `
    <div class="hs-cell hs-cell--p"></div>
    <div class="hs-cell hs-cell--h">
      <div class="hs-h">${escapeHtml(groups[0]?.cols?.[0] || "Präsens")}</div>
      <div class="hs-line"></div>
    </div>
    <div class="hs-cell hs-cell--h">
      <div class="hs-h">${escapeHtml(groups[0]?.cols?.[1] || "Präteritum")}</div>
      <div class="hs-line"></div>
    </div>
    <div class="hs-cell hs-cell--h">
      <div class="hs-h">${escapeHtml(groups[1]?.cols?.[0] || "Präsens")}</div>
      <div class="hs-line"></div>
    </div>
    <div class="hs-cell hs-cell--h">
      <div class="hs-h">${escapeHtml(groups[1]?.cols?.[1] || "Präteritum")}</div>
      <div class="hs-line"></div>
    </div>
  `;
  root.appendChild(h2);

  rows.forEach((r) => {
    const row = document.createElement("div");
    row.className = "hs-row";
    row.innerHTML = `
      <div class="hs-cell hs-cell--p">
        <div class="hs-pn">${escapeHtml(r.p || "")}</div>
        <div class="hs-line"></div>
      </div>
      <div class="hs-cell">
        <div class="hs-v">${renderCellValue(r?.haben?.[0])}</div>
        <div class="hs-line"></div>
      </div>
      <div class="hs-cell">
        <div class="hs-v">${renderCellValue(r?.haben?.[1])}</div>
        <div class="hs-line"></div>
      </div>
      <div class="hs-cell">
        <div class="hs-v">${renderCellValue(r?.sein?.[0])}</div>
        <div class="hs-line"></div>
      </div>
      <div class="hs-cell">
        <div class="hs-v">${renderCellValue(r?.sein?.[1])}</div>
        <div class="hs-line"></div>
      </div>
    `;
    root.appendChild(row);
  });

  const s = pack.subjectOrder || {};
  $("#hsSubjTitle").textContent = s.title || "";
  $("#hsSubjText1").textContent = s.text1 || "";
  $("#hsSubjText2").textContent = s.text2 || "";

  const ex = $("#hsExamples");
  if (ex) {
    ex.innerHTML = `
      <div class="hs-excol">
        ${(s.left || []).map((x) => `<div class="hs-exline">${renderAccentTextLine(x.parts || [])}</div>`).join("")}
      </div>
      <div class="hs-excol">
        ${(s.right || []).map((x) => `<div class="hs-exline">${renderAccentTextLine(x.parts || [])}</div>`).join("")}
      </div>
    `;
  }

  const a = pack.accPronouns || {};
  $("#hsAccTitle").textContent = a.title || "";
  const acc = $("#hsAcc");
  if (acc) {
    const cols = a.columns || [];
    const rows = a.rows || [];
    acc.innerHTML = `
      <div class="hs-acc-head">
        ${cols.map((c) => `<div class="hs-acc-h"><div class="hs-acc-ht">${escapeHtml(c)}</div><div class="hs-line"></div></div>`).join("")}
      </div>
      <div class="hs-acc-body">
        ${rows.map((row) => `<div class="hs-acc-row">${row.map((cell) => `<div class="hs-acc-c"><div class="hs-acc-t">${escapeHtml(cell)}</div><div class="hs-line"></div></div>`).join("")}</div>`).join("")}
      </div>
    `;
  }
}

async function init() {
  const res = await fetch("/Grammar/data.json");
  const data = await res.json();

  if (data.conjugation) buildConjugation(data.conjugation);
  if (data.wordOrder) buildWordOrder(data.wordOrder);

  if (data.articles) buildArticlesCard(data.articles);
  if (data.possessives) buildPossessivesCard(data.possessives);
  if (data.connectors) buildConnectorsCard(data.connectors);

  if (data.habeSeinPack) buildHabenSeinPack(data.habeSeinPack);
}

init().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<p style="color:#900;font-family:system-ui;padding:12px">Could not load data.json. Make sure you run this from a server OR allow local file fetch.</p>`
  );
});
