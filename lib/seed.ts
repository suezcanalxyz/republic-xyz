import { readFileSync } from 'fs';
import path from 'path';
import seedData from './seed-data.json';
import { Signal, SignalType, VerificationStatus, SourceDiversity } from './types';

// Transform raw events.json format into Signal format.
// Seed data path: SITI/suezcanal.xyz/republic/atlas/data/events.json
// At build time / API time, we read from this relative path via process.cwd() or
// fall back to the bundled copy in lib/seed-data.json.

function deriveType(ev: Record<string, unknown>): SignalType {
  if (ev.status === 'published') {
    const links = ev.links as unknown[] | undefined;
    if (Array.isArray(links) && links.length > 0) return 'SEED';
    return 'SEED'; // All published events are Seeds
  }
  if (ev.status === 'needs_review') return 'MEDIUM';
  return 'SHORT_ALERT';
}

function deriveVerification(ev: Record<string, unknown>): VerificationStatus {
  if (ev.status === 'published') {
    const sc = ev.sourceCluster as unknown[] | undefined;
    if (Array.isArray(sc) && sc.length >= 2) return 'corroborated';
    if (Array.isArray(sc) && sc.length === 1) return 'partly_verified';
    return 'partly_verified';
  }
  return 'unverified';
}

// Canonical institutional references per category — fallback when sourceCluster is empty
const CATEGORY_DEFAULT_SOURCES: Record<string, Signal['sourceCluster']> = {
  remote_warfare: [
    { outlet: 'ACLED', country: null, region: 'institutional', perspectiveGroup: null, url: 'https://acleddata.com', publishedAt: null, language: 'en', title: 'ACLED — Armed Conflict Location & Event Data', excerpt: 'Structured event-level conflict data used as primary reference.', sourceType: 'institutional', reliability: 'high' },
    { outlet: 'UNOCHA', country: null, region: 'institutional', perspectiveGroup: null, url: 'https://www.unocha.org', publishedAt: null, language: 'en', title: 'UNOCHA — Humanitarian situation reports', excerpt: null, sourceType: 'institutional', reliability: 'high' },
  ],
  migration_rescue: [
    { outlet: 'UNHCR', country: null, region: 'institutional', perspectiveGroup: null, url: 'https://data.unhcr.org', publishedAt: null, language: 'en', title: 'UNHCR — Displacement & arrivals data portal', excerpt: 'Arrivals, dead and missing along migration routes.', sourceType: 'institutional', reliability: 'high' },
    { outlet: 'IOM Missing Migrants Project', country: null, region: 'institutional', perspectiveGroup: null, url: 'https://missingmigrants.iom.int', publishedAt: null, language: 'en', title: 'IOM — Missing Migrants Project', excerpt: 'Deaths and disappearances along migration routes.', sourceType: 'institutional', reliability: 'high' },
  ],
  maritime_routes: [
    { outlet: 'IMB Piracy Reporting Centre', country: null, region: 'institutional', perspectiveGroup: null, url: 'https://www.icc-ccs.org/piracy-reporting-centre', publishedAt: null, language: 'en', title: 'IMB — Maritime security & piracy reports', excerpt: null, sourceType: 'institutional', reliability: 'high' },
    { outlet: 'UNCTAD', country: null, region: 'institutional', perspectiveGroup: null, url: 'https://unctad.org/topic/transport-and-trade-logistics/review-of-maritime-transport', publishedAt: null, language: 'en', title: 'UNCTAD — Review of Maritime Transport', excerpt: null, sourceType: 'institutional', reliability: 'high' },
  ],
  arms_trade: [
    { outlet: 'SIPRI Arms Transfers Database', country: 'Sweden', region: 'institutional', perspectiveGroup: null, url: 'https://www.sipri.org/databases/armstransfers', publishedAt: null, language: 'en', title: 'SIPRI — Arms Transfers Database', excerpt: 'Register of major conventional arms deliveries by supplier and recipient.', sourceType: 'institutional', reliability: 'high' },
    { outlet: 'UN Register of Conventional Arms', country: null, region: 'institutional', perspectiveGroup: null, url: 'https://www.unroca.org', publishedAt: null, language: 'en', title: 'UNROCA — state-reported transfers', excerpt: null, sourceType: 'government', reliability: 'medium' },
  ],
  energy_extraction: [
    { outlet: 'IEA', country: null, region: 'institutional', perspectiveGroup: null, url: 'https://www.iea.org', publishedAt: null, language: 'en', title: 'IEA — Energy data and statistics', excerpt: null, sourceType: 'institutional', reliability: 'high' },
    { outlet: 'Global Energy Monitor', country: null, region: 'institutional', perspectiveGroup: null, url: 'https://globalenergymonitor.org', publishedAt: null, language: 'en', title: 'Global Energy Monitor — fossil fuel infrastructure tracker', excerpt: null, sourceType: 'institutional', reliability: 'high' },
  ],
  canal_politics: [
    { outlet: 'Suez Canal Authority', country: 'Egypt', region: 'institutional', perspectiveGroup: null, url: 'https://www.suezcanal.gov.eg', publishedAt: null, language: 'en', title: 'SCA — official statistics and transit data', excerpt: null, sourceType: 'institutional', reliability: 'high' },
  ],
  climate_fire_desert: [
    { outlet: 'Copernicus Climate Change Service', country: null, region: 'institutional', perspectiveGroup: null, url: 'https://climate.copernicus.eu', publishedAt: null, language: 'en', title: 'Copernicus C3S — climate monitoring', excerpt: null, sourceType: 'institutional', reliability: 'high' },
    { outlet: 'IPCC', country: null, region: 'institutional', perspectiveGroup: null, url: 'https://www.ipcc.ch', publishedAt: null, language: 'en', title: 'IPCC — Assessment reports', excerpt: null, sourceType: 'institutional', reliability: 'high' },
  ],
  infrastructure_failure: [
    { outlet: 'UNOCHA', country: null, region: 'institutional', perspectiveGroup: null, url: 'https://www.unocha.org', publishedAt: null, language: 'en', title: 'UNOCHA — Infrastructure and humanitarian data', excerpt: null, sourceType: 'institutional', reliability: 'high' },
  ],
  tech_surveillance: [
    { outlet: 'Access Now', country: null, region: 'institutional', perspectiveGroup: null, url: 'https://www.accessnow.org/keepiton', publishedAt: null, language: 'en', title: 'Access Now — #KeepItOn internet shutdown tracker', excerpt: null, sourceType: 'institutional', reliability: 'high' },
    { outlet: 'Citizen Lab', country: 'Canada', region: 'institutional', perspectiveGroup: null, url: 'https://citizenlab.ca', publishedAt: null, language: 'en', title: 'Citizen Lab — digital surveillance research', excerpt: null, sourceType: 'institutional', reliability: 'high' },
  ],
  border_regimes: [
    { outlet: 'UNHCR', country: null, region: 'institutional', perspectiveGroup: null, url: 'https://data.unhcr.org', publishedAt: null, language: 'en', title: 'UNHCR — border and asylum data', excerpt: null, sourceType: 'institutional', reliability: 'high' },
    { outlet: 'Border Violence Monitoring Network', country: null, region: 'institutional', perspectiveGroup: null, url: 'https://borderviolence.eu', publishedAt: null, language: 'en', title: 'BVMN — pushback documentation', excerpt: null, sourceType: 'institutional', reliability: 'high' },
  ],
  satellite_signals: [
    { outlet: 'Copernicus Emergency Management Service', country: null, region: 'institutional', perspectiveGroup: null, url: 'https://emergency.copernicus.eu', publishedAt: null, language: 'en', title: 'Copernicus EMS — satellite imagery and crisis mapping', excerpt: null, sourceType: 'institutional', reliability: 'high' },
    { outlet: 'Planet Labs', country: 'United States', region: 'institutional', perspectiveGroup: null, url: 'https://www.planet.com', publishedAt: null, language: 'en', title: 'Planet Labs — daily satellite imagery', excerpt: null, sourceType: 'institutional', reliability: 'high' },
  ],
  gov_docs: [
    { outlet: 'UN Documentation Centre', country: null, region: 'institutional', perspectiveGroup: null, url: 'https://www.un.org/en/library/', publishedAt: null, language: 'en', title: 'UN Documentation — resolutions and reports', excerpt: null, sourceType: 'government', reliability: 'high' },
  ],
};

