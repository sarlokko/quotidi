import { getDailyKey, msUntilMidnightRome, formatCountdown } from "./daily.js";
import { initPokemonType, isPokemonComplete } from "./pokemon-type.js";
import { initWordle, isWordleComplete } from "./wordle.js";
import { initSudoku, isSudokuComplete } from "./sudoku.js";
import { initPicross, isPicrossComplete } from "./picross.js";
import { initCrossword, isCrosswordComplete } from "./crossword.js";
import { initMovie, isMovieComplete } from "./movie.js";
import { initFact, isFactComplete } from "./fact.js";
import { initGloble, isGlobleComplete } from "./globle.js";
import { initRiddle, isRiddleComplete } from "./riddle.js";
import { initJoke, isJokeComplete } from "./joke.js";

const GAMES = [
  { id: "pokemon", label: "Tipo Pokémon" },
  { id: "wordle", label: "Parola" },
  { id: "sudoku", label: "Sudoku" },
  { id: "picross", label: "Picross" },
  { id: "crossword", label: "Cruciverba" },
  { id: "movie", label: "Film" },
  { id: "fact", label: "Curiosità" },
  { id: "globle", label: "Paese" },
  { id: "riddle", label: "Indovinello" },
  { id: "joke", label: "Barzelletta" },
];

const completionChecks = {
  pokemon: isPokemonComplete,
  wordle: isWordleComplete,
  sudoku: isSudokuComplete,
  picross: isPicrossComplete,
  crossword: isCrosswordComplete,
  movie: isMovieComplete,
  fact: isFactComplete,
  globle: isGlobleComplete,
  riddle: isRiddleComplete,
  joke: isJokeComplete,
};

function updateCountdown() {
  const el = document.getElementById("countdown");
  if (el) el.textContent = formatCountdown(msUntilMidnightRome());
}

function updateProgress() {
  const done = GAMES.filter((g) => completionChecks[g.id]()).length;
  const text = document.getElementById("progress-text");
  const bar = document.getElementById("progress-bar");
  if (text) text.textContent = `${done}/${GAMES.length} completati oggi`;
  if (bar) bar.style.width = `${(done / GAMES.length) * 100}%`;

  GAMES.forEach((g) => {
    const btn = document.querySelector(`[data-tab="${g.id}"]`);
    if (btn) {
      btn.classList.toggle("done", completionChecks[g.id]());
      btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
    }
  });
}

function showTab(id) {
  document.querySelectorAll(".game-panel").forEach((p) => {
    const active = p.id === id;
    p.classList.toggle("active", active);
    p.hidden = !active;
  });
  document.querySelectorAll(".tab-btn").forEach((b) => {
    const active = b.dataset.tab === id;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function bindTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });
}

function showBootError(err) {
  console.error(err);
  const main = document.querySelector(".container");
  if (!main) return;
  const note = document.createElement("p");
  note.className = "boot-error";
  note.textContent = "Qualcosa non ha caricato. Ricarica la pagina.";
  main.prepend(note);
}

async function boot() {
  document.getElementById("today-date").textContent = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  document.querySelectorAll(".game-panel").forEach((p) => {
    p.hidden = !p.classList.contains("active");
  });

  bindTabs();
  updateCountdown();
  setInterval(updateCountdown, 1000);

  const onDone = () => updateProgress();

  try {
    await Promise.all([
      initPokemonType(onDone),
      initWordle(onDone),
      initSudoku(onDone),
      initPicross(onDone),
      initCrossword(onDone),
      initMovie(onDone),
      initFact(onDone),
      initGloble(onDone),
      initRiddle(onDone),
      initJoke(onDone),
    ]);
  } catch (err) {
    showBootError(err);
  }

  updateProgress();

  let lastDay = getDailyKey();
  setInterval(() => {
    const day = getDailyKey();
    if (day !== lastDay) location.reload();
  }, 30000);
}

boot();
