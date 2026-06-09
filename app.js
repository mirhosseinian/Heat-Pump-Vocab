/* ============================================================
   Heat Pump Lexikon — Anwendungslogik
   - Lädt vocabulary.json und mischt eigene Begriffe dazu
   - Spaced Repetition nach dem SM-2-Verfahren
   - Fortschritt dauerhaft im Browser (localStorage)
   - Aussprache über die Web Speech API
   ============================================================ */

(() => {
  "use strict";

  // App-Version: wird bei jeder Programmänderung erhöht.
  const APP_VERSION = "1.1.0";

  const LS = {
    progress: "hpv.progress.v1",
    custom: "hpv.custom.v1",
    theme: "hpv.theme.v1",
  };
  const DAY = 86_400_000;
  const MATURE_DAYS = 21;

  /* ---------- Speicher-Helfer ---------- */
  const store = {
    read(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
      catch { return fallback; }
    },
    write(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch { return false; }
    },
  };

  /* ---------- Zustand ---------- */
  const state = {
    deck: [],            // alle Karten (Datei + eigene)
    baseMeta: null,      // Metadaten aus vocabulary.json (u. a. version)
    progress: {},        // { id: sm2State }  — überlebt Kartenänderungen
    session: null,       // aktuelle Lernsitzung
    voices: [],
  };

  /* ---------- DOM ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ============================================================
     Daten laden & zusammenführen
     ============================================================ */
  async function loadBaseCards() {
    try {
      const res = await fetch("vocabulary.json", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      state.baseMeta = (data && data.meta) ? data.meta : null;
      return Array.isArray(data) ? data : (data.cards || []);
    } catch (err) {
      console.warn("vocabulary.json konnte nicht geladen werden:", err);
      state.baseMeta = null;
      return [];
    }
  }

  function buildDeck(baseCards) {
    const custom = store.read(LS.custom, []);
    const byId = new Map();
    for (const c of baseCards) if (c && c.id) byId.set(c.id, c);
    for (const c of custom) if (c && c.id) byId.set(c.id, c); // eigene überschreiben/ergänzen
    state.deck = [...byId.values()];
  }

  function loadProgress() {
    state.progress = store.read(LS.progress, {});
  }
  function saveProgress() {
    store.write(LS.progress, state.progress);
  }

  /* ============================================================
     Spaced Repetition (SM-2)
     ============================================================ */
  function defaultSM2() {
    return { rep: 0, ease: 2.5, interval: 0, due: 0, lapses: 0, last: 0, seen: false };
  }
  function getState(id) {
    return state.progress[id] ? { ...defaultSM2(), ...state.progress[id] } : null;
  }
  function isNew(id) { const s = state.progress[id]; return !s || !s.seen; }
  function isDue(id, now = Date.now()) {
    const s = state.progress[id];
    if (!s || !s.seen) return true;          // neue Karten sind sofort fällig
    return s.due <= now;
  }
  function isMature(id) {
    const s = state.progress[id];
    return s && s.seen && s.interval >= MATURE_DAYS;
  }
  function isLearning(id) {
    const s = state.progress[id];
    return s && s.seen && s.interval < MATURE_DAYS;
  }

  // grade: "again" | "good" | "easy"
  function grade(id, grade, now = Date.now()) {
    const s = getState(id) || defaultSM2();

    if (grade === "again") {
      s.rep = 0;
      s.lapses += 1;
      s.ease = Math.max(1.3, s.ease - 0.2);
      s.interval = 0;
      s.due = now + 60_000;          // in dieser Sitzung erneut
    } else {
      const bonus = grade === "easy" ? 1.3 : 1;
      s.ease = Math.max(1.3, s.ease + (grade === "easy" ? 0.15 : 0.0));
      if (s.rep === 0)      s.interval = grade === "easy" ? 3 : 1;
      else if (s.rep === 1) s.interval = grade === "easy" ? 7 : 4;
      else                  s.interval = Math.max(1, Math.round(s.interval * s.ease * bonus));
      s.rep += 1;
      s.due = now + s.interval * DAY;
    }
    s.last = now;
    s.seen = true;
    state.progress[id] = s;
    saveProgress();
    return s;
  }

  /* ============================================================
     Lernsitzung
     ============================================================ */
  function buildSession() {
    const now = Date.now();
    const reviews = [];
    const news = [];
    for (const c of state.deck) {
      if (isNew(c.id)) news.push(c.id);
      else if (isDue(c.id, now)) reviews.push(c.id);
    }
    const queue = [...reviews, ...news];
    state.session = {
      queue,
      goal: queue.length,
      passed: new Set(),
      revealed: false,
      seenThisSession: 0,
    };
  }

  function currentCard() {
    if (!state.session || !state.session.queue.length) return null;
    const id = state.session.queue[0];
    return state.deck.find((c) => c.id === id) || null;
  }

  function answer(g) {
    const sess = state.session;
    if (!sess || !sess.queue.length) return;
    const id = sess.queue.shift();
    grade(id, g);
    if (g === "again") {
      // in dieser Sitzung wieder einreihen (ein paar Karten später)
      const pos = Math.min(3, sess.queue.length);
      sess.queue.splice(pos, 0, id);
    } else {
      sess.passed.add(id);
    }
    sess.revealed = false;
    renderStudy();
    renderDashboard();
  }

  /* ============================================================
     Aussprache (Web Speech API)
     ============================================================ */
  function loadVoices() {
    if (!("speechSynthesis" in window)) return;
    state.voices = speechSynthesis.getVoices();
  }
  function pickVoice(lang) {
    const pref = state.voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(lang));
    return pref[0] || null;
  }
  function speak(text, lang, btn) {
    if (!("speechSynthesis" in window)) { toast("Sprachausgabe wird vom Browser nicht unterstützt."); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(lang);
    if (v) u.voice = v;
    u.lang = v ? v.lang : (lang === "en" ? "en-GB" : lang === "de" ? "de-DE" : "fa-IR");
    u.rate = 0.94;
    if (btn) {
      u.onstart = () => btn.classList.add("is-speaking");
      const clear = () => btn.classList.remove("is-speaking");
      u.onend = clear; u.onerror = clear;
    }
    speechSynthesis.speak(u);
  }

  /* ============================================================
     Rendern — Übersicht
     ============================================================ */
  function renderDashboard() {
    const now = Date.now();
    const total = state.deck.length;
    let due = 0, news = 0, learning = 0, mature = 0;
    for (const c of state.deck) {
      if (isNew(c.id)) { news++; due++; }
      else { if (isDue(c.id, now)) due++; if (isMature(c.id)) mature++; else if (isLearning(c.id)) learning++; }
    }

    $("#stats").innerHTML = `
      <div class="stat stat--due"><div class="stat__num">${due}</div><div class="stat__lbl">jetzt fällig</div></div>
      <div class="stat stat--new"><div class="stat__num">${news}</div><div class="stat__lbl">neu</div></div>
      <div class="stat stat--learning"><div class="stat__num">${learning}</div><div class="stat__lbl">im Lernstapel</div></div>
      <div class="stat stat--mature"><div class="stat__num">${mature}</div><div class="stat__lbl">gefestigt</div></div>
    `;

    const cta = $("#startStudy");
    const meta = $("#ctaMeta");
    if (total === 0) {
      cta.disabled = true;
      $(".cta__label").textContent = "Keine Begriffe geladen";
      meta.textContent = "";
    } else if (due === 0) {
      cta.disabled = true;
      $(".cta__label").textContent = "Für heute erledigt";
      meta.textContent = `${mature}/${total} gefestigt`;
    } else {
      cta.disabled = false;
      $(".cta__label").textContent = "Lernsitzung starten";
      meta.textContent = `${due} fällig`;
    }

    renderVersion();
    renderCategories();
  }

  function renderVersion() {
    const dataV = state.baseMeta && state.baseMeta.version ? state.baseMeta.version : "?";
    const updated = state.baseMeta && state.baseMeta.updated ? state.baseMeta.updated : "";
    let txt = `App ${APP_VERSION} · Vokabeldaten v${dataV} · ${state.deck.length} Begriffe`;
    if (updated) txt += ` · Stand ${updated}`;

    let el = document.getElementById("versionLine");
    if (!el) {
      el = document.createElement("p");
      el.id = "versionLine";
      el.className = "muted small";
      el.style.marginTop = "10px";
      el.style.fontFamily = "var(--font-mono)";
      const head = document.querySelector(".view--dashboard .dash-head");
      if (head) head.appendChild(el);
    }
    el.textContent = txt;

    const sub = document.querySelector(".brand__sub");
    if (sub) sub.textContent = `EN 14511 · EN 14825 · v${APP_VERSION}`;
  }

  function renderCategories() {
    const groups = new Map();
    for (const c of state.deck) {
      const k = c.category || "Sonstige";
      if (!groups.has(k)) groups.set(k, { total: 0, mature: 0 });
      const g = groups.get(k);
      g.total++;
      if (isMature(c.id)) g.mature++;
    }
    const list = $("#catList");
    if (!groups.size) { list.innerHTML = `<p class="muted small">Noch keine Begriffe vorhanden.</p>`; return; }
    list.innerHTML = [...groups.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, g]) => {
        const pct = g.total ? Math.round((g.mature / g.total) * 100) : 0;
        return `<div class="cat">
          <span class="cat__name">${escapeHtml(name)}</span>
          <span class="cat__count">${g.mature}/${g.total} gefestigt</span>
          <span class="cat__track"><span class="cat__fill" style="width:${pct}%"></span></span>
        </div>`;
      }).join("");
  }

  /* ============================================================
     Rendern — Lernen
     ============================================================ */
  function renderStudy() {
    const stage = $("#studyStage");
    const empty = $("#studyEmpty");
    const card = currentCard();

    if (!card) {
      stage.hidden = true;
      empty.hidden = false;
      return;
    }
    stage.hidden = false;
    empty.hidden = true;

    // Fortschritt der Sitzung
    const sess = state.session;
    const remaining = new Set(sess.queue).size;
    const done = Math.max(0, sess.goal - remaining);
    $("#studyCount").textContent = `${done} / ${sess.goal}`;
    $("#studyBar").style.width = `${sess.goal ? (done / sess.goal) * 100 : 0}%`;

    // Vorderseite
    $("#cardCategory").textContent = card.category || "";
    $("#cardCategory").style.display = card.category ? "" : "none";
    $("#frontTerm").textContent = card.term;

    // Rückseite befüllen (versteckt, bis aufgedeckt)
    $("#backDe").textContent = card.de || "";
    $("#backFa").textContent = card.fa || "";
    $("#exEn").textContent = card.exampleEn || "";
    $("#exDe").textContent = card.exampleDe || "";
    $("#exFa").textContent = card.exampleFa || "";

    // Aufdeck-Zustand
    const revealed = sess.revealed;
    $("#cardBack").hidden = !revealed;
    $("#revealBtn").hidden = revealed;
    $("#gradeRow").hidden = !revealed;

    // Vorschau der Intervalle auf den Bewertungsknöpfen
    if (revealed) {
      $("#hintAgain").textContent = "< 1 Min";
      $("#hintGood").textContent = previewInterval(card.id, "good");
      $("#hintEasy").textContent = previewInterval(card.id, "easy");
    }
  }

  function previewInterval(id, g) {
    const s = getState(id) || defaultSM2();
    let interval;
    const bonus = g === "easy" ? 1.3 : 1;
    if (s.rep === 0)      interval = g === "easy" ? 3 : 1;
    else if (s.rep === 1) interval = g === "easy" ? 7 : 4;
    else                  interval = Math.max(1, Math.round(s.interval * (s.ease + (g === "easy" ? 0.15 : 0)) * bonus));
    return interval === 1 ? "1 Tag" : `${interval} Tage`;
  }

  function reveal() {
    if (!state.session) return;
    state.session.revealed = true;
    renderStudy();
  }

  /* ============================================================
     Rendern — Hinzufügen / Verwalten
     ============================================================ */
  function normalizeInput(raw) {
    const data = JSON.parse(raw);
    let cards;
    if (Array.isArray(data)) cards = data;
    else if (data && Array.isArray(data.cards)) cards = data.cards;
    else if (data && data.id) cards = [data];
    else throw new Error("Format nicht erkannt.");

    const cleaned = [];
    for (const c of cards) {
      if (!c || !c.id || !c.term) throw new Error("Jede Karte braucht mindestens 'id' und 'term'.");
      cleaned.push({
        id: String(c.id),
        term: String(c.term),
        de: c.de ? String(c.de) : "",
        fa: c.fa ? String(c.fa) : "",
        exampleEn: c.exampleEn ? String(c.exampleEn) : "",
        exampleDe: c.exampleDe ? String(c.exampleDe) : "",
        exampleFa: c.exampleFa ? String(c.exampleFa) : "",
        category: c.category ? String(c.category) : "Eigene",
      });
    }
    return cleaned;
  }

  function importCards() {
    const msg = $("#importMsg");
    const raw = $("#importText").value.trim();
    if (!raw) { setMsg(msg, "Bitte zuerst JSON einfügen.", "err"); return; }
    let cards;
    try { cards = normalizeInput(raw); }
    catch (e) { setMsg(msg, "Fehler: " + e.message, "err"); return; }

    const custom = store.read(LS.custom, []);
    const byId = new Map(custom.map((c) => [c.id, c]));
    let added = 0, updated = 0;
    for (const c of cards) { (byId.has(c.id) ? updated++ : added++); byId.set(c.id, c); }
    store.write(LS.custom, [...byId.values()]);

    buildDeck(state.baseCards);
    renderDashboard();
    setMsg(msg, `${added} neu, ${updated} aktualisiert. Fortschritt bleibt erhalten.`, "ok");
    $("#importText").value = "";
    toast(`${added + updated} Begriffe übernommen`);
  }

  function setMsg(el, text, type) {
    el.textContent = text;
    el.classList.toggle("is-ok", type === "ok");
    el.classList.toggle("is-err", type === "err");
  }

  function exportProgress() {
    const payload = {
      exported: new Date().toISOString(),
      progress: state.progress,
      custom: store.read(LS.custom, []),
    };
    download("waermepumpe-lernstand.json", JSON.stringify(payload, null, 2));
    toast("Lernstand exportiert");
  }

  function restoreProgress(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.progress && typeof data.progress === "object") {
          state.progress = data.progress;
          saveProgress();
        }
        if (Array.isArray(data.custom)) store.write(LS.custom, data.custom);
        buildDeck(state.baseCards);
        renderDashboard();
        toast("Lernstand wiederhergestellt");
      } catch { toast("Datei konnte nicht gelesen werden"); }
    };
    reader.readAsText(file);
  }

  function resetProgress() {
    if (!confirm("Wirklich den gesamten Lernfortschritt löschen? Die Begriffe selbst bleiben erhalten.")) return;
    state.progress = {};
    saveProgress();
    state.session = null;
    renderDashboard();
    renderStudy();
    toast("Fortschritt zurückgesetzt");
  }

  async function reloadBase() {
    state.baseCards = await loadBaseCards();
    buildDeck(state.baseCards);
    renderDashboard();
    toast(state.baseCards.length ? `${state.baseCards.length} Begriffe geladen` : "vocabulary.json nicht erreichbar");
  }

  /* ============================================================
     Navigation & Theme
     ============================================================ */
  function showView(name) {
    $$(".view").forEach((v) => v.classList.toggle("is-active", v.dataset.view === name));
    $$(".nav__btn").forEach((b) => b.classList.toggle("is-active", b.dataset.view === name));
    if (name === "study") {
      if (!state.session || !state.session.queue.length) buildSession();
      renderStudy();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function initTheme() {
    const saved = store.read(LS.theme, null);
    const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    const theme = saved || (prefersLight ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", theme);
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    store.write(LS.theme, next);
  }

  /* ---------- Kleine Helfer ---------- */
  let toastTimer;
  function toast(text) {
    const el = $("#toast");
    el.textContent = text;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2400);
  }
  function download(name, content) {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ============================================================
     Ereignisse
     ============================================================ */
  function bindEvents() {
    $$(".nav__btn, [data-view]").forEach((el) => {
      if (el.matches(".view")) return;
      el.addEventListener("click", (e) => {
        if (e.currentTarget.dataset.view) showView(e.currentTarget.dataset.view);
      });
    });

    $("#startStudy").addEventListener("click", () => { buildSession(); showView("study"); });
    $("#themeToggle").addEventListener("click", toggleTheme);

    $("#revealBtn").addEventListener("click", reveal);
    $("#gradeRow").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-grade]");
      if (btn) answer(btn.dataset.grade);
    });

    // Aussprache
    $("#frontAudioEn").addEventListener("click", (e) => { const c = currentCard(); if (c) speak(stripParen(c.term), "en", e.currentTarget); });
    $("#backAudioDe").addEventListener("click", (e) => { const c = currentCard(); if (c) speak(stripParen(c.de), "de", e.currentTarget); });
    $("#exAudioEn").addEventListener("click", (e) => { const c = currentCard(); if (c) speak(c.exampleEn, "en", e.currentTarget); });
    $("#exAudioDe").addEventListener("click", (e) => { const c = currentCard(); if (c) speak(c.exampleDe, "de", e.currentTarget); });

    // Verwalten
    $("#importBtn").addEventListener("click", importCards);
    $("#reloadBtn").addEventListener("click", reloadBase);
    $("#exportBtn").addEventListener("click", exportProgress);
    $("#resetBtn").addEventListener("click", resetProgress);
    $("#restoreFile").addEventListener("change", (e) => { if (e.target.files[0]) restoreProgress(e.target.files[0]); e.target.value = ""; });

    // Tastatur im Lernmodus
    document.addEventListener("keydown", (e) => {
      const studyActive = $(".view--study").classList.contains("is-active");
      if (!studyActive || !state.session) return;
      if (e.target.matches("textarea, input")) return;
      if (!state.session.revealed && (e.code === "Space" || e.code === "Enter")) { e.preventDefault(); reveal(); }
      else if (state.session.revealed) {
        if (e.key === "1") answer("again");
        else if (e.key === "2") answer("good");
        else if (e.key === "3") answer("easy");
      }
    });

    if ("speechSynthesis" in window) {
      loadVoices();
      speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  function stripParen(s) { return String(s || "").replace(/\(.*?\)/g, "").trim(); }

  /* ============================================================
     Start
     ============================================================ */
  async function init() {
    initTheme();
    loadProgress();
    bindEvents();
    state.baseCards = await loadBaseCards();
    buildDeck(state.baseCards);
    renderDashboard();
    if (!state.deck.length) {
      toast("vocabulary.json nicht gefunden – Begriffe unter „Hinzufügen“ einspielen.");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
