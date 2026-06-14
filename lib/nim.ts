/**
 * NVIDIA NIM inference client.
 * API is OpenAI-compatible: POST /v1/chat/completions
 * Free tier at build.nvidia.com — set NVIDIA_NIM_API_KEY env var.
 * Gracefully returns null when key absent or request fails.
 */

const NIM_BASE = 'https://integrate.api.nvidia.com/v1';
const NIM_MODEL = 'meta/llama-3.1-70b-instruct';
const NIM_TIMEOUT_MS = 12_000;

interface NimMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface NimChoice {
  message: { content: string };
  finish_reason: string;
}

interface NimResponse {
  choices: NimChoice[];
}

export async function nimChat(
  messages: NimMessage[],
  options: { temperature?: number; maxTokens?: number } = {},
): Promise<string | null> {
  const apiKey = process.env.NVIDIA_NIM_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`${NIM_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: NIM_MODEL,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 512,
        top_p: 0.95,
      }),
      signal: AbortSignal.timeout(NIM_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NimResponse;
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

/** Extract structured JSON from NIM response. Returns null on parse failure. */
export function extractJson<T>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
