import { getDailyKey, pickDailyItem, loadState, saveState, normalizeText } from "./daily.js";

const STORAGE_KEY = "quotid-crossword";
const SIZE = 5;
const KB_ROWS = [
  "qwertyuiop".split(""),
  "asdfghjkl".split(""),
  ["⇄", ..."zxcvbnm".split(""), "⌫"],
];

let puzzle = null;
let grid = null; // letters or '' ; '#' blocked
let locked = false;
let won = false;
let onComplete = null;
let eventsBound = false;
let selected = null; // {r,c}
let direction = "across";

function isBlock(r, c) {
  return puzzle.grid[r][c] === "#";
}

function buildEmpty() {
  return puzzle.grid.map((row) =>
    [...row].map((ch) => (ch === "#" ? "#" : ""))
  );
}

function cellNumber(r, c) {
  if (isBlock(r, c)) return null;
  const startAcross = c === 0 || isBlock(r, c - 1);
  const startDown = r === 0 || isBlock(r - 1, c);
  const startsA = startAcross && extractAnswer(r, c, "across").length >= 2;
  const startsD = startDown && extractAnswer(r, c, "down").length >= 2;
  if (!startsA && !startsD) return null;
  let n = 1;
  for (let rr = 0; rr < SIZE; rr++) {
    for (let cc = 0; cc < SIZE; cc++) {
      if (isBlock(rr, cc)) continue;
      const sa = (cc === 0 || isBlock(rr, cc - 1)) && extractAnswer(rr, cc, "across").length >= 2;
      const sd = (rr === 0 || isBlock(rr - 1, cc)) && extractAnswer(rr, cc, "down").length >= 2;
      if (!sa && !sd) continue;
      if (rr === r && cc === c) return n;
      n += 1;
    }
  }
  return null;
}

function extractAnswer(r, c, dir) {
  if (isBlock(r, c)) return "";
  if (dir === "across") {
    while (c > 0 && !isBlock(r, c - 1)) c -= 1;
    let s = "";
    while (c < SIZE && !isBlock(r, c)) {
      s += puzzle.grid[r][c];
      c += 1;
    }
    return s;
  }
  while (r > 0 && !isBlock(r - 1, c)) r -= 1;
  let s = "";
  while (r < SIZE && !isBlock(r, c)) {
    s += puzzle.grid[r][c];
    r += 1;
  }
  return s;
}

function wordCells(r, c, dir) {
  if (isBlock(r, c)) return [];
  let sr = r;
  let sc = c;
  if (dir === "across") {
    while (sc > 0 && !isBlock(r, sc - 1)) sc -= 1;
  } else {
    while (sr > 0 && !isBlock(sr - 1, c)) sr -= 1;
  }
  const cells = [];
  if (dir === "across") {
    while (sc < SIZE && !isBlock(r, sc)) {
      cells.push({ r, c: sc });
      sc += 1;
    }
  } else {
    while (sr < SIZE && !isBlock(sr, c)) {
      cells.push({ r: sr, c });
      sr += 1;
    }
  }
  return cells;
}

function isInActiveWord(r, c) {
  if (!selected) return false;
  return wordCells(selected.r, selected.c, direction).some((p) => p.r === r && p.c === c);
}

export async function initCrossword(onDone) {
  onComplete = onDone;
  const list = await (await fetch("data/crosswords.json")).json();
  puzzle = pickDailyItem(getDailyKey(), list, "crossword");

  const saved = loadState(STORAGE_KEY, getDailyKey());
  if (saved?.grid?.length === SIZE) {
    grid = saved.grid.map((row) => row.slice());
    locked = Boolean(saved.locked);
    won = Boolean(saved.won);
  } else {
    grid = buildEmpty();
    locked = false;
    won = false;
  }

  // first editable
  outer: for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!isBlock(r, c)) {
        selected = { r, c };
        break outer;
      }
    }
  }

  render();
  bindEvents();
}

function persist() {
  saveState(STORAGE_KEY, getDailyKey(), { grid, locked, won, completed: locked });
  if (locked && onComplete) onComplete(true);
}

function isSolved() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (isBlock(r, c)) continue;
      if ((grid[r][c] || "").toUpperCase() !== puzzle.grid[r][c]) return false;
    }
  }
  return true;
}

