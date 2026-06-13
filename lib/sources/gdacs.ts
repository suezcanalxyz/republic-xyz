import type { Signal } from '../types';
import { getCached, setCached } from '../cache';

const GDACS_URL = 'https://www.gdacs.org/xml/rss.xml';
const CACHE_KEY = 'gdacs:rss';
const TTL_MS = 30 * 60 * 1000; // 30 min

type GdacsType = 'EQ' | 'FL' | 'TC' | 'VO' | 'WF' | 'DR' | string;

function field(xml: string, tag: string): string {
  return xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`))?.[1]?.trim() ?? '';
}

function attr(xml: string, tag: string, name: string): string {
  return xml.match(new RegExp(`<${tag}[^>]* ${name}="([^"]*)"`)) ?.[1]?.trim() ?? '';
}

function mapCategory(t: GdacsType): string {
  return t === 'EQ' || t === 'VO' ? 'infrastructure_failure' : 'climate_fire_desert';
}

export async function fetchGdacsSignals(): Promise<Signal[]> {
  const cached = getCached<Signal[]>(CACHE_KEY);
  if (cached) return cached;

  let xml: string;
  try {
    const res = await fetch(GDACS_URL, {
      headers: { 'User-Agent': 'ATLAS/1.0 (republic.suezcanal.xyz)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    xml = await res.text();
  } catch {
    return [];
  }

  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  const signals: Signal[] = [];
  for (let i = 0; i < Math.min(items.length, 50); i++) {
    const item = items[i];

    // GDACS uses <geo:lat>/<geo:long> or <georss:point>lat lon</georss:point>
    let lat: number, lng: number;
    const georss = field(item, 'georss:point');
    if (georss) {
      const [a, b] = georss.split(/\s+/).map(Number);
      lat = a; lng = b;
    } else {
      lat = parseFloat(field(item, 'geo:lat'));
      lng = parseFloat(field(item, 'geo:long'));
    }
    if (isNaN(lat) || isNaN(lng)) continue;

    const title = field(item, 'title');
    const country = field(item, 'gdacs:country');
    const eventType = field(item, 'gdacs:eventtype') || 'EQ';
    const severity = attr(item, 'gdacs:severity', 'value');
    const pubDate = field(item, 'pubDate');
    const link = field(item, 'link');
    const guid = field(item, 'guid');
    const description = field(item, 'description').replace(/<[^>]+>/g, '').slice(0, 400);

    const date = pubDate ? new Date(pubDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const isHigh = severity === 'Red';
    const category = mapCategory(eventType);

    signals.push({
      id: `gdacs:${guid.replace(/\D/g, '') || i}`,
      type: isHigh ? 'SEED' : 'SHORT_ALERT',
      category,
      tags: [eventType.toLowerCase(), (severity ?? 'unknown').toLowerCase(), 'live', 'gdacs'],
      title: title || `${eventType} event`,
      summary: description || `${eventType} event reported via GDACS.`,
      whatHappened: description || undefined,
      location: {
        name: country || 'Unknown',
        country: country || null,
        region: null,
        coordinates: [lng, lat],
        confidence: 'high',
      },
      date,
      lastUpdated: date,
      status: 'auto_collected',
      verification: 'corroborated',
      sourceDiversity: ['single_source'],
      sourceCluster: [{
        outlet: 'GDACS',
        country: null,
        region: 'institutional',
        perspectiveGroup: null,
        url: link || 'https://www.gdacs.org',
        publishedAt: date,
        language: 'en',
        title: 'GDACS — Global Disaster Alert and Coordination System',
        excerpt: 'UN-affiliated automated alert from real-time global disaster monitoring.',
        sourceType: 'institutional',
        reliability: 'high',
      }],
      perspectives: null,
      republicReading: null,
      methodNote: 'Auto-ingested from GDACS RSS. Coordinates from official event record.',
      links: [],
      score: isHigh ? 55 : 32,
      visible: true,
    });
  }

  setCached(CACHE_KEY, signals, TTL_MS);
  return signals;
}
