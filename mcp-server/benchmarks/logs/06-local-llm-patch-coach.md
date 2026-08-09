# Benchmark Log: 06-local-llm-patch-coach

**Timestamp**: 2026-08-09T06:33:14.825Z

## 🎯 Code Context Language Inference & 4-Phase Protocol Breakdown

The LLM receives a generic code-editing system prompt (`"You are a precise code-editing assistant..."`) and infers the target language architecture (TypeScript, Python, Go) organically from the provided `filePath` and `fileContent`.

---

## 💻 Multi-Language Target Executions (`REAL_OLLAMA_HTTP`)


### 🌐 Target Language: TypeScript (`src/memory/index.ts`)
- **Instruction**: `"Add resetAll() method to MemoryManager that clears shortTerm Map and reinitializes longTerm JSON file store"`

#### 📄 Input Code Context:
```
export class MemoryManager {
  private shortTerm = new Map<string, any>();
  public getShortTerm() { return this.shortTerm; }
}
```

#### 📋 Phase 1 Coach Explanation Frame:
```json
{
  "concept": "Concept: Add resetAll() method to MemoryManager that clears shortTerm Map and reinitializes longTerm JSON file store",
  "example": "Example: Illustrative code pattern or minimal snippet implementing 'Add resetAll() method to MemoryManager that clears shortTerm Map and reinitializes longTerm JSON file store'",
  "exercise": "Exercise: Modify the target file according to 'Add resetAll() method to MemoryManager that clears shortTerm Map and reinitializes longTerm JSON file store'",
  "hint": "Hint: Ensure changes are scoped precisely and existing tests pass."
}
```

#### 💻 Phase 3 Executed Patch Output:
```diff
```
import fs from 'fs';
import path from 'path';

export class MemoryManager {
  private shortTerm = new Map<string, any>();
  private longTermPath: string;

  constructor(longTermFilePath: string) {
    this.longTermPath = longTermFilePath;
    this.loadLongTerm();
  }

  public getShortTerm() { return this.shortTerm; }

  public resetAll() {
    this.shortTerm.clear();
    this.saveLongTerm({});
  }

  private loadLongTerm() {
    try {
      const data = fs.readFileSync(this.longTermPath, 'utf8');
      this.shortTerm = new Map(Object.entries(JSON.parse(data)));
    } catch (e) {
      if (e.code === 'ENOENT') {
        this.saveLongTerm({});
      } else {
        throw e;
      }
    }
  }

  private saveLongTerm(data: any) {
    fs.writeFileSync(this.longTermPath, JSON.stringify(data, null, 2));
  }
}
```
```

#### 🧠 Phase 4 Reflection:
```text
Applied 'Add resetAll() method to MemoryManager that clears shortTerm Map and reinitializes longTerm JSON file store': Patched src/memory/index.ts successfully
```

---

### 🌐 Target Language: Python (`services/auth.py`)
- **Instruction**: `"Add revoke_token(token) method to AuthService that removes token from _tokens dictionary"`

#### 📄 Input Code Context:
```
class AuthService:
    def __init__(self):
        self._tokens = {}

    def validate(self, token: str) -> bool:
        return token in self._tokens

```

#### 📋 Phase 1 Coach Explanation Frame:
```json
{
  "concept": "Concept: Add revoke_token(token) method to AuthService that removes token from _tokens dictionary",
  "example": "Example: Illustrative code pattern or minimal snippet implementing 'Add revoke_token(token) method to AuthService that removes token from _tokens dictionary'",
  "exercise": "Exercise: Modify the target file according to 'Add revoke_token(token) method to AuthService that removes token from _tokens dictionary'",
  "hint": "Hint: Ensure changes are scoped precisely and existing tests pass."
}
```

#### 💻 Phase 3 Executed Patch Output:
```diff
```python
class AuthService:
    def __init__(self):
        self._tokens = {}

    def validate(self, token: str) -> bool:
        return token in self._tokens

    def revoke_token(self, token: str):
        if token in self._tokens:
            del self._tokens[token]
```
```

#### 🧠 Phase 4 Reflection:
```text
Applied 'Add revoke_token(token) method to AuthService that removes token from _tokens dictionary': Patched services/auth.py successfully
```

---

### 🌐 Target Language: Go (`pkg/logger/logger.go`)
- **Instruction**: `"Add SetLevel(level string) method to Logger struct"`

#### 📄 Input Code Context:
```
package logger

type Logger struct {
	level string
}

func NewLogger(level string) *Logger {
	return &Logger{level: level}
}

```

#### 📋 Phase 1 Coach Explanation Frame:
```json
{
  "concept": "Concept: Add SetLevel(level string) method to Logger struct",
  "example": "Example: Illustrative code pattern or minimal snippet implementing 'Add SetLevel(level string) method to Logger struct'",
  "exercise": "Exercise: Modify the target file according to 'Add SetLevel(level string) method to Logger struct'",
  "hint": "Hint: Ensure changes are scoped precisely and existing tests pass."
}
```

#### 💻 Phase 3 Executed Patch Output:
```diff
```
package logger

type Logger struct {
	level string
}

func NewLogger(level string) *Logger {
	return &Logger{level: level}
}

func (l *Logger) SetLevel(level string) {
	l.level = level
}
```
```

#### 🧠 Phase 4 Reflection:
```text
Applied 'Add SetLevel(level string) method to Logger struct': Patched pkg/logger/logger.go successfully
```


---

## 🏆 Ollama Model Candidate Ranking (`REAL_OLLAMA_TAGS`)

Production ranking via `rankCandidateModels()` from `src/providers/ollama-local.ts`:

**Available Models**: `hf.co/empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF:Q4_K_M`, `BGE-M3:latest`, `qwen2.5-coder:7b`, `nomic-embed-text:latest`, `mistral-nemo:latest`

**Ranked Candidates (Coding Preferred)**:
1. `qwen2.5-coder:7b` ⭐ (Coding Model Preferred)
2. `hf.co/empero-ai/Qwythos-9B-Claude-Mythos-5-1M-GGUF:Q4_K_M`
3. `BGE-M3:latest`
4. `nomic-embed-text:latest`
5. `mistral-nemo:latest`

---
*Generated by Vitest Benchmark Suite (06-local-llm-patch-coach.bench.ts)*
