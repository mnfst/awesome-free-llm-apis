# Benchmark Log: 06-local-llm-patch-coach

**Timestamp**: 2026-08-07T10:25:00.905Z

## 🎯 Real Target Requirement & Work Instruction
`Add resetAll() method to MemoryManager that clears shortTerm Map and reinitializes longTerm JSON file store`

---

## 🛠️ 4-Phase Coach-First Protocol Breakdown

| Phase | Phase Name | Function / Utility Executed | Input Size | Output Size | Status |
|---|---|---|---|---|---|
| **Phase 1** | **Instruct** | `CoachTool.explainInstruction()` | 22 tok | 115 tok | ✅ SUCCESS |
| **Phase 2** | **Confirm** | Safety Gate Payload Validation | — | 51 tok | ✅ APPROVED |
| **Phase 3** | **Patch** | Real Ollama HTTP (`/api/chat`) or Fallback | 22 tok | 958 tok | `REAL_OLLAMA_HTTP` |
| **Phase 4** | **Reinforce** | `CoachTool.reinforce()` Reflection | 13 tok | 38 tok | ✅ COMPLETED |

---

## 📋 Phase 1: Generated Coach Explanation Frame
```json
{
  "concept": "Concept: Add resetAll() method to MemoryManager that clears shortTerm Map and reinitializes longTerm JSON file store",
  "example": "Example: Illustrative code pattern or minimal snippet implementing 'Add resetAll() method to MemoryManager that clears shortTerm Map and reinitializes longTerm JSON file store'",
  "exercise": "Exercise: Modify the target file according to 'Add resetAll() method to MemoryManager that clears shortTerm Map and reinitializes longTerm JSON file store'",
  "hint": "Hint: Ensure changes are scoped precisely and existing tests pass."
}
```

---

## 💻 Phase 3: Executed Unified Patch Output (`REAL_OLLAMA_HTTP`)
```diff
To add a `resetAll()` method to the `MemoryManager` class that clears the `shortTerm` map and reinitializes the `longTerm` JSON file store, you would need to perform the following steps:

1. Clear the `shortTerm` map.
2. Reinitialize or reset the `longTerm` JSON file store.

Below is an example implementation in Java:

```java
import java.io.*;
import java.util.Map;
import org.json.JSONObject;

public class MemoryManager {
    private Map<String, String> shortTerm;
    private JSONObject longTerm;

    public MemoryManager() {
        this.shortTerm = new HashMap<>();
        this.longTerm = new JSONObject();
        initializeLongTermStore();
    }

    // Method to clear the shortTerm map and reinitialize the longTerm JSON file store
    public void resetAll() {
        // Clear the shortTerm map
        this.shortTerm.clear();

        // Reinitialize or reset the longTerm JSON file store
        initializeLongTermStore();
    }

    private void initializeLongTermStore() {
        try (FileReader reader = new FileReader("long_term_store.json")) {
            this.longTerm = new JSONObject(reader);
        } catch (IOException e) {
            System.err.println("Failed to read or create the long-term store file.");
            e.printStackTrace();
            // Initialize an empty JSON object if file reading fails
            this.longTerm = new JSONObject();
        }
    }

    public void addToShortTerm(String key, String value) {
        this.shortTerm.put(key, value);
    }

    public void addToLongTerm(String key, Object value) {
        this.longTerm.put(key, value);
    }

    public String getFromShortTerm(String key) {
        return this.shortTerm.get(key);
    }

    public Object getFromLongTerm(String key) {
        return this.longTerm.get(key);
    }

    // Method to save the longTerm JSON object back to the file
    public void saveLongTermStore() {
        try (FileWriter writer = new FileWriter("long_term_store.json")) {
            writer.write(this.longTerm.toString());
        } catch (IOException e) {
            System.err.println("Failed to write the long-term store to file.");
            e.printStackTrace();
        }
    }

    // Main method for testing
    public static void main(String[] args) {
        MemoryManager manager = new MemoryManager();

        // Test adding data
        manager.addToShortTerm("testKey", "testValue");
        manager.addToLongTerm("testKey", 123);

        System.out.println("Short Term: " + manager.getFromShortTerm("testKey"));
        System.out.println("Long Term: " + manager.getFromLongTerm("testKey"));

        // Reset all
        manager.resetAll();

        // Verify the reset
        System.out.println("Short Term after reset: " + manager.getFromShortTerm("testKey"));
        System.out.println("Long Term after reset: " + manager.getFromLongTerm("testKey"));

        // Save the long-term store back to file
        manager.saveLongTermStore();
    }
}
```

### Explanation:
1. **Constructor**: Initializes `shortTerm` as a new `HashMap` and `longTerm` as a new empty `JSONObject`. It also calls `initializeLongTermStore()` to load or create the initial state of the `longTerm` store.
2. **resetAll() Method**: Clears the `shortTerm` map using `clear()`. It then reinitializes the `longTerm` JSON file store by calling `initializeLongTermStore()`.
3. **initializeLongTermStore() Method**: Reads the `long_term_store.json` file and initializes the `longTerm` JSON object with its contents. If the file does not exist or an error occurs, it initializes an empty JSON object.
4. **addToShortTerm() and addToLongTerm() Methods**: These methods allow adding data to `shortTerm` and `longTerm`.
5. **getFromShortTerm() and getFromLongTerm() Methods**: Retrieve values from `shortTerm` and `longTerm`.
6. **saveLongTermStore() Method**: Writes the current state of the `longTerm` JSON object back to the file.
7. **Main Method**: Demonstrates usage with a simple test case.

### Notes:
- Ensure that the JSON library (e.g., org.json) is included in your project dependencies.
- The `long_term_store.json` file should be writable by the application, or you may need to handle file permissions accordingly.
- Error handling and logging are minimal for simplicity. In a production environment, consider adding more robust error handling and detailed logging.
```

---

## 🧠 Phase 4: Generated Reflection
```text
Applied 'Add resetAll() method to MemoryManager that clears shortTerm Map and reinitializes longTerm JSON file store': Added resetAll() method to MemoryManager in src/memory/index.ts
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
