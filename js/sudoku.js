import { getDailyKey, hashString, loadState, saveState } from "./daily.js";

const STORAGE_KEY = "quotid-sudoku-9";
const SIZE = 9;
const BOX = 3;
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const CELL_COUNT = SIZE * SIZE;

let solution = null;
let given = null;
let grid = null;
let notes = null; // Array<number[]> length 81
let selected = -1;
let noteMode = false;
let locked = false;
let won = false;
let onComplete = null;
let eventsBound = false;
/** Celle da animare dopo autocompila / errore / vittoria */
let flashCells = new Set();
let flashKind = ""; // "autofill" | "error" | "win"
let flashTimer = null;

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

/** Soluzione 9×9 valida: pattern base + shuffle bande/stack/simboli. */
function buildSolution(dayKey) {
  const rand = mulberry32(hashString(`${dayKey}:sudoku9`));
  const board = Array(CELL_COUNT);

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      board[r * SIZE + c] = ((r * BOX + Math.floor(r / BOX) + c) % SIZE) + 1;
    }
  }

  const digitMap = shuffle(DIGITS, rand);
  for (let i = 0; i < CELL_COUNT; i++) board[i] = digitMap[board[i] - 1];

  // Shuffle bande di righe e righe dentro le bande
  const bandOrder = shuffle([0, 1, 2], rand);
  const rowOrder = [];
  for (const b of bandOrder) {
    rowOrder.push(...shuffle([b * 3, b * 3 + 1, b * 3 + 2], rand));
  }
  const byRows = Array(CELL_COUNT);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      byRows[r * SIZE + c] = board[rowOrder[r] * SIZE + c];
    }
  }

  // Shuffle stack di colonne e colonne dentro gli stack
  const stackOrder = shuffle([0, 1, 2], rand);
  const colOrder = [];
  for (const s of stackOrder) {
    colOrder.push(...shuffle([s * 3, s * 3 + 1, s * 3 + 2], rand));
  }
  const out = Array(CELL_COUNT);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      out[r * SIZE + c] = byRows[r * SIZE + colOrder[c]];
    }
  }
  return out;
}

function bit(n) {
  return 1 << n;
}

function countSolutions(puzzle, limit = 2) {
  const cells = puzzle.slice();
  const rows = Array(SIZE).fill(0);
  const cols = Array(SIZE).fill(0);
  const boxes = Array(SIZE).fill(0);

  for (let i = 0; i < CELL_COUNT; i++) {
    const v = cells[i];
    if (!v) continue;
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    const b = Math.floor(r / BOX) * BOX + Math.floor(c / BOX);
    const m = bit(v);
    rows[r] |= m;
    cols[c] |= m;
    boxes[b] |= m;
  }

  let found = 0;

  function solve() {
    if (found >= limit) return;
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;

    for (let i = 0; i < CELL_COUNT; i++) {
      if (cells[i]) continue;
      const r = Math.floor(i / SIZE);
      const c = i % SIZE;
      const b = Math.floor(r / BOX) * BOX + Math.floor(c / BOX);
      const used = rows[r] | cols[c] | boxes[b];
      let mask = 0;
      let count = 0;
      for (let d = 1; d <= SIZE; d++) {
        if (!(used & bit(d))) {
          mask |= bit(d);
          count += 1;
        }
      }
      if (count === 0) return;
      if (count < bestCount) {
        bestCount = count;
        best = i;
        bestMask = mask;
        if (count === 1) break;
      }
    }

    if (best === -1) {
      found += 1;
      return;
    }

    const r = Math.floor(best / SIZE);
    const c = best % SIZE;
    const b = Math.floor(r / BOX) * BOX + Math.floor(c / BOX);

    for (let d = 1; d <= SIZE; d++) {
      if (!(bestMask & bit(d))) continue;
      const m = bit(d);
      cells[best] = d;
      rows[r] |= m;
      cols[c] |= m;
      boxes[b] |= m;
      solve();
      cells[best] = 0;
      rows[r] ^= m;
      cols[c] ^= m;
      boxes[b] ^= m;
      if (found >= limit) return;
    }
  }

  solve();
  return found;
}

