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
  overlayLayers: Set<string>;
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
  if (item.isCluster) return Math.min(12 + item.count * 0.8 + zoom * 0.5, 28);
  if (item.seedCount > 0) return 13;
  return 10;
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
  const outerR = active ? 30 : 26;
  const innerR = 13;
  const primaryHex = CATEGORIES[categories[0]]?.color ?? '#8899AA';

  // Wide outer glow — boosted for visibility at distance
  const glow = ctx.createRadialGradient(cx, cy, 1, cx, cy, outerR);
  glow.addColorStop(0,    `${primaryHex}ff`);
  glow.addColorStop(0.2,  `${primaryHex}cc`);
  glow.addColorStop(0.5,  `${primaryHex}77`);
  glow.addColorStop(0.8,  `${primaryHex}28`);
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

export default function CesiumGlobe({ signals, activeSignalId, showSatellite, overlayLayers, onSelect, onDeselect, onZoomChange }: Props) {
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
  // Cross-category correlation arcs (economic/political/military interpolation) — visually distinct from same-category arcs above
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const correlationArcEntitiesRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const satelliteLayerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const politicalLayerRef = useRef<any>(null);
  // ── Overlay layer refs ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cablesDsRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shippingDsRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const corridorsDsRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const satOrbitEntitiesRef = useRef<any[]>([]);
  // Keep a ref to latest overlayLayers so loadOverlays can read current value
  const overlayLayersRef = useRef<Set<string>>(overlayLayers);
  const zoomRef = useRef(2);
  const markerCacheRef = useRef<Map<string, string>>(new Map());
  const prevSizesRef = useRef<Map<string, number>>(new Map());
  const transitionRef = useRef<{ startTime: number; items: TransitionItem[] } | null>(null);

  // Sync overlayLayersRef with prop so loadOverlays can read current value after async load
  useEffect(() => { overlayLayersRef.current = overlayLayers; }, [overlayLayers]);

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
      // Prevent Cesium Viewer from requesting its default ion-backed base layer.
      // The public CARTO layer is installed explicitly below.
      baseLayer: false,
      imageryProvider: false,
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

    // Open-source, keyless geographic globe. Cesium's WGS84 ellipsoid
    // is always available; overlays are rendered independently of basemap tiles.

    // Cesium's bundled Natural Earth II basemap is keyless and requires no
    // commercial imagery account. Its low-resolution geography is sufficient
    // for global context while signal points remain the primary visual layer.
    try {
      const naturalEarth = await C.TileMapServiceImageryProvider.fromUrl(
        C.buildModuleUrl('Assets/Textures/NaturalEarthII')
      );
      politicalLayerRef.current = viewer.imageryLayers.addImageryProvider(naturalEarth);
      politicalLayerRef.current.alpha = 0.65;
      politicalLayerRef.current.brightness = 0.55;
    } catch (error) {
      console.warn('[atlas] Natural Earth basemap unavailable; keeping keyless ellipsoid', error);
    }

    // Dark blue-grey globe — forensic aesthetic, visible landmass silhouette
    viewer.scene.globe.baseColor = C.Color.fromCssColorString('#0d1f2d');
    viewer.scene.backgroundColor = C.Color.fromCssColorString('#010206');
    viewer.scene.globe.showGroundAtmosphere = !isMobile;
    viewer.scene.globe.atmosphereLightIntensity = isMobile ? 2.0 : 3.5;
    viewer.scene.skyAtmosphere.show = !isMobile;
    viewer.scene.fog.enabled = false;
    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewer.scene.logarithmicDepthBuffer = true;
    // Match device physical pixel density — critical for crisp mobile rendering
    viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, isMobile ? 2 : 1.5);
    viewer.scene.requestRenderMode = true;
    viewer.scene.maximumRenderTimeChange = isMobile ? 0.5 : 0.35;

    // Per-frame interpolator for smooth entry transitions only.
    // Seed pulse handled via CallbackProperty at entity creation — no per-frame allocation.
    viewer.scene.preUpdate.addEventListener(() => {
      const transition = transitionRef.current;
      if (!transition) return; // early exit — no animation, no cost

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
      viewer.scene.requestRender();
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

    // ── Satellite orbital rings ───────────────────────────────────────────────
    const addSatelliteOrbits = () => {
      const RE = 6_371_000;
      // Each entry: altitude(m), inclination(°), RAAN planes(°), color, line width
      const ORBITS = [
        { alt: 408_000,    inc: 51.6, planes: [0],              color: '#9AA7FF', w: 1.2 }, // ISS
        { alt: 550_000,    inc: 53,   planes: [0, 45, 90, 135], color: '#57E7FF', w: 0.7 }, // Starlink LEO
        { alt: 20_200_000, inc: 55,   planes: [0, 60, 120],     color: '#6FE3A5', w: 0.9 }, // GPS MEO
        { alt: 35_786_000, inc: 0,    planes: [0],              color: '#FFC857', w: 1.5 }, // GEO belt
      ];

      const entities: unknown[] = [];
      for (const orbit of ORBITS) {
        const R = RE + orbit.alt;
        for (const raan of orbit.planes) {
          const raanRad = raan * Math.PI / 180;
          const incRad  = orbit.inc * Math.PI / 180;
          const positions = [];
          for (let deg = 0; deg <= 360; deg += 2) {
            const θ = deg * Math.PI / 180;
            // Orbital mechanics: position in ECEF given RAAN and inclination
            const x = R * (Math.cos(raanRad) * Math.cos(θ) - Math.sin(raanRad) * Math.sin(θ) * Math.cos(incRad));
            const y = R * (Math.sin(raanRad) * Math.cos(θ) + Math.cos(raanRad) * Math.sin(θ) * Math.cos(incRad));
            const z = R * Math.sin(θ) * Math.sin(incRad);
            positions.push(new C.Cartesian3(x, y, z));
          }
          const entity = viewer.entities.add({
            polyline: {
              positions,
              width: orbit.w,
              arcType: C.ArcType.NONE, // straight 3D lines in space, not geodesic
              material: new C.PolylineGlowMaterialProperty({
                glowPower: 0.15,
                color: C.Color.fromCssColorString(orbit.color).withAlpha(0.35),
              }),
            },
          });
          entity._satOrbit = true;
          entities.push(entity);
        }
      }
      satOrbitEntitiesRef.current = entities as never[];
      // Apply initial visibility
      const visible = overlayLayersRef.current.has('satellites');
      for (const e of satOrbitEntitiesRef.current) (e as { show: boolean }).show = visible;
    };

    // ── Overlay GeoJSON layers (shipping lanes, cables, corridors) ──────────
    const loadOverlays = async () => {
      try {
        // Shipping lanes — very subtle, just visible enough to read global routes
        const shippingDs = await C.GeoJsonDataSource.load('/data/shipping-lanes.geojson', {
          stroke: C.Color.fromCssColorString('#2a5a7a').withAlpha(0.35),
          strokeWidth: 0.6,
          clampToGround: false,
        });
        shippingDs.name = 'shipping-lanes';
        await viewer.dataSources.add(shippingDs);
        shippingDsRef.current = shippingDs;
        shippingDs.show = overlayLayersRef.current.has('shipping');

        // Submarine cables — real TeleGeography data, per-cable color from properties
        const cablesDs = await C.GeoJsonDataSource.load('/data/submarine-cables.geojson', {
          stroke: C.Color.fromCssColorString('#FF8A3D').withAlpha(0.5),
          strokeWidth: 1.2,
          clampToGround: false,
        });
        cablesDs.name = 'submarine-cables';
        for (const entity of cablesDs.entities.values) {
          const color = entity.properties?.color?.getValue?.();
          if (color && entity.polyline) {
            entity.polyline.material = new C.ColorMaterialProperty(
              C.Color.fromCssColorString(color).withAlpha(0.55)
            );
            entity.polyline.width = new C.ConstantProperty(1.2);
          }
        }
        await viewer.dataSources.add(cablesDs);
        cablesDsRef.current = cablesDs;
        cablesDs.show = overlayLayersRef.current.has('cables');

        // Strategic corridors — BRI, Arctic routes, chokepoints, energy corridors
        const corridorsDs = await C.GeoJsonDataSource.load('/data/strategic-corridors.geojson', {
          stroke: C.Color.fromCssColorString('#CC66FF').withAlpha(0.4),
          strokeWidth: 1.0,
          clampToGround: false,
        });
        corridorsDs.name = 'corridors';
        await viewer.dataSources.add(corridorsDs);
        corridorsDsRef.current = corridorsDs;
        corridorsDs.show = overlayLayersRef.current.has('corridors');

        viewer.scene.requestRender();
      } catch {
        // overlays are cosmetic — failures don't break the globe
      }
    };
    addSatelliteOrbits();
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

    // Remove stale signal entities + their pulse rings — O(n) with Set
    const signalIdSet = new Set(signals.map(s => s.id));
    for (const [id, entity] of entitiesRef.current) {
      if (!signalIdSet.has(id)) {
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
      // 15km above ellipsoid: above any terrain tessellation → no z-fighting.
      // Globe sphere still occludes far-side points via standard depth buffer.
      const position = C.Cartesian3.fromDegrees(item.lng, item.lat, 15_000);

      const existing = entitiesRef.current.get(item.id);
      if (existing) {
        const fromSize = prevSizesRef.current.get(item.id) ?? size;
        if (Math.abs(fromSize - size) > 0.5) {
          transitionItems.push({ id: item.id, fromSize, toSize: size, isCluster: item.isCluster });
        }
        existing.position = new C.ConstantPositionProperty(position);
        if (existing.billboard && item.isCluster) {
          if (!markerCacheRef.current.has(cacheKey)) {
            if (markerCacheRef.current.size > 120) markerCacheRef.current.clear();
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
          if (markerCacheRef.current.size > 120) markerCacheRef.current.clear();
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
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new C.NearFarScalar(8e5, 0.85, 1.9e7, 0.48),
            translucencyByDistance: new C.NearFarScalar(6e5, 1, 2.0e7, 0.9),
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
            position: C.Cartesian3.fromDegrees(item.lng, item.lat, 15_000),
            ellipse: {
              semiMajorAxis: new C.CallbackProperty(() => {
                return (((Date.now() / 3500) + phase) % 1) * 420000;
              }, false),
              semiMinorAxis: new C.CallbackProperty(() => {
                return (((Date.now() / 3500) + phase) % 1) * 420000;
              }, false),
              height: 15_000,
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
            color: isActive ? C.Color.WHITE.withAlpha(0.98) : color,
            outlineColor,
            // Seed entities: breathing pulse via CallbackProperty (no preUpdate loop needed)
            outlineWidth: isSeed
              ? new C.CallbackProperty(() => 1.5 + ((Math.sin(Date.now() / 1200) + 1) / 2) * 2, false)
              : 1.5,
            disableDepthTestDistance: 0,
            scaleByDistance: new C.NearFarScalar(5e5, 1.8, 1.8e7, 0.85),
            translucencyByDistance: new C.NearFarScalar(6e5, 1, 1.8e7, 0.9),
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

  // Cross-category correlation arcs — economic/political/military "interpolation",
  // distinct amber dashed style so they read as a different relationship than the
  // same-category glow arcs above. Only draws to targets whose individual Signal
  // is present in the currently loaded clusters (small clusters expose .signals).
  useEffect(() => {
    const viewer = viewerRef.current;
    const C = cesiumRef.current;

    for (const arc of correlationArcEntitiesRef.current) viewer?.entities.remove(arc);
    correlationArcEntitiesRef.current = [];

    if (!viewer || !C || !activeSignalId) return;

    const individual = signals.flatMap(c => c.signals ?? []);
    const activeSignal = individual.find(s => s.id === activeSignalId);
    if (!activeSignal?.correlatedIds?.length) return;

    const byId = new Map(individual.map(s => [s.id, s]));
    const [aLng, aLat] = activeSignal.location.coordinates;

    for (const cid of activeSignal.correlatedIds) {
      const target = byId.get(cid);
      if (!target) continue;
      const [tLng, tLat] = target.location.coordinates;
      const arc = viewer.entities.add({
        polyline: {
          positions: C.Cartesian3.fromDegreesArray([aLng, aLat, tLng, tLat]),
          width: 2,
          arcType: C.ArcType.GEODESIC,
          material: new C.PolylineDashMaterialProperty({
            color: C.Color.fromCssColorString('#FFB648').withAlpha(0.8),
            dashLength: 10,
          }),
        },
      });
      correlationArcEntitiesRef.current.push(arc);
    }

    viewer.scene.requestRender();
  }, [activeSignalId, signals]);

  // Toggle overlay layer visibility when overlayLayers prop changes
  useEffect(() => {
    if (shippingDsRef.current)  shippingDsRef.current.show  = overlayLayers.has('shipping');
    if (cablesDsRef.current)    cablesDsRef.current.show    = overlayLayers.has('cables');
    if (corridorsDsRef.current) corridorsDsRef.current.show = overlayLayers.has('corridors');
    const satVisible = overlayLayers.has('satellites');
    for (const e of satOrbitEntitiesRef.current) (e as { show: boolean }).show = satVisible;
    viewerRef.current?.scene.requestRender();
  }, [overlayLayers]);

  // Satellite imagery is disabled until an independently hosted, licensed source exists.
  // The globe itself works without API keys or external imagery services.

  useEffect(() => {
    return () => {
      viewerRef.current?.destroy();
      viewerRef.current = null;
      cesiumRef.current = null;
      satelliteLayerRef.current = null;
      politicalLayerRef.current = null;
      cablesDsRef.current = null;
      shippingDsRef.current = null;
      corridorsDsRef.current = null;
      satOrbitEntitiesRef.current = [];
      pulseEntitiesRef.current.clear();
      arcEntitiesRef.current = [];
      correlationArcEntitiesRef.current = [];
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