function setStatus(text, kind = "") {
  const el = document.getElementById("crossword-status");
  if (!el) return;
  el.textContent = text;
  el.className = `game-status${kind ? ` ${kind}` : ""}`;
}

function focusInput() {
  const input = document.getElementById("crossword-input");
  if (!input || locked) return;
  input.disabled = false;
  input.value = "";
  try {
    input.focus({ preventScroll: true });
  } catch {
    input.focus();
  }
}

function renderKeyboard() {
  const kb = document.getElementById("crossword-keyboard");
  if (!kb) return;
  kb.innerHTML = KB_ROWS.map((row) => `
    <div class="kb-row">
      ${row.map((key) => {
        if (key === "⌫") {
          return `<button type="button" class="kb-key wide" data-xw-key="Backspace" ${locked ? "disabled" : ""} aria-label="Cancella">⌫</button>`;
        }
        if (key === "⇄") {
          return `<button type="button" class="kb-key wide" data-xw-key="Dir" ${locked ? "disabled" : ""} aria-label="Cambia direzione">${direction === "across" ? "→" : "↓"}</button>`;
        }
        return `<button type="button" class="kb-key" data-xw-key="${key}" ${locked ? "disabled" : ""}>${key.toUpperCase()}</button>`;
      }).join("")}
    </div>
  `).join("");
}

function render() {
  const board = document.getElementById("crossword-board");
  const acrossEl = document.getElementById("crossword-across");
  const downEl = document.getElementById("crossword-down");
  if (!board) return;

  board.innerHTML = "";
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement("button");
      cell.type = "button";
      if (isBlock(r, c)) {
        cell.className = "xw-cell is-block";
        cell.disabled = true;
        cell.tabIndex = -1;
        cell.setAttribute("aria-hidden", "true");
      } else {
        const num = cellNumber(r, c);
        const sel = selected && selected.r === r && selected.c === c;
        const inWord = isInActiveWord(r, c);
        cell.className = `xw-cell${sel ? " is-selected" : ""}${inWord && !sel ? " is-word" : ""}`;
        cell.dataset.r = r;
        cell.dataset.c = c;
        cell.disabled = locked;
        cell.setAttribute("aria-label", `Riga ${r + 1}, colonna ${c + 1}${grid[r][c] ? `, lettera ${grid[r][c]}` : ""}`);
        if (num) {
          const n = document.createElement("span");
          n.className = "xw-num";
          n.textContent = String(num);
          cell.appendChild(n);
        }
        const letter = document.createElement("span");
        letter.className = "xw-letter";
        letter.textContent = grid[r][c] || "";
        cell.appendChild(letter);
      }
      board.appendChild(cell);
    }
  }

  const numOf = (clue) => cellNumber(clue.row, clue.col);
  acrossEl.innerHTML = puzzle.across
    .map((cl) => `<li><strong>${numOf(cl)}.</strong> ${cl.clue}</li>`)
    .join("");
  downEl.innerHTML = puzzle.down
    .map((cl) => `<li><strong>${numOf(cl)}.</strong> ${cl.clue}</li>`)
    .join("");

  document.getElementById("crossword-check").disabled = locked;
  document.getElementById("crossword-clear").disabled = locked;
  document.getElementById("crossword-reveal").disabled = locked;
  const input = document.getElementById("crossword-input");
  if (input) input.disabled = locked;

  renderKeyboard();

  if (locked && won) setStatus("Cruciverba completato!", "win");
  else if (locked) setStatus("Soluzione rivelata. Torna domani!", "hint");
  else {
    const dirLabel = direction === "across" ? "orizzontale →" : "verticale ↓";
    setStatus(`Direzione ${dirLabel} · tema: ${puzzle.theme || "giornaliero"}`);
  }
}

function move(dr, dc) {
  if (!selected) return;
  let { r, c } = selected;
  for (let i = 0; i < SIZE * SIZE; i++) {
    r = (r + dr + SIZE) % SIZE;
    c = (c + dc + SIZE) % SIZE;
    if (!isBlock(r, c)) {
      selected = { r, c };
      return;
    }
  }
}

