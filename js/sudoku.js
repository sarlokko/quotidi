import { getDailyKey, hashString, loadState, saveState } from "./daily.js";

const STORAGE_KEY = "quotid-sudoku";
const SIZE = 3;
const DIGITS = [1, 2, 3];

let solution = null;
let given = null; // boolean[9] — celle bloccate
let grid = null; // number|0 [9]
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

/** Latin square 3×3 (ogni riga/colonna ha 1–3). */
function buildSolution(dayKey) {
  const rand = mulberry32(hashString(`${dayKey}:sudoku`));
  const symbols = shuffle(DIGITS, rand);
  const rowPerm = shuffle([0, 1, 2], rand);
  const colPerm = shuffle([0, 1, 2], rand);

  // Base ciclica, poi permuta simboli / righe / colonne
  const base = [
    [0, 1, 2],
    [1, 2, 0],
    [2, 0, 1],
  ];

  const out = Array(SIZE * SIZE).fill(0);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const br = rowPerm[r];
      const bc = colPerm[c];
      out[r * SIZE + c] = symbols[base[br][bc]];
    }
  }
  return out;
}

function buildPuzzle(sol, dayKey) {
  const rand = mulberry32(hashString(`${dayKey}:sudoku-mask`));
  const givenMask = Array(SIZE * SIZE).fill(false);
  const puzzle = Array(SIZE * SIZE).fill(0);

  // 4 o 5 indizi (su 9) — abbastanza per una sola soluzione tipica
  const clueCount = 4 + (hashString(`${dayKey}:sudoku-clues`) % 2);
  const order = shuffle([...Array(SIZE * SIZE).keys()], rand);
  for (let i = 0; i < clueCount; i++) {
    const idx = order[i];
    givenMask[idx] = true;
    puzzle[idx] = sol[idx];
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
  return false;
}

function isCompleteAndValid(values) {
  if (values.some((v) => !v)) return false;
  for (let i = 0; i < values.length; i++) {
    if (conflictsAt(values, i)) return false;
  }
  return true;
}

export function initSudoku(onDone) {
  onComplete = onDone;
  const dayKey = getDailyKey();
  solution = buildSolution(dayKey);
  const built = buildPuzzle(solution, dayKey);

  const saved = loadState(STORAGE_KEY, dayKey);
  if (saved?.grid && saved?.given) {
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

  selected = given.findIndex((g, i) => !g && !locked);
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
      isGiven ? "is-given" : "is-edit",
      isSel ? "is-selected" : "",
      bad ? "is-conflict" : "",
      locked && won ? "is-solved" : "",
    ].filter(Boolean).join(" ");

    return `<button type="button" class="${cls}" data-idx="${idx}" ${locked && !isGiven ? "disabled" : ""} aria-label="Cella ${Math.floor(idx / SIZE) + 1}, ${ (idx % SIZE) + 1}">${val || ""}</button>`;
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
    setStatus("Completato! Sudoku del giorno risolto.", "win");
  } else if (locked && !won) {
    setStatus("Soluzione rivelata. Torna domani per un nuovo puzzle.", "hint");
  } else if (!grid.includes(0) && !isCompleteAndValid(grid)) {
    setStatus("Qualcosa non torna: controlla le celle in rosso.", "hint");
  } else {
    const empty = grid.filter((v) => !v).length;
    setStatus(`Riempi la griglia con 1–3. Ogni riga e colonna senza ripetizioni. Celle vuote: ${empty}.`);
  }
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
    // griglia piena ma errata
    const board = document.getElementById("sudoku-board");
    board?.classList.remove("shake");
    void board?.offsetWidth;
    board?.classList.add("shake");
    setStatus("Qualcosa non torna: controlla righe e colonne.", "hint");
  }

  // passa alla prossima cella vuota editabile
  if (!locked && digit) {
    for (let step = 1; step <= SIZE * SIZE; step++) {
      const next = (selected + step) % (SIZE * SIZE);
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
  const board = document.getElementById("sudoku-board");
  board?.classList.remove("shake");
  void board?.offsetWidth;
  board?.classList.add("shake");
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
    if (/^[1-3]$/.test(e.key)) {
      e.preventDefault();
      placeDigit(Number(e.key));
    } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
      e.preventDefault();
      placeDigit(0);
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      let r = Math.floor(Math.max(selected, 0) / SIZE);
      let c = Math.max(selected, 0) % SIZE;
      if (e.key === "ArrowRight") c = (c + 1) % SIZE;
      if (e.key === "ArrowLeft") c = (c + SIZE - 1) % SIZE;
      if (e.key === "ArrowDown") r = (r + 1) % SIZE;
      if (e.key === "ArrowUp") r = (r + SIZE - 1) % SIZE;
      const next = r * SIZE + c;
      if (!given[next]) selected = next;
      render();
    }
  });
}

export function isSudokuComplete() {
  const saved = loadState(STORAGE_KEY, getDailyKey());
  return Boolean(saved?.locked);
}
