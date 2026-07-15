import { getDailyKey, pickDailyItem, loadState, saveState, normalizeText } from "./daily.js";

const STORAGE_KEY = "quotid-movie";
const MAX = 6;

let movie = null;
let guesses = [];
let locked = false;
let won = false;
let onComplete = null;
let eventsBound = false;

function matchTitle(guess, title, aliases = []) {
  const g = normalizeText(guess);
  if (!g) return false;
  const opts = [title, ...aliases].map(normalizeText);
  return opts.some((t) => t === g || (t.includes(g) && g.length >= 4) || (g.includes(t) && t.length >= 4));
}

export async function initMovie(onDone) {
  onComplete = onDone;
  const list = await (await fetch("data/movies.json")).json();
  movie = pickDailyItem(getDailyKey(), list, "movie");

  const saved = loadState(STORAGE_KEY, getDailyKey());
  if (saved) {
    guesses = saved.guesses || [];
    locked = Boolean(saved.locked);
    won = Boolean(saved.won);
  }

  document.getElementById("movie-emoji").textContent = movie.emoji;
  render();
  bindEvents();
}

function persist() {
  saveState(STORAGE_KEY, getDailyKey(), { guesses, locked, won, completed: locked });
  if (locked && onComplete) onComplete(true);
}

function render() {
  document.getElementById("movie-emoji").textContent = movie.emoji;
  const list = document.getElementById("movie-guesses");
  list.innerHTML = guesses.map((g) => {
    const ok = matchTitle(g, movie.title, movie.aliases || []);
    return `<li class="${ok ? "is-win" : "is-miss"}">${g}</li>`;
  }).join("");

  const input = document.getElementById("movie-input");
  const btn = document.getElementById("movie-submit");
  const reveal = document.getElementById("movie-reveal");
  input.disabled = locked;
  btn.disabled = locked;
  reveal.disabled = locked;

  const status = document.getElementById("movie-status");
  if (locked && won) {
    status.textContent = `Esatto! Era “${movie.title}”.`;
    status.className = "game-status win";
  } else if (locked) {
    status.textContent = `Era “${movie.title}”.`;
    status.className = "game-status hint";
  } else {
    status.textContent = `Indovina il film (${guesses.length}/${MAX} tentativi).`;
    status.className = "game-status";
  }
}

function submit() {
  if (locked) return;
  const input = document.getElementById("movie-input");
  const guess = input.value.trim();
  if (!guess) return;
  guesses.push(guess);
  input.value = "";

  if (matchTitle(guess, movie.title, movie.aliases || [])) {
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
  document.getElementById("movie-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    submit();
  });
  document.getElementById("movie-reveal")?.addEventListener("click", () => {
    if (locked) return;
    locked = true;
    won = false;
    persist();
    render();
  });
}

export function isMovieComplete() {
  const saved = loadState(STORAGE_KEY, getDailyKey());
  return Boolean(saved?.locked);
}
