/**
 * NIM signal enrichment layer.
 * Takes raw GDACS signals and enriches them with:
 *  - Better summary (contextual, not raw RSS description)
 *  - Precise category (beyond EQ→infra/FL→climate binary)
 *  - Detected tags (actors, location precision, phenomenon type)
 *  - republicReading (systemic framing, not editorial opinion)
 *
 * All enrichment is async and non-blocking — original signal is
 * returned unmodified if NIM key absent or request times out.
 */

import type { Signal } from '../types';
import { nimChat, extractJson } from '../nim';
import { getCached, setCached } from '../cache';

const ENRICH_TTL_MS = 60 * 60 * 1000; // 1h — enrichment stable longer than raw data

interface EnrichmentResult {
  summary: string;
  category: string;
  tags: string[];
  republicReading: string;
  whatHappened: string;
}

const VALID_CATEGORIES = [
  'maritime_routes',
  'migration_rescue',
  'remote_warfare',
  'arms_trade',
  'tech_surveillance',
  'energy_extraction',
  'canal_politics',
  'border_regimes',
  'infrastructure_failure',
  'climate_fire_desert',
  'satellite_signals',
  'gov_docs',
];

const SYSTEM_PROMPT = `You are a geopolitical signal analyst for ATLAS, a forensic cartographic intelligence platform.
Given a raw disaster/event alert, extract structured metadata.

Respond with ONLY valid JSON matching this schema:
{
  "summary": "2-sentence factual summary of what happened and systemic context",
  "category": "one of: maritime_routes|migration_rescue|remote_warfare|arms_trade|tech_surveillance|energy_extraction|canal_politics|border_regimes|infrastructure_failure|climate_fire_desert|satellite_signals|gov_docs",
  "tags": ["array", "of", "3-6", "lowercase", "tags", "no", "spaces"],
  "republicReading": "1-sentence systemic framing: what structural dynamic does this event reveal? No editorializing.",
  "whatHappened": "1-sentence operational description: who, what, where, magnitude"
}`;

export async function enrichSignal(signal: Signal): Promise<Signal> {
  const cacheKey = `nim:enrich:${signal.id}`;
  const cached = getCached<EnrichmentResult>(cacheKey);
  if (cached) return applyEnrichment(signal, cached);

  const userPrompt = `Event: ${signal.title}
Location: ${signal.location.name}
Raw description: ${signal.summary}
Current category: ${signal.category}
Tags: ${signal.tags.join(', ')}`;

  const response = await nimChat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.15, maxTokens: 400 },
  );

  if (!response) return signal;

  const result = extractJson<EnrichmentResult>(response);
  if (!result) return signal;

  // Validate category stays within known set
  if (!VALID_CATEGORIES.includes(result.category)) {
    result.category = signal.category;
  }

  setCached(cacheKey, result, ENRICH_TTL_MS);
  return applyEnrichment(signal, result);
}

function applyEnrichment(signal: Signal, e: EnrichmentResult): Signal {
  return {
    ...signal,
    summary: e.summary || signal.summary,
    whatHappened: e.whatHappened || signal.whatHappened,
    category: e.category || signal.category,
    tags: e.tags?.length ? [...new Set([...signal.tags, ...e.tags])] : signal.tags,
    republicReading: e.republicReading || signal.republicReading,
    methodNote: signal.methodNote + ' | NIM-enriched via Llama-3.1-70B.',
  };
}

/** Batch-enrich signals, runs sequentially to respect NIM rate limits. */
export async function enrichSignals(signals: Signal[]): Promise<Signal[]> {
  if (!process.env.NVIDIA_NIM_API_KEY) return signals;

  const results: Signal[] = [];
  for (const s of signals) {
    results.push(await enrichSignal(s));
  }
  return results;
}
