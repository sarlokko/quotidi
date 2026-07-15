import { getDailyKey, pickDailyIndex, loadState, saveState, normalizeText } from "./daily.js";

const STORAGE_KEY = "quotid-wordle";
const MAX_ATTEMPTS = 6;
const WORD_LEN = 5;

let answerWords = [];
let guessWords = new Set();
let answer = "";
let guesses = [];
let current = "";
let locked = false;
let onComplete = null;
let eventsBound = false;
let revealBusy = false;

function evaluateGuess(guess, target) {
  const result = Array(WORD_LEN).fill("absent");
  const remaining = target.split("");

  for (let i = 0; i < WORD_LEN; i++) {
    if (guess[i] === target[i]) {
      result[i] = "correct";
      remaining[i] = null;
    }
  }

  for (let i = 0; i < WORD_LEN; i++) {
    if (result[i] === "correct") continue;
    const idx = remaining.indexOf(guess[i]);
    if (idx >= 0) {
      result[i] = "present";
      remaining[idx] = null;
    }
  }

  return result;
}

function keyboardState() {
  const state = {};
  for (const guess of guesses) {
    for (let i = 0; i < WORD_LEN; i++) {
      const letter = guess.word[i];
      const rank = { absent: 0, present: 1, correct: 2 };
      const prev = state[letter];
      const next = guess.result[i];
      if (!prev || rank[next] > rank[prev]) state[letter] = next;
    }
  }
  return state;
}

export async function initWordle(onDone) {
  onComplete = onDone;

  const [answersRes, guessesRes] = await Promise.all([
    fetch("data/words-answers.txt"),
    fetch("data/words-guesses.txt"),
  ]);

  if (!answersRes.ok || !guessesRes.ok) {
    document.getElementById("wordle-status").textContent = "Impossibile caricare il dizionario.";
    document.getElementById("wordle-status").className = "game-status lose";
    return;
  }

  answerWords = (await answersRes.text()).trim().split("\n").filter(Boolean);
  guessWords = new Set((await guessesRes.text()).trim().split("\n").filter(Boolean));
  answerWords.forEach((w) => guessWords.add(w));

  const dayKey = getDailyKey();
  answer = answerWords[pickDailyIndex(dayKey, answerWords.length, "wordle")];

  const saved = loadState(STORAGE_KEY, dayKey);
  if (saved) {
    guesses = saved.guesses || [];
    current = saved.current || "";
    locked = saved.locked || false;
  } else {
    guesses = [];
    current = "";
    locked = false;
  }

  renderBoard();
  renderKeyboard();
  updateStatus();
  updateShare();
  bindEvents();
}

function persist() {
  saveState(STORAGE_KEY, getDailyKey(), { guesses, current, locked, completed: locked });
  if (locked && onComplete) onComplete(true);
}

function renderBoard(animateRow = -1) {
  const board = document.getElementById("wordle-board");
  const rows = [];

  for (let r = 0; r < MAX_ATTEMPTS; r++) {
    const guess = guesses[r];
    const isCurrent = !guess && r === guesses.length && !locked;
    const letters = guess?.word || (isCurrent ? current.padEnd(WORD_LEN, " ") : "     ");
    const results = guess?.result || Array(WORD_LEN).fill("empty");

    rows.push(`
      <div class="wordle-row ${animateRow === r ? "reveal-row" : ""} ${isCurrent && current.length === WORD_LEN ? "row-ready" : ""}">
        ${letters.split("").map((ch, i) => {
          const filled = ch.trim().length > 0;
          const isActive = isCurrent && i === current.length && current.length < WORD_LEN;
          const base = guess
            ? `tile-${results[i]}`
            : filled
              ? "tile-filled"
              : isActive
                ? "tile-active"
                : "tile-empty";
          const delay = animateRow === r ? `style="animation-delay:${i * 0.12}s"` : "";
          return `<div class="wordle-tile ${base}" ${delay}>${filled ? ch.toUpperCase() : ""}</div>`;
        }).join("")}
      </div>
    `);
  }

  board.innerHTML = rows.join("");
}

function renderKeyboard() {
  const kb = document.getElementById("wordle-keyboard");
  const state = keyboardState();
  const rows = [
    "qwertyuiop".split(""),
    "asdfghjkl".split(""),
    ["invio", ..."zxcvbnm".split(""), "⌫"],
  ];

  kb.innerHTML = rows.map((row) => `
    <div class="kb-row">
      ${row.map((key) => {
        if (key === "invio") return `<button type="button" class="kb-key wide" data-key="Enter"${locked || revealBusy ? " disabled" : ""}>invio</button>`;
        if (key === "⌫") return `<button type="button" class="kb-key wide" data-key="Backspace"${locked || revealBusy ? " disabled" : ""}>⌫</button>`;
        const cls = state[key] ? ` key-${state[key]}` : "";
        return `<button type="button" class="kb-key${cls}" data-key="${key}"${locked || revealBusy ? " disabled" : ""}>${key.toUpperCase()}</button>`;
      }).join("")}
    </div>
  `).join("");
}

