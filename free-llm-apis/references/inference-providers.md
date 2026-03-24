# Inference Providers - Setup Guides

Third-party platforms that host open-weight models from various sources.

## AIHubMix

**Models:** GPT-4o, Gemini 3.1 Flash, GLM-5 +17 more
**Limits:** 5 RPM, 500 RPD

### Get your API key

1. Go to [AIHubMix Console](https://console.aihubmix.com/token).
2. Create an account or sign in.
3. Click "Create Token."
4. Copy the token.

### Usage example

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_AIHUBMIX_API_KEY",
    base_url="https://aihubmix.com/v1/"
)

response = client.chat.completions.create(
    model="gpt-4o-free",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Environment variable

```bash
export AIHUBMIX_API_KEY="your-key-here"
```

---

## GitHub Models

**Models:** GPT-4o, Llama 3.3 70B, DeepSeek-R1 +more
**Limits:** 10-15 RPM, 50-150 RPD

### Get your API key

1. Go to [GitHub Models Marketplace](https://github.com/marketplace/models).
2. Sign in with your GitHub account.
3. Pick any model and click "Get API key" or go to your GitHub settings > Developer settings > Personal access tokens.
4. Generate a fine-grained token with the "Models" permission.
5. Copy the token.

### Usage example

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_GITHUB_TOKEN",
    base_url="https://models.inference.ai.azure.com/"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Environment variable

```bash
export GITHUB_TOKEN="your-token-here"
```

---

## NVIDIA NIM

**Models:** Llama 3.3 70B, Mistral Large, Qwen3 235B +more
**Limits:** 40 RPM

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
    model="meta/llama-3.3-70b-instruct",
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

**Models:** Llama 3.3 70B, Llama 4 Scout, Kimi K2 +17 more
**Limits:** 30 RPM, 14,400 RPD

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
    model="llama-3.3-70b-versatile",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Environment variable

```bash
export GROQ_API_KEY="your-key-here"
```

---

## Cerebras

**Models:** Llama 3.3 70B, Qwen3 235B, GPT-OSS-120B +3 more
**Limits:** 30 RPM, 14,400 RPD

### Get your API key

1. Go to [Cerebras Cloud](https://cloud.cerebras.ai/).
2. Create an account or sign in.
3. Go to API Keys and create a new one.
4. Copy the key.

### Usage example

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_CEREBRAS_API_KEY",
    base_url="https://api.cerebras.ai/v1/"
)

response = client.chat.completions.create(
    model="llama-3.3-70b",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Environment variable

```bash
export CEREBRAS_API_KEY="your-key-here"
```

---

## Cloudflare Workers AI

**Models:** Llama 3.3 70B, Qwen QwQ 32B +47 more
**Limits:** 10K neurons/day

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
    model="@cf/meta/llama-3.3-70b-instruct-fp8-fast",
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

## LLM7.io

**Models:** DeepSeek R1, Flash-Lite, Qwen2.5 Coder +27 more
**Limits:** 30 RPM (120 with token)

### Get your API key

1. Go to [LLM7 Token page](https://token.llm7.io).
2. Register or sign in to get a token.
3. Copy the token.

### Usage example

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_LLM7_TOKEN",
    base_url="https://api.llm7.io/v1/"
)

response = client.chat.completions.create(
    model="deepseek-r1",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Environment variable

```bash
export LLM7_API_KEY="your-token-here"
```

---

## Kluster AI

**Models:** DeepSeek-R1, Llama 4 Maverick, Qwen3-235B +2 more
**Limits:** Undocumented

### Get your API key

1. Go to [Kluster AI Platform](https://platform.kluster.ai/apikeys).
2. Create an account or sign in.
3. Generate a new API key.
4. Copy the key.

### Usage example

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_KLUSTER_API_KEY",
    base_url="https://api.kluster.ai/v1/"
)

response = client.chat.completions.create(
    model="deepseek-ai/DeepSeek-R1",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Environment variable

```bash
export KLUSTER_API_KEY="your-key-here"
```

---

## OpenRouter

**Models:** DeepSeek R1, Llama 3.3 70B, GPT-OSS-120B +29 more
**Limits:** 20 RPM, 50 RPD

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
    model="deepseek/deepseek-r1:free",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Environment variable

```bash
export OPENROUTER_API_KEY="your-key-here"
```

---

## Hugging Face

**Models:** Llama 3.3 70B, Qwen2.5 72B, Mistral 7B +many more
**Limits:** $0.10/month in free credits

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
    model="meta-llama/Llama-3.3-70B-Instruct",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Environment variable

```bash
export HF_TOKEN="your-token-here"
```
