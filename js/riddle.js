import { getDailyKey, pickDailyItem, loadState, saveState, normalizeText } from "./daily.js";

const STORAGE_KEY = "quotid-riddle";
let riddles = [];
let daily = null;
let onComplete = null;

export async function initRiddle(onDone) {
  onComplete = onDone;
  riddles = await (await fetch("data/riddles.json")).json();
  daily = pickDailyItem(getDailyKey(), riddles, "riddle");

  const saved = loadState(STORAGE_KEY, getDailyKey());
  const solved = saved?.solved ?? false;
  const revealed = saved?.revealed ?? false;

  document.getElementById("riddle-text").textContent = daily.q;
  document.getElementById("riddle-answer").textContent = revealed || solved ? daily.a : "???";
  document.getElementById("riddle-answer").classList.toggle("hidden-answer", !(revealed || solved));

  const input = document.getElementById("riddle-input");
  input.value = saved?.guess || "";
  input.disabled = solved || revealed;

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
    fb.textContent = "Risposta rivelata. Riprova domani!";
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

function bindEvents() {
  document.getElementById("riddle-check")?.addEventListener("click", () => {
    const saved = loadState(STORAGE_KEY, getDailyKey()) || {};
    if (saved.solved || saved.revealed) return;

    const guess = normalizeText(document.getElementById("riddle-input").value);
    const answer = normalizeText(daily.a);

    if (!guess) return;

    if (guess === answer || answer.includes(guess) && guess.length >= 3) {
      document.getElementById("riddle-answer").textContent = daily.a;
      document.getElementById("riddle-answer").classList.remove("hidden-answer");
      document.getElementById("riddle-input").disabled = true;
      persist({ ...saved, guess, solved: true, revealed: false, completed: true });
      updateFeedback({ solved: true });
    } else {
      const fb = document.getElementById("riddle-feedback");
      fb.textContent = "Non ancora... ci sei vicino?";
      fb.className = "feedback feedback-hint";
      persist({ ...saved, guess, solved: false, revealed: false });
    }
  });

  document.getElementById("riddle-reveal")?.addEventListener("click", () => {
    const saved = loadState(STORAGE_KEY, getDailyKey()) || {};
    if (saved.solved || saved.revealed) return;

    document.getElementById("riddle-answer").textContent = daily.a;
    document.getElementById("riddle-answer").classList.remove("hidden-answer");
    document.getElementById("riddle-input").disabled = true;
    persist({ ...saved, revealed: true, solved: false, completed: true });
    updateFeedback({ revealed: true });
  });
}

export function isRiddleComplete() {
  const saved = loadState(STORAGE_KEY, getDailyKey());
  return Boolean(saved?.solved || saved?.revealed);
}
