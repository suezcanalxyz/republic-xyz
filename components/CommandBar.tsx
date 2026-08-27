'use client';

import { useState, useRef, useCallback } from 'react';
import { CATEGORIES } from '@/lib/types';
import styles from './CommandBar.module.css';

export type Mode = 'event' | 'evidence' | 'dispute' | 'infrastructure' | 'narrative' | 'investigation';
export type TimeWindow = '24h' | '7d' | '30d' | '90d' | 'all';

interface SearchResult {
  id: string;
  title: string;
  category: string;
  location: string;
  lat: number;
  lng: number;
}

interface Props {
  mode: Mode;
  timeWindow: TimeWindow;
  activeLayers: Set<string>;
  overlayLayers: Set<string>;
  onModeChange: (m: Mode) => void;
  onTimeWindowChange: (t: TimeWindow) => void;
  onLayerToggle: (layer: string) => void;
  onOverlayLayerToggle: (layer: string) => void;
  onSearchSelect: (id: string) => void;
}

const MAP_OVERLAYS: { id: string; label: string; abbr: string; color: string }[] = [
  { id: 'cables',     label: 'Sub. Cables',    abbr: 'CABL', color: '#FF8A3D' },
  { id: 'shipping',   label: 'Shipping Lanes', abbr: 'SHIP', color: '#2a8ab5' },
  { id: 'corridors',  label: 'Corridors',      abbr: 'CORR', color: '#CC66FF' },
  { id: 'satellites', label: 'Orbits',         abbr: 'ORBT', color: '#9AA7FF' },
];

const MODES: { id: Mode; label: string }[] = [
  { id: 'event', label: 'Event' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'dispute', label: 'Dispute' },
  { id: 'infrastructure', label: 'Infra' },
  { id: 'narrative', label: 'Narrative' },
  { id: 'investigation', label: 'Case' },
];

const TIME_WINDOWS: { id: TimeWindow; label: string }[] = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
  { id: 'all', label: 'All' },
];

export default function CommandBar({
  mode, timeWindow, activeLayers, overlayLayers,
  onModeChange, onTimeWindowChange, onLayerToggle, onOverlayLayerToggle, onSearchSelect,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showLayers, setShowLayers] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim() || q.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/atlas/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      }
    }, 300);
  }, []);

  return (
    <div className={styles.bar}>
      {/* Left: Mode tabs */}
      <div className={styles.modes}>
        {MODES.map(m => (
          <button
            key={m.id}
            className={`${styles.modeBtn} ${mode === m.id ? styles.active : ''}`}
            onClick={() => onModeChange(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Center: Search */}
      <div className={styles.searchWrap}>
        <input
          className={styles.search}
          type="text"
          placeholder="Search signal, location, actor..."
          value={query}
          onChange={e => { setQuery(e.target.value); search(e.target.value); }}
          spellCheck={false}
          autoComplete="off"
        />
        {results.length > 0 && (
          <div className={styles.results}>
            {results.map(r => (
              <button
                key={r.id}
                className={styles.result}
                onClick={() => {
                  onSearchSelect(r.id);
                  setQuery('');
                  setResults([]);
                }}
              >
                <span
                  className={styles.resultDot}
                  style={{ background: CATEGORIES[r.category]?.color ?? '#8899AA' }}
                />
                <span className={styles.resultTitle}>{r.title}</span>
                <span className={styles.resultLoc}>{r.location}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: Time window + Layers */}
      <div className={styles.controls}>
        <div className={styles.timeGroup}>
          {TIME_WINDOWS.map(t => (
            <button
              key={t.id}
              className={`${styles.timeBtn} ${timeWindow === t.id ? styles.active : ''}`}
              onClick={() => onTimeWindowChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          className={`${styles.layersBtn} ${showLayers ? styles.active : ''}`}
          onClick={() => setShowLayers(v => !v)}
        >
          Layers
          {activeLayers.size > 0 && (
            <span className={styles.layerCount}>{activeLayers.size}</span>
          )}
        </button>

        {showLayers && (
          <div className={styles.layersPanel}>
            <div className={styles.layersPanelHead}>
              <span>Signal filters</span>
              <button
                className={styles.layersClear}
                onClick={() => {
                  const allKeys = Object.keys(CATEGORIES);
                  if (activeLayers.size === allKeys.length) {
                    // all active → deactivate all
                    allKeys.forEach(onLayerToggle);
                  } else {
                    // activate only missing layers
                    allKeys.filter(k => !activeLayers.has(k)).forEach(onLayerToggle);
                  }
                }}
              >
                {activeLayers.size === Object.keys(CATEGORIES).length ? 'none' : 'all'}
              </button>
            </div>
            {Object.entries(CATEGORIES).map(([id, cat]) => (
              <button
                key={id}
                className={`${styles.layerItem} ${activeLayers.has(id) ? styles.layerOn : ''}`}
                onClick={() => onLayerToggle(id)}
              >
                <span className={styles.layerDot} style={{ background: cat.color }} />
                <span className={styles.layerAbbr}>{cat.abbr}</span>
                <span className={styles.layerLabel}>{cat.label}</span>
              </button>
            ))}

            <div className={styles.layerSep} />
            <div className={styles.layerSepLabel}>Map overlays</div>
            {MAP_OVERLAYS.map(ov => (
              <button
                key={ov.id}
                className={`${styles.layerItem} ${overlayLayers.has(ov.id) ? styles.layerOn : ''}`}
                onClick={() => onOverlayLayerToggle(ov.id)}
              >
                <span className={styles.layerDot} style={{ background: ov.color }} />
                <span className={styles.layerAbbr}>{ov.abbr}</span>
                <span className={styles.layerLabel}>{ov.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Future: Login placeholder */}
        <button className={styles.loginBtn} title="Private rooms — coming soon" disabled>
          ·
        </button>
      </div>
    </div>
  );
}
