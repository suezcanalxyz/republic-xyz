import { NextResponse } from 'next/server';

/**
 * Temporary diagnostic endpoint — reports raw fetch status per external
 * source so failures are visible without Vercel log access. Delete once
 * GDELT/RSS reachability from prod is understood.
 */

async function probe(name: string, url: string, timeoutMs = 9000) {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ATLAS/1.0 (republic.suezcanal.xyz)' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    return {
      name,
      ok: res.ok,
      status: res.status,
      bytes: text.length,
      ms: Date.now() - start,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      ms: Date.now() - start,
    };
  }
}

export async function GET() {
  const results = await Promise.all([
    probe('gdelt', 'https://api.gdeltproject.org/api/v2/geo/geo?query=conflict&mode=pointdata&TIMESPAN=1440&maxpoints=5&format=geojson'),
    probe('aljazeera', 'https://www.aljazeera.com/xml/rss/all.xml'),
    probe('bbc', 'https://feeds.bbci.co.uk/news/world/rss.xml'),
    probe('unnews', 'https://news.un.org/feed/subscribe/en/news/all/rss.xml'),
    probe('reliefweb', 'https://reliefweb.int/updates/rss.xml'),
    probe('guardian', 'https://www.theguardian.com/world/rss'),
    probe('npr', 'https://feeds.npr.org/1004/rss.xml'),
    probe('gdacs', 'https://www.gdacs.org/xml/rss.xml'),
  ]);

  return NextResponse.json({ results, ts: new Date().toISOString() });
}
