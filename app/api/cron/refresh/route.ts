/**
 * Vercel cron — 06:00 and 18:00 UTC daily.
 * 1. Warm all live source caches (GDACS, GDELT, RSS)
 * 2. Run NIM signal generator on fresh RSS headlines
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGdacsSignals } from '@/lib/sources/gdacs';
import { fetchGdeltSignals } from '@/lib/sources/gdelt';
import { fetchRssSignals } from '@/lib/sources/rss-news';
import { runNimGenerator } from '@/lib/sources/nim-generator';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Warm caches in parallel
  const [gdacs, gdelt, rss] = await Promise.allSettled([
    fetchGdacsSignals(),
    fetchGdeltSignals(),
    fetchRssSignals(),
  ]);

  // NIM generator: extract headlines from RSS signals for importance scoring
  let nimGenerated = 0;
  if (rss.status === 'fulfilled' && rss.value.length > 0) {
    const headlines = rss.value.map(s => ({
      title: s.title,
      url: s.links?.[0]?.to ?? '',
      description: s.summary,
      outlet: s.sourceCluster?.[0]?.outlet ?? 'unknown',
      pubDate: s.date,
      imageUrl: s.sourceCluster?.[0]?.imageUrl ?? null,
    }));
    nimGenerated = await runNimGenerator(headlines);
  }

  return NextResponse.json({
    ok: true,
    gdacs:        gdacs.status  === 'fulfilled' ? gdacs.value.length  : 'error',
    gdelt:        gdelt.status  === 'fulfilled' ? gdelt.value.length  : 'error',
    rss:          rss.status    === 'fulfilled' ? rss.value.length    : 'error',
    nimGenerated,
    ts: new Date().toISOString(),
  });
}
