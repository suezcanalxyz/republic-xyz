'use client';

import { useEffect, useMemo, useRef, useCallback } from 'react';
import type { ClusteredSignal } from '@/lib/types';
import { CATEGORIES } from '@/lib/types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { Cesium: any; }
}

interface Props {
  signals: ClusteredSignal[];
  activeSignalId: string | null;
  showSatellite: boolean;
  onSelect: (id: string) => void;
  onDeselect: () => void;
  onZoomChange: (zoom: number) => void;
}

interface TransitionItem {
  id: string;
  fromSize: number;
  toSize: number;
  isCluster: boolean;
}

function hexToColor(hex: string, alpha = 1) {
  const C = window.Cesium;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return new C.Color(r, g, b, alpha);
}

function categoryColor(cat: string, alpha = 1) {
  return hexToColor(CATEGORIES[cat]?.color ?? '#8899AA', alpha);
}

function signalSize(item: ClusteredSignal, zoom: number): number {
  if (item.isCluster) return Math.min(10 + item.count * 0.7 + zoom * 0.5, 26);
  if (item.seedCount > 0) return 10;
  return 7;
}

function cameraHeightToZoom(height: number): number {
  if (height > 20000000) return 1;
  if (height > 12000000) return 2;
  if (height > 7000000) return 3;
  if (height > 4000000) return 4;
  if (height > 2200000) return 5;
  if (height > 1200000) return 6;
  if (height > 650000) return 7;
  return 8;
}

