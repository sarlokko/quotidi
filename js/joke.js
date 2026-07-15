import { getDailyKey, pickDailyItem, loadState, saveState } from "./daily.js";

const STORAGE_KEY = "quotid-joke";
let daily = null;
let onComplete = null;
let eventsBound = false;

const REACTION_MSG = {
  lol: "Ottimo! Condividi la risata con qualcuno.",
  smile: "Una smorfia conta lo stesso.",
  meh: "Domani magari va meglio…",
};

export async function initJoke(onDone) {
  onComplete = onDone;
  const jokes = await (await fetch("data/jokes.json")).json();
  daily = pickDailyItem(getDailyKey(), jokes, "joke");

  const saved = loadState(STORAGE_KEY, getDailyKey()) || {};
  const revealed = saved.revealed ?? false;
  const reaction = saved.reaction || null;

  document.getElementById("joke-setup").textContent = daily.setup;
  const punch = document.getElementById("joke-punchline");
  punch.textContent = revealed ? daily.punchline : "Premi il bottone per la risposta…";
  punch.classList.toggle("is-hidden", !revealed);
  punch.classList.toggle("revealed", revealed);

  const revealBtn = document.getElementById("joke-reveal");
  revealBtn.disabled = revealed;
  revealBtn.hidden = revealed;

  const reactionBox = document.getElementById("joke-reaction");
  reactionBox.hidden = !revealed;
  if (revealed && reaction) {
    markReaction(reaction, false);
  } else {
    document.getElementById("joke-reaction-msg").textContent = "";
    document.querySelectorAll(".reaction-btn").forEach((b) => b.classList.remove("picked"));
  }

  if (revealed && onComplete) onComplete(true);
  bindEvents();
}

function markReaction(reaction, persistIt) {
  document.querySelectorAll(".reaction-btn").forEach((b) => {
    b.classList.toggle("picked", b.dataset.reaction === reaction);
    b.disabled = true;
  });
  document.getElementById("joke-reaction-msg").textContent = REACTION_MSG[reaction] || "Grazie!";
  if (persistIt) {
    const saved = loadState(STORAGE_KEY, getDailyKey()) || {};
    saveState(STORAGE_KEY, getDailyKey(), { ...saved, revealed: true, completed: true, reaction });
  }
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.getElementById("joke-reveal")?.addEventListener("click", () => {
    const saved = loadState(STORAGE_KEY, getDailyKey()) || {};
    if (saved.revealed) return;

    const punch = document.getElementById("joke-punchline");
    punch.textContent = daily.punchline;
    punch.classList.remove("is-hidden");
    punch.classList.add("revealed", "pop-in");

    document.getElementById("joke-reveal").disabled = true;
    document.getElementById("joke-reveal").hidden = true;
    document.getElementById("joke-reaction").hidden = false;

    saveState(STORAGE_KEY, getDailyKey(), { revealed: true, completed: true });
    if (onComplete) onComplete(true);
  });

  document.getElementById("joke-reaction")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-reaction]");
    if (!btn) return;
    markReaction(btn.dataset.reaction, true);
  });
}

export function initJokeEvents() {
  // Compatibilità: gli eventi sono legati in initJoke
}

export function isJokeComplete() {
  const saved = loadState(STORAGE_KEY, getDailyKey());
  return Boolean(saved?.revealed);
}
