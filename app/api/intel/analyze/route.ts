import { NextRequest, NextResponse } from 'next/server';
import { nimChat, extractJson } from '@/lib/nim';

interface AnalyzeRequest {
  title: string;
  summary: string;
  category: string;
  location: string;
  tags?: string[];
}

interface AnalyzeResponse {
  actors: string[];
  systemicContext: string;
  relatedDynamics: string[];
  confidenceNote: string;
  sourceGaps: string[];
  nim_model: string;
}

const SYSTEM = `You are a geopolitical analyst for ATLAS forensic intelligence. Analyze signals without editorial bias.
Focus on systemic patterns: power structures, resource flows, institutional dynamics.
Do NOT assess moral valence. Do NOT cite missing context as an opinion.

Respond ONLY with valid JSON:
{
  "actors": ["array of identified state/non-state actors"],
  "systemicContext": "2-sentence structural framing — what systemic dynamic does this event fit into?",
  "relatedDynamics": ["2-4 related geopolitical dynamics this connects to"],
  "confidenceNote": "1 sentence on data quality and what is uncertain",
  "sourceGaps": ["what types of sources are likely absent from official reports on this event"]
}`;

export async function POST(req: NextRequest) {
  let body: AnalyzeRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.title || !body.summary) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  const userPrompt = `Signal: ${body.title}
Category: ${body.category}
Location: ${body.location}
Summary: ${body.summary}
Tags: ${(body.tags ?? []).join(', ')}`;

  const response = await nimChat(
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    { temperature: 0.25, maxTokens: 600 },
  );

  if (!response) {
    return NextResponse.json(
      { error: 'nim_unavailable', hint: 'Set NVIDIA_NIM_API_KEY env var' },
      { status: 503 },
    );
  }

  const result = extractJson<AnalyzeResponse>(response);
  if (!result) {
    return NextResponse.json({ error: 'parse_failed', raw: response }, { status: 500 });
  }

  return NextResponse.json(
    { ...result, nim_model: 'meta/llama-3.1-70b-instruct' },
    { headers: { 'Cache-Control': 'private, max-age=1800' } },
  );
}
