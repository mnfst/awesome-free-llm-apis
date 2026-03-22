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

- [Google Gemini](https://aistudio.google.com/app/apikey) 🇺🇸 - Gemini 2.5 Pro, Flash, Flash-Lite +4 more. 5-15 RPM, 100-1K RPD. [^1]
- [Cohere](https://dashboard.cohere.com/api-keys) 🇺🇸 - Command A, Command R+, Aya Expanse 32B +9 more. 20 RPM, 1K/mo.
- [Mistral AI](https://console.mistral.ai/api-keys) 🇪🇺 - Mistral Large 3, Small 3.1, Ministral 8B +3 more. 1 req/s, 1B tok/mo.
- [Zhipu AI](https://open.bigmodel.cn/usercenter/apikeys) 🇨🇳 - GLM-4.7-Flash, GLM-4.5-Flash, GLM-4.6V-Flash. Limits undocumented.

## Inference providers

Third-party platforms that host open-weight models from various sources.

- [GitHub Models](https://github.com/marketplace/models) 🇺🇸 - GPT-4o, Llama 3.3 70B, DeepSeek-R1 +more. 10-15 RPM, 50-150 RPD.
- [NVIDIA NIM](https://build.nvidia.com/explore/discover) 🇺🇸 - Llama 3.3 70B, Mistral Large, Qwen3 235B +more. 40 RPM.
- [Groq](https://console.groq.com/keys) 🇺🇸 - Llama 3.3 70B, Llama 4 Scout, Kimi K2 +17 more. 30 RPM, 14,400 RPD.
- [Cerebras](https://cloud.cerebras.ai/) 🇺🇸 - Llama 3.3 70B, Qwen3 235B, GPT-OSS-120B +3 more. 30 RPM, 14,400 RPD.
- [Cloudflare Workers AI](https://dash.cloudflare.com/profile/api-tokens) 🇺🇸 - Llama 3.3 70B, Qwen QwQ 32B +47 more. 10K neurons/day.
- [LLM7.io](https://token.llm7.io) 🇬🇧 - DeepSeek R1, Flash-Lite, Qwen2.5 Coder +27 more. 30 RPM (120 with token).
- [Kluster AI](https://platform.kluster.ai/apikeys) 🇺🇸 - DeepSeek-R1, Llama 4 Maverick, Qwen3-235B +2 more. Limits undocumented.
- [OpenRouter](https://openrouter.ai/keys) 🇺🇸 - DeepSeek R1, Llama 3.3 70B, GPT-OSS-120B +29 more. 20 RPM, 50 RPD.
- [Hugging Face](https://huggingface.co/settings/tokens) 🇺🇸 - Llama 3.3 70B, Qwen2.5 72B, Mistral 7B +many more. $0.10/mo in free credits.

## Contributing

Know a free tier that's missing? [Open a PR](contributing.md). Include the provider, endpoint, rate limits (link to their docs), and a few notable models. Trial credits and time-limited promos don't count.

## Footnotes

- **RPM** -- requests per minute. **RPD** -- requests per day.
- "Limits undocumented" means the provider doesn't publish their rate limits.
- All endpoints are OpenAI SDK-compatible unless noted.
- Each link points to the provider's API key page.
- [^1]: Free tier not available in the EU, UK, or Switzerland ([available regions](https://ai.google.dev/gemini-api/docs/available-regions)).
