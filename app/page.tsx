'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback, useRef } from 'react';
import CommandBar, { Mode, TimeWindow } from '@/components/CommandBar';
import SignalInspector from '@/components/SignalInspector';
import type { ClusteredSignal } from '@/lib/types';

// Cesium globe is browser-only — no SSR
const CesiumGlobe = dynamic(() => import('@/components/CesiumGlobe'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#010206',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        fontSize: 11,
        letterSpacing: '0.12em',
        color: '#2a4055',
        textTransform: 'uppercase',
      }}
    >
      Initialising globe…
    </div>
  ),
});

export default function AtlasPage() {
  const [signals, setSignals] = useState<ClusteredSignal[]>([]);
  const [activeSignalId, setActiveSignalId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('event');
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('all');
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set());
  const [zoom] = useState(2);
  const fetchRef = useRef<AbortController | null>(null);

  const fetchSignals = useCallback(async () => {
    if (fetchRef.current) fetchRef.current.abort();
    fetchRef.current = new AbortController();

    const params = new URLSearchParams({
      zoom: zoom.toString(),
      timeWindow,
      mode,
      layers: [...activeLayers].join(','),
    });

    try {
      const res = await fetch(`/api/atlas/globe?${params}`, {
        signal: fetchRef.current.signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      setSignals(data.signals ?? []);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') console.error('[atlas] fetch failed', e);
    }
  }, [zoom, timeWindow, mode, activeLayers]);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  const handleLayerToggle = useCallback((layer: string) => {
    setActiveLayers(prev => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }, []);

  return (
    <>
      <CommandBar
        mode={mode}
        timeWindow={timeWindow}
        activeLayers={activeLayers}
        onModeChange={setMode}
        onTimeWindowChange={setTimeWindow}
        onLayerToggle={handleLayerToggle}
        onSearchSelect={setActiveSignalId}
      />

      <div
        style={{
          position: 'fixed',
          top: 44,
          left: 0,
          right: activeSignalId ? 360 : 0,
          bottom: 0,
          transition: 'right 0.25s ease',
        }}
      >
        <CesiumGlobe
          signals={signals}
          activeSignalId={activeSignalId}
          onSelect={setActiveSignalId}
          onDeselect={() => setActiveSignalId(null)}
        />
      </div>

      {/* Status badge */}
      <div
        style={{
          position: 'fixed',
          bottom: 16,
          left: 16,
          fontFamily: 'monospace',
          fontSize: 9,
          letterSpacing: '0.12em',
          color: '#2a4055',
          textTransform: 'uppercase',
          pointerEvents: 'none',
        }}
      >
        <span style={{ color: '#0f2035' }}>SCR·ATLAS</span>
        <span style={{ margin: '0 6px', color: '#0a1825' }}>·</span>
        <span>{signals.length} nodes</span>
        <span style={{ margin: '0 6px', color: '#0a1825' }}>·</span>
        <span>republic.suezcanal.xyz</span>
      </div>

      <SignalInspector
        signalId={activeSignalId}
        onClose={() => setActiveSignalId(null)}
      />
    </>
  );
}
