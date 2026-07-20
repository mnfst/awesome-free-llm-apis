import { CohereProvider } from './cohere.js';
import { GeminiProvider } from './gemini.js';
import { MistralProvider } from './mistral.js';
import { ZhipuProvider } from './zhipu.js';
import { CerebrasProvider } from './cerebras.js';
import { CloudflareProvider } from './cloudflare.js';
import { GitHubModelsProvider } from './github-models.js';
import { GroqProvider } from './groq.js';
import { HuggingFaceProvider } from './huggingface.js';
import { LLM7Provider } from './llm7.js';
import { NvidiaProvider } from './nvidia.js';
import { OllamaCloudProvider } from './ollama-cloud.js';
import { OpenRouterProvider } from './openrouter.js';
import { SiliconFlowProvider } from './siliconflow.js';
import { KiloCodeProvider } from './kilocode.js';
import { ModelScopeProvider } from './modelscope.js';
import type { Provider, ProviderModel } from './types.js';

export class ProviderRegistry {
  private static instance: ProviderRegistry;
  private providers: Map<string, Provider> = new Map();

  private constructor() {
    const allProviders: Provider[] = [
      new CohereProvider(),
      new GeminiProvider(),
      new MistralProvider(),
      new ZhipuProvider(),
      new CerebrasProvider(),
      new CloudflareProvider(),
      new GitHubModelsProvider(),
      new GroqProvider(),
      new HuggingFaceProvider(),
      new LLM7Provider(),
      new NvidiaProvider(),
      new OllamaCloudProvider(),
      new OpenRouterProvider(),
      new SiliconFlowProvider(),
      new KiloCodeProvider(),
      new ModelScopeProvider()
    ];
    for (const p of allProviders) {
      this.providers.set(p.id, p);
    }
  }

  static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  getProvider(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  getProviderForModel(modelId: string): Provider | undefined {
    for (const provider of this.providers.values()) {
      if (provider.models.some((m) => m.id === modelId)) {
        return provider;
      }
    }
    return undefined;
  }

  getAllModels(): Array<{ provider: Provider; model: ProviderModel }> {
    const results: Array<{ provider: Provider; model: ProviderModel }> = [];
    for (const provider of this.providers.values()) {
      for (const model of provider.models) {
        results.push({ provider, model });
      }
    }
    return results;
  }

  getAvailableProviders(): Provider[] {
    return Array.from(this.providers.values()).filter((p) => p.isAvailable());
  }

  /**
   * Flattened {provider, model} pairs across every currently-available provider's
   * declared visionModels (BaseProvider.visionModels, computed from the centralized
   * isVisionSupported() config). Single source of truth for "which provider/model
   * combos can actually accept multimodal image_url content" — callers should use this
   * instead of re-deriving their own vision-model set from getAvailableProviders().
   */
  getAvailableVisionModels(): Array<{ provider: Provider; model: ProviderModel }> {
    const results: Array<{ provider: Provider; model: ProviderModel }> = [];
    for (const provider of this.getAvailableProviders()) {
      for (const model of provider.visionModels) {
        results.push({ provider, model });
      }
    }
    return results;
  }

  getAllProviders(): Provider[] {
    return Array.from(this.providers.values());
  }

  registerProvider(provider: Provider): void {
    this.providers.set(provider.id, provider);
  }
}
