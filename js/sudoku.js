import { getDailyKey, hashString, loadState, saveState } from "./daily.js";

const STORAGE_KEY = "quotid-sudoku-6";
const SIZE = 6;
const BOX_H = 2;
const BOX_W = 3;
const DIGITS = [1, 2, 3, 4, 5, 6];
const CELL_COUNT = SIZE * SIZE;

let solution = null;
let given = null;
let grid = null;
let selected = -1;
let locked = false;
let won = false;
let onComplete = null;
let eventsBound = false;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function canPlace(board, idx, val) {
  const r = Math.floor(idx / SIZE);
  const c = idx % SIZE;
  for (let i = 0; i < SIZE; i++) {
    if (board[r * SIZE + i] === val) return false;
    if (board[i * SIZE + c] === val) return false;
  }
  const br = Math.floor(r / BOX_H) * BOX_H;
  const bc = Math.floor(c / BOX_W) * BOX_W;
  for (let rr = br; rr < br + BOX_H; rr++) {
    for (let cc = bc; cc < bc + BOX_W; cc++) {
      if (board[rr * SIZE + cc] === val) return false;
    }
  }
  return true;
}

/** Genera una soluzione 6×6 valida (righe, colonne, blocchi 2×3). */
function buildSolution(dayKey) {
  const rand = mulberry32(hashString(`${dayKey}:sudoku6`));
  const board = Array(CELL_COUNT).fill(0);

  function fill(pos) {
    if (pos >= CELL_COUNT) return true;
    if (board[pos]) return fill(pos + 1);
    const nums = shuffle(DIGITS, rand);
    for (const n of nums) {
      if (!canPlace(board, pos, n)) continue;
      board[pos] = n;
      if (fill(pos + 1)) return true;
      board[pos] = 0;
    }
    return false;
  }

  // Pattern iniziale a bande per accelerare + varietà
  const bandDigits = shuffle(DIGITS, rand);
  for (let c = 0; c < SIZE; c++) board[c] = bandDigits[c];
  if (!fill(SIZE)) {
    board.fill(0);
    fill(0);
  }
  return board;
}

function buildPuzzle(sol, dayKey) {
  const rand = mulberry32(hashString(`${dayKey}:sudoku6-mask`));
  const givenMask = Array(CELL_COUNT).fill(true);
  const puzzle = [...sol];

  // 18–22 indizi su 36 (~metà / poco meno)
  const clueCount = 18 + (hashString(`${dayKey}:sudoku6-clues`) % 5);
  const order = shuffle([...Array(CELL_COUNT).keys()], rand);
  let keep = CELL_COUNT;
  for (const idx of order) {
    if (keep <= clueCount) break;
    givenMask[idx] = false;
    puzzle[idx] = 0;
    keep -= 1;
  }
  return { givenMask, puzzle };
}

function conflictsAt(values, idx) {
  const v = values[idx];
  if (!v) return false;
  const r = Math.floor(idx / SIZE);
  const c = idx % SIZE;

  for (let i = 0; i < SIZE; i++) {
    const rowIdx = r * SIZE + i;
    const colIdx = i * SIZE + c;
    if (rowIdx !== idx && values[rowIdx] === v) return true;
    if (colIdx !== idx && values[colIdx] === v) return true;
  }

  const br = Math.floor(r / BOX_H) * BOX_H;
  const bc = Math.floor(c / BOX_W) * BOX_W;
  for (let rr = br; rr < br + BOX_H; rr++) {
    for (let cc = bc; cc < bc + BOX_W; cc++) {
      const bIdx = rr * SIZE + cc;
      if (bIdx !== idx && values[bIdx] === v) return true;
    }
  }
  return false;
}

function isCompleteAndValid(values) {
  if (values.some((v) => !v)) return false;
  for (let i = 0; i < values.length; i++) {
    if (conflictsAt(values, i)) return false;
  }
  return true;
}

function isValidSaved(saved) {
  return (
    Array.isArray(saved?.grid) &&
    Array.isArray(saved?.given) &&
    saved.grid.length === CELL_COUNT &&
    saved.given.length === CELL_COUNT
  );
}

export function initSudoku(onDone) {
  onComplete = onDone;
  const dayKey = getDailyKey();
  solution = buildSolution(dayKey);
  const built = buildPuzzle(solution, dayKey);

  const saved = loadState(STORAGE_KEY, dayKey);
  if (isValidSaved(saved)) {
    grid = saved.grid.map(Number);
    given = saved.given.map(Boolean);
    locked = Boolean(saved.locked);
    won = Boolean(saved.won);
  } else {
    grid = [...built.puzzle];
    given = [...built.givenMask];
    locked = false;
    won = false;
  }

  selected = given.findIndex((g) => !g && !locked);
  render();
  bindEvents();
}

function persist() {
  saveState(STORAGE_KEY, getDailyKey(), {
    grid,
    given,
    locked,
    won,
    completed: locked,
  });
  if (locked && onComplete) onComplete(true);
}

function setStatus(text, kind = "") {
  const el = document.getElementById("sudoku-status");
  if (!el) return;
  el.textContent = text;
  el.className = `game-status${kind ? ` ${kind}` : ""}`;
}

function cellBoxClass(idx) {
  const r = Math.floor(idx / SIZE);
  const c = idx % SIZE;
  const classes = [];
  if (c % BOX_W === 0) classes.push("box-left");
  if (c % BOX_W === BOX_W - 1) classes.push("box-right");
  if (r % BOX_H === 0) classes.push("box-top");
  if (r % BOX_H === BOX_H - 1) classes.push("box-bottom");
  return classes.join(" ");
}

