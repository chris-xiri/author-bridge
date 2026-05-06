import { GEO_DATA, type GeoMode } from "./geo-data";

export interface GeoBuildInput {
  selectedStates: string[];
  mode: GeoMode;
  targetCount: number;
  anchorCity?: string;
  existingCoverage?: Record<string, number>;
}

function scoreWithCoverage(items: string[], coverage: Record<string, number>) {
  return items
    .map((item) => ({ item, score: coverage[item] ?? 0 }))
    .sort((a, b) => a.score - b.score)
    .map((x) => x.item);
}

function resolveRadiusTargets(state: (typeof GEO_DATA)[number], anchorCity?: string) {
  const anchor = (anchorCity ?? state.cities[0]).trim();
  if (!anchor) return state.cities.slice(0, 4);

  if (state.radiusMap?.[anchor]) {
    return [anchor, ...state.radiusMap[anchor]];
  }

  const anchorLower = anchor.toLowerCase();
  if (state.nearbyKeywords) {
    for (const [key, nearby] of Object.entries(state.nearbyKeywords)) {
      if (anchorLower.includes(key)) {
        return Array.from(new Set([nearby[0] ?? anchor, ...nearby]));
      }
    }
  }

  // Final fallback if anchor is unknown in this state's map.
  return [anchor, ...state.cities.slice(0, 3)];
}

export function buildGeoTargets(input: GeoBuildInput): string[] {
  const states = GEO_DATA.filter((s) => input.selectedStates.includes(s.state));
  const coverage = input.existingCoverage ?? {};
  const pool: string[] = [];

  for (const state of states) {
    if (input.mode === "metro_first") pool.push(...state.cities);
    if (input.mode === "county_sweep") pool.push(...state.counties, ...state.cities);
    if (input.mode === "zip_clusters") pool.push(...state.clusters, ...state.cities.slice(0, 3));
    if (input.mode === "radius") {
      pool.push(...resolveRadiusTargets(state, input.anchorCity));
    }
  }

  const unique = Array.from(new Set(pool));
  return scoreWithCoverage(unique, coverage).slice(0, input.targetCount);
}
