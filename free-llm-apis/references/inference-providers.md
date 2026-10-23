# Inference Providers - Setup Guides

Third-party platforms that host open-weight models from various sources.

<!-- Generated from data.json by scripts/generate-skill.js (data last updated 2026-10-05). Do not edit by hand. -->

## Cloudflare Workers AI 🇺🇸

10,000 Neurons/day free, no credit card required. 60+ models available on the free tier.

**Notes:** The 10,000 free Neurons are shared across all Workers AI usage, not per model, and all limits reset daily at 00:00 UTC. Going over does not bill you, the request fails. Seven models are excluded from Workers Free billing and need the Workers Paid plan or prepaid AI Gateway credits: `@cf/moonshotai/kimi-k2.6`, `@cf/moonshotai/kimi-k2.7-code`, `@cf/zai-org/glm-5.2`, `@cf/zai-org/glm-5.3`, `@cf/zai-org/glm-5.3-flash`, `@cf/deepseek-ai/deepseek-v4-flash-0731`, `@cf/deepseek-ai/deepseek-v4-pro-0813` ([pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)).

**Get a key:** https://dash.cloudflare.com/profile/api-tokens

**OpenAI-compatible base URL:** `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1`
(native API: `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run`)

### Models

| Model ID | Context | Modality | Rate limit |
| --- | --- | --- | --- |
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | 24K | Text | 10K neurons/day (shared) |
| `@cf/meta/llama-4-scout-17b-16e-instruct` | 131K | Multimodal | 10K neurons/day (shared) |
| `@cf/openai/gpt-oss-120b` | 128K | Text | 10K neurons/day (shared) |
| `@cf/google/gemma-4-26b-a4b-it` | 256K | Text + Vision | 10K neurons/day (shared) |
| `@cf/zai-org/glm-4.7-flash` | 131K | Text | 10K neurons/day (shared) |
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | 128K | Text + Vision | 10K neurons/day (shared) |
| `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` | 80K | Text (reasoning) | 10K neurons/day (shared) |
| + 55 more models | Varies | Text, Image, Audio, Embeddings | 10K neurons/day (shared) |

### Environment variable

```bash
export CF_API_TOKEN="your-key-here"
export CF_ACCOUNT_ID="your-account-id"
```

### Usage example

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["CF_API_TOKEN"],
    base_url=f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}/ai/v1",
)

response = client.chat.completions.create(
    model="@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    messages=[{"role": "user", "content": "Say hello in one sentence."}],
)
print(response.choices[0].message.content)
```

### Quick test

```bash
curl -s https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/ai/v1/chat/completions \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "messages": [{"role": "user", "content": "Say hello"}]}'
```

---

## Groq 🇺🇸

Free tier, no credit card. Ultra-fast LPU inference.

**Notes:** Groq shut down qwen/qwen3.6-27b on September 14, 2026 (replaced by qwen/qwen3.8-27b) and groq/compound and groq/compound-mini on September 21, 2026 ([deprecations](https://console.groq.com/docs/deprecations)). Free-plan limits vary by model; the chat models listed get 1,000 RPD ([rate limits](https://console.groq.com/docs/rate-limits)).

**Get a key:** https://console.groq.com/keys

**OpenAI-compatible base URL:** `https://api.groq.com/openai/v1`

### Models

| Model ID | Context | Modality | Rate limit |
| --- | --- | --- | --- |
| `openai/gpt-oss-120b` | 131K | Text | 30 RPM, 1,000 RPD |
| `openai/gpt-oss-20b` | 131K | Text | 30 RPM, 1,000 RPD |
| `qwen/qwen3.8-27b` | 131K | Text | 30 RPM, 1,000 RPD |

### Environment variable

```bash
export GROQ_API_KEY="your-key-here"
```

### Usage example

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["GROQ_API_KEY"],
    base_url="https://api.groq.com/openai/v1",
)

