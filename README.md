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

### [Aion Labs](https://www.aionlabs.ai) 🇮🇱

Permanent free tier, no credit card required. 15 RPM, 20K tokens/day. Specialized for roleplay and storytelling.

Base URL: `https://api.aionlabs.ai/v1`

| Model Name       | Context | Max Output | Modality                   | Rate Limit      |
| ---------------- | ------- | ---------- | -------------------------- | --------------- |
| Aion 2.5         | 128K    | 32K        | Text (roleplay)            | 15 RPM, 20K TPD |
| Aion 2.0         | 128K    | 32K        | Text (roleplay)            | 15 RPM, 20K TPD |
| Aion-RP 1.0 (8B) | 32K     | 32K        | Text (roleplay)            | 15 RPM, 20K TPD |
| Aion 3.0         | 128K    | 32K        | Text (roleplay, reasoning) | 15 RPM, 20K TPD |
| Aion 3.0 Mini    | 128K    | 32K        | Text (roleplay, reasoning) | 15 RPM, 20K TPD |

### [Cohere](https://dashboard.cohere.com/api-keys) 🇨🇦

Free "Trial" API key, no credit card. 1,000 API calls/month. Non-commercial use only.

Base URL: `https://api.cohere.com/v2`

| Model Name          | Context | Max Output | Modality         | Rate Limit |
| ------------------- | ------- | ---------- | ---------------- | ---------- |
| Command A+ (218B)   | 436K    | 64K        | Text + Image     | 20 RPM     |
| Command A (111B)    | 288K    | 8K         | Text             | 20 RPM     |
| Command R+          | 128K    | 4K         | Text             | 20 RPM     |
| Command R           | 128K    | 4K         | Text             | 20 RPM     |
| Command R7B         | 128K    | 4K         | Text             | 20 RPM     |
| Command A Reasoning | 288K    | ~4K        | Text (reasoning) | 20 RPM     |
| Command A Translate | ~9K     | ~4K        | Text             | 20 RPM     |
| Command A Vision    | 128K    | ~4K        | Text + Image     | 20 RPM     |
| Command R7B Arabic  | 128K    | ~4K        | Text             | 20 RPM     |
| Aya Expanse 32B     | 128K    | ~4K        | Text             | 20 RPM     |
| Aya Vision 32B      | 16K     | ~4K        | Text + Image     | 20 RPM     |

### [Google Gemini](https://aistudio.google.com/app/apikey) 🇺🇸

Free tier unavailable in EU/UK/Switzerland. Free-tier prompts may be used by Google to improve products. [^1]

Base URL: `https://generativelanguage.googleapis.com/v1beta`

| Model Name            | Context | Max Output | Modality                     | Rate Limit        |
| --------------------- | ------- | ---------- | ---------------------------- | ----------------- |
| Gemini 3.6 Flash      | 1M      | 65K        | Text + Image + Audio + Video | 5 RPM, 20 RPD     |
| Gemini 3.5 Flash      | 1M      | 65K        | Text + Image + Audio + Video | 5 RPM, 20 RPD     |
| Gemini 2.5 Flash      | 1M      | 65K        | Text + Image + Audio + Video | 5 RPM, 20 RPD     |
| Gemini 3.5 Flash-Lite | 1M      | 65K        | Text + Image + Audio + Video | 15 RPM, 500 RPD   |
| Gemini 3.1 Flash-Lite | 1M      | 65K        | Text + Image + Audio + Video | 15 RPM, 500 RPD   |
| Gemini 2.5 Flash-Lite | 1M      | 65K        | Text + Image + Audio + Video | 10 RPM, 20 RPD    |
| Gemmma 4              | 1M      | 65K        | Text + Image + Audio + Video | 30 RPM, 14.4k RPD |

### [Mistral AI](https://console.mistral.ai/api-keys) 🇫🇷

Free "Experiment" plan, no credit card. ~1B tokens/month. Prompts may be used to improve models.

Base URL: `https://api.mistral.ai/v1`

