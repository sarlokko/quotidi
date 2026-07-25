#!/usr/bin/env python3
"""Build data/dishes.json and download dish images from Wikimedia Commons."""

from __future__ import annotations

import json
import subprocess
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_JSON = ROOT / "data" / "dishes.json"
IMG_DIR = ROOT / "img" / "dishes"

# Famous, recognizable dishes — one per country (Europe / Americas / Asia).
DISHES = [
  # Europe
  {"id": "pizza", "dish": "Pizza Margherita", "country": "Italia", "blurb": "Focaccia tonda cotta in forno con pomodoro, mozzarella e basilico.", "q": "Pizza Margherita"},
  {"id": "croissant", "dish": "Croissant", "country": "Francia", "blurb": "Pasta sfogliata a forma di mezzaluna, tipica della colazione.", "q": "Croissant"},
  {"id": "paella", "dish": "Paella", "country": "Spagna", "blurb": "Riso giallo cotto in padella larga, spesso con frutti di mare o carne.", "q": "Paella"},
  {"id": "moussaka", "dish": "Moussaka", "country": "Grecia", "blurb": "Sformato a strati con melanzane, carne e crema bianca.", "q": "Moussaka"},
  {"id": "schnitzel", "dish": "Wiener Schnitzel", "country": "Austria", "blurb": "Fetta di carne impanata e fritta, spesso con una fetta di limone.", "q": "Wiener Schnitzel"},
  {"id": "bratwurst", "dish": "Bratwurst", "country": "Germania", "blurb": "Salsiccia arrostita, tipica di sagre e mercatini.", "q": "Bratwurst"},
  {"id": "fishchips", "dish": "Fish and chips", "country": "Regno Unito", "blurb": "Pesce in pastella fritta accompagnato da patatine.", "q": "Fish and chips"},
  {"id": "pastel", "dish": "Pastel de nata", "country": "Portogallo", "blurb": "Cestino di pasta con crema all’uovo e superficie caramellata.", "q": "Pastel de nata"},
  {"id": "moules", "dish": "Moules-frites", "country": "Belgio", "blurb": "Cozze in brodo servite con un piatto di patatine fritte.", "q": "Moules-frites"},
  {"id": "stroopwafel", "dish": "Stroopwafel", "country": "Paesi Bassi", "blurb": "Due cialde sottili con sciroppo caramellato in mezzo.", "q": "Stroopwafel"},
  {"id": "meatballs", "dish": "Köttbullar", "country": "Svezia", "blurb": "Polpette di carne con salsa, purè e confettura di mirtilli rossi.", "q": "Swedish meatballs"},
  {"id": "pierogi", "dish": "Pierogi", "country": "Polonia", "blurb": "Ravioli ripieni di patate, formaggio o carne.", "q": "Pierogi"},
  {"id": "goulash", "dish": "Gulasch", "country": "Ungheria", "blurb": "Stufato di carne al paprika, rosso e speziato.", "q": "Goulash"},
  {"id": "irishstew", "dish": "Irish stew", "country": "Irlanda", "blurb": "Stufato di agnello con patate, carote e cipolle.", "q": "Irish stew"},
  {"id": "fondue", "dish": "Fondue al formaggio", "country": "Svizzera", "blurb": "Formaggio fuso in cui si intingono pezzi di pane.", "q": "Fondue"},
  {"id": "borscht", "dish": "Borscht", "country": "Ucraina", "blurb": "Zuppa di barbabietola dal tipico colore rosso.", "q": "Borscht"},
  {"id": "kebab", "dish": "Döner kebab", "country": "Turchia", "blurb": "Carne cotta allo spiedo verticale, in panino o sul piatto.", "q": "Doner kebab"},
  {"id": "sarmale", "dish": "Sarmale", "country": "Romania", "blurb": "Involtini di cavolo ripieni di carne e riso.", "q": "Sarmale"},
  {"id": "svickova", "dish": "Svíčková", "country": "Repubblica Ceca", "blurb": "Manzo in salsa di verdure e panna, con gnocchi di pane.", "q": "Svíčková"},
  # Americas
  {"id": "burger", "dish": "Hamburger", "country": "Stati Uniti", "blurb": "Panino con polpetta di carne grigliata, spesso con formaggio e salse.", "q": "Hamburger"},
  {"id": "taco", "dish": "Tacos", "country": "Messico", "blurb": "Tortilla ripiena di carne, verdure e salse.", "q": "Taco"},
  {"id": "feijoada", "dish": "Feijoada", "country": "Brasile", "blurb": "Stufato di fagioli neri con carne di maiale.", "q": "Feijoada"},
  {"id": "asado", "dish": "Asado", "country": "Argentina", "blurb": "Grigliata di carni cotte lentamente sulla brace.", "q": "Asado"},
  {"id": "ceviche", "dish": "Ceviche", "country": "Perù", "blurb": "Pesce crudo marinato nel succo di agrumi con cipolla e peperoncino.", "q": "Ceviche"},
  {"id": "poutine", "dish": "Poutine", "country": "Canada", "blurb": "Patatine fritte con cagliata di formaggio e salsa gravy.", "q": "Poutine"},
  {"id": "ropa", "dish": "Ropa vieja", "country": "Cuba", "blurb": "Manzo sfilacciato in salsa di pomodoro, peperoni e cipolle.", "q": "Ropa vieja"},
  {"id": "bandeja", "dish": "Bandeja paisa", "country": "Colombia", "blurb": "Piatto abbondante con fagioli, riso, carne, uovo e avocado.", "q": "Bandeja paisa"},
  {"id": "empanada", "dish": "Empanadas", "country": "Cile", "blurb": "Fagottini di pasta ripieni, al forno o fritti.", "q": "Empanada"},
  {"id": "arepa", "dish": "Arepa", "country": "Venezuela", "blurb": "Focaccia di farina di mais, spesso farcita.", "q": "Arepa"},
  # Asia
  {"id": "sushi", "dish": "Sushi", "country": "Giappone", "blurb": "Riso condito con pesce crudo o altri ingredienti.", "q": "Sushi"},
  {"id": "cantonese", "dish": "Riso alla cantonese", "country": "Cina", "blurb": "Riso saltato in padella con uova, verdure e pezzetti di carne o gamberi.", "q": "Yangzhou fried rice"},
  {"id": "biryani", "dish": "Biryani", "country": "India", "blurb": "Riso speziato cotto con carne o verdure e aromi intensi.", "q": "Biryani"},
  {"id": "padthai", "dish": "Pad Thai", "country": "Thailandia", "blurb": "Tagliatelle di riso saltate con uova, tofu o gamberi e arachidi.", "q": "Pad Thai"},
  {"id": "bibimbap", "dish": "Bibimbap", "country": "Corea del Sud", "blurb": "Ciotola di riso con verdure, uovo e salsa piccante, da mescolare.", "q": "Bibimbap"},
  {"id": "pho", "dish": "Phở", "country": "Vietnam", "blurb": "Zuppa di noodles di riso in brodo aromatico con carne.", "q": "Pho"},
  {"id": "nasigoreng", "dish": "Nasi goreng", "country": "Indonesia", "blurb": "Riso fritto speziato, spesso con uovo e ketchup di peperoncino.", "q": "Nasi goreng"},
  {"id": "hummus", "dish": "Hummus", "country": "Libano", "blurb": "Crema di ceci con tahina, limone e olio d’oliva.", "q": "Hummus"},
  {"id": "adobo", "dish": "Adobo", "country": "Filippine", "blurb": "Carne stufata in aceto, salsa di soia e aglio.", "q": "Philippine adobo"},
  {"id": "nasilemak", "dish": "Nasi lemak", "country": "Malaysia", "blurb": "Riso al cocco servito con sambal, arachidi e uovo.", "q": "Nasi lemak"},
  {"id": "chilicrab", "dish": "Chili crab", "country": "Singapore", "blurb": "Granchio in salsa di pomodoro e peperoncino, da mangiare con le mani.", "q": "Chili crab"},
]