function render() {
  const board = document.getElementById("sudoku-board");
  const pad = document.getElementById("sudoku-pad");
  if (!board || !pad) return;

  board.innerHTML = grid.map((val, idx) => {
    const isGiven = given[idx];
    const isSel = selected === idx;
    const bad = val && conflictsAt(grid, idx);
    const cls = [
      "sudoku-cell",
      cellBoxClass(idx),
      isGiven ? "is-given" : "is-edit",
      isSel ? "is-selected" : "",
      bad ? "is-conflict" : "",
      locked && won ? "is-solved" : "",
    ].filter(Boolean).join(" ");

    return `<button type="button" class="${cls}" data-idx="${idx}" ${locked && !isGiven ? "disabled" : ""} aria-label="Riga ${Math.floor(idx / SIZE) + 1}, colonna ${(idx % SIZE) + 1}">${val || ""}</button>`;
  }).join("");

  pad.innerHTML = `
    ${DIGITS.map((d) => `<button type="button" class="sudoku-key" data-digit="${d}" ${locked ? "disabled" : ""}>${d}</button>`).join("")}
    <button type="button" class="sudoku-key sudoku-key-clear" data-digit="0" ${locked ? "disabled" : ""}>⌫</button>
  `;

  const checkBtn = document.getElementById("sudoku-check");
  const clearBtn = document.getElementById("sudoku-clear");
  const revealBtn = document.getElementById("sudoku-reveal");
  if (checkBtn) checkBtn.disabled = locked;
  if (clearBtn) clearBtn.disabled = locked;
  if (revealBtn) revealBtn.disabled = locked;

  if (locked && won) {
    setStatus("Completato! Sudoku 6×6 del giorno risolto.", "win");
  } else if (locked && !won) {
    setStatus("Soluzione rivelata. Torna domani per un nuovo puzzle.", "hint");
  } else if (!grid.includes(0) && !isCompleteAndValid(grid)) {
    setStatus("Qualcosa non torna: controlla le celle in rosso.", "hint");
  } else {
    const empty = grid.filter((v) => !v).length;
    setStatus(`Numeri 1–6. Righe, colonne e blocchi 2×3 senza ripetizioni. Vuote: ${empty}.`);
  }
}

function shakeBoard() {
  const board = document.getElementById("sudoku-board");
  board?.classList.remove("shake");
  void board?.offsetWidth;
  board?.classList.add("shake");
}

function placeDigit(digit) {
  if (locked || selected < 0 || given[selected]) return;
  grid[selected] = digit;
  persist();

  if (isCompleteAndValid(grid)) {
    locked = true;
    won = true;
    persist();
  } else if (digit && !grid.includes(0) && !isCompleteAndValid(grid)) {
    shakeBoard();
  }

  if (!locked && digit) {
    for (let step = 1; step <= CELL_COUNT; step++) {
      const next = (selected + step) % CELL_COUNT;
      if (!given[next] && !grid[next]) {
        selected = next;
        break;
      }
    }
  }
  render();
}

function checkNow() {
  if (locked) return;
  if (grid.some((v) => !v)) {
    setStatus("Compila tutte le celle prima di controllare.", "hint");
    return;
  }
  if (isCompleteAndValid(grid)) {
    locked = true;
    won = true;
    persist();
    render();
    return;
  }
  shakeBoard();
  setStatus("Non ancora corretto. Cerca le ripetizioni in rosso.", "hint");
  render();
}

function clearEdits() {
  if (locked) return;
  grid = grid.map((v, i) => (given[i] ? v : 0));
  persist();
  selected = given.findIndex((g) => !g);
  render();
}

function revealSolution() {
  if (locked) return;
  grid = [...solution];
  locked = true;
  won = false;
  persist();
  render();
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.getElementById("sudoku-board")?.addEventListener("click", (e) => {
    const cell = e.target.closest("[data-idx]");
    if (!cell || locked) return;
    const idx = Number(cell.dataset.idx);
    if (given[idx]) return;
    selected = idx;
    render();
  });

  document.getElementById("sudoku-pad")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-digit]");
    if (!btn || locked) return;
    placeDigit(Number(btn.dataset.digit));
  });

  document.getElementById("sudoku-check")?.addEventListener("click", checkNow);
  document.getElementById("sudoku-clear")?.addEventListener("click", clearEdits);
  document.getElementById("sudoku-reveal")?.addEventListener("click", revealSolution);

  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("sudoku")?.classList.contains("active")) return;
    if (locked) return;
    if (/^[1-6]$/.test(e.key)) {
      e.preventDefault();
      placeDigit(Number(e.key));
    } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
      e.preventDefault();
      placeDigit(0);
    } else if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      let r = Math.floor(Math.max(selected, 0) / SIZE);
      let c = Math.max(selected, 0) % SIZE;
      if (e.key === "ArrowRight") c = (c + 1) % SIZE;
      if (e.key === "ArrowLeft") c = (c + SIZE - 1) % SIZE;
      if (e.key === "ArrowDown") r = (r + 1) % SIZE;
      if (e.key === "ArrowUp") r = (r + SIZE - 1) % SIZE;
      selected = r * SIZE + c;
      render();
    }
  });
}

export function isSudokuComplete() {
  const saved = loadState(STORAGE_KEY, getDailyKey());
  return Boolean(saved?.locked);
}
