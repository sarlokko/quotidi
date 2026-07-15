import { getDailyKey, pickDailyItem, loadState, saveState } from "./daily.js";

const STORAGE_KEY = "quotid-fact";

let fact = null;
let locked = false;
let onComplete = null;
let eventsBound = false;

export async function initFact(onDone) {
  onComplete = onDone;
  const list = await (await fetch("data/facts.json")).json();
  fact = pickDailyItem(getDailyKey(), list, "fact");

  const saved = loadState(STORAGE_KEY, getDailyKey());
  locked = Boolean(saved?.locked);

  document.getElementById("fact-topic").textContent =
    fact.topic === "storia" ? "Storia" : "Scienza";
  document.getElementById("fact-text").textContent = fact.text;
  render();
  bindEvents();
  if (locked && onComplete) onComplete(true);
}

function render() {
  const btn = document.getElementById("fact-done");
  btn.disabled = locked;
  btn.textContent = locked ? "Segnato per oggi ✓" : "Segna come letto";
  const status = document.getElementById("fact-status");
  status.textContent = locked
    ? "Curiosità del giorno completata."
    : "Una pillola al giorno — storia o scienza.";
  status.className = locked ? "game-status win" : "game-status";
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;
  document.getElementById("fact-done")?.addEventListener("click", () => {
    if (locked) return;
    locked = true;
    saveState(STORAGE_KEY, getDailyKey(), { locked: true, completed: true });
    if (onComplete) onComplete(true);
    render();
  });
}

export function isFactComplete() {
  const saved = loadState(STORAGE_KEY, getDailyKey());
  return Boolean(saved?.locked);
}
