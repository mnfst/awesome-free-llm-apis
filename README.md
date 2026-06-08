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

### [AI21 Labs](https://studio.ai21.com/account/api-key) 🇮🇱

$10 trial credits at signup, no credit card. Credits expire in 3 months. Covers Jamba Large and Jamba Mini.

Base URL: `https://api.ai21.com/studio/v1`

| Model Name      | Context | Max Output | Modality | Rate Limit      |
| --------------- | ------- | ---------- | -------- | --------------- |
| Jamba Large 1.7 | 256K    | 4K         | Text     | 200 RPM, 10 RPS |
| Jamba Mini 2    | 256K    | 4K         | Text     | 200 RPM, 10 RPS |

### [Aion Labs](https://www.aionlabs.ai) 🇮🇱

Free daily token allowance, no credit card required. Specialized for roleplay and storytelling.

Base URL: `https://api.aionlabs.ai/v1`

| Model Name    | Context | Max Output | Modality        | Rate Limit            |
| ------------- | ------- | ---------- | --------------- | --------------------- |
| aion-2.0      | 131K    | ~32K       | Text (roleplay) | Daily token allowance |
| aion-1.0      | 131K    | ~32K       | Text            | Daily token allowance |
| aion-1.0-mini | 131K    | ~32K       | Text            | Daily token allowance |

### [Alibaba Cloud Model Studio](https://bailian.console.alibabacloud.com/?apiKey=1) 🇨🇳

1M free tokens per Qwen model on signup, expires in 90 days (International / Singapore region). No credit card required. [^8]

Base URL: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`

| Model Name       | Context | Max Output | Modality         | Rate Limit       |
| ---------------- | ------- | ---------- | ---------------- | ---------------- |
| Qwen3-Max        | 128K    | 32K        | Text             | Tiered by region |
| Qwen3-Plus       | 1M      | 32K        | Text             | Tiered by region |
| Qwen3-VL-Plus    | 128K    | 8K         | Text + Vision    | Tiered by region |
| Qwen3-Coder-Plus | 256K    | 8K         | Text (code)      | Tiered by region |
| QwQ-Plus         | 131K    | 32K        | Text (reasoning) | Tiered by region |

### [Cohere](https://dashboard.cohere.com/api-keys) 🇨🇦

Free "Trial" API key, no credit card. 1,000 API calls/month. Non-commercial use only.

Base URL: `https://api.cohere.com/v2`

| Model Name       | Context | Max Output | Modality                  | Rate Limit       |
| ---------------- | ------- | ---------- | ------------------------- | ---------------- |
| Command A (111B) | 256K    | 4K         | Text                      | 20 RPM           |
| Command R+       | 128K    | 4K         | Text                      | 20 RPM           |
| Command R        | 128K    | 4K         | Text                      | 20 RPM           |
| Command R7B      | 128K    | 4K         | Text                      | 20 RPM           |
| Embed 4          | —       | —          | Embeddings (Text + Image) | 2,000 inputs/min |
| Rerank 3.5       | —       | —          | Reranking                 | 10 RPM           |

### [DeepSeek](https://platform.deepseek.com/api_keys) 🇨🇳

5M free tokens on signup, no credit card. Credits expire 30 days after signup; pay-as-you-go after. Prompts may be used for training unless opted out. [^9]

Base URL: `https://api.deepseek.com/v1`

| Model Name             | Context | Max Output | Modality         | Rate Limit |
| ---------------------- | ------- | ---------- | ---------------- | ---------- |
| deepseek-chat (V3.2)   | 128K    | 8K         | Text             | Dynamic    |
| deepseek-reasoner (R1) | 128K    | 8K         | Text (reasoning) | Dynamic    |

### [Google Gemini](https://aistudio.google.com/app/apikey) 🇺🇸

Free tier unavailable in EU/UK/Switzerland. Free-tier prompts may be used by Google to improve products. [^1]

Base URL: `https://generativelanguage.googleapis.com/v1beta`

