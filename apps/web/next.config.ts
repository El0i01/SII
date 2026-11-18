import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(process.env.SII_WEB_STANDALONE === '1' && {
    output: 'standalone',
    outputFileTracingRoot: path.resolve(__dirname, '../..'),
  }),
};

export default nextConfig;
