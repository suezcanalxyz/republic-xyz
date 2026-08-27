/**
 * Vercel cron — 06:00 and 18:00 UTC daily.
 * 1. Fetch all live sources in parallel
 * 2. Run enrichment pipeline: deterministic ranking + NIM batch enrichment on top-40
 * 3. Cache pipeline output (pipeline:signals:v1, 8h TTL) for fast globe reads
 *
 * NIM operates here as the engine — never exposed as a queryable UI endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGdacsSignals } from '@/lib/sources/gdacs';
import { fetchGdeltSignals } from '@/lib/sources/gdelt';
import { fetchRssSignals } from '@/lib/sources/rss-news';
import { getGeneratedSignals, runNimGenerator } from '@/lib/sources/nim-generator';
import { loadSeedSignals } from '@/lib/seed';
import { runEnrichmentPipeline } from '@/lib/pipeline/enrichment-pipeline';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Step 1: warm all live source caches in parallel
  const [gdacs, gdelt, rss] = await Promise.allSettled([
    fetchGdacsSignals(),
    fetchGdeltSignals(),
    fetchRssSignals(),
  ]);

  // Step 2: NIM generator — extract high-importance signals from RSS headlines
  // Runs before pipeline so generated signals enter the enrichment pass
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

  // Step 3: merge all signals and run enrichment pipeline
  const allRaw = [
    ...loadSeedSignals(),
    ...(gdelt.status === 'fulfilled' ? gdelt.value : []),
    ...(gdacs.status === 'fulfilled' ? gdacs.value : []),
    ...(rss.status   === 'fulfilled' ? rss.value   : []),
    ...(await getGeneratedSignals()),
  ];

  const pipelineResult = await runEnrichmentPipeline(allRaw);

  return NextResponse.json({
    ok: true,
    gdacs:        gdacs.status  === 'fulfilled' ? gdacs.value.length  : 'error',
    gdelt:        gdelt.status  === 'fulfilled' ? gdelt.value.length  : 'error',
    rss:          rss.status    === 'fulfilled' ? rss.value.length    : 'error',
    nimGenerated,
    pipelineTotal: pipelineResult.length,
    ts: new Date().toISOString(),
  });
}
