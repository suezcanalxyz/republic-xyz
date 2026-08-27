/**
 * RSS news ingestion — real articles with URLs, titles, thumbnails.
 * Sources: Reuters, AP, Al Jazeera, UN News, BBC World, OCHA, ACLED.
 *
 * Geocoding strategy:
 *   1. Extract place name from title/description using hotspot dictionary (instant)
 *   2. If NIM key set, use Llama to geocode unknown locations (async, cached)
 *   3. Skip articles where no location can be determined
 */

import type { Signal } from '../types';
import { getCached, setCached } from '../cache';
import { nimChat, extractJson } from '../nim';

const CACHE_KEY = 'rss:news:v2';
const TTL_MS = 60 * 60 * 1000; // 1h — balanced freshness vs fetch cost

// ─── RSS source definitions ───────────────────────────────────────────────────

interface RssSource {
  name: string;
  url: string;
  country: string | null;
  reliability: 'high' | 'medium';
  defaultCategory: string;
}

const SOURCES: RssSource[] = [
  { name: 'Reuters',      url: 'https://feeds.reuters.com/reuters/worldNews',         country: 'UK',  reliability: 'high',   defaultCategory: 'remote_warfare' },
  { name: 'AP News',      url: 'https://feeds.apnews.com/apnews/World',               country: 'US',  reliability: 'high',   defaultCategory: 'remote_warfare' },
  { name: 'Al Jazeera',   url: 'https://www.aljazeera.com/xml/rss/all.xml',           country: 'QA',  reliability: 'high',   defaultCategory: 'remote_warfare' },
  { name: 'UN News',      url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', country: null, reliability: 'high', defaultCategory: 'gov_docs' },
  { name: 'BBC World',    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',         country: 'UK',  reliability: 'high',   defaultCategory: 'remote_warfare' },
  { name: 'OCHA ReliefWeb', url: 'https://reliefweb.int/updates/rss.xml',             country: null,  reliability: 'high',   defaultCategory: 'migration_rescue' },
];

// ─── Hotspot geocoding dictionary ────────────────────────────────────────────
// Covers ~85% of breaking geopolitical news without NIM call

const HOTSPOTS: Array<{ terms: string[]; coords: [number, number]; name: string; country: string | null; category?: string }> = [
  { terms: ['gaza', 'rafah', 'khan younis'],        coords: [34.3, 31.4],  name: 'Gaza Strip',         country: 'Palestine', category: 'remote_warfare' },
  { terms: ['ukraine', 'kyiv', 'kharkiv', 'donetsk', 'zaporizhzhia', 'kursk'], coords: [32.0, 49.0], name: 'Ukraine', country: 'Ukraine', category: 'remote_warfare' },
  { terms: ['russia', 'moscow', 'kremlin'],         coords: [37.6, 55.7],  name: 'Russia',             country: 'Russia' },
  { terms: ['sudan', 'khartoum', 'darfur', 'rsf'],  coords: [32.5, 15.5],  name: 'Sudan',              country: 'Sudan',     category: 'remote_warfare' },
  { terms: ['red sea', 'houthi', 'bab el-mandeb', 'yemen'], coords: [43.5, 14.0], name: 'Red Sea / Yemen', country: 'Yemen', category: 'maritime_routes' },
  { terms: ['iran', 'tehran', 'isfahan'],           coords: [51.4, 35.7],  name: 'Iran',               country: 'Iran' },
  { terms: ['israel', 'tel aviv', 'jerusalem'],     coords: [34.8, 31.5],  name: 'Israel',             country: 'Israel' },
  { terms: ['west bank', 'ramallah', 'settler'],    coords: [35.3, 31.9],  name: 'West Bank',          country: 'Palestine', category: 'border_regimes' },
  { terms: ['lebanon', 'beirut', 'hezbollah'],      coords: [35.5, 33.9],  name: 'Lebanon',            country: 'Lebanon',   category: 'remote_warfare' },
  { terms: ['syria', 'damascus', 'aleppo'],         coords: [38.0, 35.0],  name: 'Syria',              country: 'Syria',     category: 'remote_warfare' },
  { terms: ['iraq', 'baghdad', 'mosul'],            coords: [44.4, 33.3],  name: 'Iraq',               country: 'Iraq',      category: 'remote_warfare' },
  { terms: ['taiwan', 'taipei', 'strait'],          coords: [120.9, 23.7], name: 'Taiwan',             country: 'Taiwan',    category: 'maritime_routes' },
  { terms: ['south china sea', 'spratly', 'paracel'], coords: [113.0, 13.0], name: 'South China Sea',  country: null,        category: 'maritime_routes' },
  { terms: ['north korea', 'pyongyang', 'dprk'],   coords: [125.7, 39.0], name: 'North Korea',        country: 'North Korea', category: 'arms_trade' },
  { terms: ['mali', 'bamako', 'sahel'],             coords: [-8.0, 17.0],  name: 'Mali / Sahel',       country: 'Mali',      category: 'remote_warfare' },
  { terms: ['burkina faso', 'ouagadougou'],         coords: [-1.5, 12.4],  name: 'Burkina Faso',       country: 'Burkina Faso', category: 'remote_warfare' },
  { terms: ['niger', 'niamey'],                     coords: [2.1, 13.5],   name: 'Niger',              country: 'Niger',     category: 'remote_warfare' },
  { terms: ['somalia', 'mogadishu', 'al-shabaab'],  coords: [45.3, 2.0],   name: 'Somalia',            country: 'Somalia',   category: 'remote_warfare' },
  { terms: ['ethiopia', 'addis ababa', 'tigray', 'amhara'], coords: [38.7, 9.0], name: 'Ethiopia', country: 'Ethiopia', category: 'remote_warfare' },
  { terms: ['myanmar', 'burma', 'naypyidaw', 'yangon'], coords: [96.1, 19.7], name: 'Myanmar',     country: 'Myanmar',   category: 'remote_warfare' },
  { terms: ['afghanistan', 'kabul', 'taliban'],    coords: [69.2, 34.5],  name: 'Afghanistan',        country: 'Afghanistan', category: 'remote_warfare' },
  { terms: ['haiti', 'port-au-prince'],             coords: [-72.3, 18.5], name: 'Haiti',              country: 'Haiti',     category: 'remote_warfare' },
  { terms: ['venezuela', 'caracas'],                coords: [-66.9, 10.5], name: 'Venezuela',          country: 'Venezuela', category: 'border_regimes' },
  { terms: ['colombia', 'bogota', 'farc'],          coords: [-74.1, 4.7],  name: 'Colombia',           country: 'Colombia',  category: 'remote_warfare' },
  { terms: ['mediterranean', 'lampedusa', 'crossing', 'migrant boat'], coords: [13.0, 35.5], name: 'Mediterranean', country: null, category: 'migration_rescue' },
  { terms: ['english channel', 'small boat', 'dover'], coords: [1.5, 51.0], name: 'English Channel',  country: null,        category: 'migration_rescue' },
  { terms: ['libya', 'tripoli', 'benghazi'],        coords: [13.2, 32.9],  name: 'Libya',              country: 'Libya',     category: 'migration_rescue' },
  { terms: ['tunisia', 'sfax', 'tunis'],            coords: [10.2, 36.8],  name: 'Tunisia',            country: 'Tunisia',   category: 'migration_rescue' },
  { terms: ['suez canal', 'suez'],                  coords: [32.6, 30.0],  name: 'Suez Canal',         country: 'Egypt',     category: 'canal_politics' },
  { terms: ['strait of hormuz', 'hormuz', 'oman gulf'], coords: [56.5, 26.5], name: 'Strait of Hormuz', country: null,    category: 'maritime_routes' },
  { terms: ['arctic', 'northern sea route', 'greenland ice'], coords: [25.0, 75.0], name: 'Arctic', country: null,          category: 'climate_fire_desert' },
  { terms: ['amazon', 'deforestation', 'brazil forest'], coords: [-60.0, -5.0], name: 'Amazon',    country: 'Brazil',    category: 'climate_fire_desert' },
  { terms: ['wildfire', 'forest fire', 'bushfire'], coords: [0.0, 20.0],   name: 'Global wildfire',    country: null,        category: 'climate_fire_desert' },
  { terms: ['flood', 'inundation', 'cyclone'],      coords: [90.0, 20.0],  name: 'Flood zone',         country: null,        category: 'climate_fire_desert' },
  { terms: ['congo', 'drc', 'm23', 'kinshasa', 'goma'], coords: [26.0, -4.0], name: 'DRC',           country: 'DRC',       category: 'remote_warfare' },
  { terms: ['mozambique', 'cabo delgado', 'pemba'], coords: [40.5, -13.0], name: 'Mozambique',         country: 'Mozambique', category: 'remote_warfare' },
  { terms: ['china', 'beijing', 'pla', 'xinjiang'], coords: [116.4, 39.9], name: 'China',              country: 'China' },
  { terms: ['pakistan', 'islamabad', 'karachi'],    coords: [67.0, 30.0],  name: 'Pakistan',           country: 'Pakistan' },
  { terms: ['india', 'new delhi', 'kashmir'],       coords: [77.1, 28.6],  name: 'India',              country: 'India' },
  { terms: ['nato', 'alliance', 'eastern flank'],   coords: [20.0, 52.0],  name: 'NATO Eastern Flank', country: null },
  { terms: ['arms', 'weapons transfer', 'military aid'], coords: [0.0, 30.0], name: 'Arms transfer',  country: null,        category: 'arms_trade' },
  { terms: ['sanctions', 'embargo'],                coords: [0.0, 25.0],   name: 'Sanctions',          country: null,        category: 'gov_docs' },
  { terms: ['cyber attack', 'hack', 'ransomware'],  coords: [0.0, 40.0],   name: 'Cyberspace',         country: null,        category: 'tech_surveillance' },
  { terms: ['drone strike', 'uav', 'unmanned'],     coords: [45.0, 25.0],  name: 'Drone operations',   country: null,        category: 'remote_warfare' },
  { terms: ['gas pipeline', 'nord stream', 'energy infrastructure'], coords: [20.0, 55.0], name: 'Energy infrastructure', country: null, category: 'energy_extraction' },
  { terms: ['oil price', 'opec', 'crude'],          coords: [47.0, 24.0],  name: 'Gulf / OPEC',        country: null,        category: 'energy_extraction' },
];

function geocodeFromText(text: string): { coords: [number, number]; name: string; country: string | null; category?: string } | null {
  const lower = text.toLowerCase();
  for (const h of HOTSPOTS) {
    if (h.terms.some(t => lower.includes(t))) {
      return { coords: h.coords, name: h.name, country: h.country, category: h.category };
    }
  }
  return null;
}

// ─── RSS parsing ─────────────────────────────────────────────────────────────

interface ParsedItem {
  title: string;
  url: string;
  description: string;
  pubDate: string;
  imageUrl: string | null;
}

function parseRssItems(xml: string): ParsedItem[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return items.slice(0, 20).map(item => {
    const title = (item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] ?? '').trim();
    const link  = (item.match(/<link[^>]*>([^<]+)<\/link>/)?.[1] ?? item.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? '').trim();
    const desc  = (item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] ?? '')
      .replace(/<[^>]+>/g, '').trim().slice(0, 300);
    const pubDate = item.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1]?.trim() ?? '';
    const imageUrl =
      item.match(/<media:content[^>]+url="([^"]+)"/)?.[1] ??
      item.match(/<enclosure[^>]+url="([^"]+)"[^>]+type="image/)?.[1] ??
      item.match(/<media:thumbnail[^>]+url="([^"]+)"/)?.[1] ??
      null;
    return { title, url: link, description: desc, pubDate, imageUrl };
  }).filter(i => i.title && i.url);
}