# Extra aliases for country matching beyond countries.json
COUNTRY_ALIASES = {
  "Italia": ["italy", "italiano"],
  "Francia": ["france"],
  "Spagna": ["spain", "españa", "espana"],
  "Grecia": ["greece"],
  "Austria": [],
  "Germania": ["germany", "deutschland"],
  "Regno Unito": ["uk", "inghilterra", "gran bretagna", "great britain", "england", "united kingdom"],
  "Portogallo": ["portugal"],
  "Belgio": ["belgium"],
  "Paesi Bassi": ["olanda", "netherlands", "holland"],
  "Svezia": ["sweden"],
  "Polonia": ["poland"],
  "Ungheria": ["hungary"],
  "Irlanda": ["ireland"],
  "Svizzera": ["switzerland"],
  "Ucraina": ["ukraine"],
  "Turchia": ["turkey", "turkiye", "türkiye"],
  "Romania": [],
  "Cechia": ["repubblica ceca", "czech republic", "czech", "cecoslovacchia"],
  "Stati Uniti": ["usa", "america", "united states", "stati uniti d'america", "us"],
  "Messico": ["mexico"],
  "Brasile": ["brazil"],
  "Argentina": [],
  "Perù": ["peru", "perù"],
  "Canada": [],
  "Cuba": [],
  "Colombia": ["columbia"],
  "Cile": ["chile"],
  "Venezuela": [],
  "Giappone": ["japan"],
  "Cina": ["china", "prc"],
  "India": [],
  "Thailandia": ["thailand", "tailandia"],
  "Corea del Sud": ["corea", "korea", "south korea", "corea sud"],
  "Vietnam": ["viet nam"],
  "Indonesia": [],
  "Libano": ["lebanon"],
  "Filippine": ["philippines"],
  "Malaysia": ["malesia", "malaya"],
  "Singapore": ["singapour"],
}


