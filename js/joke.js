import { getDailyKey, pickDailyItem, loadState, saveState } from "./daily.js";

const STORAGE_KEY = "quotid-joke";
let jokes = [];
let daily = null;
let onComplete = null;

export async function initJoke(onDone) {
  onComplete = onDone;
  jokes = await (await fetch("data/jokes.json")).json();
  daily = pickDailyItem(getDailyKey(), jokes, "joke");

  const saved = loadState(STORAGE_KEY, getDailyKey()) || {};
  const revealed = saved.revealed ?? false;

  document.getElementById("joke-setup").textContent = daily.setup;
  const punch = document.getElementById("joke-punchline");
  punch.textContent = revealed ? daily.punchline : "Premi il bottone per la risposta...";
  punch.classList.toggle("hidden-answer", !revealed);

  document.getElementById("joke-reveal").disabled = revealed;
  if (revealed && onComplete) onComplete(true);
}

function bindEvents() {
  document.getElementById("joke-reveal")?.addEventListener("click", () => {
    const saved = loadState(STORAGE_KEY, getDailyKey()) || {};
    if (saved.revealed) return;

    document.getElementById("joke-punchline").textContent = daily.punchline;
    document.getElementById("joke-punchline").classList.remove("hidden-answer");
    document.getElementById("joke-reveal").disabled = true;
    saveState(STORAGE_KEY, getDailyKey(), { revealed: true, completed: true });
    if (onComplete) onComplete(true);
  });
}

export function initJokeEvents() {
  bindEvents();
}

export function isJokeComplete() {
  const saved = loadState(STORAGE_KEY, getDailyKey());
  return Boolean(saved?.revealed);
}
