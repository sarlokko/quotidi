import { getDailyKey, hashString, loadState, saveState } from "./daily.js";

const STORAGE_KEY = "quotid-mahjong-v1";
const PAIRS = 20;

/** Facce tessere (Unicode Mahjong + fallback leggibili). */
const FACES = [
  "🀙", "🀚", "🀛", "🀜", "🀝", "🀞", "🀟", "🀠", "🀡",
  "🀐", "🀑", "🀒", "🀓", "🀔", "🀕", "🀖", "🀗", "🀘",
  "🀇", "🀈", "🀉", "🀊", "🀋", "🀌", "🀍", "🀎", "🀏",
  "🀄", "🀅", "🀆", "🀀", "🀁", "🀂", "🀃",
];

/**
 * Layout fisso: 40 tessere su 3 livelli (24 + 12 + 4).
 * z=0 base 6×4, z=1 centro 4×3, z=2 cima 2×2.
 */
const LAYOUT = [
  // z0 — 24
  ...[0, 1, 2, 3].flatMap((y) => [0, 1, 2, 3, 4, 5].map((x) => ({ x, y, z: 0 }))),
  // z1 — 12
  ...[0, 1, 2].flatMap((y) => [1, 2, 3, 4].map((x) => ({ x, y, z: 1 }))),
  // z2 — 4
  ...[1, 2].flatMap((y) => [2, 3].map((x) => ({ x, y, z: 2 }))),
];

let tiles = []; // { id, x, y, z, face, gone }
let selectedId = null;
let locked = false;
let won = false;
let hints = 0;
let moves = 0;
let onComplete = null;
let eventsBound = false;

function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

function shuffleInPlace(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickFaces(dayKey) {
  const rnd = seededRng(hashString(`mahjong-faces:${dayKey}`));
  const pool = [...FACES];
  shuffleInPlace(pool, rnd);
  return pool.slice(0, PAIRS);
}

function buildTiles(dayKey) {
  const faces = pickFaces(dayKey);
  const deck = [];
  faces.forEach((face) => {
    deck.push(face, face);
  });
  const rnd = seededRng(hashString(`mahjong-deal:${dayKey}`));
  shuffleInPlace(deck, rnd);

  return LAYOUT.map((slot, i) => ({
    id: i,
    x: slot.x,
    y: slot.y,
    z: slot.z,
    face: deck[i],
    gone: false,
  }));
}

function alive() {
  return tiles.filter((t) => !t.gone);
}

function isFreeTile(t, list = tiles) {
  if (!t || t.gone) return false;
  const live = list.filter((o) => !o.gone);
  const above = live.some((o) => o.z > t.z && o.x === t.x && o.y === t.y);
  if (above) return false;
  const left = live.some((o) => o.z === t.z && o.y === t.y && o.x === t.x - 1);
  const right = live.some((o) => o.z === t.z && o.y === t.y && o.x === t.x + 1);
  return !left || !right;
}

function freeTiles() {
  return alive().filter((t) => isFreeTile(t));
}

function findMatchPair() {
  const free = freeTiles();
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      if (free[i].face === free[j].face) return [free[i], free[j]];
    }
  }
  return null;
}

function pairsLeft() {
  return alive().length / 2;
}

export async function initMahjong(onDone) {
  onComplete = onDone;
  const dayKey = getDailyKey();
  const saved = loadState(STORAGE_KEY, dayKey);

  if (saved?.tiles?.length === LAYOUT.length) {
    tiles = saved.tiles.map((t) => ({ ...t }));
    selectedId = saved.selectedId ?? null;
    locked = Boolean(saved.locked);
    won = Boolean(saved.won);
    hints = saved.hints || 0;
    moves = saved.moves || 0;
  } else {
    tiles = buildTiles(dayKey);
    selectedId = null;
    locked = false;
    won = false;
    hints = 0;
    moves = 0;
  }

  render();
  bindEvents();
  if (locked && onComplete) onComplete(true);
}

function persist() {
  saveState(STORAGE_KEY, getDailyKey(), {
    tiles,
    selectedId,
    locked,
    won,
    hints,
    moves,
    completed: locked,
  });
  if (locked && onComplete) onComplete(true);
}

function setStatus(text, kind = "") {
  const el = document.getElementById("mahjong-status");
  if (!el) return;
  el.textContent = text;
  el.className = `game-status${kind ? ` ${kind}` : ""}`;
}

