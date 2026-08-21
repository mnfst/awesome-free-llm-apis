import os from 'os';
import path from 'path';

const defaultStorageDir = process.env.FREE_LLM_MCP_HOME
  ? path.join(process.env.FREE_LLM_MCP_HOME, 'data')
  : path.join(os.homedir(), '.free-llm-mcp', 'data');

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  memoryStorePath: process.env.MEMORY_STORE_PATH ?? path.join(defaultStorageDir, 'memory.json'),
  cacheStorePath: process.env.CACHE_STORE_PATH ?? path.join(defaultStorageDir, 'cache.json'),
  vectorStorageRoot: process.env.VECTOR_STORAGE_ROOT ?? path.join(defaultStorageDir, 'vector-indices'),
  pricing: {
    huggingfaceMonthlyCreditsUsd: 0.10,
  },
  providers: {
    cohere: process.env.CO_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    mistral: process.env.MISTRAL_API_KEY,
    zhipu: process.env.ZHIPU_API_KEY,
    cerebras: process.env.CEREBRAS_API_KEY,
    cloudflareToken: process.env.CLOUDFLARE_API_TOKEN,
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    github: process.env.GITHUB_TOKEN,
    groq: process.env.GROQ_API_KEY,
    huggingface: process.env.HF_TOKEN,
    llm7: process.env.LLM7_API_KEY,
    nvidia: process.env.NVIDIA_API_KEY,
    ollama: process.env.OLLAMA_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    siliconflow: process.env.SILICONFLOW_API_KEY,
  },
};
