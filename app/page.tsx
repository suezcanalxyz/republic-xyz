'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback, useRef } from 'react';
import CommandBar, { Mode, TimeWindow } from '@/components/CommandBar';
import SignalInspector from '@/components/SignalInspector';
import type { ClusteredSignal } from '@/lib/types';

function GlobeLoader() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#010206',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
      }}
    >
      {/* Animated globe ring */}
      <svg width="64" height="64" viewBox="0 0 64 64" style={{ opacity: 0.5 }}>
        <circle cx="32" cy="32" r="28" fill="none" stroke="#0f2035" strokeWidth="2" />
        <circle cx="32" cy="32" r="28" fill="none" stroke="#57E7FF" strokeWidth="2"
          strokeDasharray="44 132" strokeLinecap="round"
          style={{ transformOrigin: '32px 32px', animation: 'spin 1.4s linear infinite' }} />
        <ellipse cx="32" cy="32" rx="12" ry="28" fill="none" stroke="#1a3a50" strokeWidth="1" />
        <line x1="4" y1="32" x2="60" y2="32" stroke="#0f2035" strokeWidth="1" />
      </svg>
      <span style={{
        fontFamily: 'ui-monospace, monospace',
        fontSize: 10,
        letterSpacing: '0.18em',
        color: '#1e3a50',
        textTransform: 'uppercase',
      }}>
        Loading engine…
      </span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const CesiumGlobe = dynamic(() => import('@/components/CesiumGlobe'), {
  ssr: false,
  loading: () => <GlobeLoader />,
});

const LIVE_INTERVAL_MS = 30 * 60 * 1000; // 30 min — caches last 1-2h, no point hitting API faster

export default function AtlasPage() {
  const [signals, setSignals] = useState<ClusteredSignal[]>([]);
  const [activeSignalId, setActiveSignalId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('event');
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('30d');
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set());
  const [overlayLayers, setOverlayLayers] = useState<Set<string>>(
    new Set(['cables', 'shipping', 'corridors', 'satellites'])
  );
  const [zoom, setZoom] = useState(2);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [liveActive, setLiveActive] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const fetchRef = useRef<AbortController | null>(null);
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSignals = useCallback(async () => {
    if (fetchRef.current) fetchRef.current.abort();
    fetchRef.current = new AbortController();

    const isMobile = typeof window !== 'undefined' && (window.innerWidth < 1024 || ('ontouchstart' in window && window.innerWidth < 1366));
    const params = new URLSearchParams({
      zoom: zoom.toString(),
      timeWindow,
      mode,
      layers: [...activeLayers].join(','),
      limit: isMobile ? '150' : '500',
    });

    try {
      const res = await fetch(`/api/atlas/globe?${params}`, {
        signal: fetchRef.current.signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      setSignals(data.signals ?? []);
      setLastFetched(new Date());
      setLiveActive(true);
      // Briefly pulse the live indicator
      setTimeout(() => setLiveActive(false), 1200);
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') console.error('[atlas] fetch failed', e);
    }
  }, [zoom, timeWindow, mode, activeLayers]);

  // Debounced fetch on filter/zoom change
  useEffect(() => {
    if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
    fetchTimerRef.current = setTimeout(fetchSignals, 180);
    return () => { if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current); };
  }, [fetchSignals]);

  // Auto-refresh for near-realtime updates
  useEffect(() => {
    const interval = setInterval(fetchSignals, LIVE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  const handleLayerToggle = useCallback((layer: string) => {
    setActiveLayers(prev => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer); else next.add(layer);
      return next;
    });
  }, []);

  const handleOverlayLayerToggle = useCallback((layer: string) => {
    setOverlayLayers(prev => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer); else next.add(layer);
      return next;
    });
  }, []);

  const formattedTime = lastFetched
    ? lastFetched.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <>
      <CommandBar
        mode={mode}
        timeWindow={timeWindow}
        activeLayers={activeLayers}
        overlayLayers={overlayLayers}
        onModeChange={setMode}
        onTimeWindowChange={setTimeWindow}
        onLayerToggle={handleLayerToggle}
        onOverlayLayerToggle={handleOverlayLayerToggle}
        onSearchSelect={setActiveSignalId}
      />

      <div className={`globeShell ${activeSignalId ? 'withInspector' : ''}`}>
        <CesiumGlobe
          signals={signals}
          activeSignalId={activeSignalId}
          showSatellite={satellite}
          overlayLayers={overlayLayers}
          onSelect={setActiveSignalId}
          onDeselect={() => setActiveSignalId(null)}
          onZoomChange={setZoom}
        />
      </div>

      <div className="statusBadge">
        <span style={{ color: '#0f2035' }}>SCR·ATLAS</span>
        <span style={{ margin: '0 6px', color: '#0a1825' }}>·</span>
        <span>{signals.length} nodes</span>
        <span style={{ margin: '0 6px', color: '#0a1825' }}>·</span>
        {formattedTime && (
          <>
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: liveActive ? '#6FE3A5' : '#1a3a2a',
                marginRight: 5,
                verticalAlign: 'middle',
                transition: 'background 0.4s',
                boxShadow: liveActive ? '0 0 6px #6FE3A5' : 'none',
              }}
            />
            <span style={{ color: '#1e4030' }}>{formattedTime}</span>
            <span style={{ margin: '0 6px', color: '#0a1825' }}>·</span>
          </>
        )}
        <span>republic.suezcanal.xyz</span>
      </div>

      {/* Satellite toggle */}
      <button
        onClick={() => setSatellite(v => !v)}
        title={satellite ? 'Hide satellite imagery' : 'Show satellite imagery'}
        style={{
          position: 'fixed',
          bottom: 'calc(20px + var(--safe-bottom, 0px))',
          right: satellite && activeSignalId ? 'calc(376px + var(--safe-right, 0px))' : 'calc(16px + var(--safe-right, 0px))',
          zIndex: 70,
          background: satellite ? 'rgba(87,231,255,0.12)' : 'rgba(3,8,16,0.82)',
          border: `1px solid ${satellite ? '#57E7FF' : '#0f2035'}`,
          color: satellite ? '#57E7FF' : '#3d5a70',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          padding: '6px 12px',
          cursor: 'pointer',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          transition: 'all 0.2s',
          lineHeight: 1,
        }}
      >
        SAT
      </button>

      <SignalInspector
        signalId={activeSignalId}
        onClose={() => setActiveSignalId(null)}
        onNavigate={setActiveSignalId}
      />
    </>
  );
}
