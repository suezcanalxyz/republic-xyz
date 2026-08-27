/**
 * Telegram public channel OSINT monitor.
 * Scrapes t.me/s/CHANNELNAME (public web preview — no auth, no bot needed).
 * Covers conflict zones, mil-intel, MENA, Eastern Europe, Central Asia.
 * Rate: 1 req/channel per TTL window (2h). Defensive: all errors → [].
 */

import type { Signal } from '../types';
import { getCached, setCached } from '../cache';
import { nimChat, extractJson } from '../nim';

const CACHE_KEY = 'telegram:osint:v2';
const TTL_MS = 2 * 60 * 60 * 1000; // 2h

interface TgChannel {
  id: string;
  name: string;
  defaultCategory: string;
  perspectiveGroup: string;
}

// Public OSINT channels only — all readable without account
const CHANNELS: TgChannel[] = [
  { id: 'intelslava',        name: 'Intel Slava Z',    defaultCategory: 'remote_warfare',   perspectiveGroup: 'russia' },
  { id: 'wartranslated',     name: 'War Translated',   defaultCategory: 'remote_warfare',   perspectiveGroup: 'independent' },
  { id: 'nexta_tv',          name: 'NEXTA',            defaultCategory: 'remote_warfare',   perspectiveGroup: 'east_europe' },
  { id: 'osintukraine',      name: 'OSINT Ukraine',    defaultCategory: 'remote_warfare',   perspectiveGroup: 'ukraine' },
  { id: 'meduzaproject',     name: 'Meduza',           defaultCategory: 'gov_docs',         perspectiveGroup: 'russia_independent' },
  { id: 'southfrontenglish', name: 'SouthFront',       defaultCategory: 'remote_warfare',   perspectiveGroup: 'mena' },
  { id: 'AbraxasSpa',        name: 'Abraxas Int.',     defaultCategory: 'remote_warfare',   perspectiveGroup: 'independent' },
  { id: 'mod_russia',        name: 'MoD Russia',       defaultCategory: 'remote_warfare',   perspectiveGroup: 'russia_official' },
  { id: 'euasiamonitor',     name: 'Eurasia Monitor',  defaultCategory: 'border_regimes',   perspectiveGroup: 'central_asia' },
  { id: 'ASBMilitary',       name: 'ASB Military',     defaultCategory: 'remote_warfare',   perspectiveGroup: 'mena' },
];

// Same hotspot dictionary used by rss-news — keep in sync
import { geocodeText } from './geo-hotspots';

interface ParsedPost {
  text: string;
  date: string;
  url: string;
}

function parseTelegramHtml(html: string, channelId: string): ParsedPost[] {
  const posts: ParsedPost[] = [];
  // Match each message block
  const blocks = html.match(/<div[^>]+class="[^"]*tgme_widget_message\s[^"]*"[\s\S]*?(?=<div[^>]+class="[^"]*tgme_widget_message\s|$)/g) ?? [];

  for (const block of blocks.slice(0, 10)) {
    // Extract post number for URL
    const postNum = block.match(/data-post="[^/]+\/(\d+)"/)?.[1] ?? '';

    // Extract text content — strip inner HTML tags
    const rawText = block.match(/<div[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? '';
    const text = rawText
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")
      .trim()
      .slice(0, 500);

    // Extract datetime
    const datetime = block.match(/<time[^>]*datetime="([^"]+)"/)?.[1] ?? '';

    if (text.length > 20 && datetime && postNum) {
      posts.push({
        text,
        date: datetime.slice(0, 10),
        url: `https://t.me/${channelId}/${postNum}`,
      });
    }
  }
  return posts;
}

interface GeoResult { location: string; country: string | null; lat: number; lng: number; category: string }

