#!/usr/bin/env node
'use strict';

// Structural checks on data.json. CI runs this on every pull request, and the
// maintenance bot only merges its own PR when it passes.
// Usage: node scripts/validate-data.js [path/to/data.json]

const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '..', 'data.json');
const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);
const isText = v => typeof v === 'string' && v.trim() !== '' && v === v.trim();

let data;
try {
	data = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (err) {
	console.error(`data.json is not valid JSON: ${err.message}`);
	process.exit(1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(data.lastUpdated || '')) fail('lastUpdated', 'must be YYYY-MM-DD');
if (!Array.isArray(data.providers) || data.providers.length === 0) fail('providers', 'must be a non-empty array');
if (!Array.isArray(data.footnotes)) fail('footnotes', 'must be an array');
if (!Array.isArray(data.glossary)) fail('glossary', 'must be an array');

const footnoteIds = new Set();
for (const [i, f] of (data.footnotes || []).entries()) {
	const where = `footnotes[${i}]`;
	if (!Number.isInteger(f.id) || f.id < 1) fail(where, 'id must be a positive integer');
	else if (footnoteIds.has(f.id)) fail(where, `duplicate id ${f.id}`);
	footnoteIds.add(f.id);
	if (!isText(f.text)) fail(where, 'text must be a non-empty trimmed string');
}

for (const [i, g] of (data.glossary || []).entries()) {
	if (!isText(g.abbreviation) || !isText(g.meaning)) fail(`glossary[${i}]`, 'abbreviation and meaning are required');
}

const PROVIDER_KEYS = ['name', 'category', 'country', 'flag', 'url', 'baseUrl', 'description', 'footnoteRef', 'models'];
const MODEL_KEYS = ['id', 'name', 'context', 'maxOutput', 'modality', 'rateLimit'];
const names = new Set();
const referenced = new Set();

for (const [i, p] of (data.providers || []).entries()) {
	const where = `providers[${i}] (${p.name || '?'})`;
	for (const k of Object.keys(p)) if (!PROVIDER_KEYS.includes(k)) fail(where, `unknown field "${k}"`);
	if (!isText(p.name)) fail(where, 'name is required');
	else if (names.has(p.name.toLowerCase())) fail(where, 'duplicate provider name');
	names.add((p.name || '').toLowerCase());
	if (!['provider_api', 'inference_provider'].includes(p.category)) fail(where, 'category must be provider_api or inference_provider');
	if (!/^[A-Z]{2}$/.test(p.country || '')) fail(where, 'country must be an ISO 3166 alpha-2 code');
	if (!isText(p.flag)) fail(where, 'flag is required');
	if (!/^https:\/\/\S+$/.test(p.url || '')) fail(where, 'url must be an https URL');
	if (p.baseUrl !== null && !/^https?:\/\/\S+$/.test(p.baseUrl || '')) fail(where, 'baseUrl must be a URL or null');
	if (!isText(p.description)) fail(where, 'description is required');
	if (p.footnoteRef !== null) {
		if (!footnoteIds.has(p.footnoteRef)) fail(where, `footnoteRef ${p.footnoteRef} has no footnote`);
		referenced.add(p.footnoteRef);
	}
	if (!Array.isArray(p.models) || p.models.length === 0) {
		fail(where, 'models must be a non-empty array');
		continue;
	}
	const ids = new Set();
	for (const [j, m] of p.models.entries()) {
		const mw = `${where} models[${j}] (${m.id})`;
		for (const k of Object.keys(m)) if (!MODEL_KEYS.includes(k)) fail(mw, `unknown field "${k}"`);
		for (const k of MODEL_KEYS) if (!(k in m)) fail(mw, `missing field "${k}"`);
		if (m.id !== null) {
			if (!isText(m.id)) fail(mw, 'id must be a non-empty string or null');
			else if (ids.has(m.id)) fail(mw, 'duplicate model id in this provider');
			ids.add(m.id);
		}
		for (const k of ['name', 'context', 'maxOutput', 'modality', 'rateLimit']) {
			if (!isText(m[k])) fail(mw, `${k} must be a non-empty trimmed string`);
			else if (m[k].includes('|') || m[k].includes('\n')) fail(mw, `${k} must not contain "|" or a newline (it breaks the table)`);
		}
	}
}

for (const id of footnoteIds) if (!referenced.has(id)) fail(`footnotes id ${id}`, 'not referenced by any provider');

if (errors.length) {
	console.error(`data.json has ${errors.length} problem(s):`);
	for (const e of errors) console.error(`  - ${e}`);
	process.exit(1);
}
console.log(`data.json OK: ${data.providers.length} providers, ${data.providers.reduce((n, p) => n + p.models.length, 0)} model rows.`);
