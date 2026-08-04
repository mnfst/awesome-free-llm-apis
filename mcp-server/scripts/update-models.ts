import { chromium } from 'playwright';
import fetch from 'node-fetch';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { CapabilityExtractor } from '../src/utils/capability-extractor.js';

// Utility for paths since we are in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../');
const PROVIDERS_DIR = path.join(PROJECT_ROOT, 'src/providers');
const ROUTER_FILE = path.join(PROJECT_ROOT, 'src/pipeline/middlewares/IntelligentRouterMiddleware.ts');

interface ScrapedModel {
  id: string;
  name: string;
  deprecated?: boolean;
  description?: string;
  tags?: string[];
}

// Global list of models that must always be retained because they are hardcoded in IntelligentRouterMiddleware.ts
let requiredRouterModels = new Set<string>();

/**
 * Parses IntelligentRouterMiddleware.ts to extract all hardcoded model IDs in the taskRouteMap.
 */
async function loadRequiredRouterModels() {
  try {
    if (await fs.pathExists(ROUTER_FILE)) {
      const content = await fs.readFile(ROUTER_FILE, 'utf-8');
      
      const modelRegex = /'([^'\n]+?\b[^'\n]*?)'/g;
      let match;
      while ((match = modelRegex.exec(content)) !== null) {
        const modelId = match[1].trim();
        if (
          modelId.includes('/') || 
          modelId.includes('-') || 
          /\d/.test(modelId)
        ) {
          requiredRouterModels.add(modelId);
        }
      }
      console.log(`[Init] Loaded ${requiredRouterModels.size} potential model IDs from IntelligentRouterMiddleware.`);
    }
  } catch (err: any) {
    console.error(`[Init] Warning: Could not parse IntelligentRouterMiddleware: ${err.message}`);
  }
}

/**
 * Nicely formats a raw model name or slug into a readable title.
 */
