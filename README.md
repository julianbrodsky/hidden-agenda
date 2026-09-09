# Hidden Agenda

A word search generator for topics that are too specific for a word search book.

You give it up to ten topics. Claude writes 20 words for each one, and the page
lays them out as puzzles that print two to a sheet: ten topics is five sheets of
US Letter, cut down the dashed line into ten half sheets.

The topics are meant to be narrow. "Yu-Gi-Oh cards" works, but so does one
particular card, one perfume, one album, one episode, one person.

## Running it

Open `index.html`. There is no build step, no dependencies, and no server.

Then pick where the words come from. All three options talk straight from the
page to the address you give them, and whatever you type stays in this
browser's local storage.

### Claude (Anthropic)

Needs a key from [console.anthropic.com](https://console.anthropic.com). Paid,
a few cents for ten puzzles, and clearly the best of the three on the narrow
topics this thing exists for.

### Local model (Ollama)

No key, no account, no bill. Install [Ollama](https://ollama.com), pull a
model, and the app will list whatever you have installed:

```
ollama pull qwen3:8b
```

Serve this page from `localhost` too and it works with no further setup:

```
python3 -m http.server 8000
```

To use it from the GitHub Pages copy instead, Ollama has to be told that origin
is allowed, or it will refuse the request:

```
OLLAMA_ORIGINS=https://julianbrodsky.github.io ollama serve
```

The honest caveat: an 8B model knows the broad topics and gets vague on the
narrow ones. Ask it for "1990s Nickelodeon" and it does fine. Ask it for one
specific fragrance and it will confidently invent notes. Check the words on the
review screen before you print, which is what that screen is for.

### OpenAI-compatible API

For anything that speaks `/v1/chat/completions`: Groq, OpenRouter, Together and
DeepInfra all run open weight models and all have free tiers, and LM Studio,
llama.cpp and vLLM all serve this shape locally. Enter the base URL, the model
name, and a key if the host wants one. Hosted open models are the middle
ground: still free, and much better on narrow topics than anything that fits on
a laptop.

Adding a host that is not in the list means adding it to `connect-src` in
`index.html` as well, or the browser will block the call.

### No model at all

Press **Write my own words** and type the lists by hand. Everything after that
point is identical.

## Printing

US Letter, portrait, scale 100 percent, margins left on Default. The layout is
measured in inches and the preview is the same size as the paper, so what you
see is what comes out.

The sheet is laid out against the printable area rather than against the paper:
the page carries its own 0.5 by 0.4 inch margin and the content is sized to fit
inside it with half an inch to spare. Sizing content to the full 8.5 by 11 only works in a browser that
silently shrinks to fit, and Safari does not, which is how a puzzle ends up
sliced across two sheets. Each puzzle also carries `break-inside: avoid`, so if
the printable area does turn out shorter than expected the puzzle moves to the
next page whole instead of being cut through the middle of the grid.

The word list is a two column CSS grid with an explicit row count rather than
CSS multi-column. Multicol is the obvious tool and is the one thing here Safari
would not print: it laid out the first column and dropped the second. Grid asks
the browser to balance nothing, so there is no algorithm left to disagree
about.

Optionally print answer keys, which come out as a second run of sheets with the
answers ringed. Rings rather than shading, so they survive a black and white
laser printer.

## How it works

- `js/config.js` holds every number in the project: word counts, grid sizes,
  page geometry, the model. Nothing else hard codes a limit.
- `js/providers.js` holds the three ways to get a word list behind one shape,
  so `js/api.js` does not know which one is selected. Each asks for a JSON
  schema in whatever dialect that host speaks.
- `js/api.js` is the only network call. One request per topic, three at a time
  for a hosted API and one at a time for a local model, since a local model is
  using the whole machine for each answer.
- Every provider is asked for 28 words and only the first 20 that survive
  cleaning get printed. A model that loses four words to the rules should still
  leave a full puzzle, and that headroom is most of what makes a smaller open
  weight model usable here.
- The reply is unwrapped leniently: a markdown fence or a "Here is your list:"
  preamble is packaging, not a failure, and a good answer should not be thrown
  away over it.
- `js/words.js` cleans a list: strips accents and punctuation, enforces length,
  and drops any word that contains another word on the list. That last rule is
  the one that matters. If both `DRAGON` and `REDDRAGON` are on the list, a
  solver who circles part of one has legitimately found the other, and the
  puzzle has no defensible answer key.
- `js/grid.js` places the words. It is deterministic given a seed, so the same
  topic reprints the same puzzle and the shuffle button is just a new seed.
  Filler letters are drawn from the letters already on the board rather than
  from the alphabet, because uniform random filler is full of J, Q, X and Z and
  the real words jump straight out of it. After filling, it hunts down any
  place the filler accidentally spelled a word from the list and re-rolls it.
- `js/render.js` builds the sheets. `css/style.css` sizes them in inches.

## Known edges

- A very dense list of twenty words, some long and some three letters, can end
  up with one stray copy of a short word formed where two real answers cross.
  The generator tries 60 boards looking for one without any, and takes the
  cleanest it found rather than dropping a word from the printed list.
- Words longer than 12 letters are rejected before placement. A 15 by 15 grid
  cannot hold much more and still print at a readable size.
