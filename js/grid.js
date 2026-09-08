// Word placement. The whole file is deterministic given a seed, so the same
// topic reprints the same puzzle and a "shuffle" is just a new seed rather
// than a different code path.

import { CONFIG, DIRECTIONS } from './config.js';
import { longestLength } from './words.js';

// mulberry32. Small, fast, and good enough that placements do not visibly
// cluster. Math.random would work but could not be reproduced.
function makeRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffle(items, random) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// Every legal spot for one word on the current board, as (row, col, direction).
// Built fresh per word because earlier placements change what is legal.
function candidatesFor(cells, size, word) {
  const found = [];
  for (const [dr, dc] of DIRECTIONS) {
    const lastRow = (size - 1) - Math.max(0, dr * (word.length - 1));
    const firstRow = -Math.min(0, dr * (word.length - 1));
    const lastCol = (size - 1) - Math.max(0, dc * (word.length - 1));
    const firstCol = -Math.min(0, dc * (word.length - 1));

    for (let r = firstRow; r <= lastRow; r += 1) {
      for (let c = firstCol; c <= lastCol; c += 1) {
        let overlaps = 0;
        let fits = true;
        for (let i = 0; i < word.length; i += 1) {
          const existing = cells[(r + dr * i) * size + (c + dc * i)];
          if (existing === '') continue;
          if (existing !== word[i]) { fits = false; break; }
          overlaps += 1;
        }
        // A word laid entirely on top of another word is not a placement, it is
        // a duplicate, and the solver would find one circle for two answers.
        if (fits && overlaps < word.length) found.push({ r, c, dr, dc, overlaps });
      }
    }
  }
  return found;
}

// Crossings are what make a word search feel woven rather than stacked, so a
// placement that shares letters wins a coin flip against one that does not.
function pickCandidate(candidates, random) {
  const crossing = candidates.filter((p) => p.overlaps > 0);
  const pool = crossing.length && random() < 0.65 ? crossing : candidates;
  return pool[Math.floor(random() * pool.length)];
}

function tryLayout(words, size, random) {
  const cells = new Array(size * size).fill('');
  const placements = [];

  // Longest first. The long words are the ones with almost nowhere to go, and
  // placing them last is the single biggest cause of a failed board.
  for (const word of [...words].sort((a, b) => b.length - a.length)) {
    const candidates = candidatesFor(cells, size, word);
    if (!candidates.length) return null;

    const spot = pickCandidate(candidates, random);
    for (let i = 0; i < word.length; i += 1) {
      cells[(spot.r + spot.dr * i) * size + (spot.c + spot.dc * i)] = word[i];
    }
    placements.push({ word, ...spot });
  }

  return { cells, placements };
}

// Filler drawn from the letters already on the board rather than from the
// alphabet. Uniform random filler is full of J, Q, X and Z, which makes the
// real words stand out at a glance and gives the puzzle away.
function fillBlanks(cells, placements, random) {
  const bag = placements.map((p) => p.word).join('') || 'ETAOINSRHLDCUMFPGWYBVKXJQZ';
  const filled = cells.slice();
  for (let i = 0; i < filled.length; i += 1) {
    if (filled[i] === '') filled[i] = bag[Math.floor(random() * bag.length)];
  }
  return filled;
}

// Every place the grid reads as `word`, in all eight directions.
function occurrencesOf(cells, size, word) {
  const found = [];
  for (const [dr, dc] of DIRECTIONS) {
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        const endRow = r + dr * (word.length - 1);
        const endCol = c + dc * (word.length - 1);
        if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) continue;

        const path = [];
        let match = true;
        for (let i = 0; i < word.length; i += 1) {
          const idx = (r + dr * i) * size + (c + dc * i);
          if (cells[idx] !== word[i]) { match = false; break; }
          path.push(idx);
        }
        if (match) found.push({ r, c, dr, dc, path });
      }
    }
  }
  return found;
}

// Random filler spells real words by accident, and a second copy of RARE
// sitting in the noise means two honest solvers circle two different answers.
// Any stray copy with at least one filler cell gets that cell re-rolled.
//
// Returns how many strays survived. A stray made entirely of placed letters is
// two real answers crossing into a third, which no amount of re-rolling can
// touch; the caller reshuffles the board instead of accepting it.
function scrubAccidents(cells, size, placements, random) {
  const intended = new Set(placements.map((p) => `${p.r},${p.c},${p.dr},${p.dc}`));
  const locked = new Set();
  for (const p of placements) for (const i of placementCells(p, size)) locked.add(i);

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let stubborn = 0;

  // Bounded because one fix can spell something new. In practice it settles in
  // a pass or two, and the cap only stops a pathological list from hanging.
  for (let pass = 0; pass < 12; pass += 1) {
    stubborn = 0;
    let fixed = 0;

    for (const { word } of placements) {
      for (const spot of occurrencesOf(cells, size, word)) {
        if (intended.has(`${spot.r},${spot.c},${spot.dr},${spot.dc}`)) continue;

        const movable = spot.path.filter((idx) => !locked.has(idx));
        if (!movable.length) { stubborn += 1; continue; }

        const target = movable[Math.floor(random() * movable.length)];
        let replacement = cells[target];
        while (replacement === cells[target]) {
          replacement = alphabet[Math.floor(random() * alphabet.length)];
        }
        cells[target] = replacement;
        fixed += 1;
      }
    }

    if (!fixed) break;
  }

  return stubborn;
}

// Grows the grid only when a size genuinely cannot hold the list, so a puzzle
// is never printed larger, and therefore smaller lettered, than it needs to be.
//
// Within a size it keeps reshuffling in search of a board with no stray copies,
// and settles for the cleanest board it saw rather than dropping a word. A
// dense grid of twenty words will sometimes cross two answers into a third, and
// losing a word off the printed list is the worse outcome by a wide margin.
export function buildPuzzle(words, seed) {
  const random = makeRandom(seed);
  const floor = Math.max(CONFIG.GRID_MIN, longestLength(words));
  const start = Math.max(floor, CONFIG.GRID_START);
  let best = null;

  for (let size = start; size <= CONFIG.GRID_MAX; size += 1) {
    let placeable = false;

    for (let attempt = 0; attempt < CONFIG.PLACEMENT_ATTEMPTS; attempt += 1) {
      const layout = tryLayout(shuffle([...words], random), size, random);
      if (!layout) continue;
      placeable = true;

      const cells = fillBlanks(layout.cells, layout.placements, random);
      const strays = scrubAccidents(cells, size, layout.placements, random);
      const puzzle = { size, cells, placements: layout.placements, strays, unplaced: [] };

      if (strays === 0) return puzzle;
      if (!best || strays < best.strays) best = puzzle;
    }

    // A clean board is worth a slightly bigger grid, but only if this size
    // could hold the words at all. If it could, the fallback is already good.
    if (placeable && best) return best;
  }

  if (best) return best;

  // Nothing fits even at the largest printable grid, which means one word is
  // simply too long for the page. Drop it and say so rather than fail.
  const trimmed = [...words].sort((a, b) => b.length - a.length);
  const dropped = trimmed.shift();
  if (!trimmed.length) throw new Error('No words to place');
  const result = buildPuzzle(trimmed, seed + 1);
  result.unplaced = [dropped, ...result.unplaced];
  return result;
}

// The cell indexes a word occupies, for the answer key overlay.
export function placementCells(placement, size) {
  const out = [];
  for (let i = 0; i < placement.word.length; i += 1) {
    out.push((placement.r + placement.dr * i) * size + (placement.c + placement.dc * i));
  }
  return out;
}
