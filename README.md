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

## Contents

- [Provider APIs](#provider-apis)
- [Inference providers](#inference-providers)
- [Glossary](#glossary)

## Provider APIs

APIs run by the companies that train or fine-tune the models themselves.

### [Aion Labs](https://www.aionlabs.ai) 🇮🇱

Permanent free tier, no credit card required. 15 RPM, 20K tokens/day. Specialized for roleplay and storytelling.

Base URL: `https://api.aionlabs.ai/v1`

| Model Name       | Context | Max Output | Modality        | Rate Limit      |
| ---------------- | ------- | ---------- | --------------- | --------------- |
| Aion 2.5         | 128K    | 32K        | Text (roleplay) | 15 RPM, 20K TPD |
| Aion 2.0         | 128K    | 32K        | Text (roleplay) | 15 RPM, 20K TPD |
| Aion-RP 1.0 (8B) | 32K     | ~8K        | Text (roleplay) | 15 RPM, 20K TPD |

### [Cohere](https://dashboard.cohere.com/api-keys) 🇨🇦

Free "Trial" API key, no credit card. 1,000 API calls/month. Non-commercial use only.

Base URL: `https://api.cohere.com/v2`

| Model Name        | Context | Max Output | Modality | Rate Limit |
| ----------------- | ------- | ---------- | -------- | ---------- |
| Command A+ (218B) | 128K    | 4K         | Text     | 20 RPM     |
| Command A (111B)  | 256K    | 4K         | Text     | 20 RPM     |
| Command R+        | 128K    | 4K         | Text     | 20 RPM     |
| Command R         | 128K    | 4K         | Text     | 20 RPM     |
| Command R7B       | 128K    | 4K         | Text     | 20 RPM     |

### [Google Gemini](https://aistudio.google.com/app/apikey) 🇺🇸

Free tier unavailable in EU/UK/Switzerland. Free-tier prompts may be used by Google to improve products. [^1]

Base URL: `https://generativelanguage.googleapis.com/v1beta`

| Model Name            | Context | Max Output | Modality                     | Rate Limit        |
| --------------------- | ------- | ---------- | ---------------------------- | ----------------- |
| Gemini 3.5 Flash      | 1M      | 64K        | Text + Image + Audio + Video | 15 RPM, 1,500 RPD |
| Gemini 3.1 Flash-Lite | 1M      | 65K        | Text + Image + Audio + Video | 30 RPM, 1,500 RPD |
| Gemini 2.5 Flash      | 1M      | 65K        | Text + Image + Audio + Video | 15 RPM, 1,500 RPD |
| Gemini 2.5 Pro        | 2M      | 65K        | Text + Image + Audio + Video | 5 RPM, 50 RPD     |

### [Mistral AI](https://console.mistral.ai/api-keys) 🇫🇷

Free "Experiment" plan, no credit card. ~1B tokens/month. Prompts may be used to improve models.

Base URL: `https://api.mistral.ai/v1`

| Model Name                | Context | Max Output | Modality            | Rate Limit       |
| ------------------------- | ------- | ---------- | ------------------- | ---------------- |
| Mistral Medium 3.5 (128B) | 256K    | 256K       | Text + Image + Code | ~1 RPS, 500K TPM |
| Mistral Small 4           | 256K    | 256K       | Text + Image + Code | ~1 RPS, 500K TPM |
| Mistral Large 3           | 256K    | 256K       | Text                | ~1 RPS, 500K TPM |
| Mistral Nemo (12B)        | 128K    | 128K       | Text                | ~1 RPS, 500K TPM |
| Codestral                 | 256K    | 256K       | Code                | ~1 RPS, 500K TPM |
| Pixtral Large             | 128K    | 128K       | Text + Image        | ~1 RPS, 500K TPM |

### [Z AI (Zhipu AI)](https://open.bigmodel.cn/usercenter/apikeys) 🇨🇳

Permanent free models, no credit card required.

Base URL: `https://open.bigmodel.cn/api/paas/v4`

| Model Name     | Context | Max Output | Modality     | Rate Limit           |
| -------------- | ------- | ---------- | ------------ | -------------------- |
| GLM-4.7-Flash  | 200K    | 128K       | Text         | 1 concurrent request |
| GLM-4.6V-Flash | 128K    | ~4K        | Text + Image | 1 concurrent request |

## Inference providers

Third-party platforms that host open-weight models from various sources.

### [Cerebras](https://cloud.cerebras.ai/) 🇺🇸

Free tier, no credit card. Ultra-fast inference (~2,600 tok/s). 1M tokens/day cap. 8K context cap on free tier.

Base URL: `https://api.cerebras.ai/v1`

| Model Name   | Context           | Max Output | Modality | Rate Limit                 |
| ------------ | ----------------- | ---------- | -------- | -------------------------- |
| gpt-oss-120b | 128K (8K on free) | 8K         | Text     | 30 RPM, 14,400 RPD, 1M TPD |
| zai-glm-4.7  | 128K (8K on free) | 8K         | Text     | 10 RPM, 100 RPD, 1M TPD    |

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

### [GitHub Models](https://github.com/marketplace/models) 🇺🇸

Free prototyping for all GitHub users. 45+ models. Per-request limits (8K in / 4K out).

Base URL: `https://models.github.ai/inference`

| Model Name                | Context | Max Output | Modality         | Rate Limit      |
| ------------------------- | ------- | ---------- | ---------------- | --------------- |
| gpt-5                     | 200K    | 32K        | Text             | 10 RPM, 50 RPD  |
| gpt-4.1                   | 1M      | 32K        | Text             | 10 RPM, 50 RPD  |
| gpt-4.1-mini              | 1M      | 32K        | Text             | 15 RPM, 150 RPD |
| gpt-4o                    | 128K    | 16K        | Text + Vision    | 10 RPM, 50 RPD  |
| o4-mini                   | 200K    | 100K       | Text (reasoning) | 10 RPM, 50 RPD  |
| Llama-4-Scout-17B-16E     | 512K    | ~4K        | Text + Vision    | 15 RPM, 150 RPD |
| Llama-4-Maverick-17B-128E | 256K    | ~4K        | Text + Vision    | 10 RPM, 50 RPD  |
| Meta-Llama-3.3-70B        | 131K    | ~4K        | Text             | 15 RPM, 150 RPD |
| DeepSeek-R1               | 64K     | 8K         | Text (reasoning) | 15 RPM, 150 RPD |
| Mistral-Small-3.1         | 128K    | ~4K        | Text + Vision    | 15 RPM, 150 RPD |
| + 35 more models          | Varies  | Varies     | Text / Image     | Varies by tier  |

### [Groq](https://console.groq.com/keys) 🇺🇸

Free tier, no credit card. Ultra-fast LPU inference. [^2]

Base URL: `https://api.groq.com/openai/v1`

| Model Name                     | Context | Max Output | Modality      | Rate Limit        |
| ------------------------------ | ------- | ---------- | ------------- | ----------------- |
| llama-3.3-70b-versatile        | 131K    | 32K        | Text          | 30 RPM, 1,000 RPD |
| llama-3.1-8b-instant           | 131K    | 131K       | Text          | 30 RPM, 1,000 RPD |
| llama-4-scout-17b-16e-instruct | 131K    | 8K         | Text + Vision | 30 RPM, 1,000 RPD |
| qwen3-32b                      | 131K    | 131K       | Text          | 30 RPM, 1,000 RPD |
| gpt-oss-120b                   | 131K    | 32K        | Text          | 30 RPM, 1,000 RPD |

### [Hugging Face](https://huggingface.co/settings/tokens) 🇺🇸

100K monthly Inference Provider credits for free users. Routes to Fireworks, Together, Hyperbolic, Nebius, Novita, DeepInfra and others. Thousands of models.

Base URL: `https://router.huggingface.co/v1`

| Model Name                      | Context | Max Output | Modality                       | Rate Limit              |
| ------------------------------- | ------- | ---------- | ------------------------------ | ----------------------- |
| Meta-Llama-3.1-8B-Instruct      | 128K    | ~4K        | Text                           | Credit-metered          |
| Mistral-7B-Instruct-v0.3        | 32K     | ~4K        | Text                           | Credit-metered          |
| Mixtral-8x7B-Instruct-v0.1      | 32K     | ~4K        | Text                           | Credit-metered          |
| Phi-3.5-mini-instruct           | 128K    | ~4K        | Text                           | Credit-metered          |
| Qwen2.5-7B-Instruct             | 131K    | ~4K        | Text                           | Credit-metered          |
| + thousands of community models | Varies  | Varies     | Text, Image, Audio, Embeddings | 100K credits/month free |

### [Kilo Code](https://kilo.ai) 🇺🇸

Free models with no credit card required. `kilo-auto/free` auto-router routes to minimax/minimax-m2.5:free (80%) and stepfun/step-3.5-flash:free (20%). [^5]

Base URL: `https://api.kilo.ai/api/gateway`

| Model Name                               | Context | Max Output | Modality         | Rate Limit  |
| ---------------------------------------- | ------- | ---------- | ---------------- | ----------- |
| `x-ai/grok-code-fast-1:free`             | 256K    | —          | Text (code)      | ~200 req/hr |
| `minimax/minimax-m2.5:free`              | 196K    | 8K         | Text             | ~200 req/hr |
| `bytedance-seed/dola-seed-2.0-pro:free`  | —       | —          | Text             | ~200 req/hr |
| `nvidia/nemotron-3-super-120b-a12b:free` | 262K    | 32K        | Text             | ~200 req/hr |
| `arcee-ai/trinity-large-thinking:free`   | —       | —          | Text (reasoning) | ~200 req/hr |
| `openrouter/free`                        | Varies  | Varies     | Text             | ~200 req/hr |

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
| `deepseek-ai/deepseek-r1`                 | 128K    | ~163K      | Text (reasoning)                       | ~40 RPM    |
| `nvidia/nemotron-3-super-120b-a12b`       | 262K    | 262K       | Text                                   | ~40 RPM    |
| `nvidia/nemotron-3-nano-30b-a3b`          | 128K    | 32K        | Text                                   | ~40 RPM    |
| `nvidia/llama-3.1-nemotron-ultra-253b-v1` | 128K    | 4K         | Text                                   | ~40 RPM    |
| `meta/llama-3.1-405b-instruct`            | 128K    | 4K         | Text                                   | ~40 RPM    |
| `qwen/qwen2.5-72b-instruct`               | 128K    | 8K         | Text                                   | ~40 RPM    |
| `google/gemma-4-31b`                      | 128K    | 8K         | Text                                   | ~40 RPM    |
| `mistralai/mistral-large-2-instruct`      | 128K    | 4K         | Text                                   | ~40 RPM    |
| `minimax/minimax-m2.7`                    | 128K    | 8K         | Text                                   | ~40 RPM    |
| + 90 more models                          | Varies  | Varies     | Text, Image, Video, Speech, Embeddings | ~40 RPM    |

### [Ollama Cloud](https://ollama.com/settings/keys) 🇺🇸

Free tier with qualitative usage limits. 400+ models from Ollama library. Not OpenAI SDK-compatible; uses [Ollama API](https://docs.ollama.com/cloud). [^3]

Base URL: `https://api.ollama.com`

| Model Name                 | Context | Max Output      | Modality         | Rate Limit                          |
| -------------------------- | ------- | --------------- | ---------------- | ----------------------------------- |
| `gpt-oss:120b-cloud`       | 128K    | Model-dependent | Text             | Session/weekly limits (unpublished) |
| `deepseek-v3.1:671b-cloud` | 128K    | Model-dependent | Text             | Session/weekly limits (unpublished) |
| `qwen3-coder:480b-cloud`   | 128K    | Model-dependent | Text (code)      | Session/weekly limits (unpublished) |
| `kimi-k2:1t-cloud`         | 262K    | Model-dependent | Text             | Session/weekly limits (unpublished) |
| `glm-4.6:cloud`            | 128K    | Model-dependent | Text             | Session/weekly limits (unpublished) |
| `deepseek-r1:cloud`        | 128K    | Model-dependent | Text (reasoning) | Session/weekly limits (unpublished) |
| + 30 more cloud models     | Varies  | Varies          | Text             | Session/weekly limits (unpublished) |

### [OpenRouter](https://openrouter.ai/keys) 🇺🇸

~22 free models (marked with `:free` suffix). OpenAI SDK-compatible. [^4]

Base URL: `https://openrouter.ai/api/v1`

| Model Name                                  | Context | Max Output | Modality     | Rate Limit      |
| ------------------------------------------- | ------- | ---------- | ------------ | --------------- |
| `qwen/qwen3-coder:free`                     | 1M      | 262K       | Text (code)  | 20 RPM, 200 RPD |
| `nvidia/nemotron-3-ultra-550b-a55b:free`    | 1M      | 65K        | Text         | 20 RPM, 200 RPD |
| `nvidia/nemotron-3-super-120b-a12b:free`    | 1M      | 262K       | Text         | 20 RPM, 200 RPD |
| `openai/gpt-oss-120b:free`                  | 131K    | 131K       | Text         | 20 RPM, 200 RPD |
| `openai/gpt-oss-20b:free`                   | 131K    | 8K         | Text         | 20 RPM, 200 RPD |
| `meta-llama/llama-3.3-70b-instruct:free`    | 131K    | ~16K       | Text         | 20 RPM, 200 RPD |
| `nousresearch/hermes-3-llama-3.1-405b:free` | 131K    | ~16K       | Text         | 20 RPM, 200 RPD |
| `google/gemma-4-31b-it:free`                | 262K    | 32K        | Multimodal   | 20 RPM, 200 RPD |
| `poolside/laguna-m.1:free`                  | 262K    | 32K        | Text         | 20 RPM, 200 RPD |
| `qwen/qwen3-next-80b-a3b-instruct:free`     | 262K    | ~32K       | Text         | 20 RPM, 200 RPD |
| + ~12 more free models                      | Varies  | Varies     | Text / Image | 20 RPM, 200 RPD |

### [OVHcloud AI Endpoints](https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/) 🇫🇷

Free anonymous tier (no API key, no signup): 2 RPM per IP per model. 20+ open-weight models hosted in EU. OpenAI SDK-compatible. [^7]

Base URL: `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1`

| Model Name                     | Context | Max Output | Modality      | Rate Limit        |
| ------------------------------ | ------- | ---------- | ------------- | ----------------- |
| Qwen3.5-397B-A17B              | 131K    | ~32K       | Text          | 2 RPM (anonymous) |
| gpt-oss-120b                   | 128K    | ~32K       | Text          | 2 RPM (anonymous) |
| gpt-oss-20b                    | 128K    | ~8K        | Text          | 2 RPM (anonymous) |
| Meta-Llama-3_3-70B-Instruct    | 131K    | ~4K        | Text          | 2 RPM (anonymous) |
| Llama-3.1-8B-Instruct          | 131K    | ~4K        | Text          | 2 RPM (anonymous) |
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

| Model Name                  | Context | Max Output | Modality | Rate Limit               |
| --------------------------- | ------- | ---------- | -------- | ------------------------ |
| DeepSeek-V3.1               | 128K    | ~8K        | Text     | 20 RPM, 20 RPD, 200K TPD |
| DeepSeek-V3.2 (Preview)     | 128K    | ~8K        | Text     | 20 RPM, 20 RPD, 200K TPD |
| Meta-Llama-3.3-70B-Instruct | 128K    | ~8K        | Text     | 20 RPM, 20 RPD, 200K TPD |
| gpt-oss-120b                | 128K    | ~8K        | Text     | 20 RPM, 20 RPD, 200K TPD |
| MiniMax-M2.7                | 128K    | ~8K        | Text     | 20 RPM, 20 RPD, 200K TPD |
| gemma-4-31B-it (Preview)    | 128K    | ~8K        | Text     | 20 RPM, 20 RPD, 200K TPD |

### [SiliconFlow](https://cloud.siliconflow.cn/account/ak) 🇨🇳

Permanently free models, no credit card required. 200+ paid models also available.

Base URL: `https://api.siliconflow.cn/v1`

| Model Name                                | Context | Max Output   | Modality         | Rate Limit      |
| ----------------------------------------- | ------- | ------------ | ---------------- | --------------- |
| `Qwen/Qwen3-8B`                           | 131K    | 131K         | Text             | 30 RPM, 60K TPM |
| `deepseek-ai/DeepSeek-R1-Distill-Qwen-7B` | 131K    | Configurable | Text (reasoning) | 30 RPM, 60K TPM |

### [GoldBean](https://github.com/wuzenghai616-lang/goldbean) 🌐

Free tier with 20 credits/day (no credit card, no API key). MCP-native — use any MCP client. Paid calls at \$0.01–\$0.03 via x402 USDC on Base, PayPal, or Alipay.

Base URL: `https://goldbean-api.xyz/sse` (MCP over SSE)

| Model Name              | Context | Max Output | Modality                    | Rate Limit        |
| ----------------------- | ------- | ---------- | --------------------------- | ----------------- |
| ERNIE-4.5-Turbo         | 128K    | 4K         | Text                        | 20 calls/day free |
| ERNIE-Speed             | 128K    | 4K         | Text                        | 20 calls/day free |
| DeepSeek-V3 (via Baidu) | 128K    | 8K         | Text                        | 20 calls/day free |
| Qwen3-32B (via Baidu)   | 131K    | 8K         | Text                        | 20 calls/day free |

> **Note**: GoldBean is an MCP Server, not an OpenAI-compatible API. 21 of its 47 endpoints (including LLM chat, OCR, and text analysis) are permanently free. Install: `npx goldbean-mcp`.

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
[^4]: Free models default to 200 RPD per model. A one-time purchase of $10+ in credits unlocks 1,000 RPD for free models. OpenRouter also offers a [Free Models Router](https://openrouter.ai/docs/guides/routing/routers/free-models-router) (`openrouter/free`) and [model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks) for chaining models in priority order. Free providers may log prompts for training.
[^5]: Kilo Code free model list may change over time. nvidia/nemotron-3-super-120b-a12b:free is for trial use only — prompts are logged by NVIDIA. Auto-router `kilo-auto/free` routes to minimax/minimax-m2.5:free (80%) and stepfun/step-3.5-flash:free (20%).
[^6]: API-Inference is free for registered users. Current published limits are 2,000 requests/day per user (total across models), with per-model daily quotas dynamically adjusted and capped at 500; concurrency is also dynamically rate-limited. Requires Alibaba Cloud account binding and real-name verification ([limits](https://modelscope.cn/docs/model-service/API-Inference/limits), [intro](https://modelscope.cn/docs/model-service/API-Inference/intro)).
[^7]: OVHcloud AI Endpoints offers a permanent free anonymous tier (2 requests per minute per IP, per model) with no signup or API key required. Higher rate limits (400 RPM per Public Cloud project per model) require an API key and are billed pay-as-you-go per token; new Public Cloud accounts get up to $200 in free trial credits. Models are hosted in EU data centers.
[^8]: SambaNova grants $5 in initial credits (valid 30 days) on top of the permanent free tier. The free tier itself persists indefinitely with 20 RPM, 20 RPD, and 200K TPD per model. No credit card required. OpenAI SDK-compatible.