| Model Name               | Context | Max Output | Modality                     | Rate Limit        |
| ------------------------ | ------- | ---------- | ---------------------------- | ----------------- |
| Gemini 2.5 Pro           | 2M      | 65K        | Text + Image + Audio + Video | 5 RPM, 100 RPD    |
| Gemini 2.5 Flash         | 1M      | 65K        | Text + Image + Audio + Video | 10 RPM, 250 RPD   |
| Gemini 2.5 Flash-Lite    | 1M      | 65K        | Text + Image + Audio + Video | 15 RPM, 1,000 RPD |
| Gemini 3 Flash (Preview) | 1M      | 65K        | Text + Image + Audio + Video | Preview limits    |

### [Mistral AI](https://console.mistral.ai/api-keys) 🇫🇷

Free "Experiment" plan, no credit card. ~1B tokens/month. Prompts may be used to improve models.

Base URL: `https://api.mistral.ai/v1`

| Model Name         | Context | Max Output | Modality            | Rate Limit       |
| ------------------ | ------- | ---------- | ------------------- | ---------------- |
| Mistral Small 4    | 256K    | 256K       | Text + Image + Code | ~1 RPS, 500K TPM |
| Mistral Medium 3   | 128K    | 128K       | Text                | ~1 RPS, 500K TPM |
| Mistral Large 3    | 256K    | 256K       | Text                | ~1 RPS, 500K TPM |
| Mistral Nemo (12B) | 128K    | 128K       | Text                | ~1 RPS, 500K TPM |
| Codestral          | 256K    | 256K       | Code                | ~1 RPS, 500K TPM |
| Pixtral Large      | 128K    | 128K       | Text + Image        | ~1 RPS, 500K TPM |

### [xAI](https://console.x.ai) 🇺🇸

$25 sign-up credit, no credit card required. One-time only; additional $150/month available via opt-in data-sharing program (requires prior spend). [^12]

Base URL: `https://api.x.ai/v1`

| Model Name    | Context | Max Output | Modality | Rate Limit   |
| ------------- | ------- | ---------- | -------- | ------------ |
| grok-4.3      | 1M      | ~32K       | Text     | Credit-based |
| grok-4.1-fast | 2M      | ~32K       | Text     | Credit-based |
| grok-3-mini   | 131K    | 8K         | Text     | Credit-based |

### [Z AI (Zhipu AI)](https://open.bigmodel.cn/usercenter/apikeys) 🇨🇳

Permanent free models, no credit card required.

Base URL: `https://open.bigmodel.cn/api/paas/v4`

| Model Name     | Context | Max Output | Modality     | Rate Limit           |
| -------------- | ------- | ---------- | ------------ | -------------------- |
| GLM-4.7-Flash  | 200K    | 128K       | Text         | 1 concurrent request |
| GLM-4.5-Flash  | 128K    | ~8K        | Text         | 1 concurrent request |
| GLM-4.6V-Flash | 128K    | ~4K        | Text + Image | 1 concurrent request |

