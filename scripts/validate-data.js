#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const dataPath = process.argv[2]
	? path.resolve(process.cwd(), process.argv[2])
	: path.join(__dirname, '..', 'data.json');

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

function isHttpUrl(value) {
	if (!isNonEmptyString(value)) return false;
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

function validateData(data) {
	const errors = [];
	if (!isRecord(data)) return ['$: expected a JSON object'];

	const updatedAt = typeof data.lastUpdated === 'string'
		? new Date(`${data.lastUpdated}T00:00:00Z`)
		: new Date(NaN);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(data.lastUpdated || '') ||
		Number.isNaN(updatedAt.getTime()) || updatedAt.toISOString().slice(0, 10) !== data.lastUpdated) {
		errors.push('lastUpdated: expected a valid YYYY-MM-DD date');
	}

	if (!Array.isArray(data.footnotes)) {
		errors.push('footnotes: expected an array');
	}
	const footnoteIds = new Set();
	for (const [index, footnote] of (Array.isArray(data.footnotes) ? data.footnotes : []).entries()) {
		const location = `footnotes[${index}]`;
		if (!isRecord(footnote)) {
			errors.push(`${location}: expected an object`);
			continue;
		}
		if (!Number.isInteger(footnote.id) || footnote.id < 1) {
			errors.push(`${location}.id: expected a positive integer`);
		} else if (footnoteIds.has(footnote.id)) {
			errors.push(`${location}.id: duplicate footnote id ${footnote.id}`);
		} else {
			footnoteIds.add(footnote.id);
		}
		if (!isNonEmptyString(footnote.text)) errors.push(`${location}.text: expected a non-empty string`);
	}

	if (!Array.isArray(data.glossary) || data.glossary.length === 0) {
		errors.push('glossary: expected a non-empty array');
	} else {
		for (const [index, item] of data.glossary.entries()) {
			const location = `glossary[${index}]`;
			if (!isRecord(item)) {
				errors.push(`${location}: expected an object`);
				continue;
			}
			if (!isNonEmptyString(item.abbreviation)) errors.push(`${location}.abbreviation: expected a non-empty string`);
			if (!isNonEmptyString(item.meaning)) errors.push(`${location}.meaning: expected a non-empty string`);
		}
	}

	if (!Array.isArray(data.providers) || data.providers.length === 0) {
		errors.push('providers: expected a non-empty array');
		return errors;
	}

	const providerNames = new Set();
	const allowedCategories = new Set(['provider_api', 'inference_provider']);
	let modelCount = 0;
	for (const [providerIndex, provider] of data.providers.entries()) {
		const location = `providers[${providerIndex}]`;
		if (!isRecord(provider)) {
			errors.push(`${location}: expected an object`);
			continue;
		}

		if (!isNonEmptyString(provider.name)) {
			errors.push(`${location}.name: expected a non-empty string`);
		} else {
			const normalizedName = provider.name.trim().toLowerCase();
			if (providerNames.has(normalizedName)) errors.push(`${location}.name: duplicate provider name "${provider.name}"`);
			providerNames.add(normalizedName);
		}
		if (!allowedCategories.has(provider.category)) errors.push(`${location}.category: expected provider_api or inference_provider`);
		if (typeof provider.country !== 'string' || !/^[A-Z]{2}$/.test(provider.country)) {
			errors.push(`${location}.country: expected an uppercase ISO 3166-1 alpha-2 code`);
		}
		if (!isNonEmptyString(provider.flag)) errors.push(`${location}.flag: expected a non-empty string`);
		if (!isHttpUrl(provider.url)) errors.push(`${location}.url: expected an HTTP or HTTPS URL`);
		if (!isHttpUrl(provider.baseUrl)) errors.push(`${location}.baseUrl: expected an HTTP or HTTPS URL`);
		if (!isNonEmptyString(provider.description)) errors.push(`${location}.description: expected a non-empty string`);
		if (provider.footnoteRef !== null && (!Number.isInteger(provider.footnoteRef) || !footnoteIds.has(provider.footnoteRef))) {
			errors.push(`${location}.footnoteRef: expected null or an existing footnote id`);
		}

		if (!Array.isArray(provider.models) || provider.models.length === 0) {
			errors.push(`${location}.models: expected a non-empty array`);
			continue;
		}

		const modelIds = new Set();
		for (const [modelIndex, model] of provider.models.entries()) {
			modelCount++;
			const modelLocation = `${location}.models[${modelIndex}]`;
			if (!isRecord(model)) {
				errors.push(`${modelLocation}: expected an object`);
				continue;
			}
			if (model.id !== null && !isNonEmptyString(model.id)) {
				errors.push(`${modelLocation}.id: expected a non-empty string or null for aggregate rows`);
			} else if (typeof model.id === 'string') {
				if (modelIds.has(model.id)) errors.push(`${modelLocation}.id: duplicate model id "${model.id}" in ${provider.name || `provider ${providerIndex + 1}`}`);
				modelIds.add(model.id);
			}
			for (const field of ['name', 'context', 'maxOutput', 'modality', 'rateLimit']) {
				if (!isNonEmptyString(model[field])) errors.push(`${modelLocation}.${field}: expected a non-empty string`);
			}
		}
	}

	if (errors.length === 0) {
		console.log(`Validated ${data.providers.length} providers, ${modelCount} model rows, and ${footnoteIds.size} footnotes.`);
	}
	return errors;
}

let data;
try {
	data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
} catch (error) {
	console.error(`Unable to read valid JSON from ${dataPath}: ${error.message}`);
	process.exit(1);
}

const errors = validateData(data);
if (errors.length > 0) {
	console.error(`Found ${errors.length} data validation error${errors.length === 1 ? '' : 's'}:`);
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}


