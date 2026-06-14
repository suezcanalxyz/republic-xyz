'use client';

import { useState, useEffect } from 'react';
import type { Signal } from '@/lib/types';
import { CATEGORIES } from '@/lib/types';
import styles from './SignalInspector.module.css';

interface Props {
  signalId: string | null;
  onClose: () => void;
}

type Tab = 'overview' | 'evidence' | 'sources' | 'perspectives' | 'reading' | 'intel';

interface IntelResult {
  actors: string[];
  systemicContext: string;
  relatedDynamics: string[];
  confidenceNote: string;
  sourceGaps: string[];
  nim_model: string;
}

export default function SignalInspector({ signalId, onClose }: Props) {
  const [signal, setSignal] = useState<Signal | null>(null);
  const [related, setRelated] = useState<Signal[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(false);
  const [intel, setIntel] = useState<IntelResult | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelError, setIntelError] = useState<string | null>(null);

  const runIntel = async () => {
    if (!signal) return;
    setIntelLoading(true);
    setIntelError(null);
    try {
      const res = await fetch('/api/intel/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: signal.title,
          summary: signal.summary,
          category: signal.category,
          location: signal.location.name,
          tags: signal.tags,
        }),
      });
      const data = await res.json();
      if (!res.ok) setIntelError(data.hint ?? data.error ?? 'Analysis failed');
      else setIntel(data as IntelResult);
    } catch {
      setIntelError('Network error');
    } finally {
      setIntelLoading(false);
    }
  };

  useEffect(() => {
    if (!signalId) { setSignal(null); setRelated([]); setIntel(null); return; }
    setLoading(true);
    setTab('overview');
    fetch(`/api/atlas/signal/${signalId}`)
      .then(r => r.json())
      .then(d => { setSignal(d.signal); setRelated(d.related ?? []); })
      .catch(() => setSignal(null))
      .finally(() => setLoading(false));
  }, [signalId]);

  if (!signalId) return null;

  const cat = signal ? (CATEGORIES[signal.category] ?? { label: signal.category, color: '#8899AA', abbr: '?' }) : null;

  return (
    <div className={styles.inspector}>
      <div className={styles.dragHandle} aria-hidden="true" />
      <div className={styles.header}>
        {cat && (
          <span className={styles.catBadge} style={{ borderColor: cat.color, color: cat.color }}>
            {cat.abbr}
          </span>
        )}
        {signal && (
          <span className={`${styles.typeBadge} ${styles[signal.type]}`}>
            {signal.type.replace('_', ' ')}
          </span>
        )}
        <button className={styles.close} onClick={onClose}>×</button>
      </div>

      {loading && <div className={styles.loading}>loading…</div>}

      {signal && !loading && (
        <>
          <div className={styles.titleBlock}>
            <h2 className={styles.title}>{signal.title}</h2>
            <div className={styles.meta}>
              <span>{signal.location.name}</span>
              {signal.date && (
                <>
                  <span className={styles.sep}>·</span>
                  <span>{signal.date.slice(0, 10)}</span>
                </>
              )}
              <span className={styles.sep}>·</span>
              <span className={`${styles.verification} ${styles[signal.verification]}`}>
                {signal.verification.replace(/_/g, ' ')}
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div className={styles.tabs}>
            {(['overview', 'evidence', 'sources', 'perspectives', 'reading', 'intel'] as Tab[]).map(t => (
              <button
                key={t}
                className={`${styles.tab} ${tab === t ? styles.activeTab : ''} ${t === 'intel' ? styles.intelTab : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'intel' ? '⬡ intel' : t}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className={styles.body}>
            {tab === 'overview' && (
              <div>
                <p className={styles.summary}>{signal.summary}</p>
                {signal.whatHappened && (
                  <div className={styles.section}>
                    <div className={styles.sectionHead}>What happened</div>
                    <p className={styles.text}>{signal.whatHappened}</p>
                  </div>
                )}
                <div className={styles.scoreBar}>
                  <div className={styles.scoreLabel}>Strategic score</div>
                  <div className={styles.scoreTrack}>
                    <div
                      className={styles.scoreFill}
                      style={{
                        width: `${signal.score ?? 0}%`,
                        background: cat?.color ?? '#57E7FF',
                      }}
                    />
                  </div>
                  <div className={styles.scoreValue}>{Math.round(signal.score ?? 0)}</div>
                </div>
                {signal.tags.length > 0 && (
                  <div className={styles.tags}>
                    {signal.tags.map(t => (
                      <span key={t} className={styles.tag}>{t}</span>
                    ))}
                  </div>
                )}
                {related.length > 0 && (
                  <div className={styles.section}>
                    <div className={styles.sectionHead}>Related signals</div>
                    {related.map(r => (
                      <div key={r.id} className={styles.relatedItem}>
                        <span
                          className={styles.relatedDot}
                          style={{ background: CATEGORIES[r.category]?.color ?? '#8899AA' }}
                        />
                        <span className={styles.relatedTitle}>{r.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'evidence' && (
              <div>
                <div className={styles.section}>
                  <div className={styles.sectionHead}>Source diversity</div>
                  {signal.sourceDiversity.map(d => (
                    <div key={d} className={styles.diversityItem}>
                      <span className={styles.diversityDot} />
                      {d.replace(/_/g, ' ')}
                    </div>
                  ))}
                </div>
                <div className={styles.section}>
                  <div className={styles.sectionHead}>Evidence stack</div>
                  {signal.sourceCluster.length === 0 && (
                    <p className={styles.empty}>No evidence items attached to this signal yet.</p>
                  )}
                  {signal.sourceCluster.map((s, i) => (
                    <div key={i} className={styles.evidenceItem}>
                      {s.imageUrl && (
                        <a href={s.url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={s.imageUrl}
                            alt=""
                            className={styles.evidenceThumb}
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        </a>
                      )}
                      <div className={styles.evidenceOutlet}>{s.outlet}</div>
                      {s.title && <div className={styles.evidenceTitle}>{s.title}</div>}
                      {s.excerpt && <div className={styles.evidenceExcerpt}>{s.excerpt}</div>}
                      <div className={styles.evidenceMeta}>
                        {s.country && <span>{s.country}</span>}
                        {s.reliability && (
                          <span className={`${styles.reliability} ${styles[s.reliability]}`}>
                            {s.reliability}
                          </span>
                        )}
                        {s.url && (
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className={styles.evidenceLink}>
                            →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'sources' && (
              <div>
                <div className={styles.sectionHead}>Source matrix</div>
                {signal.sourceCluster.length === 0 && (
                  <p className={styles.empty}>No sources documented yet.</p>
                )}
                <table className={styles.sourceTable}>
                  <thead>
                    <tr>
                      <th>Outlet</th>
                      <th>Region</th>
                      <th>Type</th>
                      <th>Reliability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signal.sourceCluster.map((s, i) => (
                      <tr key={i}>
                        <td>{s.outlet}</td>
                        <td>{s.perspectiveGroup ?? s.region ?? '–'}</td>
                        <td>{s.sourceType ?? '–'}</td>
                        <td className={styles[s.reliability ?? 'unknown']}>{s.reliability ?? '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className={styles.infoNote}>
                  Source matrix: identifies who reported, from where, and with what framing.
                  Cross-region corroboration raises signal confidence.
                </div>
              </div>
            )}

            {tab === 'perspectives' && (
              <div>
                {!signal.perspectives && (
                  <p className={styles.empty}>No perspective frames documented for this signal yet.</p>
                )}
                {signal.perspectives && Object.entries(signal.perspectives).map(([region, pf]) => (
                  <div key={region} className={styles.perspItem}>
                    <div className={styles.perspRegion}>{region.toUpperCase()}</div>
                    <p className={styles.perspFrame}>{pf.frame}</p>
                  </div>
                ))}
              </div>
            )}

            {tab === 'reading' && (
              <div>
                {signal.republicReading ? (
                  <div className={styles.reading}>
                    <div className={styles.readingHead}>Republic Reading</div>
                    <p>{signal.republicReading}</p>
                  </div>
                ) : (
                  <p className={styles.empty}>No Republic Reading attached yet.</p>
                )}
                {signal.methodNote && (
                  <div className={styles.section}>
                    <div className={styles.sectionHead}>Method note</div>
                    <p className={styles.text}>{signal.methodNote}</p>
                  </div>
                )}
                <div className={styles.infoNote}>
                  Republic Readings situate the signal within the political project of the Suez Canal Republic.
                  They are editorial, not neutral.
                </div>
              </div>
            )}

            {tab === 'intel' && (
              <div>
                {!intel && !intelLoading && (
                  <div className={styles.intelPrompt}>
                    <p className={styles.intelDesc}>
                      Run AI analysis via NVIDIA NIM (Llama 3.1 70B).
                      Extracts actors, systemic context, and source gaps.
                    </p>
                    <button className={styles.intelBtn} onClick={runIntel}>
                      Analyze signal
                    </button>
                    {intelError && (
                      <p className={styles.intelError}>{intelError}</p>
                    )}
                  </div>
                )}
                {intelLoading && (
                  <div className={styles.intelLoading}>
                    <span className={styles.intelSpinner} />
                    <span>Querying NIM · Llama 3.1 70B…</span>
                  </div>
                )}
                {intel && !intelLoading && (
                  <div>
                    <div className={styles.section}>
                      <div className={styles.sectionHead}>Actors identified</div>
                      <div className={styles.tags}>
                        {intel.actors.map(a => (
                          <span key={a} className={styles.tag}>{a}</span>
                        ))}
                        {intel.actors.length === 0 && <span className={styles.empty}>None identified</span>}
                      </div>
                    </div>
                    <div className={styles.section}>
                      <div className={styles.sectionHead}>Systemic context</div>
                      <p className={styles.text}>{intel.systemicContext}</p>
                    </div>
                    <div className={styles.section}>
                      <div className={styles.sectionHead}>Related dynamics</div>
                      {intel.relatedDynamics.map((d, i) => (
                        <div key={i} className={styles.diversityItem}>
                          <span className={styles.diversityDot} />
                          {d}
                        </div>
                      ))}
                    </div>
                    <div className={styles.section}>
                      <div className={styles.sectionHead}>Source gaps</div>
                      {intel.sourceGaps.map((g, i) => (
                        <div key={i} className={styles.diversityItem}>
                          <span className={styles.diversityDot} style={{ background: '#FF5470' }} />
                          {g}
                        </div>
                      ))}
                    </div>
                    <div className={styles.infoNote}>{intel.confidenceNote}</div>
                    <div className={styles.infoNote} style={{ opacity: 0.4 }}>
                      {intel.nim_model}
                    </div>
                    <button
                      className={styles.intelBtn}
                      style={{ marginTop: 12, opacity: 0.6 }}
                      onClick={() => { setIntel(null); runIntel(); }}
                    >
                      Re-analyze
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