// ─── NIM geocoding fallback ──────────────────────────────────────────────────

interface GeoResult { location: string; country: string | null; lat: number; lng: number; category: string }

async function nimGeocode(title: string, description: string): Promise<GeoResult | null> {
  const response = await nimChat([
    { role: 'system', content: 'Extract geolocation from news headline. Reply ONLY with JSON: {"location":"place name","country":"ISO country or null","lat":number,"lng":number,"category":"one of: remote_warfare|migration_rescue|maritime_routes|energy_extraction|climate_fire_desert|tech_surveillance|arms_trade|canal_politics|infrastructure_failure|border_regimes|satellite_signals|gov_docs"}' },
    { role: 'user', content: `Headline: ${title}\nDescription: ${description}` },
  ], { temperature: 0.1, maxTokens: 150 });
  if (!response) return null;
  return extractJson<GeoResult>(response);
}

const nimGeoCache = new Map<string, GeoResult | null>();

async function getGeocode(title: string, description: string): Promise<{ coords: [number, number]; name: string; country: string | null; category?: string } | null> {
  const dict = geocodeFromText(title + ' ' + description);
  if (dict) return dict;

  const cacheKey = title.slice(0, 80);
  if (nimGeoCache.has(cacheKey)) {
    const r = nimGeoCache.get(cacheKey)!;
    return r ? { coords: [r.lng, r.lat], name: r.location, country: r.country, category: r.category } : null;
  }

  const result = await nimGeocode(title, description);
  nimGeoCache.set(cacheKey, result);
  if (!result || isNaN(result.lat) || isNaN(result.lng)) return null;
  return { coords: [result.lng, result.lat], name: result.location, country: result.country, category: result.category };
}

