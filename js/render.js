// Builds the printable sheets. Everything here is sized in inches against US
// Letter, because the output is a piece of paper and not a screen.

import { CONFIG } from './config.js';
import { placementCells } from './grid.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderGrid(puzzle, showAnswers) {
  const grid = el('div', 'grid');
  // Set as a variable rather than a template so the cell size, the letter size
  // and the line weight all stay derived from one number.
  grid.style.setProperty('--n', String(puzzle.size));

  const highlighted = new Set();
  if (showAnswers) {
    for (const placement of puzzle.placements) {
      for (const index of placementCells(placement, puzzle.size)) highlighted.add(index);
    }
  }

  for (let i = 0; i < puzzle.cells.length; i += 1) {
    const cell = el('span', highlighted.has(i) ? 'cell is-answer' : 'cell', puzzle.cells[i]);
    grid.append(cell);
  }
  return grid;
}

function renderWordList(puzzle) {
  const list = el('ul', 'wordlist');
  // Printed in the order the topic gave them, not the order they were placed,
  // so the most recognisable words sit at the top of the first column.
  for (const placement of puzzle.placements) {
    list.append(el('li', null, placement.word));
  }
  return list;
}

function renderPuzzle(puzzle, showAnswers) {
  const article = el('article', showAnswers ? 'puzzle is-key' : 'puzzle');

  const head = el('header', 'puzzle-head');
  head.append(el('h2', 'puzzle-title', puzzle.title));
  head.append(el('p', 'puzzle-note', showAnswers ? 'Answer key' : `Find ${puzzle.placements.length} words`));
  article.append(head);

  const body = el('div', 'puzzle-body');
  body.append(renderGrid(puzzle, showAnswers));
  body.append(renderWordList(puzzle));
  article.append(body);

  return article;
}

// Two puzzles to a sheet, in order, with a blank half left blank rather than
// stretched, so an odd number of topics still prints a usable page.
function paginate(puzzles, showAnswers) {
  const sheets = [];
  for (let i = 0; i < puzzles.length; i += 2) {
    const sheet = el('section', 'sheet');
    sheet.append(renderPuzzle(puzzles[i], showAnswers));
    if (puzzles[i + 1]) sheet.append(renderPuzzle(puzzles[i + 1], showAnswers));
    else sheet.append(el('article', 'puzzle is-blank'));
    sheets.push(sheet);
  }
  return sheets;
}

export function renderSheets(container, puzzles, options) {
  container.replaceChildren();
  const fragment = document.createDocumentFragment();

  for (const sheet of paginate(puzzles, false)) fragment.append(sheet);
  if (options.answerKey) {
    for (const sheet of paginate(puzzles, true)) fragment.append(sheet);
  }

  container.append(fragment);
  return container.querySelectorAll('.sheet').length;
}

// The sheets are laid out at true print size and then scaled down to fit the
// window. Scaling the preview rather than the layout is what keeps what you see
// identical to what comes out of the printer.
export function fitPreview(scaler, viewport) {
  const pageWidth = CONFIG.PAGE_WIDTH_IN * 96;
  const available = viewport.clientWidth - 32;
  const scale = Math.min(1, available / pageWidth);

  scaler.style.setProperty('--preview-scale', String(scale));
  // transform leaves the original box behind, so the wrapper has to be told how
  // tall the scaled content actually is or the page will not scroll to the end.
  scaler.parentElement.style.setProperty('height', `${scaler.scrollHeight * scale}px`);
}
