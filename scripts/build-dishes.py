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
# Optional `file` pins a specific Commons filename for cleaner photos.
DISHES = [
  # Europe
  {"id": "pizza", "dish": "Pizza Margherita", "country": "Italia", "continent": "Europa", "blurb": "Focaccia tonda cotta in forno con pomodoro, mozzarella e basilico.", "q": "Pizza Margherita"},
  {"id": "croissant", "dish": "Croissant", "country": "Francia", "continent": "Europa", "blurb": "Pasta sfogliata a forma di mezzaluna, tipica della colazione.", "q": "Croissant", "file": "Croissant-Petr_Kratochvil.jpg"},
  {"id": "paella", "dish": "Paella", "country": "Spagna", "continent": "Europa", "blurb": "Riso giallo cotto in padella larga, spesso con frutti di mare o carne.", "q": "Paella"},
  {"id": "moussaka", "dish": "Moussaka", "country": "Grecia", "continent": "Europa", "blurb": "Sformato a strati con melanzane, carne e crema bianca.", "q": "Moussaka"},
  {"id": "schnitzel", "dish": "Wiener Schnitzel", "country": "Austria", "continent": "Europa", "blurb": "Fetta di carne impanata e fritta, spesso con una fetta di limone.", "q": "Wiener Schnitzel"},
  {"id": "bratwurst", "dish": "Bratwurst", "country": "Germania", "continent": "Europa", "blurb": "Salsiccia arrostita, tipica di sagre e mercatini.", "q": "Bratwurst", "file": "Bratwurst, sauerkraut and beer at restaurant Rymy-Eetu.jpg"},
  {"id": "fishchips", "dish": "Fish and chips", "country": "Regno Unito", "continent": "Europa", "blurb": "Pesce in pastella fritta accompagnato da patatine.", "q": "Fish and chips", "file": "Fish_and_chips_blackpool.jpg"},
  {"id": "pastel", "dish": "Pastel de nata", "country": "Portogallo", "continent": "Europa", "blurb": "Cestino di pasta con crema all’uovo e superficie caramellata.", "q": "Pastel de nata"},
  {"id": "moules", "dish": "Moules-frites", "country": "Belgio", "continent": "Europa", "blurb": "Cozze in brodo servite con un piatto di patatine fritte.", "q": "Moules-frites"},
  {"id": "stroopwafel", "dish": "Stroopwafel", "country": "Paesi Bassi", "continent": "Europa", "blurb": "Due cialde sottili con sciroppo caramellato in mezzo.", "q": "Stroopwafel"},
  {"id": "meatballs", "dish": "Köttbullar", "country": "Svezia", "continent": "Europa", "blurb": "Polpette di carne con salsa, purè e confettura di mirtilli rossi.", "q": "Swedish meatballs"},
  {"id": "pierogi", "dish": "Pierogi", "country": "Polonia", "continent": "Europa", "blurb": "Ravioli ripieni di patate, formaggio o carne.", "q": "Pierogi"},
  {"id": "goulash", "dish": "Gulasch", "country": "Ungheria", "continent": "Europa", "blurb": "Stufato di carne al paprika, rosso e speziato.", "q": "Goulash"},
  {"id": "irishstew", "dish": "Irish stew", "country": "Irlanda", "continent": "Europa", "blurb": "Stufato di agnello con patate, carote e cipolle.", "q": "Irish stew", "file": "Irish_Beef_Stew_(34046928633).jpg"},
  {"id": "fondue", "dish": "Fondue al formaggio", "country": "Svizzera", "continent": "Europa", "blurb": "Formaggio fuso in cui si intingono pezzi di pane.", "q": "Fondue"},
  {"id": "borscht", "dish": "Borscht", "country": "Ucraina", "continent": "Europa", "blurb": "Zuppa di barbabietola dal tipico colore rosso.", "q": "Borscht"},
  {"id": "kebab", "dish": "Döner kebab", "country": "Turchia", "continent": "Europa", "blurb": "Carne cotta allo spiedo verticale, in panino o sul piatto.", "q": "Doner kebab", "file": "Doner_on_pilav.jpg"},
  {"id": "sarmale", "dish": "Sarmale", "country": "Romania", "continent": "Europa", "blurb": "Involtini di cavolo ripieni di carne e riso.", "q": "Sarmale"},
  {"id": "svickova", "dish": "Svíčková", "country": "Repubblica Ceca", "continent": "Europa", "blurb": "Manzo in salsa di verdure e panna, con gnocchi di pane.", "q": "Svíčková"},
  # Americas
  {"id": "burger", "dish": "Hamburger", "country": "Stati Uniti", "continent": "Americhe", "blurb": "Panino con polpetta di carne grigliata, spesso con formaggio e salse.", "q": "Hamburger"},
  {"id": "taco", "dish": "Tacos", "country": "Messico", "continent": "Americhe", "blurb": "Tortilla ripiena di carne, verdure e salse.", "q": "Taco"},
  {"id": "feijoada", "dish": "Feijoada", "country": "Brasile", "continent": "Americhe", "blurb": "Stufato di fagioli neri con carne di maiale.", "q": "Feijoada", "file": "Feijoada_à_brasileira.jpg"},
  {"id": "asado", "dish": "Asado", "country": "Argentina", "continent": "Americhe", "blurb": "Grigliata di carni cotte lentamente sulla brace.", "q": "Asado", "file": "Bife_de_chorizo.jpg"},
  {"id": "ceviche", "dish": "Ceviche", "country": "Perù", "continent": "Americhe", "blurb": "Pesce crudo marinato nel succo di agrumi con cipolla e peperoncino.", "q": "Ceviche"},
  {"id": "poutine", "dish": "Poutine", "country": "Canada", "continent": "Americhe", "blurb": "Patatine fritte con cagliata di formaggio e salsa gravy.", "q": "Poutine"},
  {"id": "ropa", "dish": "Ropa vieja", "country": "Cuba", "continent": "Americhe", "blurb": "Manzo sfilacciato in salsa di pomodoro, peperoni e cipolle.", "q": "Ropa vieja", "file": "Cubanfood.jpg"},
  {"id": "bandeja", "dish": "Bandeja paisa", "country": "Colombia", "continent": "Americhe", "blurb": "Piatto abbondante con fagioli, riso, carne, uovo e avocado.", "q": "Bandeja paisa", "file": "Bandeja_paisa,_plato_Colombiano.jpg"},
  {"id": "empanada", "dish": "Empanadas", "country": "Cile", "continent": "Americhe", "blurb": "Fagottini di pasta ripieni, al forno o fritti.", "q": "Empanada"},
  {"id": "arepa", "dish": "Arepa", "country": "Venezuela", "continent": "Americhe", "blurb": "Focaccia di farina di mais, spesso farcita.", "q": "Arepa", "file": "Arepitas_Food_Macro.jpg"},
  # Asia
  {"id": "sushi", "dish": "Sushi", "country": "Giappone", "continent": "Asia", "blurb": "Riso condito con pesce crudo o altri ingredienti.", "q": "Sushi"},
  {"id": "cantonese", "dish": "Riso alla cantonese", "country": "Cina", "continent": "Asia", "blurb": "Riso saltato in padella con uova, verdure e pezzetti di carne o gamberi.", "q": "Yangzhou fried rice"},
  {"id": "biryani", "dish": "Biryani", "country": "India", "continent": "Asia", "blurb": "Riso speziato cotto con carne o verdure e aromi intensi.", "q": "Biryani"},
  {"id": "padthai", "dish": "Pad Thai", "country": "Thailandia", "continent": "Asia", "blurb": "Tagliatelle di riso saltate con uova, tofu o gamberi e arachidi.", "q": "Pad Thai"},
  {"id": "bibimbap", "dish": "Bibimbap", "country": "Corea del Sud", "continent": "Asia", "blurb": "Ciotola di riso con verdure, uovo e salsa piccante, da mescolare.", "q": "Bibimbap"},
  {"id": "pho", "dish": "Phở", "country": "Vietnam", "continent": "Asia", "blurb": "Zuppa di noodles di riso in brodo aromatico con carne.", "q": "Pho"},
  {"id": "nasigoreng", "dish": "Nasi goreng", "country": "Indonesia", "continent": "Asia", "blurb": "Riso fritto speziato, spesso con uovo e ketchup di peperoncino.", "q": "Nasi goreng", "file": "Nasi_Goreng_Kampung_(11967588375).jpg"},
  {"id": "hummus", "dish": "Hummus", "country": "Libano", "continent": "Asia", "blurb": "Crema di ceci con tahina, limone e olio d’oliva.", "q": "Hummus", "file": "Lebanese_style_hummus.jpg"},
  {"id": "adobo", "dish": "Adobo", "country": "Filippine", "continent": "Asia", "blurb": "Carne stufata in aceto, salsa di soia e aglio.", "q": "Philippine adobo"},
  {"id": "nasilemak", "dish": "Nasi lemak", "country": "Malesia", "continent": "Asia", "blurb": "Riso al cocco servito con sambal, arachidi e uovo.", "q": "Nasi lemak"},
  {"id": "chilicrab", "dish": "Chili crab", "country": "Singapore", "continent": "Asia", "blurb": "Granchio in salsa di pomodoro e peperoncino, da mangiare con le mani.", "q": "Chili crab", "file": "Chilli_crab-02.jpg"},
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
  "Repubblica Ceca": ["ceca", "cechia", "cecoslovacchia", "czech", "czech republic", "repubblica ceca"],
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
  "Malesia": ["malaysia", "malaya"],
  "Singapore": ["singapour"],
}


def commons_file_thumb(filename: str, width: int = 900) -> str | None:
  title = filename if filename.startswith("File:") else f"File:{filename}"
  api = "https://commons.wikimedia.org/w/api.php"
  params = {
    "action": "query",
    "format": "json",
    "titles": title,
    "prop": "imageinfo",
    "iiprop": "url",
    "iiurlwidth": str(width),
  }
  url = api + "?" + urllib.parse.urlencode(params)
  req = urllib.request.Request(url, headers={"User-Agent": "QuotidiDishBot/1.0 (github.com/sarlokko/quotidi)"})
  with urllib.request.urlopen(req, timeout=30) as resp:
    data = json.loads(resp.read().decode())
  for page in data.get("query", {}).get("pages", {}).values():
    info = (page.get("imageinfo") or [None])[0]
    if not info:
      continue
    return info.get("thumburl") or info.get("url")
  return None


def commons_thumb(title: str, width: int = 900) -> str | None:
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
      thumb = None
      if item.get("file"):
        try:
          thumb = commons_file_thumb(item["file"])
        except Exception as exc:
          print("  file lookup fail", item["file"], exc)
      if not thumb:
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
        "continent": item["continent"],
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
