/**
 * Signal Ranker — internal bias-normalized importance model.
 *
 * NOT exposed in UI. Runs server-side inside the globe API route
 * before signals are returned. No NIM calls here — pure deterministic
 * scoring so it's zero-latency.
 *
 * Model goals:
 *  1. Corroboration: boost signals confirmed by multiple independent outlets
 *  2. Geographic source diversity: cross-region reporting > single Western source
 *  3. Recency: events from last 24h weighted higher than older ones
 *  4. Systemic impact: structural categories (infrastructure, arms, energy) >
 *     episodic alerts, because they carry long-term geopolitical weight
 *  5. Anti-Western-media-bias: penalize single-anglophone-outlet signals,
 *     boost signals with at least one local/regional source
 *
 * The "learning over time" component requires DB persistence (Prisma schema
 * already has IngestionRun + Signal). Once the DB is live, this module will
 * read historical corroboration scores and update signal weights across runs.
 * For now: stateless per-request scoring.
 */

import type { Signal, VerificationStatus } from '../types';

// ─── Institutional source list (high-trust, non-Western-centric) ─────────────

const HIGH_TRUST_OUTLETS = new Set([
  'acled', 'unocha', 'unhcr', 'iom', 'iaea', 'sipri', 'unctad',
  'reliefweb', 'ocha', 'copernicus', 'firms', 'global fishing watch',
  'bellingcat', 'forensic architecture', 'citizen lab', 'airwaves',
  'al jazeera', 'dawn', 'the hindu', 'xinhua', 'tass', 'rt', 'teleSUR',
  'africa confidential', 'ethiopia insight', 'the east african',
]);

// Outlets with systematic editorial bias toward specific powers
// (not excluded — just weighted lower unless corroborated by diverse sources)
const SINGLE_POWER_OUTLETS = new Set([
  'fox news', 'breitbart', 'sputnik', 'people\'s daily', 'press tv',
]);

// ─── Category systemic weight ─────────────────────────────────────────────────
// Structural/infrastructure events carry more long-term weight than episodic alerts

const CATEGORY_WEIGHT: Record<string, number> = {
  infrastructure_failure: 1.20,
  energy_extraction:      1.15,
  arms_trade:             1.15,
  canal_politics:         1.10,
  maritime_routes:        1.10,
  tech_surveillance:      1.10,
  satellite_signals:      1.08,
  remote_warfare:         1.05,
  gov_docs:               1.05, // leaked/declassified material — substantive, not soft news
  border_regimes:         1.00,
  migration_rescue:       1.00,
  climate_fire_desert:    1.00,
};

// ─── Corroboration grouping ───────────────────────────────────────────────────
// Signals within 0.8° and same category and within 72h are considered about
// the same event. Corroboration = number of distinct outlet domains in group.

function gridKey(lng: number, lat: number, category: string): string {
  const gLng = Math.round(lng / 0.8);
  const gLat = Math.round(lat / 0.8);
  return `${category}:${gLng}:${gLat}`;
}

function daysBefore(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
}

// ─── Recency multiplier (0.6 → 1.0 over 30 days) ────────────────────────────

function recencyMultiplier(lastUpdated: string): number {
  const age = daysBefore(lastUpdated);
  if (age < 1)  return 1.0;
  if (age < 3)  return 0.95;
  if (age < 7)  return 0.88;
  if (age < 14) return 0.78;
  if (age < 30) return 0.68;
  return 0.60;
}

// ─── Source diversity score ──────────────────────────────────────────────────

function sourceDiversityScore(signal: Signal): number {
  const cluster = signal.sourceCluster ?? [];
  if (cluster.length === 0) return 0;

  const outlets = cluster.map(s => (s.outlet ?? '').toLowerCase());
  const countries = new Set(cluster.map(s => s.country).filter(Boolean));
  const hasHighTrust = outlets.some(o => HIGH_TRUST_OUTLETS.has(o));
  const hasBiased = outlets.some(o => SINGLE_POWER_OUTLETS.has(o));
  const isOnlyBiased = hasBiased && !hasHighTrust && outlets.length <= 1;

  let score = 0;
  score += Math.min(outlets.length * 8, 24);  // up to 3 sources
  score += countries.size * 5;                  // cross-country bonus
  if (hasHighTrust) score += 10;
  if (isOnlyBiased) score -= 12;

  return score;
}

