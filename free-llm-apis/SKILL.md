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
| Fastest inference | Groq (LPU hardware; ~1,000 RPD on chat models) |
| Largest model selection | NVIDIA NIM (100+ models), Cloudflare Workers AI (60+), Hugging Face (thousands, small credit) |
| Strongest proprietary models | Google Gemini, Mistral AI, Cohere (non-commercial only) |
| Free frontier open-weight models | OpenRouter (`:free` models), Kilo Code, Ollama Cloud, NVIDIA NIM |
| European provider / EU hosting | Mistral AI (FR), OVHcloud AI Endpoints (FR, EU data centers), LLM7.io (UK) |
| No signup or key required | OVHcloud AI Endpoints (2 RPM/IP), Kilo Code (200 req/hr/IP), LLM7.io (anonymous tier) |
| Privacy-sensitive prompts | Avoid Gemini free tier, Mistral free mode (unless opted out), OpenRouter/Kilo free routes, NVIDIA trial endpoints |

### Provider categories

<!-- providers:start -->
**Provider APIs** -- run by the companies that train the models:
- Aion Labs, Cohere, Google Gemini, Mistral AI, Z AI (Zhipu AI)
- See [references/provider-apis.md](references/provider-apis.md) for setup instructions.

**Inference providers** -- third-party platforms hosting open-weight models:
- Cloudflare Workers AI, Groq, Hugging Face, Kilo Code (no key needed), LLM7.io (no key needed), ModelScope, NVIDIA NIM, Ollama Cloud, OpenRouter, OVHcloud AI Endpoints (no key needed), SiliconFlow
- See [references/inference-providers.md](references/inference-providers.md) for setup instructions.
<!-- providers:end -->

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
- Google Gemini's free tier works in the EEA, UK, and Switzerland, but its terms require paid services if you ship an app to users there.
- Free tiers, model lists, and limits change often. The reference files are generated from `data.json`; check the provider's own docs before relying on a limit.
- "Limits undocumented" = the provider doesn't publish rate limits.
- Don't hardcode API keys. Use environment variables or a secrets manager.
