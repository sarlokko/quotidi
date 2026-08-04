import { getDailyKey, hashString, loadState, saveState } from "./daily.js";

const STORAGE_KEY = "quotid-mahjong-v3";
const PAIRS = 20;

const MAN = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** Set completo stile Riichi: pin (cerchi), sou (bambù), man (caratteri), draghi, venti. */
const TILE_DEFS = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ id: `pin${n}`, suit: "pin", n, name: `${n} cerchi` })),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ id: `sou${n}`, suit: "sou", n, name: `${n} bambù` })),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
    id: `man${n}`,
    suit: "man",
    n,
    glyph: MAN[n - 1],
    name: `${MAN[n - 1]}万`,
  })),
  { id: "dong", suit: "wind", glyph: "東", name: "Est" },
  { id: "nan", suit: "wind", glyph: "南", name: "Sud" },
  { id: "xi", suit: "wind", glyph: "西", name: "Ovest" },
  { id: "bei", suit: "wind", glyph: "北", name: "Nord" },
  { id: "chun", suit: "dragon-red", glyph: "中", name: "Drago rosso" },
  { id: "hatsu", suit: "dragon-green", glyph: "發", name: "Drago verde" },
  { id: "haku", suit: "dragon-white", glyph: "白", name: "Drago bianco" },
];

const DEF_BY_ID = Object.fromEntries(TILE_DEFS.map((d) => [d.id, d]));

/**
 * Layout “pagoda aperta”: bordi liberi, 3 livelli, 40 tessere.
 * z0 20 · z1 12 · z2 8 — molte tessere laterali sempre accessibili.
 */
const LAYOUT = [
  // z0 — base a trapezio (20)
  ...[1, 2, 3, 4].map((x) => ({ x, y: 0, z: 0 })),
  ...[0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 1, z: 0 })),
  ...[0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 2, z: 0 })),
  ...[1, 2, 3, 4].map((x) => ({ x, y: 3, z: 0 })),
  // z1 — piano medio (12)
  ...[2, 3].map((x) => ({ x, y: 0, z: 1 })),
  ...[1, 2, 3, 4].map((x) => ({ x, y: 1, z: 1 })),
  ...[1, 2, 3, 4].map((x) => ({ x, y: 2, z: 1 })),
  ...[2, 3].map((x) => ({ x, y: 3, z: 1 })),
  // z2 — cima (8)
  ...[1, 2, 3, 4].map((x) => ({ x, y: 1, z: 2 })),
  ...[1, 2, 3, 4].map((x) => ({ x, y: 2, z: 2 })),
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

function slotKey(s) {
  return `${s.x},${s.y},${s.z}`;
}

/** Libera tra le posizioni ancora presenti (stesse regole di gioco). */
function isFreeInSet(slot, remainingKeys) {
  for (let z = slot.z + 1; z <= 2; z++) {
    if (remainingKeys.has(`${slot.x},${slot.y},${z}`)) return false;
  }
  const left = remainingKeys.has(`${slot.x - 1},${slot.y},${slot.z}`);
  const right = remainingKeys.has(`${slot.x + 1},${slot.y},${slot.z}`);
  return !left || !right;
}

/**
 * Distribuisce le facce in modo risolvibile: simula la rimozione di coppie
 * libere a tavolo pieno e assegna le facce a quelle coppie.
 */
function solvableAssignment(slots, facePairs, rnd) {
  const remaining = new Map(slots.map((s) => [slotKey(s), s]));
  const faces = [...facePairs];
  shuffleInPlace(faces, rnd);
  const byIndex = new Map();

  for (const face of faces) {
    let ok = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      const free = [...remaining.values()].filter((s) => isFreeInSet(s, remaining));
      if (free.length < 2) return null;
      shuffleInPlace(free, rnd);
      const a = free[0];
      const b = free[1];
      byIndex.set(a.i, face);
      byIndex.set(b.i, face);
      remaining.delete(slotKey(a));
      remaining.delete(slotKey(b));
      ok = true;
      break;
    }
    if (!ok) return null;
  }
  if (remaining.size !== 0) return null;
  return byIndex;
}

function pickFaceIds(dayKey) {
  const rnd = seededRng(hashString(`mahjong-faces-v3:${dayKey}`));
  const pool = TILE_DEFS.map((d) => d.id);
  shuffleInPlace(pool, rnd);
  return pool.slice(0, PAIRS);
}