| Model Name                | Context | Max Output | Modality            | Rate Limit       |
| ------------------------- | ------- | ---------- | ------------------- | ---------------- |
| Mistral Medium 3.5 (128B) | 256K    | 256K       | Text + Image + Code | ~1 RPS, 500K TPM |
| Mistral Small 4           | 256K    | 256K       | Text + Image + Code | ~1 RPS, 500K TPM |
| Mistral Large 3           | 256K    | 256K       | Text                | ~1 RPS, 500K TPM |
| Ministral 8B              | 256K    | 256K       | Text                | ~1 RPS, 500K TPM |
| Codestral                 | 256K    | 256K       | Code                | ~1 RPS, 500K TPM |
| Ministral 3B              | 128K    | 128K       | Text                | ~1 RPS, 500K TPM |
| Ministral 14B             | 256K    | 256K       | Text                | ~1 RPS, 500K TPM |

### [Z AI (Zhipu AI)](https://open.bigmodel.cn/usercenter/apikeys) 🇨🇳

Permanent free models, no credit card required.

Base URL: `https://open.bigmodel.cn/api/paas/v4`

| Model Name     | Context | Max Output | Modality         | Rate Limit           |
| -------------- | ------- | ---------- | ---------------- | -------------------- |
| GLM-4.7-Flash  | 200K    | 128K       | Text (reasoning) | 1 concurrent request |
| GLM-4.5-Flash  | 128K    | ~96K       | Text (reasoning) | 1 concurrent request |
| GLM-4.6V-Flash | 128K    | ~4K        | Text + Image     | 1 concurrent request |

## Inference providers

Third-party platforms that host open-weight models from various sources.

### [Cerebras](https://cloud.cerebras.ai/) 🇺🇸

Free tier with payment method required. Ultra-fast inference. 1M tokens/day cap. 64K context on free tier.

Base URL: `https://api.cerebras.ai/v1`

| Model Name                        | Context            | Max Output              | Modality     | Rate Limit              |
| --------------------------------- | ------------------ | ----------------------- | ------------ | ----------------------- |
| gpt-oss-120b                      | 131K (65K on free) | 32K (free) / 40K (paid) | Text         | 5 RPM, 30K TPM, 1M TPD  |
| zai-glm-4.7 (deprecated Aug 2026) | 131K (64K on free) | 40K                     | Text         | 5 RPM, 30K TPM, 1M TPD  |
| gemma-4-31b                       | 131K (65K on free) | 32K (free) / 40K (paid) | Text + Image | 15 RPM, 30K TPM, 1M TPD |

### [Cloudflare Workers AI](https://dash.cloudflare.com/profile/api-tokens) 🇺🇸

10,000 Neurons/day free. 50+ models available on free tier.

Base URL: `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run`

| Model Name                                     | Context   | Max Output        | Modality                       | Rate Limit               |
| ---------------------------------------------- | --------- | ----------------- | ------------------------------ | ------------------------ |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast`     | 131K      | Shared w/ context | Text                           | 10K neurons/day (shared) |
| `@cf/meta/llama-4-scout-17b-16e-instruct`      | Up to 10M | Shared w/ context | Multimodal                     | 10K neurons/day (shared) |
| `@cf/openai/gpt-oss-120b`                      | 128K      | Shared w/ context | Text                           | 10K neurons/day (shared) |
| `@cf/moonshotai/kimi-k2.7-code`                | 262K      | Shared w/ context | Text (code)                    | 10K neurons/day (shared) |
| `@cf/google/gemma-4-26b-a4b-it`                | 256K      | Shared w/ context | Text                           | 10K neurons/day (shared) |
| `@cf/zhipuai/glm-4.7-flash`                    | 131K      | Shared w/ context | Text                           | 10K neurons/day (shared) |
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | 128K      | Shared w/ context | Text                           | 10K neurons/day (shared) |
| `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` | 32K       | Shared w/ context | Text (reasoning)               | 10K neurons/day (shared) |
| + 42 more models                               | Varies    | Varies            | Text, Image, Audio, Embeddings | 10K neurons/day (shared) |

### [Groq](https://console.groq.com/keys) 🇺🇸

Free tier, no credit card. Ultra-fast LPU inference. [^2]

Base URL: `https://api.groq.com/openai/v1`

| Model Name              | Context | Max Output | Modality | Rate Limit         |
| ----------------------- | ------- | ---------- | -------- | ------------------ |
| llama-3.3-70b-versatile | 131K    | 32K        | Text     | 30 RPM, 1,000 RPD  |
| llama-3.1-8b-instant    | 131K    | 131K       | Text     | 30 RPM, 14,400 RPD |
| `openai/gpt-oss-120b`   | 131K    | 65K        | Text     | 30 RPM, 1,000 RPD  |
| `openai/gpt-oss-20b`    | 131K    | 65K        | Text     | 30 RPM, 1,000 RPD  |
| `groq/compound`         | 131K    | 8K         | Text     | 30 RPM, 250 RPD    |
| `groq/compound-mini`    | 131K    | 8K         | Text     | 30 RPM, 250 RPD    |
| `qwen/qwen3.6-27b`      | 131K    | 16K        | Text     | 30 RPM, 1,000 RPD  |

