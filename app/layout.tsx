import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

const CESIUM_VERSION = '1.119';

export const metadata: Metadata = {
  title: 'ATLAS — Core Research Graph | Suez Canal Republic',
  description:
    'ATLAS is the forensic cartographic engine of the Suez Canal Republic: a strategic evidence graph tracking warfare, migration, maritime routes, infrastructure and competing narratives.',
  metadataBase: new URL('https://republic.suezcanal.xyz'),
  openGraph: {
    siteName: 'Suez Canal Republic',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link
          rel="stylesheet"
          href={`https://cdn.jsdelivr.net/npm/@fontsource-variable/geist@5.1.0/index.min.css`}
        />
        <link
          rel="stylesheet"
          href={`https://cdn.jsdelivr.net/npm/@fontsource-variable/geist-mono@5.1.0/index.min.css`}
        />
        {/* Preconnect to CDN hosts — reduces DNS+TLS latency for Cesium + tiles */}
        <link rel="preconnect" href="https://cesium.com" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://services.arcgisonline.com" />
        <link rel="dns-prefetch" href="https://ibasemaps-api.arcgis.com" />
        <link
          rel="stylesheet"
          href={`https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium/Widgets/widgets.css`}
        />
      </head>
      <body>
        {/*
          afterInteractive: Cesium (~9 MB) loads after first paint.
          CesiumGlobe polls window.Cesium every 100ms — no race condition.
        */}
        <Script
          src={`https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium/Cesium.js`}
          strategy="afterInteractive"
        />
        {children}
      </body>
    </html>
  );
}