function deriveSourceDiversity(ev: Record<string, unknown>): SourceDiversity[] {
  const sc = ev.sourceCluster as Array<{ perspectiveGroup?: string }> | undefined;
  if (!Array.isArray(sc) || sc.length === 0) return ['single_source'];
  const groups = new Set(sc.map(s => s.perspectiveGroup).filter(Boolean));
  const diversity: SourceDiversity[] = [];
  if (groups.size >= 3) diversity.push('cross_region');
  else if (groups.size === 2) diversity.push('multi_same_region');
  else diversity.push('single_source');
  if (groups.has('local')) diversity.push('local_available');
  return diversity;
}

function scoreSignal(ev: Record<string, unknown>): number {
  let score = 0;
  if (ev.status === 'published') score += 30;
  if (ev.status === 'auto_collected') score += 10;
  const sc = ev.sourceCluster as unknown[] | undefined;
  score += Math.min((Array.isArray(sc) ? sc.length : 0) * 5, 20);
  const persp = ev.perspectives as Record<string, unknown> | null | undefined;
  if (persp) score += Object.keys(persp).length * 3;
  if (ev.republicReading) score += 10;
  const links = ev.links as unknown[] | undefined;
  score += Math.min((Array.isArray(links) ? links.length : 0) * 5, 15);
  const conf = ev.confidence as string | undefined;
  if (conf === 'high') score += 10;
  else if (conf === 'medium') score += 5;
  return Math.min(score, 100);
}