### [Hugging Face](https://huggingface.co/settings/tokens) 🇺🇸

$0.10/month in Inference Provider credits for free users (subject to change). Routes to Fireworks, Together, Hyperbolic, Nebius, Novita, DeepInfra and others. Thousands of models.

Base URL: `https://router.huggingface.co/v1`

| Model Name                      | Context | Max Output | Modality                       | Rate Limit              |
| ------------------------------- | ------- | ---------- | ------------------------------ | ----------------------- |
| Meta-Llama-3.1-8B-Instruct      | 128K    | ~4K        | Text                           | Credit-metered          |
| gemma-3-4b-it                   | 131K    | ~4K        | Text                           | Credit-metered          |
| phi-4                           | 16K     | ~4K        | Text                           | Credit-metered          |
| Qwen2.5-Coder-7B-Instruct       | 131K    | ~4K        | Text                           | Credit-metered          |
| Qwen2.5-7B-Instruct             | 131K    | ~4K        | Text                           | Credit-metered          |
| + thousands of community models | Varies  | Varies     | Text, Image, Audio, Embeddings | 100K credits/month free |

### [Kilo Code](https://kilo.ai) 🇺🇸

Free models with no credit card required. `kilo-auto/free` auto-router dynamically routes to models in the free pool. [^5]

Base URL: `https://api.kilo.ai/api/gateway`

| Model Name                                           | Context | Max Output | Modality         | Rate Limit  |
| ---------------------------------------------------- | ------- | ---------- | ---------------- | ----------- |
| `nvidia/nemotron-3-ultra-550b-a55b:free`             | 1M      | 65K        | Text             | ~200 req/hr |
| `stepfun/step-3.7-flash:free`                        | 262K    | 262K       | Text             | ~200 req/hr |
| `nvidia/nemotron-3-super-120b-a12b:free`             | 262K    | 262K       | Text             | ~200 req/hr |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | 256K    | 65K        | Text (reasoning) | ~200 req/hr |
| `inclusionai/ling-3.0-flash:free`                    | 262K    | 32K        | Text             | ~200 req/hr |
| `poolside/laguna-s-2.1:free`                         | 262K    | 32K        | Text (code)      | ~200 req/hr |
| `poolside/laguna-xs-2.1:free`                        | 262K    | 32K        | Text (code)      | ~200 req/hr |
| `cohere/north-mini-code:free`                        | 256K    | 64K        | Text (code)      | ~200 req/hr |
| `openrouter/free`                                    | Varies  | Varies     | Text             | ~200 req/hr |

### [LLM7.io](https://token.llm7.io) 🇬🇧

Zero-friction API gateway. No registration needed for basic access. 30+ models. GDPR-compliant.

Base URL: `https://api.llm7.io/v1`

| Model Name            | Context | Max Output | Modality         | Rate Limit              |
| --------------------- | ------- | ---------- | ---------------- | ----------------------- |
| deepseek-r1-0528      | —       | —          | Text (reasoning) | 30 RPM (120 with token) |
| deepseek-v3-0324      | —       | —          | Text             | 30 RPM (120 with token) |
| gemini-2.5-flash-lite | —       | —          | Text + Vision    | 30 RPM (120 with token) |
| gpt-4o-mini           | —       | —          | Text + Vision    | 30 RPM (120 with token) |
| mistral-small-3.1-24b | 32K     | —          | Text             | 30 RPM (120 with token) |
| qwen2.5-coder-32b     | —       | —          | Text (code)      | 30 RPM (120 with token) |
| + ~24 more models     | Varies  | Varies     | Text             | 30 RPM (120 with token) |

### [ModelScope](https://modelscope.cn/my/myaccesstoken) 🇨🇳

Free API-Inference for registered users. Requires Alibaba Cloud account binding + real-name verification. [^6]

Base URL: `https://api-inference.modelscope.cn/v1`

