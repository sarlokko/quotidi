import { getDailyKey, pickDailyItem, loadState, saveState, normalizeText } from "./daily.js";

const STORAGE_KEY = "quotid-riddle";
let daily = null;
let onComplete = null;
let eventsBound = false;

function answersMatch(guessRaw, answerRaw) {
  const guess = normalizeText(guessRaw);
  const answer = normalizeText(answerRaw);
  if (!guess) return false;
  if (guess === answer) return true;

  // Accetta risposta senza articolo iniziale (il/la/lo/l'/un/una...)
  const stripArticle = (s) => s.replace(/^(l['’]|lo |la |il |i |gli |le |un |una |uno )/, "").trim();
  const g = stripArticle(guess);
  const a = stripArticle(answer);
  if (g && a && g === a) return true;

  // Accetta se la risposta contiene la guess (min 3 caratteri) o viceversa per risposte corte
  if (guess.length >= 3 && (answer.includes(guess) || a.includes(g))) return true;
  if (a.length >= 3 && guess.includes(a) && a.length >= Math.min(4, answer.length)) return true;

  return false;
}

export async function initRiddle(onDone) {
  onComplete = onDone;
  const riddles = await (await fetch("data/riddles.json")).json();
  daily = pickDailyItem(getDailyKey(), riddles, "riddle");

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
}

function updateFeedback(saved) {
  const fb = document.getElementById("riddle-feedback");
  if (!saved) {
    fb.textContent = "";
    fb.className = "feedback";
    return;
  }
  if (saved.solved) {
    fb.textContent = "✅ Indovinello risolto!";
    fb.className = "feedback feedback-win";
  } else if (saved.revealed) {
    fb.textContent = "Risposta rivelata. Torna domani per un nuovo indovinello!";
    fb.className = "feedback feedback-hint";
  } else if (saved.guess) {
    fb.textContent = "Non ancora... prova un'altra formulazione.";
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

    if (answersMatch(guess, daily.a)) {
      setDone(true, false, guess);
    } else {
      const fb = document.getElementById("riddle-feedback");
      fb.textContent = "Non ancora... prova un'altra formulazione.";
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
