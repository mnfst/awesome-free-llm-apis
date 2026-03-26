<div align="center">
	<br>
	<img src="media/awesome-free-llm-apis.png" width="500" alt="Awesome Free LLM APIs">
	<br>
	<br>
	<a href="https://awesome.re">
		<img src="https://awesome.re/badge-flat2.svg" alt="Awesome">
	</a>
	<br>
	<br>
	<p>LLM APIs with permanent free tiers for text inference.</p>
	<br>
	<br>
</div>

## Contents

- [Provider APIs](#provider-apis)
- [Inference providers](#inference-providers)

## Provider APIs

APIs run by the companies that train or fine-tune the models themselves.

- [Cohere](https://dashboard.cohere.com/api-keys) 🇺🇸 - Command A, Command R+, Aya Expanse 32B +9 more. 20 RPM, 1K/mo.
- [Google Gemini](https://aistudio.google.com/app/apikey) 🇺🇸 - Gemini 2.5 Pro, Flash, Flash-Lite +4 more. 5-15 RPM, 100-1K RPD. [^1]
- [Mistral AI](https://console.mistral.ai/api-keys) 🇪🇺 - Mistral Large 3, Small 3.1, Ministral 8B +3 more. 1 req/s, 1B tok/mo.
- [Zhipu AI](https://open.bigmodel.cn/usercenter/apikeys) 🇨🇳 - GLM-4.7-Flash, GLM-4.5-Flash, GLM-4.6V-Flash. Limits undocumented.

## Inference providers

Third-party platforms that host open-weight models from various sources.

- [AIHubMix](https://console.aihubmix.com/token) 🇺🇸 - GPT-4o, Gemini 3.1 Flash, GLM-5 +17 more. 5 RPM, 500 RPD.
- [Cerebras](https://cloud.cerebras.ai/) 🇺🇸 - Llama 3.3 70B, Qwen3 235B, GPT-OSS-120B +3 more. 30 RPM, 14,400 RPD.
- [Cloudflare Workers AI](https://dash.cloudflare.com/profile/api-tokens) 🇺🇸 - Llama 3.3 70B, Qwen QwQ 32B +47 more. 10K neurons/day.
- [GitHub Models](https://github.com/marketplace/models) 🇺🇸 - GPT-4o, Llama 3.3 70B, DeepSeek-R1 +more. 10-15 RPM, 50-150 RPD.
- [Groq](https://console.groq.com/keys) 🇺🇸 - Llama 3.3 70B, Llama 4 Scout, Kimi K2 +17 more. 30 RPM, 1K RPD (14,400 for Llama 3.1 8B). [^3]
- [Hugging Face](https://huggingface.co/settings/tokens) 🇺🇸 - Llama 3.3 70B, Qwen2.5 72B, Mistral 7B +many more. $0.10/mo in free credits.
- [Kluster AI](https://platform.kluster.ai/apikeys) 🇺🇸 - DeepSeek-R1, Llama 4 Maverick, Qwen3-235B +2 more. Limits undocumented.
- [LLM7.io](https://token.llm7.io) 🇬🇧 - DeepSeek R1, Flash-Lite, Qwen2.5 Coder +27 more. 30 RPM (120 with token).
- [NVIDIA NIM](https://build.nvidia.com/explore/discover) 🇺🇸 - Llama 3.3 70B, Mistral Large, Qwen3 235B +more. 40 RPM.
- [Ollama Cloud](https://ollama.com/settings/keys) 🇺🇸 - DeepSeek-V3.2, Qwen3.5, Kimi-K2.5 +17 more. 1 concurrent model, light usage. [^2]
- [OpenRouter](https://openrouter.ai/keys) 🇺🇸 - DeepSeek R1, Llama 3.3 70B, GPT-OSS-120B +29 more. 20 RPM, 50 RPD (1K with $10+ in purchased credits). [^4]
- [SiliconFlow](https://cloud.siliconflow.cn/account/ak) 🇨🇳 - Qwen3-8B, DeepSeek-R1-Distill-Qwen-7B, GLM-4.1V-9B-Thinking +10 more. 1K RPM, 50K TPM.

## Contributing

Know a free tier that's missing? [Open a PR](contributing.md). Include the provider, endpoint, rate limits (link to their docs), and a few notable models. Trial credits and time-limited promos don't count.

## Footnotes

- **RPM** -- requests per minute. **RPD** -- requests per day.
- "Limits undocumented" means the provider doesn't publish their rate limits.
- All endpoints are OpenAI SDK-compatible unless noted.
- Each link points to the provider's API key page.
- [^1]: Free tier not available in the EU, UK, or Switzerland ([available regions](https://ai.google.dev/gemini-api/docs/available-regions)).
- [^2]: Ollama Cloud measures usage by GPU time, not tokens or requests. Free tier described as "light usage" with session limits resetting every 5 hours and weekly limits every 7 days. Pro (50x more) and Max (250x more) plans available. Not OpenAI SDK-compatible; uses [Ollama API](https://docs.ollama.com/cloud).
- [^3]: 14,400 RPD only applies to Llama 3.1 8B Instant. Most other models (Llama 3.3 70B, Llama 4 Scout, Kimi K2, etc.) are limited to 1,000 RPD ([rate limits](https://console.groq.com/docs/rate-limits)).
- [^4]: Free models default to 50 RPD. A one-time purchase of $10+ in credits unlocks 1,000 RPD for free models. OpenRouter also offers a [Free Models Router](https://openrouter.ai/docs/guides/routing/routers/free-models-router) (`openrouter/free`) and [model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks) for chaining models in priority order.
