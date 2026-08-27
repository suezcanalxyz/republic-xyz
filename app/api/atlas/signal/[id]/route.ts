import { NextRequest, NextResponse } from 'next/server';
import { loadSeedSignals } from '@/lib/seed';
import { fetchGdeltSignals } from '@/lib/sources/gdelt';
import { fetchGdacsSignals } from '@/lib/sources/gdacs';
import { fetchRssSignals } from '@/lib/sources/rss-news';
import { getGeneratedSignals } from '@/lib/sources/nim-generator';
import type { Signal } from '@/lib/types';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  // Search across all sources in parallel (caches are already warm from globe loads)
  const [gdelt, gdacs, rss, generated] = await Promise.allSettled([
    fetchGdeltSignals(),
    fetchGdacsSignals(),
    fetchRssSignals(),
    Promise.resolve(getGeneratedSignals()),
  ]);

  const allSignals: Signal[] = [
    ...loadSeedSignals(),
    ...(gdelt.status    === 'fulfilled' ? gdelt.value     : []),
    ...(gdacs.status    === 'fulfilled' ? gdacs.value     : []),
    ...(rss.status      === 'fulfilled' ? rss.value       : []),
    ...(generated.status === 'fulfilled' ? generated.value : []),
  ];

  const signal = allSignals.find(s => s.id === id);

  if (!signal) {
    return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
  }

  // Find related signals via explicit links first (curated seed data)
  const related: Signal[] = [];
  if (signal.links) {
    for (const link of signal.links) {
      const rel = allSignals.find(s => s.id === link.to);
      if (rel) related.push(rel);
    }
  }

  // Live-ingested signals rarely carry explicit links — fall back to a
  // same-topic cluster: same category, ranked by geographic + recency
  // proximity, so "related signals" is never a dead feature for real data.
  if (related.length < 5) {
    const seen = new Set(related.map(r => r.id));
    const signalTime = signal.date ? new Date(signal.date).getTime() : Date.now();
    const candidates = allSignals
      .filter(s => s.id !== signal.id && s.category === signal.category && !seen.has(s.id))
      .map(s => {
        const dLng = s.location.coordinates[0] - signal.location.coordinates[0];
        const dLat = s.location.coordinates[1] - signal.location.coordinates[1];
        const geoDist = Math.sqrt(dLng * dLng + dLat * dLat);
        const timeDist = Math.abs((s.date ? new Date(s.date).getTime() : Date.now()) - signalTime) / 86_400_000; // days
        return { s, rank: geoDist + timeDist * 0.15 };
      })
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 5 - related.length)
      .map(c => c.s);
    related.push(...candidates);
  }

  return NextResponse.json({ signal, related }, {
    headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
  });
}
