# `vision_tool`

**Purpose:** Analyze local images via a vision-capable model.

**Required params:** `image_path`
**Key optional params:** `prompt`, `model`

### Invocation
```json
{
  "image_path": "file:///c:/Users/mahes/project/assets/login_page.png",
  "prompt": "Analyze the UI layout of this login page.",
  "workspace_root": "/abs/path/to/project"
}
```

### Response
- Resolves the local path, converts the image to base64, and routes it to an available vision model (e.g., Gemini or Llama-3.2-Vision).
