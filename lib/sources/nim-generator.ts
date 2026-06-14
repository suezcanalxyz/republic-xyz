/**
 * NIM Signal Generator — active learning layer.
 * Reads RSS headlines, scores by importance (1-10 via Llama),
 * generates full Signal objects for articles scoring >= 8.
 * Called from cron /api/cron/refresh twice daily.
 * Generated signals stored in module-level cache, served alongside
 * GDACS/GDELT/RSS in the globe route.
 */

import type { Signal } from '../types';
import { nimChat, extractJson } from '../nim';
import { getCached, setCached } from '../cache';

const GEN_CACHE_KEY = 'nim:generated:v1';
const GEN_TTL_MS = 14 * 60 * 60 * 1000; // 14h — refresh twice daily

interface RssHeadline {
  title: string;
  url: string;
  description: string;
  outlet: string;
  pubDate: string;
  imageUrl: string | null;
}

interface GeneratedSignal {
  title: string;
  summary: string;
  whatHappened: string;
  category: string;
  location: string;
  country: string | null;
  lat: number;
  lng: number;
  tags: string[];
  score: number;
  importance: number;
}

const SCORE_SYSTEM = `You are a geopolitical signal analyst for ATLAS.
Given a news headline, return JSON:
{
  "importance": 1-10 (10=major breaking news affecting global stability),
  "title": "cleaned headline, max 100 chars",
  "summary": "2 sentences: what happened + systemic significance",
  "whatHappened": "1 sentence operational description",
  "category": "one of: remote_warfare|migration_rescue|maritime_routes|energy_extraction|climate_fire_desert|tech_surveillance|arms_trade|canal_politics|infrastructure_failure|border_regimes|satellite_signals|gov_docs",
  "location": "primary geographic location name",
  "country": "country name or null",
  "lat": number,
  "lng": number,
  "tags": ["3-5 lowercase tags"],
  "score": 40-95 (strategic importance for ATLAS)
}
Only generate for events with geopolitical significance (wars, disasters, sanctions, maritime incidents, etc).
If the article is not geopolitically significant, return {"importance": 1}.`;

async function scoreAndGenerate(headline: RssHeadline): Promise<GeneratedSignal | null> {
  const response = await nimChat([
    { role: 'system', content: SCORE_SYSTEM },
    { role: 'user', content: `Outlet: ${headline.outlet}\nHeadline: ${headline.title}\nDescription: ${headline.description}` },
  ], { temperature: 0.15, maxTokens: 400 });

  if (!response) return null;
  const result = extractJson<GeneratedSignal & { importance: number }>(response);
  if (!result || result.importance < 7) return null;
  if (isNaN(result.lat) || isNaN(result.lng)) return null;
  return result;
}

function toSignal(gen: GeneratedSignal, headline: RssHeadline, idx: number): Signal {
  const date = headline.pubDate
    ? new Date(headline.pubDate).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  return {
    id: `nim:gen:${Date.now()}:${idx}`,
    type: gen.importance >= 9 ? 'SEED' : 'SHORT_ALERT',
    category: gen.category,
    tags: [...(gen.tags ?? []), 'nim-generated', 'breaking'],
    title: gen.title || headline.title.slice(0, 120),
    summary: gen.summary,
    whatHappened: gen.whatHappened,
    location: {
      name: gen.location,
      country: gen.country,
      region: null,
      coordinates: [gen.lng, gen.lat],
      confidence: 'medium',
    },
    date,
    lastUpdated: new Date().toISOString().slice(0, 10),
    status: 'auto_collected',
    verification: 'unverified',
    sourceDiversity: ['single_source'],
    sourceCluster: [{
      outlet: headline.outlet,
      country: null,
      region: null,
      perspectiveGroup: null,
      url: headline.url,
      publishedAt: date,
      language: 'en',
      title: headline.title.slice(0, 120),
      excerpt: headline.description.slice(0, 200) || null,
      imageUrl: headline.imageUrl,
      sourceType: 'media',
      reliability: 'medium',
    }],
    perspectives: null,
    republicReading: null,
    methodNote: `NIM-generated signal · Llama 3.1 70B · importance: ${gen.importance}/10 · ${headline.outlet}`,
    links: [{ to: headline.url, relation: 'source_article' }],
    score: gen.score ?? 50,
    visible: true,
  };
}

/** Called from cron endpoint. Returns number of new signals generated. */
export async function runNimGenerator(headlines: RssHeadline[]): Promise<number> {
  if (!process.env.NVIDIA_NIM_API_KEY) return 0;

  const existing = getCached<Signal[]>(GEN_CACHE_KEY) ?? [];
  const existingUrls = new Set(existing.map(s => s.links?.[0]?.to ?? ''));

  const fresh = headlines.filter(h => h.url && !existingUrls.has(h.url)).slice(0, 30);

  const generated: Signal[] = [...existing];
  let count = 0;

  for (let i = 0; i < fresh.length; i++) {
    const h = fresh[i];
    const gen = await scoreAndGenerate(h);
    if (gen) {
      generated.push(toSignal(gen, h, i));
      count++;
    }
    // Max 10 new NIM calls per cron run (rate limiting)
    if (count >= 10) break;
  }

  // Keep last 50 generated signals
  const trimmed = generated.slice(-50);
  setCached(GEN_CACHE_KEY, trimmed, GEN_TTL_MS);
  return count;
}

export function getGeneratedSignals(): Signal[] {
  return getCached<Signal[]>(GEN_CACHE_KEY) ?? [];
}