response = client.chat.completions.create(
    model="openai/gpt-oss-120b",
    messages=[{"role": "user", "content": "Say hello in one sentence."}],
)
print(response.choices[0].message.content)
```

### Quick test

```bash
curl -s https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "openai/gpt-oss-120b", "messages": [{"role": "user", "content": "Say hello"}]}'
```

---

## Hugging Face 🇺🇸

$0.10/month in Inference Provider credits for free users (subject to change). Routes to Fireworks, Together, Hyperbolic, Nebius, Novita, DeepInfra and others. Thousands of models.

**Get a key:** https://huggingface.co/settings/tokens

**OpenAI-compatible base URL:** `https://router.huggingface.co/v1`

### Models

| Model ID | Context | Modality | Rate limit |
| --- | --- | --- | --- |
| `meta-llama/Llama-3.1-8B-Instruct` | 128K | Text | Credit-metered |
| `google/gemma-3-4b-it` | 131K | Text | Credit-metered |
| `microsoft/phi-4` | 16K | Text | Credit-metered |
| `Qwen/Qwen2.5-Coder-7B-Instruct` | 131K | Text | Credit-metered |
| `Qwen/Qwen2.5-7B-Instruct` | 131K | Text | Credit-metered |
| + thousands of community models | Varies | Text, Image, Audio, Embeddings | Credit-metered |

### Environment variable

```bash
export HF_API_KEY="your-key-here"
```

### Usage example

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["HF_API_KEY"],
    base_url="https://router.huggingface.co/v1",
)

response = client.chat.completions.create(
    model="meta-llama/Llama-3.1-8B-Instruct",
    messages=[{"role": "user", "content": "Say hello in one sentence."}],
)
print(response.choices[0].message.content)
```

### Quick test

```bash
curl -s https://router.huggingface.co/v1/chat/completions \
  -H "Authorization: Bearer $HF_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "meta-llama/Llama-3.1-8B-Instruct", "messages": [{"role": "user", "content": "Say hello"}]}'
```

---

## Kilo Code 🇺🇸

Free models with no credit card and no API key required. `kilo-auto/free` auto-router dynamically routes to models in the free pool.

**Notes:** Kilo Code's free pool changes frequently, and the /api/gateway/models catalog can lag what is actually served: probe results have confirmed models absent from the catalog still answering. Rows through liquid/lfm-2.5-2.6b:free answered a live request between 2026-08-19 and 2026-08-21; the rows after it were added on 2026-10-05 from the catalog, where they are priced at $0, and have not been probed. Free models are reachable with no API key, at 200 requests per hour per IP ([authentication](https://kilo.ai/docs/gateway/authentication)). The kilo-auto/free router picks a model from the free pool, and Kilo's docs warn it "may route your requests to providers that log prompts and outputs". The NVIDIA free endpoints carry NVIDIA's own condition, quoted on Kilo's [models page](https://kilo.ai/docs/gateway/models-and-providers): "Trial use only - do not submit personal or confidential data. Your use is logged for security purposes and to improve NVIDIA products and services."

**Get a key:** https://app.kilo.ai/profile (optional: free models work without a key)

**OpenAI-compatible base URL:** `https://api.kilo.ai/api/gateway`

### Models

| Model ID | Context | Modality | Rate limit |
| --- | --- | --- | --- |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | 1M | Text | 200 req/hr |
| `stepfun/step-3.7-flash:free` | 262K | Text + Vision | 200 req/hr |
| `nvidia/nemotron-3-super-120b-a12b:free` | 262K | Text | 200 req/hr |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | 256K | Multimodal | 200 req/hr |
| `poolside/laguna-s-2.1:free` | 262K | Text (code) | 200 req/hr |
| `poolside/laguna-xs-2.1:free` | 262K | Text (code) | 200 req/hr |
| `cohere/north-mini-code:free` | 256K | Text (code) | 200 req/hr |
| `openrouter/free` | Varies | Text | 200 req/hr |
| `tencent/hy3:free` | 262K | Text | 200 req/hr |
| `nvidia/nemotron-3.5-lightning:free` | 1M | Text | 200 req/hr |
| `liquid/lfm-2.5-2.6b:free` | 64K | Text | 200 req/hr |
| `kilo-auto/free` | 256K | Text | 200 req/hr |
| `inclusionai/ling-3.1-flash` | 262K | Text | 200 req/hr |
| `inclusionai/ling-3.0-flash-sante:free` | 262K | Text | 200 req/hr |
| `apodex/apodex-1.1-mini:free` | 262K | Text | 200 req/hr |
| `qwen/qwen3.8-27b:free` | 262K | Multimodal | 200 req/hr |
| `dots-studio/dots-3-note-preview:free` | 512K | Text + Vision | 200 req/hr |

