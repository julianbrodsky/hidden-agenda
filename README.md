# Hidden Agenda

A word search generator for topics that are too specific for a word search book.

You give it up to ten topics. Claude writes 20 words for each one, and the page
lays them out as puzzles that print two to a sheet: ten topics is five sheets of
US Letter, cut down the dashed line into ten half sheets.

The topics are meant to be narrow. "Yu-Gi-Oh cards" works, but so does one
particular card, one perfume, one album, one episode, one person.

## Running it

Open `index.html`. There is no build step, no dependencies, and no server.

Word generation needs an Anthropic API key from
[console.anthropic.com](https://console.anthropic.com). It is kept in this
browser's local storage and sent directly to Anthropic, because there is no
back end here to send it anywhere else. A run of ten topics costs a few cents.

You can also skip the key entirely, press **Write my own words**, and type the
lists by hand. Everything after that point is identical.

## Printing

Print at 100 percent on US Letter, portrait, with margins set to none or
minimum. The layout is measured in inches and the preview is the same size as
the paper, so what you see is what comes out.

Optionally print answer keys, which come out as a second run of sheets with the
answers ringed. Rings rather than shading, so they survive a black and white
laser printer.

## How it works

- `js/config.js` holds every number in the project: word counts, grid sizes,
  page geometry, the model. Nothing else hard codes a limit.
- `js/api.js` is the only network call. One request per topic, three at a time,
  with a JSON schema so the answer cannot come back as prose.
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
