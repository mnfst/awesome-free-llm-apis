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

### [Cohere](https://dashboard.cohere.com/api-keys) 🇨🇦

Free "Trial" API key, no credit card. 1,000 API calls/month. Non-commercial use only.

| Model Name | Context | Max Output | Modality | Rate Limit |
|---|---|---|---|---|
| Command A (111B) | 256K | 4K | Text | 20 RPM |
| Command R+ | 128K | 4K | Text | 20 RPM |
| Command R | 128K | 4K | Text | 20 RPM |
| Command R7B | 128K | 4K | Text | 20 RPM |
| Embed 4 | — | — | Embeddings (Text + Image) | 2,000 inputs/min |
| Rerank 3.5 | — | — | Reranking | 10 RPM |

### [Google Gemini](https://aistudio.google.com/app/apikey) 🇺🇸

Free tier unavailable in EU/UK/Switzerland. Free-tier prompts may be used by Google to improve products. [^1]

| Model Name | Context | Max Output | Modality | Rate Limit |
|---|---|---|---|---|
| Gemini 2.5 Flash | 1M | 65K | Text + Image + Audio + Video | 10 RPM, 250 RPD |
| Gemini 2.5 Flash-Lite | 1M | 65K | Text + Image + Audio + Video | 15 RPM, 1,000 RPD |

### [Mistral AI](https://console.mistral.ai/api-keys) 🇫🇷

Free "Experiment" plan, no credit card. ~1B tokens/month.

| Model Name | Context | Max Output | Modality | Rate Limit |
|---|---|---|---|---|
| Mistral Small 4 | 256K | 256K | Text + Image + Code | ~1 RPS, 500K TPM |
| Mistral Medium 3 | 128K | 128K | Text | ~1 RPS, 500K TPM |
| Mistral Large 3 | 256K | 256K | Text | ~1 RPS, 500K TPM |
| Mistral Nemo (12B) | 128K | 128K | Text | ~1 RPS, 500K TPM |
| Codestral | 256K | 256K | Code | ~1 RPS, 500K TPM |
| Pixtral Large | 128K | 128K | Text + Image | ~1 RPS, 500K TPM |

### [OpenAI](https://platform.openai.com/api-keys) 🇺🇸

Free tier with very restrictive rate limits. Suitable for prototyping only. [^5]

| Model Name | Context | Max Output | Modality | Rate Limit |
|---|---|---|---|---|
| gpt-4o-mini | 128K | 16K | Text + Image | ~3 RPM, 200 RPD |
| gpt-5-mini | 128K | 16K | Text + Image | ~3 RPM, 200 RPD |

### [Z AI (Zhipu AI)](https://open.bigmodel.cn/usercenter/apikeys) 🇨🇳

Permanent free models, no credit card required.

| Model Name | Context | Max Output | Modality | Rate Limit |
|---|---|---|---|---|
| GLM-4.7-Flash | 200K | 128K | Text | 1 concurrent request |
| GLM-4.5-Flash | 128K | ~8K | Text | 1 concurrent request |
| GLM-4.6V-Flash | 128K | ~4K | Text + Image | 1 concurrent request |

## Inference providers

Third-party platforms that host open-weight models from various sources.

### [Cerebras](https://cloud.cerebras.ai/) 🇺🇸

Free tier, no credit card. Ultra-fast inference (~2,600 tok/s). 1M tokens/day cap.

| Model Name | Context | Max Output | Modality | Rate Limit |
|---|---|---|---|---|
| llama3.1-8b | 128K (8K on free) | 8K | Text | 30 RPM, 14,400 RPD, 1M TPD |
| gpt-oss-120b | 128K (8K on free) | 8K | Text | 30 RPM, 14,400 RPD, 1M TPD |
| qwen-3-235b-a22b-instruct-2507 | 131K (8K on free) | 8K | Text | 30 RPM, 14,400 RPD, 1M TPD |
| zai-glm-4.7 | 128K (8K on free) | 8K | Text | 10 RPM, 100 RPD, 1M TPD |

### [Cloudflare Workers AI](https://dash.cloudflare.com/profile/api-tokens) 🇺🇸

10,000 Neurons/day free. 50+ models available on free tier.

