// Three ways to get a word list, behind one shape.
//
// Every provider answers the same question and returns the same object, so
// api.js does not know or care which one is selected, and adding a fourth is a
// matter of adding an entry here and a host to the connect-src in index.html.

import { CONFIG } from './config.js';

export const SYSTEM = `You build the word lists behind printed word search puzzles.

You are given one topic and you return exactly ${CONFIG.WORDS_REQUESTED} words that belong to it.

The topic may be enormous ("jazz", "the ocean") or vanishingly specific (one trading card, one fragrance, one episode, one recipe, one person). Specific is the normal case, so treat it as the point rather than a problem: for a single Yu-Gi-Oh card, draw on its name, artwork, attribute, type, stats, effect wording, archetype, and the cards and duels it is known for. For a single fragrance, draw on its notes, accords, bottle, house, perfumer, and the words its fans reach for. Someone who knows the topic should read the finished list and recognise it immediately; someone who does not should learn something from it.

Rules for every word:
- Letters A to Z only. Strip spaces, hyphens, apostrophes and accents from names before you answer.
- Between ${CONFIG.MIN_WORD_LENGTH} and ${CONFIG.MAX_WORD_LENGTH} letters after stripping. A long name gets shortened to the part people actually say, not truncated mid-word.
- No word may contain another word on the list. If you use DRAGON, do not also use REDDRAGON, because a solver who circles part of one has found the other.
- No two words may be forms of the same word: pick DUEL or DUELIST, not both.
- Every word is genuinely about this topic. Do not pad the tail of the list with generic filler that would fit any topic in the same category.

Order the list so the most recognisable words come first, because only the first ${CONFIG.WORDS_PER_PUZZLE} that survive those rules get printed.

Also give a short display title for the puzzle: the topic written the way a fan would write it, in normal capitalisation, at most 40 characters.

Reply with JSON only, in the shape {"title": "...", "words": ["...", ...]}. No explanation, no markdown fence.`;

export const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    words: {
      type: 'array',
      items: { type: 'string' },
      minItems: CONFIG.WORDS_REQUESTED,
      maxItems: CONFIG.WORDS_REQUESTED,
    },
  },
  required: ['title', 'words'],
  additionalProperties: false,
};

// Claude answers with clean JSON because the schema is enforced server side.
// The open weight models mostly do, and then sometimes wrap it in a fence or
// open with "Here is your list:". This unwraps all three cases rather than
// throwing away a good answer over its packaging.
export function extractJson(text) {
  const trimmed = String(text).trim();
  try {
    return JSON.parse(trimmed);
  } catch { /* keep going */ }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch { /* keep going */ }
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch { /* fall through to the caller's error */ }
  }

  return null;
}

function trimBase(url) {
  return String(url).trim().replace(/\/+$/, '');
}

export const PROVIDERS = {
  anthropic: {
    label: 'Claude (Anthropic)',
    // What the settings panel shows. The UI reads these rather than knowing
    // anything about individual providers.
    fields: ['key'],
    needsKey: true,
    defaultModel: 'claude-opus-5',
    defaultBase: 'https://api.anthropic.com',
    concurrency: 3,
    note: 'Paid, and the strongest on narrow topics. Costs a few cents for ten puzzles.',

    request(topic, settings) {
      return {
        url: `${trimBase(settings.base)}/v1/messages`,
        headers: {
          'content-type': 'application/json',
          'x-api-key': settings.key,
          'anthropic-version': '2023-06-01',
          // Without this the API refuses a call made from a page origin, which
          // is the whole reason this app can exist without a server.
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: {
          model: settings.model,
          max_tokens: CONFIG.MAX_TOKENS,
          system: SYSTEM,
          messages: [{ role: 'user', content: `Topic: ${topic}` }],
          output_config: { format: { type: 'json_schema', schema: SCHEMA } },
        },
      };
    },

    read(payload) {
      if (payload.stop_reason === 'refusal') {
        throw new Error('The model declined this topic. Try wording it differently.');
      }
      const text = (payload.content || []).find((block) => block.type === 'text');
      return text ? text.text : null;
    },
  },

  ollama: {
    label: 'Local model (Ollama)',
    fields: ['base', 'model'],
    needsKey: false,
    defaultModel: '',
    defaultBase: 'http://localhost:11434',
    // One at a time. A local model is using the whole machine for each answer,
    // so three at once is slower than three in a row, not faster.
    concurrency: 1,
    note: 'Free and entirely on your machine. Weakest on very narrow topics.',

    request(topic, settings) {
      return {
        url: `${trimBase(settings.base)}/api/chat`,
        headers: { 'content-type': 'application/json' },
        body: {
          model: settings.model,
          stream: false,
          // Ollama takes a JSON schema here and constrains decoding to it, which
          // is what keeps a small model from answering in prose.
          format: SCHEMA,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: `Topic: ${topic}` },
          ],
        },
      };
    },

    read(payload) {
      return payload.message ? payload.message.content : null;
    },
  },

  openai: {
    label: 'OpenAI-compatible API',
    fields: ['base', 'model', 'key'],
    needsKey: false,
    defaultModel: '',
    defaultBase: 'https://api.groq.com/openai',
    concurrency: 3,
    note: 'For Groq, OpenRouter, Together, LM Studio, llama.cpp or vLLM. Free tiers exist and run open weight models.',

    request(topic, settings) {
      const headers = { 'content-type': 'application/json' };
      // A local server usually wants no key at all, so an empty one is sent as
      // no header rather than as an empty bearer token.
      if (settings.key) headers.authorization = `Bearer ${settings.key}`;

      return {
        url: `${trimBase(settings.base)}/v1/chat/completions`,
        headers,
        body: {
          model: settings.model,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: `Topic: ${topic}` },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'word_list', strict: true, schema: SCHEMA },
          },
        },
      };
    },

    read(payload) {
      const choice = (payload.choices || [])[0];
      return choice && choice.message ? choice.message.content : null;
    },
  },
};

export function providerFor(id) {
  return PROVIDERS[id] || PROVIDERS.anthropic;
}
