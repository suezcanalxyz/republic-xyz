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

  // Find related signals via links (search across all sources)
  const related: Signal[] = [];
  if (signal.links) {
    for (const link of signal.links) {
      const rel = allSignals.find(s => s.id === link.to);
      if (rel) related.push(rel);
    }
  }

  return NextResponse.json({ signal, related }, {
    headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
  });
}