function render() {
  const board = document.getElementById("mahjong-board");
  const hintBtn = document.getElementById("mahjong-hint");
  const shuffleBtn = document.getElementById("mahjong-shuffle");
  const giveupBtn = document.getElementById("mahjong-giveup");
  if (!board) return;

  board.replaceChildren();
  board.style.setProperty("--mj-cols", "6");
  board.style.setProperty("--mj-rows", "4");

  // Disegna dal basso verso l’alto così lo stacking CSS funziona
  const ordered = [...tiles].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
  for (const t of ordered) {
    if (t.gone) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mj-tile";
    btn.dataset.id = String(t.id);
    btn.style.setProperty("--x", String(t.x));
    btn.style.setProperty("--y", String(t.y));
    btn.style.setProperty("--z", String(t.z));
    btn.style.zIndex = String(10 + t.z * 10 + t.y);
    const free = !locked && isFreeTile(t);
    btn.classList.toggle("is-free", free);
    btn.classList.toggle("is-blocked", !free && !locked);
    btn.classList.toggle("is-selected", t.id === selectedId);
    btn.disabled = locked || !free;
    btn.setAttribute("aria-label", `Tessera ${t.face}${free ? ", libera" : ", bloccata"}`);
    btn.textContent = t.face;
    board.appendChild(btn);
  }

  if (hintBtn) hintBtn.disabled = locked;
  if (shuffleBtn) shuffleBtn.disabled = locked || alive().length < 2;
  if (giveupBtn) giveupBtn.disabled = locked;

  if (locked && won) {
    setStatus(`Completato! ${moves} mosse · ${hints} suggerimenti.`, "win");
  } else if (locked) {
    setStatus("Hai abbandonato il tavolo di oggi. Domani un nuovo layout.", "hint");
  } else {
    const pair = findMatchPair();
    const left = pairsLeft();
    if (!pair && left > 0) {
      setStatus(`Nessuna coppia libera (${left} rimaste). Prova a rimescolare.`, "hint");
    } else {
      setStatus(`Abbina le tessere libere. Coppie rimaste: ${left} · livelli: 3.`);
    }
  }
}

function clearSelection() {
  selectedId = null;
}

function onTileClick(id) {
  if (locked) return;
  const tile = tiles.find((t) => t.id === id);
  if (!tile || tile.gone || !isFreeTile(tile)) return;

  if (selectedId == null) {
    selectedId = id;
    persist();
    render();
    return;
  }

  if (selectedId === id) {
    clearSelection();
    persist();
    render();
    return;
  }

  const first = tiles.find((t) => t.id === selectedId);
  if (!first || first.gone || !isFreeTile(first)) {
    selectedId = id;
    persist();
    render();
    return;
  }

  if (first.face !== tile.face) {
    selectedId = id;
    persist();
    render();
    setStatus("Le tessere non corrispondono. Riprova.", "hint");
    return;
  }

  first.gone = true;
  tile.gone = true;
  selectedId = null;
  moves += 1;

  if (alive().length === 0) {
    locked = true;
    won = true;
  }

  persist();
  render();
}

function useHint() {
  if (locked) return;
  const pair = findMatchPair();
  if (!pair) {
    setStatus("Nessuna coppia libera da suggerire. Rimescola.", "hint");
    return;
  }
  hints += 1;
  selectedId = pair[0].id;
  persist();
  render();
  const board = document.getElementById("mahjong-board");
  pair.forEach((t) => {
    const el = board?.querySelector(`[data-id="${t.id}"]`);
    el?.classList.add("is-hint");
  });
  setStatus(`Suggerimento: queste due vanno insieme. Coppie: ${pairsLeft()}.`, "hint");
}

function shuffleFaces() {
  if (locked) return;
  const live = alive();
  if (live.length < 2) return;
  const faces = live.map((t) => t.face);
  const rnd = seededRng(hashString(`mahjong-reshuffle:${getDailyKey()}:${moves}:${Date.now()}`));
  shuffleInPlace(faces, rnd);
  live.forEach((t, i) => {
    t.face = faces[i];
  });
  selectedId = null;
  persist();
  render();
  setStatus(`Tessere rimescolate. Coppie rimaste: ${pairsLeft()}.`);
}

function giveUp() {
  if (locked) return;
  locked = true;
  won = false;
  selectedId = null;
  persist();
  render();
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.getElementById("mahjong-board")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".mj-tile");
    if (!btn) return;
    onTileClick(Number(btn.dataset.id));
  });

  document.getElementById("mahjong-hint")?.addEventListener("click", useHint);
  document.getElementById("mahjong-shuffle")?.addEventListener("click", shuffleFaces);
  document.getElementById("mahjong-giveup")?.addEventListener("click", giveUp);
}

export function isMahjongComplete() {
  const saved = loadState(STORAGE_KEY, getDailyKey());
  return Boolean(saved?.locked);
}
