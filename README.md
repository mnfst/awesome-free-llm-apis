<h1 align="center">
	<a href="https://github.com/mnfst/awesome-free-llm-apis">
		<img src="media/awesome-free-llm-apis.png" width="500" alt="Awesome Free LLM APIs">
	</a>
</h1>

<p align="center">
	<a href="https://awesome.re">
		<img src="https://awesome.re/badge-flat2.svg" alt="Awesome">
	</a>
</p>

<p align="center">LLM APIs with permanent free tiers for text inference.</p>

<p align="center"><sub>All endpoints are OpenAI SDK-compatible unless noted. Each link points to the provider's API key page.</sub></p>

<hr>

<p align="center">
	<a href="https://manifest.build">
		<picture>
			<source media="(prefers-color-scheme: dark)" srcset="media/manifest-logo-dark.png">
			<img src="media/manifest-logo-light.png" width="240" alt="Manifest">
		</picture>
	</a>
</p>

<p align="center"><em>All of those free LLM APIs are available at <a href="https://manifest.build">manifest.build</a> - make reliable agents.</em></p>

## Contents

- [Provider APIs](#provider-apis)
- [Inference providers](#inference-providers)
- [Glossary](#glossary)

## Provider APIs

APIs run by the companies that train or fine-tune the models themselves.

### [Aion Labs](https://www.aionlabs.ai/app/api-keys/) 🇮🇱

Permanent free tier, no credit card required. 15 RPM, 20K tokens/day. Specialized for roleplay and storytelling.

Base URL: `https://api.aionlabs.ai/v1`

| Model Name                       | Context | Max Output | Modality         | Rate Limit      |
| -------------------------------- | ------- | ---------- | ---------------- | --------------- |
| `aion-labs/aion-2.0`             | 128K    | 32K        | Text (reasoning) | 15 RPM, 20K TPD |
| `aion-labs/aion-rp-llama-3.1-8b` | 32K     | 32K        | Text             | 15 RPM, 20K TPD |
| `aion-labs/aion-3.0`             | 128K    | 32K        | Text (reasoning) | 15 RPM, 20K TPD |
| `aion-labs/aion-3.0-mini`        | 128K    | 32K        | Text (reasoning) | 15 RPM, 20K TPD |

### [Cohere](https://dashboard.cohere.com/api-keys) 🇨🇦

Free "Trial" API key, no credit card. 1,000 API calls/month. Non-commercial use only.

Base URL: `https://api.cohere.com/v2`

| Model Name          | Context | Max Output | Modality         | Rate Limit |
| ------------------- | ------- | ---------- | ---------------- | ---------- |
| Command A+ (218B)   | 128K    | 64K        | Text + Image     | 20 RPM     |
| Command A (111B)    | 256K    | 8K         | Text             | 20 RPM     |
| Command R+          | 128K    | 4K         | Text             | 20 RPM     |
| Command R           | 128K    | 4K         | Text             | 20 RPM     |
| Command R7B         | 128K    | 4K         | Text             | 20 RPM     |
| Command A Reasoning | 256K    | 32K        | Text (reasoning) | 20 RPM     |
| Command A Translate | 8K      | 8K         | Text             | 20 RPM     |
| Command A Vision    | 128K    | 8K         | Text + Image     | 20 RPM     |
| Command R7B Arabic  | 128K    | ~4K        | Text             | 20 RPM     |
| Aya Expanse 32B     | 128K    | 4K         | Text             | 20 RPM     |
| Aya Vision 32B      | 16K     | 4K         | Text + Image     | 20 RPM     |

### [Google Gemini](https://aistudio.google.com/app/apikey) 🇺🇸

Free tier, no credit card. Free-tier prompts may be used by Google to improve products. [^1]

Base URL: `https://generativelanguage.googleapis.com/v1beta`

| Model Name            | Context | Max Output | Modality                     | Rate Limit        |
| --------------------- | ------- | ---------- | ---------------------------- | ----------------- |
| Gemini 3.7 Flash      | 1M      | 65K        | Text + Image + Audio + Video | —                 |
| Gemini 3.6 Flash      | 1M      | 65K        | Text + Image + Audio + Video | 15 RPM, 1,500 RPD |
| Gemini 3.5 Flash      | 1M      | 65K        | Text + Image + Audio + Video | 15 RPM, 1,500 RPD |
| Gemini 3.5 Flash-Lite | 1M      | 65K        | Text + Image + Audio + Video | 30 RPM, 1,500 RPD |
| Gemini 3.1 Flash-Lite | 1M      | 65K        | Text + Image + Audio + Video | 30 RPM, 1,500 RPD |
| Gemini 2.5 Flash      | 1M      | 65K        | Text + Image + Audio + Video | 15 RPM, 1,500 RPD |
| Gemini 2.5 Flash-Lite | 1M      | 65K        | Text + Image + Audio + Video | 30 RPM, 1,500 RPD |
| Gemini 2.5 Pro        | 1M      | 65K        | Text + Image + Audio + Video | 5 RPM, 50 RPD     |
| Gemma 4 31B           | 256K    | 32K        | Text                         | —                 |
| Gemma 4 26B A4B       | 256K    | 32K        | Text                         | —                 |

### [Mistral AI](https://console.mistral.ai/api-keys) 🇫🇷

Free mode, enabled by default, no credit card required. $10/month in API credits, and free-mode prompts may be used to train Mistral models unless you opt out. [^13]

Base URL: `https://api.mistral.ai/v1`

| Model Name                | Context | Max Output | Modality            | Rate Limit       |
| ------------------------- | ------- | ---------- | ------------------- | ---------------- |
| Mistral Medium 3.5 (128B) | 256K    | —          | Text + Image + Code | ~1 RPS, 500K TPM |
| Mistral Small 4           | 256K    | —          | Text + Image + Code | ~1 RPS, 500K TPM |
| Mistral Large 3           | 256K    | —          | Multimodal          | ~1 RPS, 500K TPM |
| Ministral 3 8B            | 256K    | —          | Text + Vision       | ~1 RPS, 500K TPM |
| Codestral                 | 128K    | —          | Code                | ~1 RPS, 500K TPM |
| Ministral 3 3B            | 256K    | —          | Text + Vision       | ~1 RPS, 500K TPM |
| Ministral 3 14B           | 256K    | —          | Text + Vision       | ~1 RPS, 500K TPM |

### [Z AI (Zhipu AI)](https://open.bigmodel.cn/usercenter/apikeys) 🇨🇳

Permanent free models, no credit card required. [^12]

Base URL: `https://open.bigmodel.cn/api/paas/v4`

| Model Name                           | Context | Max Output | Modality         | Rate Limit           |
| ------------------------------------ | ------- | ---------- | ---------------- | -------------------- |
| GLM-4.7-Flash                        | 200K    | 128K       | Text (reasoning) | 1 concurrent request |
| GLM-4.5-Flash (retirement announced) | 128K    | 96K        | Text (reasoning) | 1 concurrent request |
| GLM-4.6V-Flash                       | 128K    | 32K        | Multimodal       | 1 concurrent request |

## Inference providers

Third-party platforms that host open-weight models from various sources.

### [Cloudflare Workers AI](https://dash.cloudflare.com/profile/api-tokens) 🇺🇸

10,000 Neurons/day free, no credit card required. 75+ models available on the free tier. [^11]

Base URL: `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run`

| Model Name                                     | Context | Max Output        | Modality                       | Rate Limit               |
| ---------------------------------------------- | ------- | ----------------- | ------------------------------ | ------------------------ |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast`     | 24K     | Shared w/ context | Text                           | 10K neurons/day (shared) |
| `@cf/meta/llama-4-scout-17b-16e-instruct`      | 131K    | Shared w/ context | Multimodal                     | 10K neurons/day (shared) |
| `@cf/openai/gpt-oss-120b`                      | 128K    | Shared w/ context | Text                           | 10K neurons/day (shared) |
| `@cf/google/gemma-4-26b-a4b-it`                | 256K    | Shared w/ context | Text + Vision                  | 10K neurons/day (shared) |
| `@cf/zai-org/glm-4.7-flash`                    | 131K    | Shared w/ context | Text                           | 10K neurons/day (shared) |
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | 128K    | Shared w/ context | Text                           | 10K neurons/day (shared) |
| `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` | 80K     | Shared w/ context | Text (reasoning)               | 10K neurons/day (shared) |
| + 72 more models                               | Varies  | Varies            | Text, Image, Audio, Embeddings | 10K neurons/day (shared) |

### [FHRouter](https://fhrouter.com/token)

Free models included on every account, no credit card required. Fair-use daily allowance per account ([how free models work](https://fhrouter.com/docs/free-models)); the free set rotates and currently includes frontier-class models. All other models are pay-as-you-go.

Base URL: `https://fhrouter.com/v1`

| Model Name         | Context | Max Output | Modality         | Rate Limit            |
| ------------------ | ------- | ---------- | ---------------- | --------------------- |
| `grok-4.6`         | —       | —          | Text             | Fair-use daily share |
| `deepseek-v4-flash` | —      | —          | Text             | Fair-use daily share |
| `glm-5.3-flash`    | —       | —          | Text (reasoning) | Fair-use daily share |

### [Groq](https://console.groq.com/keys) 🇺🇸

Free tier, no credit card. Ultra-fast LPU inference. [^2]

Base URL: `https://api.groq.com/openai/v1`

| Model Name            | Context | Max Output | Modality | Rate Limit        |
| --------------------- | ------- | ---------- | -------- | ----------------- |
| `openai/gpt-oss-120b` | 131K    | 65K        | Text     | 30 RPM, 1,000 RPD |
| `openai/gpt-oss-20b`  | 131K    | 65K        | Text     | 30 RPM, 1,000 RPD |
| `groq/compound`       | 131K    | 8K         | Text     | 30 RPM, 250 RPD   |
| `groq/compound-mini`  | 131K    | 8K         | Text     | 30 RPM, 250 RPD   |
| `qwen/qwen3.6-27b`    | 131K    | 16K        | Text     | 30 RPM, 1,000 RPD |

### [Hugging Face](https://huggingface.co/settings/tokens) 🇺🇸

$0.10/month in Inference Provider credits for free users (subject to change). Routes to Fireworks, Together, Hyperbolic, Nebius, Novita, DeepInfra and others. Thousands of models.

Base URL: `https://router.huggingface.co/v1`

| Model Name                      | Context | Max Output | Modality                       | Rate Limit     |
| ------------------------------- | ------- | ---------- | ------------------------------ | -------------- |
| Meta-Llama-3.1-8B-Instruct      | 128K    | ~4K        | Text                           | Credit-metered |
| gemma-3-4b-it                   | 131K    | ~4K        | Text                           | Credit-metered |
| phi-4                           | 16K     | ~4K        | Text                           | Credit-metered |
| Qwen2.5-Coder-7B-Instruct       | 131K    | ~4K        | Text                           | Credit-metered |
| Qwen2.5-7B-Instruct             | 131K    | ~4K        | Text                           | Credit-metered |
| + thousands of community models | Varies  | Varies     | Text, Image, Audio, Embeddings | Credit-metered |

### [Kilo Code](https://app.kilo.ai/profile) 🇺🇸

Free models with no credit card and no API key required. `kilo-auto/free` auto-router dynamically routes to models in the free pool. [^5]

Base URL: `https://api.kilo.ai/api/gateway`

| Model Name                                           | Context | Max Output | Modality      | Rate Limit |
| ---------------------------------------------------- | ------- | ---------- | ------------- | ---------- |
| `nvidia/nemotron-3-ultra-550b-a55b:free`             | 1M      | 65K        | Text          | 200 req/hr |
| `stepfun/step-3.7-flash:free`                        | 262K    | 262K       | Text + Vision | 200 req/hr |
| `nvidia/nemotron-3-super-120b-a12b:free`             | 262K    | 262K       | Text          | 200 req/hr |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | 256K    | 65K        | Multimodal    | 200 req/hr |
| `poolside/laguna-s-2.1:free`                         | 262K    | 32K        | Text (code)   | 200 req/hr |
| `poolside/laguna-xs-2.1:free`                        | 262K    | 32K        | Text (code)   | 200 req/hr |
| `cohere/north-mini-code:free`                        | 256K    | 64K        | Text (code)   | 200 req/hr |
| `openrouter/free`                                    | Varies  | Varies     | Text          | 200 req/hr |
| `tencent/hy3:free`                                   | 262K    | 128K       | Text          | 200 req/hr |
| `nvidia/nemotron-3.5-lightning:free`                 | 1M      | 65K        | Text          | 200 req/hr |
| `liquid/lfm-2.5-2.6b:free`                           | 64K     | 8K         | Text          | 200 req/hr |

### [LLM7.io](https://token.llm7.io) 🇬🇧

API gateway with a free tier. Anonymous access needs no key and reaches the `turbo` models; a free token from token.llm7.io raises the rate and token limits but reaches the same models. [^10]

Base URL: `https://api.llm7.io/v1`

| Model Name                 | Context | Max Output | Modality         | Rate Limit                    |
| -------------------------- | ------- | ---------- | ---------------- | ----------------------------- |
| `gpt-oss:20b`              | 128K    | —          | Text             | 10 RPM, 60 req/hr (anonymous) |
| mistral-Nemo-Instruct-2407 | 128K    | —          | Text             | 10 RPM, 60 req/hr (anonymous) |
| minimax-m2.7               | 180K    | —          | Text (reasoning) | 10 RPM, 60 req/hr (anonymous) |

### [ModelScope](https://modelscope.cn/my/myaccesstoken) 🇨🇳

Free API-Inference for registered users. Requires Alibaba Cloud account binding + real-name verification. [^6]

Base URL: `https://api-inference.modelscope.cn/v1`

| Model Name                     | Context | Max Output | Modality  | Rate Limit                                 |
| ------------------------------ | ------- | ---------- | --------- | ------------------------------------------ |
| `Qwen/Qwen3.5-35B-A3B`         | 256K    | —          | Text      | 2,000 RPD total; <=500 RPD/model (dynamic) |
| `Qwen/Qwen3.5-27B`             | 256K    | —          | Text      | 2,000 RPD total; <=500 RPD/model (dynamic) |
| + API-Inference-enabled models | Varies  | Varies     | LLM, MLLM | Dynamic quotas + dynamic concurrency       |

### [NVIDIA NIM](https://build.nvidia.com/explore/discover) 🇺🇸

Free with NVIDIA Developer Program membership. 100+ models. Rate-limited per model.

Base URL: `https://integrate.api.nvidia.com/v1`

| Model Name                                | Context | Max Output | Modality                               | Rate Limit         |
| ----------------------------------------- | ------- | ---------- | -------------------------------------- | ------------------ |
| `nvidia/nemotron-3-super-120b-a12b`       | 1M      | 262K       | Text                                   | 40 RPM, 10,000 RPD |
| `nvidia/nemotron-3-nano-30b-a3b`          | 262K    | 32K        | Text                                   | 40 RPM, 10,000 RPD |
| `nvidia/llama-3.1-nemotron-ultra-253b-v1` | 128K    | 4K         | Text                                   | 40 RPM, 10,000 RPD |
| `meta/llama-3.3-70b-instruct`             | 128K    | 4K         | Text                                   | 40 RPM, 10,000 RPD |
| `mistralai/mistral-nemotron`              | 128K    | 8K         | Text                                   | 40 RPM, 10,000 RPD |
| `google/gemma-4-31b-it`                   | 262K    | 8K         | Text                                   | 40 RPM, 10,000 RPD |
| `mistralai/mistral-large-2-instruct`      | 128K    | 4K         | Text                                   | 40 RPM, 10,000 RPD |
| `minimaxai/minimax-m3`                    | 1M      | ~64K       | Text                                   | 40 RPM, 10,000 RPD |
| `nvidia/nemotron-3-ultra-550b-a55b`       | 1M      | 262K       | Text                                   | 40 RPM, 10,000 RPD |
| `openai/gpt-oss-120b`                     | 131K    | 131K       | Text                                   | 40 RPM, 10,000 RPD |
| `openai/gpt-oss-20b`                      | 131K    | 131K       | Text                                   | 40 RPM, 10,000 RPD |
| + 92 more models                          | Varies  | Varies     | Text, Image, Video, Speech, Embeddings | 40 RPM, 10,000 RPD |

### [Ollama Cloud](https://ollama.com/settings/keys) 🇺🇸

Free tier with usage limits. 16 cloud model families from the Ollama library. OpenAI SDK-compatible via https://ollama.com/v1. [^3]

Base URL: `https://ollama.com/api`

| Model Name             | Context | Max Output      | Modality | Rate Limit                          |
| ---------------------- | ------- | --------------- | -------- | ----------------------------------- |
| deepseek-v4-pro        | 1M      | Model-dependent | Text     | Session/weekly limits (unpublished) |
| deepseek-v4-flash      | 1M      | Model-dependent | Text     | Session/weekly limits (unpublished) |
| minimax-m3             | 512K    | Model-dependent | Text     | Session/weekly limits (unpublished) |
| kimi-k3                | 1M      | Model-dependent | Text     | Session/weekly limits (unpublished) |
| `gpt-oss:120b`         | 128K    | Model-dependent | Text     | Session/weekly limits (unpublished) |
| `gpt-oss:20b`          | 131K    | Model-dependent | Text     | Session/weekly limits (unpublished) |
| nemotron-3-ultra       | 262K    | Model-dependent | Text     | Session/weekly limits (unpublished) |
| `mistral-large-3:675b` | 256K    | Model-dependent | Text     | Session/weekly limits (unpublished) |
| `qwen3.5:397b`         | 256K    | Model-dependent | Text     | Session/weekly limits (unpublished) |
| + 7 more cloud models  | Varies  | Varies          | Text     | Session/weekly limits (unpublished) |

### [OpenRouter](https://openrouter.ai/keys) 🇺🇸

17 free models (marked with `:free` suffix). OpenAI SDK-compatible. [^4]

Base URL: `https://openrouter.ai/api/v1`

| Model Name                               | Context | Max Output | Modality     | Rate Limit     |
| ---------------------------------------- | ------- | ---------- | ------------ | -------------- |
| `nvidia/nemotron-3-super-120b-a12b:free` | 262K    | 262K       | Text         | 20 RPM, 50 RPD |
| `openai/gpt-oss-20b:free`                | 131K    | 32K        | Text         | 20 RPM, 50 RPD |
| `cohere/north-mini-code:free`            | 256K    | 64K        | Text (code)  | 20 RPM, 50 RPD |
| `google/gemma-4-26b-a4b-it:free`         | 262K    | 32K        | Text + Image | 20 RPM, 50 RPD |
| `google/gemma-4-31b-it:free`             | 262K    | 32K        | Text + Image | 20 RPM, 50 RPD |
| `inclusionai/ling-3.0-flash:free`        | 262K    | 32K        | Text         | 20 RPM, 50 RPD |
| `nvidia/nemotron-3-nano-30b-a3b:free`    | 256K    | —          | Text         | 20 RPM, 50 RPD |
| `nvidia/nemotron-nano-9b-v2:free`        | 128K    | —          | Text         | 20 RPM, 50 RPD |
| `nvidia/nemotron-nano-12b-v2-vl:free`    | 128K    | 128K       | Text + Image | 20 RPM, 50 RPD |
| `poolside/laguna-s-2.1:free`             | 262K    | 32K        | Text (code)  | 20 RPM, 50 RPD |
| `poolside/laguna-xs-2.1:free`            | 262K    | 32K        | Text (code)  | 20 RPM, 50 RPD |
| + 6 more free models                     | Varies  | Varies     | Text / Image | 20 RPM, 50 RPD |

### [OVHcloud AI Endpoints](https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/) 🇫🇷

Free anonymous tier (no API key, no signup): 2 RPM per IP per model. 20+ open-weight models hosted in EU. OpenAI SDK-compatible. [^7]

Base URL: `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1`

| Model Name                     | Context | Max Output | Modality      | Rate Limit        |
| ------------------------------ | ------- | ---------- | ------------- | ----------------- |
| Qwen3.5-397B-A17B              | 131K    | ~32K       | Text          | 2 RPM (anonymous) |
| gpt-oss-120b                   | 128K    | ~32K       | Text          | 2 RPM (anonymous) |
| gpt-oss-20b                    | 128K    | ~8K        | Text          | 2 RPM (anonymous) |
| Meta-Llama-3_3-70B-Instruct    | 131K    | ~4K        | Text          | 2 RPM (anonymous) |
| Qwen3.6-27B                    | 131K    | ~32K       | Text          | 2 RPM (anonymous) |
| Qwen3.5-9B                     | 131K    | ~8K        | Text          | 2 RPM (anonymous) |
| Qwen3-32B                      | 131K    | ~32K       | Text          | 2 RPM (anonymous) |
| Qwen3-Coder-30B-A3B-Instruct   | 262K    | ~32K       | Text (code)   | 2 RPM (anonymous) |
| Qwen2.5-VL-72B-Instruct        | 128K    | ~8K        | Text + Vision | 2 RPM (anonymous) |
| Mistral-Small-3.2-24B-Instruct | 128K    | ~4K        | Text          | 2 RPM (anonymous) |
| Mistral-Nemo-Instruct-2407     | 128K    | ~4K        | Text          | 2 RPM (anonymous) |
| Mistral-7B-Instruct-v0.3       | 32K     | ~4K        | Text          | 2 RPM (anonymous) |

### [SiliconFlow](https://cloud.siliconflow.cn/account/ak) 🇨🇳

Permanently free models, no credit card required. Identity verification required. 100+ models in the catalog, most of them paid. [^9]

Base URL: `https://api.siliconflow.cn/v1`

| Model Name      | Context | Max Output | Modality | Rate Limit            |
| --------------- | ------- | ---------- | -------- | --------------------- |
| `Qwen/Qwen3-8B` | 128K    | —          | Text     | 1,000 RPM, 50,000 TPM |

## Glossary

| Abbreviation | Meaning             |
| ------------ | ------------------- |
| **RPM**      | Requests per minute |
| **RPD**      | Requests per day    |
| **TPM**      | Tokens per minute   |
| **TPD**      | Tokens per day      |
| **RPS**      | Requests per second |

## Contributing

Know a free tier that's missing? [Open a PR](contributing.md). Include the provider, endpoint, rate limits (link to their docs), and a few notable models. Trial credits and time-limited promos don't count.

[^1]: The Gemini API free tier is available to developers in the EU, UK, and Switzerland; the [available regions](https://ai.google.dev/gemini-api/docs/available-regions) page lists these regions. The [terms](https://ai.google.dev/gemini-api/terms) still require you to use only Paid Services when you make an API Client available to users in the European Economic Area, Switzerland, or the UK. Google no longer publishes per-model free-tier rate limits; check your quotas in [AI Studio](https://aistudio.google.com/). Free-tier prompts may be used by Google to improve products, except for users in the EEA, Switzerland and the UK, where the paid-services data terms also govern the unpaid quota, so those prompts are not used to improve Google products. `gemini-3.1-flash-lite` is on the [deprecation schedule](https://ai.google.dev/gemini-api/docs/deprecations), with a shutdown date of May 7, 2027 and `gemini-3.5-flash-lite` as its replacement; the row stays because the model is live and free today.
[^2]: Groq shut down llama-3.3-70b-versatile and llama-3.1-8b-instant on August 16, 2026 ([deprecations](https://console.groq.com/docs/deprecations)). Remaining free-plan limits vary by model: compound and compound-mini get 250 RPD, most others 1,000 RPD ([rate limits](https://console.groq.com/docs/rate-limits)).
[^3]: Ollama Cloud measures usage by input, cached input, and output tokens weighted per model ([FAQ](https://docs.ollama.com/cloud)). Free tier has session limits resetting every 5 hours and weekly limits resetting every 7 days. Cloud models are also served through Ollama's OpenAI-compatible endpoint at ollama.com/v1.
[^4]: Free models default to 50 RPD per model. A one-time purchase of $10+ in credits unlocks 1,000 RPD for free models. OpenRouter also offers a [Free Models Router](https://openrouter.ai/docs/guides/routing/routers/free-models-router) (`openrouter/free`) and [model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks) for chaining models in priority order. Free providers may log prompts for training.
[^5]: Kilo Code's free pool changes frequently, and the /api/gateway/models catalog can lag what is actually served: probe results have confirmed models absent from the catalog still answering. Every row listed here answered a live request between 2026-08-19 and 2026-08-21. Free models are reachable with no API key, at 200 requests per hour per IP ([authentication](https://kilo.ai/docs/gateway/authentication)). The kilo-auto/free router picks a model from the free pool, and Kilo's docs warn it "may route your requests to providers that log prompts and outputs". The NVIDIA free endpoints carry NVIDIA's own condition, quoted on Kilo's [models page](https://kilo.ai/docs/gateway/models-and-providers): "Trial use only - do not submit personal or confidential data. Your use is logged for security purposes and to improve NVIDIA products and services."
[^6]: API-Inference is free for registered users. Current published limits are 2,000 requests/day per user (total across models), with per-model daily quotas dynamically adjusted and capped at 500; concurrency is also dynamically rate-limited. Requires Alibaba Cloud account binding and real-name verification ([limits](https://modelscope.cn/docs/model-service/API-Inference/limits), [intro](https://modelscope.cn/docs/model-service/API-Inference/intro)).
[^7]: OVHcloud AI Endpoints offers a permanent free anonymous tier (2 requests per minute per IP, per model) with no signup or API key required. Higher rate limits (400 RPM per Public Cloud project per model) require an API key and are billed pay-as-you-go per token; new Public Cloud accounts get up to $200 in free trial credits. Models are hosted in EU data centers.
[^9]: SiliconFlow requires real-name identity verification to use free models (effective May 15, 2026, per the [release notes](https://api-docs.siliconflow.cn/docs/release-notes/overview)). Verification supports mainland-Chinese documents; international users must contact support.
[^10]: LLM7.io rotates its catalog frequently, so the model list changes between checks. Access is tier-based, not token-based: `turbo` models are reachable anonymously or with a free token, `pro` models need the paid plan ([models API](https://docs.llm7.io/guides/models-api)). Anonymous access is capped at 1 RPS, 10 RPM, 60 requests per hour and 500,000 tokens per 24 hours; a free token raises that to 2 RPS, 40 RPM, 100 requests per hour and 1,000,000 tokens per 24 hours ([limits](https://docs.llm7.io/limits)). A paid Pro plan is available at $12/month. Anonymous access with no key was confirmed by live request on 2026-08-21.
[^11]: The 10,000 free Neurons are shared across all Workers AI usage, not per model, and all limits reset daily at 00:00 UTC. Going over does not bill you, the request fails. Five models are excluded from Workers Free billing and need the Workers Paid plan or prepaid AI Gateway credits: `@cf/moonshotai/kimi-k2.6`, `@cf/moonshotai/kimi-k2.7-code`, `@cf/zai-org/glm-5.2`, `@cf/deepseek-ai/deepseek-v4-flash-0731`, `@cf/deepseek-ai/deepseek-v4-pro-0813` ([pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)).
[^12]: Registration accepts overseas phone numbers ([registration FAQ](https://docs.bigmodel.cn/cn/faq/registration-login.md)) and the chat API does not require real-name verification: 目前调用 API 并不强制要求实名认证 ([authentication FAQ](https://docs.bigmodel.cn/cn/faq/authentication-issues.md)). The Batch API does require it ([batch FAQ](https://docs.bigmodel.cn/cn/faq/batch-api-issues.md)). The same free models are served from the international platform at `https://api.z.ai/api/paas/v4` ([endpoint](https://docs.z.ai/guides/develop/http/introduction)), where GLM-4.7-Flash, GLM-4.5-Flash and GLM-4.6V-Flash are all priced Free ([pricing](https://docs.z.ai/guides/overview/pricing.md)). Z AI has announced that GLM-4.5-Flash will be retired and its requests auto-routed to GLM-4.7-Flash ([model page](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.5-flash.md)); the announced date has already passed while the model is still catalogued and still priced Free, so treat that row as living on borrowed time.
[^13]: Mistral plans are global: the monthly allowance is shared across Studio, the API, and Vibe Code, so CLI usage eats the same budget ([subscriptions](https://docs.mistral.ai/admin/billing-usage/subscriptions)). Free mode is the default for new accounts and needs no credit card ([quickstart](https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key)), and the Free plan card on the [pricing page](https://mistral.ai/pricing) is what carries the $10/month in API credits figure quoted in the description. Free-mode inputs and outputs may be used to train Mistral models, and you can opt out at any time ([data usage](https://help.mistral.ai/en/articles/347617-do-you-use-my-user-data-to-train-your-artificial-intelligence-models)). Mistral no longer publishes numeric free-tier rate limits and points you at the Limits page of the admin panel instead ([rate limits](https://help.mistral.ai/en/articles/698531-why-am-i-hitting-api-rate-limits-and-how-do-i-increase-them)); the rate limit column is kept from the last published values.
