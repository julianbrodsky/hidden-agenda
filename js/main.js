// Wiring. Three screens: pick topics, check the words, print the paper.

import { CONFIG } from './config.js';
import { PROVIDERS, providerFor } from './providers.js';
import { generateWords, generateAll, listLocalModels } from './api.js';
import { cleanList } from './words.js';
import { buildPuzzle, seedFrom } from './grid.js';
import { renderSheets, fitPreview } from './render.js';

const dom = {
  provider: document.getElementById('provider'),
  providerNote: document.getElementById('provider-note'),
  providerStatus: document.getElementById('provider-status'),
  baseUrl: document.getElementById('base-url'),
  recheck: document.getElementById('recheck'),
  model: document.getElementById('model'),
  modelOptions: document.getElementById('model-options'),
  apiKey: document.getElementById('api-key'),
  topics: document.getElementById('topics'),
  generate: document.getElementById('generate'),
  skip: document.getElementById('skip'),
  topicsStatus: document.getElementById('topics-status'),
  cards: document.getElementById('cards'),
  build: document.getElementById('build'),
  sheets: document.getElementById('sheets'),
  preview: document.getElementById('preview'),
  sheetCount: document.getElementById('sheet-count'),
  answerKey: document.getElementById('answer-key'),
  views: {
    topics: document.getElementById('view-topics'),
    words: document.getElementById('view-words'),
    print: document.getElementById('view-print'),
  },
};

const state = {
  // One saved set of connection details per provider, so switching to the local
  // model and back does not make you retype a key.
  settings: {
    provider: 'anthropic',
    byProvider: {},
  },
  topics: new Array(CONFIG.MAX_TOPICS).fill(''),
  lists: [],
  puzzles: [],
  // Bumped by the shuffle button. Layout is a pure function of the words and
  // this number, so shuffling is a re-render rather than a separate path.
  salt: 0,
};

function show(name) {
  for (const [key, view] of Object.entries(dom.views)) view.hidden = key !== name;
  window.scrollTo(0, 0);
}

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private windows refuse to store. Losing the key across reloads is a
    // nuisance, not a failure, so the app carries on without it.
  }
}

/* ---------- provider settings ---------- */

// The connection details for whichever provider is selected, filled in from the
// provider's own defaults for anything the user has not set.
function currentSettings() {
  const id = state.settings.provider;
  const provider = providerFor(id);
  const saved = state.settings.byProvider[id] || {};
  return {
    provider: id,
    base: (saved.base || provider.defaultBase).trim(),
    model: (saved.model || provider.defaultModel).trim(),
    key: (saved.key || '').trim(),
  };
}

function saveSettings() {
  const id = state.settings.provider;
  state.settings.byProvider[id] = {
    base: dom.baseUrl.value,
    model: dom.model.value,
    key: dom.apiKey.value,
  };
  writeStorage(CONFIG.STORAGE_KEY_SETTINGS, state.settings);
}

// Says what is missing before a run starts, rather than letting ten topics fail
// one at a time with the same message.
function settingsProblem() {
  const provider = providerFor(state.settings.provider);
  const settings = currentSettings();
  const blocked = mixedContentProblem();
  if (blocked) return blocked;
  if (provider.needsKey && !settings.key) return 'Add an API key, or choose "Write my own words".';
  if (provider.fields.includes('model') && !settings.model) return 'Pick a model first.';
  if (provider.fields.includes('base') && !settings.base) return 'Add the base URL of the server.';
  return null;
}

// An https page is not allowed to call http://localhost. Chrome makes an
// exception for loopback and Safari does not, so the request dies inside the
// browser and the server never hears about it. That looks exactly like a server
// which is not running, which is the wrong thing to tell somebody whose server
// is running fine.
function mixedContentProblem() {
  const settings = currentSettings();
  if (window.location.protocol !== 'https:') return null;
  if (!settings.base.startsWith('http://')) return null;
  return 'This page is on https and the model is on http, which Safari will not allow. '
    + 'Serve the page over http instead: run "python3 -m http.server 8000 --bind 127.0.0.1" '
    + 'in the project folder and open http://localhost:8000.';
}

function showSettingsFor(id) {
  const provider = providerFor(id);
  state.settings.provider = id;
  dom.provider.value = id;
  dom.providerNote.textContent = provider.note;

  const saved = state.settings.byProvider[id] || {};
  dom.baseUrl.value = saved.base !== undefined ? saved.base : provider.defaultBase;
  dom.model.value = saved.model !== undefined ? saved.model : provider.defaultModel;
  dom.apiKey.value = saved.key || '';

  for (const field of document.querySelectorAll('.settings [data-field]')) {
    field.hidden = !provider.fields.includes(field.dataset.field);
  }

  dom.providerStatus.textContent = '';
  dom.modelOptions.replaceChildren();
  // Re-checking used to mean knowing that reselecting the dropdown was what
  // triggered it, which is not a thing anybody knows.
  dom.recheck.hidden = id !== 'ollama';
  if (id === 'ollama') loadLocalModels();
}

