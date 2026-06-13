import { PrismaClient } from '@prisma/client';

declare global {
  // Prevent multiple instances in development hot-reload
  var _prismaClient: PrismaClient | undefined;
}

export const db = globalThis._prismaClient ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalThis._prismaClient = db;
}