function formatModelName(id: string, name: string): string {
  let text = name ? name.trim() : '';
  const slug = id.split('/').pop() || id;

  if (!text || text.toLowerCase() === slug.toLowerCase() || text.includes('/') || text.includes('@cf/')) {
    text = slug
      .split(/[-_]/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
      .replace(/\b(It|Asr|Tts|Llm|Mo|Moe|Api|Ocr|Vlm|Vl|Pii|Bnr|Gpu|Gpus)\b/gi, m => m.toUpperCase())
      .replace(/\b3n\b/gi, '3N')
      .replace(/\b3\.1\b/gi, '3.1')
      .replace(/\b2\.7\b/gi, '2.7')
      .replace(/\b3\.5\b/gi, '3.5')
      .replace(/\b4\.6\b/gi, '4.6')
      .replace(/\b4\.5\b/gi, '4.5')
      .replace(/\b4b\b/gi, '4B')
      .replace(/\b8b\b/gi, '8B')
      .replace(/\b1b\b/gi, '1B')
      .replace(/\b3b\b/gi, '3B')
      .replace(/\b7b\b/gi, '7B')
      .replace(/\b32b\b/gi, '32B')
      .replace(/\b36b\b/gi, '36B')
      .replace(/\b17b\b/gi, '17B')
      .replace(/\b128e\b/gi, '128E')
      .replace(/\b480b\b/gi, '480B')
      .replace(/\b235b\b/gi, '235B')
      .replace(/\b31b\b/gi, '31B')
      .replace(/\b26b\b/gi, '26B')
      .replace(/\b24b\b/gi, '24B')
      .replace(/\ba4b\b/gi, 'A4B')
      .replace(/\ba35b\b/gi, 'A35B')
      .replace(/\b675b\b/gi, '675B')
      .replace(/\b120b\b/gi, '120B');
  }

  return text.trim();
}

/**
 * Filter to verify if a model belongs in our free catalogs.
 */
function isFreeModel(providerId: string, modelId: string): boolean {
  if (providerId === 'kilocode') {
    return modelId.endsWith('/free') || modelId.endsWith(':free') || modelId.includes('/free') || modelId.includes(':free');
  }
  if (providerId === 'openrouter') {
    return modelId.endsWith(':free') || modelId.includes(':free');
  }
  return true;
}

/**
 * Checks if a model ID is a menu, navigation, or legal link mistakenly parsed in NVIDIA.
 */
function isInvalidNvidiaModel(modelId: string): boolean {
  const excludeWords = [
    'terms', 'privacy', 'legal', 'contact', 'cookie', 'policy', 
    'consent', 'about-nvidia', 'discover', 'explore', 'new/public', 
    'docs', 'launch', 'support', 'help', 'blog', 'careers', 'models?'
  ];
  return excludeWords.some(w => modelId.toLowerCase().includes(w));
}

/**
 * Cleanly updates the `models` array inside a provider file.
 */
async function updateProviderFile(providerId: string, scrapedModels: ScrapedModel[]) {
  const filePath = path.join(PROVIDERS_DIR, `${providerId}.ts`);
  if (!(await fs.pathExists(filePath))) {
    console.error(`[Writer] Provider file not found: ${filePath}`);
    return;
  }

  const existingContent = await fs.readFile(filePath, 'utf-8');

  // Load existing models
  const existingModels: ScrapedModel[] = [];
  const modelMatchRegex = /\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)'\s*\}/g;
  let match;
  while ((match = modelMatchRegex.exec(existingContent)) !== null) {
    existingModels.push({
      id: match[1],
      name: match[2]
    });
  }

  // Combine and deduplicate
  const combinedMap = new Map<string, ScrapedModel>();
  const trustScraped = scrapedModels.length > 0;

  // 1. Add existing models that are required or if we don't trust the scraped catalog (fallback)
  for (const m of existingModels) {
    const isRequired = requiredRouterModels.has(m.id);
    if (!trustScraped || isRequired) {
      if (isFreeModel(providerId, m.id) && (providerId !== 'nvidia' || !isInvalidNvidiaModel(m.id))) {
        combinedMap.set(m.id, { id: m.id, name: formatModelName(m.id, m.name) });
      }
    }
  }

  // 2. Add scraped models (overwriting/updating existing if new data is available)
  for (const m of scrapedModels) {
    if (isFreeModel(providerId, m.id) && (providerId !== 'nvidia' || !isInvalidNvidiaModel(m.id))) {
      if (m.deprecated) {
        console.log(`[Scraper] Model ${m.id} is marked Deprecated by provider.`);
        continue; // Skip writing deprecated model to provider file
      }
      const cleanName = formatModelName(m.id, m.name);
      combinedMap.set(m.id, { id: m.id, name: cleanName });
    }
  }

  // 3. Ensure any required router model belonging to this provider is retained
  for (const modelId of requiredRouterModels) {
    let belongs = false;
    if (providerId === 'openrouter' && (modelId.startsWith('openrouter/') || modelId.endsWith(':free'))) {
      belongs = true;
    } else if (providerId === 'cloudflare' && modelId.startsWith('@cf/')) {
      belongs = true;
    } else if (providerId === 'nvidia' && (modelId.includes('nvidia') || modelId.includes('nemotron') || modelId.includes('maverick') || modelId.includes('step-3.5') || modelId.includes('minimax-m2.7') || modelId.includes('seed-oss') || modelId.includes('gemma-3n'))) {
      belongs = true;
    } else if (providerId === 'gemini' && (modelId.startsWith('gemini-') || modelId.startsWith('gemma-'))) {
      belongs = true;
    } else if (providerId === 'groq' && (modelId.includes('instant') || modelId.includes('versatile') || modelId.includes('groq/'))) {
      belongs = true;
    } else if (providerId === 'mistral' && (modelId.includes('mistral') || modelId.includes('ministral') || modelId.includes('codestral'))) {
      belongs = true;
    } else if (providerId === 'siliconflow' && (modelId.startsWith('Qwen/') || modelId.startsWith('DeepSeek-') || modelId.startsWith('deepseek-') || modelId.includes('GLM-') || modelId.includes('glm-'))) {
      if (modelId.includes('/') && !modelId.startsWith('openrouter/')) belongs = true;
    } else if (providerId === 'kilocode' && modelId.includes('kilo-')) {
      belongs = true;
    } else if (providerId === 'cohere' && modelId.startsWith('command-')) {
      belongs = true;
    }

    if (belongs && isFreeModel(providerId, modelId) && !combinedMap.has(modelId)) {
      combinedMap.set(modelId, {
        id: modelId,
        name: formatModelName(modelId, modelId.split('/').pop()?.replace(/-/g, ' ') || modelId)
      });
    }
  }

  const finalModels = Array.from(combinedMap.values());

  // Generate the TypeScript object array representation with strictly { id, name, capabilities, score }
  const arrayString = finalModels.map(m => {
    const text = `${m.name} ${m.id}`;
    const caps = CapabilityExtractor.extractCapabilities(text, []);
    const score = CapabilityExtractor.calculateScore(caps);
    
    const capsStr = caps.length > 0 ? `capabilities: [${caps.map(c => `'${c}'`).join(', ')}],` : '';
    const scoreStr = score > 0 ? `score: ${score},` : '';
    
    return `    { id: '${m.id}', name: '${m.name}', ${capsStr}${scoreStr} }`;
  }).join('\n');

  // Replace in file
  const unifiedRegex = /((?:readonly\s+)?models:\s*ProviderModel\[\]\s*=\s*\[)([^]*?)(\];)/;
  if (unifiedRegex.test(existingContent)) {
    const updatedContent = existingContent.replace(unifiedRegex, `$1\n${arrayString}\n  $3`);
    await fs.writeFile(filePath, updatedContent, 'utf-8');
    console.log(`[Writer] Successfully updated ${providerId}.ts with ${finalModels.length} models.`);
  } else {
    console.error(`[Writer] Could not locate models array format in ${providerId}.ts`);
  }
}

