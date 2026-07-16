import { getDailyKey, hashString, loadState, saveState, normalizeText } from "./daily.js";

const STORAGE_KEY = "quotid-wordle-v3";
const MAX_ATTEMPTS = 5;
const WORD_LEN = 5;

let answerWords = [];
let guessWords = new Set();
let answer = "";
let hintWord = "";
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

/** Scelta giornaliera da un mazzo mescolato di coppie parola+indizio. */
function pickDailyPair(dayKey, pairs) {
  const n = pairs.length;
  if (!n) return null;
  const [y, m, d] = dayKey.split("-").map(Number);
  const ordinal = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  const order = Array.from({ length: n }, (_, i) => i);
  let h = hashString(`wordle-hint-deck-v3:${n}`);
  for (let i = n - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return pairs[order[((ordinal % n) + n) % n]];
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

  const [answersRes, guessesRes, hintsRes] = await Promise.all([
    fetch("data/words-answers.txt"),
    fetch("data/words-guesses.txt"),
    fetch("data/wordle-hints.json"),
  ]);

  if (!answersRes.ok || !guessesRes.ok || !hintsRes.ok) {
    document.getElementById("wordle-status").textContent = "Impossibile caricare il dizionario.";
    document.getElementById("wordle-status").className = "game-status lose";
    return;
  }

  answerWords = (await answersRes.text()).trim().split("\n").filter(Boolean);
  guessWords = new Set((await guessesRes.text()).trim().split("\n").filter(Boolean));
  answerWords.forEach((w) => guessWords.add(w));

  const pairs = (await hintsRes.json()).filter(
    (p) => p?.answer && p?.hint && guessWords.has(p.answer) && p.answer.length === WORD_LEN
  );
  if (!pairs.length) {
    document.getElementById("wordle-status").textContent = "Nessun indizio disponibile.";
    document.getElementById("wordle-status").className = "game-status lose";
    return;
  }

  const dayKey = getDailyKey();
  const pair = pickDailyPair(dayKey, pairs);
  answer = pair.answer;
  hintWord = pair.hint;

  const saved = loadState(STORAGE_KEY, dayKey);
  if (saved) {
    guesses = (saved.guesses || []).slice(0, MAX_ATTEMPTS);
    current = saved.current || "";
    locked = Boolean(saved.locked);
    if (!locked && guesses.length >= MAX_ATTEMPTS) locked = true;
  } else {
    guesses = [];
    current = "";
    locked = false;
  }

  renderHint();
  renderBoard();
  renderKeyboard();
  updateStatus();
  updateShare();
  bindEvents();
  if (locked && onComplete) onComplete(true);
}

function persist() {
  saveState(STORAGE_KEY, getDailyKey(), { guesses, current, locked, completed: locked });
  if (locked && onComplete) onComplete(true);
}

function renderHint() {
  const el = document.getElementById("wordle-hint");
  if (!el) return;
  el.innerHTML = `<span class="wordle-hint-label">Indizio</span><span class="wordle-hint-word">${hintWord}</span>`;
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
