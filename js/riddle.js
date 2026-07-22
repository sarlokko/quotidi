import { getDailyKey, hashString, loadState, saveState, normalizeText } from "./daily.js";

const STORAGE_KEY = "quotid-riddle-v3";

let daily = null;
let onComplete = null;
let eventsBound = false;

function stripArticle(s) {
  return s
    .replace(/^(l['’]|lo |la |il |i |gli |le |un |una |uno |dell['’]|dello |della |degli |delle )/, "")
    .trim();
}

function answersMatch(guessRaw, riddle) {
  const guess = normalizeText(guessRaw);
  if (!guess) return false;

  const candidates = [riddle.a, ...(riddle.aliases || [])]
    .map((x) => normalizeText(x))
    .filter(Boolean);

  const g = stripArticle(guess);

  for (const answer of candidates) {
    if (guess === answer) return true;
    const a = stripArticle(answer);
    if (g && a && g === a) return true;

    // Accetta forme vicine: "passi" / "i passi", "orologio" / "orologio da muro"
    if (g.length >= 3 && (a === g || a.startsWith(`${g} `) || a.endsWith(` ${g}`) || a.includes(` ${g} `))) {
      return true;
    }
    if (a.length >= 4 && (g === a || g.startsWith(`${a} `) || g.endsWith(` ${a}`) || g.includes(` ${a} `))) {
      return true;
    }
  }

  return false;
}

function pickRiddle(dayKey, list) {
  const n = list.length;
  if (!n) return null;
  const [y, m, d] = dayKey.split("-").map(Number);
  const ordinal = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  const order = Array.from({ length: n }, (_, i) => i);
  let h = hashString(`riddle-deck-v3:${n}`);
  for (let i = n - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return list[order[((ordinal % n) + n) % n]];
}

export async function initRiddle(onDone) {
  onComplete = onDone;
  const riddles = await (await fetch("data/riddles.json?v=20260722riddle")).json();
  daily = pickRiddle(getDailyKey(), riddles);
  if (!daily?.q || !daily?.a) {
    throw new Error("Indovinello del giorno non valido");
  }

  const saved = loadState(STORAGE_KEY, getDailyKey());
  const solved = saved?.solved ?? false;
  const revealed = saved?.revealed ?? false;
  const done = solved || revealed;

  document.getElementById("riddle-text").textContent = daily.q;
  const answerEl = document.getElementById("riddle-answer");
  answerEl.textContent = done ? daily.a : "???";
  answerEl.classList.toggle("hidden-answer", !done);
  answerEl.classList.toggle("revealed", done);

  const input = document.getElementById("riddle-input");
  input.value = saved?.guess || "";
  input.disabled = done;

  document.getElementById("riddle-check").disabled = done;
  document.getElementById("riddle-reveal").disabled = done;

  updateFeedback(saved);
  bindEvents();
  if (done && onComplete) onComplete(true);
}

function updateFeedback(saved) {
  const fb = document.getElementById("riddle-feedback");
  if (!fb) return;
  if (!saved) {
    fb.textContent = "";
    fb.className = "feedback";
    return;
  }
  if (saved.solved) {
    fb.textContent = "Giusto! Indovinello risolto.";
    fb.className = "feedback feedback-win";
  } else if (saved.revealed) {
    fb.textContent = "Risposta rivelata. Torna domani per un nuovo indovinello!";
    fb.className = "feedback feedback-hint";
  } else if (saved.guess) {
    fb.textContent = "Non ancora: prova con altre parole (anche senza articolo).";
    fb.className = "feedback feedback-hint";
  } else {
    fb.textContent = "";
    fb.className = "feedback";
  }
}

function persist(data) {
  saveState(STORAGE_KEY, getDailyKey(), data);
  if ((data.solved || data.revealed) && onComplete) onComplete(true);
}

function setDone(solved, revealed, guess) {
  const answerEl = document.getElementById("riddle-answer");
  answerEl.textContent = daily.a;
  answerEl.classList.remove("hidden-answer");
  answerEl.classList.add("revealed", "pop-in");
  document.getElementById("riddle-input").disabled = true;
  document.getElementById("riddle-check").disabled = true;
  document.getElementById("riddle-reveal").disabled = true;
  persist({ guess, solved, revealed, completed: true });
  updateFeedback({ solved, revealed, guess });
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.getElementById("riddle-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const saved = loadState(STORAGE_KEY, getDailyKey()) || {};
    if (saved.solved || saved.revealed) return;

    const input = document.getElementById("riddle-input");
    const guess = input.value.trim();
    if (!guess) {
      const fb = document.getElementById("riddle-feedback");
      fb.textContent = "Scrivi una risposta prima.";
      fb.className = "feedback feedback-hint";
      input.focus();
      return;
    }

    if (answersMatch(guess, daily)) {
      setDone(true, false, guess);
    } else {
      const fb = document.getElementById("riddle-feedback");
      fb.textContent = "Non ancora: prova con altre parole (anche senza articolo).";
      fb.className = "feedback feedback-hint";
      persist({ ...saved, guess, solved: false, revealed: false });
      input.select();
    }
  });

  document.getElementById("riddle-reveal")?.addEventListener("click", () => {
    const saved = loadState(STORAGE_KEY, getDailyKey()) || {};
    if (saved.solved || saved.revealed) return;
    setDone(false, true, saved.guess || "");
  });
}

export function isRiddleComplete() {
  const saved = loadState(STORAGE_KEY, getDailyKey());
  return Boolean(saved?.solved || saved?.revealed);
}
