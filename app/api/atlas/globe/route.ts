import { NextRequest, NextResponse } from 'next/server';
import { loadSeedSignals } from '@/lib/seed';
import { fetchGdacsSignals } from '@/lib/sources/gdacs';
import { fetchGdeltSignals } from '@/lib/sources/gdelt';
import { fetchRssSignals } from '@/lib/sources/rss-news';
import { getGeneratedSignals } from '@/lib/sources/nim-generator';
import { rankSignals, filterSignals } from '@/lib/sources/signal-ranker';
import { getCached } from '@/lib/cache';
import { PIPELINE_CACHE_KEY } from '@/lib/pipeline/enrichment-pipeline';
import { Signal, GlobeQueryParams, ClusteredSignal } from '@/lib/types';

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

  // Use pipeline cache when warm (populated by cron enrichment run)
  // Fall back to raw merge + deterministic ranking when cache is cold
  const pipelineCached = await getCached<Signal[]>(PIPELINE_CACHE_KEY);

  let signals: Signal[];
  if (pipelineCached) {
    signals = pipelineCached;
  } else {
    const [seedSignals, gdacsSignals, gdeltSignals, rssSignals, nimSignals] = await Promise.all([
      Promise.resolve(loadSeedSignals()),
      fetchGdacsSignals(),
      fetchGdeltSignals(),
      fetchRssSignals(),
      getGeneratedSignals(),
    ]);
    const seedIds = new Set(seedSignals.map(s => s.id));
    const liveIds = new Set([...gdacsSignals, ...gdeltSignals, ...rssSignals].map(s => s.id));
    const merged: Signal[] = [
      ...seedSignals,
      ...gdacsSignals.filter(s => !seedIds.has(s.id)),
      ...gdeltSignals.filter(s => !seedIds.has(s.id)),
      ...rssSignals.filter(s => !seedIds.has(s.id) && !liveIds.has(s.id)),
      ...nimSignals.filter(s => !seedIds.has(s.id) && !liveIds.has(s.id)),
    ];
    signals = rankSignals(filterSignals(merged));
  }

  // Mode filter — each mode surfaces a different slice of the signal graph
  if (params.mode && params.mode !== 'event') {
    switch (params.mode) {
      case 'evidence':
        signals = signals.filter(s => s.verification === 'corroborated' || s.verification === 'verified');
        break;
      case 'dispute':
        signals = signals.filter(s =>
          s.verification === 'disputed' || s.verification === 'unverified' || s.verification === 'low_confidence'
        );
        break;
      case 'investigation':
        signals = signals.filter(s => s.type === 'SEED');
        break;
      case 'narrative':
        signals = signals.filter(s => s.perspectives != null && Object.keys(s.perspectives).length > 0);
        break;
      case 'infrastructure':
        signals = signals.filter(s => s.category === 'infrastructure_failure' || s.category === 'energy_extraction');
        break;
    }
  }

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
  const clustered = clusterize(signals, zoom).slice(0, params.limit ?? 500);

  return NextResponse.json(
    { signals: clustered, total: signals.length, zoom },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  );
}