| Model Name | Context | Max Output | Modality | Rate Limit |
|---|---|---|---|---|
| @cf/meta/llama-3.3-70b-instruct-fp8-fast | 131K | Shared w/ context | Text | 10K neurons/day (shared) |
| @cf/meta/llama-3.1-8b-instruct-fp8-fast | 131K | Shared w/ context | Text | 10K neurons/day (shared) |
| @cf/meta/llama-3.2-11b-vision-instruct | 131K | Shared w/ context | Text + Vision | 10K neurons/day (shared) |
| @cf/meta/llama-4-scout-17b-16e-instruct | Up to 10M | Shared w/ context | Multimodal | 10K neurons/day (shared) |
| @cf/mistralai/mistral-small-3.1-24b-instruct | 128K | Shared w/ context | Text | 10K neurons/day (shared) |
| @cf/google/gemma-4-26b-a4b-it | 256K | Shared w/ context | Text | 10K neurons/day (shared) |
| @cf/qwen/qwq-32b | 32K | Shared w/ context | Text | 10K neurons/day (shared) |
| @cf/deepseek-ai/deepseek-r1-distill-qwen-32b | 32K | Shared w/ context | Text | 10K neurons/day (shared) |
| + 42 more models | Varies | Varies | Text, Image, Audio, Embeddings | 10K neurons/day (shared) |

### [GitHub Models](https://github.com/marketplace/models) 🇺🇸

Free prototyping for all GitHub users. 45+ models. Per-request limits (8K in / 4K out).

| Model Name | Context | Max Output | Modality | Rate Limit |
|---|---|---|---|---|
| gpt-4.1 | 1M | 32K | Text | 10 RPM, 50 RPD |
| gpt-4.1-mini | 1M | 32K | Text | 15 RPM, 150 RPD |
| gpt-4o | 128K | 16K | Text + Vision | 10 RPM, 50 RPD |
| o3-mini | 200K | 100K | Text (reasoning) | 10 RPM, 50 RPD |
| o4-mini | 200K | 100K | Text (reasoning) | 10 RPM, 50 RPD |
| Llama-4-Scout-17B-16E | 512K | ~4K | Text + Vision | 15 RPM, 150 RPD |
| Llama-4-Maverick-17B-128E | 256K | ~4K | Text + Vision | 10 RPM, 50 RPD |
| Meta-Llama-3.3-70B | 131K | ~4K | Text | 15 RPM, 150 RPD |
| DeepSeek-R1 | 64K | 8K | Text (reasoning) | 15 RPM, 150 RPD |
| Mistral-Small-3.1 | 128K | ~4K | Text + Vision | 15 RPM, 150 RPD |
| + 35 more models | Varies | Varies | Text / Image | Varies by tier |

### [Groq](https://console.groq.com/keys) 🇺🇸

Free tier, no credit card. Ultra-fast LPU inference. [^2]

| Model Name | Context | Max Output | Modality | Rate Limit |
|---|---|---|---|---|
| llama-3.3-70b-versatile | 131K | 32K | Text | 30 RPM, 14,400 RPD |
| llama-3.1-8b-instant | 131K | 131K | Text | 30 RPM, 14,400 RPD |
| llama-4-scout-17b-16e-instruct | 131K | 8K | Text + Vision | 30 RPM, 14,400 RPD |
| llama-4-maverick-17b-128e-instruct | 131K | 8K | Text + Vision | 15 RPM, 500 RPD |
| qwen3-32b | 131K | 131K | Text | 30 RPM, 14,400 RPD |
| gpt-oss-120b | 131K | 32K | Text | 30 RPM, 14,400 RPD |
| kimi-k2-instruct | 262K | 262K | Text | 30 RPM, 14,400 RPD |
| deepseek-r1-distill-70b | 131K | 8K | Text | 30 RPM, 14,400 RPD |
| whisper-large-v3 | — | — | Audio → Text | 20 RPM, 2,000 RPD |
| whisper-large-v3-turbo | — | — | Audio → Text | 20 RPM, 2,000 RPD |

### [Hugging Face](https://huggingface.co/settings/tokens) 🇺🇸

Free Serverless Inference API + ~$0.10/month free credits. Thousands of models.

| Model Name | Context | Max Output | Modality | Rate Limit |
|---|---|---|---|---|
| Meta-Llama-3.1-8B-Instruct | 128K | ~4K | Text | ~1,000 RPD |
| Mistral-7B-Instruct-v0.3 | 32K | ~4K | Text | ~1,000 RPD |
| Mixtral-8x7B-Instruct-v0.1 | 32K | ~4K | Text | ~1,000 RPD |
| Phi-3.5-mini-instruct | 128K | ~4K | Text | ~1,000 RPD |
| Qwen2.5-7B-Instruct | 131K | ~4K | Text | ~1,000 RPD |
| + thousands of community models | Varies | Varies | Text, Image, Audio, Embeddings | ~$0.10/month free credits |

### [Kilo Code](https://kilo.ai) 🇺🇸

Free models with no credit card required. ~29 rotating free models. Base URL: `https://api.kilo.ai/api/gateway`. [^6]

