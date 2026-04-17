'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data.json'), 'utf8'));

function renderProvider(provider) {
  let s = '';

  s += `### [${provider.name}](${provider.url}) ${provider.flag}\n\n`;

  let desc = provider.description;
  if (provider.footnoteRef !== undefined) {
    desc += ` [^${provider.footnoteRef}]`;
  }
  s += `${desc}\n\n`;

  s += `| Model Name | Context | Max Output | Modality | Rate Limit |\n`;
  s += `|---|---|---|---|---|\n`;
  for (const model of provider.models) {
    s += `| ${model.name} | ${model.context} | ${model.maxOutput} | ${model.modality} | ${model.rateLimit} |\n`;
  }
  s += '\n';

  return s;
}

const providerApis = data.providers
  .filter(p => p.category === 'provider_api')
  .sort((a, b) => a.name.localeCompare(b.name));

const inferenceProviders = data.providers
  .filter(p => p.category === 'inference_provider')
  .sort((a, b) => a.name.localeCompare(b.name));

let md = '';

md += `<div align="center">
\t<br>
\t<img src="media/awesome-free-llm-apis.png" width="500" alt="Awesome Free LLM APIs">
\t<br>
\t<br>
\t<a href="https://awesome.re">
\t\t<img src="https://awesome.re/badge-flat2.svg" alt="Awesome">
\t</a>
\t<br>
\t<br>
\t<p>LLM APIs with permanent free tiers for text inference.</p>
\t<br>
\t<br>
</div>

## Contents

- [Provider APIs](#provider-apis)
- [Inference providers](#inference-providers)

## Provider APIs

APIs run by the companies that train or fine-tune the models themselves.

`;

for (const provider of providerApis) {
  md += renderProvider(provider);
}

md += `## Inference providers

Third-party platforms that host open-weight models from various sources.

`;

for (const provider of inferenceProviders) {
  md += renderProvider(provider);
}

md += `## Contributing

Know a free tier that's missing? [Open a PR](contributing.md). Include the provider, endpoint, rate limits (link to their docs), and a few notable models. Trial credits and time-limited promos don't count.

## Glossary

| Abbreviation | Meaning |
|---|---|
| **RPM** | Requests per minute |
| **RPD** | Requests per day |
| **TPM** | Tokens per minute |
| **TPD** | Tokens per day |
| **RPS** | Requests per second |

## Notes

- All endpoints are OpenAI SDK-compatible unless noted.
- Each link points to the provider's API key page.

`;

const sortedFootnotes = [...data.footnotes].sort((a, b) => a.id - b.id);
for (const fn of sortedFootnotes) {
  md += `[^${fn.id}]: ${fn.text}\n`;
}

fs.writeFileSync(path.join(root, 'README.md'), md);
console.log('README.md generated successfully');
