# `validate_provider`

**Purpose:** Run a live health check + credential validation for a specific provider.

**Required params:** `providerId`

### Invocation
```json
{ "providerId": "groq" }
```

### Response
```json
{
  "success": true,
  "message": "Provider is online and successfully authenticated.",
  "latencyMs": "45ms"
}
```
