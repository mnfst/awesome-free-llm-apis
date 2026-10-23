# Provider APIs - Setup Guides

APIs run by the companies that train or fine-tune the models themselves.

<!-- Generated from data.json by scripts/generate-skill.js (data last updated 2026-10-05). Do not edit by hand. -->

## Aion Labs 🇮🇱

Permanent free tier, no credit card required. 15 RPM, 20K tokens/day. Specialized for roleplay and storytelling.

**Get a key:** https://www.aionlabs.ai/app/api-keys/

**OpenAI-compatible base URL:** `https://api.aionlabs.ai/v1`

### Models

| Model ID | Context | Modality | Rate limit |
| --- | --- | --- | --- |
| `aion-labs/aion-2.0` | 128K | Text (reasoning) | 15 RPM, 20K TPD |
| `aion-labs/aion-rp-llama-3.1-8b` | 32K | Text | 15 RPM, 20K TPD |
| `aion-labs/aion-3.0` | 128K | Text (reasoning) | 15 RPM, 20K TPD |
| `aion-labs/aion-3.0-mini` | 128K | Text (reasoning) | 15 RPM, 20K TPD |

### Environment variable

```bash
export AION_API_KEY="your-key-here"
```

### Usage example

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["AION_API_KEY"],
    base_url="https://api.aionlabs.ai/v1",
)

response = client.chat.completions.create(
    model="aion-labs/aion-2.0",
    messages=[{"role": "user", "content": "Say hello in one sentence."}],
)
print(response.choices[0].message.content)
```

### Quick test

```bash
curl -s https://api.aionlabs.ai/v1/chat/completions \
  -H "Authorization: Bearer $AION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "aion-labs/aion-2.0", "messages": [{"role": "user", "content": "Say hello"}]}'
```

---

## Cohere 🇨🇦

Free "Trial" API key, no credit card. 1,000 API calls/month. Non-commercial use only.

**Get a key:** https://dashboard.cohere.com/api-keys

**OpenAI-compatible base URL:** `https://api.cohere.ai/compatibility/v1`
(native API: `https://api.cohere.com/v2`)

### Models

| Model ID | Context | Modality | Rate limit |
| --- | --- | --- | --- |
| `command-a-plus-05-2026` | 128K | Text + Image | 20 RPM |
| `command-a-03-2025` | 256K | Text | 20 RPM |
| `command-r-plus-08-2024` | 128K | Text | 20 RPM |
| `command-r-08-2024` | 128K | Text | 20 RPM |
| `command-r7b-12-2024` | 128K | Text | 20 RPM |
| `command-a-reasoning-08-2025` | 256K | Text (reasoning) | 20 RPM |
| `command-a-translate-08-2025` | 8K | Text | 20 RPM |
| `command-a-vision-07-2025` | 128K | Text + Image | 20 RPM |
| `command-r7b-arabic-02-2025` | 128K | Text | 20 RPM |
| `c4ai-aya-expanse-32b` | 128K | Text | 20 RPM |
| `c4ai-aya-vision-32b` | 16K | Text + Image | 20 RPM |

### Environment variable

```bash
export COHERE_API_KEY="your-key-here"
```

### Usage example

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["COHERE_API_KEY"],
    base_url="https://api.cohere.ai/compatibility/v1",
)

response = client.chat.completions.create(
    model="command-a-plus-05-2026",
    messages=[{"role": "user", "content": "Say hello in one sentence."}],
)
print(response.choices[0].message.content)
```

### Quick test

```bash
curl -s https://api.cohere.ai/compatibility/v1/chat/completions \
  -H "Authorization: Bearer $COHERE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "command-a-plus-05-2026", "messages": [{"role": "user", "content": "Say hello"}]}'
