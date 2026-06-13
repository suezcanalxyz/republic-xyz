'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { ClusteredSignal } from '@/lib/types';
import { CATEGORIES } from '@/lib/types';

declare global {
  // Cesium loaded via CDN (no npm package) — typed as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { Cesium: any; }
}

interface Props {
  signals: ClusteredSignal[];
  activeSignalId: string | null;
  onSelect: (id: string) => void;
  onDeselect: () => void;
}

const CESIUM_VERSION = '1.119';

// Hex color → Cesium.Color
function hexToColor(hex: string, alpha = 1) {
  const C = window.Cesium;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return new C.Color(r, g, b, alpha);
}

function categoryColor(cat: string, alpha = 1) {
  const hex = CATEGORIES[cat]?.color ?? '#8899AA';
  return hexToColor(hex, alpha);
}

// Signal type → display size
function signalSize(item: ClusteredSignal): number {
  if (item.isCluster) return Math.min(8 + item.count * 0.8, 28);
  if (item.seedCount > 0) return 14;
  return 10;
}

export default function CesiumGlobe({ signals, activeSignalId, onSelect, onDeselect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<InstanceType<typeof window.Cesium.Viewer> | null>(null);
  const entitiesRef = useRef<Map<string, InstanceType<typeof window.Cesium.Entity>>>(new Map());

  const initViewer = useCallback(async () => {
    if (!containerRef.current || viewerRef.current) return;
    const C = window.Cesium;
    if (!C) return;

    const token = process.env.NEXT_PUBLIC_CESIUM_TOKEN;
    if (token) C.Ion.defaultAccessToken = token;

    const viewer = new C.Viewer(containerRef.current, {
      baseLayer: C.ImageryLayer.fromProviderAsync(
        C.ArcGisMapServerImageryProvider.fromUrl(
          'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
        )
      ),
      terrainProvider: new C.EllipsoidTerrainProvider(),
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      homeButton: false,
      geocoder: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      infoBox: false,
      selectionIndicator: false,
      creditContainer: document.createElement('div'),
    });

    // Dark globe base
    viewer.scene.globe.baseColor = C.Color.fromCssColorString('#030810');
    viewer.scene.backgroundColor = C.Color.fromCssColorString('#010206');
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.globe.atmosphereLightIntensity = 4.0;
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.fog.enabled = false;

    // Optional: Google Photorealistic 3D (if token supports it)
    if (token) {
      try {
        const g3d = await (C as any).createGooglePhotorealistic3DTileset?.();
        if (g3d) viewer.scene.primitives.add(g3d);
      } catch {
        // Not available — continue without
      }
    }

    // Click handler
    const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: { position: InstanceType<typeof C.Cartesian2> }) => {
      const picked = viewer.scene.pick(click.position);
      if (C.defined(picked) && picked.id?.id) {
        onSelect(picked.id.id as string);
      } else {
        onDeselect();
      }
    }, C.ScreenSpaceEventType.LEFT_CLICK);

    // Initial camera position — centered on MENA/Mediterranean
    viewer.camera.flyTo({
      destination: C.Cartesian3.fromDegrees(25, 18, 12000000),
      orientation: { pitch: C.Math.toRadians(-90) },
      duration: 0,
    });

    viewerRef.current = viewer;
  }, [onSelect, onDeselect]);

  // Init on mount (after CDN script loads)
  useEffect(() => {
    const check = setInterval(() => {
      if (window.Cesium) {
        clearInterval(check);
        initViewer();
      }
    }, 100);
    return () => clearInterval(check);
  }, [initViewer]);

  // Update entities when signals change
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const C = window.Cesium;

    // Remove stale entities
    for (const [id, entity] of entitiesRef.current) {
      if (!signals.find(s => s.id === id)) {
        viewer.entities.remove(entity);
        entitiesRef.current.delete(id);
      }
    }

    // Upsert entities
    for (const item of signals) {
      const color = categoryColor(item.dominantCategory, item.isCluster ? 0.75 : 0.9);
      const outlineColor = categoryColor(item.dominantCategory, 1);
      const size = signalSize(item);
      const isActive = item.id === activeSignalId;
      const isSeed = item.seedCount > 0;

      const existing = entitiesRef.current.get(item.id);
      if (existing) {
        // Update position + appearance
        existing.position = new C.ConstantPositionProperty(
          C.Cartesian3.fromDegrees(item.lng, item.lat)
        );
        if (existing.ellipse) {
          (existing.ellipse as any).semiMajorAxis = new C.ConstantProperty(size * 8000);
          (existing.ellipse as any).semiMinorAxis = new C.ConstantProperty(size * 8000);
        }
        continue;
      }

      if (item.isCluster) {
        // Cluster: billboard with count label
        const entity = viewer.entities.add({
          id: item.id,
          position: C.Cartesian3.fromDegrees(item.lng, item.lat),
          label: {
            text: `${item.count}`,
            font: '11px "Geist Mono", monospace',
            fillColor: outlineColor,
            outlineColor: C.Color.BLACK,
            outlineWidth: 2,
            style: C.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new C.Cartesian2(0, 0),
            showBackground: true,
            backgroundColor: C.Color.fromCssColorString('#010810cc'),
            backgroundPadding: new C.Cartesian2(6, 3),
            verticalOrigin: C.VerticalOrigin.CENTER,
            horizontalOrigin: C.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          ellipse: {
            semiMajorAxis: size * 8000,
            semiMinorAxis: size * 8000,
            material: C.Color.fromCssColorString(CATEGORIES[item.dominantCategory]?.color ?? '#8899AA').withAlpha(0.15),
            outline: true,
            outlineColor,
            outlineWidth: 1.5,
            heightReference: C.HeightReference.CLAMP_TO_GROUND,
          },
        });
        entitiesRef.current.set(item.id, entity);
      } else {
        // Single signal: point with optional pulse for SEED
        const entity = viewer.entities.add({
          id: item.id,
          position: C.Cartesian3.fromDegrees(item.lng, item.lat),
          point: {
            pixelSize: isActive ? size + 4 : isSeed ? size + 2 : size,
            color: isActive
              ? C.Color.WHITE.withAlpha(0.95)
              : color,
            outlineColor,
            outlineWidth: isSeed ? 1.5 : 1,
            heightReference: C.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new C.NearFarScalar(1e6, 1.5, 1e8, 0.6),
          },
        });
        entitiesRef.current.set(item.id, entity);
      }
    }
  }, [signals, activeSignalId]);

  // Fly to active signal
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !activeSignalId) return;
    const C = window.Cesium;
    const signal = signals.find(s => s.id === activeSignalId);
    if (!signal) return;

    viewer.camera.flyTo({
      destination: C.Cartesian3.fromDegrees(signal.lng, signal.lat, 3000000),
      duration: 1.2,
    });
  }, [activeSignalId, signals]);

  // Cleanup
  useEffect(() => {
    return () => {
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: '#010206' }}
      className="cesium-container"
    />
  );
}
