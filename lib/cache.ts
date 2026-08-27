/**
 * Persistent pipeline cache backed by Postgres (CacheEntry table).
 *
 * Vercel serverless invocations don't share process memory: the cron run
 * and the public API routes are different processes. An in-memory Map here
 * would let the cron "warm" a cache no visitor ever reads. Postgres is the
 * one thing both sides can reliably reach.
 *
 * Failures are swallowed (return null / no-op) so a DB hiccup degrades to
 * "cache miss, refetch live" instead of a 500.
 */

import { getDb } from './db';

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const entry = await getDb().cacheEntry.findUnique({ where: { key } });
    if (!entry || entry.expiresAt < new Date()) return null;
    return entry.data as T;
  } catch {
    return null;
  }
}

export async function setCached<T>(key: string, data: T, ttlMs: number): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlMs);
  try {
    await getDb().cacheEntry.upsert({
      where: { key },
      create: { key, data: data as object, expiresAt },
      update: { data: data as object, expiresAt },
    });
  } catch {
    // best-effort — a failed cache write shouldn't fail the pipeline run
  }
}