// ==================== PROVIDER SCRAPERS ====================

/**
 * Scrapes NVIDIA NIM Models Catalog.
 */
async function scrapeNvidia(browser: any): Promise<ScrapedModel[]> {
  console.log('[Scraper] Starting NVIDIA NIM Scraper...');
  const page = await browser.newPage();
  const models: ScrapedModel[] = [];

  try {
    await page.goto('https://build.nvidia.com/models?filters=nimType%3Anim_type_preview', { timeout: 30000 });
    await page.waitForSelector('a[href*="/"]', { timeout: 15000 });

    let hasNext = true;
    let pageNum = 1;

    while (hasNext && pageNum <= 10) {
      console.log(`[NVIDIA] Processing page ${pageNum}...`);
      await page.waitForTimeout(2000); // Wait for rendering

      const cards = await page.evaluate(() => {
        const items: Array<{ id: string; name: string; deprecated: boolean }> = [];
        const cardElements = document.querySelectorAll('a[href*="/"]');
        
        const excludeWords = [
          'terms', 'privacy', 'legal', 'contact', 'cookie', 'policy', 
          'consent', 'about-nvidia', 'discover', 'explore', 'new/public', 
          'docs', 'launch', 'support', 'help', 'blog', 'careers', 'models?'
        ];

        cardElements.forEach(el => {
          const href = el.getAttribute('href') || '';
          const parts = href.split('/').filter(Boolean);
          if (parts.length >= 2 && !excludeWords.some(w => href.toLowerCase().includes(w))) {
            const id = parts.slice(-2).join('/');
            const name = el.textContent?.trim() || parts[parts.length - 1];
            
            // Check parent card for Deprecated label
            let isDeprecated = false;
            let current = el.parentElement;
            for (let i = 0; i < 5 && current; i++) {
              if (current.textContent?.includes('Deprecated')) {
                isDeprecated = true;
                break;
              }
              current = current.parentElement;
            }

            if (id && id.includes('/') && !items.some(x => x.id === id)) {
              items.push({ id, name, deprecated: isDeprecated });
            }
          }
        });
        return items;
      });

      console.log(`[NVIDIA] Found ${cards.length} models on page ${pageNum}`);
      for (const c of cards) {
        models.push(c);
      }

      const nextButton = await page.$('button[aria-label="Go to next page"], button:has-text("Go to next page")');
      if (nextButton) {
        const isDisabled = await nextButton.evaluate((el: any) => el.disabled || el.getAttribute('aria-disabled') === 'true');
        if (!isDisabled) {
          await page.evaluate(() => {
            const overlay = document.getElementById('onetrust-consent-sdk') || document.querySelector('.onetrust-pc-dark-filter');
            if (overlay) overlay.remove();
          });
          await nextButton.click({ force: true });
          pageNum++;
        } else {
          hasNext = false;
        }
      } else {
        hasNext = false;
      }
    }
  } catch (err: any) {
    console.error(`[NVIDIA] Scrape failed: ${err.message}`);
  } finally {
    await page.close();
  }

  return models;
}

/**
 * Fetches OpenRouter models dynamically (strictly FREE models).
 */
async function scrapeOpenRouter(): Promise<ScrapedModel[]> {
  console.log('[Scraper] Fetching OpenRouter public models...');
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    const json = (await res.json()) as any;
    if (json && Array.isArray(json.data)) {
      return json.data
        .filter((m: any) => m.id.endsWith(':free') || m.id.includes(':free'))
        .map((m: any) => ({
          id: m.id,
          name: m.name
        }));
    }
  } catch (err: any) {
    console.error(`[OpenRouter] Failed to fetch: ${err.message}`);
  }
  return [];
}