### Environment variable

```bash
export KILO_API_KEY="your-key-here"
```

### Usage example

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("KILO_API_KEY", "none"),
    base_url="https://api.kilo.ai/api/gateway",
)

response = client.chat.completions.create(
    model="nvidia/nemotron-3-ultra-550b-a55b:free",
    messages=[{"role": "user", "content": "Say hello in one sentence."}],
)
print(response.choices[0].message.content)
```

### Quick test

```bash
curl -s https://api.kilo.ai/api/gateway/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "nvidia/nemotron-3-ultra-550b-a55b:free", "messages": [{"role": "user", "content": "Say hello"}]}'
```

---

## LLM7.io 🇬🇧

API gateway with a free tier. Anonymous access needs no key and reaches the `turbo` models; a free token from token.llm7.io raises the rate and token limits but reaches the same models.

**Notes:** LLM7.io rotates its catalog frequently, so the model list changes between checks. Access is tier-based, not token-based: `turbo` models are reachable anonymously or with a free token, `pro` models need the paid plan ([models API](https://docs.llm7.io/guides/models-api)). A free token is capped at 1 RPS, 60 RPM, 250 requests per hour and 100,000 tokens per 24 hours, and the free quota may be reduced without notice ([limits](https://docs.llm7.io/limits)). A paid Pro plan is available at $12/month. The docs no longer list anonymous (no-key) limits; anonymous access was last confirmed by live request on 2026-08-21.

**Get a key:** https://token.llm7.io (optional: free models work without a key)

**OpenAI-compatible base URL:** `https://api.llm7.io/v1`

### Models

| Model ID | Context | Modality | Rate limit |
| --- | --- | --- | --- |
| `gpt-oss:20b` | 128K | Text | 60 RPM, 250 req/hr (free token) |
| `mistral-Nemo-Instruct-2407` | 128K | Text | 60 RPM, 250 req/hr (free token) |
| `minimax-m2.7` | 180K | Text (reasoning) | 60 RPM, 250 req/hr (free token) |
| `DeepSeek-V4-Flash-0731` | 400K | Text (reasoning) | 60 RPM, 250 req/hr (free token) |

### Environment variable

```bash
export LLM7_API_KEY="your-key-here"
```

### Usage example

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("LLM7_API_KEY", "none"),
    base_url="https://api.llm7.io/v1",
)

response = client.chat.completions.create(
    model="gpt-oss:20b",
    messages=[{"role": "user", "content": "Say hello in one sentence."}],
)
print(response.choices[0].message.content)
```

### Quick test

```bash
curl -s https://api.llm7.io/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-oss:20b", "messages": [{"role": "user", "content": "Say hello"}]}'
```

---

## ModelScope 🇨🇳

Free API-Inference for registered users. Requires Alibaba Cloud account binding + real-name verification.

**Notes:** API-Inference is free for registered users. Current published limits are 2,000 requests/day per user (total across models), with per-model daily quotas dynamically adjusted and capped at 500; concurrency is also dynamically rate-limited. Requires Alibaba Cloud account binding and real-name verification ([limits](https://modelscope.cn/docs/model-service/API-Inference/limits), [intro](https://modelscope.cn/docs/model-service/API-Inference/intro)).

**Get a key:** https://modelscope.cn/my/myaccesstoken

**OpenAI-compatible base URL:** `https://api-inference.modelscope.cn/v1`

### Models