```

---

## Google Gemini 🇺🇸

Free tier, no credit card. Free-tier prompts may be used by Google to improve products.

**Notes:** The Gemini API free tier is available to developers in the EU, UK, and Switzerland; the [available regions](https://ai.google.dev/gemini-api/docs/available-regions) page lists these regions. The [terms](https://ai.google.dev/gemini-api/terms) still require you to use only Paid Services when you make an API Client available to users in the European Economic Area, Switzerland, or the UK. Google no longer publishes per-model free-tier rate limits; check your quotas in [AI Studio](https://aistudio.google.com/). Free-tier prompts may be used by Google to improve products, except for users in the EEA, Switzerland and the UK, where the paid-services data terms also govern the unpaid quota, so those prompts are not used to improve Google products. `gemini-3.1-flash-lite` is on the [deprecation schedule](https://ai.google.dev/gemini-api/docs/deprecations), with a shutdown date of May 7, 2027 and `gemini-3.5-flash-lite` as its replacement; the row stays because the model is live and free today.

**Get a key:** https://aistudio.google.com/app/apikey

**OpenAI-compatible base URL:** `https://generativelanguage.googleapis.com/v1beta/openai/`
(native API: `https://generativelanguage.googleapis.com/v1beta`)

### Models

| Model ID | Context | Modality | Rate limit |
| --- | --- | --- | --- |
| `gemini-3.8-flash` | 1M | Text + Image + Audio + Video | — |
| `gemini-3.7-flash` | 1M | Text + Image + Audio + Video | — |
| `gemini-3.6-flash` | 1M | Text + Image + Audio + Video | 15 RPM, 1,500 RPD |
| `gemini-3.5-flash` | 1M | Text + Image + Audio + Video | 15 RPM, 1,500 RPD |
| `gemini-3.5-flash-lite` | 1M | Text + Image + Audio + Video | 30 RPM, 1,500 RPD |
| `gemini-3.1-flash-lite` | 1M | Text + Image + Audio + Video | 30 RPM, 1,500 RPD |
| `gemini-2.5-flash` | 1M | Text + Image + Audio + Video | 15 RPM, 1,500 RPD |
| `gemini-2.5-flash-lite` | 1M | Text + Image + Audio + Video | 30 RPM, 1,500 RPD |
| `gemini-2.5-pro` | 1M | Text + Image + Audio + Video | 5 RPM, 50 RPD |
| `gemma-4-31b-it` | 256K | Text | — |
| `gemma-4-26b-a4b-it` | 256K | Text | — |

### Environment variable

```bash
export GEMINI_API_KEY="your-key-here"
```

### Usage example

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["GEMINI_API_KEY"],
    base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
)

response = client.chat.completions.create(
    model="gemini-3.8-flash",
    messages=[{"role": "user", "content": "Say hello in one sentence."}],
)
print(response.choices[0].message.content)
```

### Quick test

```bash
curl -s https://generativelanguage.googleapis.com/v1beta/openai/chat/completions \
  -H "Authorization: Bearer $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "gemini-3.8-flash", "messages": [{"role": "user", "content": "Say hello"}]}'
```

---

## Mistral AI 🇫🇷

Free mode, enabled by default, no credit card required. $10/month in API credits, and free-mode prompts may be used to train Mistral models unless you opt out.

**Notes:** Mistral plans are global: the monthly allowance is shared across Studio, the API, and Vibe Code, so CLI usage eats the same budget ([subscriptions](https://docs.mistral.ai/admin/billing-usage/subscriptions)). Free mode is the default for new accounts and needs no credit card ([quickstart](https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key)), and the Free plan card on the [pricing page](https://mistral.ai/pricing) is what carries the $10/month in API credits figure quoted in the description. Free-mode inputs and outputs may be used to train Mistral models, and you can opt out at any time ([data usage](https://help.mistral.ai/en/articles/347617-do-you-use-my-user-data-to-train-your-artificial-intelligence-models)). Mistral no longer publishes numeric free-tier rate limits and points you at the Limits page of the admin panel instead ([rate limits](https://help.mistral.ai/en/articles/698531-why-am-i-hitting-api-rate-limits-and-how-do-i-increase-them)); the rate limit column is kept from the last published values.

**Get a key:** https://console.mistral.ai/api-keys

**OpenAI-compatible base URL:** `https://api.mistral.ai/v1`

