import { getDailyKey, hashString, loadState, saveState, pickDailyItem } from "./daily.js";

const STORAGE_KEY = "quotid-picross-10";
const SIZE = 10;
const CELL_COUNT = SIZE * SIZE;
const EMPTY = 0;
const FILL = 1;
const MARK = 2;

let puzzles = [];
let puzzle = null; // { title, grid }
let solution = null;
let rowClues = null;
let colClues = null;
let grid = null;
let mode = FILL;
let locked = false;
let won = false;
let onComplete = null;
let eventsBound = false;
let paintValue = null;

function lineClues(line) {
  const clues = [];
  let run = 0;
  for (const cell of line) {
    if (cell) {
      run += 1;
    } else if (run) {
      clues.push(run);
      run = 0;
    }
  }
  if (run) clues.push(run);
  return clues.length ? clues : [0];
}

function computeClues(sol) {
  const rows = [];
  const cols = [];
  for (let r = 0; r < SIZE; r++) {
    rows.push(lineClues(sol.slice(r * SIZE, r * SIZE + SIZE)));
  }
  for (let c = 0; c < SIZE; c++) {
    const col = [];
    for (let r = 0; r < SIZE; r++) col.push(sol[r * SIZE + c]);
    cols.push(lineClues(col));
  }
  return { rows, cols };
}

function isSolved(values) {
  for (let i = 0; i < CELL_COUNT; i++) {
    const filled = values[i] === FILL;
    const should = solution[i] === 1;
    if (filled !== should) return false;
  }
  return true;
}

function lineSatisfied(values, isRow, index) {
  const line = [];
  for (let i = 0; i < SIZE; i++) {
    const idx = isRow ? index * SIZE + i : i * SIZE + index;
    line.push(values[idx] === FILL ? 1 : 0);
  }
  const clues = isRow ? rowClues[index] : colClues[index];
  const current = lineClues(line);
  if (JSON.stringify(current) !== JSON.stringify(clues)) return false;
  return [...Array(SIZE).keys()].every((i) => {
    const idx = isRow ? index * SIZE + i : i * SIZE + index;
    return values[idx] !== EMPTY;
  });
}

