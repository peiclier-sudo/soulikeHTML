import type { ActionId } from '../../types/action';
import type { AnimationManifest, ResolutionTrace } from '../../types/animation';
import { AnimationResolver } from '../../core/animation-resolver';
import type { LoadoutContext } from '../../core/loadout-resolver';
import { resolveLoadout } from '../../core/loadout-resolver';

export class AnimationCodex {
  private readonly resolver: AnimationResolver;

  constructor(manifest: AnimationManifest) {
    this.resolver = new AnimationResolver(manifest);
  }

  resolveAction(actionId: ActionId, context: LoadoutContext): ResolutionTrace {
    const loadout = resolveLoadout(context);
    const { trace } = this.resolver.resolve(actionId, loadout);
    return trace;
  }

  debugResolutionPaths(actionIds: ActionId[], context: LoadoutContext): ResolutionTrace[] {
    const loadout = resolveLoadout(context);
    const traces = actionIds.map((actionId) => this.resolver.resolve(actionId, loadout).trace);

    traces.forEach((trace) => {
      // Required development checkpoint: prove ActionId -> AnimToken -> clipName path.
      console.log(
        `[AnimationCodex] ${trace.actionId} -> ${trace.animToken} -> ${trace.clipName} (${trace.strategy})`
      );
    });

    return traces;
  }
}
