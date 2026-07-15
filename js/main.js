import { getDailyKey, msUntilMidnightRome, formatCountdown } from "./daily.js";
import { initPokemonType, isPokemonComplete } from "./pokemon-type.js";
import { initWordle, isWordleComplete } from "./wordle.js";
import { initRiddle, isRiddleComplete } from "./riddle.js";
import { initJoke, initJokeEvents, isJokeComplete } from "./joke.js";

const GAMES = [
  { id: "pokemon", label: "Tipo Pokémon", icon: "⚡" },
  { id: "wordle", label: "Parola", icon: "📝" },
  { id: "riddle", label: "Indovinello", icon: "🧩" },
  { id: "joke", label: "Barzelletta", icon: "😄" },
];

const completionChecks = {
  pokemon: isPokemonComplete,
  wordle: isWordleComplete,
  riddle: isRiddleComplete,
  joke: isJokeComplete,
};

function updateCountdown() {
  const el = document.getElementById("countdown");
  el.textContent = formatCountdown(msUntilMidnightRome());
}

function updateProgress() {
  const done = GAMES.filter((g) => completionChecks[g.id]()).length;
  document.getElementById("progress-text").textContent = `${done}/${GAMES.length} completati oggi`;
  document.getElementById("progress-bar").style.width = `${(done / GAMES.length) * 100}%`;

  GAMES.forEach((g) => {
    const btn = document.querySelector(`[data-tab="${g.id}"]`);
    if (btn) btn.classList.toggle("done", completionChecks[g.id]());
  });
}

function showTab(id) {
  document.querySelectorAll(".game-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");
  document.querySelector(`[data-tab="${id}"]`)?.classList.add("active");
}

function bindTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });
}

async function boot() {
  document.getElementById("today-date").textContent = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  bindTabs();
  updateCountdown();
  setInterval(updateCountdown, 1000);

  const onDone = () => updateProgress();

  await Promise.all([
    initPokemonType(onDone),
    initWordle(onDone),
    initRiddle(onDone),
    initJoke(onDone),
  ]);

  initJokeEvents();
  updateProgress();

  let lastDay = getDailyKey();
  setInterval(() => {
    const day = getDailyKey();
    if (day !== lastDay) location.reload();
  }, 30000);
}

boot();
