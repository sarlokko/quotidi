const STORAGE_KEY = "quotid-music";
const VOLUME = 0.28;

let audio = null;
let enabled = false;
let started = false;

function loadPref() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function savePref(on) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

function ensureAudio() {
  if (audio) return audio;
  audio = document.createElement("audio");
  audio.loop = true;
  audio.preload = "metadata";
  audio.volume = VOLUME;
  // Pezzo originale generato per Quotidì (dominio pubblico / senza copyright)
  const mp3 = document.createElement("source");
  mp3.src = "audio/ambient.mp3";
  mp3.type = "audio/mpeg";
  const ogg = document.createElement("source");
  ogg.src = "audio/ambient.ogg";
  ogg.type = "audio/ogg";
  audio.appendChild(mp3);
  audio.appendChild(ogg);
  document.body.appendChild(audio);
  audio.load();
  return audio;
}

function updateButton() {
  const btn = document.getElementById("music-toggle");
  if (!btn) return;
  btn.setAttribute("aria-pressed", enabled ? "true" : "false");
  btn.classList.toggle("is-on", enabled);
  btn.title = enabled ? "Disattiva musica" : "Attiva musica di sottofondo";
  const label = btn.querySelector(".music-label");
  const ico = btn.querySelector(".music-ico");
  if (ico) ico.textContent = enabled ? "🔊" : "🔇";
  if (label) label.textContent = enabled ? "Musica" : "Musica";
}

async function play() {
  const a = ensureAudio();
  try {
    a.volume = VOLUME;
    await a.play();
    started = true;
    enabled = true;
    savePref(true);
    updateButton();
  } catch {
    enabled = false;
    savePref(false);
    updateButton();
  }
}

function pause() {
  if (audio) {
    audio.pause();
  }
  enabled = false;
  savePref(false);
  updateButton();
}

export async function toggleMusic() {
  if (enabled && started && audio && !audio.paused) {
    pause();
    return;
  }
  await play();
}

export function initMusic() {
  enabled = loadPref();
  updateButton();

  document.getElementById("music-toggle")?.addEventListener("click", () => {
    toggleMusic();
  });

  // Se l’utente aveva la musica attiva, riparti al primo gesto (policy browser)
  if (enabled) {
    const resume = () => {
      play();
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
  }
}
