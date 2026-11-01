'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Exercise the real generator against fictional provider records, independently
// of the live catalog, so removing a provider does not break this regression.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'free-api-readme-test-'));
let readme;
try {
  fs.mkdirSync(path.join(root, 'scripts'));
  for (const file of ['generate-readme.js', 'provider-setup.js']) {
    fs.copyFileSync(path.join(__dirname, file), path.join(root, 'scripts', file));
  }
  const provider = (name, baseUrl) => ({
    name, baseUrl, category: 'provider_api', url: 'https://example.invalid/key', flag: '',
    description: 'Fictional fixture.', footnoteRef: null, models: [],
  });
  fs.writeFileSync(path.join(root, 'data.json'), JSON.stringify({
    providers: [
      provider('Google Gemini', 'https://generativelanguage.googleapis.com/v1beta'),
      provider('Cohere', 'https://api.cohere.com/v2'),
      provider('Cloudflare Workers AI', 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run'),
      provider('Groq', 'https://api.groq.com/openai/v1'),
    ], glossary: [], footnotes: [],
  }));
  execFileSync(process.execPath, [path.join(root, 'scripts', 'generate-readme.js')]);
  readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

function section(name) {
  const start = readme.indexOf(`### [${name}](`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = readme.indexOf('\n### [', start + 1);
  return readme.slice(start, end === -1 ? undefined : end);
}

test('Gemini and Cohere distinguish native URLs from OpenAI-compatible endpoints', () => {
  const gemini = section('Google Gemini');
  assert.match(gemini, /Native API base URL: `https:\/\/generativelanguage\.googleapis\.com\/v1beta`/);
  assert.match(gemini, /OpenAI-compatible base URL: `https:\/\/generativelanguage\.googleapis\.com\/v1beta\/openai\/`/);
  const cohere = section('Cohere');
  assert.match(cohere, /Native API base URL: `https:\/\/api\.cohere\.com\/v2`/);
  assert.match(cohere, /OpenAI-compatible base URL: `https:\/\/api\.cohere\.ai\/compatibility\/v1`/);
});

test('Cloudflare override is shown and a provider without one stays concise', () => {
  const cloudflare = section('Cloudflare Workers AI');
  assert.match(cloudflare, /Native API base URL: `https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/\{account_id\}\/ai\/run`/);
  assert.match(cloudflare, /OpenAI-compatible base URL: `https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/\{account_id\}\/ai\/v1`/);
  const groq = section('Groq');
  assert.match(groq, /Base URL: `https:\/\/api\.groq\.com\/openai\/v1`/);
  assert.doesNotMatch(groq, /Native API base URL:/);
});