// Ollama can say what it has installed, so the model box becomes a list of real
// choices. A failure here is not an error worth stopping for: it usually just
// means the server is not running yet, and the user can still type a name.
async function loadLocalModels() {
  dom.providerStatus.textContent = 'Looking for local models...';
  try {
    const models = await listLocalModels(currentSettings().base);
    if (!models.length) {
      dom.providerStatus.textContent = 'Ollama is running but has no models. Pull one first.';
      return;
    }
    dom.modelOptions.replaceChildren(
      ...models.map((name) => {
        const option = document.createElement('option');
        option.value = name;
        return option;
      }),
    );
    if (!dom.model.value) {
      dom.model.value = models[0];
      saveSettings();
    }
    dom.providerStatus.textContent = `Found ${models.length} local ${models.length === 1 ? 'model' : 'models'}.`;
  } catch {
    dom.providerStatus.textContent = mixedContentProblem()
      || 'No Ollama server at that address. Start it with "ollama serve", then check again.';
  }
}

/* ---------- screen one: topics ---------- */

function buildTopicRows() {
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < CONFIG.MAX_TOPICS; i += 1) {
    const row = document.createElement('li');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = state.topics[i] || '';
    input.placeholder = i === 0 ? 'Blue-Eyes White Dragon' : '';
    input.setAttribute('aria-label', `Topic ${i + 1}`);
    input.addEventListener('input', () => {
      state.topics[i] = input.value;
      writeStorage(CONFIG.STORAGE_KEY_TOPICS, state.topics);
    });
    row.append(input);
    fragment.append(row);
  }
  dom.topics.replaceChildren(fragment);
}

function filledTopics() {
  return state.topics
    .map((topic, index) => ({ topic: topic.trim(), index }))
    .filter((entry) => entry.topic.length > 0);
}

async function onGenerate() {
  const topics = filledTopics();
  if (!topics.length) {
    dom.topicsStatus.textContent = 'Add at least one topic first.';
    return;
  }
  const problem = settingsProblem();
  if (problem) {
    dom.topicsStatus.textContent = problem;
    return;
  }
  const settings = currentSettings();

  dom.generate.disabled = true;
  dom.skip.disabled = true;

  state.lists = topics.map(({ topic }) => ({ topic, title: topic, words: [], error: null }));

  let done = 0;
  const report = () => {
    dom.topicsStatus.textContent = `Writing word lists: ${done} of ${topics.length} done.`;
  };
  report();

  await generateAll(
    topics.map((entry) => entry.topic),
    settings,
    (index, result) => {
      done += 1;
      if (result.ok) {
        state.lists[index].title = result.title;
        state.lists[index].words = cleanList(result.words).words;
      } else {
        state.lists[index].error = result.error;
      }
      report();
    },
  );

  dom.generate.disabled = false;
  dom.skip.disabled = false;

  const failures = state.lists.filter((list) => list.error).length;
  dom.topicsStatus.textContent = failures
    ? `${failures} of ${topics.length} topics failed. You can retry or fill them in by hand.`
    : '';

  renderCards();
  show('words');
}

function onSkip() {
  const topics = filledTopics();
  if (!topics.length) {
    dom.topicsStatus.textContent = 'Add at least one topic first.';
    return;
  }
  state.lists = topics.map(({ topic }) => ({ topic, title: topic, words: [], error: null }));
  renderCards();
  show('words');
}

/* ---------- screen two: the words ---------- */

function describeList(list) {
  const { words, rejected } = cleanList(list.words);
  const parts = [`${words.length} of ${CONFIG.WORDS_PER_PUZZLE}`];
  if (rejected.length) {
    const shown = rejected.slice(0, 3).map((r) => `${r.word} (${r.reason})`);
    parts.push(`skipping ${shown.join(', ')}${rejected.length > 3 ? ', and more' : ''}`);
  }
  return parts.join(', ');
}