async function nimGeocode(text: string): Promise<GeoResult | null> {
  const response = await nimChat([
    { role: 'system', content: 'Extract geolocation from this Telegram post. Reply ONLY with JSON: {"location":"place name","country":"country name or null","lat":number,"lng":number,"category":"one of: remote_warfare|migration_rescue|maritime_routes|energy_extraction|climate_fire_desert|tech_surveillance|arms_trade|canal_politics|infrastructure_failure|border_regimes|satellite_signals|gov_docs","title":"English summary max 100 chars"}' },
    { role: 'user', content: text.slice(0, 400) },
  ], { temperature: 0.1, maxTokens: 200 });
  if (!response) return null;
  return extractJson<GeoResult>(response);
}

async function fetchChannel(ch: TgChannel): Promise<Signal[]> {
  try {
    const res = await fetch(`https://t.me/s/${ch.id}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ATLAS/1.0; +https://republic.suezcanal.xyz)',
        'Accept': 'text/html',
        'Accept-Language': 'en',
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const posts = parseTelegramHtml(html, ch.id);
    const signals: Signal[] = [];

    for (const post of posts.slice(0, 8)) {
      // Try hotspot dict first (instant, no NIM cost)
      let geo = geocodeText(post.text);
      let title = post.text.slice(0, 120);
      let category = ch.defaultCategory;

      if (!geo) {
        // NIM geocode — only if Ollama/NIM available
        const nimResult = await nimGeocode(post.text);
        if (!nimResult || isNaN(nimResult.lat) || isNaN(nimResult.lng)) continue;
        geo = { coords: [nimResult.lng, nimResult.lat], name: nimResult.location, country: nimResult.country };
        if (nimResult.title) title = nimResult.title;
        if (nimResult.category) category = nimResult.category;
      }

      const fetchedAt = new Date().toISOString().slice(0, 10);
      const id = `tg:${ch.id}:${post.url.split('/').at(-1) ?? Date.now()}`;

      signals.push({
        id,
        type: 'SHORT_ALERT',
        category,
        tags: ['telegram', 'osint', ch.id, ch.perspectiveGroup, 'live'],
        title,
        summary: post.text.slice(0, 300),
        whatHappened: post.text.slice(0, 200),
        location: {
          name: geo.name,
          country: geo.country,
          region: null,
          coordinates: geo.coords,
          confidence: 'medium',
        },
        date: post.date,
        lastUpdated: fetchedAt,
        status: 'auto_collected',
        verification: 'unverified',
        sourceDiversity: ['telegram', ch.perspectiveGroup],
        sourceCluster: [{
          outlet: ch.name,
          country: null,
          region: null,
          perspectiveGroup: ch.perspectiveGroup,
          url: post.url,
          publishedAt: post.date,
          language: 'multi',
          title,
          excerpt: post.text.slice(0, 200) || null,
          imageUrl: null,
          sourceType: 'social_media',
          reliability: 'low',
        }],
        perspectives: null,
        republicReading: null,
        methodNote: `Telegram OSINT · @${ch.id} · ${ch.perspectiveGroup}`,
        links: [{ to: post.url, relation: 'source_article' }],
        score: 30,
        visible: true,
      });
    }
    return signals;
  } catch {
    return [];
  }
}

export async function fetchTelegramSignals(): Promise<Signal[]> {
  const cached = getCached<Signal[]>(CACHE_KEY);
  if (cached) return cached;

  // Fetch channels in small batches — be gentle on t.me CDN
  const results: Signal[] = [];
  for (let i = 0; i < CHANNELS.length; i += 3) {
    const batch = CHANNELS.slice(i, i + 3);
    const batchResults = await Promise.all(batch.map(ch => fetchChannel(ch)));
    results.push(...batchResults.flat());
    // Avoid hammering Telegram
    if (i + 3 < CHANNELS.length) await new Promise(r => setTimeout(r, 1500));
  }

  // Dedup by URL
  const seen = new Set<string>();
  const deduped = results.filter(s => {
    const url = s.links?.[0]?.to ?? s.id;
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });

  setCached(CACHE_KEY, deduped, TTL_MS);
  return deduped;
}
