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
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link
          rel="stylesheet"
          href={`https://cdn.jsdelivr.net/npm/@fontsource-variable/geist@5.1.0/index.min.css`}
        />
        <link
          rel="stylesheet"
          href={`https://cdn.jsdelivr.net/npm/@fontsource-variable/geist-mono@5.1.0/index.min.css`}
        />
        <link
          rel="stylesheet"
          href={`https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium/Widgets/widgets.css`}
        />
      </head>
      <body>
        {/* Cesium must load before hydration so window.Cesium is available */}
        <Script
          src={`https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium/Cesium.js`}
          strategy="beforeInteractive"
        />
        {children}
      </body>
    </html>
  );
}