function renderCards() {
  const fragment = document.createDocumentFragment();

  state.lists.forEach((list, index) => {
    const card = document.createElement('article');
    card.className = 'card';

    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'card-title';
    title.value = list.title;
    title.setAttribute('aria-label', `Puzzle title for ${list.topic}`);
    title.addEventListener('input', () => { list.title = title.value; });

    const area = document.createElement('textarea');
    area.className = 'card-words';
    // Tall enough to show a whole list without scrolling, since the point of
    // this screen is reading all twenty at once.
    area.rows = CONFIG.WORDS_PER_PUZZLE;
    area.spellcheck = false;
    area.value = list.words.join('\n');
    area.placeholder = 'One word per line';
    area.setAttribute('aria-label', `Words for ${list.topic}`);

    const meta = document.createElement('p');
    meta.className = 'card-meta';

    const refresh = () => {
      list.words = area.value.split('\n').map((line) => line.trim()).filter(Boolean);
      meta.textContent = list.error || describeList(list);
      meta.classList.toggle('is-error', Boolean(list.error));
    };
    area.addEventListener('input', () => { list.error = null; refresh(); });

    const again = document.createElement('button');
    again.type = 'button';
    again.textContent = 'Ask again';
    again.addEventListener('click', async () => {
      const problem = settingsProblem();
      if (problem) { list.error = problem; refresh(); return; }
      again.disabled = true;
      meta.textContent = 'Thinking...';
      meta.classList.remove('is-error');
      try {
        const result = await generateWords(list.topic, currentSettings());
        list.title = result.title;
        list.words = cleanList(result.words).words;
        list.error = null;
        title.value = list.title;
        area.value = list.words.join('\n');
      } catch (err) {
        list.error = err.message;
      }
      again.disabled = false;
      refresh();
    });

    const head = document.createElement('header');
    head.className = 'card-head';
    head.append(title, again);

    card.append(head, area, meta);
    fragment.append(card);
    refresh();
  });

  dom.cards.replaceChildren(fragment);
}

/* ---------- screen three: paper ---------- */

function onBuild() {
  const puzzles = [];
  const failures = [];

  state.lists.forEach((list) => {
    const { words } = cleanList(list.words);
    if (words.length < 2) {
      failures.push(list.title || list.topic);
      return;
    }
    const puzzle = buildPuzzle(words, seedFrom(`${list.title}|${words.join()}`) + state.salt);
    // The list prints in the order it was written, which is the order the model
    // put the most recognisable words in, not the order they got placed.
    puzzle.placements.sort((a, b) => words.indexOf(a.word) - words.indexOf(b.word));
    puzzle.title = list.title || list.topic;
    puzzles.push(puzzle);
  });

  if (!puzzles.length) {
    dom.cards.scrollIntoView();
    return;
  }

  state.puzzles = puzzles;
  show('print');
  drawSheets();

  if (failures.length) {
    document.getElementById('print-hint').textContent =
      `Skipped ${failures.join(', ')}: not enough usable words.`;
  }
}

function drawSheets() {
  const count = renderSheets(dom.sheets, state.puzzles, { answerKey: dom.answerKey.checked });
  const dropped = state.puzzles.reduce((total, p) => total + p.unplaced.length, 0);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  dom.sheetCount.textContent =
    `${plural(state.puzzles.length, 'puzzle')}, ${plural(count, 'page')}` +
    (dropped ? `, ${plural(dropped, 'word')} too long to fit` : '');
  fitPreview(dom.sheets, dom.preview);
}

/* ---------- start ---------- */

const savedSettings = readStorage(CONFIG.STORAGE_KEY_SETTINGS, null);
if (savedSettings && savedSettings.byProvider) {
  state.settings = savedSettings;
  if (!PROVIDERS[state.settings.provider]) state.settings.provider = 'anthropic';
}
showSettingsFor(state.settings.provider);

dom.provider.addEventListener('change', () => showSettingsFor(dom.provider.value));
for (const input of [dom.baseUrl, dom.model, dom.apiKey]) {
  input.addEventListener('input', saveSettings);
}
// A corrected address deserves another look for models without a page reload.
dom.baseUrl.addEventListener('change', () => {
  if (state.settings.provider === 'ollama') loadLocalModels();
});
dom.recheck.addEventListener('click', loadLocalModels);

const savedTopics = readStorage(CONFIG.STORAGE_KEY_TOPICS, null);
if (Array.isArray(savedTopics)) {
  savedTopics.slice(0, CONFIG.MAX_TOPICS).forEach((topic, i) => { state.topics[i] = topic; });
}
buildTopicRows();

dom.generate.addEventListener('click', onGenerate);
dom.skip.addEventListener('click', onSkip);
dom.build.addEventListener('click', onBuild);
document.getElementById('back-to-topics').addEventListener('click', () => show('topics'));
document.getElementById('back-to-words').addEventListener('click', () => show('words'));
document.getElementById('print').addEventListener('click', () => window.print());
dom.answerKey.addEventListener('change', drawSheets);
document.getElementById('shuffle').addEventListener('click', () => {
  state.salt += 1;
  onBuild();
});

window.addEventListener('resize', () => {
  if (!dom.views.print.hidden) fitPreview(dom.sheets, dom.preview);
});
