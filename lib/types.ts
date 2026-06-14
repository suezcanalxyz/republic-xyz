export type SignalType = 'SEED' | 'MEDIUM' | 'SHORT_ALERT' | 'DEEP_CASE';

export type VerificationStatus =
  | 'verified'
  | 'corroborated'
  | 'partly_verified'
  | 'disputed'
  | 'unverified'
  | 'false'
  | 'low_confidence'
  | 'needs_review';

export type SourceDiversity =
  | 'single_source'
  | 'multi_same_region'
  | 'cross_region'
  | 'local_available'
  | 'no_local'
  | 'official_only'
  | 'social_only'
  | 'satellite_support'
  | 'visual_evidence'
  | 'ais_support'
  | 'adsb_support';

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

export interface PerspectiveFrame {
  region: 'west' | 'east' | 'south' | 'mena' | 'local' | 'other';
  frame: string;
  sources: string[];
}

export interface SourceRef {
  outlet: string;
  country?: string | null;
  region?: string | null;
  perspectiveGroup?: string | null;
  url?: string;
  publishedAt?: string | null;
  language?: string;
  title?: string;
  excerpt?: string | null;
  imageUrl?: string | null;
  sourceType?: string;
  reliability?: string;
}

export interface SignalLink {
  to: string;
  relation: string;
}

export interface Signal {
  id: string;
  type: SignalType;
  category: string;
  tags: string[];
  title: string;
  summary: string;
  whatHappened?: string;
  location: {
    name: string;
    country?: string | null;
    region?: string | null;
    coordinates: [number, number]; // [lng, lat]
    confidence: 'high' | 'medium' | 'low';
  };
  date: string;
  lastUpdated: string;
  status: string;
  verification: VerificationStatus;
  sourceDiversity: SourceDiversity[];
  sourceCluster: SourceRef[];
  perspectives?: Record<string, PerspectiveFrame> | null;
  republicReading?: string | null;
  methodNote?: string | null;
  links?: SignalLink[];
  score?: number;
  visible: boolean;
}

export interface ClusteredSignal {
  id: string;
  lat: number;
  lng: number;
  count: number;
  seedCount: number;
  disputedCount: number;
  satelliteCount: number;
  categories: string[];
  dominantCategory: string;
  latestUpdate: string;
  signals?: Signal[];
  isCluster: boolean;
}

export interface GlobeQueryParams {
  bbox?: string;        // "minLng,minLat,maxLng,maxLat"
  zoom?: number;
  timeWindow?: string;  // "7d" | "30d" | "90d" | "all"
  layers?: string;      // comma-separated
  mode?: string;
  confidence?: string;
  limit?: number;
}

export const CATEGORIES: Record<string, { label: string; abbr: string; color: string }> = {
  maritime_routes:        { label: 'Maritime',      abbr: 'MARI', color: '#57E7FF' },
  migration_rescue:       { label: 'Migration',     abbr: 'MIGR', color: '#6FE3A5' },
  remote_warfare:         { label: 'Warfare',       abbr: 'WARF', color: '#FF5470' },
  arms_trade:             { label: 'Arms',          abbr: 'ARMS', color: '#B8FF57' },
  tech_surveillance:      { label: 'Tech',          abbr: 'TECH', color: '#FF57E7' },
  energy_extraction:      { label: 'Energy',        abbr: 'ENRG', color: '#FF8A3D' },
  canal_politics:         { label: 'Canal',         abbr: 'CANA', color: '#CC66FF' },
  border_regimes:         { label: 'Borders',       abbr: 'BORD', color: '#FFC857' },
  infrastructure_failure: { label: 'Infra',         abbr: 'INFR', color: '#AEB7C2' },
  climate_fire_desert:    { label: 'Climate',       abbr: 'CLIM', color: '#E8E163' },
  satellite_signals:      { label: 'Satellite',     abbr: 'SATL', color: '#9AA7FF' },
  gov_docs:               { label: 'Gov/Docs',      abbr: 'DOCS', color: '#FFFFFF' },
};
