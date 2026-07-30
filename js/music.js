const STORAGE_KEY = "quotid-music";
const VOLUME = 0.28;

let audio = null;
let enabled = true;
let started = false;
let waitingGesture = false;

/** Default: musica ON. Solo "off" esplicito la spegne. */
function loadPref() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "off") return false;
    return true;
  } catch {
    return true;
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
  audio.preload = "auto";
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
  const ico = btn.querySelector(".music-ico");
  if (ico) ico.textContent = enabled ? "🔊" : "🔇";
}

function armGestureResume() {
  if (waitingGesture || !enabled) return;
  waitingGesture = true;
  const resume = () => {
    waitingGesture = false;
    window.removeEventListener("pointerdown", resume);
    window.removeEventListener("keydown", resume);
    window.removeEventListener("touchstart", resume);
    if (enabled) play();
  };
  window.addEventListener("pointerdown", resume, { once: true });
  window.addEventListener("keydown", resume, { once: true });
  window.addEventListener("touchstart", resume, { once: true, passive: true });
}

async function play() {
  const a = ensureAudio();
  enabled = true;
  savePref(true);
  updateButton();
  try {
    a.volume = VOLUME;
    await a.play();
    started = true;
    waitingGesture = false;
    updateButton();
  } catch {
    // Browser blocca l’autoplay: resta “attiva”, parte al primo tocco
    started = false;
    armGestureResume();
    updateButton();
  }
}

function pause() {
  if (audio) {
    audio.pause();
  }
  enabled = false;
  started = false;
  waitingGesture = false;
  savePref(false);
  updateButton();
}

export async function toggleMusic() {
  if (enabled && audio && !audio.paused) {
    pause();
    return;
  }
  if (enabled && started && audio && audio.paused) {
    // Preferenza on ma in pausa → riprova play
    await play();
    return;
  }
  if (enabled && !started) {
    await play();
    return;
  }
  // era off
  await play();
}

export function initMusic() {
  enabled = loadPref();
  updateButton();

  document.getElementById("music-toggle")?.addEventListener("click", () => {
    toggleMusic();
  });

  if (enabled) {
    // Parte subito; se il browser blocca, riparte al primo gesto
    play();
  }
}
