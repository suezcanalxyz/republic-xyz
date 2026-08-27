/**
 * NVIDIA NIM / Ollama inference client.
 * OpenAI-compatible API — works with both.
 *
 * Priority:
 *   1. NVIDIA_NIM_API_KEY set → use NIM (integrate.api.nvidia.com, Llama 3.1 70B)
 *   2. GROQ_API_KEY set       → use Groq (api.groq.com, Llama 3.1 70B, free tier)
 *   3. Default                → Ollama local (localhost:11434, Llama 3.1 8B, zero cost)
 *
 * On Oracle VM: Ollama runs locally, no API key needed, unlimited calls.
 * On Vercel:   Set NVIDIA_NIM_API_KEY or GROQ_API_KEY.
 */

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

function resolveEndpoint(): { base: string; model: string; apiKey: string | null } {
  if (process.env.NVIDIA_NIM_API_KEY) {
    return {
      base: 'https://integrate.api.nvidia.com/v1',
      model: 'meta/llama-3.1-70b-instruct',
      apiKey: process.env.NVIDIA_NIM_API_KEY,
    };
  }
  if (process.env.GROQ_API_KEY) {
    return {
      base: 'https://api.groq.com/openai/v1',
      model: 'llama-3.1-70b-versatile',
      apiKey: process.env.GROQ_API_KEY,
    };
  }
  // Ollama local — Oracle VM default
  return {
    base: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1',
    model: process.env.OLLAMA_MODEL ?? 'llama3.1:8b',
    apiKey: null,
  };
}

export async function nimChat(
  messages: NimMessage[],
  options: { temperature?: number; maxTokens?: number } = {},
): Promise<string | null> {
  const { base, model, apiKey } = resolveEndpoint();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 512,
        top_p: 0.95,
      }),
      signal: AbortSignal.timeout(30_000), // Ollama 8B on ARM: up to 20s
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NimResponse;
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

/** Extract structured JSON from NIM/Ollama response. Returns null on parse failure. */
export function extractJson<T>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
