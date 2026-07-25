import { getDailyKey, hashString, loadState, saveState, normalizeText } from "./daily.js";

const STORAGE_KEY = "quotid-dish-v1";
const MAX = 6;

let dish = null;
let countries = [];
let guesses = []; // strings
let locked = false;
let won = false;
let onComplete = null;
let eventsBound = false;

/** Ordine deterministico senza ripetizioni fino a fine ciclo. */
function pickDish(dayKey, list) {
  const n = list.length;
  if (!n) return null;
  const [y, m, d] = dayKey.split("-").map(Number);
  const ordinal = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  const order = Array.from({ length: n }, (_, i) => i);
  let h = hashString(`dish-deck-v1:${n}`);
  for (let i = n - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return list[order[((ordinal % n) + n) % n]];
}

function countryAliases(name) {
  const fromList = countries.find((c) => normalizeText(c.name) === normalizeText(name));
  const extra = dish?.aliases || [];
  return [
    name,
    ...(fromList?.aliases || []),
    ...extra,
  ];
}

function matchCountry(guess) {
  const g = normalizeText(guess);
  if (!g || !dish) return false;
  return countryAliases(dish.country).some((a) => {
    const t = normalizeText(a);
    return t && (t === g || (g.length >= 4 && (t.startsWith(g) || g.startsWith(t))));
  });
}

function findKnownCountry(guess) {
  const g = normalizeText(guess);
  if (!g) return null;
  const exact = countries.find((c) => normalizeText(c.name) === g);
  if (exact) return exact.name;
  const alias = countries.find((c) => (c.aliases || []).some((a) => normalizeText(a) === g));
  if (alias) return alias.name;
  // Also accept dish-specific aliases mapped back to dish.country only for display
  if ((dish?.aliases || []).some((a) => normalizeText(a) === g)) return dish.country;
  if (g.length >= 3) {
    const hits = countries.filter((c) => {
      const name = normalizeText(c.name);
      const aliases = (c.aliases || []).map(normalizeText);
      return name.startsWith(g) || aliases.some((a) => a.startsWith(g));
    });
    if (hits.length === 1) return hits[0].name;
  }
  return null;
}

export async function initDish(onDone) {
  onComplete = onDone;
  const [list, countryList] = await Promise.all([
    fetch("data/dishes.json?v=20260725dish").then((r) => r.json()),
    fetch("data/countries.json").then((r) => r.json()),
  ]);
  countries = countryList;
  dish = pickDish(getDailyKey(), list);
  if (!dish?.dish || !dish?.country || !dish?.image) {
    throw new Error("Piatto del giorno non valido");
  }

  const saved = loadState(STORAGE_KEY, getDailyKey());
  guesses = saved?.guesses || [];
  locked = Boolean(saved?.locked);
  won = Boolean(saved?.won);

  const datalist = document.getElementById("dish-list");
  if (datalist) {
    const names = [...new Set(list.map((d) => d.country))].sort((a, b) => a.localeCompare(b, "it"));
    datalist.innerHTML = names.map((n) => `<option value="${n}"></option>`).join("");
  }

  render();
  bindEvents();
  if (locked && onComplete) onComplete(true);
}

function persist() {
  saveState(STORAGE_KEY, getDailyKey(), {
    guesses,
    locked,
    won,
    completed: locked,
  });
  if (locked && onComplete) onComplete(true);
}

function setStatus(text, kind = "") {
  const el = document.getElementById("dish-status");
  if (!el) return;
  el.textContent = text;
  el.className = `game-status${kind ? ` ${kind}` : ""}`;
}

function render() {
  const img = document.getElementById("dish-image");
  const nameEl = document.getElementById("dish-name");
  const blurb = document.getElementById("dish-blurb");
  const list = document.getElementById("dish-guesses");
  const input = document.getElementById("dish-input");
  const submit = document.getElementById("dish-submit");
  const reveal = document.getElementById("dish-reveal");
  const answer = document.getElementById("dish-answer");
  if (!img || !blurb || !list) return;

  img.src = dish.image;
  img.alt = locked ? `${dish.dish} — ${dish.country}` : "Piatto del giorno da indovinare";
  blurb.textContent = dish.blurb;

  if (nameEl) {
    nameEl.textContent = locked ? dish.dish : "Piatto del giorno";
  }

  list.innerHTML = guesses
    .map((g) => {
      const ok = matchCountry(g);
      return `<li class="${ok ? "is-win" : "is-miss"}">${g}</li>`;
    })
    .join("");

  if (input) input.disabled = locked;
  if (submit) submit.disabled = locked;
  if (reveal) reveal.disabled = locked;

  if (answer) {
    if (locked) {
      answer.hidden = false;
      answer.textContent = `${dish.dish} · ${dish.country}`;
    } else {
      answer.hidden = true;
      answer.textContent = "";
    }
  }

  if (locked && won) {
    setStatus(`Giusto! È ${dish.dish} (${dish.country}).`, "win");
  } else if (locked) {
    setStatus(`Era ${dish.dish}, tipico di: ${dish.country}.`, "hint");
  } else {
    setStatus(`Di che paese è questo piatto? Tentativi ${guesses.length}/${MAX}.`);
  }
}

function submit() {
  if (locked || !dish) return;
  const input = document.getElementById("dish-input");
  const raw = input?.value.trim() || "";
  if (!raw) {
    setStatus("Scrivi un paese prima.", "hint");
    return;
  }

  const known = findKnownCountry(raw);
  const label = known || raw;
  if (guesses.some((g) => normalizeText(g) === normalizeText(label))) {
    setStatus("Hai già provato questo paese.", "hint");
    input.select();
    return;
  }

  guesses.push(label);
  if (input) input.value = "";

  if (matchCountry(label)) {
    locked = true;
    won = true;
  } else if (guesses.length >= MAX) {
    locked = true;
    won = false;
  }
  persist();
  render();
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;
  document.getElementById("dish-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    submit();
  });
  document.getElementById("dish-reveal")?.addEventListener("click", () => {
    if (locked) return;
    locked = true;
    won = false;
    persist();
    render();
  });
}

export function isDishComplete() {
  const saved = loadState(STORAGE_KEY, getDailyKey());
  return Boolean(saved?.locked);
}
