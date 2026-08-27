/**
 * Signal Enrichment Pipeline — NIM as engine, not queryable tool.
 *
 * Called exclusively from the cron endpoint. Never exposed in UI.
 * Runs in two passes:
 *   1. Deterministic: filter noise, score by corroboration + recency + category weight
 *   2. NIM enrichment: top-N signals by deterministic score get full AI analysis
 *      → updated summary, confirmed category, extracted tags, contradiction detection
 *
 * The NIM pass is rate-limited (MAX_NIM_CALLS per run) so cost stays predictable.
 * Enriched output is cached at pipeline:signals:v1 and served by the globe route.
 */

import type { Signal } from '../types';
import { rankSignals, filterSignals } from '../sources/signal-ranker';
import { nimChat, extractJson } from '../nim';
import { setCached } from '../cache';

export const PIPELINE_CACHE_KEY = 'pipeline:signals:v1';
export const PIPELINE_TTL_MS = 8 * 60 * 60 * 1000; // 8h — two cron runs per day

const MAX_NIM_CALLS = 40; // hard cap: 40 enrichments per cron run

const ENRICH_SYSTEM = `You are a geopolitical intelligence analyst for ATLAS (republic.suezcanal.xyz).
Given a signal, return JSON enrichment:
{
  "summary": "2 sentences: what happened + why it matters geopolitically",
  "whatHappened": "1 sentence operational description, factual only",
  "category": "one of: remote_warfare|migration_rescue|maritime_routes|energy_extraction|climate_fire_desert|tech_surveillance|arms_trade|canal_politics|infrastructure_failure|border_regimes|satellite_signals|gov_docs",
  "tags": ["3-6 lowercase tags, include actors and geography"],
  "score": 30-99,
  "contradiction": "brief note if this contradicts other signals in same region, else null"
}
Be factual and bias-free. Do not editorialize. Score reflects strategic significance for maritime/geopolitical infrastructure monitoring.`;

interface EnrichResult {
  summary: string;
  whatHappened: string;
  category: string;
  tags: string[];
  score: number;
  contradiction: string | null;
}

async function nimEnrich(signal: Signal): Promise<Signal> {
  const prompt = `Title: ${signal.title}
Category: ${signal.category}
Location: ${signal.location.name}${signal.location.country ? `, ${signal.location.country}` : ''}
Current summary: ${signal.summary}
Source: ${signal.sourceCluster?.[0]?.outlet ?? 'unknown'}`;

  const response = await nimChat([
    { role: 'system', content: ENRICH_SYSTEM },
    { role: 'user', content: prompt },
  ], { temperature: 0.1, maxTokens: 350 });

  if (!response) return signal;
  const result = extractJson<EnrichResult>(response);
  if (!result) return signal;

  return {
    ...signal,
    summary: result.summary || signal.summary,
    whatHappened: result.whatHappened || signal.whatHappened,
    category: result.category || signal.category,
    tags: result.tags?.length ? [...new Set([...signal.tags, ...result.tags])] : signal.tags,
    score: result.score ?? signal.score,
    methodNote: [
      signal.methodNote,
      `NIM-enriched · Llama 3.1 70B${result.contradiction ? ` · ⚠ ${result.contradiction}` : ''}`,
    ].filter(Boolean).join(' | '),
  };
}

/**
 * Main pipeline entry point.
 * Returns enriched, ranked signals and caches them at PIPELINE_CACHE_KEY.
 */
export async function runEnrichmentPipeline(rawSignals: Signal[]): Promise<Signal[]> {
  if (!rawSignals.length) return [];

  // Pass 1: deterministic filter + rank
  const filtered = filterSignals(rawSignals);
  const ranked = rankSignals(filtered);

  if (!process.env.NVIDIA_NIM_API_KEY) {
    setCached(PIPELINE_CACHE_KEY, ranked, PIPELINE_TTL_MS);
    return ranked;
  }

  // Pass 2: NIM enrichment — only top signals, bounded cost
  const topN = ranked.slice(0, MAX_NIM_CALLS);
  const rest = ranked.slice(MAX_NIM_CALLS);

  const enriched: Signal[] = [];
  for (const signal of topN) {
    // Skip very recent NIM-generated or already NIM-enriched signals
    if (signal.methodNote?.includes('NIM-enriched') || signal.methodNote?.includes('NIM-generated')) {
      enriched.push(signal);
      continue;
    }
    enriched.push(await nimEnrich(signal));
  }

  // Re-rank after enrichment (scores may have changed)
  const final = rankSignals([...enriched, ...rest]);
  setCached(PIPELINE_CACHE_KEY, final, PIPELINE_TTL_MS);
  return final;
}