- [TWZRD Agent Intel](https://intel.twzrd.xyz) - Free MCP endpoint for AI agent trust scoring on Solana. `score_agent`, `preflight_check` tools are free. `{"mcpServers":{"twzrd-agent-intel":{"url":"https://intel.twzrd.xyz/mcp"}}}`
## Inference providers

Third-party platforms that host open-weight models from various sources.

### [Cerebras](https://cloud.cerebras.ai/) 🇺🇸

Free tier, no credit card. Ultra-fast inference (~2,600 tok/s). 1M tokens/day cap. 8K context cap on free tier. llama3.1-8b scheduled for deprecation May 27, 2026.

Base URL: `https://api.cerebras.ai/v1`

| Model Name                     | Context           | Max Output | Modality      | Rate Limit                 |
| ------------------------------ | ----------------- | ---------- | ------------- | -------------------------- |
| llama-3.3-70b                  | 128K (8K on free) | 8K         | Text          | 30 RPM, 14,400 RPD, 1M TPD |
| gpt-oss-120b                   | 128K (8K on free) | 8K         | Text          | 30 RPM, 14,400 RPD, 1M TPD |
| qwen-3-235b-a22b-instruct-2507 | 131K (8K on free) | 8K         | Text          | 30 RPM, 14,400 RPD, 1M TPD |
| qwen-3-32b                     | 131K (8K on free) | 8K         | Text          | 30 RPM, 14,400 RPD, 1M TPD |
| llama-4-scout-17b-16e-instruct | 128K (8K on free) | 8K         | Text + Vision | 30 RPM, 14,400 RPD, 1M TPD |
| zai-glm-4.7                    | 128K (8K on free) | 8K         | Text          | 10 RPM, 100 RPD, 1M TPD    |

### [Cloudflare Workers AI](https://dash.cloudflare.com/profile/api-tokens) 🇺🇸

10,000 Neurons/day free. 50+ models available on free tier.

Base URL: `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run`

| Model Name                                     | Context   | Max Output        | Modality                       | Rate Limit               |
| ---------------------------------------------- | --------- | ----------------- | ------------------------------ | ------------------------ |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast`     | 131K      | Shared w/ context | Text                           | 10K neurons/day (shared) |
| `@cf/meta/llama-3.1-8b-instruct-fp8-fast`      | 131K      | Shared w/ context | Text                           | 10K neurons/day (shared) |
| `@cf/meta/llama-3.2-11b-vision-instruct`       | 131K      | Shared w/ context | Text + Vision                  | 10K neurons/day (shared) |
| `@cf/meta/llama-4-scout-17b-16e-instruct`      | Up to 10M | Shared w/ context | Multimodal                     | 10K neurons/day (shared) |
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | 128K      | Shared w/ context | Text                           | 10K neurons/day (shared) |
| `@cf/google/gemma-4-26b-a4b-it`                | 256K      | Shared w/ context | Text                           | 10K neurons/day (shared) |
| `@cf/moonshotai/kimi-k2.5`                     | 256K      | Shared w/ context | Text + Vision                  | 10K neurons/day (shared) |
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

| Model Name                         | Context | Max Output | Modality      | Rate Limit         |
| ---------------------------------- | ------- | ---------- | ------------- | ------------------ |
| llama-3.3-70b-versatile            | 131K    | 32K        | Text          | 30 RPM, 14,400 RPD |
| llama-3.1-8b-instant               | 131K    | 131K       | Text          | 30 RPM, 14,400 RPD |
| llama-4-scout-17b-16e-instruct     | 131K    | 8K         | Text + Vision | 30 RPM, 14,400 RPD |
| llama-4-maverick-17b-128e-instruct | 131K    | 8K         | Text + Vision | 15 RPM, 500 RPD    |
| qwen3-32b                          | 131K    | 131K       | Text          | 30 RPM, 14,400 RPD |
| gpt-oss-120b                       | 131K    | 32K        | Text          | 30 RPM, 14,400 RPD |
| kimi-k2-instruct                   | 262K    | 262K       | Text          | 30 RPM, 14,400 RPD |
| deepseek-r1-distill-70b            | 131K    | 8K         | Text          | 30 RPM, 14,400 RPD |
| whisper-large-v3                   | —       | —          | Audio → Text  | 20 RPM, 2,000 RPD  |
| whisper-large-v3-turbo             | —       | —          | Audio → Text  | 20 RPM, 2,000 RPD  |

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

| Model Name                     | Context | Max Output | Modality         | Rate Limit                                 |
| ------------------------------ | ------- | ---------- | ---------------- | ------------------------------------------ |
| `Qwen/Qwen3.5-35B-A3B`         | —       | —          | Text + Vision    | 2,000 RPD total; <=500 RPD/model (dynamic) |
| `Qwen/Qwen3.5-27B`             | —       | —          | Text             | 2,000 RPD total; <=500 RPD/model (dynamic) |
| `Qwen/Qwen-Image`              | —       | —          | Image Generation | 2,000 RPD total; model/AIGC-specific caps  |
| + API-Inference-enabled models | Varies  | Varies     | LLM, MLLM, AIGC  | Dynamic quotas + dynamic concurrency       |

### [Nebius](https://studio.nebius.com/settings/api-keys) 🇳🇱

$1 free signup credits, no credit card required. 60+ open-source models via OpenAI-compatible API. EU-based. [^10]

Base URL: `https://api.studio.nebius.com/v1`

| Model Name                   | Context | Max Output | Modality                       | Rate Limit |
| ---------------------------- | ------- | ---------- | ------------------------------ | ---------- |
| Meta-Llama-3.3-70B-Instruct  | 128K    | ~8K        | Text                           | Tier-based |
| DeepSeek-V3-0324             | 128K    | ~8K        | Text                           | Tier-based |
| DeepSeek-R1                  | 128K    | ~32K       | Text (reasoning)               | Tier-based |
| Qwen3-235B-A22B              | 128K    | ~32K       | Text                           | Tier-based |
| gpt-oss-120b                 | 128K    | ~32K       | Text                           | Tier-based |
| + 55 more open-source models | Varies  | Varies     | Text, Vision, Code, Embeddings | Tier-based |

### [Nscale](https://console.nscale.com/) 🇬🇧

$5 free signup credits, no credit card required. EU-sovereign provider; data centers in Norway. "No rate limits, no cold starts." [^11]

Base URL: `https://inference.api.nscale.com/v1`

| Model Name                    | Context | Max Output | Modality         | Rate Limit |
| ----------------------------- | ------- | ---------- | ---------------- | ---------- |
| Llama-3.3-70B-Instruct        | 128K    | ~8K        | Text             | Fair-use   |
| Qwen3-Coder-30B-A3B-Instruct  | 256K    | ~32K       | Text (code)      | Fair-use   |
| DeepSeek-R1-Distill-Llama-70B | 128K    | ~32K       | Text (reasoning) | Fair-use   |
| gpt-oss-120b                  | 128K    | ~32K       | Text             | Fair-use   |
| Qwen3-32B                     | 128K    | ~32K       | Text             | Fair-use   |

### [NVIDIA NIM](https://build.nvidia.com/explore/discover) 🇺🇸

Free with NVIDIA Developer Program membership. 100+ models. Rate-limited (no daily token cap).

Base URL: `https://integrate.api.nvidia.com/v1`

| Model Name                                | Context | Max Output | Modality                               | Rate Limit |
| ----------------------------------------- | ------- | ---------- | -------------------------------------- | ---------- |
| `deepseek-ai/deepseek-r1`                 | 128K    | ~163K      | Text (reasoning)                       | ~40 RPM    |
| `nvidia/llama-3.1-nemotron-ultra-253b-v1` | 128K    | 4K         | Text                                   | ~40 RPM    |
| `nvidia/nemotron-3-super-120b-a12b`       | 262K    | 262K       | Text                                   | ~40 RPM    |
| `nvidia/nemotron-3-nano-30b-a3b`          | 128K    | 32K        | Text                                   | ~40 RPM    |
| `meta/llama-3.1-405b-instruct`            | 128K    | 4K         | Text                                   | ~40 RPM    |
| `qwen/qwen2.5-72b-instruct`               | 128K    | 8K         | Text                                   | ~40 RPM    |
| `google/gemma-4-31b`                      | 128K    | 8K         | Text                                   | ~40 RPM    |
| `mistralai/mistral-large-2-instruct`      | 128K    | 4K         | Text                                   | ~40 RPM    |
| `nvidia/nemotron-nano-2-vl`               | 128K    | 8K         | Vision + Text + Video                  | ~40 RPM    |
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

~28 free models (marked with `:free` suffix). OpenAI SDK-compatible. [^4]

Base URL: `https://openrouter.ai/api/v1`

| Model Name                               | Context | Max Output | Modality         | Rate Limit     |
| ---------------------------------------- | ------- | ---------- | ---------------- | -------------- |
| `deepseek/deepseek-r1-0528:free`         | 163K    | ~163K      | Text (reasoning) | 20 RPM, 50 RPD |
| `deepseek/deepseek-chat-v3.1:free`       | 163K    | 163K       | Text             | 20 RPM, 50 RPD |
| `qwen/qwen3-235b-a22b:free`              | 128K    | ~32K       | Text             | 20 RPM, 50 RPD |
| `qwen/qwen3-coder-480b-a35b:free`        | 262K    | ~32K       | Text (code)      | 20 RPM, 50 RPD |
| `meta-llama/llama-4-scout:free`          | 10M     | 16K        | Multimodal       | 20 RPM, 50 RPD |
| `meta-llama/llama-4-maverick:free`       | 1M      | 16K        | Multimodal       | 20 RPM, 50 RPD |
| `meta-llama/llama-3.3-70b-instruct:free` | 65K     | ~16K       | Text             | 20 RPM, 50 RPD |
| `google/gemma-4-31b-it:free`             | 256K    | ~8K        | Multimodal       | 20 RPM, 50 RPD |
| `nvidia/nemotron-3-super-120b-a12b:free` | 1M      | ~32K       | Text             | 20 RPM, 50 RPD |
| `openai/gpt-oss-120b:free`               | 131K    | 131K       | Text             | 20 RPM, 50 RPD |
| `minimax/minimax-m2.5:free`              | 196K    | 8K         | Text             | 20 RPM, 50 RPD |
| `mistralai/devstral-2512:free`           | 256K    | ~32K       | Text             | 20 RPM, 50 RPD |
| + ~16 more free models                   | Varies  | Varies     | Text / Image     | 20 RPM, 50 RPD |

### [OVHcloud AI Endpoints](https://endpoints.ai.cloud.ovh.net/) 🇫🇷

Free anonymous tier (no API key, no signup): 2 RPM per IP per model. 40+ open-weight models hosted in EU. OpenAI SDK-compatible. [^7]

Base URL: `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1`

| Model Name                    | Context | Max Output | Modality                          | Rate Limit        |
| ----------------------------- | ------- | ---------- | --------------------------------- | ----------------- |
| Meta-Llama-3_3-70B-Instruct   | 131K    | ~4K        | Text                              | 2 RPM (anonymous) |
| Meta-Llama-3_1-8B-Instruct    | 131K    | ~4K        | Text                              | 2 RPM (anonymous) |
| DeepSeek-R1-Distill-Llama-70B | 131K    | ~32K       | Text (reasoning)                  | 2 RPM (anonymous) |
| Qwen3-32B                     | 131K    | ~32K       | Text                              | 2 RPM (anonymous) |
| Qwen3-Coder-30B-A3B-Instruct  | 262K    | ~32K       | Text (code)                       | 2 RPM (anonymous) |
| Qwen2.5-VL-72B-Instruct       | 128K    | ~8K        | Text + Vision                     | 2 RPM (anonymous) |
| Mixtral-8x7B-Instruct-v0.1    | 32K     | ~4K        | Text                              | 2 RPM (anonymous) |
| Mistral-Nemo-Instruct-2407    | 128K    | ~4K        | Text                              | 2 RPM (anonymous) |
| Qwen3Guard-Gen-8B             | 32K     | ~4K        | Text (safety guard)               | 2 RPM (anonymous) |
| Qwen3Guard-Gen-0.6B           | 32K     | ~4K        | Text (safety guard)               | 2 RPM (anonymous) |
| + 30 more models              | Varies  | Varies     | Text, Vision, Code, Image, Speech | 2 RPM (anonymous) |

### [SiliconFlow](https://cloud.siliconflow.cn/account/ak) 🇨🇳

3 permanently free models. Free tier capped at 50 req/day; ≥10 CNY lifetime purchase raises cap to 1,000/day. 200+ paid models also available.

Base URL: `https://api.siliconflow.cn/v1`

| Model Name                                | Context | Max Output   | Modality         | Rate Limit      |
| ----------------------------------------- | ------- | ------------ | ---------------- | --------------- |
| `Qwen/Qwen3-8B`                           | 131K    | 131K         | Text             | 30 RPM, 60K TPM |
| `deepseek-ai/DeepSeek-R1-Distill-Qwen-7B` | 131K    | Configurable | Text (reasoning) | 30 RPM, 60K TPM |
| `deepseek-ai/DeepSeek-OCR`                | —       | 8K           | Vision (OCR)     | 30 RPM, 60K TPM |

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
[^2]: Groq rate limits vary by model. Llama 4 Maverick is limited to 500 RPD. Most other models get 14,400 RPD ([rate limits](https://console.groq.com/docs/rate-limits)).
[^3]: Ollama Cloud measures usage by GPU time, not tokens or requests. Free tier described as "light usage" with session limits resetting every 5 hours and weekly limits every 7 days. Pro (50x more) and Max (250x more) plans available. Not OpenAI SDK-compatible; uses the Ollama API.
[^4]: Free models default to 50 RPD per model. A one-time purchase of $10+ in credits unlocks 1,000 RPD for free models. OpenRouter also offers a [Free Models Router](https://openrouter.ai/docs/guides/routing/routers/free-models-router) (`openrouter/free`) and [model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks) for chaining models in priority order. Free providers may log prompts for training.
[^5]: Kilo Code free model list may change over time. nvidia/nemotron-3-super-120b-a12b:free is for trial use only — prompts are logged by NVIDIA. Auto-router `kilo-auto/free` routes to minimax/minimax-m2.5:free (80%) and stepfun/step-3.5-flash:free (20%).
[^6]: API-Inference is free for registered users. Current published limits are 2,000 requests/day per user (total across models), with per-model daily quotas dynamically adjusted and capped at 500; concurrency is also dynamically rate-limited. Requires Alibaba Cloud account binding and real-name verification ([limits](https://modelscope.cn/docs/model-service/API-Inference/limits), [intro](https://modelscope.cn/docs/model-service/API-Inference/intro)).
[^7]: OVHcloud AI Endpoints offers a permanent free anonymous tier (2 requests per minute per IP, per model) with no signup or API key required — click "Get your free token" on the OVHcloud AI Endpoints site. Higher rate limits (400 RPM per Public Cloud project per model) require an API key and are billed pay-as-you-go per token; new Public Cloud accounts get up to $200 in free trial credits. Models are hosted in EU data centers.
[^8]: Free quota is signup-only with 90-day expiration and only granted in the Singapore / International region. Alibaba Cloud account requires phone/email verification but no credit card. After exhaustion, pay-as-you-go applies. Use the international endpoint `dashscope-intl.aliyuncs.com`; the China region (`dashscope.aliyuncs.com`) requires real-name verification.
[^9]: DeepSeek grants 5M free tokens at signup with a 30-day expiration. After expiry, pay-as-you-go applies. No credit card required at signup; prompts may be used to improve models unless explicitly opted out in account settings.
[^10]: Nebius grants $1 in free credits at signup, usable without a payment method. Credit card required to top up after exhaustion. Promo codes have expiration dates; the base $1 credit typically does not expire.
[^11]: Nscale grants $5 in free signup credits with no credit card required. Credits typically expire within 30–90 days (check console). Credit card required to top up. Pay-per-token after free credits exhausted. EU-sovereign, with data centers in Norway.
[^12]: xAI's $25 sign-up credit is one-time. Users who opt into the data-sharing program (prompts logged) receive an additional $150/month in credits, but the program requires $5 of prior spend before activation, so it is not a pure free tier. Several older Grok models (grok-4, grok-4-fast, grok-4-1-fast) were retired on May 15, 2026 and now redirect to grok-4.3 ([models](https://docs.x.ai/developers/models)).
