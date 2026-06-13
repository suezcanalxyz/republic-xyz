import { NextRequest, NextResponse } from 'next/server';
import { loadSeedSignals } from '@/lib/seed';
import { Signal } from '@/lib/types';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  // TODO: db.signal.findUnique({ where: { id: params.id }, include: { ... } })
  const signals = loadSeedSignals();
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
