# Quotidì

**Quotidì** — e ti diverti tutti i dì!

Sito con **5 minigiochi al giorno** che si resettano a **mezzanotte** (fuso orario Italia):

1. **Tipo Pokémon** — indovina i tipi del Pokémon del giorno (hint sul numero di tipi, storico tentativi, 3 prove)
2. **Parola** — Wordle in italiano (5 lettere, 6 tentativi, animazioni e condivisione risultato)
3. **Sudoku** — classico 9×9 giornaliero (blocchi 3×3, difficoltà media)
4. **Indovinello** — risolvi con matching flessibile o rivela la risposta
5. **Barzelletta** — leggi il setup, rivela la punchline e lascia una reazione

## Avvio locale

```bash
npm start
```

Apri http://localhost:3000

## GitHub Pages (obbligatorio una volta)

Il sito è statico nella root del repo. **Pages non si può abilitare da Actions** su questo repository (il token non ha permesso di creare il sito Pages), quindi serve un click manuale del proprietario:

1. Apri **[Settings → Pages](https://github.com/sarlokko/quotidi/settings/pages)**
2. In **Build and deployment → Source** scegli **Deploy from a branch**
3. Branch: **`main`** · cartella: **`/ (root)`**
4. Salva

URL: https://sarlokko.github.io/quotidi/

Il file `.nojekyll` è già presente, così GitHub non passa da Jekyll.

> Finché Pages non è abilitato, l’URL sopra risponde 404. Dopo il salvataggio, attendi 1–2 minuti.

## Struttura

```
quotidi/
├── index.html
├── css/style.css
├── js/
│   ├── daily.js
│   ├── pokemon-type.js
│   ├── wordle.js
│   ├── sudoku.js
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
