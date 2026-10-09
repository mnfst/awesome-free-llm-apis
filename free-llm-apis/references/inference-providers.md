# Inference Providers - Setup Guides

Third-party platforms that host open-weight models from various sources. The first three need no API key.

## Kilo Code (no key)

**Models (free pool, rotates):** Nemotron 3 Ultra 550B, Nemotron 3 Super 120B, Step 3.7 Flash, Laguna S 2.1 (code), Hy3 +more, plus the `kilo-auto/free` router
**Limits:** 200 requests/hour per IP, no API key required.
**Notes:** The free pool changes often and the `/models` catalog can lag what is served. `kilo-auto/free` may route to providers that log prompts and outputs. NVIDIA free endpoints are trial use only: do not submit personal or confidential data.

### Get access

Nothing to create. Kilo's [authentication docs](https://kilo.ai/docs/gateway/authentication) describe anonymous access as omitting the `Authorization` header, which the OpenAI SDK cannot do. With the SDK, pass `api_key="anonymous"`: this is observed behavior (tested 2026-10-08), not documented, while an arbitrary placeholder such as `"unused"` is rejected with HTTP 401. A free account at [Kilo](https://app.kilo.ai/profile) gives a personal token.

### Usage example

```python
from openai import OpenAI

client = OpenAI(
    api_key="anonymous",
    base_url="https://api.kilo.ai/api/gateway/"
)

response = client.chat.completions.create(
    model="nvidia/nemotron-3-ultra-550b-a55b:free",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

If the upstream is overloaded (HTTP 503), fall back to `nvidia/nemotron-3-super-120b-a12b:free` or `kilo-auto/free`.

### Environment variable

```bash
# Optional, only with a Kilo account token
export KILO_API_KEY="your-token-here"
```

---

## LLM7.io (no key)

**Models (catalog rotates):** DeepSeek V4 Flash (400K context), GLM-5.2 (~1M context), MiniMax M3, MiniMax M2.7, GPT-OSS 20B, Mistral Nemo +more `turbo` models
**Limits:** Anonymous access works, but its limits are not published and are tight: a few quick calls can return HTTP 429 "Retry after 300 seconds". A free token raises them to 1 RPS, 60 RPM, 250 requests/hour, 100K tokens/day; the free quota may be reduced without notice. `pro` models (for example `deepseek-v4-pro`) need the paid plan: check the `tier` field of `GET https://api.llm7.io/v1/models` before picking one.

### Get access

Nothing to create for anonymous use. For higher limits, get a free token at the [LLM7 token page](https://token.llm7.io).

### Usage example

```python
from openai import OpenAI

client = OpenAI(
    api_key="anonymous",  # or your free LLM7 token
    base_url="https://api.llm7.io/v1/"
)

response = client.chat.completions.create(
    model="DeepSeek-V4-Flash-0731",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

Use `glm-5.2` for the longest contexts (~1M) and `gpt-oss:20b` for the fastest answers.

### Environment variable

```bash
# Optional
export LLM7_API_KEY="your-token-here"
```

---

## OVHcloud AI Endpoints (no key)

**Models:** Qwen3.5 397B, GPT-OSS 120B, GPT-OSS 20B, Llama 3.3 70B, Qwen3 32B, Mistral Small 3.2 +more, hosted in EU data centers
**Limits:** Anonymous tier: 2 requests per minute per IP, per model, no signup. An API key (Public Cloud project) raises this to 400 RPM but is billed pay-as-you-go per token.
**Notes:** On 2026-10-08 anonymous requests from one residential IP received HTTP 429 even after waiting a minute. If that happens, use another keyless provider. Model list: [AI Endpoints catalog](https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/).

### Usage example

Anonymous calls send no `Authorization` header:

```bash
curl https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-oss-120b", "messages": [{"role": "user", "content": "Hello!"}]}'
```

---

## NVIDIA NIM

**Models:** Nemotron 3 Ultra 550B, Nemotron 3 Super 120B, Llama 3.1 Nemotron Ultra 253B, Gemma 4 31B, Mistral Large 2, GPT-OSS 20B +92 more (100+ models in total)
**Limits:** 40 RPM, 10,000 RPD per model. Free with NVIDIA Developer Program membership.
**Notes:** `meta/llama-3.3-70b-instruct` has been retired (HTTP 410).

### Get your API key

1. Go to [NVIDIA NIM](https://build.nvidia.com/explore/discover).
2. Create an NVIDIA account or sign in.
3. Pick any model and click "Get API Key."
4. Copy the key.

### Usage example

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_NVIDIA_API_KEY",
    base_url="https://integrate.api.nvidia.com/v1/"
)

response = client.chat.completions.create(
    model="nvidia/nemotron-3-ultra-550b-a55b",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Environment variable

```bash
export NVIDIA_API_KEY="your-key-here"
```

---

## Groq

**Models:** GPT-OSS 120B, GPT-OSS 20B, Qwen3.8 27B
**Limits:** 30 RPM, 1,000 RPD
**Notes:** The Llama models (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`) were shut down on 2026-08-16; see the [deprecations page](https://console.groq.com/docs/deprecations).

### Get your API key

1. Go to the [Groq Console](https://console.groq.com/keys).
2. Create an account or sign in.
3. Click "Create API Key."
4. Name it and copy the key.

### Usage example

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_GROQ_API_KEY",
    base_url="https://api.groq.com/openai/v1/"
)

response = client.chat.completions.create(
    model="openai/gpt-oss-120b",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Environment variable

```bash
export GROQ_API_KEY="your-key-here"
```

---

## Cloudflare Workers AI

**Models:** GPT-OSS 120B, Llama 3.3 70B (fp8-fast), Llama 4 Scout, Gemma 4 26B, GLM-4.7-Flash, Mistral Small 3.1, DeepSeek R1 Distill Qwen 32B +55 more (60+ models in total)
**Limits:** 10,000 neurons/day shared across all models, reset at 00:00 UTC. Over the limit, requests fail instead of being billed. Seven models (Kimi K2.x, GLM-5.x, DeepSeek V4) need the Workers Paid plan.

### Get your API key

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens).
2. Sign in or create a Cloudflare account.
3. Create an API token with the "Workers AI" permission.
4. Note your Account ID from the dashboard sidebar.
5. Copy both the token and account ID.

### Usage example

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_CLOUDFLARE_API_TOKEN",
    base_url="https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/ai/v1/"
)