function buildTiles(dayKey) {
  const facePairs = pickFaceIds(dayKey);
  const slots = LAYOUT.map((slot, i) => ({ ...slot, i }));
  let assigned = null;
  const base = hashString(`mahjong-deal-v3:${dayKey}`);
  for (let t = 0; t < 48; t++) {
    assigned = solvableAssignment(slots, facePairs, seededRng((base + t * 9973) >>> 0));
    if (assigned) break;
  }
  if (!assigned) {
    // fallback rarissimo: shuffle semplice
    const deck = [];
    facePairs.forEach((f) => deck.push(f, f));
    shuffleInPlace(deck, seededRng(base));
    return LAYOUT.map((slot, i) => ({
      id: i,
      x: slot.x,
      y: slot.y,
      z: slot.z,
      face: deck[i],
      gone: false,
    }));
  }

  return LAYOUT.map((slot, i) => ({
    id: i,
    x: slot.x,
    y: slot.y,
    z: slot.z,
    face: assigned.get(i),
    gone: false,
  }));
}

/** Layout punti pinzu / bastoncini souzu come sulle tessere vere. */
const DOT_LAYOUTS = {
  1: [[50, 50]],
  2: [
    [32, 28],
    [68, 72],
  ],
  3: [
    [28, 24],
    [50, 50],
    [72, 76],
  ],
  4: [
    [30, 28],
    [70, 28],
    [30, 72],
    [70, 72],
  ],
  5: [
    [30, 28],
    [70, 28],
    [50, 50],
    [30, 72],
    [70, 72],
  ],
  6: [
    [30, 22],
    [70, 22],
    [30, 50],
    [70, 50],
    [30, 78],
    [70, 78],
  ],
  7: [
    [30, 20],
    [70, 20],
    [50, 38],
    [30, 55],
    [70, 55],
    [30, 80],
    [70, 80],
  ],
  8: [
    [30, 18],
    [70, 18],
    [30, 40],
    [70, 40],
    [30, 62],
    [70, 62],
    [30, 84],
    [70, 84],
  ],
  9: [
    [28, 18],
    [50, 18],
    [72, 18],
    [28, 50],
    [50, 50],
    [72, 50],
    [28, 82],
    [50, 82],
    [72, 82],
  ],
};

function pinColors(n, i) {
  // Classico: 1 e 5 rossi, 2 verdi, resto blu (con 9 mix)
  if (n === 1) return "red";
  if (n === 2) return i === 0 ? "green" : "green";
  if (n === 5) return i === 2 ? "red" : "blue";
  if (n === 9) return i % 3 === 1 ? "red" : "blue";
  if (n === 7 && i === 2) return "red";
  return "blue";
}

