# Quotidì

Sito con **4 minigiochi al giorno** che si resettano a **mezzanotte** (fuso orario Italia):

1. **Tipo Pokémon** — indovina i tipi del Pokémon del giorno (hint sul numero di tipi, storico tentativi, 3 prove)
2. **Parola** — Wordle in italiano (5 lettere, 6 tentativi, animazioni e condivisione risultato)
3. **Indovinello** — risolvi con matching flessibile o rivela la risposta
4. **Barzelletta** — leggi il setup, rivela la punchline e lascia una reazione

## Avvio locale

```bash
npm start
```

Apri http://localhost:3000

## Deploy (GitHub Pages)

Il sito è statico. Il workflow `.github/workflows/pages.yml` pubblica da `main` con **GitHub Actions**.

### Prima attivazione

1. Vai su **Settings → Pages**
2. In **Build and deployment → Source** seleziona **GitHub Actions**
3. Fai push su `main` (o riesegui il workflow *Deploy GitHub Pages*)

Il workflow usa `enablement: true` su `actions/configure-pages`, così al primo run su `main` può abilitare Pages automaticamente se i permessi del repository lo consentono.

URL previsto: https://sarlokko.github.io/quotidi/

> Nota: finché Pages non è abilitato, il workflow fallisce su `configure-pages` e l’URL risponde 404.

## Struttura

```
quotidi/
├── index.html
├── css/style.css
├── js/
│   ├── daily.js
│   ├── pokemon-type.js
│   ├── wordle.js
│   ├── riddle.js
│   ├── joke.js
│   └── main.js
└── data/
    ├── pokemon.json
    ├── words-answers.txt
    ├── words-guesses.txt
    ├── riddles.json
    └── jokes.json
```

## Crediti

- Dati Pokémon e tipi ispirati a [lecartepokemondiluca](https://github.com/sarlokko/lecartepokemondiluca)
- Dizionario parole da [wordle-it](https://github.com/pietroppeter/wordle-it)
