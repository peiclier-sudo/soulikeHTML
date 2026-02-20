import type { ActionId } from './action';

export type AnimToken = string;

export type ClipMapping = Record<AnimToken, string>;

export type AnimationManifest = {
  version: string;
  clipMapping: ClipMapping;
  aliases?: Record<string, string>;
  fallbackIdle?: string;
};

export type ResolutionTrace = {
  actionId: ActionId;
  animToken: AnimToken;
  clipName: string;
  strategy: 'exact' | 'normalized' | 'alias' | 'fallback-idle';
};