def commons_thumb(title: str, width: int = 640) -> str | None:
  api = "https://commons.wikimedia.org/w/api.php"
  params = {
    "action": "query",
    "format": "json",
    "generator": "search",
    "gsrsearch": title,
    "gsrnamespace": "6",
    "gsrlimit": "5",
    "prop": "imageinfo",
    "iiprop": "url",
    "iiurlwidth": str(width),
  }
  url = api + "?" + urllib.parse.urlencode(params)
  req = urllib.request.Request(url, headers={"User-Agent": "QuotidiDishBot/1.0 (github.com/sarlokko/quotidi)"})
  with urllib.request.urlopen(req, timeout=30) as resp:
    data = json.loads(resp.read().decode())
  pages = data.get("query", {}).get("pages", {})
  for page in pages.values():
    info = (page.get("imageinfo") or [None])[0]
    if not info:
      continue
    thumb = info.get("thumburl") or info.get("url")
    if thumb and any(thumb.lower().endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".webp")):
      return thumb
  return None


def download(url: str, dest: Path) -> bool:
  dest.parent.mkdir(parents=True, exist_ok=True)
  tmp = dest.with_suffix(dest.suffix + ".tmp")
  req = urllib.request.Request(url, headers={"User-Agent": "QuotidiDishBot/1.0 (github.com/sarlokko/quotidi)"})
  try:
    with urllib.request.urlopen(req, timeout=45) as resp, open(tmp, "wb") as f:
      f.write(resp.read())
  except Exception as exc:
    print("download fail", url, exc)
    if tmp.exists():
      tmp.unlink()
    return False
  # compress/resize with ffmpeg
  try:
    subprocess.run(
      [
        "ffmpeg", "-y", "-i", str(tmp),
        "-vf", "scale='min(900,iw)':-1",
        "-q:v", "5",
        str(dest),
      ],
      check=True,
      stdout=subprocess.DEVNULL,
      stderr=subprocess.DEVNULL,
    )
    tmp.unlink(missing_ok=True)
    return dest.exists() and dest.stat().st_size > 1000
  except Exception as exc:
    print("ffmpeg fail", dest, exc)
    tmp.rename(dest)
    return dest.exists()


def main() -> None:
  IMG_DIR.mkdir(parents=True, exist_ok=True)
  out = []
  for item in DISHES:
    if not item or not item.get("id") or item.get("id") == "paella_skip":
      continue
    img_name = f"{item['id']}.jpg"
    img_path = IMG_DIR / img_name
    if not img_path.exists() or img_path.stat().st_size < 1000:
      print("fetch", item["dish"], "…")
      thumb = commons_thumb(item["q"])
      if not thumb:
        print("  NO IMAGE for", item["q"])
        continue
      ok = download(thumb, img_path)
      print(" ", "ok" if ok else "fail", thumb[:80])
      time.sleep(0.35)
    else:
      print("have", img_name)

    out.append(
      {
        "id": item["id"],
        "dish": item["dish"],
        "country": item["country"],
        "blurb": item["blurb"],
        "image": f"img/dishes/{img_name}",
        "aliases": COUNTRY_ALIASES.get(item["country"], []),
      }
    )

  OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
  print("wrote", OUT_JSON, "count", len(out))
  missing = [d for d in out if not (ROOT / d["image"]).exists()]
  print("missing files", len(missing))


if __name__ == "__main__":
  main()
