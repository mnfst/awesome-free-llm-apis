# `get_token_stats`

**Purpose:** Retrieve real-time usage (tokens/requests) per provider.

**Required params:** *(none)*

### Invocation
```json
{}
```

### Sample Response (Groq)
```json
{
  "id": "groq",
  "name": "Groq",
  "isAvailable": true,
  "rateLimits": { "rpm": 30, "rpd": 14400 },
  "usage": { "tokens": 1024, "requests": 2 }
}
```
