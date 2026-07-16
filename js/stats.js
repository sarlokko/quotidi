import { getDailyKey, loadState } from "./daily.js";

const STREAK_KEY = "quotid-streak";
const SCORE_KEY = "quotid-daily-score";

export const GAME_META = [
  { id: "wordle", label: "Parola", icon: "📝", key: "quotid-wordle" },
  { id: "sudoku", label: "Sudoku", icon: "🔢", key: "quotid-sudoku-9" },
  { id: "picross", label: "Picross", icon: "⬛", key: "quotid-picross-6" },
  { id: "crossword", label: "Cruci", icon: "🔠", key: "quotid-crossword-v2" },
  { id: "movie", label: "Film", icon: "🎬", key: "quotid-movie" },
  { id: "fact", label: "Curiosità", icon: "💡", key: "quotid-fact-v2" },
  { id: "globle", label: "Paese", icon: "🌍", key: "quotid-globle" },
  { id: "riddle", label: "Indovinello", icon: "🧩", key: "quotid-riddle" },
  { id: "pokemon", label: "Pokémon", icon: "⚡", key: "quotid-pokemon" },
  { id: "joke", label: "Barzelletta", icon: "😄", key: "quotid-joke" },
];

export const MAX_SCORE = GAME_META.length * 10;

function shiftDay(dayKey, delta) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function loadStreakRaw() {
  try {
    return JSON.parse(localStorage.getItem(STREAK_KEY) || "null") || {
      current: 0,
      best: 0,
      lastPlayedDay: null,
    };
  } catch {
    return { current: 0, best: 0, lastPlayedDay: null };
  }
}

function saveStreakRaw(data) {
  localStorage.setItem(STREAK_KEY, JSON.stringify(data));
}

/** Chiamare quando c'è almeno un gioco completato oggi. */
export function touchStreak(dayKey = getDailyKey()) {
  const s = loadStreakRaw();
  if (s.lastPlayedDay === dayKey) {
    return { current: s.current || 0, best: s.best || 0 };
  }
  const yesterday = shiftDay(dayKey, -1);
  let current = 1;
  if (s.lastPlayedDay === yesterday) current = (s.current || 0) + 1;
  const best = Math.max(s.best || 0, current);
  saveStreakRaw({ current, best, lastPlayedDay: dayKey });
  return { current, best };
}

export function getStreak(dayKey = getDailyKey()) {
  const s = loadStreakRaw();
  if (!s.lastPlayedDay) return { current: 0, best: 0 };
  if (s.lastPlayedDay === dayKey) return { current: s.current || 0, best: s.best || 0 };
  // Se ieri ha giocato ma oggi non ancora, lo streak è ancora "vivo" fino a fine giornata
  if (s.lastPlayedDay === shiftDay(dayKey, -1)) {
    return { current: s.current || 0, best: s.best || 0, pendingToday: true };
  }
  // Rotto
  return { current: 0, best: s.best || 0 };
}

function state(key, dayKey) {
  return loadState(key, dayKey);
}

/**
 * status: empty | won | lost | done
 * points: 0–10
 * tile: emoji for share row
 */