function buildPuzzle(sol, dayKey) {
  const rand = mulberry32(hashString(`${dayKey}:sudoku9-mask`));
  const puzzle = sol.slice();
  const givenMask = Array(CELL_COUNT).fill(true);
  const order = shuffle([...Array(CELL_COUNT).keys()], rand);

  // Mira a ~32–36 indizi (difficoltà media), mantenendo unicità
  const targetClues = 32 + (hashString(`${dayKey}:sudoku9-clues`) % 5);
  let clues = CELL_COUNT;

  for (const idx of order) {
    if (clues <= targetClues) break;
    const keep = puzzle[idx];
    puzzle[idx] = 0;
    if (countSolutions(puzzle, 2) === 1) {
      givenMask[idx] = false;
      clues -= 1;
    } else {
      puzzle[idx] = keep;
    }
  }

  return { givenMask, puzzle };
}

function conflictsAt(values, idx) {
  const v = values[idx];
  if (!v) return false;
  const r = Math.floor(idx / SIZE);
  const c = idx % SIZE;
  const br = Math.floor(r / BOX) * BOX;
  const bc = Math.floor(c / BOX) * BOX;

  for (let i = 0; i < SIZE; i++) {
    if (i !== c && values[r * SIZE + i] === v) return true;
    if (i !== r && values[i * SIZE + c] === v) return true;
  }
  for (let rr = br; rr < br + BOX; rr++) {
    for (let cc = bc; cc < bc + BOX; cc++) {
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
    notes = Array.isArray(saved.notes) && saved.notes.length === CELL_COUNT
      ? saved.notes.map((n) => (Array.isArray(n) ? n.map(Number).filter((d) => d >= 1 && d <= 9) : []))
      : Array.from({ length: CELL_COUNT }, () => []);
    noteMode = Boolean(saved.noteMode);
  } else {
    grid = [...built.puzzle];
    given = [...built.givenMask];
    notes = Array.from({ length: CELL_COUNT }, () => []);
    locked = false;
    won = false;
    noteMode = false;
  }

  // pulisci note sulle celle già piene
  for (let i = 0; i < CELL_COUNT; i++) {
    if (grid[i]) notes[i] = [];
  }

  selected = given.findIndex((g) => !g);
  render();
  bindEvents();
}

function persist() {
  saveState(STORAGE_KEY, getDailyKey(), {
    grid,
    given,
    notes,
    noteMode,
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
  if (c % BOX === 0) classes.push("box-left");
  if (c % BOX === BOX - 1) classes.push("box-right");
  if (r % BOX === 0) classes.push("box-top");
  if (r % BOX === BOX - 1) classes.push("box-bottom");
  return classes.join(" ");
}

function renderNotesHtml(idx) {
  const set = new Set(notes[idx] || []);
  if (!set.size) return "";
  return `<span class="sudoku-notes">${DIGITS.map((d) => `<i class="${set.has(d) ? "on" : ""}">${set.has(d) ? d : ""}</i>`).join("")}</span>`;
}

function countErrors() {
  let n = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    if (given[i]) continue;
    if (grid[i] && grid[i] !== solution[i]) n += 1;
  }
  return n;
}

function errorIndices() {
  const out = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    if (given[i]) continue;
    if (grid[i] && grid[i] !== solution[i]) out.push(i);
  }
  return out;
}

function scheduleFlash(indices, kind, ms = 900) {
  if (flashTimer) clearTimeout(flashTimer);
  flashCells = new Set(indices);
  flashKind = kind;
  flashTimer = setTimeout(() => {
    flashCells = new Set();
    flashKind = "";
    flashTimer = null;
    render();
  }, ms);
}

function stripDigitFromPeers(idx, digit) {
  const r = Math.floor(idx / SIZE);
  const c = idx % SIZE;
  const br = Math.floor(r / BOX) * BOX;
  const bc = Math.floor(c / BOX) * BOX;
  for (let i = 0; i < SIZE; i++) {
    const rowIdx = r * SIZE + i;
    const colIdx = i * SIZE + c;
    notes[rowIdx] = (notes[rowIdx] || []).filter((d) => d !== digit);
    notes[colIdx] = (notes[colIdx] || []).filter((d) => d !== digit);
  }
  for (let rr = br; rr < br + BOX; rr++) {
    for (let cc = bc; cc < bc + BOX; cc++) {
      const bIdx = rr * SIZE + cc;
      notes[bIdx] = (notes[bIdx] || []).filter((d) => d !== digit);
    }
  }
}

/** Autocompila celle con un solo candidato nelle note. Restituisce gli indici riempiti. */
function autoFillSingles() {
  const filled = [];
  let changed = true;
  while (changed && !locked) {
    changed = false;
    for (let i = 0; i < CELL_COUNT; i++) {
      if (grid[i] || given[i]) continue;
      const cands = notes[i] || [];
      if (cands.length !== 1) continue;
      const digit = cands[0];
      grid[i] = digit;
      notes[i] = [];
      stripDigitFromPeers(i, digit);
      filled.push(i);
      changed = true;
    }
  }
  return filled;
}

function tryFinish() {
  if (!isCompleteAndValid(grid)) return false;
  locked = true;
  won = true;
  persist();
  scheduleFlash([...Array(CELL_COUNT).keys()], "win", 1200);
  return true;
}

function render() {
  const board = document.getElementById("sudoku-board");
  const pad = document.getElementById("sudoku-pad");
  if (!board || !pad) return;

  board.classList.toggle("is-won", locked && won);
  board.classList.toggle("flash-win", flashKind === "win");

  board.innerHTML = grid.map((val, idx) => {
    const isGiven = given[idx];
    const isSel = selected === idx;
    const conflict = val && conflictsAt(grid, idx);
    const wrong = !isGiven && val && solution && val !== solution[idx];
    const hasNotes = !val && (notes[idx] || []).length > 0;
    const flashing = flashCells.has(idx);
    const cls = [
      "sudoku-cell",
      cellBoxClass(idx),
      isGiven ? "is-given" : "is-edit",
      isSel ? "is-selected" : "",
      conflict ? "is-conflict" : "",
      wrong ? "is-error" : "",
      hasNotes ? "has-notes" : "",
      locked && won ? "is-solved" : "",
      flashing && flashKind === "autofill" ? "is-autofilled" : "",
      flashing && flashKind === "error" ? "is-error-flash" : "",
    ].filter(Boolean).join(" ");

    const body = val
      ? `<span class="sudoku-digit">${val}</span>`
      : renderNotesHtml(idx);

    return `<button type="button" class="${cls}" data-idx="${idx}" ${locked && !isGiven ? "disabled" : ""} aria-label="Riga ${Math.floor(idx / SIZE) + 1}, colonna ${(idx % SIZE) + 1}">${body}</button>`;
  }).join("");

  pad.innerHTML = `
    ${DIGITS.map((d) => `<button type="button" class="sudoku-key" data-digit="${d}" ${locked ? "disabled" : ""}>${d}</button>`).join("")}
    <button type="button" class="sudoku-key sudoku-key-clear" data-digit="0" ${locked ? "disabled" : ""}>⌫</button>
  `;

  document.getElementById("sudoku-check").disabled = locked;
  document.getElementById("sudoku-clear").disabled = locked;
  document.getElementById("sudoku-reveal").disabled = locked;
  document.getElementById("sudoku-mode-digit")?.classList.toggle("active", !noteMode);
  document.getElementById("sudoku-mode-note")?.classList.toggle("active", noteMode);

  if (locked && won) {
    setStatus("Completato! Sudoku del giorno risolto.", "win");
  } else if (locked && !won) {
    setStatus("Soluzione rivelata. Torna domani per un nuovo puzzle.", "hint");
  } else {
    const empty = grid.filter((v) => !v).length;
    const errors = countErrors();
    const modeLabel = noteMode ? "Note ✎" : "Numero";
    if (errors > 0) {
      setStatus(`${errors} error${errors === 1 ? "e" : "i"} in rosso · ${modeLabel} · vuote: ${empty}.`, "lose");
    } else if (!grid.includes(0) && !isCompleteAndValid(grid)) {
      setStatus("Qualcosa non torna: controlla le celle in rosso.", "hint");
    } else {
      setStatus(`Modalità ${modeLabel} · celle vuote: ${empty}.`);
    }
  }
}

function shakeBoard() {
  const board = document.getElementById("sudoku-board");
  board?.classList.remove("shake");
  void board?.offsetWidth;
  board?.classList.add("shake");
}

function toggleNote(digit) {
  if (locked || selected < 0 || given[selected] || grid[selected]) return;
  if (!digit) {
    notes[selected] = [];
    persist();
    render();
    return;
  }
  const list = new Set(notes[selected] || []);
  if (list.has(digit)) list.delete(digit);
  else list.add(digit);
  notes[selected] = [...list].sort((a, b) => a - b);
  persist();
  render();
}

function placeDigit(digit) {
  if (locked || selected < 0 || given[selected]) return;

  if (noteMode) {
    toggleNote(digit);
    return;
  }

  const placedAt = selected;
  grid[selected] = digit;
  if (digit) notes[selected] = [];
  if (digit) stripDigitFromPeers(selected, digit);

  const autofilled = digit ? autoFillSingles() : [];
  persist();

  if (tryFinish()) {
    render();
    return;
  }

  if (digit && grid[placedAt] && grid[placedAt] !== solution[placedAt]) {
    scheduleFlash([placedAt], "error", 700);
  } else if (autofilled.length) {
    scheduleFlash(autofilled, "autofill", 900);
  }

  if (digit && !grid.includes(0)) {
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

  if (!locked && autofilled.length) {
    const n = autofilled.length;
    setStatus(`Autocompilata${n === 1 ? "" : "e"} ${n} cella${n === 1 ? "" : "e"} (un solo candidato nelle note).`, "win");
  }
}

function checkNow() {
  if (locked) return;
  if (tryFinish()) {
    render();
    return;
  }
  const errs = errorIndices();
  if (!errs.length && grid.some((v) => !v)) {
    setStatus("Nessun errore finora, ma la griglia non è completa.", "hint");
    return;
  }
  if (!errs.length) {
    shakeBoard();
    setStatus("Qualcosa non torna (conflitti). Controlla le celle in rosso.", "hint");
    render();
    return;
  }
  shakeBoard();
  scheduleFlash(errs, "error", 1000);
  setStatus(`${errs.length} error${errs.length === 1 ? "e" : "i"} evidenziato${errs.length === 1 ? "" : "i"} in rosso.`, "lose");
  render();
}

function clearEdits() {
  if (locked) return;
  grid = grid.map((v, i) => (given[i] ? v : 0));
  notes = notes.map((_, i) => (given[i] ? [] : []));
  persist();
  selected = given.findIndex((g) => !g);
  render();
}

function revealSolution() {
  if (locked) return;
  grid = [...solution];
  notes = Array.from({ length: CELL_COUNT }, () => []);
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

  document.getElementById("sudoku-mode-digit")?.addEventListener("click", () => {
    noteMode = false;
    persist();
    render();
  });
  document.getElementById("sudoku-mode-note")?.addEventListener("click", () => {
    noteMode = true;
    persist();
    render();
  });

  document.getElementById("sudoku-check")?.addEventListener("click", checkNow);
  document.getElementById("sudoku-clear")?.addEventListener("click", clearEdits);
  document.getElementById("sudoku-reveal")?.addEventListener("click", revealSolution);

  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("sudoku")?.classList.contains("active")) return;
    if (locked) return;
    if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      noteMode = !noteMode;
      persist();
      render();
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
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