export function transformEvents(raw: Record<string, unknown>[]): Signal[] {
  return raw
    .filter(ev => ev.category !== 'republic_works' && ev.visible !== false)
    .map(ev => {
      const loc = ev.location as {
        name: string;
        country?: string | null;
        region?: string | null;
        coordinates: [number, number];
        confidence: 'high' | 'medium' | 'low';
      };
      const persp = ev.perspectives as Record<string, { frame: string; sources: string[] }> | null;

      return {
        id: ev.id as string,
        type: deriveType(ev),
        category: ev.category as string,
        tags: (ev.tags as string[]) || [],
        title: ev.title as string,
        summary: ev.summary as string,
        whatHappened: ev.whatHappened as string | undefined,
        location: {
          name: loc.name,
          country: loc.country,
          region: loc.region,
          coordinates: loc.coordinates,
          confidence: loc.confidence,
        },
        date: ev.date as string,
        lastUpdated: (ev.lastUpdated || ev.date) as string,
        status: ev.status as string,
        verification: deriveVerification(ev),
        sourceDiversity: deriveSourceDiversity(ev),
        sourceCluster: (() => {
          const sc = (ev.sourceCluster as Signal['sourceCluster']) || [];
          if (sc.length > 0) return sc;
          return CATEGORY_DEFAULT_SOURCES[ev.category as string] || [
            { outlet: 'UNOCHA', country: null, region: 'institutional', perspectiveGroup: null, url: 'https://www.unocha.org', publishedAt: null, language: 'en', title: 'UNOCHA — Situation reports', excerpt: null, sourceType: 'institutional', reliability: 'medium' },
          ];
        })(),
        perspectives: persp
          ? Object.fromEntries(
              Object.entries(persp).map(([k, v]) => [
                k,
                { region: k as Signal['perspectives'] extends Record<string, infer V> ? V extends { region: infer R } ? R : never : never, frame: v.frame, sources: v.sources },
              ])
            )
          : null,
        republicReading: ev.republicReading as string | null | undefined,
        methodNote: null,
        links: ev.links as Signal['links'],
        score: scoreSignal(ev),
        visible: true,
      } as Signal;
    });
}

export function loadSeedSignals(): Signal[] {
  try {
    const seedPath = path.resolve(process.cwd(), '../suezcanal.xyz/republic/atlas/data/events.json');
    const raw = JSON.parse(readFileSync(seedPath, 'utf-8')) as { events?: Record<string, unknown>[] };
    return transformEvents(raw.events || []);
  } catch {
    return transformEvents((seedData as { events?: Record<string, unknown>[] }).events || []);
  }
}
