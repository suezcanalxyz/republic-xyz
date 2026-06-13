import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';
import { transformEvents } from '@/lib/seed';
import { Signal } from '@/lib/types';

function loadAllSignals(): Signal[] {
  try {
    const seedPath = path.resolve(process.cwd(), '../suezcanal.xyz/republic/atlas/data/events.json');
    const raw = JSON.parse(readFileSync(seedPath, 'utf-8'));
    return transformEvents(raw.events || []);
  } catch {
    return [];
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  // TODO: db.signal.findUnique({ where: { id: params.id }, include: { ... } })
  const signals = loadAllSignals();
  const signal = signals.find(s => s.id === params.id);

  if (!signal) {
    return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
  }

  // Find related signals via links
  const related: Signal[] = [];
  if (signal.links) {
    for (const link of signal.links) {
      const rel = signals.find(s => s.id === link.to);
      if (rel) related.push(rel);
    }
  }

  return NextResponse.json({ signal, related });
}
