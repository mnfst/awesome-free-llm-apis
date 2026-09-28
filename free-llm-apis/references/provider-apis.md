# Provider APIs - Setup Guides

APIs run by the companies that train or fine-tune the models themselves.

## Google Gemini

**Models:** Gemini 2.5 Pro, Flash, Flash-Lite +4 more
**Limits:** 5-15 RPM, 100-1K RPD
**Region restriction:** Free tier not available in the EEA, UK, or Switzerland.

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
    model="gemini-2.5-flash",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Environment variable

```bash
export GEMINI_API_KEY="your-key-here"
# Or for OpenAI-compatible usage:
export OPENAI_API_KEY="your-key-here"
export OPENAI_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai/"
```

---

## Cohere

**Models:** Command A, Command R+, Aya Expanse 32B +9 more
**Limits:** 20 RPM, 1K requests/month

### Get your API key

1. Go to the [Cohere Dashboard](https://dashboard.cohere.com/api-keys).
2. Create an account or sign in.
3. Go to API Keys and generate a trial key.
4. Copy the key.

### Usage example

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_COHERE_API_KEY",
    base_url="https://api.cohere.com/v2/"
)

response = client.chat.completions.create(
    model="command-a-03-2025",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Environment variable

```bash
export CO_API_KEY="your-key-here"
```

---

## Mistral AI

**Models:** Mistral Large 3, Small 3.1, Ministral 8B +3 more
**Limits:** 1 request/second, 1B tokens/month

### Get your API key

1. Go to the [Mistral Console](https://console.mistral.ai/api-keys).
2. Create an account or sign in.
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
    model="mistral-small-latest",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Environment variable

```bash
export MISTRAL_API_KEY="your-key-here"
```

---

## Zhipu AI

**Models:** GLM-4.7-Flash, GLM-4.5-Flash, GLM-4.6V-Flash
**Limits:** Undocumented

### Get your API key

1. Go to [Zhipu AI](https://open.bigmodel.cn/usercenter/apikeys).
2. Sign up (a Chinese phone number may be required).
3. Go to API Keys and create a new key.
4. Copy the key.

### Usage example

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_ZHIPU_API_KEY",
    base_url="https://open.bigmodel.cn/api/paas/v4/"
)

response = client.chat.completions.create(
    model="glm-4-flash",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### Environment variable

```bash
export ZHIPU_API_KEY="your-key-here"
```
