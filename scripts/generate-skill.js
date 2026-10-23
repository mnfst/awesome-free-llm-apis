#!/usr/bin/env node
'use strict';

// Regenerates the free-llm-apis skill's reference files (and the provider list
// in SKILL.md) from data.json, so the skill never drifts from the README.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKILL_DIR = path.join(ROOT, 'free-llm-apis');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data.json'), 'utf8'));

// Per-provider setup details that data.json does not carry. `openaiBaseUrl`
// overrides baseUrl when the native API is not OpenAI-compatible. Env var names
// match scripts/verify-providers.js.
const SETUP = {
  'aion labs':             { env: 'AION_API_KEY' },
  'cohere':                { env: 'COHERE_API_KEY', openaiBaseUrl: 'https://api.cohere.ai/compatibility/v1' },
  'google gemini':         { env: 'GEMINI_API_KEY', openaiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/' },
  'mistral ai':            { env: 'MISTRAL_API_KEY' },
  'z ai (zhipu ai)':       { env: 'ZAI_API_KEY' },
  'cloudflare workers ai': { env: 'CF_API_TOKEN', extraEnv: { CF_ACCOUNT_ID: 'your-account-id' },
                             openaiBaseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1' },
  'groq':                  { env: 'GROQ_API_KEY' },
  'hugging face':          { env: 'HF_API_KEY' },
  'kilo code':             { env: 'KILO_API_KEY', keyless: true },
  'llm7.io':               { env: 'LLM7_API_KEY', keyless: true },
  'modelscope':            { env: 'MODELSCOPE_API_KEY' },
  'nvidia nim':            { env: 'NVIDIA_API_KEY' },
  'ollama cloud':          { env: 'OLLAMA_API_KEY', openaiBaseUrl: 'https://ollama.com/v1' },
  'openrouter':            { env: 'OPENROUTER_API_KEY' },
  'ovhcloud ai endpoints': { env: 'OVH_API_KEY', keyless: true },
  'siliconflow':           { env: 'SILICONFLOW_API_KEY' },
};

const CATEGORIES = {
  provider_api: {
    file: 'provider-apis.md',
    title: 'Provider APIs - Setup Guides',
    intro: 'APIs run by the companies that train or fine-tune the models themselves.',
  },
  inference_provider: {
    file: 'inference-providers.md',
    title: 'Inference Providers - Setup Guides',
    intro: 'Third-party platforms that host open-weight models from various sources.',
  },
};

function setupFor(provider) {
  const s = SETUP[provider.name.toLowerCase()];
  if (!s) throw new Error(`No SETUP entry for provider "${provider.name}" in scripts/generate-skill.js`);
  return s;
}

function exampleModel(provider) {
  const m = provider.models.find(m => m.id && !m.id.startsWith('+') && !m.id.includes(' '));
  return m ? m.id : 'MODEL_ID';
}

function escapeCell(s) {
  return String(s ?? '').replace(/\|/g, '\\|');
}

function renderProvider(p) {
  const s = setupFor(p);
  const baseUrl = s.openaiBaseUrl || p.baseUrl;
  const pyBaseUrl = baseUrl.includes('{account_id}')
    ? `f"${baseUrl.replace('{account_id}', '{os.environ[\'CF_ACCOUNT_ID\']}')}"`
    : `"${baseUrl}"`;
  const shBaseUrl = baseUrl.replace('{account_id}', '$CF_ACCOUNT_ID').replace(/\/$/, '');
  const model = exampleModel(p);
  const footnote = p.footnoteRef != null ? data.footnotes.find(f => f.id === p.footnoteRef) : null;
  const apiKeyExpr = s.keyless ? `os.environ.get("${s.env}", "none")` : `os.environ["${s.env}"]`;

  const lines = [];
  lines.push(`## ${p.name} ${p.flag || ''}`.trimEnd(), '');
  lines.push(p.description, '');
  if (footnote) lines.push(`**Notes:** ${footnote.text}`, '');
  lines.push(`**Get a key:** ${p.url}${s.keyless ? ' (optional: free models work without a key)' : ''}`, '');
  lines.push(`**OpenAI-compatible base URL:** \`${baseUrl}\``);
  if (s.openaiBaseUrl) lines.push(`(native API: \`${p.baseUrl}\`)`);
  lines.push('');

  lines.push('### Models', '');
  lines.push('| Model ID | Context | Modality | Rate limit |');
  lines.push('| --- | --- | --- | --- |');
  for (const m of p.models) {
    const id = m.id || m.name;
    const idCell = id.startsWith('+') ? escapeCell(id) : `\`${escapeCell(id)}\``;
    lines.push(`| ${idCell} | ${escapeCell(m.context)} | ${escapeCell(m.modality)} | ${escapeCell(m.rateLimit)} |`);
  }
  lines.push('');

  lines.push('### Environment variable', '', '```bash');
  lines.push(`export ${s.env}="your-key-here"`);
  for (const [k, v] of Object.entries(s.extraEnv || {})) lines.push(`export ${k}="${v}"`);
  lines.push('```', '');

  lines.push('### Usage example', '', '```python');
  lines.push('import os');
  lines.push('from openai import OpenAI', '');
  lines.push('client = OpenAI(');
  lines.push(`    api_key=${apiKeyExpr},`);
  lines.push(`    base_url=${pyBaseUrl},`);
  lines.push(')', '');
  lines.push('response = client.chat.completions.create(');
  lines.push(`    model="${model}",`);
  lines.push('    messages=[{"role": "user", "content": "Say hello in one sentence."}],');
  lines.push(')');
  lines.push('print(response.choices[0].message.content)');
  lines.push('```', '');

  lines.push('### Quick test', '', '```bash');
  lines.push(`curl -s ${shBaseUrl}/chat/completions \\`);
  if (!s.keyless) lines.push(`  -H "Authorization: Bearer $${s.env}" \\`);
  lines.push('  -H "Content-Type: application/json" \\');
  lines.push(`  -d '{"model": "${model}", "messages": [{"role": "user", "content": "Say hello"}]}'`);
  lines.push('```', '');

  return lines.join('\n');
}

function renderReference(category, providers) {
  const c = CATEGORIES[category];
  const header = [
    `# ${c.title}`,
    '',
    c.intro,
    '',
    `<!-- Generated from data.json by scripts/generate-skill.js (data last updated ${data.lastUpdated}). Do not edit by hand. -->`,
    '',
    '',
  ].join('\n');
  return header + providers.map(renderProvider).join('\n---\n\n');
}

function renderSkillProviderList() {
  const out = [];
  for (const [category, c] of Object.entries(CATEGORIES)) {
    const names = data.providers.filter(p => p.category === category).map(p => {
      const s = setupFor(p);
      return s.keyless ? `${p.name} (no key needed)` : p.name;
    });
    const label = category === 'provider_api'
      ? '**Provider APIs** -- run by the companies that train the models:'
      : '**Inference providers** -- third-party platforms hosting open-weight models:';
    out.push(label, `- ${names.join(', ')}`, `- See [references/${c.file}](references/${c.file}) for setup instructions.`, '');
  }
  return out.join('\n').trimEnd();
}

for (const category of Object.keys(CATEGORIES)) {
  const providers = data.providers.filter(p => p.category === category);
  fs.writeFileSync(path.join(SKILL_DIR, 'references', CATEGORIES[category].file), renderReference(category, providers));
}

const skillPath = path.join(SKILL_DIR, 'SKILL.md');
const skill = fs.readFileSync(skillPath, 'utf8');
const START = '<!-- providers:start -->';
const END = '<!-- providers:end -->';
const i = skill.indexOf(START);
const j = skill.indexOf(END);
if (i === -1 || j === -1) throw new Error(`SKILL.md is missing the ${START} / ${END} markers`);
fs.writeFileSync(skillPath, skill.slice(0, i + START.length) + '\n' + renderSkillProviderList() + '\n' + skill.slice(j));

console.log('Skill references generated successfully.');
