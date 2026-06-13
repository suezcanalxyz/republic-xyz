import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';
import { transformEvents } from '@/lib/seed';
import { Signal, GlobeQueryParams, ClusteredSignal } from '@/lib/types';

// Load seed data — prefers DB in production, falls back to local events.json
function loadSeedSignals(): Signal[] {
  try {
    const seedPath = path.resolve(process.cwd(), '../suezcanal.xyz/republic/atlas/data/events.json');
    const raw = JSON.parse(readFileSync(seedPath, 'utf-8'));
    return transformEvents(raw.events || []);
  } catch {
    // Fallback: empty; add bundled seed-data.json here if needed
    return [];
  }
}

function clusterize(signals: Signal[], zoom: number): ClusteredSignal[] {
  const cellDeg = 40 / Math.pow(2, Math.max(0, zoom));
  const cells = new Map<string, Signal[]>();

  for (const s of signals) {
    const [lng, lat] = s.location.coordinates;
    const key = `${Math.floor(lng / cellDeg)}:${Math.floor(lat / cellDeg)}`;
    const bucket = cells.get(key) ?? [];
    bucket.push(s);
    cells.set(key, bucket);
  }

  const result: ClusteredSignal[] = [];
  for (const [, bucket] of cells) {
    const centLng = bucket.reduce((a, s) => a + s.location.coordinates[0], 0) / bucket.length;
    const centLat = bucket.reduce((a, s) => a + s.location.coordinates[1], 0) / bucket.length;
    const seedCount = bucket.filter(s => s.type === 'SEED').length;
    const disputedCount = bucket.filter(s => s.verification === 'disputed').length;
    const categories = [...new Set(bucket.map(s => s.category))];
    const catFreq = new Map<string, number>();
    for (const s of bucket) catFreq.set(s.category, (catFreq.get(s.category) ?? 0) + 1);
    const dominantCategory = [...catFreq.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const latestUpdate = bucket.map(s => s.lastUpdated).sort().at(-1) ?? '';

    result.push({
      id: bucket.length === 1 ? bucket[0].id : `cluster:${centLng.toFixed(2)}:${centLat.toFixed(2)}`,
      lat: centLat,
      lng: centLng,
      count: bucket.length,
      seedCount,
      disputedCount,
      satelliteCount: 0,
      categories,
      dominantCategory,
      latestUpdate,
      signals: bucket.length <= 5 ? bucket : undefined,
      isCluster: bucket.length > 1,
    });
  }

  return result;
}

function parseTimeWindow(tw: string): Date | null {
  const now = new Date();
  const match = tw.match(/^(\d+)([dmy])$/);
  if (!match) return null;
  const n = parseInt(match[1]);
  const unit = match[2];
  if (unit === 'd') now.setDate(now.getDate() - n);
  else if (unit === 'm') now.setMonth(now.getMonth() - n);
  else if (unit === 'y') now.setFullYear(now.getFullYear() - n);
  return now;
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const params: GlobeQueryParams = {
    zoom: parseFloat(p.get('zoom') ?? '2'),
    timeWindow: p.get('timeWindow') ?? 'all',
    layers: p.get('layers') ?? '',
    mode: p.get('mode') ?? 'event',
    confidence: p.get('confidence') ?? '',
    limit: parseInt(p.get('limit') ?? '500'),
    bbox: p.get('bbox') ?? undefined,
  };

  // TODO: When DB is available, query db.signal.findMany() with filters
  // For now: serve from seed JSON
  let signals = loadSeedSignals();

  // Time filter
  if (params.timeWindow && params.timeWindow !== 'all') {
    const cutoff = parseTimeWindow(params.timeWindow);
    if (cutoff) {
      signals = signals.filter(s => new Date(s.lastUpdated) >= cutoff);
    }
  }

  // Layer filter (category-based)
  if (params.layers) {
    const activeLayers = params.layers.split(',').filter(Boolean);
    if (activeLayers.length > 0) {
      signals = signals.filter(s => activeLayers.includes(s.category));
    }
  }

  // Confidence filter
  if (params.confidence === 'high') {
    signals = signals.filter(s =>
      s.verification === 'verified' || s.verification === 'corroborated'
    );
  }

  // BBOX spatial filter
  if (params.bbox) {
    const [minLng, minLat, maxLng, maxLat] = params.bbox.split(',').map(Number);
    if (!isNaN(minLng)) {
      signals = signals.filter(s => {
        const [lng, lat] = s.location.coordinates;
        return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
      });
    }
  }

  const zoom = params.zoom ?? 2;
  const clustered = clusterize(signals, zoom);

  return NextResponse.json(
    { signals: clustered, total: signals.length, zoom },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  );
}
