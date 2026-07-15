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
      const current = state[letter] || "absent";
      if (rank[guess.result[i]] > rank[current]) state[letter] = guess.result[i];
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
  bindEvents();
}

function persist() {
  saveState(STORAGE_KEY, getDailyKey(), { guesses, current, locked, completed: locked });
  if (locked && onComplete) onComplete(true);
}

function renderBoard() {
  const board = document.getElementById("wordle-board");
  const rows = [];

  for (let r = 0; r < MAX_ATTEMPTS; r++) {
    const guess = guesses[r];
    const letters = guess?.word || (r === guesses.length ? current.padEnd(WORD_LEN, " ") : "     ");
    const results = guess?.result || Array(WORD_LEN).fill("empty");

    rows.push(`
      <div class="wordle-row">
        ${letters.split("").map((ch, i) => `
          <div class="wordle-tile tile-${results[i] || "empty"}">${ch.trim() ? ch.toUpperCase() : ""}</div>
        `).join("")}
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
        if (key === "invio") return `<button type="button" class="kb-key wide" data-key="Enter">invio</button>`;
        if (key === "⌫") return `<button type="button" class="kb-key wide" data-key="Backspace">⌫</button>`;
        const cls = state[key] ? ` key-${state[key]}` : "";
        return `<button type="button" class="kb-key${cls}" data-key="${key}">${key.toUpperCase()}</button>`;
      }).join("")}
    </div>
  `).join("");
}

function updateStatus() {
  const el = document.getElementById("wordle-status");
  if (locked && guesses.some((g) => g.word === answer)) {
    el.textContent = `Complimenti! La parola era ${answer.toUpperCase()}.`;
    el.className = "game-status win";
  } else if (locked) {
    el.textContent = `Peccato! La parola era ${answer.toUpperCase()}.`;
    el.className = "game-status lose";
  } else {
    el.textContent = "Indovina la parola di 5 lettere in 6 tentativi.";
    el.className = "game-status";
  }
}

function submitCurrent() {
  const word = current.trim();
  if (word.length !== WORD_LEN) {
    flashMessage("Servono 5 lettere.");
    return;
  }
  if (!guessWords.has(word)) {
    flashMessage("Parola non nel dizionario.");
    return;
  }

  const result = evaluateGuess(word, answer);
  guesses.push({ word, result });
  current = "";

  if (word === answer || guesses.length >= MAX_ATTEMPTS) {
    locked = true;
  }

  persist();
  renderBoard();
  renderKeyboard();
  updateStatus();
}

function flashMessage(msg) {
  const el = document.getElementById("wordle-status");
  el.textContent = msg;
  el.className = "game-status hint";
  setTimeout(updateStatus, 1200);
}

function handleKey(key) {
  if (locked) return;
  if (key === "Enter") {
    submitCurrent();
    return;
  }
  if (key === "Backspace") {
    current = current.slice(0, -1);
  } else if (/^[a-z]$/.test(key) && current.length < WORD_LEN) {
    current += key;
  }
  renderBoard();
  saveState(STORAGE_KEY, getDailyKey(), { guesses, current, locked });
}

function bindEvents() {
  document.getElementById("wordle-keyboard")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-key]");
    if (btn) handleKey(btn.dataset.key);
  });

  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("wordle").classList.contains("active")) return;
    if (e.key === "Enter") handleKey("Enter");
    else if (e.key === "Backspace") handleKey("Backspace");
    else if (/^[a-zA-Z]$/.test(e.key)) handleKey(normalizeText(e.key));
  });
}

export function isWordleComplete() {
  const saved = loadState(STORAGE_KEY, getDailyKey());
  return Boolean(saved?.locked);
}