| Model ID | Context | Modality | Rate limit |
| --- | --- | --- | --- |
| `Qwen/Qwen3.5-35B-A3B` | 256K | Text | 2,000 RPD total; <=500 RPD/model (dynamic) |
| `Qwen/Qwen3.5-27B` | 256K | Text | 2,000 RPD total; <=500 RPD/model (dynamic) |
| + API-Inference-enabled models | Varies | LLM, MLLM | Dynamic quotas + dynamic concurrency |

### Environment variable

```bash
export MODELSCOPE_API_KEY="your-key-here"
```

### Usage example

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["MODELSCOPE_API_KEY"],
    base_url="https://api-inference.modelscope.cn/v1",
)

response = client.chat.completions.create(
    model="Qwen/Qwen3.5-35B-A3B",
    messages=[{"role": "user", "content": "Say hello in one sentence."}],
)
print(response.choices[0].message.content)
```

### Quick test

```bash
curl -s https://api-inference.modelscope.cn/v1/chat/completions \
  -H "Authorization: Bearer $MODELSCOPE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "Qwen/Qwen3.5-35B-A3B", "messages": [{"role": "user", "content": "Say hello"}]}'
```

---

## NVIDIA NIM 🇺🇸

Free with NVIDIA Developer Program membership. 100+ models. Rate-limited per model.

**Get a key:** https://build.nvidia.com/explore/discover

**OpenAI-compatible base URL:** `https://integrate.api.nvidia.com/v1`

### Models

| Model ID | Context | Modality | Rate limit |
| --- | --- | --- | --- |
| `nvidia/nemotron-3-super-120b-a12b` | 1M | Text | 40 RPM, 10,000 RPD |
| `nvidia/llama-3.1-nemotron-ultra-253b-v1` | 128K | Text | 40 RPM, 10,000 RPD |
| `google/gemma-4-31b-it` | 262K | Text | 40 RPM, 10,000 RPD |
| `mistralai/mistral-large-2-instruct` | 128K | Text | 40 RPM, 10,000 RPD |
| `nvidia/nemotron-3-ultra-550b-a55b` | 1M | Text | 40 RPM, 10,000 RPD |
| `openai/gpt-oss-20b` | 131K | Text | 40 RPM, 10,000 RPD |
| + 92 more models | Varies | Text, Image, Video, Speech, Embeddings | 40 RPM, 10,000 RPD |

### Environment variable

```bash
export NVIDIA_API_KEY="your-key-here"
```

### Usage example

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["NVIDIA_API_KEY"],
    base_url="https://integrate.api.nvidia.com/v1",
)

response = client.chat.completions.create(
    model="nvidia/nemotron-3-super-120b-a12b",
    messages=[{"role": "user", "content": "Say hello in one sentence."}],
)
print(response.choices[0].message.content)
```

### Quick test

```bash
curl -s https://integrate.api.nvidia.com/v1/chat/completions \
  -H "Authorization: Bearer $NVIDIA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "nvidia/nemotron-3-super-120b-a12b", "messages": [{"role": "user", "content": "Say hello"}]}'
```

---

## Ollama Cloud 🇺🇸

Free tier with usage limits. 16 cloud model families from the Ollama library. OpenAI SDK-compatible via https://ollama.com/v1.

**Notes:** Ollama Cloud measures usage by input, cached input, and output tokens weighted per model ([FAQ](https://docs.ollama.com/cloud)). Free tier has session limits resetting every 5 hours and weekly limits resetting every 7 days. Cloud models are also served through Ollama's OpenAI-compatible endpoint at ollama.com/v1.

**Get a key:** https://ollama.com/settings/keys

**OpenAI-compatible base URL:** `https://ollama.com/v1`
(native API: `https://ollama.com/api`)

### Models