### Models

| Model ID | Context | Modality | Rate limit |
| --- | --- | --- | --- |
| `mistral-medium-3-5` | 256K | Text + Image + Code | ~1 RPS, 500K TPM |
| `mistral-small-2603` | 256K | Text + Image + Code | ~1 RPS, 500K TPM |
| `mistral-large-2512` | 256K | Multimodal | ~1 RPS, 500K TPM |
| `ministral-8b-2512` | 256K | Text + Vision | ~1 RPS, 500K TPM |
| `codestral-2508` | 128K | Code | ~1 RPS, 500K TPM |
| `ministral-3b-2512` | 256K | Text + Vision | ~1 RPS, 500K TPM |
| `ministral-14b-2512` | 256K | Text + Vision | ~1 RPS, 500K TPM |

### Environment variable

```bash
export MISTRAL_API_KEY="your-key-here"
```

### Usage example

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["MISTRAL_API_KEY"],
    base_url="https://api.mistral.ai/v1",
)

response = client.chat.completions.create(
    model="mistral-medium-3-5",
    messages=[{"role": "user", "content": "Say hello in one sentence."}],
)
print(response.choices[0].message.content)
```

### Quick test

```bash
curl -s https://api.mistral.ai/v1/chat/completions \
  -H "Authorization: Bearer $MISTRAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "mistral-medium-3-5", "messages": [{"role": "user", "content": "Say hello"}]}'
```

---

## Z AI (Zhipu AI) 🇨🇳

Permanent free models, no credit card required.

**Notes:** Registration accepts overseas phone numbers ([registration FAQ](https://docs.bigmodel.cn/cn/faq/registration-login.md)) and the chat API does not require real-name verification: 目前调用 API 并不强制要求实名认证 ([authentication FAQ](https://docs.bigmodel.cn/cn/faq/authentication-issues.md)). The Batch API does require it ([batch FAQ](https://docs.bigmodel.cn/cn/faq/batch-api-issues.md)). The same free models are served from the international platform at `https://api.z.ai/api/paas/v4` ([endpoint](https://docs.z.ai/guides/develop/http/introduction)), where GLM-4.7-Flash, GLM-4.5-Flash and GLM-4.6V-Flash are all priced Free ([pricing](https://docs.z.ai/guides/overview/pricing.md)). Z AI has announced that GLM-4.5-Flash will be retired and its requests auto-routed to GLM-4.7-Flash ([model page](https://docs.bigmodel.cn/cn/guide/models/free/glm-4.5-flash.md)); the announced date has already passed while the model is still catalogued and still priced Free, so treat that row as living on borrowed time.

**Get a key:** https://open.bigmodel.cn/usercenter/apikeys

**OpenAI-compatible base URL:** `https://open.bigmodel.cn/api/paas/v4`

### Models

| Model ID | Context | Modality | Rate limit |
| --- | --- | --- | --- |
| `glm-4.7-flash` | 200K | Text (reasoning) | 1 concurrent request |
| `glm-4.5-flash` | 128K | Text (reasoning) | 1 concurrent request |
| `glm-4.6v-flash` | 128K | Multimodal | 1 concurrent request |

### Environment variable

```bash
export ZAI_API_KEY="your-key-here"
```

### Usage example

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["ZAI_API_KEY"],
    base_url="https://open.bigmodel.cn/api/paas/v4",
)

response = client.chat.completions.create(
    model="glm-4.7-flash",
    messages=[{"role": "user", "content": "Say hello in one sentence."}],
)
print(response.choices[0].message.content)
```

### Quick test

```bash
curl -s https://open.bigmodel.cn/api/paas/v4/chat/completions \
  -H "Authorization: Bearer $ZAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "glm-4.7-flash", "messages": [{"role": "user", "content": "Say hello"}]}'
```
