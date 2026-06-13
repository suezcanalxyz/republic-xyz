import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';
import { transformEvents } from '@/lib/seed';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.toLowerCase().trim() ?? '';
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  // TODO: Use db full-text search + pgvector similarity
  try {
    const seedPath = path.resolve(process.cwd(), '../suezcanal.xyz/republic/atlas/data/events.json');
    const raw = JSON.parse(readFileSync(seedPath, 'utf-8'));
    const signals = transformEvents(raw.events || []);

    const results = signals
      .filter(s =>
        s.title.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q)) ||
        s.location.name.toLowerCase().includes(q) ||
        (s.location.country ?? '').toLowerCase().includes(q)
      )
      .slice(0, 20)
      .map(s => ({
        id: s.id,
        title: s.title,
        category: s.category,
        type: s.type,
        location: s.location.name,
        lat: s.location.coordinates[1],
        lng: s.location.coordinates[0],
      }));

    return NextResponse.json({ results, query: q });
  } catch {
    return NextResponse.json({ results: [], error: 'Search failed' }, { status: 500 });
  }
}
