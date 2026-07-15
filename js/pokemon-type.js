import { getDailyKey, pickDailyItem, loadState, saveState } from "./daily.js";

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

let dailyPokemon = null;
let selected = new Set();
let attemptsLeft = 3;
let locked = false;
let won = false;
let history = [];
let feedbackHtml = "";
let feedbackKind = "";
let onComplete = null;
let eventsBound = false;

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
  const pokemonPool = await res.json();
  const dayKey = getDailyKey();
  dailyPokemon = pickDailyItem(dayKey, pokemonPool, "pokemon");

  const saved = loadState(STORAGE_KEY, dayKey);
  if (saved) {
    attemptsLeft = saved.attemptsLeft ?? 3;
    locked = saved.locked ?? false;
    won = saved.won ?? false;
    selected = new Set(saved.selected || []);
    history = saved.history || [];
    feedbackHtml = saved.feedbackHtml || "";
    feedbackKind = saved.feedbackKind || "";
  } else {
    attemptsLeft = 3;
    locked = false;
    won = false;
    selected.clear();
    history = [];
    feedbackHtml = "";
    feedbackKind = "";
  }

  render();
  bindEvents();
}

function persist() {
  saveState(STORAGE_KEY, getDailyKey(), {
    attemptsLeft,
    locked,
    won,
    selected: [...selected],
    history,
    feedbackHtml,
    feedbackKind,
    completed: locked,
  });
  if (locked && onComplete) onComplete(true);
}

function render() {
  const card = document.getElementById("pokemon-card");
  const hint = document.getElementById("pokemon-hint");
  const attempts = document.getElementById("pokemon-attempts");
  const grid = document.getElementById("pokemon-grid");
  const feedback = document.getElementById("pokemon-feedback");
  const actions = document.getElementById("pokemon-actions");
  const historyEl = document.getElementById("pokemon-history");
  const submit = document.getElementById("pokemon-submit");
  const clear = document.getElementById("pokemon-clear");

  if (!dailyPokemon) return;

  const typeCount = dailyPokemon.types.length;

  card.innerHTML = `
    <img src="${dailyPokemon.img}" alt="${dailyPokemon.name}" class="pokemon-img" loading="lazy">
    <h3>${dailyPokemon.name}</h3>
    <p class="pokemon-id">#${String(dailyPokemon.id).padStart(4, "0")}</p>
  `;

  hint.textContent = locked
    ? (won
      ? `Esatto: ${typeLabels(dailyPokemon.types)}`
      : `Era di tipo ${typeLabels(dailyPokemon.types)}`)
    : `Questo Pokémon ha ${typeCount} tip${typeCount === 1 ? "o" : "i"}. Selezionane ${typeCount === 1 ? "1" : "1 o 2"} e conferma.`;

  attempts.textContent = locked
    ? "Partita conclusa per oggi"
    : `Tentativi rimasti: ${attemptsLeft} · Selezionati: ${selected.size}/${Math.min(2, typeCount === 1 ? 1 : 2)}`;

  if (history.length) {
    historyEl.hidden = false;
    historyEl.innerHTML = `
      <p class="guess-history-label">Tentativi precedenti</p>
      <ul>
        ${history.map((h) => `
          <li>
            <span>${h.types.map((t) => TYPE_LABELS_IT[t] || t).join(" + ")}</span>
            <span class="guess-tag guess-tag-${h.hits === h.needed ? "good" : h.hits > 0 ? "partial" : "miss"}">
              ${h.hits}/${h.needed} corretti
            </span>
          </li>
        `).join("")}
      </ul>
    `;
  } else {
    historyEl.hidden = true;
    historyEl.innerHTML = "";
  }

  const maxSelect = typeCount === 1 ? 1 : 2;

  grid.innerHTML = ALL_TYPES.map((t) => `
    <button type="button" class="type-btn ${selected.has(t) ? "selected" : ""}" data-type="${t}" ${locked ? "disabled" : ""}>
      <img src="${TYPE_ICONS[t]}" alt="" width="22" height="22">
      <span>${TYPE_LABELS_IT[t]}</span>
    </button>
  `).join("");

  actions.style.display = locked ? "none" : "flex";
  if (submit) {
    submit.disabled = locked || selected.size === 0 || (typeCount === 1 && selected.size !== 1);
    submit.dataset.maxSelect = String(maxSelect);
  }
  if (clear) clear.disabled = locked || selected.size === 0;

  if (feedbackHtml) {
    feedback.className = `feedback feedback-${feedbackKind || "hint"}`;
    feedback.innerHTML = feedbackHtml;
  } else {
    feedback.className = "feedback";
    feedback.innerHTML = "";
  }
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.getElementById("pokemon-grid")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-type]");
    if (!btn || locked) return;
    const type = btn.dataset.type;
    const maxSelect = dailyPokemon.types.length === 1 ? 1 : 2;

    if (selected.has(type)) {
      selected.delete(type);
    } else {
      if (selected.size >= maxSelect) {
        selected.delete(selected.values().next().value);
      }
      selected.add(type);
    }
    render();
  });

  document.getElementById("pokemon-submit")?.addEventListener("click", submitGuess);
  document.getElementById("pokemon-clear")?.addEventListener("click", () => {
    if (locked) return;
    selected.clear();
    render();
  });
}

function showFeedback(html, kind) {
  feedbackHtml = html;
  feedbackKind = kind;
  const feedback = document.getElementById("pokemon-feedback");
  feedback.className = `feedback feedback-${kind}`;
  feedback.innerHTML = html;
}

function submitGuess() {
  if (locked || selected.size === 0) return;

  const correct = new Set(dailyPokemon.types);
  const guess = new Set(selected);
  const needed = correct.size;

  if (needed === 1 && guess.size !== 1) {
    showFeedback("Questo Pokémon ha un solo tipo: selezionane uno solo.", "hint");
    return;
  }

  if (setsEqual(guess, correct)) {
    locked = true;
    won = true;
    history.push({ types: [...guess], hits: needed, needed });
    showFeedback(`✅ Esatto! ${dailyPokemon.name} è di tipo <strong>${typeLabels(dailyPokemon.types)}</strong>.`, "win");
    persist();
    render();
    return;
  }

  attemptsLeft -= 1;
  const overlap = [...guess].filter((t) => correct.has(t));
  history.push({ types: [...guess], hits: overlap.length, needed });

  if (attemptsLeft <= 0) {
    locked = true;
    won = false;
    showFeedback(
      `❌ Tentativi esauriti. ${dailyPokemon.name} è di tipo <strong>${typeLabels(dailyPokemon.types)}</strong>.`,
      "lose"
    );
    persist();
    render();
    pulseCard();
    return;
  }

  if (overlap.length > 0) {
    showFeedback(
      `Quasi! ${overlap.length} tip${overlap.length === 1 ? "o" : "i"} giust${overlap.length === 1 ? "o" : "i"} su ${needed}. Riprova.`,
      "hint"
    );
  } else {
    showFeedback("Nessun tipo corretto. Riprova!", "hint");
  }

  selected.clear();
  persist();
  render();
  pulseCard();
}

function pulseCard() {
  const card = document.getElementById("pokemon-card");
  if (!card) return;
  card.classList.remove("shake");
  void card.offsetWidth;
  card.classList.add("shake");
}

export function isPokemonComplete() {
  const saved = loadState(STORAGE_KEY, getDailyKey());
  return Boolean(saved?.locked);
}
