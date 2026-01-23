export interface InjectionRecord {
  guidelineId: string;
  lastInjectedAt: string;
  tokensSinceInjection: number;
  episodeIdWhenInjected: string | null;
}

export interface ShouldInjectOptions {
  tokenThreshold: number;
  forceRefresh?: boolean;
}

export interface InjectionTrackerConfig {
  defaultTokenThreshold: number;
}

export const DEFAULT_INJECTION_TRACKER_CONFIG: InjectionTrackerConfig = {
  defaultTokenThreshold: 100000,
};