response = client.chat.completions.create(
    model="@cf/openai/gpt-oss-120b",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Environment variable

```bash
export CLOUDFLARE_API_TOKEN="your-token-here"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
```

---

## OpenRouter

**Models (17 free, `:free` suffix):** Nemotron 3 Ultra 550B, Nemotron 3 Super 120B, Gemma 4 31B, Gemma 4 26B, Inkling, Laguna S 2.1 +more, plus the `openrouter/free` router
**Limits:** 20 RPM, 50 RPD per free model. A one-time purchase of $10+ in credits raises this to 1,000 RPD (optional).
**Notes:** Free providers may log prompts for training.

### Get your API key

1. Go to [OpenRouter Keys](https://openrouter.ai/keys).
2. Create an account or sign in.
3. Click "Create Key."
4. Copy the key.

### Usage example

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_OPENROUTER_API_KEY",
    base_url="https://openrouter.ai/api/v1/"
)

response = client.chat.completions.create(
    model="nvidia/nemotron-3-ultra-550b-a55b:free",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Environment variable

```bash
export OPENROUTER_API_KEY="your-key-here"
```

---

## Ollama Cloud

**Models:** DeepSeek V4 Pro, DeepSeek V4 Flash, Kimi K3, MiniMax M3, GPT-OSS 120B, GPT-OSS 20B, Nemotron 3 Ultra, Mistral Large 3 675B, Qwen3.5 397B +7 more (16 model families)
**Limits:** Session limits reset every 5 hours and weekly limits every 7 days; numbers are not published. Usage is weighted per model.

### Get your API key

1. Go to [Ollama keys](https://ollama.com/settings/keys).
2. Create an account or sign in.
3. Create a key and copy it.

### Usage example

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_OLLAMA_API_KEY",
    base_url="https://ollama.com/v1/"
)

response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Environment variable

```bash
export OLLAMA_API_KEY="your-key-here"
```

---

## Hugging Face

**Models:** Thousands through the router: Llama 3.x, Qwen3, Gemma, Phi-4, Command A, MiniMax +more
**Limits:** $0.10/month in Inference Provider credits for free users (subject to change). Small models stretch the credit furthest.

### Get your API key

1. Go to [Hugging Face Tokens](https://huggingface.co/settings/tokens).
2. Create an account or sign in.
3. Create a new access token with "Make calls to Inference Providers" permission.
4. Copy the token.

### Usage example

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_HF_TOKEN",
    base_url="https://router.huggingface.co/v1/"
)

response = client.chat.completions.create(
    model="meta-llama/Llama-3.1-8B-Instruct",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Environment variable

```bash
export HF_TOKEN="your-token-here"
```

---

## ModelScope and SiliconFlow (China identity verification)

Both have permanent free models but are effectively unavailable outside mainland China:

- **ModelScope** (`https://api-inference.modelscope.cn/v1/`, e.g. `Qwen/Qwen3.5-35B-A3B`): 2,000 requests/day total, at most 500 per model. Requires Alibaba Cloud account binding and real-name verification.
- **SiliconFlow** (`https://api.siliconflow.cn/v1/`, e.g. `Qwen/Qwen3-8B`): real-name verification required since 2026-05-15, with mainland-Chinese documents; international users must contact support.
