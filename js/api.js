// The network layer. Which model answers is decided in providers.js; this file
// only knows how to send a request, survive the ways it can fail, and get a
// title and a word list back out.

import { providerFor, extractJson } from './providers.js';

async function post(url, headers, body, signal) {
  try {
    return await fetch(url, {
      method: 'POST',
      signal,
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    // A refused connection, a CORS rejection and a dead network are all the
    // same opaque TypeError here, so the message has to cover all three.
    throw new Error(
      url.includes('localhost') || url.includes('127.0.0.1')
        ? 'Could not reach the local model. Is the server running on that address?'
        : 'Could not reach the API. Check the address and your connection.',
    );
  }
}

// Some OpenAI-compatible hosts accept a JSON schema, some accept only
// json_object, and some accept neither. Rather than make the user find out
// which, the strict form is tried first and the request steps down on the one
// error that means "I do not support that".
function relaxFormat(body) {
  if (!body.response_format || body.response_format.type === 'json_object') return null;
  return { ...body, response_format: { type: 'json_object' } };
}

export async function generateWords(topic, settings, signal) {
  const provider = providerFor(settings.provider);
  const { url, headers, body } = provider.request(topic, settings);

  let response = await post(url, headers, body, signal);

  if (response.status === 400) {
    const relaxed = relaxFormat(body);
    if (relaxed) response = await post(url, headers, relaxed, signal);
  }

  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(describeFailure(response.status, detail));
  }

  const payload = await response.json();
  const text = provider.read(payload);
  if (!text) throw new Error('The model returned no words for this topic.');

  const parsed = extractJson(text);
  if (!parsed) {
    throw new Error('The model did not answer with a word list. Try again, or try another model.');
  }

  const words = Array.isArray(parsed.words) ? parsed.words : [];
  if (!words.length) throw new Error('The model returned an empty list for this topic.');

  return { title: String(parsed.title || topic).trim(), words };
}

function describeFailure(status, detail) {
  const message =
    (detail && detail.error && (detail.error.message || detail.error)) ||
    (detail && detail.message) ||
    null;

  if (status === 401 || status === 403) return 'That API key was rejected. Check it and try again.';
  if (status === 404) return 'No model at that address. Check the model name and the base URL.';
  if (status === 429) return 'Rate limited. Wait a moment and retry.';
  if (status >= 500) return 'The model server is having trouble. Try again shortly.';
  return typeof message === 'string' ? message : `The server returned ${status}.`;
}

// Asks Ollama what is actually installed, so the model box is a list of real
// choices rather than a name the user has to remember and spell.
export async function listLocalModels(base) {
  const url = `${String(base).trim().replace(/\/+$/, '')}/api/tags`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Ollama answered ${response.status}.`);
  const payload = await response.json();
  return (payload.models || []).map((entry) => entry.name).sort();
}

// Runs the topics a few at a time and reports each one the moment it lands, so
// a slow topic does not hide the ones that already finished. How many run at
// once is the provider's call: a hosted API wants several, a local model wants
// the machine to itself.
export async function generateAll(topics, settings, onResult, signal) {
  const provider = providerFor(settings.provider);
  const lanes = Math.min(provider.concurrency, topics.length);
  let next = 0;

  async function worker() {
    while (next < topics.length) {
      const index = next;
      next += 1;
      try {
        const result = await generateWords(topics[index], settings, signal);
        onResult(index, { ok: true, ...result });
      } catch (err) {
        if (err.name === 'AbortError') return;
        onResult(index, { ok: false, error: err.message });
      }
    }
  }

  await Promise.all(Array.from({ length: lanes }, () => worker()));
}
