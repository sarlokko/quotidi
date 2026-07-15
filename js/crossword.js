import { getDailyKey, pickDailyItem, loadState, saveState, normalizeText } from "./daily.js";

const STORAGE_KEY = "quotid-crossword";
const SIZE = 5;

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

function render() {
  const board = document.getElementById("crossword-board");
  const acrossEl = document.getElementById("crossword-across");
  const downEl = document.getElementById("crossword-down");
  if (!board) return;

  board.innerHTML = "";
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement("div");
      if (isBlock(r, c)) {
        cell.className = "xw-cell is-block";
      } else {
        const num = cellNumber(r, c);
        const sel = selected && selected.r === r && selected.c === c;
        cell.className = `xw-cell${sel ? " is-selected" : ""}`;
        cell.dataset.r = r;
        cell.dataset.c = c;
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

  if (locked && won) setStatus("Cruciverba completato!", "win");
  else if (locked) setStatus("Soluzione rivelata. Torna domani!", "hint");
  else setStatus(`Mini 5×5 · tema: ${puzzle.theme || "giornaliero"}`);
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
  const { r, c } = selected;
  if (isBlock(r, c)) return;
  grid[r][c] = ch.toUpperCase();
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
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.getElementById("crossword-board")?.addEventListener("click", (e) => {
    const cell = e.target.closest("[data-r]");
    if (!cell || locked) return;
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    if (selected && selected.r === r && selected.c === c) {
      direction = direction === "across" ? "down" : "across";
    }
    selected = { r, c };
    render();
  });

  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("crossword")?.classList.contains("active")) return;
    if (locked) return;
    if (/^[a-zA-Z]$/.test(e.key)) {
      e.preventDefault();
      typeLetter(normalizeText(e.key));
    } else if (e.key === "Backspace") {
      e.preventDefault();
      if (!selected) return;
      const { r, c } = selected;
      if (grid[r][c]) grid[r][c] = "";
      else if (direction === "across") move(0, -1);
      else move(-1, 0);
      persist();
      render();
    } else if (e.key === "ArrowRight") { e.preventDefault(); direction = "across"; move(0, 1); render(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); direction = "across"; move(0, -1); render(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); direction = "down"; move(1, 0); render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); direction = "down"; move(-1, 0); render(); }
    else if (e.key === " ") { e.preventDefault(); direction = direction === "across" ? "down" : "across"; }
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
  });

  document.getElementById("crossword-clear")?.addEventListener("click", () => {
    if (locked) return;
    grid = buildEmpty();
    persist();
    render();
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
