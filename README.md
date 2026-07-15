# Quotidì

Sito con **4 minigiochi al giorno** che si resettano a **mezzanotte** (fuso orario Italia):

1. **Tipo Pokémon** — indovina uno o due tipi del Pokémon del giorno (3 tentativi)
2. **Parola** — Wordle in italiano (5 lettere, 6 tentativi)
3. **Indovinello** — risolvi o rivela la risposta
4. **Barzelletta** — leggi e rivela la punchline

## Avvio locale

```bash
npm start
```

Apri http://localhost:3000

## Deploy

Il sito è statico e funziona su **GitHub Pages**.

Dopo il push su `main`, abilita Pages da:
**Settings → Pages → Deploy from branch → main / root**

URL: https://sarlokko.github.io/quotid-/

## Struttura

```
quotid-/
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