| Model Name | Context | Max Output | Modality | Rate Limit |
|---|---|---|---|---|
| qwen/qwen3.6-plus-preview:free | 1M | 32K | Text + Image + Video | ~200 req/hr |
| nvidia/nemotron-3-super-120b-a12b:free | 262K | 32K | Text | ~200 req/hr |
| stepfun/step-3.5-flash:free | 256K | 65K | Text | ~200 req/hr |
| corethink:free | ~78K | ~8K | Text | ~200 req/hr |
| minimax/minimax-m2.5:free | 196K | 196K | Text | ~200 req/hr |
| arcee-ai/trinity-large-preview:free | 128K | ~32K | Text | ~200 req/hr |
| kwaipilot/kat-coder-pro:free | 262K | 128K | Text (code) | ~200 req/hr |
| qwen/qwen3-coder:free | 262K | 262K | Text (code) | ~200 req/hr |
| google/gemma-4-31b-it:free | 262K | — | Multimodal | ~200 req/hr |
| deepseek/deepseek-r1-0528:free | — | — | Text (reasoning) | ~200 req/hr |
| meta-llama/llama-3.3-70b-instruct:free | — | — | Text | ~200 req/hr |
| + ~18 more rotating free models | Varies | Varies | Text / Image | ~200 req/hr |

### [LLM7.io](https://token.llm7.io) 🇬🇧

Zero-friction API gateway. No registration needed for basic access. 30+ models.

| Model Name | Context | Max Output | Modality | Rate Limit |
|---|---|---|---|---|
| deepseek-r1-0528 | — | — | Text (reasoning) | 30 RPM (120 with token) |
| deepseek-v3-0324 | — | — | Text | 30 RPM (120 with token) |
| gemini-2.5-flash-lite | — | — | Text + Vision | 30 RPM (120 with token) |
| gpt-4o-mini | — | — | Text + Vision | 30 RPM (120 with token) |
| mistral-small-3.1-24b | 32K | — | Text | 30 RPM (120 with token) |
| qwen2.5-coder-32b | — | — | Text (code) | 30 RPM (120 with token) |
| + ~24 more models | Varies | Varies | Text | 30 RPM (120 with token) |

### [NVIDIA NIM](https://build.nvidia.com/explore/discover) 🇺🇸

Free with NVIDIA Developer Program membership. 100+ models. No daily token cap.

| Model Name | Context | Max Output | Modality | Rate Limit |
|---|---|---|---|---|
| deepseek-ai/deepseek-r1 | 128K | ~163K | Text (reasoning) | ~40 RPM |
| nvidia/llama-3.1-nemotron-ultra-253b-v1 | 128K | 4K | Text | ~40 RPM |
| nvidia/nemotron-3-super-120b-a12b | 262K | 262K | Text | ~40 RPM |
| nvidia/nemotron-3-nano-30b-a3b | 128K | 32K | Text | ~40 RPM |
| meta/llama-3.1-405b-instruct | 128K | 4K | Text | ~40 RPM |
| qwen/qwen2.5-72b-instruct | 128K | 8K | Text | ~40 RPM |
| google/gemma-4-31b | 128K | 8K | Text | ~40 RPM |
| mistralai/mistral-large-2-instruct | 128K | 4K | Text | ~40 RPM |
| nvidia/nemotron-nano-2-vl | 128K | 8K | Vision + Text + Video | ~40 RPM |
| minimax/minimax-m2.7 | 128K | 8K | Text | ~40 RPM |
| + 90 more models | Varies | Varies | Text, Image, Video, Speech, Embeddings | ~40 RPM |

### [Ollama Cloud](https://ollama.com/settings/keys) 🇺🇸

