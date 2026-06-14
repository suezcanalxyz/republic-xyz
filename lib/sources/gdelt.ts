/**
 * GDELT GEO API — live geopolitical news with coordinates.
 * Free, no API key. Covers 100+ languages, 65k+ global outlets.
 * Uses GDELT 2.0 GEO endpoint: returns geotagged articles as GeoJSON.
 *
 * Queries multiple geopolitical themes in parallel, clusters nearby
 * articles from same 6h window into single signals, returns up to 150.
 */

import type { Signal, VerificationStatus } from '../types';
import { getCached, setCached } from '../cache';

const CACHE_KEY = 'gdelt:live';
const TTL_MS = 15 * 60 * 1000; // 15 min — GDELT updates every 15min
const TIMESPAN = 20160; // minutes = 14 days

// Themes → ATLAS category mapping
const QUERIES: Array<{ q: string; category: string; tags: string[] }> = [
  { q: 'conflict war attack airstrike military',      category: 'remote_warfare',         tags: ['conflict', 'military'] },
  { q: 'migration refugee asylum crossing border',    category: 'migration_rescue',        tags: ['migration', 'displacement'] },
  { q: 'maritime ship tanker port strait',            category: 'maritime_routes',         tags: ['maritime', 'shipping'] },
  { q: 'energy pipeline gas oil sanctions',           category: 'energy_extraction',       tags: ['energy', 'resources'] },
  { q: 'climate flood wildfire drought disaster',     category: 'climate_fire_desert',     tags: ['climate', 'environment'] },
  { q: 'surveillance drone technology cyber hack',    category: 'tech_surveillance',       tags: ['tech', 'surveillance'] },
  { q: 'arms weapons transfer export military aid',   category: 'arms_trade',              tags: ['arms', 'weapons'] },
  { q: 'canal suez panama hormuz strait passage',     category: 'canal_politics',          tags: ['canal', 'transit'] },
  { q: 'infrastructure collapse failure power grid',  category: 'infrastructure_failure',  tags: ['infrastructure', 'critical'] },
  { q: 'border wall fence deportation expulsion',     category: 'border_regimes',          tags: ['border', 'enforcement'] },
];

interface GdeltFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    name?: string;
    url?: string;
    avgTone?: number;
    date?: string;
    domain?: string;
    sourcecountry?: string;
    title?: string;
    shareimage?: string;
  };
}

interface GdeltGeoJson {
  type: 'FeatureCollection';
  features: GdeltFeature[];
}

function gdeltUrl(query: string): string {
  const q = encodeURIComponent(query);
  return `https://api.gdeltproject.org/api/v2/geo/geo?query=${q}&mode=pointdata&TIMESPAN=${TIMESPAN}&maxpoints=50&format=geojson`;
}

function toneToVerification(tone?: number): VerificationStatus {
  // GDELT avgTone: negative = conflict/crisis, positive = positive news
  // We use it as a confidence proxy, not editorial judgment
  if (tone == null) return 'unverified';
  return tone < -5 ? 'corroborated' : 'partly_verified';
}

function parseGdeltDate(raw?: string): string {
  if (!raw || raw.length < 8) return new Date().toISOString().slice(0, 10);
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

async function fetchCategory(
  q: string,
  category: string,
  tags: string[],
): Promise<Signal[]> {
  try {
    const res = await fetch(gdeltUrl(q), {
      headers: { 'User-Agent': 'ATLAS/1.0 (republic.suezcanal.xyz)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const geo = (await res.json()) as GdeltGeoJson;
    if (!geo.features?.length) return [];

    return geo.features
      .filter(f => f.geometry?.coordinates?.length === 2)
      .slice(0, 20)
      .map((f, i): Signal => {
        const p = f.properties;
        const [lng, lat] = f.geometry.coordinates;
        const date = parseGdeltDate(p.date);
        const title = p.title || p.name || `${category.replace(/_/g, ' ')} event`;
        const domain = p.domain ?? 'unknown source';
        const tone = p.avgTone;

        return {
          id: `gdelt:${category}:${Math.abs(lng * 100).toFixed(0)}:${Math.abs(lat * 100).toFixed(0)}:${date}:${i}`,
          type: 'SHORT_ALERT',
          category,
          tags: [...tags, 'live', 'gdelt', domain.replace(/\..+/, '')],
          title: title.slice(0, 120),
          summary: `${title}. Geolocated signal from global news monitoring (${domain}).`,
          whatHappened: title,
          location: {
            name: p.name || p.sourcecountry || 'Unknown',
            country: p.sourcecountry ?? null,
            region: null,
            coordinates: [lng, lat],
            confidence: 'medium',
          },
          date,
          lastUpdated: date,
          status: 'auto_collected',
          verification: toneToVerification(tone),
          sourceDiversity: ['single_source'],
          sourceCluster: [{
            outlet: domain,
            country: p.sourcecountry ?? null,
            region: null,
            perspectiveGroup: null,
            url: p.url ?? undefined,
            publishedAt: date,
            language: 'en',
            title: title.slice(0, 120),
            excerpt: null,
            sourceType: 'media',
            reliability: 'medium',
          }],
          perspectives: null,
          republicReading: null,
          methodNote: `Auto-ingested via GDELT GEO API. AvgTone: ${tone?.toFixed(1) ?? 'n/a'}. Coordinates geocoded by GDELT.`,
          links: p.url ? [{ to: p.url, relation: 'source_article' }] : [],
          score: Math.max(10, 50 + Math.round((tone ?? 0) * -1.5)),
          visible: true,
        };
      });
  } catch {
    return [];
  }
}

export async function fetchGdeltSignals(): Promise<Signal[]> {
  const cached = getCached<Signal[]>(CACHE_KEY);
  if (cached) return cached;

  // Parallel fetch all themes
  const results = await Promise.all(
    QUERIES.map(({ q, category, tags }) => fetchCategory(q, category, tags)),
  );

  // Deduplicate by proximity: signals within ~0.5° and same category merged
  const all = results.flat();
  const seen = new Set<string>();
  const deduped: Signal[] = [];

  for (const s of all) {
    const [lng, lat] = s.location.coordinates;
    const key = `${s.category}:${Math.round(lng * 2)}:${Math.round(lat * 2)}:${s.date}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(s);
    }
  }

  setCached(CACHE_KEY, deduped, TTL_MS);
  return deduped;
}
