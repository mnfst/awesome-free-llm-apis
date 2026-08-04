#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));

const HEADER = `<h1 align="center">
\t<a href="https://github.com/mnfst/awesome-free-llm-apis">
\t\t<img src="media/awesome-free-llm-apis.png" width="500" alt="Awesome Free LLM APIs">
\t</a>
</h1>

<p align="center">
\t<a href="https://awesome.re">
\t\t<img src="https://awesome.re/badge-flat2.svg" alt="Awesome">
\t</a>
</p>

<p align="center">LLM APIs with permanent free tiers for text inference.</p>

<p align="center"><sub>All endpoints are OpenAI SDK-compatible unless noted. Each link points to the provider's API key page.</sub></p>

<hr>

<p align="center">
\t<a href="https://manifest.build">
\t\t<picture>
\t\t\t<source media="(prefers-color-scheme: dark)" srcset="media/manifest-logo-dark.png">
\t\t\t<img src="media/manifest-logo-light.png" width="240" alt="Manifest">
\t\t</picture>
\t</a>
</p>

<p align="center"><em>All of those free LLM APIs are available at <a href="https://manifest.build">manifest.build</a> - make reliable agents.</em></p>`;

function alignTable(header, rows) {
	const widths = header.map((cell, i) => {
		const longestRow = rows.reduce((max, row) => Math.max(max, row[i].length), 0);
		return Math.max(cell.length, longestRow, 3);
	});
	const pad = (cell, i) => cell + ' '.repeat(widths[i] - cell.length);
	const formatRow = cells => `| ${cells.map(pad).join(' | ')} |`;
	const separator = `| ${widths.map(w => '-'.repeat(w)).join(' | ')} |`;
	return [formatRow(header), separator, ...rows.map(formatRow)].join('\n');
}

function formatModelName(name) {
	return /[/:]/.test(name) ? `\`${name}\`` : name;
}

function buildTable(models) {
	const header = ['Model Name', 'Context', 'Max Output', 'Modality', 'Rate Limit'];
	const rows = models.map(m => [formatModelName(m.name), m.context, m.maxOutput, m.modality, m.rateLimit]);
	return alignTable(header, rows);
}

function buildProviderSection(provider) {
	const desc = provider.footnoteRef != null
		? `${provider.description} [^${provider.footnoteRef}]`
		: provider.description;
	const parts = [
		`### [${provider.name}](${provider.url}) ${provider.flag}`,
		'',
		desc,
	];
	if (provider.baseUrl != null) {
		parts.push('', `Base URL: \`${provider.baseUrl}\``);
	}
	parts.push('', buildTable(provider.models));
	return parts.join('\n');
}

const providerAPIs = data.providers
	.filter(p => p.category === 'provider_api')
	.sort((a, b) => a.name.localeCompare(b.name));

const inferenceProviders = data.providers
	.filter(p => p.category === 'inference_provider')
	.sort((a, b) => a.name.localeCompare(b.name));

const glossaryTable = alignTable(
	['Abbreviation', 'Meaning'],
	data.glossary.map(g => [`**${g.abbreviation}**`, g.meaning]),
);

const footnoteLines = data.footnotes
	.sort((a, b) => a.id - b.id)
	.map(f => `[^${f.id}]: ${f.text}`)
	.join('\n');

const parts = [
	HEADER,
	'',
	'## Contents',
	'',
	'- [Provider APIs](#provider-apis)',
	'- [Inference providers](#inference-providers)',
	'- [Glossary](#glossary)',
	'',
	'## Provider APIs',
	'',
	'APIs run by the companies that train or fine-tune the models themselves.',
	'',
	providerAPIs.map(buildProviderSection).join('\n\n'),
	'',
	'## Inference providers',
	'',
	'Third-party platforms that host open-weight models from various sources.',
	'',
	inferenceProviders.map(buildProviderSection).join('\n\n'),
	'',
	'## Glossary',
	'',
	glossaryTable,
	'',
	'## Contributing',
	'',
	'Know a free tier that\'s missing? [Open a PR](contributing.md). Include the provider, endpoint, rate limits (link to their docs), and a few notable models. Trial credits and time-limited promos don\'t count.',
	'',
	footnoteLines,
	'',
];

const output = parts.join('\n');
fs.writeFileSync(path.join(ROOT, 'README.md'), output);
console.log('README.md generated successfully.');