| Model ID | Context | Modality | Rate limit |
| --- | --- | --- | --- |
| `deepseek-v4-pro` | 1M | Text | Session/weekly limits (unpublished) |
| `deepseek-v4-flash` | 1M | Text | Session/weekly limits (unpublished) |
| `minimax-m3` | 512K | Text | Session/weekly limits (unpublished) |
| `kimi-k3` | 1M | Text | Session/weekly limits (unpublished) |
| `gpt-oss:120b` | 128K | Text | Session/weekly limits (unpublished) |
| `gpt-oss:20b` | 131K | Text | Session/weekly limits (unpublished) |
| `nemotron-3-ultra` | 262K | Text | Session/weekly limits (unpublished) |
| `mistral-large-3:675b` | 256K | Text | Session/weekly limits (unpublished) |
| `qwen3.5:397b` | 256K | Text | Session/weekly limits (unpublished) |
| + 7 more cloud models | Varies | Text | Session/weekly limits (unpublished) |

### Environment variable

```bash
export OLLAMA_API_KEY="your-key-here"
```

### Usage example

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["OLLAMA_API_KEY"],
    base_url="https://ollama.com/v1",
)

response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=[{"role": "user", "content": "Say hello in one sentence."}],
)
print(response.choices[0].message.content)
```

### Quick test

```bash
curl -s https://ollama.com/v1/chat/completions \
  -H "Authorization: Bearer $OLLAMA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "deepseek-v4-pro", "messages": [{"role": "user", "content": "Say hello"}]}'
```

---

## OpenRouter 🇺🇸

17 free models (marked with `:free` suffix). OpenAI SDK-compatible.

**Notes:** Free models default to 50 RPD per model. A one-time purchase of $10+ in credits unlocks 1,000 RPD for free models. OpenRouter also offers a [Free Models Router](https://openrouter.ai/docs/guides/routing/routers/free-models-router) (`openrouter/free`) and [model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks) for chaining models in priority order. Free providers may log prompts for training.

**Get a key:** https://openrouter.ai/keys

**OpenAI-compatible base URL:** `https://openrouter.ai/api/v1`

### Models

| Model ID | Context | Modality | Rate limit |
| --- | --- | --- | --- |
| `nvidia/nemotron-3-super-120b-a12b:free` | 262K | Text | 20 RPM, 50 RPD |
| `cohere/north-mini-code:free` | 256K | Text (code) | 20 RPM, 50 RPD |
| `google/gemma-4-26b-a4b-it:free` | 262K | Text + Image | 20 RPM, 50 RPD |
| `google/gemma-4-31b-it:free` | 262K | Text + Image | 20 RPM, 50 RPD |
| `nvidia/nemotron-nano-9b-v2:free` | 128K | Text | 20 RPM, 50 RPD |
| `nvidia/nemotron-nano-12b-v2-vl:free` | 128K | Text + Image | 20 RPM, 50 RPD |
| `poolside/laguna-s-2.1:free` | 262K | Text (code) | 20 RPM, 50 RPD |
| `poolside/laguna-xs-2.1:free` | 262K | Text (code) | 20 RPM, 50 RPD |
| `apodex/apodex-1.1-mini:free` | 262K | Text | 20 RPM, 50 RPD |
| `inclusionai/ling-3.0-flash-sante:free` | 262K | Text | 20 RPM, 50 RPD |
| `qwen/qwen3.8-27b:free` | 262K | Text + Image + Video | 20 RPM, 50 RPD |
| `dots-studio/dots-3-note-preview:free` | 512K | Text + Image | 20 RPM, 50 RPD |
| `liquid/lfm-2.5-2.6b:free` | 64K | Text | 20 RPM, 50 RPD |
| `nvidia/nemotron-3.5-lightning:free` | 1M | Text | 20 RPM, 50 RPD |
| `thinkingmachines/inkling:free` | 1M | Text + Image + Audio | 20 RPM, 50 RPD |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | 1M | Text | 20 RPM, 50 RPD |
| + 6 more free models | Varies | Text / Image | 20 RPM, 50 RPD |

### Environment variable

```bash
export OPENROUTER_API_KEY="your-key-here"
```

### Usage example

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["OPENROUTER_API_KEY"],
    base_url="https://openrouter.ai/api/v1",
)

