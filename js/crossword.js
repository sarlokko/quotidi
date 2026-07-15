import { getDailyKey, hashString, loadState, saveState, normalizeText } from "./daily.js";

const STORAGE_KEY = "quotid-crossword-v2";
const SIZE = 5;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

let puzzle = null;
let grid = null; // letters or '' ; '#' blocked
let locked = false;
let won = false;
let onComplete = null;
let eventsBound = false;
let selected = null; // {r,c}
let direction = "across";

/** Ordine deterministico senza ripetizioni fino a fine ciclo. */
function pickCrossword(dayKey, list) {
  const n = list.length;
  if (!n) return null;
  const [y, m, d] = dayKey.split("-").map(Number);
  const ordinal = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  const order = Array.from({ length: n }, (_, i) => i);
  let h = hashString(`crossword-deck-v2:${n}`);
  for (let i = n - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return list[order[((ordinal % n) + n) % n]];
}

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
  puzzle = pickCrossword(getDailyKey(), list);

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

function renderAlpha() {
  const alpha = document.getElementById("crossword-alpha");
  const dirBtn = document.getElementById("crossword-dir");
  const backBtn = document.getElementById("crossword-backspace");
  if (!alpha) return;

  alpha.innerHTML = LETTERS.map(
    (ch) => `<button type="button" class="xw-alpha-key" data-letter="${ch}" ${locked ? "disabled" : ""}>${ch}</button>`
  ).join("");

  if (dirBtn) {
    dirBtn.textContent = direction === "across" ? "→" : "↓";
    dirBtn.disabled = locked;
    dirBtn.title = direction === "across" ? "Orizzontale (tocca per verticale)" : "Verticale (tocca per orizzontale)";
  }
  if (backBtn) backBtn.disabled = locked;
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
        cell.setAttribute(
          "aria-label",
          `Riga ${r + 1}, colonna ${c + 1}${grid[r][c] ? `, lettera ${grid[r][c]}` : ""}`
        );
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

  renderAlpha();

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
}

function deleteLetter() {
  if (locked || !selected) return;
  const { r, c } = selected;
  if (grid[r][c]) grid[r][c] = "";
  else if (direction === "across") move(0, -1);
  else move(-1, 0);
  persist();
  render();
}

function toggleDirection() {
  direction = direction === "across" ? "down" : "across";
  render();
}

function selectCell(r, c, { toggleDir = false } = {}) {
  if (isBlock(r, c)) return;
  if (toggleDir && selected && selected.r === r && selected.c === c) {
    direction = direction === "across" ? "down" : "across";
  }
  selected = { r, c };
  render();
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.getElementById("crossword-board")?.addEventListener("click", (e) => {
    const cell = e.target.closest("[data-r]");
    if (!cell || locked) return;
    selectCell(Number(cell.dataset.r), Number(cell.dataset.c), { toggleDir: true });
  });

  document.getElementById("crossword-alpha")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-letter]");
    if (!btn || locked) return;
    typeLetter(btn.dataset.letter);
  });

  document.getElementById("crossword-dir")?.addEventListener("click", () => {
    if (!locked) toggleDirection();
  });

  document.getElementById("crossword-backspace")?.addEventListener("click", () => {
    if (!locked) deleteLetter();
  });

  document.addEventListener("keydown", (e) => {
    if (!document.getElementById("crossword")?.classList.contains("active")) return;
    if (locked) return;
    const tag = (e.target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;

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
