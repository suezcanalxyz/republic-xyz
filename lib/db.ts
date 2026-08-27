import { PrismaClient } from '@prisma/client';

declare global {
  // Prevent multiple instances in development hot-reload
  var _prismaClient: PrismaClient | undefined;
}

// Lazy singleton — constructing PrismaClient eagerly at module scope makes
// it run during Next.js's build-time "collect page data" step for every
// route that imports this file (directly or via lib/cache.ts), which
// crashes the build if DATABASE_URL/DIRECT_URL aren't present in the build
// environment. Deferring construction to first actual use keeps it scoped
// to request time, where those env vars are guaranteed to be set.
let instance: PrismaClient | undefined = globalThis._prismaClient;

export function getDb(): PrismaClient {
  if (!instance) {
    instance = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
    if (process.env.NODE_ENV !== 'production') {
      globalThis._prismaClient = instance;
    }
  }
  return instance;
}