// ─── Main fetch ──────────────────────────────────────────────────────────────

async function fetchSource(src: RssSource): Promise<Signal[]> {
  let xml: string;
  try {
    const res = await fetch(src.url, {
      headers: { 'User-Agent': 'ATLAS/1.0 (republic.suezcanal.xyz)' },
      signal: AbortSignal.timeout(9_000),
    });
    if (!res.ok) return [];
    xml = await res.text();
  } catch {
    return [];
  }

  const items = parseRssItems(xml);
  const signals: Signal[] = [];

  for (const item of items.slice(0, 12)) {
    const geo = await getGeocode(item.title, item.description);
    if (!geo) continue;

    const date = item.pubDate
      ? new Date(item.pubDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const fetchedAt = new Date().toISOString().slice(0, 10);

    const id = `rss:${src.name.replace(/\s/g, '')}:${Buffer.from(item.url).toString('base64').slice(0, 16)}`;

    signals.push({
      id,
      type: 'SHORT_ALERT',
      category: geo.category ?? src.defaultCategory,
      tags: ['live', 'rss', src.name.toLowerCase().replace(/\s/g, '-')],
      title: item.title.slice(0, 120),
      summary: item.description || item.title,
      whatHappened: item.description || item.title,
      location: {
        name: geo.name,
        country: geo.country,
        region: null,
        coordinates: geo.coords,
        confidence: 'medium',
      },
      date,
      lastUpdated: fetchedAt,
      status: 'auto_collected',
      verification: 'partly_verified',
      sourceDiversity: ['single_source'],
      sourceCluster: [{
        outlet: src.name,
        country: src.country,
        region: null,
        perspectiveGroup: null,
        url: item.url,
        publishedAt: date,
        language: 'en',
        title: item.title.slice(0, 120),
        excerpt: item.description.slice(0, 200) || null,
        imageUrl: item.imageUrl,
        sourceType: 'media',
        reliability: src.reliability,
      }],
      perspectives: null,
      republicReading: null,
      methodNote: `RSS · ${src.name} · ${date}`,
      links: [{ to: item.url, relation: 'source_article' }],
      score: 45,
      visible: true,
    });
  }

  return signals;
}

export async function fetchRssSignals(): Promise<Signal[]> {
  const cached = getCached<Signal[]>(CACHE_KEY);
  if (cached) return cached;

  const results = await Promise.all(SOURCES.map(s => fetchSource(s)));
  const all = results.flat();

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduped = all.filter(s => {
    const url = s.links?.[0]?.to ?? s.id;
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });

  setCached(CACHE_KEY, deduped, TTL_MS);
  return deduped;
}