/**
 * Fetches Kilo Code Gateway models (filtering only FREE models).
 */
async function scrapeKiloCode(): Promise<ScrapedModel[]> {
  console.log('[Scraper] Fetching Kilo Code gateway models...');
  try {
    const res = await fetch('https://api.kilo.ai/api/gateway/models');
    const json = (await res.json()) as any;
    if (json && Array.isArray(json.data)) {
      return json.data
        .filter((m: any) => m.id.endsWith('/free') || m.id.endsWith(':free') || m.id.includes('/free') || m.id.includes(':free'))
        .map((m: any) => ({
          id: m.id,
          name: m.name || m.id.split('/').pop() || m.id
        }));
    }
  } catch (err: any) {
    console.error(`[KiloCode] Failed to fetch: ${err.message}`);
  }
  return [];
}

/**
 * Fetches LLM7 models.
 */
async function scrapeLLM7(): Promise<ScrapedModel[]> {
  console.log('[Scraper] Fetching LLM7.io models...');
  try {
    const res = await fetch('https://api.llm7.io/v1/models');
    const json = (await res.json()) as any;
    const array = Array.isArray(json) ? json : json?.data || [];
    if (Array.isArray(array)) {
      return array.map((m: any) => ({
        id: m.id,
        name: m.name || m.id.split('/').pop() || m.id
      }));
    }
  } catch (err: any) {
    console.error(`[LLM7] Failed to fetch: ${err.message}`);
  }
  return [];
}

/**
 * Scrapes Gemini models using API or rate-limits documentation page.
 */
async function scrapeGemini(browser: any): Promise<ScrapedModel[]> {
  console.log('[Scraper] Scraping Gemini models...');
  const models: ScrapedModel[] = [];

  if (process.env.GEMINI_API_KEY) {
    try {
      console.log('[Gemini] Fetching programmatically with API key...');
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
      const json = (await res.json()) as any;
      if (json && Array.isArray(json.models)) {
        return json.models.map((m: any) => ({
          id: m.name.replace('models/', ''),
          name: m.displayName
        }));
      }
    } catch (err: any) {
      console.error(`[Gemini] Programmatic fetch failed: ${err.message}. Falling back to web scraping...`);
    }
  }

  const page = await browser.newPage();
  try {
    await page.goto('https://aistudio.google.com/rate-limits', { timeout: 20000 });
    await page.waitForTimeout(3000);
    
    const pageModels = await page.evaluate(() => {
      const items: ScrapedModel[] = [];
      const tables = document.querySelectorAll('table');
      tables.forEach(table => {
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const modelName = cells[0].textContent?.trim() || '';
            if (modelName.toLowerCase().startsWith('gemini') || modelName.toLowerCase().startsWith('gemma')) {
              items.push({
                id: modelName.toLowerCase().replace(/\s+/g, '-'),
                name: modelName
              });
            }
          }
        });
      });
      return items;
    });

    for (const m of pageModels) {
      if (!models.some(x => x.id === m.id)) {
        models.push(m);
      }
    }
  } catch (err: any) {
    console.error(`[Gemini] Web scraping rate-limits page failed: ${err.message}`);
  } finally {
    await page.close();
  }

  return models;
}

/**
 * Scrapes Cloudflare Workers AI models via dynamic page scraping.
 */
async function scrapeCloudflare(browser: any): Promise<ScrapedModel[]> {
  console.log('[Scraper] Scraping Cloudflare Workers AI models...');
  const page = await browser.newPage();
  const models: ScrapedModel[] = [];

  try {
    await page.goto('https://developers.cloudflare.com/workers-ai/models/', { timeout: 30000 });
    await page.waitForSelector('a[href*="@cf/"], code', { timeout: 15000 });

    const pageModels = await page.evaluate(() => {
      const items: ScrapedModel[] = [];
      const codes = document.querySelectorAll('code');
      codes.forEach(el => {
        const text = el.textContent?.trim() || '';
        if (text.startsWith('@cf/')) {
          const id = text.split(' ')[0];
          const name = id.split('/').pop() || id;
          if (!items.some(x => x.id === id)) {
            items.push({ id, name });
          }
        }
      });
      return items;
    });

    for (const m of pageModels) {
      models.push(m);
    }
  } catch (err: any) {
    console.error(`[Cloudflare] Scraping failed: ${err.message}. Falling back to static llms.txt...`);
    try {
      const res = await fetch('https://developers.cloudflare.com/workers-ai/models/llms.txt');
      const text = await res.text();
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.includes('@cf/')) {
          const match = line.match(/@cf\/[^\s)\]]+/);
          if (match) {
            const id = match[0];
            const name = id.split('/').pop() || id;
            models.push({ id, name });
          }
        }
      }
    } catch (e: any) {
      console.error(`[Cloudflare] Fallback llms.txt failed: ${e.message}`);
    }
  } finally {
    await page.close();
  }

  return models;
}

