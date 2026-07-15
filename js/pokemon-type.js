import { getDailyKey, pickDailyItem, loadState, saveState, normalizeText } from "./daily.js";

const TYPE_ICONS = {
  normal: "https://raw.githubusercontent.com/msikma/pokesprite/master/misc/types/gen8/normal.png",
  fire: "https://raw.githubusercontent.com/msikma/pokesprite/master/misc/types/gen8/fire.png",
  water: "https://raw.githubusercontent.com/msikma/pokesprite/master/misc/types/gen8/water.png",
  grass: "https://raw.githubusercontent.com/msikma/pokesprite/master/misc/types/gen8/grass.png",
  electric: "https://raw.githubusercontent.com/msikma/pokesprite/master/misc/types/gen8/electric.png",
  ice: "https://raw.githubusercontent.com/msikma/pokesprite/master/misc/types/gen8/ice.png",
  fighting: "https://raw.githubusercontent.com/msikma/pokesprite/master/misc/types/gen8/fighting.png",
  poison: "https://raw.githubusercontent.com/msikma/pokesprite/master/misc/types/gen8/poison.png",
  ground: "https://raw.githubusercontent.com/msikma/pokesprite/master/misc/types/gen8/ground.png",
  flying: "https://raw.githubusercontent.com/msikma/pokesprite/master/misc/types/gen8/flying.png",
  psychic: "https://raw.githubusercontent.com/msikma/pokesprite/master/misc/types/gen8/psychic.png",
  bug: "https://raw.githubusercontent.com/msikma/pokesprite/master/misc/types/gen8/bug.png",
  rock: "https://raw.githubusercontent.com/msikma/pokesprite/master/misc/types/gen8/rock.png",
  ghost: "https://raw.githubusercontent.com/msikma/pokesprite/master/misc/types/gen8/ghost.png",
  dragon: "https://raw.githubusercontent.com/msikma/pokesprite/master/misc/types/gen8/dragon.png",
  dark: "https://raw.githubusercontent.com/msikma/pokesprite/master/misc/types/gen8/dark.png",
  steel: "https://raw.githubusercontent.com/msikma/pokesprite/master/misc/types/gen8/steel.png",
  fairy: "https://raw.githubusercontent.com/msikma/pokesprite/master/misc/types/gen8/fairy.png",
};

const TYPE_LABELS_IT = {
  normal: "Normale", fire: "Fuoco", water: "Acqua", grass: "Erba",
  electric: "Elettro", ice: "Ghiaccio", fighting: "Lotta", poison: "Veleno",
  ground: "Terra", flying: "Volante", psychic: "Psico", bug: "Coleottero",
  rock: "Roccia", ghost: "Spettro", dragon: "Drago", dark: "Buio",
  steel: "Acciaio", fairy: "Folletto",
};

const ALL_TYPES = Object.keys(TYPE_ICONS);
const STORAGE_KEY = "quotid-pokemon";

let pokemonPool = [];
let dailyPokemon = null;
let selected = new Set();
let attemptsLeft = 3;
let locked = false;
let onComplete = null;

function typeLabels(types) {
  return types.map((t) => TYPE_LABELS_IT[t] || t).join(" + ");
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export async function initPokemonType(onDone) {
  onComplete = onDone;
  const res = await fetch("data/pokemon.json");
  pokemonPool = await res.json();
  const dayKey = getDailyKey();
  dailyPokemon = pickDailyItem(dayKey, pokemonPool, "pokemon");

  const saved = loadState(STORAGE_KEY, dayKey);
  if (saved) {
    attemptsLeft = saved.attemptsLeft ?? 3;
    locked = saved.locked ?? false;
    selected = new Set(saved.selected || []);
  } else {
    attemptsLeft = 3;
    locked = false;
    selected.clear();
  }

  render();
  bindEvents();
}

function persist() {
  saveState(STORAGE_KEY, getDailyKey(), {
    attemptsLeft,
    locked,
    selected: [...selected],
    completed: locked,
  });
  if (locked && onComplete) onComplete(true);
}

function render() {
  const card = document.getElementById("pokemon-card");
  const attempts = document.getElementById("pokemon-attempts");
  const grid = document.getElementById("pokemon-grid");
  const feedback = document.getElementById("pokemon-feedback");
  const actions = document.getElementById("pokemon-actions");

  if (!dailyPokemon) return;

  card.innerHTML = `
    <img src="${dailyPokemon.img}" alt="${dailyPokemon.name}" class="pokemon-img">
    <h3>${dailyPokemon.name}</h3>
    <p class="pokemon-id">#${String(dailyPokemon.id).padStart(4, "0")}</p>
  `;

  attempts.textContent = locked
    ? "Partita conclusa per oggi"
    : `Tentativi rimasti: ${attemptsLeft}`;

  grid.innerHTML = ALL_TYPES.map((t) => `
    <button type="button" class="type-btn ${selected.has(t) ? "selected" : ""}" data-type="${t}" ${locked ? "disabled" : ""}>
      <img src="${TYPE_ICONS[t]}" alt="">
      <span>${TYPE_LABELS_IT[t]}</span>
    </button>
  `).join("");

  actions.style.display = locked ? "none" : "flex";

  if (locked && feedback.dataset.kind) {
    feedback.className = `feedback feedback-${feedback.dataset.kind}`;
    feedback.innerHTML = feedback.dataset.html || "";
  }
}

function bindEvents() {
  document.getElementById("pokemon-grid")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-type]");
    if (!btn || locked) return;
    const type = btn.dataset.type;
    if (selected.has(type)) selected.delete(type);
    else {
      if (selected.size >= 2) selected.delete(selected.values().next().value);
      selected.add(type);
    }
    render();
  });

  document.getElementById("pokemon-submit")?.addEventListener("click", submitGuess);
}

function showFeedback(html, kind) {
  const feedback = document.getElementById("pokemon-feedback");
  feedback.className = `feedback feedback-${kind}`;
  feedback.innerHTML = html;
  feedback.dataset.kind = kind;
  feedback.dataset.html = html;
}

function submitGuess() {
  if (locked || selected.size === 0) return;

  const correct = new Set(dailyPokemon.types);
  const guess = new Set(selected);

  if (setsEqual(guess, correct)) {
    locked = true;
    showFeedback(`✅ Esatto! ${dailyPokemon.name} è di tipo ${typeLabels(dailyPokemon.types)}.`, "win");
    persist();
    render();
    return;
  }

  attemptsLeft -= 1;
  const overlap = [...guess].filter((t) => correct.has(t));

  if (attemptsLeft <= 0) {
    locked = true;
    showFeedback(
      `❌ Game over! ${dailyPokemon.name} è di tipo <strong>${typeLabels(dailyPokemon.types)}</strong>.`,
      "lose"
    );
    persist();
    render();
    return;
  }

  if (overlap.length > 0) {
    showFeedback(`Quasi! Hai indovinato ${overlap.length} tipo/i corretto/i. Riprova.`, "hint");
  } else {
    showFeedback("Nessun tipo corretto. Riprova!", "hint");
  }

  selected.clear();
  persist();
  render();
}

export function isPokemonComplete() {
  const saved = loadState(STORAGE_KEY, getDailyKey());
  return Boolean(saved?.locked);
}
