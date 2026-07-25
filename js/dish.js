import { getDailyKey, hashString, loadState, saveState, normalizeText } from "./daily.js";

const STORAGE_KEY = "quotid-dish-v2";
const MAX = 6;

let dish = null;
let countries = [];
let guesses = []; // { name, km, heat, sameContinent }
let locked = false;
let won = false;
let onComplete = null;
let eventsBound = false;

/** Ordine deterministico senza ripetizioni fino a fine ciclo. */
function pickDish(dayKey, list) {
  const n = list.length;
  if (!n) return null;
  const [y, m, d] = dayKey.split("-").map(Number);
  const ordinal = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  const order = Array.from({ length: n }, (_, i) => i);
  let h = hashString(`dish-deck-v1:${n}`);
  for (let i = n - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return list[order[((ordinal % n) + n) % n]];
}

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

/** Scala “acqua / fuochino / fuoco” in base alla distanza. */
function heatFromKm(km) {
  if (km <= 0) return { key: "exact", label: "Esatto", cls: "heat-exact" };
  if (km < 400) return { key: "boiling", label: "Bollente", cls: "heat-boiling" };
  if (km < 1000) return { key: "fire", label: "Fuoco", cls: "heat-fire" };
  if (km < 2500) return { key: "ember", label: "Fuochino", cls: "heat-ember" };
  if (km < 5000) return { key: "warm", label: "Acqua fuocherello", cls: "heat-warm" };
  return { key: "cold", label: "Acqua", cls: "heat-cold" };
}

function countryAliases(name) {
  const fromList = countries.find((c) => normalizeText(c.name) === normalizeText(name));
  const extra = dish?.aliases || [];
  return [name, ...(fromList?.aliases || []), ...extra];
}

function matchCountry(guess) {
  const g = normalizeText(typeof guess === "string" ? guess : guess?.name || "");
  if (!g || !dish) return false;
  return countryAliases(dish.country).some((a) => {
    const t = normalizeText(a);
    return t && (t === g || (g.length >= 4 && (t.startsWith(g) || g.startsWith(t))));
  });
}

function findKnownCountry(guess) {
  const g = normalizeText(guess);
  if (!g) return null;
  const exact = countries.find((c) => normalizeText(c.name) === g);
  if (exact) return exact;
  const alias = countries.find((c) => (c.aliases || []).some((a) => normalizeText(a) === g));
  if (alias) return alias;
  if ((dish?.aliases || []).some((a) => normalizeText(a) === g)) {
    return countries.find((c) => normalizeText(c.name) === normalizeText(dish.country)) || {
      name: dish.country,
    };
  }
  if (g.length >= 3) {
    const hits = countries.filter((c) => {
      const name = normalizeText(c.name);
      const aliases = (c.aliases || []).map(normalizeText);
      return name.startsWith(g) || aliases.some((a) => a.startsWith(g));
    });
    if (hits.length === 1) return hits[0];
  }
  return null;
}

function targetCountry() {
  if (!dish) return null;
  return countries.find((c) => normalizeText(c.name) === normalizeText(dish.country)) || null;
}

function buildGuess(country) {
  const target = targetCountry();
  const km =
    target && Number.isFinite(country.lat) && Number.isFinite(country.lng)
      ? haversineKm(country, target)
      : null;
  const heat = heatFromKm(km ?? 99999);
  const sameContinent = Boolean(
    dish?.continent && country.continent && dish.continent === country.continent
  );
  return {
    name: country.name,
    km,
    heat: heat.label,
    heatCls: heat.cls,
    sameContinent,
    continent: dish?.continent || "",
  };
}

export async function initDish(onDone) {
  onComplete = onDone;
  const [list, countryList] = await Promise.all([
    fetch("data/dishes.json?v=20260725dish2").then((r) => r.json()),
    fetch("data/countries.json").then((r) => r.json()),
  ]);
  countries = countryList;
  dish = pickDish(getDailyKey(), list);
  if (!dish?.dish || !dish?.country || !dish?.image) {
    throw new Error("Piatto del giorno non valido");
  }

  const saved = loadState(STORAGE_KEY, getDailyKey());
  guesses = (saved?.guesses || []).map((g) =>
    typeof g === "string"
      ? { name: g, km: null, heat: "—", heatCls: "heat-cold", sameContinent: false, continent: "" }
      : g
  );
  locked = Boolean(saved?.locked);
  won = Boolean(saved?.won);

  const datalist = document.getElementById("dish-list");
  if (datalist) {
    const names = countries.map((c) => c.name).sort((a, b) => a.localeCompare(b, "it"));
    datalist.innerHTML = names.map((n) => `<option value="${n}"></option>`).join("");
  }

  render();
  bindEvents();
  if (locked && onComplete) onComplete(true);
}

function persist() {
  saveState(STORAGE_KEY, getDailyKey(), {
    guesses,
    locked,
    won,
    completed: locked,
  });
  if (locked && onComplete) onComplete(true);
}

function setStatus(text, kind = "") {
  const el = document.getElementById("dish-status");
  if (!el) return;
  el.textContent = text;
  el.className = `game-status${kind ? ` ${kind}` : ""}`;
}

function formatGuessMeta(g) {
  const parts = [];
  if (g.heat) parts.push(`<span class="dish-heat ${g.heatCls || ""}">${g.heat}</span>`);
  if (g.sameContinent && g.continent) {
    parts.push(`<span class="dish-continent">stesso continente (${g.continent})</span>`);
  }
  if (Number.isFinite(g.km)) {
    parts.push(`<span class="dish-km">${g.km.toLocaleString("it-IT")} km</span>`);
  }
  return parts.join(" · ");
}

function render() {
  const img = document.getElementById("dish-image");
  const nameEl = document.getElementById("dish-name");
  const blurb = document.getElementById("dish-blurb");
  const list = document.getElementById("dish-guesses");
  const input = document.getElementById("dish-input");
  const submit = document.getElementById("dish-submit");
  const reveal = document.getElementById("dish-reveal");
  const answer = document.getElementById("dish-answer");
  if (!img || !blurb || !list) return;

  img.src = `${dish.image}${dish.image.includes("?") ? "&" : "?"}v=20260725dish2`;
  img.alt = locked ? `${dish.dish} — ${dish.country}` : "Piatto del giorno da indovinare";
  blurb.textContent = dish.blurb;

  if (nameEl) {
    nameEl.textContent = locked ? dish.dish : "Piatto del giorno";
  }

  list.innerHTML = guesses
    .map((g) => {
      const ok = matchCountry(g);
      const meta = ok ? "" : formatGuessMeta(g);
      return `<li class="${ok ? "is-win" : "is-miss"}">
        <span class="dish-guess-name">${g.name || g}</span>
        ${meta ? `<span class="dish-guess-meta">${meta}</span>` : ""}
      </li>`;
    })
    .join("");

  if (input) input.disabled = locked;
  if (submit) submit.disabled = locked;
  if (reveal) reveal.disabled = locked;

  if (answer) {
    if (locked) {
      answer.hidden = false;
      answer.textContent = `${dish.dish} · ${dish.country}`;
    } else {
      answer.hidden = true;
      answer.textContent = "";
    }
  }

  if (locked && won) {
    setStatus(`Giusto! È ${dish.dish} (${dish.country}).`, "win");
  } else if (locked) {
    setStatus(`Era ${dish.dish}, tipico di: ${dish.country}.`, "hint");
  } else {
    const last = guesses[guesses.length - 1];
    if (last && !matchCountry(last)) {
      const bits = [last.heat];
      if (last.sameContinent && last.continent) bits.push(`continente: ${last.continent}`);
      if (Number.isFinite(last.km)) bits.push(`${last.km.toLocaleString("it-IT")} km`);
      setStatus(`${bits.join(" · ")}. Tentativi ${guesses.length}/${MAX}.`, "hint");
    } else {
      setStatus(`Di che paese è questo piatto? Tentativi ${guesses.length}/${MAX}.`);
    }
  }
}

function submit() {
  if (locked || !dish) return;
  const input = document.getElementById("dish-input");
  const raw = input?.value.trim() || "";
  if (!raw) {
    setStatus("Scrivi un paese prima.", "hint");
    return;
  }

  const known = findKnownCountry(raw);
  if (!known) {
    setStatus("Paese non riconosciuto. Prova un nome completo (es. Italia).", "hint");
    input?.select();
    return;
  }

  const label = known.name;
  if (guesses.some((g) => normalizeText(g.name || g) === normalizeText(label))) {
    setStatus("Hai già provato questo paese.", "hint");
    input.select();
    return;
  }

  // Enrich country with continent from dish list mapping when countries.json lacks it
  const guessCountry = {
    ...known,
    continent: known.continent || continentOf(known.name),
  };
  guesses.push(buildGuess(guessCountry));
  if (input) input.value = "";

  if (matchCountry(label)) {
    locked = true;
    won = true;
  } else if (guesses.length >= MAX) {
    locked = true;
    won = false;
  }
  persist();
  render();
}

function continentOf(name) {
  const n = normalizeText(name);
  const map = CONTINENT_BY_COUNTRY;
  for (const [continent, list] of Object.entries(map)) {
    if (list.some((c) => normalizeText(c) === n)) return continent;
  }
  return "";
}

const CONTINENT_BY_COUNTRY = {
  Europa: [
    "Italia", "Francia", "Spagna", "Grecia", "Austria", "Germania", "Regno Unito",
    "Portogallo", "Belgio", "Paesi Bassi", "Svezia", "Polonia", "Ungheria", "Irlanda",
    "Svizzera", "Ucraina", "Turchia", "Romania", "Repubblica Ceca", "Norvegia", "Danimarca",
    "Finlandia", "Islanda", "Croazia", "Serbia", "Bulgaria", "Slovacchia", "Slovenia",
    "Albania", "Bosnia ed Erzegovina", "Macedonia del Nord", "Montenegro", "Kosovo",
    "Estonia", "Lettonia", "Lituania", "Moldavia", "Bielorussia", "Lussemburgo", "Malta",
    "Cipro", "Andorra", "Monaco", "San Marino", "Città del Vaticano", "Liechtenstein",
  ],
  Americhe: [
    "Stati Uniti", "Messico", "Brasile", "Argentina", "Perù", "Canada", "Cuba", "Colombia",
    "Cile", "Venezuela", "Uruguay", "Paraguay", "Bolivia", "Ecuador", "Panama", "Costa Rica",
    "Guatemala", "Honduras", "El Salvador", "Nicaragua", "Belize", "Giamaica", "Haiti",
    "Repubblica Dominicana", "Trinidad e Tobago", "Bahamas", "Barbados", "Guyana", "Suriname",
  ],
  Asia: [
    "Giappone", "Cina", "India", "Thailandia", "Corea del Sud", "Vietnam", "Indonesia",
    "Libano", "Filippine", "Malaysia", "Singapore", "Corea del Nord", "Taiwan", "Mongolia",
    "Pakistan", "Bangladesh", "Sri Lanka", "Nepal", "Bhutan", "Myanmar", "Cambogia", "Laos",
    "Brunei", "Timor Est", "Afghanistan", "Iran", "Iraq", "Siria", "Giordania", "Israele",
    "Palestina", "Arabia Saudita", "Emirati Arabi Uniti", "Qatar", "Kuwait", "Oman", "Yemen",
    "Bahrein", "Georgia", "Armenia", "Azerbaigian", "Kazakistan", "Uzbekistan", "Turkmenistan",
    "Kirghizistan", "Tagikistan", "Malesia", "Malaysia",
  ],
  Africa: [
    "Egitto", "Marocco", "Tunisia", "Algeria", "Libia", "Sudan", "Etiopia", "Kenya",
    "Tanzania", "Uganda", "Nigeria", "Ghana", "Senegal", "Sudafrica", "Zimbabwe", "Botswana",
    "Namibia", "Mozambico", "Angola", "Camerun", "Costa d'Avorio", "Mali", "Niger", "Ciad",
  ],
  Oceania: [
    "Australia", "Nuova Zelanda", "Figi", "Papua Nuova Guinea", "Samoa", "Tonga",
  ],
};

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;
  document.getElementById("dish-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    submit();
  });
  document.getElementById("dish-reveal")?.addEventListener("click", () => {
    if (locked) return;
    locked = true;
    won = false;
    persist();
    render();
  });
}

export function isDishComplete() {
  const saved = loadState(STORAGE_KEY, getDailyKey());
  return Boolean(saved?.locked);
}