/**
 * Scrapes SiliconFlow models.
 */
async function scrapeSiliconFlow(): Promise<ScrapedModel[]> {
  console.log('[Scraper] Scraping SiliconFlow models...');
  try {
    const res = await fetch('https://docs.siliconflow.com/llms.txt');
    const text = await res.text();
    const models: ScrapedModel[] = [];
    
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.includes('/') && !line.startsWith('http') && line.trim().length > 3) {
        const cleanLine = line.replace(/^[-\*\s]+/, '').trim();
        const id = cleanLine.split(' ')[0].trim();
        if (id.includes('/') && !id.includes('.') && !id.includes('(')) {
          const name = id.split('/').pop()?.replace(/-/g, ' ') || id;
          models.push({ id, name });
        }
      }
    }
    return models;
  } catch (err: any) {
    console.error(`[SiliconFlow] Failed to parse llms.txt: ${err.message}`);
  }
  return [];
}

/**
 * Scrapes other models dynamically or fallback-based matching.
 */
async function scrapeFallbackProvider(providerId: string): Promise<ScrapedModel[]> {
  console.log(`[Scraper] Generating task/router matched model catalog for ${providerId}...`);
  const models: ScrapedModel[] = [];
  
  // Scrapes and matches models for other providers: groq, mistral, cohere, cerebras, zhipu, ollama-cloud, huggingface
  for (const mId of requiredRouterModels) {
    let belongs = false;
    if (providerId === 'groq' && (mId.includes('instant') || mId.includes('versatile') || mId.startsWith('groq/'))) {
      belongs = true;
    } else if (providerId === 'mistral' && (mId.includes('mistral') || mId.includes('ministral') || mId.includes('codestral'))) {
      belongs = true;
    } else if (providerId === 'cohere' && mId.startsWith('command-')) {
      belongs = true;
    } else if (providerId === 'cerebras' && (mId.includes('cerebras') || mId.includes('llama3-') || mId.includes('deepseek-r1'))) {
      belongs = true;
    } else if (providerId === 'huggingface' && (mId.includes('huggingface') || mId.includes('Mistral-7B'))) {
      belongs = true;
    } else if (providerId === 'zhipu' && mId.includes('glm-')) {
      belongs = true;
    } else if (providerId === 'ollama-cloud' && mId.includes('ollama')) {
      belongs = true;
    }

    if (belongs) {
      models.push({
        id: mId,
        name: formatModelName(mId, mId.split('/').pop() || mId)
      });
    }
  }

  return models;
}

/**
 * Main execution orchestration.
 */
async function main() {
  console.log('[Scraper] Starting Weekly Provider Models Scraper Cron...');
  
  // 1. Initial setups
  await loadRequiredRouterModels();

  // 2. Initialize Browser
  const browser = await chromium.launch({ headless: true });

  const providers = [
    'nvidia', 'openrouter', 'kilocode', 'llm7', 
    'cloudflare', 'siliconflow', 'groq', 'mistral', 'cohere', 
    'cerebras', 'huggingface', 'zhipu', 'ollama-cloud'
  ];

  try {
    for (const provider of providers) {
      let models: ScrapedModel[] = [];
      if (provider === 'nvidia') {
        models = await scrapeNvidia(browser);
      } else if (provider === 'openrouter') {
        models = await scrapeOpenRouter();
      } else if (provider === 'kilocode') {
        models = await scrapeKiloCode();
      } else if (provider === 'llm7') {
        models = await scrapeLLM7();
      } else if (provider === 'cloudflare') {
        models = await scrapeCloudflare(browser);
      } else if (provider === 'siliconflow') {
        models = await scrapeSiliconFlow();
      } else {
        models = await scrapeFallbackProvider(provider);
      }

      if (models.length > 0) {
        await updateProviderFile(provider, models);
      } else {
        console.log(`[Scraper] Warning: No models found or scraped for ${provider}`);
      }
    }

    console.log('[Scraper] Weekly model scraping completed successfully for all targeted providers.');
  } catch (err: any) {
    console.error(`[Scraper] Master job failed: ${err.message}`);
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('[Scraper] Critical Unhandled Error:', err);
  process.exit(1);
});
