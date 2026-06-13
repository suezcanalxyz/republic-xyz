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
        sourceCluster: (ev.sourceCluster as Signal['sourceCluster']) || [],
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