| Model Name                     | Context | Max Output | Modality  | Rate Limit                                 |
| ------------------------------ | ------- | ---------- | --------- | ------------------------------------------ |
| `Qwen/Qwen3.5-35B-A3B`         | —       | —          | Text      | 2,000 RPD total; <=500 RPD/model (dynamic) |
| `Qwen/Qwen3.5-27B`             | —       | —          | Text      | 2,000 RPD total; <=500 RPD/model (dynamic) |
| + API-Inference-enabled models | Varies  | Varies     | LLM, MLLM | Dynamic quotas + dynamic concurrency       |

### [NVIDIA NIM](https://build.nvidia.com/explore/discover) 🇺🇸

Free with NVIDIA Developer Program membership. 100+ models. Rate-limited (no daily token cap).

Base URL: `https://integrate.api.nvidia.com/v1`

| Model Name                                | Context | Max Output | Modality                               | Rate Limit |
| ----------------------------------------- | ------- | ---------- | -------------------------------------- | ---------- |
| `deepseek-ai/deepseek-v4-flash`           | 1M      | ~64K       | Text                                   | ~40 RPM    |
| `nvidia/nemotron-3-super-120b-a12b`       | 262K    | 262K       | Text                                   | ~40 RPM    |
| `nvidia/nemotron-3-nano-30b-a3b`          | 128K    | 32K        | Text                                   | ~40 RPM    |
| `nvidia/llama-3.1-nemotron-ultra-253b-v1` | 128K    | 4K         | Text                                   | ~40 RPM    |
| `meta/llama-3.3-70b-instruct`             | 128K    | 4K         | Text                                   | ~40 RPM    |
| `mistralai/mistral-nemotron`              | 128K    | 8K         | Text                                   | ~40 RPM    |
| `google/gemma-4-31b-it`                   | 128K    | 8K         | Text                                   | ~40 RPM    |
| `mistralai/mistral-large-2-instruct`      | 128K    | 4K         | Text                                   | ~40 RPM    |
| `minimaxai/minimax-m3`                    | 1M      | ~64K       | Text                                   | ~40 RPM    |
| `mistralai/mistral-medium-3.5-128b`       | 262K    | 262K       | Text                                   | ~40 RPM    |
| `nvidia/nemotron-3-ultra-550b-a55b`       | 262K    | 262K       | Text                                   | ~40 RPM    |
| `openai/gpt-oss-120b`                     | 131K    | 131K       | Text                                   | ~40 RPM    |
| `openai/gpt-oss-20b`                      | 131K    | 131K       | Text                                   | ~40 RPM    |
| `deepseek-ai/deepseek-v4-pro`             | 128K    | ~64K       | Text                                   | ~40 RPM    |
| + 85 more models                          | Varies  | Varies     | Text, Image, Video, Speech, Embeddings | ~40 RPM    |

### [Ollama Cloud](https://ollama.com/settings/keys) 🇺🇸

