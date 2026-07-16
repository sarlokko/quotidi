import { getDailyKey, hashString, loadState, saveState } from "./daily.js";

const STORAGE_KEY = "quotid-fact-v2";

let fact = null;
let locked = false;
let won = false;
let chosen = null; // true | false | null
let onComplete = null;
let eventsBound = false;

function pickFact(dayKey, list) {
  const n = list.length;
  if (!n) return null;
  const [y, m, d] = dayKey.split("-").map(Number);
  const ordinal = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  const order = Array.from({ length: n }, (_, i) => i);
  let h = hashString(`fact-deck-v2:${n}`);
  for (let i = n - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return list[order[((ordinal % n) + n) % n]];
}

function topicLabel(topic) {
  if (topic === "storia") return "Storia";
  if (topic === "scienza") return "Scienza";
  return "Curiosità";
}

export async function initFact(onDone) {
  onComplete = onDone;
  const list = await (await fetch("data/facts.json")).json();
  fact = pickFact(getDailyKey(), list);
  if (!fact?.claim || !fact?.fact || typeof fact.isTrue !== "boolean") {
    throw new Error("Curiosità del giorno non valida");
  }

  const saved = loadState(STORAGE_KEY, getDailyKey());
  locked = Boolean(saved?.locked);
  won = Boolean(saved?.won);
  chosen = typeof saved?.chosen === "boolean" ? saved.chosen : null;

  render();
  bindEvents();
  if (locked && onComplete) onComplete(true);
}

function persist() {
  saveState(STORAGE_KEY, getDailyKey(), {
    locked,
    won,
    chosen,
    completed: locked,
  });
  if (locked && onComplete) onComplete(true);
}

function setStatus(text, kind = "") {
  const el = document.getElementById("fact-status");
  if (!el) return;
  el.textContent = text;
  el.className = `game-status${kind ? ` ${kind}` : ""}`;
}

function render() {
  const topic = document.getElementById("fact-topic");
  const claim = document.getElementById("fact-claim");
  const reveal = document.getElementById("fact-reveal");
  const factText = document.getElementById("fact-text");
  const actions = document.getElementById("fact-actions");
  const trueBtn = document.getElementById("fact-true");
  const falseBtn = document.getElementById("fact-false");
  if (!topic || !claim || !reveal || !factText || !actions) return;

  topic.textContent = topicLabel(fact.topic);
  claim.textContent = fact.claim;
  factText.textContent = fact.fact;

  if (!locked) {
    reveal.hidden = true;
    actions.hidden = false;
    trueBtn.disabled = false;
    falseBtn.disabled = false;
    trueBtn.classList.remove("is-correct", "is-wrong", "is-picked");
    falseBtn.classList.remove("is-correct", "is-wrong", "is-picked");
    setStatus("Vero o falso? Poi scopri la curiosità completa.");
    return;
  }

  reveal.hidden = false;
  actions.hidden = false;
  trueBtn.disabled = true;
  falseBtn.disabled = true;

  const pickedTrue = chosen === true;
  const pickedFalse = chosen === false;
  trueBtn.classList.toggle("is-picked", pickedTrue);
  falseBtn.classList.toggle("is-picked", pickedFalse);
  trueBtn.classList.toggle("is-correct", fact.isTrue);
  falseBtn.classList.toggle("is-correct", !fact.isTrue);
  trueBtn.classList.toggle("is-wrong", pickedTrue && !fact.isTrue);
  falseBtn.classList.toggle("is-wrong", pickedFalse && fact.isTrue);

  if (won) {
    setStatus("Giusto! Curiosità del giorno completata.", "win");
  } else {
    setStatus("Non era così: leggi la curiosità vera qui sotto.", "lose");
  }
}

function answer(value) {
  if (locked || !fact) return;
  chosen = value;
  won = value === fact.isTrue;
  locked = true;
  persist();
  render();
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.getElementById("fact-true")?.addEventListener("click", () => answer(true));
  document.getElementById("fact-false")?.addEventListener("click", () => answer(false));
}

export function isFactComplete() {
  const saved = loadState(STORAGE_KEY, getDailyKey());
  return Boolean(saved?.locked);
}