export function scoreGame(id, dayKey = getDailyKey()) {
  switch (id) {
    case "pokemon": {
      const s = state("quotid-pokemon", dayKey);
      if (!s?.locked) return { status: "empty", points: 0, tile: "⬜" };
      if (s.won) {
        const left = s.attemptsLeft ?? 0;
        return { status: "won", points: 7 + Math.min(3, left), tile: "🟩" };
      }
      return { status: "lost", points: 2, tile: "🟧" };
    }
    case "wordle": {
      const s = state("quotid-wordle", dayKey);
      if (!s?.locked) return { status: "empty", points: 0, tile: "⬜" };
      const guesses = s.guesses || [];
      const won = guesses.some((g) => Array.isArray(g.result) && g.result.length && g.result.every((r) => r === "correct"));
      if (won) {
        const n = guesses.findIndex((g) => g.result.every((r) => r === "correct")) + 1;
        const pts = n <= 1 ? 10 : n === 2 ? 9 : n === 3 ? 8 : n === 4 ? 7 : n === 5 ? 6 : 5;
        return { status: "won", points: pts, tile: "🟩" };
      }
      return { status: "lost", points: 2, tile: "🟧" };
    }
    case "sudoku": {
      const s = state("quotid-sudoku-9", dayKey);
      if (!s?.locked) return { status: "empty", points: 0, tile: "⬜" };
      return s.won
        ? { status: "won", points: 10, tile: "🟩" }
        : { status: "lost", points: 2, tile: "🟧" };
    }
    case "picross": {
      const s = state("quotid-picross-6", dayKey);
      if (!s?.locked) return { status: "empty", points: 0, tile: "⬜" };
      return s.won
        ? { status: "won", points: 10, tile: "🟩" }
        : { status: "lost", points: 2, tile: "🟧" };
    }
    case "crossword": {
      const s = state("quotid-crossword-v2", dayKey);
      if (!s?.locked) return { status: "empty", points: 0, tile: "⬜" };
      return s.won
        ? { status: "won", points: 10, tile: "🟩" }
        : { status: "lost", points: 2, tile: "🟧" };
    }
    case "movie": {
      const s = state("quotid-movie", dayKey);
      if (!s?.locked) return { status: "empty", points: 0, tile: "⬜" };
      if (s.won) {
        const n = (s.guesses || []).length || 1;
        const pts = Math.max(4, 11 - n);
        return { status: "won", points: pts, tile: "🟩" };
      }
      return { status: "lost", points: 2, tile: "🟧" };
    }
    case "fact": {
      const s = state("quotid-fact-v2", dayKey);
      if (!s?.locked) return { status: "empty", points: 0, tile: "⬜" };
      return s.won
        ? { status: "won", points: 10, tile: "🟩" }
        : { status: "lost", points: 4, tile: "🟧" };
    }
    case "globle": {
      const s = state("quotid-globle", dayKey);
      if (!s?.locked) return { status: "empty", points: 0, tile: "⬜" };
      if (s.won) {
        const n = (s.guesses || []).length || 1;
        const pts = Math.max(3, 11 - n);
        return { status: "won", points: pts, tile: "🟩" };
      }
      return { status: "lost", points: 2, tile: "🟧" };
    }
    case "riddle": {
      const s = state("quotid-riddle", dayKey);
      if (!s?.solved && !s?.revealed) return { status: "empty", points: 0, tile: "⬜" };
      if (s.solved) return { status: "won", points: 10, tile: "🟩" };
      return { status: "lost", points: 3, tile: "🟧" };
    }
    case "joke": {
      const s = state("quotid-joke", dayKey);
      if (!s?.revealed) return { status: "empty", points: 0, tile: "⬜" };
      const bonus = s.reaction ? 2 : 0;
      return { status: "done", points: 5 + bonus, tile: "🟨" };
    }
    default:
      return { status: "empty", points: 0, tile: "⬜" };
  }
}

export function getDailyScore(dayKey = getDailyKey()) {
  const games = GAME_META.map((g) => {
    const result = scoreGame(g.id, dayKey);
    return { ...g, ...result };
  });
  const points = games.reduce((sum, g) => sum + g.points, 0);
  const completed = games.filter((g) => g.status !== "empty").length;
  return { dayKey, points, max: MAX_SCORE, completed, total: games.length, games };
}

export function recordDailyActivity(dayKey = getDailyKey()) {
  const score = getDailyScore(dayKey);
  if (score.completed > 0) {
    touchStreak(dayKey);
  }
  const streak = getStreak(dayKey);
  localStorage.setItem(
    SCORE_KEY,
    JSON.stringify({ dayKey, points: score.points, completed: score.completed })
  );
  return { score, streak };
}

function wordleGridEmoji(dayKey) {
  const s = state("quotid-wordle", dayKey);
  if (!s?.guesses?.length) return null;
  return s.guesses
    .map((g) =>
      (g.result || [])
        .map((r) => (r === "correct" ? "🟩" : r === "present" ? "🟨" : "⬛"))
        .join("")
    )
    .join("\n");
}

export function buildShareText(dayKey = getDailyKey()) {
  const { score, streak } = recordDailyActivity(dayKey);
  const lines = [
    `Quotidì ${dayKey}`,
    `🔥 Streak ${streak.current} · record ${streak.best}`,
    `⭐ Punteggio ${score.points}/${score.max} · ${score.completed}/${score.total} giochi`,
    "",
    score.games.map((g) => `${g.icon}${g.tile}`).join(" "),
  ];

  const grid = wordleGridEmoji(dayKey);
  if (grid) {
    lines.push("", "Parola:", grid);
  }

  lines.push("", "https://sarlokko.github.io/quotidi/");
  return lines.join("\n");
}

export async function copyShareText(dayKey = getDailyKey()) {
  const text = buildShareText(dayKey);
  await navigator.clipboard.writeText(text);
  return text;
}
