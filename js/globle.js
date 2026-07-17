import { getDailyKey, pickDailyItem, loadState, saveState, normalizeText } from "./daily.js";

const STORAGE_KEY = "quotid-globle-v2";
const MAX = 8;

let countries = [];
let target = null;
let guesses = []; // {name, code, km, arrow}
let locked = false;
let won = false;
let onComplete = null;
let eventsBound = false;

function toRad(d) {
  return (d * Math.PI) / 180;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

function bearing(a, b) {
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  const brng = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return brng;
}

function dirArrow(deg) {
  const dirs = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
  return dirs[Math.round(deg / 45) % 8];
}

function findCountry(query) {
  const q = normalizeText(query);
  if (!q) return null;

  const exactName = countries.find((c) => normalizeText(c.name) === q);
  if (exactName) return exactName;

  const exactAlias = countries.find((c) =>
    (c.aliases || []).some((a) => normalizeText(a) === q)
  );
  if (exactAlias) return exactAlias;

  // Prefisso solo se univoco (es. "Ital" → Italia), mai se ambiguo.
  if (q.length >= 3) {
    const prefixHits = countries.filter((c) => {
      const name = normalizeText(c.name);
      const aliases = (c.aliases || []).map(normalizeText);
      return name.startsWith(q) || aliases.some((a) => a.startsWith(q));
    });
    if (prefixHits.length === 1) return prefixHits[0];
  }

  return null;
}

function remainingAttempts() {
  return Math.max(0, MAX - guesses.length);
}

function statusPlaying() {
  const left = remainingAttempts();
  if (guesses.length === 0) {
    return `Hai ${MAX} tentativi. Digita un paese (ci sono ${countries.length} paesi nell'elenco).`;
  }
  const last = guesses[guesses.length - 1];
  return `Tentativo ${guesses.length} di ${MAX}: ${last.name} a ${last.km.toLocaleString("it-IT")} km. Ne restano ${left}.`;
}

export async function initGloble(onDone) {
  onComplete = onDone;
  countries = await (await fetch(`data/countries.json?v=20260717globle`)).json();
  target = pickDailyItem(getDailyKey(), countries, "globle");

  const saved = loadState(STORAGE_KEY, getDailyKey());
  if (saved) {
    guesses = saved.guesses || [];
    locked = Boolean(saved.locked);
    won = Boolean(saved.won);
  }

  const datalist = document.getElementById("globle-list");
  datalist.innerHTML = countries
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "it"))
    .map((c) => `<option value="${c.name}"></option>`)
    .join("");

  render();
  bindEvents();
}

function persist() {
  saveState(STORAGE_KEY, getDailyKey(), { guesses, locked, won, completed: locked });
  if (locked && onComplete) onComplete(true);
}

function proximity(km) {
  if (km === 0) return 100;
  // rough: 0 km = 100%, ~20000 km = 0%
  return Math.max(0, Math.min(99, Math.round(100 - (km / 20000) * 100)));
}

function render() {
  const list = document.getElementById("globle-guesses");
  list.innerHTML = guesses.map((g) => {
    const pct = proximity(g.km);
    return `<li>
      <span class="globle-name">${g.name}</span>
      <span class="globle-meta">${g.km.toLocaleString("it-IT")} km ${g.arrow} · ${pct}%</span>
      <span class="globle-bar"><i style="width:${pct}%"></i></span>
    </li>`;
  }).join("");

  const input = document.getElementById("globle-input");
  const btn = document.getElementById("globle-submit");
  const reveal = document.getElementById("globle-reveal");
  input.disabled = locked;
  btn.disabled = locked;
  reveal.disabled = locked;

  const status = document.getElementById("globle-status");
  if (locked && won) {
    status.textContent = `Esatto! Il paese era ${target.name} (${guesses.length}/${MAX} tentativi).`;
    status.className = "game-status win";
  } else if (locked) {
    status.textContent = `Tentativi finiti. Era ${target.name}.`;
    status.className = "game-status hint";
  } else {
    status.textContent = statusPlaying();
    status.className = "game-status";
  }
}

function submit() {
  if (locked) return;
  const input = document.getElementById("globle-input");
  const country = findCountry(input.value.trim());
  if (!country) {
    document.getElementById("globle-status").textContent =
      "Paese non trovato. Usa un nome dall'elenco (suggerimenti mentre digiti).";
    document.getElementById("globle-status").className = "game-status hint";
    return;
  }
  if (guesses.some((g) => g.code === country.code)) {
    document.getElementById("globle-status").textContent = "Hai già provato questo paese.";
    document.getElementById("globle-status").className = "game-status hint";
    return;
  }

  const km = haversineKm(country, target);
  const arrow = km === 0 ? "🎉" : dirArrow(bearing(country, target));
  guesses.push({ name: country.name, code: country.code, km, arrow });
  input.value = "";

  if (country.code === target.code) {
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
  document.getElementById("globle-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    submit();
  });
  document.getElementById("globle-reveal")?.addEventListener("click", () => {
    if (locked) return;
    locked = true;
    won = false;
    persist();
    render();
  });
}

export function isGlobleComplete() {
  const saved = loadState(STORAGE_KEY, getDailyKey());
  return Boolean(saved?.locked);
}
