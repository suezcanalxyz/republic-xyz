/**
 * Free, no-key corroboration checks — deliberately NOT called "verification."
 *
 * Two checks, both public APIs with no signup/key:
 *  1. Wayback Machine Availability API — does an independent, timestamped
 *     archive of the source URL exist? Confirms the article isn't a ghost
 *     that could be quietly edited/deleted later.
 *  2. Reddit public search — is there independent discussion (often linking
 *     to video/photo evidence) referencing the same event? Weak signal, but
 *     free, public, and frequently the fastest way to surface user-uploaded
 *     video corroboration for breaking events.
 *
 * Rate-limited like the NIM enrichment pass: only the top-N ranked signals
 * per cron run get checked, so cost/latency stay bounded and predictable.
 * Any failure here is silently swallowed — this is a bonus signal, never a
 * blocker for the signal itself appearing on the map.
 */

import type { Signal } from '../types';

const MAX_FACTCHECK_CALLS = 25;

async function checkWayback(url: string): Promise<{ type: 'archive'; url: string; label: string } | null> {
  try {
    const res = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const snapshot = data?.archived_snapshots?.closest;
    if (!snapshot?.available || !snapshot?.url) return null;
    return { type: 'archive', url: snapshot.url, label: `Archived ${snapshot.timestamp?.slice(0, 8) ?? ''}` };
  } catch {
    return null;
  }
}

async function checkReddit(query: string): Promise<{ type: 'discussion'; url: string; label: string } | null> {
  try {
    const res = await fetch(
      `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=3&sort=relevance`,
      {
        headers: { 'User-Agent': 'ATLAS/1.0 (republic.suezcanal.xyz; independent research tool)' },
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const post = data?.data?.children?.[0]?.data;
    if (!post?.permalink) return null;
    return {
      type: 'discussion',
      url: `https://reddit.com${post.permalink}`,
      label: post.is_video || post.post_hint === 'hosted:video' ? 'Discussion + video' : 'Independent discussion',
    };
  } catch {
    return null;
  }
}

export async function factCheckSignal(signal: Signal): Promise<Signal> {
  const sourceUrl = signal.sourceCluster?.[0]?.url;
  const query = `${signal.location.name} ${signal.tags.slice(0, 3).join(' ')}`.trim();

  const [archive, discussion] = await Promise.all([
    sourceUrl ? checkWayback(sourceUrl) : Promise.resolve(null),
    query.length > 3 ? checkReddit(query) : Promise.resolve(null),
  ]);

  const links = [archive, discussion].filter((x): x is NonNullable<typeof x> => x !== null);
  if (links.length === 0) return signal;

  return { ...signal, corroborationLinks: links };
}

/** Called from cron endpoint after ranking — only top-N signals get checked. */
export async function factCheckTopSignals(signals: Signal[]): Promise<Signal[]> {
  const topN = signals.slice(0, MAX_FACTCHECK_CALLS);
  const rest = signals.slice(MAX_FACTCHECK_CALLS);

  const checked: Signal[] = [];
  for (const signal of topN) {
    checked.push(await factCheckSignal(signal));
  }
  return [...checked, ...rest];
}
