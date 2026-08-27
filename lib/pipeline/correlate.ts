/**
 * Cross-category correlation — the "interpolation" layer.
 *
 * The ranker (signal-ranker.ts) groups same-category signals as corroboration
 * of one event. This module does the opposite: it links DIFFERENT-category
 * signals — economic (energy_extraction, canal_politics), political (gov_docs,
 * border_regimes), military (remote_warfare, arms_trade) — that share a region
 * and time window, on the theory that a sanction, a troop movement, and a
 * diplomatic statement in the same place within days of each other are usually
 * describing one underlying situation, not three unrelated ones.
 *
 * Deliberately loose radius (country-scale, not city-scale) and a wider time
 * window than the ranker's corroboration grouping — this is meant to surface
 * "these might be the same story," not to assert they are. Called once per
 * cron run, after ranking, before caching.
 */

import type { Signal } from '../types';

const CORRELATION_RADIUS_DEG = 4; // ~400km — country/region scale, not city scale
const CORRELATION_WINDOW_DAYS = 5;
const MAX_CORRELATIONS_PER_SIGNAL = 4;

// Category groupings the correlation is meant to connect across
const ECONOMIC = new Set(['energy_extraction', 'canal_politics', 'maritime_routes', 'infrastructure_failure']);
const POLITICAL = new Set(['gov_docs', 'border_regimes', 'canal_politics']);
const MILITARY = new Set(['remote_warfare', 'arms_trade', 'tech_surveillance']);

function dimension(category: string): 'economic' | 'political' | 'military' | 'other' {
  if (MILITARY.has(category)) return 'military';
  if (ECONOMIC.has(category)) return 'economic';
  if (POLITICAL.has(category)) return 'political';
  return 'other';
}

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

export function correlateSignals(signals: Signal[]): Signal[] {
  if (signals.length < 2) return signals;

  const withDim = signals.map(s => ({ s, dim: dimension(s.category) }));

  return signals.map(a => {
    const aDim = dimension(a.category);
    if (aDim === 'other') return a; // only correlate substantive econ/political/military dimensions

    const [aLng, aLat] = a.location.coordinates;
    const candidates = withDim
      .filter(({ s: b, dim: bDim }) =>
        b.id !== a.id &&
        bDim !== 'other' &&
        bDim !== aDim && // must be a DIFFERENT dimension — that's the correlation
        daysBetween(a.lastUpdated, b.lastUpdated) <= CORRELATION_WINDOW_DAYS
      )
      .map(({ s: b }) => {
        const [bLng, bLat] = b.location.coordinates;
        const dist = Math.sqrt((bLng - aLng) ** 2 + (bLat - aLat) ** 2);
        return { b, dist };
      })
      .filter(({ dist }) => dist <= CORRELATION_RADIUS_DEG)
      .sort((x, y) => x.dist - y.dist)
      .slice(0, MAX_CORRELATIONS_PER_SIGNAL)
      .map(({ b }) => b.id);

    if (candidates.length === 0) return a;
    return { ...a, correlatedIds: candidates };
  });
}