function pickPuzzle(dayKey, list) {
  const n = list.length;
  if (!n) return null;
  const [y, m, d] = dayKey.split("-").map(Number);
  const ordinal = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  const order = Array.from({ length: n }, (_, i) => i);
  let h = hashString(`picross-deck-v10:${n}`);
  for (let i = n - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return list[order[((ordinal % n) + n) % n]];
}

export async function initPicross(onDone) {
  onComplete = onDone;
  const dayKey = getDailyKey();
  puzzles = await (await fetch("data/picross.json?v=20260722pic")).json();
  puzzle = pickPuzzle(dayKey, puzzles) || pickDailyItem(dayKey, puzzles, "picross10");
  solution = puzzle.grid.map(Number);
  const clues = computeClues(solution);
  rowClues = clues.rows;
  colClues = clues.cols;

  const saved = loadState(STORAGE_KEY, dayKey);
  if (Array.isArray(saved?.grid) && saved.grid.length === CELL_COUNT) {
    grid = saved.grid.map(Number);
    locked = Boolean(saved.locked);
    won = Boolean(saved.won);
    mode = saved.mode === MARK ? MARK : FILL;
  } else {
    grid = Array(CELL_COUNT).fill(EMPTY);
    locked = false;
    won = false;
    mode = FILL;
  }

  render();
  bindEvents();
}

function persist() {
  saveState(STORAGE_KEY, getDailyKey(), {
    grid,
    locked,
    won,
    mode,
    completed: locked,
  });
  if (locked && onComplete) onComplete(true);
}

function setStatus(text, kind = "") {
  const el = document.getElementById("picross-status");
  if (!el) return;
  el.textContent = text;
  el.className = `game-status${kind ? ` ${kind}` : ""}`;
}

function render() {
  const board = document.getElementById("picross-board");
  if (!board) return;

  const maxRowClue = Math.max(...rowClues.map((c) => c.length));
  const maxColClue = Math.max(...colClues.map((c) => c.length));

  board.style.setProperty("--pic-size", String(SIZE));
  board.style.setProperty("--pic-row-clues", String(maxRowClue));
  board.style.setProperty("--pic-col-clues", String(maxColClue));

  let html = `<div class="pic-corner"></div>`;

  for (let c = 0; c < SIZE; c++) {
    const ok = lineSatisfied(grid, false, c);
    html += `<div class="pic-clue pic-clue-col ${ok ? "is-done" : ""}">${colClues[c].map((n) => `<span>${n}</span>`).join("")}</div>`;
  }

  for (let r = 0; r < SIZE; r++) {
    const ok = lineSatisfied(grid, true, r);
    html += `<div class="pic-clue pic-clue-row ${ok ? "is-done" : ""}">${rowClues[r].map((n) => `<span>${n}</span>`).join(" ")}</div>`;
    for (let c = 0; c < SIZE; c++) {
      const idx = r * SIZE + c;
      const v = grid[idx];
      const cls = [
        "pic-cell",
        v === FILL ? "is-fill" : "",
        v === MARK ? "is-mark" : "",
        locked && won && solution[idx] ? "is-solved" : "",
      ].filter(Boolean).join(" ");
      html += `<button type="button" class="${cls}" data-idx="${idx}" ${locked ? "disabled" : ""} aria-label="Riga ${r + 1}, colonna ${c + 1}"></button>`;
    }
  }

  board.innerHTML = html;

  document.getElementById("picross-mode-fill")?.classList.toggle("active", mode === FILL);
  document.getElementById("picross-mode-mark")?.classList.toggle("active", mode === MARK);
  document.getElementById("picross-check").disabled = locked;
  document.getElementById("picross-clear").disabled = locked;
  document.getElementById("picross-reveal").disabled = locked;

  const title = puzzle?.title || "disegno";
  if (locked && won) {
    setStatus(`Completato! Era: ${title}.`, "win");
  } else if (locked && !won) {
    setStatus(`Soluzione: ${title}. Torna domani per un nuovo disegno.`, "hint");
  } else {
    const filled = grid.filter((v) => v === FILL).length;
    const need = solution.filter((v) => v === 1).length;
    setStatus(`Picross 10×10 · ${mode === FILL ? "Riempi" : "Segna ✕"} · piene ${filled}/${need}`);
  }
}

function applyCell(idx, value) {
  if (locked) return;
  grid[idx] = value;
  if (isSolved(grid)) {
    locked = true;
    won = true;
  }
  persist();
  render();
}

function paintAt(idx) {
  if (locked) return;
  if (paintValue === null) {
    if (mode === FILL) {
      paintValue = grid[idx] === FILL ? EMPTY : FILL;
    } else {
      paintValue = grid[idx] === MARK ? EMPTY : MARK;
    }
  }
  if (grid[idx] !== paintValue) {
    grid[idx] = paintValue;
    if (isSolved(grid)) {
      locked = true;
      won = true;
    }
    persist();
    render();
  }
}

function checkNow() {
  if (locked) return;
  if (isSolved(grid)) {
    locked = true;
    won = true;
    persist();
    render();
    return;
  }
  const board = document.getElementById("picross-board");
  board?.classList.remove("shake");
  void board?.offsetWidth;
  board?.classList.add("shake");

  let wrong = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    if (grid[i] === FILL && solution[i] !== 1) wrong += 1;
  }
  setStatus(
    wrong
      ? `Non ancora: ${wrong} cella/e piene non corrette.`
      : "Mancano ancora pezzi giusti (o hai segnato celle da riempire).",
    "hint"
  );
}

function clearGrid() {
  if (locked) return;
  grid = Array(CELL_COUNT).fill(EMPTY);
  persist();
  render();
}

function revealSolution() {
  if (locked) return;
  grid = solution.map((v) => (v ? FILL : MARK));
  locked = true;
  won = false;
  persist();
  render();
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  const board = document.getElementById("picross-board");

  board?.addEventListener("pointerdown", (e) => {
    const cell = e.target.closest("[data-idx]");
    if (!cell || locked) return;
    e.preventDefault();
    paintValue = null;
    board.setPointerCapture?.(e.pointerId);
    paintAt(Number(cell.dataset.idx));
  });

  board?.addEventListener("pointermove", (e) => {
    if (paintValue === null || locked) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cell = el?.closest?.("[data-idx]");
    if (cell) paintAt(Number(cell.dataset.idx));
  });

  const endPaint = () => { paintValue = null; };
  board?.addEventListener("pointerup", endPaint);
  board?.addEventListener("pointercancel", endPaint);
  board?.addEventListener("lostpointercapture", endPaint);

  board?.addEventListener("contextmenu", (e) => {
    const cell = e.target.closest("[data-idx]");
    if (!cell || locked) return;
    e.preventDefault();
    const idx = Number(cell.dataset.idx);
    applyCell(idx, grid[idx] === MARK ? EMPTY : MARK);
  });

  document.getElementById("picross-mode-fill")?.addEventListener("click", () => {
    mode = FILL;
    persist();
    render();
  });
  document.getElementById("picross-mode-mark")?.addEventListener("click", () => {
    mode = MARK;
    persist();
    render();
  });
  document.getElementById("picross-check")?.addEventListener("click", checkNow);
  document.getElementById("picross-clear")?.addEventListener("click", clearGrid);
  document.getElementById("picross-reveal")?.addEventListener("click", revealSolution);
}

export function isPicrossComplete() {
  const saved = loadState(STORAGE_KEY, getDailyKey());
  return Boolean(saved?.locked);
}
