import { NextRequest, NextResponse } from 'next/server';
import { loadSeedSignals } from '@/lib/seed';
import { fetchGdeltSignals } from '@/lib/sources/gdelt';
import { fetchGdacsSignals } from '@/lib/sources/gdacs';
import { fetchRssSignals } from '@/lib/sources/rss-news';
import { getGeneratedSignals } from '@/lib/sources/nim-generator';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.toLowerCase().trim() ?? '';
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    // Merge all sources — caches warm from globe loads, no extra cost
    const [gdelt, gdacs, rss] = await Promise.allSettled([
      fetchGdeltSignals(),
      fetchGdacsSignals(),
      fetchRssSignals(),
    ]);

    const allSignals = [
      ...loadSeedSignals(),
      ...(gdelt.status === 'fulfilled' ? gdelt.value : []),
      ...(gdacs.status === 'fulfilled' ? gdacs.value : []),
      ...(rss.status   === 'fulfilled' ? rss.value   : []),
      ...getGeneratedSignals(),
    ];

    const results = allSignals
      .filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q)) ||
        s.location.name.toLowerCase().includes(q) ||
        (s.location.country ?? '').toLowerCase().includes(q)
      )
      .slice(0, 20)
      .map(s => ({
        id: s.id,
        title: s.title,
        category: s.category,
        type: s.type,
        location: s.location.name,
        lat: s.location.coordinates[1],
        lng: s.location.coordinates[0],
      }));

    return NextResponse.json({ results, query: q }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=180' },
    });
  } catch {
    return NextResponse.json({ results: [], error: 'Search failed' }, { status: 500 });
  }
}
