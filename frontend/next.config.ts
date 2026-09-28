import type { NextConfig } from 'next';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Socket.IO polls `/socket.io/?EIO=…`; the default trailing-slash redirect would break the proxied handshake.
  skipTrailingSlashRedirect: true,
  // Browser talks to NestJS same-origin, so the refresh cookie is first-party and no CORS is needed.
  rewrites: async () => [
    { source: '/api/:path*', destination: `${API_URL}/api/:path*` },
    { source: '/socket.io/:path*', destination: `${API_URL}/socket.io/:path*` },
  ],
  headers: async () => [
    { source: '/:path*', headers: securityHeaders },
    { source: '/(admin|app|login|invite|reset-password|forgot-password)/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
  ],
};

export default config;