// High-contrast multi-category heatmap blob.
// BOTTOM vertical origin: canvas anchor = geo-point.
// Circle centered in upper 70% of canvas → transparent padding below.
// All circle pixels are above anchor in screen-space → above globe surface in depth buffer → pass depth test.
function createHeatmapMarker(categories: string[], count: number, active: boolean): string {
  const W = 80;
  const H = 80;
  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const cx  = W / 2;
  const cy  = 30; // upper portion — bottom 20px is transparent padding
  const outerR = active ? 26 : 23;
  const innerR = 12;
  const primaryHex = CATEGORIES[categories[0]]?.color ?? '#8899AA';

  // Wide outer glow
  const glow = ctx.createRadialGradient(cx, cy, 1, cx, cy, outerR);
  glow.addColorStop(0,    `${primaryHex}ee`);
  glow.addColorStop(0.25, `${primaryHex}aa`);
  glow.addColorStop(0.55, `${primaryHex}55`);
  glow.addColorStop(0.82, `${primaryHex}18`);
  glow.addColorStop(1,    `${primaryHex}00`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.fill();

  // Secondary category ring
  if (categories.length > 1) {
    const secHex = CATEGORIES[categories[1]]?.color ?? '#8899AA';
    ctx.globalAlpha = 0.82;
    ctx.strokeStyle = secHex;
    ctx.lineWidth   = 1.5;
    ctx.shadowColor = secHex;
    ctx.shadowBlur  = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, innerR + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur  = 0;
  }

  // Dark centre disc
  ctx.fillStyle = '#020b16';
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fill();

  // Primary luminous ring
  ctx.strokeStyle = active ? '#ffffff' : primaryHex;
  ctx.lineWidth   = active ? 2 : 1.8;
  ctx.shadowColor = active ? '#ffffff' : primaryHex;
  ctx.shadowBlur  = active ? 10 : 7;
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Count text
  const label    = count > 99 ? '99+' : `${count}`;
  const fontSize = count > 99 ? 9 : count > 9 ? 12 : 13;
  ctx.fillStyle    = '#ffffff';
  ctx.font         = `700 ${fontSize}px ui-monospace, 'SF Mono', monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor  = 'rgba(0,0,0,0.95)';
  ctx.shadowBlur   = 5;
  ctx.fillText(label, cx, cy + 1);
  ctx.shadowBlur = 0;

  // Category pips
  const topCats = categories.slice(0, 3);
  topCats.forEach((cat, i) => {
    const hex  = CATEGORIES[cat]?.color ?? '#8899AA';
    const xOff = (i - (topCats.length - 1) / 2) * 7;
    ctx.fillStyle   = hex;
    ctx.shadowColor = hex;
    ctx.shadowBlur  = 4;
    ctx.beginPath();
    ctx.arc(cx + xOff, cy - innerR - 5, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.shadowBlur = 0;

  return canvas.toDataURL('image/png');
}

export default function CesiumGlobe({ signals, activeSignalId, showSatellite, onSelect, onDeselect, onZoomChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cesiumRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entitiesRef = useRef<Map<string, any>>(new Map());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pulseEntitiesRef = useRef<Map<string, any>>(new Map());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arcEntitiesRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const satelliteLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const politicalLayerRef = useRef<any>(null);
  const zoomRef = useRef(2);
  const markerCacheRef = useRef<Map<string, string>>(new Map());
  const prevSizesRef = useRef<Map<string, number>>(new Map());
  const transitionRef = useRef<{ startTime: number; items: TransitionItem[] } | null>(null);

  const sortedSignals = useMemo(
    () => [...signals].sort((a, b) => Number(b.isCluster) - Number(a.isCluster) || b.count - a.count),
    [signals]
  );

  const initViewer = useCallback(async () => {
    if (!containerRef.current || viewerRef.current) return;
    const C = window.Cesium;
    if (!C) return;
    cesiumRef.current = C;

    const token = process.env.NEXT_PUBLIC_CESIUM_TOKEN;
    if (token) C.Ion.defaultAccessToken = token;

    const isMobile = window.innerWidth < 1024 || ('ontouchstart' in window && window.innerWidth < 1366);

    // Always start with no imagery — grey globe loads instantly, zero tile requests.
    // Satellite tiles added dynamically via showSatellite prop.
    const viewer = new C.Viewer(containerRef.current, {
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

    // Remove any default imagery Cesium adds automatically
    viewer.imageryLayers.removeAll();

    // Political basemap — CartoDB Dark Matter no-labels, elegant country borders
    // Use local `viewer` directly (viewerRef.current not set until end of initViewer)
    const politicalProvider = new C.UrlTemplateImageryProvider({
      url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png',
      subdomains: ['a', 'b', 'c', 'd'],
      maximumLevel: 19,
      credit: '© OpenStreetMap contributors © CARTO',
    });
    politicalLayerRef.current = viewer.imageryLayers.addImageryProvider(politicalProvider);
    politicalLayerRef.current.alpha = 0.85;
    politicalLayerRef.current.brightness = 1.1;

    // Dark blue-grey globe — forensic aesthetic, visible landmass silhouette
    viewer.scene.globe.baseColor = C.Color.fromCssColorString('#0d1f2d');
    viewer.scene.backgroundColor = C.Color.fromCssColorString('#010206');
    viewer.scene.globe.showGroundAtmosphere = !isMobile;
    viewer.scene.globe.atmosphereLightIntensity = isMobile ? 2.0 : 3.5;
    viewer.scene.skyAtmosphere.show = !isMobile;
    viewer.scene.fog.enabled = false;
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.logarithmicDepthBuffer = true;
    // Match device physical pixel density — critical for crisp mobile rendering
    viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, isMobile ? 2 : 1.5);
    viewer.scene.requestRenderMode = true;
    viewer.scene.maximumRenderTimeChange = isMobile ? 0.5 : 0.35;

    // Per-frame interpolator for smooth zoom/data transitions + seed pulse
    viewer.scene.preUpdate.addEventListener(() => {
      const transition = transitionRef.current;
      const hasPulse = [...entitiesRef.current.values()].some(e => e.point && e._isSeed);

      if (transition) {
        const t = Math.min(1, (Date.now() - transition.startTime) / 380);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic

        for (const { id, fromSize, toSize, isCluster } of transition.items) {
          const entity = entitiesRef.current.get(id);
          if (!entity) continue;
          const size = fromSize + (toSize - fromSize) * eased;
          if (!isCluster && entity.point) {
            entity.point.pixelSize = new C.ConstantProperty(size);
          } else if (isCluster && entity.billboard) {
            entity.billboard.scale = new C.ConstantProperty(size / 28);
          }
        }

        if (t >= 1) transitionRef.current = null;
      }

      // Gentle pulse on seed-type points (breathing: 2.4s period)
      if (hasPulse) {
        const pulse = (Math.sin(Date.now() / 1200) + 1) / 2; // 0→1→0
        for (const [, entity] of entitiesRef.current) {
          if (!entity.point || !entity._isSeed) continue;
          entity.point.outlineWidth = new C.ConstantProperty(1.5 + pulse * 2);
        }
      }

      if (transition || hasPulse) viewer.scene.requestRender();
    });

    const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: { position: unknown }) => {
      const picked = viewer.scene.pick(click.position);
      if (C.defined(picked) && picked.id?.id) {
        const isCluster = picked.id.properties?.isCluster?.getValue?.(C.JulianDate.now());
        if (isCluster) {
          const lng = picked.id.properties?.lng?.getValue?.(C.JulianDate.now());
          const lat = picked.id.properties?.lat?.getValue?.(C.JulianDate.now());
          if (typeof lng === 'number' && typeof lat === 'number') {
            viewer.camera.flyTo({
              destination: C.Cartesian3.fromDegrees(lng, lat, 1400000),
              duration: 0.85,
            });
          }
          onDeselect();
          return;
        }
        onSelect(picked.id.id as string);
      } else {
        onDeselect();
      }
    }, C.ScreenSpaceEventType.LEFT_CLICK);

    viewer.camera.changed.addEventListener(() => {
      const nextZoom = cameraHeightToZoom(viewer.camera.positionCartographic.height);
      if (nextZoom !== zoomRef.current) {
        zoomRef.current = nextZoom;
        onZoomChange(nextZoom);
      }
    });

    viewer.camera.flyTo({
      destination: C.Cartesian3.fromDegrees(25, 18, 12000000),
      orientation: { pitch: C.Math.toRadians(-90) },
      duration: 0,
    });

    viewerRef.current = viewer;

    // ── Overlay GeoJSON layers (shipping lanes, cables, corridors) ──────────
    // Load after viewerRef is set; non-blocking — failures are silent
    const loadOverlays = async () => {
      try {
        // Shipping lanes — global commercial routes, thin maritime blue
        const shippingDs = await C.GeoJsonDataSource.load('/data/shipping-lanes.geojson', {
          stroke: C.Color.fromCssColorString('#57E7FF').withAlpha(0.18),
          strokeWidth: 0.8,
          clampToGround: false,
        });
        shippingDs.name = 'shipping-lanes';
        await viewer.dataSources.add(shippingDs);

        // Submarine cables — strategic infrastructure, orange
        const cablesDs = await C.GeoJsonDataSource.load('/data/submarine-cables.geojson', {
          stroke: C.Color.fromCssColorString('#FF8A3D').withAlpha(0.55),
          strokeWidth: 1.4,
          clampToGround: false,
        });
        cablesDs.name = 'submarine-cables';
        await viewer.dataSources.add(cablesDs);

        // Strategic corridors — BRI, Arctic routes, chokepoints, energy corridors
        const corridorsDs = await C.GeoJsonDataSource.load('/data/strategic-corridors.geojson', {
          stroke: C.Color.fromCssColorString('#CC66FF').withAlpha(0.45),
          strokeWidth: 1.2,
          clampToGround: false,
        });
        corridorsDs.name = 'corridors';
        await viewer.dataSources.add(corridorsDs);

        viewer.scene.requestRender();
      } catch {
        // overlays are cosmetic — failures don't break the globe
      }
    };
    loadOverlays();
  }, [onSelect, onDeselect, onZoomChange]);

  useEffect(() => {
    const check = setInterval(() => {
      if (window.Cesium) { clearInterval(check); initViewer(); }
    }, 100);
    return () => clearInterval(check);
  }, [initViewer]);

  // Update entities when signals change, animating size transitions
  useEffect(() => {
    const viewer = viewerRef.current;
    const C = cesiumRef.current;
    if (!viewer || !C) return;

    const isMobile = window.innerWidth < 1024 || ('ontouchstart' in window && window.innerWidth < 1366);
    const transitionItems: TransitionItem[] = [];

    // Atmosphere flash — "data incoming" pulse (desktop only)
    if (!isMobile && viewer.scene.globe.showGroundAtmosphere) {
      const base = viewer.scene.globe.atmosphereLightIntensity;
      viewer.scene.globe.atmosphereLightIntensity = 9;
      setTimeout(() => { if (viewerRef.current) viewerRef.current.scene.globe.atmosphereLightIntensity = base; }, 650);
    }

    // Remove stale signal entities + their pulse rings
    for (const [id, entity] of entitiesRef.current) {
      if (!signals.find(s => s.id === id)) {
        viewer.entities.remove(entity);
        entitiesRef.current.delete(id);
        prevSizesRef.current.delete(id);
        const pulseEnt = pulseEntitiesRef.current.get(id);
        if (pulseEnt) { viewer.entities.remove(pulseEnt); pulseEntitiesRef.current.delete(id); }
      }
    }

    for (const item of sortedSignals) {
      const color = categoryColor(item.dominantCategory, item.isCluster ? 0.82 : 0.94);
      const outlineColor = categoryColor(item.dominantCategory, 1);
      const size = signalSize(item, zoomRef.current);
      const isActive = item.id === activeSignalId;
      const isSeed = item.seedCount > 0;
      // Cache key includes all categories so multi-cat clusters render correctly
      const cacheKey = `${item.categories.slice(0, 3).join(',')}:${item.count}:${isActive ? 'a' : 'i'}`;
      // +100m above ellipsoid surface to avoid z-fighting, enables proper globe depth occlusion
      const position = C.Cartesian3.fromDegrees(item.lng, item.lat, 100);

      const existing = entitiesRef.current.get(item.id);
      if (existing) {
        const fromSize = prevSizesRef.current.get(item.id) ?? size;
        if (Math.abs(fromSize - size) > 0.5) {
          transitionItems.push({ id: item.id, fromSize, toSize: size, isCluster: item.isCluster });
        }
        existing.position = new C.ConstantPositionProperty(position);
        if (existing.billboard && item.isCluster) {
          if (!markerCacheRef.current.has(cacheKey)) {
            markerCacheRef.current.set(cacheKey, createHeatmapMarker(item.categories, item.count, isActive));
          }
          existing.billboard.image = new C.ConstantProperty(markerCacheRef.current.get(cacheKey));
        }
        if (existing.point && !item.isCluster) {
          existing.point.pixelSize = new C.ConstantProperty(isActive ? size + 5 : isSeed ? size + 2 : size);
          existing.point.color = new C.ConstantProperty(isActive ? C.Color.WHITE.withAlpha(0.98) : color);
        }
        prevSizesRef.current.set(item.id, size);
        continue;
      }

      if (item.isCluster) {
        if (!markerCacheRef.current.has(cacheKey)) {
          markerCacheRef.current.set(cacheKey, createHeatmapMarker(item.categories, item.count, isActive));
        }

        const entity = viewer.entities.add({
          id: item.id,
          position,
          properties: { isCluster: true, lng: item.lng, lat: item.lat },
          billboard: {
            image: markerCacheRef.current.get(cacheKey),
            scale: 0, // animate in from 0
            // BOTTOM: all circle pixels above anchor → pass depth test; ellipsoid culls back-side
            verticalOrigin: C.VerticalOrigin.BOTTOM,
            horizontalOrigin: C.HorizontalOrigin.CENTER,
            disableDepthTestDistance: 0,
            scaleByDistance: new C.NearFarScalar(1e6, 0.7, 1.9e7, 0.38),
            translucencyByDistance: new C.NearFarScalar(8e5, 1, 2.0e7, 0.88),
          },
        });
        entitiesRef.current.set(item.id, entity);
        prevSizesRef.current.set(item.id, size);
        transitionItems.push({ id: item.id, fromSize: 0, toSize: size, isCluster: true });

        // Radar pulse ring for SEED clusters — non-touch devices only (battery)
        const isTouch = 'ontouchstart' in window;
        if (isSeed && !isTouch && !pulseEntitiesRef.current.has(item.id)) {
          const hex = CATEGORIES[item.dominantCategory]?.color ?? '#57E7FF';
          const idHash = item.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
          const phase = (idHash % 100) / 100;
          const pulseEnt = viewer.entities.add({
            position: C.Cartesian3.fromDegrees(item.lng, item.lat, 500),
            ellipse: {
              semiMajorAxis: new C.CallbackProperty(() => {
                return (((Date.now() / 3500) + phase) % 1) * 420000;
              }, false),
              semiMinorAxis: new C.CallbackProperty(() => {
                return (((Date.now() / 3500) + phase) % 1) * 420000;
              }, false),
              height: 500,
              material: new C.ColorMaterialProperty(new C.CallbackProperty(() => {
                const t = ((Date.now() / 3500) + phase) % 1;
                return C.Color.fromCssColorString(hex).withAlpha((1 - t) * 0.22);
              }, false)),
              outline: true,
              outlineColor: new C.CallbackProperty(() => {
                const t = ((Date.now() / 3500) + phase) % 1;
                return C.Color.fromCssColorString(hex).withAlpha((1 - t) * 0.6);
              }, false),
              outlineWidth: 1.5,
            },
          });
          pulseEntitiesRef.current.set(item.id, pulseEnt);
        }
      } else {
        const entity = viewer.entities.add({
          id: item.id,
          position,
          properties: { isCluster: false, lng: item.lng, lat: item.lat },
          point: {
            pixelSize: 0, // animate in from 0
            color: isActive ? C.Color.WHITE.withAlpha(0.95) : color,
            outlineColor,
            outlineWidth: isSeed ? 1.5 : 1,
            // NO heightReference — globe depth buffer occludes back-side points
            disableDepthTestDistance: 0,
            scaleByDistance: new C.NearFarScalar(8e5, 1.6, 1.5e7, 0.65),
            translucencyByDistance: new C.NearFarScalar(8e5, 1, 1.5e7, 0.82),
          },
        });
        entity._isSeed = isSeed;
        entitiesRef.current.set(item.id, entity);
        prevSizesRef.current.set(item.id, size);
        const targetSize = isActive ? size + 4 : isSeed ? size + 2 : size;
        transitionItems.push({ id: item.id, fromSize: 0, toSize: targetSize, isCluster: false });
      }
    }

    if (transitionItems.length > 0) {
      transitionRef.current = { startTime: Date.now(), items: transitionItems };
      // Continuous render during animation, restore demand-render after
      viewer.scene.requestRenderMode = false;
      setTimeout(() => { if (viewerRef.current) viewerRef.current.scene.requestRenderMode = true; }, 500);
    }

    viewer.scene.requestRender();
  }, [sortedSignals, activeSignalId]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const C = cesiumRef.current;
    if (!viewer || !C || !activeSignalId) return;
    const signal = signals.find(s => s.id === activeSignalId);
    if (!signal) return;
    viewer.camera.flyTo({
      destination: C.Cartesian3.fromDegrees(signal.lng, signal.lat, 3000000),
      duration: 1.2,
    });
  }, [activeSignalId, signals]);

  // Geodesic arcs: selected signal → nearest same-category signals
  useEffect(() => {
    const viewer = viewerRef.current;
    const C = cesiumRef.current;

    // Always clear old arcs
    for (const arc of arcEntitiesRef.current) viewer?.entities.remove(arc);
    arcEntitiesRef.current = [];

    if (!viewer || !C || !activeSignalId) return;

    const active = signals.find(s => s.id === activeSignalId);
    if (!active) return;

    const hex = CATEGORIES[active.dominantCategory]?.color ?? '#57E7FF';
    const related = signals
      .filter(s => s.id !== activeSignalId && s.dominantCategory === active.dominantCategory)
      .slice(0, 6);

    for (const rel of related) {
      const arc = viewer.entities.add({
        polyline: {
          positions: C.Cartesian3.fromDegreesArray([active.lng, active.lat, rel.lng, rel.lat]),
          width: 1.5,
          arcType: C.ArcType.GEODESIC,
          material: new C.PolylineGlowMaterialProperty({
            glowPower: 0.3,
            color: C.Color.fromCssColorString(hex).withAlpha(0.55),
          }),
        },
      });
      arcEntitiesRef.current.push(arc);
    }

    viewer.scene.requestRender();
  }, [activeSignalId, signals]);

  // Swap between political basemap and satellite imagery
  useEffect(() => {
    const viewer = viewerRef.current;
    const C = cesiumRef.current;
    if (!viewer || !C) return;

    if (showSatellite) {
      // Hide political tiles (may not exist yet on mobile)
      if (politicalLayerRef.current) politicalLayerRef.current.show = false;
      if (!satelliteLayerRef.current) {
        C.ArcGisMapServerImageryProvider.fromUrl(
          'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
        ).then((provider: unknown) => {
          satelliteLayerRef.current = viewer.imageryLayers.addImageryProvider(provider);
          viewer.scene.requestRender();
        }).catch(() => {});
      } else {
        satelliteLayerRef.current.show = true;
        viewer.scene.requestRender();
      }
    } else {
      // Hide satellite, restore political tiles
      if (satelliteLayerRef.current) satelliteLayerRef.current.show = false;
      if (politicalLayerRef.current) politicalLayerRef.current.show = true;
      viewer.scene.requestRender();
    }
  }, [showSatellite]);

  useEffect(() => {
    return () => {
      viewerRef.current?.destroy();
      viewerRef.current = null;
      cesiumRef.current = null;
      satelliteLayerRef.current = null;
      politicalLayerRef.current = null;
      pulseEntitiesRef.current.clear();
      arcEntitiesRef.current = [];
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
