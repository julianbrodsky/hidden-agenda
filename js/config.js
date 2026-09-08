// Every tunable number in Hidden Agenda lives here. Nothing else hard codes a
// limit, a size, or a model name.

export const CONFIG = {
  // How many topics you can queue at once. Ten topics is five printed sheets,
  // which is the batch size this whole thing was built around.
  MAX_TOPICS: 10,
  WORDS_PER_PUZZLE: 20,

  // Word rules. A word shorter than 3 is not worth hunting for, and a word
  // longer than 12 will not fit in the smallest grid we are willing to print.
  MIN_WORD_LENGTH: 3,
  MAX_WORD_LENGTH: 12,

  // Grid sizing. The generator starts at GRID_START and only grows when a word
  // genuinely cannot be placed, because a bigger grid means smaller letters on
  // a half sheet and that is the thing that makes a printout unusable.
  GRID_START: 15,
  GRID_MIN: 13,
  GRID_MAX: 18,

  // How many times to reshuffle the whole board at one size while hunting for a
  // layout with no stray copies of a word. Placement is random, so a failure at
  // attempt 1 says nothing, and 60 boards costs a fraction of a second.
  PLACEMENT_ATTEMPTS: 60,

  // Print geometry, in inches, for US Letter portrait. Two puzzles per sheet.
  PAGE_WIDTH_IN: 8.5,
  PAGE_HEIGHT_IN: 11,
  PUZZLE_HEIGHT_IN: 5.5,
  PUZZLE_MARGIN_IN: 0.4,
  // The square the grid is drawn into. Sized so the grid plus a title still
  // clears the half sheet with the margin above.
  GRID_SIDE_IN: 4.25,

  // Claude call. The key never leaves the browser, so this is a direct call and
  // needs the header that opts into browser origins.
  API_URL: 'https://api.anthropic.com/v1/messages',
  API_VERSION: '2023-06-01',
  MODEL: 'claude-opus-5',
  // Generous because Opus 5 thinks by default and thinking counts against this
  // ceiling. Unused headroom costs nothing; hitting the ceiling truncates the
  // JSON mid answer and throws the whole topic away.
  MAX_TOKENS: 16000,
  // Topics run concurrently, but not all ten at once, so a burst of ten does not
  // trip a rate limit on a small account.
  CONCURRENCY: 3,

  STORAGE_KEY_API: 'hidden-agenda.api-key',
  STORAGE_KEY_TOPICS: 'hidden-agenda.topics',
};

// Eight directions, so words run across, down, both diagonals, and all four
// of those backwards.
export const DIRECTIONS = [
  [0, 1], [1, 0], [1, 1], [1, -1],
  [0, -1], [-1, 0], [-1, -1], [-1, 1],
];
