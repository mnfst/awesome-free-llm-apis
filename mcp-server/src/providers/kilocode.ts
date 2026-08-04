import { BaseProvider } from './base.js';
import type { ProviderModel, RateLimits } from './types.js';

export class KiloCodeProvider extends BaseProvider {
  readonly id = 'kilocode';
  readonly name = 'Kilo Code';
  readonly baseURL = 'https://api.kilo.ai/api/gateway/';
  readonly envVar = 'KILO_API_KEY';
  readonly rateLimits: RateLimits = { rpm: 3 };

  readonly models: ProviderModel[] = [
    { id: 'kilo-auto/free', name: 'Kilo Auto Free' },
    { id: 'inclusionai/ling-3.0-flash:free', name: 'Ling 3.0 Flash' },
    { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nemotron 3 Ultra 550B' },
    { id: 'poolside/laguna-s-2.1:free', name: 'Laguna S 2.1' },
    { id: 'stepfun/step-3.7-flash:free', name: 'Step 3.7 Flash' },
  ];
}