Free tier with qualitative usage limits. 400+ models from Ollama library. Not OpenAI SDK-compatible; uses [Ollama API](https://docs.ollama.com/cloud). [^3]

| Model Name | Context | Max Output | Modality | Rate Limit |
|---|---|---|---|---|
| llama3.1:cloud | 128K | Model-dependent | Text | Session/weekly limits (unpublished) |
| deepseek-r1:cloud | 128K | Model-dependent | Text (reasoning) | Session/weekly limits (unpublished) |
| qwen2.5:cloud | 128K | Model-dependent | Text | Session/weekly limits (unpublished) |
| gemma2:cloud | 8K | Model-dependent | Text | Session/weekly limits (unpublished) |
| mistral:cloud | 32K | Model-dependent | Text | Session/weekly limits (unpublished) |
| + 400 more models | Varies | Varies | Text | Session/weekly limits (unpublished) |

### [OpenRouter](https://openrouter.ai/keys) 🇺🇸

35+ free models (marked with `:free` suffix). OpenAI SDK-compatible. [^4]

| Model Name | Context | Max Output | Modality | Rate Limit |
|---|---|---|---|---|
| deepseek/deepseek-r1-0528:free | 163K | ~163K | Text (reasoning) | 20 RPM, 200 RPD |
| deepseek/deepseek-chat-v3-0324:free | 163K | 163K | Text | 20 RPM, 200 RPD |
| qwen/qwen3.6-plus:free | 1M | 65K | Text | 20 RPM, 200 RPD |
| qwen/qwen3-coder-480b-a35b:free | 262K | ~32K | Text | 20 RPM, 200 RPD |
| meta-llama/llama-4-scout:free | 10M | 16K | Multimodal | 20 RPM, 200 RPD |
| meta-llama/llama-4-maverick:free | 1M | 16K | Multimodal | 20 RPM, 200 RPD |
| meta-llama/llama-3.3-70b-instruct:free | 65K | ~16K | Text | 20 RPM, 200 RPD |
| google/gemma-4-31b-it:free | 256K | ~8K | Multimodal | 20 RPM, 200 RPD |
| nvidia/nemotron-3-super-120b-a12b:free | 1M | ~32K | Text | 20 RPM, 200 RPD |
| openai/gpt-oss-120b:free | 131K | 131K | Text | 20 RPM, 200 RPD |
| minimax/minimax-m2.5:free | 196K | 8K | Text | 20 RPM, 200 RPD |
| mistralai/devstral-2512:free | 256K | ~32K | Text | 20 RPM, 200 RPD |
| + ~23 more free models | Varies | Varies | Text / Image | 20 RPM, 200 RPD |

### [SiliconFlow](https://cloud.siliconflow.cn/account/ak) 🇨🇳

Free tier with 14 CNY signup credits. Permanently free models available.

| Model Name | Context | Max Output | Modality | Rate Limit |
|---|---|---|---|---|
| Qwen/Qwen3-8B | 131K | 131K | Text | 1,000 RPM, 50K TPM |
| deepseek-ai/DeepSeek-R1-0528-Qwen3-8B | ~33K | 16K | Text (reasoning) | 1,000 RPM, 50K TPM |
| deepseek-ai/DeepSeek-R1-Distill-Qwen-7B | 131K | Configurable | Text (reasoning) | 1,000 RPM, 50K TPM |
| THUDM/glm-4-9b-chat | 32K | 32K | Text | 1,000 RPM, 50K TPM |
| THUDM/GLM-4.1V-9B-Thinking | 66K | 66K | Vision + Text | 1,000 RPM, 50K TPM |
| deepseek-ai/DeepSeek-OCR | — | 8K | Vision (OCR) | 1,000 RPM, 50K TPM |
| + embedding/speech models | Varies | Varies | Embeddings, Speech | 1,000 RPM, 50K TPM |

## Contributing

Know a free tier that's missing? [Open a PR](contributing.md). Include the provider, endpoint, rate limits (link to their docs), and a few notable models. Trial credits and time-limited promos don't count.

## Footnotes

- **RPM** -- requests per minute. **RPD** -- requests per day. **TPM** -- tokens per minute. **TPD** -- tokens per day. **RPS** -- requests per second.
- "Limits undocumented" means the provider doesn't publish their rate limits.
- All endpoints are OpenAI SDK-compatible unless noted.
- Each link points to the provider's API key page.
- [^1]: Free tier not available in the EU, UK, or Switzerland ([available regions](https://ai.google.dev/gemini-api/docs/available-regions)).
- [^2]: Groq rate limits vary by model. Llama 4 Maverick is limited to 500 RPD. Most other models get 14,400 RPD ([rate limits](https://console.groq.com/docs/rate-limits)).
- [^3]: Ollama Cloud measures usage by GPU time, not tokens or requests. Free tier described as "light usage" with session limits resetting every 5 hours and weekly limits every 7 days. Pro (50x more) and Max (250x more) plans available. Not OpenAI SDK-compatible; uses [Ollama API](https://docs.ollama.com/cloud).
- [^4]: Free models default to 200 RPD. A one-time purchase of $10+ in credits unlocks 1,000 RPD for free models. OpenRouter also offers a [Free Models Router](https://openrouter.ai/docs/guides/routing/routers/free-models-router) (`openrouter/free`) and [model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks) for chaining models in priority order.
- [^5]: OpenAI free tier is extremely restrictive (~3 RPM, 200 RPD, 40K TPM). Only mini models are available. Credit card not required but features are very limited.
- [^6]: Kilo Code free model list is dynamic and rotates based on partnerships. Free models log prompts for improvement. Auto-router available: `kilo-auto/free`.
