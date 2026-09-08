// The one network call in the app. The key is the user's own, held in their
// browser, and the request goes straight to Anthropic, so there is no server
// here to leak it and no server here to run.

import { CONFIG } from './config.js';

const SYSTEM = `You build the word lists behind printed word search puzzles.

You are given one topic and you return exactly ${CONFIG.WORDS_PER_PUZZLE} words that belong to it.

The topic may be enormous ("jazz", "the ocean") or vanishingly specific (one trading card, one fragrance, one episode, one recipe, one person). Specific is the normal case, so treat it as the point rather than a problem: for a single Yu-Gi-Oh card, draw on its name, artwork, attribute, type, stats, effect wording, archetype, and the cards and duels it is known for. For a single fragrance, draw on its notes, accords, bottle, house, perfumer, and the words its fans reach for. Someone who knows the topic should read the finished list and recognise it immediately; someone who does not should learn something from it.

Rules for every word:
- Letters A to Z only. Strip spaces, hyphens, apostrophes and accents from names before you answer.
- Between ${CONFIG.MIN_WORD_LENGTH} and ${CONFIG.MAX_WORD_LENGTH} letters after stripping. A long name gets shortened to the part people actually say, not truncated mid-word.
- No word may contain another word on the list. If you use DRAGON, do not also use REDDRAGON, because a solver who circles part of one has found the other.
- No two words may be forms of the same word: pick DUEL or DUELIST, not both.
- Every word is genuinely about this topic. Do not pad the tail of the list with generic filler that would fit any topic in the same category.

Return ${CONFIG.WORDS_PER_PUZZLE} words, uppercase, most recognisable first, plus a short display title for the puzzle: the topic written the way a fan would write it, in normal capitalisation, at most 40 characters.`;

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    words: {
      type: 'array',
      items: { type: 'string' },
      minItems: CONFIG.WORDS_PER_PUZZLE,
      maxItems: CONFIG.WORDS_PER_PUZZLE,
    },
  },
  required: ['title', 'words'],
  additionalProperties: false,
};

export async function generateWords(topic, apiKey, signal) {
  let response;
  try {
    response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': CONFIG.API_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: CONFIG.MODEL,
        max_tokens: CONFIG.MAX_TOKENS,
        system: SYSTEM,
        messages: [{ role: 'user', content: `Topic: ${topic}` }],
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      }),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    // A blocked fetch and a dead network look identical from here, so say both.
    throw new Error('Could not reach the Claude API. Check your connection.');
  }

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(describeFailure(response.status, detail));
  }

  const message = await response.json();
  if (message.stop_reason === 'refusal') {
    throw new Error('Claude declined this topic. Try wording it differently.');
  }

  const text = (message.content || []).find((block) => block.type === 'text');
  if (!text) throw new Error('Claude returned no words for this topic.');

  // output_config guarantees this parses, but a truncated response would not,
  // and max_tokens is the one way that happens.
  let parsed;
  try {
    parsed = JSON.parse(text.text);
  } catch {
    throw new Error('Claude ran out of room mid answer. Try again.');
  }

  return { title: String(parsed.title || topic).trim(), words: parsed.words || [] };
}

function describeFailure(status, detail) {
  const message = detail && detail.error && detail.error.message;
  if (status === 401) return 'That API key was rejected. Check it and try again.';
  if (status === 400 && message) return message;
  if (status === 429) return 'Rate limited by the API. Wait a moment and retry.';
  if (status >= 500) return 'The API is having trouble. Try again shortly.';
  return message || `The API returned ${status}.`;
}

// Runs the topics a few at a time and reports each one the moment it lands, so
// a slow topic does not hide the nine that already finished.
export async function generateAll(topics, apiKey, onResult, signal) {
  const queue = topics.map((topic, index) => ({ topic, index }));
  let next = 0;

  async function worker() {
    while (next < queue.length) {
      const job = queue[next];
      next += 1;
      try {
        const result = await generateWords(job.topic, apiKey, signal);
        onResult(job.index, { ok: true, ...result });
      } catch (err) {
        if (err.name === 'AbortError') return;
        onResult(job.index, { ok: false, error: err.message });
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(CONFIG.CONCURRENCY, queue.length) },
    () => worker(),
  );
  await Promise.all(workers);
}
