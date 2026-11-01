'use strict';

// Shared by the README and Skill generators.
const SETUP = {
  'aion labs':             { env: 'AION_API_KEY' },
  'cohere':                { env: 'COHERE_API_KEY', openaiBaseUrl: 'https://api.cohere.ai/compatibility/v1' },
  'google gemini':         { env: 'GEMINI_API_KEY', openaiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/' },
  'mistral ai':            { env: 'MISTRAL_API_KEY' },
  'z ai (zhipu ai)':       { env: 'ZAI_API_KEY' },
  'cloudflare workers ai': { env: 'CF_API_TOKEN', extraEnv: { CF_ACCOUNT_ID: 'your-account-id' },
                             openaiBaseUrl: 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1' },
  'gonka broker':          { env: 'GONKA_API_KEY' },
  'groq':                  { env: 'GROQ_API_KEY' },
  'hugging face':          { env: 'HF_API_KEY' },
  // Kilo Code rejects placeholder keys such as "none" and only accepts the literal "anonymous".
  'kilo code':             { env: 'KILO_API_KEY', keyless: true, anonymousKey: 'anonymous' },
  'llm7.io':               { env: 'LLM7_API_KEY', keyless: true },
  'modelscope':            { env: 'MODELSCOPE_API_KEY' },
  'nvidia nim':            { env: 'NVIDIA_API_KEY' },
  'ollama cloud':          { env: 'OLLAMA_API_KEY', openaiBaseUrl: 'https://ollama.com/v1' },
  'openrouter':            { env: 'OPENROUTER_API_KEY' },
  // OVHcloud rejects every Bearer value on its anonymous tier, and the OpenAI SDK always sends one,
  // so the keyless example is a plain HTTP call without an Authorization header.
  'ovhcloud ai endpoints': { env: 'OVH_API_KEY', keyless: true, noBearer: true },
  'siliconflow':           { env: 'SILICONFLOW_API_KEY' },
};

module.exports = SETUP;
