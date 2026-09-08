// Turning whatever came back from the model, or whatever was typed by hand,
// into a list a word search can actually use.

import { CONFIG } from './config.js';

// Strips accents so CAFÉ becomes CAFE, then drops everything that is not a
// letter. "Blue-Eyes" and "Yu-Gi-Oh" arrive with punctuation more often than not.
export function normalize(raw) {
  return String(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
}

// Rejects on length, duplicates, and containment. Containment is the one that
// is easy to miss: if the list holds both DRAGON and REDDRAGON, every solver
// who circles the tail of REDDRAGON has legitimately found DRAGON, and the
// puzzle has no defensible answer key.
export function cleanList(rawWords, limit = CONFIG.WORDS_PER_PUZZLE) {
  const kept = [];
  const rejected = [];

  for (const raw of rawWords) {
    const word = normalize(raw);
    if (!word) continue;

    if (word.length < CONFIG.MIN_WORD_LENGTH) {
      rejected.push({ word, reason: 'too short' });
      continue;
    }
    if (word.length > CONFIG.MAX_WORD_LENGTH) {
      rejected.push({ word, reason: 'too long' });
      continue;
    }
    if (kept.includes(word)) {
      rejected.push({ word, reason: 'duplicate' });
      continue;
    }
    const clash = kept.find((k) => k.includes(word) || word.includes(k));
    if (clash) {
      rejected.push({ word, reason: `overlaps ${clash}` });
      continue;
    }

    kept.push(word);
    if (kept.length === limit) break;
  }

  return { words: kept, rejected };
}

export function longestLength(words) {
  return words.reduce((max, w) => Math.max(max, w.length), 0);
}
