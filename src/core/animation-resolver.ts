import type { ActionId } from '../types/action';
import type { AnimToken, AnimationManifest, ResolutionTrace } from '../types/animation';
import type { ResolvedLoadout } from './loadout-resolver';

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export type AnimationResolverResult = {
  clipName: string;
  trace: ResolutionTrace;
};

export class AnimationResolver {
  constructor(private readonly manifest: AnimationManifest) {}

  resolve(actionId: ActionId, loadout: ResolvedLoadout): AnimationResolverResult {
    const animToken = loadout.actionToToken[actionId] as AnimToken;

    const exact = this.manifest.clipMapping[animToken];
    if (exact) {
      return {
        clipName: exact,
        trace: { actionId, animToken, clipName: exact, strategy: 'exact' },
      };
    }

    const normalizedToken = normalizeKey(animToken);
    const normalizedMatch = Object.entries(this.manifest.clipMapping).find(
      ([token]) => normalizeKey(token) === normalizedToken
    );
    if (normalizedMatch) {
      return {
        clipName: normalizedMatch[1],
        trace: { actionId, animToken, clipName: normalizedMatch[1], strategy: 'normalized' },
      };
    }

    const aliasToken = this.manifest.aliases?.[animToken];
    if (aliasToken && this.manifest.clipMapping[aliasToken]) {
      return {
        clipName: this.manifest.clipMapping[aliasToken],
        trace: {
          actionId,
          animToken,
          clipName: this.manifest.clipMapping[aliasToken],
          strategy: 'alias',
        },
      };
    }

    const fallbackIdle = this.manifest.fallbackIdle || this.manifest.clipMapping.Idle || 'Idle';
    return {
      clipName: fallbackIdle,
      trace: { actionId, animToken, clipName: fallbackIdle, strategy: 'fallback-idle' },
    };
  }
}