function typeLetter(ch) {
  if (locked || !selected) return;
  const letter = normalizeText(ch).replace(/[^a-z]/g, "");
  if (!letter) return;
  const { r, c } = selected;
  if (isBlock(r, c)) return;
  grid[r][c] = letter.toUpperCase();
  if (isSolved()) {
    locked = true;
    won = true;
  }
  persist();
  if (!locked) {
    if (direction === "across") move(0, 1);
    else move(1, 0);
  }
  render();
  focusInput();
}

function deleteLetter() {
  if (locked || !selected) return;
  const { r, c } = selected;
  if (grid[r][c]) grid[r][c] = "";
  else if (direction === "across") move(0, -1);
  else move(-1, 0);
  persist();
  render();
  focusInput();
}

function toggleDirection() {
  direction = direction === "across" ? "down" : "across";
  render();
  focusInput();
}

function selectCell(r, c, { toggleDir = false } = {}) {
  if (isBlock(r, c)) return;
  if (toggleDir && selected && selected.r === r && selected.c === c) {
    direction = direction === "across" ? "down" : "across";
  }
  selected = { r, c };
  render();
  focusInput();
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.getElementById("crossword-board")?.addEventListener("pointerdown", (e) => {
    const cell = e.target.closest("[data-r]");
    if (!cell || locked) return;
    // Focus nel gesto utente: fondamentale su iOS/Android
    e.preventDefault();
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    selectCell(r, c, { toggleDir: true });
  });

  const input = document.getElementById("crossword-input");
  input?.addEventListener("input", () => {
    if (locked) return;
    const raw = input.value || "";
    input.value = "";
    const letters = normalizeText(raw).replace(/[^a-z]/g, "");
    for (const ch of letters) typeLetter(ch);
  });

  input?.addEventListener("keydown", (e) => {
    if (locked) return;
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      deleteLetter();
    } else if (e.key === " ") {
      e.preventDefault();
      toggleDirection();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      direction = "across";
      move(0, 1);
      render();
      focusInput();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      direction = "across";
      move(0, -1);
      render();
      focusInput();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      direction = "down";
      move(1, 0);
      render();
      focusInput();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      direction = "down";
      move(-1, 0);
      render();
      focusInput();
    }
  });

  document.getElementById("crossword-keyboard")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-xw-key]");
    if (!btn || locked) return;
    const key = btn.dataset.xwKey;
    if (key === "Backspace") deleteLetter();
    else if (key === "Dir") toggleDirection();
    else typeLetter(key);
  });

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.tab === "crossword" && !locked) {
        requestAnimationFrame(() => focusInput());
      }
    });
  });

  // Desktop: anche keydown globale se il focus non è sull'input
  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("crossword")?.classList.contains("active")) return;
    if (locked) return;
    if (e.target === input) return;
    if (/^[a-zA-Z]$/.test(e.key)) {
      e.preventDefault();
      typeLetter(normalizeText(e.key));
    } else if (e.key === "Backspace") {
      e.preventDefault();
      deleteLetter();
    } else if (e.key === " ") {
      e.preventDefault();
      toggleDirection();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      direction = "across";
      move(0, 1);
      render();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      direction = "across";
      move(0, -1);
      render();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      direction = "down";
      move(1, 0);
      render();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      direction = "down";
      move(-1, 0);
      render();
    }
  });

  document.getElementById("crossword-check")?.addEventListener("click", () => {
    if (locked) return;
    if (isSolved()) {
      locked = true;
      won = true;
      persist();
      render();
      return;
    }
    setStatus("Non ancora: controlla le lettere.", "hint");
    focusInput();
  });

  document.getElementById("crossword-clear")?.addEventListener("click", () => {
    if (locked) return;
    grid = buildEmpty();
    persist();
    render();
    focusInput();
  });

  document.getElementById("crossword-reveal")?.addEventListener("click", () => {
    if (locked) return;
    grid = puzzle.grid.map((row) => [...row].map((ch) => (ch === "#" ? "#" : ch)));
    locked = true;
    won = false;
    persist();
    render();
  });
}

export function isCrosswordComplete() {
  const saved = loadState(STORAGE_KEY, getDailyKey());
  return Boolean(saved?.locked);
}
