---
name: free-llm-apis
description: Guide users through obtaining and configuring free API keys for LLM providers, including providers that need no key at all. Use when the user wants to set up a free LLM API, get a free API key, connect to a free model provider, configure an OpenAI-compatible endpoint at no cost, or asks about free tiers for AI models. Triggers on "free API key", "free LLM", "set up Gemini/Groq/Mistral/etc.", "which free provider", "how to get an API key", "free model access", "configure LLM for free", "LLM API without a key".
---

# Free LLM API Setup

Help users pick a free LLM provider and configure it. Every provider here has a permanent free tier with no credit card; three of them need no API key at all.

Provider data follows the repository's `data.json` (2026-10-05, plus the 2026-10-08 nightly refresh) and live checks run on 2026-10-08. Free tiers and model lists change often: before hardcoding a model ID, list the provider's current models (`GET {base_url}models`).

## Provider Selection

Ask the user what matters most, then recommend accordingly:

| Priority | Best picks |
|---|---|
| No signup, no key | Kilo Code (200 req/hour per IP), LLM7.io (anonymous `turbo` models), OVHcloud AI Endpoints (2 RPM per IP per model) |
| Strongest free models | Google Gemini (`gemini-3.8-flash`, 1M context, multimodal), NVIDIA Nemotron 3 Ultra 550B (NVIDIA NIM, OpenRouter, Kilo Code), Mistral AI (Medium 3.5, Large 3) |
| Highest daily volume | NVIDIA NIM (40 RPM, 10,000 RPD), Groq (30 RPM, 1,000 RPD), Cloudflare Workers AI (10K neurons/day) |
| Fastest inference | Groq (LPU inference) |
| Largest model selection | Cloudflare Workers AI (60+ models), OpenRouter (17 free models), Hugging Face (credit-metered) |
| Highest token budget | Mistral AI ($10/month in API credits on the free plan) |
| European provider | Mistral AI (FR), OVHcloud AI Endpoints (FR, EU data centers) |
| Prompts not used for training | Google Gemini for users in the EEA, Switzerland and the UK |

### Provider categories

**Provider APIs** -- run by the companies that train the models:
- Google Gemini, Mistral AI, Cohere, Z AI (Zhipu AI), Aion Labs
- See [references/provider-apis.md](references/provider-apis.md) for setup instructions.

**Inference providers** -- third-party platforms hosting open-weight models:
- No key needed: Kilo Code, LLM7.io, OVHcloud AI Endpoints
- Free key: NVIDIA NIM, Groq, Cloudflare Workers AI, OpenRouter, Ollama Cloud, Hugging Face
- Mainland-China identity verification required: ModelScope, SiliconFlow
- See [references/inference-providers.md](references/inference-providers.md) for setup instructions.

## Workflow

1. Ask what models, rate limits, or features the user cares about. If they already know which provider they want, skip to step 3. If they want to try something right now with no signup, start with Kilo Code or LLM7.io.
2. Match their priorities against the table above. Suggest 1-2 options with a short reason.
3. Load the right reference file and walk through the setup steps for that provider (API key, code example, env var).
4. Offer a quick test script or curl command so they can confirm the setup works.

## Quick Test Template

After setup, use this to verify any provider:

```python
from openai import OpenAI

client = OpenAI(api_key="KEY", base_url="BASE_URL")

response = client.chat.completions.create(
    model="MODEL_NAME",
    messages=[{"role": "user", "content": "Say hello in one sentence."}],
    max_tokens=50
)
print(response.choices[0].message.content)
```

Replace KEY, BASE_URL, and MODEL_NAME with values from the provider's setup guide. For keyless providers use `api_key="anonymous"`: the OpenAI SDK requires a non-empty key, and Kilo Code rejects arbitrary placeholders such as `"unused"` with HTTP 401.

## No longer free or no longer available

Older guides still mention these; do not recommend them:

- **GitHub Models** -- fully retired on 2026-07-30 (playground, catalog and inference API).
- **Cerebras** -- removed on 2026-08-19: the free tier was replaced by one-time credits behind a mandatory payment method.
- **Kluster AI** -- `api.kluster.ai` no longer resolves (checked 2026-10-08).

## Key Notes

- All endpoints work with the OpenAI SDK unless noted. Cloudflare uses its `/ai/v1` OpenAI-compatible path, Cohere its Compatibility API, Ollama Cloud `https://ollama.com/v1`.
- RPM = requests per minute. RPD = requests per day. TPD = tokens per day.
- Google Gemini's free tier is available in the EU, UK and Switzerland. Google's terms still require Paid Services if you make an API client available to users there, and Google no longer publishes per-model free limits (check AI Studio).
- Free model IDs rotate fast (Kilo Code, LLM7.io, OpenRouter). A 404, 410 or "model unavailable" error usually means the model was retired: list the provider's models and pick a current one.
- Free pools may log prompts: do not send personal or confidential data to OpenRouter or Kilo Code free models, NVIDIA trial endpoints, or Mistral free mode (unless you opt out).
- Don't hardcode API keys. Use environment variables or a secrets manager.
