const TIMEZONE = "Europe/Rome";

export function getDailyKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pickDailyIndex(dayKey, count, salt = "") {
  if (count <= 0) return 0;
  return hashString(`${dayKey}:${salt}`) % count;
}

export function pickDailyItem(dayKey, items, salt = "") {
  return items[pickDailyIndex(dayKey, items.length, salt)];
}

export function msUntilMidnightRome() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(now);

  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  const h = get("hour");
  const m = get("minute");
  const s = get("second");
  const elapsed = ((h * 60 + m) * 60 + s) * 1000;
  return 24 * 60 * 60 * 1000 - elapsed;
}

export function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function loadState(key, dayKey) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.dayKey !== dayKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(key, dayKey, data) {
  localStorage.setItem(key, JSON.stringify({ dayKey, ...data }));
}

export function normalizeText(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