Free tier with qualitative usage limits. 400+ models from Ollama library. Not OpenAI SDK-compatible; uses [Ollama API](https://docs.ollama.com/cloud). [^3]

Base URL: `https://api.ollama.com`

| Model Name             | Context | Max Output      | Modality | Rate Limit                          |
| ---------------------- | ------- | --------------- | -------- | ----------------------------------- |
| deepseek-v4-pro        | 128K    | Model-dependent | Text     | Session/weekly limits (unpublished) |
| deepseek-v4-flash      | 1M      | Model-dependent | Text     | Session/weekly limits (unpublished) |
| minimax-m3             | 1M      | Model-dependent | Text     | Session/weekly limits (unpublished) |
| kimi-k3                | 128K    | Model-dependent | Text     | Session/weekly limits (unpublished) |
| `gpt-oss:120b`         | 128K    | Model-dependent | Text     | Session/weekly limits (unpublished) |
| `gpt-oss:20b`          | 131K    | Model-dependent | Text     | Session/weekly limits (unpublished) |
| nemotron-3-ultra       | 262K    | Model-dependent | Text     | Session/weekly limits (unpublished) |
| `mistral-large-3:675b` | 128K    | Model-dependent | Text     | Session/weekly limits (unpublished) |
| `qwen3.5:397b`         | 131K    | Model-dependent | Text     | Session/weekly limits (unpublished) |
| + 10 more cloud models | Varies  | Varies          | Text     | Session/weekly limits (unpublished) |

### [OpenRouter](https://openrouter.ai/keys) 🇺🇸

~22 free models (marked with `:free` suffix). OpenAI SDK-compatible. [^4]

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
| + ~12 more free models                   | Varies  | Varies     | Text / Image | 20 RPM, 50 RPD |

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

### [SambaNova](https://cloud.sambanova.ai/apis) 🇺🇸

Free tier, no credit card. Ultra-fast RDU inference. 20 RPM, 200K tokens/day. [^8]

Base URL: `https://api.sambanova.ai/v1`

| Model Name                  | Context | Max Output | Modality             | Rate Limit               |
| --------------------------- | ------- | ---------- | -------------------- | ------------------------ |
| DeepSeek-V3.1               | 128K    | ~8K        | Text                 | 20 RPM, 20 RPD, 200K TPD |
| DeepSeek-V3.2 (Preview)     | 128K    | ~8K        | Text                 | 20 RPM, 20 RPD, 200K TPD |
| Meta-Llama-3.3-70B-Instruct | 128K    | ~3K        | Text                 | 20 RPM, 20 RPD, 200K TPD |
| gpt-oss-120b                | 128K    | ~128K      | Text                 | 20 RPM, 20 RPD, 200K TPD |
| MiniMax-M2.7                | 128K    | ~192K      | Text                 | 20 RPM, 20 RPD, 200K TPD |
| gemma-4-31B-it (Preview)    | 128K    | ~128K      | Text + Image + Video | 20 RPM, 20 RPD, 200K TPD |

### [SiliconFlow](https://cloud.siliconflow.cn/account/ak) 🇨🇳

Permanently free models, no credit card required. 200+ paid models also available.

Base URL: `https://api.siliconflow.cn/v1`

| Model Name                                | Context | Max Output   | Modality         | Rate Limit      |
| ----------------------------------------- | ------- | ------------ | ---------------- | --------------- |
| `Qwen/Qwen3-8B`                           | 131K    | 131K         | Text             | 30 RPM, 60K TPM |
| `deepseek-ai/DeepSeek-R1-Distill-Qwen-7B` | 131K    | Configurable | Text (reasoning) | 30 RPM, 60K TPM |

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

[^1]: Free tier not available in the EU, UK, or Switzerland ([available regions](https://ai.google.dev/gemini-api/docs/available-regions)).
[^2]: Groq rate limits were reduced in 2026. Most models now get 1,000 RPD on the free tier (down from 14,400). Llama 4 Maverick has been deprecated. See [rate limits](https://console.groq.com/docs/rate-limits).
[^3]: Ollama Cloud measures usage by GPU time, not tokens or requests. Free tier described as "light usage" with session limits resetting every 5 hours and weekly limits every 7 days. Pro (50x more) and Max (250x more) plans available. Not OpenAI SDK-compatible; uses the Ollama API.
[^4]: Free models default to 50 RPD per model. A one-time purchase of $10+ in credits unlocks 1,000 RPD for free models. OpenRouter also offers a [Free Models Router](https://openrouter.ai/docs/guides/routing/routers/free-models-router) (`openrouter/free`) and [model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks) for chaining models in priority order. Free providers may log prompts for training.
[^5]: Kilo Code free model list changes frequently. nvidia/nemotron-3-super-120b-a12b:free is for trial use only — prompts are logged by NVIDIA. Auto-router `kilo-auto/free` dynamically picks from the current free pool.
[^6]: API-Inference is free for registered users. Current published limits are 2,000 requests/day per user (total across models), with per-model daily quotas dynamically adjusted and capped at 500; concurrency is also dynamically rate-limited. Requires Alibaba Cloud account binding and real-name verification ([limits](https://modelscope.cn/docs/model-service/API-Inference/limits), [intro](https://modelscope.cn/docs/model-service/API-Inference/intro)).
[^7]: OVHcloud AI Endpoints offers a permanent free anonymous tier (2 requests per minute per IP, per model) with no signup or API key required. Higher rate limits (400 RPM per Public Cloud project per model) require an API key and are billed pay-as-you-go per token; new Public Cloud accounts get up to $200 in free trial credits. Models are hosted in EU data centers.
[^8]: SambaNova grants $5 in initial credits (valid 30 days) on top of the permanent free tier. The free tier itself persists indefinitely with 20 RPM, 20 RPD, and 200K TPD per model. No credit card required. OpenAI SDK-compatible.