// ─── Corroboration upgrade ────────────────────────────────────────────────────

function upgradeVerification(
  existing: VerificationStatus,
  corrobCount: number,
): VerificationStatus {
  if (corrobCount >= 4) return 'corroborated';
  if (corrobCount >= 2) {
    if (existing === 'unverified' || existing === 'low_confidence') return 'partly_verified';
    return existing;
  }
  return existing;
}

// ─── Main ranking function ────────────────────────────────────────────────────

export function rankSignals(signals: Signal[]): Signal[] {
  if (signals.length === 0) return signals;

  // Step 1: Build corroboration map
  const groups = new Map<string, string[]>();
  for (const s of signals) {
    const [lng, lat] = s.location.coordinates;
    const key = gridKey(lng, lat, s.category);
    const group = groups.get(key) ?? [];
    const outletDomain = (s.sourceCluster?.[0]?.outlet ?? s.id).toLowerCase().replace(/\s/g, '');
    if (!group.includes(outletDomain)) group.push(outletDomain);
    groups.set(key, group);
  }

  // Step 2: Score each signal
  return signals.map(s => {
    const [lng, lat] = s.location.coordinates;
    const key = gridKey(lng, lat, s.category);
    const corrobCount = groups.get(key)?.length ?? 1;

    const baseScore = s.score ?? 40;
    const catWeight  = CATEGORY_WEIGHT[s.category] ?? 1.0;
    const recency    = recencyMultiplier(s.lastUpdated);
    const divScore   = sourceDiversityScore(s);
    const corrobBonus = Math.min((corrobCount - 1) * 7, 21); // up to +21 for 4+ sources

    const newScore = Math.min(
      Math.round(baseScore * catWeight * recency + divScore + corrobBonus),
      99,
    );

    const newVerification = upgradeVerification(s.verification, corrobCount);

    return {
      ...s,
      score: newScore,
      verification: newVerification,
    };
  }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

// ─── Mainstream-noise filter ──────────────────────────────────────────────────
// RSS world feeds carry sport/celebrity/entertainment alongside real news.
// This is a blunt keyword filter, not topic modeling — it exists to stop
// "La Liga" and "Tottenham sign..." from competing for map space with
// substantive economic/political/military signals, nothing subtler.

const SOFT_NOISE_PATTERN = /\b(transfer|signs?|loan move|match preview|final score|box office|premiere|album|celebrity|red carpet|awards? (show|ceremony)|royal (baby|wedding)|fashion week)\b/i;
const SPORT_LEAGUE_PATTERN = /\b(la liga|premier league|champions league|uefa|fifa|nba|nfl|mlb|grand slam|world cup (qualifier|group))\b/i;

function isSoftNoise(s: Signal): boolean {
  if (s.type === 'SEED' || s.type === 'DEEP_CASE') return false; // curated content is exempt
  const text = `${s.title} ${s.summary}`;
  return SOFT_NOISE_PATTERN.test(text) || SPORT_LEAGUE_PATTERN.test(text);
}

/**
 * Filter signals below minimum viability threshold.
 * Removes: zero-location signals, very low-score auto_collected with no corroboration,
 * obvious duplicates by title similarity, mainstream sport/entertainment noise.
 */
export function filterSignals(signals: Signal[]): Signal[] {
  const seen = new Set<string>();
  return signals.filter(s => {
    const [lng, lat] = s.location.coordinates;

    // Skip signals with no valid coordinates
    if (isNaN(lng) || isNaN(lat)) return false;
    if (lng === 0 && lat === 0) return false;

    if (isSoftNoise(s)) return false;

    // Archive non-SEED signals older than 14 days — keeps map current
    const ageDays = daysBefore(s.lastUpdated);
    if (ageDays > 14 && s.type !== 'SEED' && s.type !== 'DEEP_CASE') return false;

    // Deduplicate by near-identical title (first 60 chars)
    const titleKey = s.title.slice(0, 60).toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(titleKey)) return false;
    seen.add(titleKey);

    // Drop very low-score auto_collected signals (likely noise)
    if (s.status === 'auto_collected' && (s.score ?? 0) < 20) return false;

    return true;
  });
}
