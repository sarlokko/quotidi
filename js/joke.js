import { getDailyKey, hashString, loadState, saveState } from "./daily.js";

const STORAGE_KEY = "quotid-joke-v2";

let daily = null;
let revealed = false;
let reaction = null;
let onComplete = null;
let eventsBound = false;

const REACTION_MSG = {
  lol: "Perfetto: anche una risata conta come sport.",
  smile: "Un sorrisetto vale lo stesso.",
  meh: "Domani ne arriva un’altra. Promesso.",
};

function pickJoke(dayKey, list) {
  const n = list.length;
  if (!n) return null;
  const [y, m, d] = dayKey.split("-").map(Number);
  const ordinal = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  const order = Array.from({ length: n }, (_, i) => i);
  let h = hashString(`joke-deck-v2:${n}`);
  for (let i = n - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return list[order[((ordinal % n) + n) % n]];
}

export async function initJoke(onDone) {
  onComplete = onDone;
  const jokes = await (await fetch("data/jokes.json")).json();
  daily = pickJoke(getDailyKey(), jokes);
  if (!daily?.setup || !daily?.punchline) {
    throw new Error("Barzelletta del giorno non valida");
  }

  const saved = loadState(STORAGE_KEY, getDailyKey()) || {};
  revealed = Boolean(saved.revealed);
  reaction = saved.reaction || null;

  render();
  bindEvents();
  if (revealed && onComplete) onComplete(true);
}

function persist() {
  saveState(STORAGE_KEY, getDailyKey(), {
    revealed,
    reaction,
    completed: revealed,
  });
  if (revealed && onComplete) onComplete(true);
}

function setStatus(text, kind = "") {
  const el = document.getElementById("joke-status");
  if (!el) return;
  el.textContent = text;
  el.className = `game-status${kind ? ` ${kind}` : ""}`;
}

function render() {
  const setup = document.getElementById("joke-setup");
  const punch = document.getElementById("joke-punchline");
  const wrap = document.getElementById("joke-punch-wrap");
  const revealBtn = document.getElementById("joke-reveal");
  const reactionBox = document.getElementById("joke-reaction");
  const msg = document.getElementById("joke-reaction-msg");
  if (!setup || !punch || !revealBtn || !reactionBox) return;

  setup.textContent = daily.setup;

  if (revealed) {
    punch.textContent = daily.punchline;
    punch.classList.remove("is-hidden");
    punch.classList.add("revealed");
    wrap?.classList.add("is-open");
    wrap?.setAttribute("aria-expanded", "true");
    revealBtn.hidden = true;
    revealBtn.disabled = true;
    reactionBox.hidden = false;
    setStatus("Punchline rivelata. Dimmi se ha funzionato.", "win");
  } else {
    punch.textContent = "La risposta è nascosta qui sotto…";
    punch.classList.add("is-hidden");
    punch.classList.remove("revealed");
    wrap?.classList.remove("is-open");
    wrap?.setAttribute("aria-expanded", "false");
    revealBtn.hidden = false;
    revealBtn.disabled = false;
    reactionBox.hidden = true;
    setStatus("Leggi il setup, poi rivela la battuta.");
  }

  document.querySelectorAll(".reaction-btn").forEach((b) => {
    const picked = reaction && b.dataset.reaction === reaction;
    b.classList.toggle("picked", Boolean(picked));
    b.disabled = Boolean(reaction);
  });

  if (msg) {
    msg.textContent = reaction ? REACTION_MSG[reaction] || "Grazie!" : "";
  }
}

function revealJoke() {
  if (revealed || !daily) return;
  revealed = true;
  persist();

  const punch = document.getElementById("joke-punchline");
  punch?.classList.remove("pop-in");
  void punch?.offsetWidth;
  punch?.classList.add("pop-in");
  render();
}

function pickReaction(value) {
  if (!revealed || reaction) return;
  reaction = value;
  persist();
  render();
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.getElementById("joke-reveal")?.addEventListener("click", revealJoke);

  document.getElementById("joke-punch-wrap")?.addEventListener("click", () => {
    if (!revealed) revealJoke();
  });

  document.getElementById("joke-punch-wrap")?.addEventListener("keydown", (e) => {
    if (revealed) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      revealJoke();
    }
  });

  document.getElementById("joke-reaction")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-reaction]");
    if (!btn || btn.disabled) return;
    pickReaction(btn.dataset.reaction);
  });
}

export function isJokeComplete() {
  const saved = loadState(STORAGE_KEY, getDailyKey());
  return Boolean(saved?.revealed);
}
