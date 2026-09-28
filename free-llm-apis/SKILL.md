---
name: free-llm-apis
description: Guide users through obtaining and configuring free API keys for LLM providers. Use when the user wants to set up a free LLM API, get a free API key, connect to a free model provider, configure an OpenAI-compatible endpoint at no cost, or asks about free tiers for AI models. Triggers on "free API key", "free LLM", "set up Gemini/Groq/Mistral/etc.", "which free provider", "how to get an API key", "free model access", "configure LLM for free".
---

# Free LLM API Setup

Help users pick a free LLM provider and configure their API key. Every provider here has a permanent free tier, no credit card needed.

## Provider Selection

Ask the user what matters most, then recommend accordingly:

| Priority | Best picks |
|---|---|
| Highest rate limits | Groq (30 RPM, 14.4K RPD), Cerebras (30 RPM, 14.4K RPD) |
| Largest model selection | Cloudflare Workers AI (49+ models), OpenRouter (32+ models) |
| Strongest proprietary models | Google Gemini (Gemini 2.5 Pro), GitHub Models (GPT-4o) |
| Fastest inference | Groq, Cerebras (both optimized for speed) |
| Highest token budget | Mistral AI (1B tokens/month) |
| European provider | Mistral AI (EU), LLM7.io (UK) |
| No signup required | LLM7.io (basic tier works without token) |

### Provider categories

**Provider APIs** -- run by the companies that train the models:
- Google Gemini, Cohere, Mistral AI, Zhipu AI
- See [references/provider-apis.md](references/provider-apis.md) for setup instructions.

**Inference providers** -- third-party platforms hosting open-weight models:
- GitHub Models, NVIDIA NIM, Groq, Cerebras, Cloudflare Workers AI, LLM7.io, Kluster AI, OpenRouter, Hugging Face
- See [references/inference-providers.md](references/inference-providers.md) for setup instructions.

## Workflow

1. Ask what models, rate limits, or features the user cares about. If they already know which provider they want, skip to step 3.
2. Match their priorities against the table above. Suggest 1-2 options with a short reason.
3. Load the right reference file and walk through the setup steps for that provider (API key, code example, env var).
4. Offer a quick test script or curl command so they can confirm the key works.

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

Replace KEY, BASE_URL, and MODEL_NAME with values from the provider's setup guide.

## Key Notes

- All endpoints work with the OpenAI SDK unless noted.
- RPM = requests per minute. RPD = requests per day.
- Google Gemini's free tier is blocked in the EEA, UK, and Switzerland.
- "Limits undocumented" = the provider doesn't publish rate limits.
- Don't hardcode API keys. Use environment variables or a secrets manager.
