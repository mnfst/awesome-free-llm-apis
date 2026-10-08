# Provider APIs - Setup Guides

APIs run by the companies that train or fine-tune the models themselves.

## Google Gemini

**Models:** Gemini 3.8 Flash, 3.7 Flash, 3.6 Flash, 3.5 Flash, 3.5 Flash-Lite, 2.5 Flash, 2.5 Pro +more (1M context, multimodal)
**Limits:** Google no longer publishes per-model free limits; check your quotas in AI Studio. Last published values: 15 RPM / 1,500 RPD (Flash), 30 RPM / 1,500 RPD (Flash-Lite), 5 RPM / 50 RPD (2.5 Pro).
**Region:** The free tier is available in the EU, UK and Switzerland. The terms still require Paid Services if you make an API client available to users there. Prompts from users in those regions are not used to improve Google products.

### Get your API key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Sign in with a Google account.
3. Click "Create API Key" and select or create a Google Cloud project.
4. Copy the generated key.

### Usage example

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_GEMINI_API_KEY",
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
)

response = client.chat.completions.create(
    model="gemini-3.8-flash",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

For higher request rates use `gemini-3.5-flash-lite`. `gemini-3.1-flash-lite` shuts down on 2027-05-07.

### Environment variable

```bash
export GEMINI_API_KEY="your-key-here"
# Or for OpenAI-compatible usage:
export OPENAI_API_KEY="your-key-here"
export OPENAI_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai/"
```

---

## Mistral AI

**Models:** Mistral Medium 3.5, Mistral Large 3 (2512), Mistral Small (2603), Codestral (2508), Ministral 3B / 8B / 14B
**Limits:** Free mode is the default for new accounts: $10/month in API credits, shared across Studio, the API and Vibe Code. Numeric rate limits are shown on the Limits page of the admin panel (last published: ~1 RPS, 500K TPM).
**Data:** Free-mode inputs and outputs may be used to train Mistral models; you can opt out at any time.

### Get your API key

1. Go to the [Mistral Console](https://console.mistral.ai/api-keys).
2. Create an account or sign in (no credit card needed).
3. Go to API Keys and create a new key.
4. Copy the key.

### Usage example

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_MISTRAL_API_KEY",
    base_url="https://api.mistral.ai/v1/"
)

response = client.chat.completions.create(
    model="mistral-medium-latest",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

Use `mistral-large-latest` (Mistral Large 3) for the multimodal flagship and `codestral-2508` for code.

### Environment variable

```bash
export MISTRAL_API_KEY="your-key-here"
```

---

## Cohere

**Models:** Command A Plus (05-2026), Command A, Command A Reasoning, Command A Vision, Command A Translate, Command R+, Aya Expanse +more
**Limits:** Free "Trial" key: 20 RPM, 1,000 API calls/month. Non-commercial use only.

### Get your API key

1. Go to the [Cohere Dashboard](https://dashboard.cohere.com/api-keys).
2. Create an account or sign in.
3. Go to API Keys and generate a trial key.
4. Copy the key.

### Usage example

The native endpoint (`https://api.cohere.com/v2`) is not OpenAI-compatible. With the OpenAI SDK, use Cohere's Compatibility API:

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_COHERE_API_KEY",
    base_url="https://api.cohere.ai/compatibility/v1"
)

response = client.chat.completions.create(
    model="command-a-plus-05-2026",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Environment variable

```bash
export CO_API_KEY="your-key-here"
```

---

## Z AI (Zhipu AI)

**Models:** GLM-4.7-Flash (200K context, reasoning), GLM-4.6V-Flash (vision), GLM-4.5-Flash (announced for retirement, auto-routed to GLM-4.7-Flash)
**Limits:** 1 concurrent request per model.
**Notes:** Registration accepts overseas phone numbers, and the chat API does not require real-name verification (the Batch API does).

### Get your API key

1. Sign up on the international platform [Z.ai](https://z.ai) or on [BigModel](https://open.bigmodel.cn/usercenter/apikeys).
2. Go to API Keys and create a new key.
3. Copy the key.

### Usage example

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_ZAI_API_KEY",
    base_url="https://api.z.ai/api/paas/v4/"
)

response = client.chat.completions.create(
    model="glm-4.7-flash",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

Use the base URL of the platform where you created the key: `https://api.z.ai/api/paas/v4/` (international) or `https://open.bigmodel.cn/api/paas/v4/` (BigModel).

### Environment variable

```bash
export ZHIPU_API_KEY="your-key-here"
```

---

## Aion Labs

**Models:** Aion 3.0, Aion 3.0 Mini, Aion 2.0 (reasoning), Aion RP Llama 3.1 8B
**Limits:** 15 RPM, 20K tokens/day. Specialized for roleplay and storytelling.

### Get your API key

1. Go to [Aion Labs API keys](https://www.aionlabs.ai/app/api-keys/).
2. Create an account or sign in (no credit card needed).
3. Create a new key and copy it.

### Usage example

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_AION_API_KEY",
    base_url="https://api.aionlabs.ai/v1/"
)

response = client.chat.completions.create(
    model="aion-labs/aion-3.0",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Environment variable

```bash
export AION_API_KEY="your-key-here"
```