function updateStatus() {
  const el = document.getElementById("wordle-status");
  if (locked && guesses.some((g) => g.word === answer)) {
    const n = guesses.length;
    el.textContent = `Complimenti! Indovinata in ${n} tentativ${n === 1 ? "o" : "i"}.`;
    el.className = "game-status win";
  } else if (locked) {
    el.textContent = `Peccato! La parola era ${answer.toUpperCase()}.`;
    el.className = "game-status lose";
  } else {
    el.textContent = `Tentativo ${guesses.length + 1} di ${MAX_ATTEMPTS}.`;
    el.className = "game-status";
  }
}

function buildShareText() {
  const won = guesses.some((g) => g.word === answer);
  const score = won ? String(guesses.length) : "X";
  const day = getDailyKey();
  const grid = guesses.map((g) =>
    g.result.map((r) => (r === "correct" ? "🟩" : r === "present" ? "🟨" : "⬛")).join("")
  ).join("\n");
  return `Quotidì Parola ${day} ${score}/${MAX_ATTEMPTS}\n\n${grid}\nhttps://sarlokko.github.io/quotidi/`;
}

function updateShare() {
  const wrap = document.getElementById("wordle-share-wrap");
  if (!wrap) return;
  wrap.hidden = !locked;
}

async function copyShare() {
  const text = buildShareText();
  const btn = document.getElementById("wordle-share");
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      btn.textContent = "Copiato!";
      setTimeout(() => { btn.textContent = "Copia risultato"; }, 1500);
    }
  } catch {
    const el = document.getElementById("wordle-status");
    el.textContent = "Copia manuale: apri la console o riprova.";
    el.className = "game-status hint";
  }
}

function submitCurrent() {
  if (revealBusy) return;
  const word = current.trim();
  if (word.length !== WORD_LEN) {
    flashMessage("Servono 5 lettere.");
    shakeCurrentRow();
    return;
  }
  if (!guessWords.has(word)) {
    flashMessage("Parola non nel dizionario.");
    shakeCurrentRow();
    return;
  }

  const result = evaluateGuess(word, answer);
  guesses.push({ word, result });
  current = "";

  if (word === answer || guesses.length >= MAX_ATTEMPTS) {
    locked = true;
  }

  persist();
  revealBusy = true;
  renderBoard(guesses.length - 1);
  setTimeout(() => {
    revealBusy = false;
    renderKeyboard();
    updateStatus();
    updateShare();
  }, WORD_LEN * 120 + 200);
  renderKeyboard();
}

function shakeCurrentRow() {
  const board = document.getElementById("wordle-board");
  const row = board?.children[guesses.length];
  if (!row) return;
  row.classList.remove("shake");
  void row.offsetWidth;
  row.classList.add("shake");
}

function flashMessage(msg) {
  const el = document.getElementById("wordle-status");
  el.textContent = msg;
  el.className = "game-status hint";
  setTimeout(updateStatus, 1200);
}

function handleKey(key) {
  if (locked || revealBusy) return;
  if (key === "Enter") {
    submitCurrent();
    return;
  }
  if (key === "Backspace") {
    current = current.slice(0, -1);
  } else if (/^[a-z]$/.test(key) && current.length < WORD_LEN) {
    current += key;
  } else {
    return;
  }
  renderBoard();
  saveState(STORAGE_KEY, getDailyKey(), { guesses, current, locked });
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.getElementById("wordle-keyboard")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-key]");
    if (btn) handleKey(btn.dataset.key);
  });

  document.getElementById("wordle-share")?.addEventListener("click", copyShare);

  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("wordle").classList.contains("active")) return;
    if (e.key === "Enter") {
      e.preventDefault();
      handleKey("Enter");
    } else if (e.key === "Backspace") {
      e.preventDefault();
      handleKey("Backspace");
    } else if (/^[a-zA-Z]$/.test(e.key)) {
      handleKey(normalizeText(e.key));
    }
  });
}

export function isWordleComplete() {
  const saved = loadState(STORAGE_KEY, getDailyKey());
  return Boolean(saved?.locked);
}
