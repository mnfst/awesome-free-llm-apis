'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');
function section(name) {
  const start = readme.indexOf(`### [${name}](`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = readme.indexOf('\n### [', start + 1);
  return readme.slice(start, end === -1 ? undefined : end);
}

test('native Gemini and Cohere URLs are distinguished from SDK-compatible endpoints', () => {
  const gemini = section('Google Gemini');
  assert.match(gemini, /Native API base URL: `https:\/\/generativelanguage\.googleapis\.com\/v1beta`/);
  assert.match(gemini, /OpenAI-compatible base URL: `https:\/\/generativelanguage\.googleapis\.com\/v1beta\/openai\/`/);
  const cohere = section('Cohere');
  assert.match(cohere, /Native API base URL: `https:\/\/api\.cohere\.com\/v2`/);
  assert.match(cohere, /OpenAI-compatible base URL: `https:\/\/api\.cohere\.ai\/compatibility\/v1`/);
});

test('other overrides are shown and providers without an override stay concise', () => {
  const cloudflare = section('Cloudflare Workers AI');
  assert.match(cloudflare, /Native API base URL: `https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/\{account_id\}\/ai\/run`/);
  assert.match(cloudflare, /OpenAI-compatible base URL: `https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/\{account_id\}\/ai\/v1`/);
  const groq = section('Groq');
  assert.match(groq, /Base URL: `https:\/\/api\.groq\.com\/openai\/v1`/);
  assert.doesNotMatch(groq, /Native API base URL:/);
});