response = client.chat.completions.create(
    model="nvidia/nemotron-3-super-120b-a12b:free",
    messages=[{"role": "user", "content": "Say hello in one sentence."}],
)
print(response.choices[0].message.content)
```

### Quick test

```bash
curl -s https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "nvidia/nemotron-3-super-120b-a12b:free", "messages": [{"role": "user", "content": "Say hello"}]}'
```

---

## OVHcloud AI Endpoints 🇫🇷

Free anonymous tier (no API key, no signup): 2 RPM per IP per model. 20+ open-weight models hosted in EU. OpenAI SDK-compatible.

**Notes:** OVHcloud AI Endpoints offers a permanent free anonymous tier (2 requests per minute per IP, per model) with no signup or API key required. Higher rate limits (400 RPM per Public Cloud project per model) require an API key and are billed pay-as-you-go per token; new Public Cloud accounts get up to $200 in free trial credits. Models are hosted in EU data centers.

**Get a key:** https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/ (optional: free models work without a key)

**OpenAI-compatible base URL:** `https://oai.endpoints.kepler.ai.cloud.ovh.net/v1`

### Models

| Model ID | Context | Modality | Rate limit |
| --- | --- | --- | --- |
| `Qwen3.5-397B-A17B` | 262K | Text + Vision | 2 RPM (anonymous) |
| `gpt-oss-120b` | 128K | Text | 2 RPM (anonymous) |
| `gpt-oss-20b` | 128K | Text | 2 RPM (anonymous) |
| `Meta-Llama-3_3-70B-Instruct` | 131K | Text | 2 RPM (anonymous) |
| `Qwen3.8-27B` | 262K | Text + Vision | 2 RPM (anonymous) |
| `Qwen3.6-27B` | 262K | Text + Vision | 2 RPM (anonymous) |
| `Qwen3.5-9B` | 262K | Text + Vision | 2 RPM (anonymous) |
| `Qwen3-32B` | 131K | Text | 2 RPM (anonymous) |
| `Qwen2.5-VL-72B-Instruct` | 32K | Text + Vision | 2 RPM (anonymous) |
| `Mistral-Small-3.2-24B-Instruct-2506` | 128K | Text | 2 RPM (anonymous) |
| `Mistral-Nemo-Instruct-2407` | 128K | Text | 2 RPM (anonymous) |

### Environment variable

```bash
export OVH_API_KEY="your-key-here"
```

### Usage example

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("OVH_API_KEY", "none"),
    base_url="https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
)

response = client.chat.completions.create(
    model="Qwen3.5-397B-A17B",
    messages=[{"role": "user", "content": "Say hello in one sentence."}],
)
print(response.choices[0].message.content)
```

### Quick test

```bash
curl -s https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "Qwen3.5-397B-A17B", "messages": [{"role": "user", "content": "Say hello"}]}'
```

---

## SiliconFlow 🇨🇳

Permanently free models, no credit card required. Identity verification required. 100+ models in the catalog, most of them paid.

**Notes:** SiliconFlow requires real-name identity verification to use free models (effective May 15, 2026, per the [release notes](https://api-docs.siliconflow.cn/docs/release-notes/overview)). Verification supports mainland-Chinese documents; international users must contact support.

**Get a key:** https://cloud.siliconflow.cn/account/ak

**OpenAI-compatible base URL:** `https://api.siliconflow.cn/v1`

### Models

| Model ID | Context | Modality | Rate limit |
| --- | --- | --- | --- |
| `Qwen/Qwen3-8B` | 128K | Text | 1,000 RPM, 50,000 TPM |

### Environment variable

```bash
export SILICONFLOW_API_KEY="your-key-here"
```

### Usage example

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["SILICONFLOW_API_KEY"],
    base_url="https://api.siliconflow.cn/v1",
)

response = client.chat.completions.create(
    model="Qwen/Qwen3-8B",
    messages=[{"role": "user", "content": "Say hello in one sentence."}],
)
print(response.choices[0].message.content)
```

### Quick test

```bash
curl -s https://api.siliconflow.cn/v1/chat/completions \
  -H "Authorization: Bearer $SILICONFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "Qwen/Qwen3-8B", "messages": [{"role": "user", "content": "Say hello"}]}'
```