function faceMarkup(faceId) {
  const def = DEF_BY_ID[faceId];
  if (!def) return `<span class="mj-glyph">${faceId}</span>`;

  if (def.suit === "pin") {
    const dots = (DOT_LAYOUTS[def.n] || [])
      .map(([x, y], i) => {
        const c = pinColors(def.n, i);
        return `<i class="mj-dot mj-dot-${c}" style="left:${x}%;top:${y}%"></i>`;
      })
      .join("");
    return `<span class="mj-face mj-face-pin" aria-hidden="true">${dots}</span>`;
  }

  if (def.suit === "sou") {
    if (def.n === 1) {
      // 1 bambù classico = uccellino verde
      return `<span class="mj-face mj-face-sou mj-face-bird" aria-hidden="true">
        <svg viewBox="0 0 48 56" width="78%" height="78%" focusable="false">
          <ellipse cx="24" cy="30" rx="14" ry="12" fill="#2f9e44"/>
          <circle cx="30" cy="18" r="8" fill="#40c057"/>
          <circle cx="33" cy="16" r="1.6" fill="#1a1a1a"/>
          <path d="M36 18 L44 16 L36 21 Z" fill="#f08c00"/>
          <path d="M12 28 Q4 20 8 34 Q14 36 18 32 Z" fill="#37b24d"/>
          <path d="M20 40 L24 48 L28 40 Z" fill="#f08c00"/>
          <rect x="21" y="38" width="3" height="10" rx="1" fill="#1b7a34"/>
        </svg>
      </span>`;
    }
    const sticks = (DOT_LAYOUTS[def.n] || [])
      .map(([x, y]) => `<i class="mj-stick" style="left:${x}%;top:${y}%"></i>`)
      .join("");
    return `<span class="mj-face mj-face-sou" aria-hidden="true">${sticks}</span>`;
  }

  if (def.suit === "man") {
    return `<span class="mj-face mj-face-man" aria-hidden="true"><b>${def.glyph}</b><small>萬</small></span>`;
  }

  if (def.suit === "wind") {
    return `<span class="mj-face mj-face-wind" aria-hidden="true">${def.glyph}</span>`;
  }

  if (def.suit === "dragon-red") {
    return `<span class="mj-face mj-face-dragon mj-face-chun" aria-hidden="true">${def.glyph}</span>`;
  }
  if (def.suit === "dragon-green") {
    return `<span class="mj-face mj-face-dragon mj-face-hatsu" aria-hidden="true">${def.glyph}</span>`;
  }
  return `<span class="mj-face mj-face-dragon mj-face-haku" aria-hidden="true"><i></i></span>`;
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

function faceLabel(faceId) {
  return DEF_BY_ID[faceId]?.name || faceId;
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

  const ordered = [...tiles].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
  for (const t of ordered) {
    if (t.gone) continue;
    const def = DEF_BY_ID[t.face];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `mj-tile mj-suit-${def?.suit || "unknown"}`;
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
    btn.setAttribute("aria-label", `Tessera ${faceLabel(t.face)}${free ? ", libera" : ", bloccata"}`);
    btn.innerHTML = `${faceMarkup(t.face)}${free ? "" : '<span class="mj-lock" aria-hidden="true"></span>'}`;
    board.appendChild(btn);
  }

  if (hintBtn) hintBtn.disabled = locked;
  if (shuffleBtn) shuffleBtn.disabled = locked || alive().length < 2;
  if (giveupBtn) giveupBtn.disabled = locked;

  const freeCount = locked ? 0 : freeTiles().length;
  const legendFree = document.getElementById("mahjong-legend-free");
  const legendBlocked = document.getElementById("mahjong-legend-blocked");
  if (legendFree) legendFree.textContent = locked ? "—" : String(freeCount);
  if (legendBlocked) legendBlocked.textContent = locked ? "—" : String(alive().length - freeCount);

  if (locked && won) {
    setStatus(`Completato! ${moves} mosse · ${hints} suggerimenti.`, "win");
  } else if (locked) {
    setStatus("Hai abbandonato il tavolo di oggi. Domani un nuovo layout.", "hint");
  } else {
    const pair = findMatchPair();
    const left = pairsLeft();
    if (!pair && left > 0) {
      setStatus(`Nessuna coppia libera (${left} rimaste). Tocca Rimescola.`, "hint");
    } else {
      setStatus(`Tessere illuminate = libere. Coppie: ${left} · selezionabili: ${freeCount}.`);
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
  } else if (!findMatchPair()) {
    shuffleFaces();
    setStatus(`Niente mosse: tavolo rimescolato automaticamente. Coppie: ${pairsLeft()}.`, "hint");
    return;
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

  const slots = live.map((t) => ({ x: t.x, y: t.y, z: t.z, i: t.id }));
  const counts = new Map();
  live.forEach((t) => counts.set(t.face, (counts.get(t.face) || 0) + 1));
  const facePairs = [];
  for (const [face, n] of counts) {
    for (let k = 0; k < n / 2; k++) facePairs.push(face);
  }

  const seed = hashString(`mahjong-reshuffle-v3:${getDailyKey()}:${moves}:${Date.now()}`);
  let assigned = null;
  for (let t = 0; t < 64; t++) {
    assigned = solvableAssignment(slots, facePairs, seededRng((seed + t * 7919) >>> 0));
    if (assigned) break;
  }

  if (assigned) {
    live.forEach((t) => {
      t.face = assigned.get(t.id);
    });
  } else {
    const faces = live.map((t) => t.face);
    shuffleInPlace(faces, seededRng(seed));
    live.forEach((t, i) => {
      t.face = faces[i];
    });
  }

  selectedId = null;
  persist();
  render();
  const pair = findMatchPair();
  setStatus(
    pair
      ? `Rimescolato (tavolo giocabile). Coppie rimaste: ${pairsLeft()}.`
      : `Rimescolato. Se non vedi mosse, riprova Rimescola. Coppie: ${pairsLeft()}.`,
    pair ? "" : "hint"
  );
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
