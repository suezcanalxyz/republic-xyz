/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // Standalone output: bundles Node.js server + deps into .next/standalone
  // Required for Oracle VM deployment (node server.js instead of next start)
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma'],
  },
};

export default config;
